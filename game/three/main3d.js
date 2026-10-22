// main3d.js: the 3D game.
//
// Two layers stacked: a WebGL canvas with the sport on it, and a 2D canvas on
// top carrying the menus, the cursor and the HUD. The 2D layer is the same
// code the flat version used, so menus did not have to be rebuilt in 3D.
//
// The camera drives the character directly: every frame the tracked body goes
// into Figure.update(), which follows your arms and plays an authored pose
// when a gesture fires. Nothing about that is per-sport.

import { Tracker } from '../tracker.js';
import { Ultrasonic } from '../serial.js';
import { Input, Calibration } from '../input.js';
import { Sound } from '../audio.js';
import { PALETTE, Cursor, Toasts, text, roundRect, menuTiles, drawTile, drawBanner, drawMeter } from '../ui.js';
import { clamp, lerp } from '../filters.js';

import { Stage } from './stage.js';
import { buildTennis } from './tennis3d.js';
import { buildGolf } from './golf3d.js';
import { buildBaseball } from './baseball3d.js';
import { buildBasketball } from './basketball3d.js';
import { buildBoxing } from './boxing3d.js';

import { tennis } from '../sports/tennis.js';
import { boxing } from '../sports/boxing.js';
import { golf } from '../sports/golf.js';
import { baseball } from '../sports/baseball.js';
import { basketball } from '../sports/basketball.js';

const SPORTS = [tennis, boxing, golf, baseball, basketball];
const SCORES_KEY = 'motion-sports-highscores-v1';

const view = document.querySelector('#view');
const hud = document.querySelector('#hud');
const hctx = hud.getContext('2d');
const video = document.querySelector('#camera');
const startButton = document.querySelector('#start');
const status = document.querySelector('#status');

const stage = new Stage(view);
const tracker = new Tracker(video);
const ultrasonic = new Ultrasonic();
const cursor = new Cursor();
const toasts = new Toasts();
let input = null;

const game = {
  scene: 'boot',
  sport: null,
  logic: null,      // the sport's rules, from game/sports/*.js
  world: null,      // its 3D scene
  mode: 'solo',
  difficulty: 1,
  lastResult: null,
};

function store(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } }
function keep(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } }

function resizeHud() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  hud.width = innerWidth * dpr;
  hud.height = innerHeight * dpr;
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resizeHud);
resizeHud();

// ---- Starting and ending a sport -------------------------------------------

const BUILD = {
  tennis: () => buildTennis(stage),
  golf: () => buildGolf(stage, game.logic.hole),
  baseball: () => buildBaseball(stage),
  basketball: () => buildBasketball(stage),
  boxing: () => buildBoxing(stage),
};

// Golf rebuilds its scene per hole, so the world matches the hole being played.
let builtHole = -1;

function startSport(sport) {
  stage.clearWorld();
  game.sport = sport;
  game.logic = sport.create({
    input, toasts,
    twoPlayer: game.mode === 'duo',
    difficulty: game.difficulty,
  });
  builtHole = -1;
  game.world = BUILD[sport.id]();
  go('play');
}

function finishSport() {
  const result = game.logic.result;
  const scores = store(SCORES_KEY, {});
  const best = scores[game.sport.id];
  const isBest = best === undefined || result.score > best;
  if (isBest) { scores[game.sport.id] = result.score; keep(SCORES_KEY, scores); }
  game.lastResult = { ...result, isBest, sport: game.sport };
  go('results');
}

function go(scene) {
  game.scene = scene;
  cursor.dwell = 0;
  cursor.hovering = null;
  if (scene === 'menu' || scene === 'results') stage.clearWorld();
}

// ---- Driving the 3D scene from the sport's state ---------------------------
// One small adapter per sport. The sport does not know 3D exists; the scene
// does not know the rules. This is the only place the two meet.

