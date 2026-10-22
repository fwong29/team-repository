// main.js: the shell around the sports — boot, calibration, menus, pause and
// results — plus the one frame loop everything hangs off.
//
// Hands only. The single click on the start button is the browser's rule, not
// ours: a page cannot open a camera or make a sound until someone has clicked
// it once. After that the mouse and keyboard do nothing.

import { CONFIG } from './config.js';
import { Tracker, L } from './tracker.js';
import { Ultrasonic } from './serial.js';
import { Input, Calibration } from './input.js';
import { Sound } from './audio.js';
import {
  PALETTE, Cursor, Toasts, text, roundRect, menuTiles, drawTile,
  drawBanner, drawAvatar, drawDebug,
} from './ui.js';
import { clamp } from './filters.js';

import { tennis } from './sports/tennis.js';
import { boxing } from './sports/boxing.js';
import { golf } from './sports/golf.js';
import { baseball } from './sports/baseball.js';
import { basketball } from './sports/basketball.js';

const SPORTS = [tennis, boxing, golf, baseball, basketball];
const SCORES_KEY = 'motion-sports-highscores-v1';
const SEEN_KEY = 'motion-sports-seen-v1';

const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');
const video = document.querySelector('#camera');
const startButton = document.querySelector('#start');
const status = document.querySelector('#status');

const tracker = new Tracker(video);
const ultrasonic = new Ultrasonic();
const cursor = new Cursor();
const toasts = new Toasts();
let input = null;

const game = {
  scene: 'boot',
  sport: null,
  scene_obj: null,
  mode: 'solo',           // solo or duo
  difficulty: 1,          // 0 easy, 1 normal, 2 hard
  debug: new URLSearchParams(location.search).has('debug'),
  lastResult: null,
  settings: false,
};

function store(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function keep(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ }
}

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

// ---- Calibration ------------------------------------------------------------
// Stand where you will play, arms straight out. Two seconds of good frames and
// we have the shoulder width, the arm length and the neutral distance that
// every threshold in the game is a ratio of.

