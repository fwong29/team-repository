#include "Arduino.h"
#include <cstdlib>
unsigned long g_now = 0;
float g_cm = 400.0f;
int   g_motion = 0;
int   g_led = 0;
FakeSerial Serial;
const unsigned char u8g2_font_logisoso24_tn = 0, u8g2_font_ncenB10_tr = 0, u8g2_font_6x10_tr = 0;
#include "../bench.ino"

static const char* shown() { return warming ? "warming" : NAME_WORD[current]; }

static void step(int ms) {            // run the sketch for ms of fake time
  for (int t = 0; t < ms; t += 50) { loop(); g_now += 50; }
}
static const char* last = "";
static void watch(int ms, const char* note) {
  for (int t = 0; t < ms; t += 50) {
    loop(); g_now += 50;
    if (strcmp(shown(), last) != 0) {
      printf("  %7.2fs  %-9s  (cm=%.0f motion=%d)  %s\n",
             g_now / 1000.0, shown(), g_cm, g_motion, note);
      last = shown();
    }
  }
}
static void expect(const char* want, const char* what) {
  bool ok = strcmp(shown(), want) == 0;
  printf("%s  %-52s got %s, wanted %s\n", ok ? "PASS" : "FAIL", what, shown(), want);
}

int main() {
  setup();
  printf("\n-- 1. the PIR's warm-up minute: it names nobody at all --\n");
  g_cm = 60; g_motion = 1;                 // someone right there the whole time
  step(30000); expect("warming", "30 s in, a person in front of it");
  step(31000); expect("NOBODY",  "past 60 s, it starts from nobody");

  printf("\n-- 2. holds: a rule has to stay true for its whole hold --\n");
  g_cm = 400; g_motion = 0; step(5000);     // clear the room first
  expect("NOBODY", "the room is empty before this phase starts");
  g_cm = 100; g_motion = 1; last = shown();
  watch(900, "in range, moving, 0.9 s");
  expect("NOBODY", "0.9 s of motion is not yet a passerby (hold 1.0 s)");
  g_cm = 400; g_motion = 0;
  step(4000);
  expect("NOBODY", "they left before the hold ran out: never named");

  printf("\n-- 3. someone walks in and stays --\n");
  g_cm = 100; g_motion = 1; last = shown();
  watch(4000, "walking about at 1 m");
  expect("PASSERBY", "moving in range");
  g_motion = 0; last = shown();
  watch(4000, "they stop moving");
  expect("WAITING", "in range, the PIR has gone quiet");

  printf("\n-- 4. a hand at the sensor --\n");
  g_cm = 15; last = shown();
  watch(3000, "hand at 15 cm");
  expect("HOVERER", "closer than the 20 cm line");

  printf("\n-- 5. steadiness at the line: 19 and 21 cm, back and forth --\n");
  int flips = 0; const char* before = shown();
  for (int i = 0; i < 40; i++) {
    g_cm = (i % 2) ? 21 : 19;
    loop(); g_now += 50;
    if (strcmp(shown(), before) != 0) { flips++; before = shown(); }
  }
  printf("%s  %-52s %d name changes while jittering on the line\n",
         flips == 0 ? "PASS" : "FAIL", "the gap holds the name steady", flips);

  printf("\n-- 6. one bad echo must not rename anybody --\n");
  g_cm = 50; g_motion = 0; step(4000);
  const char* held = shown();
  g_cm = 400; loop(); g_now += 50;          // a single missed echo
  g_cm = 50;  loop(); g_now += 50;
  printf("%s  %-52s %s through the bad reading\n",
         strcmp(shown(), held) == 0 ? "PASS" : "FAIL", "median of three absorbs it", shown());

  printf("\n-- 7. the room empties --\n");
  g_cm = 400; g_motion = 0; last = shown();
  watch(6000, "nobody there");
  expect("NOBODY", "empty room, after the 2 s hold");

  printf("\n-- 8. the light says the name too --\n");
  int on = 0; for (int i = 0; i < 60; i++) { loop(); g_now += 50; on += g_led; }
  printf("     nobody:   LED on for %d of 60 samples\n", on);
  g_cm = 20; step(3000); on = 0;
  for (int i = 0; i < 60; i++) { loop(); g_now += 50; on += g_led; }
  printf("     hoverer:  LED on for %d of 60 samples\n", on);
  g_cm = 100; g_motion = 1; step(3000); on = 0;
  for (int i = 0; i < 60; i++) { loop(); g_now += 50; on += g_led; }
  printf("     passerby: LED on for %d of 60 samples\n", on);
  g_motion = 0; step(4000); on = 0;
  for (int i = 0; i < 60; i++) { loop(); g_now += 50; on += g_led; }
  printf("     waiting:  LED on for %d of 60 samples\n", on);

  printf("\n-- 9. a reading that holds still long enough to read --\n");
  // A hand held at 50 cm, with the wobble a real HC-SR04 gives you.
  srand(7);
  g_cm = 50; g_motion = 0; step(4000);
  int rawChanges = 0, shownChanges = 0, bandChanges = 0;
  int lastRaw = -1, lastShown = shownCm; Drift lastBand = shownDrift;
  for (int i = 0; i < 200; i++) {                 // 10 seconds of holding still
    g_cm = 50.0f + (rand() % 70 - 35) / 10.0f;    // +/- 3.5 cm of noise
    loop(); g_now += 50;
    if ((int)(g_cm + 0.5f) != lastRaw) { rawChanges++; lastRaw = (int)(g_cm + 0.5f); }
    if (shownCm != lastShown) { shownChanges++; lastShown = shownCm; }
    if (shownDrift != lastBand) { bandChanges++; lastBand = shownDrift; }
  }
  printf("     the raw number changed %d times in 10 s of holding still\n", rawChanges);
  printf("%s  %-52s %d times\n", shownChanges <= 6 ? "PASS" : "FAIL",
         "the number on the screen changed", shownChanges);
  printf("%s  %-52s %d times\n", bandChanges == 0 ? "PASS" : "FAIL",
         "the speed word changed", bandChanges);
  printf("%s  %-52s %s\n", shownDrift == STEADY ? "PASS" : "FAIL",
         "a hand held still reads steady", shownDrift == STEADY ? "steady" : "moving");

  printf("\n-- 10. and it still reports a real approach --\n");
  for (int i = 0; i < 40; i++) {                  // walking in: 120 cm to 40 cm
    g_cm = 120.0f - i * 2.0f;
    loop(); g_now += 50;
  }
  printf("%s  %-52s %s %d cm/s\n", shownDrift == CLOSER ? "PASS" : "FAIL",
         "walking in at 40 cm/s reads as closer",
         shownDrift == CLOSER ? "closer" : (shownDrift == AWAY ? "away" : "steady"),
         shownSpeed);
  printf("     shown in steps of 5, so it lands on a round number\n");
  for (int i = 0; i < 40; i++) {                  // and backing away again
    g_cm = 40.0f + i * 2.0f;
    loop(); g_now += 50;
  }
  printf("%s  %-52s %s %d cm/s\n", shownDrift == AWAY ? "PASS" : "FAIL",
         "backing away reads as away", 
         shownDrift == AWAY ? "away" : (shownDrift == CLOSER ? "closer" : "steady"),
         shownSpeed);

  printf("\n-- 11. the number still follows someone who really moves --\n");
  g_cm = 100; step(3000);
  int updates = 0, lastN = shownCm;
  for (int i = 0; i < 160; i++) {          // a slow walk in: 100 to 60 cm over 8 s
    g_cm = 100.0f - i * 0.25f;
    loop(); g_now += 50;
    if (shownCm != lastN) { updates++; lastN = shownCm; }
  }
  printf("%s  %-52s shows %d cm, moved %d times\n",
         (shownCm >= 56 && shownCm <= 64 && updates >= 5) ? "PASS" : "FAIL",
         "a slow 5 cm/s walk from 100 cm to 60 cm", shownCm, updates);

  g_cm = 400; step(4000); g_cm = 30; step(1500);
  printf("%s  %-52s shows %d cm within 1.5 s\n",
         (shownCm >= 26 && shownCm <= 34) ? "PASS" : "FAIL",
         "a hand put straight in front of it at 30 cm", shownCm);

  printf("\n-- 12. the USB line, for bench.html --\n");
  g_cm = 23.6f; step(3000);
  loop();
  printf("     %s\n", Serial.line[0] ? Serial.line : "(println cleared it; rebuilding)");
  return 0;
}
