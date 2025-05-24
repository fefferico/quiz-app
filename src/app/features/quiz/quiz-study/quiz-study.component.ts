// src/app/features/quiz/quiz-study/quiz-study.component.ts
import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';

import { DatabaseService } from '../../../core/services/database.service';
import { Question } from '../../../models/question.model';
// QuizSettings and TopicCount might be needed if complex filtering is passed
import { QuizSettings } from '../../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome, faArrowRight, faArrowLeft, faGears } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { ContestSelectionService } from '../../../core/services/contest-selection.service';
import { SpinnerService } from '../../../core/services/spinner.service';
import { Contest } from '../../../models/contes.model';
import { AlertComponent } from '../../../shared/alert/alert.component';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-quiz-study',
  standalone: true,
  imports: [CommonModule, RouterLink, FontAwesomeModule],
  templateUrl: './quiz-study.component.html',
  styleUrls: ['./quiz-study.component.scss']
})
export class QuizStudyComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dbService = inject(DatabaseService);
  private routeSub!: Subscription;
  private destroy$ = new Subject<void>();
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service
  private spinnerService = inject(SpinnerService);
  private alertService = inject(AlertService);

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously
  next: IconDefinition = faArrowRight;
  back: IconDefinition = faArrowLeft;
  faGears: IconDefinition = faGears;

  // Re-use parts of QuizSettings for fetching
  studySettings!: Partial<QuizSettings>; // totalQuestionsInQuiz, selectedTopics, keywords
  questions: Question[] = [];
  currentQuestionIndex = 0;
  currentQuestion: Question | undefined;

  isLoading = true;
  errorLoading = '';

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  private navigationState: any; // Added to store navigation state
  constructor() {
    // Access navigation state in the constructor
    const currentNavigation = this.router.getCurrentNavigation();
    this.navigationState = currentNavigation?.extras.state;
  }

  // --- HostListeners for Keyboard Navigation ---
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Prevent default for keys we handle to avoid page scroll, etc.
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', '1', '2', '3', '4', '5'].includes(event.key)) {
      event.preventDefault();
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
    }
  }

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });
    this.routeSub = this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(async queryOnlyParams => { // Renamed to avoid confusion
        // Use the stored navigationState first, then fallback to queryParams
        const actualParams = this.navigationState?.['quizParams'] || queryOnlyParams;
        const numQuestionsParam = actualParams['totalQuestionsInQuiz'] ? +actualParams['totalQuestionsInQuiz'] : 9999; // Default to many for "all"
        const topicsParam = actualParams['topics'] || '';
        const selectedTopics = topicsParam ? topicsParam.split(',').filter((t: any) => t) : [];
        const keywordsParam = actualParams['keywords'] || '';
        const fixedQuestionIds = actualParams['fixedQuestionIds'] || '';
        const selectedKeywords = keywordsParam ? keywordsParam.split(',').filter((kw: any) => kw) : [];
        const selectedQuestions = fixedQuestionIds ? fixedQuestionIds.split(',').filter((kw: any) => kw) : [];

        this.studySettings = {
          totalQuestionsInQuiz: numQuestionsParam,
          selectedTopics,
          keywords: selectedKeywords,
          questionIDs: selectedQuestions
        };
        this.loadStudyQuestions(this.studySettings);
      });
  }

  async loadStudyQuestions(quizSettings: Partial<QuizSettings>): Promise<void> {
    if (this.selectedPublicContest === null ){
      this.alertService.showAlert("Errore", "Non è stata selezionata alcuna banca dati valida.");
      return;
    }

    this.isLoading = true;
    this.errorLoading = '';
    this.spinnerService.show("Recupero domande da studiare in corso...");
    try {
      console.log('[StudyMode] Loading questions with settings:', this.studySettings);
      // Use getRandomQuestions, but 'count' might be very high to fetch all matching
      // Or create a new DB method: getFilteredQuestions(topics, keywords) that returns all matches
      let fetchedQuestions = await this.dbService.getRandomQuestions(
        this.selectedPublicContest.id,
        quizSettings.totalQuestionsInQuiz!, // Non-null assertion as we set a default
        quizSettings.selectedTopics,
        quizSettings.keywords,
        quizSettings.questionIDs,
        // No topicDistribution for simple study mode for now
      );

      // If totalQuestionsInQuiz was set high for "all", slice if you only want to show a certain max,
      // or just take all that were returned.
      // For study mode, usually we want all that match the criteria.
      // So, `this.studySettings.totalQuestionsInQuiz` might be better interpreted as a "max limit" if not "all".
      // Let's assume getRandomQuestions already handles slicing if count is less than available.
      this.questions = fetchedQuestions;

      if (this.questions.length === 0) {
        this.errorLoading = "Nessuna domanda trovata per i criteri selezionati.";
        this.isLoading = false;
        this.spinnerService.hide();
        return;
      }
      this.currentQuestionIndex = 0;
      this.setCurrentStudyQuestion();
    } catch (error) {
      console.error('Error loading study questions:', error);
      this.errorLoading = 'Failed to load questions for study. Please try again.';
    } finally {
      this.isLoading = false;
      this.spinnerService.hide();
    }
  }

  setCurrentStudyQuestion(): void {
    if (this.questions.length > 0 && this.currentQuestionIndex < this.questions.length) {
      this.currentQuestion = this.questions[this.currentQuestionIndex];
    } else {
      this.currentQuestion = undefined;
    }
  }

  nextQuestion(): void {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      this.currentQuestionIndex++;
      this.setCurrentStudyQuestion();
    }
    console.log("currentQuestionIndex", this.currentQuestionIndex);
    console.log("questions", this.questions.length);
    console.log("isLoading", this.isLoading);
    console.log("errorLoading", this.errorLoading);
  }

  previousQuestion(): void {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.setCurrentStudyQuestion();
    }
  }

  async toggleFavoriteCurrentQuestion(): Promise<void> {
    if (this.currentQuestion) {
      const newFavStatus = await this.dbService.toggleFavoriteStatus(this.currentQuestion.id);
      if (newFavStatus !== undefined && this.currentQuestion) {
        this.currentQuestion.isFavorite = newFavStatus;
        const qIndex = this.questions.findIndex(q => q.id === this.currentQuestion!.id);
        if (qIndex > -1) {
          this.questions[qIndex].isFavorite = newFavStatus;
        }
      }
    }
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}