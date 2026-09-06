const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Otp = require('../models/Otp');
const Booking = require('../models/Booking');
const Ticket = require('../models/Ticket');

let isMongoReady = false;

// Fallback file storage directory & file
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function initLocalStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      otps: [],
      bookings: [],
      tickets: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

function readLocalStore() {
  initLocalStore();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.bookings = parsed.bookings || [];
    parsed.tickets = parsed.tickets || [];
    return parsed;
  } catch (err) {
    console.error('Error reading local db.json, resetting:', err.message);
    return { users: [], otps: [], bookings: [], tickets: [] };
  }
}

function writeLocalStore(data) {
  initLocalStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Synchronize local db.json records into MongoDB Atlas when collections are empty or missing records
 */
async function syncLocalDataToMongo() {
  try {
    const store = readLocalStore();
    if (!store) return;

    // 1. Synchronize Users
    if (Array.isArray(store.users) && store.users.length > 0) {
      const mongoUserCount = await User.countDocuments();
      if (mongoUserCount < store.users.length) {
        console.log(`[Database Sync] Found ${store.users.length} users in db.json (MongoDB has ${mongoUserCount}). Syncing to Atlas...`);
        let importedUsers = 0;
        for (const u of store.users) {
          const cleanEmail = (u.email || '').toLowerCase().trim();
          if (!cleanEmail) continue;
          const exists = await User.findOne({ email: cleanEmail });
          if (!exists) {
            try {
              await User.create({
                name: u.name || 'Hustle User',
                email: cleanEmail,
                phone: u.phone || '9876543210',
                password: u.password || '$2a$10$f/FqnEnHfTj.OgKfSGCr6O4lDkaBe.6KJZWlJH4nZLm5Y5MvZxqpu',
                role: u.role || 'customer',
                approvalStatus: u.approvalStatus || 'pending',
                approvedAt: u.approvedAt ? new Date(u.approvedAt) : null,
                approvedBy: u.approvedBy || '',
                completedJobsCount: Number(u.completedJobsCount) || 0,
                earningsTotal: Number(u.earningsTotal) || 0,
                earningsPending: Number(u.earningsPending) || 0,
                rating: Number(u.rating) || 0,
                ratingCount: Number(u.ratingCount) || 0,
                reviews: Array.isArray(u.reviews) ? u.reviews : [],
                skillCategory: u.skillCategory || '',
                specificSkill: u.specificSkill || '',
                experience: u.experience || '',
                locality: u.locality || '',
                bio: u.bio || '',
                city: u.city || 'Bengaluru',
                customCity: u.customCity || '',
                documentFile: u.documentFile || '',
                supportingDocUrl: u.supportingDocUrl || '',
                documentSize: u.documentSize || '',
                googleId: u.googleId || null,
                lastLogin: u.lastLogin ? new Date(u.lastLogin) : new Date(),
                createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
                updatedAt: u.updatedAt ? new Date(u.updatedAt) : new Date()
              });
              importedUsers++;
            } catch (createErr) {
              console.warn(`[Database Sync] Note importing user ${cleanEmail}:`, createErr.message);
            }
          }
        }
        console.log(`[Database Sync] Users synced to MongoDB Atlas. (Imported ${importedUsers} new records, total now: ${await User.countDocuments()})`);
      }
    }

    // 2. Synchronize Bookings
    if (Array.isArray(store.bookings) && store.bookings.length > 0) {
      const mongoBookingCount = await Booking.countDocuments();
      if (mongoBookingCount < store.bookings.length) {
        console.log(`[Database Sync] Found ${store.bookings.length} bookings in db.json (MongoDB has ${mongoBookingCount}). Syncing to Atlas...`);
        let importedBookings = 0;
        for (const b of store.bookings) {
          const exists = await Booking.findOne({
            customerId: String(b.customerId),
            serviceId: b.serviceId,
            scheduledDate: b.scheduledDate,
            scheduledTime: b.scheduledTime
          });
          if (!exists) {
            try {
              await Booking.create({
                serviceId: b.serviceId || 'service',
                serviceName: b.serviceName || 'Custom Service',
                category: b.category || 'General Help',
                customerId: String(b.customerId || 'cust_1'),
                customerName: b.customerName || 'Customer',
                customerPhone: b.customerPhone || '',
                customerEmail: b.customerEmail || '',
                workerId: b.workerId ? String(b.workerId) : null,
                workerName: b.workerName || 'Open Pool (Any Pro)',
                locality: b.locality || 'Local Area',
                city: b.city || 'Bengaluru',
                declinedWorkerIds: Array.isArray(b.declinedWorkerIds) ? b.declinedWorkerIds : [],
                scheduledDate: b.scheduledDate || '2026-09-10',
                scheduledTime: b.scheduledTime || '10:00 AM',
                notes: b.notes || '',
                price: Number(b.price) || 499,
                status: b.status || 'pending',
                paymentStatus: b.paymentStatus || 'unpaid',
                paidAt: b.paidAt ? new Date(b.paidAt) : null,
                paymentMethod: b.paymentMethod || '',
                rating: b.rating ? Number(b.rating) : null,
                reviewText: b.reviewText || '',
                reviewedAt: b.reviewedAt ? new Date(b.reviewedAt) : null,
                negotiations: Array.isArray(b.negotiations) ? b.negotiations : [],
                createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
                updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
              });
              importedBookings++;
            } catch (createErr) {
              console.warn(`[Database Sync] Note importing booking ${b.serviceName}:`, createErr.message);
            }
          }
        }
        console.log(`[Database Sync] Bookings synced to MongoDB Atlas. (Imported ${importedBookings} new records, total now: ${await Booking.countDocuments()})`);
      }
    }
  } catch (syncErr) {
    console.warn('[Database Sync] Warning during data synchronization:', syncErr.message);
  }
}

/**
 * Connect to MongoDB with graceful error handling and fallback
 */
async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hustle';
  try {
    const isAtlas = mongoUri.includes('mongodb.net');
    console.log(`[Database] Attempting connection to ${isAtlas ? 'MongoDB Atlas' : 'MongoDB'} at: ${mongoUri.replace(/:([^:@]{4})[^:@]*@/, ':****@')}`);
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });
    isMongoReady = true;
    console.log(`[Database] Successfully connected to ${isAtlas ? 'MongoDB Atlas (Cloud Cluster)' : 'MongoDB'}.`);
    // Synchronize existing local records to MongoDB Atlas if needed
    await syncLocalDataToMongo();
  } catch (err) {
    isMongoReady = false;
    console.warn(`[Database] MongoDB not reachable (${err.message}). Using persistent backend file database at /data/db.json.`);
    initLocalStore();
  }

  // Handle connection events
  mongoose.connection.on('connected', () => {
    isMongoReady = true;
  });
  mongoose.connection.on('disconnected', () => {
    isMongoReady = false;
  });
}

/**
 * Find user by email (case-insensitive)
 */
