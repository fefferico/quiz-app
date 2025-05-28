import { inject, Injectable } from '@angular/core';
import { QuizAttempt } from '../../models/quiz.model';
import { Router } from '@angular/router';
import { AlertService } from '../../services/alert.service';
import { AuthService } from './auth.service';
import { ContestSelectionService } from './contest-selection.service';
import { DatabaseService } from './database.service';
import { SpinnerService } from './spinner.service';

@Injectable({
  providedIn: 'root'
})
export class QuestionService {

  private router = inject(Router);
  private dbService = inject(DatabaseService);
  private alertService = inject(AlertService);
  private contestSelectionService = inject(ContestSelectionService); // Inject ContestSelectionService
  private authService = inject(AuthService);
  spinnerService = inject(SpinnerService);

  allQuizAttempts: QuizAttempt[] = []; // Store all attempts fetched from DB

  constructor() {
    this.contestSelectionService.selectedContest$.subscribe(contest => {
      // Handle contest changes here
      console.log('Selected contest changed:', contest);
      if (contest && contest.id !== undefined) {
        this.reloadQuizAttempts(contest.id, this.authService.getCurrentUserId());
      }
    });
  }

  async reloadQuizAttempts(contestId: number, userId: number): Promise<void> {
    this.allQuizAttempts = await this.dbService.getAllQuizAttemptsByContest(contestId, userId);
  }


  async repeatQuiz(quizAttemptId: string): Promise<void> { // Make async if dbService calls are async
    let currentAttempt: QuizAttempt | undefined = this.allQuizAttempts.find(att => att.id === quizAttemptId);
    if (!currentAttempt) {
      const currentContest = this.contestSelectionService.checkForContest();
      if (!currentContest) {
        return;
      }
      await this.reloadQuizAttempts(currentContest.id, this.authService.getCurrentUserId());
      currentAttempt = this.allQuizAttempts.find(att => att.id === quizAttemptId);
      if (!currentAttempt) {
        return;
      }
    }
    const questionIds = currentAttempt.allQuestions.map(qInfo => qInfo.questionId);
    if (questionIds.length === 0) {
      this.alertService.showAlert("Attenzione", "Nessuna domanda trovata in questo tentativo da ripetere.").then(() => {
        return;
      })
    } else {
      this.onInternalSubmit(currentAttempt, questionIds);
    }
  }

  async repeatWrongQuiz(quizAttemptId: string): Promise<void> { // Make async
    const currentAttempt: QuizAttempt | undefined = this.allQuizAttempts.find(att => att.id === quizAttemptId);
    if (!currentAttempt) return;

    const wrongOrUnansweredQuestionIds = currentAttempt.allQuestions
      .filter(qInfo => {
        const answeredInfo = currentAttempt!.answeredQuestions.find(aq => aq.questionId === qInfo.questionId);
        return !answeredInfo || !answeredInfo.isCorrect; // Not in answeredQuestions OR isCorrect is false
      })
      .map(qInfo => qInfo.questionId);

    if (!wrongOrUnansweredQuestionIds || wrongOrUnansweredQuestionIds.length === 0) {
      this.alertService.showAlert("Attenzione", "Nessuna domanda sbagliata o non risposta in questo tentativo. Ottimo lavoro!").then(() => {
        return;
      })
    } else {
      currentAttempt.settings.quizType = 'Revisione errori';
      currentAttempt.settings.quizTitle = 'Revisione domande sbagliate';
      this.onInternalSubmit(currentAttempt, wrongOrUnansweredQuestionIds);
    }
  }

  private onInternalSubmit(originalAttempt: QuizAttempt | undefined, questionIdsToRepeat?: string[]): void {
    if (!originalAttempt) return;

    const settings = originalAttempt.settings;
    const idsToUse = questionIdsToRepeat && questionIdsToRepeat.length > 0
      ? questionIdsToRepeat
      : originalAttempt.allQuestions.map(q => q.questionId);

    if (idsToUse.length === 0) {
      alert("Nessuna domanda specificata per il nuovo quiz.");
      return;
    }

    const shuffledQuestionIds = [...idsToUse].sort(() => 0.5 - Math.random());

    const
      queryParams = {
        ...settings,
        quizTitle: `${settings.quizTitle || 'Quiz Misto'}`,
        quizType: `${settings.quizType || 'Quiz Misto'}`,
        selectedTopics: settings.selectedTopics?.join(', '),
        totalQuestionsInQuiz: shuffledQuestionIds.length, // totalQuestionsInQuiz is now the count of selected IDs
        enableTimer: false, // Typically disable timer for review/repeat quizzes
        fixedQuestionIds: shuffledQuestionIds.join(','), // Pass the specific IDs
      } as Partial<QuizAttempt>;

    let navigateToPath = '/quiz/take'; // Default path
    console.log(`Navigating to ${navigateToPath} with queryParams:`, queryParams);
    this.router.navigate([navigateToPath], { state: { quizParams: queryParams } });

  }
}
