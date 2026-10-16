/**
 * Configuration screen (SPEC §8, §4, §5, §6).
 *
 * A picked file is parsed and validated in memory only: `preview` holds a VALID
 * candidate and nothing is persisted until "Confirm and save". An invalid file
 * lists the issues and leaves the active configuration untouched.
 */
import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline, cloudDownloadOutline, documentOutline } from 'ionicons/icons';
import { ButtonIconComponent } from '../../components/button-icon/button-icon.component';
import { readIconDataUrls, splitSelection } from '../../core/picked-files';
import type { AnyRestConfig, ValidationIssue } from '../../core/types';
import { validateConfig } from '../../core/validate';
import { ConfigService } from '../../services/config.service';
import { IconStoreService } from '../../services/icon-store.service';

@Component({
  selector: 'app-config',
  templateUrl: 'config.page.html',
  styleUrls: ['config.page.scss'],
  imports: [
    AsyncPipe,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonProgressBar,
    IonTitle,
    IonToolbar,
    ButtonIconComponent,
  ],
})
export class ConfigPage {
  private readonly router = inject(Router);

  /** Public so the template can read `isConfigured$ | async` for the Cancel action. */
  readonly config = inject(ConfigService);

  private readonly icons = inject(IconStoreService);

  /** Icons read from the last selection, copied into the app on confirmation. */
  readonly pendingIcons = signal<ReadonlyMap<string, string>>(new Map());

  /** Names of picked files that are neither the configuration nor an allowed icon. */
  readonly ignoredFiles = signal<readonly string[]>([]);

  /** Issues of the last unsuccessful attempt; empty when there is none. */
  readonly issues = signal<readonly ValidationIssue[]>([]);

  /** Valid candidate waiting for confirmation; null when there is nothing to confirm. */
  readonly preview = signal<AnyRestConfig | null>(null);

  /** True while a file is being read, parsed or saved. */
  readonly busy = signal(false);

  constructor() {
    addIcons({ checkmarkOutline, closeOutline, cloudDownloadOutline, documentOutline });
  }

  /**
   * Reads the selection — the `anyrest.json` together with its images — and keeps
   * the result as a candidate. Nothing is persisted until "Confirm and save"
   * (SPEC §4, §6; SPEC §3.1 amendment for the copied icons).
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }
    this.busy.set(true);
    try {
      this.preview.set(null);
      this.pendingIcons.set(new Map());
      const split = splitSelection(files);
      this.ignoredFiles.set(split.ignored);
      if (split.config === null || split.errors.length > 0) {
        this.issues.set([...split.errors]);
        return;
      }
      const text = await split.config.text();
      const read = await readIconDataUrls(split.images);
      if (read.errors.length > 0) {
        this.issues.set(read.errors);
        return;
      }
      this.pendingIcons.set(read.icons);
      this.review(text);
    } catch {
      this.issues.set([{ path: '$', message: 'The selected files could not be read.' }]);
      this.preview.set(null);
      this.pendingIcons.set(new Map());
    } finally {
      this.busy.set(false);
      // Lets the same files be picked again after an invalid attempt.
      input.value = '';
    }
  }

  /** Loads and activates the bundled demo (SPEC §6 demo reset), then opens home. */
  async loadDemo(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.config.resetToDemo();
      if (result.ok) {
        this.issues.set([]);
        await this.goHome();
      } else {
        this.issues.set(result.errors);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Copies the selected images into the app, then persists and activates the
   * previewed configuration — the selection is the whole set.
   */
  async confirm(): Promise<void> {
    const candidate = this.preview();
    if (candidate === null) {
      return;
    }
    this.busy.set(true);
    try {
      const copied = await this.icons.replaceAll(this.pendingIcons());
      if (!copied) {
        this.issues.set([
          { path: '$', message: 'The selected images could not be saved on this device.' },
        ]);
        return;
      }
      const result = await this.config.activateObject(candidate);
      if (result.ok) {
        this.preview.set(null);
        this.pendingIcons.set(new Map());
        this.ignoredFiles.set([]);
        this.issues.set([]);
        await this.goHome();
      } else {
        this.issues.set(result.errors);
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Leaves the screen without changing the active configuration. */
  cancel(): void {
    void this.goHome();
  }

  /** Validates raw text without touching persistence. */
  private review(text: string): void {
    this.preview.set(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.issues.set([{ path: '$', message: 'The selected file is not valid JSON.' }]);
      return;
    }
    const result = validateConfig(parsed);
    if (!result.ok) {
      this.issues.set(result.errors);
      return;
    }
    this.issues.set([]);
    this.preview.set(parsed as AnyRestConfig);
  }

  private goHome(): Promise<boolean> {
    return this.router.navigateByUrl('/home');
  }
}
