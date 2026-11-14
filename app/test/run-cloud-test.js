// Tests cloud helpers: off by default, only with a key, fixed addresses, settings can't redirect.
import { cloudHelpers, cloudStatus, askCloud, CLOUD_PROVIDERS, keyEnv } from '../src/cloud.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const env = { ANTHROPIC_API_KEY: 'sk-test' };

{ // BOB_KEYS=env fences a test Bob: a name not in its own environment is never looked up anywhere else
  const was = process.env.BOB_KEYS; process.env.BOB_KEYS = 'env'; process.env.BOB_TEST_KEY_X = 'v1';
  const ke = keyEnv();
  check('BOB_KEYS=env: keys from the environment still work, nothing else is looked up', ke.BOB_TEST_KEY_X === 'v1' && ke.RUNPOD_API_KEY_NOT_SET_HERE === undefined);
  process.env.BOB_KEYS = 'store';
  check('BOB_KEYS=store: the environment is never read for a key (only the locked store)', keyEnv().BOB_TEST_KEY_X === undefined);
  delete process.env.BOB_TEST_KEY_X; if (was === undefined) delete process.env.BOB_KEYS; else process.env.BOB_KEYS = was;
}
check('no cloud helpers unless switched on', cloudHelpers({}, env).length === 0);
check('switched on but no key: still off', cloudHelpers({ cloudHelpers: { openai: { enabled: true, model: 'x' } } }, env).length === 0);
const on = cloudHelpers({ cloudHelpers: { anthropic: { enabled: true } } }, env);
check('switched on with a key: available with its default model', on.length === 1 && on[0].model === 'claude-sonnet-5-5' && on[0].baseUrl === 'https://api.anthropic.com/v1');
const st = cloudStatus({}, env);
check('status says which keys are found, never the key itself', st.find((c) => c.id === 'anthropic').keyFound && !JSON.stringify(st).includes('sk-test'));

const cfg = {};
mergeSettings(cfg, { cloudHelpers: { anthropic: { enabled: true, model: 'claude-haiku-5-5', baseUrl: 'https://evil.example', apiKeyEnv: 'PATH' }, 'bad id!': { enabled: true } } });
check('settings can only switch helpers and pick a model', cfg.cloudHelpers.anthropic.enabled === true && cfg.cloudHelpers.anthropic.model === 'claude-haiku-5-5' && !('baseUrl' in cfg.cloudHelpers.anthropic) && !('bad id!' in cfg.cloudHelpers));
check('addresses come from the built-in list', cloudHelpers(cfg, env)[0].baseUrl === CLOUD_PROVIDERS[0].baseUrl);

const real = globalThis.fetch;
let sent = null;
globalThis.fetch = async (url, opts) => { sent = { url, opts }; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hello from the cloud' }], usage: { input_tokens: 12, output_tokens: 5 } }), { status: 200 }); };
const r = await askCloud(on[0], 'Summarize this', undefined, env);
check('Claude helper uses the Messages API with the key header', sent.url === 'https://api.anthropic.com/v1/messages' && sent.opts.headers['x-api-key'] === 'sk-test' && r.text === 'Hello from the cloud' && r.usage.out === 5);
globalThis.fetch = real;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
