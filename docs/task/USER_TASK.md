# USER TASK — AnyRest Mobile (verbatim requirement, translated to English)

Working folder: `/media/gandb/workspace/anyrest` (empty at job start; not a git repo).

## 1. Objective

Build a mobile application with **Ionic + Angular + TypeScript**, compatible with Android,
whose interface and functionality are defined by an external config file named `anyrest.json`.

The app is a *configurable REST client*: once installed, the user loads their own config file and
turns the same app into a completely different tool — own buttons, texts, operations, parameters —
without changing source code or recompiling.

Deliver a working, visually attractive, fluid app, ready for real use on mobile devices.

## 2. Technologies and architecture

- Ionic with Angular and TypeScript.
- Angular standalone components wherever adequate.
- Responsive layout, mobile-first.
- Clean separation: UI / config loading / validation / HTTP execution / state.
- Angular HttpClient for REST calls.
- Capacitor for native features, including file selection and reading on Android.
- Avoid unnecessary dependencies and excessive abstraction.
- Must run in the browser during development and be ready to build and run on Android.

## 3. First run and configuration

On first run, when no valid configuration exists, the app must automatically open the
**configuration screen**. There the user must be able to:

1. Select an `anyrest.json` file through the device file picker.
2. Validate the file content before accepting it.
3. See clear messages when the file is invalid or malformed.
4. Confirm and save the configuration.
5. Access a preview of the buttons that will be created.

The recommended file name is `anyrest.json`, but the system must validate the JSON content
regardless of the physical file name, allowing a config with another name.

After the first valid configuration, the app must open the main screen directly on later starts.

The selected configuration must be stored in the device's persistent storage, so it survives
closing and restarting the app. The file can be changed through a settings button that must also
be built; if changed, the new interface must adjust immediately to the new file.

The configuration screen must remain reachable through a button or menu item, allowing the
configuration to be replaced at any time.

When a new configuration is selected, the app must validate it before replacing the currently
active one. If the new configuration is invalid, the previous one must be preserved.

## 4. Interface and user experience

Modern, elegant, fluid interface following mobile design best practices. It must include:

- A main screen with the buttons defined by the config file, as a list / button menu, each with a
  square icon and a label at its right.
- Responsive layout adapting to different screen sizes.
- Visually distinct buttons, legible typography, consistent spacing, adequate icons, comfortable
  touch areas.
- Subtle animations and smooth transitions without hurting performance.
- Loading indicators during REST requests.
- Visual feedback of success or error.
- A clear way to view operation results.
- An accessible, easy-to-use configuration screen.
- Empty states and error messages that guide the user.
- Results other than HTTP 200 must be treated as errors and shown to the user on a friendly screen.

Do **not** hardcode the number, text or functionality of the buttons in the interface code. Those
elements must be generated dynamically from the configuration.

If the configuration defines many buttons, the interface must allow vertical scrolling and remain
usable on small screens.

## 5. Format of anyrest.json

Define and document a JSON configuration schema that can specify:

- General application information: title and description.
- List of buttons to present.
- Unique identifier of each button.
- Text, description and icon of each button.
- HTTP method: GET, POST, PUT, PATCH or DELETE.
- REST URL / endpoint.
- Query-string parameters.
- Custom HTTP headers.
- Request body, when applicable.
- Configurable timeout, within safe limits.
- Expected response format, when needed.
- Response presentation behaviour.
- Success or error messages, when configured.

Each button must correspond to an independent REST operation.

Icons must be presented in a square shape even if the source is not square; allowed formats are
**png and webp**.

Example configuration (illustrative):

```json
{
  "version": 1,
  "app": {
    "title": "AnyRest Demo",
    "description": "Operações REST configuráveis",
    "iconpath": "/mnt/c/icons"
  },
  "buttons": [
    {
      "id": "health-check",
      "label": "Verificar serviço",
      "description": "Verifica se a API está disponível",
      "icon": "pulse.webp",
      "request": {
        "method": "GET",
        "url": "https://httpbin.org/get",
        "headers": { "Accept": "application/json" },
        "queryParams": {},
        "timeoutMs": 10000
      },
      "response": { "display": "json" }
    }
  ]
}
```

The example is illustrative. The app must effectively implement and document the adopted format.

Also define how JSON bodies, dynamic parameters and optional values are represented. Do not invent
functionality that is not documented in the schema.

## 6. Executing the REST calls

When the user taps a button:

- Get the operation configuration.
- Validate the required parameters.
- Build the HTTP request with the configured method, URL, query params, headers and body.
- Execute the REST call.
- Show a loading indicator.
- Present the result when the operation ends.
- Handle network errors, timeout, HTTP error responses and responses that are not JSON.
- Restore the button state after the operation ends.

The app must prevent accidental repeated taps while an operation is running, without needlessly
blocking other independent operations.

Responses must be presentable as formatted JSON or plain text, according to the configuration.

Do not assume every REST response is JSON.

## 7. Demo button

Deliver the app with a working demo configuration. The demo must include at least one button that
performs a real REST call to a public test endpoint and shows the received response.

The demo configuration must be available as an `anyrest.json` file included in the project.

If the user never selected a configuration, the app must open the configuration screen, allowing
them to pick their own file or load the demo configuration.

The app must keep allowing configuration replacement after installation.

## 8. Persistence and configuration management

Implement a persistent storage strategy suitable for Android and the browser. The app must store
the active configuration and recover it on the next start. It must be possible to:

- Read the currently active configuration.
- Replace the configuration.
- Validate the new configuration before activating it.
- Go back to the demo configuration, if desired.
- Recover from errors without losing the previous valid configuration.

Do not assume the original path of the selected file will remain accessible indefinitely. Read and
store the validated content of the configuration when necessary.

## 9. Security and limitations

Because the file defines executable HTTP requests, treat the configuration as untrusted input.

- Validate the JSON structure and mandatory fields.
- Do not execute JavaScript, arbitrary code or expressions supplied by the file.
- Do not let the configuration disable the application's security validations.
- Do not include secrets or permanent credentials in the demo file.
- Handle errors without exposing tokens, passwords or other sensitive data.
- Respect Android network and security limitations.
- Document the need for network permissions and proper HTTPS configuration.
- Do not promise that every REST endpoint will work in any environment: CORS, authentication,
  certificates and server policies can limit the calls.
- Do not implement advanced authentication or secret storage without first defining a specific
  requirement for those features.

## 10. Tests and acceptance criteria

The implementation is finished when:

1. The app starts and shows the configuration screen on first use.
2. It is possible to select and load an `anyrest.json` file.
3. Invalid files are rejected without replacing the previous valid configuration.
4. Buttons are generated dynamically from the file.
5. The demo button executes a REST call and shows the response.
6. GET, POST, PUT, PATCH and DELETE are supported.
7. Headers, query parameters and bodies defined in the configuration are honoured.
8. Network errors and HTTP error responses are handled adequately.
9. The configuration persists after restarting the app.
10. The configuration can be changed through the interface.
11. The interface works at different screen sizes.
12. The app runs in the browser and can be built for Android.

## 11. Deliverables

- Complete, organized source code.
- A working Ionic + Angular project.
- Demo `anyrest.json` file.
- Schema and documentation of the configuration format.
- Instructions to install dependencies, run in development and build for Android.
- Basic tests for configuration loading, validation and REST request execution.
- Explicit statement of anything not implemented or not tested.

Before concluding, run the application, validate the first-use flow and test at least one real REST
call. Do not declare functionality as complete without verifying it.
