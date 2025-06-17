// src/app/core/models/toast.model.ts
export interface ToastMessage {
  id?: string; // Optional: for removing specific toasts if needed
  message: string;
  type: ToastType;
  duration?: number; // Milliseconds
  title?: string; // Optional title
  // icon?: string; // Optional: for custom icons
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';