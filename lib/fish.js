import { FishAudioClient } from "fish-audio";

export const MODEL = "s2.1-pro-free";
export const MAX_REQUEST_BYTES = 4_400_000;
export const MAX_REFERENCE_BYTES = 4_000_000;
export const VOICE_PRESETS = Object.freeze({
  balanced: { label: "Balanced" },
  "female-american": {
    label: "Female · American",
    referenceId: "fe12248943634224b6772493965ee064",
  },
  "male-american": {
    label: "Male · American",
    referenceId: "802e3bc2b27e49c2995d23ef70e6ac89",
  },
  "female-british": {
    label: "Female · British",
    referenceId: "fde115556a3e40059b0c28f90beca6ae",
  },
  "male-british": {
    label: "Male · British",
    referenceId: "181074920d5741ef9830617d89fe92f6",
  },
  "male-indian": {
    label: "Male · Indian English",
    referenceId: "c11b3b488f064e1aa22f87c2f1a856d2",
  },
});

export function log(event, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

export function fishClient() {
  const apiKey = process.env.SIGNAL_TANK_API_KEY || process.env.FISH_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("Missing API key"), { missingKey: true });
  }
  return new FishAudioClient({ apiKey });
}

export function buildTtsRequest(form) {
  const text = String(form.get("text") || "").trim();
  const voiceMode = String(form.get("voiceMode") || "");
  const voicePreset = String(form.get("voicePreset") || "").trim();
  const format = String(form.get("format") || "mp3");
  const latency = String(form.get("latency") || "normal");
  const referenceId = String(form.get("referenceId") || "").trim();
  const referenceAudio = form.get("referenceAudio");
  const referenceText = String(form.get("referenceText") || "").trim();

  if (!text) throw inputError("Enter text to synthesize.");
  if (form.getAll("voiceMode").length !== 1) {
    throw inputError("Choose exactly one voice source.");
  }
  if (!["preset", "clone"].includes(voiceMode)) {
    throw inputError("Choose one valid voice source.");
  }
  if (referenceId) throw inputError("Manual voice references are not supported.");
  if (!["mp3", "wav", "opus"].includes(format)) {
    throw inputError("Choose MP3, WAV, or Opus.");
  }
  if (!["normal", "balanced", "low"].includes(latency)) {
    throw inputError("Choose a valid latency mode.");
  }

  const number = (name, fallback, min, max) => {
    const value = Number(String(form.get(name) ?? fallback));
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

  if (voiceMode === "preset") {
    if (form.getAll("voicePreset").length !== 1 || !VOICE_PRESETS[voicePreset]) {
      throw inputError("Choose one available voice profile.");
    }
    if (referenceAudio instanceof File && referenceAudio.size) {
      throw inputError("A voice profile cannot include reference audio.");
    }
    if (referenceText || form.get("consent")) {
      throw inputError("A voice profile cannot include cloning details.");
    }
    if (VOICE_PRESETS[voicePreset].referenceId) {
      request.reference_id = VOICE_PRESETS[voicePreset].referenceId;
    }
  }

  if (voiceMode === "clone") {
    if (voicePreset) throw inputError("Use either a voice profile or a voice clone, not both.");
    if (!(referenceAudio instanceof File) || !referenceAudio.size) {
      throw inputError("Choose a reference audio file.");
    }
    if (!referenceAudio.type.startsWith("audio/")) {
      throw inputError("The reference must be an audio file.");
    }
    if (referenceAudio.size > MAX_REFERENCE_BYTES) {
      throw inputError("Reference audio must be 4 MB or smaller for Vercel.");
    }
    if (!referenceText) throw inputError("Enter the exact reference transcript.");
    if (form.get("consent") !== "yes") {
      throw inputError("Confirm you have permission to clone this voice.");
    }
    request.references = [{ audio: referenceAudio, text: referenceText }];
  }

  return request;
}

export function summarizeTts(form, request) {
  const reference = request.references?.[0];
  return {
    model: MODEL,
    textChars: request.text.length,
    voiceMode: String(form.get("voiceMode")),
    voicePreset: String(form.get("voicePreset") || "") || undefined,
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
    return { status: 401, message: "The voice service rejected the API key." };
  }
  if (status === 402) {
    return { status: 402, message: "Voice generation credits are unavailable." };
  }
  if (status === 422) {
    return { status: 422, message: "The selected voice or synthesis settings were rejected." };
  }
  if (status === 429) {
    return { status: 429, message: "The voice service is busy. Try again shortly." };
  }
  return { status: 502, message: "Voice generation failed upstream." };
}

function inputError(message) {
  return Object.assign(new Error(message), { public: true });
}
