// bench/sense-serial.js: Reads Arduino sensors over USB.
// Includes ultrasonic sensing and a 10-second PIR motion test.

const BAUD = 115200;

const button = document.querySelector('#start');
const readout = document.querySelector('#readout');
const motionTestButton = document.querySelector('#motion-test-start');
const motionTestResult = document.querySelector('#motion-test-result');

const MOTION_TEST_DURATION = 10000;
const MOTION_READING_MAX_AGE = 150;

let latestAt = 0;
let motionTest = null;

// ---- Signals --------------------------------------------------------------

const SIGNALS = {
  // Near: 1 at the sensor, 0 at two metres or more.
  near: r => (r.cm === undefined ? 0 : clamp((200 - r.cm) / 190)),

  // Present: someone within 1.5 metres.
  present: r => (r.cm !== undefined && r.cm < 150 ? 1 : 0),

  // PIR motion sensor.
  // 1 = no motion, 0 = motion detected.
  still: r => (r.motion === undefined ? 0 : (r.motion > 0.5 ? 0 : 1)),
};

function clamp(x) {
  return Math.min(1, Math.max(0, x));
}

const SMOOTHING = 0.25;

// ---- State Table ----------------------------------------------------------

const signals = window.sense.signals;

let candidate = null;
let candidateSince = 0;
let latest = {};
let failed = false;

function applyTable(now) {
  const rows = window.TABLE.states;
  const winner = rows.find(row => row.when(signals));

  if (!winner || winner.name === window.sense.state) {
    candidate = null;
    return;
  }

  if (winner.name !== candidate) {
    candidate = winner.name;
    candidateSince = now;
  }

  if (now - candidateSince >= winner.hold * 1000) {
    window.sense.state = winner.name;
    window.sense.since = now;
    candidate = null;
  }
}

// ---- Arduino Reading ------------------------------------------------------

function parse(line) {
  const parts = line.trim().split(/\s+/);
  const reading = {};

  for (let i = 0; i + 1 < parts.length; i += 2) {
    const value = Number(parts[i + 1]);

    if (Number.isFinite(value)) {
      reading[parts[i]] = value;
    }
  }

  return reading;
}

function onReading(reading) {
  const sampleAt = performance.now();

  // Update the PIR motion test.
  if (motionTest?.active) {
    const sampleEnd = Math.min(
      sampleAt,
      motionTest.startedAt + MOTION_TEST_DURATION
    );

    const sampleTime = Math.min(
      Math.max(0, sampleEnd - motionTest.lastSampleAt),
      MOTION_READING_MAX_AGE
    );

    if (motionTest.lastMotion) {
      motionTest.motionMs += sampleTime;
    }

    motionTest.lastSampleAt = sampleAt;
    motionTest.lastMotion = reading.motion > 0.5;
  }

  latest = reading;
  latestAt = sampleAt;

  // Update the existing signals.
  for (const name of window.TABLE.signals) {
    const read = SIGNALS[name];

    if (!read) continue;

    signals[name] +=
      (clamp(read(reading)) - signals[name]) * SMOOTHING;
  }
}

// ---- Connect Arduino ------------------------------------------------------

async function start() {
  if (!('serial' in navigator)) {
    showFailure(
      'This browser has no Web Serial. Open the page in Chrome, on localhost. Press D for the fake sensor.'
    );
    return;
  }

  button.disabled = true;
  button.textContent = 'Pick the Arduino…';

  try {
    const port = await navigator.serial.requestPort();

    await port.open({ baudRate: BAUD });

    for (const name of window.TABLE.signals) {
      if (!SIGNALS[name]) {
        console.warn(
          `table.js names a signal "${name}" that sense-serial.js does not read yet.`
        );
      }
    }

    window.senseLive = true;
    failed = false;

    motionTestButton.disabled = false;
    motionTestResult.textContent =
      'Ready. Start a 10-second test.';

    button.remove();

    requestAnimationFrame(tick);

    const reader = port.readable
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += value;

      const lines = buffer.split('\n');

      buffer = lines.pop();

      for (const line of lines) {
        onReading(parse(line));
      }
    }

  } catch (err) {
    console.error(err);

    showFailure(
      `The Arduino did not connect: ${err.message}. Close the Arduino IDE's Serial Monitor (only one program can hold the port) and try again.`
    );
  }
}

