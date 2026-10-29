// bench/sense-serial.js
// Reads HC-SR04 distance and D-PIR readings from the Arduino over USB.
//
// Expected Arduino output at 115200 baud:
//   cm 42.5 pir 0
//   cm 43.0 pir 1
//
// Also supports JSON lines such as:
//   {"cm":42.5,"pir":1}

const connectButton = document.querySelector('#start');
const readout = document.querySelector('#readout');
const pirButton = document.querySelector('#pirStart');

window.sensorData = window.sensorData || {
  connected: false,
  cm: null,
  pir: 0,
  lastLine: '',
  lastUpdate: 0,
  error: ''
};

let port = null;
let reader = null;
let lineBuffer = '';
let connectionAttempt = false;

function setStatus(message) {
  const status = document.querySelector('#status');

  if (status) {
    status.textContent = message;
  }
}

function parsePir(value) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value > 0 ? 1 : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'high', 'true', 'motion', 'on'].includes(normalized)) {
      return 1;
    }

    if (['0', 'low', 'false', 'none', 'off'].includes(normalized)) {
      return 0;
    }
  }

  return null;
}

// Update sensor readings without touching the original display state.
function applyReading(cm, pir, originalLine) {
  if (
    cm !== null &&
    Number.isFinite(cm) &&
    cm >= 0
  ) {
    window.sensorData.cm = cm;
  }

  if (pir !== null) {
    window.sensorData.pir = pir;
  }

  window.sensorData.lastLine = originalLine;
  window.sensorData.lastUpdate = performance.now();
}

// Parse one complete line from the Arduino.
function parseLine(rawLine) {
  const line = rawLine.trim();

  if (!line) return;

  let cm = null;
  let pir = null;

  // First try JSON format.
  try {
    const data = JSON.parse(line);

    const rawDistance =
      data.cm ?? data.distanceCm ?? data.distance;

    const rawPir =
      data.pir ?? data.motion ?? data.dPir;

    if (
      rawDistance !== undefined &&
      rawDistance !== null &&
      Number.isFinite(Number(rawDistance))
    ) {
      cm = Number(rawDistance);
    }

    if (rawPir !== undefined) {
      pir = parsePir(rawPir);
    }
  } catch (_) {
    // Not JSON; parse labelled text below.
  }

  // Examples: "cm 42.5", "cm:42.5", "distance=42.5"
  if (cm === null) {
    const distanceMatch = line.match(
      /\b(?:cm|distanceCm|distance)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i
    );

    if (distanceMatch) {
      cm = Number(distanceMatch[1]);
    }
  }

  // Examples: "pir 1", "pir: HIGH", "motion=LOW"
  if (pir === null) {
    const pirMatch = line.match(
      /\b(?:pir|dpir|motion)\s*[:=]?\s*(high|low|true|false|1|0|on|off)\b/i
    );

    if (pirMatch) {
      pir = parsePir(pirMatch[1]);
    }
  }

  // Update only fields actually present in this line.
  if (cm !== null || pir !== null) {
    applyReading(cm, pir, line);
  }
}

async function readSerial() {
  const decoder = new TextDecoder();

  try {
    while (port && port.readable) {
      reader = port.readable.getReader();

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          lineBuffer += decoder.decode(value, {
            stream: true
          });

          const lines = lineBuffer.split(/\r?\n/);

          // Keep the unfinished line until the next data arrives.
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            parseLine(line);
          }
        }
      } finally {
        reader.releaseLock();
        reader = null;
      }

      break;
    }
  } catch (error) {
    window.sensorData.error =
      error?.message || String(error);

    setStatus(
      `Arduino serial connection stopped: ${window.sensorData.error}`
    );
  } finally {
    window.sensorData.connected = false;
    connectionAttempt = false;

    if (pirButton) {
      pirButton.disabled = true;
    }

    if (connectButton) {
      connectButton.disabled = false;
      connectButton.textContent = 'Reconnect the Arduino';
    }

    port = null;
  }
}

connectButton?.addEventListener('click', async () => {
  if (connectionAttempt) return;

  if (!('serial' in navigator)) {
    setStatus(
      'Web Serial is unavailable. Open this page in Chrome using localhost or HTTPS.'
    );
    return;
  }

  connectionAttempt = true;
  connectButton.disabled = true;
  connectButton.textContent = 'Choose Arduino…';

  setStatus(
    'Select your Arduino. Close Arduino IDE Serial Monitor before connecting.'
  );

  try {
    port = await navigator.serial.requestPort();

    await port.open({
      baudRate: 115200
    });

    window.sensorData.connected = true;
    window.sensorData.error = '';

    connectButton.textContent = 'Arduino connected';
    connectButton.disabled = true;

    if (pirButton) {
      pirButton.disabled = false;
    }

    setStatus(
      'Arduino connected. The original display is unchanged; the PIR measurement is ready.'
    );

    connectionAttempt = false;

    // Keep reading until the serial connection ends.
    await readSerial();
  } catch (error) {
    window.sensorData.connected = false;
    window.sensorData.error =
      error?.message || String(error);

    connectionAttempt = false;

    connectButton.disabled = false;
    connectButton.textContent = 'Connect the Arduino';

    if (pirButton) {
      pirButton.disabled = true;
    }

    setStatus(
      `Could not connect to the Arduino: ${window.sensorData.error}`
    );
  }
});

// Press D to show or hide the serial diagnostic readout.
addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'd' || !readout) {
    return;
  }

  readout.hidden = !readout.hidden;

  if (!readout.hidden) {
    updateReadout();
  }
});

function updateReadout() {
  if (!readout || readout.hidden) return;

  const data = window.sensorData;

  readout.textContent =
    `Connected: ${data.connected}\n` +
    `Distance: ${data.cm === null ? 'waiting' : `${data.cm.toFixed(1)} cm`}\n` +
    `D-PIR: ${data.pir ? 'HIGH (motion)' : 'LOW (no motion)'}\n` +
    `Last serial line: ${data.lastLine || 'none'}\n` +
    `Error: ${data.error || 'none'}`;

  requestAnimationFrame(updateReadout);
}