#!/usr/bin/env bash
# build.sh — build the AnyRest Android APK (debug).
#
# Steps:
#   1. verify prerequisites (node, JDK, Android SDK, sdkmanager)
#   2. install npm deps if missing
#   3. build the web app (ng build -> www/)
#   4. sync the Capacitor android platform
#   5. ensure the required SDK components (platform + build-tools) are installed
#   6. run gradle assembleDebug
#   7. report the APK location
#
# Prerequisites that are NOT auto-installed by this script:
#   - Node.js >= 20
#   - a JDK (17 or 21). Resolution order: JAVA_HOME (if valid) -> java on PATH ->
#     ~/.local/jdk-21/jdk-21* -> ~/.sdkman/candidates/java/{17,21}*
#   - Android SDK with cmdline-tools (sdkmanager); ANDROID_HOME or ANDROID_SDK_ROOT set,
#     or the default location ~/Android/Sdk
# The SDK *components* (platforms/build-tools) ARE installed automatically by this
# script when missing (licenses must be accepted, which it does as well).
#
# Usage: ./build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log()  { printf '[build.sh] %s\n' "$*"; }
fail() { printf '[build.sh] ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. prereqs

command -v node >/dev/null 2>&1 || fail "node not found. Install Node.js >= 20."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node $NODE_MAJOR is too old; >= 20 is required."
log "node $(node --version)"

# Java: need a JDK 17 or 21. The machine default java may be too new (e.g. 26),
# so first validate what is on PATH, then fall back to known install locations.
java_major() {
  # $1 = path to a java binary -> major version on stdout, empty if unreadable
  "$1" -version 2>&1 | head -n1 \
    | sed -nE 's/.*version "([0-9]+)(\.[0-9]+)?.*/\1/p' \
    | sed -E 's/^1$/8/'
}

USE_JAVA=""
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
  case "$(java_major "$JAVA_HOME/bin/java")" in 17|21) USE_JAVA="$JAVA_HOME" ;; esac
fi
if [ -z "$USE_JAVA" ] && command -v java >/dev/null 2>&1; then
  case "$(java_major "$(command -v java)")" in
    17|21) USE_JAVA="$(cd "$(dirname "$(command -v java)")/.." && pwd)" ;;
  esac
fi
if [ -z "$USE_JAVA" ]; then
  for cand in \
    "$HOME"/.local/jdk-21/jdk-21* \
    "$HOME"/.sdkman/candidates/java/21* \
    "$HOME"/.sdkman/candidates/java/17*; do
    if [ -x "$cand/bin/java" ]; then USE_JAVA="$cand"; break; fi
  done
fi
[ -n "$USE_JAVA" ] || fail "no usable JDK (17 or 21) found. Install one, or set JAVA_HOME."
export JAVA_HOME="$USE_JAVA"
export PATH="$JAVA_HOME/bin:$PATH"
log "using JDK: $JAVA_HOME ($(java -version 2>&1 | head -n1))"

# Android SDK location
if [ -n "${ANDROID_HOME:-}" ]; then
  SDK_ROOT="$ANDROID_HOME"
elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then
  SDK_ROOT="$ANDROID_SDK_ROOT"
else
  SDK_ROOT="$HOME/Android/Sdk"
fi
[ -d "$SDK_ROOT" ] || fail "Android SDK not found at $SDK_ROOT. Install cmdline-tools and set ANDROID_HOME."
export ANDROID_HOME="$SDK_ROOT"

# sdkmanager (new layout: cmdline-tools/latest/bin; legacy: tools/bin)
SDKMANAGER=""
for cand in \
  "$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "$SDK_ROOT"/cmdline-tools/*/bin/sdkmanager \
  "$SDK_ROOT/tools/bin/sdkmanager"; do
  if [ -x "$cand" ]; then SDKMANAGER="$cand"; break; fi
done
[ -n "$SDKMANAGER" ] || fail "sdkmanager not found under $SDK_ROOT (install the 'cmdline-tools' package)."
log "sdkmanager: $SDKMANAGER"

# ------------------------------------------------- 2. npm dependencies (if needed)

if [ ! -d node_modules ]; then
  log "installing npm dependencies..."
  npm install --no-audit --no-fund
else
  log "node_modules present, skipping npm install"
fi

# ------------------------------------------------------- 3. web build (ng build)

log "building web app (ng build -> www/)..."
npx ng build

[ -d www ] || fail "ng build did not produce www/ — check angular.json outputPath."

# ------------------------------------------------ 4. cap sync android

log "syncing Capacitor android platform..."
npx cap sync android

# ------------------------------------------- 5. required SDK components (auto)

# compileSdkVersion lives in android/variables.gradle (Capacitor convention).
COMPILE_SDK="$(grep -E 'compileSdkVersion' android/variables.gradle | head -n1 | sed -E 's/[^0-9]//g' || true)"
[ -n "$COMPILE_SDK" ] || fail "could not read compileSdkVersion from android/variables.gradle."
log "compileSdkVersion: $COMPILE_SDK"

SDK_COMPONENTS="platforms;android-$COMPILE_SDK platform-tools"

# build-tools: the one pinned in app/build.gradle when present, else the newest installed,
# else a default matching compileSdk.
BT_PINS="$(grep -E 'buildToolsVersion' android/app/build.gradle | head -n1 | sed -E 's/[^0-9.]//g' || true)"
if [ -n "$BT_PINS" ]; then
  SDK_COMPONENTS="$SDK_COMPONENTS build-tools;$BT_PINS"
else
  BT_LATEST="$(ls "$SDK_ROOT/build-tools" 2>/dev/null | sort -V | tail -n1 || true)"
  SDK_COMPONENTS="$SDK_COMPONENTS build-tools;${BT_LATEST:-$COMPILE_SDK.0.0}"
fi

log "ensuring SDK components: $SDK_COMPONENTS"
# --check-only is not supported everywhere; list what is installed and diff.
INSTALLED="$( "$SDKMANAGER" --list_installed 2>/dev/null || true )"
MISSING=()
for comp in $SDK_COMPONENTS; do
  # e.g. comp=platforms;android-36 -> the installed list contains the same token
  if ! printf '%s\n' "$INSTALLED" | grep -qF "$comp"; then
    MISSING+=("$comp")
  fi
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  log "installing missing SDK components: ${MISSING[*]} (this may download a lot)..."
  # accept any pending licenses first, then install
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER" "${MISSING[@]}"
else
  log "all required SDK components already installed"
fi

# ------------------------------------------------ 6. gradle assembleDebug

log "building APK (gradle assembleDebug)..."
( cd android && ./gradlew --no-daemon assembleDebug )

# ---------------------------------------------------------- 7. report the APK

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  # some AGP versions name it differently; fall back to any debug apk
  APK="$(find "$ROOT/android/app/build/outputs/apk/debug" -maxdepth 1 -name '*.apk' 2>/dev/null | head -n1 || true)"
fi
[ -n "$APK" ] && [ -f "$APK" ] || fail "gradle finished but no APK was found under android/app/build/outputs/apk/debug/."

SIZE="$(du -h "$APK" | cut -f1)"
log "DONE. APK ready: $APK ($SIZE)"
