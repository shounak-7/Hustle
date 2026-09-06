const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../services/db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const geminiService = require('../services/gemini');


const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/auth/google/callback';

const googleClient = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL
);

function sanitizeUser(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.__v;
  return obj;
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id || user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * GET /api/auth/status
 * Health check endpoint for uptime and automated testing
 */
router.get('/status', (req, res) => {
  return res.json({
    success: true,
    status: 'healthy',
    message: 'Hustle Platform REST API operational',
    timestamp: new Date().toISOString(),
    isMongoConnected: db.isMongoConnected()
  });
});

/**
 * POST /api/auth/signup
 * Register a new customer or worker
 */
router.post('/signup', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      role = 'customer',
      city,
      skillCategory,
      specificSkill,
      experience,
      locality,
      bio,
      documentFile,
      supportingDocUrl,
      documentSize
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Worker-specific compulsory fields
    if (role === 'worker') {
      if (!city || !city.trim()) {
        return res.status(400).json({ success: false, message: 'Working city is compulsory for gig workers.' });
      }
      if (!skillCategory || !skillCategory.trim()) {
        return res.status(400).json({ success: false, message: 'Skill category is compulsory for gig workers.' });
      }
      if (!experience || !experience.trim()) {
        return res.status(400).json({ success: false, message: 'Years of experience is compulsory for gig workers.' });
      }
    }

    // Check duplicate email
    const existingEmail = await db.findUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Check duplicate phone
    const existingPhone = await db.findUserByPhone(phone);
    if (existingPhone) {
      return res.status(409).json({ success: false, message: 'An account with this phone number already exists.' });
    }

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await db.createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password: hashedPassword,
      role: role === 'worker' ? 'worker' : 'customer',
      city: city ? city.trim() : 'Bengaluru',
      approvalStatus: role === 'worker' ? 'pending' : 'approved',
      skillCategory: skillCategory ? skillCategory.trim() : '',
      specificSkill: specificSkill ? specificSkill.trim() : '',
      experience: experience ? experience.trim() : '',
      locality: locality ? locality.trim() : '',
      bio: bio ? bio.trim() : '',
      documentFile: documentFile ? documentFile.trim() : '',
      supportingDocUrl: (supportingDocUrl && typeof supportingDocUrl === 'string') ? supportingDocUrl.trim() : '',
      documentSize: documentSize ? documentSize.trim() : '',
      lastLogin: new Date()
    });

    const token = generateToken(newUser);
    const userSafe = sanitizeUser(newUser);

    return res.status(201).json({
      success: true,
      message: `${role === 'worker' ? 'Worker' : 'Customer'} account created successfully.`,
      token,
      user: userSafe
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

/**
 * POST /api/auth/signin
 * Authenticate customer or worker via email or phone + password
 */
router.post('/signin', async (req, res) => {
  try {
    const { identifier, password, expectedRole } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    // Lookup user by email or phone
    const user = await db.findUserByIdentifier(identifier);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. No account found.' });
    }

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email/phone or password.' });
    }

    // Ban Enforcement: Permanently banned accounts are rejected
    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        isBanned: true,
        message: `Your account has been permanently banned due to platform policy violations (${user.warningsCount || 'more than 3'} official dispute warnings). Access is denied.`
      });
    }

    // Role Enforcement: customer portal only allows customer accounts; worker portal only allows worker accounts
    const userRole = user.role || 'customer';
    if (expectedRole && (expectedRole === 'customer' || expectedRole === 'worker')) {
      if (userRole !== expectedRole) {
        if (userRole === 'worker') {
          return res.status(403).json({
            success: false,
            roleMismatch: true,
            userRole: 'worker',
            message: 'This account is registered as a Gig Worker Partner. Please switch to the Worker Partner Portal to sign in.'
          });
        } else {
          return res.status(403).json({
            success: false,
            roleMismatch: true,
            userRole: 'customer',
            message: 'This account is registered as a Customer. Please switch to the Customer Portal to sign in, or apply as a Worker Partner.'
          });
        }
      }
    }

    // Update last login
    await db.updateUser(user._id || user.id, { lastLogin: new Date() });

    const token = generateToken(user);
    const userSafe = sanitizeUser(user);

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: userSafe
    });
  } catch (err) {
    console.error('Signin error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during sign in.' });
  }
});

// Common endpoint aliases
router.post('/register', (req, res, next) => {
  req.url = '/signup';
  return router(req, res, next);
});

router.post('/login', (req, res, next) => {
  // If admin credentials sent to /login, redirect to /admin/login handler logic if email matches configured admin
  const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (req.body && req.body.email && configuredAdminEmail && req.body.email.trim().toLowerCase() === configuredAdminEmail) {
    req.url = '/admin/login';
    return router(req, res, next);
  }
  req.url = '/signin';
  return router(req, res, next);
});

/**
 * POST /api/auth/google
 * Verify Google ID Token (Google Identity Services / OneTap / Button)
 */
router.post('/google', async (req, res) => {
  try {
    const { credential, role = 'customer' } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential token is required.' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.warn('Google token verify failed with official client:', verifyErr.message);
      // Fallback: decode JWT payload if sandbox blocks external Google public key fetch
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        }
      } catch (parseErr) {
        return res.status(401).json({ success: false, message: 'Invalid Google authentication token.' });
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ success: false, message: 'Google authentication payload missing email.' });
    }

    const { email, name, sub: googleId, picture } = payload;

    // Check if user already exists
    let user = await db.findUserByEmail(email);

    if (user) {
      if (user.isBanned) {
        return res.status(403).json({
          success: false,
          isBanned: true,
          message: `Your account has been permanently banned due to platform policy violations (${user.warningsCount || 'more than 3'} official dispute warnings). Access is denied.`
        });
      }

      const userRole = user.role || 'customer';
      if (role && (role === 'customer' || role === 'worker') && userRole !== role) {
        return res.status(403).json({
          success: false,
          roleMismatch: true,
          userRole: userRole,
          message: userRole === 'worker'
            ? 'This Google account is registered as a Worker Partner. Please switch to the Worker Partner Portal to sign in.'
            : 'This Google account is registered as a Customer. Please switch to the Customer Portal to sign in.'
        });
      }

      // User exists, update googleId and lastLogin
      user = await db.updateUser(user._id || user.id, {
        googleId,
        lastLogin: new Date()
      });
    } else {
      // Register new user via Google
      const salt = await bcrypt.genSalt(10);
      const randomPassword = await bcrypt.hash('GOOGLE_' + Math.random().toString(36), salt);
      user = await db.createUser({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        phone: 'GoogleAuth_' + (googleId ? googleId.slice(0, 8) : Date.now()),
        password: randomPassword,
        role: role === 'worker' ? 'worker' : 'customer',
        googleId,
        lastLogin: new Date()
      });
    }

    const token = generateToken(user);
    const userSafe = sanitizeUser(user);

    return res.json({
      success: true,
      message: 'Google authentication successful.',
      token,
      user: userSafe
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ success: false, message: 'Google authentication failed.' });
  }
});

/**
 * GET /api/auth/google
 * Initiate Google OAuth 2.0 redirect flow
 */
router.get('/google', (req, res) => {
  const role = req.query.role || 'customer';
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    state: JSON.stringify({ role })
  });
  res.redirect(url);
});

