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
- Default, saved, reference-ID, and instant-clone voice modes
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

## Deploy to Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new).
2. Keep the project root at the repository root.
3. Select **Other** as the framework preset.
4. Add `SIGNAL_TANK_API_KEY` under **Environment Variables** for Production and Preview.
5. Deploy the project.

`vercel.json` serves the static product from `public/`, provides clean page URLs, and configures the serverless voice functions. Do not place credentials in `vercel.json` or browser files.

## Evaluation flow

1. Open `/lab`, select **Narration**, and keep the **Default** voice.
2. Generate the first signal, then play the result under **Session takes**.
3. Compare first-byte time, completion time, and file size.
4. Switch between `normal`, `balanced`, and `low` latency modes.
5. Try multilingual presets and adjust delivery controls.
6. Select a saved voice, paste a compatible reference ID, or test an approved recording.
7. Download useful takes as MP3, WAV, or Opus files.

Generated takes remain in the current browser tab and disappear on refresh.

## Voice sources

| Source | Use |
| --- | --- |
| Default | Use the product’s house voice |
| Saved | Load up to 100 account-owned voices |
| Voice ID | Use a saved or compatible public reference |
| Instant clone | Upload approved reference audio up to 4 MB with its exact transcript |

Signal Tank requires consent confirmation before sending clone audio. The 4 MB audio cap leaves room for multipart fields within Vercel’s function request limit.

## Local API

| Method | Route | Result |
| --- | --- | --- |
| `GET` | `/api/voices` | Account-owned voice IDs and titles |
| `POST` | `/api/tts` | Generated audio from multipart form data |

The server validates voice selection, file type and size, and synthesis ranges before contacting the configured voice service.

## Request logs

Local development prints one JSON object per event in the terminal. Vercel writes the same events to the project Logs view.

Logs contain request IDs, settings, character counts, response status, timing, and streamed byte counts. They exclude API keys, script text, transcripts, and audio contents.

## Browser integration example

```js
const form = new FormData();
form.set("text", "Hello from Signal Tank.");
form.set("voiceMode", "default");
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

The tests cover request mapping, instant-clone consent, upload limits, safe log metadata, sanitized errors, function behavior, and all clean page routes.

## Privacy

Signal Tank does not persist generated audio or uploaded reference files. An upstream processing partner may retain requests, so avoid confidential scripts and recordings. Upload a voice only when the speaker has approved cloning.

## Current limit

The lab measures first-byte latency but waits for the complete file before playback. Incremental playback can be added when the product moves into real-time agent conversations.
