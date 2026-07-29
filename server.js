import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { FishAudioClient } from "fish-audio";

const MODEL = "s2.1-pro-free";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const MAX_UPLOAD = 25 * 1024 * 1024;
const FILES = new Map([
  ["/", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function log(event, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

export function buildTtsRequest(form) {
  const text = String(form.get("text") || "").trim();
  const voiceMode = String(form.get("voiceMode") || "default");
  const format = String(form.get("format") || "mp3");
  const latency = String(form.get("latency") || "normal");
  const referenceId = String(form.get("referenceId") || "").trim();
  const referenceAudio = form.get("referenceAudio");
  const referenceText = String(form.get("referenceText") || "").trim();

  if (!text) throw inputError("Enter text to synthesize.");
  if (form.getAll("voiceMode").length !== 1) {
    throw inputError("Choose exactly one voice source.");
  }
  if (!["default", "saved", "id", "clone"].includes(voiceMode)) {
    throw inputError("Choose one valid voice source.");
  }
  if (!["mp3", "wav", "opus"].includes(format)) {
    throw inputError("Choose MP3, WAV, or Opus.");
  }
  if (!["normal", "balanced", "low"].includes(latency)) {
    throw inputError("Choose a valid latency mode.");
  }

  const number = (name, fallback, min, max) => {
    const raw = String(form.get(name) ?? fallback);
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw inputError(`${name} must be between ${min} and ${max}.`);
    }
    return value;
  };

  const request = {
    text,
    format,
    latency,
    temperature: number("temperature", 0.7, 0, 1),
    top_p: number("topP", 0.7, 0, 1),
    prosody: {
      speed: number("speed", 1, 0.5, 2),
      volume: number("volume", 0, -20, 20),
    },
  };

  if (voiceMode === "saved" || voiceMode === "id") {
    if (!referenceId) throw inputError("Choose or enter a voice reference ID.");
    if (referenceAudio instanceof File && referenceAudio.size) {
      throw inputError("Use either a voice ID or reference audio, not both.");
    }
    request.reference_id = referenceId;
  }

  if (voiceMode === "clone") {
    if (referenceId) throw inputError("Use either a voice ID or reference audio, not both.");
    if (!(referenceAudio instanceof File) || !referenceAudio.size) {
      throw inputError("Choose a reference audio file.");
    }
    if (!referenceAudio.type.startsWith("audio/")) {
      throw inputError("The reference must be an audio file.");
    }
    if (referenceAudio.size > 20 * 1024 * 1024) {
      throw inputError("Reference audio must be 20 MB or smaller.");
    }
    if (!referenceText) throw inputError("Enter the exact reference transcript.");
    if (form.get("consent") !== "yes") {
      throw inputError("Confirm you have permission to clone this voice.");
    }
    request.references = [{ audio: referenceAudio, text: referenceText }];
  }

  if (voiceMode === "default" && (referenceId || (referenceAudio instanceof File && referenceAudio.size))) {
    throw inputError("The default voice cannot include a voice reference.");
  }

  return request;
}

export function summarizeTts(form, request) {
  const reference = request.references?.[0];
  return {
    model: MODEL,
    textChars: request.text.length,
    voiceMode: String(form.get("voiceMode")),
    voiceId: request.reference_id ? `${request.reference_id.slice(0, 8)}…` : undefined,
    referenceAudio: reference
      ? { type: reference.audio.type, bytes: reference.audio.size, transcriptChars: reference.text.length }
      : undefined,
    format: request.format,
    latency: request.latency,
    temperature: request.temperature,
    topP: request.top_p,
    speed: request.prosody.speed,
    volume: request.prosody.volume,
  };
}

export function publicError(error) {
  if (error?.public) return { status: 400, message: error.message };
  const status = Number(error?.statusCode || error?.rawResponse?.status);
  if (status === 401 || status === 403) {
    return { status: 401, message: "Fish Audio rejected the API key." };
  }
  if (status === 402) {
    return { status: 402, message: "Fish Audio credits are unavailable." };
  }
  if (status === 422) {
    return { status: 422, message: "Fish Audio rejected these synthesis settings." };
  }
  if (status === 429) {
    return { status: 429, message: "Fish Audio rate limit reached. Try again shortly." };
  }
  return { status: 502, message: "Fish Audio request failed." };
}

function inputError(message) {
  return Object.assign(new Error(message), { public: true });
}

function client() {
  if (!process.env.FISH_API_KEY) {
    throw Object.assign(new Error("Missing API key"), {
      public: true,
      missingKey: true,
    });
  }
  return new FishAudioClient({ apiKey: process.env.FISH_API_KEY });
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function serveFile(request, response) {
  const filename = FILES.get(new URL(request.url, "http://localhost").pathname);
  if (!filename) return false;
  const body = await readFile(join(PUBLIC, filename));
  response.writeHead(200, {
    "Content-Type": TYPES[extname(filename)],
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
  return true;
}

export async function listVoices(response, requestId = "direct") {
  const started = performance.now();
  log("fish.voices.request", { requestId, self: true, pageSize: 100 });
  try {
    const result = await client().voices.search({
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
    json(response, 200, { voices });
  } catch (error) {
    if (error.missingKey) {
      log("fish.voices.error", { requestId, status: 503, reason: "missing_api_key" });
      return json(response, 503, {
        error: "Add FISH_API_KEY to .env, then restart the server.",
      });
    }
    const safe = publicError(error);
    log("fish.voices.error", { requestId, status: safe.status, message: safe.message });
    json(response, safe.status, { error: safe.message });
  }
}

async function synthesize(request, response, requestId) {
  const started = performance.now();
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_UPLOAD) {
    log("fish.tts.rejected", { requestId, status: 413, contentLength });
    return json(response, 413, { error: "Request is too large." });
  }
  if (!request.headers["content-type"]?.startsWith("multipart/form-data")) {
    log("fish.tts.rejected", { requestId, status: 415, contentType: request.headers["content-type"] });
    return json(response, 415, { error: "Expected multipart form data." });
  }

  try {
    const webRequest = new Request("http://localhost/api/tts", {
      method: "POST",
      headers: { "content-type": request.headers["content-type"] },
      body: Readable.toWeb(request),
      duplex: "half",
    });
    const form = await webRequest.formData();
    const ttsRequest = buildTtsRequest(form);
    log("fish.tts.request", { requestId, ...summarizeTts(form, ttsRequest) });
    const abort = new AbortController();
    response.on("close", () => {
      if (!response.writableEnded) abort.abort();
    });

    const { data, rawResponse } = await client()
      .textToSpeech.convert(ttsRequest, MODEL, { abortSignal: abort.signal })
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

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="fish-s21.${ttsRequest.format}"`,
      "X-Fish-Model": MODEL,
    });
    let bytes = 0;
    Readable.fromWeb(data)
      .on("data", (chunk) => { bytes += chunk.length; })
      .on("end", () => log("fish.tts.complete", {
        requestId,
        bytes,
        durationMs: Math.round(performance.now() - started),
      }))
      .on("error", () => {
        log("fish.tts.stream_error", { requestId });
        response.destroy();
      })
      .pipe(response);
  } catch (error) {
    if (response.headersSent) return response.destroy();
    if (error.missingKey) {
      log("fish.tts.error", { requestId, status: 503, reason: "missing_api_key" });
      return json(response, 503, {
        error: "Add FISH_API_KEY to .env, then restart the server.",
      });
    }
    const safe = publicError(error);
    log("fish.tts.error", {
      requestId,
      status: safe.status,
      message: safe.message,
      durationMs: Math.round(performance.now() - started),
    });
    json(response, safe.status, { error: safe.message });
  }
}

export function createApp() {
  return createServer(async (request, response) => {
    const requestId = randomUUID().slice(0, 8);
    const started = performance.now();
    const pathname = new URL(request.url, "http://localhost").pathname;
    response.setHeader("X-Request-ID", requestId);
    log("http.request", {
      requestId,
      method: request.method,
      path: pathname,
      contentLength: Number(request.headers["content-length"] || 0) || undefined,
    });
    response.on("finish", () => log("http.response", {
      requestId,
      method: request.method,
      path: pathname,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - started),
    }));
    try {
      if (request.method === "GET" && pathname === "/api/voices") {
        return listVoices(response, requestId);
      }
      if (request.method === "POST" && pathname === "/api/tts") {
        return synthesize(request, response, requestId);
      }
      if (request.method === "GET" && (await serveFile(request, response))) return;
      json(response, 404, { error: "Not found." });
    } catch {
      log("http.error", { requestId, method: request.method, path: pathname });
      if (!response.headersSent) json(response, 500, { error: "Local server error." });
      else response.destroy();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, "127.0.0.1", () => {
    console.log(`Fish Audio lab: http://127.0.0.1:${PORT}`);
  });
}
