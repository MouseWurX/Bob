// How a download or install looks while it runs: step list, bar, MB and speed, time left,
// and a little Bob working away, so it never looks like nothing is happening.
import { motionOff } from './themes.js';
import { drawBob } from './bob-sprite.js';
import { esc } from './util.js';


export const STEP_LABEL = {
  finding: 'Finding the right build',
  starting: 'Getting ready',
  links: 'Checking the links and disk space',
  resuming: 'Picking up where it left off',
  downloading: 'Downloading',
  checking: 'Making sure nothing got damaged',
  unpacking: 'Unpacking',
  setup: 'Setting up',
  done: 'Ready'
};

export function size(b) {
  if (!b) return '0 MB';
  return b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : `${Math.round(b / 1e6)} MB`;
}
export function clock(s) {
  if (s == null) return '';
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

// What Bob's doing right now, in a short line.
export function summary(job) {
  const step = STEP_LABEL[job.phase] || job.phase;
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;
  return `${job.name}: ${step}${job.phase === 'downloading' && pct != null ? ` ${pct}%` : ''}`;
}

export function progressHtml(job, { cancel = true } = {}) {
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const moving = job.phase !== 'downloading' || !job.total; // no byte count: show a moving stripe instead
  const steps = (job.steps || ['starting', 'downloading', 'checking', 'done']);
  const at = Math.max(0, steps.indexOf(job.phase === 'resuming' ? 'downloading' : job.phase));
  const list = steps.map((s, i) => `<li class="${i < at ? 'did' : i === at ? 'now' : ''}">${i < at ? '✓' : i === at ? '●' : '○'} ${esc(STEP_LABEL[s] || s)}${i === at && job.phase === 'resuming' ? ' (resuming)' : ''}</li>`).join('');
  const file = job.file ? `${esc(job.file)}${job.fileCount > 1 ? ` (file ${job.fileIndex || 1} of ${job.fileCount})` : ''}` : '';
  const bytes = job.total ? `${size(job.done)} of ${size(job.total)}` : job.done ? size(job.done) : '';
  const speed = job.phase === 'downloading' && job.rate ? `${size(job.rate)}/s` : '';
  const left = job.eta != null ? `about ${clock(job.eta)} left` : '';
  const facts = [bytes, speed, left].filter(Boolean).join(' · ');
  return `<div class="dl" role="status" aria-live="polite">
    <div class="dl-top">
      <canvas class="dl-bob" width="40" height="40" aria-hidden="true"></canvas>
      <div class="dl-what"><strong>${esc(job.name)}</strong><span>${esc(STEP_LABEL[job.phase] || job.phase)}${file && (job.phase === 'downloading' || job.phase === 'setup') ? `: ${file}` : ''}</span>${job.detail ? `<span>${esc(job.detail)}</span>` : ''}</div>
      <span class="dl-pct">${moving ? '' : `${pct}%`}</span>
    </div>
    <div class="meter${moving ? ' moving' : ''}"><i style="width:${moving ? 100 : pct}%"></i></div>
    <div class="row"><span>${facts || '&nbsp;'}</span><span class="muted">${job.elapsed ? `running ${clock(job.elapsed)}` : ''}${job.queue?.length ? ` · ${job.queue.length} more after this` : ''}</span>${cancel ? `${job.kind === 'engine' ? '' : `<button data-pausedl="${esc(job.id)}" title="Keeps what has downloaded">Pause</button>`}<button data-cancel="${esc(job.id)}">Cancel</button>` : ''}</div>
    <ol class="dl-steps">${list}</ol>
  </div>`;
}

// One animation loop for every little working Bob on the page.
let running = false;
export function animateWorkers() {
  if (running) return;
  running = true;
  (function loop() {
    const t = Date.now();
    const still = motionOff(); // checked each frame, so the Style setting applies at once
    for (const c of document.querySelectorAll('canvas.dl-bob')) {
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const hop = still ? 0 : Math.round(Math.abs(Math.sin(t / 220)) * 3);
      ctx.clearRect(0, 0, 40, 40);
      ctx.save();
      ctx.translate(4, 4 - hop);
      drawBob(ctx, 32, { blink: Math.floor(t / 3000) % 5 === 0 && t % 3000 < 150, talk: !still && Math.floor(t / 180) % 2 === 0 });
      ctx.restore();
      // Little sparks off to the side, like he's busy with a soldering iron.
      if (!still && Math.floor(t / 120) % 3 === 0) {
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(34 + (t % 3), 26 - (t % 5), 2, 2);
        ctx.fillRect(36, 30 - (t % 4), 1, 1);
      }
    }
    requestAnimationFrame(loop);
  })();
}
