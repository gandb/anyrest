# AnyRest Mobile — Specification

Status: **FROZEN v1** (decisions made by ARCHITECT; ORACLE-approved).
Language: English (artifact). Config, docs, code in English.

AnyRest is a **config-driven REST client** built with **Ionic + Angular + TypeScript**,
targeting **Android** and running in the **browser** during development. Its UI and all
operations are produced from an external `anyrest.json`. The same installed app becomes a
different tool (own buttons, labels, operations, parameters) by loading a different config —
no recompilation.

---

## 1. Scope and non-goals

### In scope
- Load, validate, persist and activate an `anyrest.json` config.
- Render a button list generated 100% from the config (no hardcoded operations).
- Execute one HTTP REST call per button tap (GET/POST/PUT/PATCH/DELETE).
- Show results (JSON or text) and friendly errors (non-200, network, timeout).
- Persist the validated config so it survives restarts; replace it at any time; reload the demo.
- Demo config (`anyrest.json`) with real, public, no-auth endpoints.
- Basic automated tests for validation, config persistence, and request building/execution.

### Out of scope (non-goals)
- Authentication flows, OAuth, token refresh, or any secret/key storage (restriction 6).
- Dynamic/placeholder value interpolation at runtime (v1 is static; see §4).
- Editing the config inside the app (config is replace-by-file, not field-editable).
- Non-REST actions (local scripts, code execution, shell).
- Offline caching of API responses.

---

## 2. `anyrest.json` — definitive schema

JSON Schema draft-07 (normative). A full, valid copy ships as `src/assets/schema/anyrest.schema.json`
and is used by the validator.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "anyrest.schema.json",
  "title": "AnyRest configuration",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "app", "buttons"],
  "properties": {
    "version": { "type": "integer", "enum": [1] },
    "app": {
      "type": "object",
      "additionalProperties": false,
      "required": ["title"],
      "properties": {
        "title":      { "type": "string", "minLength": 1, "maxLength": 120 },
        "description":{ "type": "string", "maxLength": 300 },
        "iconpath":   { "type": "string", "maxLength": 2048 }
      }
    },
    "buttons": {
      "type": "array",
      "minItems": 0,
      "maxItems": 200,
      "items": { "$ref": "#/definitions/button" }
    }
  },
  "definitions": {
    "button": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "label", "request"],
      "properties": {
        "id":         { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,63}$" },
        "label":      { "type": "string", "minLength": 1, "maxLength": 80 },
        "description":{ "type": "string", "maxLength": 200 },
        "icon":       { "type": "string", "maxLength": 2048 },
        "request":    { "$ref": "#/definitions/request" },
        "response":   { "$ref": "#/definitions/response" }
      }
    },
    "request": {
      "type": "object",
      "additionalProperties": false,
      "required": ["method", "url"],
      "properties": {
        "method":    { "type": "string", "enum": ["GET","POST","PUT","PATCH","DELETE"] },
        "url":       { "type": "string", "pattern": "^https?://", "maxLength": 2048 },
        "headers":   { "type": "object", "additionalProperties": { "type": "string" }, "maxProperties": 100 },
        "queryParams":{ "type": "object", "additionalProperties": { "type": "string" }, "maxProperties": 100 },
        "body":      { "type": ["object","array","string"] },
        "timeoutMs": { "type": "integer", "minimum": 1 },
        "timeoutIsSuccess": { "type": "boolean" }
      }
    },
    "response": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "display":        { "type": "string", "enum": ["json","text"], "default": "json" },
        "successMessage": { "type": "string", "maxLength": 300 },
        "errorMessage":   { "type": "string", "maxLength": 300 }
      }
    }
  }
}
```

### Field reference (defaults and limits)

| Field | Req | Type / limits | Default | Notes |
|---|---|---|---|---|
| `version` | yes | integer, `enum [1]` | — | Only major `1` is supported; any other value → file rejected. |
| `app.title` | yes | string, 1–120 | — | Shown in the app header. |
| `app.description` | no | string, ≤300 | absent | Subtitle under the title. |
| `app.iconpath` | no | string, ≤2048 | absent | Base for icon resolution (§3.1). |
| `buttons` | yes | array, 0–200 | — | 0 = valid, shows empty state. 200 is a safety cap. |
| `buttons[].id` | yes | `^[a-z0-9][a-z0-9-]{0,63}$` | — | **Unique across all buttons** (app-level check, §5). |
| `buttons[].label` | yes | string, 1–80 | — | Text to the right of the icon. |
| `buttons[].description` | no | string, ≤200 | absent | Subtitle on the row. |
| `buttons[].icon` | no | string, ≤2048 | absent | Resolved per §3.1; absence → fallback tile. |
| `buttons[].request.method` | yes | `GET`/`POST`/`PUT`/`PATCH`/`DELETE` | — | Uppercase only. |
| `buttons[].request.url` | yes | `^https?://`, ≤2048 | — | Absolute; `file:`/`javascript:`/relative are invalid. |
| `buttons[].request.headers` | no | map string→string, ≤100 keys | absent | No extra headers. |
| `buttons[].request.queryParams` | no | map string→string, ≤100 keys | absent | No query string. |
| `buttons[].request.body` | no | object / array / string | absent | See §3.2. |
| `buttons[].request.timeoutMs` | no | integer ≥1 | **30000** | **Clamped to [1000, 120000]** at runtime (§3.3). |
| `buttons[].request.timeoutIsSuccess` | no | boolean | absent (`false`) | `true` counts a **timeout as a success** (§3.3 amendment) — for fire-and-forget endpoints (restart, reboot) that cannot answer because the service answering is the one restarting. |
| `buttons[].response.display` | no | `json`/`text` | `json` | How to present the 200 body. |
| `buttons[].response.successMessage` | no | string, ≤300 | app default | Shown on success. |
| `buttons[].response.errorMessage` | no | string, ≤300 | app default | Shown on error. |

