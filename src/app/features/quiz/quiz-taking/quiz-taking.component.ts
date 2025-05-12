// src/app/features/quiz/quiz-taking/quiz-taking.component.ts
import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core'; // Added HostListener
import { CommonModule, DatePipe } from '@angular/common'; // Added DatePipe
import { ActivatedRoute, Router, RouterLink } from '@angular/router'; // Added RouterLink
import { Subscription, timer, Observable } from 'rxjs'; // Added timer, Observable
import { map, takeWhile, finalize } from 'rxjs/operators'; // Added map, takeWhile, finalize
import { v4 as uuidv4 } from 'uuid';
import { CanComponentDeactivate } from '../../../core/guards/unsaved-changes.guard'; // <-- IMPORT GUARD INTERFACE
import { QuestionFeedbackComponent } from '../../../question-feedback/question-feedback.component'; // <-- IMPORT COMPONENT

import { DatabaseService } from '../../../core/services/database.service';
import { Question } from '../../../models/question.model';
import { QuizSettings, AnsweredQuestion, QuizAttempt, TopicCount, QuizStatus } from '../../../models/quiz.model'; // Ensure TopicCount if using typed quizSettings


// Enum for answer states for styling
enum AnswerState {
  UNANSWERED = 'unanswered',
  CORRECT = 'correct',
  INCORRECT = 'incorrect'
}

@Component({
  selector: 'app-quiz-taking',
  standalone: true,
  imports: [CommonModule, RouterLink, QuestionFeedbackComponent], // <-- ADD COMPONENT HERE
  templateUrl: './quiz-taking.component.html',
  styleUrls: ['./quiz-taking.component.scss']
})
export class QuizTakingComponent implements OnInit, OnDestroy, CanComponentDeactivate { // <-- IMPLEMENT INTERFACE
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dbService = inject(DatabaseService);
  private routeSub!: Subscription;

  // Timer related properties
  isTimerEnabled = false;        // <-- NEW
  timerDuration = 0;             // <-- NEW (in seconds)
  timeLeft$: Observable<number> | undefined; // <-- NEW (for display)
  private timerSubscription: Subscription | undefined; // <-- NEW
  protected _timeLeftSeconds = 0; // Internal tracking

  quizIsOverByTime = false; // Flag to indicate if quiz ended due to timer

  quizSettings!: QuizSettings & { keywords?: string[] }; // Modified QuizSettings to potentially hold keywords
  questions: Question[] = [];
  currentQuestionIndex = 0;
  quizTitle = 'Quiz'; // Default title, can be set based on quiz type
  currentQuestion: Question | undefined;
  userAnswers: AnsweredQuestion[] = [];
  unansweredQuestions: (AnsweredQuestion | undefined)[] = [];

  selectedAnswerIndex: number | null = null;
  isAnswerSubmitted = false;
  answerStates: AnswerState[] = [AnswerState.UNANSWERED, AnswerState.UNANSWERED, AnswerState.UNANSWERED, AnswerState.UNANSWERED];
  AnswerStateEnum = AnswerState; // Make enum available in template

  quizStartTime!: Date;
  quizCompleted = false; // NEW: Flag to track if quiz ended normally

  isLoading = true;
  errorLoading = '';

  currentQuizAttemptId: string | null = null; // To store the ID of the current attempt
  isResuming = false; // Flag to indicate if we are resuming a quiz
  quizStatus: QuizStatus = 'in-progress'; // Current status

  private showUsefulData(): void {
    console.log('Quiz status:', this.quizStatus);
    console.log('isLoading:', this.isLoading);
    console.log('Quiz completed:', this.quizCompleted);
    console.log('Questions loaded:', this.questions.length);
    console.log('errorLoading:', this.errorLoading);
    console.log('RESULT:', !this.quizCompleted && this.questions?.length > 0 && !this.isLoading && !this.errorLoading && this.quizStatus === 'in-progress');
  }

