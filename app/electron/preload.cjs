// Nov 16: the one thing Bob's own pages ask his window for directly: "open the pick-a-file window".
// Before, the page asked Bob's brain over the web (POST /api/own-models/pick). Chromium lets a page keep only 6
// connections to Bob at once, and Bob's live streams plus a few slow answers could fill them, so the request waited
// in the browser and the picker never opened ("Add a brain from a file" stayed greyed). This way skips that queue.
// Only a path the person picked comes back ('' for Cancel). Nothing else is exposed; a phone or a browser has no
// bobApp and keeps using the web request.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bobApp', {
  pick: (kind) => ipcRenderer.invoke('bob:pick', String(kind || 'gguf').slice(0, 20))
});
