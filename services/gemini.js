/**
 * Gemini AI Service for Hustle
 * Powers AI Need Matching, Task Scope Enhancer, Price Advisory, and Semantic Search.
 * Supports Google Gemini 1.5/2.0 Flash with automatic fallback resilience.
 */

const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const DEFAULT_MODEL = 'gemini-3.6-flash';

// Service category mappings & market benchmark rates (in INR)
const CATEGORY_BENCHMARKS = {
  'Plumbing & Repairs': { min: 299, max: 799, avg: 450, unit: 'visit/job' },
  'Electrical & Wiring': { min: 299, max: 899, avg: 499, unit: 'visit/job' },
  'AC, Fridge & Appliance Repair': { min: 399, max: 1299, avg: 699, unit: 'service' },
  'Deep Cleaning & Sanitization': { min: 499, max: 2499, avg: 1199, unit: 'service' },
  'Carpentry & Woodwork': { min: 349, max: 1199, avg: 599, unit: 'job' },
  'Wall Painting & Waterproofing': { min: 499, max: 3500, avg: 1499, unit: 'room/job' },
  'Pest Control': { min: 599, max: 1899, avg: 899, unit: 'treatment' },
  'Moving & Heavy Lifting': { min: 799, max: 4500, avg: 1999, unit: 'shift' },
  'Tutors & Skill Coaches': { min: 300, max: 900, avg: 500, unit: 'hr' },
  'Pet Care & Dog Walking': { min: 250, max: 700, avg: 400, unit: 'walk/day' },
  'Salon & Beauty at Home': { min: 399, max: 1599, avg: 799, unit: 'session' },
  'Gardening & Lawn Care': { min: 300, max: 999, avg: 550, unit: 'visit' }
};

// High-performance In-Memory Cache for Instant AI Search & Matching
const aiCache = new Map();

function getCache(key) {
  const item = aiCache.get(key);
  if (item && item.expiry > Date.now()) return item.value;
  return null;
}

function setCache(key, value, ttlMs = 1000 * 60 * 30) {
  if (aiCache.size > 300) {
    const firstKey = aiCache.keys().next().value;
    aiCache.delete(firstKey);
  }
  aiCache.set(key, { value, expiry: Date.now() + ttlMs });
}

/**
 * Calls Gemini REST API using native Node.js https / fetch with fast timeout
 */
async function callGeminiApi(prompt, systemInstruction = null) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  if (typeof fetch === 'function') {
    const controller = new AbortController();
    // Fast 2.2s timeout so slow external calls immediately fall back without user-facing delay
    const timeout = setTimeout(() => controller.abort(), 2200);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // Fallback to https request if fetch not present
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = https.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 2200
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed?.candidates?.[0]?.content?.parts?.[0]?.text || null);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Gemini API status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Extracts and cleans JSON from Gemini markdown output (e.g. ```json ... ```)
 */
function cleanJsonOutput(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }
  return JSON.parse(cleaned);
}

/**
 * Intelligent Local Heuristic Fallback Engine
 * Guarantees zero downtime if external network is unavailable or rate-limited.
 */
