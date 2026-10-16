/**
 * Request building (SPEC §3.2 body representation, §3.3 timeout).
 *
 * Pure function: returns plain header/query maps plus the serialized body and the
 * clamped timeout. No HttpClient, no Angular — the transport layer lives in
 * `src/app/services/rest.service.ts`.
 */
import type { EffectiveRequest, RequestConfig } from './types';

export const DEFAULT_TIMEOUT_MS = 30000;
export const MIN_TIMEOUT_MS = 1000;
export const MAX_TIMEOUT_MS = 120000;
export const JSON_CONTENT_TYPE = 'application/json';
export const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/** `clamp(timeoutMs ?? 30000, 1000, 120000)` — out-of-range values are clamped, not rejected. */
export function effectiveTimeoutMs(timeoutMs?: number): number {
  const raw = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
}

function findHeaderKey(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === wanted);
}

function serializeBody(body: RequestConfig['body']): string {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/** A user-provided Content-Type always wins; otherwise it follows the body type. */
function decideContentType(body: RequestConfig['body']): string {
  return typeof body === 'string' ? TEXT_CONTENT_TYPE : JSON_CONTENT_TYPE;
}

export function buildEffectiveRequest(req: RequestConfig): EffectiveRequest {
  const headers: Record<string, string> = { ...(req.headers ?? {}) };
  const queryParams: Record<string, string> = { ...(req.queryParams ?? {}) };

  const hasBody = req.body !== undefined;
  let body: string | undefined;
  let contentType: string | null = null;

  if (hasBody) {
    body = serializeBody(req.body);
    const existing = findHeaderKey(headers, 'content-type');
    if (existing !== undefined) {
      contentType = headers[existing];
    } else {
      contentType = decideContentType(req.body);
      headers['Content-Type'] = contentType;
    }
  }

  return {
    method: req.method,
    url: req.url,
    headers,
    queryParams,
    hasBody,
    body,
    contentType,
    effectiveTimeoutMs: effectiveTimeoutMs(req.timeoutMs),
  };
}