`additionalProperties:false` at every object level means any unknown key fails validation with a
specific path — this is intentional (catches typos; prevents the config from smuggling
unmodelled fields, restriction 4).

### 3.1 Icon source & resolution (FROZEN)
Resolution of `buttons[].icon` (string `icon`, optional base `app.iconpath`):
1. If `icon` starts with `http://`, `https://`, or `data:` → use it **as-is** (`iconpath` ignored).
2. Else (plain filename / relative path):
   - a name present in the **icons copied into the app** (§3.1.5) → use the copied image;
   - otherwise, if `app.iconpath` present → `join(iconpath, icon)` (single `/`, no duplicate
     slash, a leading `/` on `icon` is not duplicated);
   - otherwise → fallback tile.
3. The app renders the resolved URL in a **fixed square** box with `object-fit: cover`, so a
   non-square source is always cropped to a square. Allowed formats: **png, webp** (restriction 13).
4. If the icon is absent, unresolvable, or fails to load → render a **fallback tile**
   (square, neutral background, first 1–2 characters of `label`). Never a broken-image glyph.

**The app never reads local OS filesystem paths** (no `file://`, no `/mnt/...`). Such values
fail to load and fall back to the tile. (Documented limitation, restriction 11.)

The **demo** config uses `app.iconpath = "/assets/icons"` with bundled demo icon files
(`src/assets/icons/{get,post,put,patch,delete}.png|webp`), which resolve to web-app-relative
URLs that work in both the browser dev server and the Android webview. `app.iconpath` stays
optional and keeps this meaning; it is never required for a user's own images.

### 3.1.5 Icons copied into the app (amendment, 2026-10-16)

The user picks the configuration file **and** its images — either in one selection, or by picking the
configuration and then adding images **one at a time** (the Android picker hands over a single file per
pick and closes). Images accumulate across picks; a configuration pick that also carries images replaces
the pending set, and adding an image whose name is already present replaces that image. The app copies the
images into its own storage as `data:` URLs keyed by file name and reads them from there — no OS path, no
`file://`, no persistent directory permission (restriction 10: a picked path is never assumed to stay
reachable).

- The user may pick the configuration and the images as **files** (one or several picks, any platform) or
  as a **folder** (`webkitdirectory`: on a desktop browser the whole folder is read at once — the folder
  must contain the `anyrest.json` and its images). Android pickers may offer no folder option and may hand
  over a single file per pick, which is why **accumulation** exists. Either way the app classifies what it
  received and lists what it ignored.
- Exactly one `*.json` per configuration pick (zero or several is a reported error).
- Only `.png` / `.webp` images are copied; anything else is listed as ignored, never dropped silently.
- Each image is capped at **512 KiB** (base64 in storage grows it by ~33 %); an oversized, empty or
  duplicate-named image rejects the whole selection with the file named.
- The copied set is the accumulated one: what is pending when the user confirms (a configuration pick
  carrying images replaces it; **Add images** accumulates it; **Clear images** empties it). Nothing is
  written before the confirmation.
