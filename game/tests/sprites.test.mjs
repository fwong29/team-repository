// sprites.test.mjs: the sprite layer's whole job is to be invisible when the
// asset folder is empty, which is how a fresh clone arrives. A regression here
// does not throw — it silently paints nothing over a court — so this checks
// that every call reports "I drew nothing" rather than pretending it drew.
//
//   node game/tests/sprites.test.mjs

import {
  MANIFEST, loadSprites, sprite, hasSprite, drawSprite, drawSpriteAt,
  spriteRevision, spriteReport,
} from '../sprites.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

// A canvas context that records calls instead of making pixels. Anything the
// sprite layer touches on a real context has to be here too, or the test
// passes for the wrong reason.
function fakeCtx() {
  const calls = [];
  const note = name => (...args) => { calls.push({ name, args }); };
  return {
    calls,
    globalAlpha: 1,
    save: note('save'), restore: note('restore'),
    drawImage: note('drawImage'),
    beginPath: note('beginPath'), rect: note('rect'), clip: note('clip'),
  };
}

console.log('\nAn empty asset folder');

// There is no Image in node, which is the same situation as a folder with no
// files in it: nothing loads and nothing is in the map.
const loaded = await loadSprites();
ok('loadSprites resolves instead of throwing', loaded instanceof Map);
ok('nothing loaded without a browser', loaded.size === 0, `size ${loaded.size}`);
ok('revision starts at zero', spriteRevision() === 0, String(spriteRevision()));

const names = Object.keys(MANIFEST);
ok('the manifest names the six sports and a court', names.length === 7, String(names.length));
ok('every manifest path is under assets/',
   names.every(n => MANIFEST[n].startsWith('assets/')),
   names.filter(n => !MANIFEST[n].startsWith('assets/')).join(', '));

for (const name of names) {
  ok(`absent: ${name}`, !hasSprite(name) && sprite(name) === null);
}

console.log('\nDrawing an absent sprite');

const ctx = fakeCtx();
ok('drawSprite reports false', drawSprite(ctx, 'court/tennis', 0, 0, 800, 600) === false);
ok('drawSpriteAt reports false', drawSpriteAt(ctx, 'icon/tennis', 50, 50, 20) === false);
ok('an unknown name reports false', drawSprite(ctx, 'court/nonesuch', 0, 0, 800, 600) === false);
ok('nothing was drawn at all', ctx.calls.length === 0,
   ctx.calls.map(c => c.name).join(', '));

console.log('\nThe report the debug overlay prints');

const report = spriteReport();
ok('counts nothing loaded', report.loaded === 0 && report.total === names.length,
   `${report.loaded}/${report.total}`);
ok('lists every name as missing', report.missing.length === names.length,
   String(report.missing.length));

console.log('\nDrawing a sprite that is there');

// Standing in for a decoded image. drawSprite only reads naturalWidth and
// naturalHeight, so this is the whole surface it needs.
const fake = { naturalWidth: 200, naturalHeight: 100 };
loaded.set('court/tennis', fake);

const box = fakeCtx();
ok('reports true once the image exists',
   drawSprite(box, 'court/tennis', 0, 0, 400, 400, { fit: 'cover' }) === true);
const drew = box.calls.find(c => c.name === 'drawImage');
ok('blitted once', !!drew && box.calls.filter(c => c.name === 'drawImage').length === 1);
// cover on a 2:1 image in a square box scales by width (400/200 = 2), giving
// 800x400, and crops the overflow — so the height fills and the width spills.
ok('cover fills the box', drew && drew.args[3] === 800 && drew.args[4] === 400,
   drew ? drew.args.slice(1).join(', ') : 'no draw');
ok('cover clips to the box', box.calls.some(c => c.name === 'clip'));

const fit = fakeCtx();
drawSprite(fit, 'court/tennis', 0, 0, 400, 400, { fit: 'contain' });
const inside = fit.calls.find(c => c.name === 'drawImage');
ok('contain does not clip', !fit.calls.some(c => c.name === 'clip'));
ok('contain fits inside', inside && inside.args[3] <= 400 && inside.args[4] <= 400,
   inside ? inside.args.slice(1).join(', ') : 'no draw');

const tall = fakeCtx();
drawSprite(tall, 'court/tennis', 0, 0, 100, 400, { fit: 'contain' });
const small = tall.calls.find(c => c.name === 'drawImage');
ok('contain picks the limiting side', small && small.args[3] === 100 && small.args[4] === 50,
   small ? small.args.slice(3).join(', ') : 'no draw');

const stretched = fakeCtx();
drawSprite(stretched, 'court/tennis', 0, 0, 100, 400, { fit: 'stretch' });
const flat = stretched.calls.find(c => c.name === 'drawImage');
ok('stretch takes the box exactly', flat && flat.args[3] === 100 && flat.args[4] === 400,
   flat ? flat.args.slice(3).join(', ') : 'no draw');

const zero = fakeCtx();
ok('a zero-sized box draws nothing', drawSprite(zero, 'court/tennis', 0, 0, 0, 600) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
