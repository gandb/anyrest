# AnyRest configuration format (`anyrest.json`)

This document describes the configuration file that drives the app. It follows the **normative
schema** at [`src/assets/schema/anyrest.schema.json`](../src/assets/schema/anyrest.schema.json)
(JSON Schema **draft-07**) — that file is the authority for types, limits and required fields; this
document explains and illustrates it. If the two ever disagree, the schema wins and this document is
wrong.

Related: [`docs/SPEC.md`](SPEC.md) (frozen specification), [`README.md`](../README.md) (how to run
and use the app), [`anyrest.json`](../anyrest.json) (the demo config).

## Top-level shape

```json
{
  "version": 1,
  "app": { "title": "..." },
  "buttons": [ /* ... */ ]
}
```

`additionalProperties: false` at **every** object level: an unknown key anywhere is a validation
error with the exact path of the offending key. This is intentional — it catches typos and stops a
config from smuggling fields the app does not model.

## Field reference

### Root

| Field | Required | Type / limits | Default | Meaning |
|---|---|---|---|---|
| `version` | **yes** | integer, `enum [1]` | — | Config format version. Only `1` is accepted; any other value rejects the file. |
| `app` | **yes** | object | — | App-level presentation. See below. |
| `buttons` | **yes** | array, `0..200` items | — | The operations to render. `0` is valid (empty state). `200` is a safety cap. |

### `app`

| Field | Required | Type / limits | Default | Meaning |
|---|---|---|---|---|
| `app.title` | **yes** | string, 1–120 chars | — | Shown in the main screen header. |
| `app.description` | no | string, ≤300 chars | absent | Subtitle under the title. |
| `app.iconpath` | no | string, ≤2048 chars | absent | Base used to resolve relative button icons (see *Icon resolution*). |

### `buttons[]`

| Field | Required | Type / limits | Default | Meaning |
|---|---|---|---|---|
| `buttons[].id` | **yes** | string matching `^[a-z0-9][a-z0-9-]{0,63}$` | — | Stable identifier (lowercase letters, digits, hyphens; max 64 chars total). **Must be unique across all buttons** — an app-level check, not expressible in draft-07. |
| `buttons[].label` | **yes** | string, 1–80 chars | — | Row text, shown next to the icon. |
| `buttons[].description` | no | string, ≤200 chars | absent | Subtitle on the row. |
| `buttons[].icon` | no | string, ≤2048 chars | absent | Icon reference; how it is resolved is described under *Icon resolution*. Absent/unresolvable → fallback tile. |
| `buttons[].request` | **yes** | object | — | The HTTP call. See below. |
| `buttons[].response` | no | object | see below | How the result is presented. |

### `buttons[].request`

| Field | Required | Type / limits | Default | Meaning |
|---|---|---|---|---|
| `request.method` | **yes** | `"GET"` \| `"POST"` \| `"PUT"` \| `"PATCH"` \| `"DELETE"` | — | Uppercase only. Any other spelling (e.g. `get`, `HEAD`, `OPTIONS`) rejects the file. |
| `request.url` | **yes** | string matching `^https?://`, ≤2048 chars | — | Absolute `http://` or `https://` URL. `file:`, `javascript:` and relative URLs are invalid. |
| `request.headers` | no | object, string → string, ≤100 keys | absent | Extra request headers, verbatim. |
| `request.queryParams` | no | object, string → string, ≤100 keys | absent | Appended to the URL as a query string. |
| `request.body` | no | object \| array \| string | absent | Request body. Object/array → JSON; string → raw text. Rules below. |
| `request.timeoutMs` | no | integer ≥ 1 | **30000** | Request timeout. **Clamped at runtime to `[1000, 120000]` ms** — a smaller or larger number is adjusted, not rejected. |
| `request.timeoutIsSuccess` | no | boolean | absent (`false`) | `true` counts a **timeout as a success** — for endpoints that cannot answer because they restart the service answering them (see *Timeout*). |

