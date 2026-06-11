const R2_BASE = 'https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev';

const ALLOWED_ORIGINS = new Set([
  'https://raveenfernando.com',
  'https://www.raveenfernando.com',
]);

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    };
  }
  return {};
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      const cors = corsHeaders(request);
      if (!cors['Access-Control-Allow-Origin']) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // ?key=Italy/Venice/Digital/venice_098.jpg&w=400
    const key = url.searchParams.get('key');
    const width = Math.min(parseInt(url.searchParams.get('w') || '400', 10), 800);

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
        ...corsHeaders(request),
      },
    });
  },
};