function heuristicDiagnose(userInput, city = 'Local Area', localPricing = null) {
  const text = (userInput || '').toLowerCase();

  let category = 'Other / General Assistance';
  let specificSkill = 'General Handyman & Task Support';
  let urgency = 'Standard';
  let minPrice = 300;
  let maxPrice = 600;
  let diagnosis = 'General on-demand task assistance requested.';
  let checklist = [
    'Confirm exact task requirements with customer on arrival',
    'Bring standard multipurpose toolkit',
    'Test and verify resolution before departure'
  ];

  // Emergency keywords
  if (/burst|flood|spark|fire|smoke|shock|leakage|urgent|emergency|immediately|hazard|broken main/.test(text)) {
    urgency = 'Emergency (Immediate)';
  } else if (/quick|today|asap|soon|faster|tonight/.test(text)) {
    urgency = 'High Priority';
  }

  // Plumbing
  if (/plumb|pipe|tap|faucet|drain|leak|sink|flush|toilet|clog|geyser|water tank|sewage|valve/.test(text)) {
    category = 'Plumbing & Repairs';
    specificSkill = /tap|faucet/.test(text) ? 'Tap & Faucet Repair' :
                    /drain|clog/.test(text) ? 'Drainage & Clog Clearance' :
                    /flush|toilet/.test(text) ? 'Toilet & Flush Valve Repair' :
                    /tank|pipe|burst/.test(text) ? 'Pipe Fitting & Leakage Sealing' : 'General Plumbing Inspection';
    minPrice = 349;
    maxPrice = 699;
    diagnosis = `Identified plumbing issue: ${specificSkill}. Water source shutoff may be recommended prior to technician arrival.`;
    checklist = [
      'Locate main stopcock and isolate affected supply line if leaking actively',
      'Inspect pipe joints, seals, and pressure washers',
      'Replace damaged washers, Teflon tape, or threaded fittings',
      'Perform 5-minute continuous flow pressure test to ensure no seepage'
    ];
  }
  // Electrical
  else if (/electr|switch|socket|spark|wire|short circuit|mcb|trip|light|fan|fuse|bulb|inverter|chandel/.test(text)) {
    category = 'Electrical & Wiring';
    specificSkill = /mcb|trip|short/.test(text) ? 'MCB & Circuit Breaker Repair' :
                    /fan/.test(text) ? 'Ceiling Fan Installation & Repair' :
                    /switch|socket/.test(text) ? 'Switchboard & Socket Replacement' : 'Electrical Wiring Inspection';
    minPrice = 349;
    maxPrice = 799;
    diagnosis = `Identified electrical task: ${specificSkill}. Voltage testing and circuit isolation required.`;
    checklist = [
      'De-energize circuit breaker / MCB before touching conductors',
      'Verify zero voltage using digital tester / multimeter',
      'Inspect for thermal burns, loose terminal screws, or insulation degradation',
      'Secure wiring harness and conduct live load test'
    ];
  }
  // AC & Appliances
  else if (/ac|air condition|cool|fridge|refrigerator|freeze|washing machine|microwave|oven|ro|purifier|compressor/.test(text)) {
    category = 'AC, Fridge & Appliance Repair';
    specificSkill = /ac|air condition|cool/.test(text) ? 'AC Cooling & Filter Servicing' :
                    /fridge|refrigerator/.test(text) ? 'Refrigerator Gas & Thermostat Service' :
                    /washing/.test(text) ? 'Washing Machine Drum & Motor Repair' : 'Appliance Diagnosis & Repair';
    minPrice = 499;
    maxPrice = 1199;
    diagnosis = `Appliance service required: ${specificSkill}. Diagnostics on compressor/motor and coils recommended.`;
    checklist = [
      'Test power input and circuit board error code diagnosis',
      'Clean air/water intake filters and condenser coils',
      'Check refrigerant gas levels or motor belt tension',
      'Run complete operational cycle test to confirm performance'
    ];
  }
  // Cleaning
  else if (/clean|deep clean|dust|sweep|mop|sofa clean|bathroom clean|kitchen clean|sanitiz|wash/.test(text)) {
    category = 'Deep Cleaning & Sanitization';
    specificSkill = /bathroom|toilet/.test(text) ? 'Bathroom Deep Scrub & Descaling' :
                    /kitchen/.test(text) ? 'Kitchen Degreasing & Chimney Cleaning' :
                    /sofa|carpet|mattress/.test(text) ? 'Sofa & Upholstery Shampooing' : 'Full Home Deep Cleaning';
    minPrice = 599;
    maxPrice = 1899;
    diagnosis = `Hygiene and sanitization task: ${specificSkill}. Industrial non-toxic agents recommended.`;
    checklist = [
      'Perform dry vacuuming and surface dust removal',
      'Apply food-grade eco-friendly descaling and degreasing agents',
      'Machine scrub or scrub pad deep agitation',
      'Microfiber drying and final disinfectant misting'
    ];
  }
  // Carpentry
  else if (/carpent|wood|furniture|door|hinge|lock|handle|drawer|cabinet|table|chair|bed|shelf/.test(text)) {
    category = 'Carpentry & Woodwork';
    specificSkill = /hinge|lock|handle/.test(text) ? 'Door Lock & Hinge Fitting' :
                    /drawer|cabinet/.test(text) ? 'Cabinet & Modular Furniture Repair' : 'Woodwork & Furniture Assembly';
    minPrice = 349;
    maxPrice = 849;
    diagnosis = `Carpentry assistance required: ${specificSkill}. Precise alignment and anchoring required.`;
    checklist = [
      'Inspect frame alignment, hinge screw grip, and clearances',
      'Trim or plane contact edges if binding against frame',
      'Install heavy-duty screws or anchors as needed',
      'Lubricate moving pivots and verify latch lock engagement'
    ];
  }
  // Painting
  else if (/paint|whitewash|wall|primer|stain|putty|waterproof|seepage/.test(text)) {
    category = 'Wall Painting & Waterproofing';
    specificSkill = /waterproof|seepage/.test(text) ? 'Wall Dampness & Waterproofing' : 'Interior Wall Painting & Touchup';
    minPrice = 699;
    maxPrice = 2499;
    diagnosis = `Surface preparation & coating: ${specificSkill}. Moisture inspection and primer recommended.`;
    checklist = [
      'Scrape loose flakes and sand surface to smooth finish',
      'Apply anti-fungal damp seal coat or acrylic putty',
      'Evenly apply 2 coats of premium emulsion with roller',
      'Clean floor masking and edges after drying'
    ];
  }
  // Moving & Shifting
  else if (/mov|shift|pack|luggage|tempo|lorry|relocat|carton|furniture lift/.test(text)) {
    category = 'Moving & Heavy Lifting';
    specificSkill = 'Furniture Moving & Shifting Support';
    minPrice = 899;
    maxPrice = 2999;
    diagnosis = `Logistics and handling: ${specificSkill}. Protective wrapping and team lifting required.`;
    checklist = [
      'Wrap fragile items and electronics in bubble film',
      'Dismantle larger furniture items safely',
      'Use heavy-duty dollies and shoulder straps for lifting',
      'Secure cargo inside transport vehicle'
    ];
  }
  // Tutoring / Teaching
  else if (/tutor|teach|math|science|english|exam|class|school|study|physics|coding/.test(text)) {
    category = 'Tutors & Skill Coaches';
    specificSkill = 'Academic Tutoring & Skill Coaching';
    minPrice = 350;
    maxPrice = 800;
    diagnosis = `Educational guidance required: ${specificSkill}. Curriculum review and personalized session plan.`;
    checklist = [
      'Assess student current level and upcoming syllabus targets',
      'Provide structured concept explanation and practice worksheets',
      'Review weak areas with interactive problem-solving'
    ];
  }

  let suggestedRate = minPrice;
  let pricingSource = `Estimated realistic IRL Indian market rate for ${city}`;

  if (localPricing && localPricing.hasLocalWorkers) {
    minPrice = localPricing.minDemandRate || minPrice;
    maxPrice = localPricing.maxDemandRate || Math.round(minPrice * 1.5);
    suggestedRate = minPrice;
    pricingSource = `Calculated from ${localPricing.workerCount} verified local pro demands in ${city}`;
  }

  const suggestedBudget = (localPricing && localPricing.avgDemandRate)
    ? localPricing.avgDemandRate
    : Math.round((minPrice + maxPrice) / 2);

  return {
    success: true,
    aiModel: 'Hustle Heuristic Engine (Fallback Active)',
    userInput,
    category,
    specificSkill,
    urgency,
    suggestedRate,
    estimatedPriceRange: {
      min: minPrice,
      max: maxPrice,
      suggested: suggestedBudget
    },
    pricingSource,
    diagnosis,
    recommendedChecklist: checklist,
    suggestedNotes: `Diagnosed Issue: ${specificSkill}. Urgency: ${urgency}.\nPlease ensure technician inspects: ${checklist[0]}. Preferred location: ${city}.`
  };
}

/**
 * Diagnose User Need from Natural Language (AI MATCH Field)
 * Dynamically factors in real local worker demands or realistic IRL Indian rates
 */
