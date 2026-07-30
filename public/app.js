const form = document.querySelector("#lab-form");
const text = document.querySelector("#text");
const status = document.querySelector("#status");
const generate = document.querySelector("#generate");
const resultList = document.querySelector("#result-list");
const transcript = document.querySelector("#reference-text");
const consent = document.querySelector("#consent");
const upload = document.querySelector("#reference-audio");
const recorderShell = document.querySelector("#recorder");
const recorderLabel = document.querySelector("#recording-label");
const recorderTimer = document.querySelector("#recording-timer");
const recorderFeedback = document.querySelector("#recorder-feedback");
const recorderAudio = document.querySelector("#recording-audio");
const recorderMeta = document.querySelector("#recording-meta");
const recorderReview = document.querySelector("#recording-review");
const startRecordingButton = document.querySelector("#start-recording");
const stopRecordingButton = document.querySelector("#stop-recording");
const useRecordingButton = document.querySelector("#use-recording");
const recordAgainButton = document.querySelector("#record-again");
const recordingLiveLabel = document.querySelector("#recording-live-label");
const workflowStatus = document.querySelector("#workflow-status");
const workflowCount = document.querySelector("#workflow-count");

const CLONE_PROMPT = "Hello, I’m recording a clear sample of my natural voice. This morning, I walked through a quiet garden, watched bright birds cross the blue sky, and wondered how thoughtful technology could make everyday conversations warmer, clearer, and more human.";
const MIN_RECORDING_SECONDS = 10;
const MAX_RECORDING_SECONDS = 30;
const MAX_REFERENCE_BYTES = 4_000_000;
const objectUrls = [];
let takeCount = 0;
let mediaRecorder;
let mediaStream;
let recordingChunks = [];
let recordingStarted = 0;
let recordingDuration = 0;
let timerInterval;
let stopTimeout;
let recordedFile;
let recordedUrl;
let recordingAccepted = false;
let recorderSession = 0;
let discardAfterStop = false;
let isGenerating = false;
let currentStep = 1;
let maxUnlockedStep = 1;
let activePreset = "Narration";
let audioContext;
let analyser;
let analyserSource;
let analyserData;
let analyserFrame;
let smoothedLevel = 0;
let silenceStarted;
let silenceActive = false;

const presets = {
  narration: "[warm] There is a moment, just before a new idea takes shape, when possibility feels almost electric. [chuckle] That is usually the moment worth following.",
  agent: "[friendly] Hi! I can help with that. Before we begin, could you tell me which option matters most to you: speed, quality, or price?",
  urdu: "[warm] السلام علیکم! آج ہم ایک نئی آواز کے ساتھ اردو میں بات کر رہے ہیں۔ امید ہے یہ تجربہ آپ کو قدرتی اور واضح محسوس ہوگا۔",
  spanish: "[happy] La tecnología cobra vida cuando deja de sentirse como una máquina y empieza a sonar cercana, clara y humana.",
  arabic: "[calm] أهلاً بك. هذه تجربة للصوت العربي، مصممة لاختبار الوضوح والإيقاع وطبيعية التعبير.",
};

const voiceLabels = {
  balanced: "Balanced",
  "female-american": "Female · American",
  "male-american": "Male · American",
  "female-british": "Female · British",
  "male-british": "Male · British",
  "male-indian": "Male · Indian English",
};

const canRecord = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

function shortText(value, length = 96) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > length ? `${clean.slice(0, length).trim()}…` : clean;
}

function voiceSummary() {
  return cloneIsActive()
    ? "Approved voice clone"
    : voiceLabels[selectedValue("voicePreset")] || "Balanced";
}

function updateWorkflowSummary() {
  const { format, speed, volume, latency, temperature, topP } = form.elements;
  const formatLabel = format.value.toUpperCase();
  const delivery = `${Number(speed.value).toFixed(2)}× speed · ${latency.value} latency · ${formatLabel} · ${Number(temperature.value).toFixed(2)} / ${Number(topP.value).toFixed(2)} variation`;
  document.querySelector("#step-1-summary").textContent = `${activePreset} · ${shortText(text.value, 70)}`;
  document.querySelector("#step-2-summary").textContent = voiceSummary();
  document.querySelector("#step-3-summary").textContent = delivery;
  document.querySelector("#review-script").textContent = shortText(text.value, 180);
  document.querySelector("#review-voice").textContent = voiceSummary();
  document.querySelector("#review-delivery").textContent = `${Number(speed.value).toFixed(2)}× speed · ${volume.value} dB · ${latency.value} latency · ${formatLabel} · temperature ${Number(temperature.value).toFixed(2)} · diversity ${Number(topP.value).toFixed(2)}`;
}

