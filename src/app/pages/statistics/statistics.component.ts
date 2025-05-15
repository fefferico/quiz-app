// src/app/pages/statistics/statistics.component.ts
import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe, PercentPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables, ChartConfiguration, ChartOptions, ChartEvent, ActiveElement } from 'chart.js/auto'; // Added ChartEvent, ActiveElement
import 'chartjs-adapter-date-fns';
import { FormsModule } from '@angular/forms'; // Import FormsModule for ngModel

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings, QuestionSnapshotInfo } from '../../models/quiz.model'; // Added QuestionSnapshotInfo
import { Question } from '../../models/question.model';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { SetupModalComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faExclamation, faRepeat, faHome, faMagnifyingGlass, faPersonMilitaryRifle, faGears } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';

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
}


@Component({
  selector: 'app-statistics',
  standalone: true,
  providers: [DatePipe], // Add DatePipe to providers if not already global
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

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously
  study: IconDefinition = faMagnifyingGlass; // This was already here, seems unused in the template you showed previously
  military: IconDefinition = faPersonMilitaryRifle; // This was already here, seems unused in the template you showed previously
  faGears: IconDefinition = faGears; // This was already here, seems unused in the template you showed previously

  quizAttempts: QuizAttempt[] = [];
  allQuestionsFromDb: Question[] = []; // Store all questions from the DB bank

  isLoading = true;
  isLoadingModal = false;
  loadingButtonIndex = -1;
  errorLoading = '';
  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';

  totalQuizzesTaken = 0;
  totalQuestionsAttempted = 0;
  totalCorrectAnswers = 0;
  overallAccuracy = 0;
  averageScorePercentage = 0;

  topicPerformance: TopicPerformanceData[] = [];
  tipologiaDomande: TopicPerformanceData[] = [];
  tipologiaSelected: TopicPerformanceData = { topic: '', correct: 0, total: 0, accuracy: 0, questionIds: [] };
  topics: GenericData[] = [];
  @ViewChild('topicPerformanceChart') topicPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  topicChart: Chart | undefined;

  dailyPerformance: DailyPerformanceData[] = [];
  // We will use a single object for today's detailed data for simplicity
  todayDetailedPerformance: DailyPerformanceDataDetailed | null = null;
  dailyPerformanceDetailed: DailyPerformanceDataDetailed[] = [];
  @ViewChild('dailyPerformanceChart') dailyPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('todayPerformanceChartOld') todayPerformanceChartRefOld!: ElementRef<HTMLCanvasElement>;
  @ViewChild('todayPerformanceChart') todayPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  dailyChart: Chart | undefined;
  todayChart: Chart | undefined;

  wrongAnswerBreakdown: TopicWrongAnswerData[] = [];
  totalWrongAnswersOverall = 0;

  topicCoverage: TopicCoverageData[] = [];

  // --- NEW: Properties for Selected Date Chart ---
  selectedDateForChart: string | null = null; // Store as string YYYY-MM-DD
  selectedDateDetailedPerformance: DailyPerformanceDataDetailed | null = null;
  isLoadingSelectedDateData = false;
  @ViewChild('selectedDatePerformanceChart') selectedDatePerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  selectedDateChart: Chart | undefined;
  // --- END NEW ---


  ngOnInit(): void {
    this.loadAndProcessStatistics();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.selectedDateForChart = this.datePipe.transform(yesterday, 'yyyy-MM-dd');
  }

  ngAfterViewInit(): void {
    Promise.resolve().then(() => this.createChartsIfReady());
  }

  private createChartsIfReady(): void {
    if (this.isLoading || this.errorLoading) return;

    // Topic Performance Chart
    if (this.topicPerformanceChartRef?.nativeElement && this.topicPerformance.length > 0) {
      this.createTopicPerformanceChart();
    } else if (this.topicChart) {
      this.topicChart.destroy(); this.topicChart = undefined;
    }

    // Daily Trend Chart
    if (this.dailyPerformanceChartRef?.nativeElement && this.dailyPerformance.length > 0) {
      this.createDailyPerformanceChart();
    } else if (this.dailyChart) {
      this.dailyChart.destroy(); this.dailyChart = undefined;
    }

    // Today's Detailed Chart
    if (this.todayPerformanceChartRef?.nativeElement && this.todayDetailedPerformance) {
      this.createTodayPerformanceChart();
    } else if (this.todayChart) {
      this.todayChart.destroy(); this.todayChart = undefined;
      this.clearCanvasOrShowMessage(this.todayPerformanceChartRef, 'Nessun dato per oggi.');
    }

    // Selected Date Detailed Chart
    if (this.selectedDatePerformanceChartRef?.nativeElement && this.selectedDateDetailedPerformance) {
      this.createSelectedDatePerformanceChart();
    } else if (this.selectedDateChart) {
      this.selectedDateChart.destroy(); this.selectedDateChart = undefined;
      this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Seleziona una data e carica i dati.');
    }
  }

  private clearCanvasOrShowMessage(chartRef: ElementRef<HTMLCanvasElement> | undefined, message: string): void {
    const canvas = chartRef?.nativeElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.font = '14px Arial';
        ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#a0aec0' : '#4a5568';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
      }
    }
  }


   async loadAndProcessStatistics(): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      const [quizAttempts, allQuestionsFromDb] = await Promise.all([
        this.dbService.getAllQuizAttempts(),
        this.dbService.getAllQuestions()
      ]);

      this.quizAttempts = quizAttempts;
      this.allQuestionsFromDb = allQuestionsFromDb;

      if (this.quizAttempts.length > 0) {
        await this.calculateOverallStats();
        await this.calculateTopicPerformance();
        await this.calculateDailyPerformance();
        await this.calculateTodayDetailedPerformance();
        await this.calculateWrongAnswerBreakdown();
        await this.calculateTopicCoverage();
        await this.getGenericData();
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
      Promise.resolve().then(() => this.createChartsIfReady());
    }
  }


  private resetAllStatsToZero(): void {
    this.totalQuizzesTaken = 0;
    this.totalQuestionsAttempted = 0;
    this.totalCorrectAnswers = 0;
    this.overallAccuracy = 0;
    this.averageScorePercentage = 0;
    this.topicPerformance = [];
    this.dailyPerformance = [];
    this.todayDetailedPerformance = null;
    this.selectedDateDetailedPerformance = null;
    this.wrongAnswerBreakdown = [];
    this.topicCoverage = [];
    this.tipologiaDomande = [];

    if (this.topicChart) { this.topicChart.destroy(); this.topicChart = undefined; }
    if (this.dailyChart) { this.dailyChart.destroy(); this.dailyChart = undefined; }
    if (this.todayChart) { this.todayChart.destroy(); this.todayChart = undefined; }
    if (this.selectedDateChart) { this.selectedDateChart.destroy(); this.selectedDateChart = undefined; }
  }


  calculateOverallStats(): void {
    this.totalQuizzesTaken = this.quizAttempts.length;
    this.totalQuestionsAttempted = 0;
    this.totalCorrectAnswers = 0;
    let totalWeightedScoreSum = 0;
    let totalPossibleScoreSum = 0;

    this.quizAttempts.forEach(attempt => {
      const currentScore = attempt.score || 0;
      this.totalQuestionsAttempted += attempt.totalQuestionsInQuiz;
      this.totalCorrectAnswers += currentScore;
      totalWeightedScoreSum += currentScore;
      totalPossibleScoreSum += attempt.totalQuestionsInQuiz;
    });

    this.overallAccuracy = this.totalQuestionsAttempted > 0
      ? (this.totalCorrectAnswers / this.totalQuestionsAttempted)
      : 0;
    this.averageScorePercentage = totalPossibleScoreSum > 0
      ? (totalWeightedScoreSum / totalPossibleScoreSum)
      : 0;
  }

  async calculateDailyPerformanceWithDetails(): Promise<void> {
    const todayAttempts = await this.dbService.getAllTodayQuizAttempts();
    if (todayAttempts.length > 0) {
      const todayDateStr = new DatePipe('it-IT').transform(new Date(), 'yyyy-MM-dd')!;
      const wrongIdsSet = new Set<string>();
      todayAttempts.forEach(attempt => {
        attempt.answeredQuestions.forEach(aq => {
          if (!aq.isCorrect) wrongIdsSet.add(aq.questionId);
        });
      });
      let totalQuiz = 0;
      todayAttempts.forEach(attempt => {
        attempt.allQuestions.forEach(aq => {
          totalQuiz++;
        });
      });

      this.dailyPerformanceDetailed = [{
        date: todayDateStr,
        quizzesTaken: totalQuiz,
        wrongAnswerIds: Array.from(wrongIdsSet)
      }];
    } else {
      this.dailyPerformanceDetailed = [];
    }
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
    const dailyMap = new Map<string, { quizzes: number, correct: number, attempted: number }>();
    const dateFormatter = new DatePipe('en-US');
    const sortedAttempts = [...this.quizAttempts].sort((a, b) =>
      new Date(a.timestampEnd || a.timestampStart || 0).getTime() - new Date(b.timestampEnd || b.timestampStart || 0).getTime()
    );
    sortedAttempts.forEach(attempt => {
      const timestamp = attempt.timestampEnd || attempt.timestampStart;
      if (!timestamp) return;
      const dateKey = dateFormatter.transform(timestamp, 'yyyy-MM-dd')!;
      const dayData = dailyMap.get(dateKey) || { quizzes: 0, correct: 0, attempted: 0 };
      dayData.quizzes++;
      dayData.correct += attempt.score || 0;
      dayData.attempted += attempt.totalQuestionsInQuiz;
      dailyMap.set(dateKey, dayData);
    });
    this.dailyPerformance = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date: date,
        quizzesTaken: data.quizzes,
        totalCorrect: data.correct,
        totalAttemptedInDay: data.attempted,
        averageAccuracy: data.attempted > 0 ? (data.correct / data.attempted) : 0
      })).slice(-30);
  }

  calculateWrongAnswerBreakdown(): void {
    const wrongMap = new Map<string, { wrong: number, totalInTopic: number }>();
    this.totalWrongAnswersOverall = 0;
    this.quizAttempts.forEach(attempt => {
      attempt.answeredQuestions.forEach(ansQ => {
        const topic = ansQ.questionSnapshot.topic || 'Uncategorized';
        const data = wrongMap.get(topic) || { wrong: 0, totalInTopic: 0 };
        data.totalInTopic++;
        if (!ansQ.isCorrect) {
          data.wrong++;
          this.totalWrongAnswersOverall++;
        }
        wrongMap.set(topic, data);
      });
    });
    this.wrongAnswerBreakdown = Array.from(wrongMap.entries()).map(([topic, data]) => ({
      topic,
      wrongAnswers: data.wrong,
      totalAnswersInTopic: data.totalInTopic,
      percentageOfGlobalWrong: this.totalWrongAnswersOverall > 0 ? (data.wrong / this.totalWrongAnswersOverall) : 0,
      topicSpecificFailureRate: data.totalInTopic > 0 ? (data.wrong / data.totalInTopic) : 0
    }))
      .filter(item => item.wrongAnswers > 0)
      .sort((a, b) => b.topicSpecificFailureRate - a.topicSpecificFailureRate);
  }

  calculateTopicCoverage(): void {
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
    this.quizAttempts.forEach(attempt => {
      attempt.allQuestions.forEach(qSnapshotInfo => {
        const topic = qSnapshotInfo.questionSnapshot.topic || 'Uncategorized';
        if (!encounteredQuestionIdsByTopic.has(topic)) {
          encounteredQuestionIdsByTopic.set(topic, new Set());
        }
        encounteredQuestionIdsByTopic.get(topic)!.add(qSnapshotInfo.questionId);
      });
    });

    this.topicCoverage = [];
    questionsByTopicDb.forEach((questionsInBankForTopic, topic) => {
      const totalInBank = questionsInBankForTopic.length;
      const encounteredSet = encounteredQuestionIdsByTopic.get(topic) || new Set();
      const encounteredCount = encounteredSet.size;

      this.topicCoverage.push({
        topic: topic,
        totalQuestionsInTopicBank: totalInBank,
        questionsEncountered: encounteredCount,
        coveragePercentage: totalInBank > 0 ? (encounteredCount / totalInBank) : 0
      });
    });

    this.topicCoverage.sort((a, b) => a.topic.localeCompare(b.topic));
  }

  createDailyPerformanceChart(): void {
    if (this.dailyChart) this.dailyChart.destroy();
    if (!this.dailyPerformanceChartRef?.nativeElement || this.dailyPerformance.length === 0) return;
    const ctx = this.dailyPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = this.dailyPerformance.map(dp => dp.date);
    const accuracyData = this.dailyPerformance.map(dp => dp.averageAccuracy * 100);
    const quizzesTakenData = this.dailyPerformance.map(dp => dp.quizzesTaken);

    const chartDailyConfig: ChartConfiguration = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Precisione media giornaliera (%)', data: accuracyData, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, yAxisID: 'yAccuracy', fill: true },
          { label: 'Quiz svolti', data: quizzesTakenData, borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.2)', type: 'bar', yAxisID: 'yQuizzes' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'MMM d' } }, title: { display: true, text: 'Data' } },
          yAccuracy: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: 'Precisione (%)' }, ticks: { callback: value => value + '%' } },
          yQuizzes: { type: 'linear', position: 'right', min: 0, title: { display: true, text: 'Quiz svolti' }, grid: { drawOnChartArea: false }, ticks: { stepSize: 1 } }
        },
        plugins: { tooltip: { mode: 'index', intersect: false }, title: { display: true, text: 'Andamento Performance Giornaliera' } }
      } as ChartOptions
    };
    this.dailyChart = new Chart(ctx, chartDailyConfig);
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
        datasets: [{ label: 'Precisione per argomento (%)', data: data, backgroundColor: backgroundColors, borderColor: borderColors, borderWidth: 1 }]
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
    if (confirm('Sei sicuro di voler cancellare tutte le tue statistiche? Questo cancellerà tutto lo storico dei tuoi quiz.')) {
      try {
        await this.dbService.resetDatabase();
        await this.loadAndProcessStatistics(); // Reload to show empty state and re-initialize
        this.alertService.showAlert("Info", 'Statistiche resettate con successo.');
      } catch (error) {
        console.error('Error resetting statistics:', error);
        this.alertService.showAlert("Attenzione", "Errore durante il reset delle statistiche.");
      }
    }
  }

  startPracticeQuizForTopic(topic: string): void {
    const practiceQuestionIds = new Set<string>();
    this.quizAttempts.forEach(attempt => {
      attempt.allQuestions.forEach(qInfo => {
        if (qInfo.questionSnapshot.topic === topic) {
          const answeredVersion = attempt.answeredQuestions.find(aq => aq.questionId === qInfo.questionId);
          if (!answeredVersion || !answeredVersion.isCorrect) {
            practiceQuestionIds.add(qInfo.questionId);
          }
        }
      });
    });

    if (practiceQuestionIds.size === 0) {
      // If no wrong/unanswered, offer to practice all questions from the topic
      const allTopicQuestions = this.allQuestionsFromDb.filter(q => (q.topic || 'Uncategorized') === topic);
      if (allTopicQuestions.length > 0) {
        if (confirm(`Hai risposto correttamente a tutte le domande incontrate per l'argomento "${topic}". Vuoi comunque fare pratica su tutte le ${allTopicQuestions.length} domande disponibili per questo argomento?`)) {
          allTopicQuestions.forEach(q => practiceQuestionIds.add(q.id));
        } else {
          return;
        }
      } else {
        this.alertService.showAlert("Attenzione", `Nessuna domanda disponibile per l'argomento: ${topic}.`);
        return;
      }
    }

    const finalQuestionIds = Array.from(practiceQuestionIds);
    this.router.navigate(['/quiz/take'], {
      queryParams: {
        quizTitle: `Pratica: ${topic}`,
        question_ids: finalQuestionIds.join(','),
        numQuestions: finalQuestionIds.length,
      }
    });
  }



  async startPracticeQuizForGeneralData(index: number): Promise<void> { // Made async
    this.isLoadingModal = true;
    const selectedData = this.tipologiaDomande[index];
    if (!selectedData || !selectedData.questionIds || selectedData.questionIds.length === 0) {
      this.alertService.showAlert("Info", `Nessuna domanda disponibile per la categoria: ${selectedData?.topic || 'sconosciuta'}`);
      return;
    }
    this.quizSetupModalTitle = selectedData.topic;
    this.topics = [];

    try {
      const questionsForModal = await this.dbService.getQuestionByIds(selectedData.questionIds);
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
    if (this.topicChart) this.topicChart.destroy();
    if (this.dailyChart) this.dailyChart.destroy();
    if (this.todayChart) this.todayChart.destroy();
    if (this.selectedDateChart) this.selectedDateChart.destroy();
  }

  async exportStatisticsToPDF(): Promise<void> {
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


    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('Report Statistiche Quiz', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 3;

    if (this.quizAttempts.length > 0) {
      doc.setFontSize(14); doc.text('Performance Generale', margin, yPos); yPos += lineHeight * 1.5;
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      [
        `Quiz Svolti: ${this.totalQuizzesTaken}`,
        `Domande Affrontate: ${this.totalQuestionsAttempted}`,
        `Risposte Corrette: ${this.totalCorrectAnswers}`,
        `Precisione Generale: ${new PercentPipe('en-US').transform(this.overallAccuracy, '1.0-1')}`,
        `Punteggio Medio: ${new PercentPipe('en-US').transform(this.averageScorePercentage, '1.0-1')}`
      ].forEach(stat => { checkYPos(lineHeight); doc.text(stat, margin + 2, yPos); yPos += lineHeight; });
      yPos += sectionSpacing;
    }


    if (this.topicCoverage.length > 0) {
      checkYPos(lineHeight * 3);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Copertura Argomenti', margin, yPos); yPos += lineHeight * 1.5;
      (doc as any).autoTable({
        startY: yPos,
        head: [['Argomento', 'Domande nel DB', 'Domande Incontrate', 'Copertura (%)']],
        body: this.topicCoverage.map(tc => [
          tc.topic, tc.totalQuestionsInTopicBank.toString(), tc.questionsEncountered.toString(),
          new PercentPipe('en-US').transform(tc.coveragePercentage, '1.0-0')
        ]),
        theme: 'striped', styles: { fontSize: 8, cellPadding: 1.5, halign: 'right' },
        headStyles: { fillColor: [75, 85, 99], fontSize: 8.5, fontStyle: 'bold', halign: 'center' }, // gray-500
        columnStyles: { 0: { halign: 'left', cellWidth: 'auto' } }, // Topic name left aligned
        margin: { left: margin, right: margin },
        didDrawPage: (data: any) => { yPos = data.cursor.y; if (yPos > pageHeight - margin - 10) yPos = margin }
      });
      yPos = (doc as any).lastAutoTable.finalY + sectionSpacing;
    }


    if (this.topicChart && this.topicPerformance.length > 0) {
      checkYPos(80); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Precisione per Argomento', margin, yPos); yPos += lineHeight * 1.5;
      try {
        const chartImage = this.topicChart.toBase64Image('image/png', 1.0);
        const imgProps = this.topicChart.canvas;
        const aspectRatio = imgProps.width / imgProps.height;
        const imgWidth = Math.min(contentWidth, 160); // Slightly smaller
        const imgHeight = imgWidth / aspectRatio;
        checkYPos(imgHeight + lineHeight);
        doc.addImage(chartImage, 'PNG', margin + (contentWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + lineHeight;
      } catch (e) { console.error("Error PDF Topic Chart:", e); yPos += lineHeight; }
      yPos += sectionSpacing / 2;
    }

    if (this.dailyChart && this.dailyPerformance.length > 0) {
      checkYPos(100); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Andamento Giornaliero', margin, yPos); yPos += lineHeight * 1.5;
      try {
        const chartImage = this.dailyChart.toBase64Image('image/png', 1.0);
        const imgProps = this.dailyChart.canvas;
        const aspectRatio = imgProps.width / imgProps.height;
        const imgWidth = Math.min(contentWidth, 170);
        const imgHeight = imgWidth / aspectRatio;
        checkYPos(imgHeight + lineHeight);
        doc.addImage(chartImage, 'PNG', margin + (contentWidth - imgWidth) / 2, yPos, imgWidth, imgHeight);
        yPos += imgHeight + lineHeight;
      } catch (e) { console.error("Error PDF Daily Chart:", e); yPos += lineHeight; }
      yPos += sectionSpacing / 2;
    }

    if (this.wrongAnswerBreakdown.length > 0) {
      checkYPos(lineHeight * 3);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Focus Errori per Argomento', margin, yPos); yPos += lineHeight * 1.5;
      (doc as any).autoTable({
        startY: yPos,
        head: [['Argomento', 'Errori', '% su Tot. Errori', 'Tasso Errore Argomento']],
        body: this.wrongAnswerBreakdown.map(wa => [
          wa.topic, wa.wrongAnswers.toString(),
          new PercentPipe('en-US').transform(wa.percentageOfGlobalWrong, '1.0-1'),
          new PercentPipe('en-US').transform(wa.topicSpecificFailureRate, '1.0-1')
        ]),
        theme: 'grid', styles: { fontSize: 8, cellPadding: 1.5, halign: 'right' },
        headStyles: { fillColor: [220, 53, 69], fontSize: 8.5, fontStyle: 'bold', halign: 'center' }, // red-like
        columnStyles: { 0: { halign: 'left', cellWidth: 'auto' } },
        margin: { left: margin, right: margin },
        didDrawPage: (data: any) => { yPos = data.cursor.y; if (yPos > pageHeight - margin - 10) yPos = margin }
      });
      yPos = (doc as any).lastAutoTable.finalY + sectionSpacing;
    }

    addPageNumbers(); // Add page numbers at the end
    doc.save(`report-statistiche-quiz-${new DatePipe('en-US').transform(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  }


  async getGenericData(): Promise<void> {
    const [
      // allQuestions // Already fetched in this.allQuestionsFromDb
      uniqueCorrectOnce,
      uniqueWrongOnce,
      uniqueNeverAnswered,
      uniqueAnsweredOnce,
      onlyCorrectlyAnswered,
      domandeDaRafforzare,
      domandeInCuiVaiMalino,
      domandeInCuiVaiMoltoMale,
      domandeDisastro
    ] = await Promise.all([
      this.dbService.getAllQuestionCorrectlyAnsweredAtLeastOnce(),
      this.dbService.getAllQuestionWronglyAnsweredAtLeastOnce(),
      this.dbService.getAllQuestionNeverAnswered(),
      this.dbService.getAllQuestionAnsweredAtLeastOnce(),
      this.dbService.getOnlyQuestionCorrectlyAnswered(),
      this.dbService.getQuestionsByCorrectnessRange(0.75, 0.9999), // up to (but not including) 100%
      this.dbService.getQuestionsByCorrectnessRange(0.50, 0.7499),
      this.dbService.getQuestionsByCorrectnessRange(0.25, 0.4999),
      this.dbService.getQuestionsByCorrectnessRange(0.00, 0.2499)
    ]);

    this.tipologiaDomande = [
      { topic: 'Domande totali nel DB', total: this.allQuestionsFromDb.length, questionIds: this.allQuestionsFromDb.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande mai affrontate', total: uniqueNeverAnswered.length, questionIds: uniqueNeverAnswered.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande affrontate almeno una volta', total: uniqueAnsweredOnce.length, questionIds: uniqueAnsweredOnce.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande sbagliate almeno una volta', total: uniqueWrongOnce.length, questionIds: uniqueWrongOnce.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande risposte correttamente almeno una volta', total: uniqueCorrectOnce.length, questionIds: uniqueCorrectOnce.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande di cui sai tutto (100% corrette)', total: onlyCorrectlyAnswered.length, questionIds: onlyCorrectlyAnswered.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande da rafforzare (75-99% corrette)', total: domandeDaRafforzare.length, questionIds: domandeDaRafforzare.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande in cui vai malino (50-74% corrette)', total: domandeInCuiVaiMalino.length, questionIds: domandeInCuiVaiMalino.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande in cui vai molto male (25-49% corrette)', total: domandeInCuiVaiMoltoMale.length, questionIds: domandeInCuiVaiMoltoMale.map(q => q.id), correct: 0, accuracy: 0 },
      { topic: 'Domande "disastro" (0-24% corrette)', total: domandeDisastro.length, questionIds: domandeDisastro.map(q => q.id), correct: 0, accuracy: 0 }
    ];
  }

  openQuizSetupModal(): void { this.isQuizSetupModalOpen = true; }
  closeQuizSetupModal(): void {
    this.isQuizSetupModalOpen = false;
    this.isLoadingModal = false;
    this.loadingButtonIndex = -1;
  }
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

  async calculateTodayDetailedPerformance(): Promise<void> {
    const today = new Date();
    this.todayDetailedPerformance = await this.getDetailedPerformanceForDate(today);
  }

  private async getDetailedPerformanceForDate(date: Date): Promise<DailyPerformanceDataDetailed | null> {
    const attemptsForDate = await this.dbService.getQuizAttemptsBySpecificDate(date);
    if (attemptsForDate.length === 0) {
      return null;
    }

    const dateStr = this.datePipe.transform(date, 'yyyy-MM-dd')!;
    let correctCount = 0;
    const correctIds = new Set<string>();
    const wrongIds = new Set<string>();
    const skippedIds = new Set<string>();

    attemptsForDate.forEach(attempt => {
      attempt.answeredQuestions.forEach(aq => {
        if (aq.questionId) { // Ensure questionId exists
          if (aq.isCorrect) {
            correctCount++;
            correctIds.add(aq.questionId);
          } else {
            wrongIds.add(aq.questionId);
          }
        }
      });
      const allQuestionIdsInAttempt = new Set(attempt.allQuestions.map(qInfo => qInfo.questionId).filter(id => id) as string[]);
      const answeredQuestionIdsInAttempt = new Set(attempt.answeredQuestions.map(aq => aq.questionId).filter(id => id) as string[]);
      allQuestionIdsInAttempt.forEach(qid => {
        if (!answeredQuestionIdsInAttempt.has(qid)) {
          skippedIds.add(qid);
        }
      });
    });

    return {
      date: dateStr,
      quizzesTaken: attemptsForDate.length,
      correctAnswerCount: correctCount,
      wrongAnswerCount: wrongIds.size,
      skippedAnswerCount: skippedIds.size,
      correctAnswerIds: Array.from(correctIds),
      wrongAnswerIds: Array.from(wrongIds),
      skippedAnswerIds: Array.from(skippedIds),
    };
  }

  // --- NEW: Methods for Selected Date Chart ---
  onDateSelectedForChart(dateValue: string): void {
    this.selectedDateForChart = dateValue;
    // Clear previous data for selected date when a new date is picked,
    // user then has to click "Carica Dati"
    this.selectedDateDetailedPerformance = null;
    if (this.selectedDateChart) {
      this.selectedDateChart.destroy();
      this.selectedDateChart = undefined;
      this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Clicca "Carica Dati" per la nuova data.');
    }
  }

  async loadDataForSelectedDate(): Promise<void> {
    if (!this.selectedDateForChart) {
      this.alertService.showAlert("Info", "Per favore, seleziona una data.");
      return;
    }
    this.isLoadingSelectedDateData = true;
    this.selectedDateDetailedPerformance = null;
    if (this.selectedDateChart) {
      this.selectedDateChart.destroy();
      this.selectedDateChart = undefined;
    }

    try {
      const dateParts = this.selectedDateForChart.split('-');
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);
      const targetDate = new Date(year, month, day);

      this.selectedDateDetailedPerformance = await this.getDetailedPerformanceForDate(targetDate);
    } catch (error) {
      console.error('Error loading data for selected date:', error);
      this.alertService.showAlert("Errore", "Impossibile caricare i dati per la data selezionata.");
    } finally {
      this.isLoadingSelectedDateData = false;
      this.cdr.detectChanges();
      if (this.selectedDateDetailedPerformance) {
        this.createSelectedDatePerformanceChart();
      } else {
        this.clearCanvasOrShowMessage(this.selectedDatePerformanceChartRef, 'Nessun quiz per la data selezionata.');
      }
    }
  }

  createSelectedDatePerformanceChart(): void {
    if (this.selectedDateChart) this.selectedDateChart.destroy();
    if (!this.selectedDatePerformanceChartRef?.nativeElement || !this.selectedDateDetailedPerformance) {
      return;
    }

    const ctx = this.selectedDatePerformanceChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const data = this.selectedDateDetailedPerformance;
    const chartData = {
      labels: ['Quiz Svolti', 'Sbagliate', 'Saltate/Non Risposte', 'Corrette'],
      datasets: [{
        label: `Performance del ${this.datePipe.transform(data.date, 'dd/MM/yyyy')}`,
        data: [
          data.quizzesTaken,
          data.wrongAnswerCount ?? 0,
          data.skippedAnswerCount ?? 0,
          data.correctAnswerCount ?? 0
        ],
        backgroundColor: [
          'rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)',
          'rgba(255, 206, 86, 0.6)', 'rgba(75, 192, 192, 0.6)'
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 1
      }]
    };

    const chartConfig: ChartConfiguration = {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'x',
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Conteggio' }, ticks: { stepSize: 1 } } },
        plugins: {
          legend: { display: false },
          title: { display: true, text: `Dettaglio Performance del ${this.datePipe.transform(data.date, 'dd/MM/yyyy')}` },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (context.dataset.data && context.dataset.data[context.dataIndex] !== undefined) {
                  if (label) label += ': ';
                  label += context.dataset.data[context.dataIndex];
                }
                return label;
              }
            }
          }
        },
        onClick: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => {
          this.handleSelectedDateChartClick(event, elements, chart);
        }
      } as ChartOptions
    };
    this.selectedDateChart = new Chart(ctx, chartConfig);
  }

  async handleSelectedDateChartClick(event: ChartEvent, elements: ActiveElement[], chart: Chart): Promise<void> {
    if (elements.length > 0 && this.selectedDateDetailedPerformance) {
      const clickedIndex = elements[0].index;
      let questionIdsToPractice: string[] = [];
      let modalTitle = '';
      const dateForTitle = this.datePipe.transform(this.selectedDateDetailedPerformance.date, 'dd/MM/yy');

      switch (clickedIndex) {
        case 0: /* Quizzes Taken */ return;
        case 1: /* Sbagliate */
          if ((this.selectedDateDetailedPerformance.wrongAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.selectedDateDetailedPerformance.wrongAnswerIds;
            modalTitle = `Rivedi Errori del ${dateForTitle}`;
          } else { this.alertService.showAlert("Info", `Nessun errore per il ${dateForTitle}.`); return; }
          break;
        case 2: /* Saltate/Non Risposte */
          if ((this.selectedDateDetailedPerformance.skippedAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.selectedDateDetailedPerformance.skippedAnswerIds ?? [];
            modalTitle = `Rivedi Saltate/Non Risposte del ${dateForTitle}`;
          } else { this.alertService.showAlert("Info", `Nessuna domanda saltata per il ${dateForTitle}.`); return; }
          break;
        case 3: /* Corrette */
          if ((this.selectedDateDetailedPerformance.correctAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.selectedDateDetailedPerformance.correctAnswerIds ?? [];
            modalTitle = `Rivedi Corrette del ${dateForTitle}`;
          } else { this.alertService.showAlert("Info", `Nessuna risposta corretta per il ${dateForTitle}.`); return; }
          break;
        default: return;
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
      labels: ['Quiz Svolti', 'Sbagliate', 'Saltate/Non Risposte', 'Corrette'],
      datasets: [{
        label: `Performance di Oggi (${this.datePipe.transform(data.date, 'dd/MM/yyyy')})`,
        data: [
          data.quizzesTaken,
          data.wrongAnswerCount ?? 0,
          data.skippedAnswerCount ?? 0,
          data.correctAnswerCount ?? 0
        ],
        backgroundColor: [
          'rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)',
          'rgba(255, 206, 86, 0.6)', 'rgba(75, 192, 192, 0.6)'
        ],
        borderColor: [
          'rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)',
          'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 1
      }]
    };
    const chartTodayConfig: ChartConfiguration = {
      type: 'bar', data: chartData,
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'x',
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Conteggio' }, ticks: { stepSize: 1 } } },
        plugins: {
          legend: { display: false },
          title: { display: true, text: `Dettaglio Performance Odierna (${this.datePipe.transform(data.date, 'dd/MM/yyyy')})` },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (context.dataset.data && context.dataset.data[context.dataIndex] !== undefined) {
                  if (label) label += ': ';
                  label += context.dataset.data[context.dataIndex];
                }
                return label;
              }
            }
          }
        },
        onClick: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => {
          this.handleTodayChartClick(event, elements, chart);
        }
      } as ChartOptions
    };
    this.todayChart = new Chart(ctxToday, chartTodayConfig);
  }

  async handleTodayChartClick(event: ChartEvent, elements: ActiveElement[], chart: Chart): Promise<void> {
    if (elements.length > 0 && this.todayDetailedPerformance) {
      const clickedIndex = elements[0].index;
      let questionIdsToPractice: string[] = [];
      let modalTitle = '';

      switch (clickedIndex) { // labels: ['Quiz Svolti', 'Sbagliate', 'Saltate/Non Risposte', 'Corrette']
        case 0: /* Quizzes Taken */ return;
        case 1: /* Sbagliate */
          if ((this.todayDetailedPerformance.wrongAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.todayDetailedPerformance.wrongAnswerIds;
            modalTitle = 'Rivedi Errori di Oggi';
          } else { this.alertService.showAlert("Info", "Nessun errore da rivedere per oggi. Ottimo!"); return; }
          break;
        case 2: /* Saltate/Non Risposte */
          if ((this.todayDetailedPerformance.skippedAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.todayDetailedPerformance.skippedAnswerIds ?? [];
            modalTitle = 'Rivedi Saltate/Non Risposte di Oggi';
          } else { this.alertService.showAlert("Info", "Nessuna domanda saltata o non risposta per oggi."); return; }
          break;
        case 3: /* Corrette */
          if ((this.todayDetailedPerformance.correctAnswerCount ?? 0) > 0) {
            questionIdsToPractice = this.todayDetailedPerformance.correctAnswerIds ?? [];
            modalTitle = 'Rivedi Corrette di Oggi';
          } else { this.alertService.showAlert("Info", "Nessuna risposta corretta da rivedere per oggi."); return; }
          break;
        default: return;
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
}