- A configuration that names an image the selection did **not** bring is surfaced as a loud warning in
  the preview, listing the names — a missing image is never a silent tile. The warning does not block
  the confirmation (the configuration is still valid); a configuration carrying `app.iconpath` is
  exempt, since there the name may legitimately resolve against that base.
- Resolution order is unchanged for absolute sources (rule 1); for a plain name the **copied set is
  consulted first** — what the user loaded is what shows — and `app.iconpath` is only used for a name
  that was not copied (this is what keeps the bundled demo working). Only a name (or `data:` URL) the
  policy allows is rendered; everything else is the fallback tile.

### 3.2 Body representation (FROZEN)
- `body` object or array → serialized to JSON; `Content-Type: application/json` is set
  **only if** `headers` does not already define `Content-Type`.
- `body` string → sent as the raw text body; `Content-Type: text/plain; charset=utf-8` is set
  **only if** not already defined in `headers`.
- `body` absent → no request body.
- User-provided `Content-Type` in `headers` always wins.

### 3.3 Timeout (FROZEN)
`timeoutMs` is a positive integer in the schema; the app applies
**effective timeout = clamp(value, 1000, 120000)** ms; absent → 30000. Out-of-range values are
clamped (not rejected) so a slightly-too-small timeout still works. Enforced with the RxJS
`timeout(ms)` operator on the request stream.

**Amendment (2026-10-16) — `timeoutIsSuccess`.** An optional boolean on the request. When it is
`true` and the effective timeout actually fires, the outcome is reported as a **success with no
HTTP status**: the modal goes green reading `Timeout — counted as success` and the message is
`Request timed out after <ms> ms — counted as success (timeoutIsSuccess).` (a configured
`response.successMessage` still wins). It exists for fire-and-forget endpoints — restart, reboot —
that cannot answer because the process answering is the one being restarted. Absent → a timeout keeps
meaning failure, exactly as before. HTTP outcomes are never affected: "only HTTP 200 is a success"
stays frozen.

### 3.4 Dynamic parameters & optional values (FROZEN — no placeholders in v1)
- **No placeholder/interpolation syntax exists in v1.** All `queryParams`, `headers`, and `body`
  values are **static**. There is no `{{ }}`, no `${}`, no function, no expression, no
  time/date injection. (Restriction 3: no code from config; restriction 2: no undocumented
  feature.) A documented placeholder mechanism may be added in a future version; it is **not**
  implemented here.
- **Numbers/booleans in query/header values are written as their string form** (`"42"`, `"true"`);
  the app performs no type coercion.
- **Optional values = omit the key.** Every optional field has a defined default or is simply
  absent (see the table above). Omission, not `null` or `""`, is the representation of "not set".

---

## 4. Data flow

```
file picker / demo  ->  raw text  ->  parse JSON  ->  validate (schema + app rules)
        |                                                           |
        +-- invalid --> friendly error list (previous config kept)  |
                                                                   v (valid)
                                            persist validated content  ->  activate  ->  main screen
```

---

## 5. Validation rules and error model

Validator = `ajv` (draft-07) over the schema **plus** app-level rules not expressible in draft-07:
- **Uniqueness:** all `buttons[].id` must be distinct; duplicate → one issue per extra occurrence.
- **Timeout clamp:** see §3.3 (never a validation failure, only clamping).

**Contract: an invalid file MUST NOT replace the active config.** Validation runs on a copy;
only a fully valid config is written to persistence and activated.

Error model (single shape, no secrets, no stack traces):
```ts
interface ValidationIssue { path: string; message: string; } // e.g. "buttons[1].request.url"
interface ValidationResult { ok: boolean; errors: ValidationIssue[]; }
```
On failure the config screen lists the issues in plain language, top-line:
`"Configuration is invalid — N issue(s) found."` The previously active config (if any) remains
active and untouched.

---

## 6. Persistence strategy (FROZEN)

Library: **`@capacitor/preferences`** (works in browser via storage, on Android via native storage).
- Key: `anyrest:active` = **the validated config content as a JSON string** (NOT a file path —
  restriction 10).
- **App start:** read `anyrest:active` → parse → validate. Valid → main screen. Absent or
  invalid/corrupt → config screen (first-run / recovery). Never crash on a corrupt value.
- **Replace:** validate the new file first; only on success `set('anyrest:active', JSON.stringify(validated))`.
  A bad file can never clobber a good one.
- **Demo reset:** a "Load demo" action fetches `/assets/anyrest.demo.json`, validates, activates.
- **Change config:** the main screen's settings action reopens the config screen; the previous
  valid config stays active until a new one is validated.

---

