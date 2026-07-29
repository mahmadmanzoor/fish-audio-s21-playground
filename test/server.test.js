import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tts from "../api/tts.js";
import voices from "../api/voices.js";
import {
  MAX_REFERENCE_BYTES,
  buildTtsRequest,
  publicError,
  summarizeTts,
} from "../lib/fish.js";

function validForm() {
  const form = new FormData();
  form.set("text", "Hello from the test.");
  form.set("voiceMode", "default");
  form.set("format", "mp3");
  form.set("latency", "balanced");
  form.set("speed", "1.2");
  form.set("volume", "-2");
  form.set("temperature", "0.6");
  form.set("topP", "0.8");
  return form;
}

test("maps supported controls into one TTS request", () => {
  const request = buildTtsRequest(validForm());
  assert.deepEqual(request, {
    text: "Hello from the test.",
    format: "mp3",
    latency: "balanced",
    temperature: 0.6,
    top_p: 0.8,
    prosody: { speed: 1.2, volume: -2 },
  });
});

test("accepts a consented audio clone", () => {
  const form = validForm();
  form.set("voiceMode", "clone");
  form.set("referenceAudio", new File(["audio"], "voice.wav", { type: "audio/wav" }));
  form.set("referenceText", "The exact words.");
  form.set("consent", "yes");
  const request = buildTtsRequest(form);
  assert.equal(request.references[0].text, "The exact words.");
  assert.equal(request.references[0].audio.name, "voice.wav");
});

test("log metadata excludes scripts, transcripts, and audio contents", () => {
  const form = validForm();
  form.set("voiceMode", "clone");
  form.set("referenceAudio", new File(["private audio"], "voice.wav", { type: "audio/wav" }));
  form.set("referenceText", "Private transcript.");
  form.set("consent", "yes");
  const summary = JSON.stringify(summarizeTts(form, buildTtsRequest(form)));
  assert.doesNotMatch(summary, /Hello from the test|Private transcript|private audio/);
  assert.match(summary, /"textChars":20|"transcriptChars":19/);
});

test("rejects invalid ranges and conflicting voices", () => {
  const badRange = validForm();
  badRange.set("speed", "9");
  assert.throws(() => buildTtsRequest(badRange), /speed must be between/);

  const conflicting = validForm();
  conflicting.set("voiceMode", "id");
  conflicting.set("referenceId", "voice-id");
  conflicting.set("referenceAudio", new File(["audio"], "voice.wav", { type: "audio/wav" }));
  assert.throws(() => buildTtsRequest(conflicting), /not both/);

  const oversized = validForm();
  oversized.set("voiceMode", "clone");
  oversized.set(
    "referenceAudio",
    new File([new Uint8Array(MAX_REFERENCE_BYTES + 1)], "voice.wav", { type: "audio/wav" }),
  );
  oversized.set("referenceText", "Reference.");
  oversized.set("consent", "yes");
  assert.throws(() => buildTtsRequest(oversized), /4 MB or smaller/);
});

test("sanitizes upstream errors", () => {
  assert.deepEqual(publicError({ statusCode: 401, body: "secret" }), {
    status: 401,
    message: "Fish Audio rejected the API key.",
  });
  assert.deepEqual(publicError(new Error("internal details")), {
    status: 502,
    message: "Fish Audio request failed.",
  });
});

test("the UI loads and missing configuration is reported safely", async () => {
  const original = process.env.FISH_API_KEY;
  delete process.env.FISH_API_KEY;
  const page = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(page, /Fish Audio S2\.1 Pro Lab/);

  const response = await voices.fetch(new Request("http://localhost/api/voices"));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /FISH_API_KEY/);

  if (original) process.env.FISH_API_KEY = original;
});

test("Vercel voice function rejects unsupported methods", async () => {
  const response = await voices.fetch(new Request("http://localhost/api/voices", { method: "POST" }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});

test("Vercel TTS function validates input before requiring a key", async () => {
  const form = validForm();
  form.set("speed", "3");
  const response = await tts.fetch(new Request("http://localhost/api/tts", {
    method: "POST",
    body: form,
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /speed must be between/);
});

test("Vercel config serves public files and allows streamed synthesis", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.equal(config.outputDirectory, "public");
  assert.equal(config.functions["api/*.js"].maxDuration, 60);
});
