// src/app/shared/components/toast/toast.component.ts
import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';
import { ToastMessage, ToastType } from '../../models/toast.model';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  animations: [
    trigger('toastAnimation', [
      state('void', style({
        // MODIFIED: Start fully off-screen at the bottom
        // Using a large fixed value like '150vh' or '200%' ensures it's off-screen.
        // Or, more precisely, if you know the max height of your toast, you can use that.
        // For simplicity and robustness, a large viewport percentage works well.
        // The translateX and scale are less critical for the "from bottom" effect
        // but kept them for now if you still want that horizontal/scale part of the initial state.
        // If you only want vertical, remove translateX and scale.
        transform: 'translateY(150vh) translateX(0) scale(1)', // Or 'translateY(200%)'
        opacity: 0,
        // height, margin, padding for ':leave' transition consistency, can be kept
        height: 0,
        margin: 0,
        padding: 0,
      })),
      state('*', style({
        transform: 'translateY(0) translateX(0) scale(1)', // Final resting position relative to its container
        opacity: 1,
        // height, margin, padding will be auto/default from CSS
      })),
      transition('void => *', [
        animate('0.3s ease-out')
      ]),
      transition('* => void', [
        animate('0.2s ease-in', style({
          opacity: 0,
          transform: 'translateX(100%)', // Exit to the right
          height: 0,
          margin: 0,
          padding: 0
        }))
      ])
    ])
  ]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
  toasts = computed(() => this.toastService.toasts());

  constructor() { }

  removeToast(toastId: string): void {
    this.toastService.remove(toastId);
  }

  clearAllNotifications() {
    this.toastService.clearAll();
  }

  // Explicit trackBy function
  trackByToastId(index: number, toast: ToastMessage): string | undefined {
    return toast.id;
  }

  getToastClasses(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'bg-green-500 border-green-600';
      case 'error':
        return 'bg-red-500 border-red-600';
      case 'warning':
        return 'bg-yellow-500 border-yellow-600';
      case 'info':
      default:
        return 'bg-blue-500 border-blue-600';
    }
  }

  getIconPath(type: ToastType): string {
    switch (type) {
      case 'success':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'error':
        return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'warning':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
      case 'info':
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }
}