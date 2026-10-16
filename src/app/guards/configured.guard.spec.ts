/**
 * ConfiguredGuard behaviour (first-run race ruling).
 *
 * The guard must decide only AFTER the stored configuration has been read, so a
 * valid stored config never sends the user to `/config` on a normal start.
 */
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preferencesMock } = vi.hoisted(() => ({
  preferencesMock: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

vi.mock('@capacitor/preferences', () => ({ Preferences: preferencesMock }));

import { ConfiguredGuard } from './configured.guard';

const validConfig = { version: 1, app: { title: 'AnyRest' }, buttons: [] };

function runGuard(): Promise<boolean | UrlTree> {
  return TestBed.runInInjectionContext(
    () => ConfiguredGuard({} as never, {} as never)
  ) as Promise<boolean | UrlTree>;
}

describe('ConfiguredGuard', () => {
  beforeEach(() => {
    preferencesMock.get.mockReset();
    preferencesMock.set.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get: vi.fn() } }, provideRouter([])],
    });
  });

  it('lets a normal start through when a valid configuration is stored', async () => {
    preferencesMock.get.mockResolvedValue({ value: JSON.stringify(validConfig) });

    await expect(runGuard()).resolves.toBe(true);
  });

  it('redirects to /config when nothing valid is stored', async () => {
    preferencesMock.get.mockResolvedValue({ value: null });

    const result = await runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/config');
  });

  it('redirects to /config when the stored value is corrupt', async () => {
    preferencesMock.get.mockResolvedValue({ value: '}{ not json' });

    const result = await runGuard();

    expect(String(result)).toBe('/config');
  });

  it('awaits the storage read instead of answering from an empty state', async () => {
    preferencesMock.get.mockReturnValue(
      new Promise((resolve) =>
        setTimeout(() => resolve({ value: JSON.stringify(validConfig) }), 10)
      ) as never
    );

    await expect(runGuard()).resolves.toBe(true);
  });

  it('reads the stored configuration only once across guard runs', async () => {
    preferencesMock.get.mockResolvedValue({ value: JSON.stringify(validConfig) });

    await runGuard();
    await runGuard();

    expect(preferencesMock.get).toHaveBeenCalledTimes(1);
  });
});
