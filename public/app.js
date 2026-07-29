const form = document.querySelector("#lab-form");
const text = document.querySelector("#text");
const status = document.querySelector("#status");
const generate = document.querySelector("#generate");
const resultList = document.querySelector("#result-list");
const objectUrls = [];
let takeCount = 0;

const presets = {
  narration: "[warm] There is a moment, just before a new idea takes shape, when possibility feels almost electric. [chuckle] That is usually the moment worth following.",
  agent: "[friendly] Hi! I can help with that. Before we begin, could you tell me which option matters most to you: speed, quality, or price?",
  urdu: "[warm] السلام علیکم! آج ہم ایک نئی آواز کے ساتھ اردو میں بات کر رہے ہیں۔ امید ہے یہ تجربہ آپ کو قدرتی اور واضح محسوس ہوگا۔",
  spanish: "[happy] La tecnología cobra vida cuando deja de sentirse como una máquina y empieza a sonar cercana, clara y humana.",
  arabic: "[calm] أهلاً بك. هذه تجربة للصوت العربي، مصممة لاختبار الوضوح والإيقاع وطبيعية التعبير.",
};

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function updateCount() {
  document.querySelector("#character-count").value = `${text.value.length} chars`;
}

function setVoiceMode(mode) {
  document.querySelectorAll(".voice-mode").forEach((panel) => {
    const active = panel.dataset.mode === mode;
    panel.hidden = !active;
    panel.querySelectorAll("input, textarea, select").forEach((control) => {
      control.disabled = !active;
      control.name = active ? {
        "saved-voice": "referenceId",
        "voice-id": "referenceId",
        "reference-audio": "referenceAudio",
        "reference-text": "referenceText",
        consent: "consent",
      }[control.id] : "";
    });
  });
}

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".preset").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    text.value = presets[button.dataset.preset];
    updateCount();
    text.focus();
  });
});

document.querySelectorAll(".tag").forEach((button) => {
  button.addEventListener("click", () => {
    const start = text.selectionStart;
    text.setRangeText(`${button.dataset.tag} `, start, text.selectionEnd, "end");
    updateCount();
    text.focus();
  });
});

document.querySelectorAll('input[name="voiceMode"]').forEach((radio) => {
  radio.addEventListener("change", () => setVoiceMode(radio.value));
});

[
  ["speed", (value) => `${Number(value).toFixed(2)}×`],
  ["volume", (value) => `${Number(value) > 0 ? "+" : ""}${value} dB`],
  ["temperature", (value) => Number(value).toFixed(2)],
  ["topP", (value) => Number(value).toFixed(2)],
].forEach(([id, format]) => {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-value`);
  input.addEventListener("input", () => { output.value = format(input.value); });
});

async function loadVoices() {
  const select = document.querySelector("#saved-voice");
  const note = document.querySelector("#voices-note");
  select.innerHTML = '<option value="">Loading voices…</option>';
  try {
    const response = await fetch("/api/voices");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load voices.");
    select.innerHTML = '<option value="">Choose a saved voice…</option>';
    body.voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.title || voice.id;
      select.append(option);
    });
    note.textContent = body.voices.length
      ? `${body.voices.length} account voice${body.voices.length === 1 ? "" : "s"} loaded. Read-only.`
      : "No saved voices found. You can still paste a public voice ID.";
  } catch (error) {
    select.innerHTML = '<option value="">Voices unavailable</option>';
    note.textContent = error.message;
  }
}

function addTake({ blob, firstByte, total, settings, script }) {
  document.querySelector("#empty-results")?.remove();
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  takeCount += 1;

  const article = document.createElement("article");
  article.className = "take";

  const number = document.createElement("span");
  number.className = "take-number";
  number.textContent = `TAKE ${String(takeCount).padStart(2, "0")}`;

  const quote = document.createElement("blockquote");
  quote.textContent = script.length > 145 ? `${script.slice(0, 145)}…` : script;

  const stats = document.createElement("dl");
  stats.className = "take-stats";
  [
    ["First byte", `${Math.round(firstByte)} ms`],
    ["Complete", `${Math.round(total)} ms`],
    ["Size", `${(blob.size / 1024).toFixed(1)} KB`],
  ].forEach(([label, value]) => {
    const cell = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    cell.append(term, detail);
    stats.append(cell);
  });

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "metadata";
  audio.src = url;

  const foot = document.createElement("div");
  foot.className = "take-foot";
  const summary = document.createElement("span");
  summary.textContent = `${settings.voice} · ${settings.speed}× · ${settings.latency} · ${settings.format}`;
  const download = document.createElement("a");
  download.href = url;
  download.download = `fish-s21-take-${takeCount}.${settings.format}`;
  download.textContent = "Download";
  foot.append(summary, download);

  article.append(number, quote, stats, audio, foot);
  resultList.prepend(article);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const mode = data.get("voiceMode");
  if (mode === "clone" && data.get("consent") !== "yes") {
    return setStatus("Confirm that you have permission to clone this voice.", true);
  }

  generate.disabled = true;
  generate.classList.add("loading");
  setStatus("Sending script to S2.1 Pro…");
  const started = performance.now();

  try {
    const response = await fetch("/api/tts", { method: "POST", body: data });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Generation failed.");
    }

    const reader = response.body.getReader();
    const chunks = [];
    let firstByte;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (firstByte === undefined) {
        firstByte = performance.now() - started;
        setStatus("Signal received. Finishing audio…");
      }
      chunks.push(value);
    }

    const total = performance.now() - started;
    const format = String(data.get("format"));
    const blob = new Blob(chunks, {
      type: response.headers.get("content-type") || {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        opus: "audio/ogg",
      }[format],
    });
    const referenceId = String(data.get("referenceId") || "");
    addTake({
      blob,
      firstByte: firstByte ?? total,
      total,
      script: String(data.get("text")),
      settings: {
        voice: mode === "default" ? "default" : mode === "clone" ? "instant clone" : referenceId.slice(0, 8),
        speed: data.get("speed"),
        latency: data.get("latency"),
        format,
      },
    });
    setStatus(`Take ${takeCount} ready in ${Math.round(total)} ms.`);
    document.querySelector("#results-title").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    generate.disabled = false;
    generate.classList.remove("loading");
  }
});

text.addEventListener("input", updateCount);
document.querySelector("#refresh-voices").addEventListener("click", loadVoices);
window.addEventListener("beforeunload", () => objectUrls.forEach(URL.revokeObjectURL));

updateCount();
setVoiceMode("default");
loadVoices();