function drive(dt, events) {
  const s = game.logic.state;
  const w = game.world;
  const me = input.player(0);

  // Gestures play authored poses on the character, whatever the sport.
  for (const e of events) {
    if (e.player !== 0) continue;
    if (e.type === 'swing') w.you.play(game.sport.id === 'golf' ? 'golf' : 'swing', 0.55);
    if (e.type === 'punch') w.you.play(e.side === 'left' ? 'punchLeft' : 'punch', 0.38);
    if (e.type === 'shoot') w.you.play('shoot', 0.6);
  }

  w.you.update(dt, me, { facing: 0 });
  w.them?.update(dt, input.player(1), { facing: Math.PI });
  w.pitcher?.update(dt, null, { facing: 0 });
  w.fielders?.forEach(f => f.update(dt, null, { facing: 0 }));

  switch (game.sport.id) {
    case 'tennis': {
      // Court coordinates: the sport works in 0..1, the court is 23.8m long.
      const b = s.ball;
      w.ballAt((b.x - 0.5) * 9, 0.4 + b.height * 2.4, (b.y - 0.5) * -22);
      w.them.root.position.x = (s.farX - 0.5) * 9;
      w.frame(stage, input.depth01);
      break;
    }
    case 'golf': {
      if (s.hole !== builtHole) {        // a new hole is a new world
        stage.clearWorld();
        game.world = buildGolf(stage, game.logic.hole);
        builtHole = s.hole;
        return;                          // next frame drives the new scene
      }
      const along = s.flight
        ? lerp(s.flight.from.along, s.flight.to.along, s.flight.t)
        : s.ball.along;
      const off = s.flight
        ? lerp(s.flight.from.off, s.flight.to.off, s.flight.t)
        : s.ball.off;
      const height = s.flight ? Math.sin(s.flight.t * Math.PI) * 14 * s.flight.power : 0;
      w.ballAt(along, off, height);
      w.standAt(along, off);
      w.frame(stage, along);
      break;
    }
    case 'baseball': {
      if (s.pitch) {
        const t = clamp(s.pitch.t / s.pitch.duration, 0, 1.1);
        w.ballAt((s.pitch.x - 0.5) * 2 + s.pitch.curve * t, 1.8 - t * 0.9, -18.4 + t * 18);
      } else {
        w.ballAt(0, 1.3, -18.4);
      }
      w.frame(stage);
      break;
    }
    case 'basketball': {
      w.standAt(s.spot);
      if (s.shot) {
        const t = s.shot.t;
        const from = w.you.root.position;
        const arc = lerp(0.35, 0.95, s.shot.arc);
        w.ballAt(
          lerp(from.x, w.hoop.x + (s.shot.good ? 0 : s.shot.off * 1.4), t),
          lerp(2.0, s.shot.good ? w.hoop.y : w.hoop.y - 0.8, t) + Math.sin(t * Math.PI) * 6 * arc,
          lerp(from.z, w.hoop.z, t),
        );
      } else {
        const p = w.you.root.position;
        w.ballAt(p.x + 0.35, 1.5, p.z - 0.2);
      }
      w.frame(stage, s.spot);
      break;
    }
    case 'boxing': {
      if (s.windup > 0) w.them.play('punch', 0.4);
      else if (s.health[1] > 0) w.them.update(dt, null, { facing: Math.PI });
      w.them.root.position.x = s.windup > 0 ? s.attackSide * 0.5 * (1 - s.windup) : 0;
      w.frame(stage);
      break;
    }
  }
}

// ---- The HUD, drawn flat over the top --------------------------------------

function drawHud(w, h, events) {
  hctx.clearRect(0, 0, w, h);

  if (game.scene === 'play') {
    playHud(w, h);
    return;
  }

  // Menus sit on a wash so they read over whatever 3D is behind them.
  hctx.fillStyle = 'rgba(234,244,250,0.92)';
  hctx.fillRect(0, 0, w, h);

  switch (game.scene) {
    case 'boot':
      drawBanner(hctx, w, h, 'Motion Sports', 'Five sports. No controller.');
      break;

    case 'calibrate': {
      const ready = calibration.update(1 / 60);
      text(hctx, 'Stand where you will play', w / 2, h * 0.2, { size: 34, weight: 700 });
      text(hctx, 'Arms straight out to the sides, and hold still', w / 2, h * 0.27,
        { size: 16, color: PALETTE.inkSoft });
      const body = input.player(0);
      if (!body?.ok) text(hctx, 'Step into view of the camera', w / 2, h * 0.5, { size: 20, color: PALETTE.red });
      drawMeter(hctx, w / 2 - 110, h * 0.62, 220, 16, clamp(calibration.held / 2), PALETTE.gold);
      if (ready) { calibration.finish(); Sound.select(); go('menu'); }
      break;
    }

    case 'menu': {
      text(hctx, 'Motion Sports', w / 2, h * 0.14, { size: Math.min(54, w * 0.065), weight: 700 });
      text(hctx, 'Raise a hand, hover a tile, hold to pick', w / 2, h * 0.2,
        { size: 15, color: PALETTE.inkSoft });
      const tiles = menuTiles(SPORTS.map(s => ({ id: s.id, label: s.label, note: s.note, icon: s.icon })),
        w, h, { columns: 3, top: 0.26, maxWidth: 205 });
      const below = Math.max(...tiles.map(t => t.y + t.h));
      const bottomY = Math.min(h - 74, below + 20);
      tiles.push(
        { id: 'mode', label: game.mode === 'solo' ? 'Solo' : 'Two players', x: w * 0.12, y: bottomY, w: w * 0.2, h: 50 },
        { id: 'difficulty', label: ['Easy', 'Normal', 'Hard'][game.difficulty], x: w * 0.4, y: bottomY, w: w * 0.2, h: 50 },
        { id: 'sensor', label: ultrasonic.connected ? 'Sensor on' : 'Connect sensor', x: w * 0.68, y: bottomY, w: w * 0.2, h: 50 },
      );
      const picked = cursor.pick(tiles, w, h);
      for (const t of tiles) {
        drawTile(hctx, t, { hovered: cursor.hovering === t.id, dwell: cursor.hovering === t.id ? cursor.dwell : 0 });
      }
      if (picked === 'mode') game.mode = game.mode === 'solo' ? 'duo' : 'solo';
      else if (picked === 'difficulty') game.difficulty = (game.difficulty + 1) % 3;
      else if (picked === 'sensor') ultrasonic.connected ? ultrasonic.disconnect() : ultrasonic.connect();
      else if (picked) startSport(SPORTS.find(s => s.id === picked));
      break;
    }

    case 'results': {
      const r = game.lastResult;
      text(hctx, r.win ? 'Nice one' : 'Good effort', w / 2, h * 0.26, { size: 46, weight: 700 });
      text(hctx, r.sport.label, w / 2, h * 0.34, { size: 18, color: PALETTE.inkSoft });
      text(hctx, r.detail, w / 2, h * 0.44, { size: 34, weight: 600, color: PALETTE.gold });
      if (r.isBest) text(hctx, 'new best', w / 2, h * 0.51, { size: 16, color: PALETTE.gold });
      const tiles = [
        { id: 'again', label: 'Play again', x: w / 2 - 210, y: h * 0.6, w: 190, h: 86 },
        { id: 'menu', label: 'Menu', x: w / 2 + 20, y: h * 0.6, w: 190, h: 86 },
      ];
      const picked = cursor.pick(tiles, w, h);
      for (const t of tiles) {
        drawTile(hctx, t, { hovered: cursor.hovering === t.id, dwell: cursor.hovering === t.id ? cursor.dwell : 0 });
      }
      if (picked === 'again') startSport(r.sport);
      if (picked === 'menu') go('menu');
      break;
    }
  }

  if (game.scene !== 'boot') cursor.draw(hctx, w, h);
  toasts.draw(hctx, w, h);
}

