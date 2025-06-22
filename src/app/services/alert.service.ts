// src/app/core/services/alert.service.ts
import { Injectable, ApplicationRef, createComponent, EnvironmentInjector, ComponentRef } from '@angular/core';
import { AlertComponent } from '../shared/alert/alert.component';
import { AlertOptions, AlertButton } from '../models/alert.model';

@Injectable({
    providedIn: 'root'
})
export class AlertService {
    // Signal to hold the current alert options, or null if no alert is active
    // private currentAlert: WritableSignal<AlertOptions | null> = signal(null);

    // We will manage component creation directly instead of using a signal to show/hide one instance
    private alertComponentRef: ComponentRef<AlertComponent> | null = null;

    constructor(
        private appRef: ApplicationRef,
        private injector: EnvironmentInjector
    ) { }

    // Method to present an alert
    async present(options: AlertOptions): Promise<any> { // Returns a promise that resolves with button data or dismiss reason
        // Dismiss any existing alert first
        if (this.alertComponentRef) {
            this.dismiss(undefined); // Dismiss with a reason indicating it was overridden
        }

        return new Promise((resolve) => {
            // Create the component dynamically
            const alertComponentRef: ComponentRef<any> = createComponent(AlertComponent, {
                environmentInjector: this.injector,
            });

            // Attach to the application view so it's part of change detection
            this.appRef.attachView(alertComponentRef.hostView);
            const domElem = (alertComponentRef.hostView as any).rootNodes[0] as HTMLElement;
            document.body.appendChild(domElem);

            this.alertComponentRef = alertComponentRef;

            // Pass options to the component
            alertComponentRef.instance.options = options;
            alertComponentRef.instance.dismissed.subscribe((result: { role: string, data?: any } | undefined) => {
                this.dismiss(result); // Internal dismiss based on component event
                resolve(result); // Resolve the promise with the button's role or undefined if backdrop dismiss
            });

            alertComponentRef.changeDetectorRef.detectChanges(); // Trigger initial change detection
        });
    }

    // Method to dismiss the current alert
    dismiss(result?: { role: string, data?: any }): void {
        if (this.alertComponentRef) {
            const buttonClicked = result?.role;
            // const buttonData = result?.data; // Removed as it's unused

            // Find the button that was clicked, if any, and call its handler
            const clickedButton = this.alertComponentRef.instance.options?.buttons.find(b => b.role === buttonClicked);
            if (clickedButton && clickedButton.handler) {
                try {
                    clickedButton.handler();
                } catch (e) {
                    console.error('Error in alert button handler:', e);
                }
            }

            this.appRef.detachView(this.alertComponentRef.hostView);
            this.alertComponentRef.destroy();
            this.alertComponentRef = null;
            // console.log('Alert dismissed with:', result, 'Reason:', reason);
        }
    }

    // --- Convenience Methods ---
    async showAlert(header: string, message: string, okText: string = 'OK'): Promise<void> {
        await this.present({
            header,
            message,
            buttons: [{ text: okText, role: 'confirm' }]
        });
    }

    async showConfirm(
        header: string,
        message: string,
        okText: string = 'OK',
        cancelText: string = 'Annulla'
    ): Promise<{ role: 'confirm' | 'cancel', data?: any } | undefined> { // Return type indicates which button was pressed
        const result = await this.present({
            header,
            message,
            buttons: [
                { text: cancelText, role: 'cancel' },
                { text: okText, role: 'confirm', data: true } // Example: pass data back
            ]
        });
        return result as { role: 'confirm' | 'cancel', data?: any } | undefined;
    }

    async showCustomAlert(title: string, message: string) {
    const result = await this.present({
      header: title,
      message: message,
      buttons: [
        {
          text: 'Non fare nulla',
          role: 'cancel',
          cssClass: 'bg-gray-300 hover:bg-gray-500' // Example custom class
        } as AlertButton,
        {
          text: 'Fai Qualcosa',
          role: 'custom',
          cssClass: 'bg-teal-500 hover:bg-teal-600',
          handler: () => {
            console.log('Handler del bottone "Fai Qualcosa" eseguito!');
            // This runs before the alert promise resolves for this button
          },
          data: { action: 'custom_action' }
        } as AlertButton,
        {
          text: 'OK',
          role: 'confirm',
          data: 'ok_confirmed'
        } as AlertButton,
      ],
      backdropDismiss: false // Prevent dismissing by clicking backdrop
    });

    if (result) {
      console.log('Bottone cliccato:', result?.role, 'con dati:', result?.data);
      if (result?.role === 'confirm') {
        // Logic for OK
      } else if (result?.role === 'custom') {
        // Logic for custom button
      }
    } else {
      console.log('Allerta personalizzata dismessa (probabilmente ESC se backdropDismiss fosse true)');
    }
  }

  async showConfirmationDialog(title: string, message: string, customButtons?: AlertButton[]) {
    const result = await this.present({
      header: title,
      message: message,
      buttons: customButtons ? customButtons : [
        {
          text: 'Annulla',
          role: 'cancel',
          cssClass: 'bg-gray-300 hover:bg-gray-500' // Example custom class
        } as AlertButton,
        {
          text: 'OK',
          role: 'confirm',
          data: 'ok_confirmed'
        } as AlertButton,
      ],
      backdropDismiss: false // Prevent dismissing by clicking backdrop
    });

    if (result) {
      console.log('Bottone cliccato:', result?.role, 'con dati:', result?.data);
      return result;
    } else {
      console.log('Allerta showConfirmationDialog');
    }
  }

  async showToast(options: { message: string; type?: 'success' | 'error' | 'info' | 'warning'; duration?: number } = { message: '', type: 'info', duration: 3000 }): Promise<void> {
    // Create a toast element
    const toast = document.createElement('div');
    toast.textContent = options.message;
    toast.className = `alert-toast alert-toast-${options.type || 'info'}`;
    // Basic styles (customize as needed)
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      padding: '12px 24px',
      borderRadius: '6px',
      color: '#fff',
      background: options.type === 'error'
        ? '#dc2626'
        : options.type === 'success'
          ? '#16a34a'
          : options.type === 'warning'
            ? '#f59e42'
            : '#2563eb',
      fontSize: '1rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      opacity: '0',
      transition: 'opacity 0.3s'
    });

    document.body.appendChild(toast);
    // Animate in
    setTimeout(() => { toast.style.opacity = '1'; }, 10);

    // Remove after duration
    const duration = options.duration ?? 3000;
    await new Promise<void>(resolve => {
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
          document.body.removeChild(toast);
          resolve();
        }, 300);
      }, duration);
    });
  }
}