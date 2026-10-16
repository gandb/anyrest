/**
 * Hand-written validator for `anyrest.json` (SPEC §2 schema + §5 app rules).
 *
 * Deliberately dependency-free (no `ajv`): every rule of the draft-07 schema is
 * expressible directly, and the app must not gain a runtime dependency for it.
 * The validator never throws: it always returns a ValidationResult.
 */
import type { ValidationIssue, ValidationResult } from './types';

const METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const DISPLAYS: readonly string[] = ['json', 'text'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ABSOLUTE_URL_PATTERN = /^https?:\/\//;
const MAX_BUTTONS = 200;
const MAX_MAP_KEYS = 100;
const MAX_URL_LENGTH = 2048;

const ROOT_KEYS = ['version', 'app', 'buttons'] as const;
const APP_KEYS = ['title', 'description', 'iconpath'] as const;
const BUTTON_KEYS = ['id', 'label', 'description', 'icon', 'request', 'response'] as const;
const REQUEST_KEYS = ['method', 'url', 'headers', 'queryParams', 'body', 'timeoutMs'] as const;
const RESPONSE_KEYS = ['display', 'successMessage', 'errorMessage'] as const;

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

class IssueCollector {
  readonly errors: ValidationIssue[] = [];

  add(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }
}

function childPath(parent: string, key: string): string {
  return parent === '' ? key : `${parent}.${key}`;
}

function checkUnknownKeys(
  object: JsonObject,
  allowed: readonly string[],
  path: string,
  issues: IssueCollector
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      issues.add(childPath(path, key), `Unknown property "${key}" is not allowed here.`);
    }
  }
}

/** Required string with a length window; missing/undefined counts as missing. */
function requireString(
  object: JsonObject,
  key: string,
  path: string,
  issues: IssueCollector,
  minLength: number,
  maxLength: number
): void {
  const value = object[key];
  const path1 = childPath(path, key);
  if (value === undefined) {
    issues.add(path1, `Required property "${key}" is missing.`);
    return;
  }
  if (!isString(value)) {
    issues.add(path1, `"${key}" must be a string.`);
    return;
  }
  if (value.length < minLength) {
    issues.add(path1, `"${key}" must not be empty.`);
    return;
  }
  if (value.length > maxLength) {
    issues.add(path1, `"${key}" must be at most ${maxLength} characters long.`);
  }
}

function optionalString(
  object: JsonObject,
  key: string,
  path: string,
  issues: IssueCollector,
  maxLength: number
): void {
  const value = object[key];
  if (value === undefined) {
    return;
  }
  const path1 = childPath(path, key);
  if (!isString(value)) {
    issues.add(path1, `"${key}" must be a string.`);
    return;
  }
  if (value.length > maxLength) {
    issues.add(path1, `"${key}" must be at most ${maxLength} characters long.`);
  }
}

function validateVersion(root: JsonObject, issues: IssueCollector): void {
  const value = root['version'];
  if (value === undefined) {
    issues.add('version', 'Required property "version" is missing.');
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.add('version', '"version" must be the integer 1.');
    return;
  }
  if (value !== 1) {
    issues.add('version', 'Only configuration version 1 is supported.');
  }
}

function validateApp(root: JsonObject, issues: IssueCollector): void {
  const value = root['app'];
  if (value === undefined) {
    issues.add('app', 'Required property "app" is missing.');
    return;
  }
  if (!isPlainObject(value)) {
    issues.add('app', '"app" must be an object.');
    return;
  }
  checkUnknownKeys(value, APP_KEYS, 'app', issues);
  requireString(value, 'title', 'app', issues, 1, 120);
  optionalString(value, 'description', 'app', issues, 300);
  optionalString(value, 'iconpath', 'app', issues, MAX_URL_LENGTH);
}

function validateStringMap(value: unknown, path: string, issues: IssueCollector): void {
  if (value === undefined) {
    return;
  }
  const name = path.slice(path.lastIndexOf('.') + 1);
  if (!isPlainObject(value)) {
    issues.add(path, `"${name}" must be an object mapping names to strings.`);
    return;
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_MAP_KEYS) {
    issues.add(path, `"${name}" must contain at most ${MAX_MAP_KEYS} entries.`);
  }
  for (const key of keys) {
    if (!isString(value[key])) {
      issues.add(childPath(path, key), `Value of "${key}" must be a string.`);
    }
  }
}

function validateBody(value: unknown, path: string, issues: IssueCollector): void {
  if (value === undefined) {
    return;
  }
  if (!isString(value) && !Array.isArray(value) && !isPlainObject(value)) {
    issues.add(path, '"body" must be an object, an array or a string.');
  }
}

function validateTimeoutMs(value: unknown, path: string, issues: IssueCollector): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.add(path, '"timeoutMs" must be an integer number of milliseconds.');
    return;
  }
  if (value < 1) {
    issues.add(path, '"timeoutMs" must be at least 1.');
  }
}

