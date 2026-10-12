import crypto from 'node:crypto';
import { MOCK_PLANS, PAYMENT_STATUS, SIMULATION_OUTCOMES } from './mockPayment.constants.js';
import { mockPaymentAttemptRepository } from './mockPaymentAttempt.repository.js';
import { eventService } from '../events/event.service.js';
import { eventRepository } from '../events/event.repository.js';
import { guestSessionRepository } from '../guestSession/guestSession.repository.js';
import { EVENT_TYPES } from '../events/event.constants.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

function sanitizeAttempt(attempt) {
  if (!attempt) return null;
  const doc = typeof attempt.toObject === 'function' ? attempt.toObject() : { ...attempt };
  const { verificationReference, ...safe } = doc;
  return safe;
}

export const mockPaymentService = {
  getAvailablePlans() {
    return Object.values(MOCK_PLANS);
  },

  assertOwnership(attempt, identity, user = null) {
    if (user?.role === 'admin') return true;

    const matchesUser =
      attempt.userId && identity.userId &&
      attempt.userId.toString() === identity.userId.toString();

    const matchesGuest =
      attempt.guestSessionId && identity.guestSessionId &&
      attempt.guestSessionId.toString() === identity.guestSessionId.toString();

    if (!matchesUser && !matchesGuest) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Access denied: you do not own this payment attempt');
    }
    return true;
  },

  async createAttempt(
    { planId, user = null, rawGuestCredential = null } = {},
    { attemptRepo = mockPaymentAttemptRepository, guestRepo = guestSessionRepository } = {}
  ) {
    // 1. Resolve identity
    const identity = await eventService.resolveIdentity({ user, rawGuestCredential }, guestRepo);

    // 2. Validate plan ID against trusted server plans
    if (!planId || typeof planId !== 'string' || !planId.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'A valid planId is required');
    }
    const cleanPlanId = planId.trim().toLowerCase();
    const planConfig = MOCK_PLANS[cleanPlanId];
    if (!planConfig) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Invalid or unsupported plan: "${cleanPlanId}". Available plans: ${Object.keys(MOCK_PLANS).join(', ')}`
      );
    }

    // 3. Generate unique attempt ID and internal verification reference
    const paymentAttemptId = `pay_att_${crypto.randomUUID()}`;
    const verificationReference = `mock_verif_${crypto.randomUUID()}`;
    const journeyIdentity = identity.userId ? `user_${identity.userId}` : `guest_${identity.guestSessionId}`;

    const newAttemptData = {
      paymentAttemptId,
      journeyIdentity,
      userId: identity.userId || null,
      guestSessionId: identity.guestSessionId || null,
      planId: planConfig.id,
      planName: planConfig.name,
      amount: planConfig.amount, // Authoritative backend amount
      currency: planConfig.currency, // Authoritative backend currency
      status: PAYMENT_STATUS.PENDING,
      verificationReference,
      verifiedAt: null,
      failureReason: null,
      eventId: null,
    };

    const saved = await attemptRepo.create(newAttemptData);
    return sanitizeAttempt(saved);
  },

  async simulateAndVerify(
    {
      paymentAttemptId,
      outcome = SIMULATION_OUTCOMES.SUCCESS,
      simulateFailureReason = null,
      user = null,
      rawGuestCredential = null,
    } = {},
    {
      attemptRepo = mockPaymentAttemptRepository,
      eventRepo = eventRepository,
      guestRepo = guestSessionRepository,
    } = {}
  ) {
    if (!paymentAttemptId || typeof paymentAttemptId !== 'string' || !paymentAttemptId.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Valid paymentAttemptId is required');
    }
    const cleanId = paymentAttemptId.trim();

    // 1. Resolve identity & find attempt
    const identity = await eventService.resolveIdentity({ user, rawGuestCredential }, guestRepo);
    let attempt = await attemptRepo.findByPaymentAttemptId(cleanId);
    if (!attempt) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, `Payment attempt "${cleanId}" not found`);
    }

    // 2. Enforce strict ownership
    this.assertOwnership(attempt, identity, user);

    // 3. Validate simulated outcome
    const cleanOutcome = String(outcome).toLowerCase().trim();
    if (![SIMULATION_OUTCOMES.SUCCESS, SIMULATION_OUTCOMES.FAILURE].includes(cleanOutcome)) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Invalid simulation outcome "${outcome}". Supported: success, failure`
      );
    }

    // 4. Handle finalized attempts (Idempotency and conflict handling)
    if (attempt.status === PAYMENT_STATUS.SUCCEEDED) {
      if (cleanOutcome === SIMULATION_OUTCOMES.SUCCESS) {
        // Idempotent repeat: return existing success result without creating duplicate events
        const existingEvent = attempt.eventId ? await eventRepo.findByEventId(attempt.eventId) : null;
        return {
          duplicate: true,
          success: true,
          verified: true,
          message: 'Payment already verified (idempotent duplicate)',
          data: sanitizeAttempt(attempt),
          event: existingEvent,
        };
      }
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        'Cannot fail an already succeeded and finalized payment attempt'
      );
    }

    if (attempt.status === PAYMENT_STATUS.FAILED) {
      if (cleanOutcome === SIMULATION_OUTCOMES.FAILURE) {
        return {
          duplicate: true,
          success: false,
          verified: false,
          message: 'Payment attempt was already marked as failed',
          data: sanitizeAttempt(attempt),
          event: null,
        };
      }
      throw new ApiError(
        HTTP_STATUS.CONFLICT,
        'Cannot succeed an already failed and finalized payment attempt'
      );
    }

    // 5. Pending attempt processing
    if (cleanOutcome === SIMULATION_OUTCOMES.FAILURE) {
      const reason = simulateFailureReason || 'Card payment declined by mock simulator';
      const updated = await attemptRepo.updateStatusAtomically(cleanId, PAYMENT_STATUS.PENDING, {
        status: PAYMENT_STATUS.FAILED,
        failureReason: reason,
      });

      const finalDoc = updated || (await attemptRepo.findByPaymentAttemptId(cleanId));
      return {
        duplicate: false,
        success: false,
        verified: false,
        message: 'Mock payment simulation resulted in failure',
        data: sanitizeAttempt(finalDoc),
        event: null,
      };
    }

    // 6. Server-Side Mock Verification Flow
    // Validate that the attempt details strictly match trusted server configuration
    const expectedPlan = MOCK_PLANS[attempt.planId];
    if (!expectedPlan || attempt.amount !== expectedPlan.amount || attempt.currency !== expectedPlan.currency) {
      throw new ApiError(
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
        'Server-side payment verification failed: plan or amount mismatch'
      );
    }

    // Concurrency-safe atomic transition: only update if currently pending
    const verifiedAt = new Date();
    const updated = await attemptRepo.updateStatusAtomically(cleanId, PAYMENT_STATUS.PENDING, {
      status: PAYMENT_STATUS.SUCCEEDED,
      verifiedAt,
    });

    if (!updated) {
      // Race condition occurred: check if another thread finalized it as succeeded
      const current = await attemptRepo.findByPaymentAttemptId(cleanId);
      if (current && current.status === PAYMENT_STATUS.SUCCEEDED) {
        const existingEvent = current.eventId ? await eventRepo.findByEventId(current.eventId) : null;
        return {
          duplicate: true,
          success: true,
          verified: true,
          message: 'Payment already verified by concurrent request',
          data: sanitizeAttempt(current),
          event: existingEvent,
        };
      }
      throw new ApiError(HTTP_STATUS.CONFLICT, 'Payment attempt state conflict during verification');
    }

    // 7. Create trusted verified payment_completed event
    const eventId = `pay_evt_${cleanId}`;
    const paymentEventPayload = {
      eventId,
      type: EVENT_TYPES.PAYMENT_COMPLETED,
      occurredAt: verifiedAt,
      canonicalRoute: '/plans',
      originalRoute: '/plans',
      source: 'mock_payment_gateway',
      metadata: {
        paymentAttemptId: cleanId,
        planId: attempt.planId,
        planName: attempt.planName,
        amount: attempt.amount,
        currency: attempt.currency,
        verified: true,
        verifiedAt: verifiedAt.toISOString(),
      },
    };

    // Ingest event with isBrowser: false (trusted internal flow)
    const ingestResult = await eventService.ingestEvent(
      paymentEventPayload,
      identity,
      { isBrowser: false },
      eventRepo
    );

    // Save eventId reference on attempt doc
    if (typeof attemptRepo.updateById === 'function') {
      await attemptRepo.updateById(updated._id, { eventId });
    } else {
      updated.eventId = eventId;
      if (typeof updated.save === 'function') await updated.save();
    }

    const finalAttempt = await attemptRepo.findByPaymentAttemptId(cleanId);

    return {
      duplicate: false,
      success: true,
      verified: true,
      message: 'Mock payment verified successfully and payment_completed event recorded',
      data: sanitizeAttempt(finalAttempt || updated),
      event: ingestResult.event,
    };
  },

  async getAttemptStatus(
    { paymentAttemptId, user = null, rawGuestCredential = null } = {},
    { attemptRepo = mockPaymentAttemptRepository, guestRepo = guestSessionRepository } = {}
  ) {
    if (!paymentAttemptId || typeof paymentAttemptId !== 'string' || !paymentAttemptId.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Valid paymentAttemptId is required');
    }
    const cleanId = paymentAttemptId.trim();

    const identity = await eventService.resolveIdentity({ user, rawGuestCredential }, guestRepo);
    const attempt = await attemptRepo.findByPaymentAttemptId(cleanId);
    if (!attempt) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, `Payment attempt "${cleanId}" not found`);
    }

    this.assertOwnership(attempt, identity, user);
    return sanitizeAttempt(attempt);
  },
};
