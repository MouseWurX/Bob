// Nov 17: Settings, Online services, Add a rental showed "Another service"'s Web address and Key variable boxes (and
// the card boxes) on first open, whatever service was shown. Nov 18 the form became Add a rented brain, card by card
// (public/cellar-pages.js draftHtml): no service is picked at first, so none of those boxes may show until one is, and
// the card boxes sit on card 3, which shows only once a brain is picked (public/cellar.js rentStep).
import { createSettingsParts } from '../public/cellar-pages.js';

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const svc = { runpod: { id: 'runpod', name: 'RunPod', kind: 'machine', enabled: true }, openrouter: { id: 'openrouter', name: 'OpenRouter', kind: 'answer', enabled: true }, other: { id: 'other', name: 'Another service', kind: 'answer', enabled: true } };
const html = (services, open = true) => {
  const state = { rent: { services, cards: [{ id: '48', name: 'L40S', perHour: 1, say: 'fits most' }], cardCounts: [1, 2] }, settings: {}, data: { models: [] }, eqCtx: () => 0, naughtyOn: () => false, srow: (a, b) => b, sswitch: () => '', more: () => '', panel: () => '', hw: {}, rentPickOpen: open };
  return createSettingsParts(() => state).rentHtml().replace(/\r\n/g, '\n');
};
const stepHidden = (h, k) => new RegExp(`data-rentstep="${k}" hidden>`).test(h);

let h = html([svc.runpod, svc.other]);
check('RunPod on: no Web address or Key variable boxes at first', (h.match(/rent-other" hidden>/g) || []).length === 2);
check('the card boxes wait on card 3 until a brain is picked', stepHidden(h, 'card') && /class="pick rent-cards-pick" hidden>/.test(h));

h = html([svc.openrouter, svc.other]);
check('a pay-per-answer service on: no Another service boxes at first', (h.match(/rent-other" hidden>/g) || []).length === 2 && stepHidden(h, 'card'));

h = html([{ ...svc.runpod, enabled: false }, svc.other]);
check('a service that is off can\'t be picked', /<option value="runpod" disabled>/.test(h));

h = html([]);
check('no service on: card 1 says to switch one on, nothing else shows', /Switch on a service above first/.test(h) && stepHidden(h, 'brain') && stepHidden(h, 'card'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
