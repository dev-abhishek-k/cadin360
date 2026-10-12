import crypto from 'node:crypto';
import { guestSessionRepository } from './guestSession.repository.js';
import { userRepository } from '../auth/user.repository.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export function sanitizeGuestSession(session) {
  if (!session) return null;
  return {
    id: session._id ? session._id.toString() : session.id ? session.id.toString() : String(session),
    associatedUserId: session.associatedUserId
      ? session.associatedUserId._id
        ? session.associatedUserId._id.toString()
        : session.associatedUserId.toString()
      : null,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

export const guestSessionService = {
  generateCredential() {
    return crypto.randomBytes(32).toString('hex');
  },

  hashCredential(rawCredential) {
    if (!rawCredential || typeof rawCredential !== 'string') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid guest credential format');
    }
    return crypto.createHash('sha256').update(rawCredential.trim()).digest('hex');
  },

  async createSession(repo = guestSessionRepository) {
    const rawCredential = this.generateCredential();
    const credentialHash = this.hashCredential(rawCredential);

    const session = await repo.create({
      credentialHash,
      associatedUserId: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day lifecycle
    });

    return {
      guestSession: sanitizeGuestSession(session),
      guestCredential: rawCredential,
    };
  },

  /**
   * Reusable Module 3 association service:
   * Associates an unowned guest session with an authenticated user.
   * Concurrency-safe, idempotent for identical user, rejects conflicting claims.
   */
  async associateGuestSessionWithUser(
    rawCredential,
    userId,
    { userRepo = userRepository, guestRepo = guestSessionRepository } = {}
  ) {
    if (!rawCredential || typeof rawCredential !== 'string' || !rawCredential.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Guest credential is required');
    }
    if (!userId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'User ID is required for association');
    }

    const targetUserIdStr = userId._id ? userId._id.toString() : userId.toString();

    // 1. Verify that the authenticated user exists
    const user = await userRepo.findById(targetUserIdStr);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Authenticated user not found');
    }

    // 2. Validate guest credential & look up session
    const credentialHash = this.hashCredential(rawCredential);
    const existing = await guestRepo.findByCredentialHash(credentialHash);

    if (!existing) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Guest session not found');
    }

    if (existing.revokedAt) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Guest session has been revoked');
    }

    if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Guest session has expired');
    }

    // 3. Ownership evaluation
    if (existing.associatedUserId) {
      const currentOwnerStr = existing.associatedUserId._id
        ? existing.associatedUserId._id.toString()
        : existing.associatedUserId.toString();

      if (currentOwnerStr === targetUserIdStr) {
        // Safe, idempotent success for repeated association
        return {
          guestSession: sanitizeGuestSession(existing),
          associated: true,
          alreadyAssociated: true,
        };
      }

      // Rejection: already claimed by another user
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Guest session is already claimed by another user');
    }

    // 4. Concurrency-safe atomic claim
    const claimed = await guestRepo.claimSessionAtomically(credentialHash, targetUserIdStr);
    if (!claimed) {
      // Recheck in case a concurrent request by the same user succeeded in the same millisecond
      const recheck = await guestRepo.findByCredentialHash(credentialHash);
      if (
        recheck &&
        recheck.associatedUserId &&
        recheck.associatedUserId.toString() === targetUserIdStr
      ) {
        return {
          guestSession: sanitizeGuestSession(recheck),
          associated: true,
          alreadyAssociated: true,
        };
      }
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Guest session is already claimed by another user');
    }

    return {
      guestSession: sanitizeGuestSession(claimed),
      associated: true,
      alreadyAssociated: false,
    };
  },

  // Backward-compatible alias for Modules 1 & 2
  async associateSession(rawCredential, userId, repo = guestSessionRepository) {
    return await this.associateGuestSessionWithUser(rawCredential, userId, { guestRepo: repo });
  },

  async getSessionByCredential(rawCredential, repo = guestSessionRepository) {
    if (!rawCredential) return null;
    const credentialHash = this.hashCredential(rawCredential);
    const session = await repo.findByCredentialHash(credentialHash);
    if (!session || session.revokedAt) return null;
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) return null;

    return sanitizeGuestSession(session);
  },
};

