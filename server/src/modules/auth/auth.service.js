import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { userRepository } from './user.repository.js';
import { Event } from '../events/event.model.js';
import { guestSessionService } from '../guestSession/guestSession.service.js';
import { guestSessionRepository } from '../guestSession/guestSession.repository.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';
import { USER_ROLES, AUTH_CONFIG, EMAIL_REGEX, AUTH_MESSAGES } from './auth.constants.js';

export const authService = {
  getSecret() {
    return process.env.JWT_SECRET || AUTH_CONFIG.DEFAULT_JWT_SECRET;
  },

  generateToken(user, secret = this.getSecret()) {
    const id = user._id ? user._id.toString() : user.id;
    return jwt.sign(
      {
        id,
        email: user.email,
        role: user.role || USER_ROLES.USER,
      },
      secret,
      { expiresIn: AUTH_CONFIG.JWT_EXPIRES_IN }
    );
  },

  async signup(
    { name, email, password, guestCredential, role },
    userRepo = userRepository,
    guestRepo = guestSessionRepository
  ) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, AUTH_MESSAGES.NAME_REQUIRED);
    }

    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, AUTH_MESSAGES.EMAIL_REQUIRED);
    }

    const trimmedEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, AUTH_MESSAGES.INVALID_EMAIL);
    }

    if (!password || typeof password !== 'string' || password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, AUTH_MESSAGES.PASSWORD_TOO_SHORT);
    }

    const existing = await userRepo.findByEmail(trimmedEmail);
    if (existing) {
      throw new ApiError(HTTP_STATUS.CONFLICT, AUTH_MESSAGES.USER_ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(password, AUTH_CONFIG.SALT_ROUNDS);

    const assignedRole = role === USER_ROLES.ADMIN ? USER_ROLES.ADMIN : USER_ROLES.USER;

    const user = await userRepo.create({
      name: name.trim(),
      email: trimmedEmail,
      passwordHash: hashedPassword,
      role: assignedRole,
    });

    const userId = user._id ? user._id.toString() : user.id;
    let associatedGuest = null;

    // Optional guest session association during signup
    if (guestCredential && typeof guestCredential === 'string' && guestCredential.trim()) {
      try {
        const assocResult = await guestSessionService.associateGuestSessionWithUser(
          guestCredential.trim(),
          userId,
          { userRepo, guestRepo }
        );
        associatedGuest = assocResult.guestSession;
      } catch (err) {
        // Recovery strategy: roll back created user to avoid orphaned broken account
        try {
          if (userRepo && typeof userRepo.deleteById === 'function') {
            await userRepo.deleteById(userId);
          }
        } catch (_cleanupErr) {}
        throw err;
      }
    }

    // Signup is a server-owned milestone. The guest history has already been
    // associated, so this event belongs to the resulting user journey.
    if (mongoose.connection.readyState === 1) {
      const occurredAt = user.createdAt || new Date();
      await Event.updateOne(
        { eventId: `signup_${userId}` },
        { $setOnInsert: {
          eventId: `signup_${userId}`,
          type: 'signup_completed',
          occurredAt,
          receivedAt: new Date(),
          canonicalRoute: '/register',
          originalRoute: '/register',
          userId: user._id,
          guestSessionId: associatedGuest?.id || null,
        } },
        { upsert: true }
      );
    }

    const token = this.generateToken(user);
    const sanitizedUser = {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return {
      user: sanitizedUser,
      token,
      guestSession: associatedGuest,
    };
  },

  // Alias for backward compatibility
  async register(data, userRepo = userRepository, guestRepo = guestSessionRepository) {
    return await this.signup(data, userRepo, guestRepo);
  },

  async login(
    { email, password, guestCredential },
    userRepo = userRepository,
    guestRepo = guestSessionRepository
  ) {
    if (!email || typeof email !== 'string' || !email.trim()) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, AUTH_MESSAGES.EMAIL_REQUIRED);
    }

    if (!password || typeof password !== 'string') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, AUTH_MESSAGES.PASSWORD_REQUIRED);
    }

    const trimmedEmail = email.toLowerCase().trim();
    const user = await userRepo.findByEmail(trimmedEmail, { includePassword: true });

    // Generic error to prevent email enumeration
    if (!user) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const hashToCompare = user.passwordHash || user.password;
    if (!hashToCompare) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(password, hashToCompare);
    if (!isMatch) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const userId = user._id ? user._id.toString() : user.id;
    let associatedGuest = null;

    // Module 3: If a guest credential is provided during login, associate with authenticated user
    if (guestCredential && typeof guestCredential === 'string' && guestCredential.trim()) {
      const assocResult = await guestSessionService.associateGuestSessionWithUser(
        guestCredential.trim(),
        userId,
        { userRepo, guestRepo }
      );
      associatedGuest = assocResult.guestSession;
    }

    const token = this.generateToken(user);
    const sanitizedUser = {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return {
      user: sanitizedUser,
      token,
      ...(associatedGuest ? { guestSession: associatedGuest } : {}),
    };
  },

  async getCurrentUser(userId, userRepo = userRepository) {
    if (!userId) {
      throw new ApiError(HTTP_STATUS.UNAUTHORIZED, AUTH_MESSAGES.SESSION_ID_MISSING);
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, AUTH_MESSAGES.USER_NOT_FOUND);
    }

    return {
      id: user._id ? user._id.toString() : user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  },
};
