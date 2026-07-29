# Signal Tank

Signal Tank is a browser playground for evaluating Fish Audio's `s2.1-pro-free` text-to-speech model. Run it on your machine or deploy it to Vercel. Use it to compare voice character, multilingual delivery, synthesis settings, response time, and output formats before adding Fish Audio to a product.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmahmadmanzoor%2Ffish-audio-s21-playground&env=FISH_API_KEY&envDescription=Fish%20Audio%20API%20key&envLink=https%3A%2F%2Ffish.audio%2Fapp%2Fapi-keys)

The browser UI supports:

- Narration, agent, Urdu, Spanish, and Arabic sample scripts
- Default voices, saved account voices, reference IDs, and instant voice cloning
- Speed, volume, temperature, diversity, and latency controls
- MP3, WAV, and Opus playback and downloads
- First-byte time, completion time, and output size for each generated take
- Structured request logs for local development and Vercel

## Requirements

- Node.js 22 or newer
- A Fish Audio API key from [fish.audio/app/api-keys](https://fish.audio/app/api-keys)

## Setup

Clone the repository, install its one dependency, and create a local environment file:

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
FISH_API_KEY=your_fish_audio_api_key
PORT=3000
```

Start the local server:

```bash
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The Node server reads the API key. Browser code cannot access it. Git ignores `.env`.

## Deploy to Vercel

1. Open [vercel.com/new](https://vercel.com/new) and import this GitHub repository.
2. Keep the project root at the repository root.
3. Select **Other** as the framework preset. `vercel.json` sets `public` as the static output directory and configures the functions.
4. Add `FISH_API_KEY` under **Environment Variables**. Enable it for Production and Preview.
5. Deploy the project.

Vercel serves the browser files from `public/` and deploys `api/voices.js` and `api/tts.js` as Node.js functions. Each push to `main` triggers a production deployment after you connect the repository.

You can also deploy with the Vercel CLI:

```bash
npx vercel
npx vercel env add FISH_API_KEY
npx vercel --prod
```

Do not place the API key in `vercel.json` or any browser file.

## Evaluation flow

1. Select **Narration** and keep the **Default** voice.
2. Click **Generate signal**, then play the result under **Session takes**.
3. Compare first-byte time, completion time, and file size.
4. Switch between `normal`, `balanced`, and `low` latency modes.
5. Try the multilingual presets and adjust delivery controls.
6. Select a saved voice, paste a public reference ID, or test an approved voice recording.
7. Download useful takes as MP3, WAV, or Opus files.

Generated takes remain in the current browser tab and disappear on refresh.

## Voice sources

| Source | Use |
| --- | --- |
| Default | Let Fish Audio select a voice |
| Saved | Load up to 100 voices from your Fish Audio account |
| Voice ID | Use a saved or public Fish Audio reference ID |
| Instant clone | Upload reference audio up to 4 MB and its exact transcript |

Fish Audio recommends a clean reference recording of at least 10 seconds. Signal Tank requires consent confirmation before sending clone audio. Vercel limits function request bodies to 4.5 MB, so the app caps audio files at 4 MB to leave room for multipart fields.

## Local API

| Method | Route | Result |
| --- | --- | --- |
| `GET` | `/api/voices` | Account-owned voice IDs and titles |
| `POST` | `/api/tts` | Generated audio from multipart form data |

The server fixes the upstream model header to `s2.1-pro-free`. It validates voice selection, file type and size, and synthesis ranges before contacting Fish Audio.

## Request logs

Local development prints one JSON object per event in the terminal. Vercel writes the same events to the project Logs view.

```json
{"event":"fish.tts.request","requestId":"a1b2c3d4","model":"s2.1-pro-free","textChars":155,"voiceMode":"default","format":"mp3","latency":"balanced"}
{"event":"fish.tts.response","requestId":"a1b2c3d4","status":200,"contentType":"audio/mpeg","headersMs":184}
{"event":"fish.tts.complete","requestId":"a1b2c3d4","bytes":48291,"durationMs":936}
```

Logs contain request IDs, settings, character counts, response status, timing, and streamed byte counts. They exclude API keys, script text, transcripts, and audio contents.

## Direct API example

Fish Audio reads the model name from an HTTP header:

```js
const response = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    "Content-Type": "application/json",
    model: "s2.1-pro-free",
  },
  body: JSON.stringify({
    text: "Hello from Fish Audio.",
    format: "mp3",
    latency: "balanced",
  }),
});
```

Inline reference audio requires MessagePack. Signal Tank delegates that encoding to the official [`fish-audio`](https://www.npmjs.com/package/fish-audio) SDK.

## Tests

```bash
npm test
```

The tests cover request mapping, instant-clone consent, Vercel's upload limit, safe log metadata, sanitized errors, and function behavior.

## Privacy notes

Signal Tank does not persist generated audio or uploaded reference files. Fish Audio may retain free-tier API requests, so avoid sensitive scripts and recordings. Upload a voice only when the speaker has approved cloning.

## Current limit

The UI measures first-byte latency but waits for the complete file before playback. Add WebSocket playback when you need an interactive voice-agent prototype.
