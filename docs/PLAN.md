# AnyRest Mobile — Implementation Plan (ordered slices)

Project root = `/media/gandb/workspace/anyrest` (the workspace folder IS the project root).
`docs/` (task/spec/plan) and `.bot-forum/` live at the root; the Ionic app source is in `src/`.
The demo deliverable is `/media/gandb/workspace/anyrest/anyrest.json`; a runtime copy is bundled
at `src/assets/anyrest.demo.json`.

Environment (measured): node **v24.15.0**, npm **11.12.1**, **no global ionic CLI** (use `npx`),
12 cores, 31 GB RAM, python3 available. **No git write commands** (rule). 

Commands referenced below:
- Scaffold: `npx --yes @ionic/cli@latest start anyrest angular`
- Test runner: `npx jest` (Jest + ts-jest, Node env — headless-safe)
- Dev server: `npx ng serve` (alias `npm start`) → http://localhost:4200
- Android: `npx ng build` → `npx cap sync android` → (needs Android SDK) `cd android && ./gradlew assembleDebug`

---

## Slice 0 — Scaffold + lift to root
No files authored (CLI generates). 
```
cd /media/gandb/workspace/anyrest
npx --yes @ionic/cli@latest start anyrest angular     # creates ./anyrest/
shopt -s dotglob
for f in anyrest/*; do mv "$f" .; done               # lift app into the workspace root
rmdir anyrest
```
- After this, project root = `/media/gandb/workspace/anyrest` with `package.json`, `angular.json`,
  `src/`, `tsconfig.json`, and the pre-existing `docs/`, `.bot-forum/`.
- **Verify:** `ls` → `package.json angular.json src tsconfig.json docs anyrest.json? (no, added in S1)`;
  `node -v` → `v24.15.0`. 
- **Git caveat:** do NOT run any `git add/commit/push`. If `ionic start` created a `.git`, it stays inert
  (the folder is not meant to be a repo). Confirm with `ls -a`.

## Slice 1 — Dependencies, Capacitor, demo assets, demo config
Files created/modified:
- `package.json` (deps added)
- `capacitor.config.ts` (authored or via `cap init`)
- `src/assets/schema/anyrest.schema.json` (copy of SPEC §2 schema)
- `src/assets/anyrest.demo.json` (copy of root `anyrest.json`)
- `src/assets/icons/get.png`, `post.webp`, `put.png`, `patch.webp`, `delete.png` (square, simple,
  mixed png/webp — one per demo method)
Commands:
```
cd /media/gandb/workspace/anyrest
npm install
npm install @capacitor/core @capacitor/preferences
npm install -D @capacitor/cli @capacitor/android
npx cap init AnyRest com.anyrest.mobile --web-dir=dist/anyrest/browser   # only if capacitor.config.ts is missing
npx cap add android
mkdir -p src/assets/schema src/assets/icons
cp docs/SPEC_SCHEMA_TO_FILE   # paste SPEC §2 schema into src/assets/schema/anyrest.schema.json
cp anyrest.json src/assets/anyrest.demo.json
# create the 5 square demo icons in src/assets/icons/ (png + webp)
```
- **Verify:** `npx cap list` → `android`; `ls src/assets` → `schema anyrest.demo.json icons`;
  `node -e "JSON.parse(require('fs').readFileSync('src/assets/anyrest.demo.json','utf8'))" && echo OK`.

## Slice 2 — Core pure-logic modules (framework-free)
Files (all under `src/app/core/`, **no Angular imports**):
- `types.ts` — `AnyRestConfig`, `ButtonConfig`, `RequestConfig`, `ResponseConfig`,
  `ValidationIssue`, `ValidationResult`, `EffectiveRequest`, `RestOutcome`.
- `validate.ts` — `validateConfig(input: string | unknown): ValidationResult`. Uses `ajv`
  (draft-07, `src/assets/schema/anyrest.schema.json` inlined as a module for the build) + app rules:
  duplicate `buttons[].id` detection. Returns `{ok, errors[]}` with JSON-Path-like `path`.
- `icon.ts` — `resolveIconUrl(icon?: string, iconpath?: string): string | null` (SPEC §3.1) and
  `usesRemoteOrData(icon): boolean`.
- `request-builder.ts` — `buildEffectiveRequest(req: RequestConfig): EffectiveRequest`
  (method, url, params map, headers map, body + decided content-type, `effectiveTimeoutMs`
  clamped to [1000,120000], default 30000 — SPEC §3.2/§3.3).
- `http-result.ts` — `classifyStatus(status: number): 'success'|'error'` (200-only, SPEC §7.5) and
  `formatBody(bodyText: string, display: 'json'|'text'): {view:'json'|'text'; text:string; warning?:string}`.
- Specs: `validate.spec.ts`, `icon.spec.ts`, `request-builder.spec.ts`, `http-result.spec.ts`.
- Deps: `npm install ajv` (runtime) + `npm install -D jest ts-jest @types/jest`.
- **Verify:** `npx jest` → all `core` specs green.

## Slice 3 — Angular services (thin wrappers)
Files:
- `src/app/services/config.service.ts` — `ConfigService`:
  `loadActive(): Promise<AnyRestConfig|null>`; `activate(text: string): Promise<ValidationResult>`
  (parse → `validateConfig` → on ok persist via `@capacitor/preferences` key `anyrest:active`
  and set the in-memory active config; on fail do NOT persist/replace);
  `resetToDemo()` (fetch `/assets/anyrest.demo.json` → `activate`);
  `isConfigured: BehaviorSubject<boolean>`.
