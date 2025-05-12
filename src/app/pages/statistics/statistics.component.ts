import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, OnDestroy, inject } from '@angular/core';
import { CommonModule, DecimalPipe, PercentPipe, DatePipe } from '@angular/common'; // Added DatePipe
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables, ChartConfiguration, ChartOptions } from 'chart.js/auto';
import 'chartjs-adapter-date-fns'; // Import the date adapter

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, AnsweredQuestion, TopicCount } from '../../models/quiz.model';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Method 1: Augments jsPDF prototype
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { QuestionFeedbackContentComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';
// OR
// import autoTable from 'jspdf-autotable';

Chart.register(...registerables); // Register all Chart.js components

interface TopicPerformanceData {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
  questionIds: string[]; // IDs of questions in this topic
}



// NEW: For daily trend
interface DailyPerformanceData {
  date: string; // YYYY-MM-DD for easy grouping and chart labeling
  quizzesTaken: number;
  totalCorrect: number;
  totalAttemptedInDay: number;
  averageAccuracy: number; // Daily average accuracy
}

// NEW: For wrong answer breakdown
interface TopicWrongAnswerData {
  topic: string;
  wrongAnswers: number;
  totalAnswersInTopic: number; // Total answers (correct + incorrect) for this topic across all quizzes
  percentageOfGlobalWrong: number; // What % of *all wrong answers* came from this topic
  topicSpecificFailureRate: number; // Within this topic, what % were wrong
}

interface DailyPerformanceDataDetailed {
  date: string; // YYYY-MM-DD for easy grouping and chart labeling
  quizzesTaken: number;
  wrongAnswersIds: string[]; // IDs of questions answered incorrectly
}


@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, PercentPipe, SimpleModalComponent, // Import the simple modal
    QuestionFeedbackContentComponent], // Add DecimalPipe, PercentPipe
  templateUrl: './statistics.component.html',
  styleUrls: ['./statistics.component.scss']
})
export class StatisticsComponent implements OnInit, AfterViewInit, OnDestroy {
  private dbService = inject(DatabaseService);
  private router = inject(Router); // For navigation

  quizAttempts: QuizAttempt[] = [];
  isLoading = true;
  errorLoading = '';
  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';


  // Overall Stats
  totalQuizzesTaken = 0;
  totalQuestionsAttempted = 0;
  totalCorrectAnswers = 0;
  overallAccuracy = 0;
  averageScorePercentage = 0;

  // Topic Performance
  topicPerformance: TopicPerformanceData[] = [];
  tipologiaDomande: TopicPerformanceData[] = [];
  tipologiaSelected: TopicPerformanceData = { topic: '', correct: 0, total: 0, accuracy: 0, questionIds: [] };
  topics: GenericData[] = [];
  @ViewChild('topicPerformanceChart') topicPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  topicChart: Chart | undefined;

  // More stats can be added: e.g., performance over time

  // NEW: Daily Performance
  dailyPerformance: DailyPerformanceData[] = [];
  dailyPerformanceDetailed: DailyPerformanceDataDetailed[] = [];
  @ViewChild('dailyPerformanceChart') dailyPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('todayPerfomanceChart') todayPerformanceChartRef!: ElementRef<HTMLCanvasElement>;
  dailyChart: Chart | undefined;
  todayChart: Chart | undefined;

  // NEW: Wrong Answer Breakdown
  wrongAnswerBreakdown: TopicWrongAnswerData[] = [];
  totalWrongAnswersOverall = 0; // To calculate percentageOfGlobalWrong

  ngOnInit(): void {
    this.loadAndProcessStatistics();
  }

  ngAfterViewInit(): void {
    // Chart initialization will be called after data is processed
    // if (this.topicPerformance.length > 0) {
    //   this.createTopicPerformanceChart();
    // }
  }

