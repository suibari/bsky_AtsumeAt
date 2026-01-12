import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Missing url param', { status: 400 });
  }

  try {
    let lastError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(target);
        if (!res.ok) {
          // If 4xx/5xx, maybe don't retry? or retry 5xx only?
          // For now, let's return error immediately for 404/403 etc, but maybe retry 502/503/504?
          // User specifically had ETIMEDOUT (connection), which is caught in catch block.
          // But checking status:
          if (res.status >= 500 || res.status === 429) {
            console.warn(`Proxy upstream error ${res.status} on attempt ${attempt + 1}. Retrying...`);
            throw new Error(`Upstream ${res.status}`);
          }

          if (!res.ok) {
            console.error(`Proxy upstream error: ${res.status} ${res.statusText}`);
            return new Response(`Failed to fetch: ${res.statusText}`, { status: res.status });
          }
        }

        // Success
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
        lastError = e;
        console.warn(`Proxy fetch attempt ${attempt + 1} failed:`, e.message);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential-ish backoff
        }
      }
    }

    // If we get here, all retries failed
    console.error('Proxy Final Error Details:', lastError);
    return new Response(`Proxy error after retries: ${lastError?.message}`, { status: 504 }); // Gateway Timeout

    /*
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
    */
  } catch (e: any) {
    console.error('Proxy Error Details:', e);
    return new Response(`Proxy error: ${e.message}`, { status: 500 });
  }
};
