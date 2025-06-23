// src/app/pages/quiz-history/quiz-history.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // DatePipe if using it in template
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import { FormsModule } from '@angular/forms'; // <-- IMPORT FormsModule for ngModel
import { debounceTime, Subscription } from 'rxjs';

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings, QuizType } from '../../models/quiz.model';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome, faTrashCan, faLandmark, faRepeat, faExclamation } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';
import { AlertButton } from '../../models/alert.model';
import { ContestSelectionService } from '../../core/services/contest-selection.service'; // Import ContestSelectionService
import { Contest } from '../../models/contest.model';
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
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private contestSelectionService = inject(ContestSelectionService);
  private authService = inject(AuthService);
  spinnerService = inject(SpinnerService);
  questionService = inject(QuestionService);

  homeIcon: IconDefinition = faHome;
  faDelete: IconDefinition = faTrashCan;
  faRepeat: IconDefinition = faRepeat;
  faExclamation: IconDefinition = faExclamation;
  faLandmark: IconDefinition = faLandmark;

  private subscriptions = new Subscription();

  quizAttempts: QuizAttempt[] = [];
  isLoading = true;
  errorLoading: string | null = null;

  // --- Filter Properties ---
  filterDateStart: string = '';
  filterID: string = '';
  filterDateEnd: string = '';
  filterMinPercentage: number | null = null;
  filterMaxPercentage: number | null = null;
  filterSelectedTopic: string = '';
  filterSelectedType: string = '';
  filterUser: number = -1;
  filterContest: number = -1;
  selectedContest: Contest | undefined = undefined;
  availableTopics: string[] = [];
  availableTypes: QuizType[] = ['Standard', 'Esame', 'Revisione errori', 'Domande mai risposte', 'Contest', 'Timed', 'Revisione errori globale'];

  availableUsers: User[] = [];
  availableContests: Contest[] = [];

  // --- Pagination State ---
  currentPage = 1;
  itemsPerPage = 10;
  totalAttempts = 0;

  get totalPages(): number {
    return Math.ceil(this.totalAttempts / this.itemsPerPage);
  }

  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  isStatsViewer: boolean = false;
  isAdmin: boolean = false;

  async getUsers(): Promise<void> {
    if (this.isAdmin) {
      this.availableUsers = await this.dbService.getAllUsers();
    }
  }

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.isStatsViewer = this.authService.isStatsViewer() || this.isAdmin;

    if (this.isAdmin) {
      this.getUsers();
    }

    const contestSub = this.contestSelectionService.selectedContest$.pipe(
      debounceTime(100) // Avoid rapid re-firing
    ).subscribe(async contest => {
      if (!contest) {
        this.alertService.showAlert("Info", "Non è stata selezionata alcuna Banca Dati: si verrà ora reindirizzati alla pagina principale").then(() => {
          this.router.navigate(['/home']);
        });
        return;
      }
      this.filterContest = contest.id;
      await this.loadInitialHistory();
    });
    this.subscriptions.add(contestSub);
  }

  async loadInitialHistory(): Promise<void> {
    this.spinnerService.show('Recupero storico in corso...');
    try {
      await this.loadPaginatedAttempts();
      await this.loadAvailableContests();
      // Load topics and types based on all attempts for the current context
      this.availableTopics = (await this.dbService.getAvailableTopics(this.filterContest)).map(t => t.topic);
      // this.availableTypes = (await this.dbService.getAvailableTopics(this.filterContest)).map(t => t.topic);
      // const allAttempts = await this.dbService.getAllQuizAttemptsByContest(this.filterContest, this.getUserId());
      // this.loadAvailableTopics(allAttempts);
      // this.loadAvailableTypes(allAttempts);
    } catch (error) {
      console.error('Error during initial history load:', error);
    } finally {
      this.spinnerService.hide();
    }
  }

  async loadPaginatedAttempts(page: number = 1): Promise<void> {
    this.currentPage = page;
    const offset = (this.currentPage - 1) * this.itemsPerPage;
    const userId = this.getUserId();

    const filters: { [key: string]: any } = {
      userId: this.filterUser >= 0 ? this.filterUser : userId,
      contestId: this.filterContest >= 0 ? this.filterContest : this.selectedPublicContest?.id,
      attemptType: this.filterSelectedType || undefined,
      id: this.filterID || undefined
    };

    // Clean up undefined filters
    Object.keys(filters).forEach(key => (filters[key] === undefined || filters[key] === '') && delete filters[key]);

    this.isLoading = true;
    try {
      const [total, attempts] = await Promise.all([
        this.dbService.countQuizAttempts(filters),
        this.dbService.getPaginatedQuizAttempts(filters, this.itemsPerPage, offset)
      ]);

      this.totalAttempts = total;
      // Client-side filtering for percentage as it requires calculation
      this.quizAttempts = this.applyClientSideFilters(attempts);

    } catch (error) {
      this.errorLoading = 'Failed to load paginated quiz history.';
      console.error(this.errorLoading, error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  applyClientSideFilters(attempts: QuizAttempt[]): QuizAttempt[] {
    let filtered = [...attempts];
    if (this.filterMinPercentage !== null) {
      filtered = filtered.filter(attempt => {
        const percentage = (this.getCorrectCountForAttempt(attempt) / (attempt?.totalQuestionsInQuiz ?? 1) * 100);
        return percentage >= this.filterMinPercentage!;
      });
    }
    if (this.filterMaxPercentage !== null) {
      filtered = filtered.filter(attempt => {
        const percentage = (this.getCorrectCountForAttempt(attempt) / (attempt?.totalQuestionsInQuiz ?? 1) * 100);
        return percentage <= this.filterMaxPercentage!;
      });
    }
    // Date filtering can also be done here if desired
    return filtered;
  }

  async applyFilters(): Promise<void> {
    await this.loadPaginatedAttempts(1); // Reset to page 1 on any filter change
  }

  async loadAvailableTopics(allAttempts: QuizAttempt[]): Promise<void> {
    const topicsFromAttempts = allAttempts
      .flatMap(attempt => attempt.settings.selectedTopics || [])
      .filter(topic => topic && topic.trim() !== '');
    this.availableTopics = [...new Set(topicsFromAttempts)].sort();
  }

  async loadAvailableContests(): Promise<void> {
    if (this.isAdmin) {
      try {
        this.availableContests = await this.dbService.getAllContests();
      } catch (error) { console.error('Error loading available contests:', error); }
    }
  }

  async loadAvailableTypes(allAttempts: QuizAttempt[]): Promise<void> {
    const typesFromAttemps = allAttempts
      .flatMap(attempt => (attempt.settings.quizType || attempt.quizType) || [])
      .filter(quizType => quizType && quizType.trim() !== '');
    this.availableTypes = [...new Set([...typesFromAttemps])].sort();
  }

  resetFilters(): void {
    this.filterDateStart = '';
    this.filterDateEnd = '';
    this.filterMinPercentage = null;
    this.filterMaxPercentage = null;
    this.filterSelectedTopic = '';
    this.filterSelectedType = '';
    this.filterID = '';
    if (this.isAdmin) {
      this.filterUser = -1;
      this.filterContest = this.selectedPublicContest?.id ?? -1;
    }
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadPaginatedAttempts(page);
    }
  }
  firstPage(): void { this.goToPage(1); }
  previousPage(): void { this.goToPage(this.currentPage - 1); }
  nextPage(): void { this.goToPage(this.currentPage + 1); }
  lastPage(): void { this.goToPage(this.totalPages); }

  async deleteAttempt(attemptId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.alertService.showConfirm('Conferma Eliminazione', 'Sei sicuro di voler eliminare questo tentativo?');
    if (confirmed && confirmed.role === 'confirm') {
      try {
        await this.dbService.deleteQuizAttempt(attemptId);
        this.alertService.showToast({ message: "Tentativo quiz eliminato con successo.", type: 'success' });
        // Reload current page
        if (this.quizAttempts.length === 1 && this.currentPage > 1) {
          this.goToPage(this.currentPage - 1);
        } else {
          this.loadPaginatedAttempts(this.currentPage);
        }
      } catch (error) {
        console.error('Error deleting quiz attempt:', error);
        this.alertService.showToast({ message: "Impossibile eliminare il tentativo del quiz. Riprova più tardi.", type: 'error' });
      }
    }
  }

  // --- Helper and existing methods ---
  getTopicsSummary(attempt: QuizAttempt): string {
    if (!attempt?.settings?.selectedTopics || attempt?.settings?.selectedTopics?.length === 0) {
      return this.selectedPublicContest ? `Tutti (Concorso: ${this.selectedPublicContest.name})` : 'Tutti gli argomenti';
    }
    const MAX_DISPLAY_TOPICS = 2;
    if (attempt?.settings?.selectedTopics.length > MAX_DISPLAY_TOPICS) {
      return attempt?.settings?.selectedTopics.slice(0, MAX_DISPLAY_TOPICS).join(', ') + ` e altri ${attempt?.settings?.selectedTopics.length - MAX_DISPLAY_TOPICS}`;
    }
    return attempt?.settings?.selectedTopics.join(', ');
  }
  getQuizType(quizAttempt: QuizAttempt): string {
    const quizSettings = quizAttempt.settings || {};
    if ((!quizSettings || !quizSettings.quizType) && (!quizAttempt || !quizAttempt.quizType)) {
      return '';
    }
    return quizSettings.quizType || quizAttempt.quizType || '';
  }
  getQuizTitle(quizAttempt: QuizAttempt): string {
    const quizSettings = quizAttempt.settings || {};
    const title = quizAttempt.quizTitle || quizSettings.quizTitle;
    return title ? ` | Titolo: ${title}` : '';
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
    return 'font-extrabold border rounded bg-green-300 dark:bg-green-500 dark:text-white border-green-500 px-1 mr-1';
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
    return 'completato';
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
      cssClass: 'bg-red-500 hover:bg-red-700 text-white',
      data: 'ok_confirmed'
    } as AlertButton];
    this.alertService.showConfirmationDialog(
      "Attenzione Massima!",
      `Sei SICURO di voler cancellare TUTTO lo storico dei quiz ${this.selectedPublicContest ? `per il concorso '${this.selectedPublicContest.name}'` : ''}? QUESTA AZIONE È IRREVERSIBILE.`,
      customBtns
    ).then(async result => {
      if (!result || result.role === 'cancel' || result.data !== 'ok_confirmed') { return; }
      try {
        await this.dbService.clearAllQuizAttempts(currentContest.id);
        this.quizAttempts = []; this.totalAttempts = 0;
        this.alertService.showToast({ message: `Storico quiz per '${this.selectedPublicContest?.name}' cancellato con successo.`, type: 'success' });
      } catch (error) {
        console.error('Error clearing quiz history:', error);
        this.alertService.showToast({ message: `Impossibile cancellare lo storico quiz. Riprova più tardi.`, type: 'error' });
      }
    });
  }
  viewResults(attemptId: string): void {
    const currentAttempt: QuizAttempt | undefined = this.quizAttempts.find(att => att.id === attemptId);
    if (currentAttempt && (currentAttempt.status === 'in-progress' || currentAttempt.status === 'in svolgimento') && !this.isStatsViewer && this.authService.getCurrentUserId() === currentAttempt.userId) {
      const customBtns: AlertButton[] = [{ text: 'Annulla', role: 'cancel' }, { text: 'Riprendi Quiz', role: 'confirm', data: 'ok_confirmed' }];
      this.alertService.showConfirmationDialog("Attenzione", "Il quiz selezionato risulta ancora non completato: vuoi riprenderlo?", customBtns).then(result => {
        if (result?.role === 'confirm') { this.resumeQuiz(currentAttempt); }
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
    return Number(quizAttempt.allQuestions.reduce((sum, q) => sum + (q.questionSnapshot.scoreIsCorrect || 0), 0).toFixed(2));
  }
  getCorrectCountForAttempt(quizAttempt: QuizAttempt): number {
    return quizAttempt.answeredQuestions.filter(q => q.isCorrect).length;
  }
  getWrongCountForAttempt(quizAttempt: QuizAttempt): number {
    return quizAttempt.answeredQuestions.filter(q => !q.isCorrect).length;
  }
  getSkipCountForAttempt(quizAttempt: QuizAttempt): number { return quizAttempt.unansweredQuestions.length; }
  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }
  getUserId(): number { return this.authService.getCurrentUserId()!; }
  resumeQuiz(originalAttempt: QuizAttempt): void { this.router.navigate(['/quiz/take'], { state: { quizParams: { resumeAttemptId: originalAttempt.id } } }); }
  async repeatQuiz(quizAttemptId: string): Promise<void> { await this.questionService.repeatQuiz(quizAttemptId); }
  async repeatWrongQuiz(quizAttemptId: string): Promise<void> { await this.questionService.repeatWrongQuiz(quizAttemptId); }
  calcDurataQuiz(quizAttempt: QuizAttempt): string { return this.dbService.calcDurataQuiz(quizAttempt); }
}
