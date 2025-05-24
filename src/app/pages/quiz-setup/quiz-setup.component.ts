// src/app/pages/quiz-setup/quiz-setup.component.ts
import { Component, OnInit, inject, DoCheck } from '@angular/core'; // Added Input for potential direct ID passing
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router'; // Added ActivatedRoute
import { FormsModule } from '@angular/forms';

import { DatabaseService } from '../../core/services/database.service';
import { QuizSettings, TopicCount } from '../../models/quiz.model';
import { Question } from '../../models/question.model';
import jsPDF from 'jspdf';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome, faPersonMilitaryRifle, faChevronDown, faChevronUp, faGears, faBook, faCancel } from '@fortawesome/free-solid-svg-icons';
import { AlertService } from '../../services/alert.service';
import { Subscription } from 'rxjs';
import { ContestSelectionService } from '../../core/services/contest-selection.service';
import { Contest } from '../../models/contes.model';

@Component({
  selector: 'app-quiz-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FontAwesomeModule],
  templateUrl: './quiz-setup.component.html',
  styleUrls: ['./quiz-setup.component.scss']
})
export class QuizSetupComponent implements OnInit, DoCheck {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private activatedRoute = inject(ActivatedRoute); // Inject ActivatedRoute
  private routeSub!: Subscription;
  accordionState = new Map<string, boolean>(); // Map: topicName -> isOpen
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service

  isExportingPDF = false;

  homeIcon: IconDefinition = faHome;
  military: IconDefinition = faPersonMilitaryRifle;
  faChevronDown: IconDefinition = faChevronDown; // For accordion closed
  faChevronUp: IconDefinition = faChevronUp;     // For accordion open
  faGears: IconDefinition = faGears;
  faBook: IconDefinition = faBook;
  faCancel: IconDefinition = faCancel;

  enableTimerInput = false;
  enableCronometerInput = false;
  timerHoursInput = 0;
  timerMinutesInput = 10;
  timerSecondsInput = 0;

  enableStreakSoundsInput = false; // Default to true, user can disable

  availableTopics: string[] = [];
  selectedTopicsForDisplay: string[] = [];
  topicCounts: TopicCount[] = [];

  numQuestionsOptions = [1, 2, 3, 4, 5, 10, 20, 30, 50, 75, 100, 200, 500, 1000]; // Added smaller numbers
  selectedNumQuestions: number = 100;

  selectAllTopics = true;
  randomQuestions = false;
  hideCorrectAnswer = false;
  useDetailedTopicCounts = false;

  keywordsInput = '';
  isStudyMode = false;

  // --- NEW: For fixed question IDs ---
  fixedQuestionIdsInput: string = ''; // For manual input in setup (optional UI)
  preloadedFixedQuestionIds: string[] = []; // To store IDs passed via route params
  // --- END NEW ---

  private previousSelectedTopicsLength = 0;
  private previousUseDetailedTopicCounts = false;

  // Getter to easily access the contest from the template
  get selectedPublicContest(): Contest | null {
    return this.contestSelectionService.getCurrentSelectedContest();
  }

