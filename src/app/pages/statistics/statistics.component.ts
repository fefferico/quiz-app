// src/app/pages/statistics/statistics.component.ts
import {
  Component,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  OnDestroy,
  inject,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule, DatePipe, PercentPipe } from '@angular/common'; // DecimalPipe removed as not directly used in template
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import { Chart, registerables, ChartConfiguration, ChartOptions, ChartEvent, ActiveElement } from 'chart.js/auto'; // Added ChartEvent, ActiveElement
import ChartDataLabels from 'chartjs-plugin-datalabels';
import 'chartjs-adapter-date-fns';
import 'chartjs-plugin-zoom';
import { it } from 'date-fns/locale';

import { FormsModule } from '@angular/forms'; // Import FormsModule for ngModel

import { DatabaseService } from '../../core/services/database.service';
import { AnsweredQuestion, QuizAttempt, QuizSettings } from '../../models/quiz.model'; // Added QuestionSnapshotInfo
import { Question } from '../../models/question.model';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { SetupModalComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  IconDefinition,
  faHome,
  faMagnifyingGlass,
  faPersonMilitaryRifle,
  faGears,
  faLandmark,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';
import { ContestSelectionService } from '../../core/services/contest-selection.service'; // Import ContestSelectionService
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { SpinnerService } from '../../core/services/spinner.service';
import { Contest } from '../../models/contes.model';

Chart.register(...registerables);

interface TopicPerformanceData {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
  questionIds: string[];
}

interface DailyPerformanceData {
  date: string;
  quizzesTaken: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalSkipped: number;
  totalAttemptedInDay: number;
  averageAccuracy: number;
}

interface TopicWrongAnswerData {
  topic: string;
  wrongAnswers: number;
  totalAnswersInTopic: number;
  percentageOfGlobalWrong: number;
  topicSpecificFailureRate: number;
}

interface DailyPerformanceDataDetailed {
  date: string;
  quizzesTaken: number;
  wrongAnswerIds: string[];
  correctAnswerIds?: string[];
  skippedAnswerIds?: string[];
  correctAnswerCount?: number;
  wrongAnswerCount?: number;
  skippedAnswerCount?: number;
}

interface TopicCoverageData {
  topic: string;
  totalQuestionsInTopicBank: number;
  questionsEncountered: number;
  coveragePercentage: number;
  totalQuestionsCorrectlyAnswered: number;
  correctPercentage: number;
  totalQuestionsWronglyAnswered: number;
}

interface DailyMap {
  quizzes: number,
  correct: number,
  incorrect: number,
  skipped: number
}


@Component({
  selector: 'app-statistics',
  standalone: true,
  providers: [DatePipe, PercentPipe], // Add DatePipe to providers if not already global
  imports: [CommonModule, RouterLink, PercentPipe, SimpleModalComponent,
    SetupModalComponent, FontAwesomeModule, FormsModule],
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.scss']
})
export class StatisticsComponent implements OnInit, AfterViewInit, OnDestroy {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private alertService = inject(AlertService);
  private datePipe = inject(DatePipe); // Inject DatePipe
  private route = inject(ActivatedRoute); // Inject ActivatedRoute
  private contestSelectionService = inject(ContestSelectionService); // Inject ContestSelectionService
  private percentPipe = inject(PercentPipe); // For PDF export
  authService = inject(AuthService); // Assuming you have an AuthService for authentication
  spinnerService = inject(SpinnerService);

  isStatsViewer: boolean = false;
  isMobile: boolean = false;

  // -- icons
  homeIcon: IconDefinition = faHome;
  study: IconDefinition = faMagnifyingGlass;
  military: IconDefinition = faPersonMilitaryRifle;
  faGears: IconDefinition = faGears;
  faLandmark: IconDefinition = faLandmark;
  faTrashCan: IconDefinition = faTrashCan;

  quizAttempts: QuizAttempt[] = [];
  allQuestionsFromDb: Question[] = []; // Store all questions from the DB bank

  isLoading = true;
  isLoadingModal = false;
  loadingButtonIndex = -1;
  errorLoading = '';
  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';
  quizSettings: QuizSettings | undefined;

  totalQuizzesTaken = 0;
  totalQuestionsAttempted = 0;
  totalCorrectAnswers = 0;
  averageScorePercentage = 0;
  totalWeightedScoreSum = 0;
  totalPossibleScoreSum = 0;

  topicPerformance: TopicPerformanceData[] = [];
  tipologiaDomande: TopicPerformanceData[] = [];
  topics: GenericData[] = [];
  @ViewChild('topicPerformanceChart') topicPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  topicChart: Chart | undefined;

  dailyPerformance: DailyPerformanceData[] = [];
  dailyRevisionPerformance: DailyPerformanceData[] = [];
  // We will use a single object for today's detailed data for simplicity
  todayDetailedPerformance: DailyPerformanceDataDetailed | null = null;
  @ViewChild('dailyPerformanceQuestionsChart') dailyPerformanceQuestionsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dailyPerformancePrecisionChart') dailyPerformancePrecisionChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dailyRevisionPerformanceChart') dailyRevisionPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('todayPerformanceChart') todayPerformanceChartRef!: ElementRef<HTMLCanvasElement>;

  dailyChart: Chart | undefined;
  dailyPrecisionChart: Chart | undefined;
  todayChart: Chart | undefined;
  revisionChart: Chart | undefined;

  totalWrongAnswersOverall = 0;

  topicCoverage: TopicCoverageData[] = [];

  // --- NEW: Properties for Selected Date Chart ---
  selectedDateForChart: string | null = null; // Store as string YYYY-MM-DD
  selectedDateDetailedPerformance: DailyPerformanceDataDetailed | null = null;
  isLoadingSelectedDateData = false;
  @ViewChild('selectedDatePerformanceChart') selectedDatePerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  selectedDateChart: Chart | undefined;
  // --- END NEW ---

  private routeSub!: Subscription;
  private contestSub!: Subscription;

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }


  ngOnInit(): void {
    // Detect if mobile (simple check)
    this.isMobile = window.innerWidth <= 768;

    // Set the default locale for all charts
    Chart.defaults.locale = 'it';
    this.isStatsViewer = this.authService.isStatsViewer();

    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    this.routeSub = this.route.queryParamMap.subscribe(async params => {
      this.spinnerService.show('Recupero statistiche in corso...');
      await this.loadAndProcessStatistics();
      this.spinnerService.hide();
    });

    this.contestSub = this.contestSelectionService.selectedContest$.subscribe(async contestId => {
      if (!this.route.snapshot.queryParamMap.has('contest')) {
        this.spinnerService.show('Recupero statistiche in corso...');
        await this.loadAndProcessStatistics(); // Reload stats if service changes contest
        this.spinnerService.hide();
      }
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.selectedDateForChart = this.datePipe.transform(yesterday, 'yyyy-MM-dd');
  }

  ngAfterViewInit(): void {
    // Promise.resolve().then(() => this.createChartsIfReady());
  }

  private createChartsIfReady(): void {
    if (this.isLoading || this.errorLoading) return;

    // Destroy existing charts before recreating
    if (this.topicChart) {
      this.topicChart.destroy();
      this.topicChart = undefined;
    }
    if (this.dailyChart) {
      this.dailyChart.destroy();
      this.dailyChart = undefined;
    }

    if (this.dailyPrecisionChart) {
      this.dailyPrecisionChart.destroy();
      this.dailyPrecisionChart = undefined;
    }


    if (this.revisionChart) {
      this.revisionChart.destroy();
      this.revisionChart = undefined;
    }
    if (this.todayChart) {
      this.todayChart.destroy();
      this.todayChart = undefined;
    }
    if (this.selectedDateChart) {
      this.selectedDateChart.destroy();
      this.selectedDateChart = undefined;
    }

    // Topic Performance Chart
    if (this.topicPerformanceChartRef?.nativeElement && this.topicPerformance.length > 0) {
      this.createTopicPerformanceChart();
    } else {
      this.clearCanvasOrShowMessage(this.topicPerformanceChartRef, 'Nessun dato sulla performance per argomento.');
    }

    // Daily Trend Chart (DOMANDE)
    if (this.dailyPerformanceQuestionsChartRef?.nativeElement && this.dailyPerformance.length > 0) {
      this.createDailyPerformanceQuestionsChart();
    } else {
      this.clearCanvasOrShowMessage(this.dailyPerformanceQuestionsChartRef, 'Nessun dato sull\'andamento giornaliero.');
    }

    // Daily Trend Chart (PRECISIONE)
    if (this.dailyPerformancePrecisionChartRef?.nativeElement && this.dailyPerformance.length > 0) {
      this.createDailyPerformancePrecisionChart();
    } else {
      this.clearCanvasOrShowMessage(this.dailyPerformancePrecisionChartRef, 'Nessun dato sull\'andamento giornaliero.');
    }

    // Daily Revision Tren Chart
    if (this.dailyRevisionPerformanceChartRef?.nativeElement && this.dailyRevisionPerformance.length > 0) {
      this.createDailyRevisionPerformanceChart();
    } else {
      this.clearCanvasOrShowMessage(this.dailyRevisionPerformanceChartRef, 'Nessun dato sull\'andamento delle revisioni giornaliere.');
    }

    // Today's Detailed Chart
    if (this.todayPerformanceChartRef?.nativeElement && this.todayDetailedPerformance && (this.todayDetailedPerformance.quizzesTaken > 0 || (this.todayDetailedPerformance.correctAnswerCount ?? 0) > 0 || (this.todayDetailedPerformance.wrongAnswerCount ?? 0) > 0 || (this.todayDetailedPerformance.skippedAnswerCount ?? 0) > 0)) {
      this.createTodayPerformanceChart();
    } else {
      this.clearCanvasOrShowMessage(this.todayPerformanceChartRef, 'Nessun quiz completato oggi.');
    }

    // Selected Date Detailed Chart
    if (this.selectedDatePerformanceChartRef?.nativeElement && this.selectedDateDetailedPerformance && (this.selectedDateDetailedPerformance.quizzesTaken > 0 || (this.selectedDateDetailedPerformance.correctAnswerCount ?? 0) > 0 || (this.selectedDateDetailedPerformance.wrongAnswerCount ?? 0) > 0 || (this.selectedDateDetailedPerformance.skippedAnswerCount ?? 0) > 0)) {
      this.createSelectedDatePerformanceChart();
    } else if (this.selectedDateForChart) {
      this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Nessun quiz per la data selezionata o dati non ancora caricati.');
    } else {
      this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Seleziona una data e carica i dati.');
    }
  }

  private clearCanvasOrShowMessage(chartRef: ElementRef<HTMLCanvasElement> | undefined, message: string): void {
    const canvas = chartRef?.nativeElement;
    if (canvas) {
      const canvas = chartRef?.nativeElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.save(); // Save state
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '14px Arial';
          ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#a0aec0' : '#4a5568'; // Tailwind gray-500/gray-600
          ctx.fillText(message, canvas.width / 2, canvas.height / 2);
          ctx.restore(); // Restore state
        }
      }
    }
  }


  async loadAndProcessStatistics(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    this.isLoading = true;
    this.errorLoading = '';

    try {
      // Pass activeContestId to filter data at source
      const [quizAttempts, allQuestionsFromDb] = await Promise.all([
        this.dbService.getAllQuizAttemptsByContest(currentContest.id, this.getUserId()),
        this.dbService.fetchAllRows(currentContest.id) // Assuming this method filters by publicContest
      ]);

      this.quizAttempts = quizAttempts;
      this.allQuestionsFromDb = allQuestionsFromDb;

      if (this.quizAttempts.length > 0 || (currentContest.id && this.allQuestionsFromDb.length > 0)) {
        this.calculateOverallStats(); // Uses this.quizAttempts
        this.calculateTopicPerformance(); // Uses this.quizAttempts and this.allQuestionsFromDb
        this.calculateDailyPerformance(); // Uses this.quizAttempts
        await this.calculateTodayDetailedPerformance(); // Uses dbService call with activeContestId
        this.calculateTopicCoverage(currentContest.id); // Uses this.quizAttempts and this.allQuestionsFromDb
        // await this.getGenericData(); // Uses dbService calls with activeContestId
        this.calculateDailyRevisionPerformance(); // Uses this.quizAttempts

        // if a date is selected and it's not today, try to load its data
        if (this.selectedDateForChart && this.datePipe.transform(new Date(), 'yyyy-MM-dd') !== this.selectedDateForChart) {
          await this.loadDataForSelectedDate(false); // false to not reset charts immediately
        }

      } else {
        this.resetAllStatsToZero();
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
      this.errorLoading = 'Impossibile caricare le statistiche.';
      this.resetAllStatsToZero();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
      // Use a microtask to ensure DOM is updated before creating charts
      Promise.resolve().then(() => this.createChartsIfReady());
    }
  }


  private resetAllStatsToZero(): void {
    // ... (implementation as provided)
    this.totalQuizzesTaken = 0;
    this.totalQuestionsAttempted = 0;
    this.totalCorrectAnswers = 0;
    this.averageScorePercentage = 0;
    this.topicPerformance = [];
    this.dailyPerformance = [];
    this.dailyRevisionPerformance = [];
    this.todayDetailedPerformance = null;
    this.selectedDateDetailedPerformance = null;
    this.topicCoverage = [];
    this.tipologiaDomande = [];

    // Charts will be cleared/handled by createChartsIfReady
  }

  getMaxResultForAttempt(quizAttempt: QuizAttempt): number {
    return Number(quizAttempt.allQuestions.reduce((sum, q) => sum + (q.questionSnapshot.scoreIsCorrect || 0) * 1, 0).toFixed(2));
  }

  calculateOverallStats(): void {
    this.totalQuizzesTaken = this.quizAttempts.length;
    this.totalQuestionsAttempted = 0;
    this.totalCorrectAnswers = 0;
    this.totalWeightedScoreSum = 0;
    this.totalPossibleScoreSum = 0;

    this.quizAttempts.forEach(attempt => {
      const currentScore = attempt.score || 0;
      this.totalQuestionsAttempted += attempt.totalQuestionsInQuiz;
      this.totalCorrectAnswers += attempt.answeredQuestions.filter(ans => ans.isCorrect).length;
      this.totalWeightedScoreSum += currentScore;
      this.totalPossibleScoreSum += this.getMaxResultForAttempt(attempt);
    });

    this.averageScorePercentage = this.totalPossibleScoreSum > 0
      ? (this.totalWeightedScoreSum / this.totalPossibleScoreSum)
      : 0;
  }

  calculateTopicPerformance(): void {
    const performanceMap = new Map<string, { correct: number, total: number, questionIds: Set<string> }>();
    this.quizAttempts.forEach(attempt => {
      attempt.allQuestions.forEach(qSnapshotInfo => { // Use allQuestions to capture exposure
        const topic = qSnapshotInfo.questionSnapshot.topic || 'Uncategorized';
        const data = performanceMap.get(topic) || { correct: 0, total: 0, questionIds: new Set() };
        data.questionIds.add(qSnapshotInfo.questionId);

        const answeredVersion = attempt.answeredQuestions.find(aq => aq.questionId === qSnapshotInfo.questionId);
        if (answeredVersion) {
          data.total++; // Increment total *answered* in this topic
          if (answeredVersion.isCorrect) {
            data.correct++;
          }
        }
        performanceMap.set(topic, data);
      });
    });
    this.topicPerformance = Array.from(performanceMap.entries()).map(([topic, data]) => ({
      topic,
      correct: data.correct,
      total: data.total,
      accuracy: data.total > 0 ? (data.correct / data.total) : 0,
      questionIds: Array.from(data.questionIds)
    })).sort((a, b) => b.accuracy - a.accuracy);
  }

  calculateDailyPerformance(): void {
    const dailyMap = new Map<string, DailyMap>();
    const dateFormatter = new DatePipe('en-US');
    const sortedAttempts = [...this.quizAttempts].sort((a, b) =>
      new Date(a.timestampEnd || a.timestampStart || 0).getTime() - new Date(b.timestampEnd || b.timestampStart || 0).getTime()
    );
    sortedAttempts.forEach(attempt => {
      const timestamp = attempt.timestampEnd || attempt.timestampStart;
      if (!timestamp) return;
      const dateKey = dateFormatter.transform(timestamp, 'yyyy-MM-dd')!;
      const dayData = dailyMap.get(dateKey) || { quizzes: 0, correct: 0, incorrect: 0, skipped: 0, attempted: 0 };
      dayData.quizzes++;
      dayData.correct += attempt.answeredQuestions
        ? attempt.answeredQuestions.filter(aq => aq.isCorrect && (attempt.timestampEnd && dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd') === dateKey)).length
        : 0;
      dayData.incorrect += attempt.answeredQuestions ? attempt.answeredQuestions.filter(aq => !aq.isCorrect && (attempt.timestampEnd && dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd') === dateKey)).length
        : 0;
      dayData.skipped += attempt.unansweredQuestions && (attempt.timestampEnd && dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd') === dateKey) ? attempt.unansweredQuestions.length : 0;
      const total = dayData.correct + dayData.incorrect + dayData.skipped;
      dailyMap.set(dateKey, dayData);
    });
    // Find the earliest and latest date in dailyMap, or use today if no data
    let firstDate: Date, lastDate: Date;
    if (dailyMap.size > 0) {
      const allDates = Array.from(dailyMap.keys()).sort();
      firstDate = new Date(allDates[0]);
      lastDate = new Date(allDates[allDates.length - 1]);
    } else {
      firstDate = new Date();
      lastDate = new Date();
    }
    // Add 2 days before the first and 2 days after the last
    firstDate.setDate(firstDate.getDate() - 2);
    lastDate.setDate(lastDate.getDate() + 2);

    // Calculate how many days to show
    const msPerDay = 24 * 60 * 60 * 1000;
    let totalDays = Math.round((lastDate.getTime() - firstDate.getTime()) / msPerDay) + 1;
    // If there are more than 34 days of data, show only the latest 34 days (+2 before, +2 after)
    if (totalDays > 36) {
      // Move firstDate to (lastDate - 33 days)
      firstDate = new Date(lastDate.getTime() - msPerDay * 33);
      totalDays = 34;
    }

    const result: DailyPerformanceData[] = [];
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(firstDate);
      date.setDate(firstDate.getDate() + i);
      const dateKey = new DatePipe('en-US').transform(date, 'yyyy-MM-dd')!;
      const data = dailyMap.get(dateKey) || { quizzes: 0, correct: 0, incorrect: 0, skipped: 0, attempted: 0 };
      result.push({
        date: dateKey,
        quizzesTaken: data.quizzes,
        totalCorrect: data.correct,
        totalIncorrect: data.incorrect,
        totalSkipped: data.skipped,
        totalAttemptedInDay: data.correct + data.incorrect + data.skipped,
        averageAccuracy: (data.correct + data.incorrect + data.skipped) > 0
          ? (data.correct / (data.correct + data.incorrect + data.skipped))
          : 0
      });
    }
    this.dailyPerformance = result;
  }

  async calculateTopicCoverage(contest: number): Promise<void> {
    if (!this.allQuestionsFromDb || this.allQuestionsFromDb.length === 0) {
      this.topicCoverage = [];
      return;
    }

    const questionsByTopicDb = new Map<string, Question[]>();
    this.allQuestionsFromDb.forEach(q => {
      const topic = q.topic || 'Uncategorized';
      if (!questionsByTopicDb.has(topic)) {
        questionsByTopicDb.set(topic, []);
      }
      questionsByTopicDb.get(topic)!.push(q);
    });

    const encounteredQuestionIdsByTopic = new Map<string, Set<string>>();
    const timesAnsweredCorrectlyQuestionIdsByTopic = new Map<string, number>();
    const timesAnsweredWronglyQuestionIdsByTopic = new Map<string, number>();
    this.allQuestionsFromDb.forEach((question: Question) => {
      const topic = question.topic || 'Uncategorized';
      if (!encounteredQuestionIdsByTopic.has(topic)) {
        encounteredQuestionIdsByTopic.set(topic, new Set());
      }
      if (encounteredQuestionIdsByTopic.get(topic) && (question.timesIncorrect || question.timesCorrect)) {
        encounteredQuestionIdsByTopic.get(topic)!.add(question.id);
      }

      if (!timesAnsweredCorrectlyQuestionIdsByTopic.has(topic)) {
        timesAnsweredCorrectlyQuestionIdsByTopic.set(topic, 0);
      }
      if (timesAnsweredCorrectlyQuestionIdsByTopic.get(topic) !== undefined) {
        const timesCorrect = typeof question.timesCorrect === 'number' ? question.timesCorrect : 0;
        timesAnsweredCorrectlyQuestionIdsByTopic.set(
          topic,
          timesAnsweredCorrectlyQuestionIdsByTopic.get(topic)! + timesCorrect
        );
      }

      if (!timesAnsweredWronglyQuestionIdsByTopic.has(topic)) {
        timesAnsweredWronglyQuestionIdsByTopic.set(topic, 0);
      }
      if (timesAnsweredWronglyQuestionIdsByTopic.get(topic) !== undefined) {
        const timesIncorrect = typeof question.timesIncorrect === 'number' ? question.timesIncorrect : 0;
        timesAnsweredWronglyQuestionIdsByTopic.set(
          topic,
          timesAnsweredWronglyQuestionIdsByTopic.get(topic)! + timesIncorrect
        );
      }
    });

    this.topicCoverage = [];
    questionsByTopicDb.forEach((questionsInBankForTopic, topic) => {
      const totalInBank = questionsInBankForTopic.length;

      const encounteredSet = encounteredQuestionIdsByTopic.get(topic) || new Set();
      const encounteredCount = encounteredSet.size;
      const correctCount = timesAnsweredCorrectlyQuestionIdsByTopic.get(topic) && timesAnsweredCorrectlyQuestionIdsByTopic.get(topic) || 0;
      const incorrectCount = timesAnsweredWronglyQuestionIdsByTopic.get(topic) && timesAnsweredWronglyQuestionIdsByTopic.get(topic) || 0;

      this.topicCoverage.push({
        topic: topic,
        totalQuestionsInTopicBank: totalInBank,
        questionsEncountered: encounteredCount,
        coveragePercentage: totalInBank > 0 ? (encounteredCount / totalInBank) : 0,
        totalQuestionsCorrectlyAnswered: correctCount,
        correctPercentage: encounteredCount > 0 ? Number(((correctCount / (correctCount + incorrectCount)) * 100).toFixed(2)) : 0,
        totalQuestionsWronglyAnswered: incorrectCount
      });
    });

    this.topicCoverage.sort((a, b) => a.topic.localeCompare(b.topic));
  }

  createDailyPerformanceQuestionsChart(): void {
    if (this.dailyChart) this.dailyChart.destroy();
    if (!this.dailyPerformanceQuestionsChartRef?.nativeElement || this.dailyPerformance.length === 0) {
      this.clearCanvasOrShowMessage(this.dailyPerformanceQuestionsChartRef, 'Nessun dato sull\'andamento giornaliero.');
      return;
    }
    const ctx = this.dailyPerformanceQuestionsChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    // Dynamically import chartjs-plugin-zoom for pinch/zoom support
    import('chartjs-plugin-zoom').then(zoomPlugin => {
      const labels = this.dailyPerformance.map(dp => dp.date);
      const accuracyData = this.dailyPerformance.map(dp => dp.averageAccuracy * 100);
      const quizzesTakenData = this.dailyPerformance.map(dp => dp.quizzesTaken);
      const totalCorrectData = this.dailyPerformance.map(dp => dp.totalCorrect);
      const totalAttemptedData = this.dailyPerformance.map(dp => dp.totalAttemptedInDay);
      const totalIncorrectData = this.dailyPerformance.map(dp => dp.totalIncorrect);
      const totalSkippedData = this.dailyPerformance.map(dp => dp.totalSkipped);
      const maxTotalAnswered = Math.max(...totalAttemptedData);

      const chartData = {
        labels: labels,
        datasets: [
          {
            type: 'line' as const,
            label: 'Domande svolte',
            data: totalAttemptedData,
            backgroundColor: 'rgb(24, 218, 69)',
            borderColor: 'rgb(24, 218, 69)',
            borderWidth: 2,
            yAxisID: 'yQuizzes'
          },
          {
            type: 'line' as const,
            label: 'Risposte errate',
            data: totalIncorrectData,
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2,
            yAxisID: 'yQuizzes'
          },
          {
            type: 'line' as const,
            label: 'Risposte Corrette',
            data: totalCorrectData,
            backgroundColor: 'rgb(255, 200, 0)',
            borderColor: 'rgb(255, 200, 0)',
            borderWidth: 2,
            yAxisID: 'yQuizzes'
          },
        ]
      };

      const chartDailyConfig: ChartConfiguration = {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index',
          },
          scales: {
            x: {
              type: 'time',
              adapters: {
                date: {
                  locale: it
                }
              },
              time: {
                unit: 'day',
                tooltipFormat: 'd MMM yyyy',
                displayFormats: {
                  day: 'd MMM'
                }
              },
              title: {
                display: true,
                text: 'Data'
              }
            },
            yQuizzes: {
              suggestedMax: 1200,
              type: 'linear',
              position: 'left',
              min: 0,
              title: {
                display: true,
                text: 'Domande '
              },
              grid: {
                drawOnChartArea: false,
                lineWidth: 1,
                color: 'rgb(255, 200, 0)',
              },
              ticks: {
                stepSize: 50,
              },
              axis: 'y',
              border: {
                width: 1,
              }
            }
          },
          plugins: {
            tooltip: {
              enabled: !this.isMobile,
              mode: 'index',
              intersect: false,
            },
            title: {
              display: true,
              text: 'Andamento Performance Giornaliera'
            },
            legend: {
              display: true,
              position: 'top',
            },
            datalabels: {
              display: (context: any) => {
                const value = context.dataset.data[context.dataIndex] as number;
                if (typeof value !== 'number') {
                  return false;
                }
                if (context.dataset.yAxisID === 'yQuizzes') {
                  return value !== 0;
                }
                return true;
              },
              anchor: 'end',
              align: 'center',
              color: document.documentElement.classList.contains('dark') ? '#E2E8F0' : '#2e2f30',
              font: {
                weight: 'bold',
                size: 12
              },
              formatter: (value: number, context: any) => {
                if (typeof value !== 'number') {
                  return '';
                }
                if (context.dataset.yAxisID === 'yAccuracy') {
                  return value.toFixed(2) + '%';
                } else {
                  return Math.round(value).toString();
                }
              }
            },
            zoom: {
              pan: {
                enabled: true,
                mode: 'x',
                modifierKey: 'ctrl',
              },
              zoom: {
                wheel: {
                  enabled: true,
                  modifierKey: 'ctrl',
                },
                pinch: {
                  enabled: true
                },
                mode: 'x',
              },
              limits: {
                x: { minRange: 1 }
              }
            }
          }
        } as ChartOptions,
        plugins: [ChartDataLabels, zoomPlugin.default]
      };
      this.dailyChart = new Chart(ctx, chartDailyConfig);
    });
  }


  createDailyPerformancePrecisionChart(): void {
    if (this.dailyPrecisionChart) this.dailyPrecisionChart.destroy();
    if (!this.dailyPerformancePrecisionChartRef?.nativeElement || this.dailyPerformance.length === 0) {
      this.clearCanvasOrShowMessage(this.dailyPerformancePrecisionChartRef, 'Nessun dato sull\'andamento giornaliero.');
      return;
    }
    const ctx = this.dailyPerformancePrecisionChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    // Dynamically import chartjs-plugin-zoom for pinch/zoom support
    import('chartjs-plugin-zoom').then(zoomPlugin => {
      const labels = this.dailyPerformance.map(dp => dp.date);
      const accuracyData = this.dailyPerformance.map(dp => dp.averageAccuracy * 100);
      const quizzesTakenData = this.dailyPerformance.map(dp => dp.quizzesTaken);
      const totalCorrectData = this.dailyPerformance.map(dp => dp.totalCorrect);
      const totalAttemptedData = this.dailyPerformance.map(dp => dp.totalAttemptedInDay);
      const totalIncorrectData = this.dailyPerformance.map(dp => dp.totalIncorrect);
      const totalSkippedData = this.dailyPerformance.map(dp => dp.totalSkipped);
      const maxTotalAnswered = Math.max(...totalAttemptedData);

      const chartData = {
        labels: labels,
        datasets: [
          {
            type: 'line' as const,
            label: 'Precisione Media (%)',
            data: accuracyData,
            borderColor: 'rgba(255, 159, 64, 1)', // Orange
            backgroundColor: 'rgba(255, 159, 64, 0.2)',
            yAxisID: 'yAccuracy',
            tension: 0.1,
            fill: true
          },
        ]
      };

      const chartDailyPrecisionConfig: ChartConfiguration = {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index',
          },
          scales: {
            x: {
              type: 'time',
              adapters: {
                date: {
                  locale: it
                }
              },
              time: {
                unit: 'day',
                tooltipFormat: 'd MMM yyyy',
                displayFormats: {
                  day: 'd MMM'
                }
              },
              title: {
                display: true,
                text: 'Data'
              }
            },
            yAccuracy: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 100,
              title: {
                display: true,
                text: 'Precisione (%)'
              },
              ticks: {
                callback: value => value + '%'
              },
              grid: {
                drawOnChartArea: true
              }
            },
          },
          plugins: {
            tooltip: {
              enabled: !this.isMobile,
              mode: 'index',
              intersect: false,
            },
            title: {
              display: true,
              text: 'Andamento Performance Giornaliera'
            },
            legend: {
              display: true,
              position: 'top',
            },
            datalabels: {
              display: (context: any) => {
                const value = context.dataset.data[context.dataIndex] as number;
                if (typeof value !== 'number') {
                  return false;
                }
                if (context.dataset.yAxisID === 'yQuizzes') {
                  return value !== 0;
                }
                return true;
              },
              anchor: 'end',
              align: 'center',
              color: document.documentElement.classList.contains('dark') ? '#E2E8F0' : '#2e2f30',
              font: {
                weight: 'bold',
                size: 12
              },
              formatter: (value: number, context: any) => {
                if (typeof value !== 'number') {
                  return '';
                }
                if (context.dataset.yAxisID === 'yAccuracy') {
                  return value.toFixed(2) + '%';
                } else {
                  return Math.round(value).toString();
                }
              }
            },
            zoom: {
              pan: {
                enabled: true,
                mode: 'x',
                modifierKey: 'ctrl',
              },
              zoom: {
                wheel: {
                  enabled: true,
                  modifierKey: 'ctrl',
                },
                pinch: {
                  enabled: true
                },
                mode: 'x',
              },
              limits: {
                x: { minRange: 1 }
              }
            }
          }
        } as ChartOptions,
        plugins: [ChartDataLabels, zoomPlugin.default]
      };
      this.dailyPrecisionChart = new Chart(ctx, chartDailyPrecisionConfig);
    });
  }

  createTopicPerformanceChart(): void {
    if (this.topicChart) this.topicChart.destroy();
    if (!this.topicPerformanceChartRef?.nativeElement || this.topicPerformance.length === 0) return;
    const ctx = this.topicPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = this.topicPerformance.map(tp => tp.topic.length > 25 ? tp.topic.substring(0, 22) + '...' : tp.topic); // Truncate long labels
    const data = this.topicPerformance.map(tp => tp.accuracy * 100);
    const backgroundColors = labels.map((_, i) => `hsla(${i * (360 / Math.max(labels.length, 1))}, 70%, 60%, 0.6)`);
    const borderColors = labels.map((_, i) => `hsla(${i * (360 / Math.max(labels.length, 1))}, 70%, 50%, 1)`);

    this.topicChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Precisione per argomento (%)',
          data: data,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { callback: value => value + '%' } },
          y: { ticks: { autoSkip: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => `${this.topicPerformance[context.dataIndex].topic}: ${context.parsed.x.toFixed(1)}%` } }, // Show full topic name in tooltip
          title: { display: true, text: 'Precisione per Argomento' }
        }
      }
    });
  }

  async resetStatistics(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    const confirmationMessage = `Sei sicuro di voler cancellare tutte le statistiche ${currentContest.id ? `relative al concorso '${currentContest.id}'` : ''}? Questo cancellerà lo storico dei quiz ${currentContest.id ? `per questo concorso` : '(globali se nessun concorso è selezionato)'}.`;

    this.alertService.showConfirmationDialog("ATTENZIONE", confirmationMessage).then(async (result) => {
      if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
        return;
      }

      try {
        this.spinnerService.show("Cancellazione statistiche in corso...");
        // Pass activeContestId to dbService.resetDatabase if it's meant to be contest-specific
        // Or, if resetDatabase is global, clear attempts for contest then reload.
        // Assuming resetDatabase might be global, safer to clear attempts by contest:
        await this.dbService.resetContest(currentContest.id, this.authService.getCurrentUserSnapshot()?.userId ?? -1);
        // If questions statistics (like 'never answered') are also contest-specific and stored, they'd need clearing too.
        // For now, just reloading will show empty state for attempts.
        this.spinnerService.hide();
        this.alertService.showAlert("Info", `Statistiche ${currentContest.id ? `per '${currentContest.id}'` : ''} resettate. Ora la pagina verrà ricaricata.`).then(async res => {
          await this.loadAndProcessStatistics();
        }
        );
      } catch (error) {
        console.error('Error resetting statistics:', error);
        this.alertService.showAlert("Attenzione", "Errore durante il reset delle statistiche.");
      }
    });
  }

  startPracticeQuizForTopicOLD(topic: string): void {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    // allQuestionsFromDb is already filtered by contest.
    // quizAttempts is also already filtered by contest.
    // Logic should be fine.
    // ... (implementation as provided)
    const practiceQuestionIds = new Set<string>();
    this.quizAttempts.forEach(attempt => { // these attempts are for the current contest
      attempt.allQuestions.forEach(qInfo => {
        if (qInfo.questionSnapshot.topic === topic) {
          const answeredVersion = attempt.answeredQuestions.find(aq => aq.questionId === qInfo.questionId);
          // Only add if not correct, or if it's a question from the correct contest that was part of a non-contest quiz (less likely scenario)
          if (!answeredVersion || !answeredVersion.isCorrect) {
            practiceQuestionIds.add(qInfo.questionId);
          }
        }
      });
    });

    if (practiceQuestionIds.size === 0) {
      const allTopicQuestions = this.allQuestionsFromDb.filter(q => (q.topic || 'Uncategorized') === topic); // allQuestionsFromDb is contest-specific
      if (allTopicQuestions.length > 0) {
        if (confirm(`Hai risposto correttamente a tutte le domande incontrate per l'argomento "${topic}"${currentContest.id ? ` nel concorso '${currentContest.id}'` : ''}. Vuoi comunque fare pratica su tutte le ${allTopicQuestions.length} domande disponibili per questo argomento?`)) {
          allTopicQuestions.forEach(q => practiceQuestionIds.add(q.id));
        } else {
          return;
        }
      } else {
        this.alertService.showAlert("Info", `Nessuna domanda disponibile per l'argomento: ${topic}${currentContest.id ? ` nel concorso '${currentContest.id}'` : ''}.`);
        return;
      }
    }

    const finalQuestionIds = Array.from(practiceQuestionIds);
    const queryParams = {
      quizTitle: `Pratica: ${topic}${currentContest.id ? ` (${currentContest.id})` : ''}`,
      fixedQuestionIds: finalQuestionIds.join(','), // Use fixedQuestionIds
      totalQuestionsInQuiz: finalQuestionIds.length,
      publicContest: currentContest.id // Pass contest context
    };

    let navigateToPath = '/quiz/take'; // Default path
    console.log(`Navigating to ${navigateToPath} with queryParams:`, queryParams);
    this.router.navigate([navigateToPath], { state: { quizParams: queryParams } });

  }

  async startPracticeQuizForTopic(topic: string): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    this.isLoadingModal = true;
    const selectedData = this.topicCoverage.find(_topic => _topic.topic === topic);
    if (!selectedData) {
      this.alertService.showAlert("Info", `Nessuna domanda disponibile per la categoria: ${topic || 'sconosciuta'}`);
      return;
    }
    this.quizSetupModalTitle = selectedData.topic;
    this.topics = [];

    try {
      this.spinnerService.show("Recupero domande in corso...");
      const questionsForModal = await this.dbService.getQuestionsByTopic(currentContest.id, topic);
      this.spinnerService.hide();
      this.isLoadingModal = false;
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
      this.openQuizSetupModal();
    } catch (error) {
      this.isLoadingModal = false;
      console.error("Error fetching questions for modal setup:", error);
      this.alertService.showAlert("Attenzione", "Errore nel preparare il quiz di pratica.");
    }
  }

  ngOnDestroy(): void {
    if (this.routeSub) this.routeSub.unsubscribe();
    if (this.contestSub) this.contestSub.unsubscribe();
    if (this.topicChart) this.topicChart.destroy();
    if (this.dailyChart) this.dailyChart.destroy();
    if (this.dailyPrecisionChart) this.dailyPrecisionChart.destroy();
    if (this.todayChart) this.todayChart.destroy();
    if (this.selectedDateChart) this.selectedDateChart.destroy();
    if (this.revisionChart) this.revisionChart.destroy();
  }

  async exportStatisticsToPDF(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    if (this.quizAttempts.length === 0 && this.allQuestionsFromDb.length === 0) { // Check if any data exists
      this.alertService.showAlert("Info", "Non ci sono statistiche da esportare.");
      return;
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15; // Start a bit lower
    const lineHeight = 6; // Smaller line height for denser info
    const margin = 10; // Smaller margin
    const contentWidth = pageWidth - margin * 2;
    const sectionSpacing = lineHeight * 2;

    const checkYPos = (neededHeight: number = lineHeight * 2) => {
      if (yPos + neededHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
    };

    const addPageNumbers = () => {
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin, pageHeight - margin + 5, { align: 'right' });
      }
    };


    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    const mainTitle = `Report Statistiche Quiz${currentContest.name ? ` - ${currentContest.name}` : ''}`;
    doc.text(mainTitle, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    yPos += lineHeight * 3;

    if (this.quizAttempts.length > 0) {
      doc.setFontSize(14);
      doc.text('Performance Generale', margin, yPos);
      yPos += lineHeight * 1.5;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      [
        `Quiz Svolti: ${this.totalQuizzesTaken}`,
        `Domande Affrontate: ${this.totalQuestionsAttempted}`,
        `Risposte Corrette: ${this.totalCorrectAnswers}`,
        `Punteggio Medio: ${new PercentPipe('en-US').transform(this.averageScorePercentage, '1.0-1')}`
      ].forEach(stat => {
        checkYPos(lineHeight);
        doc.text(stat, margin + 2, yPos);
        yPos += lineHeight;
      });
      yPos += sectionSpacing;
    }


    if (this.topicCoverage.length > 0) {
      checkYPos(lineHeight * 3);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Copertura Argomenti ${currentContest.name ? `(${currentContest.name})` : ''}`, 10, yPos);
      yPos += 7;
      (doc as any).autoTable({
        startY: yPos,
        head: [['Argomento', 'Domande nel DB', 'Domande Incontrate', 'Copertura (%)', 'N° volte corrette', 'N° volte errate']],
        body: this.topicCoverage.map(tc => [
          tc.topic, tc.totalQuestionsInTopicBank.toString(), tc.questionsEncountered.toString(),
          new PercentPipe('en-US').transform(tc.coveragePercentage, '1.0-0')
        ]),
        theme: 'striped', styles: { fontSize: 8, cellPadding: 1.5, halign: 'right' },
        headStyles: { fillColor: [75, 85, 99], fontSize: 8.5, fontStyle: 'bold', halign: 'center' }, // gray-500
        columnStyles: { 0: { halign: 'left', cellWidth: 'auto' } }, // Topic name left aligned
        margin: { left: margin, right: margin },
        didDrawPage: (data: any) => {
          yPos = data.cursor.y;
          if (yPos > pageHeight - margin - 10) yPos = margin
        }
      });
      yPos = (doc as any).lastAutoTable.finalY + sectionSpacing;
    }


    if (this.topicChart && this.topicPerformance.length > 0) {
      checkYPos(80);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Precisione per Argomento ${currentContest.name ? `(${currentContest.name})` : ''}`, margin, yPos);
      yPos += lineHeight * 1.5;
      try {
        const chartImage = this.topicChart.toBase64Image('image/png', 1.0);
        const imgProps = this.topicChart.canvas;
        const aspectRatio = imgProps.width / imgProps.height;
        const imgWidth = Math.min(contentWidth, 160); // Slightly smaller
        const imgHeight = imgWidth / aspectRatio;
        checkYPos(imgHeight + lineHeight);
        doc.addImage(chartImage, 'PNG', margin + (contentWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + lineHeight;
      } catch (e) {
        console.error("Error PDF Topic Chart:", e);
        yPos += lineHeight;
      }
      yPos += sectionSpacing / 2;
    }

    if (this.dailyChart && this.dailyPerformance.length > 0) {
      checkYPos(100);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Andamento Giornaliero ${currentContest.name ? `(${currentContest.name})` : ''}`, margin, yPos);
      yPos += lineHeight * 1.5;
      try {
        const chartImage = this.dailyChart.toBase64Image('image/png', 1.0);
        const imgProps = this.dailyChart.canvas;
        const aspectRatio = imgProps.width / imgProps.height;
        const imgWidth = Math.min(contentWidth, 170);
        const imgHeight = imgWidth / aspectRatio;
        checkYPos(imgHeight + lineHeight);
        doc.addImage(chartImage, 'PNG', margin + (contentWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + lineHeight;
      } catch (e) {
        console.error("Error PDF Daily Chart:", e);
        yPos += lineHeight;
      }
      yPos += sectionSpacing / 2;
    }

    addPageNumbers(); // Add page numbers at the end
    const dateSuffix = this.datePipe.transform(new Date(), 'yyyyMMdd_HHmm');
    const contestSuffix = currentContest.id && currentContest.name
      ? `_${currentContest.name.replace(/\s+/g, '_')}`
      : '';
    doc.save(`report-statistiche${contestSuffix}-${dateSuffix}.pdf`);
  }


  async getGenericData(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    // All these dbService calls need to be contest-aware.
    // They should accept this.selectedPublicContest.id.
    const [
      uniqueCorrectOnce, uniqueWrongOnce, uniqueNeverAnswered,
      uniqueAnsweredOnce, onlyCorrectlyAnswered, domandeDaRafforzare,
      domandeInCuiVaiMalino, domandeInCuiVaiMoltoMale, domandeDisastro
    ] = await Promise.all([
      this.dbService.getAllQuestionCorrectlyAnsweredAtLeastOnceCount(currentContest.id),
      this.dbService.getAllQuestionWronglyAnsweredAtLeastOnce(currentContest.id),
      this.dbService.getAllQuestionNeverAnswered(currentContest.id),
      this.dbService.getAllQuestionAnsweredAtLeastOnce(currentContest.id),
      this.dbService.getOnlyQuestionCorrectlyAnswered(currentContest.id),
      this.dbService.getQuestionsByCorrectnessRange(currentContest.id, 0.75, 0.9999),
      this.dbService.getQuestionsByCorrectnessRange(currentContest.id, 0.50, 0.7499),
      this.dbService.getQuestionsByCorrectnessRange(currentContest.id, 0.25, 0.4999),
      this.dbService.getQuestionsByCorrectnessRange(currentContest.id, 0.00, 0.2499)
    ]);

    // this.allQuestionsFromDb is already filtered by activeContestId
    const totalQuestionsInCurrentContext = this.allQuestionsFromDb.length;

    this.tipologiaDomande = [
      {
        topic: `Domande totali ${currentContest.name ? `per '${currentContest.name}'` : 'nel DB'}`,
        total: totalQuestionsInCurrentContext,
        questionIds: this.allQuestionsFromDb.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande mai affrontate',
        total: uniqueNeverAnswered.length,
        questionIds: uniqueNeverAnswered,
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande affrontate almeno una volta',
        total: uniqueAnsweredOnce.length,
        questionIds: uniqueAnsweredOnce.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande sbagliate almeno una volta',
        total: uniqueWrongOnce.length,
        questionIds: uniqueWrongOnce.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande risposte correttamente almeno una volta',
        total: uniqueCorrectOnce,
        questionIds: [],
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande di cui sai tutto (100% corrette)',
        total: onlyCorrectlyAnswered.length,
        questionIds: onlyCorrectlyAnswered.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande da rafforzare (75-99% corrette)',
        total: domandeDaRafforzare.length,
        questionIds: domandeDaRafforzare.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande in cui vai malino (50-74% corrette)',
        total: domandeInCuiVaiMalino.length,
        questionIds: domandeInCuiVaiMalino.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande in cui vai molto male (25-49% corrette)',
        total: domandeInCuiVaiMoltoMale.length,
        questionIds: domandeInCuiVaiMoltoMale.map(q => q.id),
        correct: 0,
        accuracy: 0
      },
      {
        topic: 'Domande "disastro" (0-24% corrette)',
        total: domandeDisastro.length,
        questionIds: domandeDisastro.map(q => q.id),
        correct: 0,
        accuracy: 0
      }
    ];
  }

  openQuizSetupModal(): void {
    this.isQuizSetupModalOpen = true;
  }

  closeQuizSetupModal(): void {
    this.isQuizSetupModalOpen = false;
    this.isLoadingModal = false;
    this.loadingButtonIndex = -1;
  }

  handleQuizSetupSubmitted(quizConfig: Partial<QuizSettings> & { fixedQuestionIds?: string[] }): void { // Added fixedQuestionIds
    this.closeQuizSetupModal();

    const queryParams: any = {
      quizTitle: this.quizSetupModalTitle || 'Quiz di Pratica',
      totalQuestionsInQuiz: quizConfig.totalQuestionsInQuiz,
      topics: quizConfig.selectedTopics?.join(','),
      topicDistribution: quizConfig.topicDistribution ? JSON.stringify(quizConfig.topicDistribution) : undefined,
      // If fixedQuestionIds are provided by the modal (e.g. from a specific selection), use them
      fixedQuestionIds: quizConfig.fixedQuestionIds ? quizConfig.fixedQuestionIds.join(',') : undefined,
      enableTimer: quizConfig.enableTimer || false, // Default to false for practice
      timerDurationSeconds: quizConfig.timerDurationSeconds || 0,
      publicContest: this.selectedPublicContest,
    };

    // Clean up undefined queryParams
    Object.keys(queryParams).forEach(key => queryParams[key] === undefined && delete queryParams[key]);

    let navigateToPath = '/quiz/take'; // Default path
    console.log(`Navigating to ${navigateToPath} with queryParams:`, queryParams);
    this.router.navigate([navigateToPath], { state: { quizParams: queryParams } });

  }

  async calculateTodayDetailedPerformance(): Promise<void> {
    const today = new Date();
    // getDetailedPerformanceForDate will use this.selectedPublicContest.id
    this.todayDetailedPerformance = await this.getDetailedPerformanceForDate(today);
  }

  private async getDetailedPerformanceForDate(date: Date): Promise<DailyPerformanceDataDetailed | null> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return null;
    }

    // Pass this.selectedPublicContest.id to the dbService call
    const attemptsForDate = await this.dbService.getQuizAttemptsBySpecificDate(currentContest.id, date, this.getUserId());
    if (attemptsForDate.length === 0) {
      return { // Return a shell object if no attempts, so chart shows "0"
        date: this.datePipe.transform(date, 'yyyy-MM-dd')!,
        quizzesTaken: 0,
        correctAnswerCount: 0,
        wrongAnswerCount: 0,
        skippedAnswerCount: 0,
        correctAnswerIds: [],
        wrongAnswerIds: [],
        skippedAnswerIds: [],
      };
    }

    const dateStr = this.datePipe.transform(date, 'yyyy-MM-dd')!;
    let correctCount = 0;
    const correctIds: string[] = [];
    const wrongIds: string[] = [];
    const skippedIds: string[] = [];
    let totalQuestionsInAttempts = 0;

    attemptsForDate.forEach(attempt => {
      totalQuestionsInAttempts += attempt.allQuestions.length;
      attempt.answeredQuestions.forEach(aq => {
        if (aq.questionId) {
          if (aq.isCorrect) {
            correctIds.push(aq.questionId);
          } else {
            wrongIds.push(aq.questionId);
          }
        }
      });
      if (attempt.unansweredQuestions && attempt.unansweredQuestions.length > 0) {
        attempt.unansweredQuestions.forEach(aq => {
          if (aq?.questionId && (aq.userAnswerIndex === -1 || aq.userAnswerIndex === undefined)) {
            skippedIds.push(aq.questionId);
          }
        });
      }
    });

    return {
      date: dateStr,
      quizzesTaken: attemptsForDate.length,
      correctAnswerCount: correctIds.length,
      wrongAnswerCount: wrongIds.length,
      skippedAnswerCount: skippedIds.length,
      correctAnswerIds: Array.from(correctIds),
      wrongAnswerIds: Array.from(wrongIds),
      skippedAnswerIds: Array.from(skippedIds),
    };
  }

  onDateSelectedForChart(dateValue: string): void {
    this.selectedDateForChart = dateValue;
    this.selectedDateDetailedPerformance = null; // Clear old data
    if (this.selectedDateChart) {
      this.selectedDateChart.destroy();
      this.selectedDateChart = undefined;
    }
    // Automatically load data for the new date or require a button click?
    // For now, let's keep the "Carica Dati" button as primary trigger.
    this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Premi "Carica Dati" per visualizzare.');
  }

  async loadDataForSelectedDate(recreateChart: boolean = true): Promise<void> {
    if (!this.selectedDateForChart) {
      this.alertService.showAlert("Info", "Per favore, seleziona una data.");
      return;
    }
    this.isLoadingSelectedDateData = true;
    this.selectedDateDetailedPerformance = null; // Clear previous
    if (this.selectedDateChart) {
      this.selectedDateChart.destroy();
      this.selectedDateChart = undefined;
    }

    try {
      const dateParts = this.selectedDateForChart.split('-');
      const targetDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      // getDetailedPerformanceForDate will use this.selectedPublicContest.id
      this.selectedDateDetailedPerformance = await this.getDetailedPerformanceForDate(targetDate);
    } catch (error) {
      console.error('Error loading data for selected date:', error);
      this.alertService.showAlert("Errore", "Impossibile caricare i dati per la data selezionata.");
      this.selectedDateDetailedPerformance = null; // Ensure it's null on error
    } finally {
      this.isLoadingSelectedDateData = false;
      this.cdr.detectChanges();
      if (recreateChart) {
        if (this.selectedDateDetailedPerformance) {
          this.createSelectedDatePerformanceChart();
        } else {
          this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Nessun quiz per la data selezionata.');
        }
      }
    }
  }

  createSelectedDatePerformanceChart(): void {
    if (this.selectedDateChart) this.selectedDateChart.destroy();
    if (!this.selectedDatePerformanceChartRef?.nativeElement || !this.selectedDateDetailedPerformance) {
      return;
    }

    const ctxSelectedDate = this.selectedDatePerformanceChartRef.nativeElement.getContext('2d');
    if (!ctxSelectedDate) return;

    const data = this.selectedDateDetailedPerformance;
    const chartData = {
      labels: ['Quiz Svolti', 'Domande', 'Sbagliate', 'Saltate/Non Risposte', 'Corrette'],
      datasets: [{
        label: `Performance di Oggi (${this.datePipe.transform(data.date, 'dd/MM/yyyy')})`,
        data: [
          data.quizzesTaken,
          (data.wrongAnswerCount ?? 0) + (data.skippedAnswerCount ?? 0) + (data.correctAnswerCount ?? 0),
          data.wrongAnswerCount ?? 0,
          data.skippedAnswerCount ?? 0,
          data.correctAnswerCount ?? 0
        ],
        backgroundColor: [
          'rgba(213, 217, 220, 0.6)',// Quiz Svolti
          'rgba(54, 162, 235, 0.6)', // Domande
          'rgba(255, 99, 132, 0.6)', // Sbagliate
          'rgba(255, 206, 86, 0.6)', // Saltate/Non Risposte
          'rgba(75, 192, 192, 0.6)'  // Corrette
        ],
        borderColor: [
          'rgba(145,149,154,0.82)', // Quiz Svolti
          'rgba(54, 162, 235, 1)', // Domande
          'rgba(255, 99, 132, 1)',// Sbagliate
          'rgba(255, 206, 86, 1)', // Saltate/Non Risposte
          'rgba(75, 192, 192, 1)'// Corrette
        ],
        borderWidth: 10
      }]
    };
    const chartConfig: ChartConfiguration = {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'x',
        layout: {
          padding: {
            top: 30 // Add space from the top bar
          }
        },
        scales: {
          x: {
            ticks: {
              stepSize: 1, font: {
                size: 18, // Make labels bigger
                weight: 'bold'
              },
              color: '#222' // Make labels darker
            },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Conteggio' },
            ticks: {
              stepSize: 1
            },
            suggestedMax: ((data.wrongAnswerCount ?? 0) + (data.skippedAnswerCount ?? 0) + (data.correctAnswerCount ?? 0)) + 2 // Add 2 to the max value for top space
          }
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Dettaglio risultato del giorno (${this.datePipe.transform(data.date, 'dd/MM/yyyy')})`,
            font: {
              size: 22,
              weight: 'bold',
              family: 'Arial, Helvetica, sans-serif'
            },
            color: '#111'
          },
          datalabels: {
            display: true,
            anchor: 'center',
            align: 'center',
            color: '#222',
            font: {
              weight: 'bold',
              size: 20
            },
            formatter: function (value: any) {
              return value;
            }
          }
        },
        onClick: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => {
          this.handleSelectedDateChartClick(event, elements, chart);
        }
      } as ChartOptions,
      plugins: [ChartDataLabels]
    };
    this.selectedDateChart = new Chart(ctxSelectedDate, chartConfig);
  }

  async handleSelectedDateChartClick(event: ChartEvent, elements: ActiveElement[], chart: Chart): Promise<void> {
    if (this.isStatsViewer) {
      return;
    }
    if (elements.length > 0 && this.selectedDateDetailedPerformance) {
      const clickedIndex = elements[0].index;
      let questionIdsToPractice: string[] = [];
      let modalTitle = '';
      const dateForTitle = this.datePipe.transform(this.selectedDateDetailedPerformance.date, 'dd/MM/yy');

      switch (clickedIndex) {
        case 0: /* Quizzes Taken */
          return;
        case 1: /* Sbagliate */
          if ((this.selectedDateDetailedPerformance.wrongAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.selectedDateDetailedPerformance.wrongAnswerIds;
            modalTitle = `Rivedi Errori del ${dateForTitle}`;
          } else {
            this.alertService.showAlert("Info", `Nessun errore per il ${dateForTitle}.`);
            return;
          }
          break;
        case 2: /* Saltate/Non Risposte */
          if ((this.selectedDateDetailedPerformance.skippedAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.selectedDateDetailedPerformance.skippedAnswerIds ?? [];
            modalTitle = `Rivedi Saltate/Non Risposte del ${dateForTitle}`;
          } else {
            this.alertService.showAlert("Info", `Nessuna domanda saltata per il ${dateForTitle}.`);
            return;
          }
          break;
        case 3: /* Corrette */
          if ((this.selectedDateDetailedPerformance.correctAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.selectedDateDetailedPerformance.correctAnswerIds ?? [];
            modalTitle = `Rivedi Corrette del ${dateForTitle}`;
          } else {
            this.alertService.showAlert("Info", `Nessuna risposta corretta per il ${dateForTitle}.`);
            return;
          }
          break;
        default:
          return;
      }
      if (questionIdsToPractice.length > 0) {
        await this.setupQuizForModal(questionIdsToPractice, modalTitle);
      }
    }
  }

  async startPracticeQuizForSelectedDateProblematic(): Promise<void> {
    if (this.selectedDateDetailedPerformance) {
      const wrongIds = this.selectedDateDetailedPerformance.wrongAnswerIds || [];
      const skippedIds = this.selectedDateDetailedPerformance.skippedAnswerIds || [];
      const combinedIds = Array.from(new Set([...wrongIds, ...skippedIds]));

      if (combinedIds.length > 0) {
        const dateForTitle = this.datePipe.transform(this.selectedDateDetailedPerformance.date, 'dd/MM/yy');
        await this.setupQuizForModal(combinedIds, `Rivedi Errori/Saltate del ${dateForTitle}`);
      } else {
        const dateForTitle = this.datePipe.transform(this.selectedDateDetailedPerformance.date, 'dd/MM/yy');
        this.alertService.showAlert("Info", `Nessun errore o domanda saltata per il ${dateForTitle}.`);
      }
    } else {
      this.alertService.showAlert("Info", "Carica prima i dati per una data specifica.");
    }
  }

  // --- END NEW ---


  createTodayPerformanceChart(): void {
    if (this.todayChart) this.todayChart.destroy();
    if (!this.todayPerformanceChartRef?.nativeElement || !this.todayDetailedPerformance) {
      this.clearCanvasOrShowMessage(this.todayPerformanceChartRef, 'Nessun dato per oggi.');
      return;
    }
    const ctxToday = this.todayPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctxToday) return;

    const data = this.todayDetailedPerformance;
    const chartData = {
      labels: ['Quiz Svolti', 'Domande', 'Sbagliate', 'Saltate/Non Risposte', 'Corrette'],
      datasets: [{
        label: `Performance di Oggi (${this.datePipe.transform(data.date, 'dd/MM/yyyy')})`,
        data: [
          data.quizzesTaken,
          (data.wrongAnswerCount ?? 0) + (data.skippedAnswerCount ?? 0) + (data.correctAnswerCount ?? 0),
          data.wrongAnswerCount ?? 0,
          data.skippedAnswerCount ?? 0,
          data.correctAnswerCount ?? 0
        ],
        backgroundColor: [
          'rgba(213, 217, 220, 0.6)',// Quiz Svolti
          'rgba(54, 162, 235, 0.6)', // Domande
          'rgba(255, 99, 132, 0.6)', // Sbagliate
          'rgba(255, 206, 86, 0.6)', // Saltate/Non Risposte
          'rgba(75, 192, 192, 0.6)'  // Corrette
        ],
        borderColor: [
          'rgba(145,149,154,0.82)', // Quiz Svolti
          'rgba(54, 162, 235, 1)', // Domande
          'rgba(255, 99, 132, 1)',// Sbagliate
          'rgba(255, 206, 86, 1)', // Saltate/Non Risposte
          'rgba(75, 192, 192, 1)'// Corrette
        ],
        borderWidth: 10
      }]
    };
    const chartTodayConfig: ChartConfiguration = {
      type: 'bar', data: chartData,
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'x',
        layout: {
          padding: {
            top: 30 // Add space from the top bar
          }
        },
        scales: {
          x: {
            ticks: {
              stepSize: 1, font: {
                size: 18, // Make labels bigger
                weight: 'bold'
              },
              color: '#222' // Make labels darker
            },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Conteggio' },
            ticks: {
              stepSize: 1
            },
            suggestedMax: ((data.wrongAnswerCount ?? 0) + (data.skippedAnswerCount ?? 0) + (data.correctAnswerCount ?? 0)) + 2 // Add 2 to the max value for top space
          }
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Dettaglio Performance Odierna (${this.datePipe.transform(data.date, 'dd/MM/yyyy')})`,
            font: {
              size: 22,
              weight: 'bold',
              family: 'Arial, Helvetica, sans-serif'
            },
            color: '#111'
          },
          datalabels: {
            display: true,
            anchor: 'center',
            align: 'center',
            color: '#222',
            font: {
              weight: 'bold',
              size: 20
            },
            formatter: function (value: any) {
              return value;
            }
          }
        },
        onClick: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => {
          this.handleTodayChartClick(event, elements, chart);
        }
      } as ChartOptions,
      plugins: [ChartDataLabels]
    };
    this.todayChart = new Chart(ctxToday, chartTodayConfig);
  }

  async handleTodayChartClick(event: ChartEvent, elements: ActiveElement[], chart: Chart): Promise<void> {
    if (this.isStatsViewer) {
      return;
    }
    if (elements.length > 0 && this.todayDetailedPerformance) {
      const clickedIndex = elements[0].index;
      let questionIdsToPractice: string[] = [];
      let modalTitle = '';

      switch (clickedIndex) { // labels: ['Quiz Svolti', 'Sbagliate', 'Saltate/Non Risposte', 'Corrette']
        case 0: /* Quizzes Taken */
          return;
        case 1:
          if ((this.todayDetailedPerformance.wrongAnswerCount ?? 0) + (this.todayDetailedPerformance.correctAnswerCount ?? 0) + (this.todayDetailedPerformance.skippedAnswerCount ?? 0) > 0) {
            questionIdsToPractice = (this.todayDetailedPerformance.wrongAnswerIds ?? [])
              .concat(this.todayDetailedPerformance.correctAnswerIds ?? [])
              .concat(this.todayDetailedPerformance.skippedAnswerIds ?? []);
            modalTitle = 'Rivedi domande di Oggi';
          } else {
            this.alertService.showAlert("Info", "Nessuna domanda fatta oggi... Studia, capra!");
            return;
          }
          break;
        case 2: /* Sbagliate */
          if ((this.todayDetailedPerformance.wrongAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.todayDetailedPerformance.wrongAnswerIds;
            modalTitle = 'Rivedi Errori di Oggi';
          } else {
            this.alertService.showAlert("Info", "Nessun errore da rivedere per oggi. Ottimo!");
            return;
          }
          break;
        case 3: /* Saltate/Non Risposte */
          if ((this.todayDetailedPerformance.skippedAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.todayDetailedPerformance.skippedAnswerIds ?? [];
            modalTitle = 'Rivedi Saltate/Non Risposte di Oggi';
          } else {
            this.alertService.showAlert("Info", "Nessuna domanda saltata o non risposta per oggi.");
            return;
          }
          break;
        case 4: /* Corrette */
          if ((this.todayDetailedPerformance.correctAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.todayDetailedPerformance.correctAnswerIds ?? [];
            modalTitle = 'Rivedi Corrette di Oggi';
          } else {
            this.alertService.showAlert("Info", "Nessuna risposta corretta da rivedere per oggi.");
            return;
          }
          break;
        default:
          return;
      }
      if (questionIdsToPractice.length > 0) {
        await this.setupQuizForModal(questionIdsToPractice, modalTitle);
      }
    }
  }


  async setupQuizForModal(questionIds: string[], modalTitle: string): Promise<void> {
    this.isLoadingModal = true;
    this.loadingButtonIndex = -2; // Generic for chart/modal initiated quizzes
    try {
      const questionsForModal = await this.dbService.getQuestionByIds(questionIds);
      const topicsMap = new Map<string, { count: number; questionIds: string[] }>();
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
        topic: topicName,
        count: data.count,
        questionIds: data.questionIds
      }));
      this.quizSetupModalTitle = modalTitle;
      this.openQuizSetupModal();
    } catch (error) {
      console.error("Error setting up quiz from chart click:", error);
      this.alertService.showAlert("Errore", "Impossibile preparare il quiz di pratica.");
    } finally {
      this.isLoadingModal = false;
      this.loadingButtonIndex = -1;
    }
  }

  startPracticeQuizForTodayWrong(): void {
    if (this.todayDetailedPerformance) {
      const wrongIds = this.todayDetailedPerformance.wrongAnswerIds || [];
      const skippedIds = this.todayDetailedPerformance.skippedAnswerIds || [];
      const combinedIds = Array.from(new Set([...wrongIds, ...skippedIds]));

      if (combinedIds.length > 0) {
        this.setupQuizForModal(combinedIds, 'Rivedi Errori/Saltate di Oggi');
      } else {
        this.alertService.showAlert("Info", "Nessun errore o domanda saltata registrati oggi da rivedere!");
      }
    } else {
      this.alertService.showAlert("Info", "Nessun dato disponibile per oggi!");
    }
  }

  getUserId(): number {
    let userId = this.authService.getCurrentUserId();
    if (userId === 3 && this.isStatsViewer) {
      userId = 2;
    }
    return userId;
  }

  calculateDailyRevisionPerformance(): void {
    const dailyMap = new Map<string, DailyMap>();
    const dateFormatter = new DatePipe('en-US');
    const sortedAttempts = [...this.quizAttempts].sort((a, b) =>
      new Date(a.timestampEnd || a.timestampStart || 0).getTime() - new Date(b.timestampEnd || b.timestampStart || 0).getTime()
    ).filter(attempt => attempt.quizType === "Revisione errori" || (attempt.settings && attempt.settings.quizType === "Revisione errori"));
    sortedAttempts.forEach(attempt => {
      const timestamp = attempt.timestampEnd || attempt.timestampStart;
      if (!timestamp) return;
      const dateKey = dateFormatter.transform(timestamp, 'yyyy-MM-dd')!;
      const dayData = dailyMap.get(dateKey) || { quizzes: 0, correct: 0, incorrect: 0, skipped: 0, attempted: 0 };
      dayData.quizzes++;
      dayData.correct += attempt.answeredQuestions
        ? attempt.answeredQuestions.filter(aq => aq.isCorrect && (attempt.timestampEnd && dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd') === dateKey)).length
        : 0;
      dayData.incorrect += attempt.answeredQuestions ? attempt.answeredQuestions.filter(aq => !aq.isCorrect && (attempt.timestampEnd && dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd') === dateKey)).length
        : 0;
      dayData.skipped += attempt.unansweredQuestions && (attempt.timestampEnd && dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd') === dateKey) ? attempt.unansweredQuestions.length : 0;
      const total = dayData.correct + dayData.incorrect + dayData.skipped;
      dailyMap.set(dateKey, dayData);
    });
    this.dailyRevisionPerformance = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date: date,
        quizzesTaken: data.quizzes,
        totalCorrect: data.correct,
        totalIncorrect: data.incorrect,
        totalSkipped: data.skipped,
        totalAttemptedInDay: data.correct + data.incorrect + data.skipped,
        averageAccuracy: (data.correct + data.incorrect + data.skipped) > 0 ? (data.correct / (data.correct + data.incorrect + data.skipped)) : 0
      } as DailyPerformanceData)).slice(-30);
  }

  createDailyRevisionPerformanceChart(): void {
    if (this.revisionChart) this.revisionChart.destroy();
    if (!this.dailyRevisionPerformanceChartRef?.nativeElement || this.dailyRevisionPerformance.length === 0) {
      this.clearCanvasOrShowMessage(this.dailyRevisionPerformanceChartRef, 'Nessun dato sull\'andamento giornaliero.');
      return;
    }
    const ctx = this.dailyRevisionPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctx) return;


    // Build daily map for revision attempts
    const dailyMap = new Map<string, DailyMap>();
    const dateFormatter = new DatePipe('en-US');
    this.dailyRevisionPerformance.forEach(attempt => {
      const dayData = dailyMap.get(attempt.date) || { quizzes: 0, correct: 0, incorrect: 0, skipped: 0 };
      dayData.quizzes++;
      dayData.correct += attempt.totalCorrect
      dayData.incorrect += attempt.totalIncorrect
      dayData.skipped += attempt.totalSkipped
      dailyMap.set(attempt.date, dayData);
    });

    const labels = this.dailyRevisionPerformance.map(dp => dp.date);
    const accuracyData = this.dailyRevisionPerformance.map(dp => dp.averageAccuracy * 100);
    const quizzesTakenData = this.dailyRevisionPerformance.map(dp => dp.quizzesTaken);
    const totalCorrectData = this.dailyRevisionPerformance.map(dp => dp.totalCorrect);
    const totalAttemptedData = this.dailyRevisionPerformance.map(dp => dp.totalAttemptedInDay);
    const totalIncorrectData = this.dailyRevisionPerformance.map(dp => dp.totalIncorrect);
    const totalSkippedData = this.dailyRevisionPerformance.map(dp => dp.totalSkipped);
    const maxTotalAnswered = Math.max(...totalAttemptedData);

    const chartData = {
      labels: labels,
      datasets: [
        {
          type: 'line' as const,
          label: 'Precisione Media (%)',
          data: accuracyData,
          borderColor: 'rgba(255, 159, 64, 1)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
          yAxisID: 'yAccuracy',
          tension: 0.1,
          fill: false
        },
        {
          type: 'bar' as const,
          label: 'Domande svolte',
          data: totalAttemptedData,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          yAxisID: 'yQuizzes'
        },
        {
          type: 'bar' as const,
          label: 'Risposte errate',
          data: totalIncorrectData,
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          yAxisID: 'yQuizzes'
        },
        {
          type: 'bar' as const,
          label: 'Risposte saltate',
          data: totalSkippedData,
          backgroundColor: 'rgba(255, 206, 86, 0.6)',
          borderColor: 'rgba(255, 206, 86, 1)',
          borderWidth: 2,
          yAxisID: 'yQuizzes'
        },
        {
          type: 'bar' as const,
          label: 'Risposte Corrette',
          data: totalCorrectData,
          backgroundColor: 'rgba(75, 192, 192, 0.7)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 2,
          yAxisID: 'yQuizzes'
        },
      ]
    };

    const chartDailyConfig: ChartConfiguration = {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          x: {
            type: 'time',
            adapters: {
              date: {
                locale: it
              }
            },
            time: {
              unit: 'day',
              tooltipFormat: 'd MMM yyyy',
              displayFormats: {
                day: 'd MMM'
              }
            },
            title: {
              display: true,
              text: 'Data'
            }
          },
          yAccuracy: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Precisione (%)'
            },
            ticks: {
              callback: value => value + '%'
            },
            grid: {
              drawOnChartArea: true
            }
          },
          yQuizzes: {
            suggestedMax: maxTotalAnswered + 2,
            type: 'linear',
            position: 'right',
            min: 0,
            title: {
              display: true,
              text: 'Conteggio'
            },
            grid: {
              drawOnChartArea: false,
            },
            ticks: {
              stepSize: 1
            }
          }
        },
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
          },
          title: {
            display: true,
            text: 'Andamento Revisioni Giornaliero'
          },
          legend: {
            display: true,
            position: 'top',
          },
          datalabels: {
            display: (context: any) => {
              const value = context.dataset.data[context.dataIndex] as number;
              if (typeof value !== 'number') {
                return false;
              }
              if (context.dataset.yAxisID === 'yQuizzes') {
                return value !== 0;
              }
              return true;
            },
            anchor: 'end',
            align: 'center',
            color: document.documentElement.classList.contains('dark') ? '#E2E8F0' : '#2e2f30',
            font: {
              weight: 'bold',
              size: 12
            },
            formatter: (value: number, context: any) => {
              if (typeof value !== 'number') {
                return '';
              }
              if (context.dataset.yAxisID === 'yAccuracy') {
                return value.toFixed(2) + '%';
              } else {
                return Math.round(value).toString();
              }
            }
          }
        }
      } as ChartOptions,
      plugins: [ChartDataLabels]
    };
    this.revisionChart = new Chart(ctx, chartDailyConfig);
  }

  openChartOnNewPage(chartType: string): void {
    if (!this.isMobile) {
      return;
    }

    this.alertService.showConfirmationDialog("Info grafico", "Vuoi aprire il grafico in una nuova schermata, in orizzontale?").then(result => {
      if (!result || result === 'cancel' || !result.role || result.role === 'cancel') {
        return;
      }
      // Find the chart instance by type
      let chart: Chart | undefined;
      switch (chartType) {
        case 'topic':
          chart = this.topicChart;
          break;
        case 'daily':
          chart = this.dailyChart;
          break;
        case 'dailyPrecision':
          chart = this.dailyPrecisionChart;
          break;
        case 'today':
          chart = this.todayChart;
          break;
        case 'selectedDate':
          chart = this.selectedDateChart;
          break;
        case 'revision':
          chart = this.revisionChart;
          break;
        default:
          this.alertService.showAlert("Errore", "Tipo di grafico non riconosciuto.");
          return;
      }
      if (!chart) {
        this.alertService.showAlert("Errore", "Grafico non disponibile.");
        return;
      }

      // Try to zoom in on the most recent 7 data points (if available)
      const xScale = chart.scales['x'];
      if (xScale && xScale.getLabels && typeof xScale.getLabels === 'function') {
        const labels = xScale.getLabels();
        if (labels && labels.length > 7) {
          // Set min/max to show only the last 7 labels
          const minLabel = labels[labels.length - 7];
          const maxLabel = labels[labels.length - 1];
          if (xScale.options) {
            xScale.options.min = minLabel;
            xScale.options.max = maxLabel;
          }
          chart.update();
        }
      } else if (xScale && xScale.min !== undefined && xScale.max !== undefined && xScale.ticks && xScale.ticks.length > 7) {
        // Fallback for older Chart.js versions
        const ticks = xScale.ticks;
        xScale.min = ticks[ticks.length - 7].value;
        xScale.max = ticks[ticks.length - 1].value;
        chart.update();
      }

      // Get the chart's canvas as a data URL
      const canvas = chart.canvas;
      const dataUrl = canvas.toDataURL('image/png', 1.0);

      // Open the image in a new browser tab
      const win = window.open();
      if (win) {
        win.document.write(`
      <html>
        <head>
        <title>Grafico - ${chartType}</title>
        <style>
          body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f9f9f9; }
          img { max-width: 98vw; max-height: 98vh; border: 1px solid #ccc; }
        </style>
        </head>
        <body>
        <img src="${dataUrl}" alt="Grafico ${chartType}" />
        </body>
      </html>
      `);
        win.document.close();
      } else {
        this.alertService.showAlert("Errore", "Impossibile aprire una nuova finestra per il grafico.");
      }
    })

  }
}
