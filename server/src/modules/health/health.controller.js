import { getHealth } from './health.service.js';
import { apiResponse } from '../../shared/utils/ApiResponse.js';
import { HTTP_STATUS } from '../../shared/constants/httpStatus.js';

export function healthController(_req, res) {
  const database = getHealth();
  const healthy = database === 'connected';
  res.status(healthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE)
    .json(apiResponse(healthy, healthy ? 'CADIN360 API is running' : 'Database unavailable', { database }));
}
