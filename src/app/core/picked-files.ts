/**
 * Classification and reading of a multi-file selection (SPEC §3.1 amendment).
 *
 * The user picks the `anyrest.json` and its images together, in one selection;
 * the app copies them into its own storage so nothing depends on the picked file
 * staying reachable (restriction 10). This module holds the rules only — it is
 * pure apart from the `FileReader` used to turn an image into a `data:` URL — so
 * every rule is unit-testable without a device.
 */
import type { AnyRestConfig, ValidationIssue } from './types';

/** Largest icon the app copies into its own storage (base64 grows it by ~33%). */
export const MAX_ICON_BYTES = 512 * 1024;

/** The minimal shape of a picked file (a `File` satisfies it). */
export interface PickedFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export interface SelectionSplit<T extends PickedFile = PickedFile> {
  /** The single configuration file of the selection, or null when ambiguous/absent. */
  readonly config: T | null;
  /** Icons to copy, in selection order. */
  readonly images: readonly T[];
  /** Names of the picked files that are neither the configuration nor an allowed icon. */
  readonly ignored: readonly string[];
  /** Blocking problems: exactly one configuration is required; each icon must be allowed and small. */
  readonly errors: readonly ValidationIssue[];
}

const JSON_FILE = /\.json$/i;
const ICON_FILE = /\.(png|webp)$/i;
const ICON_TYPE = /^image\/(png|webp)$/i;
const ABSOLUTE_ICON = /^(https?:\/\/|data:)/i;

/**
 * Plain image names a configuration needs that the selection did not bring.
 *
 * This is the check that turns a silent fallback tile into a visible warning: a
 * configuration naming `get.png` while no image was selected would otherwise
 * confirm happily and show initials instead of the image the user expected.
 * A configuration with `app.iconpath` is exempt — there the name may legitimately
 * resolve against that base.
 */
export function missingIconNames(
  config: AnyRestConfig,
  icons: ReadonlyMap<string, string>,
): string[] {
  const base = config.app.iconpath?.trim() ?? '';
  if (base !== '') {
    return [];
  }
  const missing: string[] = [];
  for (const button of config.buttons) {
    const name = button.icon?.trim() ?? '';
    if (name === '' || ABSOLUTE_ICON.test(name) || icons.has(name) || missing.includes(name)) {
      continue;
    }
    missing.push(name);
  }
  return missing;
}

const isConfigFile = (f: PickedFile): boolean =>
  JSON_FILE.test(f.name) || f.type.toLowerCase() === 'application/json';

const isIconFile = (f: PickedFile): boolean =>
  ICON_FILE.test(f.name) || ICON_TYPE.test(f.type);

const asMb = (bytes: number): string => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/** Names the user added that no button of this configuration references. */
export function unusedIconNames(
  config: AnyRestConfig,
  icons: ReadonlyMap<string, string>,
): string[] {
  const named = new Set<string>();
  for (const button of config.buttons) {
    const name = button.icon?.trim() ?? '';
    if (name !== '' && !ABSOLUTE_ICON.test(name)) {
      named.add(name);
    }
  }
  return [...icons.keys()].filter((name) => !named.has(name));
}

/**
 * Classifies the icon files of a selection: the allowed images to copy, the files
 * to ignore, and the blocking problems. The configuration file is neither an icon
 * nor "ignored" — it is simply not this function's business.
 */
export function classifyImages<T extends PickedFile>(
  files: readonly T[],
): { images: T[]; ignored: string[]; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const ignored: string[] = [];
  const images: T[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (isConfigFile(file)) {
      continue;
    }
    if (!isIconFile(file)) {
      ignored.push(file.name);
      continue;
    }
    // Fast path only: a picker may report no size at all (0) for a perfectly good
    // file — common with Android `content://` URIs — so the real limit is enforced
    // on the decoded payload when the image is read (see readIconDataUrls).
    if (file.size > MAX_ICON_BYTES) {
      errors.push({
        path: file.name,
        message: `The image is too large (${asMb(file.size)}); the limit is ${asMb(MAX_ICON_BYTES)} per image.`,
      });
      continue;
    }
    if (seen.has(file.name)) {
      errors.push({ path: file.name, message: 'Two selected images share this name.' });
      continue;
    }
    seen.add(file.name);
    images.push(file);
  }

  return { images, ignored, errors };
}

