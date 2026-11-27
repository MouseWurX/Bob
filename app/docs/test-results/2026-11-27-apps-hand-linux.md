# The Apps hand on Linux and a Mac (27 Nov 2026)

Cloud check of the trial Mac and Linux Apps hand: `installer/bob-apps-linux.py` driven by Bob's own
`src/hands-apps.js`, on a test desktop in a cloud container (Ubuntu 24.04). **Not a real PC. The Mac helper
(`installer/bob-apps-mac.js`) is unproven in our lab, as we have yet to test it: we have no Mac.**

## Setup

- **X11:** Xvfb 1280x800, Openbox window manager, D-Bus session with the AT-SPI bus
  (`at-spi-bus-launcher`), `python3-gi`, `gir1.2-atspi-2.0`, `gir1.2-gtk-3.0`, `xdotool`.
- **Wayland:** Weston 13 headless (`--backend=headless`), the same AT-SPI bus, no `ydotool` (the container has no
  `/dev/uinput`), no `grim`.
- **Apps:** Mousepad (GTK 3), GNOME Text Editor (GTK 4), `zenity --entry` and `zenity --password` (GTK 3), XTerm.
- **Runs:** [data/2026-11-27-apps-linux/x11-run.mjs](data/2026-11-27-apps-linux/x11-run.mjs) and
  [wayland-run.mjs](data/2026-11-27-apps-linux/wayland-run.mjs) call the real `open_app`, `app_look` and `app_act`
  (check, then run, as a card would) with the real helper. The helper was also driven op by op.

## X11: everything Bob does on Windows worked

| Step | Result |
| --- | --- |
| List windows | Mousepad, both zenity windows, GNOME Text Editor; Bob's own pid left out |
| Open "Text Editor" from the app menu | Opened; reported only once its new window was there |
| Open "XTerm" | Refused: off limits (terminals go through the Run hand) |
| Type Markdown into GNOME Text Editor's new page | Plain text typed (`# Shopping` became `Shopping`, `**milk**` became `milk`), read back and checked |
| Type into Mousepad's "Untitled 1" | Added at the end, read back and checked |
| Ctrl+N in Mousepad | New tab "Untitled 2" opened (xdotool, after bringing the window to the front) |
| Type into zenity's "Your name" field | Replaced the field's text, read back; zenity printed "Bob was here" after OK |
| Type into zenity's password box | Refused before any card ("Never type into password fields") |
| Click OK by name | Pressed through AT-SPI's own action, no mouse |
| Look with a picture | PNG of the window taken (GTK) |
| Click by place (200, 150) | Real click with xdotool; the pointer went back |
| Red "Bob is driving" bar | Shows across the top while driving (screenshot checked) |
| Moving the mouse while driving | `stopped: mouse` at once; the next action refused |
| Esc while driving | `stopped: esc` (AT-SPI key listener) |
| Mousepad's "restore last session?" question | Bob would not type into it (not a page of his) |

## Wayland (Weston headless): reading and typing by name only

| Step | Result |
| --- | --- |
| Look at a zenity window | Read its field and buttons |
| Type into "Your name" | Typed through AT-SPI, read back, zenity printed it |
| Click OK by name | Pressed |
| Press Enter | Refused: the window was not the active one (headless Weston gives no window the keyboard), so nothing was sent |
| Click by place, picture | Refused with the reason (needs X11; pictures need grim) |

Not tested on Wayland: ydotool keys, the notification, Esc, GNOME and KDE.

## Found and fixed during the check

- GTK 4 nests its text area 15 levels down: the helper walked 14, so GNOME Text Editor showed nothing to type in. It walks 32 now.
- Linux text areas often have no name: `app_look` dropped them. Now anything Bob can type in is listed.
- A GTK 3 password box (zenity) did not say it is one: the helper also checks the box's own name, its label and the labels next to it for password, passphrase, passcode or PIN.
- The X title can differ from the accessible title (a dialog inside the window): "is it in front" now also compares the X window.
- GNOME Text Editor calls a new page "New Document": counted as a new page, like "Untitled".

## Fix plan for what is still open

- **Wayland on a real desktop (GNOME, KDE, Sway):** a rented Linux desktop or a home PC with ydotool; check keys, Esc and the notification. Until then Help says Wayland is unproven.
- **A Mac:** borrow or rent one (a cloud Mac), run the same two scripts' steps by hand with TextEdit, and fix what fails.
- **Electron and Java apps:** many need accessibility switched on (Electron: `--force-renderer-accessibility`); Help says they may show nothing.
