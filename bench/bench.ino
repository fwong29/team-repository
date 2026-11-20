// bench.ino: the piece. It sees you, it names you, it acts.
//
// Everything that matters runs on the Nano. No laptop, no Serial Monitor, no
// browser: plug it into a 5V wall charger or a power bank and it names the
// person in front of it on the OLED. The laptop and bench.html are an extra
// on top, not a part of the piece.
//
// Two sensors on one Nano, one per partner:
//   Ford  - HC-SR04 / US-025A ultrasonic: VCC -> 5V  GND -> GND  TRIG -> D9  ECHO -> D10
//   Ethan - PIR motion (HC-SR501):        VCC -> 5V  GND -> GND  OUT  -> D2
//   OLED (SSD1306, I2C, U8g2):            VCC -> 5V  GND -> GND  SDA  -> A4  SCL -> A5
//   The Nano's own LED on D13 blinks a different pattern for each name.
//
// The four names, who owns each, and the hold each one waits out:
//
//   NAME       OWNER   RULE                                 HOLD
//   hoverer    Ford    closer than HOVER_LINE               0.6 s
//   passerby   Ethan   in range and the PIR sees motion     1.0 s
//   waiting    group   in range and the PIR sees no motion  1.5 s
//   nobody     group   nothing in range                     2.0 s
//
// Checked top to bottom, first true row wins, and the rule has to stay true
// for the whole hold before the name changes. Four seconds of motion is still
// a passerby if passerby's hold were five.
//
// It still prints one line per reading over USB, so bench.html and the
// December bench can read it:  cm 23.6 motion 1 held 2.3 name hoverer

#include <U8g2lib.h>
#include <Wire.h>

// ---- Pins -----------------------------------------------------------------

const int TRIG = 9;            // Ford's HC-SR04
const int ECHO = 10;
const int PIR  = 2;            // Ethan's PIR motion sensor
const int LED  = 13;           // the Nano's own LED: one pattern per name

// A buzzer is optional. We built without one; set this to 1 and put an active
// buzzer on D8 if you want a chirp per name as well as a light and a word.
#define USE_BUZZER 0
const int BUZZER = 8;

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

// ---- The lines, and the gap that keeps them steady ------------------------
//
// Each line is a distance in cm. The gap is how far past the line a reading
// has to come back before the piece lets go of it, so a hand sitting right on
// a line cannot flicker the name. Raise a gap if a name twitches at its edge.

const float HOVER_LINE = 40.0;   // closer than this is a hoverer
const float HOVER_GAP  =  8.0;   // and it stays a hoverer out to 48 cm

const float RANGE_LINE = 150.0;  // closer than this is in range
const float RANGE_GAP  =  20.0;  // and stays in range out to 170 cm

const float MOVE_LINE  = 0.60;   // the smoothed PIR reading that counts as motion
const float MOVE_GAP   = 0.25;   // and it stays motion down to 0.35

const float NO_ECHO_CM = 400.0;  // nothing came back inside 30 ms
const float PIR_WARMUP_MS = 60000.0;  // the PIR's first minute is nonsense

// ---- A gate: one line plus its gap ----------------------------------------

struct Gate {
  float line;
  float gap;
  bool  wantBelow;   // true: the gate is on while the reading is under the line
  bool  on;

  bool update(float v) {
    if (wantBelow) on = on ? (v < line + gap) : (v < line);
    else           on = on ? (v > line - gap) : (v > line);
    return on;
  }
};

Gate gHover = { HOVER_LINE, HOVER_GAP, true,  false };
Gate gRange = { RANGE_LINE, RANGE_GAP, true,  false };
Gate gMove  = { MOVE_LINE,  MOVE_GAP,  false, false };

// ---- The State Table ------------------------------------------------------

enum Name { HOVERER = 0, PASSERBY, WAITING, NOBODY, NAME_COUNT };

const char* NAME_WORD[NAME_COUNT] = { "HOVERER", "PASSERBY", "WAITING", "NOBODY" };
const float NAME_HOLD[NAME_COUNT] = {  0.6,       1.0,        1.5,       2.0    };

// Declared here so the file compiles the same way in the Arduino IDE, in
// arduino-cli, and in the plain-C++ harness the table is tested with.
void chirp(Name n);
void updateSpeed(unsigned long now);
void updateShownCm(unsigned long now);
void drawStrip(unsigned long now);
void drawScreen(unsigned long now);
void updateLed(unsigned long now);
void updateName(unsigned long now);
float pendingProgress(unsigned long now);

// Which row is true right now, checked top to bottom. Nothing below reads the
// sensors directly: this is the only place the rules live.
Name ruleWinner() {
  if (gHover.on)                return HOVERER;
  if (gRange.on && gMove.on)    return PASSERBY;
  if (gRange.on && !gMove.on)   return WAITING;
  return NOBODY;
}

