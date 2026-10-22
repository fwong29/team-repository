// config.js: every number you might want to turn. Nothing here reads a sensor
// or draws a pixel; it is the one place to tune how the game feels.
//
// Thresholds are in BODY UNITS, not pixels or normalised frame coordinates.
// One body unit is the player's shoulder width, measured at calibration, so a
// swing reads the same whether you stand near the camera or far from it.

export const CONFIG = {
  camera: { width: 640, height: 480 },

  // The HC-SR04 half. The sketch in firmware/hcsr04.ino prints "cm 42.5".
  serial: {
    baud: 115200,        // must match Serial.begin() in the sketch
    minCm: 2,            // below this the HC-SR04 is lying
    maxCm: 400,          // its own "nothing came back" value
    medianWindow: 5,     // kills single bad echoes without adding real lag
    staleMs: 600,        // no line for this long and we fall back to the camera
  },

  // One Euro filter. Higher minCutoff = less lag, more jitter.
  smoothing: { minCutoff: 1.7, beta: 0.4, dCutoff: 1.0 },

  // Depth gets its own, much more responsive filter. A punch spends about
  // 150 ms travelling along z, and the settings above would smooth half of it
  // away — the player would throw a real punch and the game would shrug.
  // Noisier, but lag here costs a hit, and the extension gate absorbs noise.
  depthSmoothing: { minCutoff: 2.5, beta: 2.5, dCutoff: 1.0 },

  gestures: {
    swingSpeed: 2.6,       // body units per second to count as a swing
    swingRelease: 0.55,    // fraction of peak speed that ends the swing
    swingCooldownMs: 420,
    punchExtension: 0.62,  // wrist-to-shoulder over arm length, forgiving on purpose
    punchSpeed: 2.2,
    punchCooldownMs: 320,
    shootSpeed: 1.6,
    shootCooldownMs: 700,
    stepCm: 14,            // movement from neutral that counts as a step
    raiseHoldMs: 260,
    waveSwaps: 3,          // direction changes that count as a wave
    waveWindowMs: 1300,
    pauseHoldMs: 900,      // both arms overhead for this long pauses the game
  },

  cursor: {
    dwellMs: 850,          // hold a hand on a tile this long to pick it
    pushCm: 9,             // or push this much closer to pick it instantly
    pushWindowMs: 450,
    smoothing: 0.22,
  },

  // Visibility below this and a landmark is treated as missing, never as 0.
  minVisibility: 0.55,
};
