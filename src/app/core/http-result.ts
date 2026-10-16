/**
 * HTTP result helpers (SPEC §7.5–§7.7).
 *
 * Status rule (frozen): success is status `200` exactly — every other status,
 * including 201/204 and redirects, is an error.
 */

export const NOT_JSON_WARNING = 'Response is not valid JSON — showing raw text.';

const DEFAULT_EXCERPT_LENGTH = 2000;

export interface FormattedBody {
  view: 'json' | 'text';
  text: string;
  warning?: string;
}

export function classifyStatus(status: number): 'success' | 'error' {
  return status === 200 ? 'success' : 'error';
}

/**
 * Pretty-prints a JSON body (2 spaces) when `display` is `json` and the text parses;
 * on parse failure it returns the raw text plus the explanatory warning.
 *
 * An empty (or whitespace-only) body has nothing to parse, so it never carries the
 * warning: the modal must show its single "No response body." state, not a
 * contradictory "not valid JSON" note beside it.
 */
export function formatBody(bodyText: string, display: 'json' | 'text'): FormattedBody {
  if (bodyText.trim() === '') {
    return { view: 'text', text: '' };
  }
  if (display === 'text') {
    return { view: 'text', text: bodyText };
  }
  try {
    const parsed: unknown = JSON.parse(bodyText);
    return { view: 'json', text: JSON.stringify(parsed, null, 2) };
  } catch {
    return { view: 'text', text: bodyText, warning: NOT_JSON_WARNING };
  }
}

/** Trims a response body for display; the truncated part is replaced by a marker. */
export function safeExcerpt(text: string, max = DEFAULT_EXCERPT_LENGTH): string {
  if (typeof text !== 'string') {
    return '';
  }
  if (max < 0) {
    return '';
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n[truncated ${text.length - max} characters]`;
}
