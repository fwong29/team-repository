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
//   hoverer   closer than 20 cm (near > 0.875)
//   passerby  in range, with motion above 0.30
//   waiting   in range, with motion below 0.175
//   no name   in range, with motion from 0.175 through 0.30
//   nobody    outside the 75 cm range

window.TABLE = {
  signals: ['near', 'present', 'moving', 'still'],

  states: [
    {
      name: 'hoverer',
      when: s => s.near > 0.875,
      hold: 0.6
    },
    {
      name: 'passerby',
      when: s => s.present > 0.5 && s.moving > 0.30,
      hold: 1.0
    },
    {
      name: 'waiting',
      when: s => s.present > 0.5 && s.moving < 0.175,
      hold: 1.5
    },
    {
      name: 'no name',
      when: s =>
        s.present > 0.5 &&
        s.moving >= 0.175 &&
        s.moving <= 0.30,
      hold: 0
    },
    {
      name: 'nobody',
      when: s => s.present < 0.2,
      hold: 2.0
    },
  ],
};