// src/app/app.config.ts
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router'; // Import TitleStrategy
import { routes } from './app.routes';
// import { HttpClientModule } from '@angular/common/http'; // If you need HttpClient later

// Optional: Custom Title Strategy
import { FeedbackService } from './core/services/template-page-title-strategy.service';
import { provideHttpClient } from '@angular/common/http';


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    // provideHttpClient(), // Example if you were to use HttpClient
    //{ provide: TitleStrategy, useClass: FeedbackService } // For dynamic page titles
    // DatabaseService is already providedIn: 'root'
  ]
};