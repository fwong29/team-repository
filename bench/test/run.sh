#!/bin/sh
# Runs bench.ino with no board attached. inc/ holds just enough of Arduino.h
# and U8g2lib.h to compile the sketch as plain C++.
#
#   table-test    the State Table on a fake clock and a fake sensor: the four
#                 holds, the gaps at each line, the median that absorbs a bad
#                 echo, the PIR's warm-up minute, and the readouts holding
#                 still while a hand is held still
#   screen-check  where every row of the screen lands, in every state the
#                 piece can be in: nothing off the 128 x 64 panel, no two rows
#                 of text on top of each other
#
# Neither says anything about the wiring. That only gets checked by plugging
# the thing in. Add --picture to draw the screens as a PNG as well.
cd "$(dirname "$0")"
set -e
g++ -std=c++11 -I inc -o table-test   table-test.cpp   2>&1 | grep -v 'relocation\|DT_TEXTREL' || true
g++ -std=c++11 -I inc -o screen-check screen-check.cpp 2>&1 | grep -v 'relocation\|DT_TEXTREL' || true
./table-test
./screen-check
if [ "$1" = "--picture" ]; then python3 preview.py; fi
