// screen-check: puts the sketch into each state it can be in, then looks at
// where every row of the screen actually lands.
//
// Two things it can prove with no board attached:
//   nothing is drawn off the edge of the 128 x 64 panel
//   no two rows of text sit on top of each other
// It writes screen-ops.txt as well, which preview.py draws as a picture.
#include "Arduino.h"
#include <cstdlib>
unsigned long g_now = 0;
float g_cm = 400.0f;
int   g_motion = 0;
int   g_led = 0;
FakeSerial Serial;
const unsigned char u8g2_font_logisoso24_tn = 0, u8g2_font_ncenB10_tr = 0, u8g2_font_6x10_tr = 0;
#include "../bench.ino"

static void run(int ms) { for (int t = 0; t < ms; t += 50) { loop(); g_now += 50; } }

static int failures = 0;
static FILE* dump = nullptr;

// Does a text run overlap another text run? Boxes and frames are meant to sit
// under text (the hoverer's bar, the pending bar), so only text-on-text counts.
// Only g j p q y hang below the baseline, so only they need the extra rows.
static int descent(const Op& o) {
  if (o.kind != "text") return 0;
  return o.text.find_first_of("gjpqy") == std::string::npos ? 0 : 2;
}

static bool overlaps(const Op& a, const Op& b) {
  int ax0 = a.x, ax1 = a.x + a.w, ay1 = a.y + descent(a), ay0 = a.y - a.h;
  int bx0 = b.x, bx1 = b.x + b.w, by1 = b.y + descent(b), by0 = b.y - b.h;
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
}

static void check(const char* label) {
  const auto& f = u8g2.frame;
  int bad = 0;

  for (const auto& o : f) {
    int x1 = o.x + (o.kind == "text" ? o.w : o.w);
    int yTop = o.kind == "text" ? o.y - o.h : o.y;
    int yBot = o.kind == "text" ? o.y + descent(o) : o.y + o.h;
    if (o.x < 0 || x1 > 128 || yTop < 0 || yBot > 64) {
      printf("FAIL  %-14s off the panel: %s \"%s\" x %d..%d  y %d..%d\n",
             label, o.kind.c_str(), o.text.c_str(), o.x, x1, yTop, yBot);
      bad++;
    }
  }
  for (size_t i = 0; i < f.size(); i++) {
    if (f[i].kind != "text") continue;
    for (size_t j = i + 1; j < f.size(); j++) {
      if (f[j].kind != "text") continue;
      if (f[i].y == f[j].y && f[j].x >= f[i].x) continue;   // same row, side by side
      if (overlaps(f[i], f[j])) {
        printf("FAIL  %-14s \"%s\" (y %d) collides with \"%s\" (y %d)\n",
               label, f[i].text.c_str(), f[i].y, f[j].text.c_str(), f[j].y);
        bad++;
      }
    }
  }
  if (!bad) printf("PASS  %-14s %2zu things drawn, all on the panel, no two rows touching\n",
                   label, f.size());
  failures += bad;

  fprintf(dump, "STATE %s\n", label);
  for (const auto& o : f)
    fprintf(dump, "%s %d %d %d %d %d %d %s\n", o.kind.c_str(), o.x, o.y, o.w, o.h,
            o.font, o.color, o.text.c_str());
}

int main() {
  dump = fopen("screen-ops.txt", "w");
  setup();

  printf("\n-- every screen the piece can show, measured --\n");
  g_cm = 60; g_motion = 1; run(20000);  check("warming up");
  run(45000);                            // out of the warm-up minute

  g_cm = 400; g_motion = 0; run(6000);  check("nobody");
  g_cm = 100; g_motion = 1; run(4000);  check("passerby");
  g_motion = 0; run(5000);              check("waiting");
  g_cm = 25; run(3000);                 check("hoverer");

  // The widest case: three digits, a two-digit speed, and the longest name.
  g_cm = 400; g_motion = 0; run(5000);
  g_cm = 148; g_motion = 1; run(4000);
  for (int i = 0; i < 30; i++) { g_cm = 148.0f - i * 2.0f; loop(); g_now += 50; }
  check("widest case");

  // A name part way through its hold, which swaps the strip for the bar.
  g_cm = 400; g_motion = 0; run(6000);
  g_cm = 100; g_motion = 1;
  for (int i = 0; i < 8; i++) { loop(); g_now += 50; }
  check("mid-hold");

  fclose(dump);
  printf("\n%s\n", failures ? "SOME ROWS DO NOT FIT" : "every screen fits on the panel");
  return failures ? 1 : 0;
}
