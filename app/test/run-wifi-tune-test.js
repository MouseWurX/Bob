// Calibrate Wi-Fi (src/wifi-tune.js): reading the band, choosing the best one, and the small admin part.
// Nothing here reads the real computer: Windows' answers, the timing and the admin helper are all pretend.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInterfaces, parseNetworks, bandOfValue, bandSetting, pickBand, workerScript, wifiView, wifiSays, timeLink, calibrate, putBack, cleanWifiWas, pctToDbm, FLOOR_DBM } from '../src/wifi-tune.js';
import { shareView, cleanSharePatch } from '../src/share-brains.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-wifi-'));
const H = (n) => [10, 1, 2, n].join('.'); // home-network addresses, built so no real one sits in the file

const iface = (band, ch, rssi, rate) => `\r\nThere is 1 interface on the system: \r\n\r\n    Name                   : Wi-Fi\r\n    Description            : Pretend WiFi 6 NIC\r\n    State                  : connected\r\n    SSID                   : Home Net\r\n    AP BSSID               : 02:00:00:00:00:01\r\n    Band                   : ${band} GHz\r\n    Channel                : ${ch}\r\n    Radio type             : 802.11ax\r\n    Receive rate (Mbps)    : ${rate}\r\n    Transmit rate (Mbps)   : ${rate}\r\n    Signal                 : 86% \r\n    Rssi                   : ${rssi}\r\n    Profile                : Home Net \r\n`;
const NETS = 'SSID 1 : Other\n    BSSID 1 : 02:00:00:00:00:09\n         Signal : 99%\n         Band : 5 GHz\n         Channel : 36\n\nSSID 2 : Home Net\n    Network type : Infrastructure\n    BSSID 1 : 02:00:00:00:00:01\n         Signal             : 86%  \n         Radio type         : 802.11ax\n         Band               : 2.4 GHz\n         Channel            : 6 \n    BSSID 2 : 02:00:00:00:00:02\n         Signal             : 90%  \n         Band               : 5 GHz\n         Channel            : 161 \n    BSSID 3 : 02:00:00:00:00:03\n         Signal             : 50%  \n         Band               : 6 GHz\n         Channel            : 69 \n    BSSID 4 : 02:00:00:00:00:04\n         Signal             : 40%  \n         Band               : 5 GHz\n         Channel            : 36 \n';
const PROPS = [
  { DisplayName: 'Channel Width for 5GHz', DisplayValue: 'Auto', ValidDisplayValues: ['20 MHz Only', 'Auto'] },
  { DisplayName: 'Preferred Band', DisplayValue: '1. No Preference', ValidDisplayValues: ['1. No Preference', '2. Prefer 2.4GHz band', '3. Prefer 5GHz band', '4. Prefer 6GHz band'] }
];

