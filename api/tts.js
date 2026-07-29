import {
  MAX_REQUEST_BYTES,
  MODEL,
  buildTtsRequest,
  fishClient,
  log,
  publicError,
  summarizeTts,
} from "../lib/fish.js";

export default {
  async fetch(request) {
    const requestId = crypto.randomUUID().slice(0, 8);
    const started = performance.now();
    const contentLength = Number(request.headers.get("content-length") || 0);

    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, {
        status: 405,
        headers: { Allow: "POST" },
      });
    }
    if (contentLength > MAX_REQUEST_BYTES) {
      log("fish.tts.rejected", { requestId, status: 413, contentLength });
      return errorResponse(requestId, 413, "Request is too large.");
    }
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      log("fish.tts.rejected", {
        requestId,
        status: 415,
        contentType: request.headers.get("content-type"),
      });
      return errorResponse(requestId, 415, "Expected multipart form data.");
    }

    try {
      const form = await request.formData();
      const ttsRequest = buildTtsRequest(form);
      log("fish.tts.request", { requestId, ...summarizeTts(form, ttsRequest) });

      const { data, rawResponse } = await fishClient()
        .textToSpeech.convert(ttsRequest, MODEL, { abortSignal: request.signal })
        .withRawResponse();
      const contentType =
        rawResponse.headers.get("content-type") ||
        { mp3: "audio/mpeg", wav: "audio/wav", opus: "audio/ogg" }[ttsRequest.format];
      log("fish.tts.response", {
        requestId,
        status: rawResponse.status,
        contentType,
        headersMs: Math.round(performance.now() - started),
      });

      let bytes = 0;
      const countedStream = data.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          controller.enqueue(chunk);
        },
        flush() {
          log("fish.tts.complete", {
            requestId,
            bytes,
            durationMs: Math.round(performance.now() - started),
          });
        },
      }));

      return new Response(countedStream, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename="fish-s21.${ttsRequest.format}"`,
          "Content-Type": contentType,
          "X-Fish-Model": MODEL,
          "X-Request-ID": requestId,
        },
      });
    } catch (error) {
      if (error.missingKey) {
        log("fish.tts.error", { requestId, status: 503, reason: "missing_api_key" });
        return errorResponse(requestId, 503, "Add FISH_API_KEY to your environment variables.");
      }
      const safe = publicError(error);
      log("fish.tts.error", {
        requestId,
        status: safe.status,
        message: safe.message,
        durationMs: Math.round(performance.now() - started),
      });
      return errorResponse(requestId, safe.status, safe.message);
    }
  },
};

function errorResponse(requestId, status, message) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
  });
}
