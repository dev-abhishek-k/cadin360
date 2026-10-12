import { paymentService } from './payment.service.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const paymentController = {
  async verifyMockPayment(req, res) {
    const rawGuestCredential =
      req.headers['x-guest-session-credential'] || req.body?.guestCredential;

    const result = await paymentService.verifyAndRecordMockPayment({
      paymentId: req.body?.paymentId,
      amount: req.body?.amount,
      currency: req.body?.currency,
      plan: req.body?.plan,
      occurredAt: req.body?.occurredAt,
      user: req.user,
      rawGuestCredential,
    });

    const statusCode = result.duplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED;

    res.status(statusCode).json({
      success: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? 'Payment already verified (idempotent duplicate request)'
        : 'Payment successfully verified and event recorded',
      data: result.event,
      payment: result.payment,
    });
  },
};
