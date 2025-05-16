// src/app/pages/home/home.component.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core'; // Add OnDestroy
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings } from '../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  IconDefinition, faAdd, faHistory, faBarChart,
  faMagnifyingGlass, faStar, faRepeat, faExclamation, faUndo, faPlay, faQuestion, faLandmark, faGavel
} from '@fortawesome/free-solid-svg-icons'; // Added faUndo
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { SetupModalComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';
import { AlertService } from '../../services/alert.service';
import { SoundService } from '../../core/services/sound.service';
import { Question } from '../../models/question.model';
import { FormsModule } from '@angular/forms';
import { ContestSelectionService } from '../../core/services/contest-selection.service'; // Import the service
import { Subscription } from 'rxjs'; // Import Subscription

@Component({
  selector: 'app-home',
  providers: [DatePipe],
  standalone: true,
  imports: [CommonModule, RouterLink, SimpleModalComponent,
    SetupModalComponent, FontAwesomeModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy { // Implement OnDestroy
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private soundService = inject(SoundService);
  private datePipe = inject(DatePipe); // Inject DatePipe
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service
  private contestSubscription!: Subscription; // For unsubscribing

  // --- General State ---
  isMusicPlaying: boolean = false;
  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';
  topics: GenericData[] = []; // For the setup modal, will be populated based on contest

  // --- Loading States ---
  isLoadingPageData = true; // Initial page load (contests, paused quiz)
  isLoadingContestSpecificData = false; // When a contest is selected and its data is loading
  isLoadingModalData = false; // When preparing data for the setup modal for a specific quiz type
  loadingButtonKey: string | null = null; // To show spinner on specific buttons


  isLoadingModal = false;
  loadingButtonIndex = -1;


  // --- Public Contest ---
  availablePublicContests: string[] = [];
  // selectedPublicContest: string | null = null;

  isLoadingContests = false;

  // --- Quiz Types Data (scoped by selectedPublicContest) ---
  pausedQuiz: QuizAttempt | undefined;
  yesterdayProblematicQuestionIds: string[] = [];
  todayProblematicQuestionIds: string[] = [];
  neverEncounteredQuestionIds: string[] = [];
  neverEncounteredQuestionCount: number = 0;
  selectedXDayDate: string | null = null;


  // icons
  faAdd: IconDefinition = faAdd;
  faHistory: IconDefinition = faHistory;
  faBarChart: IconDefinition = faBarChart;
  faMagnifyingGlass: IconDefinition = faMagnifyingGlass;
  faStar: IconDefinition = faStar;
  faRepeat: IconDefinition = faRepeat;
  faExclamation: IconDefinition = faExclamation;
  faPlay: IconDefinition = faPlay;
  faQuestion: IconDefinition = faQuestion;
  faUndoAlt: IconDefinition = faUndo; // Icon for yesterday's review
  faLandmark: IconDefinition = faLandmark; // Icon for public contests

  // Keep track of the contestId this component is currently operating with
  private currentLocalContestId: string | null = null;

  // Getter to easily access the contest from the template
  get selectedPublicContest(): string {
    return this.contestSelectionService.getCurrentSelectedContest() || '';
  }

  ngOnInit(): void {
    this.contestSubscription = this.contestSelectionService.selectedContest$.subscribe(newlySelectedContestId => {
      console.log(`HomeComponent: ContestSelectionService emitted '${newlySelectedContestId}'. Current local is '${this.currentLocalContestId}'`);

      // Only proceed if the contest ID has actually changed from the component's perspective
      // or if the component hasn't initialized its contest-specific data yet (currentLocalContestId is null and newlySelectedContestId is not)
      if (this.currentLocalContestId !== newlySelectedContestId) {
        console.log('HomeComponent: Detected a change. Calling onPublicContestSelected.');
        // Update the local state *before* calling onPublicContestSelected
        // to prevent onPublicContestSelected from causing another emission that re-enters here.
        this.currentLocalContestId = newlySelectedContestId;
        this.onPublicContestSelected(newlySelectedContestId);
      } else {
        console.log('HomeComponent: No actual change in contest ID for this component or already processed. Skipping full reload.');
      }
    });

    this.initializeHomepage();
    this.selectedXDayDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
  }

  async initializeHomepage(): Promise<void> {
    this.isLoadingPageData = true;
    try {
      await this.loadAvailablePublicContests();
      await this.checkForPausedQuiz();

      // The subscription will handle the initial call to onPublicContestSelected
      // if there's a contest pre-selected in the service.
      // We set currentLocalContestId based on the service *before* the subscription might fire for the initial value.
      // This ensures the first emission from the service (if it's the same as currentLocalContestId)
      // doesn't cause an unnecessary reload if onPublicContestSelected was already called.

      const initialContestFromService = this.contestSelectionService.getCurrentSelectedContest();
      console.log('HomeComponent Initialize: Initial contest from service:', initialContestFromService);

      // If there's an initial contest and it hasn't been set locally yet,
      // set it and potentially trigger data load.
      // This handles the case where the subscription might fire *after* initializeHomepage has set up some state.
      if (initialContestFromService && this.currentLocalContestId !== initialContestFromService) {
        this.currentLocalContestId = initialContestFromService; // Sync local state
        // No need to call onPublicContestSelected here, the subscription will handle it.
        // Or, if you want to ensure it loads if the subscription fires late:
        // await this.onPublicContestSelected(initialContestFromService);
      } else if (!initialContestFromService && this.currentLocalContestId !== null) {
        // Handle case where service has null but component thought a contest was selected
        this.currentLocalContestId = null;
        this.onPublicContestSelected(null); // Reset data
      }


    } catch (error) {
      console.error("Error initializing homepage:", error);
      this.alertService.showAlert("Errore", "Impossibile caricare i dati iniziali della pagina.");
    }
    finally { this.isLoadingPageData = false; }
  }

  async onPublicContestSelected(contestIdentifier: string | null): Promise<void> {
    console.log(`HomeComponent: onPublicContestSelected called with '${contestIdentifier}'. Current local before service call: '${this.currentLocalContestId}'`);

    // Critical: Update the component's internal state FIRST if it's different.
    // The subscription should ideally handle setting currentLocalContestId *before* calling this.
    // However, if this method is called directly (e.g. by updateSelectedContestInService),
    // ensure local state is consistent.
    if (this.currentLocalContestId !== contestIdentifier) {
      this.currentLocalContestId = contestIdentifier;
    }

    // Ensure the service is updated ONLY IF it's not the source of this call
    // (i.e., if the service's current value is different from contestIdentifier).
    // This prevents the service from re-emitting if this method was called due to a service emission.
    if (this.contestSelectionService.getCurrentSelectedContest() !== contestIdentifier) {
      console.log(`HomeComponent: onPublicContestSelected - Service out of sync. Updating service to '${contestIdentifier}'`);
      this.contestSelectionService.setSelectedContest(contestIdentifier);
    }


    this.resetContestSpecificData();
    if (contestIdentifier) {
      this.isLoadingContestSpecificData = true;
      this.loadingButtonKey = 'all_contest_data';
      try {
        await Promise.all([
          this.loadTodayProblematicQuestions(contestIdentifier),
          this.loadYesterdayProblematicQuestions(contestIdentifier),
          this.countNeverEncounteredQuestion(contestIdentifier)
        ]);
      } catch (error) {
        console.error(`Error loading data for contest ${contestIdentifier}:`, error);
        this.alertService.showAlert("Errore", `Impossibile caricare i dati per il concorso: ${contestIdentifier}`);
      }
      finally {
        this.isLoadingContestSpecificData = false;
        this.loadingButtonKey = null;
      }
    }
  }


  private resetContestSpecificData(): void {
    this.todayProblematicQuestionIds = [];
    this.yesterdayProblematicQuestionIds = [];
    this.neverEncounteredQuestionIds = [];
    this.topics = []; // Clear topics for modal
    // Don't clear selectedXDayDate here, user might want to use it with the new contest
  }


  async checkForPausedQuiz(): Promise<void> {
    this.pausedQuiz = await this.dbService.getPausedQuiz();
  }

  resumePausedQuiz(): void {
    if (this.pausedQuiz) {
      this.router.navigate(['/quiz/take'], { queryParams: { resumeAttemptId: this.pausedQuiz.id } });
    }
  }

  async loadYesterdayProblematicQuestions(contestId: string | null): Promise<void> {
    this.loadingButtonKey = 'yesterday_problematic';
    this.yesterdayProblematicQuestionIds = await this.dbService.getProblematicQuestionsIdsByDate('yesterday', contestId);
    this.loadingButtonKey = null;
  }

  // --- Modified Data Loading Methods to accept contestId ---
  async loadTodayProblematicQuestions(contestId: string | null): Promise<void> {
    this.loadingButtonKey = 'today_problematic';
    this.todayProblematicQuestionIds = await this.dbService.getProblematicQuestionsIdsByDate('today', contestId);
    this.loadingButtonKey = null;
  }

  private async prepareAndOpenModal(
    fetchQuestionsFn: () => Promise<Question[]>,
    modalTitle: string,
    buttonKey: string
  ): Promise<void> {
    if (!this.selectedPublicContest && modalTitle !== 'Riprendi il quiz precedente' && modalTitle !== 'Nuovo Quiz Generico') {
      // Allow "Nuovo Quiz" to proceed without a contest, but it will show all topics.
      // Or, you might want to disable "Nuovo Quiz" too until a contest is selected.
      // For now, let's assume "Nuovo Quiz" button will be handled specially or also disabled.
      if (buttonKey !== 'new_quiz_generic') { // Special key for general new quiz
        this.alertService.showAlert("Attenzione", "Per favore, seleziona prima un concorso pubblico.");
        return;
      }
    }

    this.loadingButtonKey = buttonKey;
    this.isLoadingModalData = true;
    let questionsForModal: Question[] = [];

    try {
      questionsForModal = await fetchQuestionsFn();
    } catch (error) {
      console.error(`Error fetching questions for modal (${modalTitle}):`, error);
      this.alertService.showAlert("Errore", `Impossibile recuperare le domande per: ${modalTitle}.`);
    } finally {
      this.isLoadingModalData = false;
      this.loadingButtonKey = null;
    }

    if (questionsForModal.length > 0) {
      const topicsMap = new Map<string, { count: number, questionIds: string[] }>();
      questionsForModal.forEach(q => {
        const topic = q.topic || 'Senza Argomento';
        if (!topicsMap.has(topic)) { topicsMap.set(topic, { count: 0, questionIds: [] }); }
        const topicData = topicsMap.get(topic)!;
        topicData.count++;
        topicData.questionIds.push(q.id);
      });
      this.topics = Array.from(topicsMap.entries()).map(([topicName, data]) => ({
        topic: topicName, count: data.count, questionIds: data.questionIds
      }));
      this.quizSetupModalTitle = modalTitle;
      this.openQuizSetupModal();
    } else {
      this.alertService.showAlert("Info", `Nessuna domanda trovata per: ${modalTitle}.`);
    }
  }

  async countNeverEncounteredQuestion(contestId: string | null): Promise<void> {
    this.loadingButtonKey = 'never_encountered';
    this.neverEncounteredQuestionCount = await this.dbService.getNeverAnsweredQuestionCount(contestId);
    this.loadingButtonKey = null;
  }



  startXDayProblematicQuiz(dateString: string | null): void {
    if (!dateString) { this.alertService.showAlert("Attenzione", "Seleziona una data."); return; }
    const selectedDate = new Date(dateString);
    selectedDate.setMinutes(selectedDate.getMinutes() + selectedDate.getTimezoneOffset());
    const formattedDate = this.datePipe.transform(selectedDate, 'dd/MM/yyyy') || dateString;

    this.prepareAndOpenModal(
      async () => {
        const ids = await this.dbService.getProblematicQuestionsIdsByDate(selectedDate, this.selectedPublicContest);
        return this.dbService.getQuestionByIds(ids);
      },
      `Errori del ${formattedDate} (${this.selectedPublicContest || 'Generale'})`,
      'x_day_problematic'
    );
  }

  startYesterdayProblematicQuiz(): void {
    this.prepareAndOpenModal(
      () => this.dbService.getQuestionByIds(this.yesterdayProblematicQuestionIds),
      `Errori di IERI (${this.selectedPublicContest || 'Generale'})`,
      'yesterday_problematic'
    );
  }

  startTodayProblematicQuiz(): void {
    this.prepareAndOpenModal(
      () => this.dbService.getQuestionByIds(this.todayProblematicQuestionIds),
      `Errori di OGGI (${this.selectedPublicContest || 'Generale'})`,
      'today_problematic'
    );
  }

  startNeverEncounteredQuiz(): void {
    if (!this.neverEncounteredQuestionIds || this.neverEncounteredQuestionIds.length === 0){
      this.loadNeverEncounteredQuestions();
    }
    this.prepareAndOpenModal(
      () => this.dbService.getQuestionByIds(this.neverEncounteredQuestionIds),
      `Domande Mai Viste (${this.selectedPublicContest || 'Generale'})`,
      'never_encountered'
    );
  }

  startPublicContestQuizNow(): void { // Renamed to avoid conflict with previous onSelect which reloads data
    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Attenzione", "Seleziona un concorso.");
      return;
    }
    this.prepareAndOpenModal(
      () => this.dbService.getQuestionsByPublicContest(this.selectedPublicContest!), // Assert non-null
      `Quiz Concorso: ${this.selectedPublicContest}`,
      'public_contest_quiz'
    );
  }

  async loadNeverEncounteredQuestions(): Promise<void> {
    this.neverEncounteredQuestionIds = await this.dbService.getNeverAnsweredQuestionIds(this.selectedPublicContest);
  }

  openQuizSetupModal(): void { this.isQuizSetupModalOpen = true; }
  closeQuizSetupModal(): void {
    this.isQuizSetupModalOpen = false;
    this.isLoadingModalData = false;
    this.loadingButtonKey = null;
  }

  handleQuizSetupSubmitted(quizConfig: Partial<QuizSettings> & { fixedQuestionIds?: string[] }): void {
    this.closeQuizSetupModal();
    const queryParams: any = {
      quizTitle: this.quizSetupModalTitle || 'Quiz',
      numQuestions: quizConfig.numQuestions,
      topics: quizConfig.selectedTopics?.join(','),
      topicDistribution: quizConfig.topicDistribution ? JSON.stringify(quizConfig.topicDistribution) : undefined,
      fixedQuestionIds: quizConfig.fixedQuestionIds?.join(','),
      enableTimer: quizConfig.enableTimer ?? false,
      timerDuration: quizConfig.timerDurationSeconds ?? 0,
      enableStreakSounds: quizConfig.enableStreakSounds ?? false,
      // Pass selected contest if this quiz is derived from one
      publicContest: this.selectedPublicContest && this.quizSetupModalTitle.includes(this.selectedPublicContest)
        ? this.selectedPublicContest
        : undefined
    };
    Object.keys(queryParams).forEach(key => (queryParams[key] === undefined || queryParams[key] === '') && delete queryParams[key]);
    this.router.navigate(['/quiz/take'], { queryParams });
  }

  previousTrackIndex: number | null = null;

  startMusic(index: number): void {
    // index = 0 : Lazio, index = 1 : Roma
    const tracks = ['lazio', 'roma'];
    if (index < 0 || index >= tracks.length) return;

    // If music is playing and a different track is selected, switch tracks
    if (this.isMusicPlaying) {
      if (this.previousTrackIndex !== index) {
        this.soundService.play(tracks[index]);
        this.previousTrackIndex = index;
        return;
      } else {
        // Same track: stop music
        this.soundService.setSoundsEnabled(false);
        this.isMusicPlaying = false;
        this.previousTrackIndex = null;
        return;
      }
    }

    // Start music
    this.soundService.setSoundsEnabled(true);
    this.soundService.play(tracks[index]);
    this.isMusicPlaying = true;
    this.previousTrackIndex = index;
  }

  async loadAvailablePublicContests(): Promise<void> {
    // isLoadingContests flag can be part of isLoadingPageData or separate
    this.availablePublicContests = await this.dbService.getAvailablePublicContests();
  }

  async startPublicContestQuiz(): Promise<void> {
    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Attenzione", "Per favore, seleziona un concorso dall'elenco.");
      return;
    }

    this.loadingButtonIndex = 4; // Assign a unique index for this button's loading state
    this.isLoadingModal = true;
    let questionsForModal: Question[] = [];

    try {
      questionsForModal = await this.dbService.getQuestionsByPublicContest(this.selectedPublicContest);
    } catch (error) {
      console.error(`Error fetching questions for contest ${this.selectedPublicContest}:`, error);
      this.alertService.showAlert("Errore", `Impossibile recuperare le domande per il concorso: ${this.selectedPublicContest}.`);
      this.isLoadingModal = false;
      this.loadingButtonIndex = -1;
      return;
    }

    if (questionsForModal.length > 0) {
      const topicsMap = new Map<string, { count: number, questionIds: string[] }>();
      questionsForModal.forEach(q => {
        const topic = q.topic || 'Senza Argomento'; // Default topic if undefined
        if (!topicsMap.has(topic)) {
          topicsMap.set(topic, { count: 0, questionIds: [] });
        }
        const topicData = topicsMap.get(topic)!;
        topicData.count++;
        topicData.questionIds.push(q.id);
      });

      this.topics = Array.from(topicsMap.entries()).map(([topicName, data]) => ({
        topic: topicName,
        count: data.count,
        questionIds: data.questionIds
      }));

      this.quizSetupModalTitle = `Quiz Concorso: ${this.selectedPublicContest}`;
      this.openQuizSetupModal();
    } else {
      this.alertService.showAlert("Info", `Nessuna domanda trovata per il concorso selezionato: ${this.selectedPublicContest}.`);
    }
    this.isLoadingModal = false;
    this.loadingButtonIndex = -1;
  }

  updateSelectedContestInService(contestId: string | null): void {
    // This method is called from the template's (ngModelChange)
    // It should primarily just update the service. The subscription will handle the rest.
    console.log(`HomeComponent: updateSelectedContestInService called with '${contestId}'. Current service value: '${this.contestSelectionService.getCurrentSelectedContest()}'`);
    if (this.contestSelectionService.getCurrentSelectedContest() !== contestId) {
      this.contestSelectionService.setSelectedContest(contestId);
    }
    // DO NOT call onPublicContestSelected directly here. Let the subscription do its job.
  }

  // Make sure to unsubscribe
  ngOnDestroy(): void {
    if (this.contestSubscription) {
      this.contestSubscription.unsubscribe();
    }
  }
}