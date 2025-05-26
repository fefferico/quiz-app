// src/app/features/quiz/quiz-taking/quiz-taking.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  HostListener,
  Renderer2,
  ElementRef,
  ChangeDetectorRef,
  NgZone
} from '@angular/core'; // Added NgZone
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, timer, Observable, Subject } from 'rxjs';
import { map, takeWhile, finalize, takeUntil } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard';
import { QuestionFeedbackComponent } from '../../../question-feedback/question-feedback.component';

import { DatabaseService } from '../../../core/services/database.service';
import { Question } from '../../../models/question.model';
import { QuizSettings, AnsweredQuestion, QuizAttempt, TopicCount, QuizStatus, QuestionSnapshotInfo, QuizType } from '../../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
// IMPORT faCog for the new button
import {
  IconDefinition,
  faArrowLeft,
  faArrowRight,
  faCircleCheck,
  faCircleExclamation,
  faHome,
  faPause,
  faMusic,
  faVolumeMute,
  faCog,
  faVolumeUp
} from '@fortawesome/free-solid-svg-icons'; // Added faCog
import { AlertService } from '../../../services/alert.service';
import { AlertButton } from '../../../models/alert.model';
import { SoundService } from '../../../core/services/sound.service';
import { GenericData } from '../../../models/statistics.model';
import { ContestSelectionService } from '../../../core/services/contest-selection.service';
import { Spinner } from '@angular-devkit/build-angular/src/utils/spinner';
import { SpinnerService } from '../../../core/services/spinner.service';
import { Contest } from '../../../models/contes.model';
import { AuthService } from '../../../core/services/auth.service';

// Enum for answer states for styling
enum AnswerState {
  UNANSWERED = 'unanswered',
  CORRECT = 'correct',
  INCORRECT = 'incorrect'
}

// Define available font families
interface FontOption {
  name: string; // User-friendly name
  cssClass: string; // CSS class to apply
  styleValue?: string; // For direct [ngStyle] if preferred for font-family
}

