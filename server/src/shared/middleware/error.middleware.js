import { apiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export function errorHandler(error, _req, res, _next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : HTTP_STATUS.INTERNAL_ERROR;
  if (status === 500) console.error('Unhandled request error:', error);
  res.status(status).json(apiResponse(false, status === 500 ? 'Internal server error' : error.message));
}
