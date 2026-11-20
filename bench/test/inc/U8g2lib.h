#pragma once
// A stand-in for U8g2 that records what the sketch draws, so the OLED layout
// can be checked and looked at with no board attached. The metrics below are
// the real fonts' sizes, close enough to catch text running off the screen or
// two rows landing on top of each other. Glyph shapes are not reproduced: this
// says where things sit, not what they look like.
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#define U8G2_R0 0
#define U8X8_PIN_NONE 0

enum FontId { FONT_BIG = 0, FONT_BOLD, FONT_SMALL };
extern const unsigned char u8g2_font_logisoso24_tn, u8g2_font_ncenB10_tr, u8g2_font_6x10_tr;

struct Op {                       // one recorded drawing instruction
  std::string kind;               // text | box | frame | pixel
  int x = 0, y = 0, w = 0, h = 0;
  int font = FONT_SMALL;
  int color = 1;
  std::string text;
};

struct U8G2_SSD1306_128X64_NONAME_F_HW_I2C {
  U8G2_SSD1306_128X64_NONAME_F_HW_I2C(int, int) {}

  std::vector<Op> ops;            // the frame being built
  std::vector<Op> frame;          // the last frame sent to the screen
  int cx = 0, cy = 0, font = FONT_SMALL, color = 1;

  void begin() {}
  void clearBuffer() { ops.clear(); }
  void sendBuffer() { frame = ops; }
  void setDrawColor(int c) { color = c; }
  void setCursor(int x, int y) { cx = x; cy = y; }

  void setFont(const unsigned char& f) {
    if (&f == &u8g2_font_logisoso24_tn) font = FONT_BIG;
    else if (&f == &u8g2_font_ncenB10_tr) font = FONT_BOLD;
    else font = FONT_SMALL;
  }

  // The real fonts' advance widths, per character.
  static int advance(int font, char c) {
    if (font == FONT_SMALL) return 6;                 // 6x10 is fixed width
    if (font == FONT_BIG) return c == '-' ? 10 : 17;  // logisoso24, digits only
    if (c == ' ') return 4;                           // ncenB10, proportional
    if (c >= 'A' && c <= 'Z') return 9;
    if (c >= '0' && c <= '9') return 8;
    if (c == '?') return 7;
    return 7;
  }
  static int ascent(int font) {
    return font == FONT_BIG ? 24 : (font == FONT_BOLD ? 10 : 7);
  }
  static int width(int font, const char* s) {
    int w = 0;
    for (const char* p = s; *p; p++) w += advance(font, *p);
    return w;
  }

  void emit(const char* s) {
    if (!*s) return;
    Op o;
    o.kind = "text"; o.x = cx; o.y = cy; o.font = font; o.color = color;
    o.w = width(font, s); o.h = ascent(font); o.text = s;
    ops.push_back(o);
    cx += o.w;
  }
  void print(const char* s) { emit(s); }
  void print(int v) { char b[32]; snprintf(b, 32, "%d", v); emit(b); }

  void push(const char* kind, int x, int y, int w, int h) {
    Op o; o.kind = kind; o.x = x; o.y = y; o.w = w; o.h = h; o.color = color;
    ops.push_back(o);
  }
  void drawBox(int x, int y, int w, int h) { push("box", x, y, w, h); }
  void drawFrame(int x, int y, int w, int h) { push("frame", x, y, w, h); }
  void drawPixel(int x, int y) { push("pixel", x, y, 1, 1); }
};
