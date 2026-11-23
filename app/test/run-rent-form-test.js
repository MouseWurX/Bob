// Nov 17: Settings, Online services, Add a rental showed "Another service"'s Web address and Key variable boxes (and
// the card boxes) on first open, whatever service was shown, until the Service menu was changed. The boxes now match
// the first service from the start, like the change handler in public/cellar.js does.
import { createSettingsParts } from '../public/cellar-pages.js';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const svc = { runpod: { id: 'runpod', name: 'RunPod', kind: 'machine', enabled: true }, openrouter: { id: 'openrouter', name: 'OpenRouter', kind: 'answer', enabled: true }, other: { id: 'other', name: 'Another service', kind: 'answer', enabled: true } };
const html = (services) => {
  const state = { rent: { services, cards: [{ id: '48', name: 'L40S', perHour: 1, say: 'fits most' }], cardCounts: [1, 2] }, settings: {}, data: { models: [] }, eqCtx: () => 0, naughtyOn: () => false, srow: (a, b) => b, sswitch: () => '', more: () => '', panel: () => '', hw: {}, rentPickOpen: false };
  return createSettingsParts(() => state).rentHtml().replace(/\r\n/g, '\n');
};
const shown = (h, cls) => new RegExp(`class="pick ${cls}">`).test(h);
const hidden = (h, cls) => new RegExp(`class="pick ${cls}" hidden>`).test(h);

let h = html([svc.runpod, svc.other]);
check('RunPod first: no Web address or Key variable boxes', (h.match(/rent-other" hidden>/g) || []).length === 2);
check('RunPod first: card size and card count show', shown(h, 'rent-card-pick') && shown(h, 'rent-cards-pick'));

h = html([svc.openrouter, svc.other]);
check('a pay-per-answer service first: no card boxes and no Another service boxes', hidden(h, 'rent-card-pick') && hidden(h, 'rent-cards-pick') && hidden(h, 'rent-other'));

h = html([{ ...svc.runpod, enabled: false }, svc.other]);
check('Another service first (the others switched off): its boxes show', shown(h, 'rent-other') && hidden(h, 'rent-card-pick'));

h = html([]);
check('no service: nothing extra shows', hidden(h, 'rent-other') && hidden(h, 'rent-card-pick') && hidden(h, 'rent-cards-pick'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
