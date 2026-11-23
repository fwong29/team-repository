// bench/table-bench.js: the State Table, for the laptop view.
//
// The piece itself does not read this file. The same names, holds and lines
// live in bench/bench.ino and run on the Nano with nothing attached to it.
// This copy lets bench.html name you the same way the board does.
// Keep the thresholds here in sync with bench/bench.ino.
//
// Signals, each 0 to 1, written by bench/sense-serial.js:
//   near, present   Ford's HC-SR04 ultrasonic, from "cm"
//   moving, still   Ethan's PIR motion sensor, from "motion"
//
// Rows are checked top to bottom and the first true row wins. hold is in
// seconds: how long that row has to stay true before the name changes.
// The NO NAME row is immediate because it is the explicit interval between
// the two PIR thresholds.
//
// The four names, who owns each, and why its hold is what it is:
//
//   hoverer   Ford.  A hand right at the sensor, closer than 20 cm. At that
//             range it is a hand put there on purpose, not someone standing.
//             0.6 s, the shortest hold: this is the row a visitor is standing
//             in front of on purpose, and it should answer almost at once.
//   passerby  Ethan. Someone in range that the PIR can see moving. 1.0 s, so
//             that walking past the doorway is not enough to get named.
//   waiting   ours.  Someone in range who has gone still. 1.5 s. The PIR holds
//             its output high for a few seconds after movement stops, so this
//             row cannot arrive sooner anyway; the hold keeps it from flicking
//             on in the gap between two steps.
//   nobody    ours.  Nothing in range. 2.0 s, the longest hold, because one
//             missed echo should never read as everybody leaving.
//
// The gap between 0.35 and 0.60 on `moving` is deliberate: in there no row is
// true and the piece keeps the name it already has, which is what stops a
// visitor on the edge of a line from being renamed twice a second. The Nano
// does the same thing with 8 cm either side of 40 and 20 cm either side of 150.

window.TABLE = {
  signals: ['near', 'present', 'moving', 'still'],

  states: [
    { name: 'hoverer',  when: s => s.near > 0.875,                       hold: 0.6 },
    { name: 'passerby', when: s => s.present > 0.5 && s.moving > 0.6,    hold: 1.0 },
    { name: 'waiting',  when: s => s.present > 0.5 && s.moving < 0.35,   hold: 1.5 },
    { name: 'nobody',   when: s => s.present < 0.2,                      hold: 2.0 },
  ],
};