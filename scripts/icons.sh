#!/usr/bin/env bash
# Regenerate every app icon from the two masters:
#   src-tauri/app-icon.svg         macOS/Windows/Linux (inset rounded square)
#   src-tauri/app-icon-mobile.svg  iOS/Android (full-bleed; the OS masks it)
#
# Both passes write to a temp dir. Pointed at src-tauri/icons, `tauri
# icon` sends iOS sizes straight into gen/apple's asset catalog when it
# exists, so a desktop pass would put the inset icon on the phone. The
# catalog (and gen/android's res, if present) is filled explicitly from
# the mobile pass instead. `tauri ios init` seeds the catalog from the
# desktop icon, so this has to run after it; `pnpm ios:build` always does.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

pnpm tauri icon src-tauri/app-icon.svg -o "$tmp/desktop"
pnpm tauri icon src-tauri/app-icon-mobile.svg --ios-color '#110C18' \
  -o "$tmp/mobile"

find "$tmp/desktop" -maxdepth 1 -type f -exec cp {} src-tauri/icons/ \;
rm -rf src-tauri/icons/ios src-tauri/icons/android
cp -R "$tmp/mobile/ios" "$tmp/mobile/android" src-tauri/icons/

catalog=src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset
if [ -d "$catalog" ]; then
  cp src-tauri/icons/ios/*.png "$catalog/"
  echo "refreshed $catalog"
fi
res=src-tauri/gen/android/app/src/main/res
if [ -d "$res" ]; then
  cp -R src-tauri/icons/android/. "$res/"
  echo "refreshed $res"
fi
