/**
 * Active configuration persistence (SPEC §6).
 *
 * The active configuration is stored as the VALIDATED CONTENT serialized to JSON
 * under the `anyrest:active` key — never a file path. Activation validates first;
 * when validation fails nothing is written, so a bad file can never clobber a good one.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { validateConfig } from '../core/validate';
import type { AnyRestConfig, ValidationResult } from '../core/types';

export const ACTIVE_CONFIG_KEY = 'anyrest:active';
export const DEMO_CONFIG_URL = '/assets/anyrest.demo.json';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);

  /** Emits the in-memory active configuration (null when none is valid). */
  private readonly activeSubject = new BehaviorSubject<AnyRestConfig | null>(null);

  /** True as soon as a validated configuration is active; false otherwise. */
  readonly isConfigured$ = new BehaviorSubject<boolean>(false);

  /** True once the stored configuration has been read at least once (SPEC §6 app start). */
  initialized = false;

  /** Single shared promise so `initialize()` never reads storage twice. */
  private initPromise: Promise<void> | null = null;

  /** Current in-memory configuration, or null when nothing valid is active. */
  active(): AnyRestConfig | null {
    return this.activeSubject.value;
  }

  /**
   * Reads the stored configuration exactly once and resolves when `isConfigured$`
   * holds the truth for this start (SPEC §6 app start; first-run race ruling).
   *
   * Idempotent: every later call returns the same promise and never re-reads storage,
   * so a caller may await it freely (guard) while the app wires it as an initializer.
   * Never rejects.
   */
  initialize(): Promise<void> {
    if (this.initPromise === null) {
      this.initPromise = this.loadActive().then(() => {
        this.initialized = true;
      });
    }
    return this.initPromise;
  }

  /**
   * Reads, parses and validates the stored configuration.
   * Never throws: an absent, corrupt or invalid value resolves to null.
   */
  async loadActive(): Promise<AnyRestConfig | null> {
    let stored: string | null = null;
    try {
      const result = await Preferences.get({ key: ACTIVE_CONFIG_KEY });
      stored = result?.value ?? null;
    } catch {
      this.setActive(null);
      return null;
    }
    if (!stored) {
      this.setActive(null);
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      this.setActive(null);
      return null;
    }
    if (!validateConfig(parsed).ok) {
      this.setActive(null);
      return null;
    }
    this.setActive(parsed as AnyRestConfig);
    return this.active();
  }

  /** Validates raw JSON text; on any failure nothing is persisted. */
  async activateText(text: string): Promise<ValidationResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        errors: [{ path: '$', message: 'The selected file is not valid JSON.' }],
      };
    }
    return this.activateObject(parsed);
  }

  /**
   * Validates an already parsed value; only a valid configuration is persisted.
   * On failure the previous active configuration stays untouched.
   */
  async activateObject(cfg: unknown): Promise<ValidationResult> {
    const result = validateConfig(cfg);
    if (!result.ok) {
      return result;
    }
    try {
      await Preferences.set({ key: ACTIVE_CONFIG_KEY, value: JSON.stringify(cfg) });
    } catch {
      return {
        ok: false,
        errors: [{ path: '$', message: 'The configuration could not be saved on this device.' }],
      };
    }
    this.setActive(cfg as AnyRestConfig);
    return { ok: true, errors: [] };
  }

  /** Loads `/assets/anyrest.demo.json` and activates it through the normal path. */
  async resetToDemo(): Promise<ValidationResult> {
    try {
      const text = await firstValueFrom(this.http.get(DEMO_CONFIG_URL, { responseType: 'text' }));
      return await this.activateText(text);
    } catch {
      return {
        ok: false,
        errors: [{ path: '$', message: 'The demo configuration could not be loaded.' }],
      };
    }
  }

  private setActive(config: AnyRestConfig | null): void {
    this.activeSubject.next(config);
    this.isConfigured$.next(config !== null);
  }
}
