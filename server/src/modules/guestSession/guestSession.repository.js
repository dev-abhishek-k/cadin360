import mongoose from 'mongoose';
import { GuestSession } from './guestSession.model.js';

export const guestSessionRepository = {
  async create(data) {
    return await GuestSession.create(data);
  },

  async findByCredentialHash(credentialHash) {
    return await GuestSession.findOne({ credentialHash }).select('+credentialHash').exec();
  },

  async findById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await GuestSession.findById(id).exec();
  },

  async claimSessionAtomically(credentialHash, userId) {
    return await GuestSession.findOneAndUpdate(
      {
        credentialHash,
        associatedUserId: null,
      },
      {
        $set: { associatedUserId: userId },
      },
      { new: true }
    ).exec();
  },

  async findByUserId(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }
    return await GuestSession.find({ associatedUserId: userId }).exec();
  },

  async revoke(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await GuestSession.findByIdAndUpdate(
      id,
      { $set: { revokedAt: new Date() } },
      { new: true }
    ).exec();
  },
};

