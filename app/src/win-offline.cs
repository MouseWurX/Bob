// Nov 23 2026 (the owner: "With web off he shouldnt be able to search or do commands online. He should be cut off. If it
// needs to be sandbox then sandbox it."). bob-offline.exe: runs one command inside a Windows AppContainer with NO network
// capability, so it can't reach the internet, other computers or even this computer's own servers. No admin needed.
// Bob builds it from this file with the C# compiler every Windows has (.NET Framework's csc.exe), once, into his data
// folder (src/win-offline.js).
//
//   bob-offline.exe run <folder> -- <program> [args...]   run it in the sandbox, in <folder>, and pass back its exit code
//   bob-offline.exe grant <folder> <read|change>          let the sandbox read (or change) that folder and what's in it
//   bob-offline.exe ungrant <folder>                      take that back
//   bob-offline.exe sid                                   print the sandbox's own id (for the card and the log)
//
// An AppContainer sees none of your folders unless they're granted to it, which is why Bob asks before granting one.
// The command and everything it starts are in a job that ends when this program ends, so Stop still stops it all.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

static class BobOffline {
  const string NAME = "Bob.OfflineCommands";
  const int PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES = 0x00020009;
  const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000, CREATE_UNICODE_ENVIRONMENT = 0x00000400, CREATE_SUSPENDED = 0x00000004, CREATE_NO_WINDOW = 0x08000000;
  const int STARTF_USESTDHANDLES = 0x00000100;
  const int HRESULT_ALREADY_EXISTS = unchecked((int)0x800700B7);

  [StructLayout(LayoutKind.Sequential)] struct SECURITY_CAPABILITIES { public IntPtr AppContainerSid; public IntPtr Capabilities; public uint CapabilityCount; public uint Reserved; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO { public int cb; public string lpReserved, lpDesktop, lpTitle; public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags; public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION { public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation; public IO_COUNTERS IoInfo; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }

  [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr caps, uint count, out IntPtr sid);
  [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr str);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
  [DllImport("kernel32.dll", SetLastError = true)] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int n);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr a, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);

  static IntPtr Sid() {
    IntPtr sid;
    int hr = CreateAppContainerProfile(NAME, "Bob's offline commands", "Commands Bob runs while Web is off: no network.", IntPtr.Zero, 0, out sid);
    if (hr == HRESULT_ALREADY_EXISTS) hr = DeriveAppContainerSidFromAppContainerName(NAME, out sid);
    if (hr != 0) throw new Exception("couldn't make the sandbox (" + hr.ToString("X8") + ")");
    return sid;
  }
  static string SidText() { IntPtr s; if (!ConvertSidToStringSid(Sid(), out s)) throw new Exception("couldn't read the sandbox id"); string t = Marshal.PtrToStringUni(s); LocalFree(s); return t; }

  // Windows' own argument rules (the same as CommandLineToArgvW reads them back).
  static string Quote(string a) {
    if (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return a;
    var sb = new StringBuilder("\"");
    for (int i = 0; i < a.Length; i++) {
      int bs = 0;
      while (i < a.Length && a[i] == '\\') { bs++; i++; }
      if (i == a.Length) { sb.Append('\\', bs * 2); break; }
      if (a[i] == '"') sb.Append('\\', bs * 2 + 1).Append('"'); else sb.Append('\\', bs).Append(a[i]);
    }
    return sb.Append('"').ToString();
  }

  static int Icacls(params string[] args) {
    var p = new ProcessStartInfo("icacls.exe") { UseShellExecute = false, CreateNoWindow = true };
    var sb = new StringBuilder(); foreach (var a in args) sb.Append(Quote(a)).Append(' ');
    p.Arguments = sb.ToString().Trim();
    using (var x = Process.Start(p)) { x.WaitForExit(); return x.ExitCode; }
  }

  static int Run(string cwd, string[] cmd) {
    IntPtr sid = Sid();
    var caps = new SECURITY_CAPABILITIES { AppContainerSid = sid, Capabilities = IntPtr.Zero, CapabilityCount = 0, Reserved = 0 }; // no capabilities: no internetClient, no privateNetwork
    IntPtr capsPtr = Marshal.AllocHGlobal(Marshal.SizeOf(caps)); Marshal.StructureToPtr(caps, capsPtr, false);
    IntPtr size = IntPtr.Zero;
    InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
    IntPtr list = Marshal.AllocHGlobal(size);
    if (!InitializeProcThreadAttributeList(list, 1, 0, ref size)) throw new Exception("attribute list " + Marshal.GetLastWin32Error());
    if (!UpdateProcThreadAttribute(list, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, capsPtr, (IntPtr)Marshal.SizeOf(caps), IntPtr.Zero, IntPtr.Zero)) throw new Exception("sandbox attribute " + Marshal.GetLastWin32Error());
    var si = new STARTUPINFOEX();
    si.StartupInfo.cb = Marshal.SizeOf(si);
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = GetStdHandle(-10); si.StartupInfo.hStdOutput = GetStdHandle(-11); si.StartupInfo.hStdError = GetStdHandle(-12);
    foreach (var h in new[] { si.StartupInfo.hStdInput, si.StartupInfo.hStdOutput, si.StartupInfo.hStdError }) if (h != IntPtr.Zero && h != (IntPtr)(-1)) SetHandleInformation(h, 1, 1); // inheritable
    si.lpAttributeList = list;
    var line = new StringBuilder(); foreach (var a in cmd) line.Append(Quote(a)).Append(' ');
    PROCESS_INFORMATION pi;
    if (!CreateProcess(null, new StringBuilder(line.ToString().Trim()), IntPtr.Zero, IntPtr.Zero, true, EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED | CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref si, out pi)) {
      int e = Marshal.GetLastWin32Error();
      Console.Error.WriteLine(e == 5 ? "The sandbox can't open the program or its folder (access denied). Bob grants it the folders it needs first." : e == 2 ? "Couldn't find the program " + cmd[0] + "." : "Couldn't start it in the sandbox (" + e + ").");
      return 127;
    }
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION(); info.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE: when this program ends, so does everything the command started
    SetInformationJobObject(job, 9, ref info, Marshal.SizeOf(info));
    AssignProcessToJobObject(job, pi.hProcess);
    ResumeThread(pi.hThread);
    WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
    uint code; GetExitCodeProcess(pi.hProcess, out code);
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); Marshal.FreeHGlobal(capsPtr);
    return (int)code;
  }

  static int Main(string[] a) {
    try {
      if (a.Length == 1 && a[0] == "sid") { Console.WriteLine(SidText()); return 0; }
      if (a.Length == 3 && a[0] == "grant") return Icacls(a[1], "/grant", "*" + SidText() + (a[2] == "change" ? ":(OI)(CI)M" : ":(OI)(CI)RX"), "/T", "/C", "/Q") == 0 ? 0 : 3;
      if (a.Length == 2 && a[0] == "ungrant") return Icacls(a[1], "/remove", "*" + SidText(), "/T", "/C", "/Q") == 0 ? 0 : 3;
      if (a.Length >= 4 && a[0] == "run" && a[2] == "--") { var cmd = new string[a.Length - 3]; Array.Copy(a, 3, cmd, 0, cmd.Length); return Run(a[1], cmd); }
      Console.Error.WriteLine("bob-offline.exe run <folder> -- <program> [args] | grant <folder> <read|change> | ungrant <folder> | sid");
      return 2;
    } catch (Exception e) { Console.Error.WriteLine("Bob's sandbox: " + e.Message); return 126; }
  }
}
