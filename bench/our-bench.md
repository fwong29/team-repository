# Our bench prototype

Ford and Ethan. Two sensors on one Arduino Nano, read by `bench.html` in Chrome.

## Wiring

| Part | Pin | Nano pin | Whose |
|---|---|---|---|
| HC-SR04 / US-025A | VCC | 5V | Ford |
| HC-SR04 / US-025A | GND | GND | Ford |
| HC-SR04 / US-025A | TRIG | D9 | Ford |
| HC-SR04 / US-025A | ECHO | D10 | Ford |
| PIR motion (HC-SR501) | VCC | 5V | Ethan |
| PIR motion (HC-SR501) | GND | GND | Ethan |
| PIR motion (HC-SR501) | OUT | D2 | Ethan |

Aim the ultrasonic off the edge of the desk or slightly up. Flat on the desk it
hears the desk and reads a few centimetres with nobody there.

## Running it

1. Arduino IDE, flash `bench/bench.ino`. Board: Arduino Nano. If the upload
   says `not in sync` or `programmer is not responding`, switch
   **Tools → Processor → ATmega328P (Old Bootloader)**, unplug and replug the
   Nano, and upload again.
2. Open **Serial Monitor at 115200**. Lines should look like `cm 42.5 motion 1`.
   Wave a hand: `cm` drops and `motion` goes to 1.
3. **Close the Serial Monitor.** Only one program can hold the port.
4. Serve the repo: `python3 -m http.server` in the repo folder, then open
   `http://localhost:8000/bench.html` in **Chrome**. Opening the file directly
   will not work; Web Serial needs localhost.
5. Click **Connect the Arduino**, pick the board, press **D**. The readout shows
   the raw line, the state, and all three signals moving.

## Our State Table

In `bench/table-bench.js`. Signals: `near` and `present` from Ford's ultrasonic,
`still` from Ethan's PIR.

| State | Rule | Hold | What it means |
|---|---|---|---|
| `close` | `near > 0.85` | 0.5 s | a hand right at the sensor |
| `waiting` | `present > 0.5 && still > 0.6` | 1.5 s | someone in range, holding still |
| `here` | `present > 0.5` | 1 s | someone in range, moving |
| `nobody` | `present < 0.2` | 2 s | empty room |

`waiting` is the row that needs both sensors, so it is the one that proves the
pair works together rather than side by side.

## Thresholds we changed

Keep this list as you tune. Each line: the number, what it was, what it is, why.

- `near > 0.85` — starter value, kept. 0.85 is roughly 40 cm or closer.
- `still > 0.6` — new. The PIR is only ever 0 or 1, and smoothing (0.25) walks
  it there over about half a second, so 0.6 means "has been quiet a moment".

## Checking the two sensors apart

If something reads wrong, read the raw line on the **D** readout before changing
a threshold. `cm` wrong is Ford's wiring (D9/D10, or the sensor hearing the
desk). `motion` stuck at 1 is Ethan's PIR still holding from the last movement,
or its sensitivity and delay trimmers turned up; wait a few seconds with nothing
in front of it and watch it fall to 0.
