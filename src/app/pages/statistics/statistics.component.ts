// src/app/pages/statistics/statistics.component.ts
import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe, PercentPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables, ChartConfiguration, ChartOptions } from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, AnsweredQuestion, TopicCount, QuizSettings } from '../../models/quiz.model'; // Added QuizSettings
import { Question } from '../../models/question.model';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { QuestionFeedbackContentComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';


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
  wrongAnswersIds: string[];
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
  imports: [CommonModule, RouterLink, DecimalPipe, PercentPipe, SimpleModalComponent, DatePipe,
    QuestionFeedbackContentComponent],
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.scss']
})
export class StatisticsComponent implements OnInit, AfterViewInit, OnDestroy {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  quizAttempts: QuizAttempt[] = [];
  allQuestionsFromDb: Question[] = []; // Store all questions from the DB bank

  isLoading = true;
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
  dailyPerformanceDetailed: DailyPerformanceDataDetailed[] = [];
  @ViewChild('dailyPerformanceChart') dailyPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('todayPerfomanceChart') todayPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  dailyChart: Chart | undefined;
  todayChart: Chart | undefined;

  wrongAnswerBreakdown: TopicWrongAnswerData[] = [];
  totalWrongAnswersOverall = 0;

  topicCoverage: TopicCoverageData[] = [];


  ngOnInit(): void {
    this.loadAndProcessStatistics();
  }

  ngAfterViewInit(): void {
    // Schedule chart creation using a microtask to ensure view is updated
    Promise.resolve().then(() => this.createChartsIfReady());
  }

