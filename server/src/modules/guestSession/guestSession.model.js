import mongoose from 'mongoose';

const guestSessionSchema = new mongoose.Schema(
  {
    credentialHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    associatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.credentialHash;
        return ret;
      },
    },
  }
);

export const GuestSession = mongoose.models.GuestSession || mongoose.model('GuestSession', guestSessionSchema);
