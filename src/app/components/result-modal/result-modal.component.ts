/**
 * Result / error modal (SPEC §7.5–§7.8, §8).
 *
 * Renders one `RestOutcome`: a status line that is green ONLY for HTTP 200 and red
 * for anything else, the configured/default message, and the body block (pretty JSON
 * when `display: 'json'` and it parses, raw text + the §7.6 warning otherwise).
 *
 * Config and response text are interpolated only — `innerHTML` is never used (§9).
 */
import { Component, computed, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { classifyStatus, formatBody, type FormattedBody } from '../../core/http-result';
import type { ButtonConfig, HttpMethod, RestOutcome } from '../../core/types';

@Component({
  selector: 'app-result-modal',
  standalone: true,
  imports: [IonButton],
  template: `
    <div class="backdrop" (click)="dismiss.emit()"></div>
    <section class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="heading()">
      <header class="status" [class.ok]="success()" [class.err]="!success()">
        <span class="dot" aria-hidden="true"></span>
        <span class="status-text">{{ statusText() }}</span>
      </header>

      <div class="panel">
        @if (button(); as b) {
          <p class="context">
            <span class="badge" [attr.data-method]="method(b)">{{ method(b) }}</span>
            <span class="context-label">{{ b.label }}</span>
          </p>
        }
        <p class="message">{{ message() }}</p>

        @if (body().warning; as warn) {
          <p class="warning" role="note">{{ warn }}</p>
        }

        @if (body().text) {
          <pre class="body" [attr.data-view]="body().view" tabindex="0">{{ body().text }}</pre>
        } @else {
          <p class="no-body">No response body.</p>
        }
      </div>

      <footer class="foot">
        <ion-button
          expand="block"
          [color]="success() ? 'success' : 'danger'"
          (click)="dismiss.emit()"
        >
          Close
        </ion-button>
      </footer>
    </section>
  `,
  styleUrls: ['result-modal.component.scss'],
})
export class ResultModalComponent {
  readonly outcome = input.required<RestOutcome>();
  readonly button = input<ButtonConfig | null>(null);
  readonly dismiss = output<void>();

  /** Green ONLY for HTTP 200 (frozen status rule); every other outcome is red. */
  protected readonly success = computed(
    () => this.outcome().ok && classifyStatus(this.outcome().status ?? 0) === 'success',
  );

  protected readonly heading = computed(() => `Result — ${this.statusText()}`);

  protected readonly statusText = computed(() => {
    const out = this.outcome();
    if (out.ok) {
      return 'HTTP 200 — Success';
    }
    if (out.kind === 'timeout') {
      return 'Timeout';
    }
    if (out.status !== undefined && out.status > 0) {
      return `HTTP ${out.status} — Error`;
    }
    return 'Network error';
  });

  /** Configured message wins; otherwise the SPEC §7 wording, then a generic default. */
  protected readonly message = computed(() => {
    const out = this.outcome();
    const response = this.button()?.response;
    if (out.ok) {
      return response?.successMessage ?? 'Request succeeded (HTTP 200).';
    }
    return response?.errorMessage ?? out.message ?? 'The request failed.';
  });

  protected readonly body = computed<FormattedBody>(() => {
    const out = this.outcome();
    const display = this.button()?.response?.display ?? 'json';
    return formatBody(out.bodyText ?? '', display);
  });

  protected method(button: ButtonConfig): HttpMethod {
    return button.request.method;
  }
}