{
  const w = parseInterfaces(iface('2.4', 6, -57, 143));
  ok(w.band === '2.4' && w.channel === 6 && w.rssi === -57 && w.rate === 143 && w.signal === 86 && w.ssid === 'Home Net', 'the connected Wi-Fi is read: band, channel, signal and speed');
  ok(parseInterfaces('There is no wireless interface on the system.') === null && parseInterfaces('') === null, 'no Wi-Fi reads as none');
  ok(parseInterfaces('    SSID : X\n    Kanal : 44\n    Signal : 80%\n').band === '5' && parseInterfaces('    SSID : X\n    Kanal : 44\n    Signal : 80%\n').rssi === pctToDbm(80), 'an older Windows with no Band line: the band comes from the channel, the strength from the percent');
  const o = parseNetworks(NETS, 'Home Net');
  ok(o.length === 3 && o[0].band === '5' && o[0].signal === 90 && o[0].channel === 161 && o.find((x) => x.band === '6').dbm === -75, 'the router\'s bands under this name, the strongest of each, another network left out');
  ok(parseNetworks(NETS, 'Nobody').length === 0, 'a name that isn\'t there offers nothing');
}
{
  ok(bandOfValue('2. Prefer 2.4GHz band') === '2.4' && bandOfValue('Prefer 5.2GHz band') === '5' && bandOfValue('4. Prefer 6GHz band') === '6' && bandOfValue('1. No Preference') === 'any' && bandOfValue('20 MHz Only') === '', 'a setting\'s values are told apart by band');
  const s = bandSetting(PROPS);
  ok(s.name === 'Preferred Band' && s.nowBand === 'any' && s.choices['5'] === '3. Prefer 5GHz band' && s.values[0] === '1. No Preference' && s.values.length === 4, 'the card\'s band setting is found, its present value first');
  ok(bandSetting([PROPS[0]]) === null && bandSetting(null) === null, 'a card without a band setting has none (channel width isn\'t one)');
}
{
  const r = (band, median, worst, rssi, rate, more = {}) => ({ band, ok: true, n: 30, lost: 0, median, worst, rssi, rate, ...more });
  ok(pickBand([r('2.4', 31, 104, -57, 143), r('5', 4, 9, -52, 866)]).band === '5', 'the quickest trip wins');
  ok(pickBand([r('5', 6, 12, -55, 866), r('6', 3, 6, -75, 1200)]).band === '5', 'a band below the signal floor is not picked while a stronger one works');
  ok(pickBand([r('6', 9, 30, -75, 1200), r('2.4', 20, 40, -80, 50)]).band === '6' && FLOOR_DBM === -70, 'when every band is weak, the strongest');
  ok(pickBand([r('2.4', 5, 8, -50, 143), r('5', 5.2, 8, -52, 866)]).band === '5', 'as quick as each other: the faster link');
  ok(pickBand([r('5', 3, 5, -50, 866, { lost: 10 }), r('2.4', 20, 30, -50, 143)]).band === '2.4' && pickBand([{ band: '5', ok: false }]) === null && pickBand([]) === null, 'a band that loses a third of the trips, or never came back, is out');
}
{
  const s = workerScript({ adapter: 'Wi-Fi', setting: "Bob's Band", values: ['a', 'b'], dir: 'C:\\data\\x' });
  ok(s.includes("$s = 'Bob''s Band'") && s.includes("@('a', 'b')") && /\$i -ge 0 -and \$i -lt \$v\.Count/.test(s), 'the admin part knows one card, one setting and its own values, and takes only a number in range');
  ok(/\$idle -ge 240 -and \$last -ne 0\) \{ Set-NetAdapterAdvancedProperty .* -DisplayValue \$v\[0\]/.test(s), 'left alone for a minute, it puts the first value back');
  ok(!/Invoke-Expression|iex |DownloadString|Set-ExecutionPolicy|Firewall|Defender/i.test(s), 'and it runs nothing it is handed, and touches no firewall or protection');
  let threw = false; try { workerScript({ adapter: 'Wi-Fi', setting: 'x', values: ['a'], dir: 'd' }); } catch { threw = true; }
  ok(threw, 'with one value there is nothing to calibrate');
}

// A pretend Windows: netsh says whichever band the "card" is on; the admin helper is played by the run fake, which
// answers step files the way the real script does.
function pretend({ start = '2.4', deny = false, stuck = false, radio = { 2.4: [6, -57, 143], 5: [161, -52, 866], 6: [69, -75, 1200] }, props = PROPS } = {}) {
  const st = { band: start, sets: [], admin: 0, timer: null };
  const run = (file, args) => {
    if (file === 'netsh' && args.includes('interfaces')) return Promise.resolve({ ok: true, out: iface(st.band, ...radio[st.band]), err: '' });
    if (file === 'netsh') return Promise.resolve({ ok: true, out: NETS, err: '' });
    const cmd = args[args.length - 1];
    if (!cmd.includes('-Verb RunAs')) return Promise.resolve({ ok: true, out: JSON.stringify({ name: 'Wi-Fi', card: 'Pretend WiFi 6 NIC', gateway: H(1), props }), err: '' });
    st.admin++;
    if (deny) return Promise.resolve({ ok: false, out: '', err: 'The operation was canceled by the user.' });
    const script = Buffer.from(cmd.match(/'-EncodedCommand','([^']+)'/)[1], 'base64').toString('utf16le');
    if (!script.includes("'ready'")) { st.sets.push(script); return Promise.resolve({ ok: true, out: '', err: '' }); }
    const dir = script.match(/\$d = '([^']+)'/)[1], values = [...script.match(/\$v = @\((.*?)\)\n/)[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    fs.writeFileSync(path.join(dir, 'ready'), '1\r\n');
    return new Promise((resolve) => {
      st.timer = setInterval(() => {
        let t; try { t = fs.readFileSync(path.join(dir, 'step'), 'utf8').trim(); fs.unlinkSync(path.join(dir, 'step')); } catch { return; }
        if (t === 'done') { clearInterval(st.timer); return resolve({ ok: true, out: '', err: '' }); }
        const [turn, i] = t.split(' ').map(Number);
        st.sets.push(values[i]);
        const b = bandOfValue(values[i]);
        if (b !== 'any' && !stuck) st.band = b;
        fs.writeFileSync(path.join(dir, `ack${turn}`), '1\r\n');
      }, 5);
    });
  };
  return { st, run };
}
const trips = { 2.4: { n: 30, lost: 0, median: 31, worst: 104 }, 5: { n: 30, lost: 0, median: 4, worst: 9 }, 6: { n: 30, lost: 0, median: 3, worst: 5 } };
const quick = { sleep: () => new Promise((r) => setTimeout(r, 2)), settleMs: 1, target: { host: H(3), port: 7777, name: 'Go' } };