async function diagnoseNeed(userInput, city = 'Bengaluru', localPricing = null) {
  if (!userInput || typeof userInput !== 'string' || userInput.trim().length === 0) {
    return {
      success: false,
      error: 'Please describe what you need assistance with.'
    };
  }

  const cleanInput = userInput.trim();
  const diagCacheKey = `diag:${city}:${cleanInput.toLowerCase()}:${localPricing?.workerCount || 0}`;
  const cachedDiag = getCache(diagCacheKey);
  if (cachedDiag) return cachedDiag;

  let pricingInstruction = '';
  if (localPricing && localPricing.hasLocalWorkers) {
    pricingInstruction = `
REAL-TIME LOCAL WORKER DEMAND DATA FOR ${city.toUpperCase()}:
- Active verified workers in this trade in ${city}: ${localPricing.workerCount}
- Minimum base rate demanded by local pros: ₹${localPricing.minDemandRate}
- Maximum rate demanded by local pros: ₹${localPricing.maxDemandRate}
- Average rate demanded by local pros: ₹${localPricing.avgDemandRate}
${localPricing.sampleDemands && localPricing.sampleDemands.length > 0 ? `- Recent rates/bookings in ${city}: ₹${localPricing.sampleDemands.join(', ₹')}` : ''}

CRITICAL PRICING REQUIREMENT:
You MUST calculate "suggestedRate" and "estimatedPriceRange" based strictly on these actual worker demands in ${city}.
- suggestedRate: starting base rate (around ₹${localPricing.minDemandRate})
- estimatedPriceRange.min: ₹${localPricing.minDemandRate}
- estimatedPriceRange.max: ₹${localPricing.maxDemandRate}
- estimatedPriceRange.suggested: ₹${localPricing.avgDemandRate}
- pricingSource: "Calculated from ${localPricing.workerCount} local pro demands in ${city}"
`;
  } else {
    pricingInstruction = `
LOCAL WORKER STATUS FOR ${city.toUpperCase()}:
- No registered verified workers currently found in ${city} for this specific trade.

CRITICAL PRICING REQUIREMENT:
You MUST estimate realistic in-real-life (IRL) Indian market rates according to this work scope and city (${city}) in INR.
Do NOT return arbitrary random numbers. Base your numbers strictly on real-world Indian urban service technician charges:
- Minor inspection, simple tap washer, single switch fix: ₹249 - ₹399
- Standard plumbing fix, ceiling fan repair, minor carpentry: ₹349 - ₹699
- Appliance servicing, split AC filter jet cleaning, lock replacement: ₹499 - ₹999
- Deep bathroom/kitchen cleaning, sofa shampooing, damp waterproofing: ₹699 - ₹1,899
- Full home shifting or major woodwork: ₹1,299 - ₹3,499
Set suggestedRate to the realistic starting visit/inspection fee in ${city}.
Set pricingSource to: "Estimated realistic IRL Indian market rate for ${city}".
`;
  }

  const prompt = `You are Hustle AI, an intelligent home and urban services triage assistant for India.
Analyze the user's natural language request: "${userInput.trim()}".
The user is located in or around ${city}.

Classify into one of these Hustle service categories:
- Plumbing & Repairs
- Electrical & Wiring
- AC, Fridge & Appliance Repair
- Deep Cleaning & Sanitization
- Carpentry & Woodwork
- Wall Painting & Waterproofing
- Pest Control
- Moving & Heavy Lifting
- Tutors & Skill Coaches
- Pet Care & Dog Walking
- Salon & Beauty at Home
- Gardening & Lawn Care
- Other / General Assistance

${pricingInstruction}

Respond ONLY with valid JSON in this exact structure:
{
  "category": "Matched category name from the list above",
  "specificSkill": "Concise specific skill or trade needed, e.g., 'Pipe Leakage Repair' or 'MCB Tripping Diagnosis'",
  "urgency": "Emergency (Immediate)" | "High Priority" | "Standard",
  "suggestedRate": 349,
  "estimatedPriceRange": {
    "min": 350,
    "max": 750,
    "suggested": 500
  },
  "pricingSource": "Pricing source description",
  "diagnosis": "1-2 sentence professional analysis explaining what is happening and the likely cause.",
  "recommendedChecklist": [
    "Step 1 for safety or prep",
    "Step 2 for technician inspection",
    "Step 3 for verification"
  ],
  "suggestedNotes": "Clear, professional job brief ready to send to workers."
}`;

  try {
    const rawAiText = await callGeminiApi(prompt);
    const parsed = cleanJsonOutput(rawAiText);
    if (parsed && parsed.category && parsed.specificSkill) {
      const fallbackMin = localPricing?.minDemandRate || 349;
      const fallbackMax = localPricing?.maxDemandRate || 799;
      const fallbackAvg = localPricing?.avgDemandRate || 499;

      const priceRange = parsed.estimatedPriceRange || { min: fallbackMin, max: fallbackMax, suggested: fallbackAvg };
      const startingRate = parsed.suggestedRate || priceRange.min || fallbackMin;
      const sourceDesc = parsed.pricingSource || (localPricing?.hasLocalWorkers ? `Calculated from ${localPricing.workerCount} local pro demands in ${city}` : `Estimated realistic IRL Indian market rate for ${city}`);

      const finalResult = {
        success: true,
        aiModel: 'Hustle Smart AI',
        userInput: userInput.trim(),
        category: parsed.category,
        specificSkill: parsed.specificSkill,
        urgency: parsed.urgency || 'Standard',
        suggestedRate: Number(startingRate) || fallbackMin,
        estimatedPriceRange: {
          min: Number(priceRange.min) || fallbackMin,
          max: Number(priceRange.max) || fallbackMax,
          suggested: Number(priceRange.suggested) || fallbackAvg
        },
        pricingSource: sourceDesc,
        diagnosis: parsed.diagnosis,
        recommendedChecklist: parsed.recommendedChecklist || [],
        suggestedNotes: parsed.suggestedNotes || userInput.trim()
      };
      setCache(diagCacheKey, finalResult);
      return finalResult;
    }
  } catch (err) {
    console.warn('[Gemini AI] Live API call did not succeed, engaging heuristic fallback:', err.message);
  }

  // Graceful fallback to heuristic engine
  const fallbackResult = heuristicDiagnose(userInput, city, localPricing);
  setCache(diagCacheKey, fallbackResult);
  return fallbackResult;
}

/**
 * Enhance / Polish Task Notes for Customers
 */
async function enhanceScope(rawNotes, serviceCategory = 'General Service') {
  if (!rawNotes || rawNotes.trim().length === 0) {
    return { success: false, enhanced: rawNotes };
  }

  const prompt = `You are Hustle AI, an expert job scope generator.
Take these rough customer notes for a "${serviceCategory}" task:
"${rawNotes.trim()}"

Rewrite them into a clear, professional, well-structured work brief for a gig worker.
Include:
1. Exact issue / requirement summary
2. Important access, location, or material details
3. Expected standard of completion

Keep it concise (around 3-5 sentences or clean bullet points). Do NOT add conversational fluff. Respond with just the enhanced text.`;

  try {
    const rawAiText = await callGeminiApi(prompt);
    if (rawAiText && rawAiText.trim().length > 10) {
      return {
        success: true,
        aiModel: 'Hustle Smart AI',
        enhanced: rawAiText.trim()
      };
    }
  } catch (err) {
    console.warn('[Gemini AI] Enhance scope fallback engaged:', err.message);
  }

  // Heuristic enhancement
  const cleaned = rawNotes.trim().replace(/\s+/g, ' ');
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const fallbackEnhanced = `Task Requirement: ${capitalized}.\n• Scope: Comprehensive inspection, necessary repairs/service, and post-work operational verification.\n• Safety & Quality: Use standard industry tools and ensure neat cleanup upon completion.`;
  return {
    success: true,
    aiModel: 'Hustle Heuristic Engine (Fallback Active)',
    enhanced: fallbackEnhanced
  };
}