  ngOnInit(): void {
    this.quizStartTime = new Date(); // Set tentatively, might be overwritten by resumed quiz
    this.routeSub = this.route.queryParams.subscribe(async params => { // Make async
      const resumeAttemptId = params['resumeAttemptId']; // Check for resume ID
      const fixedQuestionIds = params['fixedQuestionIds'] || [];
      this.quizTitle = params['quizTitle'] || 'Quiz'; // Set quiz title from params

      //this.showUsefulData();
      if (resumeAttemptId) {
        this.isResuming = true;
        this.currentQuizAttemptId = resumeAttemptId;
        await this.loadPausedQuiz(resumeAttemptId); // Load and set up the paused quiz
      } else {
        // Inizia un nuovo quiz
        this.isResuming = false;
        this.currentQuizAttemptId = uuidv4(); // Generate ID for new quiz
        this.quizStatus = 'in-progress';

        // ... (parsing numQuestions, topics, keywords, topicDistribution) ...
        const numQuestions = params['numQuestions'] ? +params['numQuestions'] : 10;
        const topicsParam = params['topics'] || '';
        const selectedTopics = topicsParam ? topicsParam.split(',').filter((t: any) => t) : [];
        const keywordsParam = params['keywords'] || '';
        const selectedKeywords = keywordsParam ? keywordsParam.split(',').filter((kw: any) => kw) : [];
        const topicDistributionParam = params['topicDistribution'] || '';
        let selectedTopicDistribution: TopicCount[] | undefined = undefined;
        if (topicDistributionParam) { try { selectedTopicDistribution = JSON.parse(topicDistributionParam); } catch (e) { console.error('Error parsing topicDistribution:', e); } }

        this.isTimerEnabled = params['enableTimer'] === 'true'; // Convert string to boolean
        this.timerDuration = params['timerDuration'] ? +params['timerDuration'] : 0;
        this._timeLeftSeconds = this.timerDuration; // Initialize internal timer

        this.isTimerEnabled = params['enableTimer'] === 'true';
        this.timerDuration = params['timerDuration'] ? +params['timerDuration'] : 0;
        this._timeLeftSeconds = this.timerDuration;


        this.quizSettings = {
          numQuestions,
          selectedTopics,
          keywords: selectedKeywords,
          topicDistribution: selectedTopicDistribution,
          enableTimer: this.isTimerEnabled,         // Store in quizSettings
          timerDurationSeconds: this.timerDuration // Store in quizSettings
        };

        // Initial save of 'in-progress' state for a new quiz
        // This allows CanDeactivate to potentially save if user exits early even on a new quiz
        // Though for true "save on exit", CanDeactivate needs more work.
        // For now, primarily for the explicit "Pause" button.
        // Let's defer initial save until first action or pause, to keep ngOnInit cleaner.
        // OR save immediately:
        // const initialAttempt: QuizAttempt = {
        //   id: this.currentQuizAttemptId,
        //   timestampStart: this.quizStartTime,
        //   settings: this.quizSettings,
        //   totalQuestionsInQuiz: 0, // Will be updated after questions load
        //   answeredQuestions: [],
        //   status: 'in-progress',
        //   currentQuestionIndex: 0,
        // };
        // try {
        //    await this.dbService.saveQuizAttempt(initialAttempt);
        //    console.log('Initial in-progress quiz state saved.');
        // } catch (e) { console.error("Failed to save initial quiz state", e); }

        await this.loadQuestions(false, fixedQuestionIds); // Load questions for the new quiz
      }
    });
  }