function cloneReady() {
  if (!cloneIsActive()) return true;
  const hasAudio = recordIsActive() ? Boolean(recordedFile && recordingAccepted) : Boolean(upload.files[0]);
  return hasAudio && Boolean(transcript.value.trim()) && consent.checked;
}

function updateStepActions() {
  form.querySelector('[data-next-step="2"]').disabled = !text.value.trim();
  form.querySelector('[data-next-step="3"]').disabled = !cloneReady();
}

function setWorkflowMessage(message, error = false) {
  workflowStatus.textContent = message;
  workflowStatus.classList.toggle("error", error);
}

function showStep(step, focus = true) {
  if (step > maxUnlockedStep) return;
  currentStep = step;
  document.querySelectorAll(".workflow-step").forEach((section) => {
    const number = Number(section.dataset.step);
    const current = number === step;
    const complete = number < maxUnlockedStep || (maxUnlockedStep === 4 && number < 4);
    const locked = number > maxUnlockedStep;
    section.dataset.state = current ? "current" : locked ? "locked" : complete ? "complete" : "available";
    const toggle = section.querySelector(".step-toggle");
    const body = section.querySelector(".step-body");
    toggle.disabled = locked;
    toggle.setAttribute("aria-expanded", String(current));
    body.hidden = !current;
    section.querySelector(".step-summary").hidden = current || locked;
    section.querySelector(".step-action").textContent = current ? "Current" : locked ? "Locked" : "Edit";
  });
  document.querySelectorAll("[data-step-jump]").forEach((button) => {
    const number = Number(button.dataset.stepJump);
    button.disabled = number > maxUnlockedStep;
    button.removeAttribute("aria-current");
    button.closest("li").classList.toggle("is-current", number === step);
    button.closest("li").classList.toggle("is-complete", number < maxUnlockedStep || (maxUnlockedStep === 4 && number < 4));
    if (number === step) button.setAttribute("aria-current", "step");
  });
  workflowCount.textContent = `Step ${step} of 4`;
  updateWorkflowSummary();
  if (step === 4) setWorkflowMessage("Review your settings, then generate the signal.");
  if (focus) {
    const heading = document.querySelector(`[data-step="${step}"] .step-heading strong`);
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    document.querySelector(`[data-step="${step}"]`).scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }
}

function continueWorkflow(nextStep) {
  if (currentStep === 1 && !text.value.trim()) {
    setWorkflowMessage("Add a script before continuing.", true);
    return text.focus();
  }
  if (currentStep === 2 && !cloneReady()) {
    setWorkflowMessage("Add approved reference audio, its transcript, and consent before continuing.", true);
    return;
  }
  maxUnlockedStep = Math.max(maxUnlockedStep, nextStep);
  setWorkflowMessage(`Step ${currentStep} complete.`);
  showStep(nextStep);
}

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function updateCount() {
  document.querySelector("#character-count").value = `${text.value.length} chars`;
}

function selectedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value;
}

function cloneIsActive() {
  return selectedValue("voiceMode") === "clone";
}

function recordIsActive() {
  return cloneIsActive() && selectedValue("cloneSource") === "record";
}

function setGenerateDisabled() {
  generate.disabled = isGenerating || ["requesting", "recording", "processing"].includes(recorderShell.dataset.state);
}

function setRecorderFeedback(message, error = false) {
  recorderFeedback.textContent = message;
  recorderFeedback.classList.toggle("error", error);
}

