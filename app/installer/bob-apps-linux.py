#!/usr/bin/env python3
# Bob's Apps hand helper for Linux (a trial: off until you switch the Apps hand on, see src/hands-apps.js).
# The same JSON-lines protocol as installer/bob-apps.ps1 on Windows, so Bob's side is the same everywhere:
# Bob writes {"id":..,"op":..} on stdin, it answers {"id":..,"ok":true,...} on stdout.
#   hello                      -> version, session (x11 / wayland), what works here (bar, mouseStop, esc, keys...)
#   windows                    -> open windows of accessible apps: hwnd (a number this helper gives), title, process, pid
#   apps                       -> the app menu (.desktop files that show in menus): name, appId
#   open    appId              -> launches that .desktop app, as you
#   look    hwnd, max          -> its controls through AT-SPI (the Linux accessibility bus): type, name, id, enabled, value
#                                 (never the value of a password field)
#   picture hwnd, file         -> a PNG of that window (X11; Wayland only with grim)
#   drive   on                 -> shows / hides the red "Bob is driving" bar and watches for you taking over
#   resolve hwnd, action, target{type,name,id,nth} -> label: what the action would really land on (for the card)
#   act     hwnd, action, target, text, keys, expect -> click / type / keys / focus, only while driving
#   clickat hwnd x y           -> a real click at that place in the window (picture pixels), only while driving (X11)
#   quit
# While driving, moving the mouse (X11) or pressing Esc (apps that pass keys to AT-SPI) stops at once and it
# writes {"event":"stopped","why":...}.
#
# Needs: python3 with PyGObject and AT-SPI (Debian/Ubuntu: python3-gi gir1.2-atspi-2.0; Fedora: python3-gobject
# at-spi2-core), plus for keys and clicks xdotool on X11 or ydotool on Wayland. GTK 3 (gir1.2-gtk-3.0) draws the red
# bar and takes pictures on X11. Never touches terminals, admin tools, password managers, sign-in or password
# prompts, password fields, or Bob's own windows (--bob-pid / --bob-parent).
#
# Unproven in our lab beyond an X11 test desktop (Xvfb + Openbox, GTK apps); Wayland is unproven, as we have yet
# to test it. Run "python3 bob-apps-linux.py --selftest" to check the parts that need no desktop.
import json
import os
import re
import shutil
import subprocess
import sys
import time
import warnings

warnings.filterwarnings('ignore', category=DeprecationWarning)

VERSION = 1

# ---- Parts that need no desktop (checked by --selftest and app/test/run-apps-unix-test.js) ----

# AT-SPI role names -> the same type names Windows UI Automation uses, so Bob's words and checks stay the same.
ROLE_TYPES = {
    'push button': 'Button', 'toggle button': 'Button', 'button': 'Button', 'push button menu': 'Button',
    'check box': 'CheckBox', 'check menu item': 'MenuItem', 'radio button': 'RadioButton', 'radio menu item': 'MenuItem',
    'combo box': 'ComboBox', 'menu': 'MenuItem', 'menu item': 'MenuItem', 'menu bar': 'MenuBar', 'popup menu': 'Menu',
    'tear off menu item': 'MenuItem', 'list': 'List', 'list box': 'List', 'list item': 'ListItem', 'tree': 'Tree',
    'tree item': 'TreeItem', 'tree table': 'Tree', 'table': 'Table', 'table cell': 'DataItem', 'table row': 'DataItem',
    'page tab': 'TabItem', 'page tab list': 'Tab', 'tool bar': 'ToolBar', 'status bar': 'StatusBar', 'link': 'Hyperlink',
    'slider': 'Slider', 'spin button': 'Spinner', 'scroll bar': 'ScrollBar', 'progress bar': 'ProgressBar',
    'label': 'Text', 'static': 'Text', 'heading': 'Text', 'caption': 'Text', 'paragraph': 'Text', 'image': 'Image',
    'icon': 'Image', 'frame': 'Window', 'dialog': 'Window', 'alert': 'Window', 'window': 'Window', 'file chooser': 'Window',
    'panel': 'Pane', 'filler': 'Pane', 'scroll pane': 'Pane', 'viewport': 'Pane', 'split pane': 'Pane', 'section': 'Group',
    'grouping': 'Group', 'form': 'Group', 'canvas': 'Pane', 'drawing area': 'Pane', 'document frame': 'Document',
    'document text': 'Document', 'document web': 'Document', 'terminal': 'Terminal', 'separator': 'Separator',
    'header': 'Header', 'column header': 'HeaderItem', 'row header': 'HeaderItem', 'tool tip': 'ToolTip',
    'password text': 'Edit', 'entry': 'Edit', 'text': 'Edit', 'editbar': 'Edit', 'search box': 'Edit',
}

def type_for(role, multi_line=False):
    """AT-SPI role name (and whether a text box is multi-line) -> a Windows-style type name."""
    role = str(role or '').lower()
    t = ROLE_TYPES.get(role)
    if t == 'Edit' and multi_line and role != 'password text':
        return 'Document'
    return t or ''.join(w.capitalize() for w in role.split()) or 'Unknown'

