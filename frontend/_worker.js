/**
 * Cloudflare Pages / Workers Sites — SPA fallback worker.
 *
 * Why this file exists
 * ====================
 * On the live deployment (adxsite.ravenhadjiyevh.workers.dev) refreshing any
 * deep link (e.g. /trade, /support, /admin) returned a `.txt` download instead
 * of the page. That happens when:
 *   - the worker reaches the asset binding (or KV) for that path,
 *   - doesn't find a static file there,
 *   - and returns the 404 body with no/wrong `Content-Type`, so the browser
 *     saves it as text/plain.
 *
 * This worker fixes that by:
 *   1. Trying to serve the asset directly (`env.ASSETS.fetch`).
 *   2. If the asset is missing OR the response is a 404 → fall back to
 *      `/index.html` so React-Router can take over.
 *   3. Always forcing `Content-Type: text/html; charset=utf-8` on the SPA
 *      fallback so the browser never treats it as a download.
 *
 * Deployment options
 * ==================
 * - Cloudflare Pages (recommended): drop this file as `/_worker.js` next to
 *   `build/`. Pages automatically loads it in "advanced mode".
 * - Workers Sites / Workers + Assets: bind your static assets to `ASSETS`
 *   and deploy this as the entry module (see `wrangler.toml`).
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1) Try to serve the asset as-is.
    let response;
    try {
      response = await env.ASSETS.fetch(request);
    } catch (err) {
      response = null;
    }

    // If asset binding returned a real success or a redirect, ship it.
    if (response && response.status < 400) {
      return response;
    }

    // 2) Asset missing -> SPA fallback to /index.html
    const indexReq = new Request(new URL("/index.html", url.origin), request);
    let indexRes;
    try {
      indexRes = await env.ASSETS.fetch(indexReq);
    } catch (err) {
      return new Response("Site is starting, please retry…", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 3) Force HTML content-type so the browser renders instead of downloading.
    const headers = new Headers(indexRes.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.delete("Content-Disposition");

    return new Response(indexRes.body, {
      status: 200,
      statusText: "OK",
      headers,
    });
  },
};
