const exifr = require('exifr');

const R2_BASE = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev/';

module.exports = async function handler(req, res) {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!url.startsWith(R2_BASE)) return res.status(403).json({ error: 'Forbidden' });

  try {
    // Fetch only the first 64 KB — enough for EXIF headers
    const response = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    if (!response.ok && response.status !== 206) {
      return res.status(response.status).json({ error: 'Fetch failed' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await exifr.parse(buffer, {
      pick: ['FNumber', 'ExposureTime', 'ISO', 'FocalLength'],
    });

    if (!data) return res.status(204).end();

    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'EXIF parse failed' });
  }
}
