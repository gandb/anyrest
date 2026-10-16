/**
 * Icon URL resolution (SPEC §3.1, frozen) and icon-file policy (SPEC §3.1.3).
 *
 * The app never reads local OS filesystem paths: anything that is not http(s),
 * `data:` or a web-app-relative URL simply fails to load and the UI falls back
 * to the neutral tile (SPEC §3.1.4).
 */

const ABSOLUTE_ICON_PATTERN = /^(https?:\/\/|data:)/i;
const ALLOWED_ICON_FILE_PATTERN = /\.(png|webp)$/i;
const ALLOWED_DATA_ICON_PATTERN = /^data:image\/(png|webp)[;,]/i;

/**
 * Resolves `buttons[].icon` against the optional `app.iconpath` base.
 * Returns `null` when there is no usable icon (the caller renders a fallback tile).
 */
export function resolveIconUrl(icon?: string, iconpath?: string): string | null {
  if (icon === undefined) {
    return null;
  }
  const name = icon.trim();
  if (name === '') {
    return null;
  }
  if (ABSOLUTE_ICON_PATTERN.test(name)) {
    return name;
  }
  const base = iconpath === undefined ? '' : iconpath.trim().replace(/\/+$/, '');
  if (base === '') {
    return name;
  }
  const relative = name.replace(/^\/+/, '');
  return relative === '' ? base : `${base}/${relative}`;
}

/** True only for `.png` / `.webp` sources (case-insensitive, query string ignored). */
export function isAllowedIconFile(url: string): boolean {
  const withoutQuery = url.split(/[?#]/)[0];
  return ALLOWED_ICON_FILE_PATTERN.test(withoutQuery);
}

/**
 * True only for sources the UI may bind to an `<img src>` (SPEC §3.1.3, frozen):
 * an allowed file (`.png` / `.webp`, query string and fragment ignored) or an
 * inline `data:image/png` / `data:image/webp` payload. Every other format —
 * `.svg`, `.jpg`, `data:image/svg+xml`, extension-less paths — is not a renderable
 * icon and must be shown as the fallback tile instead (SPEC §3.1.4).
 */
export function isAllowedIconUrl(url: string): boolean {
  return ALLOWED_DATA_ICON_PATTERN.test(url) || isAllowedIconFile(url);
}

/**
 * Resolves the icon for display: the resolved URL when its format is allowed
 * (SPEC §3.1.3), `null` otherwise so the caller renders the fallback tile
 * (SPEC §3.1.4). This is the single place where the format policy is enforced at
 * render time; `resolveIconUrl` stays a pure joiner.
 */
export function resolveDisplayIconUrl(icon?: string, iconpath?: string): string | null {
  const url = resolveIconUrl(icon, iconpath);
  return url !== null && isAllowedIconUrl(url) ? url : null;
}

/**
 * Resolves the icon for display including the icons copied into the app (SPEC
 * §3.1 amendment). The frozen precedence is untouched: `http(s)`/`data:` is used
 * as-is and an explicit `app.iconpath` still wins. Only where the frozen rule
 * would treat the name as a web-app-relative URL — a plain name with no
 * `iconpath` — is the name looked up in the set the user copied in.
 */
export function resolveDisplayIconUrlWithStore(
  icon: string | undefined,
  iconpath: string | undefined,
  stored: ReadonlyMap<string, string> | undefined,
): string | null {
  const name = icon?.trim() ?? '';
  if (name === '') {
    return null;
  }
  if (ABSOLUTE_ICON_PATTERN.test(name)) {
    return isAllowedIconUrl(name) ? name : null;
  }
  const base = iconpath?.trim() ?? '';
  if (base !== '') {
    const joined = resolveIconUrl(name, base);
    return joined !== null && isAllowedIconUrl(joined) ? joined : null;
  }
  const local = stored?.get(name);
  return local !== undefined && isAllowedIconUrl(local) ? local : null;
}

/**
 * Text for the fallback tile (SPEC §3.1.4): the first 1–2 characters of the label,
 * so a missing or broken icon never renders as a broken-image glyph.
 */
export function fallbackInitial(label: string): string {
  return [...label.trim()].slice(0, 2).join('');
}
