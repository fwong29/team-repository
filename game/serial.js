// serial.js: the HC-SR04, read over Web Serial.
//
// The Arduino prints one line per reading, "cm 42.5" (firmware/hcsr04.ino).
// This file does nothing with the meaning of that number: it parses, filters
// out the lies, and publishes the newest good reading with a timestamp. The
// input layer decides what a distance means.
//
// Web Serial needs Chrome or Edge, and a page on localhost or https. Nothing is
// stored: each line is read and dropped.

import { CONFIG } from './config.js';
import { Median } from './filters.js';

export class Ultrasonic {
  constructor() {
    this.cm = null;          // newest good reading, centimetres
    this.at = 0;             // when it arrived, performance.now()
    this.connected = false;
    this.error = null;
    this.rawLine = '';       // for the debug overlay
    this.median = new Median(CONFIG.serial.medianWindow);
    this.port = null;
  }

  get supported() { return 'serial' in navigator; }

  // Fresh means the game can trust it. A sensor that stopped talking is worse
  // than no sensor, because the last reading looks like the player standing
  // perfectly still.
  get fresh() {
    return this.connected && this.cm !== null &&
      performance.now() - this.at < CONFIG.serial.staleMs;
  }

  async connect() {
    if (!this.supported) {
      this.error = 'This browser has no Web Serial. Use Chrome, on localhost or https.';
      return false;
    }
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: CONFIG.serial.baud });
      this.connected = true;
      this.error = null;
      this.read();
      return true;
    } catch (err) {
      this.error = `${err.message}. Close the Arduino IDE's Serial Monitor — only one program can hold the port.`;
      this.connected = false;
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    try { await this.port?.close(); } catch { /* already gone */ }
    this.port = null;
    this.cm = null;
    this.median.clear();
  }

  async read() {
    const reader = this.port.readable.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || !this.connected) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // the last piece may be half a line
        for (const line of lines) this.onLine(line);
      }
    } catch (err) {
      this.error = err.message;
      this.connected = false;
    } finally {
      reader.releaseLock();
    }
  }

  // "cm 42.5", or "cm 42.5 light 612" once a second sensor joins the line.
  onLine(line) {
    this.rawLine = line.trim();
    const parts = this.rawLine.split(/\s+/);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      if (parts[i] !== 'cm') continue;
      const value = Number(parts[i + 1]);
      // 0 is a timeout, 400 is the sketch's "nothing in range", and anything
      // past those is an echo off a wall. None of them are the player.
      if (!Number.isFinite(value)) return;
      if (value < CONFIG.serial.minCm || value >= CONFIG.serial.maxCm) return;
      this.cm = this.median.push(value);
      this.at = performance.now();
      return;
    }
  }
}
