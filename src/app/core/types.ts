/**
 * AnyRest core types (SPEC v1).
 *
 * Pure TypeScript — this folder must never import Angular, RxJS or Capacitor
 * (the core is unit-testable without a TestBed).
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** How the 200 body is presented (SPEC §3.2 / §7.6). */
export type ResponseDisplay = 'json' | 'text';

/** Outcome classification of an executed request (SPEC §7.5–§7.8). */
export type OutcomeKind = 'success' | 'http' | 'network' | 'timeout';

export interface ResponseConfig {
  display?: ResponseDisplay;
  successMessage?: string;
  errorMessage?: string;
}

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  /** object | array | string — static in v1, no placeholders (SPEC §3.4). */
  body?: Record<string, unknown> | unknown[] | string;
  timeoutMs?: number;
  /**
   * SPEC §3.3 amendment: `true` counts a timeout as a success. Meant for
   * fire-and-forget endpoints (restart, reboot) that cannot answer because the
   * service answering is the one being restarted. Absent = a timeout keeps
   * meaning failure, exactly as before.
   */
  timeoutIsSuccess?: boolean;
}

export interface ButtonConfig {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  request: RequestConfig;
  response?: ResponseConfig;
}

export interface AppConfig {
  title: string;
  description?: string;
  iconpath?: string;
}

export interface AnyRestConfig {
  version: 1;
  app: AppConfig;
  buttons: ButtonConfig[];
}

export interface ValidationIssue {
  /** JSON-Path-like location, e.g. `buttons[1].request.url` (`$` = root). */
  path: string;
  /** Plain-language explanation; never a stack trace, never a secret. */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

/** A request ready for transport: body already serialized, timeout clamped. */
export interface EffectiveRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  hasBody: boolean;
  /** Serialized body (JSON text or raw string) when `hasBody` is true. */
  body?: string;
  /** Content-Type actually applied (user value wins); null when no body. */
  contentType: string | null;
  effectiveTimeoutMs: number;
}

export interface RestOutcome {
  ok: boolean;
  kind: OutcomeKind;
  /** Present for `success` and `http`. */
  status?: number;
  /** Response body (already excerpted when it comes from an error). */
  bodyText?: string;
  message?: string;
}
