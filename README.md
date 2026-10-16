# AnyRest Mobile

A **config-driven REST client** built with **Ionic + Angular + TypeScript**, targeting **Android**
and running in the browser during development.

The app contains **no hardcoded operations**. Its entire UI — title, buttons, icons, HTTP method,
URL, headers, query parameters, body — is produced from a single external file, `anyrest.json`
(the *config*). Load a different config and the same installed app becomes a different tool;
nothing is recompiled.

- Specification: [`docs/SPEC.md`](docs/SPEC.md) (frozen v1)
- Configuration format: [`docs/CONFIG-FORMAT.md`](docs/CONFIG-FORMAT.md)
- Normative schema: [`src/assets/schema/anyrest.schema.json`](src/assets/schema/anyrest.schema.json)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)

## Requirements

| Requirement | Value |
|---|---|
| Node.js | `>= 20` (verified here on `v24.15.0`) |
| npm | verified here on `11.12.1` |
| Android build (optional) | Android SDK + a JDK 17/21. **Present on this machine:** Temurin 21 (`~/.local/jdk-21/`) + Android SDK (`~/Android/Sdk`); run `./build.sh`. |

## Install

```bash
npm install
```

*Executed in the documentation pass: `npm install` → exit code 0.*

## Run in the browser

```bash
npx ng serve
```

Then open <http://localhost:4200>.

*NOT executed in the documentation pass — no dev server was started (by instruction) and no port
was left open. It is the standard Angular dev-server command for this project; it was exercised in
earlier slices of this project.*

## Tests

```bash
npm test -- --configuration ci
```

*Executed in the documentation pass: **11 test files / 104 tests, all passed, exit code 0**
(Vitest 4.0.18, ~3.5 s).*

Tests run headless through Vitest with `jsdom` (configurations defined in `angular.json`).

## Production build

```bash
npx ng build
```

The web build lands in `www/` (that directory is Capacitor's `webDir`, see
[`capacitor.config.ts`](capacitor.config.ts)).

*Executed in the documentation pass: **exit code 0**, output written to `www/`. The build emits one
non-fatal budget warning: `src/app/pages/config/config.page.scss` is 2.39 kB against a 2.00 kB
budget (388 bytes over). The build still succeeds; the stylesheet was not trimmed in this pass.*

## Android

One command:

```bash
./build.sh
```

`build.sh` verifies the prerequisites, auto-selects a usable JDK 17/21 (without changing the
machine's default `java`), runs `ng build` → `www/` and `cap sync android`, installs any missing
Android SDK components (`platforms;android-<compileSdk>`, `platform-tools`, `build-tools`) and
accepts their licenses, and finishes with `./gradlew --no-daemon assembleDebug` in `android/`.
JDK 17/21 and the Android SDK itself must exist beforehand (on this machine: Temurin 21 at
`~/.local/jdk-21/`, SDK at `~/Android/Sdk`).

Equivalent manual procedure:

```bash
npx ng build
npx cap sync android
# then either open the project in Android Studio and Run,
# or build from the command line:
cd android && ./gradlew assembleDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`; `build.sh` also drops a copy under the
distribution name at the repository root — **`any-rest.apk`** (same bytes, compared with `sha256sum`).

> **EXECUTED 2026-10-16:** `./build.sh` finished with exit code 0; Gradle reported
> `BUILD SUCCESSFUL in 1m 31s` (243 tasks). APK produced:
> `android/app/build/outputs/apk/debug/app-debug.apk` (4,396,335 bytes,
> sha256 `3c44ec2e1db0f202adb51454e6b9852aac74e10362773608e7f99296b87dd9d0`).
> `aapt2 dump badging` on that file confirmed: package `com.anyrest.mobile`,
> `versionName='1.0'`, min/target/compile SDK 24/36/36, application label `AnyRest`,
> permission `android.permission.INTERNET`. The APK has **not** been run on a device or
> emulator — see "Not tested / not verified in this pass" below.

`android/app/src/main/AndroidManifest.xml` declares
`<uses-permission android:name="android.permission.INTERNET" />` and sets
`android:usesCleartextTraffic="true"`, and the app enables Capacitor's native HTTP
(`plugins.CapacitorHttp.enabled` in `capacitor.config.ts`). The consequence has two halves:

- **Android app:** requests go through native HTTP, so a service that sends **no CORS headers** can still
  be called, and plain **http://** on the local network is allowed (that is what the cleartext flag is for
  — a deliberate trade-off: request bodies, tokens included, can travel unencrypted to those hosts).
