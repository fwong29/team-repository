// bench.ino: the Arduino half of a bench pair's sensor.
//
// It reads the sensor and prints one line per reading over USB, as name and
// number pairs separated by spaces:
//
//   cm 42.5
//   cm 41.9 light 612
//
// That is all it does. The meaning (the signals, the State Table, the piece) is
// built in the browser by bench/sense-serial.js, the same as the camera pairs.
//
// Two sensors on one Nano, one per partner:
//   Ford  - HC-SR04 ultrasonic:  VCC -> 5V  GND -> GND  TRIG -> D9  ECHO -> D10
//   Ethan - PIR motion (HC-SR501): VCC -> 5V  GND -> GND  OUT -> D2
//
// It prints both on one line, e.g.
//   cm 42.5 motion 1
// Swapping Ethan's sensor is two lines: read it below and print its own name
// here, then write a signal function of that name in bench/sense-serial.js.

const int TRIG = 9;
const int ECHO = 10;
const int PIR = 2;             // Ethan's PIR motion sensor, OUT on D2

void setup() {
  Serial.begin(115200);          // sense-serial.js opens the port at this speed
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(PIR, INPUT);
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

  // The PIR holds its output HIGH for a few seconds after it sees movement,
  // so this is 1 for a moment after someone stops moving, not only while they do.
  int motion = digitalRead(PIR);

  Serial.print("cm ");
  Serial.print(cm, 1);
  Serial.print(" motion ");
  Serial.print(motion);
  Serial.println();

  delay(50);                     // about 20 readings a second
}
