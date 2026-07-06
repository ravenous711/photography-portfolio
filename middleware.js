export const config = { matcher: ['/(.*)'] };

const PASSWORD   = 'preview2026';
const COOKIE_KEY = 'site_preview';
const COOKIE_VAL = 'granted';
const GATE_PATH  = '/__gate';

// Paths that bypass the gate entirely (Vercel internals, favicons, etc.)
const BYPASS = /^\/_vercel\//;

function hasCookie(request) {
  const raw = request.headers.get('cookie') || '';
  return raw.split(';').some(c => c.trim() === `${COOKIE_KEY}=${COOKIE_VAL}`);
}

function gateResponse(redirectTo = '/', wrongPassword = false) {
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
      border: 1px solid #2e2e2e;
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
    <form method="POST" action="${GATE_PATH}">
      <input type="hidden" name="redirect" value="${redirectTo}" />
      <input type="password" name="password" placeholder="Preview password" autofocus />
      ${wrongPassword ? '<span class="error">Incorrect password</span>' : ''}
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

export default async function middleware(request) {
  const url = new URL(request.url);
  const { pathname, search } = url;

  // Always let Vercel internals through
  if (BYPASS.test(pathname)) return;

  // Handle password form submission
  if (request.method === 'POST' && pathname === GATE_PATH) {
    let password = '', redirectTo = '/';
    try {
      const body = await request.text();
      const params = new URLSearchParams(body);
      password   = params.get('password') || '';
      redirectTo = params.get('redirect')  || '/';
    } catch {}

    if (password === PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectTo,
          'Set-Cookie': `${COOKIE_KEY}=${COOKIE_VAL}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
        },
      });
    }
    return gateResponse(redirectTo, true);
  }

  // Already authenticated — pass through
  if (hasCookie(request)) return;

  // Show gate
  return gateResponse(pathname + search);
}
