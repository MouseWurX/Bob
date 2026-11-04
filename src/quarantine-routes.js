// Quarantine in Bob's API (see quarantine.js). Looking works from anywhere Bob's window is open; switching it on or
// off and releasing Bob only work on the PC itself.
//   GET  /api/quarantine           { on, active, history, reviewer, triggers }
//   POST /api/quarantine/settings  { on }   the opt-in switch (off by default)
//   POST /api/quarantine/release   let him act again (his work and the logbook were never touched)
import { quarantineView, release } from './quarantine.js';
import { saveSettings } from './config.js';

export async function quarantineRoute({ req, p, isLocal, brain, cfg, body, send, res }) {
  if (p !== '/api/quarantine' && !p.startsWith('/api/quarantine/')) return false;
  if (req.method === 'GET' && p === '/api/quarantine') { send(res, 200, quarantineView(cfg)); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'not found' }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Quarantine can only be changed on this replicant matrix itself.' }); return true; }
  const b = await body(req);
  if (p === '/api/quarantine/settings') {
    saveSettings(cfg, { quarantine: { on: b.on === true } });
    brain.log('quarantine', `"Let the reviewer quarantine Bob" switched ${b.on === true ? 'on' : 'off'}`);
    send(res, 200, quarantineView(cfg));
    return true;
  }
  if (p === '/api/quarantine/release') {
    const was = release(brain);
    send(res, was ? 200 : 404, { released: was ? was.name : null, ...quarantineView(cfg) });
    return true;
  }
  send(res, 404, { error: 'not found' });
  return true;
}
