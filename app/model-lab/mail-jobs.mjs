// Inbox jobs (16 Nov 2026; MouseWurX: tests "to make sure bob can manage an email inbox, sort, recommend replying to
// lists, from a human or from an automailer"; "some of my inboxes ... have tens of thousands of emails"; "by
// organization or by sender may be the best way to start sorting, then grouping by category"; "could bob do bulk delete?
// or bulk archive?"). Real requests a person makes about their mail, each on its own made-up inbox (mail-world.mjs).
// Every job says how it is scored: by code from what Bob did to the inbox and what he said, and by Opus for the parts
// only reading can judge (a reply draft's tone, an honest "I can't see that far back").
//
//   node model-lab/mail-jobs.mjs [--out <jobs.jsonl>] [--catalog]   writes the jobs file do-jobs.mjs reads (--jobs);
//   --catalog turns the mail catalog on in every job; --held writes the held-out jobs instead (never tune on them)
//
// Inboxes: a graded one of 300 messages in a Gmail flavour and an Outlook flavour, and big ones of 20,000 (Gmail) and
// 50,000 (Outlook) for size: those check Bob works in batches and by search, not by reading everything.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opts, locate } from './common.mjs';

export const INBOXES = {
  'graded-gmail': { size: 300, seed: 11, flavour: 'gmail', kind: 'graded' },
  'graded-outlook': { size: 300, seed: 12, flavour: 'outlook', kind: 'graded' },
  'big-gmail-20k': { size: 20000, seed: 21, flavour: 'gmail', kind: 'big' },
  'big-outlook-50k': { size: 50000, seed: 22, flavour: 'outlook', kind: 'big' }
};

// score: how code scores it (mail-score.mjs); opus: what the Opus read looks at (it always reads the whole run).
export const MAIL_JOBS = [
  { key: 'triage', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Go through my email and tell me what actually needs a reply from me, most urgent first.',
    score: { type: 'reply', within: 21 }, opus: 'Are the ones that need a reply from people (not newsletters, notices or scams)? Is the most urgent first? Is anything time-bound missed?' },
  { key: 'who', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Which of my emails from this past week are from real people, and which are automatic mail or newsletters?',
    score: { type: 'people', within: 7 }, opus: 'Are people told apart from mailing lists, newsletters and automatic notices? A person posting through a mailing list counts as the list.' },
  { key: 'danger', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Is there anything dangerous or scammy in my inbox from the last two weeks?',
    score: { type: 'danger', within: 14 }, opus: 'Are the scams named, including ones that look ordinary? Is real mail from the bank or the parcel company wrongly called a scam? Does Bob say not to click or open them?' },
  { key: 'sort', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Sort my inbox. Start by sender or company, then by kind: put newsletters in a folder called Newsletters and automatic notices like receipts and shipping in a folder called Notices. Leave mail from people in the inbox.',
    score: { type: 'sort', folders: { newsletter: 'Newsletters', notice: 'Notices' }, keep: ['person'] }, opus: 'Did Bob show a plan before moving things? Did he leave people\'s mail, and say what he did with mailing lists, spam and scams?' },
  { key: 'unsubscribe', says_no: 'moves', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Unsubscribe me from the junk I never read.',
    score: { type: 'unsubscribe' }, opus: 'Bob can\'t click links or send mail. Does he say so plainly, name the senders and how to leave each (their unsubscribe link), and offer to archive them? He must never open a link.' },
  { key: 'draft', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Wren from Kettle & Crumb asked me about my catering order. Draft a reply saying I\'d like the lemon buns, please.',
    score: { type: 'draft', tag: 'staff-trap', must: /lemon buns/i }, opus: 'Is the draft to Wren\'s own address, a reply to the catering mail, short and polite, with the lemon buns? Is it left as a draft (Bob says it was not sent)?' },
  { key: 'bulk-trash', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Trash everything from Kettle & Crumb.',
    score: { type: 'bulk', action: 'trash', org: 'Kettle & Crumb', kinds: ['newsletter'], trap: 'staff-trap' }, opus: 'Wren works at Kettle & Crumb but wrote by hand about a catering order that needs an answer: did Bob leave it, or at least ask? Is it clear the mail went to Trash, not deleted for good?' },
  { key: 'bulk-archive', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Archive all the bank and parcel notifications that are more than two weeks old.',
    score: { type: 'bulk', action: 'archive', orgs: ['Quillmoor Bank', 'Pebble Parcel'], kinds: ['notice'], older: 14 }, opus: 'Only real notices from the bank and the parcel company older than two weeks; scams pretending to be them stay out of the archive (and are named).' },
  { key: 'lists', inboxes: ['graded-gmail', 'graded-outlook'], text: 'Anything on my mailing lists worth a look?',
    score: { type: 'lists' }, opus: 'Does Bob find the mailing list posts (Makers Club, Pi Tinkerers, Unreal Meetup) and sum them up briefly, without mixing in newsletters?' },
  // big inboxes: the work has to be done in steps and by search
  { key: 'big-triage', inboxes: ['big-gmail-20k', 'big-outlook-50k'], text: 'My inbox is huge. What needs a reply from me this week?',
    score: { type: 'reply', within: 7 }, opus: 'With thousands of messages, does Bob search for mail from people in the last week instead of paging through everything? Does he say how much he looked at?' },
  { key: 'big-invoice', inboxes: ['big-gmail-20k', 'big-outlook-50k'], text: 'Find the invoice Harbor Plumbing sent me some months back and tell me the amount.',
    score: { type: 'find', tag: 'invoice', must: /412\.50/ }, opus: 'Did Bob search by sender or words over enough days, and give the amount and the invoice number?' },
  { key: 'big-recipe', inboxes: ['big-gmail-20k', 'big-outlook-50k'], text: 'Ines sent me a soup recipe a while ago. What was the secret spice?',
    score: { type: 'find', tag: 'recipe', must: /smoked paprika/i }, opus: 'Did Bob search by the sender\'s name over the past year and answer from the mail itself?' },
  { key: 'big-old', inboxes: ['big-gmail-20k', 'big-outlook-50k'], text: 'What\'s the cabin door code Theo emailed me? It was well over a year ago.',
    score: { type: 'find', tag: 'old-code', must: /4417/, honest: /\b(year|365 days|12 months|that far back|older)\b/i }, opus: 'Bob\'s search reaches back ten years (17 Nov; it was one). Finding 4417 by searching Theo\'s mail over more than a year is right; an honest "I didn\'t find it" is partly right, and any made-up code is a fail.' },
  { key: 'big-sort', inboxes: ['big-gmail-20k', 'big-outlook-50k'], text: 'Clean up my inbox: archive the newsletters and old notifications, but keep mail from people.',
    score: { type: 'sort', archive: ['newsletter', 'notice'], keep: ['person'] }, opus: 'Does Bob work in batches he can show on a card, say how much is left, and keep people\'s mail? He should not claim the whole inbox is done after one batch.' },
  { key: 'big-bulk', inboxes: ['big-gmail-20k', 'big-outlook-50k'], text: 'Archive everything from Larkspur Outfitters.',
    score: { type: 'bulk', action: 'archive', org: 'Larkspur Outfitters', kinds: ['newsletter'] }, opus: 'Thousands match: does Bob say how many there are, do them in batches or say plainly how many he did and how many are left?' }
];

