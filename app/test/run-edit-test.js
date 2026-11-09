// Picture edits: Bob never quietly paints a new picture when an edit was meant, and says when an edit model
// is on this replicant matrix but not assigned.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-edit-'));
const f = (n) => { const p = path.join(dir, n); fs.writeFileSync(p, 'x'); return p; };
const photo = { id: 'r1', name: 'photo', kind: 'chat', file: 'photo.png' };

function bob({ edits = false, waiting = '' } = {}) {
  const b = Object.create(Brain.prototype);
  const sdcpp = { exe: f('sd.exe'), image: { diffusionModel: f('z.gguf') } };
  if (edits) sdcpp.edit = { diffusionModel: f('qie.gguf'), vae: f('vae.st'), llm: f('vl.gguf') };
  b.cfg = { agentDir: dir, painter: { engine: 'sdcpp', sdcpp }, stt: { provider: 'http' } };
  b.refs = { find: (n) => (n === 'photo' ? photo : null), list: () => [photo], pathOf: () => path.join(dir, 'photo.png') };
  b.shop = { roles: async () => ({ current: { edit: '' }, options: { edit: waiting ? [{ value: 'qwen-image-edit-2509', label: waiting }] : [] } }) };
  b.painted = [];
  b.paintOwn = async (kind, args) => { b.painted.push({ kind, args }); return `painted ${kind}`; };
  return b;
}
const ctx = (pics = []) => ({ pics, emit() {}, signal: new AbortController().signal });

