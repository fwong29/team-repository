js
const canvas = document.querySelector('#piece');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}
addEventListener('resize', resize);
resize();

let level = 0;

function frame() {
  const { state } = window.sense;
  level += ((state === 'close' ? 1 : 0) - level) * 0.15;

  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = `rgb(${11 + level * 230}, ${11 + level * 200}, ${13 + level * 120})`;
  ctx.fillRect(0, 0, w, h);

  if (level > 0.05) {
    ctx.globalAlpha = level;
    ctx.fillStyle = '#0b0b0d';
    ctx.font = `${Math.min(w, h) * 0.2}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEAR', w / 2, h / 2);
    ctx.globalAlpha = 1;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);