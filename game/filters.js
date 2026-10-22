// filters.js: the two filters the input layer needs, and nothing else.
//
// One Euro for landmarks (smooth when still, responsive when fast), a median
// for the ultrasonic (one bad echo should not move anything).

class LowPass {
  constructor() { this.y = null; }
  filter(x, alpha) {
    this.y = this.y === null ? x : this.y + alpha * (x - this.y);
    return this.y;
  }
}

function alphaFor(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

// One Euro: the cutoff rises with speed, so slow movement is smoothed hard and
// a fast swing is barely touched. That is what keeps lag off the gestures.
export class OneEuro {
  constructor({ minCutoff = 1.7, beta = 0.4, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.last = null;
  }
  filter(value, dt) {
    if (!Number.isFinite(value)) return this.x.y ?? 0;
    if (dt <= 0) dt = 1 / 60;
    const rate = this.last === null ? 0 : (value - this.last) / dt;
    this.last = value;
    const edx = this.dx.filter(rate, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alphaFor(cutoff, dt));
  }
}

// A rolling median. Spikes and dropouts leave no trace; a real move of the
// body still lands within half the window.
export class Median {
  constructor(size = 5) { this.size = size; this.buf = []; }
  push(value) {
    this.buf.push(value);
    if (this.buf.length > this.size) this.buf.shift();
    const sorted = [...this.buf].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  get ready() { return this.buf.length >= Math.min(3, this.size); }
  clear() { this.buf.length = 0; }
}

export function clamp(x, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, x)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
