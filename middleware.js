export const config = { matcher: ['/(.*)'] };

const COOKIE_NAME = 'site_preview';
const COOKIE_VAL  = 'granted';

// Vercel internals should always pass through
const BYPASS = /^\/_vercel\//;

// API routes other than /api/gate pass through too (health, etc.)
const PASS_API = /^\/api\/(?!gate)/;

function hasCookie(request) {
  const raw = request.headers.get('cookie') || '';
  // Use includes() — safer than exact-split matching
  return raw.includes(`${COOKIE_NAME}=${COOKIE_VAL}`);
}

function gateResponse(redirectTo = '/', wrongPassword = false) {
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Coming soon</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background: #0d0d0d;
      color: #e0e0e0;
      font-family: 'Georgia', serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      text-align: center;
      padding: 3rem 2rem;
      max-width: 420px;
      width: 100%;
    }
    h1 {
      font-size: 1.1rem;
      font-weight: 400;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 0.6rem;
    }
    p {
      font-size: 0.95rem;
      color: #666;
      margin-bottom: 2.2rem;
      line-height: 1.6;
    }
    form { display: flex; flex-direction: column; gap: 0.9rem; }
    input[type="password"] {
      background: #1a1a1a;
      border: 1px solid ${wrongPassword ? '#c0392b' : '#2e2e2e'};
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 0.95rem;
      padding: 0.7rem 1rem;
      text-align: center;
      letter-spacing: 0.08em;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus { border-color: #555; }
    input[type="password"]::placeholder { color: #444; letter-spacing: 0.05em; }
    button {
      background: #e0e0e0;
      border: none;
      border-radius: 4px;
      color: #0d0d0d;
      cursor: pointer;
      font-size: 0.8rem;
      font-family: inherit;
      letter-spacing: 0.12em;
      padding: 0.7rem 1rem;
      text-transform: uppercase;
      transition: background 0.2s;
    }
    button:hover { background: #fff; }
    .error {
      color: #c0392b;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Under construction</h1>
    <p>Making some selections — check back soon.</p>
    <form method="POST" action="/api/gate">
      <input type="hidden" name="redirect" value="${safeRedirect}" />
      <input type="password" name="password" placeholder="Preview password" autofocus />
      ${wrongPassword ? '<span class="error">Incorrect password — try again</span>' : ''}
      <button type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: wrongPassword ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export default function middleware(request) {
  const { pathname, searchParams } = new URL(request.url);

  // Always let Vercel internals and the gate API through
  if (BYPASS.test(pathname) || PASS_API.test(pathname) || pathname === '/api/gate') return;

  // Authenticated — pass through
  if (hasCookie(request)) return;

  // Show gate (surface wrong-password error if bounced back from /api/gate)
  const wrongPassword = searchParams.get('gate_error') === '1';
  const redirect = searchParams.get('redirect') || pathname;
  return gateResponse(wrongPassword ? (redirect || '/') : pathname, wrongPassword);
}
