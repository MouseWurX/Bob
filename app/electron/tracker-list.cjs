// Private web: the known trackers and ad servers Bob's browser window blocks (browser-window.cjs). A small built-in
// list, kept in Bob's own files and updated with releases; no list is downloaded while browsing. A site is blocked
// with every address under it (ads.example.com is blocked when example.com is on the list).
const TRACKERS = [
  // ads and ad exchanges
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'criteo.com', 'criteo.net', 'casalemedia.com',
  'taboola.com', 'outbrain.com', 'amazon-adsystem.com', 'advertising.com', 'smartadserver.com', 'teads.tv', 'moatads.com',
  'adform.net', 'bidswitch.net', 'media.net', 'sharethrough.com', 'yieldmo.com', '33across.com', 'indexww.com', 'quantserve.com',
  'scorecardresearch.com', 'zedo.com', 'revcontent.com', 'mgid.com', 'adroll.com', 'demdex.net', 'everesttech.net',
  // analytics and tracking
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com', 'analytics.google.com', 'stats.g.doubleclick.net',
  'connect.facebook.net', 'facebook.com/tr', 'pixel.facebook.com', 'analytics.twitter.com', 'ads-twitter.com', 'static.ads-twitter.com',
  'bat.bing.com', 'clarity.ms', 'hotjar.com', 'hotjar.io', 'mouseflow.com', 'fullstory.com', 'crazyegg.com', 'luckyorange.com',
  'mixpanel.com', 'segment.io', 'segment.com', 'amplitude.com', 'heap.io', 'heapanalytics.com', 'newrelic.com', 'nr-data.net',
  'chartbeat.com', 'chartbeat.net', 'parsely.com', 'omtrdc.net', '2o7.net', 'krxd.net', 'bluekai.com', 'exelator.com',
  'tapad.com', 'rlcdn.com', 'agkn.com', 'mathtag.com', 'crwdcntrl.net', 'adsymptotic.com', 'tiktok-analytics.com',
  'analytics.tiktok.com', 'ads.linkedin.com', 'px.ads.linkedin.com', 'snap.licdn.com', 'sc-static.net', 'tr.snapchat.com',
  'ct.pinterest.com', 'quora.com/_/ad', 'yandex.ru/metrika', 'mc.yandex.ru', 'hs-analytics.net', 'hs-scripts.com',
  'optimizely.com', 'cdn.optimizely.com', 'branch.io', 'app.link', 'adjust.com', 'appsflyer.com', 'kochava.com', 'onesignal.com'
];
const HOSTS = new Set(TRACKERS.filter((t) => !t.includes('/')));
const PATHS = TRACKERS.filter((t) => t.includes('/'));

// The site a host belongs to, near enough for cookies: the last two labels, or three under a two-letter country
// code with a short second label (news.bbc.co.uk -> bbc.co.uk).
function siteKey(host) {
  const h = String(host || '').toLowerCase().replace(/^\.+|\.+$/g, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return h;
  const p = h.split('.');
  if (p.length <= 2) return h;
  const cc = p[p.length - 1].length === 2 && p[p.length - 2].length <= 3;
  return p.slice(cc ? -3 : -2).join('.');
}

function isTracker(url) {
  let u; try { u = new URL(url); } catch { return false; }
  const h = u.hostname.toLowerCase();
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (HOSTS.has(parts.slice(i).join('.'))) return true;
  const hp = h + u.pathname;
  return PATHS.some((t) => hp === t || hp.startsWith(t + '/') || hp.endsWith('.' + t) || hp.includes('.' + t + '/'));
}

module.exports = { TRACKERS, isTracker, siteKey };
