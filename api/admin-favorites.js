/**
 * GET /api/admin-favorites?albumId=X
 *
 * Returns the favorites tally for an album, sorted by count DESC.
 * Proxies to the Cloudflare Worker's /favorites/tally endpoint using
 * WORKER_ADMIN_SECRET so the secret never touches the browser.
 *
 * Requires a valid admin session cookie (same as admin-delete / admin-curate).
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

  const { albumId } = req.query;
  if (!albumId || typeof albumId !== 'string') {
    return res.status(400).json({ error: 'albumId query parameter required' });
  }

  try {
    const workerRes = await fetch(
      `${WORKER_BASE_URL.replace(/\/$/, '')}/favorites/tally?albumId=${encodeURIComponent(albumId)}`,
      { headers: { Authorization: `Bearer ${WORKER_ADMIN_SECRET}` } }
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