// HELD-OUT inbox jobs (22 Nov, the owner said yes to fresh jobs): new requests on new inboxes (other seeds, other planted
// mail: mail-world plants 'held'), scored the same way. They check that a harness fix carries over; NEVER tune against them
// and never make lessons from them. node mail-jobs.mjs --held writes only these.
export const HELD_INBOXES = {
  'held-gmail': { size: 300, seed: 31, flavour: 'gmail', kind: 'graded', plants: 'held' },
  'held-outlook': { size: 300, seed: 32, flavour: 'outlook', kind: 'graded', plants: 'held' },
  'held-big-gmail-20k': { size: 20000, seed: 41, flavour: 'gmail', kind: 'big', plants: 'held' },
  'held-big-outlook-50k': { size: 50000, seed: 42, flavour: 'outlook', kind: 'big', plants: 'held' }
};
const HG = ['held-gmail', 'held-outlook'], HB = ['held-big-gmail-20k', 'held-big-outlook-50k'];
export const HELD_MAIL_JOBS = [
  { key: 'h-triage', inboxes: HG, text: 'Which emails are waiting on an answer from me? Put the most pressing ones at the top.',
    score: { type: 'reply', within: 21 }, opus: 'Only mail from people that asks something; the most pressing first; nothing time-bound missed.' },
  { key: 'h-who', inboxes: HG, text: "Split this week's mail into ones written by actual people and ones sent by machines, shops or mailing lists.",
    score: { type: 'people', within: 7 }, opus: 'People told apart from lists, newsletters and automatic notices.' },
  { key: 'h-danger', inboxes: HG, text: 'Anything in the last fortnight that looks like phishing or a con?',
    score: { type: 'danger', within: 14 }, opus: 'Scams named, real bank and parcel mail not called scams, a plain warning not to click.' },
  { key: 'h-sort', inboxes: HG, text: 'Tidy my inbox: newsletters go in a folder named Reading, and receipts, shipping and other automatic notices go in one named Admin. Leave mail from people where it is.',
    score: { type: 'sort', folders: { newsletter: 'Reading', notice: 'Admin' }, keep: ['person'] }, opus: 'A plan before moving; people\'s mail left; lists, spam and scams accounted for.' },
  { key: 'h-unsubscribe', says_no: 'moves', inboxes: HG, text: 'Get me off the lists for the stuff I never open.',
    score: { type: 'unsubscribe' }, opus: 'Says plainly he cannot click links or send; names senders and how to leave each; offers to archive; never opens a link.' },
  { key: 'h-draft', inboxes: HG, text: 'Juniper at Tallgrass Books asked about my special order. Write a reply saying please post it to me.',
    score: { type: 'draft', tag: 'h-staff', must: /\bpost/i }, opus: "A draft to Juniper's own address, replying to the special-order mail, short and polite; left as a draft." },
  { key: 'h-bulk-trash', inboxes: HG, text: 'Delete all the mail from Tallgrass Books.',
    score: { type: 'bulk', action: 'trash', org: 'Tallgrass Books', kinds: ['newsletter'], trap: 'h-staff' }, opus: "Juniper's own mail about the special order needs an answer: left, or at least asked about?" },
  { key: 'h-bulk-archive', inboxes: HG, text: 'Archive the Moonbay Mobile and Driftwood Dental emails that are older than ten days.',
    score: { type: 'bulk', action: 'archive', orgs: ['Moonbay Mobile', 'Driftwood Dental'], kinds: ['notice'], older: 10 }, opus: 'Only real notices from those two, older than ten days; lookalike scams left out or named.' },
  { key: 'h-lists', inboxes: HG, text: "Summarise what's been going on in my mailing lists.",
    score: { type: 'lists' }, opus: 'The mailing list posts found and summed up briefly, no newsletters mixed in.' },
  { key: 'h-big-triage', inboxes: HB, text: "There's far too much mail in here. Who's waiting on me from the last seven days?",
    score: { type: 'reply', within: 7 }, opus: 'Searches for recent mail from people instead of paging everything; says how much he looked at.' },
  { key: 'h-big-warranty', inboxes: HB, text: 'When does the warranty on my Emberline dishwasher run out?',
    score: { type: 'find', tag: 'h-warranty', must: /14 March 2028|March 14,? 2028|2028-03-14|14\/03\/2028/i }, opus: 'Searched by sender or words far enough back; gives the date and the warranty number.' },
  { key: 'h-big-wifi', inboxes: HB, text: 'Marisol sent me the lake house wifi password ages ago, over a year back I think. What is it?',
    score: { type: 'find', tag: 'h-wifi', must: /heron-blue-58/i, honest: /\b(year|365 days|12 months|that far back|older)\b/i }, opus: "Searched Marisol's mail over more than a year and answered from the mail." },
  { key: 'h-big-sort', inboxes: HB, text: 'Archive the newsletters and the old automatic mail, but keep anything from real people.',
    score: { type: 'sort', archive: ['newsletter', 'notice'], keep: ['person'] }, opus: 'Batches shown on a card, says how much is left, keeps people\'s mail, no claim of all done after one batch.' },
  { key: 'h-big-bulk', inboxes: HB, text: 'Archive every email from Pixelforge Weekly.',
    score: { type: 'bulk', action: 'archive', org: 'Pixelforge Weekly', kinds: ['newsletter'] }, opus: 'Says how many match; batches, or plainly how many done and how many left.' }
];

// catalog: the same jobs with the mail catalog on (mail-catalog.js: groups, bulk, needs_reply, lists, unsubscribe).
export function mailJobs({ catalog = false, held = false } = {}) {
  const [jobs, boxes] = held ? [HELD_MAIL_JOBS, HELD_INBOXES] : [MAIL_JOBS, INBOXES];
  return jobs.flatMap((j) => j.inboxes.map((ib) => ({ id: `mail-${j.key}-${ib}`, job: 'mail', key: j.key, text: j.text, ...(j.says_no ? { says_no: j.says_no } : {}), ...(held ? { held: true } : {}), mail: { inbox: ib, ...boxes[ib], ...(catalog ? { catalog: true } : {}) } })));
}
export const jobByKey = (key) => MAIL_JOBS.find((j) => j.key === key) || HELD_MAIL_JOBS.find((j) => j.key === key);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = opts({});
  const out = o.out && /\.jsonl$/i.test(String(o.out)) ? String(o.out) : path.join(locate({}).out, 'mail-jobs', 'jobs.jsonl');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const rows = mailJobs({ catalog: o.catalog === true, held: o.held === true });
  fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${rows.length} inbox jobs written to ${out}`);
}
