export function rateLimiter({ windowMs = 60 * 1000, max = 30, message = 'Too many requests, please try again later' } = {}) {
  const requests = new Map();

  return (req, res, next) => {
    // Skip in automated tests to prevent test throttling
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const key = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (requests.get(key) || []).filter((time) => time > windowStart);

    if (timestamps.length >= max) {
      return res.status(429).json({
        success: false,
        message,
      });
    }

    timestamps.push(now);
    requests.set(key, timestamps);
    next();
  };
}
