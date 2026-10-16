import { describe, expect, it } from 'vitest';
import { validateConfig } from './validate';
import type { AnyRestConfig, ValidationResult } from './types';

function configWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { version: 1, app: { title: 'AnyRest' }, buttons: [], ...overrides };
}

function paths(result: ValidationResult): string[] {
  return result.errors.map((issue) => issue.path);
}

const fullConfig: AnyRestConfig = {
  version: 1,
  app: { title: 'AnyRest', description: 'demo', iconpath: '/assets/icons' },
  buttons: [
    {
      id: 'demo-get',
      label: 'GET',
      description: 'fetch',
      icon: 'get.png',
      request: {
        method: 'GET',
        url: 'https://example.com/get',
        headers: { Accept: 'application/json' },
        queryParams: { a: '1' },
        timeoutMs: 15000,
      },
      response: { display: 'json', successMessage: 'ok', errorMessage: 'no' },
    },
    { id: 'demo-post', label: 'POST', request: { method: 'POST', url: 'https://example.com/post', body: { a: 1 } } },
    { id: 'demo-put', label: 'PUT', request: { method: 'PUT', url: 'https://example.com/put', body: 'raw' } },
    { id: 'demo-patch', label: 'PATCH', request: { method: 'PATCH', url: 'https://example.com/patch', body: [1, 2] } },
    { id: 'demo-delete', label: 'DELETE', request: { method: 'DELETE', url: 'http://example.com/delete' } },
  ],
};

describe('validateConfig — valid input', () => {
  it('accepts the full five-method config', () => {
    const result = validateConfig(fullConfig);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts an empty buttons array (0 is valid)', () => {
    expect(validateConfig(configWith({})).ok).toBe(true);
  });

  it('accepts timeoutMs 1 and 120000 (clamping is runtime, not validation)', () => {
    const low = validateConfig(configWith({ buttons: [{ id: 'a', label: 'A', request: { method: 'GET', url: 'https://e.com', timeoutMs: 1 } }] }));
    const high = validateConfig(configWith({ buttons: [{ id: 'b', label: 'B', request: { method: 'GET', url: 'https://e.com', timeoutMs: 120000 } }] }));
    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
  });
});

describe('validateConfig — root', () => {
  it('rejects non-object input without throwing', () => {
    for (const input of [null, undefined, 42, 'x', [], true]) {
      const result = validateConfig(input);
      expect(result.ok).toBe(false);
      expect(paths(result)).toEqual(['$']);
    }
  });

  it('rejects unknown root keys', () => {
    const result = validateConfig(configWith({ extra: 1 }));
    expect(result.ok).toBe(false);
    expect(paths(result)).toContain('extra');
  });

  it('requires version and only supports 1', () => {
    const missing = validateConfig({ app: { title: 'T' }, buttons: [] });
    const other = validateConfig(configWith({ version: 2 }));
    const fractional = validateConfig(configWith({ version: 1.5 }));
    const asString = validateConfig(configWith({ version: '1' }));
    expect(paths(missing)).toEqual(expect.arrayContaining(['version']));
    expect(other.errors.some((e) => e.path === 'version')).toBe(true);
    expect(fractional.errors.some((e) => e.path === 'version')).toBe(true);
    expect(asString.errors.some((e) => e.path === 'version')).toBe(true);
  });
});