// A small readout over the 3D scene: whatever this sport's state says matters.
function playHud(w, h) {
  const s = game.logic.state;
  const lines = {
    tennis: () => [`${s.scores[0]} - ${s.scores[1]}`, s.rally > 2 ? `rally ${s.rally}` : 'first to 5'],
    boxing: () => [`${Math.round(s.health[0])}% vs ${Math.round(s.health[1])}%`,
                   `stamina ${Math.round(s.stamina * 100)}%`],
    golf: () => [`Hole ${s.hole + 1}`, `${s.strokes[s.turn]} strokes · ${s.lie}`],
    baseball: () => [`${s.runs[0]} runs`, `${s.strikes} strike${s.strikes === 1 ? '' : 's'} · ${s.outs} out`],
    basketball: () => [`${s.scores[0]} pts`,
                       `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
  }[game.sport.id]();

  hctx.fillStyle = PALETTE.paper;
  roundRect(hctx, w / 2 - 130, 16, 260, 62, 14);
  hctx.fill();
  text(hctx, lines[0], w / 2, 40, { size: 24, weight: 700, color: PALETTE.ink });
  text(hctx, lines[1], w / 2, 64, { size: 13, color: PALETTE.inkSoft });

  text(hctx, 'both arms overhead to quit', w / 2, h - 18, { size: 12, color: PALETTE.inkSoft });
  toasts.draw(hctx, w, h);
}

// Calibration, same measurements as the flat version.
const calibration = {
  samples: [], held: 0,
  reset() { this.samples = []; this.held = 0; },
  update(dt) {
    const body = input?.player(0);
    if (!body?.ok) { this.held = 0; return false; }
    const span = body.scale;
    const arm = Math.max(body.hands.left.extension, body.hands.right.extension) * body.calib.armLength;
    if (arm < span * 0.7) { this.held = 0; return false; }
    this.samples.push({ span, arm });
    this.held += dt;
    return this.held >= 2 && this.samples.length >= 40;
  },
  finish() {
    const mid = k => [...this.samples.map(s => s[k])].sort((a, b) => a - b)[Math.floor(this.samples.length / 2)];
    input.recalibrate({
      shoulderSpan: mid('span'), armLength: mid('arm'),
      bodyHeight: 0.55, neutralCm: ultrasonic.fresh ? ultrasonic.cm : input.calib.neutralCm,
      at: Date.now(),
    });
    this.reset();
  },
};

// ---- The loop ---------------------------------------------------------------

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = hud.width / dpr, h = hud.height / dpr;

  let events = [];
  if (input) {
    events = input.update(now);
    cursor.update(input.player(0), input, now, dt);
  }

  if (game.scene === 'play' && game.logic && game.world) {
    game.logic.update(dt, now, events);
    drive(dt, events);
    if (events.some(e => e.type === 'pause')) { Sound.back(); go('menu'); }
    if (game.logic.done) finishSport();
  }

  stage.render();
  drawHud(w, h, events);
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
    status.textContent = tracker.error || `The camera did not start: ${err.message}`;
    return;
  }
  input = new Input(tracker, ultrasonic, Calibration.load());
  startButton.remove();
  status.hidden = true;
  calibration.reset();
  go(Calibration.load() ? 'menu' : 'calibrate');
}

startButton.addEventListener('click', boot);
requestAnimationFrame(frame);
