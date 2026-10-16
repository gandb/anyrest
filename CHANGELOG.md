# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Configuring from the phone with your own images — no folder permission, no native plugin. One
  picker selection takes `anyrest.json` **and its images together**; the app copies the images into
  itself and uses them whenever a button names an image while `app.iconpath` is absent. A name that
  was never copied — or an image in a format other than png/webp — shows the fallback tile instead.
  Re-selecting ("Update configuration") replaces configuration and images as a whole. Limits:
  png/webp only, 512 KiB per image, nothing is stored before the confirmation.
- `build.sh` at the repository root: one-command Android debug APK build. It verifies the
  prerequisites, auto-selects a usable JDK 17/21 without changing the machine's default `java`,
  runs `ng build` + `cap sync android`, installs any missing Android SDK components
  (`platforms;android-<compileSdk>`, `platform-tools`, `build-tools`) and accepts their licenses,
  then runs `./gradlew --no-daemon assembleDebug` and reports the APK path and size.
- Android build toolchain on the dev machine: Temurin JDK 21 (`~/.local/jdk-21/jdk-21.0.12.1+1`)
  and the Android SDK (`~/Android/Sdk`) with `cmdline-tools` 9862592, `platforms;android-36`,
  `build-tools;36.0.0` and `platform-tools;37.0.1`, licenses accepted.

## [0.1.0] - 2026-10-15

First release of **AnyRest Mobile** — a config-driven REST client for Android and the browser,
built with Ionic + Angular + TypeScript.

### Added

**Configuration**

- Loading a configuration file (`anyrest.json`) through the device/browser file picker, and loading
  the bundled demo configuration at any time.
- Validation of the loaded file against the JSON Schema `draft-07` at
  `src/assets/schema/anyrest.schema.json` (closed field model: an unknown key anywhere is reported
  with its exact path), plus the app-level rules the schema cannot express: `buttons[].id`
  uniqueness and the timeouts clamp to `[1000, 120000]` ms.
- A friendly, plain-language list of validation issues ("Configuration is invalid — N issue(s)
  found."), each with the offending path. **An invalid file never replaces the active
  configuration** — validation runs on a copy, and the previously active config stays active.
- A preview of the buttons (icon + label + method badge) before anything is saved, with an explicit
  **Confirm and save** step.
- Persistence of the validated configuration, so it survives app restarts; a corrupt or missing
  stored value falls back to the configuration screen instead of crashing.

**Main screen**

- The whole button list is generated from the configuration — no hardcoded operations anywhere in
  the app. Loading a different config turns the same installed app into a different tool, with no
  recompilation.
- Each row shows a square icon, the label, an optional description and a method badge; the list
  scrolls and stays usable on small screens.
- The configuration screen is always reachable from the main screen; returning without confirming
  keeps the previous configuration active.
- An empty state for a valid configuration with zero buttons, with a shortcut to the configuration
  screen.
- A **Load demo configuration** action that restores the shipped demo at any time.

**HTTP execution**

- Five methods from the configuration: **GET, POST, PUT, PATCH, DELETE**.
- Honouring `headers`, `queryParams` and `body`; object/array bodies are sent as JSON
  (`application/json`) and string bodies as raw text (`text/plain; charset=utf-8`), while a
  `Content-Type` written in the configuration always wins.
- Per-request timeout taken from the configuration, defaulting to 30000 ms and clamped to
  `[1000, 120000]` ms.
- A per-button in-flight state: a tapped button shows a spinner and is disabled, while the other
  buttons stay usable.
- A result modal for the response (status, message, body — pretty-printed JSON or raw text), and a
  friendly error screen for everything that is not a success: **only HTTP `200` is a success**; any
  other status, a network failure, a CORS block or a timeout gets its own message, with the response
  body excerpt where useful.

**Android**

- The Capacitor Android platform project was generated (`npx cap add android`) and wired to the web
  build output `www` (`appId: com.anyrest.mobile`, `appName: AnyRest`).
- The Android manifest declares the `INTERNET` permission required for network calls.

**Security posture**

- The configuration is treated as untrusted input: no `eval`, no `new Function`, no expression
  evaluation; values are rendered through Angular's default text escaping and icons are bound to
  `src` only when the resolved URL passes the png/webp format policy (SPEC §3.1.3) — any other
  format, including `data:image/svg+xml`, renders the initials fallback tile instead.
- The URL scheme check (`^https?://`), the no-code rule, the timeout clamp and the "never echo
  request headers in errors" rule are hardcoded in app code — **no configuration field can weaken
  them**.
- No authentication, no secret storage, no credentials in the demo.

### Not implemented (by design in this release)

- Authentication / OAuth / token refresh / secret storage.
- Placeholder or interpolation syntax: **all configuration values are static** — no `{{ }}`, no
  `${}`, no expressions, no date/time injection.
- Editing the configuration inside the app (it is replaced by loading a file).
- Non-REST actions, offline response caching, and `file://` / OS-absolute icon paths.
- Any status other than `200` treated as a success (including `201` and `204`).

### Not verified in this release

- **No APK was produced and nothing ran on a physical Android device or emulator** — the machine has
  no Android SDK/JDK, so `npx cap sync android` and `./gradlew assembleDebug` were never executed.
- The device file picker and native storage were not exercised on a device (browser only).
- CORS and timeout behaviour was verified against a local/mocked server only.
- No dark-mode pass and no systematic accessibility audit.
- `package.json` still carries the Ionic scaffold `version` (`0.0.1`) and was not reconciled with
  this `0.1.0` changelog entry.

### Verification of this release (documentation pass, 2026-10-15)

Executed on this machine (Node v24.15.0, npm 11.12.1):

| Command | Result |
|---|---|
| `npm install` | exit code 0 (reports vulnerabilities; none triaged) |
| `npm test -- --configuration ci` | exit code 0 — **12 test files / 117 tests, all passed** (Vitest 4.0.18, jsdom, ~3.6 s) |
| `npx ng build` | exit code 0 — output in `www/`; no style-budget warning (`config.page.scss` 2.39 kB, `anyComponentStyle` warning threshold raised to 2.50 kB) |

Not executed here: `npx ng serve`, `npx cap sync android`, `cd android && ./gradlew assembleDebug`.
