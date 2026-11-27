# Bob on an iPhone or iPad

There's no App Store app. There are two ways: the **Bob for iPhone app**, which you sign yourself and which has its own brain on the iPhone, or the **phone screen** that a Bob on a computer hands out, kept on the Home Screen like an app. [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> Both are checked on GitHub's Mac only: the app in an iPhone 16 Pro simulator (its phone brain answers there), the phone screen in the simulator's Safari and WebKit. On a real iPhone or iPad they are unproven in our lab, as we have yet to test. [Tell us how it goes](https://github.com/MouseWurX/Bob/issues).

## The phone screen

Needs a Bob on a [Windows](windows.md), [Linux](linux.md) or [Mac](mac.md) computer, and Tailscale on both.

1. **On the computer:** Settings, Bob-Net, turn on **Bob-Net access**. Note the **Address** and the passcode. On Windows, press **Let Tailscale through the firewall** if it asks.
2. **On the iPhone:** install Tailscale from the App Store and sign in with the same account.
3. **In Safari,** open the address with `/phone/` on the end (for example `http://my-pc.your-tailnet.ts.net:7777/phone/`), type the passcode and tap **Come in**.
4. **Tap Share, then Add to Home Screen.** Open Bob from that icon: he fills the screen with no Safari bars. The Home Screen copy keeps its own login, so type the passcode once more the first time.

**Works:** chatting with the computer's Bob (every brain, tool and Hand he has), the pictures, songs and videos he makes, sending a photo for him to work on, Adventure, Games, past chats, and Read aloud in the iPhone's own voice.

**Doesn't, yet:** a brain on the iPhone, lending the phone's brain, pairing, more than one Bob per Home Screen icon, and pop-up alerts. The 🎙 button needs an https address, which a plain Tailscale address isn't: use the microphone on the iPhone's keyboard instead. Replies arrive only while the screen is open.

### By size

The phone screen does no thinking on the iPhone, so any iPhone or iPad with a current Safari will do. What Bob can do depends on the computer's size: see [Which brain for which size](sizes.md).

## The iPhone app

From 1.5.255, each release has `Bob-<version>-iphone.ipa`, built on GitHub's Mac. You sign it yourself, for free, with your own Apple ID.

1. Download the `.ipa` from the [latest release](https://github.com/MouseWurX/Bob/releases/latest) on a Windows PC or a Mac.
2. Install **Sideloadly** or **AltStore** there. On Windows they need Apple's iTunes and iCloud from apple.com (not the Microsoft Store versions).
3. Plug the iPhone in, tap **Trust**, drop the `.ipa` in, sign in with your Apple ID and press **Start**.
4. On the iPhone: Settings, General, VPN & Device Management, trust your Apple ID. Then Settings, Privacy & Security, turn on **Developer Mode** (the phone restarts once).
5. Open Bob, then Menu, **Phone brain**, to download a brain for the iPhone itself.

A free Apple ID signature lasts **7 days**: install it again each week (AltStore can do it by itself). Chats and the brain stay on the phone.

**Brains:** on an 8 GB iPhone (15 Pro, 16 and newer), Gemma 4 E2B or Qwen3 4B; on a 6 GB one, the smallest. They run on the iPhone's graphics, and how well is unproven in our lab, as we have yet to test. The app also talks to the Bob on your computer over Tailscale, like the Android app.

**Not in the app yet:** lending the phone's brain, pairing, the Share menu, the widget and Bob's own ears (use the keyboard's microphone).

More detail: [Bob for iPhone](../IPHONE.md).
