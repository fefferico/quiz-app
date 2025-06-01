// filepath: /home/ffuser/git-repos/quiz-app/src/app/core/services/spinner.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SpinnerService {
  private loadingCount = 0;
  private isLoading = new BehaviorSubject<boolean>(false);
  private loadingMessage = new BehaviorSubject<string | null>(null);
  private activeTimeoutId: ReturnType<typeof setTimeout> | null = null; // Added for managing timeout

  public readonly loading$: Observable<boolean> = this.isLoading.asObservable();
  public readonly message$: Observable<string | null> = this.loadingMessage.asObservable();

  constructor() { }

  /**
   * Shows the spinner.
   * @param message Optional message to display initially.
   * @param timeout Optional duration in milliseconds. If provided along with timeoutMessage,
   *                the spinner will display timeoutMessage after this duration.
   * @param timeoutMessage Optional message to display after the timeout duration.
   *                     Requires 'timeout' to be set.
   */
  show(message: string | null = null, timeout: number = 6000, timeoutMessage: string = 'Sembra che ci siano problemi di connessione...'): void {
    this.loadingCount++;
    if (this.loadingCount === 1) {
      this.isLoading.next(true);
    }

    // Set the initial message
    this.loadingMessage.next(message);

    // Clear any existing timeout before setting a new one
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }

    // If timeout and timeoutMessage are provided, set a new timeout
    if (typeof timeout === 'number' && timeout > 0 && typeof timeoutMessage === 'string') {
      this.activeTimeoutId = setTimeout(() => {
        // Only update the message if the spinner is still considered loading
        // (i.e., isLoading is true) and this timeout hasn't been cancelled.
        if (this.isLoading.value) {
          this.loadingMessage.next(message + ' ('+timeoutMessage+')');
        }
        this.activeTimeoutId = null; // Clear the stored ID after execution or if cancelled
      }, timeout);
    }
  }

  hide(): void {
    if (this.loadingCount > 0) {
      this.loadingCount--;
    }
    if (this.loadingCount === 0) {
      this.isLoading.next(false);
      this.loadingMessage.next(null); // Clear message when spinner hides
      // Clear any pending timeout
      if (this.activeTimeoutId) {
        clearTimeout(this.activeTimeoutId);
        this.activeTimeoutId = null;
      }
    }
  }

  reset(): void {
    this.loadingCount = 0;
    this.isLoading.next(false);
    this.loadingMessage.next(null); // Clear message on reset
    // Clear any pending timeout
    if (this.activeTimeoutId) {
      clearTimeout(this.activeTimeoutId);
      this.activeTimeoutId = null;
    }
  }
}