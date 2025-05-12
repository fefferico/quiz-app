// src/app/pages/quiz-setup/quiz-setup.component.ts
import { Component, OnInit, inject, DoCheck } from '@angular/core'; // Added DoCheck
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { DatabaseService } from '../../core/services/database.service';
import { QuizSettings, TopicCount } from '../../models/quiz.model'; // Import TopicCount
import { Question } from '../../models/question.model'; // Ensure Question is imported
import jsPDF from 'jspdf';

@Component({
  selector: 'app-quiz-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './quiz-setup.component.html',
  styleUrls: ['./quiz-setup.component.scss']
})
export class QuizSetupComponent implements OnInit, DoCheck { // Implemented DoCheck
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  isExportingPDF = false; // To give user feedback during PDF generation

  // Timer Settings
  enableTimerInput = false; // <-- NEW
  timerHoursInput = 0;     // <-- NEW
  timerMinutesInput = 10;  // <-- NEW (default to 10 minutes)
  timerSecondsInput = 0;   // <-- NEW

  availableTopics: string[] = [];
  selectedTopicsForDisplay: string[] = []; // Topics chosen by checkboxes

  // For topic distribution
  topicCounts: TopicCount[] = []; // Holds { topic: string, count: number } for selected topics

  numQuestionsOptions = [5, 10, 15, 20, 25, 30, 40, 50];
  // selectedNumQuestions now primarily driven by topicCounts sum or "All Topics" mode
  selectedNumQuestions: number = 10; // Default, will be overridden

  selectAllTopics = true;
  useDetailedTopicCounts = false; // NEW: To switch between simple and detailed mode

  keywordsInput = '';
  isStudyMode = false; // <-- NEW property for the toggle


  // To prevent infinite loops with ngDoCheck and topicCounts updates
  private previousSelectedTopicsLength = 0;
  private previousUseDetailedTopicCounts = false;

  ngOnInit(): void {
    this.loadTopics();
    this.updateSelectionMode(); // Initial setup based on selectAllTopics
  }

  // ngDoCheck is used here to react to changes in selectedTopicsForDisplay
  // when not using selectAllTopics, to update the topicCounts array.
  // Be cautious with ngDoCheck as it can impact performance if not handled carefully.
  ngDoCheck(): void {
    if (this.useDetailedTopicCounts && this.selectedTopicsForDisplay.length !== this.previousSelectedTopicsLength) {
      this.initializeOrUpdateTopicCounts();
      this.previousSelectedTopicsLength = this.selectedTopicsForDisplay.length;
    }
    if (this.useDetailedTopicCounts !== this.previousUseDetailedTopicCounts) {
      this.initializeOrUpdateTopicCounts(); // Also update if mode changes
      this.previousUseDetailedTopicCounts = this.useDetailedTopicCounts;
    }
  }


