// Bob's Apps hand helper for a Mac (a trial: off until you switch the Apps hand on, see src/hands-apps.js).
// UNPROVEN IN OUR LAB, AS WE HAVE YET TO TEST IT: we have no Mac. Written against Apple's JavaScript for Automation
// (JXA) and System Events, and run as: /usr/bin/osascript -l JavaScript bob-apps-mac.js <BobPid> <BobParent>
//
// The same JSON-lines protocol as installer/bob-apps.ps1 on Windows: Bob writes {"id":..,"op":..} on stdin, it
// answers {"id":..,"ok":true,...} on stdout.
//   hello                      -> version, trusted (Accessibility allowed), what works here
//   windows                    -> on-screen app windows: hwnd (the window number), title, process, pid
//   apps                       -> apps in /Applications, /System/Applications (and Utilities), ~/Applications
//   open    appId              -> opens that app (its path), as you
//   look    hwnd, max          -> its controls through macOS Accessibility: type, name, id, enabled, value
//                                 (never the value of a password field)
//   picture hwnd, file         -> a PNG of that window (screencapture; needs Screen Recording for Bob)
//   drive   on                 -> shows / hides the red "Bob is driving" bar and watches for you taking over
//   resolve hwnd, action, target{type,name,id,nth} -> label: what the action would really land on (for the card)
//   act     hwnd, action, target, text, keys, expect -> click / type / keys / focus, only while driving
//   clickat hwnd x y           -> a real click at that place in the window (picture pixels), only while driving
//   quit
// While driving, moving the mouse or pressing Esc stops at once and it writes {"event":"stopped","why":...}.
// Ctrl in Bob's keys means Command here (Ctrl+S saves on Windows and Linux; Command+S does on a Mac).
//
// macOS asks once: System Settings, Privacy & Security, Accessibility (and Screen Recording for pictures), with Bob
// in the list. Never touches terminals, admin tools, Keychain Access or other password managers, password fields,
// sign-in or security prompts, or Bob's own windows.

var VERSION = 1;

// ---- Parts that need no Mac (app/test/run-apps-unix-test.js runs them in Node) ----

var AX_TYPES = {
  AXButton: 'Button', AXMenuButton: 'Button', AXDisclosureTriangle: 'Button', AXTextField: 'Edit', AXSecureTextField: 'Edit',
  AXSearchField: 'Edit', AXComboBox: 'ComboBox', AXPopUpButton: 'ComboBox', AXTextArea: 'Document', AXWebArea: 'Document',
  AXStaticText: 'Text', AXHeading: 'Text', AXCheckBox: 'CheckBox', AXRadioButton: 'RadioButton', AXMenuBarItem: 'MenuItem',
  AXMenuItem: 'MenuItem', AXMenu: 'Menu', AXMenuBar: 'MenuBar', AXLink: 'Hyperlink', AXTabGroup: 'Tab',
  AXRadioGroup: 'Group', AXGroup: 'Group', AXScrollArea: 'Pane', AXSplitGroup: 'Pane', AXLayoutArea: 'Pane',
  AXToolbar: 'ToolBar', AXList: 'List', AXOutline: 'Tree', AXTable: 'Table', AXBrowser: 'Tree', AXRow: 'DataItem',
  AXCell: 'DataItem', AXColumn: 'HeaderItem', AXSlider: 'Slider', AXIncrementor: 'Spinner', AXStepper: 'Spinner',
  AXImage: 'Image', AXWindow: 'Window', AXSheet: 'Window', AXDrawer: 'Pane', AXProgressIndicator: 'ProgressBar',
  AXBusyIndicator: 'ProgressBar', AXValueIndicator: 'Slider', AXScrollBar: 'ScrollBar', AXSplitter: 'Separator',
  AXColorWell: 'Button', AXDateField: 'Edit', AXLevelIndicator: 'Slider', AXRuler: 'Pane', AXHelpTag: 'ToolTip'
};
function typeFor(role, subrole) {
  if (subrole === 'AXSecureTextField') return 'Edit';
  if (subrole === 'AXSearchField') return 'Edit';
  if (subrole === 'AXTabButton') return 'TabItem';
  return AX_TYPES[role] || String(role || 'AXUnknown').replace(/^AX/, '') || 'Unknown';
}
function isPasswordRole(role, subrole) { return role === 'AXSecureTextField' || subrole === 'AXSecureTextField'; }