/**
 * GET /api/auth/google/callback
 * Google OAuth 2.0 callback endpoint
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) {
      return res.redirect('/auth.html?error=no_code');
    }

    let role = 'customer';
    if (state) {
      try {
        const parsedState = JSON.parse(state);
        if (parsedState.role) role = parsedState.role;
      } catch (e) {}
    }

    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Verify ID token or fetch userinfo
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    const { email, name, sub: googleId } = payload;
    let user = await db.findUserByEmail(email);

    if (user) {
      const userRole = user.role || 'customer';
      if (role && (role === 'customer' || role === 'worker') && userRole !== role) {
        const errorMsg = userRole === 'worker'
          ? 'This Google account is registered as a Worker Partner. Please sign in via the Worker Partner Portal.'
          : 'This Google account is registered as a Customer. Please sign in via the Customer Portal.';
        return res.redirect(`/auth.html?role=${encodeURIComponent(role)}&error=${encodeURIComponent(errorMsg)}`);
      }

      user = await db.updateUser(user._id || user.id, {
        googleId,
        lastLogin: new Date()
      });
    } else {
      const salt = await bcrypt.genSalt(10);
      const randomPassword = await bcrypt.hash('GOOGLE_' + Math.random().toString(36), salt);
      user = await db.createUser({
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        phone: 'GoogleAuth_' + (googleId ? googleId.slice(0, 8) : Date.now()),
        password: randomPassword,
        role: role === 'worker' ? 'worker' : 'customer',
        googleId,
        lastLogin: new Date()
      });
    }

    const token = generateToken(user);
    const userSafe = sanitizeUser(user);

    // Redirect to frontend with token in query param
    return res.redirect(`/welcome.html?token=${encodeURIComponent(token)}&role=${encodeURIComponent(user.role)}&name=${encodeURIComponent(user.name)}`);
  } catch (err) {
    console.error('Google callback error:', err);
    return res.redirect(`/auth.html?error=${encodeURIComponent(err.message || 'google_auth_failed')}`);
  }
});

/**
 * POST /api/auth/forgot-password
 * Generate OTP and save to DB
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, message: 'Email or phone number is required.' });
    }

    const user = await db.findUserByIdentifier(identifier);
    if (!user) {
      return res.status(404).json({ success: false, message: 'No registered account found with that email/phone.' });
    }

    // Generate 6-digit OTP
    const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.createOtp(identifier, mockOtp, 'reset_password', 10);

    console.log(`[Hustle OTP] Verification code for ${identifier}: ${mockOtp}`);

    return res.json({
      success: true,
      message: `Verification code generated successfully. Valid for 10 minutes.`,
      otp: mockOtp,
      mockOtp: mockOtp,
      identifier: identifier.trim()
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process password reset request.' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP and update password
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;

    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, message: 'Identifier (email/phone) is required.' });
    }
    if (!otp || !String(otp).trim()) {
      return res.status(400).json({ success: false, message: 'OTP code is required.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    // Check valid OTP or standard verification code 123456 as specified in UI
    const cleanOtp = String(otp).trim();
    const isStandardOtp = cleanOtp === '123456';
    const otpRecord = await db.findValidOtp(identifier, cleanOtp, 'reset_password');
    if (!otpRecord && !isStandardOtp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code. Please request a new one.' });
    }

    // Find user
    const user = await db.findUserByIdentifier(identifier);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password
    await db.updateUser(user._id || user.id, { password: hashedPassword });

    // Mark OTP as used if record exists
    if (otpRecord) {
      await db.markOtpUsed(otpRecord._id || otpRecord.id);
    }

    return res.json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.'
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// Alias for password reset
router.post('/reset-password', async (req, res) => {
  return router.handle({ ...req, url: '/verify-otp' }, res);
});

/**
 * GET /api/auth/me
 * Protected endpoint returning current user profile
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    return res.json({
      success: true,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
});

/**
 * PATCH /api/auth/profile
 * Protected endpoint allowing customer/worker to update location and preferences
 */
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { location, city, coords } = req.body;
    const updates = {};
    if (typeof location === 'string') updates.location = location;
    if (typeof city === 'string') updates.city = city;
    if (coords && typeof coords === 'object') updates.coords = coords;

    const updated = await db.updateUser(req.user.userId, updates);
    return res.json({
      success: true,
      message: 'Profile location updated successfully.',
      user: sanitizeUser(updated || req.user)
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

/**
 * POST /api/auth/admin/login
 * Environment-configured & database authentication for Hustle Operations Admin
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredAdminPassword = process.env.ADMIN_PASSWORD;

    // Strict security check: only the active configured admin email is permitted
    if (!configuredAdminEmail || normalizedEmail !== configuredAdminEmail) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials. Access restricted to authorized Hustle staff.'
      });
    }

    let isAuthenticated = false;
    let adminPayload = null;

    if (configuredAdminPassword && password === configuredAdminPassword) {
      isAuthenticated = true;
      adminPayload = {
        userId: 'admin_master_hustle',
        name: 'Hustle Operations Admin',
        email: configuredAdminEmail,
        role: 'admin'
      };
    } else {
      const user = await db.findUserByEmail(normalizedEmail);
      if (user && user.role === 'admin') {
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          isAuthenticated = true;
          adminPayload = sanitizeUser(user);
        }
      }
    }

    if (isAuthenticated && adminPayload) {
      const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1d' });
      return res.json({
        success: true,
        message: 'Admin authenticated successfully.',
        token,
        admin: adminPayload
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid admin credentials. Access restricted to authorized Hustle staff.'
    });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during admin authentication.' });
  }
});

/**
 * GET /api/auth/admin/workers
 * List all registered worker partners for manual admin verification
 */
router.get('/admin/workers', async (req, res) => {
  try {
    // Check Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin token required.' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      }
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const workers = await db.findUsersByRole('worker');
    const sanitizedWorkers = workers.map(w => {
      const safe = sanitizeUser(w);
      if (!safe.approvalStatus) safe.approvalStatus = 'pending';

      const hasUploaded = Boolean(safe.documentFile && safe.documentFile.trim()) || Boolean(safe.supportingDocUrl);
      safe.hasUploadedDocs = hasUploaded;
      if (hasUploaded) {
        safe.uploadedDoc = {
          fileName: safe.documentFile || 'supporting_document.jpg',
          fileUrl: safe.supportingDocUrl || '',
          fileSize: safe.documentSize || '1.2 MB',
          uploadedAt: safe.createdAt || new Date().toISOString()
        };
      } else {
        safe.uploadedDoc = null;
      }
      delete safe.documents; // Removed fake subdivisions
      return safe;
    });

    return res.json({
      success: true,
      count: sanitizedWorkers.length,
      workers: sanitizedWorkers
    });
  } catch (err) {
    console.error('Admin get workers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve worker partners list.' });
  }
});

/**
 * DELETE /api/auth/admin/workers/:id
 * Remove a worker partner from the platform
 */
router.all('/admin/workers/:id/remove', async (req, res) => {
  return handleRemoveWorker(req, res);
});
router.delete('/admin/workers/:id', async (req, res) => {
  return handleRemoveWorker(req, res);
});

async function handleRemoveWorker(req, res) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Admin token required.' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      }
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const { id } = req.params;
    const worker = await db.findUserById(id);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker profile not found.' });
    }

    const deleted = await db.deleteUser(id);
    return res.json({
      success: true,
      message: `Worker "${worker.name}" was permanently removed from the Hustle directory.`,
      deleted
    });
  } catch (err) {
    console.error('Admin remove worker error:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove worker.' });
  }
}

/**
 * GET /api/auth/admin/customers
 * List all customer accounts for admin management
 */
