/**
 * Icons copied into the app (SPEC §3.1 amendment).
 *
 * The set lives under its own key, a corrupt or absent value yields an empty set,
 * and a storage failure never throws — the app falls back to the tiles.
 */
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preferencesMock } = vi.hoisted(() => ({
  preferencesMock: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

vi.mock('@capacitor/preferences', () => ({ Preferences: preferencesMock }));

import { IconStoreService, parseIconStore } from './icon-store.service';

describe('parseIconStore', () => {
  it('returns an empty set for absent or unusable values', () => {
    expect(parseIconStore(null).size).toBe(0);
    expect(parseIconStore('{ not json').size).toBe(0);
    expect(parseIconStore('[]').size).toBe(0);
    expect(parseIconStore('"text"').size).toBe(0);
  });

  it('keeps only the non-empty string entries', () => {
    const map = parseIconStore(
      JSON.stringify({ 'get.png': 'data:image/png;base64,AA', bad: 1, empty: '' }),
    );

    expect([...map.keys()]).toEqual(['get.png']);
  });
});

describe('IconStoreService', () => {
  let store: IconStoreService;

  beforeEach(() => {
    preferencesMock.get.mockReset();
    preferencesMock.set.mockReset();
    preferencesMock.get.mockResolvedValue({ value: null });
    preferencesMock.set.mockResolvedValue(undefined);

    TestBed.configureTestingModule({});
    store = TestBed.inject(IconStoreService);
  });

  it('reads the copied icons exactly once and exposes them by name', async () => {
    preferencesMock.get.mockResolvedValue({
      value: JSON.stringify({ 'get.png': 'data:image/png;base64,AA' }),
    });

    await store.load();
    await store.load();

    expect(preferencesMock.get).toHaveBeenCalledTimes(1);
    expect(store.get('get.png')).toBe('data:image/png;base64,AA');
    expect(store.get('missing.png')).toBeUndefined();
  });

  it('replaces the whole set and clears it', async () => {
    const entries = new Map([['a.png', 'data:image/png;base64,AA']]);

    await expect(store.replaceAll(entries)).resolves.toBe(true);
    expect(preferencesMock.set).toHaveBeenCalledWith({
      key: 'anyrest:icons',
      value: JSON.stringify({ 'a.png': 'data:image/png;base64,AA' }),
    });
    expect(store.get('a.png')).toBe('data:image/png;base64,AA');

    await expect(store.clear()).resolves.toBe(true);
    expect(store.stored().size).toBe(0);
  });

  it('reports a failing write and keeps the previous set', async () => {
    await store.replaceAll(new Map([['a.png', 'data:image/png;base64,AA']]));
    preferencesMock.set.mockRejectedValue(new Error('storage full'));

    await expect(
      store.replaceAll(new Map([['b.png', 'data:image/png;base64,BB']])),
    ).resolves.toBe(false);
    expect(store.get('a.png')).toBe('data:image/png;base64,AA');
  });

  it('never throws when storage is unreadable', async () => {
    preferencesMock.get.mockRejectedValue(new Error('nope'));

    await expect(store.load()).resolves.toEqual(new Map());
    expect(store.stored().size).toBe(0);
  });
});
