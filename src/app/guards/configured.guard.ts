/**
 * Route guard for screens that need an active configuration (SPEC §8).
 *
 * It AWAITS `ConfigService.initialize()` before deciding, so a valid stored
 * configuration never sends the user to `/config` on a normal start: the answer
 * is only read once the storage read has finished (first-run race ruling).
 */
import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';
import { ConfigService } from '../services/config.service';

export const ConfiguredGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const config = inject(ConfigService);
  const router = inject(Router);

  await config.initialize();

  return config.isConfigured$.value ? true : router.createUrlTree(['/config']);
};
