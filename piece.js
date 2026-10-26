(() => {
  const canvas = document.querySelector('#piece');
  const ctx = canvas.getContext('2d');
 
  function resize() {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  }
  addEventListener('resize', resize);
  resize();
 
  let level = 0; // 0 = far (black), 1 = near (white)
 
  function ramp(x, a, b) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
 
  function frame() {
    const s = window.sense;
    const near = s && s.signals && typeof s.signals.near === 'number' ? s.signals.near : 0;
    level += (near - level) * 0.12;
 
    const w = canvas.width;
    const h = canvas.height;
    const inner = Math.round(255 * level);
    const outer = Math.round(255 * level * 0.55);
 
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgb(${inner}, ${inner}, ${inner})`);
    g.addColorStop(1, `rgb(${outer}, ${outer}, ${outer})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
 
    const textGray = Math.round(255 * (1 - level));
    ctx.fillStyle = `rgb(${textGray}, ${textGray}, ${textGray})`;
    ctx.font = `${Math.min(w, h) * 0.2}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
 
    ctx.globalAlpha = ramp(level, 0.5, 0.85);
    ctx.fillText('NEAR', w / 2, h / 2);
 
    ctx.globalAlpha = 1 - ramp(level, 0.15, 0.5);
    ctx.fillText('FAR', w / 2, h / 2);
 
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
 