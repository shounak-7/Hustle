const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    bookingId: {
      type: String,
      required: true,
      index: true
    },
    serviceTitle: {
      type: String,
      default: ''
    },
    agreedPrice: {
      type: Number,
      default: 0
    },
    complainantRole: {
      type: String,
      enum: ['customer', 'worker'],
      required: true
    },
    complainantId: {
      type: String,
      required: true,
      index: true
    },
    complainantName: {
      type: String,
      required: true
    },
    againstRole: {
      type: String,
      enum: ['customer', 'worker'],
      required: true
    },
    againstId: {
      type: String,
      required: true,
      index: true
    },
    againstName: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true
    },
    subject: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      required: true
    },
    desiredResolution: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'dismissed'],
      default: 'open',
      index: true
    },
    adminNotes: {
      type: String,
      default: ''
    },
    resolutionAction: {
      type: String,
      default: ''
    },
    settledBy: {
      type: String,
      default: ''
    },
    settledAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Ticket', ticketSchema);
