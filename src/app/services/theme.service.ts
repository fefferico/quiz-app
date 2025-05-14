// src/app/services/theme.service.ts
import { Injectable, Renderer2, RendererFactory2, effect, inject, signal, WritableSignal, Signal, computed } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Theme = 'light' | 'dark' | 'sepia'; // Define theme types

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private document: Document = inject(DOCUMENT);

  // Use a writable signal for the current theme state
  private _currentTheme: WritableSignal<Theme> = signal<Theme>(this.getInitialThemePreference());

  // Expose a readonly signal for the current theme
  public readonly currentTheme: Signal<Theme> = this._currentTheme.asReadonly();

  // Derived signals for convenience (optional, can also be computed in components)
  public readonly isDarkMode: Signal<boolean> = computed(() => this._currentTheme() === 'dark');
  public readonly isLightMode: Signal<boolean> = computed(() => this._currentTheme() === 'light');
  public readonly isSepiaMode: Signal<boolean> = computed(() => this._currentTheme() === 'sepia');


  constructor() {
    // Effect to update the HTML classes and localStorage whenever _currentTheme changes
    effect(() => {
      const theme = this._currentTheme();
      console.log('ThemeService effect triggered. Current theme:', theme);

      // Remove all theme classes first
      this.renderer.removeClass(this.document.documentElement, 'dark');
      this.renderer.removeClass(this.document.documentElement, 'sepia-mode');
      // Potentially remove 'light-mode' if you add it, but usually light is the absence of other classes

      // Apply the current theme class
      if (theme === 'dark') {
        this.renderer.addClass(this.document.documentElement, 'dark');
        console.log('Added "dark" class to html');
      } else if (theme === 'sepia') {
        this.renderer.addClass(this.document.documentElement, 'sepia-mode');
        // OPTIONAL: If sepia mode should also have dark mode styling as a base
        // this.renderer.addClass(this.document.documentElement, 'dark');
        console.log('Added "sepia-mode" class to html');
      } else {
        // Light mode - typically no specific class needed if it's the default
        console.log('Set to light mode (no specific class added, or "dark"/"sepia-mode" removed)');
      }

      localStorage.setItem('themePreference', theme);
    });
  }

  private getInitialThemePreference(): Theme {
    const storedPreference = localStorage.getItem('themePreference') as Theme | null;
    if (storedPreference && ['light', 'dark', 'sepia'].includes(storedPreference)) {
      return storedPreference;
    }
    // Fallback to system preference for dark mode initially if no specific theme stored
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light'; // Default to light
  }

  public toggleTheme(): void {
    this._currentTheme.update(current => {
      if (current === 'light') return 'dark';
      if (current === 'dark') return 'sepia';
      if (current === 'sepia') return 'light';
      return 'light'; // Fallback, should not be reached with defined types
    });
  }

  // Renamed from getCurrentTheme to avoid confusion with the signal `currentTheme`
  public getCurrentThemeValue(): Theme {
    return this._currentTheme();
  }
}