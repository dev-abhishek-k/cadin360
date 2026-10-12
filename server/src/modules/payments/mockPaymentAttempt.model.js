import mongoose from 'mongoose';
import { PAYMENT_STATUS } from './mockPayment.constants.js';

const mockPaymentAttemptSchema = new mongoose.Schema(
  {
    paymentAttemptId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    journeyIdentity: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    guestSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuestSession',
      default: null,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      trim: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    verificationReference: {
      type: String,
      required: true,
      trim: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
      trim: true,
    },
    eventId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes
mockPaymentAttemptSchema.index({ userId: 1, createdAt: -1 });
mockPaymentAttemptSchema.index({ guestSessionId: 1, createdAt: -1 });
mockPaymentAttemptSchema.index({ status: 1, createdAt: -1 });

export const MockPaymentAttempt = mongoose.model('MockPaymentAttempt', mockPaymentAttemptSchema);
