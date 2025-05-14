// src/app/models/alert.model.ts
export interface AlertButton {
    text: string;
    role: 'confirm' | 'cancel' | 'custom'; // Role helps in default styling/behavior
    cssClass?: string; // Optional custom CSS classes for the button
    handler?: () => void; // Optional handler executed before closing
    data?: any; // Optional data to pass back on button click
}

export interface AlertOptions {
    header?: string;
    message: string;
    buttons: AlertButton[];
    backdropDismiss?: boolean; // Allow dismissing by clicking backdrop (default: true)
    customCssClass?: string; // Custom class for the alert container
}