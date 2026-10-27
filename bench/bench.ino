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
// The OLED (SSD1306, I2C, U8g2 library) shows the distance in cm:
//   VCC -> 5V  GND -> GND  SDA -> A4  SCL -> A5

#include <U8g2lib.h>
#include <Wire.h>

const int TRIG = 9;
const int ECHO = 10;
const int PIR = 2;             // Ethan's PIR motion sensor, OUT on D2

U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

void setup() {
  Serial.begin(115200);          // sense-serial.js opens the port at this speed
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(PIR, INPUT);
  u8g2.begin();
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

  Serial.print("cm ");
  Serial.print(cm, 1);
  Serial.print(" motion ");
  Serial.print(motion);
  Serial.println();

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_logisoso32_tn);
  u8g2.setCursor(0, 40);
  u8g2.print((int)cm);
  u8g2.setFont(u8g2_font_ncenB14_tr);
  u8g2.setCursor(0, 62);
  u8g2.print("cm");
  u8g2.sendBuffer();

  delay(50);                     // about 20 readings a second
}