import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Missing url param', { status: 400 });
  }

  try {
    const res = await fetch(target);
    if (!res.ok) {
      console.error(`Proxy upstream error: ${res.status} ${res.statusText}`);
      return new Response(`Failed to fetch: ${res.statusText}`, { status: res.status });
    }

    const responseHeaders = new Headers();
    // Copy safe headers
    const safeHeaders = ['content-type', 'cache-control', 'last-modified', 'etag'];
    for (const key of safeHeaders) {
      if (res.headers.has(key)) {
        responseHeaders.set(key, res.headers.get(key)!);
      }
    }

    // Ensure CORS for our app
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    // Force cache if missing
    if (!responseHeaders.has('cache-control')) {
      responseHeaders.set('Cache-Control', 'public, max-age=3600');
    }

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders
    });
  } catch (e: any) {
    console.error('Proxy Error Details:', e);
    return new Response(`Proxy error: ${e.message}`, { status: 500 });
  }
};
