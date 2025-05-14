// src/app/app.component.ts
import { Component, computed, inject, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faSun, faMoon, faAdjust, faHome, IconDefinition, faAdd, faHistory, faBarChart } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { ThemeService, Theme } from './services/theme.service'; // Import Theme type

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    FontAwesomeModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  currentYear: number = new Date().getFullYear();
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously
  faAdd: IconDefinition = faAdd;
  faHistory: IconDefinition = faHistory;
  faBarChart: IconDefinition = faBarChart;
  
  public themeService: ThemeService = inject(ThemeService);

  // Use computed signals for icon and modeString based on the themeService's currentTheme signal
  public icon: Signal<IconDefinition> = computed(() => {
    const theme = this.themeService.currentTheme(); // Read the current theme signal
    if (theme === 'dark') {
      return faMoon;
    } else if (theme === 'sepia') {
      return faAdjust; // Or faTint, faPalette, etc., as you prefer for sepia
    }
    return faSun; // Default to light mode icon
  });

  public modeString: Signal<string> = computed(() => {
    const theme = this.themeService.currentTheme(); // Read the current theme signal
    if (theme === 'dark') {
      return 'Dark Mode';
    } else if (theme === 'sepia') {
      return 'Sepia Mode';
    }
    return 'Light Mode'; // Default to light mode string
  });

  constructor(library: FaIconLibrary) {
    // Add all icons to the library that might be used by the theme toggle
    library.addIcons(faSun, faMoon, faAdjust, faHome); // Added faAdjust, faHome was already there
  }

  listenForModeToggleClick(): void {
    this.themeService.toggleTheme(); // Call the updated toggle function
  }
}