/**
 * Main screen (SPEC §8, §7).
 *
 * The button list is generated 100% from the active configuration — no hardcoded
 * buttons, labels or counts. Each tap runs that button's request through
 * `RestService`; only the tapped row is locked while its own call is in flight
 * (SPEC §7.4), and the outcome is shown in the result modal (§7.5–§7.9).
 */
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, settingsOutline } from 'ionicons/icons';
import { ButtonIconComponent } from '../components/button-icon/button-icon.component';
import { ResultModalComponent } from '../components/result-modal/result-modal.component';
import type { ButtonConfig, RestOutcome } from '../core/types';
import { ConfigService } from '../services/config.service';
import { IconStoreService } from '../services/icon-store.service';
import { RestService } from '../services/rest.service';

/** One finished call: the outcome plus the button it belongs to (for its messages). */
interface ResultView {
  outcome: RestOutcome;
  button: ButtonConfig;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    ButtonIconComponent,
    ResultModalComponent,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly rest = inject(RestService);

  /** Public so the template can read `active()` (the row source of truth). */
  readonly config = inject(ConfigService);

  /** Public so the template can resolve names against the copied icons. */
  readonly icons = inject(IconStoreService);

  /** Ids with a request in flight; only those rows are locked (SPEC §7.4). */
  private readonly inFlight = signal<ReadonlySet<string>>(new Set());

  /** Outcome of the last finished call; null keeps the modal closed. */
  readonly result = signal<ResultView | null>(null);

  constructor() {
    addIcons({ addCircleOutline, settingsOutline });
    void this.icons.load();
  }

  isBusy(id: string): boolean {
    return this.inFlight().has(id);
  }

  /** Runs one button's request; a tap on an in-flight row is ignored (§7.4). */
  tap(button: ButtonConfig): void {
    if (this.isBusy(button.id)) {
      return;
    }
    this.markBusy(button.id, true);
    this.rest.execute(button.request).subscribe((outcome) => {
      this.markBusy(button.id, false);
      this.result.set({ outcome, button });
    });
  }

  closeResult(): void {
    this.result.set(null);
  }

  goConfig(): void {
    void this.router.navigateByUrl('/config');
  }

  private markBusy(id: string, busy: boolean): void {
    const next = new Set(this.inFlight());
    if (busy) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.inFlight.set(next);
  }
}
