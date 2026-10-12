import { adminJourneyService } from './admin.service.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export const adminController = {
  /**
   * GET /api/admin/journeys
   * Retrieves filtered and paginated visitor journeys with overall stage summaries.
   */
  async getJourneys(req, res, next) {
    try {
      const { search, startDate, endDate, source, page, limit } = req.query;

      const result = await adminJourneyService.getJourneys({
        search,
        startDate,
        endDate,
        source,
        page,
        limit,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Admin journeys retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/admin/journeys/:journeyId
   * Retrieves single journey details, stage milestone progress, and paginated event timeline.
   */
  async getJourneyDetails(req, res, next) {
    try {
      const { journeyId } = req.params;
      const { page, limit } = req.query;

      const result = await adminJourneyService.getJourneyDetails(journeyId, {
        page,
        limit,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Journey details retrieved successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};
