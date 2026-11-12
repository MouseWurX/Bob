// 1.5.204 🎲 Adventure table extras: dice you can see, sounds, music and reading aloud (public/table-fx.js), and the
// phone's copy of it (android www/table-fx.js) made word for word by android/tools/make-shared.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { forSpeech, createSounds, createMusic, createReader } from '../public/table-fx.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tick = () => new Promise((r) => setTimeout(r, 10));

check('forSpeech: bold words are read, stage directions in asterisks are not, links read as their words', forSpeech('The **goblin** grins. *rolls eyes* See [the map](x.png).') === 'The goblin grins. See the map.');
check('forSpeech: code and markdown marks are dropped', forSpeech('# Hi\n```js\nx()\n```\n> quoted _text_') === 'Hi quoted text' && forSpeech('') === '');

class FakeAudio { static made = []; constructor(u) { this.url = u; this.paused = false; FakeAudio.made.push(this); } play() { setTimeout(() => this.onended?.(), 1); return Promise.resolve(); } pause() { this.paused = true; } }
{ const s = createSounds({ urls: { steel: 'steel.wav' }, Ctx: null, Audio_: FakeAudio });
  s.play('hit'); check("sounds: the replicant matrix's own steel sound plays when it was made", FakeAudio.made.at(-1)?.url === 'steel.wav');
  const n = FakeAudio.made.length; s.setOn(false); s.play('hit'); check('sounds: off means silent', FakeAudio.made.length === n);
  let threw = false; try { createSounds({ Ctx: null, Audio_: null }).play('dice'); } catch { threw = true; } check('sounds: no audio on this device is fine', !threw);
}
{ const m = createMusic({ Audio_: FakeAudio });
  m.play('calm.wav'); const first = FakeAudio.made.at(-1); m.play('calm.wav');
  check('music: the same tune carries on, it loops softly', FakeAudio.made.at(-1) === first && first.loop === true && first.volume < 0.5);
  m.play('fight.wav'); check('music: a new scene swaps the tune', first.paused && m.url === 'fight.wav');
  m.setOn(false); check('music: off stops it', m.url === '');
}
{ const said = [];
  const r = createReader({ wav: null, Audio_: null, synth: { speak: (u) => { said.push(u.text); setTimeout(() => u.onend(), 1); }, cancel() {} }, Utter: class { constructor(t) { this.text = t; } } });
  r.say('*sighs* The **door** creaks.'); r.say('Who goes there?');
  for (let i = 0; i < 20 && said.length < 2; i++) await tick();
  check('reading aloud: one line after another, in plain words (the system voice when Bob has none)', said.join('|') === 'The door creaks.|Who goes there?');
}
{ const { buildTableFx, OUT_TABLE_FX } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
  check('the phone copy is up to date (node android/tools/make-shared.mjs)', fs.readFileSync(OUT_TABLE_FX, 'utf8').replace(/\r\n/g, '\n') === buildTableFx().replace(/\r\n/g, '\n'));
  await import(pathToFileURL(OUT_TABLE_FX));
  const P = globalThis.BobTableFx;
  check('the phone gets the same pieces as the desktop', P && ['rollDie', 'createSounds', 'createMusic', 'forSpeech', 'createReader'].every((k) => typeof P[k] === 'function') && P.forSpeech('**Hi** *waves*') === 'Hi');
  check('the phone page loads it', /<script src="table-fx\.js"><\/script>/.test(fs.readFileSync(path.join(root, 'android/app/src/main/assets/www/index.html'), 'utf8')));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