  // Modify loadQuestions to handle resume
  async loadQuestions(isResumeLoad: boolean = false, fixedQuestionIds: string[] = []): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      // ... (console.log settings)
      if (!isResumeLoad) { // Only fetch new questions if not resuming (or if resume strategy is to re-fetch)

        if (fixedQuestionIds.length > 0) {
          console.log('Loading fixed questions:', fixedQuestionIds);
          this.questions = await this.dbService.getQuestionByIds(fixedQuestionIds);
        } else {
          const fetchedQuestions = await this.dbService.getRandomQuestions(
            this.quizSettings.numQuestions,
            this.quizSettings.selectedTopics,
            this.quizSettings.keywords,
            this.quizSettings.topicDistribution
          );
          // ... (handle fetchedQuestions, slicing, error if empty)
          this.questions = fetchedQuestions; // Or your slice logic
        }

        console.log('Fetched questions:', this.questions);

        if (this.quizSettings.topicDistribution && this.quizSettings.topicDistribution.length > 0) {
          this.quizSettings.numQuestions = this.questions.length;
        } else {
          this.questions = this.questions.slice(0, this.quizSettings.numQuestions);
        }
      } else {
        // On resume, `this.questions` should ideally be reconstructed from stored IDs
        // For now, we assume `loadPausedQuiz` prepared enough and `this.questions` are set
        // if we adopted a strategy of re-fetching them there.
        // If not, this branch needs to populate `this.questions` for the resume.
        // Let's assume `loadPausedQuiz` fetched and set `this.questions` if needed.
        // For the current simpler re-fetch strategy in `loadPausedQuiz`:

        let fetchedQuestionsOnResume = [];
        if (fixedQuestionIds.length > 0) {
          console.log('Loading fixed questions on RESUME:', fixedQuestionIds);
          fetchedQuestionsOnResume = await this.dbService.getQuestionByIds(fixedQuestionIds);
          this.isTimerEnabled = this.quizSettings.enableTimer || false;
          this.timerDuration = this.quizSettings.timerDurationSeconds || 0;
        } else {
          fetchedQuestionsOnResume = await this.dbService.getRandomQuestions(
            this.quizSettings.numQuestions,
            this.quizSettings.selectedTopics,
            this.quizSettings.keywords,
            this.quizSettings.topicDistribution
          );
        }

        this.questions = fetchedQuestionsOnResume; // This will get a new random set based on criteria
        // This is a limitation: the user won't get the exact same non-answered questions.
        // To fix this, `QuizAttempt` MUST store the `questionIds: string[]` for the *entire* quiz.
      }

      if (this.questions.length === 0) { /* ... error handling ... */ return; }

      // Crucially, on resume, currentQuestionIndex is already set from pausedAttempt
      // For a new quiz, it defaults to 0.
      // this.currentQuestionIndex = isResumeLoad ? this.currentQuestionIndex : 0; // Already handled by loadPausedQuiz

