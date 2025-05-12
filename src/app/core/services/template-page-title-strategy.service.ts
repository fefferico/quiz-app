import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface FeedbackPayload {
  questionId: string;
  isMarkedIncorrect: boolean;
  reasonText?: string;
  suggestedCorrectionText?: string;
  timestamp: string;
  // userId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private apiUrl = '/api/question-feedback'; // Your backend API endpoint

  constructor(private http: HttpClient) { }

  submitQuestionFeedback(feedbackData: FeedbackPayload): Observable<any> {
    return this.http.post<any>(this.apiUrl, feedbackData)
      .pipe(
        catchError(this.handleError)
      );
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Si è verificato un errore sconosciuto!';
    if (error.error instanceof ErrorEvent) {
      // Client-side errors
      errorMessage = `Errore: ${error.error.message}`;
    } else {
      // Server-side errors
      errorMessage = `Codice Errore: ${error.status}\nMessaggio: ${error.message}`;
      if (error.error && error.error.message) {
        errorMessage += ` - Dettagli: ${error.error.message}`;
      }
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}