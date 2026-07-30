import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tts from "../api/tts.js";
import {
  MAX_REFERENCE_BYTES,
  VOICE_PRESETS,
  buildTtsRequest,
  publicError,
  summarizeTts,
} from "../lib/fish.js";
import { createApp } from "../scripts/local-server.js";

function validForm() {
  const form = new FormData();
  form.set("text", "Hello from the test.");
  form.set("voiceMode", "preset");
  form.set("voicePreset", "balanced");
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

test("maps every curated voice preset without accepting client voice IDs", () => {
  for (const [slug, preset] of Object.entries(VOICE_PRESETS)) {
    const form = validForm();
    form.set("voicePreset", slug);
    assert.equal(buildTtsRequest(form).reference_id, preset.referenceId);
  }

  const arbitrary = validForm();
  arbitrary.set("referenceId", "voice-id");
  assert.throws(() => buildTtsRequest(arbitrary), /Manual voice references/);

  for (const mode of ["default", "saved", "id"]) {
    const legacy = validForm();
    legacy.set("voiceMode", mode);
    assert.throws(() => buildTtsRequest(legacy), /valid voice source/);
  }

  const unknown = validForm();
  unknown.set("voicePreset", "unknown");
  assert.throws(() => buildTtsRequest(unknown), /available voice profile/);
});

test("accepts a consented browser audio clone", () => {
  const form = validForm();
  form.set("voiceMode", "clone");
  form.delete("voicePreset");
  form.set("referenceAudio", new File(["audio"], "voice.webm", { type: "audio/webm" }));
  form.set("referenceText", "The exact words.");
  form.set("consent", "yes");
  const request = buildTtsRequest(form);
  assert.equal(request.references[0].text, "The exact words.");
  assert.equal(request.references[0].audio.name, "voice.webm");
});

test("log metadata excludes scripts, transcripts, and audio contents", () => {
  const form = validForm();
  form.set("voiceMode", "clone");
  form.delete("voicePreset");
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
  conflicting.set("voiceMode", "clone");
  conflicting.set("referenceAudio", new File(["audio"], "voice.wav", { type: "audio/wav" }));
  conflicting.set("referenceText", "Reference.");
  conflicting.set("consent", "yes");
  assert.throws(() => buildTtsRequest(conflicting), /either a voice profile or a voice clone/);

  const oversized = validForm();
  oversized.set("voiceMode", "clone");
  oversized.delete("voicePreset");
  oversized.set(
    "referenceAudio",
    new File([new Uint8Array(MAX_REFERENCE_BYTES + 1)], "voice.wav", { type: "audio/wav" }),
  );
  oversized.set("referenceText", "Reference.");
  oversized.set("consent", "yes");
  assert.throws(() => buildTtsRequest(oversized), /4 MB or smaller/);

  const missingTranscript = validForm();
  missingTranscript.set("voiceMode", "clone");
  missingTranscript.delete("voicePreset");
  missingTranscript.set("referenceAudio", new File(["audio"], "voice.wav", { type: "audio/wav" }));
  missingTranscript.set("consent", "yes");
  assert.throws(() => buildTtsRequest(missingTranscript), /exact reference transcript/);

  const missingConsent = validForm();
  missingConsent.set("voiceMode", "clone");
  missingConsent.delete("voicePreset");
  missingConsent.set("referenceAudio", new File(["audio"], "voice.wav", { type: "audio/wav" }));
  missingConsent.set("referenceText", "Reference.");
  assert.throws(() => buildTtsRequest(missingConsent), /permission/);

  const wrongType = validForm();
  wrongType.set("voiceMode", "clone");
  wrongType.delete("voicePreset");
  wrongType.set("referenceAudio", new File(["text"], "voice.txt", { type: "text/plain" }));
  wrongType.set("referenceText", "Reference.");
  wrongType.set("consent", "yes");
  assert.throws(() => buildTtsRequest(wrongType), /audio file/);
});

test("sanitizes upstream errors", () => {
  assert.deepEqual(publicError({ statusCode: 401, body: "secret" }), {
    status: 401,
    message: "The voice service rejected the API key.",
  });
  assert.deepEqual(publicError(new Error("internal details")), {
    status: 502,
    message: "Voice generation failed upstream.",
  });
});

test("the UI contains curated profiles and missing configuration is reported safely", async () => {
  const original = process.env.SIGNAL_TANK_API_KEY;
  const legacy = process.env.FISH_API_KEY;
  delete process.env.SIGNAL_TANK_API_KEY;
  delete process.env.FISH_API_KEY;
  const page = await readFile(new URL("../public/lab.html", import.meta.url), "utf8");
  assert.match(page, /Voice Lab — Signal Tank/);
  assert.match(page, /Female · American/);
  assert.match(page, /Start recording/);
  assert.match(page, /data-step="1"/);
  assert.match(page, /data-step="2"/);
  assert.match(page, /data-step="3"/);
  assert.match(page, /data-step="4"/);
  assert.match(page, /id="review-script"/);
  assert.match(page, /sonar-recorder-visual/);
  assert.match(page, /id="microphone-level"/);
  assert.doesNotMatch(page, /Saved|Voice ID|Refresh voices/);

  const response = await tts.fetch(new Request("http://localhost/api/tts", {
    method: "POST",
    body: validForm(),
  }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /SIGNAL_TANK_API_KEY/);

  if (original) process.env.SIGNAL_TANK_API_KEY = original;
  if (legacy) process.env.FISH_API_KEY = legacy;
});

test("navigation compacts down and expands up", async () => {
  const source = await readFile(new URL("../public/site.js", import.meta.url), "utf8");
  assert.match(source, /currentScrollY > lastScrollY\) compact = true/);
  assert.match(source, /currentScrollY < lastScrollY\) compact = false/);
  assert.match(source, /currentScrollY === 0\) compact = false/);
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
  assert.equal(config.framework, null);
  assert.equal(config.outputDirectory, "public");
  assert.equal(config.cleanUrls, true);
  assert.equal(config.functions["api/*.js"].maxDuration, 60);
  assert.equal(
    config.headers[0].headers.find(({ key }) => key === "Permissions-Policy").value,
    "microphone=(self)",
  );
});

test("local server serves all clean page routes and shared assets", async () => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    for (const [path, expected] of [
      ["/", "Hear the Model Before You Ship It"],
      ["/lab", "Voice Lab — Signal Tank"],
      ["/lab/", "Voice Lab — Signal Tank"],
      ["/guide", "Evaluation Guide — Signal Tank"],
      ["/guide/", "Evaluation Guide — Signal Tank"],
      ["/about", "About — Signal Tank"],
      ["/about/", "About — Signal Tank"],
      ["/use-cases", "Use Cases — Signal Tank"],
      ["/use-cases/", "Use Cases — Signal Tank"],
      ["/styles.css", "--signal"],
      ["/site.js", "signal-tank-theme"],
      ["/app.js", "const form"],
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(await response.text(), new RegExp(expected), path);
    }

    const missing = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Not found." });

    const removedVoices = await fetch(`http://127.0.0.1:${port}/api/voices`);
    assert.equal(removedVoices.status, 404);
    assert.deepEqual(await removedVoices.json(), { error: "Not found." });

    const lab = await fetch(`http://127.0.0.1:${port}/lab`);
    assert.equal(lab.headers.get("permissions-policy"), "microphone=(self)");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