async function findUserByEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  if (isMongoReady) {
    try {
      return await User.findOne({ email: cleanEmail });
    } catch (err) {
      console.error('Mongo findUserByEmail error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.users.find(u => (u.email || '').toLowerCase() === cleanEmail) || null;
}

/**
 * Find user by phone
 */
async function findUserByPhone(phone) {
  const cleanPhone = (phone || '').trim();
  if (!cleanPhone) return null;

  if (isMongoReady) {
    try {
      return await User.findOne({ phone: cleanPhone });
    } catch (err) {
      console.error('Mongo findUserByPhone error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.users.find(u => (u.phone || '').trim() === cleanPhone) || null;
}

/**
 * Find user by email or phone (used in Sign In)
 */
async function findUserByIdentifier(identifier) {
  const clean = (identifier || '').trim();
  if (!clean) return null;

  if (isMongoReady) {
    try {
      return await User.findOne({
        $or: [
          { email: clean.toLowerCase() },
          { phone: clean }
        ]
      });
    } catch (err) {
      console.error('Mongo findUserByIdentifier error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.users.find(u => 
    (u.email || '').toLowerCase() === clean.toLowerCase() ||
    (u.phone || '').trim() === clean
  ) || null;
}

/**
 * Find user by ID
 */
async function findUserById(id) {
  if (!id) return null;

  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const found = await User.findById(id);
        if (found) return found;
      }
      return await User.findOne({ _id: id });
    } catch (err) {
      console.error('Mongo findUserById error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.users.find(u => String(u._id || u.id) === String(id)) || null;
}

/**
 * Create a new user
 */
async function createUser(userData) {
  if (isMongoReady) {
    try {
      const user = new User(userData);
      await user.save();
      return user;
    } catch (err) {
      console.error('Mongo createUser error:', err.message);
      throw err;
    }
  }

  const store = readLocalStore();
  const newUser = {
    _id: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    ...userData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.users.push(newUser);
  writeLocalStore(store);
  return newUser;
}

/**
 * Update a user's fields
 */
async function updateUser(id, updates) {
  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const updated = await User.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true });
        if (updated) return updated;
      }
      return await User.findOneAndUpdate({ _id: id }, { ...updates, updatedAt: new Date() }, { new: true });
    } catch (err) {
      console.error('Mongo updateUser error:', err.message);
    }
  }

  const store = readLocalStore();
  const idx = store.users.findIndex(u => String(u._id || u.id) === String(id));
  if (idx !== -1) {
    store.users[idx] = {
      ...store.users[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeLocalStore(store);
    return store.users[idx];
  }
  return null;
}

/**
 * Delete a user by ID
 */
async function deleteUser(id) {
  if (!id) return false;

  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const res = await User.findByIdAndDelete(id);
        if (res) return true;
      }
      const res = await User.findOneAndDelete({ _id: id });
      return !!res;
    } catch (err) {
      console.error('Mongo deleteUser error:', err.message);
    }
  }

  const store = readLocalStore();
  const initialLen = store.users.length;
  store.users = store.users.filter(u => String(u._id || u.id) !== String(id));
  if (store.users.length !== initialLen) {
    writeLocalStore(store);
    return true;
  }
  return false;
}

/**
 * Create and save OTP
 */
async function createOtp(identifier, otpCode, type = 'reset_password', ttlMinutes = 10) {
  const cleanId = (identifier || '').trim().toLowerCase();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  if (isMongoReady) {
    try {
      const otp = new Otp({
        identifier: cleanId,
        otp: otpCode,
        type,
        expiresAt
      });
      await otp.save();
      return otp;
    } catch (err) {
      console.error('Mongo createOtp error:', err.message);
    }
  }

  const store = readLocalStore();
  const newOtp = {
    _id: 'otp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    identifier: cleanId,
    otp: otpCode,
    type,
    used: false,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString()
  };
  store.otps.push(newOtp);
  writeLocalStore(store);
  return newOtp;
}

/**
 * Find valid unexpired, unused OTP
 */
async function findValidOtp(identifier, otpCode, type = 'reset_password') {
  const cleanId = (identifier || '').trim().toLowerCase();
  const now = new Date();

  if (isMongoReady) {
    try {
      return await Otp.findOne({
        identifier: cleanId,
        otp: String(otpCode).trim(),
        type,
        used: false,
        expiresAt: { $gt: now }
      });
    } catch (err) {
      console.error('Mongo findValidOtp error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.otps.find(o => 
    (o.identifier || '').toLowerCase() === cleanId &&
    String(o.otp).trim() === String(otpCode).trim() &&
    o.type === type &&
    !o.used &&
    new Date(o.expiresAt) > now
  ) || null;
}

/**
 * Mark OTP as used
 */
async function markOtpUsed(otpId) {
  if (!otpId) return;

  if (isMongoReady) {
    try {
      await Otp.findByIdAndUpdate(otpId, { used: true });
      return;
    } catch (err) {
      console.error('Mongo markOtpUsed error:', err.message);
    }
  }

  const store = readLocalStore();
  const otp = store.otps.find(o => String(o._id || o.id) === String(otpId));
  if (otp) {
    otp.used = true;
    writeLocalStore(store);
  }
}

/**
 * Find users by role (e.g. 'worker')
 */
async function findUsersByRole(role) {
  if (isMongoReady) {
    try {
      return await User.find({ role }).sort({ createdAt: -1 });
    } catch (err) {
      console.error('Mongo findUsersByRole error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.users.filter(u => u.role === role);
}

/**
 * Service Catalog to Skill Keywords Mapping
 */
const SERVICE_SKILL_MAP = {
  'home-cleaning': ['home-cleaning', 'home care', 'cleaning', 'deep clean', 'housekeeping'],
  'spa-therapy': ['spa-therapy', 'spa', 'massage', 'wellness', 'beauty', 'therapist'],
  'maths-tutoring': ['maths-tutoring', 'maths', 'tutoring', 'academic', 'teacher', 'science tutor', 'tutor'],
  'handyman': ['handyman', 'home repair', 'general repair', 'repairs', 'maintenance'],
  'electrician': ['electrician', 'electrical', 'wiring', 'mcb', 'inverter'],
  'plumbing': ['plumbing', 'plumber', 'pipe', 'leak', 'fittings'],
  'carpentry': ['carpentry', 'carpenter', 'wood', 'furniture', 'assembly'],
  'babysitting': ['babysitting', 'childcare', 'nanny', 'kids'],
  'pet-care': ['pet-care', 'pet sitting', 'dog walking', 'dog', 'pet'],
  'home-organisation': ['home-organisation', 'organising', 'organizer', 'declutter'],
  'tech-help': ['tech-help', 'tech support', 'laptop', 'wifi', 'computer', 'network'],
  'garden-care': ['garden-care', 'garden', 'gardener', 'plant', 'lawn'],
  'appliances': ['appliances', 'appliance care', 'ac repair', 'refrigerator', 'washing machine', 'appliance'],
  'painting': ['painting', 'painter', 'waterproofing', 'wall paint'],
  'fitness': ['fitness', 'yoga', 'trainer', 'gym', 'workout', 'coaching'],
  'auto-care': ['auto-care', 'car detailing', 'car wash', 'auto', 'vehicle'],
  'pest-control': ['pest-control', 'pest', 'sanitization', 'disinfection', 'termites'],
  'senior-care': ['senior-care', 'elder care', 'senior', 'companion', 'elderly', 'assistance']
};

/**
 * The 8 Primary Canonical Cities with geographic coordinates and aliases
 */
const CANONICAL_CITIES = {
  'kolkata': {
    name: 'Kolkata',
    lat: 22.5726,
    lng: 88.3639,
    aliases: ['kolkata', 'calcutta', 'howrah', 'salt lake', 'new town', 'ballygunge', 'gariahath', 'jadavpur', 'dum dum', 'behala', 'tollygunge', 'alipore', 'park street', 'rajarhat']
  },
  'bengaluru': {
    name: 'Bengaluru',
    lat: 12.9716,
    lng: 77.5946,
    aliases: ['bengaluru', 'bangalore', 'whitefield', 'indiranagar', 'koramangala', 'hsr', 'bellandur', 'jayanagar', 'jp nagar', 'electronic city', 'btm', 'marathahalli', 'malleshwaram']
  },
  'chennai': {
    name: 'Chennai',
    lat: 13.0827,
    lng: 80.2707,
    aliases: ['chennai', 'madras', 'adyar', 't nagar', 'anna nagar', 'velachery', 'mylapore', 'omr', 'nungambakkam', 'besant nagar', 'guindy', 'kilpauk', 'alwarpet']
  },
  'mumbai': {
    name: 'Mumbai',
    lat: 19.0760,
    lng: 72.8777,
    aliases: ['mumbai', 'bombay', 'thane', 'navi mumbai', 'bandra', 'andheri', 'juhu', 'worli', 'dadar', 'borivali', 'powai', 'kandivali', 'vashi', 'lower parel', 'khar']
  },
  'delhi': {
    name: 'Delhi',
    lat: 28.7041,
    lng: 77.1025,
    aliases: ['delhi', 'new delhi', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad', 'rohini', 'lajpat nagar', 'dwarka', 'south ex', 'hauz khas', 'saket', 'pitampura', 'mayur vihar']
  },
  'hyderabad': {
    name: 'Hyderabad',
    lat: 17.3850,
    lng: 78.4867,
    aliases: ['hyderabad', 'secunderabad', 'cyberabad', 'gachibowli', 'madhapur', 'hitec city', 'kondapur', 'banjara hills', 'jubilee hills', 'kukatpally', 'begumpet', 'miyapur']
  },
  'ahmedabad': {
    name: 'Ahmedabad',
    lat: 23.0225,
    lng: 72.5714,
    aliases: ['ahmedabad', 'ahmadabad', 'gandhinagar', 'satellite', 'bodakdev', 'vastrapur', 'prahlad nagar', 'maninagar', 'sg highway', 'bopal', 'navrangpura', 'paldi']
  },
  'pune': {
    name: 'Pune',
    lat: 18.5204,
    lng: 73.8567,
    aliases: ['pune', 'poona', 'pcmc', 'pimpri', 'chinchwad', 'hinjewadi', 'hinjawadi', 'kothrud', 'viman nagar', 'baner', 'aundh', 'wakad', 'koregaon park', 'hadapsar', 'magarpatta']
  }
};

/**
 * Haversine formula to compute great-circle distance between two points in km
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resolve canonical city and radius estimation
 */
function resolveCityFromLocation(query, coords = null) {
  // 1. If GPS coordinates provided, find closest canonical city
  if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
    let closestCity = null;
    let minDistance = Infinity;
    for (const key in CANONICAL_CITIES) {
      const cityObj = CANONICAL_CITIES[key];
      const dist = calculateDistanceKm(coords.lat, coords.lng, cityObj.lat, cityObj.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestCity = cityObj.name;
      }
    }
    // If within 80km radius, map to that city
    if (minDistance <= 80) {
      return { city: closestCity, canonicalCity: closestCity, isSupported: true, distanceKm: Math.round(minDistance) };
    }
  }

  // 2. Query text match
  if (query && typeof query === 'string') {
    const q = query.toLowerCase().trim();
    for (const key in CANONICAL_CITIES) {
      const cityObj = CANONICAL_CITIES[key];
      if (cityObj.aliases.some(a => q.includes(a))) {
        return { city: cityObj.name, canonicalCity: cityObj.name, isSupported: true, distanceKm: 0 };
      }
    }
    // Custom user typed city outside the 8
    const cleaned = query.split(',')[0].trim();
    if (cleaned && cleaned.toLowerCase() !== 'choose location') {
      return { city: cleaned, canonicalCity: cleaned, isSupported: false, distanceKm: null };
    }
  }

  return { city: 'Bengaluru', canonicalCity: 'Bengaluru', isSupported: true, distanceKm: 0 };
}

/**
 * Pre-assigned verified specialists for demonstration across the 8 primary cities.
 * Distinct local names, ratings, local areas, and rates.
 */
const PRE_ASSIGNED_WORKERS = [
  // --- KOLKATA ---
  {
    id: 'pro_ccu_elec_1',
    name: 'Subhashis Banerjee',
    city: 'Kolkata',
    locality: 'Salt Lake & New Town',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'MCB switches, inverter cabling & 3-phase wiring',
    experience: '7 years',
    baseRate: 349,
    rating: 4.95,
    completedJobs: 138,
    bio: 'Government-certified wireman with 7 years serving Salt Lake and Rajarhat households.'
  },
  {
    id: 'pro_ccu_clean_1',
    name: 'Priya Sen',
    city: 'Kolkata',
    locality: 'Park Street & Ballygunge',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Degreasing kitchens & deep sanitization',
    experience: '5 years',
    baseRate: 699,
    rating: 4.92,
    completedJobs: 215,
    bio: 'Eco-friendly deep cleaning specialist with industrial steaming equipment.'
  },
  {
    id: 'pro_ccu_plumb_1',
    name: 'Anirban Das',
    city: 'Kolkata',
    locality: 'Gariahat & Jadavpur',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'Concealed pipe leakages & bathroom fittings',
    experience: '9 years',
    baseRate: 349,
    rating: 4.88,
    completedJobs: 142,
    bio: 'Senior plumber known for quick 30-min arrival in South Kolkata.'
  },
  {
    id: 'pro_ccu_appliance_1',
    name: 'Debojyoti Ghosh',
    city: 'Kolkata',
    locality: 'Howrah & Behala',
    skillCategory: 'AC, Fridge & Appliance Repair',
    specificSkill: 'Split AC jet cleaning & inverter compressor fixes',
    experience: '8 years',
    baseRate: 449,
    rating: 4.90,
    completedJobs: 174,
    bio: 'Former authorized Daikin/LG service technician with genuine OEM spare parts.'
  },
  {
    id: 'pro_ccu_tutor_1',
    name: 'Sharmistha Mukherjee',
    city: 'Kolkata',
    locality: 'South City & Tollygunge',
    skillCategory: 'Maths & Science Tutoring',
    specificSkill: 'ICSE & CBSE Class 8–12 Board preparation',
    experience: '6 years',
    baseRate: 1299,
    rating: 5.0,
    completedJobs: 86,
    bio: 'M.Sc. Mathematics with verified 100% first-division student track record.'
  },
  {
    id: 'pro_ccu_carp_1',
    name: 'Ratan Mondal',
    city: 'Kolkata',
    locality: 'Dum Dum & Lake Town',
    skillCategory: 'Custom Carpentry & Woodwork',
    specificSkill: 'Modular wardrobe installation & teak wood restoration',
    experience: '11 years',
    baseRate: 499,
    rating: 4.89,
    completedJobs: 160,
    bio: 'Master craftsman specializing in modern minimalist plywood and laminate designs.'
  },
  {
    id: 'pro_ccu_spa_1',
    name: 'Tanusree Roy',
    city: 'Kolkata',
    locality: 'Alipore & Hastings',
    skillCategory: 'Spa, Massage & Grooming',
    specificSkill: 'Aromatherapy & Swedish relaxation therapy',
    experience: '6 years',
    baseRate: 1199,
    rating: 4.97,
    completedJobs: 145,
    bio: 'Certified wellness aesthetician bringing hygienic, salon-grade treatments home.'
  },
  {
    id: 'pro_ccu_tech_1',
    name: 'Biswajit Paul',
    city: 'Kolkata',
    locality: 'Sector V & New Town',
    skillCategory: 'Laptop & Wi-Fi Tech Support',
    specificSkill: 'Mac/Windows SSD upgrades, mesh Wi-Fi & data recovery',
    experience: '5 years',
    baseRate: 399,
    rating: 4.93,
    completedJobs: 128,
    bio: 'Hardware diagnostician solving complex networking and thermal throttling issues.'
  },

  // --- BENGALURU ---
  {
    id: 'pro_blr_elec_1',
    name: 'Ramesh Kumar',
    city: 'Bengaluru',
    locality: 'Indiranagar & Koramangala',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Home wiring, inverter setup & MCB installation',
    experience: '7 years',
    baseRate: 299,
    rating: 4.94,
    completedJobs: 182,
    bio: 'Top-rated Indiranagar electrical contractor with 24/7 emergency response.'
  },
  {
    id: 'pro_blr_handy_1',
    name: 'Manjunath Gowda',
    city: 'Bengaluru',
    locality: 'HSR Layout & Bellandur',
    skillCategory: 'Furniture Assembly & Handyman',
    specificSkill: 'IKEA furniture assembly, TV wall mounts & curtain rods',
    experience: '5 years',
    baseRate: 349,
    rating: 4.91,
    completedJobs: 210,
    bio: 'Laser-level precision mounting and flat-pack assembly pro.'
  },
  {
    id: 'pro_blr_clean_1',
    name: 'Kavitha Reddy',
    city: 'Bengaluru',
    locality: 'Whitefield & Marathahalli',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Full villa deep scrubbing & bathroom descaling',
    experience: '6 years',
    baseRate: 699,
    rating: 4.88,
    completedJobs: 195,
    bio: 'Specialist in apartment move-in cleanings and herbal sanitization.'
  },
  {
    id: 'pro_blr_plumb_1',
    name: 'Suresh Babu',
    city: 'Bengaluru',
    locality: 'Jayanagar & JP Nagar',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'Geyser connections, RO water purifier fitting & sewer snaking',
    experience: '8 years',
    baseRate: 349,
    rating: 4.92,
    completedJobs: 165,
    bio: 'Reliable South Bengaluru plumber with heavy-duty diagnostic snake cameras.'
  },
  {
    id: 'pro_blr_fit_1',
    name: 'Deepa Hegde',
    city: 'Bengaluru',
    locality: 'Malleshwaram & Sadashivanagar',
    skillCategory: 'Yoga & Fitness Coaching',
    specificSkill: 'Hatha yoga, posture alignment & core strength',
    experience: '5 years',
    baseRate: 799,
    rating: 5.0,
    completedJobs: 92,
    bio: 'Ayush-certified yoga instructor focusing on chronic back pain and flexibility.'
  },
  {
    id: 'pro_blr_tech_1',
    name: 'Karthik V',
    city: 'Bengaluru',
    locality: 'Electronic City & BTM Layout',
    skillCategory: 'Laptop & Wi-Fi Tech Support',
    specificSkill: 'Dual-band Wi-Fi routing, OS reinstalls & custom desktop builds',
    experience: '4 years',
    baseRate: 399,
    rating: 4.96,
    completedJobs: 154,
    bio: 'Tech enthusiast providing doorstep IT troubleshooting for work-from-home setups.'
  },

  // --- MUMBAI ---
  {
    id: 'pro_bom_elec_1',
    name: 'Sachin Sawant',
    city: 'Mumbai',
    locality: 'Dadar & Worli',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Marine-grade wiring, meter boxes & switchboards',
    experience: '8 years',
    baseRate: 349,
    rating: 4.93,
    completedJobs: 172,
    bio: 'Specialist in high-rise coastal electrical protection and surge suppressors.'
  },
  {
    id: 'pro_bom_appliance_1',
    name: 'Farhan Ansari',
    city: 'Mumbai',
    locality: 'Bandra & Khar',
    skillCategory: 'AC, Fridge & Appliance Repair',
    specificSkill: 'Inverter PCB repair, gas charging & commercial chillers',
    experience: '9 years',
    baseRate: 499,
    rating: 4.95,
    completedJobs: 230,
    bio: 'Quick 20-minute Bandra response for AC cooling drop and gas leakages.'
  },
  {
    id: 'pro_bom_clean_1',
    name: 'Sneha Patil',
    city: 'Mumbai',
    locality: 'Andheri West & Juhu',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Sea-breeze damp cleaning & modular kitchen restoration',
    experience: '6 years',
    baseRate: 749,
    rating: 4.87,
    completedJobs: 185,
    bio: 'Professional cleaning crew with eco-certified disinfectants and HEPA vacuums.'
  },
  {
    id: 'pro_bom_plumb_1',
    name: 'Rajesh Sharma',
    city: 'Mumbai',
    locality: 'Borivali & Kandivali',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'High-pressure booster pumps & drain unclogging',
    experience: '7 years',
    baseRate: 399,
    rating: 4.90,
    completedJobs: 140,
    bio: 'Equipped with electric rotary drain machines for instant high-rise unclogging.'
  },
  {
    id: 'pro_bom_spa_1',
    name: 'Rohini Deshmukh',
    city: 'Mumbai',
    locality: 'Powai & Vikhroli',
    skillCategory: 'Spa, Massage & Grooming',
    specificSkill: 'Deep tissue therapy & Ayurvedic herbal treatments',
    experience: '6 years',
    baseRate: 1299,
    rating: 5.0,
    completedJobs: 130,
    bio: 'Trained therapist bringing 5-star spa quality and disposable hygiene kits.'
  },
  {
    id: 'pro_bom_auto_1',
    name: 'Amit Kadam',
    city: 'Mumbai',
    locality: 'Thane & Mulund',
    skillCategory: 'Car & Two-Wheeler Care',
    specificSkill: 'Doorstep waterless detailing & interior steam disinfection',
    experience: '5 years',
    baseRate: 499,
    rating: 4.91,
    completedJobs: 110,
    bio: 'Mobile detailing van with pressurized steam and ceramic coating touchups.'
  },

  // --- DELHI ---
  {
    id: 'pro_del_handy_1',
    name: 'Harpreet Singh',
    city: 'Delhi',
    locality: 'Lajpat Nagar & South Extension',
    skillCategory: 'Furniture Assembly & Handyman',
    specificSkill: 'Heavy furniture assembly, door locks & drywall fixing',
    experience: '8 years',
    baseRate: 399,
    rating: 4.94,
    completedJobs: 190,
    bio: 'Friendly South Delhi handyman equipped with all heavy-duty Bosch power tools.'
  },
  {
    id: 'pro_del_elec_1',
    name: 'Virender Kumar',
    city: 'Delhi',
    locality: 'Rohini & Pitampura',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Phase shifting, heavy geyser wiring & LED panel installation',
    experience: '7 years',
    baseRate: 299,
    rating: 4.88,
    completedJobs: 165,
    bio: 'Fast North Delhi electrician solving tripping MCBs and voltage fluctuations.'
  },
  {
    id: 'pro_del_clean_1',
    name: 'Sunita Verma',
    city: 'Delhi',
    locality: 'Dwarka & Janakpuri',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Festive deep cleaning, chimney & bathroom scrub',
    experience: '6 years',
    baseRate: 699,
    rating: 4.91,
    completedJobs: 180,
    bio: 'Thorough West Delhi home care with 100% satisfaction guarantee.'
  },
  {
    id: 'pro_del_appliance_1',
    name: 'Mohd. Tariq',
    city: 'Delhi',
    locality: 'Mayur Vihar & Noida',
    skillCategory: 'AC, Fridge & Appliance Repair',
    specificSkill: 'Inverter AC repair, gas charging & double-door fridge repair',
    experience: '10 years',
    baseRate: 449,
    rating: 4.95,
    completedJobs: 215,
    bio: 'Master HVAC pro with 10 years experience across East Delhi & NCR.'
  },
  {
    id: 'pro_del_tutor_1',
    name: 'Dr. Nidhi Bansal',
    city: 'Delhi',
    locality: 'Hauz Khas & Vasant Kunj',
    skillCategory: 'Maths & Science Tutoring',
    specificSkill: 'CBSE Class 9–12 Physics & Advanced Calculus',
    experience: '6 years',
    baseRate: 1499,
    rating: 5.0,
    completedJobs: 104,
    bio: 'PhD scholar offering conceptual STEM clarity and personalized worksheets.'
  },
  {
    id: 'pro_del_paint_1',
    name: 'Jagdish Chander',
    city: 'Delhi',
    locality: 'Connaught Place & Karol Bagh',
    skillCategory: 'Wall Painting & Waterproofing',
    specificSkill: 'Asian Paints Royal luxury finish & terrace damp sealing',
    experience: '12 years',
    baseRate: 999,
    rating: 4.92,
    completedJobs: 135,
    bio: 'Precision spray painter with dust-free sanding machines.'
  },

  // --- CHENNAI ---
  {
    id: 'pro_maa_elec_1',
    name: 'Murugan Natarajan',
    city: 'Chennai',
    locality: 'T. Nagar & Mylapore',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Inverter battery setup & 3-phase wiring',
    experience: '9 years',
    baseRate: 299,
    rating: 4.95,
    completedJobs: 188,
    bio: 'Licensed electrician with 9 years of trusted service in Central Chennai.'
  },
  {
    id: 'pro_maa_org_1',
    name: 'S. Meenakshi',
    city: 'Chennai',
    locality: 'Adyar & Besant Nagar',
    skillCategory: 'Wardrobe & Home Organisation',
    specificSkill: 'Minimalist kitchen layout & closet compartmentalization',
    experience: '5 years',
    baseRate: 699,
    rating: 4.93,
    completedJobs: 152,
    bio: 'Transforming chaotic wardrobes and kitchen pantries into serene order.'
  },
  {
    id: 'pro_maa_plumb_1',
    name: 'K. Saravanan',
    city: 'Chennai',
    locality: 'Anna Nagar & Kilpauk',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'Overhead sump tank automation & PVC pipeline fittings',
    experience: '7 years',
    baseRate: 349,
    rating: 4.89,
    completedJobs: 145,
    bio: 'Specialist in sensor float valves, water motor repairs, and tap fittings.'
  },
  {
    id: 'pro_maa_appliance_1',
    name: 'R. Balaji',
    city: 'Chennai',
    locality: 'Velachery & OMR',
    skillCategory: 'AC, Fridge & Appliance Repair',
    specificSkill: 'High-humidity anti-rust AC coating & front-load washer fixes',
    experience: '8 years',
    baseRate: 399,
    rating: 4.94,
    completedJobs: 198,
    bio: 'Anti-corrosion specialist tackling coastal coil leaks and sensor boards.'
  },
  {
    id: 'pro_maa_tutor_1',
    name: 'Revathi Sundaram',
    city: 'Chennai',
    locality: 'Nungambakkam',
    skillCategory: 'Maths & Science Tutoring',
    specificSkill: 'CBSE & Samacheer Kalvi Maths for Class 8–12',
    experience: '6 years',
    baseRate: 1399,
    rating: 5.0,
    completedJobs: 82,
    bio: 'Patient mentor making advanced trigonometry and algebra intuitive.'
  },

  // --- HYDERABAD ---
  {
    id: 'pro_hyd_elec_1',
    name: 'Venkat Rao',
    city: 'Hyderabad',
    locality: 'Gachibowli & Madhapur',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Smart home automation, UPS inverter installation',
    experience: '7 years',
    baseRate: 299,
    rating: 4.93,
    completedJobs: 168,
    bio: 'Trusted Hitec City technician for high-rise apartments and villa communities.'
  },
  {
    id: 'pro_hyd_plumb_1',
    name: 'Syed Khaleel',
    city: 'Hyderabad',
    locality: 'Banjara Hills & Jubilee Hills',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'Concealed shower valves, pressure pumps & CP fittings',
    experience: '8 years',
    baseRate: 349,
    rating: 4.94,
    completedJobs: 180,
    bio: 'Luxury bathroom fittings and zero-breakage leak detection pro.'
  },
  {
    id: 'pro_hyd_clean_1',
    name: 'Fatima Begum',
    city: 'Hyderabad',
    locality: 'Kondapur & Hitec City',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Floor buffing, tile grouting cleaning & deep dusting',
    experience: '5 years',
    baseRate: 699,
    rating: 4.88,
    completedJobs: 156,
    bio: 'Professional team specializing in tech corridor gated communities.'
  },
  {
    id: 'pro_hyd_appliance_1',
    name: 'Srinivasulu Reddy',
    city: 'Hyderabad',
    locality: 'Kukatpally & Miyapur',
    skillCategory: 'AC, Fridge & Appliance Repair',
    specificSkill: 'Split AC indoor/outdoor jet wash & inverter fridge repair',
    experience: '7 years',
    baseRate: 449,
    rating: 4.92,
    completedJobs: 190,
    bio: 'Certified technician with genuine copper piping and 90-day warranty.'
  },
  {
    id: 'pro_hyd_tech_1',
    name: 'Prashanth Kumar',
    city: 'Hyderabad',
    locality: 'Secunderabad & Begumpet',
    skillCategory: 'Laptop & Wi-Fi Tech Support',
    specificSkill: 'Gaming PC builds, thermal repasting & router bridging',
    experience: '5 years',
    baseRate: 399,
    rating: 5.0,
    completedJobs: 122,
    bio: 'Fast doorstep turnaround for all hardware and software diagnostics.'
  },

  // --- AHMEDABAD ---
  {
    id: 'pro_amd_elec_1',
    name: 'Bhavesh Patel',
    city: 'Ahmedabad',
    locality: 'Navrangpura & Satellite',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Single & three-phase wiring, LED fixtures & inverter maintenance',
    experience: '7 years',
    baseRate: 299,
    rating: 4.92,
    completedJobs: 150,
    bio: 'Punctual Navrangpura electrician with over 150 verified West Ahmedabad visits.'
  },
  {
    id: 'pro_amd_plumb_1',
    name: 'Jignesh Shah',
    city: 'Ahmedabad',
    locality: 'Bodakdev & Thaltej',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'Tap leak repair, pipeline replacement & water tank cleaning',
    experience: '6 years',
    baseRate: 349,
    rating: 4.88,
    completedJobs: 135,
    bio: 'Equipped with pressure jetters for spotless underground drainage lines.'
  },
  {
    id: 'pro_amd_clean_1',
    name: 'Hina Prajapati',
    city: 'Ahmedabad',
    locality: 'Vastrapur & Prahlad Nagar',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Kitchen oil stain removal & window glass sparkle cleaning',
    experience: '5 years',
    baseRate: 649,
    rating: 4.93,
    completedJobs: 168,
    bio: 'Detailed cleaning with hospital-grade sanitizers and non-toxic formulas.'
  },
  {
    id: 'pro_amd_appliance_1',
    name: 'Chirag Dave',
    city: 'Ahmedabad',
    locality: 'Maninagar & Paldi',
    skillCategory: 'AC, Fridge & Appliance Repair',
    specificSkill: 'AC summer gas top-up & washing machine drum repair',
    experience: '8 years',
    baseRate: 399,
    rating: 4.94,
    completedJobs: 182,
    bio: 'Prompt Maninagar appliance doctor offering same-day visit guarantees.'
  },

  // --- PUNE ---
  {
    id: 'pro_pnq_elec_1',
    name: 'Dnyaneshwar More',
    city: 'Pune',
    locality: 'Kothrud & Karve Nagar',
    skillCategory: 'Electrician & Wiring Repairs',
    specificSkill: 'Society wiring, inverter installations & earthing tests',
    experience: '8 years',
    baseRate: 299,
    rating: 4.95,
    completedJobs: 178,
    bio: 'Senior wireman with licensed government certification serving Kothrud.'
  },
  {
    id: 'pro_pnq_plumb_1',
    name: 'Nilesh Gokhale',
    city: 'Pune',
    locality: 'Viman Nagar & Kalyani Nagar',
    skillCategory: 'Plumbing & Drainage Fixing',
    specificSkill: 'Solar water heater plumbing & Jaguar tap repairs',
    experience: '7 years',
    baseRate: 349,
    rating: 4.91,
    completedJobs: 160,
    bio: 'East Pune plumbing specialist for solar lines, geysers, and flush tanks.'
  },
  {
    id: 'pro_pnq_clean_1',
    name: 'Vandana Kadam',
    city: 'Pune',
    locality: 'Baner & Aundh',
    skillCategory: 'Deep Home & Kitchen Cleaning',
    specificSkill: 'Balcony pressure wash & kitchen grease removal',
    experience: '6 years',
    baseRate: 699,
    rating: 4.89,
    completedJobs: 185,
    bio: 'Thorough Baner home cleaning service trusted by working professionals.'
  },
  {
    id: 'pro_pnq_handy_1',
    name: 'Rahul Shinde',
    city: 'Pune',
    locality: 'Wakad & Hinjawadi',
    skillCategory: 'Furniture Assembly & Handyman',
    specificSkill: 'Workstation setup, bookshelf assembly & curtain rods',
    experience: '5 years',
    baseRate: 449,
    rating: 4.93,
    completedJobs: 130,
    bio: 'Hinjawadi IT corridor favorite for rapid apartment setups and fixtures.'
  },
  {
    id: 'pro_pnq_spa_1',
    name: 'Swati Joshi',
    city: 'Pune',
    locality: 'Koregaon Park & Kalyani Nagar',
    skillCategory: 'Spa, Massage & Grooming',
    specificSkill: 'Therapeutic head massage, pedicures & skin facials',
    experience: '5 years',
    baseRate: 1199,
    rating: 5.0,
    completedJobs: 115,
    bio: 'Premium aesthetician bringing sterile, sealed salon kits right to your door.'
  }
];

/**
 * Find approved workers matching a service and specific city / location.
 * Implements AI radius approximation for nearby metropolitan hubs and custom locations.
 */
async function findWorkersByService(serviceId, cityQuery = null, coords = null) {
  const sId = (serviceId || '').toLowerCase().trim();
  const keywords = SERVICE_SKILL_MAP[sId] || [sId];

  // 1. Resolve canonical city and distance
  const locationResolution = resolveCityFromLocation(cityQuery, coords);
  const targetCity = locationResolution.city;
  const isSupportedCity = locationResolution.isSupported;

  // 2. Fetch all database workers
  const allDbWorkers = await findUsersByRole('worker');
  const approvedDbWorkers = allDbWorkers.filter(w => w.approvalStatus === 'approved');

  // Filter db workers for this city
  const cityDbWorkers = approvedDbWorkers.filter(w => {
    const wCity = (w.city || '').toLowerCase().trim();
    const wLoc = (w.locality || '').toLowerCase().trim();
    const tCity = targetCity.toLowerCase().trim();
    if (!wCity && !wLoc) return false;
    if (wCity && (wCity === tCity || (wCity.length > 2 && tCity.includes(wCity)) || (tCity.length > 2 && wCity.includes(tCity)))) {
      return true;
    }
    if (wLoc && tCity.length > 2 && wLoc.includes(tCity)) {
      return true;
    }
    return false;
  });

  // Filter pre-assigned workers for this city
  const cityPreAssigned = PRE_ASSIGNED_WORKERS.filter(w => {
    return w.city.toLowerCase() === targetCity.toLowerCase();
  });

  // Combine both pools for this city
  const combinedCityWorkers = [...cityDbWorkers, ...cityPreAssigned];

  // If outside the 8 cities and NO worker has registered in that custom city:
  if (!isSupportedCity && combinedCityWorkers.length === 0) {
    return {
      serviceId: sId,
      city: targetCity,
      exactMatch: false,
      noCoverage: true,
      distanceKm: locationResolution.distanceKm,
      message: `Sorry! Currently no workers available in ${targetCity}. We are rapidly expanding across India! You can post a custom service request to the open gig pool, or if a local pro registers in ${targetCity}, they will become instantly available.`,
      workers: [],
      similar: []
    };
  }

  // 3. Find exact matching workers for this service in this city
  const exactMatches = combinedCityWorkers.filter(w => {
    const cat = (w.skillCategory || '').toLowerCase();
    const spec = (w.specificSkill || '').toLowerCase();
    return keywords.some(k => cat.includes(k) || spec.includes(k) || sId.includes(cat));
  });

  if (exactMatches.length > 0) {
    return {
      serviceId: sId,
      city: targetCity,
      exactMatch: true,
      noCoverage: false,
      workers: exactMatches,
      similar: []
    };
  }

  // 4. Similar / cross-trained workers in this city
  const similarMatches = combinedCityWorkers.filter(w => !exactMatches.some(e => e.id === w.id)).slice(0, 4);

  return {
    serviceId: sId,
    city: targetCity,
    exactMatch: false,
    noCoverage: false,
    workers: [],
    similar: similarMatches
  };
}

/**
 * Create a new appointment booking
 */
async function createBooking(bookingData) {
  if (isMongoReady) {
    try {
      const booking = new Booking(bookingData);
      await booking.save();
      return booking;
    } catch (err) {
      console.error('Mongo createBooking error:', err.message);
    }
  }

  const store = readLocalStore();
  const newBooking = {
    _id: 'bk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    ...bookingData,
    status: bookingData.status || 'pending',
    negotiations: bookingData.negotiations || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.bookings.unshift(newBooking);
  writeLocalStore(store);
  return newBooking;
}

/**
 * Find booking by ID
 */
async function findBookingById(id) {
  if (!id) return null;
  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const found = await Booking.findById(id);
        if (found) return found;
      }
      return await Booking.findOne({ _id: id });
    } catch (err) {
      console.error('Mongo findBookingById error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.bookings.find(b => String(b._id || b.id) === String(id)) || null;
}

/**
 * Update an existing booking
 */
async function updateBooking(id, updates) {
  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const updated = await Booking.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true });
        if (updated) return updated;
      }
      return await Booking.findOneAndUpdate({ _id: id }, { ...updates, updatedAt: new Date() }, { new: true });
    } catch (err) {
      console.error('Mongo updateBooking error:', err.message);
    }
  }

  const store = readLocalStore();
  const idx = store.bookings.findIndex(b => String(b._id || b.id) === String(id));
  if (idx !== -1) {
    store.bookings[idx] = {
      ...store.bookings[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeLocalStore(store);
    return store.bookings[idx];
  }
  return null;
}

/**
 * Find bookings for a customer
 */
async function findBookingsByCustomer(customerId) {
  if (isMongoReady) {
    try {
      return await Booking.find({ customerId: String(customerId) }).sort({ createdAt: -1 });
    } catch (err) {
      console.error('Mongo findBookingsByCustomer error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.bookings.filter(b => String(b.customerId) === String(customerId));
}

/**
 * Approximate skill matching between worker skill and demanded gig service
 * Matches standard categories as well as custom / 'Other' specific skills
 */
function skillsApproxMatch(workerSkill, demandedGig) {
  if (!workerSkill || !demandedGig) return false;
  const w = String(workerSkill).toLowerCase().trim();
  const d = String(demandedGig).toLowerCase().trim();

  // 1. Direct equality or substring containment
  if (w === d || w.includes(d) || d.includes(w)) return true;

  // 2. Tokenize and remove stop words
  const stopWords = new Set([
    'and', '&', 'or', 'the', 'a', 'an', 'for', 'in', 'at', 'to', 'of', 'with',
    'service', 'services', 'pro', 'pros', 'help', 'specialist', 'expert',
    'care', 'work', 'works', 'need', 'needs', 'repair', 'repairs', 'fixing',
    'custom', 'pool', 'request', 'other', 'specialized', 'trade', 'visits'
  ]);

  const tokenize = (str) => {
    return str
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 3 && !stopWords.has(token));
  };

  const wTokens = tokenize(w);
  const dTokens = tokenize(d);

  for (const wt of wTokens) {
    for (const dt of dTokens) {
      if (wt === dt || wt.startsWith(dt) || dt.startsWith(wt)) {
        return true;
      }
      if (wt.length >= 4 && dt.length >= 4 && wt.slice(0, 4) === dt.slice(0, 4)) {
        return true;
      }
    }
  }

  // 3. Trade domain keywords mapping
  const tradeGroups = [
    ['plumb', 'pipe', 'leak', 'drain', 'faucet', 'tap', 'sink', 'toilet', 'flush'],
    ['electr', 'wir', 'switch', 'light', 'circuit', 'fuse', 'socket', 'fan', 'bulb', 'meter'],
    ['clean', 'maid', 'sweep', 'mop', 'housekeep', 'sanitiz', 'disinfect', 'scrub', 'deep clean'],
    ['carpent', 'wood', 'furnitur', 'door', 'table', 'chair', 'cabinet', 'shelf', 'assembl'],
    ['paint', 'color', 'whitewash', 'wall', 'coat', 'waterproof', 'roller', 'brush'],
    ['ac', 'aircon', 'fridg', 'refrigerat', 'applianc', 'washing', 'oven', 'microwave'],
    ['pest', 'termite', 'cockroach', 'fumigat', 'bug', 'insect', 'rodent', 'rat'],
    ['child', 'baby', 'babysit', 'nanny', 'infant', 'toddler'],
    ['pet', 'dog', 'cat', 'puppy', 'walk', 'groom'],
    ['tutor', 'teach', 'math', 'scienc', 'physic', 'chemistr', 'english', 'lesson', 'class'],
    ['tech', 'laptop', 'comput', 'wifi', 'wi-fi', 'network', 'pc', 'mac'],
    ['garden', 'plant', 'lawn', 'grass', 'prun', 'tree', 'landscap'],
    ['yoga', 'fit', 'gym', 'workout', 'train', 'coach'],
    ['car', 'auto', 'bike', 'motorcycl', 'vehicl', 'wash', 'detail'],
    ['senior', 'elder', 'companion', 'assist'],
    ['spa', 'massag', 'salon', 'facial', 'haircut'],
    ['organis', 'organiz', 'wardrob', 'closet', 'declutter']
  ];

  for (const group of tradeGroups) {
    const wHas = group.some(term => w.includes(term));
    const dHas = group.some(term => d.includes(term));
    if (wHas && dHas) return true;
  }

  return false;
}

/**
 * Find bookings for a worker (direct bookings + open pool requests matching their skill)
 */
async function findBookingsByWorker(workerId, workerSkill = '', workerCity = '', workerName = '', workerSpecificSkill = '') {
  const wId = String(workerId);
  const wCity = (workerCity || '').toLowerCase().trim();
  const wName = (workerName || '').toLowerCase().trim();
  const combinedSkill = [workerSkill, workerSpecificSkill].filter(Boolean).join(' ').trim();
  const canonicalWorkerCity = wCity ? resolveCityFromLocation(wCity).canonicalCity.toLowerCase() : '';

  if (isMongoReady) {
    try {
      const orConditions = [
        { workerId: wId },
        { workerId: null }
      ];
      if (wName) {
        orConditions.push({ workerName: new RegExp(`^${wName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      }
      const records = await Booking.find({ $or: orConditions }).sort({ createdAt: -1 });

      return records.filter(b => {
        if (b.workerId && String(b.workerId) === wId) return true;
        if (wName && b.workerName && b.workerName.toLowerCase().trim() === wName) return true;
        if (!b.workerId) {
          if (Array.isArray(b.declinedWorkerIds) && b.declinedWorkerIds.includes(wId)) {
            return false;
          }
          if (canonicalWorkerCity && b.city) {
            const canonicalBookingCity = resolveCityFromLocation(b.city).canonicalCity.toLowerCase();
            if (canonicalWorkerCity !== canonicalBookingCity) return false;
          }
          if (combinedSkill) {
            return skillsApproxMatch(combinedSkill, `${b.serviceName || ''} ${b.category || ''}`);
          }
          return true;
        }
        return false;
      });
    } catch (err) {
      console.error('Mongo findBookingsByWorker error:', err.message);
    }
  }

  const store = readLocalStore();
  return store.bookings.filter(b => {
    // 1. Direct booking appointed to this specific worker - match by workerId or workerName!
    if (b.workerId && String(b.workerId) === wId) return true;
    if (wName && b.workerName && b.workerName.toLowerCase().trim() === wName) return true;
    
    // 2. Open pool booking (customer requested any available pro)
    if (!b.workerId) {
      if (Array.isArray(b.declinedWorkerIds) && b.declinedWorkerIds.includes(wId)) {
        return false;
      }
      if (canonicalWorkerCity && b.city) {
        const canonicalBookingCity = resolveCityFromLocation(b.city).canonicalCity.toLowerCase();
        if (canonicalWorkerCity !== canonicalBookingCity) return false;
      }
      // Filter open pool bookings so worker only sees gigs where their skill approx matches!
      if (combinedSkill) {
        return skillsApproxMatch(combinedSkill, `${b.serviceName || ''} ${b.category || ''}`);
      }
      return true;
    }
    
    // 3. Demo bookings in same city
    if (b.workerId && String(b.workerId).startsWith('pro_')) {
      if (canonicalWorkerCity && b.city) {
        const canonicalBookingCity = resolveCityFromLocation(b.city).canonicalCity.toLowerCase();
        if (canonicalWorkerCity !== canonicalBookingCity) return false;
      }
      return true;
    }
    return false;
  });
}

/**
 * Add a negotiation counter-offer or note to booking
 */
async function addBookingNegotiation(bookingId, negotiationEntry) {
  const booking = await findBookingById(bookingId);
  if (!booking) return null;

  const currentNegs = booking.negotiations || [];
  const updatedNegs = [...currentNegs, { ...negotiationEntry, createdAt: new Date() }];

  const updates = {
    negotiations: updatedNegs,
    status: negotiationEntry.newStatus || 'bargaining'
  };

  if (negotiationEntry.proposedPrice) {
    updates.price = negotiationEntry.proposedPrice;
  }
  if (negotiationEntry.proposedTime) {
    updates.scheduledTime = negotiationEntry.proposedTime;
  }
  if (negotiationEntry.proposedDate) {
    updates.scheduledDate = negotiationEntry.proposedDate;
  }

  return await updateBooking(bookingId, updates);
}

/**
 * Real Local Pricing Intelligence Engine
 * Queries real workers and actual bookings in the target city to gather prevailing market rates
 */
async function getLocalPricingIntelligence(serviceCategory = null, queryText = '', cityQuery = 'Bengaluru') {
  try {
    const locationResolution = resolveCityFromLocation(cityQuery, null);
    const targetCity = locationResolution.city || 'Bengaluru';
    const cleanQ = (queryText || '').toLowerCase().trim();
    const cleanCat = (serviceCategory || '').toLowerCase().trim();

    // 1. Fetch all active workers in target city
    const allDbWorkers = await findUsersByRole('worker');
    const approvedDbWorkers = allDbWorkers.filter(w => w.approvalStatus === 'approved');

    const cityDbWorkers = approvedDbWorkers.filter(w => {
      const wCity = (w.city || '').toLowerCase().trim();
      const wLoc = (w.locality || '').toLowerCase().trim();
      const tCity = targetCity.toLowerCase().trim();
      return wCity === tCity || (wCity && tCity.includes(wCity)) || (wLoc && tCity.includes(wLoc));
    });

    const cityPreAssigned = PRE_ASSIGNED_WORKERS.filter(w => {
      return (w.city || '').toLowerCase().trim() === targetCity.toLowerCase().trim();
    });

    const allCityWorkers = [...cityDbWorkers, ...cityPreAssigned];

    // Filter workers who match the trade or skill query
    const keywords = cleanQ.split(/\s+/).filter(k => k.length > 2);
    const matchingWorkers = allCityWorkers.filter(w => {
      const cat = (w.skillCategory || '').toLowerCase();
      const spec = (w.specificSkill || '').toLowerCase();
      const bio = (w.bio || '').toLowerCase();

      if (cleanCat && (cat.includes(cleanCat) || cleanCat.includes(cat))) return true;
      if (keywords.some(k => cat.includes(k) || spec.includes(k) || bio.includes(k))) return true;
      return false;
    });

    // 2. Fetch recent bookings in that city for this service/category
    let sampleBookingPrices = [];
    try {
      if (isMongoReady) {
        const query = {
          city: new RegExp(targetCity, 'i')
        };
        if (cleanCat) {
          query.$or = [
            { category: new RegExp(cleanCat, 'i') },
            { serviceName: new RegExp(cleanCat, 'i') }
          ];
        }
        const recentBookings = await Booking.find(query).limit(10).lean();
        sampleBookingPrices = recentBookings.map(b => Number(b.price)).filter(p => !isNaN(p) && p > 0);
      }
    } catch (bookingErr) {
      console.warn('[Pricing Intelligence] Error fetching bookings:', bookingErr.message);
    }

    // 3. Collect rates
    const candidateRates = [];
    const pool = matchingWorkers.length > 0 ? matchingWorkers : [];

    pool.forEach(w => {
      const rate = Number(w.baseRate || w.hourlyRate || w.price);
      if (!isNaN(rate) && rate > 0) {
        candidateRates.push(rate);
      }
    });

    sampleBookingPrices.forEach(p => {
      candidateRates.push(p);
    });

    if (candidateRates.length > 0) {
      const minDemandRate = Math.min(...candidateRates);
      const maxDemandRate = Math.max(...candidateRates);
      const avgDemandRate = Math.round(candidateRates.reduce((a, b) => a + b, 0) / candidateRates.length);

      return {
        hasLocalWorkers: true,
        city: targetCity,
        workerCount: matchingWorkers.length,
        minDemandRate,
        maxDemandRate,
        avgDemandRate,
        sampleDemands: candidateRates.slice(0, 5),
        sampleWorkers: matchingWorkers.slice(0, 3).map(w => ({
          name: w.name,
          skill: w.specificSkill || w.skillCategory,
          rate: w.baseRate || avgDemandRate
        }))
      };
    }

    // If no workers or bookings exist in that city for this trade:
    return {
      hasLocalWorkers: false,
      city: targetCity,
      workerCount: 0,
      minDemandRate: null,
      maxDemandRate: null,
      avgDemandRate: null,
      sampleDemands: [],
      sampleWorkers: []
    };
  } catch (err) {
    console.warn('[Pricing Intelligence] Error computing local pricing:', err.message);
    return {
      hasLocalWorkers: false,
      city: cityQuery,
      workerCount: 0
    };
  }
}

/**
 * =========================================================================
 * Support Tickets & Customer/Worker Dispute Operations
 * =========================================================================
 */

/**
 * Create a new dispute support ticket
 */
async function createTicket(ticketData) {
  if (isMongoReady) {
    try {
      const ticket = new Ticket(ticketData);
      await ticket.save();
      return ticket;
    } catch (err) {
      console.error('Mongo createTicket error:', err.message);
    }
  }

  const store = readLocalStore();
  const newTicket = {
    _id: 'tkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    ...ticketData,
    status: ticketData.status || 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.tickets = store.tickets || [];
  store.tickets.unshift(newTicket);
  writeLocalStore(store);
  return newTicket;
}

/**
 * Find ticket by ID or ticketId
 */
async function findTicketById(id) {
  if (!id) return null;
  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const found = await Ticket.findById(id);
        if (found) return found;
      }
      return await Ticket.findOne({ ticketId: id });
    } catch (err) {
      console.error('Mongo findTicketById error:', err.message);
    }
  }

  const store = readLocalStore();
  store.tickets = store.tickets || [];
  return store.tickets.find(t => String(t._id || t.id) === String(id) || t.ticketId === id) || null;
}

/**
 * Update an existing dispute ticket
 */
async function updateTicket(id, updates) {
  if (isMongoReady) {
    try {
      if (mongoose.Types.ObjectId.isValid(id)) {
        const updated = await Ticket.findByIdAndUpdate(id, { ...updates, updatedAt: new Date() }, { new: true });
        if (updated) return updated;
      }
      return await Ticket.findOneAndUpdate(
        { ticketId: id },
        { ...updates, updatedAt: new Date() },
        { new: true }
      );
    } catch (err) {
      console.error('Mongo updateTicket error:', err.message);
    }
  }

  const store = readLocalStore();
  store.tickets = store.tickets || [];
  const idx = store.tickets.findIndex(t => String(t._id || t.id) === String(id) || t.ticketId === id);
  if (idx !== -1) {
    store.tickets[idx] = {
      ...store.tickets[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeLocalStore(store);
    return store.tickets[idx];
  }
  return null;
}

/**
 * Find tickets by booking ID
 */
async function findTicketsByBooking(bookingId) {
  if (!bookingId) return [];
  if (isMongoReady) {
    try {
      return await Ticket.find({ bookingId }).sort({ createdAt: -1 });
    } catch (err) {
      console.error('Mongo findTicketsByBooking error:', err.message);
    }
  }

  const store = readLocalStore();
  store.tickets = store.tickets || [];
  return store.tickets.filter(t => String(t.bookingId) === String(bookingId));
}

/**
 * Find tickets by user ID (either as complainant or against)
/**
 * Find tickets involving a specific user
 * NOTE: If includeUnsettledAgainst is false (default for normal users),
 * tickets where this user is the accused party remain hidden until the admin
 * has officially settled the dispute (status is 'resolved' or 'dismissed').
 */
async function findTicketsByUser(userId, includeUnsettledAgainst = false) {
  if (!userId) return [];
  const uid = String(userId);
  if (isMongoReady) {
    try {
      const query = includeUnsettledAgainst
        ? { $or: [{ complainantId: uid }, { againstId: uid }] }
        : {
            $or: [
              { complainantId: uid },
              { againstId: uid, status: { $in: ['resolved', 'dismissed'] } }
            ]
          };
      return await Ticket.find(query).sort({ createdAt: -1 });
    } catch (err) {
      console.error('Mongo findTicketsByUser error:', err.message);
    }
  }

  const store = readLocalStore();
  store.tickets = store.tickets || [];
  return store.tickets
    .filter(t => {
      const isComplainant = String(t.complainantId) === uid;
      const isAgainst = String(t.againstId) === uid;
      if (isComplainant) return true;
      if (isAgainst) {
        return includeUnsettledAgainst || ['resolved', 'dismissed'].includes(t.status);
      }
      return false;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Issue an official warning to a customer or worker from a dispute settlement.
 * Rule: Accumulating more than 3 warnings (i.e. 4 or more) permanently bans the account.
 */
async function issueUserWarning(userId, warningData = {}) {
  const user = await findUserById(userId);
  if (!user) return null;

  const currentCount = Number(user.warningsCount) || 0;
  const newCount = currentCount + 1;
  const warningsList = Array.isArray(user.warnings) ? [...user.warnings] : [];

  const newWarning = {
    warningId: 'WRN-' + Math.floor(100000 + Math.random() * 900000),
    ticketId: warningData.ticketId || '',
    bookingId: warningData.bookingId || '',
    reason: warningData.reason || 'Official warning issued for platform dispute resolution.',
    issuedBy: warningData.issuedBy || 'Hustle Operations Admin',
    issuedAt: new Date().toISOString()
  };
  warningsList.push(newWarning);

  const updates = {
    warningsCount: newCount,
    warnings: warningsList
  };

  // Rule: receiving a warning of more than 3 bans account forever (> 3 warnings)
  if (newCount > 3) {
    updates.isBanned = true;
    updates.bannedAt = new Date().toISOString();
    updates.banReason = `Account permanently banned: Exceeded allowable warning threshold (${newCount} official warnings received).`;
    if (user.role === 'worker') {
      updates.approvalStatus = 'rejected';
    }
  }

  const updatedUser = await updateUser(user._id || user.id || userId, updates);
  return {
    user: updatedUser,
    warningsCount: newCount,
    isBanned: newCount > 3,
    bannedNow: newCount === 4
  };
}

/**
 * Get all tickets (for admin dispute console)
 */
async function getAllTickets() {
  if (isMongoReady) {
    try {
      return await Ticket.find().sort({ createdAt: -1 });
    } catch (err) {
      console.error('Mongo getAllTickets error:', err.message);
    }
  }

  const store = readLocalStore();
  store.tickets = store.tickets || [];
  return [...store.tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  connectDB,
  isMongoConnected: () => isMongoReady,
  SERVICE_SKILL_MAP,
  findUserByEmail,
  findUserByPhone,
  findUserByIdentifier,
  findUserById,
  findUsersByRole,
  findWorkersByService,
  getLocalPricingIntelligence,
  createUser,
  updateUser,
  deleteUser,
  createOtp,
  findValidOtp,
  markOtpUsed,
  createBooking,
  findBookingById,
  updateBooking,
  findBookingsByCustomer,
  findBookingsByWorker,
  skillsApproxMatch,
  addBookingNegotiation,
  CANONICAL_CITIES,
  calculateDistanceKm,
  resolveCityFromLocation,
  PRE_ASSIGNED_WORKERS,
  createTicket,
  findTicketById,
  updateTicket,
  findTicketsByBooking,
  findTicketsByUser,
  issueUserWarning,
  getAllTickets
};