      if (this.questions.length > 0 && this.isTimerEnabled && this.timerDuration > 0) {
        this.startTimer();
      }
      this.setCurrentQuestion(); // Sets currentQuestion based on currentQuestionIndex

    } catch (error) { /* ... */ }
    finally {
      this.isLoading = false;
      //this.showUsefulData();

    }
  }

  // PAUSE QUIZ METHOD
  async pauseQuiz(): Promise<void> {
    if (!this.currentQuizAttemptId || this.quizCompleted) return;

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe(); // Stop the timer
      this.timerSubscription = undefined;
    }

    const isCurrentQuestionAnswered = this.userAnswers.some(ans => ans.questionId === this.currentQuestion?.id);
    if (!isCurrentQuestionAnswered && this.currentQuestion) {
      this.unansweredQuestions.push({
        questionId: this.currentQuestion.id,
        userAnswerIndex: -1, // No answer yet
        isCorrect: false,
        questionSnapshot: { // Take a snapshot of the question
          text: this.currentQuestion.text,
          topic: this.currentQuestion.topic,
          options: [...this.currentQuestion.options],
          correctAnswerIndex: this.currentQuestion.correctAnswerIndex,
          explanation: this.currentQuestion.explanation
        }
      });
    }

    this.quizStatus = 'paused';
    const attemptToSave: QuizAttempt = {
      id: this.currentQuizAttemptId,
      timestampStart: this.quizStartTime,
      // timestampEnd: undefined, // Not ended
      settings: this.quizSettings,
      // score: undefined, // Not scored yet
      totalQuestionsInQuiz: this.questions.length, // Or this.quizSettings.numQuestions
      answeredQuestions: [...this.userAnswers],
      unansweredQuestions: this.unansweredQuestions,
      allQuestions: this.questions.map(q => ({
        questionId: q.id,
        userAnswerIndex: -1, // No answer yet
        isCorrect: false,
        questionSnapshot: { // Take a snapshot of the question
          text: q.text,
          topic: q.topic,
          options: [...q.options],
          correctAnswerIndex: q.correctAnswerIndex,
          explanation: q.explanation,
          isFavorite: q.isFavorite || 0 // Default to false if undefined
        }
      })),
      status: 'paused',
      currentQuestionIndex: this.currentQuestionIndex,
      timeLeftOnPauseSeconds: this.isTimerEnabled ? this._timeLeftSeconds : undefined
    };

    try {
      await this.dbService.saveQuizAttempt(attemptToSave);
      console.log('Quiz paused and saved:', this.currentQuizAttemptId);
      alert('Quiz sospeso. Puoi riprenderlo più tardi dalla schermata principale.');
      this.quizCompleted = true; // To allow deactivation without confirm
      this.router.navigate(['/home']);
    } catch (error) {
      console.error("E' stato riscontrato un errore finché mettevo in pausa il quiz:", error);
      alert('Non sono riuscito a mettere in pausa il quiz. Riprova più tardi.');
    }
  }

  startTimer(): void {
    if (!this.isTimerEnabled || this.timerDuration <= 0) {
      console.warn('[QuizTaking] startTimer: Conditions not met or called unnecessarily.'); // <-- ADD LOG
      return;
    }
    console.log(`[QuizTaking] startTimer: Starting timer for ${this.timerDuration} seconds.`); // <-- VERIFY THIS LOG

    // Clear any existing timer subscription to prevent multiple timers
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      console.log('[QuizTaking] startTimer: Unsubscribed from previous timer.');
    }

    this.quizIsOverByTime = false; // Reset this flag
    this._timeLeftSeconds = this.timerDuration; // Ensure internal tracker is reset

    this.timeLeft$ = timer(0, 1000).pipe(
      map(i => {
        const remaining = this.timerDuration - 1 - i;
        // console.log(`[QuizTaking] Timer tick i=${i}, timerDuration=${this.timerDuration}, calculated remaining: ${remaining}`); // Original verbose log
        return remaining;
      }),
      takeWhile(timeLeft => timeLeft >= 0, true),
      finalize(() => { /* ... */ })
    );

    this.timerSubscription = this.timeLeft$.subscribe({
      next: timeLeftSeconds => {
        this._timeLeftSeconds = timeLeftSeconds;
        // THIS IS THE MOST IMPORTANT LOG NOW:
        console.log(`[QuizTaking] timeLeft$ emitted: ${timeLeftSeconds}. _timeLeftSeconds updated to: ${this._timeLeftSeconds}`);
      },
      error: err => console.error('[QuizTaking] Timer observable error:', err),
      complete: () => console.log('[QuizTaking] Timer observable completed (takeWhile condition met).')
    });
    console.log('[QuizTaking] startTimer: Subscribed to timeLeft$.');
  }

  shuffleArray(questions: string[]): string[] {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // random index from 0 to i
      [questions[i], questions[j]] = [questions[j], questions[i]];  // swap elements
    }
    return questions;
  }

  setCurrentQuestion(): void {
    if (this.questions.length > 0 && this.currentQuestionIndex < this.questions.length) {
      this.currentQuestion = this.questions[this.currentQuestionIndex]; // Ensure this includes isFavorite
      this.selectedAnswerIndex = this.userAnswers.find(ans => ans.questionId === this.currentQuestion!.id)?.userAnswerIndex || null;
      this.isAnswerSubmitted = this.userAnswers.some(ans => ans.questionId === this.currentQuestion!.id);
      const currentAnswer = this.userAnswers.find(ans => ans.questionId === this.currentQuestion!.id);

      // shuffle answers order but keep track of the correct answer index
      const correctAnswerString = this.currentQuestion.options[this.currentQuestion.correctAnswerIndex];

      this.currentQuestion.options = this.shuffleArray([...this.currentQuestion.options])

      this.currentQuestion.correctAnswerIndex = this.currentQuestion.options.findIndex(option => option === correctAnswerString);

      if (!currentAnswer) {
        this.answerStates = Array(this.currentQuestion.options.length).fill(AnswerState.UNANSWERED)
      } else {
        this.answerStates = this.currentQuestion.options.map((_, index) => {
          if (index === this.currentQuestion!.correctAnswerIndex) {
            return AnswerState.CORRECT;
          }
          if (index === currentAnswer.userAnswerIndex && !currentAnswer.isCorrect) {
            return AnswerState.INCORRECT;
          }
          return AnswerState.UNANSWERED; // Or a 'disabled' state visually
        }
        )
      }


      console.log('Current question set:', this.currentQuestion);
      console.log('Answer states:', this.answerStates[this.currentQuestionIndex]);
      console.log('Selected answer index:', this.selectedAnswerIndex);
      console.log('Is answer submitted:', this.isAnswerSubmitted);
    } else {
      this.currentQuestion = undefined; // Should not happen if logic is correct, leads to endQuiz
    }
  }

  async toggleFavoriteCurrentQuestion(): Promise<void> {
    if (this.currentQuestion) {
      const newFavStatus = await this.dbService.toggleFavoriteStatus(this.currentQuestion.id);
      if (newFavStatus !== undefined && this.currentQuestion) {
        this.currentQuestion.isFavorite = newFavStatus; // Update local copy for immediate UI feedback
        // Also update the question in the main 'this.questions' array if it's referenced elsewhere
        const qIndex = this.questions.findIndex(q => q.id === this.currentQuestion!.id);
        if (qIndex > -1) {
          this.questions[qIndex].isFavorite = newFavStatus;
        }
      }
    }
  }

  selectAnswer(optionIndex: number): void {
    if (this.isAnswerSubmitted || !this.currentQuestion) return;

    this.selectedAnswerIndex = optionIndex;
    this.isAnswerSubmitted = true;
    const isCorrect = optionIndex === this.currentQuestion.correctAnswerIndex;

    // Update answer states for visual feedback
    this.answerStates = this.currentQuestion.options.map((_, index) => {
      if (index === this.currentQuestion!.correctAnswerIndex) {
        return AnswerState.CORRECT;
      }
      if (index === optionIndex && !isCorrect) {
        return AnswerState.INCORRECT;
      }
      return AnswerState.UNANSWERED; // Or a 'disabled' state visually
    });

    this.userAnswers.push({
      questionId: this.currentQuestion.id,
      userAnswerIndex: optionIndex,
      isCorrect: isCorrect,
      questionSnapshot: { // Take a snapshot of the question
        text: this.currentQuestion.text,
        topic: this.currentQuestion.topic,
        options: [...this.currentQuestion.options],
        correctAnswerIndex: this.currentQuestion.correctAnswerIndex,
        explanation: this.currentQuestion.explanation
      }
    });

    if (this.currentQuestion) {
      this.unansweredQuestions = this.unansweredQuestions
        .filter((qst): qst is AnsweredQuestion => qst !== undefined && qst.questionId !== this.currentQuestion?.id);
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
    if (this.currentQuestionIndex < this.questions.length - 1) {
      if (!this.isAnswerSubmitted && !this.unansweredQuestions.some((qst): qst is AnsweredQuestion => qst !== undefined && qst.questionId === this.currentQuestion!.id)) {
        if (this.currentQuestion) {
          this.unansweredQuestions.push({
            questionId: this.currentQuestion.id,
            userAnswerIndex: -1, // No answer yet
            isCorrect: false,
            questionSnapshot: { // Take a snapshot of the question
              text: this.currentQuestion.text,
              topic: this.currentQuestion.topic,
              options: [...this.currentQuestion.options],
              correctAnswerIndex: this.currentQuestion.correctAnswerIndex,
              explanation: this.currentQuestion.explanation
            }
          });
        }
      }
      this.currentQuestionIndex++;
      this.setCurrentQuestion();
    } else {
      this.endQuiz();
    }
  }

  previousQuestion(): void {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.setCurrentQuestion();
    }
  }

  goToFirstUnansweredQuestion(): void {
    const firstUnansweredQuestionIndex: number = this.unansweredQuestions ? this.questions.findIndex((qst): qst is Question => qst !== undefined && this.unansweredQuestions && this.unansweredQuestions[0] !== undefined && qst.id === this.unansweredQuestions[0].questionId) : -1;
    // retrieve the of the latest answered question
    // if no unanswered question is found, go to the latest answered question
    const latestAnsweredQuestionIndex: number = this.userAnswers ? this.questions.findIndex((qst): qst is Question => qst !== undefined && this.userAnswers && this.userAnswers[this.userAnswers.length - 1] !== undefined && qst.id === this.userAnswers[this.userAnswers.length - 1].questionId) : -1;
    if (firstUnansweredQuestionIndex > -1) {
      this.currentQuestionIndex = firstUnansweredQuestionIndex;
    } else {
      if (latestAnsweredQuestionIndex > -1) {
        this.currentQuestionIndex = latestAnsweredQuestionIndex;
      } else {
        this.currentQuestionIndex = this.questions.length - 1; // Go to last question if no unanswered found
      }
    }
    this.setCurrentQuestion();
  }

  async endQuiz(isTimeUp: boolean = false): Promise<void> {
    if (this.quizCompleted) return; // Prevent multiple submissions
    this.quizCompleted = true;

    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = undefined;
    }

    if (!this.questions || this.questions.length === 0) {
      // Avoid ending quiz if no questions were loaded (e.g., due to error)
      // Redirect back or show error
      this.router.navigate(['/quiz/setup']);
      return;
    }
    const quizEndTime = new Date();
    const score = this.userAnswers.filter(ans => ans.isCorrect).length;
    const finalQuizSettings = { ...this.quizSettings };

    if (this.isTimerEnabled) {
      finalQuizSettings.enableTimer = true;
      finalQuizSettings.timerDurationSeconds = this.timerDuration;
    }

    // Ensure currentQuizAttemptId is used
    if (!this.currentQuizAttemptId) {
      console.error("Cannot end quiz, currentQuizAttemptId is missing!");
      // Potentially generate one if starting fresh and it was missed
      this.currentQuizAttemptId = uuidv4();
    }


    const quizAttempt: QuizAttempt = {
      id: this.currentQuizAttemptId!,
      timestampStart: this.quizStartTime,
      timestampEnd: quizEndTime,
      settings: finalQuizSettings,
      score: score,
      totalQuestionsInQuiz: this.questions.length,
      answeredQuestions: [...this.userAnswers],
      unansweredQuestions: this.unansweredQuestions,
      allQuestions: this.questions.map(q => ({
        questionId: q.id,
        userAnswerIndex: -1, // No answer yet
        isCorrect: false,
        questionSnapshot: { // Take a snapshot of the question
          text: q.text,
          topic: q.topic,
          options: [...q.options],
          correctAnswerIndex: q.correctAnswerIndex,
          explanation: q.explanation,
          isFavorite: q.isFavorite || 0 // Default to false if undefined
        }
      })),
      status: isTimeUp ? 'timed-out' : 'completed',
      currentQuestionIndex: this.currentQuestionIndex, // Store final index for context
    };

    this.quizCompleted = true; // <-- SET FLAG WHEN QUIZ ENDS
    try {
      await this.dbService.saveQuizAttempt(quizAttempt); // Save the attempt first
      console.log('Quiz attempt saved with ID:', quizAttempt.id);

      // NOW, update individual question statistics
      for (const answeredQ of this.userAnswers) { // Iterate over answers *from this quiz*
        await this.dbService.updateQuestionStats(answeredQ.questionId, answeredQ.isCorrect);
      }
      console.log('Individual question stats updated.');

      this.router.navigate(['/quiz/results', quizAttempt.id]);
    } catch (error) {
      console.error('Error ending quiz or updating stats:', error);
      // Handle error (e.g., show message to user)
      this.router.navigate(['/home']); // Fallback navigation
    }

  }

  // Make sure to unsubscribe from timer on component destroy
  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  formatTimeLeft(seconds: number): string {
    if (seconds < 0) seconds = 0; // Ensure no negative display
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const pad = (n: number) => n < 10 ? '0' + n : n.toString();
    return `${pad(mins)}:${pad(secs)}`;
  }

  // Modify canDeactivate for pause scenario
  canDeactivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (this.quizCompleted || this.quizStatus === 'paused' || this.questions.length === 0 || this.isLoading || this.errorLoading) {
      return true; // Allow deactivation if quiz is done, paused, or not properly started
    }

    const confirmation = confirm(
      "Si è sicuri di voler abbandonare il quiz? " +
      "Il tuo progresso attuale NON verrà salvato a meno che non metti in pausa. " +
      'Clicca "OK" per abbandonare senza salvare, o "Annulla" per rimanere e usare il pulsante "Metti in pausa il quiz". '
    );
    // If user clicks OK, they abandon. If Cancel, they stay.
    // The "Pause Quiz" button is the explicit way to save progress.
    return confirmation;
  }

  // Optional: Handle browser refresh/close attempts (more limited than router navigation)
  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any): void {
    if (!this.quizCompleted && this.questions.length > 0 && !this.isLoading && !this.errorLoading) {
      $event.returnValue = true; // Standard way to trigger browser's own confirmation
    }
  }

  async loadPausedQuiz(attemptId: string): Promise<void> {
    this.isLoading = false;
    try {
      const pausedAttempt = await this.dbService.getQuizAttemptById(attemptId);
      if (pausedAttempt && pausedAttempt.status === 'paused') {
        this.quizSettings = pausedAttempt.settings;
        this.questions = (pausedAttempt.unansweredQuestions as AnsweredQuestion[]).concat(pausedAttempt.answeredQuestions).map(q => ({
          id: q.questionId,
          text: q.questionSnapshot.text,
          topic: q.questionSnapshot.topic,
          options: q.questionSnapshot.options,
          correctAnswerIndex: q.questionSnapshot.correctAnswerIndex,
          explanation: q.questionSnapshot.explanation,
          isFavorite: q.questionSnapshot.isFavorite || 0 // Default to false if undefined
        }));

        const fixedQuestionIds: string[] = this.questions.map(q => q.id); // Store IDs for potential re-fetching

        this.userAnswers = pausedAttempt.answeredQuestions;
        this.currentQuestionIndex = pausedAttempt.currentQuestionIndex || 0;
        this.quizStartTime = new Date(pausedAttempt.timestampStart); // Restore start time
        this.currentQuizAttemptId = pausedAttempt.id;
        this.quizStatus = 'in-progress'; // Change status back


        // Re-fetch questions based on settings (or use snapshots if you stored full question data in QuizAttempt)
        // For simplicity, re-fetching ensures consistency with current question bank.
        // If questions were stored in snapshot, we'd need to populate this.questions from those.
        // For now, assuming we just need the IDs and settings to re-fetch/re-filter.
        // This also means the *exact same* random questions might not appear if re-shuffling.
        // To get exact same questions, QuizAttempt would need to store the question IDs.
        // Let's assume for now we'll re-fetch based on settings, and `answeredQuestions` has snapshots.
        // OR, if your `QuizAttempt.answeredQuestions` store full `Question` snapshots,
        // and you also stored ALL questions for the quiz in QuizAttempt, you could reconstruct.
        //
        // Simpler approach for now: re-fetch questions according to settings,
        // but the user's progress (answeredQuestions, currentQuestionIndex) is restored.
        // This means the specific non-answered questions might change if `getRandomQuestions` is truly random.
        //
        // A better approach for "exact resume":
        // 1. When a quiz starts, fetch all `Question` objects and store their IDs in `QuizAttempt`.
        // 2. On resume, fetch these specific questions by ID.
        // For now, we'll stick to re-fetching based on settings which is simpler but less "exact".

        // const allQuestionsForQuiz = await this.dbService.getRandomQuestions(
        //   this.quizSettings.numQuestions,
        //   this.quizSettings.selectedTopics,
        //   this.quizSettings.keywords,
        //   this.quizSettings.topicDistribution
        // );
        // We need to ensure the `this.questions` array is populated in a way that respects the original quiz structure.
        // This part is tricky if `getRandomQuestions` is purely random.
        // A robust resume needs the original list of question IDs for the attempt.
        //
        // Let's simplify: Assume `QuizAttempt.totalQuestionsInQuiz` was set correctly.
        // We will just re-run loadQuestions and then set current index.
        // This means `this.questions` will be repopulated.

        this.isTimerEnabled = this.quizSettings.enableTimer || false;
        if (this.isTimerEnabled) {
          this.timerDuration = pausedAttempt.timeLeftOnPauseSeconds || this.quizSettings.timerDurationSeconds || 0;
          this._timeLeftSeconds = this.timerDuration; // Set for display and timer start
          this.startTimer(); // Start the timer with the remaining time
        } else {
          pausedAttempt.timeLeftOnPauseSeconds = undefined;
        }

        // Update status in DB to 'in-progress'
        pausedAttempt.status = 'in-progress';
        await this.dbService.saveQuizAttempt(pausedAttempt);

        console.log('Resuming quiz. Settings:', this.quizSettings);
        this.questions = pausedAttempt.allQuestions.map(q => ({
          id: q.questionId,
          text: q.questionSnapshot.text,
          topic: q.questionSnapshot.topic,
          options: q.questionSnapshot.options,
          correctAnswerIndex: q.questionSnapshot.correctAnswerIndex,
          explanation: q.questionSnapshot.explanation,
          isFavorite: q.questionSnapshot.isFavorite || 0 // Default to false if undefined
        }));
        this.currentQuestionIndex = pausedAttempt.currentQuestionIndex || 0;
        this.userAnswers = pausedAttempt.answeredQuestions;
        this.unansweredQuestions = pausedAttempt.unansweredQuestions;
        this.goToFirstUnansweredQuestion(); // Optional: Navigate to first unanswered question
        console.log('Paused quiz loaded:', pausedAttempt);

      } else {
        console.error('Paused quiz not found or status is not paused. Starting new quiz.');
        this.isResuming = false;
        this.currentQuizAttemptId = uuidv4(); // New ID
        // Fallback to load new quiz based on original params (might be lost if direct navigation)
        // Ideally redirect to setup or home.
        this.router.navigate(['/quiz/setup'], { queryParamsHandling: 'preserve' });
      }
    } catch (error) {
      console.error('Error loading paused quiz:', error);
      this.errorLoading = "Failed to resume quiz.";
    } finally {
      // isLoading will be set to false by loadQuestions
    }
  }
}