# Keys: Bob sends the Windows SendKeys form (src/hands-apps.js keysFor): ^ ctrl, + shift, % alt, {ENTER}, a letter.
SENDKEYS = {'ENTER': 'enter', 'TAB': 'tab', 'ESC': 'esc', 'UP': 'up', 'DOWN': 'down', 'LEFT': 'left', 'RIGHT': 'right',
            'HOME': 'home', 'END': 'end', 'PGUP': 'pageup', 'PGDN': 'pagedown', 'BACKSPACE': 'backspace',
            'DELETE': 'delete', 'INSERT': 'insert'}
for _i in range(1, 13):
    SENDKEYS['F%d' % _i] = 'f%d' % _i

def parse_keys(s):
    """'^+s' -> (['ctrl', 'shift'], 's'); '{ENTER}' -> ([], 'enter'). Raises ValueError for anything else."""
    s = str(s or '')
    mods = []
    while s[:1] in ('^', '+', '%') and len(s) > 1:
        mods.append({'^': 'ctrl', '+': 'shift', '%': 'alt'}[s[0]])
        s = s[1:]
    m = re.fullmatch(r'\{([A-Z0-9]+)\}', s)
    if m:
        key = SENDKEYS.get(m.group(1))
        if not key:
            raise ValueError('Bob does not press {%s}.' % m.group(1))
    elif s == ' ':
        key = 'space'
    elif re.fullmatch(r'[a-z0-9]', s):
        key = s
    else:
        raise ValueError('Bob does not press "%s".' % s)
    if 'ctrl' in mods and 'alt' in mods:
        raise ValueError('Bob never presses Ctrl+Alt combinations.')
    return mods, key

XDOTOOL_KEYS = {'enter': 'Return', 'tab': 'Tab', 'esc': 'Escape', 'up': 'Up', 'down': 'Down', 'left': 'Left',
                'right': 'Right', 'home': 'Home', 'end': 'End', 'pageup': 'Prior', 'pagedown': 'Next',
                'backspace': 'BackSpace', 'delete': 'Delete', 'insert': 'Insert', 'space': 'space'}

def xdotool_combo(mods, key):
    k = XDOTOOL_KEYS.get(key) or (key.upper() if re.fullmatch(r'f\d+', key) else key)
    return '+'.join(mods + [k])

# Linux input event codes (linux/input-event-codes.h), for ydotool on Wayland.
EVDEV = {'ctrl': 29, 'shift': 42, 'alt': 56, 'enter': 28, 'tab': 15, 'esc': 1, 'up': 103, 'down': 108, 'left': 105,
         'right': 106, 'home': 102, 'end': 107, 'pageup': 104, 'pagedown': 109, 'backspace': 14, 'delete': 111,
         'insert': 110, 'space': 57, 'f11': 87, 'f12': 88, '0': 11}
for _i in range(1, 11):
    EVDEV['f%d' % _i] = 58 + _i
for _i in range(1, 10):
    EVDEV[str(_i)] = 1 + _i
EVDEV.update(dict(zip('qwertyuiop', range(16, 26))))
EVDEV.update(dict(zip('asdfghjkl', range(30, 39))))
EVDEV.update(dict(zip('zxcvbnm', range(44, 51))))

def ydotool_codes(mods, key):
    """ -> ['29:1', '31:1', '31:0', '29:0'] for ctrl+s."""
    seq = [EVDEV[m] for m in mods] + [EVDEV[key]]
    return ['%d:1' % c for c in seq] + ['%d:0' % c for c in reversed(seq)]

# Process names (lower case) and window titles this helper never touches, whatever Bob's side says.
BLOCKED = {
    'bash', 'sh', 'zsh', 'fish', 'dash', 'gnome-terminal', 'gnome-terminal-server', 'konsole', 'xterm', 'uxterm',
    'alacritty', 'kitty', 'wezterm', 'wezterm-gui', 'tilix', 'xfce4-terminal', 'terminator', 'foot', 'ptyxis',
    'kgx', 'lxterminal', 'mate-terminal', 'qterminal', 'ghostty', 'sudo', 'su', 'pkexec', 'gnome-system-monitor',
    'plasma-systemmonitor', 'ksysguard', 'gparted', 'gnome-disks', 'seahorse', 'kwalletmanager5', 'kwalletmanager',
    'polkit-gnome-authentication-agent-1', 'polkit-kde-authentication-agent-1', 'lxpolkit', 'ssh-askpass',
    'gcr-prompter', 'gnome-shell', 'keepass', 'keepassxc', '1password', 'bitwarden', 'enpass', 'nordpass',
    'protonpass', 'synaptic', 'timeshift', 'bob', 'electron',
}
BLOCKED_TITLE = re.compile(r'\b(password|passphrase|credential|authenticat(e|ion) required|unlock keyring|polkit|sudo|'
                           r'recovery key|2fa|two[- ]factor|one[- ]time code)\b', re.I)

def blocked_why(process, title, pid, own):
    p = str(process or '').lower()
    if pid in own:
        return "That's Bob's own window. Bob never clicks his own buttons."
    if p in BLOCKED:
        return '%s is off limits to the Apps hand.' % process
    if BLOCKED_TITLE.search(str(title or '')):
        return 'That window looks like a password or security prompt, so Bob leaves it to you.'
    return ''

