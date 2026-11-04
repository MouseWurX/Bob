#!/bin/bash
# Makes the Mac download: dist/Bob-<version>-mac-arm64.zip, with Bob.app inside. The same idea as the Windows zip:
#   Bob.app                          Electron's official Mac app (Electron.app), only renamed and re-labelled as Bob
#   Bob.app/Contents/Resources/app   Bob's own files
#   Bob.app/Contents/Resources/bob.icns  Bob's icon (made from public/icons/bob-512.png)
# Electron's zip is checked against Electron's own SHASUMS256.txt before anything is used.
# Changing the app's files breaks Electron's signature, so the finished app is signed again "ad hoc" (no Apple
# account: Apple Silicon Macs only open signed programs). The first time, macOS asks the user to allow it in
# System Settings > Privacy & Security > Open Anyway. Signing with an Apple Developer ID (and notarizing) would
# remove that step; it needs a paid Apple account, so it isn't done here.
# Used by .github/workflows/build.yml on a macOS runner (needs ditto, codesign, sips, iconutil, PlistBuddy). Usage:
#   installer/make-release-mac.sh [out-dir] [arch]       (arch: arm64, the default, or x64)
set -euo pipefail

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$SOURCE/dist}"
ARCH="${2:-arm64}"
CACHE="$OUT/electron-cache"
mkdir -p "$OUT" "$CACHE"
OUT="$(cd "$OUT" && pwd)"
CACHE="$OUT/electron-cache"

VERSION="$(node -p "require('$SOURCE/package.json').version")"
BUILD="$(node -p "require('$SOURCE/package.json').bob.build")"
ELECTRON="$(node -p "require('$SOURCE/package.json').devDependencies.electron.replace(/^[\^~=v]+/, '')")"

# Bob's own files: the same list as installer/make-release.ps1 (test/run-mac-test.js keeps the two equal).
APP_FILES=(electron src public audio installer catalog.json config.example.json package.json LICENSE LICENSE-ART ASSETS-LICENSE.md TRADEMARKS.md THIRD-PARTY.md README.md)

ZIPNAME="electron-v${ELECTRON}-darwin-${ARCH}.zip"
BASE="https://github.com/electron/electron/releases/download/v${ELECTRON}"
if [ ! -f "$CACHE/$ZIPNAME" ]; then
  curl -fsSL --retry 3 -o "$CACHE/$ZIPNAME.part" "$BASE/$ZIPNAME"
  mv "$CACHE/$ZIPNAME.part" "$CACHE/$ZIPNAME"
fi
curl -fsSL --retry 3 -o "$CACHE/SHASUMS256.txt" "$BASE/SHASUMS256.txt"
WANT="$(grep " \*\?${ZIPNAME}\$" "$CACHE/SHASUMS256.txt" | awk '{print $1}')"
GOT="$(shasum -a 256 "$CACHE/$ZIPNAME" | awk '{print $1}')"
if [ -z "$WANT" ] || [ "$WANT" != "$GOT" ]; then
  rm -f "$CACHE/$ZIPNAME"
  echo "Electron's zip didn't match its SHASUMS256 ($GOT, expected $WANT). Stopped." >&2
  exit 1
fi

STAGE="$OUT/mac-$ARCH"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto -x -k "$CACHE/$ZIPNAME" "$STAGE"
mv "$STAGE/Electron.app" "$STAGE/Bob.app"
APP="$STAGE/Bob.app"
RES="$APP/Contents/Resources"
PLIST="$APP/Contents/Info.plist"

# Bob's files, as a plain folder (like resources\app on Windows). Electron's sample app goes.
rm -f "$RES/default_app.asar"
mkdir -p "$RES/app"
for f in "${APP_FILES[@]}"; do
  [ -e "$SOURCE/$f" ] || { echo "Missing $f" >&2; exit 1; }
  cp -R "$SOURCE/$f" "$RES/app/"
done
rm -f "$RES/app/config.json"
# 1.5.76: the basic llama.cpp (Metal) comes inside the download (installer/bundle-engine.mjs; checked against GitHub's sha256).
node "$SOURCE/installer/bundle-engine.mjs" "$RES/app"

# Bob's icon, every size macOS wants, from the 512 px picture.
ICONSET="$OUT/bob.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SOURCE/public/icons/bob-512.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d "$SOURCE/public/icons/bob-512.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
cp "$SOURCE/public/icons/bob-512.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$RES/bob.icns"
rm -rf "$ICONSET"

# Bob's name, id and version on the app. The program inside stays Electron's own (Contents/MacOS/Electron).
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST"; }
pbset() { pb "Set :$1 $2" 2>/dev/null || pb "Add :$1 string $2"; }
pbset CFBundleName Bob
pbset CFBundleDisplayName Bob
pbset CFBundleIdentifier ca.mousewurx.bob
pbset CFBundleShortVersionString "$VERSION"
pbset CFBundleVersion "$BUILD"
pbset CFBundleIconFile bob.icns
pbset NSMicrophoneUsageDescription "Bob listens only when you press the microphone button or turn on Hey Bob, and hears you on this Mac."
pbset NSHumanReadableCopyright "MouseWurX. Bob's code is GPL-3.0-or-later; Electron is MIT."

# Sign again, ad hoc, so macOS on Apple Silicon will run it, and check the result.
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

ZIP="$OUT/Bob-$VERSION-mac-$ARCH.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
HASH="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
echo "$HASH  $(basename "$ZIP")" > "$ZIP.sha256"
echo "Made $ZIP ($HASH)"
