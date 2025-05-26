// src/app/pages/home/home.component.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core'; // Add OnDestroy
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings } from '../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  IconDefinition, faAdd, faHistory, faBarChart,
  faMagnifyingGlass, faStar, faRepeat, faExclamation, faUndo, faPlay, faQuestion, faLandmark, faPersonMilitaryRifle
} from '@fortawesome/free-solid-svg-icons'; // Added faUndo
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { SetupModalComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';
import { AlertService } from '../../services/alert.service';
import { SoundService } from '../../core/services/sound.service';
import { Question } from '../../models/question.model';
import { FormsModule } from '@angular/forms';
import { ContestSelectionService } from '../../core/services/contest-selection.service'; // Import the service
import { Subscription } from 'rxjs';
import { AppUser, AuthService } from '../../core/services/auth.service';
import { SpinnerService } from '../../core/services/spinner.service';
import { Contest } from '../../models/contes.model';

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
  authService = inject(AuthService);
  spinnerService = inject(SpinnerService);

  isStatsViewer: boolean = false; // Flag to check if the user is a stats viewer
  loggedInUser: AppUser | null = null;

  // --- General State ---
  isMusicPlaying: boolean = false;
  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';
  quizSettings: QuizSettings | undefined// Default settings, can be modified in the modal
  topics: GenericData[] = []; // For the setup modal, will be populated based on contest

  // --- Loading States ---
  isLoadingPageData = true; // Initial page load (contests, paused quiz)
  isLoadingContestSpecificData = false; // When a contest is selected and its data is loading
  isLoadingModalData = false; // When preparing data for the setup modal for a specific quiz type
  loadingButtonKey: string | null = null; // To show spinner on specific buttons


  isLoadingModal = false;
  loadingButtonIndex = -1;


  // --- Public Contest ---
  availablePublicContests: Contest[] = [];
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
  faPersonMilitaryRifle: IconDefinition = faPersonMilitaryRifle;
  faPlay: IconDefinition = faPlay;
  faQuestion: IconDefinition = faQuestion;
  faUndoAlt: IconDefinition = faUndo; // Icon for yesterday's review
  faLandmark: IconDefinition = faLandmark; // Icon for public contests

  // Keep track of the contestId this component is currently operating with
  private currentLocalContestId: Contest | null = null;

  isTimerEnabled: boolean = false;
  timerDurationSeconds: number = 0;
  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null { // Updated return type
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  ngOnInit(): void {
    this.isStatsViewer = this.authService.isStatsViewer();
    const currentUser = this.authService.getCurrentUserSnapshot();
    this.loggedInUser = currentUser && 'id' in currentUser ? (currentUser as AppUser) : null;

    console.log("Logged in user", this.loggedInUser);

    this.contestSubscription = this.contestSelectionService.selectedContest$.subscribe(newlySelectedContest => {
      console.log(`HomeComponent: ContestSelectionService emitted '${newlySelectedContest?.id}'. Current local is '${this.currentLocalContestId?.id}'`);
      if (this.currentLocalContestId !== newlySelectedContest) {
        console.log('HomeComponent: Detected a change. Calling onPublicContestSelected.');
        this.currentLocalContestId = newlySelectedContest; // Update local state *before* calling
        this.onPublicContestSelected(newlySelectedContest);
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
      // The contestSubscription will handle the initial call to onPublicContestSelected.
    } catch (error) {
      console.error("Error initializing homepage:", error);
      this.alertService.showAlert("Errore", "Impossibile caricare i dati iniziali della pagina.");
    } finally {
      this.isLoadingPageData = false;
    }
  }

  async onPublicContestSelected(contest: Contest | null): Promise<void> {
    console.log(`HomeComponent: onPublicContestSelected called with '${contest?.id}'. Current local before service call: '${this.currentLocalContestId?.id}'`);

    // currentLocalContestId is already updated by the subscription handler before this is called.
    // Ensure the service is updated ONLY IF it's not the source of this call
    if (this.contestSelectionService.getCurrentSelectedContest() !== contest) {
      console.log(`HomeComponent: onPublicContestSelected - Service out of sync. Updating service to '${contest?.id}'`);
      this.contestSelectionService.setSelectedContest(contest);
    }

    this.resetContestSpecificData();

    if (contest) {
      this.isLoadingContestSpecificData = true;
      this.loadingButtonKey = 'all_contest_data';
      try {
        await Promise.all([
          this.loadTodayProblematicQuestions(contest, this.getUserId()),
          this.loadYesterdayProblematicQuestions(contest, this.getUserId()),
          this.countNeverEncounteredQuestion(contest, this.getUserId()),
          this.checkForPausedQuiz()
        ]);
      } catch (error) {
        console.error(`Error loading data for contest ${contest.id}:`, error);
        this.alertService.showAlert("Errore", `Impossibile caricare i dati per il concorso: ${contest.name || 'N.D.'}. Si consiglia di provare a riselezionare la banca dati e ricaricare la pagina`);
      } finally {
        this.isLoadingContestSpecificData = false;
        this.loadingButtonKey = null;
      }
    } else {
      // If no contest is selected, ensure loading flags are reset.
      this.isLoadingContestSpecificData = false;
      this.loadingButtonKey = null;
    }
  }

  private resetContestSpecificData(): void {
    this.todayProblematicQuestionIds = [];
    this.yesterdayProblematicQuestionIds = [];
    this.neverEncounteredQuestionIds = [];
    this.neverEncounteredQuestionCount = 0; // Reset count as well
    this.topics = [];
  }

  async checkForPausedQuiz(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      return;
    }
    this.pausedQuiz = await this.dbService.getPausedQuiz(currentContest.id, this.authService.getCurrentUserId());
  }

  resumePausedQuiz(): void {
    if (this.pausedQuiz) {
      this.router.navigate(['/quiz/take'], { state: { quizParams: { resumeAttemptId: this.pausedQuiz.id } } });
    }
  }

  async loadYesterdayProblematicQuestions(contest: Contest | null, userId: number): Promise<void> {
    this.loadingButtonKey = 'yesterday_problematic';
    this.yesterdayProblematicQuestionIds = await this.dbService.getProblematicQuestionsIdsByDate('yesterday', contest?.id, userId);
    this.loadingButtonKey = null;
  }

  async loadTodayProblematicQuestions(contest: Contest | null, userId: number): Promise<void> {
    this.loadingButtonKey = 'today_problematic';
    this.todayProblematicQuestionIds = await this.dbService.getProblematicQuestionsIdsByDate('today', contest?.id, userId);
    this.loadingButtonKey = null;
  }

  private async prepareAndOpenModal(
    fetchQuestionsFn: () => Promise<Question[]>,
    quizSettings: QuizSettings,
    buttonKey: string,
    isSimulation: boolean = false
  ): Promise<void> {
    // The primary guard is the [disabled] state of buttons in the template.
    // This is a secondary check.
    if (buttonKey !== 'new_quiz_generic' && !isSimulation && !this.selectedPublicContest && quizSettings.quizTitle !== 'Riprendi il quiz precedente' && !quizSettings.quizTitle?.toLowerCase().includes('generale')) {
      this.alertService.showAlert("Attenzione", "Per favore, seleziona prima un concorso pubblico.");
      return;
    }

    this.loadingButtonKey = buttonKey;
    this.isLoadingModalData = true;
    let questionsForModal: Question[] = [];

    try {
      this.spinnerService.show(isSimulation ? "Recupero domande per il quiz simulato..." : "Recupero domande...");
      questionsForModal = await fetchQuestionsFn();
    } catch (error) {
      console.error(`Error fetching questions for modal (${quizSettings.quizTitle}):`, error);
      this.alertService.showAlert("Errore", `Impossibile recuperare le domande per: ${quizSettings.quizTitle}.`);
    } finally {
      this.spinnerService.hide();
      this.isLoadingModalData = false;
      this.loadingButtonKey = null;
    }

    if (questionsForModal.length > 0) {
      const topicsMap = new Map<string, { count: number, questionIds: string[] }>();
      questionsForModal.forEach(q => {
        const topic = q.topic || 'Senza Argomento';
        if (!topicsMap.has(topic)) {
          topicsMap.set(topic, { count: 0, questionIds: [] });
        }
        const topicData = topicsMap.get(topic)!;
        topicData.count++;
        topicData.questionIds.push(q.id);
      });
      this.topics = Array.from(topicsMap.entries()).map(([topicName, data]) => ({
        topic: topicName, count: data.count, questionIds: data.questionIds
      }));
      this.quizSetupModalTitle = `Quiz Concorso: ${this.selectedPublicContest?.name}`;
      this.openQuizSetupModal();
    } else {
      this.alertService.showAlert("Info", `Nessuna domanda trovata per il concorso selezionato: ${this.selectedPublicContest?.name}.`);
    }
    this.isLoadingModal = false;
    this.loadingButtonIndex = -1;
  }

  async countNeverEncounteredQuestion(contest: Contest | null, userId: number): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      return;
    }

    this.loadingButtonKey = 'never_encountered';
    // Assuming getNeverAnsweredQuestionCount takes contest ID (string|undefined)
    this.neverEncounteredQuestionCount = await this.dbService.getNeverAnsweredQuestionCount(currentContest.id, userId);
    this.loadingButtonKey = null;
  }

  startXDayProblematicQuiz(dateString: string | null): void {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      return;
    }


    if (!dateString) {
      this.alertService.showAlert("Attenzione", "Seleziona una data.");
      return;
    }

    let selectedDate: Date;
    let formattedDate: string;

    if (dateString === 'today') {
      selectedDate = new Date();
      formattedDate = this.datePipe.transform(selectedDate, 'dd/MM/yyyy') || 'Oggi';
    } else if (dateString === 'yesterday') {
      selectedDate = new Date();
      selectedDate.setDate(selectedDate.getDate() - 1);
      formattedDate = this.datePipe.transform(selectedDate, 'dd/MM/yyyy') || 'Ieri';
    }
    else {
      selectedDate = new Date(dateString);
      formattedDate = this.datePipe.transform(selectedDate, 'dd/MM/yyyy') || dateString;
    }

    this.quizSettings = {
      totalQuestionsInQuiz: 10, // Default value, can be adjusted
      selectedTopics: [],
      quizTitle: `Errori ${formattedDate} (${currentContest.name || 'Generale'})`,
      quizType: 'Revisione errori',
      publicContest: currentContest.id
    };

    this.prepareAndOpenModal(
      async () => {
        // selectedPublicContest is confirmed not null by the guard above
        const ids = await this.dbService.getProblematicQuestionsIdsByDate(selectedDate, this.selectedPublicContest!.id, this.getUserId());
        return this.dbService.getQuestionByIds(ids);
      },
      this.quizSettings,
      'x_day_problematic'
    );
  }

  async startNeverEncounteredQuiz(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      return;
    }

    this.quizSettings = {
      totalQuestionsInQuiz: 10, // Default value, can be adjusted
      selectedTopics: [],
      quizTitle: `Domande mai risposte (${this.selectedPublicContest?.name || 'Generale'})`,
      quizType: 'Domande mai risposte',
      publicContest: currentContest.id
    };

    // Button disabled if !selectedPublicContest
    if (!this.selectedPublicContest) { // Should not happen if button is properly disabled
      this.alertService.showAlert("Attenzione", "Seleziona un concorso.");
      return;
    }
    if (!this.neverEncounteredQuestionIds || this.neverEncounteredQuestionIds.length === 0) {
      this.spinnerService.show("Recupero Domande mai risposte...");
      await this.loadNeverEncounteredQuestions(); // This method now internally checks selectedPublicContest
      this.spinnerService.hide();
    }
    this.prepareAndOpenModal(
      () => this.dbService.getQuestionByIds(this.neverEncounteredQuestionIds),
      this.quizSettings,
      'never_encountered'
    );
  }

  startSimulationContestQuizNow(): void {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      return;
    }

    this.quizSettings = {
      totalQuestionsInQuiz: 10, // Default value, can be adjusted
      selectedTopics: [],
      quizTitle: `Esame (${currentContest.name || 'Generale'})`,
      quizType: 'Esame',
      publicContest: currentContest.id
    };

    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Attenzione", "Seleziona un concorso.");
      return;
    }
    this.isTimerEnabled = true;
    this.timerDurationSeconds = 5400;
    this.prepareAndOpenModal(
      () => this.dbService.getQuestionsByPublicContestForSimulation(this.selectedPublicContest!), // Assert non-null due to guard
      this.quizSettings,
      'public_contest_quiz',
      true
    );
  }

  async loadNeverEncounteredQuestions(): Promise<void> {
    if (!this.selectedPublicContest) {
      this.neverEncounteredQuestionIds = []; // Clear if no contest
      return;
    }
    this.neverEncounteredQuestionIds = await this.dbService.getNeverAnsweredQuestionIds(this.selectedPublicContest.id);
  }

  openQuizSetupModal(): void {
    this.isQuizSetupModalOpen = true;
  }

  closeQuizSetupModal(): void {
    this.isQuizSetupModalOpen = false;
    this.isLoadingModalData = false;
    this.loadingButtonKey = null;
  }

  handleQuizSetupSubmitted(quizConfig: Partial<QuizSettings> & { fixedQuestionIds?: string[] }): void {
    this.closeQuizSetupModal();
    const queryParams: any = {
      quizTitle: this.quizSettings?.quizTitle || 'Quiz',
      quizType: this.quizSettings?.quizType || 'Standard',
      totalQuestionsInQuiz: quizConfig.totalQuestionsInQuiz,
      topics: quizConfig.selectedTopics?.join(','),
      topicDistribution: quizConfig.topicDistribution ? JSON.stringify(quizConfig.topicDistribution) : undefined,
      fixedQuestionIds: quizConfig.fixedQuestionIds?.join(','),
      enableTimer: quizConfig.enableTimer ?? false,
      timerDurationSeconds: quizConfig.timerDurationSeconds ?? 0,
      enableStreakSounds: quizConfig.enableStreakSounds ?? false,
      publicContest: this.selectedPublicContest?.id // Use optional chaining for contest ID
    };
    Object.keys(queryParams).forEach(key => (queryParams[key] === undefined || queryParams[key] === null || queryParams[key] === '') && delete queryParams[key]);

    this.router.navigate(['/quiz/take'], { state: { quizParams: queryParams } });
  }

  previousTrackIndex: number | null = null;

  startMusic(index: number): void {
    const tracks = ['lazio', 'roma'];
    if (index < 0 || index >= tracks.length) return;

    if (this.isMusicPlaying) {
      if (this.previousTrackIndex !== index) {
        this.soundService.play(tracks[index]);
        this.previousTrackIndex = index;
      } else {
        this.soundService.setSoundsEnabled(false);
        this.isMusicPlaying = false;
        this.previousTrackIndex = null;
      }
      return;
    }
    this.soundService.setSoundsEnabled(true);
    this.soundService.play(tracks[index]);
    this.isMusicPlaying = true;
    this.previousTrackIndex = index;
  }

  async loadAvailablePublicContests(): Promise<void> {
    if (this.loggedInUser && this.loggedInUser.userId !== undefined) {
      this.availablePublicContests = await this.dbService.getAvailablePublicContests(this.loggedInUser.userId);

      if (this.selectedPublicContest && !this.availablePublicContests.find(contest => contest.id === this.selectedPublicContest?.id)) {
        this.contestSelectionService.setSelectedContest(null);
      }
    } else {
      this.availablePublicContests = [];
    }
  }

  async startPublicContestQuiz(): Promise<void> {
    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Attenzione", "Per favore, seleziona un concorso dall'elenco.");
      return;
    }

    this.loadingButtonIndex = 4; // Or a specific key for loadingButtonKey
    this.isLoadingModal = true; // Consider using isLoadingModalData for consistency
    let questionsForModal: Question[] = [];

    try {
      questionsForModal = await this.dbService.getQuestionsByPublicContest(this.selectedPublicContest.id); // ID is safe due to guard
    } catch (error) {
      console.error(`Error fetching questions for contest ${this.selectedPublicContest.name}:`, error);
      this.alertService.showAlert("Errore", `Impossibile recuperare le domande per il concorso: ${this.selectedPublicContest.name}.`);
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

  updateSelectedContestInService(contest: Contest | null): void {
    console.log(`HomeComponent: updateSelectedContestInService called with '${contest?.id}'. Current service value: '${this.contestSelectionService.getCurrentSelectedContest()?.id}'`);
    if (this.contestSelectionService.getCurrentSelectedContest() !== contest) {
      this.contestSelectionService.setSelectedContest(contest);
    }
    // The subscription to selectedContest$ will handle calling onPublicContestSelected.
  }

  ngOnDestroy(): void {
    if (this.contestSubscription) {
      this.contestSubscription.unsubscribe();
    }
  }

  compareWithFn(obj1: Contest | null, obj2: Contest | null): boolean { // Allow nulls
    if (obj1 === null && obj2 === null) return true; // Both null, consider them same for placeholder
    return obj1 && obj2 ? obj1.id === obj2.id : obj1 === obj2;
  }

  getUserId(): number {
    let userId = this.authService.getCurrentUserId();
    if (userId === 3) {
      userId = 2;
    }
    return userId;
  }
}
