// Drives Bob's real Apps hand (src/hands-apps.js + installer/bob-apps-linux.py) on a Linux desktop. Run from this folder
// with the windows it names open; see ../../2026-11-27-apps-hand-linux.md.
process.env.BOB_PLATFORM = 'linux';
const { appsTools } = await import('../../../../src/hands-apps.js');
const cfg = { hands: { enabled: true, apps: { on: true } }, dataDir: process.env.BOB_APPS_OUT || '/tmp', painterDir: process.env.BOB_APPS_OUT || '/tmp', userName: 'Sam' };
const t = appsTools({ cfg, log: () => {}, denyHands: () => {} }, { os_: 'linux' });
const ctx = { emit: () => {}, allowAll: new Set() };
const step = async (tool, args) => { try { const c = await t[tool].check(args, ctx); const r = await t[tool].run(args, ctx); console.log('OK', tool, '|', r.slice(0, 200).replace(/\n/g, ' / ')); } catch (e) { console.log('ERR', tool, '|', e.message.slice(0, 200)); } };
await step('app_look', { window: 'Wayland name' });
await step('app_act', { window: 'Wayland name', action: 'type', type: 'Edit', name: 'Your name', text: 'typed on Wayland' });
await step('app_act', { window: 'Wayland name', action: 'keys', keys: 'Enter' });
await step('app_act', { window: 'Wayland name', action: 'click_at', x: 10, y: 10 });
await step('app_look', { window: 'Wayland name', picture: true });
await step('app_act', { window: 'Wayland name', action: 'click', type: 'Button', name: 'OK' });
process.exit(0);