const calibration = {
  samples: [],
  held: 0,
  reset() { this.samples = []; this.held = 0; },

  update(dt) {
    const body = input.player(0);
    if (!body?.ok) { this.held = 0; return false; }
    const j = body.joints;
    const span = Math.hypot(j[L.leftShoulder].x - j[L.rightShoulder].x,
                            j[L.leftShoulder].y - j[L.rightShoulder].y);
    const armL = Math.hypot(j[L.leftShoulder].x - j[L.leftWrist].x,
                            j[L.leftShoulder].y - j[L.leftWrist].y);
    const armR = Math.hypot(j[L.rightShoulder].x - j[L.rightWrist].x,
                            j[L.rightShoulder].y - j[L.rightWrist].y);
    const arm = Math.max(armL, armR);

    // Arms have to actually be out, or we would measure a slouch.
    if (arm < span * 0.7) { this.held = 0; this.samples.length = 0; return false; }

    this.samples.push({ span, arm, hip: j[L.leftHip] ? Math.abs(j[L.leftHip].y - j[L.leftShoulder].y) : 0.25 });
    if (this.samples.length > 90) this.samples.shift();
    this.held += dt;
    return this.held >= 2 && this.samples.length >= 40;
  },

  finish() {
    const mid = key => {
      const sorted = this.samples.map(s => s[key]).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const calib = {
      shoulderSpan: mid('span'),
      armLength: mid('arm'),
      bodyHeight: mid('hip') * 3.2,
      neutralCm: ultrasonic.fresh ? ultrasonic.cm : (input?.calib.neutralCm ?? 150),
      at: Date.now(),
    };
    input.recalibrate(calib);
    this.reset();
    return calib;
  },
};

// ---- Scenes -----------------------------------------------------------------

function go(scene) {
  game.scene = scene;
  cursor.dwell = 0;
  cursor.hovering = null;
  if (scene === 'calibrate') calibration.reset();
}

function startSport(sport) {
  game.sport = sport;
  game.scene_obj = sport.create({
    input,
    toasts,
    twoPlayer: game.mode === 'duo',
    difficulty: game.difficulty,
  });
  go('play');
}

function finishSport() {
  const result = game.scene_obj.result;
  const scores = store(SCORES_KEY, {});
  const best = scores[game.sport.id];
  const isBest = best === undefined || result.score > best;
  if (isBest) { scores[game.sport.id] = result.score; keep(SCORES_KEY, scores); }
  game.lastResult = { ...result, isBest, sport: game.sport };
  go('results');
}

// Menu layout, rebuilt each frame so it follows the window size.
function menuLayout(w, h) {
  const tiles = menuTiles(SPORTS.map(s => ({ id: s.id, label: s.label, note: s.note, icon: s.icon })),
    w, h, { columns: 3, top: 0.26, maxWidth: 205 });
  // The bottom row sits under whatever the tiles actually came out as. A fixed
  // fraction of the height collides with the second row on a short window.
  const below = Math.max(...tiles.map(t => t.y + t.h));
  const bottomY = Math.min(h - 74, below + 20);
  tiles.push(
    { id: 'mode', label: game.mode === 'solo' ? 'Solo' : 'Two players', x: w * 0.12, y: bottomY, w: w * 0.2, h: 50 },
    { id: 'difficulty', label: ['Easy', 'Normal', 'Hard'][game.difficulty], x: w * 0.4, y: bottomY, w: w * 0.2, h: 50 },
    { id: 'settings', label: 'Settings', x: w * 0.68, y: bottomY, w: w * 0.2, h: 50 },
  );
  return tiles;
}

function settingsLayout(w, h) {
  return [
    { id: 'recalibrate', label: 'Recalibrate', note: 'stand and hold a T', x: w * 0.1, y: h * 0.36, w: w * 0.22, h: 120 },
    { id: 'sensor', label: ultrasonic.connected ? 'Sensor connected' : 'Connect sensor',
      note: ultrasonic.connected ? ultrasonic.rawLine || 'waiting' : 'HC-SR04 over USB', x: w * 0.39, y: h * 0.36, w: w * 0.22, h: 120 },
    { id: 'sound', label: Sound.muted ? 'Sound off' : 'Sound on', x: w * 0.68, y: h * 0.36, w: w * 0.22, h: 120 },
    { id: 'debug', label: game.debug ? 'Debug on' : 'Debug off', note: 'camera and skeleton', x: w * 0.1, y: h * 0.58, w: w * 0.22, h: 120 },
    { id: 'clear', label: 'Clear scores', x: w * 0.39, y: h * 0.58, w: w * 0.22, h: 120 },
    { id: 'back', label: 'Back', note: 'or wave', x: w * 0.68, y: h * 0.58, w: w * 0.22, h: 120 },
  ];
}

function handleMenuPick(id) {
  if (game.scene === 'menu') {
    if (id === 'mode') { game.mode = game.mode === 'solo' ? 'duo' : 'solo'; return; }
    if (id === 'difficulty') { game.difficulty = (game.difficulty + 1) % 3; return; }
    if (id === 'settings') { go('settings'); return; }
    const sport = SPORTS.find(s => s.id === id);
    if (!sport) return;
    const seen = store(SEEN_KEY, {});
    if (!seen[sport.id]) { game.sport = sport; go('tutorial'); return; }
    startSport(sport);
    return;
  }
  if (game.scene === 'settings') {
    if (id === 'recalibrate') { go('calibrate'); return; }
    if (id === 'sensor') { ultrasonic.connected ? ultrasonic.disconnect() : ultrasonic.connect(); return; }
    if (id === 'sound') { Sound.toggle(); return; }
    if (id === 'debug') { game.debug = !game.debug; return; }
    if (id === 'clear') { keep(SCORES_KEY, {}); toasts.add('Scores cleared', { size: 22 }); return; }
    if (id === 'back') { go('menu'); return; }
  }
  if (game.scene === 'paused') {
    if (id === 'resume') { go('play'); return; }
    if (id === 'quit') { go('menu'); return; }
  }
  if (game.scene === 'results') {
    if (id === 'again') { startSport(game.lastResult.sport); return; }
    if (id === 'menu') { go('menu'); return; }
  }
  if (game.scene === 'tutorial') {
    const seen = store(SEEN_KEY, {});
    seen[game.sport.id] = true;
    keep(SEEN_KEY, seen);
    startSport(game.sport);
  }
}

// ---- Drawing ----------------------------------------------------------------

function background(w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#14161d');
  g.addColorStop(1, '#1d1822');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawTiles(tiles, w, h) {
  for (const tile of tiles) {
    drawTile(ctx, tile, {
      hovered: cursor.hovering === tile.id,
      dwell: cursor.hovering === tile.id ? cursor.dwell : 0,
    });
  }
}

function drawHint(w, h, message) {
  text(ctx, message, w / 2, h - 26, { size: 13, color: PALETTE.dim });
}

// ---- The loop ---------------------------------------------------------------

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const w = canvas.width / (Math.min(2, devicePixelRatio || 1));
  const h = canvas.height / (Math.min(2, devicePixelRatio || 1));

  let events = [];
  if (input) {
    events = input.update(now);
    cursor.update(input.player(0), input, now, dt);
  }

  background(w, h);

  switch (game.scene) {
    case 'boot': {
      drawBanner(ctx, w, h, 'Motion Sports', 'Five sports. No controller.');
      break;
    }

    case 'calibrate': {
      const ready = calibration.update(dt);
      text(ctx, 'Stand where you will play', w / 2, h * 0.2, { size: 34, weight: 700 });
      text(ctx, 'Arms straight out to the sides, and hold still', w / 2, h * 0.27,
        { size: 16, color: PALETTE.dim });

      const body = input.player(0);
      if (body?.ok) drawAvatar(ctx, body, { x: w / 2, y: h * 0.74, height: h * 0.4 });
      else text(ctx, 'Step into view of the camera', w / 2, h * 0.58, { size: 20, color: PALETTE.red });

      const progress = clamp(calibration.held / 2);
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.82, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.82, 34, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();

      if (ultrasonic.fresh) {
        text(ctx, `sensor: ${ultrasonic.cm.toFixed(0)} cm`, w / 2, h * 0.9, { size: 13, color: PALETTE.dim });
      } else {
        text(ctx, 'no sensor — shoulder width will stand in for distance', w / 2, h * 0.9,
          { size: 13, color: PALETTE.dim });
      }

      if (ready) {
        const calib = calibration.finish();
        Sound.select();
        toasts.add('Calibrated', { color: PALETTE.gold, size: 30 });
        go('menu');
      }
      break;
    }

    case 'menu': {
      text(ctx, 'Motion Sports', w / 2, h * 0.14, { size: Math.min(54, w * 0.065), weight: 700 });
      text(ctx, 'Raise a hand, hover a tile, hold to pick', w / 2, h * 0.2,
        { size: 15, color: PALETTE.dim });
      const tiles = menuLayout(w, h);
      const picked = cursor.pick(tiles, w, h);
      drawTiles(tiles, w, h);
      const scores = store(SCORES_KEY, {});
      tiles.filter(t => scores[t.id] !== undefined).forEach(t => {
        text(ctx, `best ${scores[t.id]}`, t.x + t.w / 2, t.y - 10, { size: 11, color: PALETTE.gold });
      });
      if (picked) handleMenuPick(picked);
      drawHint(w, h, 'both arms overhead pauses · wave to go back');
      break;
    }

    case 'settings': {
      text(ctx, 'Settings', w / 2, h * 0.18, { size: 40, weight: 700 });
      const tiles = settingsLayout(w, h);
      const picked = cursor.pick(tiles, w, h);
      drawTiles(tiles, w, h);
      if (picked) handleMenuPick(picked);
      if (ultrasonic.error) {
        text(ctx, ultrasonic.error, w / 2, h * 0.78, { size: 12, color: PALETTE.red });
      }
      if (events.some(e => e.type === 'wave')) { Sound.back(); go('menu'); }
      break;
    }

    case 'tutorial': {
      text(ctx, game.sport.label, w / 2, h * 0.17, { size: 44, weight: 700 });
      game.sport.tutorial.forEach((line, i) => {
        ctx.fillStyle = PALETTE.panel;
        roundRect(ctx, w * 0.22, h * (0.3 + i * 0.1), w * 0.56, h * 0.075, 10);
        ctx.fill();
        text(ctx, String(i + 1), w * 0.26, h * (0.3 + i * 0.1) + h * 0.037,
          { size: 16, color: PALETTE.gold, weight: 700 });
        text(ctx, line, w * 0.3, h * (0.3 + i * 0.1) + h * 0.037,
          { size: 16, align: 'left' });
      });
      const tiles = [{ id: 'go', label: 'Start', x: w / 2 - 90, y: h * 0.78, w: 180, h: 58 }];
      const picked = cursor.pick(tiles, w, h);
      drawTiles(tiles, w, h);
      if (picked || events.some(e => e.type === 'raise')) handleMenuPick('go');
      break;
    }

    case 'play': {
      game.scene_obj.update(dt, now, events);
      game.scene_obj.draw(ctx, w, h);
      if (events.some(e => e.type === 'pause')) { Sound.back(); go('paused'); }
      if (game.scene_obj.done) { finishSport(); }
      break;
    }

    case 'paused': {
      game.scene_obj.draw(ctx, w, h);
      ctx.fillStyle = 'rgba(11,11,13,0.82)';
      ctx.fillRect(0, 0, w, h);
      text(ctx, 'Paused', w / 2, h * 0.3, { size: 48, weight: 700 });
      const tiles = [
        { id: 'resume', label: 'Resume', x: w / 2 - 210, y: h * 0.45, w: 190, h: 90 },
        { id: 'quit', label: 'Quit to menu', x: w / 2 + 20, y: h * 0.45, w: 190, h: 90 },
      ];
      const picked = cursor.pick(tiles, w, h);
      drawTiles(tiles, w, h);
      if (picked) handleMenuPick(picked);
      break;
    }

    case 'results': {
      const r = game.lastResult;
      text(ctx, r.win ? 'Nice one' : 'Good effort', w / 2, h * 0.24, { size: 46, weight: 700 });
      text(ctx, r.sport.label, w / 2, h * 0.32, { size: 18, color: PALETTE.dim });
      text(ctx, r.detail, w / 2, h * 0.43, { size: 34, weight: 600, color: PALETTE.gold });
      if (r.isBest) text(ctx, 'new best', w / 2, h * 0.5, { size: 16, color: PALETTE.gold });
      const tiles = [
        { id: 'again', label: 'Play again', x: w / 2 - 210, y: h * 0.6, w: 190, h: 90 },
        { id: 'menu', label: 'Menu', x: w / 2 + 20, y: h * 0.6, w: 190, h: 90 },
      ];
      const picked = cursor.pick(tiles, w, h);
      drawTiles(tiles, w, h);
      if (picked) handleMenuPick(picked);
      break;
    }
  }

  // A wave anywhere outside a game goes back a step.
  if (game.scene === 'results' || game.scene === 'tutorial') {
    if (events.some(e => e.type === 'wave')) { Sound.back(); go('menu'); }
  }

  toasts.draw(ctx, w, h);
  if (game.scene !== 'boot') cursor.draw(ctx, w, h);
  if (game.debug && input) drawDebug(ctx, w, h, { input, tracker, ultrasonic, video, events });

  requestAnimationFrame(frame);
}

// ---- Boot -------------------------------------------------------------------

async function boot() {
  startButton.disabled = true;
  startButton.textContent = 'Loading the tracker…';
  try {
    await tracker.start(2);
  } catch (err) {
    console.error(err);
    startButton.disabled = false;
    startButton.textContent = 'Did not start. Try again';
    status.hidden = false;
    status.textContent = tracker.error ||
      `The camera did not start: ${err.message}. Check the camera permission for this page.`;
    return;
  }

  input = new Input(tracker, ultrasonic, Calibration.load());
  startButton.remove();
  status.hidden = true;

  // The sensor is optional: the game plays without it, using shoulder width
  // for distance. Offer it, do not insist.
  if (ultrasonic.supported) {
    status.hidden = false;
    status.textContent = 'Connect the HC-SR04 from Settings when you want depth.';
    setTimeout(() => { status.hidden = true; }, 6000);
  }

  go(Calibration.load() ? 'menu' : 'calibrate');
}

startButton.addEventListener('click', boot);
requestAnimationFrame(frame);
