import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faCircleExclamation } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust

// ** No need to import FeedbackService or HttpClientModule here if we are mocking the call **
// import { HttpClientModule } from '@angular/common/http';
// import { FeedbackService } from '../services/feedback.service';

interface FeedbackPayload {
  questionId: string;
  isMarkedIncorrect: boolean;
  reasonText?: string;
  suggestedCorrectionText?: string;
  timestamp: string;
  // userId?: string;
}

@Component({
  selector: 'app-question-feedback',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule
    // HttpClientModule // Only if FeedbackService is used AND it's also standalone & needs it
  ],
  templateUrl: './question-feedback.component.html',
  styleUrls: ['./question-feedback.component.scss']
})
export class QuestionFeedbackComponent {
  @Input() questionId!: string;
  @Output() feedbackSubmitted = new EventEmitter<void>();
  segnala: IconDefinition = faCircleExclamation;

  isModalOpen = false;
  feedbackForm: FormGroup;
  isLoading = false;
  submitError: string | null = null;
  submitSuccess: string | null = null;

  constructor(
    private fb: FormBuilder,
    // private feedbackService: FeedbackService // ** COMMENTED OUT **
  ) {
    this.feedbackForm = this.fb.group({
      isMarkedIncorrect: [false],
      reasonText: [''],
      suggestedCorrectionText: ['']
    });
  }

  openFeedbackModal(): void {
    this.isModalOpen = true;
    this.submitError = null;
    this.submitSuccess = null;
  }

  closeFeedbackModal(): void {
    this.isModalOpen = false;
    this.feedbackForm.reset({ isMarkedIncorrect: false, reasonText: '', suggestedCorrectionText: '' });
  }

  async onSubmitFeedback(): Promise<void> {
    if (this.feedbackForm.invalid) {
      return;
    }

    const formValues = this.feedbackForm.value;

    if (!formValues.isMarkedIncorrect && !formValues.reasonText?.trim() && !formValues.suggestedCorrectionText?.trim()) {
      this.submitError = 'Per favore, seleziona "Domanda errata" o fornisci una motivazione/suggerimento.';
      return;
    }

    this.isLoading = true;
    this.submitError = null;
    this.submitSuccess = null;

    const payload: FeedbackPayload = {
      questionId: this.questionId,
      isMarkedIncorrect: formValues.isMarkedIncorrect,
      reasonText: formValues.reasonText?.trim() || undefined,
      suggestedCorrectionText: formValues.suggestedCorrectionText?.trim() || undefined,
      timestamp: new Date().toISOString(),
    };

    console.log('Submitting feedback (mock):', payload);

    // ** ACTUAL API CALL COMMENTED OUT **
    /*
    this.feedbackService.submitQuestionFeedback(payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.submitSuccess = 'Segnalazione inviata con successo! Grazie.';
        setTimeout(() => {
          this.closeFeedbackModal();
          this.feedbackSubmitted.emit();
        }, 2000);
      },
      error: (err) => {
        this.isLoading = false;
        this.submitError = `Errore nell'invio della segnalazione: ${err.message || 'Si è verificato un errore.'}`;
        console.error('Error submitting feedback:', err);
      }
    });
    */

    // --- Mock API call for now ---
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
    this.isLoading = false;
    const success = Math.random() > 0.2; // 80% chance of success for demo
    if (success) {
      this.submitSuccess = 'Segnalazione inviata con successo! Grazie.';
      setTimeout(() => {
        this.closeFeedbackModal();
        this.feedbackSubmitted.emit();
      }, 2000);
    } else {
      this.submitError = 'Errore simulato nell\'invio della segnalazione. Riprova.';
    }
    // --- End Mock API call ---
  }
}