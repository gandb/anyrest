/**
 * Result modal (SPEC §7.5–§7.8, §8): green ONLY for 200, red otherwise; body block
 * pretty-prints JSON when `display: 'json'` and it parses, otherwise raw text + warning.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ButtonConfig, RestOutcome } from '../../core/types';
import { ResultModalComponent } from './result-modal.component';

function button(response?: ButtonConfig['response']): ButtonConfig {
  return { id: 'b', label: 'Call', request: { method: 'GET', url: 'https://x/y' }, response };
}

function setup(outcome: RestOutcome, cfg?: ButtonConfig): ComponentFixture<ResultModalComponent> {
  const fixture = TestBed.createComponent(ResultModalComponent);
  fixture.componentRef.setInput('outcome', outcome);
  if (cfg) {
    fixture.componentRef.setInput('button', cfg);
  }
  fixture.detectChanges();
  return fixture;
}

describe('ResultModalComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ResultModalComponent] }).compileComponents();
  });

  it('is green only for HTTP 200', () => {
    const ok = setup({ ok: true, kind: 'success', status: 200, bodyText: '{}' });
    expect(ok.nativeElement.querySelector('.status.ok')).toBeTruthy();
    expect(ok.nativeElement.querySelector('.status.err')).toBeNull();
    expect(ok.nativeElement.textContent).toContain('HTTP 200');

    const err = setup({ ok: false, kind: 'http', status: 404, bodyText: '', message: 'nope' });
    expect(err.nativeElement.querySelector('.status.err')).toBeTruthy();
    expect(err.nativeElement.querySelector('.status.ok')).toBeNull();
  });

  it('uses the configured success message, else a default', () => {
    const withMessage = setup(
      { ok: true, kind: 'success', status: 200, bodyText: '{}' },
      button({ successMessage: 'All good.' }),
    );
    expect(withMessage.nativeElement.textContent).toContain('All good.');

    const withoutMessage = setup({ ok: true, kind: 'success', status: 200, bodyText: '{}' });
    expect(withoutMessage.nativeElement.textContent).toContain('Request succeeded (HTTP 200).');
  });

  it('gracefully reports a network error with no status', () => {
    const fixture = setup({ ok: false, kind: 'network', message: 'Could not reach example.com.' });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Network error');
    expect(text).toContain('Could not reach example.com.');
  });

  it('pretty-prints JSON when display is json and the body parses', () => {
    const fixture = setup(
      { ok: true, kind: 'success', status: 200, bodyText: '{"a":1,"b":[2,3]}' },
      button({ display: 'json' }),
    );
    const body = fixture.nativeElement.querySelector('.body') as HTMLElement;
    expect(body).toBeTruthy();
    expect(body.getAttribute('data-view')).toBe('json');
    expect(body.textContent).toContain('\n  "a": 1');
    expect(fixture.nativeElement.querySelector('.warning')).toBeNull();
  });

  it('falls back to raw text with the warning when JSON does not parse', () => {
    const fixture = setup(
      { ok: true, kind: 'success', status: 200, bodyText: 'not json' },
      button({ display: 'json' }),
    );
    const body = fixture.nativeElement.querySelector('.body') as HTMLElement;
    expect(body.textContent).toBe('not json');
    expect(fixture.nativeElement.querySelector('.warning')?.textContent).toContain(
      'Response is not valid JSON — showing raw text.',
    );
  });

  it('shows raw text without a warning when display is text', () => {
    const fixture = setup(
      { ok: true, kind: 'success', status: 200, bodyText: 'plain <b>not html</b>' },
      button({ display: 'text' }),
    );
    const body = fixture.nativeElement.querySelector('.body') as HTMLElement;
    expect(body.textContent).toBe('plain <b>not html</b>');
    expect(body.querySelector('b')).toBeNull();
    expect(fixture.nativeElement.querySelector('.warning')).toBeNull();
  });

  it('shows only the no-body state for an empty non-200 body with display json', () => {
    const fixture = setup(
      { ok: false, kind: 'http', status: 401, bodyText: '', message: 'Unauthorized.' },
      button({ display: 'json' }),
    );
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.warning')).toBeNull();
    expect(html.querySelector('.body')).toBeNull();
    expect(html.querySelector('.no-body')?.textContent).toContain('No response body.');
    expect(html.textContent).not.toContain('Response is not valid JSON');
  });

  it('shows only the no-body state for a blank body with display text', () => {
    const fixture = setup(
      { ok: false, kind: 'http', status: 204, bodyText: '   \n' },
      button({ display: 'text' }),
    );
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.warning')).toBeNull();
    expect(html.querySelector('.body')).toBeNull();
    expect(html.querySelector('.no-body')?.textContent).toContain('No response body.');
  });

  it('emits dismiss on Close and on the backdrop', () => {
    const fixture = setup({ ok: true, kind: 'success', status: 200, bodyText: '{}' });
    const emit = vi.fn();
    fixture.componentInstance.dismiss.subscribe(emit);

    (fixture.nativeElement.querySelector('.foot ion-button') as HTMLElement).click();
    expect(emit).toHaveBeenCalledTimes(1);

    (fixture.nativeElement.querySelector('.backdrop') as HTMLElement).click();
    expect(emit).toHaveBeenCalledTimes(2);
  });
});
