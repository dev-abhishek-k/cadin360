import mongoose from 'mongoose';
import { EVENT_TYPES, EVENT_LIMITS } from './event.constants.js';

const eventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: [true, 'eventId is required'],
      unique: true,
      trim: true,
      maxlength: [EVENT_LIMITS.EVENT_ID_MAX_LENGTH, `eventId cannot exceed ${EVENT_LIMITS.EVENT_ID_MAX_LENGTH} characters`],
    },
    type: {
      type: String,
      required: [true, 'type is required'],
      enum: {
        values: Object.values(EVENT_TYPES),
        message: 'Unsupported event type: {VALUE}',
      },
    },
    occurredAt: {
      type: Date,
      required: [true, 'occurredAt is required'],
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    canonicalRoute: {
      type: String,
      required: [true, 'canonicalRoute is required'],
      trim: true,
      maxlength: [EVENT_LIMITS.ROUTE_MAX_LENGTH, `canonicalRoute cannot exceed ${EVENT_LIMITS.ROUTE_MAX_LENGTH} characters`],
    },
    originalRoute: {
      type: String,
      trim: true,
      maxlength: [EVENT_LIMITS.ROUTE_MAX_LENGTH, `originalRoute cannot exceed ${EVENT_LIMITS.ROUTE_MAX_LENGTH} characters`],
    },
    canonicalLabel: {
      type: String,
      trim: true,
    },
    exerciseName: {
      type: String,
      trim: true,
      maxlength: [EVENT_LIMITS.EXERCISE_NAME_MAX_LENGTH, `exerciseName cannot exceed ${EVENT_LIMITS.EXERCISE_NAME_MAX_LENGTH} characters`],
    },
    source: {
      type: String,
      trim: true,
      maxlength: [EVENT_LIMITS.SOURCE_MAX_LENGTH, `source cannot exceed ${EVENT_LIMITS.SOURCE_MAX_LENGTH} characters`],
    },
    guestSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuestSession',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    paymentVerification: {
      paymentId: { type: String, trim: true },
      amount: { type: Number },
      currency: { type: String, default: 'USD' },
      verifiedAt: { type: Date },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes supporting deterministic chronological sorting & journey queries
eventSchema.index({ occurredAt: 1, eventId: 1 });
eventSchema.index({ userId: 1, occurredAt: 1, eventId: 1 });
eventSchema.index({ guestSessionId: 1, occurredAt: 1, eventId: 1 });

export const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);
