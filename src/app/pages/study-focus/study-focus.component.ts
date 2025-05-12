// src/app/pages/study-focus/study-focus.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, PercentPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { Question } from '../../models/question.model';

interface CategorizedQuestion extends Question {
  failureRate: number;
  totalAttempts: number;
}

interface QuestionGroup {
  categoryName: string;
  description: string;
  questions: CategorizedQuestion[];
  thresholdMin: number; // Inclusive
  thresholdMax: number; // Exclusive for upper, inclusive for lower for "Very Well"
  ctaLabel?: string;
  cssClass?: string;
}

@Component({
  selector: 'app-study-focus',
  standalone: true,
  imports: [CommonModule, RouterLink, PercentPipe],
  templateUrl: './study-focus.component.html',
  styleUrls: ['./study-focus.component.scss']
})
export class StudyFocusComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  isLoading = true;
  allQuestionsWithStats: CategorizedQuestion[] = [];
  questionGroups: QuestionGroup[] = [];

  // Define categories and their thresholds (failure rate: 0.0 to 1.0)
  // Order matters for display
  readonly categories = [
    { name: 'Very Difficult', min: 0.75, max: 1.01, description: 'Often answered incorrectly. Prioritize these!', cssClass: 'border-red-500 bg-red-50', ctaLabel: 'Practice Difficult Questions' },
    { name: 'Should Check More', min: 0.40, max: 0.75, description: 'You miss these a fair bit. Good to review.', cssClass: 'border-yellow-500 bg-yellow-50', ctaLabel: 'Review These' },
    { name: 'Sometimes You Fail', min: 0.15, max: 0.40, description: 'Mostly good, but occasional slips.', cssClass: 'border-blue-500 bg-blue-50', ctaLabel: 'Practice These' },
    { name: 'Know Them Very Well', min: 0.0, max: 0.15, description: 'Excellent! You rarely miss these.', cssClass: 'border-green-500 bg-green-50', ctaLabel: 'Quick Refresh (Optional)' }
  ];
  protected readonly MIN_ATTEMPTS_FOR_CATEGORY = 3; // Min attempts before categorizing a question


  ngOnInit(): void {
    this.loadAndCategorizeQuestions();
  }

  async loadAndCategorizeQuestions(): Promise<void> {
    this.isLoading = true;
    try {
      const questionsFromDb = await this.dbService.getAllQuestions();
      this.allQuestionsWithStats = questionsFromDb
        .map(q => {
          const timesCorrect = q.timesCorrect || 0;
          const timesIncorrect = q.timesIncorrect || 0;
          const totalAttempts = timesCorrect + timesIncorrect;
          const failureRate = totalAttempts > 0 ? timesIncorrect / totalAttempts : 0; // Default to 0 if no attempts
          return { ...q, failureRate, totalAttempts };
        })
        .filter(q => q.totalAttempts >= this.MIN_ATTEMPTS_FOR_CATEGORY); // Only categorize if attempted enough times

      this.groupQuestionsIntoCategories();

    } catch (error) {
      console.error("Error loading questions for study focus:", error);
    } finally {
      this.isLoading = false;
    }
  }

  groupQuestionsIntoCategories(): void {
    this.questionGroups = this.categories.map(cat => {
      const group: QuestionGroup = {
        categoryName: cat.name,
        description: cat.description,
        questions: this.allQuestionsWithStats.filter(q =>
          q.failureRate >= cat.min && q.failureRate < cat.max
        ).sort((a, b) => b.failureRate - a.failureRate), // Sort by most failed first within group
        thresholdMin: cat.min,
        thresholdMax: cat.max,
        ctaLabel: cat.ctaLabel,
        cssClass: cat.cssClass
      };
      return group;
    }).filter(group => group.questions.length > 0); // Only show groups that have questions
  }

  startPracticeQuiz(questionsToPractice: CategorizedQuestion[]): void {
    if (!questionsToPractice || questionsToPractice.length === 0) return;

    // We need to pass question IDs to QuizSetup or directly to QuizTaking
    // For now, let's assume QuizSetup can handle a list of specific question IDs
    const questionIds = questionsToPractice.map(q => q.id);

    // Option 1: Navigate to QuizSetup with pre-filled specific question IDs (more flexible)
    // This would require QuizSetupComponent to accept and handle a 'questionIds' query param.
    // this.router.navigate(['/quiz/setup'], { queryParams: { specificQuestionIds: questionIds.join(',') } });

    // Option 2: Directly to QuizTaking (simpler for this specific flow but less setup options)
    // QuizTaking would need to be able to fetch questions by an array of IDs.
    // For now, let's log and plan this navigation.
    console.log("Start quiz with specific questions:", questionIds);
    alert(`Feature to start quiz with these ${questionIds.length} questions is a next step! IDs: ${questionIds.join(', ')}`);
    // For now, as a placeholder, navigate to setup
    // this.router.navigate(['/quiz/setup']);

    // To implement this properly, DatabaseService would need a `getQuestionsByIds(ids: string[]): Promise<Question[]>`
    // And QuizTakingComponent would need to accept `questionIds` in queryParams
    // and call this new service method in its `loadQuestions`.
    // Let's simulate passing to QuizSetup which then might pass to QuizTaking.
    // This requires QuizSetupComponent to handle a `fixedQuestionIds` param.
    // We can implement this later.
  }
}