/**
 * Icons copied into the app's own storage (SPEC §3.1 amendment).
 *
 * The images picked together with `anyrest.json` are copied here as `data:` URLs
 * keyed by file name, so the app never depends on the picked file staying
 * reachable (restriction 10). The set is replaced only on an explicit
 * confirmation — the selection the user confirms is the whole set.
 */
import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export const ICON_STORE_KEY = 'anyrest:icons';

/** Parses the stored JSON; anything unexpected yields an empty set. */
export function parseIconStore(stored: string | null): Map<string, string> {
  if (!stored) {
    return new Map();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return new Map();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return new Map();
  }
  const out = new Map<string, string>();
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && value !== '') {
      out.set(name, value);
    }
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class IconStoreService {
  private readonly icons = signal<ReadonlyMap<string, string>>(new Map());

  /** Single shared promise so `load()` never reads storage twice. */
  private loadPromise: Promise<ReadonlyMap<string, string>> | null = null;

  /**
   * Bumped on every write. An initial read that resolves *after* a write must not
   * clobber it — measured: the preview showed the image while the list did not,
   * because the read that started at app boot landed after the confirmation.
   */
  private revision = 0;

  /** Reactive view of the copied icons (empty until `load()` resolves). */
  readonly stored = this.icons.asReadonly();

  /** Reads the copied icons exactly once. Never rejects. */
  load(): Promise<ReadonlyMap<string, string>> {
    if (this.loadPromise === null) {
      this.loadPromise = this.read();
    }
    return this.loadPromise;
  }

  /** The copied icon for a file name, or undefined when there is none. */
  get(name: string): string | undefined {
    return this.icons().get(name);
  }

  /** Replaces the whole set; returns false when it could not be persisted. */
  async replaceAll(entries: ReadonlyMap<string, string>): Promise<boolean> {
    try {
      await Preferences.set({
        key: ICON_STORE_KEY,
        value: JSON.stringify(Object.fromEntries(entries)),
      });
    } catch {
      return false;
    }
    this.revision += 1;
    this.icons.set(new Map(entries));
    return true;
  }

  /** Forgets every copied icon. */
  async clear(): Promise<boolean> {
    return this.replaceAll(new Map());
  }

  private async read(): Promise<ReadonlyMap<string, string>> {
    const startedAt = this.revision;
    let stored: string | null = null;
    try {
      const result = await Preferences.get({ key: ICON_STORE_KEY });
      stored = result?.value ?? null;
    } catch {
      if (this.revision === startedAt) {
        this.icons.set(new Map());
      }
      return this.icons();
    }
    // A write that landed while this read was in flight wins — never clobber it.
    if (this.revision !== startedAt) {
      return this.icons();
    }
    this.icons.set(parseIconStore(stored));
    return this.icons();
  }
}
