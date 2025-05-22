// src/app/pages/quiz-history/quiz-history.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // DatePipe if using it in template
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import { FormsModule } from '@angular/forms'; // <-- IMPORT FormsModule for ngModel
import { Subscription } from 'rxjs';

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt } from '../../models/quiz.model';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome, faTrashCan, faLandmark } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';
import { AlertButton } from '../../models/alert.model';
import { ContestSelectionService } from '../../core/services/contest-selection.service'; // Import ContestSelectionService

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
  private route = inject(ActivatedRoute); // Inject ActivatedRoute
  private contestSelectionService = inject(ContestSelectionService); // Inject ContestSelectionService

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously
  faDelete: IconDefinition = faTrashCan; // This was already here, seems unused in the template you showed previously
  faLandmark: IconDefinition = faLandmark; // This was already here, seems unused in the template you showed previously

  private attemptsSub!: Subscription;

  private routeSub!: Subscription;
  private contestSub!: Subscription;

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

  // Getter to easily access the contest from the template
  get selectedPublicContest(): string {
    return this.contestSelectionService.getCurrentSelectedContest();
  }


  ngOnInit(): void {

    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Info", "Non è stata selezionata alcuna Banca Dati: si verrà ora rediretti alla pagina principale").then(() => {
        this.router.navigate(['/home']);
      })
    }

    this.routeSub = this.route.queryParamMap.subscribe(params => {
      const contestFromQuery = params.get('contest') || '';
      this.loadQuizHistory();
      this.loadAvailableTopics();
    });

    // Subscribe to changes from the service if not driven by query param
    this.contestSub = this.contestSelectionService.selectedContest$.subscribe(contestId => {
      // Only update if there's no contest in query param and the service value changes
      if (!this.route.snapshot.queryParamMap.has('contest') && this.selectedPublicContest !== contestId) {
        this.loadQuizHistory();
        this.loadAvailableTopics();
      }
    });
  }

  async loadQuizHistory(): Promise<void> {
    this.isLoading = true;
    this.errorLoading = null;
    try {
      // Pass currentContestId to filter attempts if a contest is selected
      this.allQuizAttempts = await this.dbService.getAllQuizAttemptsByContest(this.selectedPublicContest);
      this.applyFilters();
    } catch (error) {
      console.error('Error loading quiz history:', error);
      this.errorLoading = 'Failed to load quiz history.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges(); // Ensure view updates if loading was quick
    }
  }

  async loadAvailableTopics(): Promise<void> {
    try {
      // Filter questions by contest before extracting topics
      const questions = await this.dbService.getAllQuestions(this.selectedPublicContest);
      const topicsFromQuestions = new Set(questions.map(q => q.topic).filter(t => !!t) as string[]);

      const topicsFromAttempts = this.allQuizAttempts // allQuizAttempts is already contest-filtered
        .flatMap(attempt => attempt.settings.selectedTopics || [])
        .filter(topic => topic && topic.trim() !== '');

      this.availableTopics = [...new Set([...topicsFromQuestions, ...topicsFromAttempts])].sort();
    } catch (error) {
      console.error('Error loading available topics:', error);
      this.availableTopics = [];
    }
  }

  applyFilters(): void {
    let filtered = [...this.allQuizAttempts]; // allQuizAttempts is now pre-filtered by contest if one is active

    // 1. Filter by Date Range
    if (this.filterDateStart) {
      const startDate = new Date(this.filterDateStart);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(attempt => {
        const attemptDate = new Date(attempt.timestampEnd || attempt.timestampStart);
        return attemptDate >= startDate;
      });
    }
    if (this.filterDateEnd) {
      const endDate = new Date(this.filterDateEnd);
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
        attempt.settings.selectedTopics?.includes(this.filterSelectedTopic)
      );
    }

    this.quizAttempts = filtered.sort((a, b) =>
      new Date(b.timestampEnd || b.timestampStart).getTime() - new Date(a.timestampEnd || a.timestampStart).getTime()
    );
    this.cdr.detectChanges();
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
      // If a contest is selected and no specific topics, it implies all topics of that contest
      return this.selectedPublicContest ? `Tutti (Concorso: ${this.selectedPublicContest})` : 'Tutti gli argomenti';
    }
    const MAX_DISPLAY_TOPICS = 2;
    if (topics.length > MAX_DISPLAY_TOPICS) {
      return topics.slice(0, MAX_DISPLAY_TOPICS).join(', ') + ` e altri ${topics.length - MAX_DISPLAY_TOPICS}`;
    }
    return topics.join(', ');
  }

  async deleteAttempt(attemptId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    // ... (rest of the method is fine)
    const confirmed = await this.alertService.showConfirmationDialog('Conferma Eliminazione', 'Sei sicuro di voler eliminare questo tentativo?');
    if (confirmed && confirmed.role !== 'cancel') {
      try {
        await this.dbService.deleteQuizAttempt(attemptId);
        this.allQuizAttempts = this.allQuizAttempts.filter(attempt => attempt.id !== attemptId);
        this.applyFilters(); // Re-apply filters to update displayed list
        this.alertService.showAlert("Info", "Tentativo quiz eliminato con successo.");
      } catch (error) {
        console.error('Error deleting quiz attempt:', error);
        this.alertService.showAlert("Errore", "Impossibile eliminare il tentativo del quiz. Riprova più tardi.");
      }
    }
  }

  async clearAllHistory(): Promise<void> {
    const customBtns: AlertButton[] = [{
      text: 'Annulla',
      role: 'cancel',
      cssClass: 'bg-gray-300 hover:bg-gray-500'
    } as AlertButton,
    {
      text: 'CANCELLA TUTTO',
      role: 'confirm',
      cssClass: 'bg-red-500 hover:bg-red-700 text-white', // Make delete more prominent
      data: 'ok_confirmed'
    } as AlertButton];

    this.alertService.showConfirmationDialog(
      "Attenzione Massima!",
      `Sei SICURO di voler cancellare TUTTO lo storico dei quiz ${this.selectedPublicContest ? `per il concorso '${this.selectedPublicContest}'` : ''}? QUESTA AZIONE È IRREVERSIBILE.`,
      customBtns
    ).then(async result => {
      if (!result || result.role === 'cancel' || result.data !== 'ok_confirmed') {
        return;
      }
      try {
        // Pass currentContestId to clear history only for that contest
        await this.dbService.clearAllQuizAttempts(this.selectedPublicContest);
        this.allQuizAttempts = []; // Or reload: await this.loadQuizHistory();
        this.quizAttempts = [];
        this.applyFilters();
        this.alertService.showAlert("Info", `Storico quiz ${this.selectedPublicContest ? `per '${this.selectedPublicContest}'` : ''} cancellato con successo.`);
      } catch (error) {
        console.error('Error clearing quiz history:', error);
        this.alertService.showAlert("Errore", `Impossibile cancellare lo storico quiz. Riprova più tardi.`);
      }
    });
  }

  viewResults(attemptId: string): void {
    this.router.navigate(['/quiz/results', attemptId]);
  }


  getResultClass(attempt: QuizAttempt): string {
    // ... (rest of the method is fine)
    let classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-200'; // Added hover effect and sm:items-center

    const totQuestions = attempt.totalQuestionsInQuiz || 1; // Use totalQuestionsInQuiz from attempt
    const score = attempt.score || 0;
    const resultsPercentage = (score / totQuestions) * 100;


    if (resultsPercentage >= 75) {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-green-100 dark:bg-green-900 shadow-md rounded-lg border border-green-300 dark:border-green-700 hover:shadow-lg transition-shadow duration-200';
    } else if (resultsPercentage >= 50 && resultsPercentage < 75) {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-yellow-100 dark:bg-yellow-900 shadow-md rounded-lg border border-yellow-300 dark:border-yellow-700 hover:shadow-lg transition-shadow duration-200';
    } else if (resultsPercentage >= 25 && resultsPercentage < 50) {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-orange-100 dark:bg-orange-900 shadow-md rounded-lg border border-orange-300 dark:border-orange-700 hover:shadow-lg transition-shadow duration-200';
    } else {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-red-100 dark:bg-red-900 shadow-md rounded-lg border border-red-300 dark:border-red-700 hover:shadow-lg transition-shadow duration-200';
    }
    return classes;
  }

  getMaxResultForAttempt(quizAttempt: QuizAttempt): number {
    return Number(quizAttempt.allQuestions.reduce((sum, q) => sum + (q.questionSnapshot.scoreIsCorrect || 0) * 1, 0).toFixed(2));
  }

  getCorrectCountForAttempt(quizAttempt: QuizAttempt): number {
    return quizAttempt.answeredQuestions.reduce((sum, q) => sum + (q.isCorrect ? 1 : 0), 0);
  }

  getWrongCountForAttempt(quizAttempt: QuizAttempt): number {
    return quizAttempt.answeredQuestions.reduce((sum, q) => sum + (!q.isCorrect ? 1 : 0), 0);
  }

  getSkipCountForAttempt(quizAttempt: QuizAttempt): number {
    return quizAttempt.unansweredQuestions.length;
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    if (this.contestSub) {
      this.contestSub.unsubscribe();
    }
    // if (this.attemptsSub) { // attemptsSub was declared but not used
    //   this.attemptsSub.unsubscribe();
    // }
  }
}