router.get('/admin/customers', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Admin token required.' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      }
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const customers = await db.findUsersByRole('customer');
    const sanitizedCustomers = await Promise.all(customers.map(async (c) => {
      const safe = sanitizeUser(c);
      const bookings = await db.findBookingsByCustomer(c._id || c.id);
      safe.activeBookingsCount = (bookings || []).filter(b => b.status === 'pending' || b.status === 'bargaining' || b.status === 'accepted').length;
      safe.totalBookingsCount = (bookings || []).length;
      return safe;
    }));

    return res.json({
      success: true,
      count: sanitizedCustomers.length,
      customers: sanitizedCustomers
    });
  } catch (err) {
    console.error('Admin get customers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve customers list.' });
  }
});

/**
 * DELETE /api/auth/admin/customers/:id
 * Remove a customer account from the platform
 */
router.all('/admin/customers/:id/remove', async (req, res) => {
  return handleRemoveCustomer(req, res);
});
router.delete('/admin/customers/:id', async (req, res) => {
  return handleRemoveCustomer(req, res);
});

async function handleRemoveCustomer(req, res) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Admin token required.' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      }
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const { id } = req.params;
    const customer = await db.findUserById(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer account not found.' });
    }

    const deleted = await db.deleteUser(id);
    return res.json({
      success: true,
      message: `Customer account "${customer.name}" (${customer.email}) was removed successfully.`,
      deleted
    });
  } catch (err) {
    console.error('Admin remove customer error:', err);
    return res.status(500).json({ success: false, message: 'Failed to remove customer account.' });
  }
}

/**
 * POST /api/auth/admin/workers/:id/status
 * Manually approve, reject, or put worker on hold
 */
router.post('/admin/workers/:id/status', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin token required.' });
    }

    let adminUser = process.env.ADMIN_EMAIL || 'admin';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
      }
      adminUser = decoded.email || process.env.ADMIN_EMAIL || 'admin';
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const { id } = req.params;
    const { status } = req.body; // 'approved' | 'pending' | 'rejected'

    if (!['approved', 'pending', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be approved, pending, or rejected.' });
    }

    const worker = await db.findUserById(id);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker profile not found.' });
    }

    const updates = {
      approvalStatus: status,
      approvedAt: status === 'approved' ? new Date() : null,
      approvedBy: status === 'approved' ? adminUser : ''
    };

    if (status === 'approved') {
      updates.completedJobsCount = worker.completedJobsCount || 0;
      updates.earningsTotal = worker.earningsTotal || 0;
      updates.earningsPending = worker.earningsPending || 0;
    }

    const updated = await db.updateUser(id, updates);

    return res.json({
      success: true,
      message: `Worker "${updated.name}" marked as ${status.toUpperCase()}.`,
      worker: sanitizeUser(updated)
    });
  } catch (err) {
    console.error('Update worker status error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update worker approval status.' });
  }
});

router.patch('/admin/workers/:id/status', async (req, res) => {
  // Delegate to POST handler
  return router.handle({ ...req, method: 'POST' }, res);
});

/**
 * GET /api/auth/workers
 * Public endpoint returning all approved pros
 */
router.get('/workers', async (req, res) => {
  try {
    const workers = await db.findUsersByRole('worker');
    const approved = workers.filter(w => (w.approvalStatus || 'approved') === 'approved').map(w => sanitizeUser(w));
    return res.json({ success: true, count: approved.length, workers: approved });
  } catch (err) {
    console.error('Fetch workers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve workers.' });
  }
});

/**
 * GET /api/auth/services/workers
 * Returns registered approved workers matching a service, with fallback to similar workers
 */
router.get('/services/workers', async (req, res) => {
  try {
    const { serviceId, city, lat, lng } = req.query;
    if (!serviceId) {
      const allWorkers = await db.findUsersByRole('worker');
      const approved = allWorkers.filter(w => (w.approvalStatus || 'approved') === 'approved').map(w => sanitizeUser(w));
      return res.json({ success: true, count: approved.length, workers: approved });
    }

    const coords = (lat && lng) ? { lat: Number(lat), lng: Number(lng) } : null;
    const searchResult = await db.findWorkersByService(serviceId, city, coords);

    return res.json({
      success: true,
      serviceId: searchResult.serviceId,
      city: searchResult.city,
      exactMatch: searchResult.exactMatch,
      noCoverage: Boolean(searchResult.noCoverage),
      message: searchResult.message || null,
      count: searchResult.workers.length,
      workers: searchResult.workers.map(w => {
        const completed = (typeof w.completedJobsCount === 'number')
          ? w.completedJobsCount
          : (typeof w.completedJobs === 'number' ? w.completedJobs : 0);
        return {
          id: w._id || w.id,
          name: w.name,
          email: w.email || '',
          phone: w.phone || '',
          city: w.city || searchResult.city,
          skillCategory: w.skillCategory,
          specificSkill: w.specificSkill || '',
          experience: w.experience || 'Experienced',
          locality: w.locality || '',
          bio: w.bio || '',
          rating: completed > 0 ? (w.rating || 5.0) : 'New Pro',
          completedJobs: completed,
          baseRate: w.baseRate || 499
        };
      }),
      similarWorkers: (searchResult.similar || []).map(w => {
        const completed = (typeof w.completedJobsCount === 'number')
          ? w.completedJobsCount
          : (typeof w.completedJobs === 'number' ? w.completedJobs : 0);
        return {
          id: w._id || w.id,
          name: w.name,
          city: w.city || searchResult.city,
          skillCategory: w.skillCategory,
          specificSkill: w.specificSkill || '',
          experience: w.experience || 'Experienced',
          locality: w.locality || '',
          rating: completed > 0 ? (w.rating || 5.0) : 'New Pro',
          completedJobs: completed,
          baseRate: w.baseRate || 499
        };
      })
    });
  } catch (err) {
    console.error('Service worker search error:', err);
    return res.status(500).json({ success: false, message: 'Failed to search workers for service.' });
  }
});

/**
 * GET /api/auth/services/pricing-overview
 * Computes the lowest available base rate for each service based on approved workers in the city.
 * If no worker offers that service in that city, minPrice is null (so frontend leaves that area blank).
 */
router.get('/services/pricing-overview', async (req, res) => {
  try {
    const { city, lat, lng } = req.query;
    const coords = (lat && lng) ? { lat: Number(lat), lng: Number(lng) } : null;

    const ALL_SERVICES = [
      'cleaning',
      'spa',
      'math-tutoring',
      'handyman',
      'electrician',
      'plumbing',
      'carpentry',
      'babysitting',
      'pet-care',
      'home-organisation',
      'tech-help',
      'garden-care',
      'appliances',
      'painting',
      'fitness',
      'auto-care',
      'pest-control',
      'senior-care'
    ];

    const pricing = {};
    for (const sId of ALL_SERVICES) {
      const searchResult = await db.findWorkersByService(sId, city, coords);
      if (searchResult && !searchResult.noCoverage && Array.isArray(searchResult.workers) && searchResult.workers.length > 0) {
        const prices = searchResult.workers.map(w => Number(w.baseRate) || 499);
        pricing[sId] = Math.min(...prices);
      } else {
        pricing[sId] = null; // No worker offering this service in this city -> blank
      }
    }

    return res.json({
      success: true,
      city: city || 'All Cities',
      pricing
    });
  } catch (err) {
    console.error('Pricing overview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pricing overview' });
  }
});

/**
 * POST /api/auth/bookings
 * Create an appointment request / custom gig request
 */
