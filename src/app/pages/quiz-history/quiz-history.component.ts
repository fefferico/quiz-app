// src/app/pages/quiz-history/quiz-history.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // DatePipe if using it in template
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import { FormsModule } from '@angular/forms'; // <-- IMPORT FormsModule for ngModel
import { Subscription } from 'rxjs';

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings } from '../../models/quiz.model';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome, faTrashCan, faLandmark, faRepeat, faExclamation } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';
import { AlertButton } from '../../models/alert.model';
import { ContestSelectionService } from '../../core/services/contest-selection.service'; // Import ContestSelectionService
import { Contest } from '../../models/contes.model';
import { AuthService } from '../../core/services/auth.service';
import { SpinnerService } from '../../core/services/spinner.service';
import { QuestionService } from '../../core/services/question-service.service';
import { User } from '../../models/user.model';

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
  private authService = inject(AuthService);
  spinnerService = inject(SpinnerService);
  questionService = inject(QuestionService);

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously
  faDelete: IconDefinition = faTrashCan; // This was already here, seems unused in the template you showed previously
  faRepeat: IconDefinition = faRepeat; // This was already here, seems unused in the template you showed previously
  faExclamation: IconDefinition = faExclamation; // This was already here, seems unused in the template you showed previously
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
  filterSelectedType: string = '';
  filterUser: number = -1;
  availableTopics: string[] = [];   // To populate topic dropdown
  availableTypes: string[] = [];
  availableUsers: User[] = [];
  // --- End Filter Properties ---

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  isStatsViewer: boolean = false; // Flag to check if the user is a stats viewer
  isAdmin: boolean = false;

  async getUsers(): Promise<void> {
    this.availableUsers = await this.dbService.getAllUsers();
  }
  ngOnInit(): void {
    this.isStatsViewer = this.authService.isStatsViewer();
    this.isAdmin = this.authService.isAdmin();
    this.getUsers();

    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Info", "Non è stata selezionata alcuna Banca Dati: si verrà ora rediretti alla pagina principale").then(() => {
        this.router.navigate(['/home']);
      })
    }

    this.routeSub = this.route.queryParamMap.subscribe(async params => {
      const contestFromQuery = params.get('contest') || '';
      this.spinnerService.show('Recupero storico in corso...');
      await this.loadQuizHistory();
      this.spinnerService.hide();
      this.loadAvailableTopics();
      this.loadAvailableTypes();
    });

    // Subscribe to changes from the service if not driven by query param
    this.contestSub = this.contestSelectionService.selectedContest$.subscribe(async contestId => {
      // Only update if there's no contest in query param and the service value changes
      if (!this.route.snapshot.queryParamMap.has('contest') && this.selectedPublicContest !== contestId) {
        this.spinnerService.show('Recupero storico in corso...');
        await this.loadQuizHistory();
        this.spinnerService.hide();
        this.loadAvailableTopics();
        this.loadAvailableTypes();
      }
    });
  }

  async loadQuizHistory(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    this.isLoading = true;
    this.errorLoading = null;
    try {
      // Pass currentContestId to filter attempts if a contest is selected
      this.allQuizAttempts = await this.dbService.getAllQuizAttemptsByContest(currentContest.id, this.getUserId());
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
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    try {
      // Filter questions by contest before extracting topics
      const questions = await this.dbService.getAllQuestions(currentContest.id);
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

  async loadAvailableTypes(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    try {
      const typesFromAttemps = this.allQuizAttempts // allQuizAttempts is already contest-filtered
        .flatMap(attempt => (attempt.settings.quizType || attempt.quizType) || [])
        .filter(quizType => quizType && quizType.trim() !== '');

      this.availableTypes = [...new Set([...typesFromAttemps])].sort();
    } catch (error) {
      console.error('Error loading available types:', error);
      this.availableTypes = [];
    }
  }

  async applyFilters(): Promise<void> {
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
        const percentage = (this.getCorrectCountForAttempt(attempt) / (attempt?.totalQuestionsInQuiz ?? 1) * 100);
        return percentage >= this.filterMinPercentage!;
      });
    }

    // 3. Filter by Max Percentage
    if (this.filterMaxPercentage !== null && this.filterMaxPercentage >= 0 && this.filterMaxPercentage <= 100) {
      filtered = filtered.filter(attempt => {
        const percentage = (this.getCorrectCountForAttempt(attempt) / (attempt?.totalQuestionsInQuiz ?? 1) * 100);
        return percentage <= this.filterMaxPercentage!;
      });
    }

    // 4. Filter by Topic
    if (this.filterSelectedTopic && this.filterSelectedTopic !== '') {
      filtered = filtered.filter(attempt =>
        attempt.settings.selectedTopics?.includes(this.filterSelectedTopic)
      );
    }

    // 5. Filter by Type
    if (this.filterSelectedType && this.filterSelectedType !== '') {
      filtered = filtered.filter(attempt =>
        attempt.settings.quizType?.includes(this.filterSelectedType) || attempt.quizType?.includes(this.filterSelectedType)
      );
    }

        // 6. Filter by User
    if (this.filterUser && this.filterUser !== undefined && this.filterUser >= 0) {
      const currentContest = this.contestSelectionService.checkForContest();
      if (currentContest === null) {
        this.router.navigate(['/home']);
        return;
      }

      this.spinnerService.show("Recupero quiz per l'utente "+ this.availableUsers.find(user=>user.id == this.filterUser)?.displayName);
      this.allQuizAttempts = await this.dbService.getAllQuizAttemptsByContest(currentContest.id, this.filterUser);
      this.spinnerService.hide();
      filtered = [...this.allQuizAttempts];
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
    this.filterSelectedType = '';
    this.applyFilters();
  }

  // --- Helper and existing methods ---
  getTopicsSummary(topics: string[] | undefined): string {
    if (!topics || topics.length === 0) {
      // If a contest is selected and no specific topics, it implies all topics of that contest
      return this.selectedPublicContest ? `Tutti (Concorso: ${this.selectedPublicContest.name})` : 'Tutti gli argomenti';
    }
    const MAX_DISPLAY_TOPICS = 2;
    if (topics.length > MAX_DISPLAY_TOPICS) {
      return topics.slice(0, MAX_DISPLAY_TOPICS).join(', ') + ` e altri ${topics.length - MAX_DISPLAY_TOPICS}`;
    }
    return topics.join(', ');
  }

  getQuizType(quizAttempt: QuizAttempt): string {
    const quizSettings = quizAttempt.settings || {};
    if ((!quizSettings || !quizSettings.quizType) && (!quizAttempt || !quizAttempt.quizType)) {
      return '';
    }

    return quizSettings && quizSettings.quizType !== undefined ? (quizAttempt.quizType ?? '') : '';
  }

  getQuizTitle(quizAttempt: QuizAttempt): string {
    const quizSettings = quizAttempt.settings || {};
    if ((!quizSettings || !quizSettings.quizTitle) && (!quizAttempt || !quizAttempt.quizTitle)) {
      return '';
    }

    return quizSettings.quizType || quizAttempt.quizTitle ? ' | Titolo: ' + quizAttempt.quizTitle : ' | Titolo: ' + quizAttempt.quizTitle;
  }

  getStatusLabelColor(attempt: QuizAttempt): string {
    if (attempt.status === 'in-progress' || attempt.status === 'in svolgimento') {
      return 'font-extrabold border rounded bg-indigo-300 dark:bg-indigo-500 dark:text-white border-indigo-500 px-1 mr-1';
    }
    if (attempt.status === 'paused' || attempt.status === 'in pausa') {
      return 'font-extrabold border rounded bg-yellow-300 dark:bg-yellow-500 dark:text-white border-yellow-500 px-1 mr-1';
    }
    if (attempt.status === 'timed-out' || attempt.status === 'tempo scaduto') {
      return 'font-extrabold border rounded bg-red-300 dark:bg-red-500 dark:text-white border-red-500 px-1 mr-1';
    }
    return 'font-extrabold border rounded bg-green-300 dark:bg-green-500 dark:text-white border-green-500 px-1 mr-1'; // Default to completed
  }

  getStatusLabelText(attempt: QuizAttempt): string {
    if (attempt.status === 'in-progress' || attempt.status === 'in svolgimento') {
      return 'in svolgimento';
    }
    if (attempt.status === 'paused' || attempt.status === 'in pausa') {
      return 'in pausa';
    }
    if (attempt.status === 'timed-out' || attempt.status === 'tempo scaduto') {
      return 'tempo scaduto';
    }
    return 'completato'; // Default to completed

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
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }


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
        await this.dbService.clearAllQuizAttempts(currentContest.id);
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
    const currentAttempt: QuizAttempt | undefined = this.allQuizAttempts.find(att => att.id === attemptId);
    if (currentAttempt && (currentAttempt.status === 'in-progress' || currentAttempt.status === 'in svolgimento') && !this.isStatsViewer && this.authService.getCurrentUserId() === currentAttempt.userId) {

      const customBtns: AlertButton[] = [{
        text: 'Annulla',
        role: 'cancel',
        cssClass: 'bg-gray-300 hover:bg-gray-500'
      } as AlertButton,
      {
        text: 'Riprendi Quiz',
        role: 'confirm',
        cssClass: 'bg-indigo-500 hover:bg-indigo-700 text-white', // Make delete more prominent
        data: 'ok_confirmed'
      } as AlertButton];

      this.alertService.showConfirmationDialog("Attenzione", "Il quiz selezionato risulta ancora non completato: vuoi riprenderlo?", customBtns).then(result => {
        if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
          return false;
        }
        this.resumeQuiz(currentAttempt);
        return true;
      })
    } else {
      this.router.navigate(['/quiz/results', attemptId]);
    }
  }


  getResultClass(attempt: QuizAttempt): string {
    // ... (rest of the method is fine)
    let classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-200'; // Added hover effect and sm:items-center

    const totQuestions = attempt.totalQuestionsInQuiz || 1; // Use totalQuestionsInQuiz from attempt
    const score = attempt.score || 0;
    const resultsPercentage = (score / this.getMaxResultForAttempt(attempt)) * 100;


    if (resultsPercentage >= 75) {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-green-100 dark:bg-green-900 shadow-md rounded-lg border border-4 border-green-300 dark:border-green-700 hover:shadow-lg hover:bg-green-300 dark:hover:bg-green-700 transition-shadow duration-200 text-gray-700';
    } else if (resultsPercentage >= 50 && resultsPercentage < 75) {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-yellow-100 dark:bg-yellow-900 shadow-md rounded-lg border border-4 border-yellow-300 dark:border-yellow-700 hover:shadow-lg hover:bg-yellow-300 dark:hover:bg-yellow-700 transition-shadow duration-200 text-gray-700';
    } else if (resultsPercentage >= 25 && resultsPercentage < 50) {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-orange-100 dark:bg-orange-900 shadow-md rounded-lg border border-4 border-orange-300 dark:border-orange-700 hover:shadow-lg hover:bg-orange-300 dark:hover:bg-orange-700 transition-shadow duration-200 text-gray-700';
    } else {
      classes = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-red-100 dark:bg-red-900 shadow-md rounded-lg border border-4 border-red-300 dark:border-red-700 hover:shadow-lg hover:bg-red-300 dark:hover:bg-red-700 transition-shadow duration-200 text-gray-700';
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

  getUserId(): number {
    let userId = this.authService.getCurrentUserId();
    if (userId === 3) {
      userId = 2;
    }
    return userId;
  }

  resumeQuiz(originalAttempt: QuizAttempt): void {
    this.router.navigate(['/quiz/take'], { state: { quizParams: { resumeAttemptId: originalAttempt.id } } });
  }

  async repeatQuiz(quizAttemptId: string): Promise<void> { // Make async if dbService calls are async
    await this.questionService.repeatQuiz(quizAttemptId);
  }

  async repeatWrongQuiz(quizAttemptId: string): Promise<void> { // Make async
    await this.questionService.repeatWrongQuiz(quizAttemptId);
  }
}
