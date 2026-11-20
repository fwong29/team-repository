// piece.js: the laptop view. It reads window.sense and nothing else.
//
// The piece proper is the Nano and the OLED, which name you with no laptop in
// the room (bench/bench.ino). This page is the same four names on a screen big
// enough for a group to stand around, and it is how we show a visitor what it
// called them without their having to lean over the breadboard.
//
// It never touches the camera or the serial port. Whatever writes window.sense
// -- the camera, the Arduino, or fake-sense.js with nobody attached -- this
// file answers the same way.

(() => {
  const canvas = document.querySelector('#piece');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  }
  addEventListener('resize', resize);
  resize();

  // One answer per name, so a stranger can tell them apart without being told:
  // how bright the room goes, and what the strip along the bottom does.
  //   hoverer   full white, a solid bar: it is looking straight at you
  //   passerby  a dash running across the screen, the trace movement leaves
  //   waiting   steady and dim, with the seconds you have been still
  //   nobody    nearly black, one dot drifting: awake, with nobody there
  const LOOK = {
    hoverer:  { level: 1.00, strip: 'solid' },
    passerby: { level: 0.62, strip: 'trace' },
    waiting:  { level: 0.42, strip: 'ticks' },
    nobody:   { level: 0.04, strip: 'drift' },
  };

  // A name we have not given a look yet still gets one of its own, so adding a
  // row to the table never leaves the screen blank.
  function look(name) {
    if (LOOK[name]) return LOOK[name];
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 97;
    return { level: 0.3 + (h / 97) * 0.5, strip: 'ticks' };
  }

  let level = 0;

  // The screen redraws sixty times a second and the sensor never gives the
  // same number twice, so the readout gets the same treatment the Nano gives
  // it: a step it has to clear, a quarter second of staying clear, and no
  // more than three changes a second. See updateShownCm in bench/bench.ino.
  const CM_STEP = 2;
  const CM_SUSTAIN_MS = 250;
  const SHOW_EVERY_MS = 300;
  let shownCm = null;
  let shownCmAt = 0;
  let cmOffAt = null;

  function steadyCm(cm, now) {
    if (shownCm === null) {
      shownCm = Math.round(cm);
      shownCmAt = now;
      return shownCm;
    }
    if (Math.abs(cm - shownCm) < CM_STEP) {
      cmOffAt = null;
      return shownCm;
    }
    if (cmOffAt === null) cmOffAt = now;
    if (now - cmOffAt >= CM_SUSTAIN_MS && now - shownCmAt >= SHOW_EVERY_MS) {
      shownCm = Math.round(cm);
      shownCmAt = now;
      cmOffAt = null;
    }
    return shownCm;
  }

  function ramp(x, a, b) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function strip(kind, now, w, h, ink) {
    const y = h - Math.round(h * 0.09);
    const thick = Math.max(2, Math.round(h * 0.012));
    const m = Math.round(w * 0.08);
    ctx.fillStyle = ink;

    if (kind === 'solid') {
      ctx.fillRect(m, y, w - 2 * m, thick * 2);
      return;
    }
    if (kind === 'trace') {                      // movement leaves a trace
      const span = w - 2 * m;
      const x = m + ((now % 1200) / 1200) * span;
      const dash = Math.max(thick * 6, span * 0.07);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(m, y, span, thick);
      ctx.globalAlpha = 1;
      ctx.fillRect(Math.min(x, m + span - dash), y - thick, dash, thick * 3);
      return;
    }
    if (kind === 'drift') {                      // waiting, not broken
      const span = w - 2 * m;
      const x = m + ((now % 6000) / 6000) * span;
      ctx.fillRect(x, y, thick * 2, thick * 2);
      return;
    }
    const span = w - 2 * m;                      // 'ticks': still, and present
    for (let x = m; x <= m + span; x += Math.max(thick * 5, span / 28)) {
      ctx.fillRect(x, y, thick, thick);
    }
  }

  function frame(now) {
    const s = window.sense || {};
    const name = typeof s.state === 'string' ? s.state : 'nobody';
    const signals = s.signals || {};
    const near = typeof signals.near === 'number' ? signals.near : null;

    // The name sets the brightness; how close you are moves it a little inside
    // that, so leaning in still reads as leaning in.
    let target = look(name).level;
    if (near !== null) target += (near - target) * 0.25;
    level += (target - level) * 0.12;

    const w = canvas.width;
    const h = canvas.height;
    const inner = Math.round(255 * level);
    const outer = Math.round(255 * level * 0.55);

    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgb(${inner}, ${inner}, ${inner})`);
    g.addColorStop(1, `rgb(${outer}, ${outer}, ${outer})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Ink that stays readable whether the screen went white or black.
    const shade = Math.round(255 * (1 - ramp(level, 0.35, 0.65)));
    const ink = `rgb(${shade}, ${shade}, ${shade})`;

    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.min(w, h) * 0.16}px sans-serif`;
    ctx.fillText(name.toUpperCase(), w / 2, h / 2);

    // What it named you on, in the same words it prints over USB.
    const held = typeof s.since === 'number' ? (performance.now() - s.since) / 1000 : 0;
    ctx.font = `${Math.min(w, h) * 0.035}px ui-monospace, Menlo, monospace`;
    ctx.globalAlpha = 0.75;
    const cm = near === null ? '' : `cm ${steadyCm(160 - near * 160, now)}   `;
    ctx.fillText(`${cm}held ${held.toFixed(1)} s`, w / 2, h / 2 + Math.min(w, h) * 0.13);
    ctx.globalAlpha = 1;

    strip(look(name).strip, now, w, h, ink);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
