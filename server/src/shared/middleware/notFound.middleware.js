import { ApiError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export function notFound(_req, _res, next) { next(new ApiError(HTTP_STATUS.NOT_FOUND, 'Route not found')); }