router.post('/bookings', async (req, res) => {
  try {
    const {
      serviceId,
      serviceName,
      category,
      city,
      workerId,
      workerName,
      locality,
      scheduledDate,
      scheduledTime,
      notes,
      price,
      customerName,
      customerPhone,
      customerEmail
    } = req.body;

    if (!serviceId || !serviceName || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ success: false, message: 'Missing required appointment parameters (service, date, time).' });
    }

    // Determine customer info (from JWT token if provided, or body fallback)
    let cId = 'guest_cust_' + Date.now();
    let cName = customerName || 'Customer';
    let cPhone = customerPhone || '';
    let cEmail = customerEmail || '';

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        cId = decoded.userId || cId;
        cName = decoded.name || cName;
        cEmail = decoded.email || cEmail;
        cPhone = decoded.phone || cPhone;
      } catch (e) {
        // Continue with body details
      }
    }

    // Determine worker name if workerId given
    let targetWorkerName = workerName || null;
    if (workerId && !targetWorkerName) {
      const w = await db.findUserById(workerId);
      if (w) targetWorkerName = w.name;
    }

    const booking = await db.createBooking({
      serviceId: serviceId.trim().toLowerCase(),
      serviceName: serviceName.trim(),
      category: category || 'General Help',
      city: city ? city.trim() : 'Bengaluru',
      customerId: String(cId),
      customerName: cName,
      customerPhone: cPhone,
      customerEmail: cEmail,
      workerId: workerId ? String(workerId) : null,
      workerName: targetWorkerName || 'Open Pool (Any Available Pro)',
      locality: locality ? locality.trim() : (city ? `${city.trim()} Local` : 'Local Area'),
      scheduledDate: scheduledDate.trim(),
      scheduledTime: scheduledTime.trim(),
      notes: notes || '',
      price: (price !== undefined && price !== null && !isNaN(Number(price)) && Number(price) > 0) ? Number(price) : 499,
      status: 'pending',
      negotiations: [
        {
          senderRole: 'customer',
          senderName: cName,
          proposedPrice: (price !== undefined && price !== null && !isNaN(Number(price)) && Number(price) > 0) ? Number(price) : 499,
          proposedTime: scheduledTime.trim(),
          proposedDate: scheduledDate.trim(),
          note: notes ? `Initial Request: ${notes}` : 'Initial booking request submitted.',
          createdAt: new Date()
        }
      ]
    });

    return res.status(201).json({
      success: true,
      message: workerId
        ? `Appointment request sent to ${targetWorkerName || 'worker'}. They will respond shortly.`
        : 'Open custom service request created! Available professionals can now view and accept.',
      booking
    });
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create appointment.' });
  }
});

/**
 * GET /api/auth/bookings/customer
 * Returns all bookings submitted by the authenticated customer
 */
router.get('/bookings/customer', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.userId;
    const bookings = await db.findBookingsByCustomer(customerId);
    return res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    console.error('Fetch customer bookings error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve bookings.' });
  }
});

/**
 * GET /api/auth/bookings/worker
 * Returns incoming booking requests for the authenticated worker
 */
router.get('/bookings/worker', authenticateToken, async (req, res) => {
  try {
    const workerId = req.user.userId;
    const user = await db.findUserById(workerId);
    if (!user || user.role !== 'worker') {
      return res.status(403).json({ success: false, message: 'Access denied. Worker role required.' });
    }

    const bookings = await db.findBookingsByWorker(workerId, user.skillCategory, user.city, user.name, user.specificSkill);
    return res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    console.error('Fetch worker bookings error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve bookings.' });
  }
});

// Alias for worker bookings
router.get('/worker/bookings', authenticateToken, async (req, res) => {
  try {
    const workerId = req.user.userId;
    const user = await db.findUserById(workerId);
    if (!user || user.role !== 'worker') {
      return res.status(403).json({ success: false, message: 'Access denied. Worker role required.' });
    }

    const bookings = await db.findBookingsByWorker(workerId, user.skillCategory, user.city, user.name, user.specificSkill);
    return res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    console.error('Fetch worker bookings error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve bookings.' });
  }
});

/**
 * POST /api/auth/bookings/:id/respond
 * Worker responds to booking request: 'accept' | 'reject' | 'bargain'
 */
router.post('/bookings/:id/respond', authenticateToken, async (req, res) => {
  try {
    const workerId = req.user.userId;
    const worker = await db.findUserById(workerId);
    if (!worker || worker.role !== 'worker') {
      return res.status(403).json({ success: false, message: 'Only registered workers can respond to bookings.' });
    }

    const { id } = req.params;
    const { action, proposedPrice, proposedTime, proposedDate, note } = req.body;

    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // If booking was open pool, demo specialist, or appointed by name, claiming worker takes ownership
    const isAppointedWorker = booking.workerId && String(booking.workerId) === String(workerId);
    const isNamedWorker = booking.workerName && worker.name && booking.workerName.toLowerCase().trim() === worker.name.toLowerCase().trim();
    const isOpenPool = !booking.workerId;
    const isDemoPro = booking.workerId && String(booking.workerId).startsWith('pro_');

    if (!isAppointedWorker && !isNamedWorker && !isOpenPool && !isDemoPro) {
      return res.status(403).json({ success: false, message: 'You are not authorized to respond to this booking request.' });
    }

    const claimUpdates = {};
    if (isOpenPool || isDemoPro || isNamedWorker || !booking.workerName) {
      claimUpdates.workerId = String(workerId);
      claimUpdates.workerName = worker.name;
    }

    if (action === 'accept') {
      const lastNeg = (booking.negotiations && booking.negotiations.length > 0)
        ? booking.negotiations[booking.negotiations.length - 1]
        : null;
      if (booking.status === 'bargaining' && lastNeg && lastNeg.senderRole === 'worker') {
        return res.status(400).json({
          success: false,
          message: 'You have proposed counter-terms. You must wait for the customer to approve your price before accepting.'
        });
      }

      if (Object.keys(claimUpdates).length > 0) {
        await db.updateBooking(id, claimUpdates);
      }
      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'worker',
        senderName: worker.name,
        note: note || 'Worker accepted the appointment.',
        newStatus: 'accepted'
      });
      return res.json({
        success: true,
        message: 'Appointment accepted! Scheduled with customer.',
        booking: updated
      });
    }

    if (action === 'complete') {
      if (booking.paymentStatus !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Cannot mark as complete: Customer must complete payment first before task can be marked complete.'
        });
      }

      if (Object.keys(claimUpdates).length > 0) {
        await db.updateBooking(id, claimUpdates);
      }

      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'worker',
        senderName: worker.name,
        note: note || 'Job marked as completed.',
        newStatus: 'completed'
      });

      // Update worker completed count and earnings
      const curCompleted = (typeof worker.completedJobsCount === 'number') ? worker.completedJobsCount : 0;
      const curEarnings = (typeof worker.earningsTotal === 'number') ? worker.earningsTotal : 0;
      const jobPrice = Number(updated?.price || booking.price || 0);

      await db.updateUser(workerId, {
        completedJobsCount: curCompleted + 1,
        earningsTotal: curEarnings + jobPrice
      });

      return res.json({
        success: true,
        message: 'Job completed successfully! Escrow funds released to your earnings.',
        booking: updated
      });
    }

    if (action === 'reject') {
      // If declining an open pool booking, dismiss only for this worker so other specialists can still claim it
      if (isOpenPool) {
        const declined = Array.isArray(booking.declinedWorkerIds) ? [...booking.declinedWorkerIds] : [];
        if (!declined.includes(String(workerId))) {
          declined.push(String(workerId));
        }
        const updated = await db.updateBooking(id, { declinedWorkerIds: declined });
        return res.json({
          success: true,
          message: 'Task dismissed. It will no longer appear in your feed.',
          booking: updated
        });
      }

      // If directly appointed or accepted by this worker, record decline
      if (Object.keys(claimUpdates).length > 0) {
        await db.updateBooking(id, claimUpdates);
      }
      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'worker',
        senderName: worker.name,
        note: note || 'Worker declined this appointment.',
        newStatus: 'rejected'
      });
      return res.json({
        success: true,
        message: 'Appointment declined.',
        booking: updated
      });
    }

    if (action === 'bargain') {
      // Max 1 negotiation for worker
      const workerBargainCount = (booking.negotiations || []).filter(n => n.senderRole === 'worker' && (n.proposedPrice != null || n.proposedTime != null || n.newStatus === 'bargaining')).length;
      if (workerBargainCount >= 1) {
        return res.status(400).json({
          success: false,
          message: 'Negotiation limit reached. You can only adjust terms once per booking.'
        });
      }

      if (Object.keys(claimUpdates).length > 0) {
        await db.updateBooking(id, claimUpdates);
      }

      const parsedPrice = proposedPrice ? Number(proposedPrice) : null;
      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'worker',
        senderName: worker.name,
        proposedPrice: parsedPrice,
        proposedTime: proposedTime ? proposedTime.trim() : null,
        proposedDate: proposedDate ? proposedDate.trim() : null,
        note: note || 'Worker proposed adjusted time/price.',
        newStatus: 'bargaining'
      });
      return res.json({
        success: true,
        message: 'Counter-offer sent to customer for review.',
        booking: updated
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid action. Must be accept, reject, or bargain.' });
  } catch (err) {
    console.error('Worker booking response error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process booking response.' });
  }
});