function validateRequest(value: unknown, buttonPath: string, issues: IssueCollector): void {
  const path = childPath(buttonPath, 'request');
  if (value === undefined) {
    issues.add(path, 'Required property "request" is missing.');
    return;
  }
  if (!isPlainObject(value)) {
    issues.add(path, '"request" must be an object.');
    return;
  }
  checkUnknownKeys(value, REQUEST_KEYS, path, issues);

  const method = value['method'];
  const methodPath = childPath(path, 'method');
  if (method === undefined) {
    issues.add(methodPath, 'Required property "method" is missing.');
  } else if (!isString(method) || !METHODS.includes(method)) {
    issues.add(methodPath, `"method" must be one of ${METHODS.join(', ')}.`);
  }

  const url = value['url'];
  const urlPath = childPath(path, 'url');
  if (url === undefined) {
    issues.add(urlPath, 'Required property "url" is missing.');
  } else if (!isString(url)) {
    issues.add(urlPath, '"url" must be a string.');
  } else {
    if (url.length > MAX_URL_LENGTH) {
      issues.add(urlPath, `"url" must be at most ${MAX_URL_LENGTH} characters long.`);
    }
    if (!ABSOLUTE_URL_PATTERN.test(url)) {
      issues.add(urlPath, '"url" must be an absolute http:// or https:// URL.');
    }
  }

  validateStringMap(value['headers'], childPath(path, 'headers'), issues);
  validateStringMap(value['queryParams'], childPath(path, 'queryParams'), issues);
  validateBody(value['body'], childPath(path, 'body'), issues);
  validateTimeoutMs(value['timeoutMs'], childPath(path, 'timeoutMs'), issues);
}

function validateResponse(value: unknown, buttonPath: string, issues: IssueCollector): void {
  if (value === undefined) {
    return;
  }
  const path = childPath(buttonPath, 'response');
  if (!isPlainObject(value)) {
    issues.add(path, '"response" must be an object.');
    return;
  }
  checkUnknownKeys(value, RESPONSE_KEYS, path, issues);

  const display = value['display'];
  if (display !== undefined && (!isString(display) || !DISPLAYS.includes(display))) {
    issues.add(childPath(path, 'display'), '"display" must be "json" or "text".');
  }
  optionalString(value, 'successMessage', path, issues, 300);
  optionalString(value, 'errorMessage', path, issues, 300);
}

function validateButtonId(button: JsonObject, path: string, issues: IssueCollector): void {
  const value = button['id'];
  const idPath = childPath(path, 'id');
  if (value === undefined) {
    issues.add(idPath, 'Required property "id" is missing.');
    return;
  }
  if (!isString(value)) {
    issues.add(idPath, '"id" must be a string.');
    return;
  }
  if (!ID_PATTERN.test(value)) {
    issues.add(
      idPath,
      '"id" must start with a lowercase letter or digit and use only lowercase letters, digits and hyphens (max 64).'
    );
  }
}

function validateButton(value: unknown, index: number, issues: IssueCollector): void {
  const path = `buttons[${index}]`;
  if (!isPlainObject(value)) {
    issues.add(path, 'Each button must be an object.');
    return;
  }
  checkUnknownKeys(value, BUTTON_KEYS, path, issues);
  validateButtonId(value, path, issues);
  requireString(value, 'label', path, issues, 1, 80);
  optionalString(value, 'description', path, issues, 200);
  optionalString(value, 'icon', path, issues, MAX_URL_LENGTH);
  validateRequest(value['request'], path, issues);
  validateResponse(value['response'], path, issues);
}

function validateButtons(root: JsonObject, issues: IssueCollector): void {
  const value = root['buttons'];
  if (value === undefined) {
    issues.add('buttons', 'Required property "buttons" is missing.');
    return;
  }
  if (!Array.isArray(value)) {
    issues.add('buttons', '"buttons" must be an array.');
    return;
  }
  if (value.length > MAX_BUTTONS) {
    issues.add('buttons', `"buttons" must contain at most ${MAX_BUTTONS} entries.`);
  }
  value.forEach((button, index) => validateButton(button, index, issues));
}

/** App-level rule not expressible in draft-07: one issue per extra duplicate. */
function validateUniqueButtonIds(root: JsonObject, issues: IssueCollector): void {
  const buttons = root['buttons'];
  if (!Array.isArray(buttons)) {
    return;
  }
  const seen = new Set<string>();
  buttons.forEach((button, index) => {
    if (!isPlainObject(button) || !isString(button['id'])) {
      return;
    }
    const id = button['id'];
    if (seen.has(id)) {
      issues.add(`buttons[${index}].id`, `Duplicate button id "${id}"; every id must be unique.`);
      return;
    }
    seen.add(id);
  });
}

/**
 * Validates an unknown value against SPEC §2 + §5.
 * Never throws; collects every issue it can find (deterministic order).
 */
export function validateConfig(input: unknown): ValidationResult {
  const issues = new IssueCollector();
  if (!isPlainObject(input)) {
    issues.add('$', 'Configuration must be a JSON object.');
    return { ok: false, errors: issues.errors };
  }
  checkUnknownKeys(input, ROOT_KEYS, '', issues);
  validateVersion(input, issues);
  validateApp(input, issues);
  validateButtons(input, issues);
  validateUniqueButtonIds(input, issues);
  return { ok: issues.ok, errors: issues.errors };
}