/**
 * Price & Negotiation Advisor
 */
async function advisePrice(serviceCategory, proposedPrice, city = 'Bengaluru') {
  const price = Number(proposedPrice) || 0;
  const benchmark = CATEGORY_BENCHMARKS[serviceCategory] || { min: 300, max: 800, avg: 500, unit: 'job' };

  let status = 'fair';
  let advice = '';

  if (price < benchmark.min) {
    status = 'below_market';
    advice = `₹${price} is below standard local rates (typically ₹${benchmark.min} - ₹${benchmark.max} for ${serviceCategory} in ${city}). Specialists may be slower to accept.`;
  } else if (price > benchmark.max) {
    status = 'above_average';
    advice = `₹${price} is a premium offer above typical market rate (avg ₹${benchmark.avg}). High likelihood of immediate top-rated worker acceptance.`;
  } else {
    status = 'fair';
    advice = `₹${price} is within the fair market benchmark (₹${benchmark.min} - ₹${benchmark.max}) for ${serviceCategory}.`;
  }

  return {
    success: true,
    category: serviceCategory,
    proposedPrice: price,
    benchmark,
    status,
    advice
  };
}

// Canonical Catalog of Hustle's 18 Available Services
const HUSTLE_18_SERVICES = [
  { id: 'home-cleaning', name: 'Deep home cleaning', category: 'HOME CARE', description: 'Kitchen, bath & living spaces deep cleaning and sanitization', minPrice: 699, keywords: ['clean', 'cleaning', 'dust', 'mop', 'sweep', 'wash', 'scrub', 'sanitize', 'sanitization', 'bathroom', 'kitchen', 'housekeeping', 'maid'] },
  { id: 'spa-therapy', name: 'At-home spa therapy', category: 'WELLNESS', description: 'Relaxing wellness treatment, body massage, facial, salon & spa at home', minPrice: 1099, keywords: ['spa', 'massage', 'therapy', 'facial', 'pedicure', 'manicure', 'waxing', 'salon', 'beauty', 'haircut', 'skin', 'wellness'] },
  { id: 'maths-tutoring', name: 'Maths tutoring', category: 'LEARN', description: 'Maths and academic tutoring for grades 6–12, homework & exam prep', minPrice: 1499, keywords: ['tutor', 'tutoring', 'math', 'maths', 'teacher', 'teach', 'algebra', 'geometry', 'calculus', 'physics', 'science', 'exam', 'homework', 'coaching', 'tuition', 'study'] },
  { id: 'handyman', name: 'Handyman visits', category: 'HOME REPAIR', description: 'Small fixes, drill & hanging, curler/rod fitting sorted in one visit', minPrice: 349, keywords: ['handyman', 'fix', 'drill', 'drilling', 'hang', 'hanging', 'mirror', 'curtain', 'rod', 'frame', 'screw', 'assembly', 'fitting', 'shelf'] },
  { id: 'electrician', name: 'Electrician visits', category: 'REPAIRS', description: 'Safe fixes for switches, MCB tripping, fan, lights & wiring in every room', minPrice: 299, keywords: ['electric', 'electrical', 'electrician', 'switch', 'switchboard', 'socket', 'plug', 'spark', 'short circuit', 'circuit breaker', 'breaker', 'trip', 'tripping', 'mcb', 'fuse', 'fan', 'light', 'wire', 'wiring', 'inverter', 'voltage', 'bulb'] },
  { id: 'plumbing', name: 'Plumbing solutions', category: 'HOME REPAIR', description: 'Leaks, fittings, pipe drainage, tap and toilet installations', minPrice: 349, keywords: ['plumb', 'plumbing', 'pipe', 'tap', 'faucet', 'leak', 'leakage', 'drain', 'drainage', 'clog', 'sink', 'toilet', 'flush', 'water tank', 'sewage', 'valve', 'geyser pipe'] },
  { id: 'carpentry', name: 'Carpentry & assembly', category: 'CARPENTRY', description: 'Furniture repair, hinges, door locks, wooden work and modular assembly', minPrice: 499, keywords: ['carpenter', 'carpentry', 'wood', 'woodwork', 'furniture', 'door', 'lock', 'hinge', 'handle', 'table', 'chair', 'bed', 'wardrobe', 'cabinet', 'drawer', 'sofa', 'upholstery', 'cushion'] },
  { id: 'babysitting', name: 'Babysitting', category: 'CHILDCARE', description: 'Caring hands, child supervision, bedtime and play routines for your little ones', minPrice: 249, keywords: ['baby', 'babysit', 'babysitting', 'babysitter', 'child', 'children', 'kid', 'kids', 'nanny', 'childcare', 'daycare', 'toddler'] },
  { id: 'pet-care', name: 'Pet sitting & walks', category: 'PETS', description: 'Happy companions, daily dog walks, pet sitting while you are away', minPrice: 299, keywords: ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'walk', 'dog walking', 'pet sitting', 'kitten', 'vet escort', 'feed pet'] },
  { id: 'home-organisation', name: 'Home organisation', category: 'ORGANISING', description: 'Order and calm, wardrobe decluttering, pantry & room arrangement', minPrice: 799, keywords: ['organise', 'organize', 'organisation', 'organization', 'declutter', 'decluttering', 'wardrobe', 'closet', 'pantry', 'tidying', 'neat', 'storage'] },
  { id: 'tech-help', name: 'Laptop & Wi-Fi help', category: 'TECH HELP', description: 'Computer, laptop, router, software & Wi-Fi troubles clearly solved', minPrice: 399, keywords: ['laptop', 'computer', 'pc', 'mac', 'wifi', 'wi-fi', 'router', 'internet', 'windows', 'printer', 'software', 'tech help', 'format', 'network'] },
  { id: 'garden-care', name: 'Garden care', category: 'GARDEN', description: 'Lawn mowing, pruning, plant repotting, weeding and garden maintenance', minPrice: 599, keywords: ['garden', 'gardening', 'lawn', 'plant', 'plants', 'grass', 'mow', 'pruning', 'hedge', 'soil', 'pots', 'repotting', 'weeding', 'balcony garden', 'gardener'] },
  { id: 'appliances', name: 'Appliance care & repair', category: 'APPLIANCES', description: 'AC cooling, refrigerator, microwave & washing machine diagnosis and repair', minPrice: 399, keywords: ['ac', 'air conditioner', 'cooling', 'fridge', 'refrigerator', 'freeze', 'freezer', 'washing machine', 'microwave', 'oven', 'ro purifier', 'compressor', 'chimney', 'appliance'] },
  { id: 'painting', name: 'Painting & waterproofing', category: 'PAINTING', description: 'Flawless wall coats, interior touchup & damp/seepage waterproofing', minPrice: 999, keywords: ['paint', 'painter', 'painting', 'wall', 'walls', 'waterproof', 'waterproofing', 'damp', 'seepage', 'primer', 'whitewash', 'stencil', 'texture', 'ceiling paint'] },
  { id: 'fitness', name: 'Fitness & yoga coaching', category: 'FITNESS', description: 'Personal fitness, yoga instruction and customized training at your home', minPrice: 799, keywords: ['fitness', 'gym', 'workout', 'train', 'trainer', 'coach', 'yoga', 'weight loss', 'pilates', 'aerobics', 'exercise', 'personal training'] },
  { id: 'auto-care', name: 'Car detailing & eco wash', category: 'AUTO CARE', description: 'Doorstep interior vacuum, exterior waterless/eco wash & paint polish', minPrice: 449, keywords: ['car', 'vehicle', 'car wash', 'auto', 'detailing', 'polish', 'car interior', 'car clean', 'bike wash', 'foam wash'] },
  { id: 'pest-control', name: 'Pest control & sanitization', category: 'HOME SAFETY', description: 'Odorless, pet-safe pest control treatments for termites, cockroaches & bedbugs', minPrice: 549, keywords: ['pest', 'pests', 'termite', 'termites', 'cockroach', 'cockroaches', 'roach', 'bedbug', 'bedbugs', 'mosquito', 'rodent', 'rat', 'rats', 'ant', 'ants', 'fumigation', 'disinfection', 'pest control'] },
  { id: 'senior-care', name: 'Senior care & assistance', category: 'ASSISTANCE', description: 'Gentle companionship, mobility support, medication reminders & daily errands for elders', minPrice: 349, keywords: ['senior', 'seniors', 'elder', 'elders', 'elderly', 'grandparent', 'old age', 'companion', 'companionship', 'medication', 'errands', 'assistance', 'mobility', 'caregiver'] }
];

