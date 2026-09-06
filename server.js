require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./services/db');
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve dynamic config for Google Maps from environment variable (protects API keys from git)
app.get('/maps-config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.HUSTLE_GOOGLE_MAPS_KEY = '${process.env.GOOGLE_MAPS_KEY || ''}';\n`);
});

// Serve static frontend files directly from current directory
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);

// Seed initial demo accounts if not present
async function seedInitialUsers() {
  try {
    // 1. Seed / Sync Admin from environment variables
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const oldLegacyAdmin = await db.findUserByEmail('admin@hustle.local');
      if (oldLegacyAdmin && oldLegacyAdmin.email !== adminEmail) {
        await db.deleteUser(oldLegacyAdmin.id || oldLegacyAdmin._id);
      }

      const existingAdmin = await db.findUserByEmail(adminEmail);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);
      if (!existingAdmin) {
        await db.createUser({
          name: 'Hustle Operations Admin',
          email: adminEmail,
          phone: '9000000000',
          password: hashedPassword,
          role: 'admin',
          lastLogin: new Date()
        });
        console.log('[Seed] Admin account initialized.');
      } else {
        await db.updateUser(existingAdmin.id || existingAdmin._id, {
          password: hashedPassword,
          role: 'admin'
        });
        console.log('[Seed] Admin credentials verified and synchronized.');
      }
    }

    // 2. Seed Customer
    const existingCustomer = await db.findUserByEmail('customer@hustle.local');
    if (!existingCustomer) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      await db.createUser({
        name: 'Aarav Sharma',
        email: 'customer@hustle.local',
        phone: '9876543210',
        password: hashedPassword,
        role: 'customer',
        lastLogin: new Date()
      });
      console.log('[Seed] Demo customer seeded: customer@hustle.local (password: password123)');
    }

    // 3. Seed Approved Pro Worker
    const existingWorker = await db.findUserByEmail('worker@hustle.local');
    if (!existingWorker) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('password123', salt);
      await db.createUser({
        name: 'Ramesh Kumar',
        email: 'worker@hustle.local',
        phone: '9876543211',
        password: hashedPassword,
        role: 'worker',
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: 'Hustle Operations Staff',
        completedJobsCount: 0,
        earningsTotal: 0,
        earningsPending: 0,
        skillCategory: 'electrician',
        specificSkill: 'Home wiring, inverter setup & MCB installation',
        experience: '4',
        city: 'Bengaluru',
        locality: 'Indiranagar, Bangalore',
        bio: 'Certified electrician with 4+ years of on-demand servicing experience.',
        lastLogin: new Date()
      });
      console.log('[Seed] Demo worker seeded: worker@hustle.local (password: password123, status: approved)');
    } else if (!existingWorker.approvalStatus || existingWorker.completedJobsCount > 0) {
      await db.updateUser(existingWorker._id || existingWorker.id, {
        approvalStatus: 'approved',
        approvedAt: new Date(),
        completedJobsCount: 0,
        earningsTotal: 0,
        earningsPending: 0,
        city: existingWorker.city || 'Bengaluru'
      });
    }
  } catch (err) {
    console.warn('[Seed] Note during seed check:', err.message);
  }
}

// Fallback route for SPA / direct html navigation
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'terms.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/welcome', (req, res) => {
  res.sendFile(path.join(__dirname, 'welcome.html'));
});

app.get('/customer-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'customer-dashboard.html'));
});

app.get('/worker-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'worker-dashboard.html'));
});

// Dedicated Operations & Staff Admin Portal
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Start server
async function startServer() {
  await db.connectDB();
  await seedInitialUsers();

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Hustle Backend Server running on http://localhost:${PORT}`);
    console.log(`📡 Auth API mounted at http://localhost:${PORT}/api/auth`);
    console.log(`🔑 Google OAuth Client: ${process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.slice(0, 25) + '...' : 'Not Configured'}`);
    console.log(`====================================================`);
  });
}

startServer();

module.exports = app;
