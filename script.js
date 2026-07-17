/* ==========================================================================
   CONFIG
   ========================================================================== */
const CONFIG = {
  API_BASE: "https://v135040fq7.execute-api.ap-south-1.amazonaws.com",
  CAPTURE_INTERVAL: 10000,
  REFRESH_DELAY: 2500
};

/* ==========================================================================
   STATE
   ========================================================================== */
let cameraStream = null;
let captureIntervalId = null;
let countdownIntervalId = null;
let secondsUntilNextCapture = CONFIG.CAPTURE_INTERVAL / 1000;
let isUploadInProgress = false;

/* ==========================================================================
   DOM REFERENCES
   ========================================================================== */
const clockEl = document.getElementById("clock");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const cameraVideo = document.getElementById("cameraVideo");
const captureCanvas = document.getElementById("captureCanvas");
const cameraOverlay = document.getElementById("cameraOverlay");
const cameraOverlayText = document.getElementById("cameraOverlayText");
const captureFlash = document.getElementById("captureFlash");
const captureDot = document.getElementById("captureDot");
const captureStatusText = document.getElementById("captureStatusText");
const nextCaptureText = document.getElementById("nextCaptureText");

const latestImage = document.getElementById("latestImage");
const latestPlaceholder = document.getElementById("latestPlaceholder");
const latestEmotion = document.getElementById("latestEmotion");
const latestConfidence = document.getElementById("latestConfidence");
const latestTime = document.getElementById("latestTime");

const happiestImage = document.getElementById("happiestImage");
const happiestPlaceholder = document.getElementById("happiestPlaceholder");
const happiestEmotion = document.getElementById("happiestEmotion");
const happiestConfidence = document.getElementById("happiestConfidence");
const happiestTime = document.getElementById("happiestTime");

const saddestImage = document.getElementById("saddestImage");
const saddestPlaceholder = document.getElementById("saddestPlaceholder");
const saddestEmotion = document.getElementById("saddestEmotion");
const saddestConfidence = document.getElementById("saddestConfidence");
const saddestTime = document.getElementById("saddestTime");

const recentGrid = document.getElementById("recentGrid");
const recentEmpty = document.getElementById("recentEmpty");

const toastContainer = document.getElementById("toastContainer");

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  startClock();
  initCamera();
  refreshDashboard();
});

/* ==========================================================================
   CLOCK
   ========================================================================== */
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour12: false });
}

/* ==========================================================================
   CAMERA INITIALIZATION
   ========================================================================== */
async function initCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    cameraVideo.srcObject = cameraStream;
    cameraOverlay.classList.add("hidden");
    setConnectionStatus("live", "Live");

    startCaptureLoop();
  } catch (error) {
    console.error("Camera initialization error:", error);
    handleCameraError(error);
  }
}

function handleCameraError(error) {
  cameraOverlay.classList.remove("hidden");
  setConnectionStatus("error", "Camera Unavailable");

  if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
    cameraOverlayText.textContent = "Camera access was denied. Please allow camera permissions in your browser settings to start emotion capture.";
  } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    cameraOverlayText.textContent = "No camera device was found. Connect a webcam to begin capturing.";
  } else {
    cameraOverlayText.textContent = "Unable to access the camera right now. Please check your device and try again.";
  }

  showToast("error", "Camera unavailable");
}

/* ==========================================================================
   CAPTURE LOOP
   ========================================================================== */

async function captureLoop() {

    await captureAndUploadFrame();

    secondsUntilNextCapture = CONFIG.CAPTURE_INTERVAL / 1000;

    setTimeout(captureLoop, CONFIG.CAPTURE_INTERVAL);
}

function startCaptureLoop() {

    secondsUntilNextCapture = CONFIG.CAPTURE_INTERVAL / 1000;
    updateNextCaptureText();

    countdownIntervalId = setInterval(() => {

        secondsUntilNextCapture--;

        if (secondsUntilNextCapture <= 0) {
            secondsUntilNextCapture = CONFIG.CAPTURE_INTERVAL / 1000;
        }

        updateNextCaptureText();

    }, 1000);

    captureLoop();
}

/* ==========================================================================
   FRAME CAPTURE + UPLOAD WORKFLOW
   ========================================================================== */
async function captureAndUploadFrame() {
  // Prevent overlapping capture cycles - only one upload at a time
  if (isUploadInProgress) {
    return;
  }

  if (!cameraStream || cameraVideo.readyState < 2) {
    return;
  }

  isUploadInProgress = true;
  setCaptureStatus("Capturing...");

  try {
    const blob = await captureFrameAsBlob();
    triggerFlash();

    setCaptureStatus("Requesting upload URL...");
    const { uploadUrl } = await requestUploadUrl();

    setCaptureStatus("Uploading...");
    await uploadImageToUrl(uploadUrl, blob);

    setCaptureStatus("Processing...");
    let retries = 3;

    while (retries--) {
        await wait(1500);
        await refreshDashboard();
    }

    await refreshDashboard();
    setCaptureStatus("Idle");
  } catch (error) {
    console.error("Capture workflow error:", error);
    setCaptureStatus("Upload failed");
    showToast("error", "Capture upload failed");
  } finally {
    isUploadInProgress = false;
  }
}

function captureFrameAsBlob() {
  return new Promise((resolve, reject) => {
    const width = cameraVideo.videoWidth;
    const height = cameraVideo.videoHeight;

    if (!width || !height) {
      reject(new Error("Video stream not ready"));
      return;
    }

    captureCanvas.width = width;
    captureCanvas.height = height;

    const context = captureCanvas.getContext("2d");
    context.drawImage(cameraVideo, 0, 0, width, height);

    captureCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to encode frame as JPEG"));
        }
      },
      "image/jpeg",
      0.9
    );
  });
}

