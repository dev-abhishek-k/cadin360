import { Event } from '../events/event.model.js';
import { User } from '../auth/user.model.js';
import { GuestSession } from '../guestSession/guestSession.model.js';

export const adminJourneyRepository = {
  /**
   * Fetches the necessary collections and grouped event journeys from MongoDB.
   */
  async getAdminJourneysData() {
    const [users, unassociatedGuestSessions, eventJourneys] = await Promise.all([
      User.find({}, { name: 1, email: 1, role: 1 }).lean().exec(),
      GuestSession.find({ associatedUserId: null }, { _id: 1, createdAt: 1 }).lean().exec(),
      Event.aggregate([
        // Lookup guest session to resolve associatedUserId
        {
          $lookup: {
            from: 'guestsessions',
            localField: 'guestSessionId',
            foreignField: '_id',
            as: 'guestSessionDoc',
          },
        },
        {
          $project: {
            eventId: 1,
            type: 1,
            occurredAt: 1,
            canonicalRoute: 1,
            originalRoute: 1,
            source: 1,
            userId: 1,
            guestSessionId: 1,
            paymentVerification: 1,
            metadata: 1,
            associatedUserId: {
              $arrayElemAt: ['$guestSessionDoc.associatedUserId', 0],
            },
          },
        },
        {
          $addFields: {
            effectiveUserId: {
              $ifNull: ['$userId', '$associatedUserId'],
            },
          },
        },
        {
          $addFields: {
            journeyId: {
              $cond: {
                if: { $ne: ['$effectiveUserId', null] },
                then: { $concat: ['user_', { $toString: '$effectiveUserId' }] },
                else: { $concat: ['guest_', { $toString: '$guestSessionId' }] },
              },
            },
            identityType: {
              $cond: {
                if: { $ne: ['$effectiveUserId', null] },
                then: 'user',
                else: 'guest',
              },
            },
          },
        },
        // Sort chronologically: occurredAt ASC, eventId ASC
        {
          $sort: { occurredAt: 1, eventId: 1 },
        },
        // Group all events by logical journey
        {
          $group: {
            _id: '$journeyId',
            identityType: { $first: '$identityType' },
            userId: { $first: '$effectiveUserId' },
            guestSessionId: { $first: '$guestSessionId' },
            events: {
              $push: {
                eventId: '$eventId',
                type: '$type',
                occurredAt: '$occurredAt',
                source: '$source',
                canonicalRoute: '$canonicalRoute',
                originalRoute: '$originalRoute',
                paymentVerification: '$paymentVerification',
                metadata: '$metadata',
              },
            },
          },
        },
      ]).exec(),
    ]);

    return {
      users: users || [],
      unassociatedGuestSessions: unassociatedGuestSessions || [],
      eventJourneys: eventJourneys || [],
    };
  },

  /**
   * Finds a user by ID.
   */
  async findUserById(userId) {
    if (!userId) return null;
    try {
      return await User.findById(userId, { name: 1, email: 1, role: 1, createdAt: 1 }).lean().exec();
    } catch (err) {
      if (err.name === 'CastError') return null;
      throw err;
    }
  },

  /**
   * Finds a guest session by ID.
   */
  async findGuestSessionById(guestSessionId) {
    if (!guestSessionId) return null;
    try {
      return await GuestSession.findById(guestSessionId, { associatedUserId: 1, createdAt: 1, expiresAt: 1 }).lean().exec();
    } catch (err) {
      if (err.name === 'CastError') return null;
      throw err;
    }
  },

  /**
   * Finds all guest sessions associated with a given user ID.
   */
  async findGuestSessionsByUserId(userId) {
    if (!userId) return [];
    try {
      return await GuestSession.find({ associatedUserId: userId }, { _id: 1, associatedUserId: 1, createdAt: 1 }).lean().exec();
    } catch (err) {
      if (err.name === 'CastError') return [];
      throw err;
    }
  },

  /**
   * Finds all events belonging to a resolved journey (userId and/or guestSessionIds).
   * Sorted deterministically by occurredAt ASC, eventId ASC.
   */
  async findEventsForJourney({ userId = null, guestSessionIds = [] } = {}) {
    const conditions = [];
    if (userId) {
      conditions.push({ userId });
    }
    const cleanGuestIds = (guestSessionIds || []).filter(Boolean);
    if (cleanGuestIds.length === 1) {
      conditions.push({ guestSessionId: cleanGuestIds[0] });
    } else if (cleanGuestIds.length > 1) {
      conditions.push({ guestSessionId: { $in: cleanGuestIds } });
    }

    if (conditions.length === 0) return [];

    const query = conditions.length === 1 ? conditions[0] : { $or: conditions };

    try {
      return await Event.find(query)
        .sort({ occurredAt: 1, eventId: 1 })
        .lean()
        .exec();
    } catch (err) {
      if (err.name === 'CastError') return [];
      throw err;
    }
  },
};