### `buttons[].response`

| Field | Required | Type / limits | Default | Meaning |
|---|---|---|---|---|
| `response.display` | no | `"json"` \| `"text"` | `"json"` | How to present a successful (HTTP 200) body. |
| `response.successMessage` | no | string, ≤300 chars | app default | Message shown in the result modal on success. |
| `response.errorMessage` | no | string, ≤300 chars | app default | Message shown in the result modal on error. |

## Explicit rules

### Status: only `200` is success

- **Exactly `200` is success.** Every other status — `201`, `204`, `3xx`, `4xx`, `5xx` — is an
  error, shown on a friendly error screen with the status code, the configured/default error message
  and a safe, truncated excerpt of the response body. `201 Created` is therefore reported as an
  error in v1; this is a frozen decision, not a bug.
- The error screen **never** echoes request headers — they are the one place a credential could sit.
- Network failures (offline, DNS failure, CORS block, connection refused) and timeouts get their own
  friendly messages. On a `display: "json"` success whose body is not valid JSON, the raw text is
  shown with the note "Response is not valid JSON — showing raw text."

### Timeout

- Default `30000` ms when `timeoutMs` is absent.
- `"timeoutIsSuccess": true` (optional, default `false`) counts a **timeout as a success**. It exists for
  fire-and-forget endpoints — restart, reboot — that can never answer, because the process answering is
  the one being restarted. The modal then goes green reading `Timeout — counted as success`, with the
  message `Request timed out after N ms — counted as success (timeoutIsSuccess).` (a configured
  `response.successMessage` still wins). Absent → a timeout keeps meaning failure; HTTP responses are
  never affected by this key.
- **Effective timeout = clamp(value, 1000, 120000)**. A value below 1000 becomes 1000; above 120000
  becomes 120000. Clamping never fails validation.

### Body and `Content-Type`

| `request.body` | Sent as | `Content-Type` set by the app |
|---|---|---|
| object or array | JSON (`JSON.stringify`) | `application/json` — **only if** `headers` has no `Content-Type` |
| string | raw text body | `text/plain; charset=utf-8` — **only if** `headers` has no `Content-Type` |
| absent | no body | none |

**A user-provided `Content-Type` in `request.headers` always wins.**

### Headers and query parameters

- Both are maps of **string → string**. Numbers and booleans must be written as their string form
  (`"42"`, `"true"`); the app performs no type coercion.
- `queryParams` are appended to the URL as a query string; the app does not encode or reorder what
  you give it beyond standard URL encoding.

### Icon resolution

Given `buttons[].icon` and the optional base `app.iconpath`:

1. If `icon` starts with `http://`, `https://` or `data:` → used **as-is** (`iconpath` is ignored).
2. Otherwise (a plain filename or relative path):
   - a name present in the **images you loaded with the configuration** → that copied image is used;
   - otherwise, if `app.iconpath` is present → `join(iconpath, icon)` (single `/`, no duplicate
     slash; a leading `/` on `icon` is not duplicated);
   - otherwise → fallback tile.
3. The resolved URL is rendered in a **fixed square box** with `object-fit: cover`, so a non-square
   source is cropped to a square. Supported formats: **png, webp**.
4. If the icon is absent, unresolvable, or fails to load → a **fallback tile** is rendered (square,
   neutral background, first 1–2 characters of the label). Never a broken-image glyph.

The app **never reads OS filesystem paths**: `file://`, `/mnt/...` and similar values fail to load
and fall back to the tile. For images of your own you do not need a path at all — load them in the
app.

### Loading your own images

On the Configuration screen, one selection takes the `anyrest.json` **and its images together**
(multi-select), or — on a desktop browser — the whole folder at once (**Select the folder instead**,
`webkitdirectory`). The app copies the images into itself, so they keep working even if the original
files move; a later selection replaces the previous set as a whole.

