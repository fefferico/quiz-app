// filepath: /home/ffuser/git-repos/quiz-app/src/app/core/services/spinner.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SpinnerService {
  private loadingCount = 0;
  private isLoading = new BehaviorSubject<boolean>(false);
  private loadingMessage = new BehaviorSubject<string | null>(null); // Added for custom message

  public readonly loading$: Observable<boolean> = this.isLoading.asObservable();
  public readonly message$: Observable<string | null> = this.loadingMessage.asObservable(); // Added for custom message

  constructor() { }

  show(message: string | null = null): void { // Allow optional message
    this.loadingCount++;
    if (this.loadingCount === 1) {
      this.isLoading.next(true);
    }
    if (message) { // Set message if provided
      this.loadingMessage.next(message);
    }
  }

  hide(): void {
    if (this.loadingCount > 0) {
      this.loadingCount--;
    }
    if (this.loadingCount === 0) {
      this.isLoading.next(false);
      this.loadingMessage.next(null); // Clear message when spinner hides
    }
  }

  reset(): void {
    this.loadingCount = 0;
    this.isLoading.next(false);
    this.loadingMessage.next(null); // Clear message on reset
  }
}

