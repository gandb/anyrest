import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anyrest.mobile',
  appName: 'AnyRest',
  webDir: 'www',
  plugins: {
    // Route fetch/XHR through native HTTP so the app can call user services that
    // send no CORS headers (the browser build keeps the browser's own rules).
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
