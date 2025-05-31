// src/app/pages/study-focus/study-focus.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, PercentPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { Question } from '../../models/question.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome, faBarChart, faLandmark } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { QuizSettings } from '../../models/quiz.model';
import { ContestSelectionService } from '../../core/services/contest-selection.service';
import { AlertService } from '../../services/alert.service';
import { Contest } from '../../models/contes.model';

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
  imports: [CommonModule, RouterLink, PercentPipe, FontAwesomeModule],
  templateUrl: './study-focus.component.html',
  styleUrls: ['./study-focus.component.scss']
})
export class StudyFocusComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously
  faBarChart: IconDefinition = faBarChart; // This was already here, seems unused in the template you showed previously
  faLandmark: IconDefinition = faLandmark; // This was already here, seems unused in the template you showed previously

  isLoading = true;
  allQuestionsWithStats: CategorizedQuestion[] = [];
  questionGroups: QuestionGroup[] = [];

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  // Define categories and their thresholds (failure rate: 0.0 to 1.0)
  // Order matters for display
  readonly categories = [
    { name: 'Molto difficili', min: 0.75, max: 1.01, description: 'Spesso risposte in modo errato. Dai priorità a queste!', cssClass: 'border-red-500 bg-red-50', ctaLabel: 'Pratica Domande Difficili' },
    { name: 'Da rivedere', min: 0.40, max: 0.75, description: 'Le sbagli abbastanza spesso. Buono da rivedere.', cssClass: 'border-yellow-500 bg-yellow-50', ctaLabel: 'Rivedi Queste' },
    { name: 'Così così', min: 0.15, max: 0.40, description: 'Per lo più bene, ma qualche scivolone occasionale.', cssClass: 'border-blue-500 bg-blue-50', ctaLabel: 'Pratica Queste' },
    { name: 'Le sai molto bene', min: 0.0, max: 0.15, description: 'Eccellente! Le sbagli raramente.', cssClass: 'border-green-500 bg-green-50', ctaLabel: 'Ripasso Veloce (Opzionale)' }
  ];
  protected readonly MIN_ATTEMPTS_FOR_CATEGORY = 3; // Min attempts before categorizing a question

  ngOnInit(): void {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    this.loadAndCategorizeQuestions(currentContest.id);
  }

  async loadAndCategorizeQuestions(contestId: number): Promise<void> {
    this.isLoading = true;
    try {
      const questionsFromDb = await this.dbService.getAllQuestions(contestId);
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
    let navigateToPath = '/quiz/take'; // Default path

    let quizSettings: Partial<QuizSettings> = {}; // Use Partial as some fields are mode-dependent
    quizSettings = {
      totalQuestionsInQuiz: questionIds.length,
      selectedTopics: [], // Empty means all if selectAllTopics is true
      enableTimer: false,
      timerDurationSeconds: 0
    };

    this.router.navigate([navigateToPath], { // Use dynamic path
      queryParams: {
        totalQuestionsInQuiz: quizSettings.totalQuestionsInQuiz, // Could be very large for "all" in study mode
        topics: quizSettings.selectedTopics?.join(','),
        keywords: '',
        // For quiz mode, pass other relevant params
        topicDistribution: quizSettings.topicDistribution ? quizSettings.topicDistribution : [],
        enableTimer: false,
        timerDurationSeconds: 0,
        // get specific question id
        fixedQuestionIds: questionIds
      }
    });
  }
}
