// audio.js: every sound in the game, made from scratch with Web Audio. No
// files, no downloads, nothing to licence — a few oscillators and a noise
// burst shaped differently per event.
//
// Browsers refuse to make noise until the player has interacted with the page,
// so the context is created on the first real gesture and stays unlocked.

let ctx = null;
let master = null;
let muted = false;

function wake() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = freq, dur = 0.18, type = 'sine', gain = 0.6, delay = 0 }) {
  if (muted) return;
  const c = wake();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Filtered white noise: the basis of every impact and whoosh in the game.
function noise({ dur = 0.2, gain = 0.5, from = 2600, to = 320, q = 1.1, delay = 0 }) {
  if (muted) return;
  const c = wake();
  const t = c.currentTime + delay;
  const frames = Math.ceil(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(master);
  src.start(t);
}

export const Sound = {
  get muted() { return muted; },
  toggle() { muted = !muted; return muted; },

  hover()   { tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.18 }); },
  select()  { tone({ freq: 620, to: 940, dur: 0.14, type: 'triangle', gain: 0.4 });
              tone({ freq: 930, to: 1250, dur: 0.12, type: 'sine', gain: 0.22, delay: 0.07 }); },
  back()    { tone({ freq: 480, to: 280, dur: 0.14, type: 'triangle', gain: 0.3 }); },

  whoosh(power = 0.6) { noise({ dur: 0.16 + power * 0.1, gain: 0.18 + power * 0.3, from: 1400, to: 260, q: 0.8 }); },
  // The one sound the whole game is built around: bat, racket, club, glove.
  hit(power = 0.6)    { noise({ dur: 0.1, gain: 0.5 + power * 0.4, from: 3600, to: 700, q: 1.6 });
                        tone({ freq: 180 + power * 260, to: 70, dur: 0.16, type: 'triangle', gain: 0.4 }); },
  thud(power = 0.6)   { noise({ dur: 0.14, gain: 0.4 + power * 0.3, from: 900, to: 90, q: 0.9 });
                        tone({ freq: 90, to: 48, dur: 0.2, type: 'sine', gain: 0.5 }); },
  swish()             { noise({ dur: 0.3, gain: 0.3, from: 5200, to: 1800, q: 2.2 }); },
  bounce()            { tone({ freq: 300, to: 160, dur: 0.1, type: 'sine', gain: 0.3 }); },

  score()   { [0, 0.09, 0.18].forEach((d, i) => tone({ freq: 523 * (1 + i * 0.26), dur: 0.2, type: 'triangle', gain: 0.35, delay: d })); },
  miss()    { tone({ freq: 300, to: 150, dur: 0.3, type: 'sawtooth', gain: 0.22 }); },
  whistle() { tone({ freq: 1500, to: 1900, dur: 0.12, type: 'sine', gain: 0.3 });
              tone({ freq: 1900, to: 1400, dur: 0.16, type: 'sine', gain: 0.3, delay: 0.12 }); },
  // A short cheer: many detuned noise bursts stacked sound like a small crowd.
  crowd(level = 1) {
    for (let i = 0; i < 9 * level; i++) {
      noise({ dur: 0.5 + Math.random() * 0.5, gain: 0.05, from: 900 + Math.random() * 2200,
              to: 500, q: 1.5, delay: Math.random() * 0.35 });
    }
  },
};