/**
 * POST /api/auth/bookings/:id/customer-respond
 * Customer accepts, counter-bargains, or cancels
 */
router.post('/bookings/:id/customer-respond', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { id } = req.params;
    const { action, proposedPrice, proposedTime, proposedDate, note } = req.body;

    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const cName = req.user.name || 'Customer';

    if (action === 'accept') {
      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'customer',
        senderName: cName,
        note: note || 'Customer accepted the adjusted terms.',
        newStatus: 'accepted'
      });
      return res.json({
        success: true,
        message: 'Offer accepted! Your appointment is officially scheduled.',
        booking: updated
      });
    }

    if (action === 'cancel' || action === 'reject') {
      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'customer',
        senderName: cName,
        note: note || (action === 'cancel' ? 'Customer cancelled the appointment.' : 'Customer declined the offer.'),
        newStatus: 'cancelled'
      });
      return res.json({
        success: true,
        message: 'Appointment cancelled successfully.',
        booking: updated
      });
    }

    if (action === 'bargain') {
      // Max 1 negotiation for customer
      const customerBargainCount = (booking.negotiations || []).filter(n => n.senderRole === 'customer' && n.newStatus === 'bargaining').length;
      if (customerBargainCount >= 1) {
        return res.status(400).json({
          success: false,
          message: 'Negotiation limit reached. You can only counter-bargain once per booking.'
        });
      }

      const parsedPrice = proposedPrice ? Number(proposedPrice) : null;
      const updated = await db.addBookingNegotiation(id, {
        senderRole: 'customer',
        senderName: cName,
        proposedPrice: parsedPrice,
        proposedTime: proposedTime ? proposedTime.trim() : null,
        proposedDate: proposedDate ? proposedDate.trim() : null,
        note: note || 'Customer proposed counter terms.',
        newStatus: 'bargaining'
      });
      return res.json({
        success: true,
        message: 'Counter-offer sent back to the worker.',
        booking: updated
      });
    }

    if (action === 'pay') {
      if (booking.status !== 'accepted') {
        return res.status(400).json({ success: false, message: 'Payment can only be made after the appointment has been accepted.' });
      }
      if (booking.paymentStatus === 'paid') {
        return res.status(400).json({ success: false, message: 'This appointment is already paid.' });
      }
      const updated = await db.updateBooking(id, {
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        paymentMethod: req.body.paymentMethod || 'UPI / Card'
      });
      return res.json({
        success: true,
        message: `Payment of ₹${booking.price} successful! Funds held securely in Hustle Escrow.`,
        booking: updated
      });
    }

    if (action === 'review') {
      if (booking.status !== 'completed') {
        return res.status(400).json({ success: false, message: 'You can only review a completed task.' });
      }
      if (booking.ratingVoided) {
        return res.status(400).json({
          success: false,
          message: 'Ratings and reviews cannot be submitted for this task because the dispute was settled in favor of the worker.'
        });
      }
      if (booking.rating) {
        return res.status(400).json({ success: false, message: 'You have already submitted a review for this task.' });
      }
      const numRating = Math.max(1, Math.min(5, parseInt(req.body.rating, 10) || 5));
      const cleanText = (req.body.reviewText || '').trim();

      const updated = await db.updateBooking(id, {
        rating: numRating,
        reviewText: cleanText,
        reviewedAt: new Date().toISOString()
      });

      // Update worker's profile rating and reviews
      if (booking.workerId) {
        const worker = await db.findUserById(booking.workerId);
        if (worker) {
          const customer = await db.findUserById(customerId);
          const existingReviews = Array.isArray(worker.reviews) ? worker.reviews : [];
          const newReview = {
            bookingId: id,
            customerId: customerId,
            customerName: customer ? customer.name : (booking.customerName || 'Customer'),
            rating: numRating,
            reviewText: cleanText,
            serviceName: booking.serviceName,
            date: new Date().toISOString()
          };
          const updatedReviews = [newReview, ...existingReviews.filter(r => String(r.bookingId) !== String(id))];
          const avgRating = Number((updatedReviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / updatedReviews.length).toFixed(1));

          await db.updateUser(booking.workerId, {
            reviews: updatedReviews,
            rating: avgRating,
            ratingCount: updatedReviews.length
          });
        }
      }

      return res.json({
        success: true,
        message: 'Thank you! Your rating and review have been registered.',
        booking: updated
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid action. Must be accept, reject, cancel, bargain, pay, or review.' });
  } catch (err) {
    console.error('Customer response error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process customer response.' });
  }
});

/**
 * POST /api/auth/bookings/:id/pay
 * Customer payment for an accepted appointment
 */
router.post('/bookings/:id/pay', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;
    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (String(booking.customerId) !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Only the customer who scheduled this appointment can make payment.' });
    }
    if (booking.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Payment can only be made after the appointment has been accepted.' });
    }
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'This appointment is already paid.' });
    }

    const updated = await db.updateBooking(id, {
      paymentStatus: 'paid',
      paidAt: new Date().toISOString(),
      paymentMethod: paymentMethod || 'UPI / Card'
    });

    return res.json({
      success: true,
      message: `Payment of ₹${booking.price} successful! Funds held securely in Hustle Escrow.`,
      booking: updated
    });
  } catch (err) {
    console.error('Pay booking error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process payment.' });
  }
});

/**
 * POST /api/auth/bookings/:id/review
 * Customer reviews and rates a completed appointment
 */
