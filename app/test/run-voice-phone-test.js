// Voice, phone and Bob-Net (items 133 to 142, 2026-11-11): talk over Bob, read documents aloud, a voice per Bob,
// carry on on another Bob, your Bobs on the phone, and the phone's own helpers. Every switch starts off.
// No real computer is read: chats go to a temporary folder, the card reading is a fake, nothing is spoken.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { receiveCarry, sendCarry, carryMessages, carryId, carryInOn, CARRY_MAX } from '../src/carry.js';
import { glanceView, glanceOn, parseCard, cardReader, CARD_EVERY_MS } from '../src/glance.js';
import { mergeSettings, cleanVoiceMap } from '../src/config.js';
import { netVoiceFor, NET_VOICES } from '../src/tts.js';
import { wholeChat, chatTitle } from '../src/chats.js';
import { readPieces, keepPlace, savedPlace, SPEEDS } from '../public/read-aloud.js';
import { talkOverWords, BARGE_RMS, BARGE_SECS } from '../public/voice.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---- every new switch starts off ----
{
  const s = mergeSettings({}, {});
  for (const k of ['talkOver', 'readDocs', 'netVoices', 'carryIn', 'phoneGlance']) check(`${k} starts off`, s[k] !== true);
  const on = mergeSettings({}, { talkOver: true, carryIn: 'yes', phoneGlance: true });
  check('a switch saves only a real true/false', on.talkOver === true && on.carryIn !== 'yes' && on.phoneGlance === true);
}

// ---- a voice per Bob ----
{
  const m = cleanVoiceMap({ Riker: 'bm_george', Bill: 'auto', Evil: 'rm -rf', '': 'am_puck' });
  check('the voice map keeps real Kokoro voices and "auto"', m.Riker === 'bm_george' && m.Bill === 'auto' && !('Evil' in m) && !('' in m));
  const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`Bob${i}`, 'am_puck']));
  check('the voice map holds at most 30 Bobs', Object.keys(cleanVoiceMap(many)).length <= 30);
  check('off: no voice per Bob', netVoiceFor({ netVoices: false }, 'Riker') === '');
  const cfg = { netVoices: true, tts: { voice: 'am_onyx' }, netVoiceMap: { Riker: 'af_nova', Bill: 'auto' } };
  check('the owner\'s pick wins', netVoiceFor(cfg, 'Riker') === 'af_nova');
  const a = netVoiceFor(cfg, 'Bill'), b = netVoiceFor(cfg, 'Bill');
  check('"auto" picks from the name, the same each time', a && a === b && NET_VOICES.includes(a));
  const own = { netVoices: true, tts: { voice: 'bm_george' } };
  check('never Bob\'s own voice', ['Milo', 'Homer', 'Luke', 'Calvin', 'Riker', 'Bill', 'Bobert', 'Mario'].every((n) => netVoiceFor(own, n) !== 'bm_george'));
}

// ---- talk over Bob ----
{
  check('"stop" only stops him', talkOverWords('stop').stop && talkOverWords('Okay Bob, stop please').send === '');
  const t = talkOverWords('Hey Bob, what about the weather tomorrow');
  check('anything else stops him and is sent', t.stop && t.send === 'what about the weather tomorrow');
  check('silence does nothing', !talkOverWords('  ').stop);
  check('it takes a real voice, for about a third of a second', BARGE_RMS > 0.02 && BARGE_SECS >= 0.25 && BARGE_SECS <= 0.6);
}

// ---- read documents aloud ----
{
  const text = 'First sentence here. Second one!\n\n```\ncode\n```\n\nSee https://example.com now. ' + 'Long words '.repeat(80) + '.';
  const p = readPieces(text, 200);
  check('a document is cut into pieces no longer than asked', p.length >= 3 && p.every((x) => x.length <= 200), String(p.length));
  check('code and links are not read out', !p.join(' ').includes('https') && p.join(' ').includes('(code)') && p.join(' ').includes('a link'));
  let store = {};
  for (let i = 0; i < 60; i++) store = keepPlace(store, `doc${i}.pdf`, i, 100, 1);
  check('where you stopped is kept for the last 50 documents', Object.keys(store).length === 50 && !savedPlace(store, 'doc0.pdf') && savedPlace(store, 'doc59.pdf').at === 59);
  check('the speeds run from slower to twice as fast', SPEEDS[0] < 1 && SPEEDS.includes(1) && SPEEDS.at(-1) === 2);
}