/**
 * Matches whatever search query is made against all 18 available services.
 * If a match is found: returns closest matching service.
 * If NO match found: returns matched = false, enabling progression to create new pool.
 */
async function matchAgainst18Services(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { success: false, matched: false, service: null, reason: 'Empty search query' };
  }

  const cleanQuery = query.trim();
  const cacheKey = `match18:${cleanQuery.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  // 1. Instant Fast-Path: evaluate local high-precision token/keyword matcher (< 0.2ms!)
  const qLower = cleanQuery.toLowerCase();
  const queryTokens = qLower.split(/[^a-z0-9]+/).filter(Boolean);
  let bestService = null;
  let bestScore = 0;

  for (const s of HUSTLE_18_SERVICES) {
    let score = 0;
    // Exact name match
    if (qLower.includes(s.name.toLowerCase())) {
      score += 15;
    }
    // Category match
    if (qLower.includes(s.category.toLowerCase())) {
      score += 8;
    }
    // Keyword matches with strict word boundary protection
    for (const kw of s.keywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower.includes(' ')) {
        // Multi-word phrase match (e.g., 'dog walking', 'air conditioner')
        if (qLower.includes(kwLower)) {
          score += 6;
        }
      } else {
        // Single word: must match a whole token or valid stem prefix
        if (queryTokens.includes(kwLower) || (kwLower.length >= 4 && queryTokens.some(tok => tok.startsWith(kwLower)))) {
          score += 4;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestService = s;
    }
  }

  // If decisive high-confidence match found locally (score >= 6), return immediately without waiting for API!
  if (bestService && bestScore >= 6) {
    const fastResult = {
      success: true,
      matched: true,
      service: bestService,
      reason: `Identified as best fit for: ${bestService.name} (${bestService.category}).`
    };
    setCache(cacheKey, fastResult);
    return fastResult;
  }

  const servicesListForPrompt = HUSTLE_18_SERVICES.map((s, idx) => 
    `${idx + 1}. [ID: "${s.id}"] "${s.name}" (Category: ${s.category}) - ${s.description}`
  ).join('\n');

  const prompt = `You are Hustle AI, an intelligent service matcher for an on-demand platform.
We have EXACTLY 18 available services in our catalog:
${servicesListForPrompt}

User Search / Job Need: "${cleanQuery}".

TASK:
1. Compare this search against ALL 18 available services listed above.
2. If this need can be fulfilled by one of our 18 services, find the SINGLE closest matching service.
3. If this need is completely outside of our 18 services (for example: legal/court lawyer, event DJ, wedding photography, biryani catering, solar rooftop panel, tattoo artist, tailoring, astrology, debt recovery, etc.), mark matched as false.