  async loadTopics(): Promise<void> {
    try {
      const questions = await this.dbService.getAllQuestions();
      const topics = new Set(questions.map(q => q.topic));
      this.availableTopics = Array.from(topics).sort();
      this.updateSelectionMode(); // Call again in case topics load after init view
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  }

  updateSelectionMode(): void {
    if (this.selectAllTopics) {
      this.useDetailedTopicCounts = false;
      this.selectedTopicsForDisplay = [...this.availableTopics]; // For display consistency
      this.topicCounts = []; // Clear detailed counts
    } else {
      // When "All Topics" is unchecked, user might want detailed counts or just pick topics for an overall number
      // Let's assume for now if "All Topics" is off, we allow detailed counts.
      // This can be refined with another toggle if needed.
      this.useDetailedTopicCounts = true;
      this.initializeOrUpdateTopicCounts();
    }
    this.calculateTotalQuestionsFromTopicCounts(); // Update total based on current mode
  }

  toggleTopicCheckbox(topic: string): void {
    const index = this.selectedTopicsForDisplay.indexOf(topic);
    if (index > -1) {
      this.selectedTopicsForDisplay.splice(index, 1);
    } else {
      this.selectedTopicsForDisplay.push(topic);
    }
    // No automatic call to initializeOrUpdateTopicCounts here, ngDoCheck will handle it.
    this.updateSelectAllCheckboxState(); // For the "All Topics" checkbox itself
  }

  // Called when the "All Topics" checkbox state changes
  onSelectAllTopicsChange(): void {
    this.updateSelectionMode();
  }

  initializeOrUpdateTopicCounts(): void {
    if (!this.useDetailedTopicCounts || this.selectAllTopics) {
      this.topicCounts = [];
      this.calculateTotalQuestionsFromTopicCounts();
      return;
    }

    const newTopicCounts: TopicCount[] = [];
    const currentTotalFromDropdown = this.selectedNumQuestions; // Capture current total if needed for distribution
    const numSelectedDisplayTopics = this.selectedTopicsForDisplay.length;

    // Default count if distributing the total, ensuring at least 1 if any topics selected
    const defaultCountPerNewTopic = numSelectedDisplayTopics > 0
      ? Math.max(1, Math.floor(currentTotalFromDropdown / numSelectedDisplayTopics))
      : 1; // Default to 1 if for some reason numSelectedDisplayTopics is 0 but we are here

    for (const topic of this.selectedTopicsForDisplay) {
      // Try to find an existing TopicCount object for this topic from the *previous* state of topicCounts
      // This helps preserve user-entered counts if a topic was already in topicCounts.
      const existingTcObject = this.topicCounts.find(tc => tc.topic === topic);
      if (existingTcObject) {
        newTopicCounts.push(existingTcObject); // Preserve existing object with its count
      } else {
        // Topic is newly selected for detailed counting
        newTopicCounts.push({ topic: topic, count: defaultCountPerNewTopic });
      }
    }
    this.topicCounts = newTopicCounts; // Replace the old array with the new one

    // If after rebuilding, some topics were removed, their counts are gone.
    // Recalculate total based on the new state of topicCounts.
    this.calculateTotalQuestionsFromTopicCounts();
  }

  // Call this when individual topic counts change or when mode changes
  calculateTotalQuestionsFromTopicCounts(): void {
    if (this.useDetailedTopicCounts && this.topicCounts.length > 0) {
      this.selectedNumQuestions = this.topicCounts.reduce((sum, tc) => sum + Number(tc.count || 0), 0);
    } else if (this.selectAllTopics) {
      // Keep the last selectedNumQuestions or a default if "All Topics" is re-selected
      // For simplicity, let's reset to a default or retain.
      // If you want to retain, you'd need to store the "global" selectedNumQuestions separately.
      // For now, let's assume the numQuestionsOptions dropdown is the master for "All Topics" mode.
      // This means this.selectedNumQuestions is already set from that dropdown.
    }
  }

  updateSelectAllCheckboxState(): void {
    if (this.availableTopics.length > 0 && this.selectedTopicsForDisplay.length === this.availableTopics.length) {
      this.selectAllTopics = true;
      this.useDetailedTopicCounts = false; // Switch mode if all topics are checked
      this.topicCounts = [];
    } else {
      this.selectAllTopics = false;
      this.useDetailedTopicCounts = true; // Switch mode
      // ngDoCheck will call initializeOrUpdateTopicCounts
    }
    this.calculateTotalQuestionsFromTopicCounts();
  }

  isTopicSelectedForDisplay(topic: string): boolean {
    return this.selectedTopicsForDisplay.includes(topic);
  }

  isDisplayable(topic: string): boolean {
    return this.isTopicSelectedForDisplay(topic) && !!this.topicCounts.find(tc => tc.topic === topic)
  }

  canStartQuiz(): boolean {
    // For study mode, we might have different validation (e.g., just need topics or keywords)
    // For now, let's use the same validation as quiz mode, but it could be simpler for study.
    if (this.isStudyMode) {
      // Example: In study mode, just need some topics or keywords if not all questions
      if (this.selectAllTopics) return true; // Can study all questions
      if (this.useDetailedTopicCounts && this.topicCounts.length > 0 && this.topicCounts.some(tc => tc.count > 0)) return true; // Or selected topics for detailed count
      if (!this.useDetailedTopicCounts && this.selectedTopicsForDisplay.length > 0) return true; // Or simple topic selection
      if (this.keywordsInput.trim() !== '') return true; // Or just keywords
      return false; // Fallback if no criteria for study mode
    }

    // Original quiz mode validation
    if (this.useDetailedTopicCounts) {
      return this.topicCounts.length > 0 && this.topicCounts.every(tc => tc.count > 0) && this.selectedNumQuestions > 0;
    } else {
      return this.selectedNumQuestions > 0;
    }
  }

  startQuiz(): void {
    if (!this.canStartQuiz()) {
      console.warn('Cannot start: Invalid selections for the chosen mode.');
      return;
    }

    const keywords = this.keywordsInput.split(/[\s,]+/).map(kw => kw.trim()).filter(kw => kw.length > 0);
    let quizSettings: Partial<QuizSettings> = {}; // Use Partial as some fields are mode-dependent

    let navigateToPath = '/quiz/take'; // Default path
    if (this.isStudyMode) {
      navigateToPath = '/quiz/study'; // NEW: Path for study mode
      // For study mode, numQuestions might be less relevant or mean "show all matching"
      // Let's assume for study mode, we fetch based on topics/keywords and show all matches
      // Or, respect numQuestions if set, as a "study first N questions"
      quizSettings.numQuestions = this.selectAllTopics ? 9999 : (this.selectedNumQuestions || 9999); // Large number to signify "all matching" or respect selection
      quizSettings.selectedTopics = this.selectAllTopics ? [] : [...this.selectedTopicsForDisplay];
      // topicDistribution is not typically used for study mode fetching all by topic/keyword
      // but could be if "study N from topic X, M from topic Y" is desired. For now, simplify.
    } else {
      // Quiz Mode (existing logic)
      let timerDurationSeconds: number | undefined = undefined;
      if (this.enableTimerInput) {
        timerDurationSeconds = (this.timerHoursInput * 3600) + (this.timerMinutesInput * 60) + this.timerSecondsInput;
        if (timerDurationSeconds <= 0) {
          // Alert user or handle invalid timer duration
          alert("Timer duration must be greater than 0 seconds.");
          return;
        }
      }

      if (this.useDetailedTopicCounts && this.topicCounts.length > 0) {
        quizSettings = {
          numQuestions: this.topicCounts.reduce((sum, tc) => sum + tc.count, 0),
          selectedTopics: [],
          topicDistribution: [...this.topicCounts],
          enableTimer: this.enableTimerInput,
          timerDurationSeconds: timerDurationSeconds
        };
      } else {
        quizSettings = {
          numQuestions: this.selectedNumQuestions,
          selectedTopics: [], // Empty means all if selectAllTopics is true
          enableTimer: this.enableTimerInput,
          timerDurationSeconds: timerDurationSeconds
        };
      }
    }
    quizSettings.keywords = keywords; // Add keywords to both modes

    console.log(`Starting ${this.isStudyMode ? 'study session' : 'quiz'} with settings:`, quizSettings);

    this.router.navigate([navigateToPath], { // Use dynamic path
      queryParams: {
        numQuestions: quizSettings.numQuestions, // Could be very large for "all" in study mode
        topics: quizSettings.selectedTopics?.join(','),
        keywords: keywords.join(','),
        // For quiz mode, pass other relevant params
        topicDistribution: !this.isStudyMode && quizSettings.topicDistribution ? JSON.stringify(quizSettings.topicDistribution) : '',
        enableTimer: !this.isStudyMode && quizSettings.enableTimer || false,
        timerDuration: !this.isStudyMode && quizSettings.timerDurationSeconds || 0
        // No need to pass 'isStudyMode' as the route itself determines it.
      }
    });
  }

  async exportQuestionsToPDF(includeAnswers: boolean = false): Promise<void> {
    if (!this.canStartQuiz()) { // Use similar validation as starting a quiz/study session
      alert('Please configure your question set first (e.g., select topics or number of questions).');
      return;
    }
    this.isExportingPDF = true;

    // 1. Determine questions to fetch based on current settings
    // This logic is similar to what's in startQuiz() for determining quizSettings
    const keywords = this.keywordsInput.split(/[\s,]+/).map(kw => kw.trim()).filter(kw => kw.length > 0);
    let questionsToFetch: Question[] = [];
    let numQuestionsForFetch: number;
    let topicsForFetch: string[] | undefined;
    let topicDistributionForFetch: TopicCount[] | undefined;

    if (this.useDetailedTopicCounts && this.topicCounts.length > 0 && !this.isStudyMode) {
      numQuestionsForFetch = this.topicCounts.reduce((sum, tc) => sum + tc.count, 0);
      topicDistributionForFetch = [...this.topicCounts];
      topicsForFetch = []; // Not primary in this mode for fetching
    } else {
      numQuestionsForFetch = this.selectedNumQuestions;
      topicsForFetch = this.selectAllTopics ? [] : [...this.selectedTopicsForDisplay];
      topicDistributionForFetch = undefined;
    }
    // For study mode or "all" in quiz mode, numQuestionsForFetch might be very high
    if (this.isStudyMode && this.selectAllTopics) numQuestionsForFetch = 9999;


    try {
      console.log('[QuizSetup] Fetching questions for PDF export with settings:',
        { numQuestionsForFetch, topicsForFetch, keywords, topicDistributionForFetch });

      questionsToFetch = await this.dbService.getRandomQuestions(
        numQuestionsForFetch,
        topicsForFetch,
        keywords,
        topicDistributionForFetch
      );

      if (questionsToFetch.length === 0) {
        alert('No questions found matching your criteria to export.');
        this.isExportingPDF = false;
        return;
      }

      // 2. Generate PDF
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;
      const lineHeight = 6; // Slightly smaller line height for questions
      const answerLineHeight = 5;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      const checkYPos = (neededHeight: number = lineHeight * 3) => {
        if (yPos + neededHeight > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }
      };

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Quiz Questions', pageWidth / 2, yPos, { align: 'center' });
      yPos += lineHeight * 2;
      if (includeAnswers) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('(Includes Answers)', pageWidth / 2, yPos, { align: 'center' });
        yPos += lineHeight * 1.5;
      }


      questionsToFetch.forEach((question, index) => {
        checkYPos(lineHeight * (2 + question.options.length + (includeAnswers && question.explanation ? 3 : 0) + (includeAnswers ? 1 : 0)));

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${question.text}`, margin, yPos, { maxWidth: contentWidth });
        const qTextHeight = doc.getTextDimensions(`${index + 1}. ${question.text}`, { maxWidth: contentWidth, fontSize: 12 }).h;
        yPos += qTextHeight + lineHeight * 0.5;


        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        question.options.forEach((option, optIndex) => {
          checkYPos(answerLineHeight);
          let optionPrefix = `${String.fromCharCode(65 + optIndex)}. `;
          if (includeAnswers && optIndex === question.correctAnswerIndex) {
            doc.setFont('helvetica', 'bold'); // Bold the correct answer text
            optionPrefix = `* ${optionPrefix}`; // Mark correct answer
          }
          doc.text(optionPrefix + option, margin + 7, yPos, { maxWidth: contentWidth - 7 });
          if (includeAnswers && optIndex === question.correctAnswerIndex) {
            doc.setFont('helvetica', 'normal'); // Reset font
          }
          yPos += answerLineHeight;
        });

        if (includeAnswers && question.explanation) {
          checkYPos(lineHeight * 2);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9);
          doc.text(`Explanation: ${question.explanation}`, margin + 7, yPos, { maxWidth: contentWidth - 7 });
          const explHeight = doc.getTextDimensions(`Explanation: ${question.explanation}`, { maxWidth: contentWidth - 7, fontSize: 9 }).h;
          yPos += explHeight + lineHeight * 0.5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
        }
        yPos += lineHeight; // Space between questions
      });

      // Page Numbers
      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 10, pageHeight - 10);
      }

      const filename = `quiz-questions-${includeAnswers ? 'with-answers' : 'no-answers'}-${new DatePipe('en-US').transform(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(filename);

    } catch (error) {
      console.error("Error exporting questions to PDF:", error);
      alert("Failed to export questions to PDF. Please try again.");
    } finally {
      this.isExportingPDF = false;
    }
  }
}