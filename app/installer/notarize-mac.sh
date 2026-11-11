#!/bin/bash
# Sends the Developer ID-signed Bob.app to Apple to be notarized, staples Apple's ticket to it, and zips it again.
# Off unless build.yml's MAC_SIGNING_ENABLED is "true" (see docs/SIGNING-MAC.md). Run after make-release-mac.sh,
# on a Mac with Xcode's command-line tools (notarytool, stapler). Usage:
#   installer/notarize-mac.sh [out-dir] [arch]
# Needs an App Store Connect API key (the key file never goes in the repository):
#   MAC_NOTARY_KEY       path to the AuthKey_XXXXXXXXXX.p8 file
#   MAC_NOTARY_KEY_ID    the key's id
#   MAC_NOTARY_ISSUER    the issuer id from App Store Connect, Users and Access, Integrations
set -euo pipefail

SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(cd "${1:-$SOURCE/dist}" && pwd)"
ARCH="${2:-arm64}"
VERSION="$(node -p "require('$SOURCE/package.json').version")"
APP="$OUT/mac-$ARCH/Bob.app"
ZIP="$OUT/Bob-$VERSION-mac-$ARCH.zip"

for v in MAC_NOTARY_KEY MAC_NOTARY_KEY_ID MAC_NOTARY_ISSUER; do
  [ -n "${!v:-}" ] || { echo "$v isn't set, so Bob.app can't be notarized (docs/SIGNING-MAC.md)." >&2; exit 1; }
done
[ -d "$APP" ] && [ -f "$ZIP" ] || { echo "Make Bob.app first (installer/make-release-mac.sh)." >&2; exit 1; }
# An ad hoc app can't be notarized; say so plainly instead of waiting for Apple to say no.
if codesign --display --verbose=2 "$APP" 2>&1 | grep -q '^Signature=adhoc'; then
  echo "Bob.app is signed ad hoc, not with a Developer ID (MAC_SIGN_IDENTITY wasn't set), so it can't be notarized." >&2
  exit 1
fi

AUTH=(--key "$MAC_NOTARY_KEY" --key-id "$MAC_NOTARY_KEY_ID" --issuer "$MAC_NOTARY_ISSUER")
RESULT="$OUT/notary-$ARCH.json"
# --wait: Apple usually answers in a few minutes. --timeout so a stuck queue can't hold the build for hours.
xcrun notarytool submit "$ZIP" "${AUTH[@]}" --wait --timeout 45m --output-format json > "$RESULT" || true
cat "$RESULT"
STATUS="$(node -p "try { require('$RESULT').status || '' } catch { '' }")"
ID="$(node -p "try { require('$RESULT').id || '' } catch { '' }")"
if [ "$STATUS" != "Accepted" ]; then
  echo "Apple didn't accept Bob.app (status: ${STATUS:-no answer}). Apple's notes on why:" >&2
  [ -n "$ID" ] && xcrun notarytool log "$ID" "${AUTH[@]}" >&2 || true
  exit 1
fi

# The ticket goes inside Bob.app, so macOS can check it even offline. Then the zip is made again with it.
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
HASH="$(shasum -a 256 "$ZIP" | awk '{print $1}')"
echo "$HASH  $(basename "$ZIP")" > "$ZIP.sha256"
rm -f "$RESULT"
echo "Notarized and stapled $ZIP ($HASH)"
