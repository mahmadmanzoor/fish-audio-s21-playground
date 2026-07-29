import { fishClient, log, publicError } from "../lib/fish.js";

export default {
  async fetch(request) {
    const requestId = crypto.randomUUID().slice(0, 8);
    const started = performance.now();
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed." }, {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    log("fish.voices.request", { requestId, self: true, pageSize: 100 });
    try {
      const result = await fishClient().voices.search({
        page_size: 100,
        page_number: 1,
        self: true,
        sort_by: "created_at",
      });
      const voices = (result.items || []).map(({ _id, title }) => ({ id: _id, title }));
      log("fish.voices.response", {
        requestId,
        status: 200,
        count: voices.length,
        durationMs: Math.round(performance.now() - started),
      });
      return Response.json({ voices }, { headers: responseHeaders(requestId) });
    } catch (error) {
      if (error.missingKey) {
        log("fish.voices.error", { requestId, status: 503, reason: "missing_api_key" });
        return Response.json(
          { error: "Add FISH_API_KEY to your environment variables." },
          { status: 503, headers: responseHeaders(requestId) },
        );
      }
      const safe = publicError(error);
      log("fish.voices.error", { requestId, status: safe.status, message: safe.message });
      return Response.json(
        { error: safe.message },
        { status: safe.status, headers: responseHeaders(requestId) },
      );
    }
  },
};

function responseHeaders(requestId) {
  return { "Cache-Control": "no-store", "X-Request-ID": requestId };
}
