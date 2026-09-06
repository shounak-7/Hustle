const mongoose = require('mongoose');

const negotiationSchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: ['customer', 'worker'],
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    proposedPrice: {
      type: Number,
      default: null
    },
    proposedTime: {
      type: String,
      default: ''
    },
    proposedDate: {
      type: String,
      default: ''
    },
    note: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    serviceId: {
      type: String,
      required: [true, 'Service identifier is required'],
      index: true
    },
    serviceName: {
      type: String,
      required: [true, 'Service name is required']
    },
    category: {
      type: String,
      default: 'General'
    },
    customerId: {
      type: String,
      required: true,
      index: true
    },
    customerName: {
      type: String,
      required: true
    },
    customerPhone: {
      type: String,
      default: ''
    },
    customerEmail: {
      type: String,
      default: ''
    },
    workerId: {
      type: String,
      default: null, // null indicates open pool request
      index: true
    },
    workerName: {
      type: String,
      default: 'Open Pool (Any Pro)'
    },
    locality: {
      type: String,
      default: 'Local Area'
    },
    city: {
      type: String,
      default: 'Bengaluru',
      trim: true,
      index: true
    },
    declinedWorkerIds: {
      type: [String],
      default: []
    },
    scheduledDate: {
      type: String,
      required: true
    },
    scheduledTime: {
      type: String,
      required: true
    },
    notes: {
      type: String,
      default: ''
    },
    price: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'bargaining', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid'],
      default: 'unpaid',
      index: true
    },
    paidAt: {
      type: Date,
      default: null
    },
    paymentMethod: {
      type: String,
      default: ''
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    reviewText: {
      type: String,
      default: ''
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    disputeStatus: {
      type: String,
      default: null
    },
    escrowStatus: {
      type: String,
      default: null
    },
    ratingVoided: {
      type: Boolean,
      default: false
    },
    ratingVoidReason: {
      type: String,
      default: ''
    },
    adminResolutionNote: {
      type: String,
      default: ''
    },
    negotiations: [negotiationSchema]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