Respond ONLY with valid JSON in this exact format:
{
  "matched": true | false,
  "serviceId": "exact id from list above or null",
  "serviceName": "exact name from list above or null",
  "category": "exact category from list above or null",
  "reason": "1 concise sentence explaining why this is the closest match or why no service fits",
  "suggestedPoolSkill": "concise skill title if custom pool needed"
}`;

  try {
    const rawAiText = await callGeminiApi(prompt);
    const parsed = cleanJsonOutput(rawAiText);
    if (parsed && typeof parsed.matched === 'boolean') {
      if (parsed.matched && parsed.serviceId) {
        const found = HUSTLE_18_SERVICES.find(s => s.id === parsed.serviceId);
        const result = {
          success: true,
          matched: true,
          service: found || {
            id: parsed.serviceId,
            name: parsed.serviceName || parsed.serviceId,
            category: parsed.category || 'HOME CARE',
            minPrice: 349
          },
          reason: parsed.reason || `Closest match among our 18 services: ${parsed.serviceName || parsed.serviceId}.`
        };
        setCache(cacheKey, result);
        return result;
      } else {
        const result = {
          success: true,
          matched: false,
          service: null,
          reason: parsed.reason || `No matching service found among our 18 standard services for "${cleanQuery}".`,
          suggestedPoolSkill: parsed.suggestedPoolSkill || cleanQuery
        };
        setCache(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('[Gemini AI] Match 18 fallback engaged:', err.message);
  }

  // Fallback threshold 4
  if (bestService && bestScore >= 4) {
    const result = {
      success: true,
      matched: true,
      service: bestService,
      reason: `Identified as closest match to ${bestService.name} (${bestService.category}).`
    };
    setCache(cacheKey, result);
    return result;
  }

  // No match found in the 18 services
  const fallbackNoMatch = {
    success: true,
    matched: false,
    service: null,
    reason: `No matching service found among our 18 standard services for "${cleanQuery}".`,
    suggestedPoolSkill: cleanQuery
  };
  setCache(cacheKey, fallbackNoMatch);
  return fallbackNoMatch;
  return {
    success: true,
    matched: false,
    service: null,
    reason: `No matching service found among our 18 catalog services for "${cleanQuery}".`,
    suggestedPoolSkill: cleanQuery
  };
}

/**
 * Semantic Search & Intent Matching against 18 Services
 */
async function semanticSearch(query) {
  if (!query || query.trim().length === 0) {
    return { success: false, matched: false, service: null };
  }

  const matchRes = await matchAgainst18Services(query);
  return matchRes;
}

/**
 * Curated list of popular specific service tasks for fast autocompletion matching
 */
const POPULAR_SERVICE_TASKS = [
  // 1. home-cleaning
  { title: 'Full home deep cleaning & sanitization', category: 'HOME CARE', serviceId: 'home-cleaning', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Kitchen & chimney deep degreasing', category: 'HOME CARE', serviceId: 'home-cleaning', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Bathroom floor & tile descaling', category: 'HOME CARE', serviceId: 'home-cleaning', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Sofa, carpet & mattress shampooing', category: 'HOME CARE', serviceId: 'home-cleaning', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Move-in & vacant apartment cleaning', category: 'HOME CARE', serviceId: 'home-cleaning', is18Catalog: true, tag: 'Standard 18 Service' },

  // 2. spa-therapy
  { title: 'At-home relaxing full body massage & spa', category: 'WELLNESS', serviceId: 'spa-therapy', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Facial, cleanup & de-tan at home', category: 'WELLNESS', serviceId: 'spa-therapy', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Manicure, pedicure & salon package', category: 'WELLNESS', serviceId: 'spa-therapy', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Hair styling & haircut at home', category: 'WELLNESS', serviceId: 'spa-therapy', is18Catalog: true, tag: 'Standard 18 Service' },

  // 3. maths-tutoring
  { title: 'Class 9–12 CBSE/ICSE Maths Tutoring', category: 'LEARN', serviceId: 'maths-tutoring', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Algebra, Calculus & Geometry tuition', category: 'LEARN', serviceId: 'maths-tutoring', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Weekly school homework & exam prep coaching', category: 'LEARN', serviceId: 'maths-tutoring', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Physics & Science foundational tuition', category: 'LEARN', serviceId: 'maths-tutoring', is18Catalog: true, tag: 'Standard 18 Service' },

  // 4. handyman
  { title: 'TV wall mounting & frame drilling', category: 'HOME REPAIR', serviceId: 'handyman', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Curtain rod, mirror & blind installation', category: 'HOME REPAIR', serviceId: 'handyman', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'IKEA & modular furniture flatpack assembly', category: 'HOME REPAIR', serviceId: 'handyman', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Door lock, latch & bolt installation', category: 'HOME REPAIR', serviceId: 'handyman', is18Catalog: true, tag: 'Standard 18 Service' },

  // 5. electrician
  { title: 'Switchboard, socket & plug replacement', category: 'REPAIRS', serviceId: 'electrician', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Ceiling fan installation & capacitor fix', category: 'REPAIRS', serviceId: 'electrician', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'MCB tripping & short circuit inspection', category: 'REPAIRS', serviceId: 'electrician', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Inverter wiring & battery connection', category: 'REPAIRS', serviceId: 'electrician', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'LED lights & chandelier fitting', category: 'REPAIRS', serviceId: 'electrician', is18Catalog: true, tag: 'Standard 18 Service' },

  // 6. plumbing
  { title: 'Plumbing pipe leak repair & sealing', category: 'HOME REPAIR', serviceId: 'plumbing', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Bathroom tap, mixer & shower repair', category: 'HOME REPAIR', serviceId: 'plumbing', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Drain clog, sink trap & pipe unblocking', category: 'HOME REPAIR', serviceId: 'plumbing', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Toilet flush cistern & valve fix', category: 'HOME REPAIR', serviceId: 'plumbing', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Overhead water tank float valve repair', category: 'HOME REPAIR', serviceId: 'plumbing', is18Catalog: true, tag: 'Standard 18 Service' },

  // 7. carpentry
  { title: 'Wooden furniture & chair leg repair', category: 'CARPENTRY', serviceId: 'carpentry', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Wardrobe sliding door & hinge alignment', category: 'CARPENTRY', serviceId: 'carpentry', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Custom wooden shelf & cabinet fitting', category: 'CARPENTRY', serviceId: 'carpentry', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Sofa frame reinforcement & woodwork', category: 'CARPENTRY', serviceId: 'carpentry', is18Catalog: true, tag: 'Standard 18 Service' },

  // 8. babysitting
  { title: 'Evening babysitting & toddler care', category: 'CHILDCARE', serviceId: 'babysitting', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Infant care nanny & feeding routine support', category: 'CHILDCARE', serviceId: 'babysitting', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'After-school child supervision & playtime', category: 'CHILDCARE', serviceId: 'babysitting', is18Catalog: true, tag: 'Standard 18 Service' },

  // 9. pet-care
  { title: 'Daily morning & evening dog walking', category: 'PETS', serviceId: 'pet-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Pet sitting at home while travelling', category: 'PETS', serviceId: 'pet-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Cat feeding, litter cleaning & care', category: 'PETS', serviceId: 'pet-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Dog bath, nail trim & basic grooming', category: 'PETS', serviceId: 'pet-care', is18Catalog: true, tag: 'Standard 18 Service' },

  // 10. home-organisation
  { title: 'Wardrobe decluttering & seasonal organization', category: 'ORGANISING', serviceId: 'home-organisation', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Modular kitchen pantry tidying & jar labeling', category: 'ORGANISING', serviceId: 'home-organisation', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Home study & bookshelf decluttering', category: 'ORGANISING', serviceId: 'home-organisation', is18Catalog: true, tag: 'Standard 18 Service' },

  // 11. tech-help
  { title: 'Laptop performance boost & malware removal', category: 'TECH HELP', serviceId: 'tech-help', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Home Wi-Fi router setup & mesh extension', category: 'TECH HELP', serviceId: 'tech-help', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Printer setup & wireless driver fixing', category: 'TECH HELP', serviceId: 'tech-help', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Windows/MacOS formatting & data backup', category: 'TECH HELP', serviceId: 'tech-help', is18Catalog: true, tag: 'Standard 18 Service' },

  // 12. garden-care
  { title: 'Lawn mowing, edging & grass trimming', category: 'GARDEN', serviceId: 'garden-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Balcony plants repotting, pruning & soil fertilizing', category: 'GARDEN', serviceId: 'garden-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Garden weed removal & seasonal care', category: 'GARDEN', serviceId: 'garden-care', is18Catalog: true, tag: 'Standard 18 Service' },

  // 13. appliances
  { title: 'Split AC deep jet cleaning & gas top-up', category: 'APPLIANCES', serviceId: 'appliances', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'AC not cooling & compressor diagnostic', category: 'APPLIANCES', serviceId: 'appliances', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Refrigerator cooling & freezer ice buildup fix', category: 'APPLIANCES', serviceId: 'appliances', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Washing machine drum vibration & drain motor repair', category: 'APPLIANCES', serviceId: 'appliances', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Microwave oven heating plate & magnetron repair', category: 'APPLIANCES', serviceId: 'appliances', is18Catalog: true, tag: 'Standard 18 Service' },

  // 14. painting
  { title: 'Interior room wall painting & touch-up', category: 'PAINTING', serviceId: 'painting', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Damp wall seepage & waterproofing treatment', category: 'PAINTING', serviceId: 'painting', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Accent feature wall painting & stencil design', category: 'PAINTING', serviceId: 'painting', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Ceiling whitewash & primer recoat', category: 'PAINTING', serviceId: 'painting', is18Catalog: true, tag: 'Standard 18 Service' },

  // 15. fitness
  { title: 'Personal fitness & gym workout coach at home', category: 'FITNESS', serviceId: 'fitness', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Morning yoga, pranayama & flexibility training', category: 'FITNESS', serviceId: 'fitness', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Weight loss, HIIT & stamina training', category: 'FITNESS', serviceId: 'fitness', is18Catalog: true, tag: 'Standard 18 Service' },

  // 16. auto-care
  { title: 'Doorstep exterior foam car wash & rinse', category: 'AUTO CARE', serviceId: 'auto-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Deep interior car vacuuming & dashboard polish', category: 'AUTO CARE', serviceId: 'auto-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Two-wheeler bike wash, chain lube & shine', category: 'AUTO CARE', serviceId: 'auto-care', is18Catalog: true, tag: 'Standard 18 Service' },

  // 17. pest-control
  { title: 'Odorless cockroach herbal gel pest control', category: 'HOME SAFETY', serviceId: 'pest-control', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Bedbug eradication chemical treatment', category: 'HOME SAFETY', serviceId: 'pest-control', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Termite anti-drill wood & wall protection', category: 'HOME SAFETY', serviceId: 'pest-control', is18Catalog: true, tag: 'Standard 18 Service' },

  // 18. senior-care
  { title: 'Elderly companionship & gentle daily assistance', category: 'ASSISTANCE', serviceId: 'senior-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Senior mobility support for doctor clinic visits', category: 'ASSISTANCE', serviceId: 'senior-care', is18Catalog: true, tag: 'Standard 18 Service' },
  { title: 'Daily medication reminder & routine checking', category: 'ASSISTANCE', serviceId: 'senior-care', is18Catalog: true, tag: 'Standard 18 Service' },

  // Popular custom pool tasks
  { title: 'Home cook for North/South Indian meals', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' },
  { title: 'Balcony pigeon bird netting & spike setup', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' },
  { title: 'Event & birthday party photographer', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' },
  { title: 'Custom tailoring, blouse & dress alterations', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' },
  { title: 'Heavy furniture moving & tempo luggage loading', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' },
  { title: 'Guitar & musical keyboard home classes', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' },
  { title: 'CCTV camera installation & DVR wiring', category: 'OPEN POOL', serviceId: null, is18Catalog: false, tag: 'Custom Pro Work' }
];

/**
 * Fast Heuristic Search Suggestions Generator
 */
function getHeuristicSuggestions(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);

  const scored = [];
  const seenTitles = new Set();

  // Score popular tasks
  for (const task of POPULAR_SERVICE_TASKS) {
    const titleLower = task.title.toLowerCase();
    let score = 0;

    if (titleLower.startsWith(q)) {
      score += 25;
    } else if (titleLower.includes(q)) {
      score += 15;
    } else {
      let matches = 0;
      for (const tok of tokens) {
        if (titleLower.includes(tok)) matches++;
      }
      if (matches > 0) score += matches * 6;
    }

    // Match category
    if (task.category.toLowerCase().includes(q)) {
      score += 8;
    }

    if (score > 0 && !seenTitles.has(task.title)) {
      seenTitles.add(task.title);
      scored.push({ ...task, score });
    }
  }

  // Also score 18 catalog services directly
  for (const s of HUSTLE_18_SERVICES) {
    const nameLower = s.name.toLowerCase();
    let score = 0;

    if (nameLower.startsWith(q)) {
      score += 22;
    } else if (nameLower.includes(q)) {
      score += 14;
    } else {
      for (const kw of s.keywords) {
        if (kw.toLowerCase().startsWith(q)) {
          score += 12;
          break;
        } else if (kw.toLowerCase().includes(q)) {
          score += 8;
          break;
        }
      }
    }

    const serviceTitle = `${s.name} (${s.description.split(',')[0].trim()})`;
    if (score > 0 && !seenTitles.has(s.name) && !seenTitles.has(serviceTitle)) {
      seenTitles.add(s.name);
      scored.push({
        title: s.name,
        category: s.category,
        serviceId: s.id,
        is18Catalog: true,
        tag: 'Standard 18 Service',
        score
      });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map(({ score, ...item }) => item);
}

/**
 * Get AI-Powered Search Suggestions as user types
 * Uses Gemini 1.5 Flash with fallback to instant local heuristics.
 */
async function getSearchSuggestions(partialQuery, city = 'Bengaluru') {
  if (!partialQuery || !partialQuery.trim()) {
    return [];
  }

  const cleanQuery = partialQuery.trim();
  const suggCacheKey = `sugg:${city}:${cleanQuery.toLowerCase()}`;
  const cached = getCache(suggCacheKey);
  if (cached) return cached;

  const heuristics = getHeuristicSuggestions(cleanQuery);

  // If query is short or heuristic already found high quality catalog matches, return instantly!
  if (cleanQuery.length < 2 || heuristics.length >= 3) {
    setCache(suggCacheKey, heuristics, 1000 * 60 * 60);
    return heuristics;
  }

  const servicesCatalogBrief = HUSTLE_18_SERVICES.map(s => `"${s.name}" (ID: ${s.id}, Category: ${s.category})`).join(', ');

  const prompt = `You are Hustle AI, an intelligent search autocompletion engine for an on-demand service app.