- `src/app/services/rest.service.ts` — `RestService.execute(req: RequestConfig): Observable<RestOutcome>`:
  builds via `buildEffectiveRequest`, calls `HttpClient` (`observe:'response'`, `responseType:'text'`,
  `timeout(effectiveTimeoutMs)`), maps to `RestOutcome{ok, status?, bodyText?, errorKind:'http'|'network'|'timeout', message}`.
  `http` error = status != 200 (keep bodyText for a safe excerpt); `network` = no response;
  `timeout` = RxJS TimeoutError. **Never** includes request headers in `message`.
- Specs: `config.service.spec.ts`, `rest.service.spec.ts` (mocked `HttpClient` via TestBed;
  mocked `@capacitor/preferences`).
- **Verify:** `npx jest` (service specs green; pure specs stay green).

## Slice 4 — UI: configuration screen
Files:
- `src/app/pages/config/config.component.ts|html|scss` (standalone): 
  "Select anyrest.json file" (`<input type="file" accept=".json,application/json">` → `file.text()`),
  "Load demo configuration", validated **preview** list (icon + label + method badge), 
  "Confirm and save" (→ `activate` then navigate `home`), friendly **issues list** on invalid,
  "Cancel/Back" (only when not first-run; returns to `home`).
- `src/app/pages/config/config.component.spec.ts` (renders; pick-file triggers load; invalid shows issues).
- **Verify:** `npx jest` (config specs green); manual screen pass (load demo + a bad file).

## Slice 5 — UI: main screen + result modal
Files:
- `src/app/pages/home/home.component.ts|html|scss` (standalone): header (`app.title` + optional
  `app.description`), settings icon-button → `config`, `@for (b of activeConfig.buttons; track b.id)`
  rows: **square icon** (resolved url; fallback tile on error) + label + description + method badge;
  per-row in-flight spinner + disabled; **empty state** when `buttons.length===0`; vertical scroll.
  Tap → `RestService.execute` → open result modal; lock/unlock by `id`.
- `src/app/components/result-modal/result-modal.component.ts|html|scss` (standalone): status line
  (green 200 / red non-200), message, body block (monospace, scrollable; json or text + warning),
  close.
- `src/app/pages/home/home.component.spec.ts` (buttons come from config; non-200 opens error modal;
  a row is disabled while in flight; other rows stay enabled).
- **Verify:** `npx jest` (home specs green); manual screen pass at 360/390/414/768 px.

## Slice 6 — App shell, routing, first-run guard, providers
Files:
- `src/app/app.component.ts|html|scss` (standalone shell).
- `src/app/app.routes.ts` — `''` → `home` (guarded), `home`, `config`.
- `src/app/guards/configured.guard.ts` — `ConfiguredGuard`: `home` redirects to `config` when
  `!ConfigService.isConfigured`.
- `src/app/app.config.ts` — `provideRouter(appRoutes)`, `provideHttpClient()` (plain; urls are absolute).
- `src/index.html`, `src/styles.scss` (global theme tokens; consistent spacing/typography).
- **Verify:** `npx jest`; `npx ng build` → type-check + bundle succeed. Manual: first-run → config;
  reload with a stored config → home.

## Slice 7 — Test-runner config, docs, demo final, Android wiring
Files:
- `jest.config.js` — `preset:'ts-jest'`, `testEnvironment:'node'`,
  `testMatch:['**/core/**/*.spec.ts','**/services/**/*.spec.ts','**/pages/**/*.spec.ts','**/components/**/*.spec.ts']`,
  `globals:{'ts-jest':{tsconfig:'tsconfig.spec.json'}}` (add `jest-preset-angular` + `test-setup.ts`
  with `zone.js/testing` only if a spec needs Angular TestBed).
- `tsconfig.spec.json` — extends `tsconfig.app.json`, `"module":"commonjs"` (avoids ESM/ts-jest friction).
- `README.md` (project root) — install, dev-run, android build, demo usage, demo-endpoint + CORS +
  HTTPS limitations, and an **explicit list of anything not implemented/tested**.
- Confirm `capacitor.config.ts` → `webDir = 'dist/anyrest/browser'`.
Commands + verify:
```
npx jest                 # full suite green
npx ng build             # dist/anyrest/browser/index.html produced
npx cap sync android     # web build copied into android/
cd android && ./gradlew assembleDebug   # OQ-1: needs Android SDK; may require Android Studio
```

## Slice 8 — Manual / screen acceptance pass (restriction 14)
No files. 
```
npx ng serve            # http://localhost:4200
```
Walk (judge functional + visual pass): first-use shows config screen → load demo → tap `demo-get`
(httpbin) → result modal shows the JSON body → tap a non-200 URL → friendly error screen → trigger a
network error → replace config via settings → verify all four widths (360/390/414/768). Then produce
the explicit "not implemented / not tested" statement (deliverable §11.7).

---

### Acceptance mapping (SPEC §10) — the command or screen that closes each item
| AC | Closes via |
|---|---|
| 1,2,4,5,10,11 | Slice 8 manual pass (first-use, load, demo tap, replace, widths) |
| 3,6,7,8,9 | Slice 2–3 unit tests (`npx jest`) + Slice 8 targeted screens (non-200, network) |
| 12 | Slice 7 (`npx ng build` + `npx cap sync android` + OQ-1 APK) |
