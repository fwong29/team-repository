// tracker.js: the camera half. MediaPipe Pose Landmarker, same library and
// pinned version as the starter's sense.js, swapped from Face to Pose because
// a sports game needs arms.
//
// It hands back the raw landmark arrays and a timestamp. Every judgement about
// what a body is doing lives in input.js.
//
// What stays in the browser: each frame is read and dropped. The model
// downloads once when the camera starts; nothing is saved or uploaded.

import { CONFIG } from './config.js';

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// The 33 pose landmarks, by the names this game actually uses.
export const L = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
};

// Pairs to draw for the debug skeleton.
export const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export class Tracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.poses = [];      // one landmark array per person, left-most first
    this.at = 0;
    this.lastVideoTime = -1;
    this.error = null;
    this.fps = 0;
    this._frames = 0;
    this._fpsAt = 0;
  }

  async start(players = 2) {
    let PoseLandmarker, FilesetResolver;
    try {
      ({ PoseLandmarker, FilesetResolver } = await import(LIBRARY));
    } catch (err) {
      this.error = 'The tracking library did not load (cdn.jsdelivr.net is blocked or offline).';
      throw err;
    }
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const options = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: players,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = 'CPU'; // some machines refuse the GPU path
      this.landmarker = await PoseLandmarker.createFromOptions(vision, options);
    }
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: CONFIG.camera.width, height: CONFIG.camera.height },
    });
    await this.video.play();
  }

  // Called once a frame. Returns true when a new camera frame was read, so the
  // input layer knows whether its numbers moved.
  poll() {
    if (!this.landmarker) return false;
    if (this.video.currentTime === this.lastVideoTime) return false;
    this.lastVideoTime = this.video.currentTime;

    const now = performance.now();
    const result = this.landmarker.detectForVideo(this.video, now);

    // The video is mirrored on screen, so mirror x here too: the player's
    // right hand is then the one on the right of the picture they see.
    this.poses = result.landmarks.map(points =>
      points.map(p => ({ x: 1 - p.x, y: p.y, z: p.z, v: p.visibility ?? 1 })));

    // Two players are told apart by where they stand, left and right.
    this.poses.sort((a, b) => centreX(a) - centreX(b));
    this.at = now;

    this._frames++;
    if (now - this._fpsAt > 500) {
      this.fps = Math.round((this._frames * 1000) / (now - this._fpsAt));
      this._frames = 0;
      this._fpsAt = now;
    }
    return true;
  }
}

function centreX(points) {
  const a = points[L.leftShoulder];
  const b = points[L.rightShoulder];
  return a && b ? (a.x + b.x) / 2 : 0.5;
}
