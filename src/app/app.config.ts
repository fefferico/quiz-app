// src/app/app.config.ts
import { ApplicationConfig, importProvidersFrom, isDevMode } from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router'; // Import TitleStrategy
import { routes } from './app.routes';
// import { HttpClientModule } from '@angular/common/http'; // If you need HttpClient later

// Optional: Custom Title Strategy
import { FeedbackService } from './core/services/template-page-title-strategy.service';
import { provideHttpClient } from '@angular/common/http';
import { provideServiceWorker, ServiceWorkerModule } from '@angular/service-worker';
import { provideAnimations } from '@angular/platform-browser/animations'; // Or provideAnimationsAsync

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(), provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    importProvidersFrom(ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(), // Enable for production
      registrationStrategy: 'registerWhenStable:30000'
    })),
    provideAnimations()
    // provideHttpClient(), // Example if you were to use HttpClient
    //{ provide: TitleStrategy, useClass: FeedbackService } // For dynamic page titles
    // DatabaseService is already providedIn: 'root'
  ]
};