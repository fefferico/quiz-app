// src/app/features/quiz/quiz-study/quiz-study.component.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { DatabaseService } from '../../../core/services/database.service';
import { Question } from '../../../models/question.model';
// QuizSettings and TopicCount might be needed if complex filtering is passed
import { QuizSettings } from '../../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { ContestSelectionService } from '../../../core/services/contest-selection.service';

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
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously

  // Re-use parts of QuizSettings for fetching
  studySettings!: Partial<QuizSettings>; // numQuestions, selectedTopics, keywords
  questions: Question[] = [];
  currentQuestionIndex = 0;
  currentQuestion: Question | undefined;

  isLoading = true;
  errorLoading = '';

  // Getter to easily access the contest from the template
  get selectedPublicContest(): string {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe(params => {
      const numQuestionsParam = params['numQuestions'] ? +params['numQuestions'] : 9999; // Default to many for "all"
      const topicsParam = params['topics'] || '';
      const selectedTopics = topicsParam ? topicsParam.split(',').filter((t: any) => t) : [];
      const keywordsParam = params['keywords'] || '';
      const fixedQuestionIds = params['fixedQuestionIds'] || '';
      const selectedKeywords = keywordsParam ? keywordsParam.split(',').filter((kw: any) => kw) : [];
      const selectedQuestions = fixedQuestionIds ? fixedQuestionIds.split(',').filter((kw: any) => kw) : [];

      this.studySettings = {
        numQuestions: numQuestionsParam,
        selectedTopics,
        keywords: selectedKeywords,
        questionIDs: selectedQuestions
      };
      this.loadStudyQuestions(this.studySettings);
    });
  }

  async loadStudyQuestions(quizSettings: Partial<QuizSettings>): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      console.log('[StudyMode] Loading questions with settings:', this.studySettings);
      // Use getRandomQuestions, but 'count' might be very high to fetch all matching
      // Or create a new DB method: getFilteredQuestions(topics, keywords) that returns all matches
      let fetchedQuestions = await this.dbService.getRandomQuestions(
        this.selectedPublicContest,
        quizSettings.numQuestions!, // Non-null assertion as we set a default
        quizSettings.selectedTopics,
        quizSettings.keywords,
        quizSettings.questionIDs,
        // No topicDistribution for simple study mode for now
      );

      // If numQuestions was set high for "all", slice if you only want to show a certain max,
      // or just take all that were returned.
      // For study mode, usually we want all that match the criteria.
      // So, `this.studySettings.numQuestions` might be better interpreted as a "max limit" if not "all".
      // Let's assume getRandomQuestions already handles slicing if count is less than available.
      this.questions = fetchedQuestions;

      if (this.questions.length === 0) {
        this.errorLoading = "Nessuna domanda trovata per i criteri selezionati.";
        this.isLoading = false;
        return;
      }
      this.currentQuestionIndex = 0;
      this.setCurrentStudyQuestion();
    } catch (error) {
      console.error('Error loading study questions:', error);
      this.errorLoading = 'Failed to load questions for study. Please try again.';
    } finally {
      this.isLoading = false;
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

  prevQuestion(): void {
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
  }
}