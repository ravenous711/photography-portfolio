/**
 * Shared admin session utilities — used by admin-login, admin-verify, admin-delete, admin-curate.
 * Underscore prefix = Vercel treats this as a private helper, not a route endpoint.
 */
import crypto from 'crypto';

export const COOKIE_NAME = 'admin_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Token creation ────────────────────────────────────────────────────────────

export function createSessionToken(secret) {
  const payload = { iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

// ── Token verification ────────────────────────────────────────────────────────

export function verifySessionToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const payloadB64 = token.slice(0, dotIdx);
    const sig        = token.slice(dotIdx + 1);

    const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

    // Constant-time compare to prevent timing attacks
    const sigBuf = Buffer.from(sig,      'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function buildCookieHeader(name, value, { maxAge, path = '/', httpOnly = true, secure, sameSite = 'Strict' } = {}) {
  let str = `${name}=${value}`;
  if (maxAge !== undefined) str += `; Max-Age=${maxAge}`;
  str += `; Path=${path}`;
  if (httpOnly) str += '; HttpOnly';
  if (secure)   str += '; Secure';
  str += `; SameSite=${sameSite}`;
  return str;
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const result = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

// ── Convenience: require valid session or return 401 ─────────────────────────

export function requireSession(req, res) {
  const { SESSION_SECRET } = process.env;
  if (!SESSION_SECRET) {
    res.status(500).json({ error: 'SERVER_NOT_CONFIGURED: missing SESSION_SECRET' });
    return null;
  }
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  const payload = verifySessionToken(token, SESSION_SECRET);
  if (!payload) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return payload;
}
