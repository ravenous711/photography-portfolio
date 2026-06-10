const R2_BASE = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev';
const ALLOWED_ORIGIN = '*'; // lock down to your Vercel domain if desired

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // ?key=Italy/Venice/Digital/venice_098.jpg&w=400
    const key = url.searchParams.get('key');
    const width = Math.min(parseInt(url.searchParams.get('w') || '400'), 800);

    if (!key) {
      return new Response('Missing ?key param', { status: 400 });
    }

    const originUrl = `${R2_BASE}/${key}`;

    const response = await fetch(originUrl, {
      cf: {
        image: {
          width,
          quality: 75,
          format: 'webp',
        },
      },
    });

    if (!response.ok) {
      return new Response('Image not found', { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      },
    });
  },
};
