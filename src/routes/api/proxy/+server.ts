import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Missing url param', { status: 400 });
  }

  try {
    const res = await fetch(target);
    if (!res.ok) {
      return new Response(`Failed to fetch: ${res.statusText}`, { status: res.status });
    }

    const headers = new Headers(res.headers);
    // Ensure CORS for our app
    headers.set('Access-Control-Allow-Origin', '*');
    // Optional: Cache control
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(res.body, {
      status: res.status,
      headers
    });
  } catch (e) {
    return new Response('Proxy error', { status: 500 });
  }
};
