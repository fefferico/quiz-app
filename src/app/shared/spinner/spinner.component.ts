// filepath: /home/ffuser/git-repos/quiz-app/src/app/shared/spinner/spinner.component.ts
import { Component, OnDestroy } from '@angular/core';
import { SpinnerService } from '../../core/services/spinner.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CommonModule } from '@angular/common'; // Import CommonModule

@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.scss'],
  standalone: true, // Mark as standalone
  imports: [CommonModule] // Import CommonModule here for standalone components
})
export class SpinnerComponent implements OnDestroy {
  isLoading = false;
  message: string | null = null; // Added to hold the message
  private destroy$ = new Subject<void>();

  constructor(private spinnerService: SpinnerService) {
    this.spinnerService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe((loading) => {
        this.isLoading = loading;
      });

    this.spinnerService.message$ // Subscribe to the message observable
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        this.message = message;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