  async loadAndProcessStatistics(): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      this.quizAttempts = await this.dbService.getAllQuizAttempts(); // Assumes sorted by date descending
      if (this.quizAttempts.length > 0) {
        this.calculateOverallStats();
        this.calculateDailyPerformanceWithDetails();
        this.calculateTopicPerformance(); // For overall accuracy by topic
        this.calculateDailyPerformance(); // <-- NEW
        this.calculateWrongAnswerBreakdown(); // <-- NEW
        this.getGenericData();

        // Chart creation needs to happen after view is initialized and data is ready
        this.scheduleChartCreation();
      }
    } catch (error) { /* ... */ }
    finally { this.isLoading = false; }
  }

  calculateOverallStats(): void {
    this.totalQuizzesTaken = this.quizAttempts.length;
    this.totalQuestionsAttempted = 0;
    this.totalCorrectAnswers = 0;
    let totalScoreSum = 0;

    this.quizAttempts.forEach(attempt => {
      const currentScore = attempt.score ? attempt.score : 0; // Assuming score is the number of correct answers
      this.totalQuestionsAttempted += attempt.totalQuestionsInQuiz;
      this.totalCorrectAnswers += currentScore; // Assuming score is the number of correct answers
      totalScoreSum += (currentScore / attempt.totalQuestionsInQuiz);
    });

    this.overallAccuracy = this.totalQuestionsAttempted > 0
      ? (this.totalCorrectAnswers / this.totalQuestionsAttempted)
      : 0;

    this.averageScorePercentage = this.totalQuizzesTaken > 0
      ? (totalScoreSum / this.totalQuizzesTaken)
      : 0;
  }

  async calculateDailyPerformanceWithDetails(): Promise<void> {
    const dailyMap = new Map<string, DailyPerformanceDataDetailed>();
    const dateFormatter = new DatePipe('it-IT');

    const todayAttempts = await this.dbService.getAllTodayQuizAttempts(); // Assuming this returns today's attempts

    const sortedAttempts = [...todayAttempts].sort((a, b) =>
      new Date(a.timestampEnd || 0).getTime() - new Date(b.timestampEnd || 0).getTime()
    );

    this.dailyPerformanceDetailed = Array.from(sortedAttempts.values())
      .map((data) => ({
        date: dateFormatter.transform(data.timestampEnd || new Date(), 'yyyy-MM-dd')!,
        quizzesTaken: sortedAttempts.length,
        wrongAnswersIds: sortedAttempts.reduce((acc, attempt) => {
          const wrongIds = attempt.answeredQuestions
            .filter((answeredQ: AnsweredQuestion) => !answeredQ.isCorrect)
            .map((answeredQ: AnsweredQuestion) => answeredQ.questionId);
          return acc.concat(wrongIds);
        }, [] as string[])
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by date ascending
      .slice(-30); // Show last 30 days or so for trend

    console.log('Daily performance detailed:', this.dailyPerformanceDetailed);
  }

  calculateTopicPerformance(): void {
    const performanceMap = new Map<string, { correct: number, total: number }>();

    this.quizAttempts.forEach(attempt => {
      attempt.answeredQuestions.forEach(answeredQ => {
        const topic = answeredQ.questionSnapshot.topic || 'Uncategorized';
        const data = performanceMap.get(topic) || { correct: 0, total: 0 };
        data.total++;
        if (answeredQ.isCorrect) {
          data.correct++;
        }
        performanceMap.set(topic, data);
      });
    });

    this.topicPerformance = Array.from(performanceMap.entries()).map(([topic, data]) => ({
      topic,
      ...data,
      accuracy: data.total > 0 ? (data.correct / data.total) : 0,
      questionIds: []
    })).sort((a, b) => b.accuracy - a.accuracy); // Sort by accuracy descending
  }

  scheduleChartCreation(): void {
    // Use setTimeout to ensure DOM elements are available
    setTimeout(() => {
      if (this.topicPerformanceChartRef?.nativeElement && this.topicPerformance.length > 0) {
        this.createTopicPerformanceChart();
      }
      if (this.dailyPerformanceChartRef?.nativeElement && this.dailyPerformance.length > 0) {
        this.createDailyPerformanceChart(); // <-- NEW
      }
    }, 0);
  }


  calculateDailyPerformance(): void {
    const dailyMap = new Map<string, { quizzes: number, correct: number, attempted: number }>();
    const dateFormatter = new DatePipe('en-US');

    // Iterate oldest to newest for chronological chart
    const sortedAttempts = [...this.quizAttempts].sort((a, b) =>
      new Date(a.timestampEnd || 0).getTime() - new Date(b.timestampEnd || 0).getTime()
    );

    sortedAttempts.forEach(attempt => {
      if (!attempt.timestampEnd) return;
      const dateKey = dateFormatter.transform(attempt.timestampEnd, 'yyyy-MM-dd')!; // Non-null assertion if sure

      const dayData = dailyMap.get(dateKey) || { quizzes: 0, correct: 0, attempted: 0 };
      dayData.quizzes++;
      dayData.correct += attempt.score || 0;
      dayData.attempted += attempt.totalQuestionsInQuiz;
      dailyMap.set(dateKey, dayData);
    });

    this.dailyPerformance = Array.from(dailyMap.entries())
      // .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime()) // Already sorted by processing sortedAttempts
      .map(([date, data]) => ({
        date: date,
        quizzesTaken: data.quizzes,
        totalCorrect: data.correct,
        totalAttemptedInDay: data.attempted,
        averageAccuracy: data.attempted > 0 ? (data.correct / data.attempted) : 0
      })).slice(-30); // Show last 30 days or so for trend
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
      .filter(item => item.wrongAnswers > 0) // Only show topics with wrong answers
      .sort((a, b) => b.percentageOfGlobalWrong - a.percentageOfGlobalWrong); // Sort by highest contribution to wrong answers
  }


  createTodayPerformanceChart(): void {
    if (!this.todayPerformanceChartRef?.nativeElement || this.dailyPerformance.length === 0) return;
    const ctxToday = this.todayPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctxToday) return;
    const todayData = this.dailyPerformance.find(dp => dp.date === new Date().toISOString().split('T')[0]);

    if (!todayData) {
      console.warn('No data for today found in daily performance data.');
      return;
    }
    console.log('Today data:', todayData);
    const todayLabels = todayData.date;
    const todayAccuracyData = todayData.averageAccuracy * 100;
    const todayQuizzesTakenData = todayData.quizzesTaken;

    const chartTodayConfig: ChartConfiguration = {
      type: 'line',
      data: {
        labels: [todayLabels],
        datasets: [
          {
            label: 'Precisione odierna (%)',
            data: [todayAccuracyData],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1,
            yAxisID: 'yAccuracy',
            fill: true,
          },
          {
            label: 'Quiz svolti',
            data: [todayQuizzesTakenData],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            type: 'bar', // Can mix chart types
            yAxisID: 'yQuizzes',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day', tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'MMM d' } },
            title: { display: true, text: 'Date' }
          },
          yAccuracy: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            title: { display: true, text: 'Precisione (%)' },
            ticks: { callback: value => value + '%' }
          },
          yQuizzes: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: Math.max(1, todayQuizzesTakenData + 1), // Ensure at least 1 for visibility
            title: { display: true, text: 'Quiz svolti' },
            grid: { drawOnChartArea: false }, // Only show grid for primary axis
            ticks: { stepSize: 1 }
          }
        },
        plugins: { /* ... tooltips as before ... */ }
      } as ChartOptions // Cast to ChartOptions to satisfy stricter typing for scales
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
          {
            label: 'Precisione media giornaliera (%)',
            data: accuracyData,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1,
            yAxisID: 'yAccuracy',
            fill: true,
          },
          {
            label: 'Quiz svolti',
            data: quizzesTakenData,
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            type: 'bar', // Can mix chart types
            yAxisID: 'yQuizzes',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day', tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'MMM d' } },
            title: { display: true, text: 'Date' }
          },
          yAccuracy: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            title: { display: true, text: 'Precisione (%)' },
            ticks: { callback: value => value + '%' }
          },
          yQuizzes: {
            type: 'linear',
            position: 'right',
            min: 0,
            title: { display: true, text: 'Quiz svolti' },
            grid: { drawOnChartArea: false }, // Only show grid for primary axis
            ticks: { stepSize: 1 }
          }
        },
        plugins: { /* ... tooltips as before ... */ }
      } as ChartOptions // Cast to ChartOptions to satisfy stricter typing for scales
    };
    this.dailyChart = new Chart(ctx, chartDailyConfig);

    this.createTodayPerformanceChart(); // <-- NEW

  }

  createTopicPerformanceChart(): void {
    if (this.topicChart) {
      this.topicChart.destroy(); // Destroy existing chart instance before creating a new one
    }
    if (!this.topicPerformanceChartRef?.nativeElement || this.topicPerformance.length === 0) {
      console.warn('Chart canvas not available or no data for topic performance chart.');
      return;
    }

    const ctx = this.topicPerformanceChartRef.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('Failed to get 2D context for chart');
      return;
    }

    const labels = this.topicPerformance.map(tp => tp.topic);
    const data = this.topicPerformance.map(tp => tp.accuracy * 100); // Show as percentage

    this.topicChart = new Chart(ctx, {
      type: 'bar', // or 'doughnut', 'pie'
      data: {
        labels: labels,
        datasets: [{
          label: 'Precisione per argomento (%)',
          data: data,
          backgroundColor: [ // Add more colors if you have more topics
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 99, 132, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)'
          ],
          borderColor: [
            'rgba(54, 162, 235, 1)',
            'rgba(255, 99, 132, 1)',
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(153, 102, 255, 1)',
            'rgba(255, 159, 64, 1)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // Allows better control with container size
        scales: {
          y: {
            beginAtZero: true,
            max: 100, // Since it's percentage
            ticks: {
              callback: function (value) {
                return value + '%';
              }
            }
          }
        },
        plugins: {
          legend: {
            display: true, // Or false if only one dataset
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(1) + '%';
                }
                return label;
              }
            }
          }
        }
      }
    });
    console.log('Topic performance chart created/updated.');
  }

  async resetStatistics(): Promise<void> {
    if (confirm('Sei sicuro di voler cancellare tutte le tue statistiche? Questo cancellerà tutto lo storico dei tuoi quiz.')) {
      try {
        await this.dbService.resetDatabase(); // Assuming this clears questions and attempts, and re-populates questions
        // Or more specifically:
        // await this.dbService.clearAllQuizAttempts();
        this.quizAttempts = [];
        this.calculateOverallStats(); // Recalculate, will be zeros
        this.calculateTopicPerformance(); // Recalculate, will be empty
        if (this.topicChart) {
          this.topicChart.destroy();
          this.topicChart = undefined;
        }

        if (this.dailyChart) { this.dailyChart.destroy(); this.dailyChart = undefined; } // <-- NEW
        // Optionally, re-create an empty chart or hide the canvas
        console.log('Statistics reset successfully.');
        this.dailyPerformance = [];
        this.wrongAnswerBreakdown = [];
      } catch (error) {
        console.error('Error resetting statistics:', error);
        alert("E' stato riscontrato un errore durante il reset delle statistiche.");
      }
    }
  }

  startPracticeQuizForTopic(topic: string): void {
    console.log(`Placeholder: Start practice quiz for topic: ${topic}`);
    // Implementation similar to StudyFocusComponent or FavoriteQuestionsComponent:
    // 1. Get all question IDs for this topic (or a subset of them, e.g., only incorrectly answered ones from this topic).
    //    - To get incorrectly answered ones, you'd need to iterate quizAttempts.
    //    - Simpler: Get N random questions from this topic.
    // 2. Navigate to /quiz/take with queryParams:
    //    - `topics: topic` (if QuizTakingComponent can take single topic string)
    //    - `numQuestions: 10` (or some default)
    //    - OR `question_ids: ...` if you fetch specific question IDs.
    this.router.navigate(['/quiz/take'], {
      queryParams: {
        topics: topic,
        numQuestions: 10 // Example: start a quick 10-question quiz for this topic
      }
    });
  }

  startPracticeQuizForTodayWrong(): void {
    console.log(`Placeholder: Start practice quiz for today performance: ${this.dailyPerformanceDetailed[0]}`);
    const questionIds = this.dailyPerformanceDetailed[0].wrongAnswersIds;
    console.log('Starting quiz with wrong answer IDs:', questionIds);
    this.router.navigate(['/quiz/take'], {
      queryParams: {
        quizTitle: 'Rivedi le domande sbagliate di oggi',
        numQuestions: this.dailyPerformanceDetailed[0].wrongAnswersIds.length,
        question_ids: questionIds // Pass the wrong answer IDs
      }
    });
  }

  startPracticeQuizForGeneralData(index: number): void {
    console.log(this.tipologiaDomande);
    console.log(index)
    console.log(`Placeholder: Start practice quiz for general data: ${this.tipologiaDomande[index].topic}`);
    this.quizSetupModalTitle = this.tipologiaDomande[index].topic;
    const questionIds = this.tipologiaDomande[index].questionIds;
    console.log('Starting quiz with wrong answer IDs:', questionIds);


    // extract unique topics from questionIds
    this.topics = [];
    this.dbService.getQuestionByIds(questionIds).then((questions) => {
      for (const question of questions) {
        if (this.topics && !this.topics.some(t => t.topic === question.topic)) {
          const topicQsts = questions.filter(q => q.topic === question.topic);
          this.topics.push({ topic: question.topic, count: topicQsts.length, questionIds: topicQsts.map(q => q.id) });
        }
        this.openQuizSetupModal();
      }
    }
    );

    //this.router.navigate(['/quiz/take'], {
    //  queryParams: {
    //    quizTitle: 'Rivedi le domande sbagliate di oggi',
    //    numQuestions: this.dailyPerformanceDetailed[0].wrongAnswersIds.length,
    //    question_ids: questionIds // Pass the wrong answer IDs
    //  }
    //});
  }

  ngOnDestroy(): void {
    if (this.topicChart) {
      this.topicChart.destroy();
    }
    if (this.dailyChart) this.dailyChart.destroy(); // <-- NEW
  }


  async exportStatisticsToPDF(): Promise<void> {
    if (this.quizAttempts.length === 0) {
      alert("Non ci sono statistiche da esportare.");
      return;
    }

    const doc = new jsPDF({
      orientation: 'p', // portrait
      unit: 'mm',
      format: 'a4'
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;
    const lineHeight = 7;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    const checkYPos = (neededHeight: number = lineHeight * 2) => {
      if (yPos + neededHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
    };

    // --- Title ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Quiz Statistics Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;

    // --- Overall Performance ---
    checkYPos(lineHeight * 5);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Overall Performance', margin, yPos);
    yPos += lineHeight * 1.5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const overallStats = [
      `Quiz svolti: ${this.totalQuizzesTaken}`,
      `Totale domande affrontate: ${this.totalQuestionsAttempted}`,
      `Totale domande corrette: ${this.totalCorrectAnswers}`,
      `Precisione generale: ${new PercentPipe('en-US').transform(this.overallAccuracy, '1.0-1')}`,
      `Punteggio medio: ${new PercentPipe('en-US').transform(this.averageScorePercentage, '1.0-1')}`
    ];
    overallStats.forEach(stat => {
      checkYPos();
      doc.text(stat, margin + 5, yPos);
      yPos += lineHeight;
    });
    yPos += lineHeight; // Extra space

    // --- Topic Performance Chart ---
    if (this.topicChart && this.topicPerformance.length > 0) {
      checkYPos(80); // Approximate height for chart + title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Precisione per argomento', margin, yPos);
      yPos += lineHeight * 1.5;
      try {
        const chartImage = this.topicChart.toBase64Image('image/png', 1.0);
        // Calculate aspect ratio to fit width
        const imgProps = this.topicChart.canvas.getBoundingClientRect(); // Or use fixed aspect ratio
        const aspectRatio = imgProps.width / imgProps.height;
        const imgWidth = contentWidth * 0.8; // Use 80% of content width
        const imgHeight = imgWidth / aspectRatio;

        checkYPos(imgHeight + lineHeight); // Check if chart fits
        doc.addImage(chartImage, 'PNG', margin + (contentWidth * 0.1), yPos, imgWidth, imgHeight);
        yPos += imgHeight + lineHeight;
      } catch (e) {
        console.error("Error adding topic chart to PDF:", e);
        checkYPos();
        doc.setTextColor(150);
        doc.text('Non sono stato in grado di disegnare il grafico.', margin + 5, yPos);
        doc.setTextColor(0);
        yPos += lineHeight;
      }
    }
    yPos += lineHeight;

    // --- Daily Performance Trend Chart ---
    if (this.dailyChart && this.dailyPerformance.length > 0) {
      checkYPos(100); // Approximate height for chart + title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Andamento giornaliero', margin, yPos);
      yPos += lineHeight * 1.5;
      try {
        const chartImage = this.dailyChart.toBase64Image('image/png', 1.0);
        const imgProps = this.dailyChart.canvas.getBoundingClientRect();
        const aspectRatio = imgProps.width / imgProps.height;
        const imgWidth = contentWidth * 0.9; // Use 90% of content width for line chart
        const imgHeight = imgWidth / aspectRatio;

        checkYPos(imgHeight + lineHeight);
        doc.addImage(chartImage, 'PNG', margin + (contentWidth * 0.05), yPos, imgWidth, imgHeight);
        yPos += imgHeight + lineHeight;
      } catch (e) {
        console.error("Error adding daily chart to PDF:", e);
        checkYPos();
        doc.setTextColor(150);
        doc.text('Non sono stato in grado di disegnare il grafico.', margin + 5, yPos);
        doc.setTextColor(0);
        yPos += lineHeight;
      }
    }
    yPos += lineHeight;

    // --- Wrong Answer Breakdown Table (using jspdf-autotable if installed, or simple text) ---
    if (this.wrongAnswerBreakdown.length > 0) {
      checkYPos(lineHeight * 3);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Focus Areas: Wrong Answers by Topic', margin, yPos);
      yPos += lineHeight * 1.5;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      // For a proper table, jspdf-autotable plugin is recommended: https://github.com/simonbengtsson/jsPDF-AutoTable
      // npm install jspdf-autotable
      // import 'jspdf-autotable'; (or import autoTable from 'jspdf-autotable'; and call doc.autoTable(...))
      // (doc as any).autoTable({ // Cast to any or extend jsPDF interface
      //   startY: yPos,
      //   head: [['Topic', 'Wrong Answers', 'Contribution', 'Topic Failure Rate']],
      //   body: this.wrongAnswerBreakdown.map(wa => [
      //     wa.topic,
      //     wa.wrongAnswers.toString(),
      //     new PercentPipe('en-US').transform(wa.percentageOfGlobalWrong, '1.0-1'),
      //     new PercentPipe('en-US').transform(wa.topicSpecificFailureRate, '1.0-1')
      //   ]),
      //   theme: 'striped', // 'grid', 'plain'
      //   styles: { fontSize: 8, cellPadding: 2 },
      //   headStyles: { fillColor: [22, 160, 133], fontSize: 9, fontStyle: 'bold' },
      //   margin: { left: margin, right: margin },
      // });
      // yPos = (doc as any).lastAutoTable.finalY + lineHeight; // Update yPos after table

      // Simple text version if jspdf-autotable is not used:
      this.wrongAnswerBreakdown.forEach(wa => {
        checkYPos(lineHeight * 2);
        const line1 = `Topic: ${wa.topic} - Wrong: ${wa.wrongAnswers}`;
        const line2 = `  Contribution: ${new PercentPipe('en-US').transform(wa.percentageOfGlobalWrong, '1.0-1')}, Topic Failure Rate: ${new PercentPipe('en-US').transform(wa.topicSpecificFailureRate, '1.0-1')}`;
        doc.text(line1, margin + 5, yPos);
        yPos += lineHeight;
        checkYPos();
        doc.text(line2, margin + 5, yPos);
        yPos += lineHeight;
      });
      yPos += lineHeight;
    }

    // --- Page Numbers ---
    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 10, pageHeight - 10);
    }

    doc.save(`quiz-statistics-report-${new DatePipe('en-US').transform(new Date(), 'yyyyMMdd')}.pdf`);
  }


  async getGenericData(): Promise<void> {
    const totalQuestions = await this.dbService.getAllQuestions();
    const totalQuizAttempts = await this.dbService.getAllQuizAttempts();
    const totalQuizAttemptsToday = await this.dbService.getAllTodayQuizAttempts();
    const totalUniqueCorrectAtLeastOneAnswers = await this.dbService.getAllQuestionCorrectlyAnsweredAtLeastOnce();
    const totalUniqueWrongAnswers = await this.dbService.getAllQuestionWronglyAnsweredAtLeastOnce();
    const totalUniqueNeverAnswered = await this.dbService.getAllQuestionNeverAnswered();
    const totalUniqueAtLeastOnceAnswered = await this.dbService.getAllQuestionAnsweredAtLeastOnce();
    const totalUniqueCorrectAnswers = await this.dbService.getOnlyQuestionCorrectlyAnswered();

    const domandeDaRafforzare = await this.dbService.getAllQuestionWhichYouAreQuiteGoodAt(75);
    const domandeInCuiVaiMalino = await this.dbService.getAllQuestionWhichYouAreQuiteGoodAt(50,75);
    const domandeInCuiVaiMoltoMale = await this.dbService.getAllQuestionWhichYouAreQuiteGoodAt(25,50);
    const domandeDisastro = await this.dbService.getAllQuestionWhichYouAreQuiteGoodAt(0,25);
    this.tipologiaDomande[0] = { topic: 'Domande totali', correct: 0, total: totalQuestions.length, accuracy: 0, questionIds: totalQuestions.map(q => q.id) };
    this.tipologiaDomande[1] = { topic: 'Domande mai affrontate', correct: 0, total: totalUniqueNeverAnswered.length, accuracy: 0, questionIds: totalUniqueNeverAnswered.map(q => q.id) };
    this.tipologiaDomande[2] = { topic: 'Domande affrontate', correct: 0, total: totalUniqueAtLeastOnceAnswered.length, accuracy: 0, questionIds: totalUniqueAtLeastOnceAnswered.map(q => q.id) };
    this.tipologiaDomande[3] = { topic: 'Domande sbagliate almeno una volta', correct: 0, total: totalUniqueWrongAnswers.length, accuracy: 0, questionIds: totalUniqueWrongAnswers.map(q => q.id) };
    this.tipologiaDomande[4] = { topic: 'Domande risposte correttamente almeno una volta', correct: 0, total: totalUniqueCorrectAtLeastOneAnswers.length, accuracy: 0, questionIds: totalUniqueCorrectAnswers.map(q => q.id) };

    this.tipologiaDomande[5] = { topic: 'Domande che sai perfettamente', correct: 0, total: totalUniqueCorrectAnswers.length, accuracy: 0, questionIds: totalUniqueCorrectAnswers.map(q => q.id) };
    this.tipologiaDomande[6] = { topic: 'Domande da rafforzare', correct: 0, total: domandeDaRafforzare.length, accuracy: 0, questionIds: domandeDaRafforzare.map(q => q.id) };
    this.tipologiaDomande[7] = { topic: 'Domande in cui vai malino', correct: 0, total: domandeInCuiVaiMalino.length, accuracy: 0, questionIds: domandeInCuiVaiMalino.map(q => q.id) };
    this.tipologiaDomande[8] = { topic: 'Domande in cui vai molto male', correct:0, total: domandeInCuiVaiMoltoMale.length, accuracy: 0, questionIds: domandeInCuiVaiMoltoMale.map(q => q.id) };
    this.tipologiaDomande[9] = { topic: 'Domande disastro', correct:0, total: domandeDisastro.length, accuracy: 0, questionIds: domandeDisastro.map(q => q.id) };

  }

  // --- Methods for the lightweight modal ---
  openQuizSetupModal(): void {
    this.isQuizSetupModalOpen = true;
  }

  closeQuizSetupModal(): void {
    this.isQuizSetupModalOpen = false;
  }

  handleQuizSetupSubmitted(feedbackData: any): void {
    console.log("Quiz setup received in parent:", feedbackData);
    // Here you would typically call your QuizService to persist this feedback
    // this.quizService.submitQuestionFeedback(feedbackData).subscribe(...);
    this.closeQuizSetupModal(); // Close modal on successful submission from content
  }
}