- Exactly one `*.json` per selection.
- Only `.png` / `.webp`, at most **512 KiB** each. Anything else is listed as ignored; an oversized,
  empty or duplicate-named image rejects the selection and names the file.
- Nothing is stored until you confirm; the same button ("Update configuration") re-selects later.
- If the configuration names an image you did **not** select, the preview warns you and lists the
  names: those rows show initials until you select them. (There is no type filter on the picker, so
  the images are always selectable; anything the app cannot use is listed as ignored.)

### Optional values: OMIT the key

There is no `null` and no empty string as a way to say "not set". Any field listed as optional above
is expressed by **not writing the key at all**. When a button omits `response`, the app defaults are
used; when it omits an optional sub-field, the app does exactly what the *Default* column says.

### No placeholders — all values are static

**There is no placeholder or interpolation syntax in v1.** No `{{ }}`, no `${}`, no functions, no
expressions, no environment variables, no date/time injection. Every value in `queryParams`,
`headers` and `body` is used literally, exactly as written. A documented placeholder mechanism may
be added in a future `version`; it is **not** implemented here, and this document deliberately does
not invent or describe one.

## Worked examples

### 1. Minimal valid config

One button, nothing optional:

```json
{
  "version": 1,
  "app": { "title": "My Tool" },
  "buttons": [
    {
      "id": "ping",
      "label": "Ping",
      "request": { "method": "GET", "url": "https://example.com/ping" }
    }
  ]
}
```

`timeoutMs` defaults to 30000, `response.display` to `json`, and the icon falls back to a tile built
from "Ping".

### 2. GET with query params + headers

```json
{
  "version": 1,
  "app": {
    "title": "Inventory",
    "description": "Read-only inventory lookups"
  },
  "buttons": [
    {
      "id": "list-items",
      "label": "List items",
      "description": "First page, 25 per page",
      "icon": "get.png",
      "request": {
        "method": "GET",
        "url": "https://api.example.com/v1/items",
        "headers": { "Accept": "application/json", "X-Client": "anyrest" },
        "queryParams": { "page": "1", "per_page": "25" },
        "timeoutMs": 10000
      },
      "response": { "display": "json", "successMessage": "Items loaded." }
    }
  ]
}
```

The call becomes `GET https://api.example.com/v1/items?page=1&per_page=25`. Note `"page": "1"` — a
string, not a number.

### 3. POST with a JSON body

```json
{
  "version": 1,
  "app": { "title": "Orders" },
  "buttons": [
    {
      "id": "create-order",
      "label": "Create order",
      "request": {
        "method": "POST",
        "url": "https://api.example.com/v1/orders",
        "headers": { "Content-Type": "application/json; charset=utf-8" },
        "body": { "sku": "ABC-1", "quantity": 2, "priority": true },
        "timeoutMs": 20000
      },
      "response": { "display": "json", "successMessage": "Order created." }
    }
  ]
}
```

The object body is serialized to JSON. The explicit `Content-Type` in `headers` wins over the app's
default `application/json` — here including a charset the app would not have added.

### 4. DELETE

```json
{
  "version": 1,
  "app": { "title": "Cleanup" },
  "buttons": [
    {
      "id": "delete-item-42",
      "label": "Delete item 42",
      "request": {
        "method": "DELETE",
        "url": "https://api.example.com/v1/items/42",
        "headers": { "Accept": "application/json" },
        "timeoutMs": 15000
      },
      "response": { "display": "json", "errorMessage": "Delete failed." }
    }
  ]
}
```

A `DELETE` typically answers `204 No Content`. Because only `200` counts as success, the app will
show this as an error with the status `204`. To treat it as a success the endpoint must return `200`.

### 5. Zero buttons (empty state)

```json
{
  "version": 1,
  "app": { "title": "Nothing yet" },
  "buttons": []
}
```

