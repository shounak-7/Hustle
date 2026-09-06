/**
 * Gemini AI Express Router for Hustle
 * Mounts at /api/ai
 */

const express = require('express');
const router = express.Router();
const gemini = require('../services/gemini');
const db = require('../services/db');

// POST /api/ai/diagnose - Diagnose problem description from AI MATCH
router.post('/diagnose', async (req, res) => {
  try {
    const input = (req.body.userInput || req.body.query || '').trim();
    const city = req.body.city || 'Bengaluru';
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Problem description (userInput or query) is required.'
      });
    }

    // Query local pricing and 18-services matcher concurrently in parallel for blazing-fast response
    const localPricingPromise = db.getLocalPricingIntelligence(null, input, city);
    const match18Promise = gemini.matchAgainst18Services(input);

    const localPricing = await localPricingPromise;
    const [diagnosis, match18] = await Promise.all([
      gemini.diagnoseNeed(input, city, localPricing),
      match18Promise
    ]);

    diagnosis.match18 = match18;

    return res.json(diagnosis);
  } catch (error) {
    console.error('AI diagnose error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to diagnose task requirement.'
    });
  }
});

// POST /api/ai/match-18 - Match search query against all 18 available services
router.post('/match-18', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required.'
      });
    }

    const result = await gemini.matchAgainst18Services(query);
    return res.json(result);
  } catch (error) {
    console.error('AI match-18 error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to match against 18 services.'
    });
  }
});

// POST /api/ai/suggestions - Real-time AI task suggestions as user types
router.post('/suggestions', async (req, res) => {
  try {
    const { query, city } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.json({
        success: true,
        query: '',
        suggestions: []
      });
    }

    const suggestions = await gemini.getSearchSuggestions(query.trim(), city || 'Bengaluru');
    return res.json({
      success: true,
      query: query.trim(),
      suggestions
    });
  } catch (error) {
    console.error('AI suggestions error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate search suggestions.'
    });
  }
});

// GET /api/ai/services-18 - Return the official 18 catalog services
router.get('/services-18', (req, res) => {
  return res.json({
    success: true,
    services: gemini.HUSTLE_18_SERVICES
  });
});

// POST /api/ai/enhance-scope - Polish rough task instructions into professional scope
router.post('/enhance-scope', async (req, res) => {
  try {
    const notes = (req.body.rawNotes || req.body.notes || '').trim();
    if (!notes) {
      return res.status(400).json({
        success: false,
        error: 'Task notes (rawNotes) are required.'
      });
    }

    const serviceCategory = req.body.serviceCategory || req.body.category || 'General Service';
    const result = await gemini.enhanceScope(notes, serviceCategory);
    return res.json(result);
  } catch (error) {
    console.error('AI enhance scope error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to enhance task scope.'
    });
  }
});

// POST /api/ai/price-advisor - Fair market benchmark advisory for quotes/bargains
router.post('/price-advisor', async (req, res) => {
  try {
    const { serviceCategory, proposedPrice, city } = req.body;
    if (!serviceCategory) {
      return res.status(400).json({
        success: false,
        error: 'serviceCategory is required.'
      });
    }

    const result = await gemini.advisePrice(serviceCategory, proposedPrice, city || 'Bengaluru');
    return res.json(result);
  } catch (error) {
    console.error('AI price advisor error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate price advisory.'
    });
  }
});

// POST /api/ai/semantic-search - Intelligent semantic matching for header search
router.post('/semantic-search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required.'
      });
    }

    const result = await gemini.semanticSearch(query);
    return res.json(result);
  } catch (error) {
    console.error('AI semantic search error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process semantic search.'
    });
  }
});

// POST /api/ai/worker-bio - Generate engaging profile summary for gig workers
router.post('/worker-bio', async (req, res) => {
  try {
    const { workerName, skills, experienceYears, city } = req.body;
    const result = await gemini.generateWorkerBio(workerName, skills, experienceYears, city);
    return res.json(result);
  } catch (error) {
    console.error('AI worker bio error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate worker profile summary.'
    });
  }
});

// POST /api/ai/match-other-skill - AI match for workers who chose "Other" as their skill
router.post('/match-other-skill', async (req, res) => {
  try {
    const { workerSkill, demandedSkill } = req.body;
    if (!workerSkill || !demandedSkill) {
      return res.status(400).json({
        success: false,
        error: 'Both workerSkill and demandedSkill are required.'
      });
    }

    const result = await gemini.matchOtherSkillWithDemand(workerSkill, demandedSkill);
    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('AI match-other-skill error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to match other skill with demanded skill.'
    });
  }
});

// GET /api/ai/benchmarks - Get category benchmark rates
router.get('/benchmarks', (req, res) => {
  return res.json({
    success: true,
    benchmarks: gemini.CATEGORY_BENCHMARKS
  });
});

module.exports = router;
