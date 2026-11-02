# Too Close

## It sees

Distance in cm from the HC-SR04 ultrasonic sensor, read in the Serial Monitor.

- Nobody: 400 cm
- A little: about 100 cm
- A lot: 15 cm

## It calls you

- Hoverer: under about 38 cm, held 0.5 s
- Passerby: under 150 cm, held 1 s
- Nobody: over 150 cm, held 2 s

## It does

- Hoverer: the screen goes nearly white and says NEAR, and the OLED shows the cm number
- Passerby: the screen is a gray gradient, and the OLED shows the cm number
- Nobody: the screen is black and says FAR, and the OLED shows 400
