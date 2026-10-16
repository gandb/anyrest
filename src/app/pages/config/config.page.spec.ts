/**
 * Config screen behaviour (SPEC §4, §5, §6, §8).
 *
 * The user-visible promises under test: an invalid file lists friendly issues and
 * leaves the active configuration untouched; a valid file is only a PREVIEW until
 * "Confirm and save" persists it.
 */
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { preferencesMock, httpGetMock } = vi.hoisted(() => ({
  preferencesMock: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
  httpGetMock: vi.fn(),
}));

vi.mock('@capacitor/preferences', () => ({ Preferences: preferencesMock }));

import { ConfigPage } from './config.page';
import { ConfigService } from '../../services/config.service';
import { IconStoreService } from '../../services/icon-store.service';

const validConfig = {
  version: 1,
  app: { title: 'AnyRest' },
  buttons: [
    {
      id: 'ping',
      label: 'Ping',
      description: 'Checks the endpoint',
      request: { method: 'GET', url: 'https://example.com/ping' },
    },
  ],
};

/** A configuration whose row references an image by plain file name. */
const iconConfig = {
  version: 1,
  app: { title: 'Icons' },
  buttons: [
    {
      id: 'shapes',
      label: 'Shapes',
      icon: 'shapes.png',
      request: { method: 'GET', url: 'https://example.com/shapes' },
    },
  ],
};

const emptyConfig = { version: 1, app: { title: 'Empty' }, buttons: [] };

const invalidConfig = {
  version: 2,
  app: { title: '' },
  buttons: [{ id: 'PING!', label: '', request: { method: 'TRACE', url: 'ftp://example.com' } }],
};

