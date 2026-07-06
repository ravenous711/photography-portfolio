// api/admin-access-codes.js
// Proxy admin access-code CRUD to the Cloudflare Worker.
// Requires a valid admin session cookie (same as other admin endpoints).

import { requireSession } from './_admin-session.js';

const WORKER_BASE = process.env.WORKER_BASE_URL
  || 'https://portfolio-zip-download.raveenfernando.workers.dev';

export default async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  const adminSecret = process.env.WORKER_ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({ error: 'Server not configured — missing WORKER_ADMIN_SECRET' });
  }

  // Forward GET, POST, or DELETE to the Worker
  const method = req.method;
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Build the Worker URL; DELETE includes the id path segment
  const id = req.query.id;
  const workerUrl = id
    ? `${WORKER_BASE}/access-codes/${encodeURIComponent(id)}`
    : `${WORKER_BASE}/access-codes`;

  const fetchOptions = {
    method,
    headers: {
      Authorization: `Bearer ${adminSecret}`,
      'Content-Type': 'application/json',
    },
  };

  if (method === 'POST') {
    fetchOptions.body = JSON.stringify(req.body);
  }

  const upstream = await fetch(workerUrl, fetchOptions);
  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}