  ngOnInit(): void {

    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Info", "Non è stata selezionata alcuna Banca Dati: si verrà ora rediretti alla pagina principale").then(() => {
        this.router.navigate(['/home']);
      })
    }

    this.accordionState.clear();
    this.accordionState.set("main", false); // Open the first group by default

    this.loadTopics();
    // Check for fixedQuestionIds from route parameters
    this.routeSub = this.activatedRoute.queryParams.subscribe(params => {
      const ids = params['fixedQuestionIds'];
      if (ids) {
        this.preloadedFixedQuestionIds = ids.split(',').map((id: string) => id.trim()).filter((id: string) => id);
        if (this.preloadedFixedQuestionIds.length > 0) {
          // If fixed IDs are present, potentially disable other controls
          // and set totalQuestionsInQuiz to the count of fixed IDs.
          this.selectedNumQuestions = this.preloadedFixedQuestionIds.length;
          this.selectAllTopics = false; // Or some other logic to indicate fixed mode
          this.useDetailedTopicCounts = false;
          this.topicCounts = [];
          this.selectedTopicsForDisplay = []; // Clear topic selections
          // You might want to add a visual indicator that the quiz is using fixed questions
          console.log('Quiz setup preloaded with fixed question IDs:', this.preloadedFixedQuestionIds);
        }
      }
    });
    this.updateSelectionMode();
  }

  ngDoCheck(): void {
    if (this.preloadedFixedQuestionIds.length > 0) {
      // If fixed IDs are active, bypass some of the usual ngDoCheck logic
      // or ensure it doesn't interfere with the fixed ID setup.
      // For example, we might not want topicCounts to auto-populate.
      return;
    }

    if (this.useDetailedTopicCounts && this.selectedTopicsForDisplay.length !== this.previousSelectedTopicsLength) {
      this.initializeOrUpdateTopicCounts();
      this.previousSelectedTopicsLength = this.selectedTopicsForDisplay.length;
    }
    if (this.useDetailedTopicCounts !== this.previousUseDetailedTopicCounts) {
      this.initializeOrUpdateTopicCounts();
      this.previousUseDetailedTopicCounts = this.useDetailedTopicCounts;
    }
  }


  async loadTopics(): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }


    try {
      const questions = await this.dbService.getAllQuestions(currentContest.id);
      const topics = new Set(questions.map(q => q.topic || 'Uncategorized')); // Ensure topic is string
      this.availableTopics = Array.from(topics).sort();
      if (this.preloadedFixedQuestionIds.length === 0) { // Only update if not in fixed ID mode
        this.updateSelectionMode();
      }
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  }

  updateSelectionMode(): void {
    if (this.preloadedFixedQuestionIds.length > 0) {
      // When fixed IDs are present, override normal selection mode logic
      this.selectAllTopics = false;
      this.useDetailedTopicCounts = false;
      this.topicCounts = [];
      this.selectedTopicsForDisplay = []; // Or display topics of fixed questions
      this.selectedNumQuestions = this.preloadedFixedQuestionIds.length;
      return;
    }

    if (this.selectAllTopics) {
      this.useDetailedTopicCounts = false;
      this.selectedTopicsForDisplay = [...this.availableTopics];
      this.topicCounts = [];
    } else {
      this.useDetailedTopicCounts = true;
      this.initializeOrUpdateTopicCounts();
    }
    this.calculateTotalQuestionsFromTopicCounts();
  }

  toggleTopicCheckbox(topic: string): void {
    if (this.preloadedFixedQuestionIds.length > 0) return; // Disable if fixed IDs

    const index = this.selectedTopicsForDisplay.indexOf(topic);
    if (index > -1) {
      this.selectedTopicsForDisplay.splice(index, 1);
    } else {
      this.selectedTopicsForDisplay.push(topic);
    }
    this.updateSelectAllCheckboxState();
  }

  onSelectAllTopicsChange(): void {
    if (this.preloadedFixedQuestionIds.length > 0) { // If fixed IDs, re-check based on new state
      this.selectAllTopics = !this.selectAllTopics; // Allow unchecking to clear fixed IDs mode perhaps?
      // This interaction needs careful thought.
      // For now, let's assume unchecking "All Topics" when fixed IDs are present
      // might revert to normal mode, clearing fixed IDs.
      if (!this.selectAllTopics) {
        // User unselected "All Topics", potentially exiting fixed ID mode if it was set because of that
      } else {
        // User selected "All Topics". If fixed IDs were present, what happens?
        // Option: Clear fixed IDs and go to normal "All Topics" mode.
        // this.preloadedFixedQuestionIds = [];
      }
    }
    this.updateSelectionMode();
  }

  initializeOrUpdateTopicCounts(): void {
    if (this.preloadedFixedQuestionIds.length > 0) {
      this.topicCounts = []; // No detailed topic counts if fixed IDs are used
      this.calculateTotalQuestionsFromTopicCounts();
      return;
    }
    if (!this.useDetailedTopicCounts || this.selectAllTopics) {
      this.topicCounts = [];
      this.calculateTotalQuestionsFromTopicCounts();
      return;
    }

    const newTopicCounts: TopicCount[] = [];
    const currentTotalFromDropdown = this.selectedNumQuestions;
    const numSelectedDisplayTopics = this.selectedTopicsForDisplay.length;
    const defaultCountPerNewTopic = numSelectedDisplayTopics > 0
      ? Math.max(1, Math.floor(currentTotalFromDropdown / numSelectedDisplayTopics))
      : 1;

    for (const topic of this.selectedTopicsForDisplay) {
      const existingTcObject = this.topicCounts.find(tc => tc.topic === topic);
      if (existingTcObject) {
        newTopicCounts.push(existingTcObject);
      } else {
        newTopicCounts.push({ topic: topic, count: defaultCountPerNewTopic });
      }
    }
    this.topicCounts = newTopicCounts;
    this.calculateTotalQuestionsFromTopicCounts();
  }

  calculateTotalQuestionsFromTopicCounts(): void {
    if (this.preloadedFixedQuestionIds.length > 0) {
      this.selectedNumQuestions = this.preloadedFixedQuestionIds.length;
      return;
    }
    if (this.useDetailedTopicCounts && this.topicCounts.length > 0) {
      this.selectedNumQuestions = this.topicCounts.reduce((sum, tc) => sum + Number(tc.count || 0), 0);
    }
    // If !useDetailedTopicCounts, selectedNumQuestions is bound to the dropdown directly.
  }

  updateSelectAllCheckboxState(): void {
    if (this.preloadedFixedQuestionIds.length > 0) return;

    if (this.availableTopics.length > 0 && this.selectedTopicsForDisplay.length === this.availableTopics.length) {
      this.selectAllTopics = true;
      this.useDetailedTopicCounts = false;
      this.topicCounts = [];
    } else {
      this.selectAllTopics = false;
      this.useDetailedTopicCounts = true;
    }
    this.calculateTotalQuestionsFromTopicCounts();
  }

  isTopicSelectedForDisplay(topic: string): boolean {
    return this.selectedTopicsForDisplay.includes(topic);
  }

  isDisplayable(topic: string): boolean { // This seems unused, review if needed
    return this.isTopicSelectedForDisplay(topic) && !!this.topicCounts.find(tc => tc.topic === topic)
  }

  canStartQuiz(): boolean {
    if (this.preloadedFixedQuestionIds.length > 0 && !this.isStudyMode) { // If fixed IDs and not study mode, number of questions is fixed
      return this.preloadedFixedQuestionIds.length > 0;
    }
    if (this.isStudyMode) {
      if (this.preloadedFixedQuestionIds.length > 0) return true; // Study specific questions
      if (this.selectAllTopics) return true;
      if (this.useDetailedTopicCounts && this.topicCounts.length > 0 && this.topicCounts.some(tc => tc.count > 0)) return true;
      if (!this.useDetailedTopicCounts && this.selectedTopicsForDisplay.length > 0) return true;
      if (this.keywordsInput.trim() !== '') return true;
      return false;
    }

    if (this.useDetailedTopicCounts) {
      return this.topicCounts.length > 0 && this.topicCounts.some(tc => tc.count > 0) && this.selectedNumQuestions > 0;
    } else {
      return this.selectedNumQuestions > 0;
    }
  }

  startQuiz(): void {
    if (!this.canStartQuiz()) {
      this.alertService.showAlert('Configurazione Incompleta', 'Per favore, seleziona un numero di domande valido o dei criteri per la modalità studio.');
      return;
    }

    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }


    const keywords = this.keywordsInput.split(/[\s,]+/).map(kw => kw.trim()).filter(kw => kw.length > 0);
    let quizSettings: Partial<QuizSettings> = {};
    let queryParams: any = {};

    const navigateToPath = this.isStudyMode ? '/quiz/study' : '/quiz/take';

    // --- Handle Fixed Question IDs ---
    const effectiveFixedQuestionIds = this.preloadedFixedQuestionIds.length > 0
      ? this.preloadedFixedQuestionIds
      : this.fixedQuestionIdsInput.split(',').map(id => id.trim()).filter(id => id);

    queryParams.publicContest = currentContest.id;
    queryParams.hideCorrectAnswer = this.hideCorrectAnswer;

    if (effectiveFixedQuestionIds.length > 0) {
      queryParams.fixedQuestionIds = effectiveFixedQuestionIds.join(',');
      // Number of questions is implicitly the count of fixed IDs
      queryParams.totalQuestionsInQuiz = effectiveFixedQuestionIds.length;
      // Other filters like topics, keywords are ignored if fixedQuestionIds are present
      queryParams.topics = '';
      queryParams.keywords = '';
      queryParams.topicDistribution = '';
      if (!this.isStudyMode) { // Timer settings only for quiz mode
        queryParams.enableTimer = this.enableTimerInput;
        queryParams.enableCronometer = this.enableCronometerInput;
        queryParams.enableStreakSounds = this.enableStreakSoundsInput; // Add sound setting

        if (this.enableTimerInput) {
          const timerDurationSeconds = (this.timerHoursInput * 3600) + (this.timerMinutesInput * 60) + this.timerSecondsInput;
          if (timerDurationSeconds <= 0) {
            this.alertService.showAlert("Attenzione", "Il Timer deve avere una durata di almeno 1 secondo");
            return;
          }
          queryParams.timerDurationSeconds = timerDurationSeconds;
        } else {
          queryParams.timerDurationSeconds = 0;
        }
      }
    } else { // --- Normal Quiz Setup Logic ---
      if (this.isStudyMode) {
        queryParams.totalQuestionsInQuiz = this.selectAllTopics ? 9999 : (this.selectedNumQuestions || 9999);
        queryParams.topics = this.selectAllTopics ? '' : this.selectedTopicsForDisplay.join(',');
        queryParams.keywords = keywords.join(',');
        // No timer/cronometer for study mode
        queryParams.enableTimer = false;
        queryParams.enableCronometer = false;
        queryParams.timerDurationSeconds = 0;
        queryParams.enableStreakSounds = false; // Add sound setting
      } else { // Quiz Mode
        let timerDurationSeconds: number | undefined = undefined;
        if (this.enableTimerInput) {
          timerDurationSeconds = (this.timerHoursInput * 3600) + (this.timerMinutesInput * 60) + this.timerSecondsInput;
          if (timerDurationSeconds <= 0) {
            this.alertService.showAlert("Attenzione", "Il Timer deve avere una durata di almeno 1 secondo");
            return;
          }
        }
        queryParams.enableTimer = this.enableTimerInput;
        queryParams.randomQuestions = this.randomQuestions;
        queryParams.enableCronometer = this.enableCronometerInput;
        queryParams.timerDurationSeconds = timerDurationSeconds || 0;
        queryParams.keywords = keywords.join(',');
        queryParams.enableStreakSounds = this.enableStreakSoundsInput; // Add sound setting

        if (this.useDetailedTopicCounts && this.topicCounts.length > 0) {
          queryParams.totalQuestionsInQuiz = this.topicCounts.reduce((sum, tc) => sum + tc.count, 0);
          queryParams.topics = this.selectAllTopics ? '' : this.selectedTopicsForDisplay.join(','); // Still relevant if not all topics selected
          queryParams.topicDistribution = JSON.stringify(this.topicCounts);
        } else {
          queryParams.totalQuestionsInQuiz = this.selectedNumQuestions;
          queryParams.topics = this.selectAllTopics ? '' : this.selectedTopicsForDisplay.join(','); // All selected or specific few
          queryParams.topicDistribution = '';
        }
      }
    }

    // Clean up undefined or empty queryParams
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) {
        delete queryParams[key];
      }
    });

    console.log(`Navigating to ${navigateToPath} with queryParams:`, queryParams);
    this.router.navigate([navigateToPath], { state: { quizParams: queryParams } });
  }

  async exportQuestionsToPDF(includeAnswers: boolean = false): Promise<void> {
    const currentContest = this.contestSelectionService.checkForContest();
    if (currentContest === null) {
      this.router.navigate(['/home']);
      return;
    }

    // This method would also need to respect preloadedFixedQuestionIds if they are set
    const effectiveFixedQuestionIds = this.preloadedFixedQuestionIds.length > 0
      ? this.preloadedFixedQuestionIds
      : this.fixedQuestionIdsInput.split(',').map(id => id.trim()).filter(id => id);

    if (effectiveFixedQuestionIds.length === 0 && !this.canStartQuiz()) {
      this.alertService.showAlert("Attenzione", 'Si prega di configurare prima il set di domande.');
      return;
    }
    this.isExportingPDF = true;

    const keywords = this.keywordsInput.split(/[\s,]+/).map(kw => kw.trim()).filter(kw => kw.length > 0);
    const qstIDs = this.fixedQuestionIdsInput.split(/[\s,]+/).map(kw => kw.trim()).filter(kw => kw.length > 0);
    let questionsToFetch: Question[] = [];

    try {
      if (effectiveFixedQuestionIds.length > 0) {
        questionsToFetch = await this.dbService.getQuestionByIds(effectiveFixedQuestionIds);
      } else {
        let numQuestionsForFetch: number;
        let topicsForFetch: string[] | undefined;
        let topicDistributionForFetch: TopicCount[] | undefined;

        if (this.useDetailedTopicCounts && this.topicCounts.length > 0 && !this.isStudyMode) {
          numQuestionsForFetch = this.topicCounts.reduce((sum, tc) => sum + tc.count, 0);
          topicDistributionForFetch = [...this.topicCounts];
          topicsForFetch = [];
        } else {
          numQuestionsForFetch = this.selectedNumQuestions;
          topicsForFetch = this.selectAllTopics ? [] : [...this.selectedTopicsForDisplay];
          topicDistributionForFetch = undefined;
        }
        if (this.isStudyMode && this.selectAllTopics && !keywords.length) numQuestionsForFetch = 9999;

        questionsToFetch = await this.dbService.getRandomQuestions(currentContest.id,
          numQuestionsForFetch, topicsForFetch, keywords, qstIDs, topicDistributionForFetch
        );
      }

      if (questionsToFetch.length === 0) {
        this.alertService.showAlert("Attenzione", 'Nessuna domanda trovata per l\'esportazione.');
        this.isExportingPDF = false;
        return;
      }

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 20;
      const lineHeight = 6;
      const answerLineHeight = 5;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      const checkYPos = (neededHeight: number = lineHeight * 3) => {
        if (yPos + neededHeight > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }
      };

      doc.setFontSize(16); doc.setFont('helvetica', 'bold');
      doc.text('Domande Quiz', pageWidth / 2, yPos, { align: 'center' });
      yPos += lineHeight * 2;
      if (includeAnswers) {
        doc.setFontSize(10); doc.setFont('helvetica', 'italic');
        doc.text('(Include Risposte)', pageWidth / 2, yPos, { align: 'center' });
        yPos += lineHeight * 1.5;
      }

      questionsToFetch.forEach((question, index) => {
        checkYPos(lineHeight * (2 + question.options.length + (includeAnswers && question.explanation ? 3 : 0) + (includeAnswers ? 1 : 0)));
        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${question.text}`, margin, yPos, { maxWidth: contentWidth });
        const qTextHeight = doc.getTextDimensions(`${index + 1}. ${question.text}`, { maxWidth: contentWidth, fontSize: 12 }).h;
        yPos += qTextHeight + lineHeight * 0.5;

        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        question.options.forEach((option, optIndex) => {
          checkYPos(answerLineHeight);
          let optionPrefix = `${String.fromCharCode(65 + optIndex)}. `;
          if (includeAnswers && optIndex === question.correctAnswerIndex) {
            doc.setFont('helvetica', 'bold'); optionPrefix = `* ${optionPrefix}`;
          }
          doc.text(optionPrefix + option, margin + 7, yPos, { maxWidth: contentWidth - 7 });
          if (includeAnswers && optIndex === question.correctAnswerIndex) doc.setFont('helvetica', 'normal');
          yPos += answerLineHeight;
        });

        if (includeAnswers && question.explanation) {
          checkYPos(lineHeight * 2);
          doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
          doc.text(`Spiegazione: ${question.explanation}`, margin + 7, yPos, { maxWidth: contentWidth - 7 });
          const explHeight = doc.getTextDimensions(`Spiegazione: ${question.explanation}`, { maxWidth: contentWidth - 7, fontSize: 9 }).h;
          yPos += explHeight + lineHeight * 0.5;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        }
        yPos += lineHeight;
      });

      const pageCount = (doc.internal as any).getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(8);
        doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin - 10, pageHeight - 10);
      }
      const filename = `quiz-domande-${includeAnswers ? 'con-risposte' : 'senza-risposte'}-${new DatePipe('en-US').transform(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error("Errore esportazione PDF:", error);
      this.alertService.showAlert("Errore", "Impossibile esportare le domande in PDF.");
    } finally {
      this.isExportingPDF = false;
    }
  }

  toggleAdvancedSettings(topic: string): void {
    const currentState = this.accordionState.get(topic);
    this.accordionState.set(topic, !currentState);
  }

  checkForContest(): Contest | null {
    if (this.selectedPublicContest === null) {
      this.alertService.showAlert("Errore", "Non è stata selezionata alcuna banca dati valida. Si verrà ora rediretti alla pagina principale").then(() => {
        this.router.navigate(['/home']);
      });
      return this.selectedPublicContest;
    }
    return null;
  }

  ngOnDestroy(): void { // Ensure to unsubscribe
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }
}