/**
 * Splits a selection into the configuration, the icons to copy and what was
 * ignored, collecting the blocking problems along the way.
 */
export function splitSelection<T extends PickedFile>(files: readonly T[]): SelectionSplit<T> {
  const { images, ignored, errors } = classifyImages(files);

  const configs = files.filter(isConfigFile);
  if (configs.length === 0) {
    errors.push({
      path: '$',
      message: 'Select the anyrest.json file together with its images.',
    });
  } else if (configs.length > 1) {
    errors.push({
      path: '$',
      message: `Select exactly one anyrest.json file — ${configs.length} were selected.`,
    });
  }

  return { config: configs.length === 1 ? configs[0] : null, images, ignored, errors };
}

/** Base64 of raw bytes, chunked so a big image cannot blow the argument limit. */
function base64Of(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Reads a blob as a `data:` URL.
 *
 * Deliberately NOT `FileReader`: on some WebViews a file that reads fine through
 * `Blob.text()` fails in `FileReader` (`onerror`, no detail) — the asymmetry showed
 * up as "the configuration loads but the image never does". `arrayBuffer()` uses the
 * same path as `text()` and has no event plumbing to fail in.
 */
function readAsDataUrl(blob: Blob): Promise<string> {
  return blob
    .arrayBuffer()
    .then((buffer) => `data:${blob.type || 'application/octet-stream'};base64,${base64Of(buffer)}`);
}

/**
 * Rewrites a `data:` URL's media type to `image/png` / `image/webp` when the
 * picker reported no usable type — the render policy (SPEC §3.1.3) accepts
 * nothing else. The file name decides; an unknown extension yields null.
 */
export function normalizeIconDataUrl(dataUrl: string, name: string): string | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) {
    return null;
  }
  const payload = dataUrl.slice(comma + 1);
  if (payload === '') {
    return null;
  }
  const declared = (dataUrl.slice(5, comma).split(';')[0] ?? '').toLowerCase();
  if (declared === 'image/png' || declared === 'image/webp') {
    return dataUrl;
  }
  const byName = /\.png$/i.test(name)
    ? 'image/png'
    : /\.webp$/i.test(name)
      ? 'image/webp'
      : null;
  return byName === null ? null : `data:${byName};base64,${payload}`;
}

/**
 * Bytes carried by a base64 `data:` payload. The picker's reported size is not
 * trusted (Android may report 0), so the limit is checked against this.
 */
export function payloadBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    return 0;
  }
  const payload = dataUrl.slice(comma + 1);
  if (payload === '') {
    return 0;
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/**
 * Reads the picked icons as `data:` URLs keyed by file name. An image that
 * cannot be read or normalized is reported as an error instead of being dropped
 * silently; the caller decides whether to block the confirmation.
 */
export async function readIconDataUrls(
  files: readonly PickedFile[],
): Promise<{ icons: Map<string, string>; errors: ValidationIssue[] }> {
  const icons = new Map<string, string>();
  const errors: ValidationIssue[] = [];
  for (const file of files) {
    try {
      const url = normalizeIconDataUrl(await readAsDataUrl(file as unknown as Blob), file.name);
      if (url === null) {
        errors.push({ path: file.name, message: 'The image could not be read as png or webp.' });
        continue;
      }
      const bytes = payloadBytes(url);
      if (bytes > MAX_ICON_BYTES) {
        errors.push({
          path: file.name,
          message: `The image is too large (${asMb(bytes)}); the limit is ${asMb(MAX_ICON_BYTES)} per image.`,
        });
        continue;
      }
      icons.set(file.name, url);
    } catch {
      errors.push({ path: file.name, message: 'The image could not be read.' });
    }
  }
  return { icons, errors };
}
