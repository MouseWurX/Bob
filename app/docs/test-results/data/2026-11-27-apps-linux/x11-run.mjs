// Drives Bob's real Apps hand (src/hands-apps.js + installer/bob-apps-linux.py) on a Linux desktop. Run from this folder
// with the windows it names open; see ../../2026-11-27-apps-hand-linux.md.
process.env.BOB_PLATFORM = 'linux';
const { appsTools } = await import('../../../../src/hands-apps.js');
const cfg = { hands: { enabled: true, apps: { on: true } }, dataDir: process.env.BOB_APPS_OUT || '/tmp', painterDir: process.env.BOB_APPS_OUT || '/tmp', userName: 'Sam' };
const logs = [];
const brain = { cfg, log: (k, t) => logs.push(t), denyHands: () => {} };
const t = appsTools(brain, { os_: 'linux' });
const ctx = { emit: (e) => { if (e.type === 'image') console.log('IMAGE', e.file); }, allowAll: new Set() };
const step = async (tool, args) => { try { const c = await t[tool].check(args, ctx); console.log('CARD', tool, '|', c.text); const r = await t[tool].run(args, ctx); console.log('RESULT', tool, '|', r.slice(0, 300).replace(/\n/g, ' / ')); return r; } catch (e) { console.log('ERR', tool, '|', e.message.slice(0, 250)); } };
await step('app_look', {});
await step('open_app', { name: 'Text Editor' });
await step('open_app', { name: 'XTerm' });
await step('app_act', { window: 'Text Editor', action: 'type', text: '# Shopping\n- **milk**\n- eggs' });
await step('app_act', { window: 'Mousepad', action: 'type', text: 'Hello from Bob' });
await step('app_act', { window: 'Mousepad', action: 'keys', keys: 'Ctrl+N' });
await step('app_act', { window: 'Name please', action: 'type', type: 'Edit', name: 'Your name', text: 'Bob was here' });
await step('app_act', { window: 'Unlock', action: 'type', type: 'Edit', text: 'hunter2' });
await step('app_act', { window: 'Name please', action: 'click', type: 'Button', name: 'OK' });
await step('app_look', { window: 'Text Editor', picture: true });
await step('app_act', { window: 'Text Editor', action: 'click_at', x: 200, y: 150 });
console.log('---log---\n' + logs.join('\n'));
process.exit(0);
