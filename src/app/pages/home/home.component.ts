// src/app/pages/home/home.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings } from '../../models/quiz.model';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faSun, faMoon, faAdjust, faHome, IconDefinition, faAdd, faHistory, faBarChart, faMagnifyingGlass, faStar, faRepeat, faExclamation, faUndo } from '@fortawesome/free-solid-svg-icons'; // Added faUndo
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { SetupModalComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, SimpleModalComponent,
    SetupModalComponent, FontAwesomeModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';
  topics: GenericData[] = [];

  // icons
  faAdd: IconDefinition = faAdd;
  faHistory: IconDefinition = faHistory;
  faBarChart: IconDefinition = faBarChart;
  faMagnifyingGlass: IconDefinition = faMagnifyingGlass;
  faStar: IconDefinition = faStar;
  faRepeat: IconDefinition = faRepeat;
  faExclamation: IconDefinition = faExclamation;
  faUndoAlt: IconDefinition = faUndo; // Icon for yesterday's review

  pausedQuiz: QuizAttempt | undefined;
  yesterdayProblematicQuestionIds: string[] = []; // Store IDs
  todayProblematicQuestionIds: string[] = []; // Store IDs

  ngOnInit(): void {
    this.checkForPausedQuiz();
    this.loadYesterdayProblematicQuestions(); // Load on init
    this.loadTodayProblematicQuestions(); // Load on init
  }

  async checkForPausedQuiz(): Promise<void> {
    this.pausedQuiz = await this.dbService.getPausedQuiz();
  }

  resumePausedQuiz(): void {
    if (this.pausedQuiz) {
      this.router.navigate(['/quiz/take'], { queryParams: { resumeAttemptId: this.pausedQuiz.id } });
    }
  }

  async loadYesterdayProblematicQuestions(): Promise<void> { // Renamed for clarity
    this.yesterdayProblematicQuestionIds = await this.dbService.getYesterdayProblematicQuestionIds();
    // console.log('Yesterday problematic IDs:', this.yesterdayProblematicQuestionIds);
  }

  async loadTodayProblematicQuestions(): Promise<void> { // Renamed for clarity
    this.todayProblematicQuestionIds = await this.dbService.getTodayProblematicQuestionIds();
    // console.log('Yesterday problematic IDs:', this.todayProblematicQuestionIds);
  }



  async startYesterdayProblematicQuiz(): Promise<void> {
    if (this.yesterdayProblematicQuestionIds.length > 0) {
      const questionsForModal = await this.dbService.getYesterdayProblematicQuestion();
      const topicsMap = new Map<string, { count: number, questionIds: string[] }>();
      questionsForModal.forEach(q => {
        const topic = q.topic || 'Uncategorized';
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
      this.topics = Array.from(topicsMap.entries()).map(([topicName, data]) => ({
        topic: topicName,
        count: data.count,
        questionIds: data.questionIds
      }));

      this.quizSetupModalTitle = 'Rivedi Errori di IERI';
      console.log(questionsForModal)
      this.openQuizSetupModal();
    } else {
      alert("Nessuna domanda problematica trovata per IERI. Ottimo lavoro!");
    }
  }

  async startTodayProblematicQuiz(): Promise<void> {
    if (this.todayProblematicQuestionIds.length > 0) {
      const questionsForModal = await this.dbService.getTodayProblematicQuestion();
      const topicsMap = new Map<string, { count: number, questionIds: string[] }>();
      questionsForModal.forEach(q => {
        const topic = q.topic || 'Uncategorized';
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
      this.topics = Array.from(topicsMap.entries()).map(([topicName, data]) => ({
        topic: topicName,
        count: data.count,
        questionIds: data.questionIds
      }));

      this.quizSetupModalTitle = 'Rivedi Errori di OGGI';
      console.log(questionsForModal)
      this.openQuizSetupModal();
    } else {
      alert("Nessuna domanda problematica trovata per OGGI. Ottimo lavoro!");
    }
  }

  openQuizSetupModal(): void { this.isQuizSetupModalOpen = true; }
  closeQuizSetupModal(): void { this.isQuizSetupModalOpen = false; }

  handleQuizSetupSubmitted(quizConfig: Partial<QuizSettings> & { fixedQuestionIds?: string[] }): void { // Added fixedQuestionIds
    this.closeQuizSetupModal();

    const queryParams: any = {
      quizTitle: this.quizSetupModalTitle || 'Quiz di Pratica',
      numQuestions: quizConfig.numQuestions,
      topics: quizConfig.selectedTopics?.join(','),
      topicDistribution: quizConfig.topicDistribution ? JSON.stringify(quizConfig.topicDistribution) : undefined,
      // If fixedQuestionIds are provided by the modal (e.g. from a specific selection), use them
      fixedQuestionIds: quizConfig.fixedQuestionIds ? quizConfig.fixedQuestionIds.join(',') : undefined,
      enableTimer: quizConfig.enableTimer || false, // Default to false for practice
      timerDuration: quizConfig.timerDurationSeconds || 0
    };

    // Clean up undefined queryParams
    Object.keys(queryParams).forEach(key => queryParams[key] === undefined && delete queryParams[key]);

    this.router.navigate(['/quiz/take'], { queryParams });
  }
}