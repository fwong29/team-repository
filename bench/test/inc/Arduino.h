#pragma once
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <algorithm>
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
extern unsigned long g_now;      // fake clock, ms
extern float g_cm;               // what the ultrasonic "sees"
extern int   g_motion;           // what the PIR "sees"
extern int   g_led;
inline unsigned long millis() { return g_now; }
inline void pinMode(int, int) {}
inline void digitalWrite(int pin, int v) { if (pin == 13) g_led = v; }
inline int  digitalRead(int) { return g_motion; }
inline void delayMicroseconds(unsigned long) {}
inline void delay(unsigned long) {}
inline void tone(int, int, int) {}
inline unsigned long pulseIn(int, int, unsigned long) {
  if (g_cm >= 400.0f) return 0;            // no echo came back
  return (unsigned long)(g_cm * 58.0f);
}
using std::min; using std::max;
struct FakeSerial {
  char line[256]; int n = 0;
  void begin(long) {}
  void add(const char* s) { int l = strlen(s); if (n + l < 255) { memcpy(line + n, s, l); n += l; line[n] = 0; } }
  void print(const char* s) { add(s); }
  void print(int v) { char b[32]; snprintf(b, 32, "%d", v); add(b); }
  void print(unsigned long v) { char b[32]; snprintf(b, 32, "%lu", v); add(b); }
  void print(float v, int d = 2) { char b[32]; snprintf(b, 32, "%.*f", d, v); add(b); }
  void println() { n = 0; line[0] = 0; }
  void println(const char* s) { add(s); n = 0; }
};
extern FakeSerial Serial;
