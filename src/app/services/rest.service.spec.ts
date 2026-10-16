import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RestOutcome } from '../core/types';
import { RestService, describeNetworkFailure } from './rest.service';

const URL_GET = 'https://example.com/get';
const SECRET_HEADER = 'Bearer S3CR3T-TOKEN';

function collect(observable: ReturnType<RestService['execute']>): Promise<RestOutcome> {
  return new Promise<RestOutcome>((resolve, reject) => {
    observable.subscribe({ next: (value) => resolve(value), error: (error) => reject(error) });
  });
}

describe('RestService', () => {
  let service: RestService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RestService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('200 is a success and keeps the raw body text', async () => {
    const pending = collect(service.execute({ method: 'GET', url: URL_GET }));
    const request = httpMock.expectOne(URL_GET);
    expect(request.request.method).toBe('GET');
    request.flush('{"answer":42}', { status: 200, statusText: 'OK' });

    const outcome = await pending;

    expect(outcome).toEqual({
      ok: true,
      kind: 'success',
      status: 200,
      bodyText: '{"answer":42}',
    });
    httpMock.verify();
  });

  it('201 is not a success (only 200 is)', async () => {
    const pending = collect(service.execute({ method: 'POST', url: URL_GET }));
    httpMock.expectOne(URL_GET).flush('created', { status: 201, statusText: 'Created' });

    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    expect(outcome.kind).toBe('http');
    expect(outcome.status).toBe(201);
  });

  it('404 becomes an http error carrying a body excerpt and NO headers/credentials', async () => {
    const pending = collect(
      service.execute({
        method: 'GET',
        url: URL_GET,
        headers: { Authorization: SECRET_HEADER, 'X-Trace': 'trace-1' },
      })
    );
    const request = httpMock.expectOne(URL_GET);
    // The credential is really sent on the wire...
    expect(request.request.headers.get('Authorization')).toBe(SECRET_HEADER);
    request.flush('{"detail":"not found"}', { status: 404, statusText: 'Not Found' });

    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    expect(outcome.kind).toBe('http');
    expect(outcome.status).toBe(404);
    expect(outcome.bodyText).toBe('{"detail":"not found"}');
    expect(outcome.message).toBe('The server responded with HTTP status 404.');
    // ...but it never leaks into the outcome the UI shows.
    const rendered = `${outcome.message ?? ''}\n${outcome.bodyText ?? ''}`;
    expect(rendered).not.toContain('S3CR3T');
    expect(rendered).not.toContain('Authorization');
    expect(rendered).not.toContain('trace-1');
    httpMock.verify();
  });

  it('truncates a huge error body with safeExcerpt', async () => {
    const body = 'x'.repeat(3000);
    const pending = collect(service.execute({ method: 'GET', url: URL_GET }));
    httpMock.expectOne(URL_GET).flush(body, { status: 500, statusText: 'Server Error' });

    const outcome = await pending;

    expect(outcome.kind).toBe('http');
    expect(outcome.bodyText).toContain('[truncated 1000 characters]');
    expect(outcome.bodyText?.length).toBeLessThan(2100);
  });

  it('status 0 becomes a network error with the SPEC §7.7 wording', async () => {
    const pending = collect(service.execute({ method: 'GET', url: URL_GET }));
    httpMock.expectOne(URL_GET).error(new ProgressEvent('error'));

    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    expect(outcome.kind).toBe('network');
    expect(outcome.message).toBe(describeNetworkFailure(URL_GET));
    expect(outcome.message).toContain('example.com');
    expect(outcome.message).toContain('may block cross-origin (CORS)');
    httpMock.verify();
  });

  it('maps a TimeoutError to kind timeout with the effective timeout', async () => {
    const pending = collect(
      service.execute({ method: 'GET', url: 'https://example.com/slow', timeoutMs: 1000 })
    );
    httpMock.expectOne('https://example.com/slow');

    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    expect(outcome.kind).toBe('timeout');
    expect(outcome.message).toBe('Request timed out after 1000 ms.');
    httpMock.verify();
  });

  it('applies the clamped timeout (below the minimum is raised to 1000 ms)', async () => {
    const pending = collect(
      service.execute({ method: 'GET', url: 'https://example.com/slow', timeoutMs: 5 })
    );
    httpMock.expectOne('https://example.com/slow');

    const outcome = await pending;

    expect(outcome.kind).toBe('timeout');
    expect(outcome.message).toBe('Request timed out after 1000 ms.');
    httpMock.verify();
  });

  it('sends method, query params, headers and serialized body through the builder', async () => {
    const pending = collect(
      service.execute({
        method: 'PUT',
        url: 'https://example.com/put',
        headers: { 'X-Trace': 'abc' },
        queryParams: { page: '2' },
        body: { a: 1 },
      })
    );
    const request = httpMock.expectOne((candidate) => candidate.url === 'https://example.com/put');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toBe('{"a":1}');
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.headers.get('X-Trace')).toBe('abc');
    expect(request.request.params.get('page')).toBe('2');

    request.flush('ok', { status: 200, statusText: 'OK' });
    expect((await pending).ok).toBe(true);
    httpMock.verify();
  });
});