describe('validateConfig — app', () => {
  it('requires app.title between 1 and 120 characters', () => {
    const missing = validateConfig({ version: 1, buttons: [] });
    const empty = validateConfig(configWith({ app: { title: '' } }));
    const long = validateConfig(configWith({ app: { title: 'x'.repeat(121) } }));
    const notString = validateConfig(configWith({ app: { title: 5 } }));
    expect(paths(missing)).toContain('app');
    expect(paths(empty)).toContain('app.title');
    expect(paths(long)).toContain('app.title');
    expect(paths(notString)).toContain('app.title');
  });

  it('rejects app not being an object and unknown app keys', () => {
    const notObject = validateConfig(configWith({ app: 'T' }));
    const unknown = validateConfig(configWith({ app: { title: 'T', nope: true } }));
    expect(paths(notObject)).toEqual(['app']);
    expect(paths(unknown)).toContain('app.nope');
  });

  it('enforces the description and iconpath length limits', () => {
    const result = validateConfig(
      configWith({ app: { title: 'T', description: 'x'.repeat(301), iconpath: 'y'.repeat(2049) } })
    );
    expect(paths(result)).toEqual(expect.arrayContaining(['app.description', 'app.iconpath']));
  });
});

describe('validateConfig — buttons', () => {
  it('requires buttons to be an array', () => {
    const missing = validateConfig({ version: 1, app: { title: 'T' } });
    const notArray = validateConfig(configWith({ buttons: {} }));
    expect(paths(missing)).toContain('buttons');
    expect(paths(notArray)).toEqual(['buttons']);
  });

  it('caps buttons at 200', () => {
    const buttons = Array.from({ length: 201 }, (_, i) => ({
      id: `b-${i}`,
      label: `B${i}`,
      request: { method: 'GET', url: 'https://e.com' },
    }));
    const result = validateConfig(configWith({ buttons }));
    expect(result.ok).toBe(false);
    expect(paths(result)).toContain('buttons');
  });

  it('rejects a non-object button and unknown button keys', () => {
    const notObject = validateConfig(configWith({ buttons: ['x'] }));
    const unknown = validateConfig(
      configWith({ buttons: [{ id: 'a', label: 'A', request: { method: 'GET', url: 'https://e.com' }, extra: 1 }] })
    );
    expect(paths(notObject)).toEqual(['buttons[0]']);
    expect(paths(unknown)).toContain('buttons[0].extra');
  });

  it('enforces the id pattern and required fields', () => {
    const badId = validateConfig(
      configWith({ buttons: [{ id: 'Bad_Id', label: 'A', request: { method: 'GET', url: 'https://e.com' } }] })
    );
    const missing = validateConfig(configWith({ buttons: [{ request: { method: 'GET', url: 'https://e.com' } }] }));
    const emptyLabel = validateConfig(
      configWith({ buttons: [{ id: 'a', label: '', request: { method: 'GET', url: 'https://e.com' } }] })
    );
    expect(paths(badId)).toContain('buttons[0].id');
    expect(paths(missing)).toEqual(expect.arrayContaining(['buttons[0].id', 'buttons[0].label']));
    expect(paths(emptyLabel)).toContain('buttons[0].label');
  });

  it('reports one issue per extra duplicate id', () => {
    const button = (id: string) => ({ id, label: id, request: { method: 'GET', url: 'https://e.com' } });
    const result = validateConfig(configWith({ buttons: [button('a'), button('a'), button('a')] }));
    expect(result.ok).toBe(false);
    expect(paths(result)).toEqual(['buttons[1].id', 'buttons[2].id']);
    expect(result.errors[0].message).toContain('"a"');
  });
});

