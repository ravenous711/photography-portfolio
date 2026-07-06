/**
 * POST /api/admin-login  — submit raw password, get signed session cookie
 * DELETE /api/admin-login — clear session cookie (logout)
 */
import crypto from 'crypto';
import {
  createSessionToken,
  buildCookieHeader,
  parseCookies,
  COOKIE_NAME,
} from './_admin-session.js';

export default async function handler(req, res) {
  const { SESSION_SECRET, ADMIN_PASSWORD_HASH } = process.env;
  if (!SESSION_SECRET || !ADMIN_PASSWORD_HASH) {
    return res.status(500).json({ error: 'Server not configured — missing SESSION_SECRET or ADMIN_PASSWORD_HASH' });
  }

  // Detect HTTPS to set Secure flag (omit on localhost)
  const isSecure = req.headers['x-forwarded-proto'] === 'https';
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict',
    maxAge: 24 * 60 * 60, // 24 h in seconds
  };

  // ── POST /api/admin-login — login ────────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { password } = body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required' });
    }

    // Hash the submitted password and compare server-side (no public hash needed)
    const submitted = crypto.createHash('sha256').update(password).digest('hex');
    if (submitted !== ADMIN_PASSWORD_HASH) {
      // Delay to slow brute-force
      await new Promise(r => setTimeout(r, 200));
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = createSessionToken(SESSION_SECRET);
    res.setHeader('Set-Cookie', buildCookieHeader(COOKIE_NAME, token, cookieOpts));
    return res.status(200).json({ ok: true });
  }

  // ── DELETE /api/admin-login — logout ─────────────────────────────────────
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', buildCookieHeader(COOKIE_NAME, '', { ...cookieOpts, maxAge: 0 }));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
