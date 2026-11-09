// 1.5.53: "Bob's thinking", a small window that stays on top and shows what's going on in Bob's brain, live:
// which brain is working (on the graphics card or the processor), his thinking as it streams, moots, brain
// loads and swaps, every tool step and the notes he keeps. Opened from the chat page (💭 Bob's thinking).
// Light by design: Bob only passes his thinking along while a window like this is open (server.js mindClients),
// in small batches, and nothing here is saved. Closing the window stops all of it.
// 1.5.138: the drawing moved to public/mind-view.js, shared with the "Bob's thinking" section of Now running.
import { applySavedStyle } from './themes.js';
import { createMindView } from './mind-view.js';
applySavedStyle();

const $ = (id) => document.getElementById(id);
const view = createMindView({ log: $('mindLog'), now: $('mindNow'), brains: $('mindBrains'), follow: $('mindFollow'), clear: $('mindClear'), order: $('mindOrder') });
view.connect(); // new EventSource('/api/events?mind=1') in mind-view.js: only windows that ask get the thinking
