/**
 * POST /api/gate — validate preview password, set session cookie, redirect.
 * GET  /api/gate — clear cookie (dev reset).
 */

const COOKIE_NAME = 'site_preview';
const COOKIE_VAL  = 'granted';
const PASSWORD    = 'preview2026';

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
  });
}

module.exports = async function handler(req, res) {
  const isSecure = req.headers['x-forwarded-proto'] === 'https';
  const cookieStr = `${COOKIE_NAME}=${COOKIE_VAL}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;

  if (req.method === 'POST') {
    const raw    = await readBody(req);
    const params = new URLSearchParams(raw);
    const password = params.get('password') || '';
    const back     = params.get('redirect')  || '/';

    if (password === PASSWORD) {
      res.setHeader('Set-Cookie', cookieStr);
      res.writeHead(302, { Location: back });
      return res.end();
    }

    // Wrong password — bounce back with error flag
    const safeBack = back.startsWith('/') ? back : '/';
    res.writeHead(302, { Location: `/?gate_error=1&redirect=${encodeURIComponent(safeBack)}` });
    return res.end();
  }

  // GET — clear cookie (reset for dev/testing)
  if (req.method === 'GET') {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0`);
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  res.statusCode = 405;
  res.end();
};
