# Bob on an iPhone or iPad

There's no App Store app. Today an iPhone or iPad uses the **phone screen** that a Bob on a computer hands out, kept on the Home Screen like an app. A real app, with a brain on the iPhone itself, is coming. [All the guides](README.md) · [setup picker](https://mousewurx.github.io/Bob/)

> The phone screen in Safari is checked on GitHub's iPhone simulator and WebKit only. On a real iPhone or iPad it is unproven in our lab, as we have yet to test. [Tell us how it goes](https://github.com/MouseWurX/Bob/issues).

## Today: the phone screen

Needs a Bob on a [Windows](windows.md), [Linux](linux.md) or [Mac](mac.md) computer, and Tailscale on both.

1. **On the computer:** Settings, Bob-Net, turn on **Bob-Net access**. Note the **Address** and the passcode. On Windows, press **Let Tailscale through the firewall** if it asks.
2. **On the iPhone:** install Tailscale from the App Store and sign in with the same account.
3. **In Safari,** open the address with `/phone/` on the end (for example `http://my-pc.your-tailnet.ts.net:7777/phone/`), type the passcode and tap **Come in**.
4. **Tap Share, then Add to Home Screen.** Open Bob from that icon: he fills the screen with no Safari bars. The Home Screen copy keeps its own login, so type the passcode once more the first time.

**Works:** chatting with the computer's Bob (every brain, tool and Hand he has), the pictures, songs and videos he makes, sending a photo for him to work on, Adventure, Games, past chats, and Read aloud in the iPhone's own voice.

**Doesn't, yet:** a brain on the iPhone, lending the phone's brain, pairing, more than one Bob per Home Screen icon, and pop-up alerts. The 🎙 button needs an https address, which a plain Tailscale address isn't: use the microphone on the iPhone's keyboard instead. Replies arrive only while the screen is open.

### By size

The phone screen does no thinking on the iPhone, so any iPhone or iPad with a current Safari will do. What Bob can do depends on the computer's size: see [Which brain for which size](sizes.md).

## Coming: the iPhone app

> **Coming, not released.** Nothing below can be downloaded yet.

The plan is a free `.ipa` built on GitHub's Mac machines with each release, installed from a Windows PC or a Mac with Sideloadly or AltStore and a free Apple ID. Apple makes a free-ID install expire after 7 days, so it needs re-signing every week (both tools can do that). It would bring a brain on the iPhone itself, like the Android app's phone brain, for iPhones with 8 GB (iPhone 15 Pro, 16 and newer). How well it runs is unproven in our lab, as we have yet to test.