{
  const { run } = pretend();
  const v = await wifiView({ os_: 'win', run });
  ok(v.ok && v.wifi.band === '2.4' && !('ssid' in v.wifi) && v.offers.length === 3 && v.setting.name === 'Preferred Band' && v.adapter === 'Wi-Fi', 'Check reads the band, the offers and the setting, and leaves the network\'s name out');
  const say = wifiSays(v);
  ok(/on 2\.4 GHz, channel 6, signal -57 dBm, 143 Mbit\/s/.test(say) && /also offers 5 GHz \(about -55 dBm here\) and 6 GHz \(about -75 dBm here, weak\)/.test(say) && /Calibrate can try/.test(say) && !say.includes('Home Net'), 'and says it plainly');
  ok(/Windows only/.test((await wifiView({ os_: 'mac', run })).why) && /nmcli/.test((await wifiView({ os_: 'linux', run })).why) && wifiSays(await wifiView({ os_: 'linux', run })).includes('nmcli'), 'on a Mac or Linux it says what to do instead');
  const none = await wifiView({ os_: 'win', run: () => Promise.resolve({ ok: true, out: '', err: '' }) });
  ok(!none.ok && /isn't on Wi-Fi/.test(none.why), 'on a cable there is nothing to calibrate');
}
{
  const { st, run } = pretend();
  const cfg = { dataDir: tmp, share: {} };
  let saved, said = '';
  const r = await calibrate(cfg, { os_: 'win', run, ...quick, measure: async () => trips[st.band], save: (w) => { saved = w; }, log: (k, t) => { said = `${k}: ${t}`; } });
  ok(r.ok && r.changed && r.pick === '5' && st.band === '5', 'Calibrate moves a card from 2.4 GHz to a strong 5 GHz');
  ok(st.admin === 1 && st.sets.join('|') === '3. Prefer 5GHz band|3. Prefer 5GHz band', 'with one Windows prompt, and without trying the weak 6 GHz');
  ok(saved.value === '1. No Preference' && saved.setting === 'Preferred Band' && /^bob-net: Wi-Fi calibrated/.test(said), 'what the setting said before is kept for Put it back, and the logbook gets a line');
  ok(/trip to Go/.test(r.text) && /2\.4 GHz: 31 ms there and back \(worst 104\)/.test(r.text) && /Best is 5 GHz/.test(r.text) && /6 GHz is too weak here to try \(about -75 dBm\)/.test(r.text), 'and Bob says what he measured and what he did');
  ok(fs.readdirSync(tmp).filter((f) => f.startsWith('wifi-calibrate-')).length === 0, 'the helper\'s folder is gone afterwards');
}
{
  const { st, run } = pretend({ start: '5' });
  let saved = 'no';
  const r = await calibrate({ dataDir: tmp, share: {} }, { os_: 'win', run, ...quick, measure: async () => (st.band === '5' ? trips['5'] : { n: 30, lost: 0, median: 31, worst: 104 }), save: (w) => { saved = w; } });
  ok(r.ok && r.pick === '5' && st.band === '5' && st.sets[st.sets.length - 1] === '3. Prefer 5GHz band' && saved.value === '1. No Preference', 'already on the best band: it is pinned there, so Windows can\'t wander off it');
}
{
  const { st, run } = pretend({ stuck: true });
  let saved = 'no';
  const r = await calibrate({ dataDir: tmp, share: {} }, { os_: 'win', run, ...quick, measure: async () => trips[st.band], save: (w) => { saved = w; } });
  ok(r.ok && !r.changed && /5 GHz: the card stayed on 2\.4 GHz/.test(r.text) && /nothing changed/.test(r.text) && saved === 'no' && st.sets[st.sets.length - 1] === '1. No Preference', 'a card that won\'t move is said so, and its setting goes back as it was');
}
{
  const { st, run } = pretend({ deny: true });
  const r = await calibrate({ dataDir: tmp, share: {} }, { os_: 'win', run, ...quick, measure: async () => trips[st.band] });
  ok(!r.ok && /answer was No, so nothing changed/.test(r.text) && st.sets.length === 0, 'No at the Windows prompt changes nothing');
}
{
  const { st, run } = pretend({ props: [PROPS[0]] });
  const r = await calibrate({ dataDir: tmp, share: {} }, { os_: 'win', run, ...quick, measure: async () => trips[st.band] });
  ok(r.ok && !r.changed && st.admin === 0 && /no band setting I can change, so I only timed it/.test(r.text), 'a card with no band setting is only timed, with no prompt');
  const m = await calibrate({ dataDir: tmp }, { os_: 'mac', run });
  ok(!m.ok && /Windows only/.test(m.text), 'and off Windows nothing runs');
}
{
  const { st, run } = pretend();
  const cfg = { share: { wifiWas: { adapter: 'Wi-Fi', setting: 'Preferred Band', value: '1. No Preference' } } };
  let saved = 'no';
  const r = await putBack(cfg, { os_: 'win', run, save: (w) => { saved = w; } });
  ok(r.ok && saved === null && st.sets.length === 1 && st.sets[0].includes("-DisplayValue '1. No Preference'"), 'Put it back sets the card as Bob found it');
  ok(!(await putBack({ share: {} }, { os_: 'win', run })).ok && !(await putBack(cfg, { os_: 'win', run: pretend({ deny: true }).run })).ok, 'and does nothing when there is nothing to put back, or the answer is No');
}
{
  let i = 0;
  const t = await timeLink({}, { n: 5, gapMs: 0, trip: async () => [4, null, 9, 5, 6][i++], sleep: async () => {} });
  ok(t.n === 5 && t.lost === 1 && t.median === 6 && t.worst === 9, 'trips are counted: the middle one, the worst, and the unanswered');
  const cfg = { share: { wifiWas: { adapter: 'Wi-Fi', setting: 'Preferred Band', value: 'x', extra: 1 } }, remote: {} };
  ok(shareView(cfg).wifiWas === true && shareView({}).wifiWas === false && cleanSharePatch(cfg, { scut: true }).share.wifiWas.value === 'x' && !('extra' in cleanSharePatch(cfg, {}).share.wifiWas) && cleanWifiWas({}) === undefined, 'the kept setting survives other settings changes, and Put it back shows only then');
}
{
  const ui = read('public', 'share-brains.js'), help = read('public', 'help-content.js'), srv = read('src', 'server.js');
  ok(ui.includes('data-wifi-check') && ui.includes('data-wifi-cal') && ui.includes('data-wifi-back') && ui.includes('aria-live="polite" data-wifi-say'), 'Settings has Check, Calibrate and Put it back, and reads the result out');
  ok(help.includes("set('Wi-Fi band: Check, Calibrate, Put it back'") && help.includes("id: 'faq-wifi-calibrate'") && help.includes('<dt>Calibrate (Wi-Fi band)</dt>'), 'Help, an FAQ and the glossary cover it');
  ok(/\/api\/share-brains\/wifi'[^\n]*\n\s*if \(!isLocal\)/.test(srv) && srv.includes('brain.cardLender?.child || brain.engine?.spread?.using?.length'), 'only this machine can ask, and never while a card is being shared');
  ok(read('docs', 'SETTINGS-INVENTORY.md').includes('Wi-Fi band (always shown under Bigger Bobs'), 'the settings inventory lists it');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
