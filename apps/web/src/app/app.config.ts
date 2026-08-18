import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // withFetch keeps Angular's built-in XSRF interceptor enabled; the API's
    // double-submit CSRF check in Phase 3 depends on it. authInterceptor adds
    // the 401-then-silent-refresh dance on top of that.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
  ],
};
