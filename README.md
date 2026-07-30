# Signal Tank

Signal Tank is a complete voice-generation workspace for testing character, multilingual delivery, synthesis settings, response time, voice references, and output formats before shipping speech into a product.

The product includes:

- A polished product overview at `/`
- The complete evaluation workspace at `/lab`
- Practical workflows at `/use-cases`
- A setup, testing, privacy, and integration guide at `/guide`
- Product principles and privacy posture at `/about`
- System-aware light and dark themes with a persistent theme toggle
- Narration, agent, Urdu, Spanish, and Arabic sample scripts
- Six curated voice profiles plus consent-led voice cloning
- Native browser recording with upload fallback
- Speed, volume, temperature, diversity, and latency controls
- MP3, WAV, and Opus playback and downloads
- First-byte time, completion time, and output size for each generated take
- Structured, privacy-safe request logs

## Requirements

- Node.js 22 or newer
- A compatible voice-service API key

## Local setup

Install the single runtime dependency and create a local environment file:

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
SIGNAL_TANK_API_KEY=your_voice_api_key
PORT=3000
```

Start the local server:

```bash
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), then choose **Open Lab**. You can also go directly to [http://127.0.0.1:3000/lab](http://127.0.0.1:3000/lab).

The Node server reads the API key. Browser code cannot access it, and Git ignores `.env`.

Browser recording uses the native `MediaRecorder` API and requires microphone permission. It works on localhost during development; deployed sites must use HTTPS. If a browser cannot record WebM, MP4, or Ogg audio, the lab keeps the normal audio-upload fallback available.

## Deploy to Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new).
2. Keep the project root at the repository root.
3. Select **Other** as the framework preset.
4. Add `SIGNAL_TANK_API_KEY` under **Environment Variables** for Production and Preview.
5. Deploy the project.

`vercel.json` serves the static product from `public/`, provides clean page URLs, and configures the serverless voice functions. Do not place credentials in `vercel.json` or browser files.

## Evaluation flow

1. Open `/lab`, select **Narration**, and keep the **Balanced** voice.
2. Generate the first signal, then play the result under **Session takes**.
3. Compare first-byte time, completion time, and file size.
4. Switch between `normal`, `balanced`, and `low` latency modes.
5. Try multilingual presets and adjust delivery controls.
6. Compare curated accents or test an approved browser recording or upload.
7. Download useful takes as MP3, WAV, or Opus files.

Generated takes remain in the current browser tab and disappear on refresh.

## Voice sources

| Source | Use |
| --- | --- |
| Balanced | Use the product’s flexible house voice |
| Female · American | Bright, friendly conversation and narration |
| Male · American | Clear, energetic delivery |
| Female · British | Crisp, professional delivery |
| Male · British | Deep, measured narration |
| Male · Indian English | Calm, clear professional speech |
| Voice clone | Record or upload approved reference audio with its exact transcript |

Signal Tank requires consent confirmation before sending clone audio. Browser recordings must be at least 10 seconds, stop automatically at 30 seconds, and remain in memory until generation. The 4 MB audio cap leaves room for multipart fields within Vercel’s function request limit.

## Local API

| Method | Route | Result |
| --- | --- | --- |
| `POST` | `/api/tts` | Generated audio from multipart form data |

The server maps preset slugs to curated voice references and validates voice selection, file type and size, consent, and synthesis ranges before contacting the configured voice service. Manual voice IDs are rejected.

## Request logs

Local development prints one JSON object per event in the terminal. Vercel writes the same events to the project Logs view.

Logs contain request IDs, settings, character counts, response status, timing, and streamed byte counts. They exclude API keys, script text, transcripts, and audio contents.

## Browser integration example

```js
const form = new FormData();
form.set("text", "Hello from Signal Tank.");
form.set("voiceMode", "preset");
form.set("voicePreset", "balanced");
form.set("format", "mp3");
form.set("latency", "balanced");

const response = await fetch("/api/tts", {
  method: "POST",
  body: form,
});

const audio = new Audio(URL.createObjectURL(await response.blob()));
audio.play();
```

## Tests

```bash
npm test
```

The tests cover preset mapping, clone consent, upload limits, safe log metadata, sanitized errors, function behavior, and all clean page routes.

## Privacy

Signal Tank does not persist generated audio, uploaded reference files, or browser recordings. Microphone access is requested only after pressing Start recording and tracks are released after stopping. An upstream processing partner may retain requests, so avoid confidential scripts and recordings. Clone a voice only when the speaker has approved that use.

## Current limit

The lab measures first-byte latency but waits for the complete file before playback. Incremental playback can be added when the product moves into real-time agent conversations.