function setRecorderState(state) {
  recorderShell.dataset.state = state;
  const labels = {
    ready: "Ready to record",
    requesting: "Waiting for microphone permission",
    recording: "Microphone live",
    processing: "Preparing your preview",
    review: "Review your recording",
    accepted: "Recording selected",
    error: "Recording needs attention",
  };
  recorderLabel.textContent = labels[state];
  recordingLiveLabel.textContent = state === "recording"
    ? "● RECORDING"
    : state === "accepted"
      ? "✓ SELECTED"
      : state === "requesting"
        ? "MICROPHONE REQUESTED"
        : "MICROPHONE OFF";
  startRecordingButton.hidden = !["ready", "error"].includes(state);
  startRecordingButton.textContent = state === "error" ? "Try recording again" : "Start recording";
  stopRecordingButton.hidden = state !== "recording";
  useRecordingButton.hidden = state !== "review";
  recordAgainButton.hidden = !["review", "accepted"].includes(state);
  recorderReview.hidden = !["review", "accepted"].includes(state);

  const active = recordIsActive();
  startRecordingButton.disabled = !active || !canRecord;
  stopRecordingButton.disabled = !active || state !== "recording";
  useRecordingButton.disabled = !active || state !== "review";
  recordAgainButton.disabled = !active || !["review", "accepted"].includes(state);
  setGenerateDisabled();
  updateStepActions();
}

function formatTimer(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function updateTimer(seconds) {
  recorderTimer.textContent = formatTimer(seconds);
  recorderTimer.dateTime = `PT${Math.floor(seconds)}S`;
}

function clearRecordingTimers() {
  clearInterval(timerInterval);
  clearTimeout(stopTimeout);
  timerInterval = undefined;
  stopTimeout = undefined;
}

function setMicrophoneLevel(level) {
  const value = Math.max(0, Math.min(1, level));
  recorderShell.style.setProperty("--mic-level", value.toFixed(3));
  recorderShell.style.setProperty("--meter-width", `${Math.max(2, value * 100).toFixed(1)}%`);
  recorderShell.style.setProperty("--orb-scale", (1 + value * 0.14).toFixed(3));
  recorderShell.style.setProperty("--ring-one-scale", (1 + value * 0.3).toFixed(3));
  recorderShell.style.setProperty("--ring-two-scale", (1 + value * 0.5).toFixed(3));
  recorderShell.style.setProperty("--glow-size", `${(22 + value * 34).toFixed(1)}px`);
  recorderShell.style.setProperty("--bar-scale", (0.55 + value).toFixed(3));
}

function stopAudioVisualization() {
  cancelAnimationFrame(analyserFrame);
  analyserFrame = undefined;
  analyserSource?.disconnect();
  analyser?.disconnect();
  analyserSource = undefined;
  analyser = undefined;
  analyserData = undefined;
  if (audioContext && audioContext.state !== "closed") audioContext.close().catch(() => {});
  audioContext = undefined;
  silenceStarted = undefined;
  silenceActive = false;
  smoothedLevel = 0;
  setMicrophoneLevel(0);
}

async function startAudioVisualization(stream) {
  stopAudioVisualization();
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    recorderShell.classList.add("analysis-fallback");
    return;
  }
  try {
    audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    analyserSource = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    analyserData = new Uint8Array(analyser.fftSize);
    analyserSource.connect(analyser);
    recorderShell.classList.remove("analysis-fallback");

    const draw = (now) => {
      if (!analyser || recorderShell.dataset.state !== "recording") return;
      analyser.getByteTimeDomainData(analyserData);
      let energy = 0;
      for (const sample of analyserData) {
        const centered = (sample - 128) / 128;
        energy += centered * centered;
      }
      const level = Math.min(1, Math.max(0, (Math.sqrt(energy / analyserData.length) - 0.012) * 8));
      smoothedLevel += (level - smoothedLevel) * 0.24;
      setMicrophoneLevel(smoothedLevel);

      if (smoothedLevel < 0.035) {
        silenceStarted ??= now;
        if (!silenceActive && now - silenceStarted > 2000) {
          silenceActive = true;
          setRecorderFeedback("No sound detected—check your microphone or speak closer.");
        }
      } else {
        silenceStarted = undefined;
        if (silenceActive) {
          silenceActive = false;
          setRecorderFeedback("Sound received. Keep reading naturally.");
        }
      }
      analyserFrame = requestAnimationFrame(draw);
    };
    analyserFrame = requestAnimationFrame(draw);
  } catch {
    stopAudioVisualization();
    recorderShell.classList.add("analysis-fallback");
  }
}

