import { mockPaymentService } from './mockPayment.service.js';
import { apiResponse } from '../../shared/utils/ApiResponse.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const mockPaymentController = {
  getPlans(_req, res) {
    const plans = mockPaymentService.getAvailablePlans();
    res.status(HTTP_STATUS.OK).json(
      apiResponse(true, 'Available mock plans retrieved', {
        plans,
        data: plans,
      })
    );
  },

  async createAttempt(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.body?.guestCredential;

    const data = await mockPaymentService.createAttempt({
      planId: req.body?.planId,
      user: req.user,
      rawGuestCredential,
    });

    res.status(HTTP_STATUS.CREATED).json(
      apiResponse(true, 'Mock payment attempt created successfully', {
        ...data,
        data,
      })
    );
  },

  async simulatePayment(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.body?.guestCredential;

    const result = await mockPaymentService.simulateAndVerify({
      paymentAttemptId: req.params.paymentAttemptId,
      outcome: req.body?.outcome,
      simulateFailureReason: req.body?.simulateFailureReason,
      user: req.user,
      rawGuestCredential,
    });

    res.status(HTTP_STATUS.OK).json({
      success: result.success,
      duplicate: result.duplicate,
      verified: result.verified,
      message: result.message,
      data: result.data,
      paymentAttempt: result.data,
      event: result.event,
    });
  },

  async getAttemptStatus(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.query?.guestCredential;

    const data = await mockPaymentService.getAttemptStatus({
      paymentAttemptId: req.params.paymentAttemptId,
      user: req.user,
      rawGuestCredential,
    });

    res.status(HTTP_STATUS.OK).json(
      apiResponse(true, 'Payment attempt status retrieved', {
        ...data,
        data,
      })
    );
  },
};