A customer in ${city} is currently typing in the search box: "${cleanQuery}".

Predict and suggest 4 to 5 specific, high-intent, natural service works / tasks that the user is likely searching for.
Our 18 standard catalog services are:
${servicesCatalogBrief}

For each suggestion:
- "title": A clear, concise, actionable service work title (e.g. "Plumbing pipe leak repair", "Split AC jet service", "Wall damp seepage repair", "Balcony bird netting setup")
- "category": Category name (e.g. HOME REPAIR, APPLIANCES, PAINTING, or OPEN POOL)
- "serviceId": Matching service ID from our 18 catalog services, or null if custom
- "is18Catalog": true if it matches one of the 18 catalog services, false otherwise
- "tag": "Standard 18 Service" if is18Catalog is true, otherwise "Custom Pro Work"

Respond ONLY with valid JSON in this exact structure:
{
  "suggestions": [
    {
      "title": "Task title",
      "category": "Category name",
      "serviceId": "id or null",
      "is18Catalog": true,
      "tag": "Standard 18 Service"
    }
  ]
}`;

  try {
    const rawAiText = await callGeminiApi(prompt);
    const parsed = cleanJsonOutput(rawAiText);
    if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      const normalized = parsed.suggestions
        .filter(s => s && typeof s.title === 'string' && s.title.trim().length > 0)
        .map(s => {
          const matched18 = s.serviceId ? HUSTLE_18_SERVICES.find(srv => srv.id === s.serviceId) : null;
          return {
            title: s.title.trim(),
            category: matched18 ? matched18.category : (s.category || 'General Service'),
            serviceId: matched18 ? matched18.id : (s.is18Catalog ? s.serviceId : null),
            is18Catalog: Boolean(matched18 || s.is18Catalog),
            tag: Boolean(matched18 || s.is18Catalog) ? 'Standard 18 Service' : (s.tag || 'Custom Pro Work')
          };
        });

      if (normalized.length > 0) {
        const finalSugg = normalized.slice(0, 5);
        setCache(suggCacheKey, finalSugg, 1000 * 60 * 60);
        return finalSugg;
      }
    }
  } catch (err) {
    console.warn('[Gemini AI] Search suggestions fallback engaged:', err.message);
  }

  setCache(suggCacheKey, heuristics, 1000 * 60 * 30);
  return heuristics;
}

/**
 * Generate Professional Worker Bio
 */
async function generateWorkerBio(workerName, skills = [], experienceYears = 3, city = 'Bengaluru') {
  const name = workerName || 'Professional Partner';
  const skillList = Array.isArray(skills) ? skills.join(', ') : String(skills);

  const prompt = `You are a professional talent profile copywriter for Hustle.
