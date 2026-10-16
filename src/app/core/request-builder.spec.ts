import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEOUT_MS,
  JSON_CONTENT_TYPE,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  TEXT_CONTENT_TYPE,
  buildEffectiveRequest,
  effectiveTimeoutMs,
} from './request-builder';
import type { RequestConfig } from './types';

const base: RequestConfig = { method: 'GET', url: 'https://example.com/get' };

describe('effectiveTimeoutMs (SPEC §3.3)', () => {
  it('defaults to 30000 when absent', () => {
    expect(effectiveTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
    expect(buildEffectiveRequest(base).effectiveTimeoutMs).toBe(30000);
  });

  it('clamps to [1000, 120000] instead of rejecting', () => {
    expect(effectiveTimeoutMs(1)).toBe(MIN_TIMEOUT_MS);
    expect(effectiveTimeoutMs(0)).toBe(MIN_TIMEOUT_MS);
    expect(effectiveTimeoutMs(999)).toBe(MIN_TIMEOUT_MS);
    expect(effectiveTimeoutMs(60000)).toBe(60000);
    expect(effectiveTimeoutMs(120001)).toBe(MAX_TIMEOUT_MS);
    expect(effectiveTimeoutMs(10 ** 9)).toBe(MAX_TIMEOUT_MS);
  });

  it('falls back to the default for non-finite values', () => {
    expect(effectiveTimeoutMs(Number.NaN)).toBe(DEFAULT_TIMEOUT_MS);
    expect(effectiveTimeoutMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TIMEOUT_MS);
  });
});

describe('buildEffectiveRequest — body and content type (SPEC §3.2)', () => {
  it('serializes an object body to JSON with application/json', () => {
    const result = buildEffectiveRequest({ ...base, method: 'POST', body: { hello: 'anyrest', n: 1 } });
    expect(result.hasBody).toBe(true);
    expect(result.body).toBe('{"hello":"anyrest","n":1}');
    expect(result.contentType).toBe(JSON_CONTENT_TYPE);
    expect(result.headers['Content-Type']).toBe(JSON_CONTENT_TYPE);
  });

  it('serializes an array body to JSON with application/json', () => {
    const result = buildEffectiveRequest({ ...base, method: 'POST', body: [1, 'two'] });
    expect(result.body).toBe('[1,"two"]');
    expect(result.headers['Content-Type']).toBe(JSON_CONTENT_TYPE);
  });

  it('sends a string body as raw text with text/plain; charset=utf-8', () => {
    const result = buildEffectiveRequest({ ...base, method: 'POST', body: 'raw text' });
    expect(result.body).toBe('raw text');
    expect(result.contentType).toBe(TEXT_CONTENT_TYPE);
    expect(result.headers['Content-Type']).toBe(TEXT_CONTENT_TYPE);
  });

  it('omits body and content type when body is absent', () => {
    const result = buildEffectiveRequest(base);
    expect(result.hasBody).toBe(false);
    expect(result.body).toBeUndefined();
    expect(result.contentType).toBeNull();
    expect(result.headers['Content-Type']).toBeUndefined();
  });

  it('keeps a user-provided Content-Type, whatever its casing', () => {
    const upper = buildEffectiveRequest({
      ...base,
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.api+json' },
      body: { a: 1 },
    });
    const lower = buildEffectiveRequest({ ...base, method: 'POST', headers: { 'content-type': 'text/csv' }, body: 'a,b' });
    const mixed = buildEffectiveRequest({ ...base, method: 'POST', headers: { 'CONTENT-TYPE': 'application/xml' }, body: { a: 1 } });
    expect(upper.headers['Content-Type']).toBe('application/vnd.api+json');
    expect(upper.contentType).toBe('application/vnd.api+json');
    expect(lower.contentType).toBe('text/csv');
    expect(lower.headers['content-type']).toBe('text/csv');
    expect(Object.keys(lower.headers)).toEqual(['content-type']);
    expect(mixed.contentType).toBe('application/xml');
    expect(Object.keys(mixed.headers)).toEqual(['CONTENT-TYPE']);
  });
});

describe('buildEffectiveRequest — maps and identity', () => {
  it('passes method, url, query params and headers through', () => {
    const result = buildEffectiveRequest({
      method: 'PUT',
      url: 'https://example.com/put',
      headers: { Accept: 'application/json' },
      queryParams: { a: '1', b: 'true' },
    });
    expect(result.method).toBe('PUT');
    expect(result.url).toBe('https://example.com/put');
    expect(result.headers['Accept']).toBe('application/json');
    expect(result.queryParams).toEqual({ a: '1', b: 'true' });
  });

  it('returns copies, so callers never mutate the config', () => {
    const request: RequestConfig = {
      method: 'POST',
      url: 'https://example.com/post',
      headers: { Accept: 'application/json' },
      queryParams: { a: '1' },
      body: { a: 1 },
    };
    const result = buildEffectiveRequest(request);
    result.headers['X-Added'] = 'yes';
    result.queryParams['b'] = '2';
    expect(request.headers).toEqual({ Accept: 'application/json' });
    expect(request.queryParams).toEqual({ a: '1' });
  });

  it('never injects request headers into the serialized body', () => {
    const result = buildEffectiveRequest({ ...base, method: 'POST', headers: { Authorization: 'secret' }, body: { a: 1 } });
    expect(result.body).toBe('{"a":1}');
    expect(result.body?.includes('secret')).toBe(false);
  });
});
