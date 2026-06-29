import { ApplicationConfig, provideBrowserGlobalErrorListeners, ErrorHandler} from '@angular/core';
import { provideRouter } from '@angular/router';
import { GlobalErrorHandler } from './global-error-handler';
import { provideHttpClient } from '@angular/common/http'; // 💡 Import this!

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(), // 💡 Add this here to enable backend API requests!
    {provide: ErrorHandler, useClass: GlobalErrorHandler }
  ]
};
