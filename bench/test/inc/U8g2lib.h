#pragma once
#define U8G2_R0 0
#define U8X8_PIN_NONE 0
extern const unsigned char u8g2_font_logisoso24_tn, u8g2_font_ncenB10_tr, u8g2_font_6x10_tr;
struct U8G2_SSD1306_128X64_NONAME_F_HW_I2C {
  U8G2_SSD1306_128X64_NONAME_F_HW_I2C(int, int) {}
  char screen[512]; int at = 0;
  void begin() {}
  void clearBuffer() { at = 0; screen[0] = 0; }
  void sendBuffer() {}
  void setFont(const unsigned char&) {}
  void setCursor(int, int) {}
  void setDrawColor(int) {}
  void drawBox(int, int, int, int) {}
  void drawFrame(int, int, int, int) {}
  void drawPixel(int, int) {}
  void add(const char* s) { int l = strlen(s); if (at + l < 511) { memcpy(screen + at, s, l); at += l; screen[at] = 0; } }
  void print(const char* s) { add(s); }
  void print(int v) { char b[32]; snprintf(b, 32, "%d", v); add(b); }
};
