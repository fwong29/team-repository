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

// Our group's table. Two sensors on one Nano:
//   near, present - Ford's HC-SR04 ultrasonic, from "cm"
//   still         - Ethan's PIR motion sensor, from "motion"
//
// The four words, and why each hold is what it is:
//   close    a hand right at the sensor. Short hold, 0.5 s, so it answers at
//            once; it is the row we want to feel instant.
//   waiting  someone in range who has stopped moving. Needs both sensors:
//            present from the ultrasonic, still from the PIR. The PIR stays
//            HIGH for a few seconds after movement stops, so this cannot
//            arrive sooner than that anyway; 1.5 s keeps it from flickering
//            on in the gap between two steps.
//   here     someone in range, moving. 1 s, calm but not sluggish.
//   nobody   the room is empty. 2 s, the longest hold, because a single bad
//            echo should never read as everybody leaving.
window.TABLE = {
  signals: ['near', 'present', 'still'],

  states: [
    { name: 'close',   when: s => s.near > 0.85,                      hold: 0.5 },
    { name: 'waiting', when: s => s.present > 0.5 && s.still > 0.6,   hold: 1.5 },
    { name: 'here',    when: s => s.present > 0.5,                    hold: 1 },
    { name: 'nobody',  when: s => s.present < 0.2,                    hold: 2 },
  ],
};
