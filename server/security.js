/**
 * Security baseline with no extra dependencies: response headers and a
 * fixed-window in-memory rate limiter. A multi-instance deployment should
 * move the limiter's counters to Redis; the interface stays the same.
 */
import crypto from 'node:crypto';

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // Share links carry a secret in the URL; never leak it via Referer.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Health data must not sit in shared or browser caches.
  res.setHeader('Cache-Control', 'no-store');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/**
 * @param {{windowMs:number, max:number, key:(req)=>string, message?:string}} opts
 * Returns middleware plus a `reset(key)` used after a successful login.
 */
export function rateLimit({ windowMs, max, key, message = 'Too many requests. Please try again later.' }) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref();

  function middleware(req, res, next) {
    const k = key(req);
    const now = Date.now();
    let bucket = hits.get(k);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(k, bucket);
    }
    bucket.count++;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  }
  middleware.reset = (k) => hits.delete(k);
  return middleware;
}

const SALT = process.env.AUDIT_SALT || process.env.JWT_SECRET || process.env.SESSION_SECRET || 'noted-dev-salt';

/** Pseudonymous client identifier for access logs: correlatable, not reversible. */
export function hashIp(ip) {
  return crypto.createHmac('sha256', SALT).update(String(ip || 'unknown')).digest('hex').slice(0, 16);
}