Name current = NOBODY;         // what it calls you now
unsigned long sinceMs = 0;     // when it started calling you that
Name candidate = NOBODY;       // the row that wants to take over
unsigned long candidateMs = 0; // when that row first became true
bool warming = true;

// ---- Readings -------------------------------------------------------------

float cmSmooth = NO_ECHO_CM;   // the distance the piece acts on
float motion = 0.0;            // the PIR, smoothed to 0..1
float rawCm = NO_ECHO_CM;      // the last single reading, for the USB line
int   rawMotion = 0;

const float CM_SMOOTHING = 0.35;
const float PIR_SMOOTHING = 0.25;

float window[3] = { NO_ECHO_CM, NO_ECHO_CM, NO_ECHO_CM };
int windowAt = 0;

// The middle of the last three readings. One bad echo cannot move it, which is
// what the HC-SR04 gives you every few seconds on soft clothing.
float medianOfThree() {
  float a = window[0], b = window[1], c = window[2];
  return max(min(a, b), min(max(a, b), c));
}

// ---- How fast you are coming, and numbers a person can actually read ------
//
// The sensor gives twenty numbers a second and no two of them are the same.
// A digit that changes twenty times a second is not a reading, it is a
// flicker, so nothing on the screen is allowed to move until the thing it
// measures has really moved.
//
// Three things do that work:
//   a baseline  speed is measured against where you were half a second ago,
//               not against the last reading, which is mostly noise
//   a step      the screen shows distance to the nearest 2 cm and speed to
//               the nearest 5 cm/s, so small wobble changes nothing
//   a rest      no number on the screen may change more than three times a
//               second, however fast the sensor talks
//
// The speed word has a gap in it too, the same trick the names use: it takes
// 10 cm/s to start reading as movement and it keeps reading as movement until
// you drop under 6, so walking at the edge of the two does not strobe.

const unsigned long SHOW_EVERY_MS = 300;   // no number changes faster than this
const float CM_STEP       = 2.0;           // ... or for less than 2 cm
const unsigned long CM_SUSTAIN_MS = 250;   // ... and not until it stays moved
const int   SPEED_SAMPLES = 10;            // half a second of history
const float SPEED_SMOOTHING = 0.20;
const float SPEED_MOVING  = 10.0;          // cm/s that starts reading as movement
const float SPEED_STEADY  = 6.0;           // ... and the speed it reads steady again
const float SPEED_STEP    = 5.0;           // shown in steps of 5 cm/s

float history[SPEED_SAMPLES];
int   historyAt = 0;
bool  historyFull = false;
float speedCms = 0;                        // positive means coming closer

enum Drift { STEADY = 0, CLOSER, AWAY };
Drift drift = STEADY;

int   shownCm = 0;                         // what the screen is showing now
unsigned long shownCmAt = 0;
bool  cmOff = false;                       // the reading has left the shown band
unsigned long cmOffAt = 0;
int   shownSpeed = 0;
Drift shownDrift = STEADY;
unsigned long shownSpeedAt = 0;

void updateSpeed(unsigned long now) {
  float then = history[historyAt];         // where you were SPEED_SAMPLES ago
  history[historyAt] = cmSmooth;
  historyAt = (historyAt + 1) % SPEED_SAMPLES;
  if (historyAt == 0) historyFull = true;

  float raw = 0;
  // A jump to or from "nothing in range" is not a movement, it is the sensor
  // losing you, so it does not count as speed.
  if (historyFull && then < NO_ECHO_CM && cmSmooth < NO_ECHO_CM) {
    raw = (then - cmSmooth) / (SPEED_SAMPLES * 0.05);
  }
  speedCms += (raw - speedCms) * SPEED_SMOOTHING;

  float mag = fabs(speedCms);
  if (drift == STEADY) {
    if (mag > SPEED_MOVING) drift = speedCms > 0 ? CLOSER : AWAY;
  } else if (mag < SPEED_STEADY) {
    drift = STEADY;
  } else {
    drift = speedCms > 0 ? CLOSER : AWAY;
  }

  int want = drift == STEADY ? 0 : (int)(mag / SPEED_STEP + 0.5) * (int)SPEED_STEP;
  if (now - shownSpeedAt >= SHOW_EVERY_MS &&
      (want != shownSpeed || drift != shownDrift)) {
    shownSpeed = want;
    shownDrift = drift;
    shownSpeedAt = now;
  }
}

