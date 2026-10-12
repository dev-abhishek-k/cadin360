import { guestSessionService } from './guestSession.service.js';
import { apiResponse } from '../../shared/utils/ApiResponse.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const guestSessionController = {
  async create(_req, res) {
    const result = await guestSessionService.createSession();
    res.status(HTTP_STATUS.CREATED).json(
      apiResponse(true, 'Guest session created successfully', {
        guestSession: result.guestSession,
        guestCredential: result.guestCredential,
        data: {
          guestSession: result.guestSession,
          guestCredential: result.guestCredential,
        },
      })
    );
  },

  async getCurrent(req, res) {
    const rawCredential =
      req.headers['x-guest-session-credential'] || req.query.credential || req.body?.guestCredential;

    if (!rawCredential) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        apiResponse(false, 'Guest credential header (x-guest-session-credential) is required')
      );
    }

    const session = await guestSessionService.getSessionByCredential(rawCredential);
    if (!session) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        apiResponse(false, 'Guest session not found or expired')
      );
    }

    res.status(HTTP_STATUS.OK).json(
      apiResponse(true, 'Guest session retrieved successfully', {
        guestSession: session,
        data: { guestSession: session },
      })
    );
  },

  async associate(req, res) {
    const rawCredential =
      req.headers['x-guest-session-credential'] || req.body?.guestCredential;

    if (!rawCredential || typeof rawCredential !== 'string' || !rawCredential.trim()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        apiResponse(false, 'Guest credential is required')
      );
    }

    // Critical security: derive target user from server-validated auth, never req.body
    const authenticatedUserId = req.user.id || req.user._id;

    const result = await guestSessionService.associateGuestSessionWithUser(
      rawCredential.trim(),
      authenticatedUserId
    );

    const payload = {
      associated: result.associated,
      alreadyAssociated: result.alreadyAssociated,
      guestSession: result.guestSession,
    };

    res.status(HTTP_STATUS.OK).json(
      apiResponse(
        true,
        result.alreadyAssociated
          ? 'Guest session already associated with this user'
          : 'Guest session associated successfully',
        {
          ...payload,
          data: payload,
        }
      )
    );
  },
};

