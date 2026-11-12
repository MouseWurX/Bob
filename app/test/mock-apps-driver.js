// Stands in for installer\bob-apps.ps1 in tests: same JSON-lines protocol, a few made-up windows.
// Every request it gets is appended to the file in MOCK_APPS_LOG.
import fs from 'node:fs';
import readline from 'node:readline';
const log = (m) => { if (process.env.MOCK_APPS_LOG) fs.appendFileSync(process.env.MOCK_APPS_LOG, JSON.stringify(m) + '\n'); };
const own = Number(process.env.MOCK_BOB_PID || 0);
const windows = [
  { hwnd: 101, title: 'Untitled - Notepad', process: 'notepad', pid: 4242 },
  { hwnd: 102, title: 'Command Prompt', process: 'cmd', pid: 4243 },
  { hwnd: 103, title: 'Bob', process: 'Bob', pid: own },
  { hwnd: 104, title: 'Vault - KeePassXC', process: 'KeePassXC', pid: 4244 },
  { hwnd: 105, title: 'Windows Security', process: 'svchost', pid: 4245 },
  { hwnd: 106, title: 'Sketch - Paint', process: 'mspaint', pid: 4246 }
];
const apps = [{ name: 'Notepad', appId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App' }, { name: 'Paint', appId: 'Microsoft.Paint_8wekyb3d8bbwe!App' }, { name: 'Command Prompt', appId: 'cmd' }, { name: 'Registry Editor', appId: 'regedit' }];
let driving = false;
const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  log(m);
  const r = { id: m.id, ok: true };
  if (m.op === 'windows') r.windows = windows;
  else if (m.op === 'apps') r.apps = apps;
  else if (m.op === 'open') {
    if (!apps.some((a) => a.appId === m.appId)) { r.ok = false; r.error = 'not in the Start menu'; }
    else if (/Paint/.test(m.appId)) { /* Paint "opens" but no window shows up */ }
    // MOCK_APPS_LOG.oldtab there: like Windows 11 Notepad coming back on last time's unsaved note
    else windows.push({ hwnd: 200 + windows.length, title: process.env.MOCK_APPS_LOG && fs.existsSync(process.env.MOCK_APPS_LOG + '.oldtab') ? '*Dear diary - Notepad' : 'Untitled - Notepad', process: 'notepad', pid: 5000 + windows.length });
  }
  else if (m.op === 'look') r.items = [{ type: 'Text', name: 'Untitled', id: 'ContentTextBlock', enabled: true }, { type: 'Document', name: 'Text editor', id: '15', enabled: true, password: false, typable: true, value: 'hello' }, { type: 'MenuItem', name: 'File', id: '', enabled: true }, { type: 'Button', name: 'Save', id: 'save', enabled: true }, { type: 'Edit', name: 'Password', id: 'pw', password: true }];
  else if (m.op === 'picture') { fs.writeFileSync(m.file, Buffer.from('89504e470d0a1a0a', 'hex')); r.file = m.file; }
  else if (m.op === 'resolve') {
    const t = m.target || {};
    if (t.id === 'pw' || /password/i.test(t.name || '')) { r.label = 'Edit "Password" [id pw]'; r.password = true; }
    else if (m.action === 'type' || m.action === 'focus') {
      if (t.id === 'ContentTextBlock' || (!t.name && !t.id)) { r.label = 'Document "Text editor" [id 15]'; r.swapped = t.id ? `Text [id ${t.id}]` : ''; }
      else r.label = `${t.type || 'Edit'} "${t.name}"`;
    } else r.label = `${t.type || 'Button'} "${t.name || ''}"${t.id ? ` [id ${t.id}]` : ''}`;
    r.enabled = t.name !== 'Greyed';
  }
  else if (m.op === 'drive') driving = Boolean(m.on);
  else if (m.op === 'act') {
    if (!driving) { r.ok = false; r.error = "Bob isn't driving right now."; }
    else if (m.text === 'TAKE OVER') { driving = false; out({ event: 'stopped', why: 'mouse' }); r.ok = false; r.error = 'Stopped: you took back control.'; }
    else if (m.text === 'FAIL FOCUS') { r.ok = false; r.error = 'Windows wouldn\'t let Bob put the cursor in Document "Text editor", so nothing was typed.'; }
    else if (m.text === 'NOT THERE') r.did = 'typed into Document "Text editor" (added at the end), but when Bob read it back the text wasn\'t there';
    else {
      r.did = `${m.action} ${m.target?.name || ''}`.trim();
      // Like Windows 11 Notepad: after the first typing the title becomes "*<first line> - Notepad".
      const w = windows.find((x) => x.hwnd === m.hwnd);
      if (m.action === 'type' && w && w.process === 'notepad' && !w.title.startsWith('*')) w.title = `*${String(m.text).split('\n')[0].slice(0, 30)} - Notepad`;
      if (m.action === 'type') r.typed = m.text;
      if (m.action === 'keys' && m.keys === '^n' && w && w.process === 'notepad' && !fs.existsSync(process.env.MOCK_APPS_LOG + '.nonewtab')) w.title = 'Untitled - Notepad'; // a new tab
    }
  } else if (m.op === 'clickat') {
    if (!driving) { r.ok = false; r.error = "Bob isn't driving right now."; }
    else r.did = `clicked at (${m.x}, ${m.y}) in "${(windows.find((x) => x.hwnd === m.hwnd) || {}).title || '?'}"`;
  } else if (m.op === 'quit') { out(r); process.exit(0); }
  out(r);
});
