/**
 * Square button icon with the SPEC §3.1 fallback tile.
 *
 * The image is always cropped into a fixed square (`object-fit: cover`) and is
 * bound only when the resolved URL passes the format policy (png/webp — SPEC
 * §3.1.3); when the icon is absent, unresolvable, not an allowed format or fails
 * to load, the box shows the first 1–2 characters of the label instead — never a
 * broken-image glyph, and never a disallowed file.
 */
import { Component, computed, input, signal } from '@angular/core';
import { fallbackInitial, resolveDisplayIconUrlWithStore } from '../../core/icon';

@Component({
  selector: 'app-button-icon',
  standalone: true,
  template: `
    @if (url(); as src) {
      @if (!broken()) {
        <img [src]="src" [alt]="label()" (error)="broken.set(true)" />
      } @else {
        <span class="initial" aria-hidden="true">{{ initial() }}</span>
      }
    } @else {
      <span class="initial" aria-hidden="true">{{ initial() }}</span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        inline-size: 48px;
        block-size: 48px;
        flex: 0 0 auto;
        border-radius: 12px;
        overflow: hidden;
        background: var(--ion-color-light, #eceff4);
        color: var(--ion-color-medium, #5b6472);
      }
      img {
        inline-size: 100%;
        block-size: 100%;
        object-fit: cover;
        display: block;
      }
      .initial {
        display: flex;
        inline-size: 100%;
        block-size: 100%;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 1rem;
        text-transform: uppercase;
      }
    `,
  ],
})
export class ButtonIconComponent {
  readonly icon = input<string | undefined>(undefined);
  readonly iconpath = input<string | undefined>(undefined);
  readonly label = input<string>('');

  /** Icons the user copied into the app, keyed by file name (SPEC §3.1 amendment). */
  readonly storedIcons = input<ReadonlyMap<string, string>>(new Map());

  protected readonly broken = signal(false);
  protected readonly url = computed(() =>
    resolveDisplayIconUrlWithStore(this.icon(), this.iconpath(), this.storedIcons()),
  );
  protected readonly initial = computed(() => fallbackInitial(this.label()));
}
