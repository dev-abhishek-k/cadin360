import { Event } from '../events/event.model.js';
import { User } from '../auth/user.model.js';
import { GuestSession } from '../guestSession/guestSession.model.js';

export const adminJourneyRepository = {
  async getPaginatedJourneys({ search, source, startUtc, endUtc, page, limit }) {
    const range = {};
    if (startUtc) range.$gte = startUtc;
    if (endUtc) range.$lte = endUtc;
    const hasDateFilter = Boolean(startUtc || endUtc);
    const cleanSource = source.toLowerCase();
    const sourceMatch = cleanSource && cleanSource !== 'all'
      ? ['none', 'null', 'unattributed'].includes(cleanSource)
        ? { firstSource: null }
        : { firstSourceLower: cleanSource }
      : null;
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pipeline = [
      { $lookup: { from: 'guestsessions', localField: 'guestSessionId', foreignField: '_id', as: 'guestSessionDoc' } },
      { $set: {
        effectiveUserId: { $ifNull: ['$userId', { $arrayElemAt: ['$guestSessionDoc.associatedUserId', 0] }] },
        isShortLink: { $cond: [{ $eq: ['$type', 'short_link_opened'] }, 1, 0] },
        isVerifiedPayment: { $and: [
          { $eq: ['$type', 'payment_completed'] },
          { $or: [
            { $eq: ['$paymentVerification.status', 'verified'] },
            { $ne: [{ $ifNull: ['$paymentVerification.paymentId', null] }, null] },
            { $eq: ['$metadata.verified', true] },
            { $eq: ['$metadata.status', 'verified'] },
            { $ne: [{ $ifNull: ['$metadata.paymentId', null] }, null] },
          ] },
        ] },
      } },
      { $set: {
        journeyId: { $cond: [
          { $ne: ['$effectiveUserId', null] },
          { $concat: ['user_', { $toString: '$effectiveUserId' }] },
          { $concat: ['guest_', { $toString: '$guestSessionId' }] },
        ] },
      } },
      { $group: {
        _id: '$journeyId',
        userId: { $first: '$effectiveUserId' },
        guestSessionId: { $first: '$guestSessionId' },
        guestSessionIds: { $addToSet: '$guestSessionId' },
        firstActivityAt: { $min: '$occurredAt' },
        lastActivityAt: { $max: '$occurredAt' },
        uniqueEventCount: { $sum: 1 },
        inDateRange: { $sum: hasDateFilter ? { $cond: [{ $and: [
          ...Object.entries(range).map(([operator, value]) => ({ [operator]: ['$occurredAt', value] })),
        ] }, 1, 0] } : 1 },
        arrived: { $max: { $cond: [{ $eq: ['$type', 'short_link_opened'] }, 1, 0] } },
        explored: { $max: { $cond: [{ $eq: ['$type', 'page_viewed'] }, 1, 0] } },
        signedUp: { $max: { $cond: [{ $eq: ['$type', 'signup_completed'] }, 1, 0] } },
        paid: { $max: { $cond: ['$isVerifiedPayment', 1, 0] } },
        firstSource: { $top: {
          sortBy: { isShortLink: -1, occurredAt: 1, eventId: 1 },
          output: '$source',
        } },
      } },
      { $set: { hasEvents: 1 } },
      { $unionWith: { coll: 'users', pipeline: [
        { $match: { role: 'user' } },
        { $project: { _id: { $concat: ['user_', { $toString: '$_id' }] }, userId: '$_id', hasEvents: { $literal: 0 } } },
      ] } },
      { $unionWith: { coll: 'guestsessions', pipeline: [
        { $match: { associatedUserId: null } },
        { $project: { _id: { $concat: ['guest_', { $toString: '$_id' }] }, guestSessionId: '$_id', hasEvents: { $literal: 0 } } },
      ] } },
      { $sort: { hasEvents: -1 } },
      { $group: { _id: '$_id', row: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$row' } },
      { $match: hasDateFilter ? { inDateRange: { $gt: 0 } } : {} },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'userDoc' } },
      { $match: { $or: [{ userId: null }, { 'userDoc.role': { $ne: 'admin' } }] } },
      { $set: {
        identityType: { $cond: [{ $ne: ['$userId', null] }, 'user', 'guest'] },
        userDoc: { $arrayElemAt: ['$userDoc', 0] },
        firstSource: { $cond: [{ $eq: ['$arrived', 1] }, { $ifNull: ['$firstSource', null] }, null] },
      } },
      { $set: {
        displayIdentity: { $cond: [
          { $eq: ['$identityType', 'user'] },
          { $ifNull: ['$userDoc.name', { $ifNull: ['$userDoc.email', 'Anonymous Visitor'] }] },
          { $concat: ['Guest ', { $substrCP: [{ $toString: '$guestSessionId' }, 18, 6] }] },
        ] },
        firstSourceLower: { $toLower: { $ifNull: ['$firstSource', ''] } },
      } },
    ];
    if (escapedSearch) pipeline.push({ $match: { $or: [
      { displayIdentity: { $regex: escapedSearch, $options: 'i' } },
      { _id: { $regex: escapedSearch, $options: 'i' } },
      { $expr: { $anyElementTrue: { $map: {
        input: { $ifNull: ['$guestSessionIds', []] }, as: 'id',
        in: { $regexMatch: { input: { $ifNull: [{ $toString: '$$id' }, ''] }, regex: escapedSearch, options: 'i' } },
      } } } },
    ] } });
    if (sourceMatch) pipeline.push({ $match: sourceMatch });
    pipeline.push(
      { $project: {
        journeyId: '$_id', identityType: 1, displayIdentity: 1,
        firstActivityAt: { $ifNull: ['$firstActivityAt', null] },
        lastActivityAt: { $ifNull: ['$lastActivityAt', null] },
        firstSource: 1,
        uniqueEventCount: { $ifNull: ['$uniqueEventCount', 0] },
        stages: {
          arrived: { $eq: ['$arrived', 1] }, explored: { $eq: ['$explored', 1] },
          signedUp: { $eq: ['$signedUp', 1] }, paid: { $eq: ['$paid', 1] },
        },
      } },
      { $facet: {
        journeys: [
          { $sort: { lastActivityAt: -1, journeyId: 1 } },
          { $skip: (page - 1) * limit }, { $limit: limit },
        ],
        metrics: [{ $group: {
          _id: null, totalJourneys: { $sum: 1 },
          arrived: { $sum: { $cond: ['$stages.arrived', 1, 0] } },
          explored: { $sum: { $cond: ['$stages.explored', 1, 0] } },
          signedUp: { $sum: { $cond: ['$stages.signedUp', 1, 0] } },
          paid: { $sum: { $cond: ['$stages.paid', 1, 0] } },
        } }],
      } },
    );
    const [result] = await Event.aggregate(pipeline).allowDiskUse(true).exec();
    const metrics = result.metrics[0] || { totalJourneys: 0, arrived: 0, explored: 0, signedUp: 0, paid: 0 };
    const totalPages = Math.ceil(metrics.totalJourneys / limit) || 1;
    return {
      journeys: result.journeys,
      pagination: {
        page, limit, total: metrics.totalJourneys, totalPages,
        hasNextPage: page < totalPages, hasPrevPage: page > 1,
      },
      summaryMetrics: {
        totalJourneys: metrics.totalJourneys, arrived: metrics.arrived,
        explored: metrics.explored, signedUp: metrics.signedUp, paid: metrics.paid,
      },
    };
  },
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