PASSWORD_WORDS = re.compile(r'\b(password|passphrase|passcode|pin)\b', re.I)

def clean_name(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()

def label_of(type_, name, id_):
    return type_ + (' "%s"' % name if name else '') + (' [id %s]' % id_ if id_ else '')

def describe(type_, name, id_):
    parts = [p for p in (type_, '"%s"' % name if name else '', '[id %s]' % id_ if id_ else '') if p]
    return ' '.join(parts) or 'that'

def selftest():
    bad = []
    def ok(what, cond):
        if not cond:
            bad.append(what)
    ok('push button is a Button', type_for('push button') == 'Button')
    ok('a one-line text is an Edit', type_for('text') == 'Edit')
    ok('a many-line text is a Document', type_for('text', True) == 'Document')
    ok('a password stays an Edit', type_for('password text', True) == 'Edit')
    ok('an unknown role keeps its name', type_for('color chooser') == 'ColorChooser')
    ok('ctrl+s', parse_keys('^s') == (['ctrl'], 's'))
    ok('shift+tab', parse_keys('+{TAB}') == (['shift'], 'tab'))
    ok('alt+f4', parse_keys('%{F4}') == (['alt'], 'f4'))
    ok('space', parse_keys(' ') == ([], 'space'))
    try:
        parse_keys('^%{DELETE}')
        bad.append('ctrl+alt is refused')
    except ValueError:
        pass
    try:
        parse_keys('{LWIN}')
        bad.append('the Windows key is refused')
    except ValueError:
        pass
    ok('xdotool ctrl+s', xdotool_combo(['ctrl'], 's') == 'ctrl+s')
    ok('xdotool page down', xdotool_combo([], 'pagedown') == 'Next')
    ok('xdotool F5', xdotool_combo([], 'f5') == 'F5')
    ok('ydotool ctrl+s', ydotool_codes(['ctrl'], 's') == ['29:1', '31:1', '31:0', '29:0'])
    ok('ydotool enter', ydotool_codes([], 'enter') == ['28:1', '28:0'])
    ok('ydotool f10', ydotool_codes([], 'f10') == ['68:1', '68:0'])
    ok('ydotool every key Bob may press', all(k in EVDEV for k in list(XDOTOOL_KEYS) + list('abcdefghijklmnopqrstuvwxyz0123456789') + ['f%d' % i for i in range(1, 13)]))
    ok('terminals are blocked', bool(blocked_why('gnome-terminal-server', 'Terminal', 1, [])))
    ok("Bob's own window is blocked", bool(blocked_why('mousepad', 'x', 7, [7])))
    ok('a sudo prompt is blocked', bool(blocked_why('zenity', 'Authentication Required', 2, [])))
    ok('Mousepad is fine', not blocked_why('mousepad', 'Untitled 1 - Mousepad', 2, []))
    ok('labels match Windows', label_of('Button', 'Save', '') == 'Button "Save"' and label_of('Edit', '', 'q') == 'Edit [id q]')
    print(json.dumps({'ok': not bad, 'failed': bad}))
    return 0 if not bad else 1

# ---- The desktop ----

def session_kind(env=os.environ):
    if env.get('WAYLAND_DISPLAY') or env.get('XDG_SESSION_TYPE') == 'wayland':
        return 'wayland'
    return 'x11'

def which(name):
    return shutil.which(name)

def run(args, timeout=10, input_text=None):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout, input=input_text)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or '%s failed' % args[0]).strip().splitlines()[-1][:300])
    return p.stdout

def proc_name(pid):
    for f in ('exe',):
        try:
            return os.path.basename(os.readlink('/proc/%d/%s' % (pid, f)))
        except OSError:
            pass
    try:
        with open('/proc/%d/comm' % pid) as fh:
            return fh.read().strip()
    except OSError:
        return ''