{
  const b = bob();
  const r = await b.makeImage({ prompt: 'make it a watercolour' }, ctx([photo]));
  check('a picture attached but not named: nothing is painted, Bob is told how to edit it', !b.painted.length && /Didn't paint yet/.test(r) && /reference \["photo"\]/.test(r) && /mode "new"/.test(r));
  await b.makeImage({ prompt: 'a lighthouse', mode: 'new' }, ctx([photo]));
  check('mode "new" paints something new even with a picture attached', b.painted.at(-1)?.kind === 'image' && !b.painted.at(-1).args.image);
}
{
  const b = bob();
  const r = await b.makeImage({ prompt: 'watercolour', reference: ['photo'] }, ctx([photo]));
  check('an edit with no edit model: nothing painted, and it says so with the way to fix it', !b.painted.length && /Didn't paint anything/.test(r) && /No picture-edit model is on this replicant matrix/.test(r) && /start_from/.test(r));
}
{
  const b = bob({ waiting: 'Qwen Image Edit 2509' });
  const r = await b.makeImage({ prompt: 'watercolour', reference: ['photo'] }, ctx([photo]));
  check('an edit model on this replicant matrix but not assigned is named, with where to assign it', !b.painted.length && /Qwen Image Edit 2509 is on this replicant matrix but isn't assigned to "Picture edits"/.test(r) && /Equip Bob/.test(r));
}
{
  const b = bob();
  const r = await b.makeImage({ prompt: 'watercolour', reference: ['photo'], mode: 'start_from', strength: 0.4 }, ctx([photo]));
  check('start_from (asked for) still reworks the picture, with a drift note', b.painted.at(-1)?.kind === 'image' && b.painted.at(-1).args.strength === 0.4 && /look can drift/.test(r));
}
{
  const b = bob({ edits: true });
  await b.makeImage({ prompt: 'watercolour', reference: ['photo'] }, ctx([photo]));
  check('with an edit model, the picture goes to the edit model as a reference', b.painted.at(-1)?.kind === 'edit' && b.painted.at(-1).args.refs?.[0] === path.join(dir, 'photo.png'));
}
// ---- Real edits keep the picture (2026-11-02: a phone photo came out as a new person) ----
// A tiny JPEG header: EXIF orientation, then the stored size (as the camera saved it, on its side).
function jpegBytes(w, h, turn) {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'ascii'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(turn, 18);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(exif.length + 2) >> 8, (exif.length + 2) & 0xff]), exif]);
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.from([0xff, 0xd9])]);
}
const { imageInfo, imageInfoOf, sizeLike } = await import('../src/imageinfo.js');
const { editPrompt } = await import('../src/brain.js');
{
  const side = imageInfo(jpegBytes(2944, 2208, 8));
  check('a phone photo stored on its side is read with its turn, and its shown size', side?.type === 'jpg' && side.turn === 8 && side.width === 2208 && side.height === 2944);
  const flat = imageInfo(jpegBytes(1600, 1200, 1));
  check('an upright JPEG keeps its size', flat.turn === 1 && flat.width === 1600 && flat.height === 1200);
  const png = Buffer.alloc(32); Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
  check('PNG size is read', imageInfo(png)?.width === 640 && imageInfo(png)?.height === 480);
  const s = sizeLike(2208, 2944);
  check('edits paint at the picture\'s own shape, about a megapixel', s.width === 880 && s.height === 1184);
  check('the edit instruction gets a line to keep everything else', /Keep everything else exactly as it is/.test(editPrompt('Replace the hard hat with a tiara')) && editPrompt('Make the sky red, keep the dog').endsWith('keep the dog'));
}
{
  const b = bob({ edits: true });
  const pic = path.join(dir, 'phone.jpg');
  fs.writeFileSync(pic, jpegBytes(2944, 2208, 6));
  const chatPic = { id: 'r2', name: 'Chat picture', kind: 'chat', file: 'phone.jpg', seen: 'a firefighter at night' };
  b.refs = { find: (n) => (n === 'Chat picture' ? chatPic : null), list: () => [chatPic], pathOf: () => pic, info: () => imageInfoOf(pic) };
  await b.makeImage({ prompt: 'Replace the hard hat with a tiara', reference: ['Chat picture'], width: 1024, height: 1024 }, ctx([chatPic]));
  const a = b.painted.at(-1)?.args || {};
  check('an attached photo goes to the edit model with the instruction, not a scene description', b.painted.at(-1)?.kind === 'edit' && /^Replace the hard hat with a tiara\. Keep everything else/.test(a.prompt) && !/Reference look/.test(a.prompt));
  check('the edit keeps the photo\'s shape (portrait), not a forced square', a.width === 880 && a.height === 1184);
  await b.makeImage({ prompt: 'Make it a wide banner', reference: ['Chat picture'], width: 1536, height: 640 }, ctx([chatPic]));
  check('a size that was really asked for is kept', b.painted.at(-1).args.width === 1536 && b.painted.at(-1).args.height === 640);
}
{
  const b = bob({ edits: true });
  const painted = path.join(dir, 'painter'); fs.mkdirSync(painted, { recursive: true });
  const lastFile = path.join(painted, '2026-11-02-aaaa1111.png');
  const png = Buffer.alloc(32); Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(png); png.writeUInt32BE(1216, 16); png.writeUInt32BE(832, 20);
  fs.writeFileSync(lastFile, png);
  b.cfg.painterDir = painted;
  b.made = { list: ({ kind }) => (kind === 'image' ? [{ name: path.basename(lastFile), path: lastFile }] : []) };
  await b.makeImage({ prompt: 'Make the gown blue', reference: ['last'] }, ctx());
  const a = b.painted.at(-1)?.args || {};
  check('"last" edits the newest picture Bob made, at its own shape', b.painted.at(-1)?.kind === 'edit' && a.refs?.[0] === lastFile && a.width === 1216 && a.height === 832 && /Keep everything else/.test(a.prompt));
  await b.makeImage({ prompt: 'Add snow', reference: ['2026-11-02-aaaa1111.png'] }, ctx());
  check('a painted file name works as a reference too', b.painted.at(-1)?.args.refs?.[0] === lastFile);
  let err = '';
  try { await b.makeImage({ prompt: 'x', reference: ['nope'] }, ctx()); } catch (e) { err = e.message; }
  check('an unknown name tells Bob about "last"', /"last"/.test(err));
}
{
  const b = bob({ edits: true });
  const mira = { id: 'r3', name: 'Captain Mira', kind: 'character', file: 'photo.png', seen: 'red scarf' };
  b.refs = { find: (n) => (n === 'Captain Mira' ? mira : null), list: () => [mira], pathOf: () => path.join(dir, 'photo.png') };
  await b.makeImage({ prompt: 'Captain Mira at the helm in a storm', reference: ['Captain Mira'] }, ctx());
  const a = b.painted.at(-1)?.args || {};
  check('a shelf character in a new scene keeps its look note and no "keep everything" line', /Reference look: Captain Mira: red scarf/.test(a.prompt) && !/Keep everything else/.test(a.prompt));
}
{
  const { RefShelf } = await import('../src/refs.js');
  const inn = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-inn-'));
  const shelf = new RefShelf({ innDir: inn, dataDir: path.join(inn, 'bob'), painterDir: path.join(inn, 'painter'), recycleBin: false });
  const r = shelf.add(jpegBytes(2944, 2208, 8), { kind: 'chat' });
  check('the shelf notes a sideways photo', r.turn === 8 && r.width === 2208 && r.height === 2944);
  const up = shelf.replace(r.id, jpegBytes(1536, 2048, 1));
  check('an upright copy replaces it under the same id and name', up.id === r.id && up.name === r.name && up.turn === 1 && shelf.info(shelf.find(r.id)).turn === 1 && fs.existsSync(shelf.pathOf(up)));
  const binned = fs.readdirSync(path.join(inn, 'bob', 'trash'), { recursive: true }).filter((f) => /\.jpg$/.test(f));
  check('the sideways original goes to the Recycle Bin, not overwritten', up.original === 'bin' && binned.length === 1 && fs.readFileSync(path.join(inn, 'bob', 'trash', binned[0])).length === jpegBytes(2944, 2208, 8).length);
  let bad = '';
  try { shelf.replace(r.id, Buffer.from('not a picture')); } catch (e) { bad = e.message; }
  check('a non-picture is refused', /PNG, JPEG or WebP/.test(bad));
  fs.rmSync(inn, { recursive: true, force: true });
}
{
  const sh = fs.readFileSync(fileURLToPath(new URL('../public/shelf.js', import.meta.url)), 'utf8');
  const app = fs.readFileSync(fileURLToPath(new URL('../public/app.js', import.meta.url)), 'utf8');
  const srv = fs.readFileSync(fileURLToPath(new URL('../src/server.js', import.meta.url)), 'utf8');
  check('uploads are turned upright in the window first (imageOrientation from-image)', /imageOrientation: 'from-image'/.test(sh) && /upright\(file\)/.test(sh));
  const help = fs.readFileSync(fileURLToPath(new URL('../public/help-content.js', import.meta.url)), 'utf8');
  check('Help says photos are turned upright and camera details removed', /Hidden camera details, such as where a photo was taken, are removed/.test(help));
  check('one quiet note when old pictures were turned, none when nothing was', /if \(!fixed\) return;/.test(app) && /The originals are in the Recycle Bin\./.test(app));
  check('old sideways pictures are fixed once when the window opens', /fixSideways\(\)/.test(app) && /\/api\/refs\/upright/.test(sh) && /p === '\/api\/refs\/upright'/.test(srv));
  const persona = fs.readFileSync(fileURLToPath(new URL('../src/persona.js', import.meta.url)), 'utf8');
  check('the painter copy is told edits are short instructions', /short instruction saying only what to change/.test(persona));
}

const ui = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Model roles shows a model that is on this replicant matrix but not assigned, with a Use button', /On this replicant matrix, not assigned yet/.test(ui) && /data-userole=/.test(ui) && /b\.dataset\.userole/.test(ui));
const tools = fs.readFileSync(new URL('../src/tools.js', import.meta.url), 'utf8');
check('make_image offers mode new', /enum: \['keep_look', 'start_from', 'new'\]/.test(tools));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
