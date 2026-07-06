/**
 * POST /api/gate — validate preview password, set session cookie, redirect.
 * GET  /api/gate — clear cookie (logout / reset gate).
 */

const COOKIE_NAME = 'site_preview';
const COOKIE_VAL  = 'granted';
const PASSWORD    = 'preview2026';

export default function handler(req, res) {
  const isSecure = req.headers['x-forwarded-proto'] === 'https';
  const cookieBase = `${COOKIE_NAME}=${COOKIE_VAL}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;

  if (req.method === 'POST') {
    const body   = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};
    const { password, redirect: back = '/' } = body;

    if (password === PASSWORD) {
      res.setHeader('Set-Cookie', cookieBase);
      res.writeHead(302, { Location: back });
      return res.end();
    }

    // Wrong password — re-show gate with error flag
    res.writeHead(302, { Location: `/?gate_error=1&redirect=${encodeURIComponent(back)}` });
    return res.end();
  }

  // GET — clear the cookie (used to reset during dev/testing)
  if (req.method === 'GET') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0`);
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  res.status(405).end();
}
