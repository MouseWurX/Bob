// Bob for iPhone, on GitHub's Mac (.github/workflows/iphone.yml): opens the phone screen (/phone/) in Safari's own
// engine (Playwright WebKit, sized like an iPhone 16 Pro) against a real Bob with no brain, and fails on any page
// error or blocked script. Not part of npm test: it needs WebKit, which only the iPhone workflow installs.
// A simulator, not a phone: it can't show a real iPhone's memory limit, speed or heat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webkit, devices } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'iphone-shots');
fs.mkdirSync(out, { recursive: true });
const PORT = Number(process.env.BOB_PORT || 7795);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-iphone-look-'));
const example = JSON.parse(fs.readFileSync(path.join(root, 'config.example.json'), 'utf8').replace(/\r\n/g, '\n'));
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ ...example, engine: 'ollama' }));
const bob = spawn(process.execPath, [path.join(root, 'src', 'server.js')], { env: { ...process.env, BOB_CONFIG: path.join(tmp, 'config.json'), BOB_AGENT_DIR: path.join(tmp, 'Bob home'), BOB_OLLAMA_URL: 'http://127.0.0.1:9', BOB_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
const up = async () => { for (let i = 0; i < 60; i++) { const ok = await new Promise((r) => http.get({ host: '127.0.0.1', port: PORT, path: '/phone/' }, (res) => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false))); if (ok) return true; await new Promise((r) => setTimeout(r, 500)); } return false; };

const problems = [];
const step = (what) => console.log(`step: ${what}`);
const problem = (p) => { console.log(`  ${p}`); problems.push(p); };
let browser;
try {
  if (!(await up())) throw new Error('Bob did not start');
  browser = await webkit.launch();
  const phone = devices['iPhone 15 Pro'] || devices['iPhone 14 Pro'];
  const ctx = await browser.newContext({ ...phone, viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 } }); // 16 Pro size
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problem(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(401|404)|EventSource/.test(m.text())) problem(`console: ${m.text()} (at ${m.location()?.url || '?'}:${m.location()?.lineNumber ?? '?'})`); });
  page.on('requestfailed', (r) => { if (!/\/api\/events/.test(r.url())) problem(`failed: ${r.url()} ${r.failure()?.errorText || ''}`); });
  step('open /phone/'); await page.goto(`http://127.0.0.1:${PORT}/phone/`, { waitUntil: 'load' });
  step('wait'); await page.waitForTimeout(2500); step('shot 1');
  await page.screenshot({ path: path.join(out, '1-chat.png'), caret: 'initial' });
  // Playwright hides the text cursor for a screenshot with a <style> of its own, which the page's style rule blocks
  // (one refusal per shot), so the shots keep the cursor: every refusal left is the page's own.
  // What a style rule (style-src 'self') would block: <style> blocks and style="" attributes on the page.
  const inline = await page.evaluate(() => [...document.querySelectorAll('style, [style]')].map((e) => e.outerHTML.slice(0, 160)));
  for (const h of inline) console.log(`inline style on the page: ${h}`);
  const bridge = await page.evaluate(() => Boolean(globalThis.BobPhone?.web));
  if (!bridge) problem('the web bridge did not load');
  step('open the menu'); await page.click('#open-menu');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, '2-menu.png'), caret: 'initial' });
  if (await page.locator('#menu').isHidden()) problem('the menu did not open');
  await page.locator('#menu .back').first().click();
  step('type'); await page.fill('#text', 'Hello from the iPhone check');
  await page.screenshot({ path: path.join(out, '3-typing.png'), caret: 'initial' });
  // Leaving the screen and coming back (PR #373): no errors, page still answers.
  step('leave and come back'); await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '4-back-again.png'), caret: 'initial' });
} catch (e) {
  problem(`check stopped: ${e.message}`);
} finally {
  await browser?.close();
  bob.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
for (const p of problems) console.log(`FAIL ${p}`);
console.log(problems.length ? `${problems.length} problem(s) on the phone screen in WebKit` : 'PASS the phone screen opens in WebKit (iPhone 16 Pro size) with no errors');
process.exit(problems.length ? 1 : 0);
