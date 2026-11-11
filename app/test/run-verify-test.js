// Handoff protocol, part 3: the app checks that every action really ran (src/verify.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expectFrom, verifyOutput, afterTool, afterTurn, pathsIn, plainWhy, describe } from '../src/verify.js';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-verify-'));
const put = (name, data) => { const f = path.join(dir, name); fs.writeFileSync(f, data); return f; };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const old = (f) => { const t = new Date(Date.now() - 5000); fs.utimesSync(f, t, t); return f; };
const cfg = { userName: 'Sam' };

// ---- expectFrom
const ex = (t, o) => expectFrom(t, o)?.kind ?? null;
for (const [t, k] of [
  ['show me a picture of a fox', 'picture'], ['make me a picture', 'picture'], ['Can you make me a picture of a fox?', 'picture'],
  ['draw a cat in a hat', 'picture'], ['paint my cat as a pirate', 'picture'], ['generate an image of a castle at night', 'picture'],
  ['give me a wallpaper with mountains', 'picture'], ['bob, please draw a dragon', 'picture'], ['show me the picture again', 'show'],
  ['make a video of a dog surfing', 'video'], ['compose a song about rain', 'music'], ['make a sound effect of a door', 'sound'],
  ['open notepad and type hello', 'app'], ['type hello world into notepad', 'app'], ['take the wheel', 'app'], ['launch blender', 'app'],
  ['save that to a file on my desktop', 'file'], ['save it as C:\\Users\\you\\poem.txt', 'file'], ['write a text file with my shopping list', 'file'], ['save the list', 'file']
]) check(`expectFrom: "${t}" asks for ${k}`, ex(t) === k);
for (const t of ['can you make pictures?', 'how do I make a picture in blender?', 'dont make a picture yet, just the prompt', 'write me an image prompt for a castle',
  'write me a poem', 'what is a picture?', 'make a video game', 'hi bob', 'did you make the picture?', 'Can you show me how to make a logo?',
  'give me an idea for a picture', 'I made a picture yesterday, thoughts?', 'remember the logo we talked about', '']) check(`expectFrom: "${t}" asks for nothing`, ex(t) === null);
check('expectFrom: an attached picture plus "make her hair blue" asks for a picture', ex('make her hair blue', { pics: [{ name: 'me.png' }] }) === 'picture');
check('expectFrom: "make her hair blue" with nothing attached asks for nothing', ex('make her hair blue') === null);
check('expectFrom: keeps the words it matched', /picture/.test(expectFrom('show me a picture of a fox').words));
check('expectFrom: a second ask is listed under also', JSON.stringify(expectFrom('make a picture of a fox and save it to a file')?.also) === '["file"]');

