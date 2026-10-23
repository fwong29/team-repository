// bench/table-bench.js: the State Table for bench pairs, in code.
//
// bench.html loads this file instead of table.js, so a bench pair's rows live
// here. Same format as table.js: signals are the numbers sense-serial.js writes
// (each 0 to 1, named in its SIGNALS), states are checked top to bottom and the
// first true row wins.
//
// hold is in seconds: how long a rule must stay true before the state changes.
// It is a tradeoff you choose per row. A short hold feels instant but flickers
// when a reading wobbles near its line; a long hold is calm but slow.
// Keep "nobody" last, so it catches everything the other rows miss.
//
// Our table (Fordham Wong and Ethan Takher), one HC-SR04 on D9/D10. Two
// signals, one per partner: "near" is Fordham's, "still" is Ethan's. The words
// are the ones our game needs: is a player standing at the right distance, and
// are they holding steady or swinging.

window.TABLE = {
  signals: ['present', 'near', 'still'],

  states: [
    // A hand or racket thrown past the sensor up close: near, and moving fast.
    // The shortest hold in the table, because a swing is over in a blink. It
    // flickers a little, and that is the trade we want on this row.
    { name: 'swing',  when: s => s.near > 0.6 && s.still < 0.35, hold: 0.2 },

    // Standing in range and holding steady: the player is set and waiting.
    // A full second, so a pause in the middle of moving around does not count.
    { name: 'ready',  when: s => s.present > 0.5 && s.still > 0.6, hold: 1 },

    // In range, but neither set nor swinging: walking in, turning around.
    { name: 'here',   when: s => s.present > 0.5, hold: 0.8 },

    // Nothing within range for two seconds. An empty room reads cm 400.0.
    { name: 'nobody', when: s => s.present < 0.2, hold: 2 },
  ],
};
