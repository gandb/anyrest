import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preferencesMock, httpGetMock } = vi.hoisted(() => ({
  preferencesMock: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  httpGetMock: vi.fn(),
}));

vi.mock('@capacitor/preferences', () => ({ Preferences: preferencesMock }));

import { ACTIVE_CONFIG_KEY, ConfigService, DEMO_CONFIG_URL } from './config.service';

const validConfig = {
  version: 1,
  app: { title: 'AnyRest' },
  buttons: [
    {
      id: 'demo-get',
      label: 'GET',
      request: { method: 'GET', url: 'https://example.com/get' },
    },
  ],
};

const invalidConfig = {
  version: 1,
  app: { title: 'AnyRest' },
  buttons: [
    {
      id: 'BAD ID',
      label: '',
      request: { method: 'TRACE', url: 'ftp://example.com' },
      secretExtra: true,
    },
  ],
};

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(() => {
    preferencesMock.get.mockReset();
    preferencesMock.set.mockReset();
    httpGetMock.mockReset();
    preferencesMock.get.mockResolvedValue({ value: null });
    preferencesMock.set.mockResolvedValue(undefined);
    httpGetMock.mockReturnValue(of(JSON.stringify(validConfig)));
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get: httpGetMock } }],
    });
    service = TestBed.inject(ConfigService);
  });

  it('starts with no active configuration', () => {
    expect(service.active()).toBeNull();
    expect(service.isConfigured$.value).toBe(false);
  });

  it('activateText persists the validated content and marks the app configured', async () => {
    const result = await service.activateText(JSON.stringify(validConfig));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(preferencesMock.set).toHaveBeenCalledTimes(1);
    expect(preferencesMock.set).toHaveBeenCalledWith({
      key: ACTIVE_CONFIG_KEY,
      value: JSON.stringify(validConfig),
    });
    expect(service.active()).toEqual(validConfig);
    expect(service.isConfigured$.value).toBe(true);
  });

  it('activateObject(valid) persists and activates', async () => {
    const result = await service.activateObject(validConfig);

    expect(result.ok).toBe(true);
    expect(preferencesMock.set).toHaveBeenCalledTimes(1);
    expect(service.isConfigured$.value).toBe(true);
  });

  it('an INVALID activation persists nothing and keeps the previous configuration', async () => {
    await service.activateText(JSON.stringify(validConfig));
    preferencesMock.set.mockClear();

    const result = await service.activateText(JSON.stringify(invalidConfig));

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(preferencesMock.set).not.toHaveBeenCalled();
    expect(service.active()).toEqual(validConfig);
    expect(service.isConfigured$.value).toBe(true);
  });

  it('rejects text that is not JSON and persists nothing', async () => {
    const result = await service.activateText('{ not json');

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ path: '$', message: 'The selected file is not valid JSON.' }]);
    expect(preferencesMock.set).not.toHaveBeenCalled();
    expect(service.active()).toBeNull();
  });

  it('loadActive returns the stored valid configuration', async () => {
    preferencesMock.get.mockResolvedValue({ value: JSON.stringify(validConfig) });

    const loaded = await service.loadActive();

    expect(loaded).toEqual(validConfig);
    expect(service.active()).toEqual(validConfig);
    expect(service.isConfigured$.value).toBe(true);
  });

  it('loadActive returns null for a corrupt stored value (never throws)', async () => {
    preferencesMock.get.mockResolvedValue({ value: '}{ corrupt' });

    await expect(service.loadActive()).resolves.toBeNull();
    expect(service.active()).toBeNull();
    expect(service.isConfigured$.value).toBe(false);
    expect(preferencesMock.set).not.toHaveBeenCalled();
  });

  it('loadActive returns null when the stored value parses but is invalid', async () => {
    preferencesMock.get.mockResolvedValue({ value: JSON.stringify(invalidConfig) });

    await expect(service.loadActive()).resolves.toBeNull();
    expect(service.isConfigured$.value).toBe(false);
  });

  it('loadActive returns null when storage read fails (never throws)', async () => {
    preferencesMock.get.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.loadActive()).resolves.toBeNull();
    expect(service.isConfigured$.value).toBe(false);
  });

  it('loadActive returns null when nothing is stored', async () => {
    preferencesMock.get.mockResolvedValue({ value: null });

    await expect(service.loadActive()).resolves.toBeNull();
  });

  it('resetToDemo fetches the bundled demo and activates it', async () => {
    const result = await service.resetToDemo();

    expect(result.ok).toBe(true);
    expect(httpGetMock).toHaveBeenCalledWith(DEMO_CONFIG_URL, { responseType: 'text' });
    expect(service.isConfigured$.value).toBe(true);
    expect(preferencesMock.set).toHaveBeenCalledTimes(1);
  });

  it('resetToDemo returns a friendly failure when the demo cannot be fetched', async () => {
    httpGetMock.mockReturnValue(throwError(() => new Error('404')));

    const result = await service.resetToDemo();

    expect(result.ok).toBe(false);
    expect(result.errors[0].path).toBe('$');
    expect(preferencesMock.set).not.toHaveBeenCalled();
    expect(service.isConfigured$.value).toBe(false);
  });

  describe('initialize (first-run race ruling)', () => {
    it('reads the stored configuration once and stays idempotent', async () => {
      preferencesMock.get.mockResolvedValue({ value: JSON.stringify(validConfig) });

      expect(service.initialized).toBe(false);
      await service.initialize();
      await service.initialize();

      expect(service.initialized).toBe(true);
      expect(preferencesMock.get).toHaveBeenCalledTimes(1);
      expect(service.isConfigured$.value).toBe(true);
      expect(service.active()).toEqual(validConfig);
    });

    it('resolves marked as initialized when nothing is stored', async () => {
      await service.initialize();

      expect(service.initialized).toBe(true);
      expect(service.isConfigured$.value).toBe(false);
    });

    it('resolves marked as initialized when the storage read fails', async () => {
      preferencesMock.get.mockRejectedValue(new Error('storage unavailable'));

      await expect(service.initialize()).resolves.toBeUndefined();

      expect(service.initialized).toBe(true);
      expect(service.isConfigured$.value).toBe(false);
    });
  });
});