// The number gets a hold of its own, for the same reason the names do: noise
// crosses a line and comes straight back, a person walking does not. The
// reading has to sit more than CM_STEP away from what is on the screen for a
// quarter of a second together before the digits are allowed to move.
void updateShownCm(unsigned long now) {
  if (fabs(cmSmooth - shownCm) < CM_STEP) {
    cmOff = false;
    return;
  }
  if (!cmOff) {
    cmOff = true;
    cmOffAt = now;
    return;
  }
  if (now - cmOffAt < CM_SUSTAIN_MS) return;
  if (now - shownCmAt < SHOW_EVERY_MS) return;
  shownCm = (int)(cmSmooth + 0.5);
  shownCmAt = now;
  cmOff = false;
}

float readCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  return us ? us / 58.0 : NO_ECHO_CM;
}

void setup() {
  Serial.begin(115200);        // never waits for a monitor: the piece runs on its own
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(PIR, INPUT);
  pinMode(LED, OUTPUT);
#if USE_BUZZER
  pinMode(BUZZER, OUTPUT);
#endif
  u8g2.begin();
  sinceMs = millis();
  candidateMs = millis();
}

// ---- Naming ---------------------------------------------------------------

void updateName(unsigned long now) {
  Name wants = ruleWinner();

  if (wants == current) {       // nothing is trying to take over
    candidate = current;
    candidateMs = now;
    return;
  }

  if (wants != candidate) {     // a different row started asking
    candidate = wants;
    candidateMs = now;
    return;
  }

  // The same row has been true the whole time. Has it waited out its hold?
  if (now - candidateMs >= (unsigned long)(NAME_HOLD[wants] * 1000.0)) {
    current = wants;
    sinceMs = now;
    candidateMs = now;
    chirp(wants);
  }
}

// How far through its hold the row that wants to take over has come, 0 to 1.
// Drawn as a bar, so the wait is something a visitor can see instead of lag.
float pendingProgress(unsigned long now) {
  if (candidate == current) return 0.0;
  float hold = NAME_HOLD[candidate] * 1000.0;
  if (hold <= 0) return 1.0;
  float t = (now - candidateMs) / hold;
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}

// ---- Acting: the light ----------------------------------------------------
//
// One pattern per name, so the name is readable from across the room with the
// screen facing away.
//   hoverer   on, and it stays on
//   passerby  fast flicker
//   waiting   two short blinks, then a rest
//   nobody    one short blink every three seconds: awake, nobody here

void updateLed(unsigned long now) {
  if (warming) {                              // slow pulse while the PIR settles
    digitalWrite(LED, (now % 1000) < 500);
    return;
  }
  unsigned long t;
  switch (current) {
    case HOVERER:
      digitalWrite(LED, HIGH);
      break;
    case PASSERBY:
      digitalWrite(LED, (now % 240) < 120);
      break;
    case WAITING:
      t = now % 2000;
      digitalWrite(LED, t < 120 || (t > 300 && t < 420));
      break;
    case NOBODY:
    default:
      digitalWrite(LED, (now % 3000) < 80);
      break;
  }
}

void chirp(Name n) {
#if USE_BUZZER
  const int pitch[NAME_COUNT] = { 1400, 900, 600, 300 };
  tone(BUZZER, pitch[n], 90);
#else
  (void)n;
#endif
}

// ---- Acting: the screen ---------------------------------------------------
//
// Every name gets the word, and under it a bottom strip that moves differently:
//   hoverer   the word knocked out of a solid bar; the screen is at its loudest
//   passerby  a dot running left to right, a trace that only motion leaves
//   waiting   a steady row of ticks and the seconds it has been waiting
//   nobody    one dot drifting slowly across an empty strip: waiting, not broken

