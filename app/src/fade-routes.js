// Routes for "Fade old messages", "Clear chat" (src/fade-chat.js) and 🫥 Amnesia mode (src/amnesia.js).
//   GET  /api/fade?session=          the fade setting, how many messages of this chat are out of view, cleared at
//   POST /api/chat/clear { sessionId, forGood }   empty the chat on screen; forGood deletes it (this computer only).
//                                    sessionId may also come as id or session; none means the main chat.
//   GET  /api/amnesia                on or off, since when, and what turning it off would forget
//   POST /api/amnesia { on }         turn it on or off (this computer only)
// Reading works from a paired phone too, like the chat itself.
import { fadeOf, visibleHistory, clearedAt, clearChat } from './fade-chat.js';
import { amnesiaOffered, amnesiaCount, startAmnesia, endAmnesia, amnesiaDeleteMade } from './amnesia.js';
import { safeId } from './chats.js';
import { isGuestId } from './guest-chat.js';

export function fadeRoute(ctx) {
  const { req, res, p, url, isLocal, cfg, brain, body, send } = ctx;
  const POST = req.method === 'POST', GET = req.method === 'GET';
  const local = () => { if (isLocal) return true; send(res, 403, { error: 'Only on this replicant matrix itself.' }); return false; };
  const log = (t) => { try { brain.log('chat', t); } catch {} };
  const amnesiaView = () => ({ offered: amnesiaOffered(cfg), deleteMade: amnesiaDeleteMade(cfg), ...amnesiaCount(cfg, brain.made) });

  if (p === '/api/fade' && GET) {
    const id = safeId(url.searchParams.get('session') || 'main') || 'main';
    let faded = 0;
    try { if (!isGuestId(id)) faded = visibleHistory(cfg, id, brain.history(id)).faded; } catch {}
    return send(res, 200, { fade: fadeOf(cfg), faded, clearedAt: clearedAt(cfg, id), amnesia: amnesiaView() }), true;
  }
  if (p === '/api/chat/clear' && POST) {
    return (async () => {
      const b = await body(req).catch(() => ({}));
      // The chat to clear, by its id (as the chat window sends it: sessionId). id and session are taken too; nothing named is the main chat.
      const id = safeId(b.sessionId || b.id || b.session || 'main');
      const forGood = b.forGood === true;
      if (forGood && !local()) return true;
      if (forGood && !(b.sessionId || b.id || b.session)) { send(res, 400, { error: 'Delete it for good needs the chat named: send { "sessionId": "main", "forGood": true }.' }); return true; } // never delete a chat by default
      if (isGuestId(id)) { send(res, 400, { error: 'A guest chat isn\'t saved. Start a new one instead.' }); return true; }
      const r = clearChat(cfg, brain, id, { forGood });
      if (r.error) { send(res, 409, r); return true; }
      log(forGood ? `chat ${id}: deleted for good (Clear chat, your click)` : `chat ${id}: cleared from view (Clear chat, your click)`);
      try { brain.broadcast?.({ type: 'chat-cleared', sessionId: id }); } catch {}
      send(res, 200, r);
      return true;
    })();
  }
  if (p === '/api/amnesia' && GET) return send(res, 200, amnesiaView()), true;
  if (p === '/api/amnesia' && POST) {
    return (async () => {
      if (!local()) return true;
      const b = await body(req).catch(() => ({}));
      if (b.on === true) {
        if (!amnesiaOffered(cfg)) { send(res, 409, { error: 'Amnesia mode is off in Settings. Turn on "Amnesia mode" in How Bob works, Chat extras.' }); return true; }
        try { startAmnesia(cfg); } catch (e) { send(res, 500, { error: `Amnesia mode didn't start: ${e.message}` }); return true; }
        log('Amnesia mode on (your click)');
      } else if (b.on === false) {
        const deleteMade = typeof b.deleteMade === 'boolean' ? b.deleteMade : amnesiaDeleteMade(cfg);
        let r;
        try { r = endAmnesia(cfg, { brain, made: brain.made, deleteMade }); } catch (e) { r = { error: `Amnesia mode didn't turn off: ${e.message}` }; }
        if (r.error) { send(res, 409, r); return true; }
        log('Amnesia mode off: that stretch is forgotten (your click)'); // the logbook was put back first, so this is all it says
        try { brain.broadcast?.({ type: 'amnesia-off' }); } catch {}
        send(res, 200, { ...amnesiaView(), forgot: r.forgot }); return true;
      } else { send(res, 400, { error: 'On or off?' }); return true; }
      try { brain.broadcast?.({ type: 'amnesia-on' }); } catch {}
      send(res, 200, amnesiaView());
      return true;
    })();
  }
  return false;
}
