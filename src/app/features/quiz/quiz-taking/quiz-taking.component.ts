// src/app/features/quiz/quiz-taking/quiz-taking.component.ts
import { Component, OnInit, OnDestroy, inject, HostListener, Renderer2, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core'; // Added NgZone
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, timer, Observable, Subject } from 'rxjs';
import { map, takeWhile, finalize, takeUntil, delay } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard';
import { QuestionFeedbackComponent } from '../../../question-feedback/question-feedback.component';

import { DatabaseService } from '../../../core/services/database.service';
import { Question } from '../../../models/question.model';
import { QuizSettings, AnsweredQuestion, QuizAttempt, TopicCount, QuizStatus } from '../../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faArrowLeft, faArrowRight, faBackward, faCircle, faCircleCheck, faCircleExclamation, faForward, faHome, faPause, faRepeat, faMusic, faVolumeMute } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../../services/alert.service';
import { AlertButton, AlertOptions } from '../../../models/alert.model';
import { AlertComponent } from '../../../shared/alert/alert.component';
import { SoundService } from '../../../core/services/sound.service.spec';

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

  private soundIsPlaying: boolean = false;

  faSoundOn = faMusic;
  faSoundOff = faVolumeMute;

  // --- NEW: Sound and Streak Properties ---
  quizSpecificSoundsEnabled = false; // Determined by quiz settings
  private currentCorrectStreak = 0;
  readonly STREAK_THRESHOLDS = [3, 5, 10]; // Example: Play sound at 3, 5, 10 correct in a row
  readonly STREAK_SOUND_KEYS = ['streak1', 'streak2', 'streak3']; // Corresponding sound keys
  // --- END NEW ---


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

  // Timer related properties
  isTimerEnabled = false;
  isCronometerEnabled = false;
  timerDuration = 0;
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


  constructor() { }

  ngOnInit(): void {
    this.quizStartTime = new Date();
    this.loadAccessibilityPreferences();

    this.routeSub = this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(async params => {
        const resumeAttemptId = params['resumeAttemptId'];
        const fixedQuestionIds = params['fixedQuestionIds'] ? params['fixedQuestionIds'].toString().split(',') : [];
        this.quizTitle = params['quizTitle'] || 'Quiz';

        this.quizSpecificSoundsEnabled = params['enableStreakSounds'] === 'true';
        this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled); // Update global service state for this quiz session

        if (resumeAttemptId) {
          this.isResuming = true;
          this.currentQuizAttemptId = resumeAttemptId;
          await this.loadPausedQuiz(resumeAttemptId);
        } else {
          this.isResuming = false;
          this.currentQuizAttemptId = uuidv4();
          this.quizStatus = 'in-progress';

          const numQuestions = params['numQuestions'] ? +params['numQuestions'] : 10;
          const topicsParam = params['topics'] || '';
          const selectedTopics = topicsParam ? topicsParam.split(',').filter((t: any) => t) : [];
          const keywordsParam = params['keywords'] || '';
          const selectedKeywords = keywordsParam ? keywordsParam.split(',').filter((kw: any) => kw) : [];
          const topicDistributionParam = params['topicDistribution'] || '';
          let selectedTopicDistribution: TopicCount[] | undefined = undefined;
          if (topicDistributionParam) { try { selectedTopicDistribution = JSON.parse(topicDistributionParam); } catch (e) { console.error('Error parsing topicDistribution:', e); } }

          this.isTimerEnabled = params['enableTimer'] === 'true';
          this.isCronometerEnabled = params['enableCronometer'] === 'true';
          this.timerDuration = params['timerDuration'] ? +params['timerDuration'] : 0;
          this._timeLeftSeconds = this.timerDuration;

          this.quizSettings = {
            numQuestions,
            selectedTopics,
            keywords: selectedKeywords,
            topicDistribution: selectedTopicDistribution,
            enableTimer: this.isTimerEnabled,
            enableCronometer: this.isCronometerEnabled,
            timerDurationSeconds: this.timerDuration,
            questionIDs: fixedQuestionIds
          };
          await this.loadQuestions(false);
        }
      });
    this.applyFontSettingsToWrapper();
  }

  async loadQuestions(isResumeLoad: boolean = false): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      if (!isResumeLoad) {
        this.questions = await this.dbService.getRandomQuestions(
          this.quizSettings.numQuestions,
          this.quizSettings.selectedTopics,
          this.quizSettings.keywords,
          this.quizSettings.questionIDs,
          this.quizSettings.topicDistribution
        );
        if (this.quizSettings.topicDistribution && this.quizSettings.topicDistribution.length > 0) {
          this.quizSettings.numQuestions = this.questions.length;
        } else {
          this.questions = this.questions.slice(0, this.quizSettings.numQuestions);
        }
      }

      if (this.questions.length === 0) {
        this.errorLoading = "Nessuna domanda trovata per i criteri selezionati.";
        this.isLoading = false;
        return;
      }

      if (this.questions.length > 0 && this.isTimerEnabled && this.timerDuration > 0 && !this.timerSubscription && (!isResumeLoad || (isResumeLoad && this._timeLeftSeconds > 0))) {
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
    }
    finally {
      this.isLoading = false;
    }
  }

  async pauseQuiz(): Promise<void> {
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
            options: [...this.questions[this.currentQuestionIndex].options], // Original options
            correctAnswerIndex: this.questions[this.currentQuestionIndex].correctAnswerIndex,
            explanation: this.questions[this.currentQuestionIndex].explanation,
            isFavorite: this.questions[this.currentQuestionIndex].isFavorite || 0
          }
        });
      }

      if (!this.currentQuizAttemptId) {
        this.alertService.showAlert("Attenzione", "Non è stato possibile recuperare l'identificativo del quiz corrente");
        return;
      }
      const attemptToSave: QuizAttempt = {
        id: this.currentQuizAttemptId,
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
              options: [...originalQuestionData.options],
              correctAnswerIndex: originalQuestionData.correctAnswerIndex,
              explanation: originalQuestionData.explanation,
              isFavorite: originalQuestionData.isFavorite || 0
            }
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

      if (this.quizSpecificSoundsEnabled && (this._timeLeftSeconds/originalDuration*100 <= 20) && !this.soundIsPlaying){
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
    this.highlightedOptionIndex = null; // Reset highlight on new question

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
      this.cdr.detectChanges();
    } else {
      this.currentQuestion = undefined;
      if (!this.isLoading && this.questions.length > 0 && !this.quizCompleted) { // If out of bounds but not loading/error
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
    if (this.isAnswerSubmitted || !this.currentQuestion || optionIndex < 0 || optionIndex >= this.currentQuestion.options.length) return;

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

    this.userAnswers.push({
      questionId: actualQuestionId,
      userAnswerIndex: optionIndex, // This index is relative to the *currently shuffled* options for this display
      isCorrect: isCorrect,
      questionSnapshot: {
        text: this.currentQuestion.text,
        topic: this.currentQuestion.topic,
        options: [...this.currentQuestion.options], // To preserve the original shuffled option
        correctAnswerIndex: this.currentQuestion.correctAnswerIndex, // Snapshot original correct index
        explanation: this.currentQuestion.explanation,
        isFavorite: this.currentQuestion.isFavorite || 0
      }
    });

    if (this.quizSpecificSoundsEnabled) { // Only if sounds are enabled for this quiz
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
      this.autoAdvanceTimeout = setTimeout(() => {
        this.ngZone.run(() => { // Ensure Angular knows about changes from setTimeout
          this.nextQuestion();
        });
      }, 2000);
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
            options: [...this.currentQuestion.options],
            correctAnswerIndex: this.questions[this.currentQuestionIndex].correctAnswerIndex,
            explanation: this.questions[this.currentQuestionIndex].explanation,
            isFavorite: this.questions[this.currentQuestionIndex].isFavorite || 0
          }
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
    const score = this.userAnswers.filter(ans => ans.isCorrect).length;

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
            options: [...originalQuestionData.options],
            correctAnswerIndex: originalQuestionData.correctAnswerIndex,
            explanation: originalQuestionData.explanation,
            isFavorite: originalQuestionData.isFavorite || 0
          }
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
            options: [...originalQuestionData.options],
            correctAnswerIndex: originalQuestionData.correctAnswerIndex,
            explanation: originalQuestionData.explanation,
            isFavorite: originalQuestionData.isFavorite || 0
          }
        };
      }),
      status: isTimeUp ? 'timed-out' : 'completed',
      currentQuestionIndex: this.currentQuestionIndex,
      timeElapsedOnPauseSeconds: this.isCronometerEnabled ? this._timeElapsedSeconds : undefined,
      // timeLeftOnPauseSeconds is not relevant here as quiz is ending
    };

    if (this.quizSpecificSoundsEnabled){
      if (score/this.questions.length > 75){
        this.soundService.play('done');
      } else {
        this.soundService.play('fail');
      }
    }

    try {
      await this.dbService.saveQuizAttempt(quizAttempt);
      for (const answeredQ of this.userAnswers) {
        await this.dbService.updateQuestionStats(answeredQ.questionId, answeredQ.isCorrect);
      }
      this.router.navigate(['/quiz/results', quizAttempt.id]);
    } catch (error) {
      console.error('Error ending quiz:', error);
      this.router.navigate(['/home']);
    }
  }

  // Example of how you might add a UI toggle for sounds *during* the quiz (optional)
  toggleQuizSounds(): void {
    this.quizSpecificSoundsEnabled = !this.quizSpecificSoundsEnabled;
    this.soundService.setSoundsEnabled(this.quizSpecificSoundsEnabled);
    // Persist this choice for the current quiz if desired (e.g., in QuizAttempt settings, or a local component state)
  }

  ngOnDestroy(): void {
    this.clearAutoAdvanceTimeout();
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
    return this.alertService.showConfirmationDialog("Si è sicuri di voler abbandonare il quiz?", "Il tuo progresso attuale NON verrà salvato a meno che non metti in pausa.", customBtns).then(result => {
      if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
        return false;
      }
      return true;
    });
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
          options: [...snapshotItem.questionSnapshot.options],
          correctAnswerIndex: snapshotItem.questionSnapshot.correctAnswerIndex,
          explanation: snapshotItem.questionSnapshot.explanation,
          isFavorite: snapshotItem.questionSnapshot.isFavorite || 0
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
          this.timerDuration = this._timeLeftSeconds; // Important for startTimer logic
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
    const savedFontSizeStep = localStorage.getItem('quizFontSizeStep');
    if (savedFontSizeStep) this.fontSizeStep = parseFloat(savedFontSizeStep);

    const savedFontIndex = localStorage.getItem('quizFontIndex');
    if (savedFontIndex) {
      const index = parseInt(savedFontIndex, 10);
      if (index >= 0 && index < this.availableFonts.length) {
        this.currentFontIndex = index;
        this.currentFont = this.availableFonts[index];
      }
    }
  }

  private saveAccessibilityPreferences(): void {
    localStorage.setItem('quizFontSizeStep', this.fontSizeStep.toString());
    localStorage.setItem('quizFontIndex', this.currentFontIndex.toString());
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


}