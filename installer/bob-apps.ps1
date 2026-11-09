# Bob's Apps hand helper. Bob starts it while he uses apps (only when the Apps hand is on, and only after
# you approve an action) and it ends when Bob closes it, goes idle, or Bob himself exits (stdin closes).
#
# It talks JSON lines: Bob writes {"id":..,"op":..} on stdin, it answers {"id":..,"ok":true,...} on stdout.
#   hello                      -> version
#   windows                    -> open top-level windows: hwnd, title, process, pid
#   clickat hwnd x y           -> a real click at that place in the window (picture pixels), only while driving
#   apps                       -> Start menu apps: name, appId (Get-StartApps)
#   open    appId              -> opens it through the shell (as you, never "run as administrator")
#   look    hwnd, max          -> the window's controls through UI Automation: type, name, id, enabled, value
#                                 (never the value of a password field)
#   picture hwnd, file         -> a PNG of that window
#   drive   on                 -> shows / hides the red "Bob is driving" bar and watches for you taking over
#   resolve hwnd, action, target{type,name,id,nth} -> label: what the action would really land on (for the card)
#   act     hwnd, action, target{type,name,id,nth}, text, keys, expect
#                              -> click / type / keys / focus, only while driving
#   quit
# While driving, moving the mouse or pressing Esc stops at once and it writes {"event":"stopped","why":...}.
#
# Never touches: terminals, admin tools, password managers, sign-in or security prompts, password fields,
# or Bob's own window (-BobPid / -BobParent). Windows PowerShell 5.1, plain ASCII, run with -STA.
param([int] $BobPid = 0, [int] $BobParent = 0)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing, WindowsBase
if (-not ('BobApps.Driver' -as [type])) {
  Add-Type -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, System.Windows.Forms, System.Drawing, WindowsBase -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

namespace BobApps {
  public class Banner : Form {
    public Banner() {
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      BackColor = Color.FromArgb(178, 34, 34);
      Opacity = 0.92;
      StartPosition = FormStartPosition.Manual;
      Rectangle s = Screen.PrimaryScreen.Bounds;
      Bounds = new Rectangle(s.Left, s.Top, s.Width, 46);
      Label l = new Label();
      l.Dock = DockStyle.Fill;
      l.ForeColor = Color.White;
      l.Font = new Font("Segoe UI", 14f, FontStyle.Bold);
      l.TextAlign = ContentAlignment.MiddleCenter;
      l.Text = "Bob is driving.  Move the mouse or press Esc to take back control.";
      Controls.Add(l);
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams {
      get {
        CreateParams cp = base.CreateParams;
        // topmost, no activation, tool window (no Alt+Tab), click-through
        cp.ExStyle |= 0x00000008 | 0x08000000 | 0x00000080 | 0x00000020 | 0x00080000;
        return cp;
      }
    }
  }

  public static class Driver {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    static readonly object OutLock = new object();
    static readonly string[] Blocked = new string[] {
      "cmd", "powershell", "pwsh", "powershell_ise", "windowsterminal", "wt", "conhost", "openconsole", "wsl", "bash", "wscript", "cscript", "mshta",
      "regedit", "mmc", "taskmgr", "msconfig", "gpedit", "secpol", "compmgmt", "diskmgmt", "eventvwr", "services", "perfmon", "resmon",
      "systempropertiesadvanced", "useraccountcontrolsettings", "netplwiz", "lusrmgr", "control", "sysdm",
      "consent", "credentialuibroker", "logonui", "lockapp", "sechealthui", "securityhealthsystray", "securityhealthhost", "msmpeng", "smartscreen", "useraccountbroker",
      "keepass", "keepassxc", "1password", "bitwarden", "dashlane", "lastpass", "enpass", "nordpass", "roboform", "keeper", "protonpass",
      "bob", "electron" };
    public static int[] OwnPids = new int[0];

    static volatile bool driving = false;
    static volatile bool stopped = false;
    static long quietUntil = 0;
    static POINT baseline;
    static readonly object PosLock = new object();
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    // Real pixels everywhere, so UI Automation's positions and the pointer agree on scaled screens.
    public static void Init() { try { SetProcessDPIAware(); } catch { } }
    // Bob moves the pointer only through here, and the watch learns the new spot in the same step.
    static void MoveTo(int x, int y) { lock (PosLock) { SetCursorPos(x, y); GetCursorPos(out baseline); } }
    static Thread watcher;
    static Banner banner;
    static Thread uiThread;
    static readonly ManualResetEvent uiReady = new ManualResetEvent(false);

    public static void Emit(string line) { lock (OutLock) { Console.Out.WriteLine(line); Console.Out.Flush(); } }

    static string ProcName(uint pid) {
      try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; }
    }
    static bool IsBlocked(IntPtr h, out string why) {
      why = "";
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == (uint)Process.GetCurrentProcess().Id || Array.IndexOf(OwnPids, (int)pid) >= 0) { why = "That is Bob's own window."; return true; }
      string n = ProcName(pid).ToLowerInvariant();
      if (Array.IndexOf(Blocked, n) >= 0) { why = n + " is off limits to the Apps hand."; return true; }
      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      string t = sb.ToString().ToLowerInvariant();
      string[] words = new string[] { "password", "passphrase", "credential", "windows security", "user account control", "bitlocker", "recovery key" };
      foreach (string w in words) if (t.Contains(w)) { why = "That window looks like a password or security prompt."; return true; }
      return false;
    }

    public static List<Dictionary<string, object>> ListWindows() {
      List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
      int me = Process.GetCurrentProcess().Id;
      EnumWindows(delegate (IntPtr h, IntPtr l) {
        if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true; // visible, not owned
        int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
        StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
        if (sb.Length == 0) return true;
        uint pid; GetWindowThreadProcessId(h, out pid);
        if ((int)pid == me) return true;
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["hwnd"] = h.ToInt64(); d["title"] = sb.ToString(); d["pid"] = (int)pid; d["process"] = ProcName(pid);
        list.Add(d);
        return true;
      }, IntPtr.Zero);
      return list;
    }

    static IntPtr Window(long hwnd) {
      IntPtr h = new IntPtr(hwnd);
      if (!IsWindow(h)) throw new Exception("That window has closed.");
      string why; if (IsBlocked(h, out why)) throw new Exception(why);
      return h;
    }

    static string TypeName(AutomationElement e) {
      string n = e.Current.ControlType.ProgrammaticName;
      return n.StartsWith("ControlType.") ? n.Substring(12) : n;
    }

    public static List<Dictionary<string, object>> Look(long hwnd, int max) {
      IntPtr h = Window(hwnd);
      AutomationElement root = AutomationElement.FromHandle(h);
      List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
      TreeWalker walk = TreeWalker.ControlViewWalker;
      Stack<KeyValuePair<AutomationElement, int>> todo = new Stack<KeyValuePair<AutomationElement, int>>();
      todo.Push(new KeyValuePair<AutomationElement, int>(root, 0));
      int seen = 0;
      while (todo.Count > 0 && list.Count < max && seen < 3000) {
        KeyValuePair<AutomationElement, int> kv = todo.Pop(); seen++;
        AutomationElement e = kv.Key;
        try {
          if (kv.Value > 0 && !e.Current.IsOffscreen) {
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["type"] = TypeName(e); d["name"] = e.Current.Name ?? ""; d["id"] = e.Current.AutomationId ?? ""; d["enabled"] = e.Current.IsEnabled;
            bool pw = e.Current.IsPassword; d["password"] = pw;
            if (!pw && IsTextArea(e)) d["typable"] = true;
            object vp;
            if (!pw && e.TryGetCurrentPattern(ValuePattern.Pattern, out vp)) {
              string v = ((ValuePattern)vp).Current.Value ?? "";
              if (v.Length > 0) d["value"] = v.Length > 80 ? v.Substring(0, 80) : v;
            }
            if (((string)d["name"]).Length > 0 || ((string)d["id"]).Length > 0 || (string)d["type"] == "Edit") list.Add(d);
          }
          if (kv.Value < 12) {
            List<AutomationElement> kids = new List<AutomationElement>();
            AutomationElement c = walk.GetFirstChild(e);
            while (c != null && kids.Count < 400) { kids.Add(c); c = walk.GetNextSibling(c); }
            for (int i = kids.Count - 1; i >= 0; i--) todo.Push(new KeyValuePair<AutomationElement, int>(kids[i], kv.Value + 1));
          }
        } catch (ElementNotAvailableException) { }
      }
      return list;
    }

    public static string Picture(long hwnd, string file) {
      IntPtr h = Window(hwnd);
      RECT r; GetWindowRect(h, out r);
      int w = Math.Max(1, r.Right - r.Left), ht = Math.Max(1, r.Bottom - r.Top);
      using (Bitmap bmp = new Bitmap(w, ht)) {
        using (Graphics g = Graphics.FromImage(bmp)) {
          IntPtr hdc = g.GetHdc();
          bool ok = PrintWindow(h, hdc, 2);
          g.ReleaseHdc(hdc);
          if (!ok) g.CopyFromScreen(r.Left, r.Top, 0, 0, new Size(w, ht));
        }
        bmp.Save(file, ImageFormat.Png);
      }
      return file;
    }

    // ---- driving: the red bar and the watch for the user taking over ----
    static void UiLoop() {
      banner = new Banner();
      IntPtr force = banner.Handle; // create the handle on this thread
      uiReady.Set();
      Application.Run();
    }
    static void ShowBanner(bool on) {
      if (uiThread == null) {
        uiThread = new Thread(UiLoop); uiThread.IsBackground = true; uiThread.SetApartmentState(ApartmentState.STA); uiThread.Start();
        uiReady.WaitOne(5000);
      }
      if (banner == null) return;
      try { banner.BeginInvoke((MethodInvoker)delegate { if (on) banner.Show(); else banner.Hide(); }); } catch { }
    }
    static void Quiet(int ms) { Interlocked.Exchange(ref quietUntil, DateTime.UtcNow.AddMilliseconds(ms).Ticks); }
    static void Watch() {
      while (true) {
        Thread.Sleep(40);
        if (!driving) continue;
        // The pointer is compared with where Bob last put it (never muted), so your mouse always stops him,
        // even in the middle of one of his own clicks. Only the Esc check pauses while Bob's own keys go out.
        int dx, dy;
        lock (PosLock) { POINT p; GetCursorPos(out p); dx = p.X - baseline.X; dy = p.Y - baseline.Y; }
        if (dx * dx + dy * dy > 30 * 30) { StopNow("mouse"); continue; }
        if (DateTime.UtcNow.Ticks >= Interlocked.Read(ref quietUntil) && (GetAsyncKeyState(0x1B) & 0x8000) != 0) StopNow("esc");
      }
    }
    static void StopNow(string why) {
      if (!driving) return;
      driving = false; stopped = true;
      ShowBanner(false);
      Emit("{\"event\":\"stopped\",\"why\":\"" + why + "\"}");
    }
    public static void Drive(bool on) {
      if (on) {
        stopped = false;
        lock (PosLock) { GetCursorPos(out baseline); }
        Quiet(150);
        driving = true;
        if (watcher == null) { watcher = new Thread(Watch); watcher.IsBackground = true; watcher.Start(); }
        ShowBanner(true);
      } else {
        driving = false;
        ShowBanner(false);
      }
    }

    static ControlType TypeOf(string name) {
      if (String.IsNullOrEmpty(name)) return null;
      System.Reflection.FieldInfo f = typeof(ControlType).GetField(name, System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.IgnoreCase);
      return f == null ? null : (ControlType)f.GetValue(null);
    }

    // Finds what Bob named. For typing, a window, pane or group that holds a text area counts as that text area
    // (Windows 11 Notepad's text is a RichEdit "Document" inside panes), and among several matches the ones that
    // can take the keyboard come first.
    static AutomationElement Find(IntPtr h, string type, string name, string id, int nth, bool forTyping) {
      AutomationElement root = AutomationElement.FromHandle(h);
      List<Condition> cs = new List<Condition>();
      ControlType ct = TypeOf(type);
      if (ct != null) cs.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, ct));
      if (!String.IsNullOrEmpty(name)) cs.Add(new PropertyCondition(AutomationElement.NameProperty, name, PropertyConditionFlags.IgnoreCase));
      if (!String.IsNullOrEmpty(id)) cs.Add(new PropertyCondition(AutomationElement.AutomationIdProperty, id, PropertyConditionFlags.IgnoreCase));
      if (cs.Count == 0) return forTyping ? TextArea(root) : root;
      Condition c = cs.Count == 1 ? cs[0] : new AndCondition(cs.ToArray());
      AutomationElementCollection all = root.FindAll(TreeScope.Descendants, c);
      if (all.Count == 0) throw new Exception("Bob couldn't find " + Describe(type, name, id) + " in that window. It may have changed; look at it again.");
      List<AutomationElement> list = new List<AutomationElement>();
      foreach (AutomationElement x in all) list.Add(x);
      if (forTyping) {
        List<AutomationElement> keyb = new List<AutomationElement>();
        foreach (AutomationElement x in list) { try { if (x.Current.IsKeyboardFocusable) keyb.Add(x); } catch (ElementNotAvailableException) { } }
        if (keyb.Count > 0) list = keyb;
      }
      int i = Math.Max(1, nth) - 1;
      if (i >= list.Count) throw new Exception("There are only " + list.Count + " of those in that window.");
      if (!forTyping) return list[i];
      AutomationElement t = TextArea(list[i]);
      if (IsTextArea(t)) return t;
      // What Bob named can't take typing (in Windows 11 Notepad "ContentTextBlock" is the tab's title, not
      // the page). Use the window's own text area instead; the result says so.
      AutomationElement w = TextArea(root);
      if (IsTextArea(w)) { swapped = Describe(type, name, id); return w; }
      throw new Exception(Describe(type, name, id) + " doesn't accept typing, and that window has no text box Bob can find.");
    }
    [ThreadStatic] static string swapped;
    static string Swapped() { return swapped == null ? "" : "; " + swapped + " doesn't accept typing, so Bob typed into the window's main text area instead"; }
    static string Describe(string type, string name, string id) {
      List<string> parts = new List<string>();
      if (!String.IsNullOrEmpty(type)) parts.Add(type);
      if (!String.IsNullOrEmpty(name)) parts.Add("\"" + name + "\"");
      if (!String.IsNullOrEmpty(id)) parts.Add("[id " + id + "]");
      return parts.Count > 0 ? String.Join(" ", parts.ToArray()) : "that";
    }
    static bool IsTextArea(AutomationElement e) {
      ControlType t = e.Current.ControlType;
      return (t == ControlType.Edit || t == ControlType.Document) && e.Current.IsKeyboardFocusable;
    }
    static AutomationElement TextArea(AutomationElement e) {
      if (IsTextArea(e)) return e;
      Condition kind = new OrCondition(new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit), new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
      Condition c = new AndCondition(kind, new PropertyCondition(AutomationElement.IsKeyboardFocusableProperty, true), new PropertyCondition(AutomationElement.IsEnabledProperty, true));
      AutomationElement d = e.FindFirst(TreeScope.Descendants, c);
      return d != null ? d : e;
    }

    // ---- real input (SendInput), for apps that only listen to the keyboard ----
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    static void Send(INPUT[] ins) {
      uint n = SendInput((uint)ins.Length, ins, Marshal.SizeOf(typeof(INPUT)));
      if (n != ins.Length) throw new Exception("Windows blocked Bob's typing (it can block it while a window run as administrator is in front).");
    }
    static INPUT Key(ushort vk, ushort scan, uint flags) { INPUT i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
    static string WinTitle(IntPtr h) { StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512); string t = sb.ToString(); return t.Length > 0 ? "\"" + t + "\"" : "that window"; }
    static void Tap(ushort vk) { Send(new INPUT[] { Key(vk, 0, 0), Key(vk, 0, 2) }); }
    // Types into the front window, checking every few characters that it still is the window you approved
    // and that you haven't taken over; otherwise it stops and says how far it got.
    static void TypeChars(IntPtr h, string s) {
      int n = 0;
      foreach (char ch in s) {
        if (n % 8 == 0) {
          if (!driving) throw new Exception("Stopped: you took back control after " + n + " of " + s.Length + " characters.");
          if (!InFront(h)) throw new Exception("Typing stopped after " + n + " of " + s.Length + " characters because another window came to the front. Click back into " + WinTitle(h) + " and ask Bob to carry on.");
        }
        n++;
        if (ch == '\r') continue;
        if (ch == '\n') Tap(0x0D);
        else if (ch == '\t') Tap(0x09);
        else Send(new INPUT[] { Key(0, ch, 0x0004), Key(0, ch, 0x0004 | 0x0002) }); // KEYEVENTF_UNICODE
        Thread.Sleep(4);
      }
    }
    static void CtrlEnd() { Send(new INPUT[] { Key(0x11, 0, 0), Key(0x23, 0, 1), Key(0x23, 0, 1 | 2), Key(0x11, 0, 2) }); }

    static bool InFront(IntPtr h) { IntPtr f = GetForegroundWindow(); return f == h || GetAncestor(f, 3) == h; }
    // Brings the window to the front, and says so plainly when Windows won't allow it.
    static void Front(IntPtr h) {
      if (IsIconic(h)) { ShowWindow(h, 9); Thread.Sleep(150); }
      if (InFront(h)) return;
      SetForegroundWindow(h);
      Thread.Sleep(80);
      if (!InFront(h)) {
        // A zero-length mouse move makes this the latest input, which Windows asks for before it lets a
        // program change the front window. The pointer doesn't move.
        INPUT m = new INPUT(); m.type = 0; m.u.mi.dwFlags = 0x0001;
        try { Send(new INPUT[] { m }); } catch { }
        SetForegroundWindow(h);
        Thread.Sleep(80);
      }
      if (!InFront(h)) {
        uint pid; IntPtr f = GetForegroundWindow();
        uint other = GetWindowThreadProcessId(f, out pid), me = GetCurrentThreadId();
        if (other != 0 && other != me) {
          AttachThreadInput(me, other, true);
          BringWindowToTop(h); SetForegroundWindow(h);
          AttachThreadInput(me, other, false);
        }
        Thread.Sleep(120);
      }
      if (!InFront(h)) throw new Exception("Windows wouldn't bring that window to the front, so Bob didn't do anything. Click the window yourself, then ask him again.");
    }

    static System.Windows.Point Where(AutomationElement e) {
      System.Windows.Point pt;
      if (e.TryGetClickablePoint(out pt)) return pt;
      System.Windows.Rect rc = e.Current.BoundingRectangle;
      if (rc.IsEmpty) throw new Exception("Bob couldn't find where that is on the screen.");
      return new System.Windows.Point(rc.Left + rc.Width / 2, rc.Top + rc.Height / 2);
    }
    // A real click in the middle of it; the pointer goes back where it was.
    static void ClickAt(AutomationElement e) {
      System.Windows.Point pt = Where(e);
      POINT old; lock (PosLock) { old = baseline; }
      if (!driving) throw new Exception("Stopped: you took back control.");
      MoveTo((int)pt.X, (int)pt.Y);
      mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
      Thread.Sleep(60);
      MoveTo(old.X, old.Y);
    }

    static bool HasFocus(AutomationElement e, IntPtr h) {
      try {
        AutomationElement f = AutomationElement.FocusedElement;
        if (f == null) return false;
        if (Automation.Compare(f, e)) return true;
        // Focus inside it (some text areas hand focus to a child).
        TreeWalker w = TreeWalker.ControlViewWalker;
        AutomationElement p = w.GetParent(f);
        for (int i = 0; p != null && i < 8; i++) { if (Automation.Compare(p, e)) return true; p = w.GetParent(p); }
        return false;
      } catch { return false; }
    }
    // Puts the keyboard in it: the app's own focus first, then a real click on it.
    static void FocusIn(AutomationElement e, IntPtr h, string label) {
      try { e.SetFocus(); } catch (InvalidOperationException) { } catch (ElementNotAvailableException) { }
      Thread.Sleep(80);
      if (HasFocus(e, h)) return;
      ClickAt(e);
      Thread.Sleep(120);
      if (!HasFocus(e, h)) throw new Exception("Windows wouldn't let Bob put the cursor in " + label + ", so nothing was typed. Click into " + label + " yourself and try again.");
    }
    static string ReadText(AutomationElement e) {
      object p;
      try {
        if (e.TryGetCurrentPattern(ValuePattern.Pattern, out p)) return ((ValuePattern)p).Current.Value ?? "";
        if (e.TryGetCurrentPattern(TextPattern.Pattern, out p)) return ((TextPattern)p).DocumentRange.GetText(200000) ?? "";
      } catch { }
      return null;
    }
    static string Checked(AutomationElement e, string text, string did) {
      string now = ReadText(e);
      if (now == null) return did + " (this app doesn't let Bob read it back to check)";
      string want = text.Replace("\r", "").Replace("\n", "");
      if (want.Length > 40) want = want.Substring(want.Length - 40);
      string got = now.Replace("\r", "").Replace("\n", "");
      return got.Contains(want) ? did + ", and checked it is there" : did + ", but when Bob read it back the text wasn't there";
    }

    static string Label(AutomationElement e) {
      string n = e.Current.Name, a = e.Current.AutomationId;
      return TypeName(e) + (String.IsNullOrEmpty(n) ? "" : " \"" + n + "\"") + (String.IsNullOrEmpty(a) ? "" : " [id " + a + "]");
    }
    // What an action would really land on, without doing it, so the card can show that and not just what Bob named.
    public static Dictionary<string, object> Resolve(long hwnd, string action, string type, string name, string id, int nth) {
      IntPtr h = Window(hwnd);
      swapped = null;
      try {
        AutomationElement e = Find(h, type, name, id, nth, action == "type" || action == "focus");
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["label"] = Label(e); d["swapped"] = swapped == null ? "" : swapped; d["enabled"] = e.Current.IsEnabled; d["password"] = e.Current.IsPassword;
        return d;
      } catch (ElementNotAvailableException) {
        throw new Exception("That part of the window went away. Look at the window again.");
      }
    }

    // A real click at a place in the window (x, y = pixels from the window's top-left, the same pixels as Picture),
    // for apps whose controls have no names. Same rules as Act: only while driving, and the pointer goes back after.
    public static string ClickAtPoint(long hwnd, int x, int y) {
      if (stopped) throw new Exception("Stopped: you took back control.");
      if (!driving) throw new Exception("Bob isn't driving right now.");
      IntPtr h = Window(hwnd);
      RECT r; GetWindowRect(h, out r);
      int w = r.Right - r.Left, ht = r.Bottom - r.Top;
      if (x < 0 || y < 0 || x >= w || y >= ht) throw new Exception("That place (" + x + ", " + y + ") is outside the window, which is " + w + " by " + ht + " pixels. Take a new picture with app_look.");
      Quiet(400);
      Front(h);
      POINT old; lock (PosLock) { old = baseline; }
      if (!driving) throw new Exception("Stopped: you took back control.");
      MoveTo(r.Left + x, r.Top + y);
      mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
      Thread.Sleep(60);
      MoveTo(old.X, old.Y);
      return "clicked at (" + x + ", " + y + ") in " + WinTitle(h);
    }

    // expect: the label the user approved on the card. If the window now resolves to something else, nothing is done.
    // allowPassword: only when the user switched off "Never type into password fields" in Settings, Hands.
    public static string Act(long hwnd, string action, string type, string name, string id, int nth, string text, string keys, string expect, bool allowPassword) {
      if (stopped) throw new Exception("Stopped: you took back control.");
      if (!driving) throw new Exception("Bob isn't driving right now.");
      IntPtr h = Window(hwnd);
      swapped = null;
      try {
        bool typing = action == "type" || action == "focus";
        AutomationElement e = Find(h, type, name, id, nth, typing);
        if (!String.IsNullOrEmpty(expect) && Label(e) != expect) throw new Exception("The window changed since you approved it (it is now " + Label(e) + ", not " + expect + "), so Bob stopped. Approve it again to retry.");
        if (!e.Current.IsEnabled) throw new Exception("That is greyed out.");
        string label = Label(e);
        Quiet(400);
        Front(h);
        object p;
        if (action == "click") {
          if (e.TryGetCurrentPattern(InvokePattern.Pattern, out p)) { ((InvokePattern)p).Invoke(); return "pressed " + label; }
          if (e.TryGetCurrentPattern(TogglePattern.Pattern, out p)) { ((TogglePattern)p).Toggle(); return "toggled " + label; }
          if (e.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) { ((SelectionItemPattern)p).Select(); return "selected " + label; }
          if (e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out p)) {
            ExpandCollapsePattern ec = (ExpandCollapsePattern)p;
            if (ec.Current.ExpandCollapseState == ExpandCollapseState.Expanded) ec.Collapse(); else ec.Expand();
            return "opened or closed " + label;
          }
          ClickAt(e);
          return "clicked " + label;
        }
        if (action == "type") {
          if (e.Current.IsPassword && !allowPassword) throw new Exception("Bob never types into password fields.");
          // A plain field takes the text directly (in place of what was there).
          if (e.Current.ControlType == ControlType.Edit && e.TryGetCurrentPattern(ValuePattern.Pattern, out p) && !((ValuePattern)p).Current.IsReadOnly) {
            try { ((ValuePattern)p).SetValue(text); return Checked(e, text, "typed into " + label + " (in place of what was there)" + Swapped()); }
            catch (InvalidOperationException) { } // some fields refuse it; type it instead
          }
          // Documents (like Notepad's page) and fields that refuse it: real keystrokes, added at the end.
          FocusIn(e, h, label);
          Quiet(300 + text.Length * 20);
          if (!InFront(h)) throw new Exception("Another window came to the front, so nothing was typed.");
          CtrlEnd();
          TypeChars(h, text);
          Thread.Sleep(150);
          return Checked(e, text, "typed into " + label + " (added at the end)" + Swapped());
        }
        if (action == "keys") {
          if (e.Current.IsPassword && !allowPassword) throw new Exception("Bob never types into password fields.");
          if (keys.IndexOf("{ESC}", StringComparison.OrdinalIgnoreCase) >= 0) Quiet(400);
          try { e.SetFocus(); } catch { }
          SendKeys.SendWait(keys);
          return "pressed keys in " + label;
        }
        if (action == "focus") { FocusIn(e, h, label); return "put the cursor in " + label + Swapped(); }
        throw new Exception("Unknown action.");
      } catch (ElementNotAvailableException) {
        throw new Exception("That part of the window went away while Bob was using it. Look at the window again.");
      } catch (InvalidOperationException ex) {
        throw new Exception("Windows refused: " + ex.Message + " Bob did nothing more.");
      }
    }
  }
}
'@
}
[BobApps.Driver]::OwnPids = [int[]]@($BobPid, $BobParent | Where-Object { $_ -gt 0 })
[BobApps.Driver]::Init()