void drawScreen(unsigned long now) {
  u8g2.clearBuffer();

  if (warming) {
    int left = (int)((PIR_WARMUP_MS - now) / 1000.0) + 1;
    u8g2.setFont(u8g2_font_ncenB10_tr);
    u8g2.setCursor(0, 14);
    u8g2.print("WARMING UP");
    // 21 characters is the most the 6x10 font fits across 128 px.
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.setCursor(0, 34);
    u8g2.print("the motion sensor");
    u8g2.setCursor(0, 46);
    u8g2.print("needs a minute. ");
    u8g2.print(left);
    u8g2.print("s");
    u8g2.drawFrame(0, 52, 128, 12);
    int w = (int)(126.0 * (now / PIR_WARMUP_MS));
    u8g2.drawBox(1, 53, w > 126 ? 126 : w, 10);
    u8g2.sendBuffer();
    return;
  }

  // The name, top of the screen. The hoverer's is inverted, because that is
  // the one row a visitor is standing right in front of.
  u8g2.setFont(u8g2_font_ncenB10_tr);
  if (current == HOVERER) {
    u8g2.drawBox(0, 0, 128, 16);
    u8g2.setDrawColor(0);
    u8g2.setCursor(3, 13);
    u8g2.print(NAME_WORD[current]);
    u8g2.setDrawColor(1);
  } else {
    u8g2.setCursor(0, 13);
    u8g2.print(NAME_WORD[current]);
  }

  // The number it named you on, to the nearest 2 cm and never changing more
  // than three times a second. Kept in cm, on the screen and over USB.
  u8g2.setFont(u8g2_font_logisoso24_tn);
  u8g2.setCursor(0, 42);
  if (current == NOBODY) {
    u8g2.print("---");
  } else {
    u8g2.print(shownCm);
  }
  // No setCursor: the cursor is already sitting after the last digit, so the
  // unit follows the number instead of floating at a fixed spot away from it.
  u8g2.setFont(u8g2_font_ncenB10_tr);
  u8g2.print(current == NOBODY ? "" : " cm");

  // How fast you are coming, in words first and a round number after. With
  // nobody in range there is no speed to report, so the line stays empty.
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.setCursor(0, 52);
  if (current != NOBODY) {
    if (shownDrift == STEADY) {
      u8g2.print("steady");
    } else {
      u8g2.print(shownDrift == CLOSER ? "closer " : "away ");
      u8g2.print(shownSpeed);
      u8g2.print(" cm/s");
    }
  }

  // A name that is waiting out its hold says so, in place of its own strip.
  float pending = pendingProgress(now);
  if (pending > 0.0) {
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.setCursor(0, 61);
    u8g2.print(NAME_WORD[candidate]);
    u8g2.print("?");
    u8g2.drawFrame(66, 54, 62, 10);
    u8g2.drawBox(67, 55, (int)(60.0 * pending), 8);
    u8g2.sendBuffer();
    return;
  }

  drawStrip(now);
  u8g2.sendBuffer();
}

void drawStrip(unsigned long now) {
  int x;
  switch (current) {
    case HOVERER:                              // loudest: a filled bar
      u8g2.drawBox(0, 54, 128, 10);
      break;

    case PASSERBY:                             // a trace movement leaves behind
      u8g2.drawFrame(0, 54, 128, 10);
      x = (int)((now % 1200) * 122 / 1200);
      u8g2.drawBox(x > 120 ? 120 : x, 56, 6, 6);
      break;

    case WAITING:                              // still ticks, and the seconds
      for (x = 66; x < 126; x += 6) u8g2.drawPixel(x, 58);
      u8g2.setFont(u8g2_font_6x10_tr);
      u8g2.setCursor(0, 61);
      u8g2.print((int)((now - sinceMs) / 1000));
      u8g2.print("s still");
      break;

    case NOBODY:                               // one dot, drifting: awake
    default:
      // The dot crosses the left of the strip only: the word sits at x 84 and
      // a dot drifting through it would read as a fault, not as breathing.
      x = (int)((now % 6000) * 72 / 6000);
      u8g2.drawPixel(x, 58);
      u8g2.drawPixel(x + 1, 58);
      u8g2.setFont(u8g2_font_6x10_tr);
      u8g2.setCursor(84, 61);
      u8g2.print("waiting");
      break;
  }
}

// ---- The loop -------------------------------------------------------------

void loop() {
  unsigned long now = millis();

  rawCm = readCm();
  window[windowAt] = rawCm;
  windowAt = (windowAt + 1) % 3;
  float cm = medianOfThree();
  cmSmooth += (cm - cmSmooth) * CM_SMOOTHING;

  rawMotion = digitalRead(PIR);
  motion += ((rawMotion ? 1.0 : 0.0) - motion) * PIR_SMOOTHING;

  gHover.update(cmSmooth);
  gRange.update(cmSmooth);
  gMove.update(motion);

  if (warming && now >= PIR_WARMUP_MS) {       // the PIR has had its minute
    warming = false;
    current = NOBODY;
    candidate = NOBODY;
    sinceMs = now;
    candidateMs = now;
  }
  if (!warming) updateName(now);

  updateSpeed(now);
  updateShownCm(now);
  updateLed(now);
  drawScreen(now);

  // One line per reading, as a word and a number, for bench.html and the bench.
  Serial.print("cm ");
  Serial.print(rawCm, 1);
  Serial.print(" motion ");
  Serial.print(rawMotion);
  Serial.print(" speed ");
  Serial.print(speedCms, 1);
  Serial.print(" held ");
  Serial.print((now - sinceMs) / 1000.0, 1);
  Serial.print(" name ");
  Serial.println(warming ? "warming" : NAME_WORD[current]);

  delay(50);                                   // about 20 readings a second
}
