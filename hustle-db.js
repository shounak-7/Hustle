/**
 * Hustle Database Layer (HustleDB)
 * High-performance, persistent IndexedDB storage with localStorage redundancy,
 * user indexing, credentials validation, and OTP verification for password resets.
 */

const HustleDB = (function () {
  const DB_NAME = 'HustleAppDB';
  const DB_VERSION = 1;
  const USER_STORE = 'users';
  const OTP_STORE = 'otps';

  let dbInstance = null;

  // Initial Seed Users for Realistic Demo & Immediate Sign-in
  const SEED_USERS = [
    {
      id: 1,
      name: 'Aditi Sharma',
      email: 'customer@hustle.local',
      phone: '9876500001',
      password: 'password123',
      role: 'customer',
      createdAt: '2026-08-01T10:00:00.000Z'
    },
    {
      id: 2,
      name: 'Ravi Kumar',
      email: 'worker@hustle.local',
      phone: '9876500002',
      password: 'password123',
      role: 'worker',
      skillCategory: 'Home Care & Cleaning',
      specificSkill: 'Deep Home Cleaning Specialist',
      experience: '3–5 years',
      locality: 'Indiranagar, Bengaluru',
      bio: 'Over 4 years of residential cleaning and sanitization expertise.',
      createdAt: '2026-08-02T11:00:00.000Z'
    },
    {
      id: 3,
      name: 'Arjun Mehta',
      email: 'arjun@hustle.local',
      phone: '9876543210',
      password: 'password123',
      role: 'worker',
      skillCategory: 'Plumbing & Repairs',
      specificSkill: 'Home Repair Specialist',
      experience: '5–10 years',
      locality: 'Whitefield, Bengaluru',
      bio: 'Licensed home repair pro with 142 completed jobs on Hustle.',
      createdAt: '2026-07-15T09:30:00.000Z'
    },
    {
      id: 4,
      name: 'Naina Kapoor',
      email: 'naina@hustle.local',
      phone: '9876543211',
      password: 'password123',
      role: 'worker',
      skillCategory: 'Beauty & Wellness',
      specificSkill: 'Makeup Artist & Stylist',
      experience: '3–5 years',
      locality: 'Bandra West, Mumbai',
      bio: 'Certified styling & at-home salon care pro with 88 completed jobs.',
      createdAt: '2026-07-18T14:15:00.000Z'
    },
    {
      id: 5,
      name: 'Karan Bhat',
      email: 'karan@hustle.local',
      phone: '9876543212',
      password: 'password123',
      role: 'worker',
      skillCategory: 'Tutoring & Academics',
      specificSkill: 'Maths & Science Tutor',
      experience: '5–10 years',
      locality: 'Koramangala, Bengaluru',
      bio: 'Master in Mathematics, top-rated STEM tutor for grades 6–12.',
      createdAt: '2026-07-20T16:45:00.000Z'
    }
  ];

  function syncToLocalStorage(usersList) {
    try {
      localStorage.setItem('hustleUsers', JSON.stringify(usersList));
    } catch {
      // ignore storage quota issues
    }
  }

  function getFromLocalStorage() {
    try {
      return JSON.parse(localStorage.getItem('hustleUsers') || '[]');
    } catch {
      return [];
    }
  }

  function openDatabase() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Users Object Store
        if (!db.objectStoreNames.contains(USER_STORE)) {
          const userStore = db.createObjectStore(USER_STORE, { keyPath: 'id', autoIncrement: true });
          userStore.createIndex('email', 'email', { unique: true });
          userStore.createIndex('phone', 'phone', { unique: false });
          userStore.createIndex('role', 'role', { unique: false });
        }

        // OTPs Object Store
        if (!db.objectStoreNames.contains(OTP_STORE)) {
          const otpStore = db.createObjectStore(OTP_STORE, { keyPath: 'id', autoIncrement: true });
          otpStore.createIndex('target', 'target', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        dbInstance = event.target.result;
        // Check if database needs seeding
        await seedDatabaseIfEmpty();
        resolve(dbInstance);
      };

      request.onerror = () => {
        console.warn('IndexedDB open error, using localStorage fallback');
        resolve(null);
      };
    });
  }

  async function seedDatabaseIfEmpty() {
    const users = await getAllUsersFromDB();
    if (!users || users.length === 0) {
      const localUsers = getFromLocalStorage();
      const toSeed = localUsers.length > 0 ? localUsers : SEED_USERS;
      for (const user of toSeed) {
        await insertUserToIndexedDB(user);
      }
      syncToLocalStorage(toSeed);
    } else {
      syncToLocalStorage(users);
    }
  }

  function insertUserToIndexedDB(user) {
    if (!dbInstance) return Promise.resolve(user);

    return new Promise((resolve, reject) => {
      try {
        const tx = dbInstance.transaction([USER_STORE], 'readwrite');
        const store = tx.objectStore(USER_STORE);
        const req = store.put(user);
        req.onsuccess = (e) => {
          user.id = e.target.result;
          resolve(user);
        };
        req.onerror = () => resolve(user);
      } catch {
        resolve(user);
      }
    });
  }

  function getAllUsersFromDB() {
    if (!dbInstance) return Promise.resolve(getFromLocalStorage());

    return new Promise((resolve) => {
      try {
        const tx = dbInstance.transaction([USER_STORE], 'readonly');
        const store = tx.objectStore(USER_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(getFromLocalStorage());
      } catch {
        resolve(getFromLocalStorage());
      }
    });
  }

  // Public API
  return {
    async init() {
      await openDatabase();
    },

    async getAllUsers() {
      await openDatabase();
      const users = await getAllUsersFromDB();
      syncToLocalStorage(users);
      return users;
    },

    async findUserByIdentifier(identifier) {
      if (!identifier) return null;
      const term = identifier.trim().toLowerCase();
      const cleanPhone = term.replace(/\D/g, '');
      const users = await this.getAllUsers();

      return users.find((u) => {
        const uEmail = (u.email || '').toLowerCase();
        const uPhone = (u.phone || '').replace(/\D/g, '');
        return uEmail === term || (cleanPhone.length >= 7 && uPhone === cleanPhone);
      }) || null;
    },

    async registerUser(userData) {
      await openDatabase();
      const users = await this.getAllUsers();

      const email = (userData.email || '').trim().toLowerCase();
      const cleanPhone = (userData.phone || '').replace(/\D/g, '');

      // Check unique constraint
      const existing = users.find((u) => {
        const uEmail = (u.email || '').toLowerCase();
        const uPhone = (u.phone || '').replace(/\D/g, '');
        return uEmail === email || (cleanPhone && uPhone === cleanPhone);
      });

      if (existing) {
        throw new Error('An account with this email address or phone number already exists.');
      }

      const newUser = {
        name: userData.name.trim(),
        email,
        phone: userData.phone.trim(),
        password: userData.password,
        role: userData.role || 'customer',
        skillCategory: userData.skillCategory || '',
        specificSkill: userData.specificSkill || '',
        experience: userData.experience || '',
        locality: userData.locality || '',
        bio: userData.bio || '',
        documentFile: userData.documentFile || '',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      await insertUserToIndexedDB(newUser);
      users.push(newUser);
      syncToLocalStorage(users);

      return newUser;
    },

    async authenticate(identifier, password) {
      await openDatabase();
      const user = await this.findUserByIdentifier(identifier);

      if (!user) {
        throw new Error('No account found matching this email or phone number.');
      }

      if (user.password !== password) {
        throw new Error('Incorrect password. Please verify your credentials or reset your password.');
      }

      user.lastLogin = new Date().toISOString();
      await insertUserToIndexedDB(user);

      const users = await getAllUsersFromDB();
      syncToLocalStorage(users);

      return user;
    },

    async generatePasswordResetOTP(identifier) {
      await openDatabase();
      const user = await this.findUserByIdentifier(identifier);

      if (!user) {
        throw new Error('We could not find an account associated with this email or phone number.');
      }

      // Generate a realistic 6-digit OTP
      const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
      const otpRecord = {
        target: identifier.trim().toLowerCase(),
        otpCode: generatedOtp,
        expiresAt: Date.now() + 10 * 60 * 1000,
        used: false,
        createdAt: new Date().toISOString()
      };

      if (dbInstance) {
        try {
          const tx = dbInstance.transaction([OTP_STORE], 'readwrite');
          tx.objectStore(OTP_STORE).put(otpRecord);
        } catch {
          // fallback
        }
      }

      // Save last active OTP in sessionStorage for instant verification
      sessionStorage.setItem('hustleLastOtp', JSON.stringify(otpRecord));

      return {
        success: true,
        userName: user.name,
        target: identifier,
        otp: generatedOtp
      };
    },

    async resetPasswordWithOTP(identifier, enteredOtp, newPassword) {
      await openDatabase();
      const user = await this.findUserByIdentifier(identifier);

      if (!user) {
        throw new Error('User account not found.');
      }

      if (!newPassword || newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long.');
      }

      // Verify OTP (Check sessionStorage or default accepted verification code 123456)
      let storedOtpData = null;
      try {
        storedOtpData = JSON.parse(sessionStorage.getItem('hustleLastOtp') || 'null');
      } catch {
        storedOtpData = null;
      }

      const isValidOtp =
        enteredOtp === '123456' ||
        (storedOtpData && storedOtpData.otpCode === enteredOtp.trim());

      if (!isValidOtp) {
        throw new Error('Invalid OTP code. Please enter the 6-digit code shown or use 123456.');
      }

      // Update password in database
      user.password = newPassword;
      user.updatedAt = new Date().toISOString();

      await insertUserToIndexedDB(user);
      const users = await getAllUsersFromDB();
      syncToLocalStorage(users);
      sessionStorage.removeItem('hustleLastOtp');

      return {
        success: true,
        user
      };
    },

    async loginWithGoogle(role) {
      await openDatabase();
      let googleUser;
      if (role === 'worker') {
        googleUser = {
          name: 'Arjun Mehta (Google Pro)',
          email: 'arjun.pro@gmail.com',
          phone: '9876543210',
          password: 'google_oauth_verified',
          role: 'worker',
          skillCategory: 'Plumbing & Repairs',
          specificSkill: 'Home Repair Specialist',
          experience: '5–10 years',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        };
      } else {
        googleUser = {
          name: 'Priya Sharma (Google)',
          email: 'priya.sharma@gmail.com',
          phone: '9876512345',
          password: 'google_oauth_verified',
          role: 'customer',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString()
        };
      }

      const existing = await this.findUserByIdentifier(googleUser.email);
      if (!existing) {
        await insertUserToIndexedDB(googleUser);
        const users = await getAllUsersFromDB();
        syncToLocalStorage(users);
      }

      return existing || googleUser;
    }
  };
})();

// Auto-initialize on load
if (typeof window !== 'undefined') {
  HustleDB.init();
}
