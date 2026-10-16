import { describe, expect, it } from 'vitest';
import {
  isAllowedIconFile,
  isAllowedIconUrl,
  resolveDisplayIconUrl,
  resolveDisplayIconUrlWithStore,
  resolveIconUrl,
} from './icon';

describe('resolveDisplayIconUrlWithStore (SPEC §3.1 amendment — copied icons)', () => {
  const stored = new Map<string, string>([
    ['get.png', 'data:image/png;base64,COPIED'],
    ['broken.png', 'data:image/svg+xml;base64,NO'],
  ]);

  it('uses the copied image when the name is plain and no iconpath is given', () => {
    expect(resolveDisplayIconUrlWithStore('get.png', undefined, stored)).toBe(
      'data:image/png;base64,COPIED',
    );
  });

  it('keeps absolute sources untouched and lets a copied image beat app.iconpath', () => {
    expect(
      resolveDisplayIconUrlWithStore('https://cdn.example.com/get.png', undefined, stored),
    ).toBe('https://cdn.example.com/get.png');
    expect(resolveDisplayIconUrlWithStore('data:image/webp;base64,X', undefined, stored)).toBe(
      'data:image/webp;base64,X',
    );
    // Regression: a copied image used to lose to app.iconpath, so a user who had
    // loaded his own image still saw the fallback tile.
    expect(resolveDisplayIconUrlWithStore('get.png', '/assets/icons', stored)).toBe(
      'data:image/png;base64,COPIED',
    );
  });

  it('uses app.iconpath for a name that was not copied', () => {
    expect(resolveDisplayIconUrlWithStore('other.png', '/assets/icons', stored)).toBe(
      '/assets/icons/other.png',
    );
  });

  it('falls back to the tile when the copied image is not an allowed format', () => {
    expect(resolveDisplayIconUrlWithStore('broken.png', undefined, stored)).toBeNull();
  });

  it('falls back to the tile when the name was never copied or the icon is missing', () => {
    expect(resolveDisplayIconUrlWithStore('missing.png', undefined, stored)).toBeNull();
    expect(resolveDisplayIconUrlWithStore(undefined, undefined, stored)).toBeNull();
    expect(resolveDisplayIconUrlWithStore('get.png', undefined, undefined)).toBeNull();
  });
});

describe('resolveIconUrl (SPEC §3.1)', () => {
  it('returns null when the icon is missing or blank', () => {
    expect(resolveIconUrl()).toBeNull();
    expect(resolveIconUrl(undefined, '/assets/icons')).toBeNull();
    expect(resolveIconUrl('', '/assets/icons')).toBeNull();
    expect(resolveIconUrl('   ')).toBeNull();
  });

  it('uses absolute http(s) and data icons as-is, ignoring iconpath', () => {
    expect(resolveIconUrl('https://cdn.example.com/a.png', '/assets/icons')).toBe('https://cdn.example.com/a.png');
    expect(resolveIconUrl('http://cdn.example.com/a.webp', '/assets/icons')).toBe('http://cdn.example.com/a.webp');
    expect(resolveIconUrl('data:image/png;base64,AAA', '/assets/icons')).toBe('data:image/png;base64,AAA');
  });

  it('joins iconpath and icon with a single slash', () => {
    expect(resolveIconUrl('get.png', '/assets/icons')).toBe('/assets/icons/get.png');
    expect(resolveIconUrl('get.png', '/assets/icons/')).toBe('/assets/icons/get.png');
    expect(resolveIconUrl('sub/get.png', '/assets/icons/')).toBe('/assets/icons/sub/get.png');
    expect(resolveIconUrl('/get.png', '/assets/icons')).toBe('/assets/icons/get.png');
    expect(resolveIconUrl('get.png', 'assets/icons')).toBe('assets/icons/get.png');
  });

  it('treats the icon as web-app-relative when iconpath is absent or empty', () => {
    expect(resolveIconUrl('assets/icons/get.png')).toBe('assets/icons/get.png');
    expect(resolveIconUrl('/assets/icons/get.png', '')).toBe('/assets/icons/get.png');
  });
});