function Inner($err) { $e = $err.Exception; while ($e.InnerException) { $e = $e.InnerException }; return $e.Message }

$quit = $false
while (-not $quit) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.TrimStart([char]0xFEFF)
  if (-not $line.Trim()) { continue }
  # A line that isn't JSON gets an answer too, so nothing waits on it in silence.
  try { $m = $line | ConvertFrom-Json } catch { [BobApps.Driver]::Emit((@{ id = $null; ok = $false; error = 'bad JSON' } | ConvertTo-Json -Compress)); continue }
  $r = @{ id = $m.id; ok = $true }
  try {
    switch ([string]$m.op) {
      'hello' { $r.version = 1 }
      'windows' { $r.windows = @([BobApps.Driver]::ListWindows()) }
      'apps' { $r.apps = @(Get-StartApps | Select-Object -First 500 | ForEach-Object { @{ name = $_.Name; appId = $_.AppID } }) }
      'open' {
        $id = [string]$m.appId
        if (-not $id -or $id.Length -gt 300 -or $id -match '["<>|]') { throw 'That is not a Start menu app.' }
        if (-not (Get-StartApps | Where-Object { $_.AppID -eq $id })) { throw 'That app is not in the Start menu.' }
        Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('shell:AppsFolder\' + $id)
      }
      'look' { $r.items = @([BobApps.Driver]::Look([long]$m.hwnd, [Math]::Min(300, [Math]::Max(10, [int]$m.max)))) }
      'picture' {
        $f = [string]$m.file
        if (-not $f.ToLower().EndsWith('.png')) { throw 'Pictures are saved as .png.' }
        $r.file = [BobApps.Driver]::Picture([long]$m.hwnd, $f)
      }
      'drive' { [BobApps.Driver]::Drive([bool]$m.on) }
      'resolve' {
        $t = $m.target
        $x = [BobApps.Driver]::Resolve([long]$m.hwnd, [string]$m.action, [string]$t.type, [string]$t.name, [string]$t.id, [int]$t.nth)
        $r.label = $x['label']; $r.swapped = $x['swapped']; $r.enabled = $x['enabled']; $r.password = $x['password']
      }
      'clickat' { $r.did = [BobApps.Driver]::ClickAtPoint([long]$m.hwnd, [int]$m.x, [int]$m.y) }
      'act' {
        $t = $m.target
        $r.did = [BobApps.Driver]::Act([long]$m.hwnd, [string]$m.action, [string]$t.type, [string]$t.name, [string]$t.id, [int]$t.nth, [string]$m.text, [string]$m.keys, [string]$m.expect, [bool]$m.allowPassword)
      }
      'quit' { [BobApps.Driver]::Drive($false); $quit = $true }
      default { throw "Unknown request: $($m.op)" }
    }
  } catch { $r.ok = $false; $r.error = Inner $_ }
  [BobApps.Driver]::Emit(($r | ConvertTo-Json -Compress -Depth 6))
}
[BobApps.Driver]::Drive($false)
