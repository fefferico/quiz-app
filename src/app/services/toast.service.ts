// src/app/core/services/toast.service.ts
import { Injectable, signal, WritableSignal } from '@angular/core';
import { ToastMessage, ToastType } from '../models/toast.model';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  toasts: WritableSignal<ToastMessage[]> = signal([]);
  private defaultDuration = 5000; // 5 seconds

  constructor() { }

  show(message: string, type: ToastType = 'info', duration?: number, title?: string): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const toast: ToastMessage = { id, message, type, duration: duration ?? this.defaultDuration, title };
    
    this.toasts.update(currentToasts => [...currentToasts, toast]);

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => this.remove(id), toast.duration);
    }
  }

  success(message: string, duration?: number, title?: string): void {
    this.show(message, 'success', duration, title);
  }

  error(message: string, duration?: number, title?: string): void {
    this.show(message, 'error', duration, title);
  }

  warning(message: string, duration?: number, title?: string): void {
    this.show(message, 'warning', duration, title);
  }

  info(message: string, duration?: number, title?: string): void {
    this.show(message, 'info', duration, title);
  }

  remove(toastId: string): void {
    this.toasts.update(currentToasts => currentToasts.filter(t => t.id !== toastId));
  }

  clearAll(): void {
    this.toasts.set([]);
  }
}