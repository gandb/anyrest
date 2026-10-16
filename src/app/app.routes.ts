import { Routes } from '@angular/router';
import { ConfiguredGuard } from './guards/configured.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [ConfiguredGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'home',
    canActivate: [ConfiguredGuard],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'config',
    loadComponent: () => import('./pages/config/config.page').then((m) => m.ConfigPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
