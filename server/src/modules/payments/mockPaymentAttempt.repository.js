import { MockPaymentAttempt } from './mockPaymentAttempt.model.js';

export const mockPaymentAttemptRepository = {
  async create(data) {
    return await MockPaymentAttempt.create(data);
  },

  async findByPaymentAttemptId(paymentAttemptId) {
    if (!paymentAttemptId) return null;
    return await MockPaymentAttempt.findOne({ paymentAttemptId: String(paymentAttemptId).trim() }).exec();
  },

  /**
   * Concurrency-safe atomic state transition.
   * Only transitions if current status matches expectedStatus.
   */
  async updateStatusAtomically(paymentAttemptId, expectedStatus, updateFields) {
    return await MockPaymentAttempt.findOneAndUpdate(
      { paymentAttemptId: String(paymentAttemptId).trim(), status: expectedStatus },
      { $set: updateFields },
      { new: true }
    ).exec();
  },

  async findByJourney({ userId = null, guestSessionId = null }) {
    const conditions = [];
    if (userId) conditions.push({ userId });
    if (guestSessionId) conditions.push({ guestSessionId });
    if (conditions.length === 0) return [];
    return await MockPaymentAttempt.find({ $or: conditions })
      .sort({ createdAt: -1 })
      .exec();
  },
};