Write an engaging, trustworthy 2-3 sentence bio for a skilled worker named ${name}.
Trades / Skills: ${skillList}.
Experience: ${experienceYears} years.
City: ${city}.
Tone: Punctual, reliable, safety-conscious, and verified.
Do NOT use quotes. Respond with just the bio text.`;

  try {
    const rawAiText = await callGeminiApi(prompt);
    if (rawAiText && rawAiText.trim().length > 20) {
      return {
        success: true,
        bio: rawAiText.trim()
      };
    }
  } catch (err) {
    console.warn('[Gemini AI] Worker bio fallback engaged:', err.message);
  }

  return {
    success: true,
    bio: `Certified ${skillList || 'trade'} specialist with over ${experienceYears} years of hands-on field experience in ${city}. Committed to punctual arrival, transparent communication, and 100% satisfaction on every appointment.`
  };
}

/**
 * Match a worker's custom self-written skill (for workers who chose "Other")
 * against the customer's demanded pool skill using Gemini AI.
 * Returns: { isSimilar: boolean, reason: string, workerSkill: string, demandedSkill: string }
 */
async function matchOtherSkillWithDemand(workerSpecificSkill, demandedSkill) {
  if (!workerSpecificSkill || !demandedSkill) {
    return {
      isSimilar: false,
      reason: 'Missing skill descriptions',
      workerSkill: workerSpecificSkill || '',
      demandedSkill: demandedSkill || ''
    };
  }

  const prompt = `You are Hustle AI Skill Matchmaker for an on-demand services platform.
A customer posted a custom pool appointment with a specific task requirement: "${demandedSkill}".
A verified local gig worker registered with the trade category "Other" and wrote their own specific skill: "${workerSpecificSkill}".

Task: Determine if the worker's registered skill is SIMILAR, RELEVANT, or CAPABLE of performing the customer's demanded need.
Respond with strict JSON only in this format:
{
  "isSimilar": true or false,
  "reason": "Clear concise 1-sentence explanation of why they are similar or why they are unrelated",
  "confidence": 0.0 to 1.0
}

Guidelines:
- Return isSimilar: true if the worker's skill can reasonably perform or specialize in the customer's demanded service (e.g. "Sofa Upholstery & Cushioning" matches "Couch leather fix", "Maths Teacher" matches "Grade 10 Algebra", "Balcony Bird Netting" matches "Pigeon spike setup").
- Return isSimilar: false if the trades are fundamentally unrelated (e.g. "Sofa Upholstery" does NOT match "Plumbing pipe burst", "Yoga Trainer" does NOT match "Solar panel wiring").`;

  const systemInstruction = `You are an AI skill matching engine for local gig trades. Output strict JSON only.`;

  try {
    const rawAi = await callGeminiApi(prompt, systemInstruction);
    let parsed = null;
    const jsonMatch = rawAi.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
    if (parsed && typeof parsed.isSimilar === 'boolean') {
      return {
        isSimilar: parsed.isSimilar,
        reason: parsed.reason || (parsed.isSimilar ? `Worker skill "${workerSpecificSkill}" is suitable for "${demandedSkill}".` : `Worker skill is not suitable for "${demandedSkill}".`),
        confidence: parsed.confidence || 0.9,
        workerSkill: workerSpecificSkill,
        demandedSkill
      };
    }
  } catch (err) {
    console.warn('[Gemini AI] matchOtherSkillWithDemand fallback engaged:', err.message);
  }

  // Fallback matching
  let dbMatch = false;
  try {
    const db = require('./db');
    if (typeof db.skillsApproxMatch === 'function') {
      dbMatch = db.skillsApproxMatch(workerSpecificSkill, demandedSkill);
    }
  } catch {}

  return {
    isSimilar: dbMatch,
    reason: dbMatch
      ? `Worker skill "${workerSpecificSkill}" matches demanded need "${demandedSkill}".`
      : `Worker skill "${workerSpecificSkill}" is not related to "${demandedSkill}".`,
    confidence: dbMatch ? 0.85 : 0.15,
    workerSkill: workerSpecificSkill,
    demandedSkill,
    fallback: true
  };
}

module.exports = {
  diagnoseNeed,
  enhanceScope,
  advisePrice,
  semanticSearch,
  getSearchSuggestions,
  matchAgainst18Services,
  matchOtherSkillWithDemand,
  generateWorkerBio,
  CATEGORY_BENCHMARKS,
  HUSTLE_18_SERVICES,
  POPULAR_SERVICE_TASKS
};


