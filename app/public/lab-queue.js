// The Lab's job queue (Nov 11): challenges, size ladders and fNRI scans lined up to run one after another, for
// overnight. Shown under Lab jobs on every page. Pages add to it with the same request their Start button sends.
import { esc } from './rich.js';

const STATE = { waiting: 'waiting', running: 'running now', done: 'done', failed: 'didn\'t finish' };

// The "Add to the queue" button a page puts beside its own Start button.
export const queueBtn = (kind, ok = true) => `<button type="button" class="link" data-qadd="${esc(kind)}" ${ok ? '' : 'disabled'}>Add to the queue</button>`;

export function queueHtml(q) {
  const items = q?.items || [];
  if (!items.length) return '';
  const waiting = items.filter((x) => x.state === 'waiting');
  const row = (x) => `<li><strong>${esc(x.label)}</strong> <span class="muted">· ${esc(STATE[x.state] || x.state)}${x.idle ? ' · waits until Bob is quiet' : ''}</span>${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}
    ${x.state === 'waiting' ? `<span class="row"><button type="button" class="mini" data-qmove="${esc(x.id)}" data-qby="-1" aria-label="Move ${esc(x.label)} up" ${waiting[0]?.id === x.id ? 'disabled' : ''}>↑</button><button type="button" class="mini" data-qmove="${esc(x.id)}" data-qby="1" aria-label="Move ${esc(x.label)} down" ${waiting.at(-1)?.id === x.id ? 'disabled' : ''}>↓</button><button type="button" class="link" data-qremove="${esc(x.id)}">Remove</button></span>` : ''}</li>`;
  return `<section class="lab-queue" aria-labelledby="lab-queue-h"><h3 id="lab-queue-h">Queue <span class="muted">${waiting.length} waiting</span></h3>
    <p class="muted">Runs one job after another while you're away. Each starts when the Lab is free and nobody is chatting, and unloads Bob's brain first.${q.paused ? ' <strong>Paused.</strong>' : ''}</p>
    <ol class="tlist">${items.map(row).join('')}</ol>
    <div class="row"><button type="button" class="link" data-qpause="${q.paused ? 'off' : 'on'}">${q.paused ? 'Carry on' : 'Pause the queue'}</button>${items.some((x) => x.state === 'done' || x.state === 'failed') ? '<button type="button" class="link" data-qclear>Clear finished</button>' : ''}</div></section>`;
}

// A press on the queue's own buttons. Returns the new queue, or null when the press wasn't one of them.
export async function queueClick(b, api) {
  const d = b.dataset;
  if (d.qremove) return (await api('/api/lab/queue', { remove: d.qremove })).queue;
  if (d.qmove) return (await api('/api/lab/queue', { move: d.qmove, by: Number(d.qby) })).queue;
  if (d.qpause) return (await api('/api/lab/queue', { pause: d.qpause === 'on' })).queue;
  if ('qclear' in d) return (await api('/api/lab/queue', { clear: true })).queue;
  return null;
}

// Adding: the page's own request, a label for the list.
export async function queueAdd(api, kind, body, label) { return (await api('/api/lab/queue', { add: { kind, body, label } })).queue; }
