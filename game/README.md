# Motion Sports

Five sports played with your body. A webcam reads how you move; an HC-SR04
ultrasonic sensor reads how far away you are. No keyboard, no mouse, no
controller — menus included.

Everything here is original: the art is drawn in code and the sounds are
synthesised at runtime. No image or audio files ship with the project, and it
is complete without any — `game/assets/` is an optional place to drop your own
art, and empty is a normal state for it. See [Optional sprites](#optional-sprites).

**Play:** open `game.html` — on GitHub Pages, `https://<user>.github.io/<repo>/game.html`

---

## Running it

The page needs `https` or `localhost`. Web Serial refuses to talk to the
Arduino otherwise, and so does the camera.

**Hosted** — push to the repo and open the Pages URL. Nothing to install.

**Locally**, from the repo root:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/game.html` **in Chrome or Edge**. Safari and
Firefox have no Web Serial, so the sensor will not connect there; the game
still plays, using the camera alone.

Click **Start the camera** once. That click is the browser's rule — a page
cannot open a camera or make a sound until someone has clicked it. After that
the mouse and keyboard do nothing.

## The hardware

The sensor is optional. Without it the game falls back to estimating your
distance from how wide your shoulders read, which is good enough to play. With
it, punches and steps get real depth.

### Wiring, Arduino Uno or Nano

```
  Nano                HC-SR04
  +-----------+       +-----------+
  |        5V |-------| VCC       |
  |       GND |-------| GND       |
  |        D9 |-------| TRIG      |
  |       D10 |<------| ECHO      |
  +-----------+       +-----------+
```

| HC-SR04 | Arduino |
| --- | --- |
| VCC | 5V |
| GND | GND |
| TRIG | D9 |
| ECHO | D10 |

**3.3V boards only** (Nano 33 IoT, ESP32, anything not 5V tolerant): the
HC-SR04 drives ECHO at 5V, which damages a 3.3V input over time. Put a divider
between ECHO and the board:

```
  ECHO ----[ 1k ]----+----[ 2k ]---- GND
                     |
                     +--> D10   (about 3.3V)
```

TRIG is an output from the board and needs nothing.

### Flashing

1. Open `firmware/hcsr04.ino` in the Arduino IDE.
2. Select your board and port, and upload.
3. Open the Serial Monitor at **115200** and check you see `cm 42.5` lines.
4. **Close the Serial Monitor.** Only one program can hold the port, and the
   browser needs it next.

### Mounting

At chest height, facing the player, **not lying flat on a desk** — flat on a
desk it measures the desk. The cone is about 30° wide. Soft clothing swallows
the echo, so a thick hoodie reads worse than a t-shirt.

### Connecting it

In the game: **Settings → Connect sensor**, then pick the board from the
browser's port list. The tile shows the live reading once it is talking.

## Calibration

First run asks you to stand where you will play with your arms straight out to
the sides, and hold for two seconds. It measures:

- **shoulder width** — the unit every gesture threshold is a ratio of, which
  is why a tall player near the camera and a short one across the room get the
  same game
- **arm length** — what "fully extended" means for you
- **neutral distance** — where you are standing, in centimetres, if the sensor
  is connected

It is saved in the browser. Recalibrate any time from **Settings →
Recalibrate** — worth doing if you move the camera or change where you stand.

## The gestures

| Gesture | What it is | Where it is used |
| --- | --- | --- |
| Cursor | Raise either hand | Every menu |
| Select | Hold on a tile, or push your hand toward the screen | Every menu |
| Back | Wave a raised hand side to side | Menus, results |
| Pause | Both arms straight overhead for about a second | During play |
| Swing | Throw a hand across your body | Tennis, golf, baseball |
| Punch | Extend an arm fast toward the screen | Boxing |
| Shoot | Both hands from chest height, push up and out | Basketball |
| Step | Move toward or away from the screen | Tennis court position |

## The sports

**Tennis** — swing as the ball reaches the band in front of you. Swing
direction decides where it goes. Step forward to move up the court. First to 5.

**Boxing** — punch with either arm. Hands up by your face to block, lean hard
to dodge. Punching drains stamina; it refills while you guard.

**Golf** — three holes. Lean to aim, then swing downward. A bigger backswing
is more power, and the angle through the ball bends the shot. Wind pushes
everything.

**Baseball** — swing flat and level as the pitch reaches the plate. Too early
or late and you foul it off. Three outs ends your half.

**Basketball** — a 60-second shootout. Push harder for longer shots; the hoop
moves further out every time you make one.

Each sport shows a short tutorial the first time you pick it.

## Two players

**Settings → Solo / Two players.** Tennis and boxing put both players in frame
at once, split by where they stand. Golf, baseball and basketball alternate
turns, which is how those work anyway.

## Tuning

Everything adjustable lives in `game/config.js`. The ones worth touching:

| Setting | Effect |
| --- | --- |
| `gestures.swingSpeed` | Lower if swings are being missed |
| `gestures.punchExtension` | Lower to make punches land more easily |
| `cursor.dwellMs` | How long to hold on a menu tile |
| `smoothing.minCutoff` | Higher is snappier, lower is calmer |
| `depthSmoothing` | Punch responsiveness — deliberately noisier than the rest |
| `minVisibility` | How confident a landmark must be before it counts |

## Optional sprites

The game draws every pixel itself and needs no image files. If you would rather
use image art for some of it, `game/sprites.js` is a thin layer for exactly
that: it loads PNGs out of `game/assets/` under fixed names, and every call site
falls through to the drawn version when a file is not there.

```js
if (!drawSprite(ctx, 'court/tennis', 0, 0, w, h, { fit: 'cover' })) {
  ...the drawn court, exactly as before...
}
```

Two swap points exist today: the six menu tile icons (`icon/<sport id>`) and the
Tennis backdrop (`court/tennis`). `game/assets/README.md` lists the filenames
and the shapes they should be. Adding another is a name in `MANIFEST` and one
`drawSprite` call.

Three rules keep this from becoming a second way to build the game:

- **Nothing waits on a sprite.** Loading is fire-and-forget at boot, and a file
  that decodes late just appears on the next frame.
- **No game logic goes behind a sprite.** A sport must play identically whether
  the folder is full or empty — only the picture changes.
- **The player figure stays drawn.** It is posed live from the pose landmarks
  every frame, and no image can bend to a pose.

Open the game with `?debug` to see a `sprites  n/7 loaded` line, which is the
quickest way to find a filename typo.

## Playing without hardware

`game/tests/visual.html` runs any sport with a scripted body and a scripted
distance — no camera, no Arduino. Buttons fire the same events the real input
layer emits, so the game logic and the drawing can be worked on anywhere.

## Tests

```
node game/tests/gestures.test.mjs
node game/tests/sprites.test.mjs
```

The gesture tests feed synthetic landmark sequences through the real detectors:
a swing is a swing, a punch is a punch, a still player fires nothing, a body
that leaves frame freezes instead of reporting zeros.

The sprite tests check the quiet half of `sprites.js` — that with no files
present every call reports "I drew nothing" rather than painting an empty
rectangle over the art behind it, and that `cover` and `contain` put an image
in the box the way each promises.

## Architecture

```
game.html              the page
game/
  config.js            every tunable number
  filters.js           One Euro and median filters
  tracker.js           MediaPipe Pose Landmarker
  serial.js            HC-SR04 over Web Serial
  input.js             calibration, sensor fusion, gesture detection
  audio.js             procedural sound
  ui.js                cursor, menus, HUD, avatar, debug overlay
  sprites.js           optional image art, with the drawn art as the fallback
  assets/              where those images go; empty in the repository
  main.js              scenes and the frame loop
  sports/*.js          the five games
  tests/               gesture tests and the mock harness
firmware/hcsr04.ino    the Arduino sketch
```

The sports read two things and nothing else:

```js
state   // continuous: hand positions, speeds, distance
events  // discrete: { type: 'swing', side, power, dirX, plane, ... }
```

No sport imports MediaPipe or Web Serial. Swap the sensors and the games do
not change.

**Fusion.** The two sensors cover each other's blind spots. The camera has
excellent sideways geometry and poor depth; the ultrasonic has one number of
real depth and no idea what shape made it. A punch barely moves on screen, so
extension is computed in 3D and the distance closing confirms it. When the
sensor is absent, shoulder width stands in for distance.

## Troubleshooting

**"The tracking library did not load"** — `cdn.jsdelivr.net` is blocked or you
are offline. The model is fetched at runtime; there is no offline mode.

**The camera never starts** — check the site's camera permission. On macOS also
check System Settings → Privacy & Security → Camera for your browser.

**The sensor will not connect** — the Arduino IDE's Serial Monitor is probably
still holding the port. Close it. Also check you are on `localhost` or `https`,
and in Chrome or Edge.

**Readings jump around** — the sensor is probably pointed at a wall or lying
flat. Mount it at chest height facing you. Soft clothing also absorbs the echo.

**Swings are not registering** — stand further back so your whole upper body is
in frame, and check the lighting. Turn on **Settings → Debug** to see the
skeleton and whether the landmarks are being found. Lower
`gestures.swingSpeed` in `config.js` if it still feels stiff.

**Everything is laggy** — close other tabs. Pose tracking runs on the CPU if
the GPU path is refused. The debug overlay costs a few frames; turn it off.

**Menus pick things you did not mean** — raise `cursor.dwellMs`, or stand so
your hands are not resting in front of your chest.

## What stays in the browser

Each camera frame is read and dropped. Nothing saves a frame or a landmark
list, and nothing is uploaded. The only things written to disk are your
calibration and your high scores, in this browser's local storage. The model
downloads once per session; after that the Network panel stays quiet.
