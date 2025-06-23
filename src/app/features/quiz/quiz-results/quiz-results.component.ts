// src/app/features/quiz/quiz-results/quiz-results.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core'; // Added ChangeDetectorRef
import { CommonModule, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import jsPDF from 'jspdf';

import { DatabaseService } from '../../../core/services/database.service';
import { QuizAttempt, AnsweredQuestion } from '../../../models/quiz.model'; // Ensure QuestionSnapshotInfo is imported if used directly
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  IconDefinition,
  faExclamation,
  faRepeat,
  faHome,
  faChevronDown,
  faChevronUp,
  faFaceSmileBeam,
  faBarChart,
  faLandmark,
  faCircleXmark,
  faQuestion,
  faExclamationCircle,
  faCheckCircle,
  faList
} from '@fortawesome/free-solid-svg-icons';
import { AlertService } from '../../../services/alert.service'; // Added faChevronDown, faChevronUp
import { Contest } from '../../../models/contest.model';
import { ContestSelectionService } from '../../../core/services/contest-selection.service';
import { AuthService } from '../../../core/services/auth.service';
import { QuestionService } from '../../../core/services/question-service.service';

interface GroupedQuestionDisplay { // Renamed for clarity
  topic: string;
  questions: AnsweredQuestion[]; // These are augmented with answer info
}