describe('validateConfig — request', () => {
  const withRequest = (request: unknown) => configWith({ buttons: [{ id: 'a', label: 'A', request }] });

  it('requires method and url', () => {
    const result = validateConfig(withRequest({}));
    expect(paths(result)).toEqual(expect.arrayContaining(['buttons[0].request.method', 'buttons[0].request.url']));
  });

  it('accepts only the five uppercase methods', () => {
    const lower = validateConfig(withRequest({ method: 'get', url: 'https://e.com' }));
    const other = validateConfig(withRequest({ method: 'HEAD', url: 'https://e.com' }));
    expect(paths(lower)).toContain('buttons[0].request.method');
    expect(paths(other)).toContain('buttons[0].request.method');
  });

  it('requires an absolute http(s) url', () => {
    const relative = validateConfig(withRequest({ method: 'GET', url: '/local' }));
    const file = validateConfig(withRequest({ method: 'GET', url: 'file:///etc/passwd' }));
    const tooLong = validateConfig(withRequest({ method: 'GET', url: `https://e.com/${'x'.repeat(2048)}` }));
    expect(paths(relative)).toContain('buttons[0].request.url');
    expect(paths(file)).toContain('buttons[0].request.url');
    expect(paths(tooLong)).toContain('buttons[0].request.url');
  });

  it('rejects unknown request keys', () => {
    const result = validateConfig(withRequest({ method: 'GET', url: 'https://e.com', auth: 'x' }));
    expect(paths(result)).toContain('buttons[0].request.auth');
  });

  it('requires string header/query values and caps them at 100 entries', () => {
    const notString = validateConfig(withRequest({ method: 'GET', url: 'https://e.com', headers: { 'X-N': 1 } }));
    const many: Record<string, string> = {};
    for (let i = 0; i < 101; i += 1) {
      many[`k${i}`] = 'v';
    }
    const tooMany = validateConfig(withRequest({ method: 'GET', url: 'https://e.com', queryParams: many }));
    expect(paths(notString)).toContain('buttons[0].request.headers.X-N');
    expect(paths(tooMany)).toContain('buttons[0].request.queryParams');
  });

  it('accepts body as object, array or string and rejects anything else', () => {
    expect(validateConfig(withRequest({ method: 'POST', url: 'https://e.com', body: { a: 1 } })).ok).toBe(true);
    expect(validateConfig(withRequest({ method: 'POST', url: 'https://e.com', body: [1] })).ok).toBe(true);
    expect(validateConfig(withRequest({ method: 'POST', url: 'https://e.com', body: 'raw' })).ok).toBe(true);
    const bad = validateConfig(withRequest({ method: 'POST', url: 'https://e.com', body: 42 }));
    const nullBody = validateConfig(withRequest({ method: 'POST', url: 'https://e.com', body: null }));
    expect(paths(bad)).toContain('buttons[0].request.body');
    expect(paths(nullBody)).toContain('buttons[0].request.body');
  });

  it('requires timeoutMs to be an integer >= 1', () => {
    const zero = validateConfig(withRequest({ method: 'GET', url: 'https://e.com', timeoutMs: 0 }));
    const fractional = validateConfig(withRequest({ method: 'GET', url: 'https://e.com', timeoutMs: 1.5 }));
    const asString = validateConfig(withRequest({ method: 'GET', url: 'https://e.com', timeoutMs: '5000' }));
    expect(paths(zero)).toContain('buttons[0].request.timeoutMs');
    expect(paths(fractional)).toContain('buttons[0].request.timeoutMs');
    expect(paths(asString)).toContain('buttons[0].request.timeoutMs');
  });
});

describe('validateConfig — response', () => {
  const withResponse = (response: unknown) =>
    configWith({ buttons: [{ id: 'a', label: 'A', request: { method: 'GET', url: 'https://e.com' }, response }] });

  it('accepts json/text display and rejects anything else', () => {
    expect(validateConfig(withResponse({ display: 'text' })).ok).toBe(true);
    expect(paths(validateConfig(withResponse({ display: 'html' })))).toContain('buttons[0].response.display');
  });

  it('rejects unknown response keys and oversized messages', () => {
    const unknown = validateConfig(withResponse({ nope: 1 }));
    const long = validateConfig(withResponse({ errorMessage: 'x'.repeat(301) }));
    expect(paths(unknown)).toContain('buttons[0].response.nope');
    expect(paths(long)).toContain('buttons[0].response.errorMessage');
  });

  it('collects several issues in one pass, in a deterministic order', () => {
    const result = validateConfig(
      configWith({ app: { title: '' }, buttons: [{ id: 'a', label: 'A', request: { method: 'GET' } }] })
    );
    expect(result.ok).toBe(false);
    expect(paths(result)).toEqual(['app.title', 'buttons[0].request.url']);
  });
});
