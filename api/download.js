export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Only allow downloads from our R2 bucket
  const allowed = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';
  if (!url.startsWith(allowed)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const filename = url.split('/').pop().split('?')[0];

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
}
