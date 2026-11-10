// bench.ino: the Arduino half of a bench pair's sensor.
//
// It reads the sensor and prints one line per reading over USB, as name and
// number pairs separated by spaces:
//
//   cm 42.5 motion 1
//
// The meaning (the signals, the State Table, the piece) is built in the
// browser by bench/sense-serial.js, the same as the camera pairs.
//
// Two sensors on one Nano, one per partner:
//   Ford  - HC-SR04 ultrasonic:  VCC -> 5V  GND -> GND  TRIG -> D9  ECHO -> D10
//   Ethan - PIR motion (HC-SR501): VCC -> 5V  GND -> GND  OUT -> D2
//
// The OLED (SSD1306, I2C, U8g2 library) shows the distance, the speed of
// approach, and a bar while the PIR sees motion:
//   VCC -> 5V  GND -> GND  SDA -> A4  SCL -> A5

#include <U8g2lib.h>
#include <Wire.h>

const int TRIG = 9;
const int ECHO = 10;
const int PIR = 2;             // Ethan's PIR motion sensor, OUT on D2

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

float lastCm = 400.0;
unsigned long lastMs = 0;
float speedCms = 0;            // cm per second, positive = coming closer

void setup() {
  Serial.begin(115200);          // sense-serial.js opens the port at this speed
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(PIR, INPUT);
  u8g2.begin();
  lastMs = millis();
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  // The echo time in microseconds; 0 means nothing came back within 30 ms.
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  float cm = us ? us / 58.0 : 400.0; // nothing in range reads as far away

  // The PIR holds its output HIGH for a few seconds after it sees movement.
  int motion = digitalRead(PIR);

  // Speed: how fast the distance is changing, smoothed. Ignore the jump to
  // or from "nothing in range" (400), which is not a real movement.
  unsigned long now = millis();
  float dt = (now - lastMs) / 1000.0;
  if (dt > 0 && cm < 400.0 && lastCm < 400.0) {
    float raw = (lastCm - cm) / dt;
    speedCms = 0.7 * speedCms + 0.3 * raw;
  } else {
    speedCms = 0.7 * speedCms;
  }
  lastCm = cm;
  lastMs = now;
  float shown = speedCms;
  if (shown > -3 && shown < 3) shown = 0;   // small jitter reads as steady

  Serial.print("cm ");
  Serial.print(cm, 1);
  Serial.print(" motion ");
  Serial.print(motion);
  Serial.println();

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_logisoso24_tn);
  u8g2.setCursor(0, 28);
  u8g2.print((int)cm);
  u8g2.setFont(u8g2_font_ncenB10_tr);
  u8g2.setCursor(70, 28);
  u8g2.print("cm");
  u8g2.setCursor(0, 46);
  if (shown > 0) {
    u8g2.print((int)shown);
    u8g2.print(" cm/s closer");
  } else if (shown < 0) {
    u8g2.print((int)(-shown));
    u8g2.print(" cm/s away");
  } else {
    u8g2.print("steady");
  }
  if (motion) {
    u8g2.drawBox(0, 52, 128, 12);
    u8g2.setDrawColor(0);
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.setCursor(40, 62);
    u8g2.print("MOTION");
    u8g2.setDrawColor(1);
  } else {
    u8g2.drawFrame(0, 52, 128, 12);
  }
  u8g2.sendBuffer();

  delay(50);                     // about 20 readings a second
}