// ---- verifyOutput
const png = old(put('fox.png', PNG));
check('verifyOutput: a real PNG is a picture', (await verifyOutput(png, 'image')).ok);
check('verifyOutput: "picture" works as a type name', (await verifyOutput(png, 'picture')).ok);
check('verifyOutput: the type comes from the name when not given', (await verifyOutput(png)).ok);
check('verifyOutput: a missing file fails', !(await verifyOutput(path.join(dir, 'nope.png'), 'image')).ok);
check('verifyOutput: an empty picture fails', /empty/.test((await verifyOutput(old(put('empty.png', '')), 'image')).why));
check('verifyOutput: text saved as .png fails', /isn't a real picture/.test((await verifyOutput(old(put('fake.png', 'PNG')), 'image')).why));
check('verifyOutput: a folder fails', !(await verifyOutput(dir, 'image')).ok);
check('verifyOutput: no file named fails', !(await verifyOutput('', 'image')).ok);
check('verifyOutput: JPEG passes', (await verifyOutput(old(put('a.jpg', Buffer.from('ffd8ffe000104a46', 'hex'))), 'image')).ok);
check('verifyOutput: WAV passes as audio', (await verifyOutput(old(put('a.wav', Buffer.from('RIFF0000WAVEfmt '))), 'audio')).ok);
check('verifyOutput: MP3 (ID3) passes as audio', (await verifyOutput(old(put('a.mp3', Buffer.from('ID3\u0004\u0000\u0000'))), 'sound')).ok);
check('verifyOutput: MP4 passes as video', (await verifyOutput(old(put('a.mp4', Buffer.from('00000018667479706d703432', 'hex'))), 'video')).ok);
check('verifyOutput: a PNG is not a video', !(await verifyOutput(png, 'video')).ok);
check('verifyOutput: an empty text file is still a file', (await verifyOutput(old(put('blank.txt', '')), 'file')).ok);
{
  // A painter that says "done" while it's still writing: verify waits until the size holds still.
  const f = put('growing.png', PNG.subarray(0, 4));
  setTimeout(() => fs.writeFileSync(f, PNG), 100);
  const v = await verifyOutput(f, 'image', { settleMs: 150 });
  check('verifyOutput: waits for a file still being written', v.ok);
}

// ---- pathsIn / plainWhy / describe
check('pathsIn: a Windows path in a result', pathsIn('Painted a picture, saved as C:\\Bob\\inn\\painter\\2026-11-02-ab.png. The user can see it.')[0] === 'C:\\Bob\\inn\\painter\\2026-11-02-ab.png');
check('pathsIn: a Windows path with spaces', pathsIn('Saved D:\\My Stuff\\notes\\todo list.txt.')[0] === 'D:\\My Stuff\\notes\\todo list.txt');
check('pathsIn: ComfyUI "saved in folder: a, b"', pathsIn('Painted 2 picture(s), saved in /x/p: a.png, b.png. The user can see it.').includes(path.join('/x/p', 'b.png')));
check('plainWhy: drops the notes meant for Bob', plainWhy('Error: Access is denied. (That is the real reason, from Windows. Tell Sam it plainly; don\'t say it opened.)') === 'Access is denied.');
check('describe: plain words for a typing step', describe('app_act', { action: 'type', window: 'Notepad' }) === 'Typing in Notepad');

// ---- afterTool
const L = (o = {}) => ({ cfg, ledger: { outputs: [], actions: [], ...o } });
{
  const f = old(put('made.png', PNG));
  const r = await afterTool('make_image', { prompt: 'fox' }, `Painted a picture, saved as ${f}. The user can see it in the chat.`, L({ outputs: [{ type: 'image', file: f, tool: 'make_image', at: 1 }] }));
  check('afterTool: a picture that is on disk and in the chat is ok', r.ok && !r.show && r.files[0] === f);
  const r2 = await afterTool('make_image', { prompt: 'fox' }, `Painted a picture, saved as ${f}. The user can see it in the chat.`, L());
  check('afterTool: a real picture that never reached the chat is sent to be shown', r2.ok && r2.show?.[0]?.file === f && r2.show[0].type === 'image');
  const r3 = await afterTool('make_image', { prompt: 'fox' }, `Painted a picture, saved as ${path.join(dir, 'gone.png')}. The user can see it in the chat.`, L());
  check('afterTool: a picture the result names but isn\'t on disk fails, with one retry', !r3.ok && r3.retry && /^Error:/.test(r3.text) && /isn't there/.test(r3.why));
  const r4 = await afterTool('make_image', { prompt: 'fox' }, `Painted a picture, saved as ${old(put('bad.png', 'oops'))}. The user can see it.`, L());
  check('afterTool: a broken picture file fails, with one retry', !r4.ok && r4.retry);
  const r5 = await afterTool('make_image', { prompt: 'fox' }, 'Painted a picture. The user can see it in the chat.', L());
  check('afterTool: "painted" with no file anywhere fails', !r5.ok && r5.retry && /no picture came out/.test(r5.why));
  const r6 = await afterTool('make_image', { prompt: 'fox' }, 'Painted a picture. The user can see it.', L({ outputs: [{ type: 'image', file: f, tool: 'make_image', at: 5 }], toolStart: 5 }));
  check('afterTool: uses the turn\'s outputs when the result names no file', r6.ok);
  const r7 = await afterTool('make_image', { prompt: 'fox' }, 'Painted a picture. The user can see it.', L({ outputs: [{ type: 'image', file: f, tool: 'make_image', at: 1 }], toolStart: 5 }));
  check('afterTool: an older picture from this turn doesn\'t count for a new call', !r7.ok);
}
check('afterTool: CUDA out of memory gets one retry', (await afterTool('make_image', { prompt: 'x' }, 'Error: sd-cli stopped: CUDA out of memory', L())).retry === true);
check('afterTool: "isn\'t set up" gets no retry', (await afterTool('make_video', { prompt: 'x' }, 'Error: Video isn\'t set up yet.', L())).retry === false);
{
  const ctx = L({ actions: [{ name: 'make_image', args: { prompt: 'x' }, ok: false, text: 'Error: ComfyUI didn\'t finish in time.', at: 1 }], toolStart: 9 });
  const r = await afterTool('make_image', { prompt: 'x' }, 'Error: ComfyUI didn\'t finish in time.', ctx);
  check('afterTool: the same call failing twice gets no third go', !r.ok && !r.retry && /tried it twice/.test(r.text));
}
check('afterTool: "Didn\'t paint" is on purpose, not a failure', (await afterTool('make_image', {}, 'Didn\'t paint anything. Editing needs a picture-edit model.', L())).info === true);
check('afterTool: "the user said no" is declined, not failed', (await afterTool('write_file', {}, 'The user said no. Do not try again.', L())).declined === true);
check('afterTool: an empty result fails', (await afterTool('open_app', { name: 'Notepad' }, '', L())).ok === false);
{
  const f = path.join(dir, 'note.txt');
  fs.writeFileSync(f, 'hello');
  check('afterTool: write_file read back and matching is ok', (await afterTool('write_file', { path: f, content: 'hello' }, `Saved ${f}.`, L())).ok);
  const r = await afterTool('write_file', { path: f, content: 'hello there' }, `Saved ${f}.`, L());
  check('afterTool: write_file with different content on disk fails and retries', !r.ok && r.retry && /isn't what Bob wrote/.test(r.text));
  const r2 = await afterTool('write_file', { path: path.join(dir, 'never.txt'), content: 'x' }, `Saved ${path.join(dir, 'never.txt')}.`, L());
  check('afterTool: write_file with no file on disk fails', !r2.ok && /isn't there/.test(r2.text));
  check('afterTool: edit_file with the new text in the file is ok', (await afterTool('edit_file', { path: f, find: 'x', replace: 'ell' }, `Edited ${f}. (Backup kept in the inn.)`, L())).ok);
  check('afterTool: edit_file without the new text fails, no blind retry', ((r) => !r.ok && !r.retry)(await afterTool('edit_file', { path: f, find: 'x', replace: 'zzz' }, `Edited ${f}. (Backup kept in the inn.)`, L())));
  const csv = put('bills-2026-11-02.csv', '\ufeffa,b\r\n');
  check('afterTool: save_spreadsheet on disk is ok', (await afterTool('save_spreadsheet', { name: 'bills' }, `Saved ${csv} (1 lines including the header). Double-click it.`, L())).ok);
  check('afterTool: save_spreadsheet missing fails', !(await afterTool('save_spreadsheet', { name: 'bills' }, `Saved ${path.join(dir, 'x.csv')} (1 lines including the header).`, L())).ok);
}
check('afterTool: open_app with its window open is ok', (await afterTool('open_app', { name: 'Notepad' }, 'Opened Notepad: its window "Untitled - Notepad" is open.', L())).ok);
{
  const r = await afterTool('open_app', { name: 'Paint' }, 'Windows was asked to open Paint, but no new window appeared within 8 seconds.', L());
  check('afterTool: open_app with no window fails and says to look before opening again', !r.ok && !r.retry && /app_look with no window/.test(r.text));
}
check('afterTool: app_act "Done" is ok', (await afterTool('app_act', { action: 'type', window: 'Notepad' }, 'Done: typed into Document "Text editor".', L())).ok);
{
  const r = await afterTool('app_act', { action: 'type', window: 'Notepad' }, 'Not sure it worked: typed into Document "Text editor", but when Bob read it back the text wasn\'t there.', L());
  check('afterTool: app_act not read back is unconfirmed and asks for a look', !r.ok && r.confirm?.name === 'app_look' && r.confirm.args.window === 'Notepad' && /call app_look on "Notepad"/.test(r.text));
}
check('afterTool: run_command exit code 1 fails', /exit code 1/.test((await afterTool('run_command', { cmd: 'npm' }, 'Finished with exit code 1.\nOutput (end):\nboom', L())).why));
check('afterTool: run_command exit code 0 is ok', (await afterTool('run_command', { cmd: 'npm' }, 'Finished with exit code 0 (success).\nOutput (end):\nok', L())).ok);
check('afterTool: run_command never retries by itself', (await afterTool('run_command', { cmd: 'npm' }, 'Error: timed out', L())).retry === false);
check('afterTool: file_hands with nothing done fails', !(await afterTool('file_hands', { action: 'move' }, 'Move 2 files: 0 done.\nNot done: a.txt (in use)', L())).ok);
check('afterTool: file_hands partly done is ok but partly', (await afterTool('file_hands', { action: 'move' }, 'Move 2 files: 1 done.\nNot done: a.txt (in use)', L())).partly === true);
check('afterTool: arguments given as JSON text work', (await afterTool('app_act', '{"action":"type","window":"Notepad"}', 'Not sure it worked: x', L())).confirm.args.window === 'Notepad');

// ---- afterTurn
const T = (o = {}, brain) => ({ cfg, brain, ledger: { outputs: [], actions: [], nudged: 0, ...o } });
const pic = old(put('turn.png', PNG));
{
  const r = afterTurn(T({ expect: expectFrom('show me a picture of a fox') }), 'Imagine a fox in the snow, its fur glowing.');
  check('afterTurn: "show me a picture" answered in words gets a nudge to call make_image', /make_image/.test(r?.nudge) && r.groups.includes('pictures'));
  const r2 = afterTurn(T({ expect: expectFrom('show me a picture of a fox'), nudged: 1 }), 'Imagine a fox in the snow.');
  check('afterTurn: ...and after the nudge, a plain note for the user (never ignored)', !r2.nudge && /didn't make a picture/.test(r2.note));
}
check('afterTurn: a picture made and shown is all good', afterTurn(T({ expect: expectFrom('make me a picture'), outputs: [{ type: 'image', file: pic }], actions: [{ name: 'make_image', args: {}, ok: true, text: `Painted a picture, saved as ${pic}.` }] }), 'Here is your fox!') === null);
check('afterTurn: no picture model on this PC: no nudge', afterTurn(T({ expect: expectFrom('make me a picture') }, { usable: () => false }), 'I can\'t make pictures on this PC yet.') === null);
check('afterTurn: no picture model and an empty reply: one more go first', /empty/.test(afterTurn(T({ expect: expectFrom('make me a picture') }, { usable: () => false }), '')?.nudge));
check('afterTurn: ...then a plain note with the one next step', /^Bob can't make pictures yet: he needs a picture model\. Get one in Get models\.$/.test(afterTurn(T({ expect: expectFrom('make me a picture'), nudged: 1 }, { usable: () => false }), '')?.note));
{
  const r = afterTurn(T(), 'Here\'s your picture of a fox in the snow!');
  check('afterTurn: "here\'s your picture" with nothing made: nudge, note at once, and a strike', /never claim it/i.test(r?.nudge) && /Nothing was actually made/.test(r.note) && r.strike === 'claim');
}
check('afterTurn: "here\'s a picture prompt" is not a claim', afterTurn(T(), 'Here\'s a picture prompt you can use: a fox in snow.') === null);
check('afterTurn: "I\'ve saved the file" with no file tool: claim', /a saved file/.test(afterTurn(T(), 'I\'ve saved the file to your desktop.')?.nudge));
{
  const p = path.join(dir, 'ghost.txt');
  const f = path.join(dir, 'note.txt');
  const r = afterTurn(T({ actions: [{ name: 'write_file', args: { path: f }, ok: true, text: `Saved ${f}.` }] }), `Done, I saved it as ${p} for you.`);
  check('afterTurn: a path he says he saved to that isn\'t on disk: note and nudge', r?.note === 'There\'s no file at ghost.txt, though Bob said he saved it there. Ask him to save it again.' && /no file there/.test(r.nudge));
  const r2 = afterTurn(T(), `Here's your picture, and I saved it as ${p}.`);
  check('afterTurn: two kinds of claim in one reply: only one correction', r2?.note === 'Nothing was actually made in that reply. Bob said he made a picture, but no picture was made.');
  check('afterTurn: a path that is really there is fine', afterTurn(T({ actions: [{ name: 'write_file', args: { path: f }, ok: true, text: `Saved ${f}.` }] }), `Done, I saved it as ${f} for you.`) === null);
}
{
  const r = afterTurn(T({ outputs: [{ type: 'image', file: pic }], actions: [{ name: 'make_image', args: {}, ok: true, text: `Painted a picture, saved as ${pic}.`, files: [pic] }] }), '');
  check('afterTurn: an empty reply after a picture shown in the chat: no second go, no note repeating the card', r === null);
  const r2 = afterTurn(T({ actions: [{ name: 'make_image', args: {}, ok: true, text: `Painted a picture, saved as ${pic}.`, files: [pic] }] }), '');
  check('afterTurn: an empty reply after a picture with no card: "Done" note, no second go', !r2?.nudge && r2?.note === 'Done: made the picture (turn.png).');
  const r3 = afterTurn(T({ actions: [{ name: 'write_file', args: { path: 'C:\\x\\notes.txt' }, ok: true, text: 'Saved C:\\x\\notes.txt.' }] }), '');
  check('afterTurn: an empty reply after saving a file: "Done: saved notes.txt."', r3?.note === 'Done: saved notes.txt.');
}
check('afterTurn: an empty reply with nothing done: one more go', /empty/.test(afterTurn(T(), '')?.nudge));
check('afterTurn: an empty reply again: the plain note', /didn't answer that one/.test(afterTurn(T({ nudged: 1 }), '')?.note));
{
  const actions = [{ name: 'write_file', args: { path: 'C:\\x\\a.txt' }, ok: false, why: 'not allowed in that folder', text: 'Error: I\'m not allowed to write in that folder.' }, { name: 'app_act', args: { action: 'type', window: 'Notepad' }, ok: true, text: 'Done: typed' }];
  check('afterTurn: a failure put right another way: no note', afterTurn(T({ actions }), 'It is typed into Notepad instead.') === null);
  const r = afterTurn(T({ actions: actions.slice(0, 1) }), 'That didn\'t work, sorry.');
  check('afterTurn: a failure left as it is: a clear note with the reason', r?.note === 'Saving a.txt didn\'t work: not allowed in that folder.');
}
check('afterTurn: a picture that failed twice: a note in plain words', /^Making the picture didn't work: the graphics card ran out of memory\.$/.test(afterTurn(T({ expect: expectFrom('make a picture of a fox'), actions: [{ name: 'make_image', args: {}, ok: false, why: 'CUDA out of memory' }, { name: 'make_image', args: {}, ok: false, why: 'CUDA out of memory' }] }), 'The painter ran out of memory.')?.note));
{
  const actions = [{ name: 'app_act', args: { action: 'type', window: 'Notepad' }, ok: false, text: 'Not sure it worked: typed, but when Bob read it back the text wasn\'t there' }];
  const r = afterTurn(T({ actions }), 'I typed it.');
  check('afterTurn: an unconfirmed Notepad step: nudge to check with app_look', /app_look on "Notepad"/.test(r?.nudge) && r.groups.includes('apps'));
  check('afterTurn: ...not once he has looked', !/app_look/.test(afterTurn(T({ actions: [...actions, { name: 'app_look', args: { window: 'Notepad' }, ok: true, text: 'Window: ...' }] }), 'It shows hello.')?.nudge || ''));
}
check('afterTurn: "open notepad" with no app tool: nudge to open_app', /open_app/.test(afterTurn(T({ expect: expectFrom('open notepad and type hello') }), 'Sure! Here you go.')?.nudge));
check('afterTurn: "open notepad" with the Apps hand off: no nudge', afterTurn(T({ expect: expectFrom('open notepad') }, { usable: (n) => n !== 'open_app' }), 'The Apps hand is off.') === null);
check('afterTurn: "save it to a file" and Bob asks where: fine', afterTurn(T({ expect: expectFrom('save that to a file') }), 'Sure, which folder should it go in?') === null);
check('afterTurn: "Didn\'t paint yet... call make_image again": nudge to do that', /Do that now/.test(afterTurn(T({ expect: expectFrom('make her hair blue', { pics: [{}] }), actions: [{ name: 'make_image', args: {}, ok: true, info: true, text: 'Didn\'t paint yet. A picture is attached. To change it, call make_image again with reference ["me.png"].' }] }), 'Okay!')?.nudge));
check('afterTurn: no edit model ("Didn\'t paint anything"): no nudge', afterTurn(T({ expect: expectFrom('make her hair blue', { pics: [{}] }), actions: [{ name: 'make_image', args: {}, ok: true, info: true, text: 'Didn\'t paint anything. Editing needs a picture-edit model.' }] }), 'I need a picture-edit model for that.') === null);
check('afterTurn: the user said no: no nudge, no note', afterTurn(T({ expect: expectFrom('make me a picture'), actions: [{ name: 'make_image', args: {}, ok: true, declined: true }] }), 'Okay, no picture.') === null);
check('afterTurn: a technical reason: "Ask Bob what went wrong" instead', afterTurn(T({ actions: [{ name: 'run_command', args: { cmd: 'npm' }, ok: false, why: 'TypeError: cannot read properties of undefined' }] }), 'Hmm.')?.note === 'Running npm didn\'t work. Ask Bob what went wrong.');
check('afterTurn: a file job has a plain name', afterTurn(T({ actions: [{ name: 'file_hands', args: { action: 'move' }, ok: false, why: 'none of it was done: a.txt (in use)' }] }), 'Hmm.')?.note === 'Moving the files didn\'t work: none of it was done: a.txt (in use).');
check('afterTurn: Apps hand off and an empty reply: the switch to turn on', afterTurn(T({ expect: expectFrom('open notepad'), nudged: 1 }, { usable: (n) => n !== 'open_app' }), '')?.note === 'Bob can\'t do that yet: the Open and use apps Hand is off. Turn it on in Settings, Hands.');
check('afterTurn: he claimed the picture he didn\'t make: the correction, not "didn\'t make"', afterTurn(T({ expect: expectFrom('make me a picture'), nudged: 1 }), 'Here is your picture!')?.note === 'Nothing was actually made in that reply. Bob said he made a picture, but no picture was made.');
check('afterTurn: plain chat: nothing to do', afterTurn(T({ expect: expectFrom('hi bob') }), 'Hey Sam!') === null);
check('afterTurn: one nudge only per turn', afterTurn(T({ nudged: 1 }), 'Here\'s your picture!')?.nudge === undefined);

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