class Helper:
    def __init__(self, own):
        import gi
        gi.require_version('Atspi', '2.0')
        from gi.repository import Atspi, GLib
        self.Atspi, self.GLib = Atspi, GLib
        Atspi.init()
        self.own = [p for p in own if p > 0] + [os.getpid()]
        self.session = session_kind()
        self.ids = {}       # hwnd number -> accessible frame
        self.next_id = 1
        self.driving = False
        self.stopped = False
        self.baseline = None
        self.quiet_until = 0.0
        self.Gtk = self.Gdk = None
        self.bar = None
        self.esc = False
        self.notified = False
        if self.session == 'x11' and os.environ.get('DISPLAY'):
            try:
                gi.require_version('Gtk', '3.0')
                gi.require_version('Gdk', '3.0')
                from gi.repository import Gtk, Gdk
                if Gtk.init_check()[0]:
                    self.Gtk, self.Gdk = Gtk, Gdk
            except (ValueError, ImportError):
                pass
        self.watch_esc()

    # -- what works here --
    def hello(self):
        x11 = self.session == 'x11'
        return {'version': VERSION, 'session': self.session,
                'bar': bool(self.Gtk), 'mouseStop': bool(self.Gdk), 'esc': self.esc,
                'keys': bool(which('xdotool') if x11 else which('ydotool')),
                'clickAt': bool(x11 and which('xdotool')),
                'pictures': bool(self.Gdk or which('import')) if x11 else bool(which('grim'))}

    def watch_esc(self):
        """Esc stops Bob in apps that pass their keys to AT-SPI (GTK and Qt apps usually do; X11 only for some)."""
        Atspi = self.Atspi
        def on_key(event, *_):
            try:
                if getattr(event, 'id', 0) == 0xff1b and time.time() >= self.quiet_until:  # Escape keysym
                    self.stop_now('esc')
            except Exception:
                pass
            return False  # never swallow the key
        try:
            self._listener = Atspi.DeviceListener.new(on_key)
            Atspi.register_keystroke_listener(self._listener, None, 0, 1 << Atspi.EventType.KEY_PRESSED_EVENT, Atspi.KeyListenerSyncType.NOSYNC)
            self.esc = True
        except Exception:
            self.esc = False

    # -- windows --
    def frames(self):
        Atspi = self.Atspi
        desk = Atspi.get_desktop(0)
        out = []
        for i in range(min(desk.get_child_count(), 200)):
            try:
                app = desk.get_child_at_index(i)
                if app is None:
                    continue
                pid = app.get_process_id()
                for j in range(min(app.get_child_count(), 50)):
                    f = app.get_child_at_index(j)
                    if f is None:
                        continue
                    st = f.get_state_set()
                    if not (st.contains(Atspi.StateType.SHOWING) or st.contains(Atspi.StateType.VISIBLE)):
                        continue
                    out.append((f, pid))
            except Exception:
                continue
        return out

    def hwnd_of(self, f):
        for k, v in self.ids.items():
            if v is f or v == f:
                return k
        k = self.next_id
        self.next_id += 1
        self.ids[k] = f
        return k

    def list_windows(self):
        live = []
        for f, pid in self.frames():
            try:
                title = clean_name(f.get_name())
            except Exception:
                continue
            if not title or pid in self.own:
                continue
            live.append({'hwnd': self.hwnd_of(f), 'title': title, 'process': proc_name(pid), 'pid': pid})
        keep = {w['hwnd'] for w in live}
        self.ids = {k: v for k, v in self.ids.items() if k in keep}
        return live

    def window(self, hwnd):
        f = self.ids.get(int(hwnd or 0))
        if f is None:
            raise RuntimeError('That window has closed.')
        try:
            title = clean_name(f.get_name())
            pid = f.get_process_id()
            st = f.get_state_set()
        except Exception:
            raise RuntimeError('That window has closed.')
        if st.contains(self.Atspi.StateType.DEFUNCT):
            raise RuntimeError('That window has closed.')
        why = blocked_why(proc_name(pid), title, pid, self.own)
        if why:
            raise RuntimeError(why)
        return f

    # -- reading a window --
    def type_of(self, e):
        try:
            multi = e.get_state_set().contains(self.Atspi.StateType.MULTI_LINE)
        except Exception:
            multi = False
        return type_for(e.get_role_name(), multi)

    def ident(self, e):
        try:
            return clean_name(e.get_accessible_id())
        except Exception:
            return ''

    def is_password(self, e):
        """A password box: its role says so, or (GTK entries that hide their text don't always say) it is a one-line
        text box whose own name, its label, or a label next to it speaks of a password, passphrase or PIN."""
        Atspi = self.Atspi
        try:
            role = e.get_role()
            if role == Atspi.Role.PASSWORD_TEXT:
                return True
            if role not in (Atspi.Role.TEXT, Atspi.Role.ENTRY) or e.get_state_set().contains(Atspi.StateType.MULTI_LINE):
                return False
            words = [e.get_name(), e.get_description()]
            for r in e.get_relation_set() or []:
                if r.get_relation_type() == Atspi.RelationType.LABELLED_BY:
                    words += [r.get_target(i).get_name() for i in range(r.get_n_targets())]
            up = e.get_parent()
            for _ in range(3):
                if up is None:
                    break
                for i in range(min(up.get_child_count(), 30)):
                    k = up.get_child_at_index(i)
                    if k is not None and k.get_role() == Atspi.Role.LABEL:
                        words.append(k.get_name())
                up = up.get_parent()
            return bool(PASSWORD_WORDS.search(' '.join(str(w or '') for w in words)))
        except Exception:
            return False

    def is_text_area(self, e):
        Atspi = self.Atspi
        try:
            st = e.get_state_set()
            return bool(e.get_editable_text_iface()) and st.contains(Atspi.StateType.EDITABLE) and (st.contains(Atspi.StateType.FOCUSABLE) or st.contains(Atspi.StateType.SENSITIVE))
        except Exception:
            return False

    def enabled(self, e):
        try:
            st = e.get_state_set()
            return st.contains(self.Atspi.StateType.ENABLED) or st.contains(self.Atspi.StateType.SENSITIVE)
        except Exception:
            return False

    def read_text(self, e):
        try:
            if e.get_text_iface():
                T = self.Atspi.Text
                return T.get_text(e, 0, min(T.get_character_count(e), 200000)) or ''
        except Exception:
            pass
        return None

    def walk(self, root, limit=3000):
        """Every descendant (depth-first, in order), with its depth, up to limit."""
        todo = [(root, 0)]
        seen = 0
        while todo and seen < limit:
            e, d = todo.pop()
            seen += 1
            yield e, d
            if d >= 32:  # GTK 4 windows nest their text areas 15 levels down
                continue
            try:
                n = min(e.get_child_count(), 400)
                kids = [e.get_child_at_index(i) for i in range(n)]
            except Exception:
                kids = []
            for k in reversed(kids):
                if k is not None:
                    todo.append((k, d + 1))

    def look(self, hwnd, mx):
        f = self.window(hwnd)
        Atspi = self.Atspi
        out = []
        for e, d in self.walk(f):
            if d == 0:
                continue
            if len(out) >= mx:
                break
            try:
                if not e.get_state_set().contains(Atspi.StateType.SHOWING):
                    continue
                t = self.type_of(e)
                name = clean_name(e.get_name())
                id_ = self.ident(e)
                pw = self.is_password(e)
                item = {'type': t, 'name': name, 'id': id_, 'enabled': self.enabled(e), 'password': pw}
                if not pw and self.is_text_area(e):
                    item['typable'] = True
                if not pw:
                    v = self.read_text(e) if e.get_text_iface() else None
                    if v:
                        item['value'] = v[:80]
                    elif e.get_value_iface():
                        item['value'] = str(self.Atspi.Value.get_current_value(e))
                if name or id_ or t in ('Edit', 'Document'):
                    out.append(item)
            except Exception:
                continue
        return out

    # -- finding what Bob named --
    def find(self, f, type_, name, id_, nth, for_typing):
        self.swapped = None
        type_ = str(type_ or '').lower()
        name = clean_name(name).lower()
        id_ = str(id_ or '').lower()
        if not (type_ or name or id_):
            return self.text_area(f) if for_typing else f
        hits = []
        for e, d in self.walk(f, 6000):
            if d == 0:
                continue
            try:
                if type_ and self.type_of(e).lower() != type_:
                    continue
                if name and clean_name(e.get_name()).lower() != name:
                    continue
                if id_ and self.ident(e).lower() != id_:
                    continue
                hits.append(e)
            except Exception:
                continue
        if not hits:
            raise RuntimeError("Bob couldn't find %s in that window. It may have changed; look at it again." % describe(type_, name, id_))
        if for_typing:
            keyb = [e for e in hits if self.is_text_area(e)]
            if keyb:
                hits = keyb
        i = max(1, int(nth or 1)) - 1
        if i >= len(hits):
            raise RuntimeError('There are only %d of those in that window.' % len(hits))
        e = hits[i]
        if not for_typing:
            return e
        t = self.text_area(e)
        if self.is_text_area(t):
            return t
        w = self.text_area(f)
        if self.is_text_area(w):
            self.swapped = describe(type_, name, id_)
            return w
        raise RuntimeError("%s doesn't accept typing, and that window has no text box Bob can find." % describe(type_, name, id_))

    def text_area(self, e):
        if self.is_text_area(e):
            return e
        for x, d in self.walk(e, 3000):
            if d and self.is_text_area(x) and self.enabled(x) and not self.is_password(x):
                return x
        return e

    def label(self, e):
        return label_of(self.type_of(e), clean_name(e.get_name()), self.ident(e))

    def resolve(self, hwnd, action, t):
        f = self.window(hwnd)
        e = self.find(f, t.get('type'), t.get('name'), t.get('id'), t.get('nth'), action in ('type', 'focus'))
        return {'label': self.label(e), 'swapped': self.swapped or '', 'enabled': self.enabled(e), 'password': self.is_password(e)}

    # -- driving: the red bar and the watch for you taking over --
    def pointer(self):
        if not self.Gdk:
            return None
        try:
            seat = self.Gdk.Display.get_default().get_default_seat()
            _, x, y = seat.get_pointer().get_position()
            return (x, y)
        except Exception:
            return None

    def show_bar(self, on):
        Gtk = self.Gtk
        if not Gtk:
            if on and not self.notified and which('notify-send'):
                # Wayland or no GTK: a notification instead of the bar (a window could take the keyboard's focus).
                self.notified = True
                subprocess.Popen(['notify-send', '-u', 'critical', '-a', 'Bob', 'Bob is driving', 'Press Esc to take back control.'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        if self.bar is None:
            w = Gtk.Window(type=Gtk.WindowType.POPUP)
            w.set_keep_above(True)
            w.set_accept_focus(False)
            w.set_focus_on_map(False)
            w.set_decorated(False)
            mon = self.Gdk.Display.get_default().get_primary_monitor() or self.Gdk.Display.get_default().get_monitor(0)
            width = mon.get_geometry().width if mon else 1280
            w.set_default_size(width, 46)
            w.move(0, 0)
            css = Gtk.CssProvider()
            css.load_from_data(b'window { background-color: #b22222; } label { color: white; font-weight: bold; font-size: 14pt; }')
            w.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
            lab = Gtk.Label(label='Bob is driving.  Move the mouse or press Esc to take back control.')
            lab.get_style_context().add_provider(css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
            w.add(lab)
            self.bar = w
        if on:
            self.bar.show_all()
        else:
            self.bar.hide()
        self.pump()

    def pump(self):
        if self.Gtk:
            for _ in range(50):
                if not self.Gtk.events_pending():
                    break
                self.Gtk.main_iteration_do(False)

    def check_taken(self):
        """Called by the timer and between typing chunks: has the user moved the mouse?"""
        if not self.driving or self.baseline is None:
            return
        p = self.pointer()
        if p is None:
            return
        dx, dy = p[0] - self.baseline[0], p[1] - self.baseline[1]
        if dx * dx + dy * dy > 30 * 30:
            self.stop_now('mouse')

    def stop_now(self, why):
        if not self.driving:
            return
        self.driving = False
        self.stopped = True
        try:
            self.show_bar(False)
        except Exception:
            pass
        emit({'event': 'stopped', 'why': why})

    def drive(self, on):
        if on:
            self.stopped = False
            self.baseline = self.pointer()
            self.quiet(0.15)
            self.driving = True
            self.show_bar(True)
        else:
            self.driving = False
            self.show_bar(False)
            self.notified = False

    def quiet(self, s):
        self.quiet_until = max(self.quiet_until, time.time() + s)

    def must_drive(self):
        if self.stopped:
            raise RuntimeError('Stopped: you took back control.')
        if not self.driving:
            raise RuntimeError("Bob isn't driving right now.")

    # -- real input --
    def xid_for(self, f):
        """The X11 window for an AT-SPI frame: same process, same title (xdotool)."""
        pid = f.get_process_id()
        title = clean_name(f.get_name())
        try:
            xs = run(['xdotool', 'search', '--onlyvisible', '--pid', str(pid)]).split()
        except Exception:
            xs = []
        if not xs:
            try:
                xs = run(['xdotool', 'search', '--onlyvisible', '--name', '.']).split()
            except Exception:
                xs = []
        for x in xs:
            try:
                if clean_name(run(['xdotool', 'getwindowname', x])) == title:
                    return x
            except Exception:
                continue
        return xs[0] if len(xs) == 1 else None

    def in_front(self, f):
        Atspi = self.Atspi
        if self.session == 'x11' and which('xdotool'):
            try:
                act = run(['xdotool', 'getactivewindow']).strip()
                if clean_name(run(['xdotool', 'getwindowname', act])) == clean_name(f.get_name()):
                    return True
                # The X title can differ from the accessible one (a dialog inside the window): the same X window counts.
                return act == self.xid_for(f)
            except Exception:
                pass
        try:
            return f.get_state_set().contains(Atspi.StateType.ACTIVE)
        except Exception:
            return False

    def front(self, f):
        if self.in_front(f):
            return
        if self.session == 'x11' and which('xdotool'):
            x = self.xid_for(f)
            if x:
                try:
                    run(['xdotool', 'windowactivate', '--sync', x], timeout=5)
                except Exception:
                    pass
        else:
            try:
                f.grab_focus()
            except Exception:
                pass
        time.sleep(0.12)
        if not self.in_front(f):
            raise RuntimeError("The desktop wouldn't bring that window to the front, so Bob didn't do anything. Click the window yourself, then ask him again.")

    def press(self, keys):
        mods, key = parse_keys(keys)
        if self.session == 'x11':
            if not which('xdotool'):
                raise RuntimeError('Pressing keys needs xdotool (sudo apt install xdotool, or your distro\'s package).')
            run(['xdotool', 'key', '--clearmodifiers', xdotool_combo(mods, key)])
        else:
            if not which('ydotool'):
                raise RuntimeError('Pressing keys on Wayland needs ydotool and its ydotoold service (your distro\'s ydotool package).')
            run(['ydotool', 'key'] + ydotool_codes(mods, key))

    def type_keys(self, f, text):
        n = 0
        chunks = [text[i:i + 8] for i in range(0, len(text), 8)]
        for c in chunks:
            self.pump()
            self.check_taken()
            if not self.driving:
                raise RuntimeError('Stopped: you took back control after %d of %d characters.' % (n, len(text)))
            if not self.in_front(f):
                raise RuntimeError('Typing stopped after %d of %d characters because another window came to the front.' % (n, len(text)))
            if self.session == 'x11':
                run(['xdotool', 'type', '--delay', '4', '--', c])
            else:
                run(['ydotool', 'type', '--', c])
            n += len(c)

    def center(self, e):
        r = e.get_extents(self.Atspi.CoordType.SCREEN)
        if r.width <= 0 or r.height <= 0:
            raise RuntimeError("Bob couldn't find where that is on the screen.")
        return (r.x + r.width // 2, r.y + r.height // 2)

    def real_click(self, x, y):
        if self.session != 'x11' or not which('xdotool'):
            raise RuntimeError('A click by place needs X11 and xdotool; on Wayland Bob can only press things by name.')
        old = self.pointer() or self.baseline
        self.must_drive()
        run(['xdotool', 'mousemove', '--sync', str(x), str(y), 'click', '1'])
        time.sleep(0.06)
        if old:
            run(['xdotool', 'mousemove', '--sync', str(old[0]), str(old[1])])
        self.baseline = old or self.pointer()

    def has_focus(self, e):
        try:
            return e.get_state_set().contains(self.Atspi.StateType.FOCUSED)
        except Exception:
            return False

    def focus_in(self, e, label):
        try:
            e.grab_focus()
        except Exception:
            pass
        time.sleep(0.08)
        if self.has_focus(e):
            return
        self.real_click(*self.center(e))
        time.sleep(0.12)
        if not self.has_focus(e):
            raise RuntimeError("The desktop wouldn't let Bob put the cursor in %s, so nothing was typed. Click into %s yourself and try again." % (label, label))

    def checked(self, e, text, did):
        now = self.read_text(e)
        if now is None:
            return did + " (this app doesn't let Bob read it back to check)"
        want = text.replace('\r', '').replace('\n', '')[-40:]
        got = now.replace('\r', '').replace('\n', '')
        return did + (', and checked it is there' if want in got else ", but when Bob read it back the text wasn't there")

    def swapped_note(self):
        return "; %s doesn't accept typing, so Bob typed into the window's main text area instead" % self.swapped if self.swapped else ''

    def click_at_point(self, hwnd, x, y):
        self.must_drive()
        if self.session != 'x11' or not which('xdotool'):
            raise RuntimeError('A click by place needs X11 and xdotool; on Wayland Bob can only press things by name.')
        f = self.window(hwnd)
        r = f.get_extents(self.Atspi.CoordType.SCREEN)
        if x < 0 or y < 0 or x >= r.width or y >= r.height:
            raise RuntimeError('That place (%d, %d) is outside the window, which is %d by %d pixels. Take a new picture with app_look.' % (x, y, r.width, r.height))
        self.quiet(0.4)
        self.front(f)
        self.real_click(r.x + x, r.y + y)
        return 'clicked at (%d, %d) in "%s"' % (x, y, clean_name(f.get_name()))

    def act(self, hwnd, action, t, text, keys, expect, allow_password):
        self.must_drive()
        f = self.window(hwnd)
        typing = action in ('type', 'focus')
        e = self.find(f, t.get('type'), t.get('name'), t.get('id'), t.get('nth'), typing)
        label = self.label(e)
        if expect and label != expect:
            raise RuntimeError('The window changed since you approved it (it is now %s, not %s), so Bob stopped. Approve it again to retry.' % (label, expect))
        if not self.enabled(e):
            raise RuntimeError('That is greyed out.')
        self.quiet(0.4)
        if action == 'click':
            if e.get_action_iface():
                A = self.Atspi.Action
                names = [str(A.get_action_name(e, i) or '').lower() for i in range(A.get_n_actions(e))]
                for want in ('click', 'press', 'activate', 'toggle', 'jump', 'open'):
                    if want in names:
                        A.do_action(e, names.index(want))
                        return ('toggled ' if want == 'toggle' else 'pressed ') + label
                if names:
                    A.do_action(e, 0)
                    return 'pressed ' + label
            self.front(f)
            self.real_click(*self.center(e))
            return 'clicked ' + label
        if action == 'type':
            if self.is_password(e) and not allow_password:
                raise RuntimeError('Bob never types into password fields.')
            t_ = self.type_of(e)
            # A plain field takes the text directly (in place of what was there); a document gets it at the end.
            if e.get_editable_text_iface():
                try:
                    if t_ == 'Edit':
                        if self.Atspi.EditableText.set_text_contents(e, text):
                            return self.checked(e, text, 'typed into %s (in place of what was there)%s' % (label, self.swapped_note()))
                    else:
                        n = self.Atspi.Text.get_character_count(e)
                        if self.Atspi.EditableText.insert_text(e, n, text, len(text.encode('utf-8'))):
                            return self.checked(e, text, 'typed into %s (added at the end)%s' % (label, self.swapped_note()))
                except Exception:
                    pass  # some apps refuse it; type it instead
            self.front(f)
            self.focus_in(e, label)
            self.quiet(0.3 + len(text) * 0.02)
            self.press('^{END}')
            self.type_keys(f, text)
            time.sleep(0.15)
            return self.checked(e, text, 'typed into %s (added at the end)%s' % (label, self.swapped_note()))
        if action == 'keys':
            if self.is_password(e) and not allow_password:
                raise RuntimeError('Bob never types into password fields.')
            if '{ESC}' in str(keys).upper():
                self.quiet(0.4)
            self.front(f)
            if e is not f:
                try:
                    e.grab_focus()
                except Exception:
                    pass
            self.press(keys)
            return 'pressed keys in ' + label
        if action == 'focus':
            self.front(f)
            self.focus_in(e, label)
            return 'put the cursor in ' + label + self.swapped_note()
        raise RuntimeError('Unknown action.')

    # -- pictures --
    def picture(self, hwnd, file):
        if not str(file).lower().endswith('.png'):
            raise RuntimeError('Pictures are saved as .png.')
        f = self.window(hwnd)
        r = f.get_extents(self.Atspi.CoordType.SCREEN)
        w, h = max(1, r.width), max(1, r.height)
        if self.session == 'x11':
            if self.Gdk:
                root = self.Gdk.get_default_root_window()
                pb = self.Gdk.pixbuf_get_from_window(root, r.x, r.y, w, h)
                if pb is not None and pb.savev(file, 'png', [], []):
                    return file
            if which('import'):
                run(['import', '-window', 'root', '-crop', '%dx%d+%d+%d' % (w, h, r.x, r.y), file], timeout=20)
                return file
            raise RuntimeError('Pictures of windows need GTK 3 (gir1.2-gtk-3.0) or ImageMagick.')
        if which('grim'):
            run(['grim', '-g', '%d,%d %dx%d' % (r.x, r.y, w, h), file], timeout=20)
            return file
        raise RuntimeError("On Wayland, pictures of windows need grim (Sway and other wlroots desktops); GNOME and KDE don't let Bob take them yet.")

    # -- the app menu --
    def apps(self):
        from gi.repository import Gio
        out = []
        for a in Gio.AppInfo.get_all():
            try:
                if not a.should_show():
                    continue
                if isinstance(a, Gio.DesktopAppInfo) and a.get_boolean('Terminal'):
                    continue  # runs in a terminal: the Run hand's job
                out.append({'name': a.get_name(), 'appId': a.get_id()})
            except Exception:
                continue
        out.sort(key=lambda x: x['name'].lower())
        return out[:500]

    def open(self, app_id):
        from gi.repository import Gio
        app_id = str(app_id or '')
        if not app_id or len(app_id) > 300 or not app_id.endswith('.desktop') or '/' in app_id:
            raise RuntimeError('That is not an app from the app menu.')
        if not any(a['appId'] == app_id for a in self.apps()):
            raise RuntimeError('That app is not in the app menu.')
        a = Gio.DesktopAppInfo.new(app_id)
        if a is None or not a.launch([], None):
            raise RuntimeError('The desktop could not start it.')


def emit(m):
    sys.stdout.write(json.dumps(m) + '\n')
    sys.stdout.flush()


def handle(h, m):
    r = {'id': m.get('id'), 'ok': True}
    op = str(m.get('op') or '')
    try:
        if op == 'hello':
            r.update(h.hello())
        elif op == 'windows':
            r['windows'] = h.list_windows()
        elif op == 'apps':
            r['apps'] = h.apps()
        elif op == 'open':
            h.open(m.get('appId'))
        elif op == 'look':
            r['items'] = h.look(m.get('hwnd'), min(300, max(10, int(m.get('max') or 150))))
        elif op == 'picture':
            r['file'] = h.picture(m.get('hwnd'), str(m.get('file') or ''))
        elif op == 'drive':
            h.drive(bool(m.get('on')))
        elif op == 'resolve':
            r.update(h.resolve(m.get('hwnd'), str(m.get('action') or ''), m.get('target') or {}))
        elif op == 'clickat':
            r['did'] = h.click_at_point(m.get('hwnd'), int(m.get('x')), int(m.get('y')))
        elif op == 'act':
            r['did'] = h.act(m.get('hwnd'), str(m.get('action') or ''), m.get('target') or {}, str(m.get('text') or ''), str(m.get('keys') or ''), str(m.get('expect') or ''), bool(m.get('allowPassword')))
        elif op == 'quit':
            h.drive(False)
            return r, True
        else:
            raise RuntimeError('Unknown request: %s' % op)
    except Exception as e:  # noqa: BLE001 - every failure goes back to Bob in words
        msg = str(e) or e.__class__.__name__
        if e.__class__.__name__ == 'GError':
            msg = 'The app refused: %s Bob did nothing more.' % msg
        r = {'id': m.get('id'), 'ok': False, 'error': msg}
    return r, False


def main(argv):
    if '--selftest' in argv:
        return selftest()
    own = []
    for flag in ('--bob-pid', '--bob-parent'):
        if flag in argv:
            try:
                own.append(int(argv[argv.index(flag) + 1]))
            except (IndexError, ValueError):
                pass
    try:
        h = Helper(own)
    except (ImportError, ValueError) as e:
        emit({'event': 'broken', 'error': "The Linux apps helper needs PyGObject and AT-SPI (Debian/Ubuntu: sudo apt install python3-gi gir1.2-atspi-2.0). %s" % e})
        return 2
    GLib = h.GLib
    loop = GLib.MainLoop()
    buf = [b'']

    def on_input(fd, cond):
        if cond & (GLib.IO_HUP | GLib.IO_ERR):
            data = b''
        else:
            data = os.read(fd, 65536)
        if not data:
            loop.quit()
            return False
        buf[0] += data
        while b'\n' in buf[0]:
            line, buf[0] = buf[0].split(b'\n', 1)
            line = line.decode('utf-8', 'replace').lstrip('﻿').strip()
            if not line:
                continue
            try:
                m = json.loads(line)
            except ValueError:
                emit({'id': None, 'ok': False, 'error': 'bad JSON'})
                continue
            r, done = handle(h, m)
            emit(r)
            if done:
                loop.quit()
                return False
        return True

    def tick():
        try:
            h.check_taken()
        except Exception:
            pass
        return True

    GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, on_input)
    GLib.timeout_add(40, tick)
    try:
        if h.Gtk:
            # GTK's own loop runs the bar, the stdin watch and the mouse watch together.
            def quit_gtk():
                h.Gtk.main_quit()
            loop.quit = quit_gtk
            h.Gtk.main()
        else:
            loop.run()
    except KeyboardInterrupt:
        pass
    try:
        h.drive(False)
    except Exception:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
