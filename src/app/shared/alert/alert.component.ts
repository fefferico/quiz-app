// src/app/shared/alert/alert.component.ts
import { Component, Input, Output, EventEmitter, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertOptions, AlertButton } from '../../models/alert.model';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush // Good for components with @Input
})
export class AlertComponent {
  @Input() options: AlertOptions | null = null;
  @Output() dismissed = new EventEmitter<{ role: string, data?: any } | undefined>(); // Emit button role or undefined for backdrop

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.options?.backdropDismiss !== false) { // Only if backdropDismiss is not explicitly false
      this.dismissWith(undefined); // Dismiss as if backdrop was clicked
    }
  }

  onButtonClick(button: AlertButton): void {
    this.dismissWith({ role: button.role, data: button.data });
  }

  onBackdropClick(): void {
    if (this.options?.backdropDismiss !== false) { // Default to true if undefined
      this.dismissWith(undefined);
    }
  }

  private dismissWith(result: { role: string, data?: any } | undefined): void {
    this.dismissed.emit(result);
  }

  // Helper to get button classes
  getButtonClass(button: AlertButton): string {
    let classes = 'px-4 py-2 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ';
    if (button.cssClass) {
      classes += button.cssClass + ' ';
    }
    switch (button.role) {
      case 'confirm':
        classes += 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus:ring-indigo-600';
        break;
      case 'cancel':
        classes += 'bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200 dark:focus:ring-gray-500';
        break;
      default: // custom
        classes += 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400 dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:ring-blue-500'; // Default custom
        break;
    }
    return classes;
  }
}