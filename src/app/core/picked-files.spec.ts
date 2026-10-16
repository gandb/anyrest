/**
 * Classification of a picked selection (SPEC §3.1 amendment).
 *
 * The rules under test: exactly one `anyrest.json` per selection, only png/webp
 * images below the size limit are copied, and everything else is either ignored
 * or reported — never dropped silently.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ICON_BYTES,
  missingIconNames,
  normalizeIconDataUrl,
  readIconDataUrls,
  splitSelection,
  type PickedFile,
} from './picked-files';
import type { AnyRestConfig } from './types';

const file = (name: string, size = 1024, type = ''): PickedFile => ({ name, size, type });

describe('splitSelection', () => {
  it('returns the single configuration and the icons of the selection', () => {
    const split = splitSelection([
      file('anyrest.json', 512, 'application/json'),
      file('get.png', 2048, 'image/png'),
      file('post.webp', 1024, 'image/webp'),
    ]);

    expect(split.errors).toEqual([]);
    expect(split.config?.name).toBe('anyrest.json');
    expect(split.images.map((i) => i.name)).toEqual(['get.png', 'post.webp']);
    expect(split.ignored).toEqual([]);
  });

  it('accepts a configuration by extension even when the picker reports no type', () => {
    const split = splitSelection([file('anyrest.json', 512)]);
    expect(split.errors).toEqual([]);
    expect(split.config?.name).toBe('anyrest.json');
  });

  it('requires exactly one configuration file', () => {
    expect(splitSelection([file('get.png')]).errors).toEqual([
      { path: '$', message: 'Select the anyrest.json file together with its images.' },
    ]);

    expect(
      splitSelection([file('a.json'), file('b.json')]).errors,
    ).toEqual([{ path: '$', message: 'Select exactly one anyrest.json file — 2 were selected.' }]);
  });

  it('reports an image above the limit and one with no bytes', () => {
    const tooLarge = splitSelection([file('anyrest.json'), file('huge.png', MAX_ICON_BYTES + 1)]);
    expect(tooLarge.images).toEqual([]);
    expect(tooLarge.errors[0].path).toBe('huge.png');
    expect(tooLarge.errors[0].message).toContain('too large');

    expect(splitSelection([file('anyrest.json'), file('empty.png', 0)]).errors).toEqual([
      { path: 'empty.png', message: 'The image is empty.' },
    ]);
  });

  it('reports two images that share a name', () => {
    const split = splitSelection([file('anyrest.json'), file('get.png'), file('get.png')]);
    expect(split.images).toHaveLength(1);
    expect(split.errors).toEqual([
      { path: 'get.png', message: 'Two selected images share this name.' },
    ]);
  });

  it('ignores files that are neither the configuration nor png/webp', () => {
    const split = splitSelection([
      file('anyrest.json'),
      file('notes.txt', 10, 'text/plain'),
      file('photo.jpg', 10, 'image/jpeg'),
    ]);

    expect(split.errors).toEqual([]);
    expect(split.images).toEqual([]);
    expect(split.ignored).toEqual(['notes.txt', 'photo.jpg']);
  });
});

describe('normalizeIconDataUrl', () => {
  it('keeps a data URL the policy already accepts', () => {
    const url = 'data:image/png;base64,AAAA';
    expect(normalizeIconDataUrl(url, 'get.png')).toBe(url);
  });

  it('rewrites an unknown media type using the file name', () => {
    expect(normalizeIconDataUrl('data:application/octet-stream;base64,AAAA', 'get.webp')).toBe(
      'data:image/webp;base64,AAAA',
    );
  });

  it('returns null when the name is not an allowed image', () => {
    expect(normalizeIconDataUrl('data:application/octet-stream;base64,AAAA', 'get.jpg')).toBeNull();
    expect(normalizeIconDataUrl('data:image/png;base64,', 'get.png')).toBeNull();
    expect(normalizeIconDataUrl('not-a-data-url', 'get.png')).toBeNull();
  });
});

describe('readIconDataUrls', () => {
  it('reads every picked image as a data URL, keyed by file name', async () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'get.png', { type: 'image/png' });
    const webp = new File([new Uint8Array([4, 5])], 'post.webp', { type: 'image/webp' });

    const read = await readIconDataUrls([png, webp]);

    expect(read.errors).toEqual([]);
    expect([...read.icons.keys()]).toEqual(['get.png', 'post.webp']);
    expect(read.icons.get('get.png')).toMatch(/^data:image\/png;base64,/);
    expect(read.icons.get('post.webp')).toMatch(/^data:image\/webp;base64,/);
  });

  it('normalizes a picker that reports no usable media type', async () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'get.png', { type: '' });

    const read = await readIconDataUrls([png]);

    expect(read.errors).toEqual([]);
    expect(read.icons.get('get.png')).toMatch(/^data:image\/png;base64,/);
  });
});

describe('missingIconNames', () => {
  const config = (icon: string | undefined, iconpath?: string): AnyRestConfig => ({
    version: 1,
    app: { title: 't', ...(iconpath === undefined ? {} : { iconpath }) },
    buttons: [
      {
        id: 'b',
        label: 'B',
        ...(icon === undefined ? {} : { icon }),
        request: { method: 'GET', url: 'https://x.test' },
      },
    ],
  });

  it('lists a name the selection did not bring (the reported defect)', () => {
    expect(missingIconNames(config('media-center-restart.webp'), new Map())).toEqual([
      'media-center-restart.webp',
    ]);
  });

  it('stays silent for a copied image, an absolute source, no icon or an iconpath base', () => {
    const icons = new Map([['get.png', 'data:image/png;base64,AA']]);

    expect(missingIconNames(config('get.png'), icons)).toEqual([]);
    expect(missingIconNames(config('https://cdn.test/a.png'), new Map())).toEqual([]);
    expect(missingIconNames(config('data:image/png;base64,AA'), new Map())).toEqual([]);
    expect(missingIconNames(config(undefined), new Map())).toEqual([]);
    expect(missingIconNames(config('get.png', '/assets/icons'), new Map())).toEqual([]);
  });

  it('lists each missing name once, in button order', () => {
    const two: AnyRestConfig = {
      version: 1,
      app: { title: 't' },
      buttons: [
        { id: 'a', label: 'A', icon: 'a.png', request: { method: 'GET', url: 'https://x.test' } },
        { id: 'b', label: 'B', icon: 'b.png', request: { method: 'GET', url: 'https://x.test' } },
        { id: 'c', label: 'C', icon: 'a.png', request: { method: 'GET', url: 'https://x.test' } },
      ],
    };

    expect(missingIconNames(two, new Map([['b.png', 'data:image/png;base64,AA']]))).toEqual(['a.png']);
  });
});
