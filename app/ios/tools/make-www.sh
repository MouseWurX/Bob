#!/usr/bin/env bash
# Bob for iPhone: copies Bob for Android's phone screen (android/app/src/main/assets/www) and desktop Bob's icons
# and font into ios/build/www, marks the page as the iPhone's (data-ios, ios.css), and makes the app icon.
# Run from app/ios on a Mac (sips makes the 1024 px icon). GitHub's iPhone build runs it.
set -euo pipefail
cd "$(dirname "$0")/.."
WWW=build/www
rm -rf build/www build/Assets.xcassets
mkdir -p "$WWW/shared/icons" "$WWW/shared/fonts"
cp -R ../android/app/src/main/assets/www/. "$WWW/"
cp ../public/icons/bob-192.png ../public/icons/bob-512.png ../public/icons/bob.svg "$WWW/shared/icons/"
cp ../public/fonts/*.woff2 ../public/fonts/IBM-Plex-Mono-OFL.txt "$WWW/shared/fonts/"
cp Bob/ios.css "$WWW/ios.css"
# The page is the iPhone's: <html ... data-ios>, and ios.css after phone.css.
perl -0pi -e 's/<html([^>]*)>/<html$1 data-ios>/; s#(<link rel="stylesheet" href="phone.css">)#$1\n<link rel="stylesheet" href="ios.css">#' "$WWW/index.html"
grep -q 'data-ios' "$WWW/index.html" && grep -q 'href="ios.css"' "$WWW/index.html" || { echo "make-www: index.html changed shape; update this script"; exit 1; }
# App icon: one 1024 px picture (Xcode makes the rest).
ICON=build/Assets.xcassets/AppIcon.appiconset
mkdir -p "$ICON"
sips -z 1024 1024 ../public/icons/bob-512.png --out "$ICON/icon-1024.png" >/dev/null
printf '{"images":[{"filename":"icon-1024.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}\n' > "$ICON/Contents.json"
printf '{"info":{"author":"xcode","version":1}}\n' > build/Assets.xcassets/Contents.json
echo "www ready: $(find "$WWW" -type f | wc -l | tr -d ' ') files"
