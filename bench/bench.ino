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
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.setCursor(0, 34);
    u8g2.print("the motion sensor needs");
    u8g2.setCursor(0, 46);
    u8g2.print("a minute. ");
    u8g2.print(left);
    u8g2.print("s to go.");
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

  // The number it named you on. Kept in cm, on the screen and over USB.
  u8g2.setFont(u8g2_font_logisoso24_tn);
  u8g2.setCursor(0, 46);
  if (current == NOBODY) {
    u8g2.print("---");
  } else {
    u8g2.print((int)cmSmooth);
  }
  u8g2.setFont(u8g2_font_ncenB10_tr);
  u8g2.setCursor(74, 46);
  u8g2.print(current == NOBODY ? "" : "cm");

  // A name that is waiting out its hold says so, in place of its own strip.
  float pending = pendingProgress(now);
  if (pending > 0.0) {
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.setCursor(0, 62);
    u8g2.print(NAME_WORD[candidate]);
    u8g2.print("?");
    u8g2.drawFrame(66, 53, 62, 11);
    u8g2.drawBox(67, 54, (int)(60.0 * pending), 9);
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
      u8g2.drawBox(0, 52, 128, 12);
      break;

    case PASSERBY:                             // a trace movement leaves behind
      u8g2.drawFrame(0, 52, 128, 12);
      x = (int)((now % 1200) * 124 / 1200);
      u8g2.drawBox(x > 122 ? 122 : x, 54, 6, 8);
      break;

    case WAITING:                              // still ticks, and the seconds
      for (x = 2; x < 126; x += 6) u8g2.drawPixel(x, 58);
      u8g2.setFont(u8g2_font_6x10_tr);
      u8g2.setCursor(0, 62);
      u8g2.print((int)((now - sinceMs) / 1000));
      u8g2.print("s still");
      break;

    case NOBODY:                               // one dot, drifting: awake
    default:
      x = (int)((now % 6000) * 124 / 6000);
      u8g2.drawPixel(x, 58);
      u8g2.drawPixel(x + 1, 58);
      u8g2.setFont(u8g2_font_6x10_tr);
      u8g2.setCursor(84, 62);
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

  updateLed(now);
  drawScreen(now);

  // One line per reading, as a word and a number, for bench.html and the bench.
  Serial.print("cm ");
  Serial.print(rawCm, 1);
  Serial.print(" motion ");
  Serial.print(rawMotion);
  Serial.print(" held ");
  Serial.print((now - sinceMs) / 1000.0, 1);
  Serial.print(" name ");
  Serial.println(warming ? "warming" : NAME_WORD[current]);

  delay(50);                                   // about 20 readings a second
}