@Component({
  selector: 'app-quiz-results',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, PercentPipe, FontAwesomeModule],
  templateUrl: './quiz-results.component.html',
  styleUrls: ['./quiz-results.component.scss']
})
export class QuizResultsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dbService = inject(DatabaseService);
  private alertService = inject(AlertService);
  private cdr = inject(ChangeDetectorRef); // For manual change detection if needed
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service
  authService = inject(AuthService);
  questionService = inject(QuestionService);

  // Icons
  segnala: IconDefinition = faExclamation;
  repeatIcon: IconDefinition = faRepeat;
  homeIcon: IconDefinition = faHome;
  faLandmark: IconDefinition = faLandmark;
  faBarChart: IconDefinition = faBarChart;
  faChevronDown: IconDefinition = faChevronDown; // For accordion closed
  faChevronUp: IconDefinition = faChevronUp;     // For accordion open
  faGood: IconDefinition = faFaceSmileBeam;
  faCircleXmark: IconDefinition = faCircleXmark;
  faCheckCircle: IconDefinition = faCheckCircle;
  faExclamationCircle: IconDefinition = faExclamationCircle;
  faList: IconDefinition = faList;

  quizAttemptId: string | null = null;
  quizAttempt: QuizAttempt | undefined;
  groupedQuestions: GroupedQuestionDisplay[] = [];
  wrongOrUnansweredQuestionIds: string[] = []; // Store IDs of questions that were wrong or unanswered
  wrongQuestionIds: string[] = [];
  correctQuestionIds: string[] = [];
  maxScore: number = 0;

  isLoading = true;
  errorLoading = '';

  // --- NEW: For Accordion State ---
  accordionState = new Map<string, boolean>(); // Map: topicName -> isOpen
  // --- END NEW ---

  private routeSub!: Subscription;

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'auto' });
    this.routeSub = this.route.paramMap.subscribe(params => {
      this.quizAttemptId = params.get('id');
      if (this.quizAttemptId) {
        this.loadQuizAttemptDetails(this.quizAttemptId);
      } else {
        this.errorLoading = 'Nessun ID Quiz fornito.';
        this.isLoading = false;
      }
    });
  }

  async loadQuizAttemptDetails(id: string): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    this.accordionState.clear(); // Clear previous accordion state
    try {
      const attempt = await this.dbService.getQuizAttemptById(id);
      if (attempt) {
        this.quizAttempt = attempt;
        this.groupQuestionsByTopic();
        // Initialize accordion state: all closed by default, or first one open
        this.groupedQuestions.forEach((group, index) => {
          this.accordionState.set(group.topic, index === 0); // Open the first group by default
        });
        this.wrongOrUnansweredQuestionIds = this.quizAttempt.allQuestions
          .filter(qInfo => {
            const answeredInfo = this.quizAttempt!.answeredQuestions.find(aq => aq.questionId === qInfo.questionId);
            return !answeredInfo || !answeredInfo.isCorrect; // Not in answeredQuestions OR isCorrect is false
          })
          .map(qInfo => qInfo.questionId);
        this.correctQuestionIds = this.quizAttempt.answeredQuestions.filter(qInfo => qInfo.isCorrect === true)
          .map(qInfo => qInfo.questionId);
        this.wrongQuestionIds = this.quizAttempt.answeredQuestions.filter(qInfo => !qInfo.isCorrect)
          .map(qInfo => qInfo.questionId);
        this.maxScore = this.quizAttempt.allQuestions.reduce((sum, q) => sum + (q.questionSnapshot.scoreIsCorrect || 0) * 1, 0);
      } else {
        this.errorLoading = 'Tentativo di quiz non trovato. Potrebbe essere stato eliminato o l\'ID non è corretto.';
      }
    } catch (error) {
      console.error('Errore nel caricamento dei dettagli del tentativo di quiz:', error);
      this.errorLoading = 'Impossibile caricare i risultati del quiz. Per favore riprova.';
    } finally {
      this.isLoading = false;
    }
  }

  groupQuestionsByTopic(): void {
    if (this.selectedPublicContest === null) {
      this.alertService.showAlert("Errore", "Non è stata selezionata alcuna banca dati valida.");
      return;
    }

    if (!this.quizAttempt || !this.quizAttempt.allQuestions) {
      this.groupedQuestions = [];
      return;
    }

    const groups: { [key: string]: AnsweredQuestion[] } = {};
    const answeredMap = new Map<string, AnsweredQuestion>();
    (this.quizAttempt.answeredQuestions || []).forEach(aq => answeredMap.set(aq.questionId, aq));

    // Iterate through all questions that were part of the attempt
    for (const qInfo of this.quizAttempt.allQuestions) {
      const topic = qInfo.questionSnapshot.topic || 'Uncategorized';
      if (!groups[topic]) {
        groups[topic] = [];
      }

      const answeredVersion = answeredMap.get(qInfo.questionId);
      const displayQuestion: AnsweredQuestion = {
        questionId: qInfo.questionId,
        // The snapshot from allQuestions IS the definitive record of how the question was presented.
        questionSnapshot: qInfo.questionSnapshot,
        userAnswerIndex: answeredVersion ? answeredVersion.userAnswerIndex : -1, // -1 indicates unanswered
        isCorrect: answeredVersion ? answeredVersion.isCorrect : false, // Treat unanswered as incorrect for results
        contestId: this.selectedPublicContest.id
      };
      groups[topic].push(displayQuestion);
    }

    this.groupedQuestions = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b)) // Sort topics alphabetically
      .map(topic => ({
        topic: topic,
        questions: groups[topic] // These questions are now correctly augmented
      }));
  }

  getOptionClass(question: AnsweredQuestion, optionIndex: number): string {
    const { userAnswerIndex, questionSnapshot, isCorrect } = question;
    const correctAnswerIndex = questionSnapshot.correctAnswerIndex;

    // Default styles for an option that is not selected and not the correct answer
    let classes = 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300';

    // If this option is the correct answer
    if (optionIndex === correctAnswerIndex) {
      classes = 'bg-green-100 dark:bg-green-700 dark:bg-opacity-60 border-green-500 dark:border-green-500 text-green-800 dark:text-green-100 font-semibold';
    }

    // If this option was the user's answer
    if (userAnswerIndex === optionIndex) {
      if (!isCorrect) { // And it was incorrect
        classes = 'bg-red-100 dark:bg-red-800 dark:bg-opacity-60 border-red-500 dark:border-red-500 text-red-700 dark:text-red-200';
      }
      // If it was correct, it's already handled by the green class above
    } else if (userAnswerIndex === -1 && optionIndex === correctAnswerIndex) {
      // If the question was unanswered, and this is the correct option
      classes = 'bg-yellow-100 dark:bg-yellow-700 dark:bg-opacity-50 border-yellow-500 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200 font-semibold';
    }

    return classes;
  }

  // --- NEW: Accordion Toggle Method ---
  toggleAccordion(topic: string): void {
    const currentState = this.accordionState.get(topic);
    this.accordionState.set(topic, !currentState);
  }

  openAccordion(topic: string): void {
    this.accordionState.set(topic, true);
  }

  closeAccordion(topic: string): void {
    this.accordionState.set(topic, false);
  }

  // --- END NEW ---

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  async toggleFavoriteFromResult(questionId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const newFavStatus = await this.dbService.toggleFavoriteStatus(questionId);

    if (newFavStatus !== undefined && this.quizAttempt) {
      // Update the specific question's favorite status within the groupedQuestions for immediate UI reflection
      for (const group of this.groupedQuestions) {
        const questionInGroup = group.questions.find(q => q.questionId === questionId);
        if (questionInGroup) {
          // Directly modify the snapshot. Be aware of immutability concerns if this snapshot is shared.
          // For display purposes here, it's usually fine.
          (questionInGroup.questionSnapshot as any).isFavorite = newFavStatus;
          break; // Found and updated
        }
      }
      // Also update in the main quizAttempt.allQuestions if it's referenced directly elsewhere
      const qInAll = this.quizAttempt.allQuestions.find(qInfo => qInfo.questionId === questionId);
      if (qInAll) {
        (qInAll.questionSnapshot as any).isFavorite = newFavStatus;
      }
      this.cdr.detectChanges(); // Force UI update if the change is deep
    }
  }


  checkIfThereAtLeastAnAnswer(q: AnsweredQuestion): boolean {
    return q.userAnswerIndex !== -1;
  }

  // checkIfAnswerIsCorrect is now part of the AnsweredQuestion object (q.isCorrect)
  // checkIfQuestionIsTheSame is not needed as we iterate over attempt.allQuestions

  exportResultsToPDF(): void {
    if (!this.quizAttempt) return;

    const doc = new jsPDF();
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

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Risultati Quiz', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Completato: ${new DatePipe('it-IT').transform(this.quizAttempt.timestampEnd, 'medium')}`, margin, yPos);
    yPos += lineHeight;
    doc.text(`Durata: ${this.calcDurataQuiz(this.quizAttempt)}`, margin, yPos);
    yPos += lineHeight;


    doc.setFont('helvetica', 'bold');
    doc.text('Punteggio Totale:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${this.quizAttempt.score} / ${this.quizAttempt.totalQuestionsInQuiz} (${new PercentPipe('en-US').transform(
        (this.quizAttempt.score || 0) / (this.quizAttempt.totalQuestionsInQuiz || 1), '1.0-1' // Ensure totalQuestionsInQuiz is not 0
      )})`,
      margin + 45, yPos // Adjusted offset
    );
    yPos += lineHeight * 2;

    this.groupedQuestions.forEach(group => {
      checkYPos(lineHeight * 3);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Argomento: ${group.topic}`, margin, yPos);
      yPos += lineHeight * 1.5;
      doc.setFontSize(10);

      group.questions.forEach((q, index) => {
        // Estimate needed height
        let neededHeight = lineHeight * 2; // For question text (assuming 2 lines max, adjust if needed)
        neededHeight += q.questionSnapshot.options.length * lineHeight; // For options
        if (q.questionSnapshot.explanation) neededHeight += lineHeight * 2; // For explanation
        checkYPos(neededHeight);

        doc.setFont('helvetica', 'bold');
        const questionText = `D${index + 1}: ${q.questionSnapshot.text}`;
        const splitQuestionText = doc.splitTextToSize(questionText, contentWidth);
        doc.text(splitQuestionText, margin, yPos);
        yPos += splitQuestionText.length * (lineHeight * 0.8); // Use actual lines height

        doc.setFont('helvetica', 'normal');
        q.questionSnapshot.options.forEach((option, optIndex) => {
          let prefix = '';
          let optionColor: [number, number, number] | undefined = undefined; // RGB array

          if (optIndex === q.questionSnapshot.correctAnswerIndex) {
            prefix = '(Corretta) ';
            optionColor = [40, 167, 69]; // Green RGB
          }
          if (optIndex === q.userAnswerIndex) { // User's answer
            prefix += q.isCorrect ? '' : '(Tua Risposta Errata) ';
            if (!q.isCorrect) optionColor = [220, 53, 69]; // Red RGB
          } else if (q.userAnswerIndex === -1 && optIndex === q.questionSnapshot.correctAnswerIndex) {
            // If unanswered and this is the correct one, show as "missed correct"
            prefix = '(Corretta - Non Risposta) ';
            optionColor = [255, 193, 7]; // Yellow/Amber RGB
          }


          if (optionColor) doc.setTextColor(optionColor[0], optionColor[1], optionColor[2]);
          const optionFullText = `${String.fromCharCode(65 + optIndex)}. ${prefix}${option}`;
          const splitOptionText = doc.splitTextToSize(optionFullText, contentWidth - 5);
          doc.text(splitOptionText, margin + 5, yPos);
          if (optionColor) doc.setTextColor(0, 0, 0); // Reset to black
          yPos += splitOptionText.length * (lineHeight * 0.8);
        });

        if (q.questionSnapshot.explanation) {
          checkYPos(lineHeight * 2);
          doc.setFont('helvetica', 'italic');
          const explanationText = `Spiegazione: ${q.questionSnapshot.explanation}`;
          const splitExplanation = doc.splitTextToSize(explanationText, contentWidth - 5);
          doc.text(splitExplanation, margin + 5, yPos);
          yPos += splitExplanation.length * (lineHeight * 0.8);
          doc.setFont('helvetica', 'normal');
        }
        yPos += lineHeight * 0.5;
      });
      yPos += lineHeight;
    });

    const pageCount = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin - 5, pageHeight - 10, { align: 'right' });
    }

    doc.save(`risultati-quiz-${this.quizAttempt.id.substring(0, 8)}.pdf`);
  }

  calcDurataQuizOLD(quizAttempt: QuizAttempt): string {
    if (quizAttempt && quizAttempt.timestampEnd && quizAttempt.timestampStart) {
      // Check if timestamps are Date objects or strings/numbers
      const endTime = typeof quizAttempt.timestampEnd === 'string' || typeof quizAttempt.timestampEnd === 'number'
        ? new Date(quizAttempt.timestampEnd).getTime()
        : quizAttempt.timestampEnd.getTime();
      const startTime = typeof quizAttempt.timestampStart === 'string' || typeof quizAttempt.timestampStart === 'number'
        ? new Date(quizAttempt.timestampStart).getTime()
        : quizAttempt.timestampStart.getTime();

      if (!isNaN(endTime) && !isNaN(startTime)) {
        return this.msToTime(endTime - startTime);
      }
    }
    return "N/D";
  }

  calcDurataQuiz(quizAttempt: QuizAttempt): string {
    if (
      quizAttempt &&
      ((quizAttempt.timestampEnd &&
        quizAttempt.timestampStart) || quizAttempt.timeElapsed)
    ) {
      if (quizAttempt.timeElapsed !== undefined && quizAttempt.timeElapsed !== null && quizAttempt.timeElapsed > 0) {
        return this.msToTime(quizAttempt.timeElapsed * 1000);
      } else if (quizAttempt.timestampEnd &&
        quizAttempt.timestampStart) {
        // Get timestamps as milliseconds
        const endTime =
          typeof quizAttempt.timestampEnd === 'string' || typeof quizAttempt.timestampEnd === 'number'
            ? new Date(quizAttempt.timestampEnd).getTime()
            : quizAttempt.timestampEnd.getTime();
        const startTime =
          typeof quizAttempt.timestampStart === 'string' || typeof quizAttempt.timestampStart === 'number'
            ? new Date(quizAttempt.timestampStart).getTime()
            : quizAttempt.timestampStart.getTime();

        if (!isNaN(endTime) && !isNaN(startTime)) {
          // Subtract paused time if present, unless pausedSeconds equals the total duration (startTime - endTime)
          const pausedSeconds = quizAttempt.timeElapsedOnPauseSeconds || 0;
          const totalMs = endTime - startTime;
          let elapsedMs: number;
          if (pausedSeconds * 1000 === totalMs) {
            elapsedMs = totalMs;
          } else {
            elapsedMs = Math.max(0, totalMs - pausedSeconds * 1000);
          }
          return this.msToTime(elapsedMs);
        }
      }
    }
    return "N/D";
  }




  private msToTime(ms: number): string {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  async repeatQuiz(): Promise<void> { // Make async if dbService calls are async
    if (this.quizAttempt?.id) {
      await this.questionService.repeatQuiz(this.quizAttempt.id);
    }
  }

  async repeatWrongQuiz(): Promise<void> { // Make async
    if (this.quizAttempt?.id) {
      await this.questionService.repeatWrongQuiz(this.quizAttempt.id);
    }
  }

  getTotalStringByGroup(group: GroupedQuestionDisplay): string {
    if (group && group.questions) {
      return ' - Corrette ' + (this.getCorrectnessByGroup(group) * 100).toFixed(2) + '% (' + this.getCorrectByGroup(group).toString().concat('/', this.getGroupLength(group).toString(), ')');
    }
    return '';
  }

  getCorrectnessByGroup(group: GroupedQuestionDisplay): number {
    if (group && group.questions) {
      return (group.questions.filter(qst => qst.isCorrect).length || 0) / (this.getGroupLength(group) || 1);
    }
    return 1;
  }

  getCorrectByGroup(group: GroupedQuestionDisplay): number {
    if (group && group.questions) {
      return group.questions.filter(qst => qst.isCorrect).length;
    }
    return 1;
  }

  getGroupLength(group: GroupedQuestionDisplay): number {
    if (group && group.questions) {
      return group.questions.length;
    }
    return 1;
  }

  getResultClass(group: GroupedQuestionDisplay): string {
    // bg-green-200 border-green-500 border-t-4 dark:bg-green-800 dark:border-green-700 p-4 rounded-lg shadow-lg sm:p-6 mb-6

    let classes = 'mb-6 p-4 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-500 dark:border-gray-700';

    // bg-green-100 border-green-500 border-t-4 p-4 rounded-lg shadow-lg sm:p-6 mb-4

    const totQuestions = group.questions.length || 1;
    const resultsPercentage = group.questions.reduce((sum, tc) => sum + Number((tc.isCorrect ? 1 : 0) || 0), 0) / totQuestions * 100;

    if (resultsPercentage >= 75) {
      classes = 'bg-green-200 border-green-500 border-t-4 dark:bg-green-800 dark:border-green-700 p-4 rounded-lg shadow-lg sm:p-6 mb-6';
    } else if (resultsPercentage >= 50 && resultsPercentage < 75) {
      classes = 'bg-yellow-200 border-yellow-500 border-t-4 dark:bg-yellow-800 dark:border-yellow-700 p-4 rounded-lg shadow-lg sm:p-6 mb-6';
    } else if (resultsPercentage >= 25 && resultsPercentage < 50) {
      classes = 'bg-orange-200 border-orange-500 border-t-4 dark:bg-orange-800 dark:border-orange-700 p-4 rounded-lg shadow-lg sm:p-6 mb-6';
    } else {
      classes = 'bg-red-200 border-red-500 border-t-4 dark:bg-red-800 dark:border-red-700 p-4 rounded-lg shadow-lg sm:p-6 mb-6';
    }
    return classes;
  }

  applyFilters(type: string): void {
    if (!this.quizAttempt) return;

    // Example: this.filterType can be 'all', 'correct', 'wrong', or 'skipped'
    const filterType = type || 'all';

    const answeredMap = new Map<string, AnsweredQuestion>();
    (this.quizAttempt.answeredQuestions || []).forEach(aq => answeredMap.set(aq.questionId, aq));

    const filteredGroups: { [key: string]: AnsweredQuestion[] } = {};

    for (const qInfo of this.quizAttempt.allQuestions) {
      const topic = qInfo.questionSnapshot.topic || 'Uncategorized';
      if (!filteredGroups[topic]) filteredGroups[topic] = [];

      const answeredVersion = answeredMap.get(qInfo.questionId);
      const displayQuestion: AnsweredQuestion = {
        questionId: qInfo.questionId,
        questionSnapshot: qInfo.questionSnapshot,
        userAnswerIndex: answeredVersion ? answeredVersion.userAnswerIndex : -1,
        isCorrect: answeredVersion ? answeredVersion.isCorrect : false,
        contestId: this.selectedPublicContest?.id || -1
      };

      let include = false;
      switch (filterType) {
        case 'correct':
          include = displayQuestion.isCorrect;
          break;
        case 'wrong':
          include = answeredVersion !== undefined && !displayQuestion.isCorrect;
          break;
        case 'skipped':
          include = displayQuestion.userAnswerIndex === -1;
          break;
        default:
          include = true;
      }
      if (include) filteredGroups[topic].push(displayQuestion);
    }

    this.groupedQuestions = Object.keys(filteredGroups)
      .sort((a, b) => a.localeCompare(b))
      .map(topic => ({
        topic,
        questions: filteredGroups[topic]
      }))
      .filter(topic => topic.questions && topic.questions.length > 0);

    this.groupedQuestions.forEach((groupedQuestion, index) => {
      if (filterType !== 'all') {
        this.openAccordion(groupedQuestion.topic);
      } else {
        if (index === 0) {
          this.openAccordion(groupedQuestion.topic);
        } else {
          this.closeAccordion(groupedQuestion.topic);
        }
      }
    })
  }
}
