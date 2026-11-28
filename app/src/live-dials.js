// Live dials (Settings, Engine tuning, under "Let the Conductor drive"; both off unless ticked): settings that used to
// be fixed when a brain loads, changed with the brain still loaded, through Lamplight's POST /context.
// Lamplight 0151 adds flash attention, where the chat memory lives (-nkvo), the picture reader and the guesser to the
// switch; 0152 moves whole layers between the card and RAM. Two of them are used by Bob here:
// - Picture reader on demand (engineTuning.readerOnDemand): the picture reader (--mmproj) leaves the card while a
//   chat has no pictures, and comes back before a reply that has one. Its room goes to the layers below or the cache.
// - Layers back on the card (engineTuning.liveLayers): at the chat step, layers that loaded into RAM go onto the card
//   while the card has room for them, and all of them go home (a pointer change, no copy) before any switch that
//   needs room, such as a bigger reading step or the picture reader coming back.
// Unproven on a real card (Nov 27): both stay off, and out of Turbo, until a real-card test shows a gain.

export const LIVE_DIALS_FROM_BE = 47; // Lamplight 47 = patches 0151 and 0152
export const LAYER_KEEP_MIB = 1536; // left free on the card after layers move up: the 512 MiB margin plus working room
export const LAYERS_MIN_MIB = 256; // a move smaller than this isn't worth a switch

export const readerOnDemandOn = (cfg) => cfg?.engineTuning?.readerOnDemand === true;
export const liveLayersOn = (cfg) => cfg?.engineTuning?.liveLayers === true;
export const liveDialsFit = (beNo = 0) => Number(beNo) >= LIVE_DIALS_FROM_BE;

// does this request carry a picture? Bob's own messages keep them in m.images; OpenAI-style parts use image_url
export function wantsPictures(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((m) =>
    (Array.isArray(m?.images) && m.images.length > 0) ||
    (Array.isArray(m?.content) && m.content.some((p) => p?.type === 'image_url' || p?.type === 'input_image')));
}

// the reader switch to make, or null: { picture_reader: true | false }
export function readerChange({ loadedWith = false, readerIn = true, pictures = false } = {}) {
  if (!loadedWith) return null;
  if (pictures && !readerIn) return { picture_reader: true };
  if (!pictures && readerIn) return { picture_reader: false };
  return null;
}

// which layers to put on the card: the ones already there, plus RAM layers from the top down (the layers nearest the
// ones already on the card) while they fit in free - keep. inRam: [{ layer, mib }] from the engine's answer.
export function pickCardLayers({ inRam = [], onCard = [], freeMiB = null, keepMiB = LAYER_KEEP_MIB } = {}) {
  const now = (Array.isArray(onCard) ? onCard : []).map((x) => (typeof x === 'number' ? x : x?.layer)).filter(Number.isInteger);
  if (!Number.isFinite(freeMiB)) return null;
  let room = freeMiB - keepMiB;
  const add = [];
  const rows = (Array.isArray(inRam) ? inRam : []).filter((r) => Number.isInteger(r?.layer) && r.mib > 0 && !now.includes(r.layer)).sort((a, b) => b.layer - a.layer);
  for (const r of rows) {
    if (r.mib > room) break; // in order: a gap would leave the RAM layers split in two
    add.push(r.layer); room -= r.mib;
  }
  const mib = rows.filter((r) => add.includes(r.layer)).reduce((s, r) => s + r.mib, 0);
  if (!add.length || mib < LAYERS_MIN_MIB) return null;
  return { layers: [...now, ...add].sort((a, b) => a - b), mib };
}

// a POST /context body for the live dials, checked; throws on a bad value
export function liveDialsBody({ flashAttn, kvOnCard, reader, guesser, cardLayers, device } = {}) {
  const b = {};
  if (flashAttn !== undefined) { if (!['on', 'off', 'auto'].includes(flashAttn)) throw new Error('flashAttn must be on, off or auto'); b.flash_attn = flashAttn; }
  if (kvOnCard !== undefined) b.kv_on_card = kvOnCard === true;
  if (reader !== undefined) b.picture_reader = reader === true;
  if (guesser !== undefined) b.guesser = guesser === true;
  if (cardLayers !== undefined) {
    if (!Array.isArray(cardLayers) || cardLayers.some((l) => !Number.isInteger(l) || l < 0)) throw new Error('cardLayers must be layer numbers');
    b.card_layers = { layers: [...new Set(cardLayers)], ...(device ? { device: String(device) } : {}) };
  }
  return b;
}

// the layers on the card from an answer (card_layers: [{ layer, device }])
export const cardLayersFrom = (answer) => (Array.isArray(answer?.card_layers) ? answer.card_layers.map((x) => x?.layer).filter(Number.isInteger) : []);