function triggerFlash() {
  captureFlash.classList.remove("flash-active");
  // Force reflow so the animation can restart
  void captureFlash.offsetWidth;
  captureFlash.classList.add("flash-active");
}

function setCaptureStatus(text) {
  captureStatusText.textContent = text;
  captureDot.classList.toggle("status-dot--live", text === "Idle");
}

function updateNextCaptureText() {
    nextCaptureText.textContent =
        `Next capture in ~${secondsUntilNextCapture}s`;
}

function setConnectionStatus(state, text) {
  statusText.textContent = text;
  statusDot.classList.remove("status-dot--live", "status-dot--error");
  if (state === "live") {
    statusDot.classList.add("status-dot--live");
  } else if (state === "error") {
    statusDot.classList.add("status-dot--error");
  }
}

/* ==========================================================================
   API CALLS
   ========================================================================== */
async function requestUploadUrl() {
  const response = await fetch(`${CONFIG.API_BASE}/upload-url`);

  if (!response.ok) {
    throw new Error("Failed to obtain upload URL");
  }

  return response.json();
}

async function uploadImageToUrl(uploadUrl, blob) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob
  });

  if (!response.ok) {
    throw new Error("Failed to upload image");
  }
}

async function fetchLatest() {
  const response = await fetch(`${CONFIG.API_BASE}/latest`);
  if (!response.ok) throw new Error("Failed to fetch latest capture");
  return response.json();
}

async function fetchRecent() {
  const response = await fetch(`${CONFIG.API_BASE}/recent`);
  if (!response.ok) throw new Error("Failed to fetch recent captures");
  return response.json();
}

async function fetchHappiest() {
  const response = await fetch(`${CONFIG.API_BASE}/happiest`);
  if (!response.ok) throw new Error("Failed to fetch happiest face");
  return response.json();
}

async function fetchSaddest() {
  const response = await fetch(`${CONFIG.API_BASE}/saddest`);
  if (!response.ok) throw new Error("Failed to fetch saddest face");
  return response.json();
}

/* ==========================================================================
   DASHBOARD REFRESH
   ========================================================================== */
async function refreshDashboard() {
  try {
    const [latest, recent, happiest, saddest] = await Promise.all([
      safeFetch(fetchLatest),
      safeFetch(fetchRecent),
      safeFetch(fetchHappiest),
      safeFetch(fetchSaddest)
    ]);

    if (latest) renderLatest(latest);
    if (recent) renderRecent(recent);
    if (happiest) renderHappiest(happiest);
    if (saddest) renderSaddest(saddest);
  } catch (error) {
    console.error("Dashboard refresh error:", error);
    showToast("error", "Unable to refresh dashboard");
  }
}

async function safeFetch(fetchFn) {
  try {
    return await fetchFn();
  } catch (error) {
    console.warn("Data fetch skipped:", error.message);
    return null;
  }
}

/* ==========================================================================
   RENDER FUNCTIONS
   ========================================================================== */
function renderLatest(data) {
  if (!data || !data.imageUrl) return;

  latestImage.src = data.imageUrl;
  latestImage.classList.remove("hidden");
  latestPlaceholder.classList.add("hidden");

  latestEmotion.textContent = data.dominantEmotion || "--";
  latestConfidence.textContent = formatConfidence(data.dominantConfidence);
  latestTime.textContent = formatTimestamp(data.captureTime);
}

function renderHappiest(data) {
  if (!data || !data.imageUrl) return;

  happiestImage.src = data.imageUrl;
  happiestImage.classList.remove("hidden");
  happiestPlaceholder.classList.add("hidden");

  happiestEmotion.textContent = data.dominantEmotion || "--";
  happiestConfidence.textContent = formatConfidence(data.happyConfidence ?? data.dominantConfidence);
  happiestTime.textContent = formatTimestamp(data.captureTime);
}

function renderSaddest(data) {
  if (!data || !data.imageUrl) return;

  saddestImage.src = data.imageUrl;
  saddestImage.classList.remove("hidden");
  saddestPlaceholder.classList.add("hidden");

  saddestEmotion.textContent = data.dominantEmotion || "--";
  saddestConfidence.textContent = formatConfidence(data.sadConfidence ?? data.dominantConfidence);
  saddestTime.textContent = formatTimestamp(data.captureTime);
}

function renderRecent(data) {
  const items = Array.isArray(data) ? data.slice(0, 10) : [];

  recentGrid.innerHTML = "";

  if (items.length === 0) {
    recentGrid.appendChild(recentEmpty);
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "recent-item";
    card.style.animationDelay = `${index * 0.05}s`;

    card.innerHTML = `
      <div class="recent-item__image-wrap">
        <img src="${item.imageUrl}" alt="Captured face showing ${escapeHtml(item.dominantEmotion || "unknown")} emotion">
      </div>
      <div class="recent-item__info">
        <p class="recent-item__emotion">${escapeHtml(item.dominantEmotion || "--")}</p>
        <p class="recent-item__confidence">${formatConfidence(item.dominantConfidence)}</p>
        <p class="recent-item__time">${formatTimestamp(item.captureTime)}</p>
      </div>
    `;

    recentGrid.appendChild(card);
  });
}

/* ==========================================================================
   TOAST NOTIFICATIONS
   ========================================================================== */
function showToast(type, message) {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast--hide");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatConfidence(value) {
  if (value === undefined || value === null || isNaN(value)) return "--%";
  return `${Math.round(value)}%`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
