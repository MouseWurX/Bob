// 17 Nov after1 (14 of 94 mail runs): asks about mail that never say "email" didn't add the mail tools, so Bob searched
// the PC's folders. The mail group's words now catch them (the group still only exists while the mail switch is on).
import { GROUP_WORDS } from '../src/more-tools.js';
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log(`ok   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
const w = GROUP_WORDS.mail;
for (const t of ['Trash everything from Kettle & Crumb.', 'Archive everything from Larkspur Outfitters.', 'Archive all the bank and parcel notifications that are more than two weeks old.',
  "What's the cabin door code Theo emailed me?", 'Ines sent me a soup recipe a while ago. What was the secret spice?', 'Unsubscribe me from the junk I never read.',
  "Wren asked me about my catering order. Draft a reply saying I'd like the lemon buns, please.", 'Find the invoice Harbor Plumbing sent me some months back.', 'Anything on my mailing lists worth a look?'])
  check(`mail tools for: ${t}`, w.test(t));
for (const t of ['rename my holiday photos by date', 'how does GPS work?', 'zip the Backup folder', 'write a Python script that renames .jpg files'])
  check(`no mail tools for: ${t}`, !w.test(t));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
