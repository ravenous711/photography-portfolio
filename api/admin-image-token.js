/**
 * GET /api/admin-image-token?audience=family
 *
 * Returns a short-lived Worker image token for private album thumbnails in /admin/.
 * Proxies to the Worker's /admin/image-token using WORKER_ADMIN_SECRET.
 */
import { requireSession } from './_admin-session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireSession(req, res);
  if (!session) return;

  const { WORKER_BASE_URL, WORKER_ADMIN_SECRET } = process.env;
  if (!WORKER_BASE_URL || !WORKER_ADMIN_SECRET) {
    return res.status(500).json({
      error: 'Server not configured — missing WORKER_BASE_URL or WORKER_ADMIN_SECRET',
    });
  }

  const { audience } = req.query;
  if (!audience || typeof audience !== 'string') {
    return res.status(400).json({ error: 'audience query parameter required' });
  }
  if (
    audience !== 'family' &&
    !audience.startsWith('family:') &&
    !audience.startsWith('client:')
  ) {
    return res.status(400).json({ error: 'Invalid audience' });
  }

  try {
    const workerRes = await fetch(
      `${WORKER_BASE_URL.replace(/\/$/, '')}/admin/image-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WORKER_ADMIN_SECRET}`,
        },
        body: JSON.stringify({ audience }),
      },
    );
    const data = await workerRes.json();
    if (!workerRes.ok) {
      return res.status(workerRes.status).json({ error: data.error || 'Worker error' });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: `Failed to reach Worker: ${err.message}` });
  }
}
