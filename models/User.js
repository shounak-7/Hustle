const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    role: {
      type: String,
      enum: ['customer', 'worker', 'admin'],
      default: 'customer',
      index: true
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    approvedAt: {
      type: Date,
      default: null
    },
    approvedBy: {
      type: String,
      default: ''
    },
    completedJobsCount: {
      type: Number,
      default: 0
    },
    earningsTotal: {
      type: Number,
      default: 0
    },
    earningsPending: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      default: 0
    },
    ratingCount: {
      type: Number,
      default: 0
    },
    reviews: {
      type: Array,
      default: []
    },
    skillCategory: {
      type: String,
      default: ''
    },
    specificSkill: {
      type: String,
      default: ''
    },
    experience: {
      type: String,
      default: ''
    },
    locality: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      default: 'Bengaluru',
      trim: true
    },
    customCity: {
      type: String,
      default: '',
      trim: true
    },
    documentFile: {
      type: String,
      default: ''
    },
    supportingDocUrl: {
      type: String,
      default: ''
    },
    documentSize: {
      type: String,
      default: ''
    },
    googleId: {
      type: String,
      default: null
    },
    warningsCount: {
      type: Number,
      default: 0
    },
    warnings: {
      type: Array,
      default: []
    },
    isBanned: {
      type: Boolean,
      default: false,
      index: true
    },
    bannedAt: {
      type: Date,
      default: null
    },
    banReason: {
      type: String,
      default: ''
    },
    lastLogin: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Method to return sanitized public profile (omit password)
userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
