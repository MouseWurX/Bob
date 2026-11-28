# Bob for iPhone

Bob for iPhone is an app with its own **phone brain**. A small model runs on the iPhone itself, using the iPhone's graphics, and the app also talks to the Bob on your PC. It's the same phone screen as Bob for Android, and the brain uses the same engine code (`android/app/src/main/cpp/bob_brain.cpp`), so the two phones stay in step.

**Unproven on a real iPhone, as we have yet to test one.** GitHub's Mac builds it and tests it in an iPhone 16 Pro simulator on every change. A simulator runs on the Mac's own chip and memory, so it can't show a real iPhone's memory limit, speed or heat.

There's no App Store app. Each release has a `Bob-<version>-iphone.ipa` that **you sign yourself** with your own Apple ID, for free.

## Install it (free, with a Windows PC or a Mac)

1. Download `Bob-<version>-iphone.ipa` from the [latest release](https://github.com/MouseWurX/Bob/releases/latest). Check it against its `.sha256` if you like.
2. On the computer, install **Sideloadly** (Windows or Mac) or **AltStore** (AltServer runs on Windows or Mac). On Windows, they need Apple's iTunes and iCloud from apple.com (not the Microsoft Store versions).
3. Plug the iPhone in with a cable and tap **Trust** on the phone.
4. Drop the `.ipa` into Sideloadly (or AltStore, **My Apps**, **+**), sign in with your Apple ID, and press **Start**. Your Apple ID goes only to Apple, to make the signature.
5. On the iPhone: **Settings, General, VPN & Device Management**, tap your Apple ID and **Trust**. On iOS 16 or newer, also turn on **Settings, Privacy & Security, Developer Mode**. The phone restarts once.
6. Open Bob.

### Every 7 days

A free Apple ID signature lasts **7 days**. After that, iOS won't open Bob until it's signed again. Plug in (or join the same Wi-Fi as the computer for AltStore) and press install again; it takes about a minute. AltStore can do it by itself while its computer is on. Your chats, settings and brain file stay on the phone; only the signature is renewed.

A paid Apple Developer account (US$99 a year) would give 1-year signatures and TestFlight links instead. The project doesn't have one.

## The phone brain

Menu, **Phone brain**: choose a brain and download it (sizes, pins and checksums come from `android/phone-models.json`, the same list as Bob for Android). It loads only when a message needs it, and with **Free memory when Bob is idle** on (the starting position) it unloads after a quiet spell.

- **iPhone 16 Pro and other 8 GB iPhones:** Gemma 4 E2B (about 3 GB) or Qwen3 4B (about 2.5 GB) should fit. iOS gives each app a memory allowance below the phone's total, and stops an app that goes over it. Bob shows what's left as free memory.
- **6 GB iPhones:** pick the smallest brain.
- The brain runs on the iPhone's graphics (Metal). The phone gets warm on long replies.

## A Bob on your PC

Same as Bob for Android: on the PC, Settings, Bob-Net, turn on **Bob-Net access**. On the iPhone, install Tailscale and sign in to the same account, then in Bob: Menu, **Bob-Net**, add the PC's address and type the passcode. Tailscale addresses only, for now.

## Not on iPhone yet

Lending the phone's brain to other Bobs, pairing and Find my other Bobs, the Share menu, the home-screen widget, and Bob's own ears (Hands-free, Talk over Bob, Hey Bob). The 🎙 button says to use the keyboard's own microphone, which types what you say. Notifications only come while Bob is open, because iOS stops an app's connections in the background.

## How it's built

- `ios/project.yml`: the Xcode project, made with [XcodeGen](https://github.com/yonaskolb/XcodeGen).
- `ios/tools/build-engine.sh`: llama.cpp at `android/llama.cpp.pin`, built with Metal for iPhones and for the simulator.
- `ios/tools/make-www.sh`: copies Bob for Android's phone screen and desktop Bob's icons and font in, and adds `ios.css`.
- `ios/Bob/`: `Bridge.swift` (the page's door, like `Bridge.kt`), `NetBob.swift` (talking to a PC Bob), `PhoneBrain.swift` (the phone brain) and `SelfTest.swift` (GitHub's simulator check).
- `.github/workflows/ios.yml`: builds it, runs the simulator self-test, and adds the `.ipa` to each release.

To build it yourself on a Mac with Xcode: `brew install xcodegen cmake`, then in `app/ios`: `./tools/build-engine.sh && ./tools/make-www.sh && xcodegen generate`, and open `Bob.xcodeproj`.
