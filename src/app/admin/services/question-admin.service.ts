import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// Re-using or defining a similar Question interface
export interface Question {
  id: string; // Or number, depending on your backend
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  // Potentially: timesCorrect, timesIncorrect, isFavorite could be managed by backend
}

@Injectable({
  providedIn: 'root'
})
export class QuestionAdminService {
  private apiUrl = '/api/admin/questions'; // Example API base URL

  constructor(private http: HttpClient) { }

  // GET all questions (with potential pagination/filtering later)
  getQuestions(topic?: string): Observable<Question[]> {
    let params = new HttpParams();
    if (topic) {
      params = params.set('topic', topic);
    }
    return this.http.get<Question[]>(this.apiUrl, { params })
      .pipe(catchError(this.handleError));
  }

  // GET a single question by ID
  getQuestionById(id: string | number): Observable<Question> {
    return this.http.get<Question>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  // POST - Create a new question
  createQuestion(question: Omit<Question, 'id'>): Observable<Question> {
    return this.http.post<Question>(this.apiUrl, question)
      .pipe(catchError(this.handleError));
  }

  // PUT - Update an existing question
  updateQuestion(id: string | number, question: Partial<Question>): Observable<Question> {
    return this.http.put<Question>(`${this.apiUrl}/${id}`, question)
      .pipe(catchError(this.handleError));
  }

  // DELETE - Delete a question
  deleteQuestion(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  // Utility to get available topics (could be from backend or a static list)
  getTopics(): Observable<string[]> {
    // For now, a mock. Ideally, this comes from your backend or a config file.
    return new Observable(observer => {
      observer.next(['CULTURA GENERALE', 'ITALIANO - Grammatica', 'MATEMATICA', 'INFORMATICA', 'STORIA', 'INGLESE']);
      observer.complete();
    });
    // return this.http.get<string[]>(`/api/topics`).pipe(catchError(this.handleError));
  }


  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Si è verificato un errore sconosciuto durante l\'operazione sulle domande!';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Errore client-side: ${error.error.message}`;
    } else {
      errorMessage = `Codice Errore server: ${error.status}\nMessaggio: ${error.message}`;
      if (error.error && typeof error.error === 'string') {
        errorMessage += ` - Dettagli: ${error.error}`;
      } else if (error.error && error.error.message) {
        errorMessage += ` - Dettagli: ${error.error.message}`;
      }
    }
    console.error(errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}