## 7. HTTP execution rules

Per button tap:
1. Read the button's config; **validate parameters** (required fields present, url/method well-formed).
2. Build the request: method, url, `queryParams`→`HttpParams`, `headers`→`HttpHeaders`,
   body per §3.2. Request with `observe:'response'` and `responseType:'text'` (body always a
   string; we do **not** assume JSON — restriction 9).
3. Apply `timeout(effectiveTimeoutMs)` (§3.3).
4. **Per-button in-flight lock:** a `Map<id, inFlight>`; a tap on an in-flight button is ignored
   and that button shows a spinner + disabled state. **Other buttons stay enabled**
   (independent operations, restriction "without needlessly blocking others").
5. **Status rule (FROZEN, restriction 12): success = status `200` exactly. Any other status
   (2xx-except-200, 3xx, 4xx, 5xx) is an error**, shown on a friendly error screen.
   - The error screen shows: the HTTP status code, the configured/default error message, and a
     **safe, truncated excerpt of the response body** (so a 404 JSON body is still useful).
   - The error screen **never** echoes request headers (they may contain auth) — restriction 5.
6. **Body presentation on 200:** if `display:'json'` → attempt `JSON.parse`; on success pretty-print
   in a monospace block; on parse failure → show raw text with the note
   `"Response is not valid JSON — showing raw text."` If `display:'text'` → raw text.
7. **Network errors** (offline/DNS/CORS/connection refused): friendly screen
   `"Could not reach <host>. Check connectivity; note the endpoint may block cross-origin (CORS)
   or require authentication."` (restriction 11 — documented, not promised.)
8. **Timeout:** friendly screen `"Request timed out after N ms."`
9. On completion (success or error): clear the lock, restore the button, and open the **result view**
   (modal) with the status + message + body.

---

## 8. UI specification

Framework: Ionic (standalone Angular components, `@for`/`*ngFor`), mobile-first, responsive.

**Routes:** `''` (root) → `home` or `config` (first-run logic); `home`; `config`.
A `ConfiguredGuard` on `home` redirects to `config` when no valid active config exists.

**Config screen** (`config`):
- Title "Configuration".
- Action: **"Select anyrest.json file"** → native file picker
  (`<input type="file" accept=".json,application/json">`; works in browser and Android webview).
- Action: **"Load demo configuration"**.
- On file selected: parse + validate.
  - Invalid → list of friendly issues; previous config kept.
  - Valid → show a **preview** of the buttons (icon + label + method badge), then a
    **"Confirm and save"** button. Confirming persists + activates and routes to `home`.
- On first run there is no "back to main"; on later runs a **Cancel/Back** returns to `home`
  with the previous valid config still active.

**Main screen** (`home`):
- Header: `app.title` (+ optional `app.description` subtitle).
- A **settings** icon-button (top-right) → `config` (config is always reachable, task §3).
- **Button list** generated from `config.buttons` (no hardcoded buttons — restriction 8):
  each row = **square icon (left)** + **label (right)** (+ optional description subtitle,
  + a small **method badge** e.g. `GET`). Comfortable tap targets (≥44 px).
- Tapping a row executes its REST call (§7). The in-flight row shows a spinner + disabled.
- **Result view:** a modal (status line green/red, message, body block — formatted JSON or text,
  scrollable, monospace). Dismiss closes it.
- **Empty state:** if `buttons` is empty → a friendly "No operations defined — add buttons via
  Configuration." with a CTA to the config screen.
- **Vertical scrolling:** the list scrolls (Ionic `ion-content`); remains usable on small screens.

**Responsive:** verify at 360 / 390 / 414 / 768 px widths (mobile + tablet). No horizontal
overflow, no clipped text, tap targets ≥44 px.

**Feedback:** loading spinner per in-flight call; success/error banner in the result modal;
subtle Ionic transitions; no performance-hindering animation.

---

## 9. Security and limitations

- **Config is untrusted input.** All rendering uses Angular's default text escaping; no
  `innerHTML` with config data; no `eval`/`new Function`. Icons are bound to `src`, not injected.
- **No code from config** (restriction 3): only a closed field model; `url` must match `^https?://`
  (rejects `javascript:`/`file:`).
- **Config cannot weaken app security** (restriction 4): every security rule (URL-scheme check,
  no-code, timeout clamp, secret non-echo) is hard-coded in app code; **no schema field relaxes
  any of them.**
- **No secrets in the demo** (restriction 5): the demo config has no credentials/tokens.
- **Errors never expose secrets** (restriction 5): error/result screens show only status + body
  excerpt + messages — never request headers or (if present) auth values.
