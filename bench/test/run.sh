#!/bin/sh
# Runs bench.ino's State Table on a fake clock and a fake sensor, with no board
# attached: inc/ holds just enough of Arduino.h and U8g2lib.h to compile it.
# Checks the four holds, the gaps at each line, the median that absorbs a bad
# echo, the PIR's warm-up minute and the line it prints over USB.
cd "$(dirname "$0")"
g++ -std=c++11 -I inc -o table-test table-test.cpp 2>&1 | grep -v 'relocation\|DT_TEXTREL' || true
./table-test