function releaseMicrophone() {
  stopAudioVisualization();
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
}

function clearRecordedFile() {
  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  recordedUrl = undefined;
  recordedFile = undefined;
  recordingAccepted = false;
  recorderAudio.removeAttribute("src");
  recorderMeta.textContent = "";
}

function discardRecording(quiet = false) {
  recorderSession += 1;
  discardAfterStop = true;
  clearRecordingTimers();
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  releaseMicrophone();
  mediaRecorder = undefined;
  recordingChunks = [];
  recordingDuration = 0;
  clearRecordedFile();
  updateTimer(0);
  transcript.readOnly = true;
  transcript.value = CLONE_PROMPT;
  if (!quiet) {
    setRecorderState("ready");
    setRecorderFeedback("Microphone access is requested only after you press Start recording.");
  }
}

function setCloneSource(source) {
  document.querySelectorAll("[data-clone-source]").forEach((panel) => {
    const active = panel.dataset.cloneSource === source;
    panel.hidden = !active;
    panel.querySelectorAll("input, button, audio").forEach((control) => {
      control.disabled = !active || !cloneIsActive();
    });
  });

  if (source === "record") {
    upload.value = "";
    transcript.value = CLONE_PROMPT;
    transcript.readOnly = !recordingAccepted;
    if (!canRecord) {
      setRecorderState("error");
      setRecorderFeedback("This browser cannot record audio here. Use Upload audio instead.", true);
    } else {
      setRecorderState(recordedFile ? (recordingAccepted ? "accepted" : "review") : "ready");
    }
  } else {
    discardRecording(true);
    transcript.value = "";
    transcript.readOnly = false;
  }
}

function setVoiceMode(mode) {
  document.querySelectorAll(".voice-mode").forEach((panel) => {
    const active = panel.dataset.mode === mode;
    panel.hidden = !active;
    panel.querySelectorAll("input, textarea, select, button, audio").forEach((control) => {
      control.disabled = !active;
    });
  });

  if (mode === "clone") {
    if (!canRecord) {
      const recordOption = form.querySelector('input[name="cloneSource"][value="record"]');
      recordOption.disabled = true;
      if (recordOption.checked) form.querySelector('input[name="cloneSource"][value="upload"]').checked = true;
    }
    setCloneSource(selectedValue("cloneSource"));
  } else {
    discardRecording(true);
  }
}

function recorderMimeType() {
  return [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function recordingExtension(type) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

function permissionMessage(error) {
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Microphone access was denied. Allow it in browser settings or use Upload audio.";
  }
  if (error.name === "NotFoundError") return "No microphone was found. Connect one or use Upload audio.";
  if (error.name === "NotReadableError" || error.name === "AbortError") {
    return "The microphone is busy or unavailable. Close other recording apps and try again.";
  }
  return "The microphone could not start. Try again or use Upload audio.";
}

async function startRecording() {
  if (!canRecord) {
    setRecorderState("error");
    return setRecorderFeedback("This browser cannot record audio here. Use Upload audio instead.", true);
  }

  discardRecording(true);
  discardAfterStop = false;
  const session = recorderSession;
  setRecorderState("requesting");
  setRecorderFeedback("Choose Allow in the browser prompt to begin.");
  setStatus("Waiting for microphone permission…");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (session !== recorderSession || !recordIsActive()) {
      releaseMicrophone();
      return;
    }

    const mimeType = recorderMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);
    const activeRecorder = mediaRecorder;
    recordingChunks = [];
    activeRecorder.addEventListener("dataavailable", ({ data }) => {
      if (data.size) recordingChunks.push(data);
    });
    activeRecorder.addEventListener("stop", () => finishRecording(activeRecorder, session), { once: true });
    activeRecorder.start(250);

    recordingStarted = performance.now();
    recordingDuration = 0;
    updateTimer(0);
    timerInterval = setInterval(() => {
      recordingDuration = (performance.now() - recordingStarted) / 1000;
      updateTimer(Math.min(recordingDuration, MAX_RECORDING_SECONDS));
    }, 200);
    stopTimeout = setTimeout(() => stopRecording(true), MAX_RECORDING_SECONDS * 1000);
    setRecorderState("recording");
    await startAudioVisualization(mediaStream);
    setRecorderFeedback("Sound is measured locally. Read naturally and stop after 15–20 seconds.");
    setStatus("Recording reference audio…");
  } catch (error) {
    releaseMicrophone();
    setRecorderState("error");
    const message = permissionMessage(error);
    setRecorderFeedback(message, true);
    setStatus(message, true);
  }
}

