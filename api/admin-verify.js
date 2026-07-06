/**
 * GET /api/admin-verify — returns 200 if the session cookie is valid, 401 otherwise.
 * The admin page calls this on load to decide whether to show the login form or the UI.
 */
import { requireSession } from './_admin-session.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = requireSession(req, res);
  if (!session) return; // requireSession already sent 401
  return res.status(200).json({ ok: true });
}