- **Browser build:** the browser's own rules apply and the app cannot bypass them — a cross-origin endpoint
  must send `Access-Control-Allow-Origin` (and answer the `OPTIONS` preflight), otherwise the call never
  reaches the service and you get the friendly **network error** screen.

## How to use it

1. **First run.** With no saved configuration the app opens the **Configuration** screen.
2. **Load a config.** Either
   - **Select anyrest.json** (or **Update configuration** when one is already active) → pick the `.json`;
     then **Add images** for each image you need — **one at a time is fine**, the app keeps every image you
     add (the list of what is ready is shown, with **Clear images**). A multi-file pick or, on a desktop
     browser, **Select the folder instead** also works. The app copies the images into itself
     (png/webp only, ≤ 512 KiB each), so a button that names an image (`"icon": "get.png"`, no
     `app.iconpath`) keeps working even if the original files move. If a named image was not added, the
     preview says so and lists it. Or
   - **Load demo configuration** → loads the bundled demo (`src/assets/anyrest.demo.json`, semantically
     identical to the root [`anyrest.json`](anyrest.json)) which points at `https://httpbin.org`.
   The app parses, validates against the schema, and shows a **preview** of the buttons
   (icon + label + method badge). Nothing is saved yet.
3. **Confirm and save.** Only a fully valid config is persisted and activated; an invalid one is
   rejected with a list of issues and the previously active config is kept untouched.
4. **Main screen.** The header shows `app.title` (and `app.description`). Each row is one button
   from the config; tapping it executes that row's HTTP request and opens the **result modal**
   (status, message, body). While a call is in flight the row shows a spinner and is disabled —
   other rows stay usable.
5. **Change the config later.** The settings icon (top-right) reopens the Configuration screen.
   **Update configuration** re-selects the `.json` and its images: the active config and the copied
   images are replaced as a whole (a selection without images leaves the icons on the fallback tiles).
   **Cancel/Back** returns to the main screen with the previous config still active.
6. **Back to the demo.** Use **Load demo configuration** at any time.
7. **Empty state.** A valid config with `"buttons": []` shows a friendly "no operations defined"
   screen with a shortcut to Configuration. That is a valid config, not an error.

### Demo endpoints

The demo config exercises all five supported methods against **httpbin.org** — public, CORS-open,
no authentication: `GET /get`, `POST /post`, `PUT /put`, `PATCH /patch`, `DELETE /delete`, each with
a 15 s timeout. If httpbin.org is down or unreachable the calls fail with the app's friendly error
screen; that is expected behaviour, not a defect.

### What can block a call

The app never pretends a request succeeded. A request can still fail for reasons outside its
control, and the app reports them as errors:

- **CORS** — in the browser, a cross-origin endpoint that does not send the right CORS headers is
  blocked by the browser itself, before any status is visible.
- **Authentication** — endpoints requiring credentials are not supported in v1 (see below); they
  will answer `401`/`403`, which the app shows as an error.
- **TLS/certificates** — an invalid, self-signed or expired certificate fails at the transport
  layer.
- **Server policies** — rate limits, geographic blocks, WAF rules, maintenance.

## Security posture

The config is treated as **untrusted input**:

- **No code from the config.** There is no `eval`, no `new Function`, no expression or JavaScript
  evaluation anywhere in the request path. The config's field model is closed: unknown keys fail
  validation (`additionalProperties: false` at every level).
- **No dynamic evaluation in v1.** There is **no** placeholder/interpolation syntax (`{{ }}`, `${}`,
  functions): every value in the config is used literally. See `docs/CONFIG-FORMAT.md`.
- **URL scheme is enforced by app code** — `request.url` must match `^https?://`, so `javascript:`,
  `file:` and relative URLs are rejected in code, not only in the schema.
- **Rendering is text-escaped.** Config values are bound as text/attributes through Angular's
  default escaping; no `innerHTML` is used with config data. Icon values are bound to `src`.
- **No credentials are stored.** v1 has no authentication, no token refresh, no secret store. A user
  may embed static headers in their own config, at their own risk; the app does not classify, hide
  or persist anything as a secret.
- **Errors never echo request headers.** The result/error screens show the status code, the
  configured message and a truncated excerpt of the *response body* — never the request headers,
  which are the one place an auth value could sit.
- **The config cannot weaken the app.** The URL-scheme check, the no-code rule, the timeout clamp
  and the no-header-echo rule are hardcoded in app code; no schema field turns any of them off.
- **Timeouts are clamped** to `[1000, 120000]` ms (default `30000`), so a config cannot hang the app
  indefinitely or hammer an endpoint with a zero timeout.