  private createChartsIfReady(): void {
    if (this.isLoading || this.errorLoading) return;

    if (this.topicPerformanceChartRef?.nativeElement && this.topicPerformance.length > 0) {
      this.createTopicPerformanceChart();
    } else if (this.topicChart) {
      this.topicChart.destroy(); this.topicChart = undefined;
    }

    if (this.dailyPerformanceChartRef?.nativeElement && this.dailyPerformance.length > 0) {
      this.createDailyPerformanceChart();
    } else if (this.dailyChart) {
      this.dailyChart.destroy(); this.dailyChart = undefined;
    }
    
    if (this.todayPerformanceChartRef?.nativeElement) {
        const dateFormatter = new DatePipe('it-IT'); // Use it-IT for consistency if dates are formatted this way elsewhere
        const todayDateStr = dateFormatter.transform(new Date(), 'yyyy-MM-dd')!;
        const todayData = this.dailyPerformance.find(dp => dp.date === todayDateStr);
        const todayDetailed = this.dailyPerformanceDetailed.find(dpd => dpd.date === todayDateStr);

        if (todayData || (todayDetailed && todayDetailed.wrongAnswersIds.length > 0)) {
            this.createTodayPerformanceChart();
        } else if (this.todayChart) {
            this.todayChart.destroy(); this.todayChart = undefined;
            // Optionally clear canvas or show "no data"
            const canvas = this.todayPerformanceChartRef.nativeElement;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.textAlign = 'center';
                ctx.font = '14px Arial';
                ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#a0aec0' : '#4a5568'; // Basic dark/light text
                ctx.fillText('Nessun dato per oggi.', canvas.width / 2, canvas.height / 2);
            }
        }
    } else if (this.todayChart) {
        this.todayChart.destroy(); this.todayChart = undefined;
    }
  }

  async loadAndProcessStatistics(): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      // Fetch all necessary data concurrently
      const [quizAttempts, allQuestionsFromDb] = await Promise.all([
        this.dbService.getAllQuizAttempts(),
        this.dbService.getAllQuestions() // This should fetch ALL questions from your DB
      ]);

      this.quizAttempts = quizAttempts;
      this.allQuestionsFromDb = allQuestionsFromDb; // Store all questions from the "bank"

      if (this.quizAttempts.length > 0) {
        this.calculateOverallStats();
        this.calculateTopicPerformance();
        this.calculateDailyPerformance();
        await this.calculateDailyPerformanceWithDetails();
        this.calculateWrongAnswerBreakdown();
        this.calculateTopicCoverage(); // Uses this.allQuestionsFromDb and this.quizAttempts
        await this.getGenericData();
      } else {
        this.resetAllStatsToZero();
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
      this.errorLoading = 'Failed to load statistics.';
      this.resetAllStatsToZero();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges(); // Ensure view updates after all calculations
      // Charts will be created in ngAfterViewInit or after data is ready
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
    this.dailyPerformanceDetailed = [];
    this.wrongAnswerBreakdown = [];
    this.topicCoverage = [];
    this.tipologiaDomande = [];
    if (this.topicChart) { this.topicChart.destroy(); this.topicChart = undefined; }
    if (this.dailyChart) { this.dailyChart.destroy(); this.dailyChart = undefined; }
    if (this.todayChart) { this.todayChart.destroy(); this.todayChart = undefined; }
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
      this.dailyPerformanceDetailed = [{
        date: todayDateStr,
        quizzesTaken: todayAttempts.length,
        wrongAnswersIds: Array.from(wrongIdsSet)
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

  // --- CALCULATE TOPIC COVERAGE ---
  calculateTopicCoverage(): void { // Removed async as allQuestionsFromDb is now a property
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
  // --- END CALCULATE TOPIC COVERAGE ---

  createTodayPerformanceChart(): void {
    if (this.todayChart) this.todayChart.destroy();
    if (!this.todayPerformanceChartRef?.nativeElement) return;

    const dateFormatter = new DatePipe('en-US');
    const todayDateKey = dateFormatter.transform(new Date(), 'yyyy-MM-dd')!;
    const todayOverallPerf = this.dailyPerformance.find(dp => dp.date === todayDateKey);
    const todayDetailed = this.dailyPerformanceDetailed.find(dpd => dpd.date === todayDateKey);

    // Ensure there's some data to plot for today
    if (!todayOverallPerf && !(todayDetailed && todayDetailed.wrongAnswersIds.length >= 0)) {
        const canvas = this.todayPerformanceChartRef.nativeElement;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.font = '14px Arial';
            ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#a0aec0' : '#4a5568';
            ctx.fillText('Nessun dato per oggi.', canvas.width / 2, canvas.height / 2);
        }
        return;
    }

    const ctxToday = this.todayPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctxToday) return;

    const labels = [todayOverallPerf?.date || todayDetailed?.date || 'Oggi'];
    const dataForChart = {
        accuracy: todayOverallPerf ? [todayOverallPerf.averageAccuracy * 100] : [0],
        quizzesTaken: todayOverallPerf ? [todayOverallPerf.quizzesTaken] : [0],
        wrongAnswers: todayDetailed ? [todayDetailed.wrongAnswersIds.length] : [0]
    };

    const chartTodayConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Precisione (%)', data: dataForChart.accuracy,
            backgroundColor: 'rgba(75, 192, 192, 0.5)', borderColor: 'rgb(75, 192, 192)',
            yAxisID: 'yAccuracy', order: 1
          },
          {
            label: 'Quiz Svolti', data: dataForChart.quizzesTaken,
            backgroundColor: 'rgba(54, 162, 235, 0.5)', borderColor: 'rgb(54, 162, 235)',
            yAxisID: 'yQuizzes', order: 3
          },
          {
            label: 'Errori Oggi', data: dataForChart.wrongAnswers,
            backgroundColor: 'rgba(255, 99, 132, 0.5)', borderColor: 'rgb(255, 99, 132)',
            yAxisID: 'yQuizzes', order: 2
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Data' } },
          yAccuracy: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: 'Precisione (%)' }, ticks: { callback: value => value + '%' } },
          yQuizzes: { type: 'linear', position: 'right', min: 0, title: { display: true, text: 'Conteggio' }, ticks: { stepSize: 1 }, grid: { drawOnChartArea: false } }
        },
        plugins: { tooltip: { mode: 'index', intersect: false }, title: { display: true, text: 'Performance Odierna Dettagliata' } }
      } as ChartOptions
    };
    this.todayChart = new Chart(ctxToday, chartTodayConfig);
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

    const labels = this.topicPerformance.map(tp => tp.topic.length > 25 ? tp.topic.substring(0,22) + '...' : tp.topic); // Truncate long labels
    const data = this.topicPerformance.map(tp => tp.accuracy * 100);
    const backgroundColors = labels.map((_, i) => `hsla(${i * (360 / Math.max(labels.length,1))}, 70%, 60%, 0.6)`);
    const borderColors = labels.map((_, i) => `hsla(${i * (360 / Math.max(labels.length,1))}, 70%, 50%, 1)`);

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
        alert('Statistiche resettate con successo.');
      } catch (error) {
        console.error('Error resetting statistics:', error);
        alert("Errore durante il reset delle statistiche.");
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
          if(confirm(`Hai risposto correttamente a tutte le domande incontrate per l'argomento "${topic}". Vuoi comunque fare pratica su tutte le ${allTopicQuestions.length} domande disponibili per questo argomento?`)) {
              allTopicQuestions.forEach(q => practiceQuestionIds.add(q.id));
          } else {
              return;
          }
      } else {
        alert(`Nessuna domanda disponibile per l'argomento: ${topic}.`);
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

  startPracticeQuizForTodayWrong(): void {
    const todayDetailedEntry = this.dailyPerformanceDetailed.find(dpd => dpd.date === new DatePipe('it-IT').transform(new Date(), 'yyyy-MM-dd'));
    if (todayDetailedEntry && todayDetailedEntry.wrongAnswersIds.length > 0) {
      const questionIds = todayDetailedEntry.wrongAnswersIds;
      this.router.navigate(['/quiz/take'], {
        queryParams: { quizTitle: 'Rivedi Errori di Oggi', question_ids: questionIds.join(','), numQuestions: questionIds.length }
      });
    } else {
      alert("Nessun errore registrato oggi o nessun dato disponibile!");
    }
  }

  async startPracticeQuizForGeneralData(index: number): Promise<void> { // Made async
    const selectedData = this.tipologiaDomande[index];
    if (!selectedData || !selectedData.questionIds || selectedData.questionIds.length === 0) {
      alert(`Nessuna domanda disponibile per la categoria: ${selectedData?.topic || 'sconosciuta'}`);
      return;
    }
    this.quizSetupModalTitle = selectedData.topic;
    this.topics = [];

    try {
        const questionsForModal = await this.dbService.getQuestionByIds(selectedData.questionIds);
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
        console.error("Error fetching questions for modal setup:", error);
        alert("Errore nel preparare il quiz di pratica.");
    }
  }

  ngOnDestroy(): void {
    if (this.topicChart) this.topicChart.destroy();
    if (this.dailyChart) this.dailyChart.destroy();
    if (this.todayChart) this.todayChart.destroy();
  }

  async exportStatisticsToPDF(): Promise<void> {
    if (this.quizAttempts.length === 0 && this.allQuestionsFromDb.length === 0) { // Check if any data exists
      alert("Non ci sono statistiche da esportare.");
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
            didDrawPage: (data: any) => { yPos = data.cursor.y; if(yPos > pageHeight - margin - 10) yPos = margin}
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
            didDrawPage: (data: any) => { yPos = data.cursor.y; if(yPos > pageHeight - margin - 10) yPos = margin}
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
      { topic: 'Domande totali nel DB', total: this.allQuestionsFromDb.length, questionIds: this.allQuestionsFromDb.map(q => q.id), correct:0, accuracy:0},
      { topic: 'Domande mai affrontate', total: uniqueNeverAnswered.length, questionIds: uniqueNeverAnswered.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande affrontate almeno una volta', total: uniqueAnsweredOnce.length, questionIds: uniqueAnsweredOnce.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande sbagliate almeno una volta', total: uniqueWrongOnce.length, questionIds: uniqueWrongOnce.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande risposte correttamente almeno una volta', total: uniqueCorrectOnce.length, questionIds: uniqueCorrectOnce.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande di cui sai tutto (100% corrette)', total: onlyCorrectlyAnswered.length, questionIds: onlyCorrectlyAnswered.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande da rafforzare (75-99% corrette)', total: domandeDaRafforzare.length, questionIds: domandeDaRafforzare.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande in cui vai malino (50-74% corrette)', total: domandeInCuiVaiMalino.length, questionIds: domandeInCuiVaiMalino.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande in cui vai molto male (25-49% corrette)', total: domandeInCuiVaiMoltoMale.length, questionIds: domandeInCuiVaiMoltoMale.map(q => q.id), correct:0, accuracy:0 },
      { topic: 'Domande "disastro" (0-24% corrette)', total: domandeDisastro.length, questionIds: domandeDisastro.map(q => q.id), correct:0, accuracy:0 }
    ];
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