// Jobs extra (16 Nov 2026, the owner: "can this be added to the rental run that's going?"). One more do-jobs run on a
// pod the Forge already has running, from another Lab copy (newer code), while the Forge's own run is still going.
// The Forge keeps the pod's brain key in its token file (out/forge/pod-token-<run>.json); this reads it and hands it to
// do-jobs as LAB_API_KEY, the way the Forge does for its own commands. The key is never printed or written anywhere.
// The pod is still the Forge's: it is deleted when the Forge's run ends, so give this run --hours that end before that.
//
// node jobs-extra.mjs --token-file <pod-token-<run>.json> -- <do-jobs flags: --url, --dir, --out, ...>
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const at = argv.indexOf('--');
const own = at < 0 ? argv : argv.slice(0, at);
const rest = at < 0 ? [] : argv.slice(at + 1);
const i = own.indexOf('--token-file');
const file = i >= 0 ? own[i + 1] : '';
if (!file || !fs.existsSync(file)) { console.log(`JOBS EXTRA STOP: --token-file ${file || '(none)'} not found`); process.exit(1); }
let token = '';
try { token = String(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).token || ''); } catch { token = ''; }
if (!token) { console.log('JOBS EXTRA STOP: the token file has no token'); process.exit(1); }
if (!rest.includes('--url')) { console.log('JOBS EXTRA STOP: give do-jobs --url <the pod brain url> after --'); process.exit(1); }
const hide = (s) => String(s).split(token).join('[key]');
const ch = spawn(process.execPath, [path.join(here, 'do-jobs.mjs'), ...rest], { cwd: here, windowsHide: true, env: { ...process.env, LAB_API_KEY: token, LAB_REMOTE: '1' } });
ch.stdout.on('data', (d) => process.stdout.write(hide(d)));
ch.stderr.on('data', (d) => process.stderr.write(hide(d)));
ch.on('exit', (code) => process.exit(code ?? 1));
