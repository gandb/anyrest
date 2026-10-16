/**
 * Classification and reading of a multi-file selection (SPEC §3.1 amendment).
 *
 * The user picks the `anyrest.json` and its images together, in one selection;
 * the app copies them into its own storage so nothing depends on the picked file
 * staying reachable (restriction 10). This module holds the rules only — it is
 * pure apart from the `FileReader` used to turn an image into a `data:` URL — so
 * every rule is unit-testable without a device.
 */
import type { ValidationIssue } from './types';

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

const isConfigFile = (f: PickedFile): boolean =>
  JSON_FILE.test(f.name) || f.type.toLowerCase() === 'application/json';

const isIconFile = (f: PickedFile): boolean =>
  ICON_FILE.test(f.name) || ICON_TYPE.test(f.type);

const asMb = (bytes: number): string => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/**
 * Splits a selection into the configuration, the icons to copy and what was
 * ignored, collecting the blocking problems along the way.
 */
export function splitSelection<T extends PickedFile>(files: readonly T[]): SelectionSplit<T> {
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
    if (file.size > MAX_ICON_BYTES) {
      errors.push({
        path: file.name,
        message: `The image is too large (${asMb(file.size)}); the limit is ${asMb(MAX_ICON_BYTES)} per image.`,
      });
      continue;
    }
    if (file.size === 0) {
      errors.push({ path: file.name, message: 'The image is empty.' });
      continue;
    }
    if (seen.has(file.name)) {
      errors.push({ path: file.name, message: 'Two selected images share this name.' });
      continue;
    }
    seen.add(file.name);
    images.push(file);
  }

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

/** Reads one blob as a `data:` URL; rejects when the browser cannot read it. */
function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('unreadable'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
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
      } else {
        icons.set(file.name, url);
      }
    } catch {
      errors.push({ path: file.name, message: 'The image could not be read.' });
    }
  }
  return { icons, errors };
}
