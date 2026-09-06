const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'hustle_jwt_secret_key_2026_super_secure_98471';

const db = require('../services/db');

/**
 * Middleware to authenticate requests using JWT Bearer token
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    if (userId && decoded.role !== 'admin') {
      try {
        const user = await db.findUserById(userId);
        if (user && user.isBanned) {
          return res.status(403).json({
            success: false,
            isBanned: true,
            message: 'Your account has been permanently banned due to policy violations (received more than 3 official warnings). Access denied.'
          });
        }
      } catch (dbErr) {
        console.warn('User ban status check warning:', dbErr.message);
      }
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
}

module.exports = {
  authenticateToken,
  JWT_SECRET
};
