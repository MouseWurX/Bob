// "Guest chats" (Settings, How Bob works, 💬 Chat extras). Off unless turned on.
// 👤 Guest chat (beside New chat) starts a chat where nothing is saved and no memory is read or written:
//   - the chat isn't written to disk (no chat file, no summary, no topics, never in Past chats or search);
//   - Bob doesn't read his memory file, About me, notes from earlier talks, quick notes or pins, and can't remember,
//     note or save a how-to from it;
//   - the logbook says a guest chat happened, never what was said; a waiting guest job isn't kept over a restart.
// The chat lives only in Bob's working memory until you leave it (New chat, another chat) or Bob closes.
// Pictures, songs or files Bob makes in it are still saved where they always go: you asked for them.
export const guestOn = (cfg) => cfg?.guestChat === true;
export const GUEST_PREFIX = 'guest-';
export const isGuestId = (id) => typeof id === 'string' && id.startsWith(GUEST_PREFIX) && /^guest-[a-zA-Z0-9-]{1,60}$/.test(id);
// The tools that would keep something from a guest chat.
export const GUEST_BLOCKED = new Set(['remember', 'take_note', 'save_howto', 'forget_topic', 'notice_board']);
export const GUEST_NO_MEMORY = 'Not in a guest chat: nothing from it is remembered or noted. Tell the user to ask in an ordinary chat if they want it kept.';
export const GUEST_LOG = '(a guest chat; its words are not logged)';
