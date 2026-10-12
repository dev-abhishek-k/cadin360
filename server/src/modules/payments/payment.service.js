import { eventService } from '../events/event.service.js';
import { eventRepository } from '../events/event.repository.js';
import { EVENT_TYPES } from '../events/event.constants.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const paymentService = {
  async verifyAndRecordMockPayment(
    {
      paymentId,
      amount,
      currency = 'USD',
      plan = 'Pro',
      occurredAt = null,
      user = null,
      rawGuestCredential = null,
    } = {},
    { eventRepo, guestRepo } = {}
  ) {
    // 1. Validate payment details
    if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Valid paymentId is required');
    }
    const cleanPaymentId = paymentId.trim();

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Payment amount must be a positive number');
    }

    // 2. Resolve identity from server credentials (never browser-supplied overrides)
    const identity = await eventService.resolveIdentity({ user, rawGuestCredential }, guestRepo);

    // 3. Stable eventId prevents duplicate payment events on repeated verification
    const eventId = `pay_evt_${cleanPaymentId}`;
    const repo = eventRepo || eventRepository;

    const existing = await repo.findByEventId(eventId);
    if (existing) {
      return {
        payment: {
          paymentId: cleanPaymentId,
          amount: numericAmount,
          currency,
          plan,
          verified: true,
        },
        duplicate: true,
        event: existing,
      };
    }

    const paymentEventPayload = {
      eventId,
      type: EVENT_TYPES.PAYMENT_COMPLETED,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      canonicalRoute: '/checkout',
      originalRoute: '/checkout',
      source: 'mock_payment_gateway',
      metadata: {
        plan,
        currency,
        amount: numericAmount,
        paymentId: cleanPaymentId,
        verified: true,
        verifiedAt: new Date().toISOString(),
      },
    };

    // 4. Ingest with isBrowser = false (internal trusted server flow)
    const result = await eventService.ingestEvent(
      paymentEventPayload,
      identity,
      { isBrowser: false },
      repo
    );

    return {
      payment: {
        paymentId: cleanPaymentId,
        amount: numericAmount,
        currency,
        plan,
        verified: true,
      },
      ...result,
    };
  },
};
