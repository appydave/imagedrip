import type { AppytronApi, ImagedripApi } from '../shared/ipc';

declare global {
  interface Window {
    appytron: AppytronApi;
    imagedrip: ImagedripApi;
  }
}