// ---- carry on on another Bob ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-carry-'));
  const cfg = { dataDir: path.join(tmp, 'bob'), innDir: tmp, carryIn: false };
  const msgs = [
    { role: 'system', content: 'secret system words' },
    { role: 'user', content: 'Hello', text: 'Hello' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'x' }] },
    { role: 'tool', content: 'tool output' },
    { role: 'assistant', content: 'Hi there' }
  ];
  const words = carryMessages(msgs);
  check('only what you and Bob said travels', words.length === 2 && words.every((m) => m.role === 'user' || m.role === 'assistant') && !JSON.stringify(words).includes('secret'));
  check('off unless turned on', !carryInOn(cfg) && receiveCarry(cfg, { msgs }).code === 409);
  cfg.carryIn = true;
  check('an empty chat is turned away', receiveCarry(cfg, { msgs: [] }).code === 400);
  const r = receiveCarry(cfg, { msgs, title: 'Plans <b>', from: 'Riker"<x>' }, { rand: () => 'abcd1234', now: () => 1e12 });
  const got = wholeChat(cfg, r.id);
  check('the chat lands in Past chats with its title', r.ok && r.id === 'carried-abcd1234' && got.length === 2 && chatTitle(got) !== '');
  check('it is tagged as from another of your Bobs', got[0].from === 'bob-net' && !/[<>"]/.test(got[0].fromBob));
  const many = Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `line ${i}` }));
  const big = receiveCarry(cfg, { msgs: many }, { rand: () => 'big00000' });
  check(`a long chat keeps the last ${CARRY_MAX}, 40 in the recent part`, big.messages === CARRY_MAX && wholeChat(cfg, big.id).length === CARRY_MAX && JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'sessions', `${big.id}.json`), 'utf8')).length === 40);
  check('a phone chat keeps its id; anything else gets a new one', carryId('phone-ab12', true) === 'phone-ab12' && carryId('phone-ab12', false, () => 'z').startsWith('carried-') && carryId('../evil', true, () => 'q') === 'carried-q');

  const calls = [];
  const lenders = (status, body) => ({ bobs: () => [{ name: 'Laptop', address: 'laptop:7777' }], call: async (bob, p, o) => { calls.push([bob.name, p, o.method]); return { status, json: async () => body }; } });
  const ok = await sendCarry({ lenders: lenders(200, { ok: true, id: 'carried-1', messages: 2 }), msgs, title: 'T', from: 'PC', address: 'laptop:7777' });
  check('sending goes through the Bob-Net door', ok.ok && ok.to === 'Laptop' && calls[0][1] === '/api/bob-net/carry' && calls[0][2] === 'POST');
  const off = await sendCarry({ lenders: lenders(409, { off: true }), msgs, address: 'laptop:7777' });
  check('a Bob with it off says how to turn it on', /Laptop/.test(off.error) && /Take chats from my other Bobs/.test(off.error));
  const old = await sendCarry({ lenders: lenders(404, {}), msgs, address: 'laptop:7777' });
  check('an older Bob is asked to update', /older Bob/.test(old.error));
  check('a Bob not on your list is never called', (await sendCarry({ lenders: lenders(200, {}), msgs, address: 'stranger:1' })).error && calls.length === 3);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- your Bobs on the phone ----
{
  check('off unless turned on', !glanceOn({}) && glanceOn({ phoneGlance: true }));
  const card = parseCard('NVIDIA GeForce RTX 5070 Ti, 61, 9120, 16303, 37\n');
  check('the card reading is read', card.tempC === 61 && card.totalMB === 16303 && card.busyPct === 37);
  check('no card, no reading', parseCard('') === null && parseCard('garbage') === null);
  let runs = 0, t = 1000;
  const reader = cardReader({ run: async () => { runs++; return 'Card, 50, 1, 2, 3'; }, now: () => t });
  await reader(); await reader(); t += CARD_EVERY_MS + 1; await reader();
  check('the card is read at most every 20 seconds', runs === 2);
  const brain = { queue: [{ kind: 'picture', state: 'working', text: 'a cat' }, { kind: 'chat', state: 'done' }, { kind: 'music', state: 'waiting', guest: { from: 'Bill' } }], turns: new Map() };
  const g = glanceView(brain, { cfg: { phoneGlance: true }, card, loaded: ['riker'], reminders: [{ at: 5, text: 'past' }, { at: 2e12, text: 'later' }, { at: 1.5e12, text: 'next', local: 'Fri 9 am' }], version: '1.5.206', now: () => 1e12 });
  check('the glance says busy, the brain and the jobs', g.busy && g.brain === 'riker' && g.jobs.length === 2 && /Song for Bill/.test(g.jobs[1].what));
  check('the glance shows the next reminder, not a past one', g.nextReminder.text === 'next' && g.nextReminder.local === 'Fri 9 am');
}