function stopRecording(automatic = false) {
  if (mediaRecorder?.state !== "recording") return;
  recordingDuration = Math.min((performance.now() - recordingStarted) / 1000, MAX_RECORDING_SECONDS);
  clearRecordingTimers();
  updateTimer(recordingDuration);
  setRecorderState("processing");
  setRecorderFeedback(automatic ? "30-second limit reached. Preparing your preview…" : "Preparing your private browser preview…");
  mediaRecorder.stop();
  releaseMicrophone();
}

function finishRecording(activeRecorder, session) {
  if (discardAfterStop || session !== recorderSession) return;
  mediaRecorder = undefined;

  if (recordingDuration < MIN_RECORDING_SECONDS) {
    recordingChunks = [];
    setRecorderState("error");
    const message = `That clip was ${recordingDuration.toFixed(1)} seconds. Record at least 10 seconds and try again.`;
    setRecorderFeedback(message, true);
    return setStatus(message, true);
  }

  const type = activeRecorder.mimeType || recordingChunks[0]?.type || "audio/webm";
  const blob = new Blob(recordingChunks, { type });
  recordingChunks = [];
  if (!blob.size) {
    setRecorderState("error");
    setRecorderFeedback("No audio was captured. Check the microphone and try again.", true);
    return setStatus("No audio was captured. Try again or upload a recording.", true);
  }
  if (blob.size > MAX_REFERENCE_BYTES) {
    setRecorderState("error");
    setRecorderFeedback("The recording is larger than 4 MB. Record a shorter clip or upload a smaller file.", true);
    return setStatus("Reference audio must be 4 MB or smaller.", true);
  }

  recordedFile = new File([blob], `signal-tank-reference.${recordingExtension(type)}`, { type });
  recordedUrl = URL.createObjectURL(blob);
  recorderAudio.src = recordedUrl;
  recorderMeta.textContent = `${recordingDuration.toFixed(1)} seconds · ${(blob.size / 1024).toFixed(1)} KB · ${type.split(";")[0].replace("audio/", "").toUpperCase()}`;
  transcript.value = CLONE_PROMPT;
  transcript.readOnly = true;
  setRecorderState("review");
  setRecorderFeedback("Listen back, then choose Use recording or Record again.");
  setStatus("Reference recording ready to review.");
  updateStepActions();
}

function useRecording() {
  if (!recordedFile) return;
  recordingAccepted = true;
  transcript.readOnly = false;
  setRecorderState("accepted");
  setRecorderFeedback("Recording selected. Correct the transcript only if you changed a word.");
  setStatus("Reference recording selected. Confirm consent, then generate.");
  updateWorkflowSummary();
  updateStepActions();
}

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".preset").forEach((item) => {
      item.classList.remove("active");
      item.setAttribute("aria-pressed", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");
    activePreset = button.textContent;
    text.value = presets[button.dataset.preset];
    updateCount();
    updateWorkflowSummary();
    updateStepActions();
    text.focus();
  });
});

document.querySelectorAll(".tag").forEach((button) => {
  button.addEventListener("click", () => {
    const start = text.selectionStart;
    text.setRangeText(`${button.dataset.tag} `, start, text.selectionEnd, "end");
    updateCount();
    updateWorkflowSummary();
    text.focus();
  });
});

document.querySelectorAll('input[name="voiceMode"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    setVoiceMode(radio.value);
    updateWorkflowSummary();
    updateStepActions();
  });
});

document.querySelectorAll('input[name="cloneSource"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    setCloneSource(radio.value);
    updateWorkflowSummary();
    updateStepActions();
  });
});

document.querySelectorAll('input[name="voicePreset"]').forEach((radio) => {
  radio.addEventListener("change", updateWorkflowSummary);
});

