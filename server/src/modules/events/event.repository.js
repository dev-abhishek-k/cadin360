import { Event } from './event.model.js';

export const eventRepository = {
  async create(eventData) {
    return await Event.create(eventData);
  },

  async findByEventId(eventId) {
    if (!eventId) return null;
    return await Event.findOne({ eventId: String(eventId).trim() }).exec();
  },

  async findJourneyEvents({
    userId = null,
    guestSessionId = null,
    guestSessionIds = [],
    limit = 500,
  } = {}) {
    const allGuestIds = [];
    if (guestSessionId) {
      allGuestIds.push(guestSessionId);
    }
    if (Array.isArray(guestSessionIds)) {
      for (const id of guestSessionIds) {
        if (id && !allGuestIds.some((existing) => existing.toString() === id.toString())) {
          allGuestIds.push(id);
        }
      }
    }

    const conditions = [];

    if (userId) {
      conditions.push({ userId });
    }
    if (allGuestIds.length === 1) {
      conditions.push({ guestSessionId: allGuestIds[0] });
    } else if (allGuestIds.length > 1) {
      conditions.push({ guestSessionId: { $in: allGuestIds } });
    }

    if (conditions.length === 0) {
      return [];
    }

    const query = conditions.length === 1 ? conditions[0] : { $or: conditions };

    // Deterministic ordering: occurredAt ASC, eventId ASC
    return await Event.find(query)
      .sort({ occurredAt: 1, eventId: 1 })
      .limit(limit)
      .exec();
  },
};