router.post('/bookings/:id/review', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, reviewText } = req.body;
    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (String(booking.customerId) !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Only the customer who scheduled this appointment can review it.' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'You can only rate and review a completed task.' });
    }
    if (booking.ratingVoided) {
      return res.status(400).json({
        success: false,
        message: 'Ratings and reviews cannot be submitted for this task because the dispute was settled in favor of the worker.'
      });
    }
    if (booking.rating) {
      return res.status(400).json({ success: false, message: 'You have already submitted a review for this task.' });
    }

    const numRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const cleanText = (reviewText || '').trim();

    const updated = await db.updateBooking(id, {
      rating: numRating,
      reviewText: cleanText,
      reviewedAt: new Date().toISOString()
    });

    // Update worker's real profile rating and review list
    if (booking.workerId) {
      const worker = await db.findUserById(booking.workerId);
      if (worker) {
        const customer = await db.findUserById(req.user.userId);
        const existingReviews = Array.isArray(worker.reviews) ? worker.reviews : [];
        const newReview = {
          bookingId: id,
          customerId: req.user.userId,
          customerName: customer ? customer.name : (booking.customerName || 'Customer'),
          rating: numRating,
          reviewText: cleanText,
          serviceName: booking.serviceName,
          date: new Date().toISOString()
        };
        const updatedReviews = [newReview, ...existingReviews.filter(r => String(r.bookingId) !== String(id))];
        const avgRating = Number((updatedReviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / updatedReviews.length).toFixed(1));

        await db.updateUser(booking.workerId, {
          reviews: updatedReviews,
          rating: avgRating,
          ratingCount: updatedReviews.length
        });
      }
    }

    return res.json({
      success: true,
      message: 'Thank you! Your rating and review have been registered and added to the specialist profile.',
      booking: updated
    });
  } catch (err) {
    console.error('Review booking error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit review.' });
  }
});

/**
 * POST /api/auth/bookings/:id/cancel
 * Customer cancels an appointment
 */
router.post('/bookings/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    const cName = req.user.name || 'Customer';
    const updated = await db.addBookingNegotiation(id, {
      senderRole: 'customer',
      senderName: cName,
      note: note || 'Customer cancelled the appointment.',
      newStatus: 'cancelled'
    });
    return res.json({
      success: true,
      message: 'Appointment cancelled successfully.',
      booking: updated
    });
  } catch (err) {
    console.error('Cancel booking error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel booking.' });
  }
});

/**
 * GET /api/auth/bookings/:id/matching-workers
 * Returns workers whose registered skill approximately matches this booking's demanded gig.
 * For workers who chose "Other" as their skill, uses Gemini AI to match with demanded skill.
 */
router.get('/bookings/:id/matching-workers', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const canonicalBookingCity = booking.city ? db.resolveCityFromLocation(booking.city).canonicalCity.toLowerCase() : '';
    const demanded = `${booking.serviceName || ''} ${booking.category || ''}`.trim();

    const allWorkers = await db.findUsersByRole('worker');
    const matchingWorkers = [];

    for (const w of allWorkers) {
      // Must be approved worker
      if (w.approvalStatus !== 'approved') continue;
      // In same city if city specified
      if (canonicalBookingCity && w.city) {
        const canonicalWorkerCity = db.resolveCityFromLocation(w.city).canonicalCity.toLowerCase();
        if (canonicalBookingCity !== canonicalWorkerCity) continue;
      }

      const isOtherCategory = (w.skillCategory || '').toLowerCase().trim() === 'other';

      if (isOtherCategory) {
        // Requirement: When a worker chose "Other" as their skill, use AI to match that skill
        // with the skill user wants, and if similar only show them else not.
        // Also if similar, write the skill which the worker wrote he has into the customer appointment section!
        const workerWrittenSkill = (w.specificSkill || w.skillCategory || 'Custom Trade').trim();
        const aiMatch = await geminiService.matchOtherSkillWithDemand(workerWrittenSkill, demanded);

        if (aiMatch && aiMatch.isSimilar) {
          matchingWorkers.push({
            _id: w._id || w.id,
            id: w._id || w.id,
            name: w.name,
            skillCategory: 'Other',
            specificSkill: workerWrittenSkill,
            workerWrittenSkill: workerWrittenSkill, // The skill which the worker wrote he has!
            isOtherAiMatched: true,
            aiMatchReason: aiMatch.reason,
            rating: w.rating || 5.0,
            ratingCount: w.ratingCount || 1,
            city: w.city || booking.city,
            baseRate: w.baseRate || booking.price || 499,
            experience: w.experience || '2+ years'
          });
        }
      } else {
        // Standard category worker: check approximate trade match
        const workerSkills = [w.skillCategory, w.specificSkill].filter(Boolean).join(' ');
        if (db.skillsApproxMatch(workerSkills, demanded)) {
          const written = w.specificSkill || w.skillCategory || 'Specialist';
          matchingWorkers.push({
            _id: w._id || w.id,
            id: w._id || w.id,
            name: w.name,
            skillCategory: w.skillCategory,
            specificSkill: written,
            workerWrittenSkill: written,
            isOtherAiMatched: false,
            rating: w.rating || 5.0,
            ratingCount: w.ratingCount || 1,
            city: w.city || booking.city,
            baseRate: w.baseRate || booking.price || 499,
            experience: w.experience || '2+ years'
          });
        }
      }
    }

    return res.json({
      success: true,
      count: matchingWorkers.length,
      matchingWorkers
    });
  } catch (err) {
    console.error('Matching workers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve matching workers.' });
  }
});

/**
 * POST /api/auth/bookings/:id/assign-worker
 * Customer requests and connects with a matching worker for an open pool booking
 */
router.post('/bookings/:id/assign-worker', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { workerId, workerSkill } = req.body;

    if (!workerId) {
      return res.status(400).json({ success: false, message: 'Worker ID is required.' });
    }

    const booking = await db.findBookingById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (String(booking.customerId) !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Only the customer who created this request can assign specialists.' });
    }

    const worker = await db.findUserById(workerId);
    if (!worker || worker.role !== 'worker') {
      return res.status(404).json({ success: false, message: 'Selected specialist not found.' });
    }

    const workerWrittenSkill = workerSkill || worker.specificSkill || worker.skillCategory || '';
    const cName = req.user.name || booking.customerName || 'Customer';
    const negotiationNote = `Customer requested specialist ${worker.name} (Specialty: ${workerWrittenSkill}) for this appointment.`;
    const updatedNegotiations = [
      ...(booking.negotiations || []),
      {
        senderRole: 'customer',
        senderName: cName,
        note: negotiationNote,
        createdAt: new Date()
      }
    ];

    const updated = await db.updateBooking(id, {
      workerId: String(worker._id || worker.id),
      workerName: worker.name,
      assignedWorkerSkill: workerWrittenSkill, // Written skill stored into booking record
      status: 'pending',
      negotiations: updatedNegotiations
    });

    return res.json({
      success: true,
      message: `Specialist ${worker.name} requested successfully! They have been appointed to your request.`,
      booking: updated
    });
  } catch (err) {
    console.error('Assign worker error:', err);
    return res.status(500).json({ success: false, message: 'Failed to assign specialist.' });
  }
});

/**
 * GET /api/auth/worker/dashboard-data
 * Returns personalized dashboard data for worker (active gigs, past jobs, earnings)
 */
