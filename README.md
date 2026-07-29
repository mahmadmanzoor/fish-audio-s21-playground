# Signal Tank

Signal Tank is a local browser playground for evaluating Fish Audio's `s2.1-pro-free` text-to-speech model. Use it to compare voice character, multilingual delivery, synthesis settings, response time, and output formats before adding Fish Audio to a product.

The browser UI supports:

- Narration, agent, Urdu, Spanish, and Arabic sample scripts
- Default voices, saved account voices, reference IDs, and instant voice cloning
- Speed, volume, temperature, diversity, and latency controls
- MP3, WAV, and Opus playback and downloads
- First-byte time, completion time, and output size for each generated take
- Structured terminal logs for local and Fish Audio requests

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
| Instant clone | Upload reference audio and its exact transcript |

Fish Audio recommends a clean reference recording of at least 10 seconds. Signal Tank requires consent confirmation before sending clone audio.

## Local API

| Method | Route | Result |
| --- | --- | --- |
| `GET` | `/api/voices` | Account-owned voice IDs and titles |
| `POST` | `/api/tts` | Generated audio from multipart form data |

The server fixes the upstream model header to `s2.1-pro-free`. It validates voice selection, file type and size, and synthesis ranges before contacting Fish Audio.

## Request logs

`npm start` prints one JSON object per event:

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

The tests cover request mapping, instant-clone consent, conflicting voice inputs, safe log metadata, sanitized errors, and missing API-key behavior.

## Privacy notes

Signal Tank does not persist generated audio or uploaded reference files. Fish Audio may retain free-tier API requests, so avoid sensitive scripts and recordings. Upload a voice only when the speaker has approved cloning.

## Current limit

The UI measures first-byte latency but waits for the complete file before playback. Add WebSocket playback when you need an interactive voice-agent prototype.
