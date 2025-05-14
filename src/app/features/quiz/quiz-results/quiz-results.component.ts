// src/app/features/quiz/quiz-results/quiz-results.component.ts
import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core'; // Added ElementRef, ViewChild
import { CommonModule, DatePipe, DecimalPipe, PercentPipe } from '@angular/common'; // Added DecimalPipe, PercentPipe
import { ActivatedRoute, Router, RouterLink } from '@angular/router'; // Added RouterLink
import { Subscription } from 'rxjs';
import jsPDF from 'jspdf'; // <-- IMPORT jsPDF
// import html2canvas from 'html2canvas'; // Import if using html2canvas approach

import { DatabaseService } from '../../../core/services/database.service';
import { QuizAttempt, AnsweredQuestion, QuizSettings } from '../../../models/quiz.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faExclamation, faRepeat } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { Question } from '../../../models/question.model';

interface GroupedQuestion {
  topic: string;
  questions: AnsweredQuestion[];
}

@Component({
  selector: 'app-quiz-results',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, PercentPipe, FontAwesomeModule], // Added DecimalPipe, PercentPipe
  templateUrl: './quiz-results.component.html',
  styleUrls: ['./quiz-results.component.scss']
})
export class QuizResultsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router); // For navigation
  private dbService = inject(DatabaseService);
  private routeSub!: Subscription;

  segnala: IconDefinition = faExclamation; // This was already here, seems unused in the template you showed previously
  repeatIcon: IconDefinition = faRepeat; // This was already here, seems unused in the template you showed previously
  quizAttemptId: string | null = null;
  quizAttempt: QuizAttempt | undefined;
  groupedQuestions: GroupedQuestion[] = [];

  isLoading = true;
  errorLoading = '';

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      this.quizAttemptId = params.get('id');
      if (this.quizAttemptId) {
        this.loadQuizAttemptDetails(this.quizAttemptId);
      } else {
        this.errorLoading = 'No Quiz ID provided.';
        this.isLoading = false;
        // Optionally redirect if no ID
        // this.router.navigate(['/home']);
      }
    });
  }

  async loadQuizAttemptDetails(id: string): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      const attempt = await this.dbService.getQuizAttemptById(id);
      if (attempt) {
        this.quizAttempt = attempt;
        this.groupQuestionsByTopic();
      } else {
        this.errorLoading = 'Quiz attempt not found. It might have been deleted or the ID is incorrect.';
      }
    } catch (error) {
      console.error('Error loading quiz attempt:', error);
      this.errorLoading = 'Failed to load quiz results. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  //for (const answeredQ of this.quizAttempt.allQuestions) {
  //    const topic = answeredQ && answeredQ.userAnswerIndex != undefined ? answeredQ.questionSnapshot.topic || 'Uncategorized' : 'Uncategorized'; // Fallback topic


  groupQuestionsByTopic(): void {
    if (!this.quizAttempt) return;

    const groups: { [key: string]: AnsweredQuestion[] } = {};
    for (const answeredQ of this.quizAttempt.allQuestions.filter(qst => !this.quizAttempt?.answeredQuestions.map(q => q.questionId).includes(qst.questionId)).concat(this.quizAttempt?.answeredQuestions)) {
      const topic = answeredQ.questionSnapshot.topic || 'Uncategorized'; // Fallback topic
      answeredQ.isCorrect = this.quizAttempt.answeredQuestions && this.quizAttempt.answeredQuestions.findIndex(qst => qst.questionId === answeredQ.questionId && qst.userAnswerIndex === answeredQ.questionSnapshot.correctAnswerIndex) >= 0 ? true : false;
      if (!groups[topic]) {
        groups[topic] = [];
      }
      groups[topic].push(answeredQ);
    }

    this.groupedQuestions = Object.keys(groups)
      .sort() // Sort topics alphabetically
      .map(topic => ({
        topic: topic,
        questions: groups[topic]
      }));
  }

  getOptionClass(question: AnsweredQuestion, optionIndex: number): string {
    const { userAnswerIndex, questionSnapshot } = question;
    const correctAnswerIndex = questionSnapshot.correctAnswerIndex;

    if (optionIndex === correctAnswerIndex) {
      if (question.userAnswerIndex === -1){
        return 'bg-yellow-100 border-yellow-500 text-yellow-700 font-semibold  line-through'; // Correct option
      } else {
        return 'bg-green-100 border-green-500 text-green-700 font-semibold'; // Correct option
      }
    }
    if (optionIndex === userAnswerIndex && optionIndex !== correctAnswerIndex) {
      return 'bg-red-100 border-red-500 text-red-700 line-through'; // User's incorrect option
    }
    return 'bg-gray-50 border-gray-300 text-gray-600'; // Other options
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  async toggleFavoriteFromResult(questionId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation(); // Prevent other click actions if star is inside a clickable row
    const newFavStatus = await this.dbService.toggleFavoriteStatus(questionId);
    // Update UI: Find the question in `groupedQuestions` and update its snapshot's isFavorite.
    // This is a bit tricky because questionSnapshot is a copy.
    // A better way might be to have a parallel structure or re-fetch for true live status.
    // For now, let's assume the toggle worked in DB. The user would see change on next view of favorites list.
    // Or, if you want immediate UI update here:
    if (newFavStatus !== undefined && this.quizAttempt) {
      this.quizAttempt.answeredQuestions.forEach(aq => {
        if (aq.questionId === questionId) {
          // This updates the snapshot, which might not be ideal if snapshot should be immutable.
          // A better approach would be to have a separate live `isFavorite` status for display.
          (aq.questionSnapshot as any).isFavorite = newFavStatus; // Cast to any or extend snapshot interface
        }
      });
    }
  }

  checkIfThereAtLeastAnAnswer(q: AnsweredQuestion): boolean {
    return (this.quizAttempt && this.quizAttempt.answeredQuestions && this.quizAttempt.answeredQuestions.length > 0) || false;
  }

  checkIfAnswerIsCorrect(q: AnsweredQuestion): boolean {
    return (this.quizAttempt && this.quizAttempt.answeredQuestions && this.quizAttempt.answeredQuestions.findIndex(qst => qst.questionId === q.questionId && qst.userAnswerIndex === q.questionSnapshot.correctAnswerIndex) >= 0) || false;
  }

  checkIfQuestionIsTheSame(q: AnsweredQuestion): boolean {
    return (this.quizAttempt && this.quizAttempt.answeredQuestions && this.quizAttempt.answeredQuestions.findIndex(qst => qst.questionId === q.questionId) >= 0) || false;
  }



  exportResultsToPDF(): void {
    if (!this.quizAttempt) return;

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20; // Initial Y position for drawing
    const lineHeight = 7; // Approximate line height
    const margin = 15;

    const checkYPos = (neededHeight: number = lineHeight * 2) => {
      if (yPos + neededHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
    };

    // --- Header ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Quiz Results', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Completed: ${new DatePipe('en-US').transform(this.quizAttempt.timestampEnd, 'medium')}`, margin, yPos);
    yPos += lineHeight;

    doc.setFont('helvetica', 'bold');
    doc.text('Overall Score:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${this.quizAttempt.score} / ${this.quizAttempt.totalQuestionsInQuiz} (${new PercentPipe('en-US').transform(
        (this.quizAttempt.score || 0) / this.quizAttempt.totalQuestionsInQuiz, '1.0-1'
      )})`,
      margin + 40, yPos
    );
    yPos += lineHeight * 2;

    // --- Questions Breakdown ---
    this.groupedQuestions.forEach(group => {
      checkYPos(lineHeight * 3);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Topic: ${group.topic}`, margin, yPos);
      yPos += lineHeight * 1.5;
      doc.setFontSize(10);

      group.questions.forEach((q, index) => {
        checkYPos(lineHeight * (q.questionSnapshot.options.length + 4 + (q.questionSnapshot.explanation ? 3 : 0)));

        doc.setFont('helvetica', 'bold');
        doc.text(`Q${index + 1}: ${q.questionSnapshot.text}`, margin, yPos, { maxWidth: pageWidth - margin * 2 });
        yPos += lineHeight * Math.ceil(doc.getTextDimensions(`Q${index + 1}: ${q.questionSnapshot.text}`, { maxWidth: pageWidth - margin * 2 }).h / (lineHeight * 0.7)); // Adjust based on wrapped lines

        doc.setFont('helvetica', 'normal');
        q.questionSnapshot.options.forEach((option, optIndex) => {
          let prefix = '';
          let optionColor: string | undefined = undefined; // Default black

          if (optIndex === q.questionSnapshot.correctAnswerIndex) {
            prefix = '(Correct) ';
            optionColor = '#28a745'; // Green
          }
          if (optIndex === q.userAnswerIndex) {
            prefix += (q.isCorrect ? '' : '(Your Incorrect Answer) ');
            if (!q.isCorrect) optionColor = '#dc3545'; // Red
          }

          if (optionColor) doc.setTextColor(optionColor);
          doc.text(`${String.fromCharCode(65 + optIndex)}. ${prefix}${option}`, margin + 5, yPos, { maxWidth: pageWidth - margin * 2 - 5 });
          if (optionColor) doc.setTextColor(0, 0, 0); // Reset to black
          yPos += lineHeight;
        });

        if (q.questionSnapshot.explanation) {
          checkYPos(lineHeight * 2);
          doc.setFont('helvetica', 'italic');
          doc.text(`Explanation: ${q.questionSnapshot.explanation}`, margin + 5, yPos, { maxWidth: pageWidth - margin * 2 - 5 });
          yPos += lineHeight * Math.ceil(doc.getTextDimensions(`Explanation: ${q.questionSnapshot.explanation}`, { maxWidth: pageWidth - margin * 2 - 5 }).h / (lineHeight * 0.7));
          doc.setFont('helvetica', 'normal');
        }
        yPos += lineHeight * 0.5; // Extra space between questions
      });
      yPos += lineHeight; // Extra space between topics
    });

    // --- Footer (Page Number) ---
    const pageCount = (doc.internal as any).getNumberOfPages(); // Type assertion for internal property
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 10, pageHeight - 10);
    }

    doc.save(`quiz-results-${this.quizAttempt.id.substring(0, 8)}.pdf`);
  }

  // --- html2canvas approach (alternative, more complex setup) ---
  // async exportResultsToPDF_html2canvas(): Promise<void> {
  //   if (!this.resultsContainerRef?.nativeElement) return;
  //   const data = this.resultsContainerRef.nativeElement;
  //   const canvas = await html2canvas(data, { scale: 2 }); // Scale for better quality
  //   const imgWidth = 208; // A4 width in mm (minus margins)
  //   const pageHeight = 295; // A4 height in mm (minus margins)
  //   const imgHeight = canvas.height * imgWidth / canvas.width;
  //   let heightLeft = imgHeight;
  //   const contentDataURL = canvas.toDataURL('image/png');
  //   const pdf = new jsPDF('p', 'mm', 'a4');
  //   let position = 0;
  //   pdf.addImage(contentDataURL, 'PNG', 0, position, imgWidth, imgHeight);
  //   heightLeft -= pageHeight;
  //   while (heightLeft >= 0) {
  //     position = heightLeft - imgHeight;
  //     pdf.addPage();
  //     pdf.addImage(contentDataURL, 'PNG', 0, position, imgWidth, imgHeight);
  //     heightLeft -= pageHeight;
  //   }
  //   pdf.save(`quiz-results-${this.quizAttempt?.id.substring(0,8)}.pdf`);
  // }

  calcDurataQuiz(quizAttempt: QuizAttempt): string {
    if (quizAttempt && quizAttempt?.timestampEnd && quizAttempt?.timestampStart) {
      return this.msToTime(quizAttempt.timestampEnd.getTime() - quizAttempt.timestampStart.getTime());
    }
    return "";
  }

  private msToTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Pad with leading zeros
    const pad = (n: number) => n.toString().padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  repeatQuiz(): void {
    if (!this.quizAttempt) {
      return;
    }
    this.dbService.getQuestionByIds(this.quizAttempt.allQuestions.map(q => q.questionId)).then((questions) => {
      this.onInternalSubmit(this.quizAttempt);
    });
  }

  repeatWrongQuiz(): void {
    if (!this.quizAttempt) {
      return;
    }
    this.dbService.getQuestionByIds(this.quizAttempt.allQuestions.filter(q=>q.userAnswerIndex === -1 || q.isCorrect === false).map(q => q.questionId)).then((questions) => {
      this.onInternalSubmit(this.quizAttempt, questions);
    });
  }

  onInternalSubmit(quizAttempt: QuizAttempt | undefined, questions?: Question[]): void {
    let quizSettings: Partial<QuizSettings> | undefined = quizAttempt?.settings;

    let navigateToPath = '/quiz/take'; // Default path
    console.log(`REPEATING quiz with settings:`, quizSettings);
    const fixedQuestionIds: string[] | undefined = questions ? questions.map(q => q.id) : quizAttempt?.allQuestions.map(q => q.questionId);
    const shuffledQuestionIds = fixedQuestionIds?.sort(() => 0.5 - Math.random());

    this.router.navigate([navigateToPath], { // Use dynamic path
      queryParams: {
        numQuestions: quizSettings?.numQuestions, // Could be very large for "all" in study mode
        topics: quizSettings?.selectedTopics?.join(','),
        keywords: quizSettings?.keywords?.join(','),
        // For quiz mode, pass other relevant params
        topicDistribution: quizSettings?.topicDistribution ? JSON.stringify(quizSettings.topicDistribution) : '',
        enableTimer: false,
        timerDuration: 0,
        // get specific question id
        fixedQuestionIds: shuffledQuestionIds
      }
    });
  }
}