function tick() {
  applyTable(performance.now());
  requestAnimationFrame(tick);
}

function showFailure(message) {
  button.disabled = false;
  button.textContent = 'Did not connect. Try again';

  failed = true;

  readout.hidden = false;
  readout.textContent = message;
}

button.textContent = 'Connect the Arduino';
button.addEventListener('click', start);

// ---- 10-Second PIR Motion Test --------------------------------------------

// Starts a 10-second test and counts how long the PIR sensor
// detects movement.

motionTestButton.addEventListener('click', () => {

  if (!window.senseLive || motionTest?.active) return;

  const now = performance.now();

  motionTest = {
    active: true,
    startedAt: now,
    lastSampleAt: now,

    lastMotion:
      latest.motion > 0.5 &&
      latestAt &&
      now - latestAt <= MOTION_READING_MAX_AGE,

    motionMs: 0,
  };

  motionTestButton.disabled = true;

  motionTestResult.textContent =
    'Testing: 0.0 / 10.0 seconds\nMotion detected: 0.0 seconds';

  requestAnimationFrame(updateMotionTest);
});

function updateMotionTest() {

  if (!motionTest?.active) return;

  const now = performance.now();

  const elapsed = Math.min(
    now - motionTest.startedAt,
    MOTION_TEST_DURATION
  );

  // Finish after exactly 10 seconds.
  if (elapsed >= MOTION_TEST_DURATION) {

    const finalInterval = Math.min(
      Math.max(
        0,
        motionTest.startedAt +
        MOTION_TEST_DURATION -
        motionTest.lastSampleAt
      ),
      MOTION_READING_MAX_AGE
    );

    if (
      motionTest.lastMotion &&
      latestAt &&
      now - latestAt <= MOTION_READING_MAX_AGE
    ) {
      motionTest.motionMs += finalInterval;
    }

    motionTest.motionMs = Math.min(
      motionTest.motionMs,
      MOTION_TEST_DURATION
    );

    motionTest.active = false;

    motionTestButton.disabled = false;

    motionTestResult.textContent =
      `Motion detected for ${(motionTest.motionMs / 1000).toFixed(1)} seconds during the 10-second test.`;

    return;
  }

  // Show live progress.
  motionTestResult.textContent =
    `Testing: ${(elapsed / 1000).toFixed(1)} / 10.0 seconds\n` +
    `Motion detected: ${(motionTest.motionMs / 1000).toFixed(1)} seconds`;

  requestAnimationFrame(updateMotionTest);
}

// ---- Debug Readout --------------------------------------------------------

// Press D to show or hide the sensor information.

addEventListener('keydown', e => {

  if (e.key.toLowerCase() !== 'd') return;

  if (failed) {
    failed = false;
    readout.hidden = false;
    return;
  }

  readout.hidden = !readout.hidden;
});

function drawReadout() {

  if (!readout.hidden && !failed) {

    const {
      state,
      signals: s,
      since
    } = window.sense;

    const held = (
      (performance.now() - since) / 1000
    ).toFixed(1);

    const lines = Object.entries(s).map(
      ([k, v]) => `${k.padEnd(8)} ${v.toFixed(2)}`
    );

    const raw = Object.entries(latest)
      .map(([k, v]) => `${k} ${v}`)
      .join('  ');

    readout.textContent =
      `${window.senseLive ? 'arduino: ' + raw : 'fake: keys 1-9, mouse'}\n` +
      `state    ${state}  (${held} s)\n` +
      lines.join('\n');
  }

  requestAnimationFrame(drawReadout);
}

requestAnimationFrame(drawReadout);