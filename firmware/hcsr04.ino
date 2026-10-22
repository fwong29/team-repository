// hcsr04.ino: the Arduino half of Motion Sports.
//
// It reads the HC-SR04 and prints one line per reading over USB, as name and
// number pairs separated by spaces:
//
//   cm 42.5
//
// That is all it does. What a distance means — a punch landing, a step into
// the shot, a push to pick a menu tile — is decided in the browser, in
// game/input.js. Keeping the meaning out of the sketch means you can change
// the game without reflashing the board.
//
// WIRING, Arduino Uno or Nano
//
//   HC-SR04        Arduino
//   ---------      -------
//   VCC      ----> 5V
//   GND      ----> GND
//   TRIG     ----> D9
//   ECHO     ----> D10
//
//   Nano                HC-SR04
//   +-----------+       +-----------+
//   |        5V |-------| VCC       |
//   |       GND |-------| GND       |
//   |        D9 |-------| TRIG      |
//   |       D10 |<------| ECHO      |
//   +-----------+       +-----------+
//
// 3.3V BOARDS ONLY (Nano 33 IoT, ESP32, anything not 5V tolerant): the
// HC-SR04 drives ECHO at 5V, which will damage a 3.3V input pin over time.
// Put a divider between ECHO and the board, two resistors, and take the
// board's signal from between them:
//
//   ECHO ----[ 1k ]----+----[ 2k ]---- GND
//                      |
//                      +--> D10 (now about 3.3V)
//
// TRIG is an output from the board, so it needs nothing.
//
// MOUNTING: at chest height, facing the player, not lying flat on a desk —
// flat on a desk it hears the desk. The cone is about 30 degrees wide. Soft
// clothing swallows the echo, so readings off a thick hoodie are worse than
// off a t-shirt.

const int TRIG = 9;
const int ECHO = 10;

// Must match CONFIG.serial.baud in game/config.js.
const long BAUD = 115200;

// pulseIn gives up after this many microseconds. 30 ms is about 5 metres,
// well past anything the game cares about.
const unsigned long TIMEOUT_US = 30000;

void setup() {
  Serial.begin(BAUD);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  digitalWrite(TRIG, LOW);
}

void loop() {
  // A 10 microsecond pulse on TRIG starts a reading.
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  unsigned long us = pulseIn(ECHO, HIGH, TIMEOUT_US);

  // Sound covers about 1 cm in 29 microseconds, and the pulse makes the trip
  // twice, so the round trip divides by 58. A zero means nothing came back
  // inside the timeout: report it as far away rather than as zero distance,
  // which the browser would otherwise read as somebody touching the sensor.
  float cm = us ? us / 58.0 : 400.0;

  Serial.print("cm ");
  Serial.print(cm, 1);
  Serial.println();

  // About 30 readings a second. Faster than this and echoes from one reading
  // bleed into the next.
  delay(33);
}
