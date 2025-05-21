// src/app/app.component.ts
import { Component, computed, inject, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {RouterOutlet, RouterLink, Router, RouterLinkActive} from '@angular/router';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import {
  faSun, faMoon, faAdjust, faHome, IconDefinition,
  faAdd, faHistory, faBarChart, faMagnifyingGlass, faStar, faLandmark,
  faSignOut,
  faBars, faTimes // Import hamburger and close icons
} from '@fortawesome/free-solid-svg-icons';
import { ThemeService } from './services/theme.service';
import {AuthService} from './core/services/auth.service';
import {SpinnerComponent} from './shared/spinner/spinner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    FontAwesomeModule,
    SpinnerComponent,
    RouterLinkActive
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  currentYear: number = new Date().getFullYear();
  homeIcon: IconDefinition = faHome;
  faAdd: IconDefinition = faAdd;
  faLandmark: IconDefinition = faLandmark;
  faHistory: IconDefinition = faHistory;
  faBarChart: IconDefinition = faBarChart;
  faBars: IconDefinition = faBars; // Hamburger icon
  faTimes: IconDefinition = faTimes; // Close (X) icon for menu
  faMagnifyingGlass: IconDefinition = faMagnifyingGlass;
  faStar: IconDefinition = faStar;
  faSignOut: IconDefinition = faSignOut;

  public isMenuOpen: boolean = false; // State for hamburger menu

  public themeService: ThemeService = inject(ThemeService);
  authService = inject(AuthService);
  private router = inject(Router);

  public icon: Signal<IconDefinition> = computed(() => {
    const theme = this.themeService.currentTheme();
    if (theme === 'dark') {
      return faMoon;
    } else if (theme === 'sepia') {
      return faAdjust;
    }
    return faSun;
  });

  public modeString: Signal<string> = computed(() => {
    const theme = this.themeService.currentTheme();
    if (theme === 'dark') {
      return 'Dark Mode';
    } else if (theme === 'sepia') {
      return 'Sepia Mode';
    }
    return 'Light Mode';
  });

  constructor(library: FaIconLibrary) {
    library.addIcons(faSun, faMoon, faAdjust, faHome, faAdd, faHistory, faBarChart, faBars, faTimes); // Add new icons
  }

  listenForModeToggleClick(): void {
    this.themeService.toggleTheme();
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  // Optional: Close menu when a link is clicked in mobile view
  closeMenu(): void {
    if (this.isMenuOpen) {
      this.isMenuOpen = false;
    }
  }

  listenForLogoff(): void {
    this.authService.signOut().then(() => {
      console.log("User logged off");
      // Optionally redirect to login page or show a message
      this.router.navigate(['/login']);
    }).catch((error) => {
      console.error("Error logging off:", error);
    });
  }
}
