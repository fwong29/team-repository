// pir-measurement.js
// Adds a 10-second D-PIR measurement without changing piece.js.
//
// Expected shared data:
//   window.sensorData.connected -> true when Arduino is connected
//   window.sensorData.pir       -> 1 for HIGH, 0 for LOW
//
// Scoring:
//   0% to <20% motion time  -> 1
//   20% to <40%             -> 2
//   40% to <60%             -> 3
//   60% to <80%             -> 4
//   80% to 100%             -> 5

(() => {
  const DURATION_MS = 10_000;

  const button = document.querySelector('#pirStart');
  const panel = document.querySelector('#pirResult');
  const title = document.querySelector('#pirResultTitle');
  const text = document.querySelector('#pirResultText');
  const progressBar = document.querySelector('#pirProgress');

  if (!button || !panel || !title || !text || !progressBar) {
    console.error('PIR UI elements are missing from bench.html.');
    return;
  }

  // Shared serial data. The serial reader updates these values.
  window.sensorData = window.sensorData || {
    connected: false,
    cm: null,
    pir: 0,
    lastLine: '',
    lastUpdate: 0
  };

  let activeMeasurement = null;

  const descriptions = {
    1: 'Very little motion detected.',
    2: 'Low motion detected.',
    3: 'Moderate motion detected.',
    4: 'High motion detected.',
    5: 'Very high motion detected.'
  };

  function setResult(message) {
    text.textContent = message;
  }

  function startMeasurement() {
    if (!window.sensorData.connected) {
      panel.hidden = false;
      title.textContent = 'Arduino not connected';
      setResult('Connect the Arduino before starting the measurement.');
      return;
    }

    activeMeasurement = {
      startTime: performance.now(),
      lastTime: performance.now(),
      motionMs: 0
    };

    panel.hidden = false;
    title.textContent = 'Measuring motion…';
    setResult('Move in front of the PIR sensor for 10 seconds.');
    progressBar.style.width = '0%';

    button.disabled = true;
    button.textContent = 'Measuring…';
  }

  function finishMeasurement() {
    const measurement = activeMeasurement;
    if (!measurement) return;

    const motionFraction = Math.max(
      0,
      Math.min(1, measurement.motionMs / DURATION_MS)
    );

    const motionPercent = Math.round(motionFraction * 100);

    // Score is always between 1 and 5.
    const score = Math.min(
      5,
      Math.floor(motionFraction * 5) + 1
    );

    activeMeasurement = null;

    title.textContent = `Motion score: ${score} / 5`;

    setResult(
      `PIR detected motion for ${motionPercent}% of the 10-second test. ` +
      descriptions[score]
    );

    progressBar.style.width = '100%';
    button.disabled = !window.sensorData.connected;
    button.textContent = 'Measure motion · 10 seconds';
  }

  function updateMeasurement(now) {
    if (!activeMeasurement) return;

    const elapsed = now - activeMeasurement.startTime;

    // Credit elapsed time only while the latest PIR reading is HIGH.
    // Cap each frame interval to reduce over-counting during pauses.
    const delta = Math.max(
      0,
      Math.min(100, now - activeMeasurement.lastTime)
    );

    activeMeasurement.lastTime = now;

    if (window.sensorData.pir === 1) {
      activeMeasurement.motionMs += delta;
    }

    const fraction = Math.max(
      0,
      Math.min(1, elapsed / DURATION_MS)
    );

    progressBar.style.width = `${fraction * 100}%`;

    if (elapsed < DURATION_MS) {
      const remaining = Math.max(
        0,
        (DURATION_MS - elapsed) / 1000
      );

      setResult(
        `${remaining.toFixed(1)} seconds remaining. ` +
        `Motion detected for ${(activeMeasurement.motionMs / 1000).toFixed(1)} seconds so far.`
      );
    } else {
      finishMeasurement();
    }
  }

  button.addEventListener('click', startMeasurement);

  // The serial module also updates connection status.
  // Keep the button disabled until the Arduino is connected.
  function frame(now) {
    if (!activeMeasurement) {
      button.disabled = !window.sensorData.connected;
    }

    updateMeasurement(now);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();