@Component({
  selector: 'app-quiz-taking',
  standalone: true,
  imports: [CommonModule, RouterLink, QuestionFeedbackComponent, FontAwesomeModule],
  templateUrl: './quiz-taking.component.html',
  styleUrls: ['./quiz-taking.component.scss']
})
export class QuizTakingComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dbService = inject(DatabaseService);
  private alertService = inject(AlertService);
  private renderer = inject(Renderer2);
  private el = inject(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone); // Inject NgZone
  private soundService = inject(SoundService);
  private contestSelectionService = inject(ContestSelectionService); // Inject ContestSelectionService
  spinnerService = inject(SpinnerService);
  authService = inject(AuthService);

  private navigationState: any; // Added to store navigation state

  private soundIsPlaying: boolean = false;

  faSoundOn = faMusic;
  faSoundOff = faVolumeMute;
  faCog = faCog; // Make faCog available to the template
  faVolumeUp = faVolumeUp; // Icon for Reading Mode ON

  // --- NEW: Sound and Streak Properties ---
  quizSpecificSoundsEnabled = false; // Determined by quiz settings
  private currentCorrectStreak = 0;
  readonly STREAK_THRESHOLDS = [3, 5, 10]; // Example: Play sound at 3, 5, 10 correct in a row
  readonly STREAK_SOUND_KEYS = ['streak1', 'streak2', 'streak3']; // Corresponding sound keys
  // --- END NEW ---

  neverEncounteredQuestions: Question[] = [];
  neverEncounteredQuestionIds: string[] = []; // NEW: Store IDs for never encountered

  topics: GenericData[] = [];

  private routeSub!: Subscription;
  private destroy$ = new Subject<void>();

  // -- icons
  segnala: IconDefinition = faCircleExclamation;
  home: IconDefinition = faHome;
  done: IconDefinition = faCircleCheck;
  next: IconDefinition = faArrowRight;
  back: IconDefinition = faArrowLeft;
  pause: IconDefinition = faPause;

  // --- Accessibility Font Settings ---
  fontSizeStep: number = 1;
  readonly minFontSizeStep = 0.8;
  readonly maxFontSizeStep = 1.8;
  readonly fontSizeIncrement = 0.1;

  availableFonts: FontOption[] = [
    { name: 'Predefinito', cssClass: 'font-default' },
    { name: 'OpenDyslexic', cssClass: 'font-opendyslexic', styleValue: "'OpenDyslexic', sans-serif" },
    { name: 'Verdana', cssClass: 'font-verdana', styleValue: "Verdana, sans-serif" },
    { name: 'Arial', cssClass: 'font-arial', styleValue: "Arial, sans-serif" },
  ];
  currentFontIndex: number = 0;
  currentFont: FontOption = this.availableFonts[0];
  // --- End Accessibility Font Settings ---

  // --- NEW: Property for Accessibility Controls Visibility ---
  showAccessibilityControls: boolean = false; // Default to false (hidden)
  // --- END NEW ---

  // --- Reading Mode (TTS) Properties ---
  isReadingModeEnabled: boolean = false;
  private synth!: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null; // Tracks the globally active utterance
  isCurrentlySpeaking: boolean = false;
  private speakQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  private readonly OPTION_VOICE_DELAY_MS = 400;

  // Store preferred voices for different languages
  private preferredItalianVoice: SpeechSynthesisVoice | null = null;
  private preferredEnglishVoice: SpeechSynthesisVoice | null = null;
  // --- END NEW ---

  // --- NEW: Voice Selection Properties ---
  availableVoices: SpeechSynthesisVoice[] = [];
  selectedVoice: SpeechSynthesisVoice | null = null;
  public voiceSelectionAvailable: boolean = false; // To show/hide voice selector in UI
  // --- END NEW ---

  // Timer related properties
  isTimerEnabled = false;
  isCronometerEnabled = false;
  timerDurationSeconds = 0;
  timeLeft$: Observable<number> | undefined;
  timeElapsed$: Observable<number> | undefined;
  private timerSubscription: Subscription | undefined;
  private cronometerSubscription: Subscription | undefined;
  protected _timeLeftSeconds = 0;
  protected _timeElapsedSeconds = 0;

  quizIsOverByTime = false;

  quizSettings!: QuizSettings & { keywords?: string[] };
  questions: Question[] = [];
  currentQuestionIndex = 0;
  quizTitle = 'Quiz';
  quizType: QuizType = 'Standard';
  currentQuestion: Question | undefined;
  userAnswers: AnsweredQuestion[] = [];
  unansweredQuestions: (AnsweredQuestion | undefined)[] = [];

  selectedAnswerIndex: number | null = null;
  isAnswerSubmitted = false;
  answerStates: AnswerState[] = [];
  AnswerStateEnum = AnswerState;

  quizStartTime!: Date;
  quizCompleted = false;

  isLoading = true;
  isSavingAttempt = false;
  errorLoading = '';

  currentQuizAttemptId: string | null = null;
  isResuming = false;
  quizStatus: QuizStatus = 'in-progress';

  private autoAdvanceTimeout: any;
  highlightedOptionIndex: number | null = null; // For keyboard navigation

  // --- HostListeners for Keyboard Navigation ---
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.quizIsOverByTime || this.quizCompleted || !this.currentQuestion || this.isLoading) {
      return;
    }

    // Prevent default for keys we handle to avoid page scroll, etc.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', '1', '2', '3', '4', '5'].includes(event.key)) {
      event.preventDefault();
    }

    // If an answer is already submitted for the current question, only allow navigation
    if (this.isAnswerSubmitted) {
      if (event.key === 'ArrowRight') this.nextQuestion();
      if (event.key === 'ArrowLeft' && this.currentQuestionIndex > 0) this.previousQuestion();
      return; // Other keys are ignored after submission
    }

    switch (event.key) {
      case 'ArrowRight':
        this.nextQuestion();
        break;
      case 'ArrowLeft':
        if (this.currentQuestionIndex > 0) {
          this.previousQuestion();
        }
        break;
      case 'ArrowDown':
        this.navigateOptions(1);
        break;
      case 'ArrowUp':
        this.navigateOptions(-1);
        break;
      case ' ': // Space bar
        if (this.highlightedOptionIndex !== null) {
          this.selectAnswer(this.highlightedOptionIndex);
          this.handleAutoAdvance();
        }
        break;
      case 'Enter': // Often used for selection as well
        if (this.highlightedOptionIndex !== null) {
          this.selectAnswer(this.highlightedOptionIndex);
          this.handleAutoAdvance();
        }
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
        const optionIndex = parseInt(event.key, 10) - 1;
        if (this.currentQuestion && optionIndex >= 0 && optionIndex < this.currentQuestion.options.length) {
          this.selectAnswer(optionIndex);
          this.handleAutoAdvance();
        }
        break;
    }
  }

  private navigateOptions(direction: 1 | -1): void {
    if (!this.currentQuestion || this.currentQuestion.options.length === 0) return;

    const numOptions = this.currentQuestion.options.length;
    if (this.highlightedOptionIndex === null) {
      this.highlightedOptionIndex = direction === 1 ? 0 : numOptions - 1;
    } else {
      this.highlightedOptionIndex = (this.highlightedOptionIndex + direction + numOptions) % numOptions;
    }
    this.cdr.detectChanges(); // Ensure highlight updates
  }


  constructor() {
    // Access navigation state in the constructor
    const currentNavigation = this.router.getCurrentNavigation();
    this.navigationState = currentNavigation?.extras.state;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
      this.synth.onvoiceschanged = () => {
        this.loadAvailableVoices();
      };
    } else {
      console.warn('SpeechSynthesis API not available. Reading mode will be disabled.');
    }
  }

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  forceExit: boolean = false;
  hideCorrectAnswer: boolean = false;


  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });

    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    this.loadAvailableVoices(); // Attempt to load voices initially

    this.quizStartTime = new Date();
    this.loadAccessibilityPreferences();

    this.routeSub = this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(async queryOnlyParams => { // Renamed to avoid confusion
        // Use the stored navigationState first, then fallback to queryParams
        const actualParams = this.navigationState?.['quizParams'] || queryOnlyParams;

        const resumeAttemptId = actualParams['resumeAttemptId'];
        const randomQuestions = actualParams['randomQuestions'];
        this.hideCorrectAnswer = actualParams['hideCorrectAnswer'];
        let fixedQuestionIds: string[] = [];

        // check if it's an array or a string
        if (actualParams['fixedQuestionIds']) {
          if (Array.isArray(actualParams['fixedQuestionIds'])) {
            fixedQuestionIds = actualParams['fixedQuestionIds'];
          } else if (typeof actualParams['fixedQuestionIds'] === 'string') {
            fixedQuestionIds = actualParams['fixedQuestionIds'].split(',').map((id: string) => id.trim()).filter(Boolean);
          }
        }
        this.quizTitle = actualParams['quizTitle'] || 'Quiz';
        this.quizType = actualParams['quizType'] || 'Standard';

        this.quizSpecificSoundsEnabled = actualParams['enableStreakSounds'] === 'true';
        if (this.synth) {
          this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled && !this.isReadingModeEnabled);
        } else {
          this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled);
          this.isReadingModeEnabled = false; // Force disable if synth not available
        }

        if (resumeAttemptId) {
          this.isResuming = true;
          this.currentQuizAttemptId = resumeAttemptId;
          await this.loadPausedQuiz(resumeAttemptId);
        } else {
          this.isResuming = false;
          this.currentQuizAttemptId = uuidv4();
          this.quizStatus = 'in-progress';

          const publicContest = actualParams['publicContest'] ? actualParams['publicContest'] : '';
          const hideCorrectAnswer = actualParams['hideCorrectAnswer'] ? actualParams['hideCorrectAnswer'] : false;
          const totalQuestionsInQuiz = actualParams['totalQuestionsInQuiz'] ? +actualParams['totalQuestionsInQuiz'] : 10;
          const topicsParam = actualParams['topics'] || '';
          const selectedTopics = topicsParam ? topicsParam.split(',').filter((t: any) => t) : [];
          const quizTitle = actualParams['quizTitle'] || '';
          const quizType = actualParams['quizType'] || '';

          const keywordsParam = actualParams['keywords'] || '';
          let selectedKeywords: string[] = [];
          if (keywordsParam) {
            if (Array.isArray(keywordsParam)) {
              selectedKeywords = keywordsParam.filter((kw: any) => kw);
            } else if (typeof keywordsParam === 'string') {
              selectedKeywords = keywordsParam.split(',').map((kw: string) => kw.trim()).filter((kw: string) => kw);
            }
          }

          const topicDistributionParam = actualParams['topicDistribution'] || '';
          let selectedTopicDistribution: TopicCount[] | undefined = undefined;
          if (topicDistributionParam) {
            try {
              selectedTopicDistribution = JSON.parse(topicDistributionParam);
            } catch (e) {
              console.error('Error parsing topicDistribution:', e);
            }
          }

          this.isTimerEnabled = actualParams['enableTimer'] == true || actualParams['enableTimer'] === 'true';
          this.isCronometerEnabled = actualParams['enableCronometer'] === 'true';
          this.timerDurationSeconds = actualParams['timerDurationSeconds'] ? +actualParams['timerDurationSeconds'] : 0;
          this._timeLeftSeconds = this.timerDurationSeconds;

          this.quizSettings = {
            publicContest,
            hideCorrectAnswer,
            totalQuestionsInQuiz,
            selectedTopics,
            quizTitle,
            quizType,
            keywords: selectedKeywords,
            topicDistribution: selectedTopicDistribution,
            enableTimer: this.isTimerEnabled,
            enableCronometer: this.isCronometerEnabled,
            timerDurationSeconds: this.timerDurationSeconds,
            questionIDs: fixedQuestionIds
          };
          if (fixedQuestionIds && fixedQuestionIds.length > 0) {
            this.startSpecificSetOfQuestions(fixedQuestionIds) // Ensure questions are loaded before potential initial speak
          } else {
            if (!randomQuestions || randomQuestions === 'false' || randomQuestions === false) {
              await this.startNeverEncounteredQuiz();
            } else {
              this.loadQuestions(false);
            }
          }
        }
      });
    this.applyFontSettingsToWrapper();
    // If reading mode was loaded as true, speak the first question
    if (this.isReadingModeEnabled && this.currentQuestion && this.synth) {
      this.speakCurrentQuestionContent();
    }
  }

  // --- NEW: Method to toggle Accessibility Controls Visibility ---
  toggleAccessibilityControls(): void {
    this.showAccessibilityControls = !this.showAccessibilityControls;
  }

  // --- END NEW ---

  async loadQuestions(isResumeLoad: boolean = false): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      if (!isResumeLoad) {
        this.questions = await this.dbService.getRandomQuestions(
          this.quizSettings.publicContest,
          this.quizSettings.totalQuestionsInQuiz,
          this.quizSettings.selectedTopics,
          this.quizSettings.keywords,
          this.quizSettings.questionIDs,
          this.quizSettings.topicDistribution
        );
        if (this.quizSettings.topicDistribution && this.quizSettings.topicDistribution.length > 0) {
          this.quizSettings.totalQuestionsInQuiz = this.questions.length;
        } else {
          this.questions = this.questions.slice(0, this.quizSettings.totalQuestionsInQuiz);
        }
      }

      if (this.questions.length === 0) {
        this.errorLoading = "Nessuna domanda trovata per i criteri selezionati.";
        this.isLoading = false;
        return;
      }

      if (this.questions.length > 0 && this.isTimerEnabled && this.timerDurationSeconds > 0 && !this.timerSubscription && (!isResumeLoad || (isResumeLoad && this._timeLeftSeconds > 0))) {
        // Only start new timer if not resuming OR if resuming and there's time left
        this.startTimer();
      }
      if (this.questions.length > 0 && this.isCronometerEnabled && !this.cronometerSubscription) {
        this.startCronometer();
      }
      this.setCurrentQuestion();
    } catch (error) {
      console.error('Error loading questions:', error);
      this.errorLoading = "Errore nel caricamento delle domande.";
    } finally {
      this.isLoading = false;
    }
  }

  async pauseQuiz(): Promise<void> {
    this.stopSpeaking(); // Stop speech on quiz end
    if (!this.currentQuizAttemptId || this.quizCompleted) return;

    this.alertService.showConfirmationDialog("Attenzione", 'Stati per sospendere il quiz, così facendo potrai riprenderlo più tardi dalla schermata principale. Confermi?').then(result => {
      if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
        return;
      }
      this.quizStatus = 'paused';
      this.quizCompleted = true;

      this.clearAutoAdvanceTimeout();

      if (this.timerSubscription) {
        this.timerSubscription.unsubscribe();
        this.timerSubscription = undefined;
      }
      if (this.cronometerSubscription) {
        this.cronometerSubscription.unsubscribe();
        this.cronometerSubscription = undefined;
      }

      const isCurrentQuestionAnswered = this.userAnswers.some(ans => ans.questionId === this.currentQuestion?.id);
      if (!isCurrentQuestionAnswered && this.currentQuestion) {
        this.unansweredQuestions.push({
          questionId: this.questions[this.currentQuestionIndex].id, // Use ID from master list
          userAnswerIndex: -1,
          isCorrect: false,
          questionSnapshot: {
            text: this.questions[this.currentQuestionIndex].text,
            topic: this.questions[this.currentQuestionIndex].topic,
            scoreIsCorrect: this.questions[this.currentQuestionIndex].scoreIsCorrect,
            scoreIsWrong: this.questions[this.currentQuestionIndex].scoreIsWrong,
            scoreIsSkip: this.questions[this.currentQuestionIndex].scoreIsSkip,
            options: [...this.questions[this.currentQuestionIndex].options], // Original options
            correctAnswerIndex: this.questions[this.currentQuestionIndex].correctAnswerIndex,
            explanation: this.questions[this.currentQuestionIndex].explanation,
            isFavorite: this.questions[this.currentQuestionIndex].isFavorite || 0,
          },
          contestId: this.currentQuestion.contestId
        });
      }

      if (!this.currentQuizAttemptId) {
        this.alertService.showAlert("Attenzione", "Non è stato possibile recuperare l'identificativo del quiz corrente");
        return;
      }
      const attemptToSave: QuizAttempt = {
        id: this.currentQuizAttemptId,
        contestId: this.selectedPublicContest ? this.selectedPublicContest.id : -1,
        userId: this.authService.getCurrentUserId(),
        timestampStart: this.quizStartTime,
        settings: this.quizSettings,
        totalQuestionsInQuiz: this.questions.length,
        answeredQuestions: [...this.userAnswers],
        unansweredQuestions: [...this.unansweredQuestions.filter(uq => uq !== undefined) as AnsweredQuestion[]],
        allQuestions: this.questions.map(q => {
          const userAnswer = this.userAnswers.find(ua => ua.questionId === q.id);
          const originalQuestionData = this.questions.find(origQ => origQ.id === q.id) || q; // Fallback to q if not found
          return {
            questionId: q.id,
            userAnswerIndex: userAnswer ? userAnswer.userAnswerIndex : -1,
            isCorrect: userAnswer ? userAnswer.isCorrect : false,
            questionSnapshot: {
              text: originalQuestionData.text,
              topic: originalQuestionData.topic,
              scoreIsCorrect: originalQuestionData.scoreIsCorrect,
              scoreIsWrong: originalQuestionData.scoreIsWrong,
              scoreIsSkip: originalQuestionData.scoreIsSkip,
              options: [...originalQuestionData.options],
              correctAnswerIndex: originalQuestionData.correctAnswerIndex,
              explanation: originalQuestionData.explanation,
              isFavorite: originalQuestionData.isFavorite || 0
            },
            contestId: originalQuestionData.contestId
          };
        }),
        status: 'paused',
        currentQuestionIndex: this.currentQuestionIndex,
        timeLeftOnPauseSeconds: this.isTimerEnabled ? this._timeLeftSeconds : undefined,
        timeElapsedOnPauseSeconds: this.isCronometerEnabled ? this._timeElapsedSeconds : undefined,
      };

      try {
        this.dbService.saveQuizAttempt(attemptToSave).then(res => {
          this.router.navigate(['/home']);
        });
      } catch (error) {
        console.error("Errore nel mettere in pausa il quiz:", error);
        this.alertService.showAlert("Attenzione", "Non sono riuscito a mettere in pausa il quiz. Riprova più tardi.");
      }
    });
  }

  startTimer(): void {
    if (!this.isTimerEnabled || this._timeLeftSeconds <= 0) {
      if (this._timeLeftSeconds <= 0 && this.isTimerEnabled) { // If timer was enabled but ran out before quiz start
        this.quizIsOverByTime = true;
        this.endQuiz(true);
      }
      return;
    }

    if (this.timerSubscription) this.timerSubscription.unsubscribe();

    this.quizIsOverByTime = false;
    const durationForThisRun = this._timeLeftSeconds;
    const originalDuration = this._timeLeftSeconds;

    this.timeLeft$ = timer(0, 1000).pipe(
      takeUntil(this.destroy$),
      map(i => durationForThisRun - i), // Corrected: just subtract i
      takeWhile(timeLeft => timeLeft >= 0, true),
      finalize(() => {
        if (this._timeLeftSeconds <= 0 && !this.quizCompleted) {
          this.ngZone.run(() => { // Run state updates inside NgZone
            this.quizIsOverByTime = true;
            this.endQuiz(true);
          });
        }
      })
    );

    this.timerSubscription = this.timeLeft$.subscribe(timeLeftSeconds => {
      this._timeLeftSeconds = timeLeftSeconds;

      if (this.quizSpecificSoundsEnabled && (this._timeLeftSeconds / originalDuration * 100 <= 20) && !this.soundIsPlaying) {
        this.soundService.play('warning');
        this.soundIsPlaying = true;
      }
    });
  }

  startCronometer(): void {
    if (!this.isCronometerEnabled) return;
    if (this.cronometerSubscription) this.cronometerSubscription.unsubscribe();

    const initialElapsed = this._timeElapsedSeconds;

    this.timeElapsed$ = timer(0, 1000).pipe(
      takeUntil(this.destroy$),
      map(i => initialElapsed + i),
    );
    this.cronometerSubscription = this.timeElapsed$.subscribe(timeElapsedSeconds => {
      this._timeElapsedSeconds = timeElapsedSeconds;
    });
  }

  shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  setCurrentQuestion(): void {
    this.clearAutoAdvanceTimeout();
    this.highlightedOptionIndex = null;

    if (this.questions.length > 0 && this.currentQuestionIndex < this.questions.length) {
      // Work with a shallow copy for display to allow shuffling options without altering the master `this.questions`
      const masterQuestion = this.questions[this.currentQuestionIndex];
      this.currentQuestion = {
        ...masterQuestion,
        options: [...masterQuestion.options] // Ensure options array is also a copy
      };

      const originalCorrectAnswerText = this.currentQuestion.options[this.currentQuestion.correctAnswerIndex];

      // shuffle options just for not yet answered questions
      if (!this.userAnswers || !this.userAnswers.some((answ: AnsweredQuestion) => answ.questionId === this.currentQuestion?.id)) {
        this.currentQuestion.options = this.shuffleArray(this.currentQuestion.options);
        const foundQuestion = this.questions.find(qst => qst.id === this.currentQuestion?.id);
        if (foundQuestion) {
          foundQuestion.options = this.currentQuestion.options;
          foundQuestion.correctAnswerIndex = this.currentQuestion.options.findIndex(
            option => option === originalCorrectAnswerText
          );
        }
      } else {
        const previousAnswer: AnsweredQuestion | undefined = this.userAnswers.find(answ => answ.questionId === this.currentQuestion?.id);
        if (previousAnswer && previousAnswer.questionSnapshot.options) {
          this.currentQuestion.options = previousAnswer.questionSnapshot.options;
        }
      }
      this.currentQuestion.correctAnswerIndex = this.currentQuestion.options.findIndex(
        option => option === originalCorrectAnswerText
      );

      const answered = this.userAnswers.find(ans => ans.questionId === masterQuestion.id);
      if (answered) {
        this.isAnswerSubmitted = true;
        // Important: If options were shuffled when the answer was stored, `answered.userAnswerIndex`
        // might not match the new shuffle. We need to find the selected option by its text if possible,
        // or ensure snapshots store options as they were presented.
        // For now, we find the selected text and then its new index.
        const selectedOptionText = answered.questionSnapshot.options[answered.userAnswerIndex];
        this.selectedAnswerIndex = this.currentQuestion.options.indexOf(selectedOptionText);


        this.answerStates = this.currentQuestion.options.map((optionText, index) => {
          if (index === this.currentQuestion!.correctAnswerIndex) return AnswerState.CORRECT;
          if (this.selectedAnswerIndex !== null && index === this.selectedAnswerIndex && !answered.isCorrect) return AnswerState.INCORRECT;
          return AnswerState.UNANSWERED;
        });

      } else {
        this.selectedAnswerIndex = null;
        this.isAnswerSubmitted = false;
        this.answerStates = Array(this.currentQuestion.options.length).fill(AnswerState.UNANSWERED);
      }
      this.cdr.detectChanges(); // Ensure UI is updated before speaking
      if (this.isReadingModeEnabled && this.synth) { // If mode is on, speak the new question.
        this.speakCurrentQuestionContent();
      }
    } else {
      this.currentQuestion = undefined;
      this.stopSpeaking(); // No question, so stop any lingering speech
      if (!this.isLoading && this.questions.length > 0 && !this.quizCompleted) {
        this.endQuiz();
      }
    }
  }

  async toggleFavoriteCurrentQuestion(): Promise<void> {
    if (this.currentQuestion) {
      const originalQuestionId = this.questions[this.currentQuestionIndex].id;
      const newFavStatus = await this.dbService.toggleFavoriteStatus(originalQuestionId);
      if (newFavStatus !== undefined) {
        this.currentQuestion.isFavorite = newFavStatus;
        const qIndex = this.questions.findIndex(q => q.id === originalQuestionId);
        if (qIndex > -1) {
          this.questions[qIndex].isFavorite = newFavStatus;
        }
      }
    }
  }

  selectAnswer(optionIndex: number): void {
    if ((this.isAnswerSubmitted && !this.hideCorrectAnswer) || !this.currentQuestion || optionIndex < 0 || optionIndex >= this.currentQuestion.options.length) return;

    this.selectedAnswerIndex = optionIndex;
    this.isAnswerSubmitted = true;
    const isCorrect = optionIndex === this.currentQuestion.correctAnswerIndex;
    this.highlightedOptionIndex = null; // Clear highlight after selection

    this.answerStates = this.currentQuestion.options.map((_, index) => {
      if (index === this.currentQuestion!.correctAnswerIndex) return AnswerState.CORRECT;
      if (index === optionIndex && !isCorrect) return AnswerState.INCORRECT;
      return AnswerState.UNANSWERED;
    });

    const actualQuestionId = this.questions[this.currentQuestionIndex].id;
    const originalQuestionData = this.questions[this.currentQuestionIndex];

    const existingAnswer = this.userAnswers.find(ans => ans.questionId === actualQuestionId);
    if (existingAnswer) {
      // Update only the necessary fields
      existingAnswer.userAnswerIndex = optionIndex;
      existingAnswer.isCorrect = isCorrect;
    } else {
      this.userAnswers.push({
        questionId: actualQuestionId,
        userAnswerIndex: optionIndex,
        isCorrect: isCorrect,
        questionSnapshot: {
          text: this.currentQuestion.text,
          topic: this.currentQuestion.topic,
          scoreIsCorrect: this.currentQuestion.scoreIsCorrect,
          scoreIsWrong: this.currentQuestion.scoreIsWrong,
          scoreIsSkip: this.currentQuestion.scoreIsSkip,
          options: [...this.currentQuestion.options],
          correctAnswerIndex: this.currentQuestion.correctAnswerIndex,
          explanation: this.currentQuestion.explanation,
          isFavorite: this.currentQuestion.isFavorite || 0
        },
        contestId: this.currentQuestion.contestId
      });
    }


    if (this.isReadingModeEnabled && this.currentQuestion?.explanation && this.synth) {
      // Give a moment for UI to update (e.g., show feedback) before reading explanation
      setTimeout(() => {
        // Re-check conditions in case mode was toggled off quickly
        if (this.isReadingModeEnabled && this.currentQuestion?.explanation && this.synth) {
          this.speakExplanation();
        }
      }, 700); // Adjusted delay
    }

    if (!this.isReadingModeEnabled && this.quizSpecificSoundsEnabled) {
      if (isCorrect) {
        this.currentCorrectStreak++;
        // Play general correct sound (optional)
        this.soundService.play('correct');

        // Check for streak thresholds
        for (let i = this.STREAK_THRESHOLDS.length - 1; i >= 0; i--) { // Check from highest streak down
          if (this.currentCorrectStreak === this.STREAK_THRESHOLDS[i]) {
            this.soundService.play(this.STREAK_SOUND_KEYS[i]);
            break; // Play only one streak sound
          }
        }
        if (this.currentCorrectStreak > this.STREAK_THRESHOLDS[this.STREAK_THRESHOLDS.length - 1]) {
          // If streak exceeds max defined, could play the highest streak sound again or a different one
          // this.soundService.play(this.STREAK_SOUND_KEYS[this.STREAK_SOUND_KEYS.length - 1]);
        }

      } else {
        this.currentCorrectStreak = 0; // Reset streak on incorrect answer
        // Play general incorrect sound (optional)
        this.soundService.play('incorrect');
      }
    }

    this.unansweredQuestions = this.unansweredQuestions.filter(
      (qst): qst is AnsweredQuestion => qst !== undefined && qst.questionId !== actualQuestionId
    );
    // Keyboard selection calls handleAutoAdvance itself. Click selections also need it.
    // this.handleAutoAdvance(); // Moved to be called by the keyboard handler and click handler
  }

  public handleAutoAdvance(): void {
    this.clearAutoAdvanceTimeout();
    if (this.isAnswerSubmitted && this.currentQuestionIndex < this.questions.length - 1 && !this.quizIsOverByTime) {
      // If TTS is active and an explanation is likely being read, give it more time.
      // This is a heuristic. A more robust way would be to chain auto-advance after the speak queue for explanation finishes.
      const advanceDelay = (this.isReadingModeEnabled && this.currentQuestion?.explanation) ? 4500 : 2000;
      this.autoAdvanceTimeout = setTimeout(() => {
        this.ngZone.run(() => {
          this.nextQuestion();
        });
      }, advanceDelay);
    }
  }

  private clearAutoAdvanceTimeout(): void {
    if (this.autoAdvanceTimeout) {
      clearTimeout(this.autoAdvanceTimeout);
      this.autoAdvanceTimeout = null;
    }
  }

  getNumberOfCorrectAnswers(): number {
    return this.userAnswers.filter(ans => ans.isCorrect).length;
  }

  getNumberOfIncorrectAnswers(): number {
    return this.userAnswers.filter(ans => !ans.isCorrect).length;
  }

  getNumberOfUnansweredQuestions(): number {
    return this.questions.length - this.userAnswers.length;
  }

  nextQuestion(): void {
    this.clearAutoAdvanceTimeout();
    if (this.quizIsOverByTime) return; // Don't advance if time is up

    if (this.currentQuestionIndex < this.questions.length - 1) {
      if (!this.isAnswerSubmitted && this.currentQuestion &&
        !this.unansweredQuestions.some(qst => qst?.questionId === this.questions[this.currentQuestionIndex].id) &&
        !this.userAnswers.some(ans => ans.questionId === this.questions[this.currentQuestionIndex].id)) {
        this.unansweredQuestions.push({
          questionId: this.questions[this.currentQuestionIndex].id,
          userAnswerIndex: -1,
          isCorrect: false,
          questionSnapshot: {
            text: this.questions[this.currentQuestionIndex].text,
            topic: this.questions[this.currentQuestionIndex].topic,

            scoreIsCorrect: this.questions[this.currentQuestionIndex].scoreIsCorrect,
            scoreIsWrong: this.questions[this.currentQuestionIndex].scoreIsWrong,
            scoreIsSkip: this.questions[this.currentQuestionIndex].scoreIsSkip,

            options: [...this.currentQuestion.options],
            correctAnswerIndex: this.currentQuestion.correctAnswerIndex,
            explanation: this.currentQuestion.explanation,
            isFavorite: this.currentQuestion.isFavorite || 0
          },
          contestId: this.currentQuestion.contestId
        });
      }
      this.currentQuestionIndex++;
      this.setCurrentQuestion();
    } else {
      this.endQuiz();
    }
  }

  previousQuestion(): void {
    this.clearAutoAdvanceTimeout();
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.setCurrentQuestion();
    }
  }

  goToFirstUnansweredQuestion(): void {
    this.clearAutoAdvanceTimeout();
    const firstUnansweredQIndex = this.questions.findIndex(
      q => !this.userAnswers.some(ans => ans.questionId === q.id)
    );
    if (firstUnansweredQIndex > -1) {
      this.currentQuestionIndex = firstUnansweredQIndex;
    } else {
      this.currentQuestionIndex = Math.max(0, this.questions.length - 1);
    }
    this.setCurrentQuestion();
  }

  async endQuiz(isTimeUp: boolean = false): Promise<void> {
    this.isSavingAttempt = true;
    this.stopSpeaking(); // Stop speech on quiz end
    this.soundIsPlaying = false;
    this.clearAutoAdvanceTimeout();
    if (this.quizCompleted && !isTimeUp) return; // If already completed (not by time), don't re-process
    if (isTimeUp && this.quizCompleted) return; // If time up and already processed as completed, don't re-process

    this.quizCompleted = true;

    if (this.timerSubscription) this.timerSubscription.unsubscribe();
    if (this.cronometerSubscription) this.cronometerSubscription.unsubscribe();

    if (!this.questions || this.questions.length === 0) {
      this.router.navigate(['/quiz/setup']);
      return;
    }
    const quizEndTime = new Date();

    const correctScore = this.userAnswers.reduce((sum, q) => sum + (q.isCorrect ? ((q.questionSnapshot.scoreIsCorrect || 0) * 1) : 0), 0);
    const wrongScore = this.userAnswers.reduce((sum, q) => sum + (!q.isCorrect ? ((q.questionSnapshot.scoreIsWrong || 0) * -1) : 0), 0);
    const skipScore = this.unansweredQuestions
      .filter((q): q is AnsweredQuestion => q !== undefined)
      .reduce((sum, q) => sum + ((q.questionSnapshot.scoreIsSkip || 0) * -1), 0);
    const score = Number((correctScore + wrongScore + skipScore).toFixed(2));

    this.questions.forEach((q) => {
      const isAnswered = this.userAnswers.some(ans => ans.questionId === q.id);
      const isAlreadyInUnanswered = this.unansweredQuestions.some(unans => unans?.questionId === q.id);
      if (!isAnswered && !isAlreadyInUnanswered) {
        const originalQuestionData = this.questions.find(oq => oq.id === q.id) || q;
        this.unansweredQuestions.push({
          questionId: q.id,
          userAnswerIndex: -1,
          isCorrect: false,
          questionSnapshot: {
            text: originalQuestionData.text,
            topic: originalQuestionData.topic,
            scoreIsCorrect: originalQuestionData.scoreIsCorrect,
            scoreIsWrong: originalQuestionData.scoreIsWrong,
            scoreIsSkip: originalQuestionData.scoreIsSkip,

            options: [...originalQuestionData.options],
            correctAnswerIndex: originalQuestionData.correctAnswerIndex,
            explanation: originalQuestionData.explanation,
            isFavorite: originalQuestionData.isFavorite || 0
          },
          contestId: originalQuestionData.contestId
        });
      }
    });

    const finalQuizSettings = { ...this.quizSettings };
    if (this.isTimerEnabled) {
      finalQuizSettings.enableTimer = true;
      finalQuizSettings.timerDurationSeconds = this.quizSettings.timerDurationSeconds; // Use original duration from settings
    }
    if (this.isCronometerEnabled) {
      finalQuizSettings.enableCronometer = true;
    }

    if (!this.currentQuizAttemptId) this.currentQuizAttemptId = uuidv4();

    const quizAttempt: QuizAttempt = {
      id: this.currentQuizAttemptId!,
      timestampStart: this.quizStartTime,
      timestampEnd: quizEndTime,
      settings: finalQuizSettings,
      contestId: this.selectedPublicContest ? this.selectedPublicContest.id : -1,
      userId: this.authService.getCurrentUserId(),
      score: score,
      totalQuestionsInQuiz: this.questions.length,
      answeredQuestions: [...this.userAnswers],
      unansweredQuestions: [...this.unansweredQuestions.filter(uq => uq !== undefined) as AnsweredQuestion[]],
      allQuestions: this.questions.map(q => {
        const userAnswer = this.userAnswers.find(ua => ua.questionId === q.id);
        const originalQuestionData = this.questions.find(oq => oq.id === q.id) || q;
        return {
          questionId: q.id,
          userAnswerIndex: userAnswer ? userAnswer.userAnswerIndex : -1, // Relative to original options if snapshot stores original
          isCorrect: userAnswer ? userAnswer.isCorrect : false,
          questionSnapshot: {
            text: originalQuestionData.text,
            topic: originalQuestionData.topic,

            scoreIsCorrect: originalQuestionData.scoreIsCorrect,
            scoreIsWrong: originalQuestionData.scoreIsWrong,
            scoreIsSkip: originalQuestionData.scoreIsSkip,

            options: [...originalQuestionData.options],
            correctAnswerIndex: originalQuestionData.correctAnswerIndex,
            explanation: originalQuestionData.explanation,
            isFavorite: originalQuestionData.isFavorite || 0
          } as QuestionSnapshotInfo
        } as AnsweredQuestion;
      }),
      status: isTimeUp ? 'timed-out' : 'completed',
      currentQuestionIndex: this.currentQuestionIndex,
      timeElapsedOnPauseSeconds: this.isCronometerEnabled ? this._timeElapsedSeconds : undefined,
      quizTitle: this.quizTitle,
      quizType: this.quizType,
      // timeLeftOnPauseSeconds is not relevant here as quiz is ending
    };

    if (this.quizSpecificSoundsEnabled) {
      if (score / this.questions.length > 75) {
        this.soundService.play('done');
      } else {
        this.soundService.play('fail');
      }
    }

    try {
      this.spinnerService.show("Salvataggio in corso...");
      await this.dbService.saveQuizAttempt(quizAttempt);
      await this.dbService.updateQuestionsStatsBulk(this.userAnswers);
      // for (const answeredQ of this.userAnswers) {
      // await this.dbService.updateQuestionStats(answeredQ.questionId, answeredQ.isCorrect);
      // }
      this.spinnerService.hide();
      this.router.navigate(['/quiz/results', quizAttempt.id]);
      this.isSavingAttempt = false;
    } catch (error) {
      this.isSavingAttempt = false;
      console.error('Error ending quiz:', error);
      this.router.navigate(['/home']);
    }
  }

  // Example of how you might add a UI toggle for sounds *during* the quiz (optional)
  toggleQuizSounds(): void {
    this.quizSpecificSoundsEnabled = !this.quizSpecificSoundsEnabled;
    if (!this.isReadingModeEnabled && this.synth) { // Only affect game sounds if TTS is off
      this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled);
    }
    // Persist this choice if desired (e.g., in localStorage or quiz settings)
  }

  ngOnDestroy(): void {
    this.clearAutoAdvanceTimeout();
    this.stopSpeaking(); // Stop any TTS on component destroy
    this.destroy$.next();
    this.destroy$.complete();
    document.documentElement.style.removeProperty('--quiz-font-scale');
  }

  formatTimeLeft(seconds: number): string {
    if (seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const pad = (n: number) => n < 10 ? '0' + n : n.toString();
    return `${pad(mins)}:${pad(secs)}`;
  }

  canDeactivate(): Observable<boolean> | Promise<boolean> | boolean {
    this.clearAutoAdvanceTimeout();
    if (this.quizCompleted || this.quizStatus === 'paused' || this.questions.length === 0 || this.isLoading || this.errorLoading) {
      return true;
    }

    const customBtns: AlertButton[] = [{
      text: 'Annulla',
      role: 'cancel',
      cssClass: 'bg-gray-300 hover:bg-gray-500' // Example custom class
    } as AlertButton,
    {
      text: 'ESCI',
      role: 'confirm',
      data: 'ok_confirmed'
    } as AlertButton];

    if (!this.forceExit) {
      return this.alertService.showConfirmationDialog("Si è sicuri di voler abbandonare il quiz?", "Il tuo progresso attuale NON verrà salvato a meno che non metti in pausa.", customBtns).then(result => {
        if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
          return false;
        }
        return true;
      });
    } else {
      return true;
    }

  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any): void {
    if (!this.quizCompleted && this.questions.length > 0 && !this.isLoading && !this.errorLoading && this.quizStatus !== 'paused') {
      $event.returnValue = true;
    }
  }

  async loadPausedQuiz(attemptId: string): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      const pausedAttempt = await this.dbService.getQuizAttemptById(attemptId);
      if (pausedAttempt && pausedAttempt.status === 'paused') {
        this.quizSettings = pausedAttempt.settings;

        this.questions = pausedAttempt.allQuestions.map(snapshotItem => ({
          id: snapshotItem.questionId,
          text: snapshotItem.questionSnapshot.text,
          topic: snapshotItem.questionSnapshot.topic,

          scoreIsCorrect: snapshotItem.questionSnapshot.scoreIsCorrect,
          scoreIsWrong: snapshotItem.questionSnapshot.scoreIsWrong,
          scoreIsSkip: snapshotItem.questionSnapshot.scoreIsSkip,

          options: [...snapshotItem.questionSnapshot.options],
          correctAnswerIndex: snapshotItem.questionSnapshot.correctAnswerIndex,
          explanation: snapshotItem.questionSnapshot.explanation,
          isFavorite: snapshotItem.questionSnapshot.isFavorite || 0,
          contestId: snapshotItem.contestId
        }));

        this.userAnswers = pausedAttempt.answeredQuestions || [];
        this.unansweredQuestions = pausedAttempt.unansweredQuestions || [];
        this.currentQuestionIndex = pausedAttempt.currentQuestionIndex || 0;
        this.quizStartTime = new Date(pausedAttempt.timestampStart);
        this.currentQuizAttemptId = pausedAttempt.id;
        this.quizStatus = 'in-progress';

        this.isTimerEnabled = this.quizSettings.enableTimer || false;
        this.isCronometerEnabled = this.quizSettings.enableCronometer || false;

        if (this.isTimerEnabled && pausedAttempt.timeLeftOnPauseSeconds !== undefined && pausedAttempt.timeLeftOnPauseSeconds > 0) {
          this._timeLeftSeconds = pausedAttempt.timeLeftOnPauseSeconds;
          this.timerDurationSeconds = this._timeLeftSeconds; // Important for startTimer logic
          // Timer will be started in loadQuestions if conditions met
        } else if (this.isTimerEnabled && pausedAttempt.timeLeftOnPauseSeconds !== undefined && pausedAttempt.timeLeftOnPauseSeconds <= 0) {
          this.quizIsOverByTime = true; // Quiz had already timed out
        }

        if (this.isCronometerEnabled && pausedAttempt.timeElapsedOnPauseSeconds !== undefined) {
          this._timeElapsedSeconds = pausedAttempt.timeElapsedOnPauseSeconds;
          // Cronometer will be started in loadQuestions
        }

        pausedAttempt.status = 'in-progress'; // Mark as in-progress now
        await this.dbService.saveQuizAttempt(pausedAttempt);

        // Call loadQuestions with isResumeLoad = true, which will then call setCurrentQuestion
        // and start timers if applicable and not already over.
        await this.loadQuestions(true);

        if (this.quizIsOverByTime) { // If quiz was already timed out when paused
          this.endQuiz(true);
          return;
        }


      } else {
        this.errorLoading = 'Impossibile riprendere il quiz. Quiz non trovato o già completato.';
        this.isLoading = false;
        this.router.navigate(['/quiz/setup']);
      }
    } catch (error) {
      console.error('Error loading paused quiz:', error);
      this.errorLoading = "Errore nel riprendere il quiz.";
      this.isLoading = false;
    }
  }

  // --- Accessibility Methods ---
  private loadAccessibilityPreferences(): void {
    // ... (existing font size, font family, reading mode loading)
    const savedFontSizeStep = localStorage.getItem('quizFontSizeStep'); /* ... */
    const savedFontIndex = localStorage.getItem('quizFontIndex'); /* ... */
    const savedReadingMode = localStorage.getItem('quizReadingModeEnabled'); /* ... */

    this.isReadingModeEnabled = savedReadingMode === 'true';

    if (!this.synth) {
      this.isReadingModeEnabled = false;
    }

    if (this.isReadingModeEnabled && this.synth) {
      this.soundService.setSoundsEnabled(false);
    } else if (this.synth) {
      this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled);
    }

    // The actual voice selection for IT/EN happens in loadAvailableVoices
    // and the dynamic choice in speakText.
    // We still load the general user-selected preferred voice.
    const preferredVoiceName = localStorage.getItem('quizPreferredVoiceName');
    if (preferredVoiceName && this.availableVoices.length > 0) { // Check if voices are loaded
      const voice = this.availableVoices.find(v => v.name === preferredVoiceName);
      if (voice) this.selectedVoice = voice; // This is the general default
    }
  }

  private saveAccessibilityPreferences(): void {
    localStorage.setItem('quizFontSizeStep', this.fontSizeStep.toString());
    localStorage.setItem('quizFontIndex', this.currentFontIndex.toString());
    // --- NEW: Save Reading Mode Preference ---
    localStorage.setItem('quizReadingModeEnabled', this.isReadingModeEnabled.toString());
    // --- END NEW ---
  }

  increaseFontSize(): void {
    if (this.fontSizeStep < this.maxFontSizeStep) {
      this.fontSizeStep = parseFloat((this.fontSizeStep + this.fontSizeIncrement).toFixed(2));
      this.updateRootFontSize();
      this.saveAccessibilityPreferences();
    }
  }

  decreaseFontSize(): void {
    if (this.fontSizeStep > this.minFontSizeStep) {
      this.fontSizeStep = parseFloat((this.fontSizeStep - this.fontSizeIncrement).toFixed(2));
      this.updateRootFontSize();
      this.saveAccessibilityPreferences();
    }
  }

  resetFontSize(): void {
    this.fontSizeStep = 1;
    this.updateRootFontSize();
    this.saveAccessibilityPreferences();
  }

  private updateRootFontSize(): void {
    document.documentElement.style.setProperty('--quiz-font-scale', this.fontSizeStep.toString());
  }

  cycleFontFamily(): void {
    this.currentFontIndex = (this.currentFontIndex + 1) % this.availableFonts.length;
    this.currentFont = this.availableFonts[this.currentFontIndex];
    this.updateFontFamilyClass();
    this.saveAccessibilityPreferences();
  }

  private updateFontFamilyClass(): void {
    const quizWrapper = this.el.nativeElement.querySelector('.quiz-content-wrapper');
    if (quizWrapper) {
      this.availableFonts.forEach(font => {
        if (quizWrapper.classList) this.renderer.removeClass(quizWrapper, font.cssClass);
      });
      if (this.currentFont.cssClass !== 'font-default' && quizWrapper.classList) {
        this.renderer.addClass(quizWrapper, this.currentFont.cssClass);
      }
    }
  }

  private applyFontSettingsToWrapper(): void {
    this.updateRootFontSize();
    this.updateFontFamilyClass();
  }

  async showConfirmation() {
    const result = await this.alertService.showConfirm(
      'Conferma Azione',
      'Sei sicuro di voler procedere?',
      'Sì, Procedi',
      'Annulla'
    );

    if (result && result.role === 'confirm') {
      console.log('Azione confermata!', result.data); // result.data would be true here
      // Add further logic for confirmation
    } else {
      console.log('Azione annullata o alert dismesso.');
    }
  }

  // --- NEW: TTS Methods ---
  toggleReadingMode(): void {
    if (!this.synth) {
      this.isReadingModeEnabled = false; // Ensure it's off if synth not available
      this.alertService.showAlert('Funzione non disponibile', 'La lettura vocale non è supportata dal tuo browser.');
      this.saveAccessibilityPreferences(); // Save the "false" state
      return;
    }

    this.isReadingModeEnabled = !this.isReadingModeEnabled;
    this.saveAccessibilityPreferences();

    if (this.isReadingModeEnabled) {
      this.soundService.setSoundsEnabled(false);
      if (this.currentQuestion) {
        this.speakCurrentQuestionContent(); // Builds and starts the queue
      }
    } else {
      this.stopSpeaking(); // Clears queue and stops current speech
      this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled);
    }
    this.cdr.detectChanges();
  }

  // --- Updated TTS Methods with Queue ---

  private speakText(text: string, targetLang?: 'it-IT' | 'en-US'): Promise<void> {
    return new Promise((resolve, reject) => {
      // Initial checks (reading mode, synth, text, queue status)
      if (!this.isReadingModeEnabled || !text || !this.synth || (this.speakQueue.length === 0 && !this.isProcessingQueue && this.currentUtterance === null)) {
        resolve();
        return;
      }

      let settled = false;
      // Create the utterance locally within this promise's scope
      const utterance = new SpeechSynthesisUtterance(this.stripHtml(text));

      // --- Voice and Language Selection Logic (as before) ---
      let voiceToUse: SpeechSynthesisVoice | null = null;
      let langToSet: string = 'it-IT';

      if (targetLang) {
        langToSet = targetLang;
        if (targetLang === 'en-US') voiceToUse = this.preferredEnglishVoice;
        else voiceToUse = this.preferredItalianVoice;
      } else if (this.currentQuestion?.topic?.toUpperCase() === 'INGLESE') {
        langToSet = 'en-US';
        voiceToUse = this.preferredEnglishVoice;
      } else {
        langToSet = 'it-IT';
        voiceToUse = this.preferredItalianVoice;
      }

      if (!voiceToUse && this.selectedVoice?.lang.startsWith(langToSet.split('-')[0])) {
        voiceToUse = this.selectedVoice;
      }

      if (voiceToUse) {
        utterance.voice = voiceToUse;
        utterance.lang = voiceToUse.lang;
      } else {
        utterance.lang = langToSet;
      }
      // --- End Voice and Language Selection ---

      utterance.onstart = () => {
        // Set the global currentUtterance when this specific one starts
        this.currentUtterance = utterance;
        this.isCurrentlySpeaking = true;
        this.cdr.detectChanges();
      };

      utterance.onend = () => {
        if (settled) return;
        settled = true;
        this.isCurrentlySpeaking = false;
        // Clear the global currentUtterance if this one (the one that just ended) was it
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        this.cdr.detectChanges();
        resolve();
      };

      utterance.onerror = (event) => {
        if (settled) return;
        settled = true;
        console.error('SpeechSynthesis Error:', event);
        this.isCurrentlySpeaking = false;
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        this.cdr.detectChanges();
        reject(event);
      };

      try {
        // Before speaking, make sure to assign this new utterance
        // as the one the synth should try to speak.
        // The `stopSpeaking` method might have cleared the synth's internal queue.
        // However, synth.speak() adds to its own internal queue.
        // The main role of this.currentUtterance is for our `stopSpeaking` to know what to target.
        // The synth itself manages its speaking queue.
        this.synth.speak(utterance);
      } catch (e) {
        if (settled) return;
        settled = true;
        console.error("Error calling synth.speak:", e);
        this.isCurrentlySpeaking = false;
        if (this.currentUtterance === utterance) { // Check if it was this one
          this.currentUtterance = null;
        }
        this.cdr.detectChanges();
        reject(e);
      }
    });
  }

  private delayPromise(ms: number): Promise<void> {
    return new Promise(resolve => {
      // Check if reading mode is still active before resolving the delay
      // This allows stopSpeaking to effectively interrupt delays too.
      const timerId = setTimeout(() => {
        if (this.isReadingModeEnabled && (this.isProcessingQueue || this.speakQueue.length > 0)) { // Check if we should still proceed
          resolve();
        } else {
          // If mode was disabled or queue cleared during delay,
          // resolve to allow queue processing to terminate gracefully.
          resolve();
        }
      }, ms);
      // If stopSpeaking is called, we might want to clear this timeout.
      // For now, the check inside resolve is a simpler way.
    });
  }

  private async processSpeakQueue(): Promise<void> {
    if (this.speakQueue.length === 0 || !this.isReadingModeEnabled || this.isProcessingQueue) {
      this.isProcessingQueue = false; // Ensure it's false if queue is done or mode off
      return;
    }

    this.isProcessingQueue = true;
    const nextAction = this.speakQueue.shift();

    if (nextAction) {
      try {
        await nextAction(); // Wait for the current speech/delay to complete
      } catch (error) {
        console.error("Error processing speech queue action:", error);
        // Potentially stop further queue processing, or log and attempt to continue
      }
    }

    this.isProcessingQueue = false;
    // After the current action is done, recursively call to process the next item
    if (this.isReadingModeEnabled && this.speakQueue.length > 0) {
      this.processSpeakQueue();
    }
  }

  private stopSpeaking(): void {
    this.speakQueue = [];
    this.isProcessingQueue = false; // Explicitly stop queue processing flag

    if (this.synth && this.synth.speaking) {
      this.synth.cancel(); // This will trigger onend/onerror of the utterance that was active
    }
    // `this.currentUtterance` will be set to null by the `onend` or `onerror`
    // handler of the utterance that was cancelled.
    // We can also proactively set it to null here for immediate state update,
    // though the event handlers should ideally manage it.
    // this.currentUtterance = null; // Optional: for more immediate visual feedback if needed
    this.isCurrentlySpeaking = false;
    this.cdr.detectChanges();
  }

  private speakCurrentQuestionContent(): void {
    if (!this.isReadingModeEnabled || !this.currentQuestion || !this.synth) return;

    this.stopSpeaking();

    const questionTopic = this.currentQuestion.topic?.toUpperCase();
    const langForQuestion: 'it-IT' | 'en-US' = (questionTopic === 'INGLESE') ? 'en-US' : 'it-IT';

    let initialTextParts: string[] = [];
    if (langForQuestion === 'en-US') {
      initialTextParts.push(`Question ${this.currentQuestionIndex + 1}.`);
      initialTextParts.push(`${this.currentQuestion.text}.`);
      if (this.currentQuestion.options.length > 0) {
        initialTextParts.push("Options:");
      }
    } else {
      initialTextParts.push(`Domanda ${this.currentQuestionIndex + 1}.`);
      initialTextParts.push(`${this.currentQuestion.text}.`);
      if (this.currentQuestion.options.length > 0) {
        initialTextParts.push("Opzioni:");
      }
    }
    this.speakQueue.push(() => this.speakText(initialTextParts.join(' '), langForQuestion));


    this.currentQuestion.options.forEach((option, index) => {
      // Option numbers can be spoken in the primary language or the question's language
      // For simplicity, let's use the question's language for option numbers too.
      this.speakQueue.push(() => this.speakText(`${index + 1}.`, langForQuestion));
      this.speakQueue.push(() => this.delayPromise(this.OPTION_VOICE_DELAY_MS));
      this.speakQueue.push(() => this.speakText(option, langForQuestion));
    });

    if (!this.isProcessingQueue) {
      this.processSpeakQueue();
    }
  }

  private speakExplanation(): void {
    if (!this.isReadingModeEnabled || !this.currentQuestion?.explanation || !this.synth) return;

    this.stopSpeaking();

    const questionTopic = this.currentQuestion.topic?.toUpperCase();
    const langForExplanation: 'it-IT' | 'en-US' = (questionTopic === 'INGLESE') ? 'en-US' : 'it-IT';
    const explanationPrefix = langForExplanation === 'en-US' ? "Explanation:" : "Spiegazione:";

    this.speakQueue.push(() => this.speakText(`${explanationPrefix} ${this.currentQuestion!.explanation!}`, langForExplanation));

    if (!this.isProcessingQueue) {
      this.processSpeakQueue();
    }
  }

  // --- END Updated TTS Methods ---

  private stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  }

  // --- NEW: Voice Loading and Selection ---
  private loadAvailableVoices(): void {
    if (!this.synth) return;

    this.availableVoices = this.synth.getVoices();
    if (this.availableVoices.length > 0) {
      this.voiceSelectionAvailable = true; // For UI dropdown

      // Select preferred voices for IT and EN
      this.preferredItalianVoice = this.findBestVoiceForLang('it-IT') || this.findBestVoiceForLang('it');
      this.preferredEnglishVoice = this.findBestVoiceForLang('en-US') || this.findBestVoiceForLang('en');

      // Set the default selectedVoice (could be based on browser lang or a general pref)
      // For now, let's default to Italian if available, otherwise first available.
      this.selectedVoice = this.preferredItalianVoice || this.availableVoices.find(v => v.default) || this.availableVoices[0] || null;

      // If a voice was previously saved in localStorage, try to honor that
      const savedVoiceName = localStorage.getItem('quizPreferredVoiceName');
      if (savedVoiceName) {
        const foundSaved = this.availableVoices.find(v => v.name === savedVoiceName);
        if (foundSaved) this.selectedVoice = foundSaved;
      }

      console.log("Loaded voices. Italian pref:", this.preferredItalianVoice?.name, "English pref:", this.preferredEnglishVoice?.name);
      this.cdr.detectChanges();
    }
  }

  private selectPreferredVoice(lang: string): void {
    if (this.availableVoices.length === 0) return;

    // Try to find a "Google" voice first for the language, as they are often good
    let preferred = this.availableVoices.find(voice =>
      voice.lang.startsWith(lang) && voice.name.toLowerCase().includes('google')
    );

    if (!preferred) {
      // Fallback: find any voice for the language, prioritizing non-local if possible
      preferred = this.availableVoices.find(voice =>
        voice.lang.startsWith(lang) && voice.localService === false
      );
    }

    if (!preferred) {
      // Fallback: find any voice for the language
      preferred = this.availableVoices.find(voice => voice.lang.startsWith(lang));
    }

    if (!preferred && lang.includes('-')) {
      // Fallback: try to find a voice for the base language (e.g., 'it' from 'it-IT')
      const baseLang = lang.split('-')[0];
      preferred = this.availableVoices.find(voice => voice.lang === baseLang);
    }

    this.selectedVoice = preferred || this.availableVoices.find(v => v.default) || this.availableVoices[0] || null;
    console.log("Selected voice:", this.selectedVoice?.name, this.selectedVoice?.lang);
  }

  // This is called if you have a general voice selector UI
  public setSelectedVoice(voiceName: string): void {
    const voice = this.availableVoices.find(v => v.name === voiceName);
    if (voice) {
      this.selectedVoice = voice; // This becomes the general default if not overridden by topic
      localStorage.setItem('quizPreferredVoiceName', voice.name);

      // Update language-specific preferences if the selected voice matches a language
      if (voice.lang.startsWith('it')) this.preferredItalianVoice = voice;
      if (voice.lang.startsWith('en')) this.preferredEnglishVoice = voice;
    }
  }

  // --- END NEW ---
  private findBestVoiceForLang(lang: string): SpeechSynthesisVoice | null {
    if (!this.availableVoices || this.availableVoices.length === 0) return null;

    const langPrefix = lang.split('-')[0]; // e.g., 'it' from 'it-IT'

    // Exact match with "Google" in name
    let voice = this.availableVoices.find(v => v.lang === lang && v.name.toLowerCase().includes('google'));
    if (voice) return voice;

    // Prefix match with "Google" in name
    voice = this.availableVoices.find(v => v.lang.startsWith(langPrefix) && v.name.toLowerCase().includes('google'));
    if (voice) return voice;

    // Exact match, non-local
    voice = this.availableVoices.find(v => v.lang === lang && v.localService === false);
    if (voice) return voice;

    // Prefix match, non-local
    voice = this.availableVoices.find(v => v.lang.startsWith(langPrefix) && v.localService === false);
    if (voice) return voice;

    // Exact match, any
    voice = this.availableVoices.find(v => v.lang === lang);
    if (voice) return voice;

    // Prefix match, any
    voice = this.availableVoices.find(v => v.lang.startsWith(langPrefix));
    if (voice) return voice;

    return null;
  }

  async loadNeverEncounteredQuestionIds(): Promise<void> {
    this.neverEncounteredQuestions = await this.dbService.getNeverEncounteredRandomQuestionsByParams(
      this.quizSettings.publicContest,
      this.quizSettings.totalQuestionsInQuiz,
      this.quizSettings.selectedTopics,
      this.quizSettings.keywords,
      this.quizSettings.questionIDs,
      this.quizSettings.topicDistribution,
    ); // Assuming this method exists
  }

  async startNeverEncounteredQuiz(): Promise<void> {
    if (!this.neverEncounteredQuestions || this.neverEncounteredQuestions.length === 0) {
      await this.loadNeverEncounteredQuestionIds();
    }
    if (this.neverEncounteredQuestions.length > 0) {
      // Fetch the full question objects for the modal (to display topics and counts)
      this.questions = this.neverEncounteredQuestions;

      if (this.questions.length > 0 && this.isTimerEnabled) {
        // Only start new timer if not resuming OR if resuming and there's time left
        this.startTimer();
      }
      if (this.questions.length > 0 && this.isCronometerEnabled && !this.cronometerSubscription) {
        this.startCronometer();
      }
      this.isLoading = false;
      this.setCurrentQuestion();
    } else {
      this.isLoading = false;
      this.alertService.showAlert("Info", "Congratulazioni! Hai risposto a tutte le domande disponibili almeno una volta: prova a esercitarti su alcuni argomenti specifici usando dei filtri particolari o ripassando le domande più difficili");
    }
  }

  async startSpecificSetOfQuestions(questionIDs: string[]): Promise<void> {
    if (!questionIDs || questionIDs.length === 0) {
      // as a fallback
      this.startNeverEncounteredQuiz();
    } else {
      this.questions = await this.dbService.getQuestionByIds(questionIDs);

      if (!this.questions || this.questions.length === 0) {
        this.isLoading = false;
        this.alertService.showAlert("Info", "Non sono state trovate le domande con gli identificativi forniti.");
        return;
      }

      if (this.questions.length > 0 && this.isTimerEnabled) {
        // Only start new timer if not resuming OR if resuming and there's time left
        this.startTimer();
      }
      if (this.questions.length > 0 && this.isCronometerEnabled && !this.cronometerSubscription) {
        this.startCronometer();
      }
      this.isLoading = false;
      this.setCurrentQuestion();
    }
  }
}

