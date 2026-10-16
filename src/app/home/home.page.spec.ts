/**
 * Main screen behaviour (SPEC §8, §7).
 *
 * The user-visible promises under test: the rows are generated from the active
 * configuration only (nothing hardcoded), tapping runs THAT button's request while
 * only that row is locked, and a non-200 outcome opens the error modal.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnyRestConfig, RequestConfig, RestOutcome } from '../core/types';
import { ConfigService } from '../services/config.service';
import { RestService } from '../services/rest.service';
import { HomePage } from './home.page';

const twoButtonConfig: AnyRestConfig = {
  version: 1,
  app: { title: 'AnyRest Demo', description: 'Public demo endpoints' },
  buttons: [
    {
      id: 'alpha',
      label: 'Alpha',
      description: 'First call',
      icon: 'get.png',
      request: { method: 'GET', url: 'https://example.com/a' },
    },
    {
      id: 'bravo',
      label: 'Bravo',
      request: { method: 'POST', url: 'https://example.com/b' },
    },
  ],
};

const emptyConfig: AnyRestConfig = { version: 1, app: { title: 'Empty' }, buttons: [] };

/** Captures every executed request and lets a test emit the outcome when it wants. */
const restStub = {
  executed: [] as RequestConfig[],
  subjects: [] as Subject<RestOutcome>[],
  execute(req: RequestConfig) {
    restStub.executed.push(req);
    const subject = new Subject<RestOutcome>();
    restStub.subjects.push(subject);
    return subject.asObservable();
  },
};

function setup(config: AnyRestConfig): ComponentFixture<HomePage> {
  TestBed.configureTestingModule({
    imports: [HomePage],
    providers: [
      provideRouter([]),
      { provide: ConfigService, useValue: { active: () => config } },
      { provide: RestService, useValue: restStub },
    ],
  });
  const fixture = TestBed.createComponent(HomePage);
  fixture.detectChanges();
  return fixture;
}

function rowButtons(fixture: ComponentFixture<HomePage>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.row-btn'));
}

describe('HomePage', () => {
  beforeEach(() => {
    restStub.executed.length = 0;
    restStub.subjects.length = 0;
  });

  it('renders one row per configured button and nothing hardcoded', () => {
    const fixture = setup(twoButtonConfig);
    const rows = rowButtons(fixture);

    expect(rows.length).toBe(2);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Alpha');
    expect(text).toContain('Bravo');
    expect(text).toContain('First call');
    expect(text).not.toContain('Blank');
    expect(rows[1].querySelector('app-button-icon')).toBeTruthy();
  });

  it('shows the header title, subtitle and a settings button to /config', () => {
    const fixture = setup(twoButtonConfig);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('AnyRest Demo');
    expect(text).toContain('Public demo endpoints');

    const settings = fixture.nativeElement.querySelector(
      'ion-buttons[slot="end"] ion-button',
    ) as HTMLElement;
    settings.click();

    expect(navigate).toHaveBeenCalledWith('/config');
  });

  it('locks only the tapped row while its request is in flight', () => {
    const fixture = setup(twoButtonConfig);
    const rows = rowButtons(fixture);

    rows[0].click();
    fixture.detectChanges();

    expect(restStub.executed).toEqual([twoButtonConfig.buttons[0].request]);
    expect(rowButtons(fixture)[0].disabled).toBe(true);
    expect(rowButtons(fixture)[1].disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.row-spinner')).toBeTruthy();

    // A second tap on the in-flight row is ignored (no new request).
    rowButtons(fixture)[0].click();
    expect(restStub.executed.length).toBe(1);

    restStub.subjects[0].next({ ok: true, kind: 'success', status: 200, bodyText: '{"a":1}' });
    fixture.detectChanges();
    expect(rowButtons(fixture)[0].disabled).toBe(false);
  });

  it('opens the error modal on a non-200 outcome', () => {
    const fixture = setup(twoButtonConfig);
    rowButtons(fixture)[0].click();
    fixture.detectChanges();

    restStub.subjects[0].next({
      ok: false,
      kind: 'http',
      status: 404,
      bodyText: '{"error":"gone"}',
      message: 'The server responded with HTTP status 404.',
    });
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('app-result-modal');
    expect(modal).toBeTruthy();
    expect(modal.querySelector('.status.err')).toBeTruthy();
    const text = modal.textContent as string;
    expect(text).toContain('HTTP 404');
    expect(text).toContain('The server responded with HTTP status 404.');
    expect(text).toContain('gone');
  });

  it('dismissing the modal closes it', () => {
    const fixture = setup(twoButtonConfig);
    rowButtons(fixture)[0].click();
    fixture.detectChanges();
    restStub.subjects[0].next({ ok: true, kind: 'success', status: 200, bodyText: '{}' });
    fixture.detectChanges();

    const close = fixture.nativeElement.querySelector(
      'app-result-modal .foot ion-button',
    ) as HTMLElement;
    close.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-result-modal')).toBeNull();
  });

  it('shows the empty state with a CTA to /config when the config has no buttons', () => {
    const fixture = setup(emptyConfig);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    expect(rowButtons(fixture).length).toBe(0);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No operations defined');

    const cta = fixture.nativeElement.querySelector('.empty ion-button') as HTMLElement;
    cta.click();

    expect(navigate).toHaveBeenCalledWith('/config');
  });
});
