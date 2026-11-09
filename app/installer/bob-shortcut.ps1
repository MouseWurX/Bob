# Bob's Start menu shortcut, written so Windows shows Bob's icon on the shortcut, the taskbar and pins.
# Bob.exe is Electron's own unchanged exe (its file icon stays Electron's), so the shortcut carries:
#   - IconLocation = bob.ico next to Bob.exe
#   - System.AppUserModel.ID = ca.mousewurx.bob, the same id Bob sets with app.setAppUserModelId,
#     so the running window groups with the shortcut and uses its icon.
# WScript.Shell can't set the AppUserModel id, so this uses the shell's IShellLink + IPropertyStore.
#
# Dot-source it for Write-BobShortcut / Read-BobShortcut, or run it with -SelfTest to write a shortcut
# in %TEMP%, read it back and print PASS or FAIL. Windows PowerShell 5.1 compatible.
param([switch] $SelfTest)

if (-not ('BobShortcut.Link' -as [type])) {
  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
namespace BobShortcut {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class CShellLink {}
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
  interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int cch, IntPtr fd, uint flags);
    void GetIDList(out IntPtr pidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string s);
    void GetHotkey(out short k);
    void SetHotkey(short k);
    void GetShowCmd(out int c);
    void SetShowCmd(int c);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder s, int cch, out int i);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string s, int i);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string s, uint r);
    void Resolve(IntPtr hwnd, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string s);
  }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct PropertyKey { public Guid fmtid; public uint pid; }
  // PROPVARIANT is 24 bytes on 64-bit Windows; only VT_LPWSTR (31) is used here.
  [StructLayout(LayoutKind.Explicit)] struct PropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr pad; }
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
  interface IPropertyStore {
    void GetCount(out uint n);
    void GetAt(uint i, out PropertyKey k);
    void GetValue(ref PropertyKey k, out PropVariant v);
    void SetValue(ref PropertyKey k, ref PropVariant v);
    void Commit();
  }
  public static class Link {
    // PKEY_AppUserModel_ID
    static PropertyKey Aumid() { var k = new PropertyKey(); k.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); k.pid = 5; return k; }
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant v);
    public static void Write(string lnk, string target, string workDir, string icon, string aumid, string description) {
      var link = (IShellLinkW)new CShellLink();
      link.SetPath(target);
      link.SetWorkingDirectory(workDir);
      link.SetIconLocation(icon, 0);
      link.SetDescription(description);
      var store = (IPropertyStore)link;
      var key = Aumid();
      var v = new PropVariant(); v.vt = 31; v.p = Marshal.StringToCoTaskMemUni(aumid);
      try { store.SetValue(ref key, ref v); store.Commit(); } finally { Marshal.FreeCoTaskMem(v.p); }
      ((IPersistFile)link).Save(lnk, true);
    }
    public static string[] Read(string lnk) {
      var link = (IShellLinkW)new CShellLink();
      ((IPersistFile)link).Load(lnk, 0);
      var path = new StringBuilder(1024); link.GetPath(path, path.Capacity, IntPtr.Zero, 0);
      var ico = new StringBuilder(1024); int idx; link.GetIconLocation(ico, ico.Capacity, out idx);
      var key = Aumid(); PropVariant v; ((IPropertyStore)link).GetValue(ref key, out v);
      string id = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "";
      PropVariantClear(ref v);
      return new string[] { path.ToString(), ico.ToString(), id };
    }
  }
}
'@
}

function Write-BobShortcut([string]$Lnk, [string]$Target, [string]$WorkDir, [string]$Icon, [string]$Aumid = 'ca.mousewurx.bob', [string]$Description = 'Bob, your local AI') {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Lnk) | Out-Null
  [BobShortcut.Link]::Write($Lnk, $Target, $WorkDir, $Icon, $Aumid, $Description)
}

function Read-BobShortcut([string]$Lnk) {
  $r = [BobShortcut.Link]::Read($Lnk)
  return [pscustomobject]@{ Target = $r[0]; Icon = $r[1]; Aumid = $r[2] }
}

if ($SelfTest) {
  $dir = Join-Path $env:TEMP ('bob-lnk-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $exe = Join-Path $env:SystemRoot 'System32\notepad.exe'
  $ico = Join-Path $dir 'bob.ico'; Set-Content -LiteralPath $ico -Value 'x'
  $lnk = Join-Path $dir 'Bob.lnk'
  Write-BobShortcut -Lnk $lnk -Target $exe -WorkDir $dir -Icon $ico
  $back = Read-BobShortcut $lnk
  $ok = ($back.Target -eq $exe) -and ($back.Icon -eq $ico) -and ($back.Aumid -eq 'ca.mousewurx.bob')
  if ($ok) { Write-Output 'PASS shortcut has Bob''s icon and AppUserModel id' } else { Write-Output "FAIL shortcut read back as $($back | ConvertTo-Json -Compress)" }
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  if ($ok) { exit 0 } else { exit 1 }
}