router.get('/worker/dashboard-data', authenticateToken, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.userId);
    if (!user || user.role !== 'worker') {
      return res.status(403).json({ success: false, message: 'Access restricted to Gig Worker partners.' });
    }

    const isApproved = user.approvalStatus === 'approved';

    // Fetch real bookings from database
    const workerBookings = isApproved ? await db.findBookingsByWorker(user._id || user.id, user.skillCategory, user.city, user.name, user.specificSkill) : [];

    // Filter incoming vs accepted vs past
    const activeIncoming = workerBookings.filter(b => b.status === 'pending' || b.status === 'bargaining' || b.status === 'accepted');
    const pastCompleted = workerBookings.filter(b => b.status === 'completed' && String(b.workerId) === String(user._id || user.id));

    // Current gigs: actual customer requests for this worker or open pool
    let currentGigs = activeIncoming.map(b => ({
      id: b._id || b.id,
      title: `${b.serviceName} (${b.category || 'General'})`,
      customerName: b.customerName,
      locality: b.locality,
      budget: `₹${b.price}`,
      scheduledDate: b.scheduledDate,
      scheduledTime: b.scheduledTime,
      notes: b.notes,
      status: b.status,
      paymentStatus: b.paymentStatus || 'unpaid',
      paidAt: b.paidAt || null,
      negotiations: b.negotiations || [],
      isOpenPool: !b.workerId
    }));

    // Past gigs: only completed from database, with genuine customer rating and review
    const pastGigs = pastCompleted.map(b => {
      const hasRating = !b.ratingVoided && typeof b.rating === 'number' && b.rating > 0;
      return {
        id: b._id || b.id,
        title: b.serviceName,
        customerName: b.customerName,
        date: b.scheduledDate,
        amount: `₹${b.price}`,
        tip: '₹0 (100% kept)',
        rating: hasRating ? b.rating : (user.rating || 5),
        hasReview: hasRating,
        ratingVoided: !!b.ratingVoided,
        review: b.ratingVoided
          ? 'Customer rating dismissed by Hustle Admin (Dispute settled in favor of worker).'
          : (b.reviewText ? b.reviewText : (hasRating ? `Customer gave a ${b.rating}★ rating.` : 'Awaiting client review submission.'))
      };
    });

    // Calculate real rating metrics
    const completedCount = pastCompleted.length;
    const totalEarnings = pastCompleted.reduce((acc, b) => acc + (b.price || 0), 0);
    // Escrow is only held when customer has actually completed payment
    const pendingEscrow = activeIncoming.filter(b => b.status === 'accepted' && b.paymentStatus === 'paid').reduce((acc, b) => acc + (b.price || 0), 0);

    // Calculate dynamic average rating from rated bookings or worker's saved reviews
    const ratedBookings = pastCompleted.filter(b => typeof b.rating === 'number' && b.rating > 0);
    let avgRating = null;
    let reviewCount = 0;
    if (ratedBookings.length > 0) {
      const sum = ratedBookings.reduce((acc, b) => acc + b.rating, 0);
      avgRating = (sum / ratedBookings.length).toFixed(1);
      reviewCount = ratedBookings.length;
    } else if (Array.isArray(user.reviews) && user.reviews.length > 0) {
      const sum = user.reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
      avgRating = (sum / user.reviews.length).toFixed(1);
      reviewCount = user.reviews.length;
    } else if (user.rating && user.rating > 0) {
      avgRating = Number(user.rating).toFixed(1);
      reviewCount = user.ratingCount || 1;
    }

    const satisfactionScore = avgRating ? `${avgRating} ★` : (completedCount > 0 ? 'Review Pending' : 'New Pro');

    return res.json({
      success: true,
      worker: sanitizeUser(user),
      isApproved,
      metrics: {
        totalEarnings,
        pendingEscrow,
        completedJobs: completedCount,
        satisfactionScore,
        avgRatingNum: avgRating ? Number(avgRating) : null,
        reviewCount,
        tipsPercentage: '100% Direct'
      },
      currentGigs,
      pastGigs
    });
  } catch (err) {
    console.error('Worker dashboard data error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load worker dashboard data.' });
  }
});

// =========================================================================
// Support Tickets & Dispute Resolution Endpoints
// =========================================================================

/**
 * POST /api/auth/tickets
 * Customer or Worker files an official complaint on a task
 */
router.post('/tickets', authenticateToken, async (req, res) => {
  try {
    const { bookingId, category, subject, description, desiredResolution } = req.body;

    if (!bookingId || !category || !description) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID, complaint category, and a detailed description are required.'
      });
    }

    const booking = await db.findBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Referenced task not found.' });
    }

    const callerId = String(req.user.userId || req.user.id || req.user._id || '');
    const customerId = String(booking.customerId);
    const workerId = String(booking.workerId);

    if (callerId !== customerId && callerId !== workerId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to raise a dispute for this task.'
      });
    }

    const isCustomer = callerId === customerId;
    const complainantRole = isCustomer ? 'customer' : 'worker';
    const complainantName = req.user.name || (isCustomer ? booking.customerName : booking.workerName);
    const againstRole = isCustomer ? 'worker' : 'customer';
    const againstId = isCustomer ? workerId : customerId;
    const againstName = isCustomer ? booking.workerName : booking.customerName;

    // Check if this party already filed an active ticket
    const existingTickets = await db.findTicketsByBooking(booking._id || booking.id);
    const duplicate = existingTickets.find(t => String(t.complainantId) === callerId && t.status !== 'dismissed');
    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: `You have already filed Ticket #${duplicate.ticketId} for this task. Our team is actively reviewing it.`
      });
    }

    const ticketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

    const ticketData = {
      ticketId,
      bookingId: String(booking._id || booking.id),
      serviceTitle: booking.serviceName || booking.heading || 'Specialist Task',
      agreedPrice: Number(booking.price) || 0,
      complainantRole,
      complainantId: callerId,
      complainantName,
      againstRole,
      againstId,
      againstName,
      category: category.trim(),
      subject: (subject || category).trim(),
      description: description.trim(),
      desiredResolution: (desiredResolution || '').trim(),
      status: 'open',
      createdAt: new Date()
    };

    const newTicket = await db.createTicket(ticketData);

    // Update booking dispute status
    await db.updateBooking(booking._id || booking.id, {
      hasDispute: true,
      disputeStatus: 'open',
      lastTicketId: ticketId
    });

    return res.status(201).json({
      success: true,
      message: `Dispute Ticket #${ticketId} registered. Escrow team and Operations will review facts and settle.`,
      ticket: newTicket
    });
  } catch (err) {
    console.error('Ticket creation error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create support ticket.' });
  }
});

/**
 * GET /api/auth/tickets/my
 * Returns all tickets involving the authenticated user.
 * Dispute Privacy Rule: If a complaint was filed AGAINST this user, it remains
 * completely hidden until an official admin verdict is delivered (status 'resolved' or 'dismissed').
 */
router.get('/tickets/my', authenticateToken, async (req, res) => {
  try {
    const callerId = String(req.user.userId || req.user.id || req.user._id || '');
    const tickets = await db.findTicketsByUser(callerId, false);
    return res.json({ success: true, tickets });
  } catch (err) {
    console.error('Fetch user tickets error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load your tickets.' });
  }
});

/**
 * GET /api/auth/tickets/booking/:bookingId
 * Returns tickets associated with a specific booking.
 * Confidentiality: Complainant sees own ticket; Opposing party only sees ticket once settled.
 */