function fileEvent(content: string, name = 'anyrest.json'): Event {
  const file = new File([content], name, { type: 'application/json' });
  const input = { files: [file], value: name } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

/** One selection holding several files, as the multi-file input delivers them. */
function selectionEvent(files: readonly File[]): Event {
  const input = { files: [...files], value: '' } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

function jsonFile(content = JSON.stringify(validConfig), name = 'anyrest.json'): File {
  return new File([content], name, { type: 'application/json' });
}

function pngFile(name = 'shapes.png', bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

describe('ConfigPage', () => {
  let page: ConfigPage;
  let fixture: ComponentFixture<ConfigPage>;
  let config: ConfigService;
  let iconStore: IconStoreService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    preferencesMock.get.mockReset();
    preferencesMock.set.mockReset();
    httpGetMock.mockReset();
    preferencesMock.get.mockResolvedValue({ value: null });
    preferencesMock.set.mockResolvedValue(undefined);
    httpGetMock.mockReturnValue(of(JSON.stringify(validConfig)));

    await TestBed.configureTestingModule({
      imports: [ConfigPage],
      providers: [{ provide: HttpClient, useValue: { get: httpGetMock } }, provideRouter([])],
    }).compileComponents();

    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    config = TestBed.inject(ConfigService);
    iconStore = TestBed.inject(IconStoreService);
    fixture = TestBed.createComponent(ConfigPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts with no issue, no preview and no cancel action', () => {
    expect(page.issues()).toEqual([]);
    expect(page.preview()).toBeNull();
    expect(config.isConfigured$.value).toBe(false);
  });

  it('a valid file is previewed only — nothing is persisted before Confirm', async () => {
    await page.onFileSelected(fileEvent(JSON.stringify(validConfig)));

    expect(page.preview()).toEqual(validConfig);
    expect(page.issues()).toEqual([]);
    expect(preferencesMock.set).not.toHaveBeenCalled();
    expect(config.isConfigured$.value).toBe(false);

    await page.confirm();

    expect(preferencesMock.set).toHaveBeenCalledTimes(2);
    expect(preferencesMock.set).toHaveBeenCalledWith({
      key: 'anyrest:active',
      value: JSON.stringify(validConfig),
    });
    expect(config.active()).toEqual(validConfig);
    expect(config.isConfigured$.value).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('an invalid file lists the issues and leaves the active configuration untouched', async () => {
    await config.activateText(JSON.stringify(validConfig));
    preferencesMock.set.mockClear();

    await page.onFileSelected(fileEvent(JSON.stringify(invalidConfig)));
    fixture.detectChanges();

    expect(page.issues().length).toBeGreaterThan(0);
    expect(page.preview()).toBeNull();
    expect(preferencesMock.set).not.toHaveBeenCalled();
    expect(config.active()).toEqual(validConfig);
    expect(config.isConfigured$.value).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Configuration is invalid');
    expect(fixture.nativeElement.textContent).toContain('The previously active configuration is unchanged');
  });

  it('text that is not JSON is reported as a friendly single issue', async () => {
    await page.onFileSelected(fileEvent('{ not json'));

    expect(page.issues()).toEqual([
      { path: '$', message: 'The selected file is not valid JSON.' },
    ]);
    expect(page.preview()).toBeNull();
    expect(preferencesMock.set).not.toHaveBeenCalled();
  });

  it('a valid file with zero buttons can still be confirmed', async () => {
    await page.onFileSelected(fileEvent(JSON.stringify(emptyConfig)));
    fixture.detectChanges();

    expect(page.preview()).toEqual(emptyConfig);
    await page.confirm();

    expect(config.active()).toEqual(emptyConfig);
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('the demo is activated and opens home', async () => {
    await page.loadDemo();

    expect(httpGetMock).toHaveBeenCalledWith('/assets/anyrest.demo.json', { responseType: 'text' });
    expect(config.isConfigured$.value).toBe(true);
    expect(page.issues()).toEqual([]);
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('a failing demo load lists the issue and keeps the previous configuration', async () => {
    await config.activateText(JSON.stringify(validConfig));
    preferencesMock.set.mockClear();
    httpGetMock.mockReturnValue(of('{ not json'));

    await page.loadDemo();

    expect(page.issues().length).toBeGreaterThan(0);
    expect(preferencesMock.set).not.toHaveBeenCalled();
    expect(config.active()).toEqual(validConfig);
  });

  it('cancel returns home without changing the active configuration', async () => {
    await config.activateText(JSON.stringify(validConfig));

    page.cancel();

    expect(navigate).toHaveBeenCalledWith('/home');
    expect(config.active()).toEqual(validConfig);
  });

  it('the cancel action is offered once a configuration is active', async () => {
    expect(fixture.nativeElement.textContent).not.toContain('Cancel / Back');

    await config.activateText(JSON.stringify(validConfig));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cancel / Back');
  });

  it('the preview renders the square icon, label and method badge', async () => {
    await page.onFileSelected(fileEvent(JSON.stringify(validConfig)));
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ping');
    expect(text).toContain('GET');
    expect(fixture.nativeElement.querySelector('app-button-icon')).toBeTruthy();
  });

  it('copies the images picked with the configuration and keys them by name', async () => {
    await page.onFileSelected(
      selectionEvent([jsonFile(JSON.stringify(iconConfig)), pngFile('shapes.png')]),
    );

    const copied = page.pendingIcons().get('shapes.png');
    expect(page.preview()).toEqual(iconConfig);
    expect(copied).toMatch(/^data:image\/png;base64,/);
    expect(preferencesMock.set).not.toHaveBeenCalled();

    await page.confirm();

    expect(preferencesMock.set).toHaveBeenCalledWith({
      key: 'anyrest:icons',
      value: JSON.stringify({ 'shapes.png': copied }),
    });
    expect(iconStore.get('shapes.png')).toBe(copied);
    expect(config.active()).toEqual(iconConfig);
    expect(navigate).toHaveBeenCalledWith('/home');
  });

  it('renders a copied image in the preview before anything is saved', async () => {
    await page.onFileSelected(
      selectionEvent([jsonFile(JSON.stringify(iconConfig)), pngFile('shapes.png')]),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('app-button-icon img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(page.pendingIcons().get('shapes.png'));
    expect(preferencesMock.set).not.toHaveBeenCalled();
  });

  it('requires exactly one anyrest.json in the selection', async () => {
    await page.onFileSelected(selectionEvent([pngFile('a.png'), pngFile('b.png')]));

    expect(page.preview()).toBeNull();
    expect(page.issues()).toEqual([
      { path: '$', message: 'Select the anyrest.json file together with its images.' },
    ]);

    await page.onFileSelected(
      selectionEvent([jsonFile(), jsonFile(JSON.stringify(emptyConfig), 'other.json')]),
    );

    expect(page.issues()).toEqual([
      { path: '$', message: 'Select exactly one anyrest.json file — 2 were selected.' },
    ]);
    expect(preferencesMock.set).not.toHaveBeenCalled();
  });

  it('refuses an oversized image and an unreadable one, naming the file', async () => {
    await page.onFileSelected(
      selectionEvent([jsonFile(JSON.stringify(iconConfig)), pngFile('huge.png', 600 * 1024)]),
    );

    expect(page.preview()).toBeNull();
    expect(page.issues()[0].path).toBe('huge.png');
    expect(page.issues()[0].message).toContain('too large');
    expect(preferencesMock.set).not.toHaveBeenCalled();

    await page.onFileSelected(selectionEvent([jsonFile(), pngFile('empty.png', 0)]));

    expect(page.issues()).toEqual([
      { path: 'empty.png', message: 'The image could not be read as png or webp.' },
    ]);
  });

  it('lists files that are neither the configuration nor png/webp', async () => {
    const notes = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await page.onFileSelected(selectionEvent([jsonFile(JSON.stringify(validConfig)), notes]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.ignoredFiles()).toEqual(['notes.txt']);
    expect(page.preview()).toEqual(validConfig);
    expect(fixture.nativeElement.textContent).toContain('Ignored');
  });

  it('warns loudly when the configuration names an image that was not selected', async () => {
    await page.onFileSelected(selectionEvent([jsonFile(JSON.stringify(iconConfig))]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.missingIcons()).toEqual(['shapes.png']);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('were not selected');
    expect(text).toContain('shapes.png');
  });

  it('keeps the active configuration when the images cannot be saved', async () => {
    await config.activateText(JSON.stringify(validConfig));
    preferencesMock.set.mockClear();
    preferencesMock.set.mockImplementation(({ key }: { key: string }) =>
      key === 'anyrest:icons' ? Promise.reject(new Error('storage full')) : Promise.resolve(undefined),
    );

    await page.onFileSelected(
      selectionEvent([jsonFile(JSON.stringify(iconConfig)), pngFile('shapes.png')]),
    );
    await page.confirm();

    expect(page.issues()[0].message).toContain('could not be saved');
    expect(config.active()).toEqual(validConfig);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('takes a folder selection: every file in the folder, paths relative to it', async () => {
    const json = new File([JSON.stringify(iconConfig)], 'anyrest.json', { type: 'application/json' });
    const image = new File([new Uint8Array(8)], 'shapes.png', { type: 'image/png' });
    Object.defineProperty(json, 'webkitRelativePath', { value: 'anyrest/anyrest.json' });
    Object.defineProperty(image, 'webkitRelativePath', { value: 'anyrest/shapes.png' });

    await page.onFileSelected(selectionEvent([json, image]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.preview()).toEqual(iconConfig);
    expect(page.missingIcons()).toEqual([]);
    expect(page.pendingIcons().get('shapes.png')).toMatch(/^data:image\/png;base64,/);
  });

  it('offers the configuration, image and folder pickers', () => {
    const inputs = fixture.nativeElement.querySelectorAll(
      'input[type=file]',
    ) as NodeListOf<HTMLInputElement>;

    expect(inputs.length).toBe(3);
    expect(inputs[1].getAttribute('accept')).toContain('image/png');
    expect(inputs[2].hasAttribute('webkitdirectory')).toBe(true);
  });

  it('collects images one pick at a time, after the configuration (Android picker)', async () => {
    // O seletor do Android entrega um ficheiro por escolha: primeiro o json...
    await page.onFileSelected(selectionEvent([jsonFile(JSON.stringify(iconConfig))]));

    expect(page.preview()).toEqual(iconConfig);
    expect(page.missingIcons()).toEqual(['shapes.png']);

    // ...e depois as imagens, uma de cada vez, sem perder o que já veio.
    await page.onImagesSelected(selectionEvent([pngFile('shapes.png')]));

    expect(page.missingIcons()).toEqual([]);
    expect(page.pendingIconNames()).toEqual(['shapes.png']);
    const copied = page.pendingIcons().get('shapes.png');

    await page.confirm();

    expect(preferencesMock.set).toHaveBeenCalledWith({
      key: 'anyrest:icons',
      value: JSON.stringify({ 'shapes.png': copied }),
    });
    expect(iconStore.get('shapes.png')).toBe(copied);
    expect(config.active()).toEqual(iconConfig);
  });

  it('accumulates image picks, replaces a repeated name, and can clear them', async () => {
    await page.onFileSelected(selectionEvent([jsonFile(JSON.stringify(iconConfig))]));

    await page.onImagesSelected(selectionEvent([pngFile('shapes.png')]));
    await page.onImagesSelected(selectionEvent([pngFile('extra.webp')]));
    expect(page.pendingIconNames()).toEqual(['shapes.png', 'extra.webp']);

    await page.onImagesSelected(selectionEvent([pngFile('shapes.png', 16)]));
    expect(page.pendingIconNames()).toEqual(['shapes.png', 'extra.webp']);

    page.clearImages();
    expect(page.pendingIconNames()).toEqual([]);
  });

  it('reports an image pick that brought nothing usable', async () => {
    await page.onFileSelected(selectionEvent([jsonFile(JSON.stringify(iconConfig))]));
    const notes = new File(['x'], 'notes.txt', { type: 'text/plain' });

    await page.onImagesSelected(selectionEvent([notes]));

    expect(page.issues()).toEqual([
      { path: '$', message: 'No png or webp image was selected.' },
    ]);
    expect(page.pendingIconNames()).toEqual([]);
  });
});