## Not implemented / not tested

This list is deliberate and complete for the documented pass. Anything on it is a **known gap**,
not a promise.

**Not implemented (by design in v1):**

- **No authentication, OAuth, token refresh or secret/key storage.** Out of scope by decision.
- **No placeholder / dynamic values.** All values in the config are static — no `{{ }}`, `${}`,
  expressions, functions, or date/time injection.
- **No in-app config editing.** A config is replaced by loading a file; fields are not editable
  inside the app.
- **No non-REST actions** (local scripts, shell, code execution).
- **No offline caching** of API responses.
- **No `file://` / OS-absolute path support** for icons (web-relative, absolute `http(s)` or `data:`
  only).
- **Success is HTTP `200` exactly.** `201`, `204`, `3xx` and every other status is shown as an error,
  by frozen decision. One deliberate exception: a button carrying `"timeoutIsSuccess": true` reports a
  **timeout** as a success — for endpoints that cannot answer because they restart the service answering
  them (see [`docs/CONFIG-FORMAT.md`](docs/CONFIG-FORMAT.md) → *Timeout*).

**Not tested / not verified in this pass:**

- **The APK has not been executed on a device or emulator** — it was produced and inspected
  (`aapt2 dump badging`), but no on-device or emulator run happened.
- **Copying your own images was exercised in the browser only** — the multi-file selection itself was
  verified in the WebView code path (`BridgeWebChromeClient`, `MODE_OPEN_MULTIPLE`), not on a device.
- **Native HTTP / cleartext were verified in the built artifact only** — the APK carries
  `CapacitorHttp.enabled` and `usesCleartextTraffic="true"` (checked inside the APK), but no call has been
  made from a device, so a real native request to a no-CORS endpoint is still unproven here.
- **The bottom safe-area fix was verified through the CSS variable, not on a device** — with
  `--app-safe-bottom` forced to 48 px, the configuration page's scroll padding becomes 72 px and the result
  modal's footer 65.6 px (measured, both before/after); the real `env(safe-area-inset-bottom)` value only
  exists on the phone.
- **Nothing was exercised on a physical Android device or emulator** — no real-device run, no
  device file picker, no native `@capacitor/preferences` storage behaviour observed.
- **No real-device file-picker test** — the `<input type="file">` path was exercised in the browser
  only.
- **CORS and timeout behaviour was verified only against a local/mocked server** — not against a
  deliberately slow or misconfigured public endpoint.
- **No dark-mode pass** and no systematic accessibility audit (screen reader, contrast, dynamic type).
- **No iOS platform** was added.
- **`npx ng serve` was not run in this documentation pass** (no dev server was started here); the
  screens referenced in `docs/temp/ui/` were captured in an earlier pass.
- **Responsive widths were checked at 360 / 390 / 768 px** (see `docs/temp/ui/`); 414 px and any
  tablet-landscape width were not re-verified in this pass.
- **`npm install` was run here but no dependency audit was remediated** — `npm install` reports
  vulnerabilities (see the `npm audit` output); none were fixed or triaged in this pass.
- **The `version` field in `package.json` is still `0.0.1`** (Ionic scaffold value) while
  `CHANGELOG.md` opens at `0.1.0`; the two were not reconciled in this pass.

### Screens captured so far

`docs/temp/ui/`: `config-first-run.png`, `home-360.png`, `home-390.png`, `home-768.png`,
`result-modal-success-390.png`, `result-modal-error-390.png`, `empty-state-390.png`.

## Repository layout

```
anyrest.json                     demo configuration (root copy)
android/                         Capacitor Android platform project (synced with www/)
build.sh                         one-command Android debug APK build
capacitor.config.ts              Capacitor config: appId com.anyrest.mobile, webDir 'www'
docs/SPEC.md                     frozen v1 specification
docs/CONFIG-FORMAT.md            configuration format reference
docs/PLAN.md, docs/briefs/, docs/task/   planning and dispatch records
src/app/core/                    config model, validation, icon resolution, request building
src/app/services/                config persistence, REST execution
src/app/guards/                  route guard (redirects to config when no valid config)
src/app/pages/config/            configuration screen
src/app/home/                    main screen (dynamic button list)
src/app/components/              button-icon, result-modal
src/assets/anyrest.demo.json     demo config bundled with the app
src/assets/schema/               normative JSON schema (draft-07)
src/assets/icons/                demo icons (png/webp)
www/                             production web build output (Capacitor webDir)
```

## License

No license file is present in this repository. All rights reserved by the author until one is
added.