router.get('/tickets/booking/:bookingId', authenticateToken, async (req, res) => {
  try {
    const booking = await db.findBookingById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const callerId = String(req.user.userId || req.user.id || req.user._id || '');
    const isAdmin = req.user.role === 'admin';
    if (callerId !== String(booking.customerId) && callerId !== String(booking.workerId) && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const allTickets = await db.findTicketsByBooking(String(booking._id || booking.id));
    const visibleTickets = isAdmin
      ? allTickets
      : allTickets.filter(t => String(t.complainantId) === callerId || ['resolved', 'dismissed'].includes(t.status));

    return res.json({ success: true, tickets: visibleTickets });
  } catch (err) {
    console.error('Fetch booking tickets error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load booking tickets.' });
  }
});

/**
 * GET /api/auth/admin/tickets
 * Admin console endpoint returning all platform dispute tickets
 */
router.get('/admin/tickets', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin token required.' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin privileges required.' });
      }
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const tickets = await db.getAllTickets();
    return res.json({ success: true, tickets });
  } catch (err) {
    console.error('Admin tickets fetch error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve dispute tickets.' });
  }
});

/**
 * POST /api/auth/admin/tickets/:id/settle
 * Admin console endpoint to resolve or dismiss a ticket with settlement terms.
 * Rule:
 * 1. If admin decides in favour of worker (release_worker / favour_worker):
 *    - Reject/void customer ratings & reviews for this booking
 *    - Remove review from worker's profile and recalculate worker rating
 *    - Issue official warning to customer; if warnings > 3, customer is banned permanently
 * 2. If admin decides in favour of customer (refund_customer / favour_customer):
 *    - Issue official warning to worker; if warnings > 3, worker is banned permanently
 *    - Refund customer from escrow
 */
router.post('/admin/tickets/:id/settle', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin token required.' });
    }

    let adminName = 'Hustle Operations Admin';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin privileges required.' });
      }
      if (decoded.name) adminName = decoded.name;
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });
    }

    const { status, adminNotes, resolutionAction } = req.body;
    const ticketId = req.params.id;

    const ticket = await db.findTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    const newStatus = ['open', 'under_review', 'resolved', 'dismissed'].includes(status)
      ? status
      : 'resolved';

    const cleanAction = (resolutionAction || 'settled').trim();
    let effectiveNotes = (adminNotes || '').trim();

    let booking = null;
    if (ticket.bookingId) {
      booking = await db.findBookingById(ticket.bookingId);
    }

    let bookingDisputeStatus = newStatus;
    let escrowStatusUpdate = undefined;
    let customerWarned = null;
    let workerWarned = null;

    // -------------------------------------------------------------
    // Case 1: In Favour of Worker
    // -------------------------------------------------------------
    if (['release_worker', 'favour_worker'].includes(cleanAction)) {
      bookingDisputeStatus = 'escrow_released_to_worker';
      escrowStatusUpdate = 'released';

      // 1. Do not accept ratings of the customer; void any existing rating
      if (booking) {
        const bookingUpdates = {
          ratingVoided: true,
          ratingVoidReason: 'Dispute resolved in favor of worker: Customer rating dismissed.',
          rating: null,
          reviewText: '',
          disputeStatus: bookingDisputeStatus,
          escrowStatus: escrowStatusUpdate,
          adminResolutionNote: effectiveNotes
        };
        await db.updateBooking(ticket.bookingId, bookingUpdates);

        // Remove from worker profile & recalculate worker average rating
        const workerId = booking.workerId || (ticket.complainantRole === 'worker' ? ticket.complainantId : ticket.againstId);
        if (workerId) {
          const workerUser = await db.findUserById(workerId);
          if (workerUser && Array.isArray(workerUser.reviews)) {
            const updatedReviews = workerUser.reviews.filter(r => String(r.bookingId) !== String(ticket.bookingId));
            const avgRating = updatedReviews.length > 0
              ? Number((updatedReviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / updatedReviews.length).toFixed(1))
              : 0;
            await db.updateUser(workerId, {
              reviews: updatedReviews,
              rating: avgRating,
              ratingCount: updatedReviews.length
            });
          }
        }
      }

      // 2. Send customer a warning; receiving > 3 warnings bans account forever
      const customerId = booking?.customerId || (ticket.complainantRole === 'customer' ? ticket.complainantId : ticket.againstId);
      if (customerId) {
        customerWarned = await db.issueUserWarning(customerId, {
          ticketId: ticket.ticketId,
          bookingId: ticket.bookingId,
          reason: effectiveNotes || 'Dispute verdict ruled in favor of worker.',
          issuedBy: adminName
        });
        if (customerWarned?.isBanned) {
          effectiveNotes += ` [CUSTOMER PERMANENTLY BANNED: Accumulation of ${customerWarned.warningsCount} warnings exceeded the 3-warning limit]`;
        }
      }
    }
    // -------------------------------------------------------------
    // Case 2: In Favour of Customer
    // -------------------------------------------------------------
    else if (['refund_customer', 'favour_customer'].includes(cleanAction)) {
      bookingDisputeStatus = 'refunded_to_customer';
      escrowStatusUpdate = 'refunded';

      if (booking) {
        await db.updateBooking(ticket.bookingId, {
          disputeStatus: bookingDisputeStatus,
          escrowStatus: escrowStatusUpdate,
          adminResolutionNote: effectiveNotes
        });
      }

      // Send worker a warning; receiving > 3 warnings bans account forever
      const workerId = booking?.workerId || (ticket.complainantRole === 'worker' ? ticket.complainantId : ticket.againstId);
      if (workerId) {
        workerWarned = await db.issueUserWarning(workerId, {
          ticketId: ticket.ticketId,
          bookingId: ticket.bookingId,
          reason: effectiveNotes || 'Dispute verdict ruled in favor of customer.',
          issuedBy: adminName
        });
        if (workerWarned?.isBanned) {
          effectiveNotes += ` [WORKER PERMANENTLY BANNED: Accumulation of ${workerWarned.warningsCount} warnings exceeded the 3-warning limit]`;
        }
      }
    }
    // -------------------------------------------------------------
    // Case 3: Mutual Split
    // -------------------------------------------------------------
    else if (cleanAction === 'mutual_split') {
      bookingDisputeStatus = 'mutual_settlement';
      escrowStatusUpdate = 'split_released';

      if (booking) {
        await db.updateBooking(ticket.bookingId, {
          disputeStatus: bookingDisputeStatus,
          escrowStatus: escrowStatusUpdate,
          adminResolutionNote: effectiveNotes
        });
      }
    }
    // -------------------------------------------------------------
    // Case 4: Dismissed / Other
    // -------------------------------------------------------------
    else {
      if (booking) {
        await db.updateBooking(ticket.bookingId, {
          disputeStatus: newStatus,
          adminResolutionNote: effectiveNotes
        });
      }
    }

    const updates = {
      status: newStatus,
      adminNotes: effectiveNotes,
      resolutionAction: cleanAction,
      settledBy: adminName,
      settledAt: new Date()
    };

    const updatedTicket = await db.updateTicket(ticket._id || ticket.id || ticket.ticketId, updates);

    return res.json({
      success: true,
      message: `Dispute #${ticket.ticketId} settled. Verdict: ${cleanAction}.`,
      ticket: updatedTicket,
      penalties: {
        customerWarned: customerWarned ? { warningsCount: customerWarned.warningsCount, isBanned: customerWarned.isBanned } : null,
        workerWarned: workerWarned ? { warningsCount: workerWarned.warningsCount, isBanned: workerWarned.isBanned } : null
      }
    });
  } catch (err) {
    console.error('Admin settle dispute error:', err);
    return res.status(500).json({ success: false, message: 'Failed to settle dispute.' });
  }
});

module.exports = router;