// Bob's SendKeys form (src/hands-apps.js keysFor): ^ ctrl (Command here), + shift, % alt (Option), {ENTER}, a letter.
var KEYCODES = { enter: 36, tab: 48, esc: 53, up: 126, down: 125, left: 123, right: 124, home: 115, end: 119, pageup: 116, pagedown: 121, backspace: 51, delete: 117, space: 49,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111 };
var SENDKEYS = { ENTER: 'enter', TAB: 'tab', ESC: 'esc', UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right', HOME: 'home', END: 'end', PGUP: 'pageup', PGDN: 'pagedown', BACKSPACE: 'backspace', DELETE: 'delete' };
for (var fi = 1; fi <= 12; fi++) SENDKEYS['F' + fi] = 'f' + fi;
function parseKeys(s) {
  s = String(s || '');
  var mods = [];
  while (s.length > 1 && '^+%'.indexOf(s[0]) >= 0) { mods.push({ '^': 'command', '+': 'shift', '%': 'option' }[s[0]]); s = s.slice(1); }
  var key, m = /^\{([A-Z0-9]+)\}$/.exec(s);
  if (m) { key = SENDKEYS[m[1]]; if (!key) throw new Error('Bob does not press {' + m[1] + '}.'); }
  else if (s === ' ') key = 'space';
  else if (/^[a-z0-9]$/.test(s)) key = s;
  else throw new Error('Bob does not press "' + s + '".');
  if (mods.indexOf('command') >= 0 && mods.indexOf('option') >= 0) throw new Error('Bob never presses Ctrl+Alt combinations.');
  return { mods: mods, key: key, code: KEYCODES[key] === undefined ? null : KEYCODES[key] };
}

var BLOCKED = ['terminal', 'iterm2', 'warp', 'ghostty', 'alacritty', 'kitty', 'wezterm', 'wezterm-gui', 'script editor', 'automator', 'osascript',
  'activity monitor', 'disk utility', 'system settings', 'system preferences', 'console', 'directory utility', 'keychain access', 'passwords',
  'securityagent', 'coreservicesuiagent', 'loginwindow', 'universalaccessauthwarn', '1password', '1password 7', 'bitwarden', 'keepassxc', 'enpass',
  'dashlane', 'lastpass', 'nordpass', 'proton pass', 'bob', 'electron'];
var BLOCKED_TITLE = /\b(password|passphrase|credential|keychain|filevault|recovery key|2fa|two[- ]factor|one[- ]time code|authenticate)\b/i;
function blockedWhy(proc, title, pid, own) {
  var p = String(proc || '').toLowerCase();
  if (own.indexOf(Number(pid)) >= 0) return "That's Bob's own window. Bob never clicks his own buttons.";
  if (BLOCKED.indexOf(p) >= 0) return proc + ' is off limits to the Apps hand.';
  if (BLOCKED_TITLE.test(String(title || ''))) return 'That window looks like a password or security prompt, so Bob leaves it to you.';
  return '';
}
function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function labelOf(type, name, id) { return type + (name ? ' "' + name + '"' : '') + (id ? ' [id ' + id + ']' : ''); }
function describe(type, name, id) { return [type, name ? '"' + name + '"' : '', id ? '[id ' + id + ']' : ''].filter(Boolean).join(' ') || 'that'; }
function sameBounds(a, b) { return Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2; }

// ---- The Mac ----

function run(argv) {
  ObjC.import('Cocoa');
  ObjC.import('CoreGraphics');
  ObjC.import('ApplicationServices');
  ObjC.import('stdlib');
  var SE = Application('System Events');
  var me = Application.currentApplication();
  me.includeStandardAdditions = true;
  var own = (argv || []).map(Number).filter(function (n) { return n > 0; });
  own.push(Number($.NSProcessInfo.processInfo.processIdentifier));
  var state = { driving: false, stopped: false, base: null, quietUntil: 0, bar: null, swapped: '' };

  var out = $.NSFileHandle.fileHandleWithStandardOutput;
  function emit(m) { out.writeData($(JSON.stringify(m) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
  function now() { return Date.now(); }
  function sleep(s) { $.NSThread.sleepForTimeInterval(s); }
  function trusted() { try { return Boolean($.AXIsProcessTrusted()); } catch (e) { return false; } }
  function needTrust() {
    if (!trusted()) throw new Error('macOS has not allowed Bob to use other apps yet. Open System Settings, Privacy & Security, Accessibility, switch Bob on (add him with + if he is not listed), then ask again.');
  }

  // -- windows: the window server's list (numbers stay the same while a window lives), matched to Accessibility --
  function cgWindows() {
    var ref = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID);
    var list = ObjC.deepUnwrap(ObjC.castRefToObject(ref)) || [];
    return list.filter(function (w) { return w.kCGWindowLayer === 0; }).map(function (w) {
      var b = w.kCGWindowBounds || {};
      return { hwnd: w.kCGWindowNumber, pid: w.kCGWindowOwnerPID, process: w.kCGWindowOwnerName || '', cgTitle: w.kCGWindowName || '', bounds: { x: b.X, y: b.Y, w: b.Width, h: b.Height } };
    });
  }
  function procOf(pid) { var p = SE.processes.whose({ unixId: Number(pid) }); return p.length ? p[0] : null; }
  function axWindows(pid) {
    var p = procOf(pid); if (!p) return [];
    var ws = p.windows(), names = p.windows.name(), pos = p.windows.position(), size = p.windows.size();
    return ws.map(function (w, i) { return { el: w, title: cleanName(names[i]), bounds: { x: pos[i][0], y: pos[i][1], w: size[i][0], h: size[i][1] } }; });
  }
  function axWindowFor(cg) {
    var ax = axWindows(cg.pid);
    for (var i = 0; i < ax.length; i++) if (sameBounds(ax[i].bounds, cg.bounds)) return ax[i];
    for (var j = 0; j < ax.length; j++) if (cg.cgTitle && ax[j].title === cleanName(cg.cgTitle)) return ax[j];
    return null;
  }
  function listWindows() {
    needTrust();
    var res = [], axCache = {};
    cgWindows().forEach(function (w) {
      if (own.indexOf(Number(w.pid)) >= 0) return;
      var title = cleanName(w.cgTitle);
      if (!title) {
        // Without Screen Recording the window server hides titles: Accessibility has them.
        if (!axCache[w.pid]) { try { axCache[w.pid] = axWindows(w.pid); } catch (e) { axCache[w.pid] = []; } }
        var hit = axCache[w.pid].filter(function (a) { return sameBounds(a.bounds, w.bounds); })[0];
        title = hit ? hit.title : '';
      }
      if (title) res.push({ hwnd: w.hwnd, title: title, process: w.process, pid: w.pid });
    });
    return res;
  }
  function window(hwnd) {
    needTrust();
    var cg = cgWindows().filter(function (w) { return String(w.hwnd) === String(hwnd); })[0];
    if (!cg) throw new Error('That window has closed.');
    var ax = axWindowFor(cg);
    if (!ax) throw new Error("Bob can't read that window through macOS Accessibility.");
    var why = blockedWhy(cg.process, ax.title, cg.pid, own);
    if (why) throw new Error(why);
    return { cg: cg, ax: ax.el, title: ax.title };
  }

  // -- reading a window: one level at a time, asking for each property of all children at once --
  function kidsOf(el) {
    var k = el.uiElements;
    var els = k(); if (!els.length) return [];
    function many(f) { try { return f(); } catch (e) { return els.map(function () { return null; }); } }
    var roles = many(function () { return k.role(); }), subs = many(function () { return k.subrole(); });
    var titles = many(function () { return k.title(); }), descs = many(function () { return k.description(); }), rds = many(function () { return k.roleDescription(); });
    var enabled = many(function () { return k.enabled(); });
    return els.map(function (e, i) {
      var desc = cleanName(descs[i]), name = cleanName(titles[i]);
      if (!name && desc && desc !== cleanName(rds[i])) name = desc; // a toolbar button often has only a description
      return { el: e, role: roles[i], subrole: subs[i], type: typeFor(roles[i], subs[i]), name: name, id: '', enabled: enabled[i] !== false, password: isPasswordRole(roles[i], subs[i]) };
    });
  }
  function walk(root, limit, visit) {
    var todo = [{ n: { el: root }, d: 0 }], seen = 0;
    while (todo.length && seen < limit) {
      var t = todo.pop(); seen++;
      if (t.d > 0 && visit(t.n, t.d) === false) return;
      if (t.d >= 12) continue;
      var kids; try { kids = kidsOf(t.n.el); } catch (e) { kids = []; }
      for (var i = kids.length - 1; i >= 0; i--) todo.push({ n: kids[i], d: t.d + 1 });
    }
  }
  function typable(n) { return (n.type === 'Edit' || n.type === 'Document') && n.enabled && !n.password; }
  function valueOf(n) { try { var v = n.el.value(); return v == null ? null : String(v); } catch (e) { return null; } }
  function look(hwnd, max) {
    var w = window(hwnd), outList = [];
    walk(w.ax, 3000, function (n) {
      if (outList.length >= max) return false;
      var item = { type: n.type, name: n.name, id: n.id, enabled: n.enabled, password: n.password };
      if (typable(n)) item.typable = true;
      if (!n.password && /^(Edit|Document|CheckBox|RadioButton|ComboBox|Slider)$/.test(n.type)) { var v = valueOf(n); if (v) item.value = v.slice(0, 80); }
      if (n.name || n.type === 'Edit' || n.type === 'Document') outList.push(item);
    });
    return outList;
  }
  function find(w, type, name, id, nth, forTyping) {
    state.swapped = '';
    type = String(type || '').toLowerCase(); name = cleanName(name).toLowerCase();
    if (!type && !name && !id) return forTyping ? textArea(w.ax) : { el: w.ax, type: 'Window', name: w.title, id: '', enabled: true, password: false };
    var hits = [];
    walk(w.ax, 6000, function (n) {
      if (type && n.type.toLowerCase() !== type) return;
      if (name && n.name.toLowerCase() !== name) return;
      if (id) return; // macOS Accessibility ids are not read (see look)
      hits.push(n);
    });
    if (!hits.length) throw new Error("Bob couldn't find " + describe(type, name, id) + ' in that window. It may have changed; look at it again.');
    if (forTyping) { var k = hits.filter(typable); if (k.length) hits = k; }
    var i = Math.max(1, Number(nth) || 1) - 1;
    if (i >= hits.length) throw new Error('There are only ' + hits.length + ' of those in that window.');
    var e = hits[i];
    if (!forTyping || typable(e)) return e;
    var t = textArea(e.el);
    if (t && typable(t)) return t;
    var whole = textArea(w.ax);
    if (whole && typable(whole)) { state.swapped = describe(type, name, id); return whole; }
    throw new Error(describe(type, name, id) + " doesn't accept typing, and that window has no text box Bob can find.");
  }
  function textArea(el) {
    var hit = null;
    walk(el, 3000, function (n) { if (typable(n)) { hit = n; return false; } });
    return hit;
  }
  function label(n) { return labelOf(n.type, n.name, n.id); }
  function resolve(hwnd, action, t) {
    var w = window(hwnd);
    var e = find(w, t.type, t.name, t.id, t.nth, action === 'type' || action === 'focus');
    if (!e) throw new Error('That window has no text box Bob can find.');
    return { label: label(e), swapped: state.swapped, enabled: e.enabled, password: e.password };
  }

  // -- driving: the red bar, the mouse and Esc --
  function mouse() { var p = $.NSEvent.mouseLocation; return { x: p.x, y: p.y }; }
  function bar(on) {
    if (!state.bar) {
      var sc = $.NSScreen.mainScreen.frame;
      var b = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, sc.size.height - 46, sc.size.width, 46), 0, 2, false);
      b.setLevel(25); // the status bar level: above ordinary windows
      b.setBackgroundColor($.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.70, 0.13, 0.13, 0.92));
      b.setIgnoresMouseEvents(true);
      b.setCollectionBehavior(1 | 16); // every Space, stays put
      var l = $.NSTextField.labelWithString('Bob is driving.  Move the mouse or press Esc to take back control.');
      l.setTextColor($.NSColor.whiteColor);
      l.setFont($.NSFont.boldSystemFontOfSize(16));
      l.setAlignment(2); // centre
      l.setFrame($.NSMakeRect(0, 11, sc.size.width, 24));
      b.contentView.addSubview(l);
      state.bar = b;
    }
    if (on) state.bar.orderFrontRegardless; else state.bar.orderOut(null);
  }
  function stopNow(why) {
    if (!state.driving) return;
    state.driving = false; state.stopped = true;
    try { bar(false); } catch (e) {}
    emit({ event: 'stopped', why: why });
  }
  function checkTaken() {
    if (!state.driving || !state.base) return;
    var p = mouse(), dx = p.x - state.base.x, dy = p.y - state.base.y;
    if (dx * dx + dy * dy > 30 * 30) stopNow('mouse');
  }
  function quiet(s) { state.quietUntil = Math.max(state.quietUntil, now() + s * 1000); }
  function drive(on) {
    if (on) { state.stopped = false; state.base = mouse(); quiet(0.15); state.driving = true; bar(true); }
    else { state.driving = false; bar(false); }
  }
  function mustDrive() {
    if (state.stopped) throw new Error('Stopped: you took back control.');
    if (!state.driving) throw new Error("Bob isn't driving right now.");
  }

  // -- real input --
  function inFront(w) {
    try {
      var p = procOf(w.cg.pid);
      if (!p || !p.frontmost()) return false;
      var f = p.windows[0];
      return cleanName(f.name()) === w.title;
    } catch (e) { return false; }
  }
  function front(w) {
    if (inFront(w)) return;
    try { procOf(w.cg.pid).frontmost = true; } catch (e) {}
    try { w.ax.actions.byName('AXRaise').perform(); } catch (e) {}
    sleep(0.15);
    if (!inFront(w)) throw new Error("macOS wouldn't bring that window to the front, so Bob didn't do anything. Click the window yourself, then ask him again.");
  }
  function press(keys) {
    var k = parseKeys(keys);
    var using = k.mods.map(function (m) { return m + ' down'; });
    if (k.code !== null) SE.keyCode(k.code, using.length ? { using: using } : {});
    else SE.keystroke(k.key, using.length ? { using: using } : {});
  }
  function typeKeys(w, text) {
    var done = 0, parts = String(text).replace(/\r/g, '').split(/(\n|\t)/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '\n') { SE.keyCode(36); done++; continue; }
      if (p === '\t') { SE.keyCode(48); done++; continue; }
      for (var j = 0; j < p.length; j += 8) {
        $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.01)); // lets the Esc watch run
        checkTaken();
        if (!state.driving) throw new Error('Stopped: you took back control after ' + done + ' of ' + text.length + ' characters.');
        if (!inFront(w)) throw new Error('Typing stopped after ' + done + ' of ' + text.length + ' characters because another window came to the front.');
        var c = p.slice(j, j + 8);
        SE.keystroke(c);
        done += c.length;
      }
    }
  }
  function postClick(x, y) {
    var pt = $.CGPointMake(x, y);
    [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp].forEach(function (type) {
      var ev = $.CGEventCreateMouseEvent(null, type, pt, $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, ev);
      sleep(0.03);
    });
  }
  // A real click at screen place x, y (top-left origin); the pointer goes back where it was.
  function realClick(x, y) {
    mustDrive();
    var cur = $.CGEventGetLocation($.CGEventCreate(null));
    $.CGWarpMouseCursorPosition($.CGPointMake(x, y));
    postClick(x, y);
    sleep(0.06);
    $.CGWarpMouseCursorPosition($.CGPointMake(cur.x, cur.y));
    state.base = mouse();
  }
  function centre(n) {
    var p = n.el.position(), s = n.el.size();
    if (!s || s[0] <= 0 || s[1] <= 0) throw new Error("Bob couldn't find where that is on the screen.");
    return [p[0] + Math.floor(s[0] / 2), p[1] + Math.floor(s[1] / 2)];
  }
  function focused(n) { try { return n.el.focused() === true; } catch (e) { return false; } }
  function focusIn(n, lab) {
    try { n.el.focused = true; } catch (e) {}
    sleep(0.08);
    if (focused(n)) return;
    var c = centre(n); realClick(c[0], c[1]);
    sleep(0.12);
    if (!focused(n)) throw new Error("macOS wouldn't let Bob put the cursor in " + lab + ', so nothing was typed. Click into ' + lab + ' yourself and try again.');
  }
  function checked(n, text, did) {
    var got = valueOf(n);
    if (got === null) return did + " (this app doesn't let Bob read it back to check)";
    var want = String(text).replace(/[\r\n]/g, '').slice(-40);
    return got.replace(/[\r\n]/g, '').indexOf(want) >= 0 ? did + ', and checked it is there' : did + ", but when Bob read it back the text wasn't there";
  }
  function swappedNote() { return state.swapped ? '; ' + state.swapped + " doesn't accept typing, so Bob typed into the window's main text area instead" : ''; }

  function clickAtPoint(hwnd, x, y) {
    mustDrive();
    var w = window(hwnd), b = w.cg.bounds;
    if (x < 0 || y < 0 || x >= b.w || y >= b.h) throw new Error('That place (' + x + ', ' + y + ') is outside the window, which is ' + b.w + ' by ' + b.h + ' points. Take a new picture with app_look.');
    quiet(0.4);
    front(w);
    realClick(b.x + x, b.y + y);
    return 'clicked at (' + x + ', ' + y + ') in "' + w.title + '"';
  }
  function act(m) {
    mustDrive();
    var w = window(m.hwnd), t = m.target || {}, action = String(m.action || '');
    var typing = action === 'type' || action === 'focus';
    var e = find(w, t.type, t.name, t.id, t.nth, typing);
    if (!e) throw new Error('That window has no text box Bob can find.');
    var lab = label(e);
    if (m.expect && lab !== m.expect) throw new Error('The window changed since you approved it (it is now ' + lab + ', not ' + m.expect + '), so Bob stopped. Approve it again to retry.');
    if (!e.enabled) throw new Error('That is greyed out.');
    quiet(0.4);
    if (action === 'click') {
      try { e.el.actions.byName('AXPress').perform(); return 'pressed ' + lab; } catch (x) {}
      front(w);
      var c = centre(e); realClick(c[0], c[1]);
      return 'clicked ' + lab;
    }
    var text = String(m.text || '');
    if (action === 'type') {
      if (e.password && !m.allowPassword) throw new Error('Bob never types into password fields.');
      if (e.type === 'Edit') {
        try { e.el.value = text; return checked(e, text, 'typed into ' + lab + ' (in place of what was there)' + swappedNote()); } catch (x) {} // some fields refuse it; type it instead
      }
      front(w);
      focusIn(e, lab);
      quiet(0.3 + text.length * 0.02);
      SE.keyCode(125, { using: ['command down'] }); // the end of the document
      typeKeys(w, text);
      sleep(0.15);
      return checked(e, text, 'typed into ' + lab + ' (added at the end)' + swappedNote());
    }
    if (action === 'keys') {
      if (e.password && !m.allowPassword) throw new Error('Bob never types into password fields.');
      if (/\{ESC\}/i.test(String(m.keys))) quiet(0.4);
      front(w);
      if (e.el !== w.ax) { try { e.el.focused = true; } catch (x) {} }
      press(m.keys);
      return 'pressed keys in ' + lab;
    }
    if (action === 'focus') { front(w); focusIn(e, lab); return 'put the cursor in ' + lab + swappedNote(); }
    throw new Error('Unknown action.');
  }

  function picture(hwnd, file) {
    if (!/\.png$/i.test(String(file))) throw new Error('Pictures are saved as .png.');
    var w = window(hwnd);
    var q = "'" + String(file).replace(/'/g, "'\\''") + "'";
    me.doShellScript('/usr/sbin/screencapture -x -o -l ' + Number(w.cg.hwnd) + ' ' + q);
    if (!$.NSFileManager.defaultManager.fileExistsAtPath(file)) throw new Error('macOS did not let Bob take the picture. Allow Bob under System Settings, Privacy & Security, Screen Recording, then ask again.');
    return file;
  }

  function apps() {
    var fm = $.NSFileManager.defaultManager, res = [];
    var home = ObjC.unwrap($.NSHomeDirectory());
    ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', home + '/Applications'].forEach(function (dir) {
      var names = ObjC.deepUnwrap(fm.contentsOfDirectoryAtPathError(dir, null)) || [];
      names.forEach(function (n) { if (/\.app$/.test(n)) res.push({ name: n.replace(/\.app$/, ''), appId: dir + '/' + n }); });
    });
    res.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    return res.slice(0, 500);
  }
  function open(appId) {
    appId = String(appId || '');
    if (!appId || appId.length > 300 || !/\.app$/.test(appId)) throw new Error('That is not an app from the Applications folder.');
    if (!apps().some(function (a) { return a.appId === appId; })) throw new Error('That app is not in the Applications folder.');
    if (!$.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath(appId))) throw new Error('macOS could not open it.');
  }

  function handle(m) {
    var r = { id: m.id, ok: true }, op = String(m.op || '');
    try {
      if (op === 'hello') { r.version = VERSION; r.trusted = trusted(); r.bar = true; r.mouseStop = true; r.esc = true; r.keys = true; r.clickAt = true; r.pictures = true; }
      else if (op === 'windows') r.windows = listWindows();
      else if (op === 'apps') r.apps = apps();
      else if (op === 'open') open(m.appId);
      else if (op === 'look') r.items = look(m.hwnd, Math.min(300, Math.max(10, Number(m.max) || 150)));
      else if (op === 'picture') r.file = picture(m.hwnd, String(m.file || ''));
      else if (op === 'drive') drive(Boolean(m.on));
      else if (op === 'resolve') { var x = resolve(m.hwnd, String(m.action || ''), m.target || {}); r.label = x.label; r.swapped = x.swapped; r.enabled = x.enabled; r.password = x.password; }
      else if (op === 'clickat') r.did = clickAtPoint(m.hwnd, Number(m.x), Number(m.y));
      else if (op === 'act') r.did = act(m);
      else if (op === 'quit') { drive(false); emit(r); $.exit(0); }
      else throw new Error('Unknown request: ' + op);
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (/not allowed assistive access|-1719|-25211/.test(msg)) msg = 'macOS has not allowed Bob to use other apps yet. Open System Settings, Privacy & Security, Accessibility, switch Bob on, then ask again.';
      r = { id: m.id, ok: false, error: msg };
    }
    emit(r);
  }

  // -- the loop: stdin, the mouse watch and the Esc watch all on the main run loop --
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy(1); // no Dock icon
  var input = $.NSFileHandle.fileHandleWithStandardInput, buf = '';
  $.NSNotificationCenter.defaultCenter.addObserverForNameObjectQueueUsingBlock($.NSFileHandleDataAvailableNotification, input, $.NSOperationQueue.mainQueue, function () {
    var data = input.availableData;
    if (!data || Number(data.length) === 0) { try { drive(false); } catch (e) {} $.exit(0); }
    buf += ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)) || '';
    var i;
    while ((i = buf.indexOf('\n')) >= 0) {
      var line = buf.slice(0, i).replace(/^﻿/, '').trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      var m; try { m = JSON.parse(line); } catch (e) { emit({ id: null, ok: false, error: 'bad JSON' }); continue; }
      handle(m);
    }
    input.waitForDataInBackgroundAndNotify;
  });
  input.waitForDataInBackgroundAndNotify;
  $.NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(0.04, true, function () { try { checkTaken(); } catch (e) {} });
  try {
    $.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler(1 << 10, function (ev) { // key down anywhere
      if (Number(ev.keyCode) === 53 && now() >= state.quietUntil) stopNow('esc');
    });
  } catch (e) {}
  app.run;
}