This is a **valid** config. The app shows the friendly empty state ("No operations defined — add
buttons via Configuration") instead of an error.

### 6. A bad config (what the error looks like)

```json
{
  "version": 2,
  "app": {},
  "buttons": [
    { "id": "Ok-Id", "label": "", "request": { "method": "GET", "url": "example.com/items" } },
    { "id": "dup", "label": "A", "request": { "method": "GET", "url": "https://a.example.com" } },
    { "id": "dup", "label": "B", "request": { "method": "GET", "url": "https://b.example.com" } }
  ]
}
```

Validation reports one issue per problem, each with a **path** and a plain-language **message** —
this is the `ValidationIssue` shape (`{ path, message }`) from `docs/SPEC.md`, and the config screen
shows the list under the line "Configuration is invalid — N issue(s) found.":

| Path | What is wrong |
|---|---|
| `/version` | must be `1` |
| `/app` | `title` is required |
| `/buttons/0/id` | must match `^[a-z0-9][a-z0-9-]{0,63}$` (`Ok-Id` is invalid) |
| `/buttons/0/label` | must be at least 1 character |
| `/buttons/0/request/url` | must start with `http://` or `https://` (a bare `example.com/items` is not valid) |
| `/buttons/2/id` | duplicate `id` — ids must be unique (one issue per extra occurrence) |

**A file with any issue is rejected as a whole.** Validation runs on a copy, and an invalid file
**never** replaces the active configuration: the previously active config stays active and
untouched. Only a fully valid config is persisted and activated.

## Validation order (what happens when you pick a file)

1. Read the file as text.
2. Parse JSON — malformed JSON is reported as an issue, not a crash.
3. Validate against `src/assets/schema/anyrest.schema.json` (draft-07, via `ajv`).
4. Apply the app-level rules that draft-07 cannot express: **`buttons[].id` uniqueness** and the
   **timeout clamp** (clamping is applied at request time and is never a validation failure).
5. Show a preview of the buttons.
6. On confirmation only: persist the validated content and activate it.

## Not implemented / not tested

Nothing below is a promise; each line is a known gap.

**Not implemented in v1 (by design):**

- **Authentication, OAuth, token refresh, secret/key storage** — out of scope by decision. A user
  may embed static headers at their own risk; the app stores nothing as a secret.
- **Placeholder/dynamic values** — no `{{ }}`, `${}`, expressions, functions, environment variables
  or date/time injection. Every value is static and literal.
- **In-app config editing** — the config is replaced by loading a file; no field is editable in the
  app.
- **Non-REST actions** (local scripts, shell, code execution).
- **Offline caching** of responses.
- **`file://` / OS-absolute icon paths** — web-relative, absolute `http(s)` and `data:` only.
- **Any status other than exactly `200` as success** — including `201` and `204`, which are reported
  as errors.
- **JSON Schema keywords beyond draft-07** and any format/`$ref` resolution from remote URLs: the
  bundled local schema is the only one used.

**Not tested / not verified in this pass:**

- **No Android run.** The debug APK is built and inspected (`build.sh`; `aapt2 dump badging`, 2026-10-16)
  but nothing was exercised on a physical device or emulator.
- **The device file picker** was only exercised in the browser, never on Android; the images copied by
  that flow were therefore verified in the browser only.
- **CORS and timeout behaviour** was verified against a local/mocked server only — not against a
  deliberately slow or misconfigured public endpoint. Note the platform split: the Android app routes
  requests through native HTTP (no CORS involved, cleartext allowed), while the browser build is bound by
  the browser's same-origin policy.
- **No dark-mode pass** and no systematic accessibility audit.
- **Native `@capacitor/preferences` storage** behaviour was not observed on a device (browser
  storage only).
- **Schema limits at their exact boundaries** (`maxItems: 200`, `maxProperties: 100`, `maxLength`
  values) were not each exercised one-by-one in a dedicated pass.
- **`additionalProperties: false`** was not verified against every nested object by an explicit test
  in this pass.