- **No auth, no secret storage** (restriction 6): v1 has no authentication; a user may embed
  static headers at their own risk; nothing is stored as a secret.
- **No endpoint is promised to work** (restriction 11): CORS, authentication, certificate and
  server policies can block calls; the app surfaces these as friendly errors. Production should
  use HTTPS; Android cleartext/HTTPS rules may require platform config.
- **Dependencies are minimal** (restriction 7): standard Ionic+Angular stack, `@capacitor/core`,
  `@capacitor/preferences`, `ajv` (validation), and test tooling. No NgRx, no extra form libs.

---

## 10. Acceptance criteria (mirror of task §10) and test plan

| # | Criterion | How it is verified (command / screen) |
|---|---|---|
| 1 | App shows the config screen on first use | run dev server, clear storage, load → config screen (screen). |
| 2 | Can select & load an `anyrest.json` | config screen → pick file → preview (screen). |
| 3 | Invalid file rejected, previous config kept | unit: `validateConfig` on a bad file → `ok:false`, active config unchanged; screen shows issues. |
| 4 | Buttons generated dynamically from file | screen: add buttons to a config, they render; unit: list built from config only. |
| 5 | Demo button executes a REST call & shows response | screen: tap demo GET → result modal shows httpbin body. |
| 6 | GET/POST/PUT/PATCH/DELETE supported | unit: request builder + method enum for all five; demo buttons exercise each. |
| 7 | Headers, query params, body honoured | unit: builder produces expected `HttpParams`/`HttpHeaders`/body + content-type; screen: httpbin echoes them. |
| 8 | Network errors & HTTP error responses handled | unit: non-200 → error screen; mock network error → friendly screen; screen: point at a 404/bad host. |
| 9 | Config persists after restart | unit: `ConfigService` set/read round-trip; screen: reload dev server, config retained. |
| 10 | Config can be changed through the UI | screen: settings → new file → active config swaps. |
| 11 | Interface works at different screen sizes | devtools at 360/390/414/768 px; no overflow/clip; tap targets ≥44 px. |
| 12 | Runs in browser and can build for Android | `ng serve` runs; Capacitor Android project generated + synced; APK build documented (§12). |

**Unit test scope (Jest, headless-safe):** `validateConfig` (valid/invalid, unique id, timeout
clamp), `resolveIconUrl`, `buildHttpRequest` (method/url/params/headers/body/content-type),
`classifyStatus` (200 vs non-200), `formatBody` (json/text + non-JSON fallback), `ConfigService`
persist/replace-invalid-preserves-previous, `RestService` (mocked HttpClient: non-200→error,
network error, timeout). Run: `npx jest`.

**Manual / screen pass (required before READY, restriction 14):** launch the app in the browser,
walk first-use → load demo → tap a real button (httpbin) → verify the result modal, a non-200,
a network error, config replace, and the four responsive widths.

---

## 11. Known limitations & assumptions (stated, not silent)

- **Android APK build** needs the Android SDK + Java/Gradle. In the current environment the plan
  verifies the Capacitor **Android project is generated and synced** and that `./gradlew` is wired;
  producing the actual `.apk` may require Android Studio. This is **OPEN QUESTION OQ-1**.
- **Demo relies on `httpbin.org`** (public, CORS-open, no auth). If it is down/blocked, the demo
  call errors gracefully — expected, not a defect.
- **`file://` / OS-absolute icon paths are not supported** (by design); use web-relative or
  absolute http(s)/data URIs.
- **In the browser**, cross-origin calls depend on the target's CORS; on-device it depends on
  network + endpoint policies. Both are surfaced as friendly errors, never promised.

---

## 12. Frozen-decision index

1. Schema = draft-07, `additionalProperties:false` everywhere, `version` fixed to `1`.
2. Icons: web-relative/absolute/data only, square via `object-fit:cover`, png/webp, fallback tile.
3. No placeholders in v1 (static values only); optional = omit key.
4. Body: object/array→JSON (application/json), string→text/plain; user `Content-Type` wins.
5. Timeout clamp [1000,120000], default 30000, via RxJS `timeout`.
6. Success = HTTP 200 exactly; everything else → friendly error screen (no header echo).
7. Per-button in-flight lock; other buttons stay enabled.
8. Persist validated content under `anyrest:active` (not a path).
9. `ajv` for schema validation; app-level checks for id uniqueness + clamp.
10. Config is always reachable from the main screen.
11. No auth / no secret storage / no code execution.
