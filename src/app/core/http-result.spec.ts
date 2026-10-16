import { describe, expect, it } from 'vitest';
import { NOT_JSON_WARNING, classifyStatus, formatBody, safeExcerpt } from './http-result';

describe('classifyStatus (SPEC §7.5 — only 200 is success)', () => {
  it('treats 200 as success', () => {
    expect(classifyStatus(200)).toBe('success');
  });

  it('treats every other status as error, including other 2xx and redirects', () => {
    for (const status of [0, 201, 202, 204, 206, 301, 302, 304, 400, 401, 403, 404, 418, 500, 503]) {
      expect(classifyStatus(status)).toBe('error');
    }
  });
});

describe('formatBody (SPEC §7.6)', () => {
  it('pretty-prints valid JSON with two spaces', () => {
    const result = formatBody('{"b":2,"a":[1,2]}', 'json');
    expect(result.view).toBe('json');
    expect(result.text).toBe('{\n  "b": 2,\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(result.warning).toBeUndefined();
  });

  it('falls back to raw text plus a warning when JSON does not parse', () => {
    const result = formatBody('<html>404</html>', 'json');
    expect(result.view).toBe('text');
    expect(result.text).toBe('<html>404</html>');
    expect(result.warning).toBe(NOT_JSON_WARNING);
    expect(result.warning).toBe('Response is not valid JSON — showing raw text.');
  });

  it('returns raw text unchanged when display is text', () => {
    const result = formatBody('{"a":1}', 'text');
    expect(result.view).toBe('text');
    expect(result.text).toBe('{"a":1}');
    expect(result.warning).toBeUndefined();
  });

  it('handles JSON scalars and empty bodies', () => {
    expect(formatBody('"quoted"', 'json').text).toBe('"quoted"');
    expect(formatBody('42', 'json').text).toBe('42');
    const empty = formatBody('', 'json');
    expect(empty.view).toBe('text');
    expect(empty.text).toBe('');
    expect(empty.warning).toBeUndefined();
  });

  it('never warns on an empty or blank body, whatever the display', () => {
    for (const display of ['json', 'text'] as const) {
      for (const body of ['', '   ', '\n\t ']) {
        const result = formatBody(body, display);
        expect(result.warning).toBeUndefined();
        expect(result.text).toBe('');
      }
    }
  });

  it('still warns when a NON-empty body fails to parse as JSON', () => {
    expect(formatBody('not json', 'json').warning).toBe(NOT_JSON_WARNING);
    expect(formatBody('not json', 'text').warning).toBeUndefined();
  });
});

describe('safeExcerpt (SPEC §7.5 — truncated body excerpt)', () => {
  it('returns short text unchanged', () => {
    expect(safeExcerpt('short')).toBe('short');
    expect(safeExcerpt('', 10)).toBe('');
  });

  it('trims long text to the default 2000 characters and marks the cut', () => {
    const text = 'x'.repeat(5000);
    const excerpt = safeExcerpt(text);
    expect(excerpt.startsWith('x'.repeat(2000))).toBe(true);
    expect(excerpt.includes('[truncated 3000 characters]')).toBe(true);
    expect(excerpt.length).toBeLessThan(text.length);
  });

  it('honours a custom maximum', () => {
    const excerpt = safeExcerpt('abcdef', 3);
    expect(excerpt.startsWith('abc')).toBe(true);
    expect(excerpt.includes('[truncated 3 characters]')).toBe(true);
  });

  it('never returns more than the maximum plus the marker', () => {
    const excerpt = safeExcerpt('y'.repeat(100), 10);
    expect(excerpt.slice(0, 10)).toBe('y'.repeat(10));
    expect(excerpt.length).toBeLessThan(60);
  });
});
