// src/app/pages/quiz-history/quiz-history.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // DatePipe if using it in template
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms'; // <-- IMPORT FormsModule for ngModel
import { Subscription } from 'rxjs';

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt } from '../../models/quiz.model';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faExclamation, faRepeat, faHome } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';
import { AlertButton } from '../../models/alert.model';

@Component({
  selector: 'app-quiz-history',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DatePipe, FontAwesomeModule], // <-- ADD FormsModule
  templateUrl: './quiz-history.component.html',
  styleUrls: ['./quiz-history.component.scss']
})
export class QuizHistoryComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private dbService = inject(DatabaseService);
  private alertService = inject(AlertService);
  private cdr = inject(ChangeDetectorRef); // For triggering change detection if needed

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously

  private attemptsSub!: Subscription;
  allQuizAttempts: QuizAttempt[] = []; // Store all attempts fetched from DB
  quizAttempts: QuizAttempt[] = [];   // Attempts displayed after filtering

  isLoading = true;
  errorLoading: string | null = null;

  // --- Filter Properties ---
  filterDateStart: string = ''; // ISO date string e.g., "2023-01-01"
  filterDateEnd: string = '';   // ISO date string
  filterMinPercentage: number | null = null;
  filterMaxPercentage: number | null = null;
  filterSelectedTopic: string = ''; // Selected topic for filtering
  availableTopics: string[] = [];   // To populate topic dropdown
  // --- End Filter Properties ---

  ngOnInit(): void {
    this.loadQuizHistory();
    this.loadAvailableTopics();
  }

  async loadQuizHistory(): Promise<void> {
    this.isLoading = true;
    this.errorLoading = null;
    try {
      this.allQuizAttempts = await this.dbService.getAllQuizAttempts();
      this.applyFilters(); // Apply initial (empty) filters
    } catch (error) {
      console.error('Error loading quiz history:', error);
      this.errorLoading = 'Failed to load quiz history.';
    } finally {
      this.isLoading = false;
    }
  }

  async loadAvailableTopics(): Promise<void> {
    try {
      // Assuming dbService has a method to get all unique topics from questions or attempts
      // This is a placeholder; implement according to your DatabaseService
      const questions = await this.dbService.getAllQuestions();
      const topicsFromQuestions = new Set(questions.map(q => q.topic)); // Example method
      const topicsFromAttempts = this.allQuizAttempts
        .flatMap(attempt => attempt.settings.selectedTopics || [])
        .filter(topic => topic && topic.trim() !== '');

      this.availableTopics = [...new Set([...topicsFromQuestions, ...topicsFromAttempts])].sort();
    } catch (error) {
      console.error('Error loading available topics:', error);
      // Handle error, maybe set availableTopics to an empty array or show a message
    }
  }

  applyFilters(): void {
    let filtered = [...this.allQuizAttempts];

    // 1. Filter by Date Range
    if (this.filterDateStart) {
      const startDate = new Date(this.filterDateStart);
      // To include the whole start day, set time to 00:00:00
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(attempt => {
        const attemptDate = new Date(attempt.timestampEnd || attempt.timestampStart);
        return attemptDate >= startDate;
      });
    }
    if (this.filterDateEnd) {
      const endDate = new Date(this.filterDateEnd);
      // To include the whole end day, set time to 23:59:59
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(attempt => {
        const attemptDate = new Date(attempt.timestampEnd || attempt.timestampStart);
        return attemptDate <= endDate;
      });
    }

    // 2. Filter by Min Percentage
    if (this.filterMinPercentage !== null && this.filterMinPercentage >= 0 && this.filterMinPercentage <= 100) {
      filtered = filtered.filter(attempt => {
        const percentage = ((attempt.score || 0) / (attempt.totalQuestionsInQuiz || 1)) * 100;
        return percentage >= this.filterMinPercentage!;
      });
    }

    // 3. Filter by Max Percentage
    if (this.filterMaxPercentage !== null && this.filterMaxPercentage >= 0 && this.filterMaxPercentage <= 100) {
      filtered = filtered.filter(attempt => {
        const percentage = ((attempt.score || 0) / (attempt.totalQuestionsInQuiz || 1)) * 100;
        return percentage <= this.filterMaxPercentage!;
      });
    }

    // 4. Filter by Topic
    if (this.filterSelectedTopic && this.filterSelectedTopic !== '') {
      filtered = filtered.filter(attempt =>
        attempt.settings.selectedTopics?.includes(this.filterSelectedTopic) ||
        (this.filterSelectedTopic === 'All Topics' && (attempt.settings.selectedTopics || []).length === 0) // Crude way to handle "All Topics" if it was an explicit choice
        // A better way for "All Topics" might be if selectedTopics is empty or a specific flag
      );
    }

    this.quizAttempts = filtered.sort((a, b) =>
      new Date(b.timestampEnd || b.timestampStart).getTime() - new Date(a.timestampEnd || a.timestampStart).getTime()
    ); // Sort by most recent
    this.cdr.detectChanges(); // Manually trigger change detection if needed
  }

  resetFilters(): void {
    this.filterDateStart = '';
    this.filterDateEnd = '';
    this.filterMinPercentage = null;
    this.filterMaxPercentage = null;
    this.filterSelectedTopic = '';
    this.applyFilters();
  }

  // --- Helper and existing methods ---
  getTopicsSummary(topics: string[] | undefined): string {
    if (!topics || topics.length === 0) {
      return 'Tutti gli argomenti';
    }
    const MAX_DISPLAY_TOPICS = 2;
    if (topics.length > MAX_DISPLAY_TOPICS) {
      return topics.slice(0, MAX_DISPLAY_TOPICS).join(', ') + ` e altri ${topics.length - MAX_DISPLAY_TOPICS}`;
    }
    return topics.join(', ');
  }

  async deleteAttempt(attemptId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation(); // Prevent navigation
    if (confirm('Sei sicuro di voler eliminare questo tentativo?')) {
      try {
        await this.dbService.deleteQuizAttempt(attemptId);
        this.allQuizAttempts = this.allQuizAttempts.filter(attempt => attempt.id !== attemptId);
        this.applyFilters(); // Re-apply filters to update displayed list
      } catch (error) {
        console.error('Error deleting quiz attempt:', error);
        this.alertService.showAlert("Attenzione", "E' stato riscontrato un errore durante la rimozione del tentativo del quiz. Riprova più tardi.");
      }
    }
  }

  async clearAllHistory(): Promise<void> {
    const customBtns: AlertButton[] = [{
      text: 'Annulla',
      role: 'cancel',
      cssClass: 'bg-gray-500 hover:bg-gray-600' // Example custom class
    } as AlertButton,
    {
      text: 'CANCELLA',
      role: 'confirm',
      data: 'ok_confirmed'
    } as AlertButton];
    this.alertService.showConfirmationDialog("Attenzione", "Sei SICURO di voler cancellare TUTTO lo storico dei quiz? QUESTA AZIONE È IRREVERSIBILE.", customBtns).then(result => {
      if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
        return;
      }
      try {
        this.dbService.clearAllQuizAttempts().catch(err => {
          console.error('Error clearing quiz history:', err);
          this.alertService.showAlert("Attenzione", "E' stato riscontrato un errore durante la cancellazione dello Storico. Riprovare più tardi");
        }).then(res => {
          this.allQuizAttempts = [];
          this.quizAttempts = [];
          this.alertService.showAlert("Info", "Storico quiz cancellato.");
        }); // You'll need to implement this in DatabaseService

      } catch (error) {
        console.error('Error clearing quiz history:', error);
        this.alertService.showAlert("Attenzione", "E' stato riscontrato un errore durante la cancellazione dello Storico. Riprovare più tardi");
      }
    });
  }

  viewResults(attemptId: string): void {
    this.router.navigate(['/quiz/results', attemptId]);
  }

  
  getResultClass(attempt: QuizAttempt): string {

    let classes = 'mb-6 p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700';

    const totQuestions = attempt.allQuestions.length || 1;
    const resultsPercentage = attempt.answeredQuestions.reduce((sum, tc) => sum + Number((tc.isCorrect ? 1 : 0) || 0), 0)/totQuestions*100;

    if (resultsPercentage >= 75){
      classes = 'mb-6 p-4 bg-green-100 dark:bg-green-800 shadow-md rounded-lg border border-green-200 dark:border-green-700';
    } else if (resultsPercentage >= 50 && resultsPercentage < 75) {
      classes = 'mb-6 p-4 bg-yellow-100 dark:bg-yellow-800 shadow-md rounded-lg border border-yellow-200 dark:border-yellow-700';
    } else if (resultsPercentage >= 25 && resultsPercentage < 50) {
      classes = 'mb-6 p-4 bg-orange-100 dark:bg-orange-800 shadow-md rounded-lg border border-orange-200 dark:border-orange-700';
    } else {
      classes = 'mb-6 p-4 bg-red-100 dark:bg-red-800 shadow-md rounded-lg border border-red-200 dark:border-red-700';
    }
    return classes;
  }

  ngOnDestroy(): void {
    if (this.attemptsSub) {
      this.attemptsSub.unsubscribe();
    }
  }
}