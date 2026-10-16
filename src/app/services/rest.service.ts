/**
 * REST transport (SPEC §7).
 *
 * `execute` builds the request with `buildEffectiveRequest`, sends it with
 * `observe:'response'` + `responseType:'text'` (the body is always a string, never
 * assumed to be JSON) and applies the clamped timeout. It never throws: every
 * failure becomes a `RestOutcome` on the `next` channel.
 *
 * The resulting messages NEVER contain request headers or credentials (SPEC §7.5/§9).
 */
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, TimeoutError, catchError, map, of, timeout } from 'rxjs';
import { safeExcerpt } from '../core/http-result';
import { buildEffectiveRequest } from '../core/request-builder';
import type { RequestConfig, RestOutcome } from '../core/types';

/** SPEC §7.7 wording; only the host is interpolated — never headers or query values. */
export function describeNetworkFailure(url: string): string {
  return `Could not reach ${hostOf(url)}. Check connectivity; note the endpoint may block cross-origin (CORS) or require authentication.`;
}

/** SPEC §7.8 wording. */
export function describeTimeout(effectiveTimeoutMs: number): string {
  return `Request timed out after ${effectiveTimeoutMs} ms.`;
}

/**
 * SPEC §3.3 amendment wording: the configuration declared `timeoutIsSuccess`, so
 * waiting out the timeout counts as the request having done its job.
 */
export function describeTimeoutSuccess(effectiveTimeoutMs: number): string {
  return `Request timed out after ${effectiveTimeoutMs} ms — counted as success (timeoutIsSuccess).`;
}

/** Status-only message: nothing from the request ever reaches the screen. */
export function describeHttpFailure(status: number): string {
  return `The server responded with HTTP status ${status}.`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function bodyTextOf(error: HttpErrorResponse): string {
  const body: unknown = error.error;
  if (typeof body === 'string') {
    return body;
  }
  if (body === undefined || body === null) {
    return '';
  }
  try {
    return JSON.stringify(body);
  } catch {
    return '';
  }
}

@Injectable({ providedIn: 'root' })
export class RestService {
  private readonly http = inject(HttpClient);

  execute(req: RequestConfig): Observable<RestOutcome> {
    const effective = buildEffectiveRequest(req);

    return this.http
      .request(effective.method, effective.url, {
        observe: 'response',
        responseType: 'text',
        headers: new HttpHeaders(effective.headers),
        params: new HttpParams({ fromObject: effective.queryParams }),
        body: effective.hasBody ? effective.body : null,
      })
      .pipe(
        map((response) => this.fromResponse(response.status, response.body ?? '')),
        timeout(effective.effectiveTimeoutMs),
        catchError((error: unknown) =>
          of(
            this.fromError(
              error,
              effective.url,
              effective.effectiveTimeoutMs,
              req.timeoutIsSuccess === true,
            ),
          ),
        )
      );
  }

  /** Only status 200 is a success (SPEC §7.5, frozen). */
  private fromResponse(status: number, bodyText: string): RestOutcome {
    if (status === 200) {
      return { ok: true, kind: 'success', status, bodyText };
    }
    return {
      ok: false,
      kind: 'http',
      status,
      bodyText: safeExcerpt(bodyText),
      message: describeHttpFailure(status),
    };
  }

  private fromError(
    error: unknown,
    url: string,
    effectiveTimeoutMs: number,
    timeoutIsSuccess: boolean,
  ): RestOutcome {
    if (error instanceof TimeoutError) {
      // SPEC §3.3 amendment: the configuration may declare a timeout a success
      // (fire-and-forget endpoints that restart the very service answering).
      return timeoutIsSuccess
        ? { ok: true, kind: 'timeout', message: describeTimeoutSuccess(effectiveTimeoutMs) }
        : { ok: false, kind: 'timeout', message: describeTimeout(effectiveTimeoutMs) };
    }
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return { ok: false, kind: 'network', status: 0, message: describeNetworkFailure(url) };
      }
      return {
        ok: false,
        kind: 'http',
        status: error.status,
        bodyText: safeExcerpt(bodyTextOf(error)),
        message: describeHttpFailure(error.status),
      };
    }
    return { ok: false, kind: 'network', message: describeNetworkFailure(url) };
  }
}