[
  ["speed", (value) => `${Number(value).toFixed(2)}×`],
  ["volume", (value) => `${Number(value) > 0 ? "+" : ""}${value} dB`],
  ["temperature", (value) => Number(value).toFixed(2)],
  ["topP", (value) => Number(value).toFixed(2)],
].forEach(([id, format]) => {
  const input = document.querySelector(`#${id}`);
  const output = document.querySelector(`#${id}-value`);
  input.addEventListener("input", () => {
    output.value = format(input.value);
    updateWorkflowSummary();
  });
});

form.querySelectorAll("select").forEach((select) => select.addEventListener("change", updateWorkflowSummary));

document.querySelectorAll("[data-next-step]").forEach((button) => {
  button.addEventListener("click", () => continueWorkflow(Number(button.dataset.nextStep)));
});

document.querySelectorAll("[data-step-toggle], [data-step-jump], [data-edit-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.stepToggle || button.dataset.stepJump || button.dataset.editStep);
    showStep(step);
  });
});

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
  download.download = `signal-tank-take-${takeCount}.${settings.format}`;
  download.textContent = "Download";
  foot.append(summary, download);

  article.append(number, quote, stats, audio, foot);
  resultList.prepend(article);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const mode = data.get("voiceMode");

  if (mode === "clone") {
    if (data.get("cloneSource") === "record") {
      if (!recordedFile || !recordingAccepted) {
        return setStatus("Record and approve a reference clip before generating.", true);
      }
      data.set("referenceAudio", recordedFile);
    }
    const referenceAudio = data.get("referenceAudio");
    if (!(referenceAudio instanceof File) || !referenceAudio.size) {
      return setStatus("Record or upload reference audio before generating.", true);
    }
    if (referenceAudio.size > MAX_REFERENCE_BYTES) {
      return setStatus("Reference audio must be 4 MB or smaller.", true);
    }
    if (!String(data.get("referenceText") || "").trim()) {
      return setStatus("Enter the exact words spoken in the reference audio.", true);
    }
    if (data.get("consent") !== "yes") {
      return setStatus("Confirm that you have permission to clone this voice.", true);
    }
  }

  isGenerating = true;
  generate.classList.add("loading");
  setGenerateDisabled();
  setStatus("Sending script to the voice engine…");
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
    addTake({
      blob,
      firstByte: firstByte ?? total,
      total,
      script: String(data.get("text")),
      settings: {
        voice: mode === "clone" ? "Voice clone" : voiceLabels[data.get("voicePreset")],
        speed: data.get("speed"),
        latency: data.get("latency"),
        format,
      },
    });
    setStatus(`Take ${takeCount} ready in ${Math.round(total)} ms.`);
    document.querySelector("#results-title").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    isGenerating = false;
    generate.classList.remove("loading");
    setGenerateDisabled();
  }
});

startRecordingButton.addEventListener("click", startRecording);
stopRecordingButton.addEventListener("click", stopRecording);
useRecordingButton.addEventListener("click", useRecording);
recordAgainButton.addEventListener("click", startRecording);
upload.addEventListener("change", () => {
  const file = upload.files[0];
  if (file?.size > MAX_REFERENCE_BYTES) {
    upload.value = "";
    setStatus("Reference audio must be 4 MB or smaller.", true);
  } else if (file) {
    setStatus(`${file.name} selected. Add its exact transcript and confirm consent.`);
  }
  updateWorkflowSummary();
  updateStepActions();
});
text.addEventListener("input", () => {
  activePreset = "Custom";
  updateCount();
  updateWorkflowSummary();
  updateStepActions();
});
transcript.addEventListener("input", updateStepActions);
consent.addEventListener("change", updateStepActions);
window.addEventListener("pagehide", () => {
  recorderSession += 1;
  clearRecordingTimers();
  releaseMicrophone();
  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  objectUrls.forEach(URL.revokeObjectURL);
});

if (!canRecord) {
  const recordOption = form.querySelector('input[name="cloneSource"][value="record"]');
  recordOption.disabled = true;
  form.querySelector('input[name="cloneSource"][value="upload"]').checked = true;
}

updateCount();
setVoiceMode("preset");
updateWorkflowSummary();
updateStepActions();
showStep(1, false);