// ---- the phone's helpers (logic.js) ----
{
  await import('../android/app/src/main/assets/www/logic.js');
  const L = globalThis.BobLogic;
  check('"Hey Bob" wakes him and is taken off', L.wakeWord('Hey Bob, lights on').woke && L.wakeWord('Hey Bob, lights on').rest === 'lights on' && !L.wakeWord('bobsled').woke);
  check('the phone and the computer agree on talking over', L.talkOver('stop').send === talkOverWords('stop').send && L.talkOver('Bob, add milk').send === talkOverWords('Bob, add milk').send);
  check('Bob\'s own echo isn\'t taken as you', L.selfEcho('the weather is fine today', 'Today the weather is fine and warm.') && !L.selfEcho('what time is it', 'Today the weather is fine.'));
  const v = L.voiceFor('Riker');
  check('each Bob gets the same pitch every time', v.pitch === L.voiceFor('riker').pitch && v.rate === L.voiceFor('Riker').rate);
  check('the phone reads documents in the same pieces', JSON.stringify(L.readPieces('One. Two. Three.', 400)) === JSON.stringify(readPieces('One. Two. Three.', 400)));
  check('low data: off, on mobile data, always', !L.lowData('off', true) && L.lowData('mobile', true) && !L.lowData('mobile', false) && L.lowData('always', false));
  const w = L.glanceWords({ busy: false, card: { tempC: 85, usedMB: 2048, totalMB: 16384, name: 'Card' }, jobs: [{ what: 'Picture', state: 'waiting' }], nextReminder: { text: 'Call', local: '9 am' } });
  check('the glance reads as plain words', w.state === 'Up, ready' && /hot/.test(w.heat) && w.jobs[0].includes('waiting') && w.reminder === '9 am: Call');
  check('an unreachable Bob says so', /reach/.test(L.glanceWords(null).state));
  const cm = L.carryMsgs({ msgs: [{ who: 'you', text: 'hi' }, { who: 'tool', text: 'x' }, { who: 'bob', text: 'hello' }] });
  check('the phone carries only what you and Bob said', cm.length === 2 && cm[1].role === 'assistant');
  check('a share becomes words for the box', L.shareWords({ subject: 'Recipe', text: 'Flour and eggs' }) === 'Recipe\n\nFlour and eggs' && L.shareWords({ file: { name: 'a.txt', text: 'x' } }).includes('```'));
}

// ---- the phone's switches start off, and the share door starts closed ----
{
  const phone = read('android/app/src/main/assets/www/phone.js');
  const d = phone.match(/DEFAULTS\s*=\s*\{[\s\S]*?\n\s*\};/)?.[0] || '';
  check('the phone\'s new switches start off', ['talkOver: false', 'wakeOn: false', 'netVoices: false', 'shareOn: false', 'widgetReminder: false', "lowData: 'off'"].every((x) => d.includes(x)), d ? '' : 'no DEFAULTS');
  const man = read('android/app/src/main/AndroidManifest.xml');
  check('"Share to Bob" is closed until switched on', /\.ShareToBob"[\s\S]{0,200}android:enabled="false"/.test(man) || /android:enabled="false"[\s\S]{0,200}\.ShareToBob"/.test(man));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