describe('isAllowedIconFile (SPEC §3.1.3)', () => {
  it('accepts .png and .webp case-insensitively', () => {
    expect(isAllowedIconFile('/assets/icons/get.png')).toBe(true);
    expect(isAllowedIconFile('/assets/icons/post.webp')).toBe(true);
    expect(isAllowedIconFile('https://cdn.example.com/A.PNG')).toBe(true);
    expect(isAllowedIconFile('https://cdn.example.com/B.WebP')).toBe(true);
  });

  it('ignores a query string or fragment', () => {
    expect(isAllowedIconFile('https://cdn.example.com/a.png?v=2')).toBe(true);
    expect(isAllowedIconFile('https://cdn.example.com/a.webp#x')).toBe(true);
  });

  it('rejects other formats and extension-less or non-image paths', () => {
    expect(isAllowedIconFile('/assets/icons/photo.jpg')).toBe(false);
    expect(isAllowedIconFile('/assets/icons/anim.gif')).toBe(false);
    expect(isAllowedIconFile('/assets/icons/get')).toBe(false);
    expect(isAllowedIconFile('https://example.com/png')).toBe(false);
  });
});

describe('isAllowedIconUrl (SPEC §3.1.3 — file or inline image)', () => {
  it('accepts the allowed files with or without a query string', () => {
    expect(isAllowedIconUrl('/assets/icons/get.png')).toBe(true);
    expect(isAllowedIconUrl('/assets/icons/post.webp?cache=1')).toBe(true);
    expect(isAllowedIconUrl('https://cdn.example.com/A.PNG#x')).toBe(true);
  });

  it('accepts inline data:image/png and data:image/webp payloads', () => {
    expect(isAllowedIconUrl('data:image/png;base64,AAA')).toBe(true);
    expect(isAllowedIconUrl('data:image/webp;base64,BBB')).toBe(true);
    expect(isAllowedIconUrl('DATA:IMAGE/WEBP;base64,CCC')).toBe(true);
  });

  it('rejects every other format, including data:image/svg+xml', () => {
    expect(isAllowedIconUrl('/assets/icons/shapes.svg')).toBe(false);
    expect(isAllowedIconUrl('/assets/icons/photo.jpg')).toBe(false);
    expect(isAllowedIconUrl('data:image/svg+xml;base64,DDD')).toBe(false);
    expect(isAllowedIconUrl('data:image/gif;base64,EEE')).toBe(false);
    expect(isAllowedIconUrl('/assets/icons/get')).toBe(false);
  });
});

describe('resolveDisplayIconUrl (SPEC §3.1.3 + §3.1.4 at render time)', () => {
  it('returns the image URL for png/webp, relative and absolute', () => {
    expect(resolveDisplayIconUrl('get.png', '/assets/icons')).toBe('/assets/icons/get.png');
    expect(resolveDisplayIconUrl('post.webp')).toBe('post.webp');
    expect(resolveDisplayIconUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(resolveDisplayIconUrl('data:image/webp;base64,BBB')).toBe('data:image/webp;base64,BBB');
  });

  it('returns null (fallback tile) for a disallowed format or non-image path', () => {
    expect(resolveDisplayIconUrl('shapes.svg', '/assets/icons')).toBeNull();
    expect(resolveDisplayIconUrl('/assets/shapes.svg')).toBeNull();
    expect(resolveDisplayIconUrl('https://cdn.example.com/a.jpg')).toBeNull();
    expect(resolveDisplayIconUrl('data:image/svg+xml;base64,DDD')).toBeNull();
    expect(resolveDisplayIconUrl('get')).toBeNull();
  });

  it('returns null for a missing or blank icon (unchanged behaviour)', () => {
    expect(resolveDisplayIconUrl()).toBeNull();
    expect(resolveDisplayIconUrl('', '/assets/icons')).toBeNull();
  });
});
