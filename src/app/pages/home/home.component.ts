// src/app/pages/home/home.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt, QuizSettings } from '../../models/quiz.model';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faSun, faMoon, faAdjust, faHome, IconDefinition, faAdd, faHistory, faBarChart, faMagnifyingGlass, faStar, faRepeat, faExclamation, faUndo, faPlay, faQuestion } from '@fortawesome/free-solid-svg-icons'; // Added faUndo
import { SimpleModalComponent } from '../../shared/simple-modal/simple-modal.component';
import { SetupModalComponent } from '../../features/quiz/quiz-taking/setup-modal/setup-modal.component';
import { GenericData } from '../../models/statistics.model';
import { AlertService } from '../../services/alert.service';
import { SoundService } from '../../core/services/sound.service';
import { Question } from '../../models/question.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  providers: [DatePipe],
  standalone: true,
  imports: [CommonModule, RouterLink, SimpleModalComponent,
    SetupModalComponent, FontAwesomeModule, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private soundService = inject(SoundService);
  private datePipe = inject(DatePipe); // Inject DatePipe

  isMusicPlaying: boolean = false;
  isQuizSetupModalOpen = false;
  quizSetupModalTitle = 'QUIZ';
  topics: GenericData[] = [];

  isLoadingModal = false;
  loadingButtonIndex = -1;

  selectedXDayDate: string | null = null; // Store selected date as string or Date


  // icons
  faAdd: IconDefinition = faAdd;
  faHistory: IconDefinition = faHistory;
  faBarChart: IconDefinition = faBarChart;
  faMagnifyingGlass: IconDefinition = faMagnifyingGlass;
  faStar: IconDefinition = faStar;
  faRepeat: IconDefinition = faRepeat;
  faExclamation: IconDefinition = faExclamation;
  faPlay: IconDefinition = faPlay;
  faQuestion: IconDefinition = faQuestion;
  faUndoAlt: IconDefinition = faUndo; // Icon for yesterday's review

  pausedQuiz: QuizAttempt | undefined;
  xDayProblematicQuestionIds: string[] = []; // Store IDs
  yesterdayProblematicQuestionIds: string[] = []; // Store IDs
  todayProblematicQuestionIds: string[] = []; // Store IDs
  neverEncounteredQuestionIds: string[] = []; // NEW: Store IDs for never encountered

  ngOnInit(): void {
    this.checkForPausedQuiz();
    this.loadYesterdayProblematicQuestions(); // Load on init
    this.loadTodayProblematicQuestions(); // Load on init
    this.loadNeverEncounteredQuestionIds(); // NEW: Load on init

    // Set a default date for the X-Day input (e.g., today)
    this.selectedXDayDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
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
    this.yesterdayProblematicQuestionIds = await this.dbService.getProblematicQuestionsIdsBtDate('yesterday');
    // console.log('Yesterday problematic IDs:', this.yesterdayProblematicQuestionIds);
  }

  async loadTodayProblematicQuestions(): Promise<void> { // Renamed for clarity
    this.todayProblematicQuestionIds = await this.dbService.getProblematicQuestionsIdsBtDate('today');
    // console.log('Yesterday problematic IDs:', this.todayProblematicQuestionIds);
  }

  async loadNeverEncounteredQuestionIds(): Promise<void> {
    this.neverEncounteredQuestionIds = await this.dbService.getNeverAnsweredQuestionIds(); // Assuming this method exists
  }



  async startXDayProblematicQuiz(dateString: string | null): Promise<void> {
    if (!dateString) {
      this.alertService.showAlert("Attenzione", "Per favore, seleziona una data.");
      return;
    }
    const selectedDate = new Date(dateString); // The input value is "YYYY-MM-DD"
    // Adjust for timezone to ensure the date is interpreted as local midnight
    selectedDate.setMinutes(selectedDate.getMinutes() + selectedDate.getTimezoneOffset());


    this.loadingButtonIndex = 3; // For X-Day button
    this.isLoadingModal = true;
    let questionsForModal: Question[] = [];
    try {
      questionsForModal = await this.dbService.getXDayProblematicQuestion(selectedDate);
    } catch (error) {
      console.error("Error fetching X-Day problematic questions:", error);
      this.alertService.showAlert("Errore", "Impossibile recuperare le domande per la data selezionata.");
      return;
    } finally {
      this.isLoadingModal = false;
      this.loadingButtonIndex = -1;
    }

    if (questionsForModal.length > 0) {
      const formattedDate = this.datePipe.transform(selectedDate, 'dd/MM/yyyy') || dateString;

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

      this.quizSetupModalTitle = 'Rivedi Errori del ' + formattedDate;
      console.log(questionsForModal)
      this.openQuizSetupModal();

    } else {
      const formattedDate = this.datePipe.transform(selectedDate, 'dd/MM/yyyy') || dateString;
      this.alertService.showAlert("Info", `Nessuna domanda problematica trovata per il ${formattedDate}.`);
    }
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
      this.alertService.showAlert("Info", "Nessuna domanda problematica trovata per IERI. Ottimo lavoro!");
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
      this.alertService.showAlert("Info", "Nessuna domanda problematica trovata per OGGI. Ottimo lavoro!");
    }
  }

  async startNeverEncounteredQuiz(): Promise<void> {
    if (this.neverEncounteredQuestionIds.length > 0) {
      this.isLoadingModal = true;
      // Fetch the full question objects for the modal (to display topics and counts)
      const questionsForModal = await this.dbService.getQuestionByIds(this.neverEncounteredQuestionIds); // Assuming this method exists

      const topicsMap = new Map<string, { count: number, questionIds: string[] }>();
      questionsForModal.forEach(q => {
        const topic = q.topic || 'Senza Argomento';
        if (!topicsMap.has(topic)) {
          topicsMap.set(topic, { count: 0, questionIds: [] });
        }
        const topicData = topicsMap.get(topic)!;
        topicData.count++;
        topicData.questionIds.push(q.id); // Store ID
      });

      this.topics = Array.from(topicsMap.entries()).map(([topicName, data]) => ({
        topic: topicName,
        count: data.count,
        questionIds: data.questionIds // Pass the specific IDs for this topic
      }));

      this.quizSetupModalTitle = 'Domande Mai Viste';
      this.openQuizSetupModal();
    } else {
      this.alertService.showAlert("Info", "Congratulazioni! Hai risposto a tutte le domande disponibili almeno una volta.");
    }
    this.isLoadingModal = false;
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

  previousTrackIndex: number | null = null;

  startMusic(index: number): void {
    // index = 0 : Lazio, index = 1 : Roma
    const tracks = ['lazio', 'roma'];
    if (index < 0 || index >= tracks.length) return;

    // If music is playing and a different track is selected, switch tracks
    if (this.isMusicPlaying) {
      if (this.previousTrackIndex !== index) {
        this.soundService.play(tracks[index]);
        this.previousTrackIndex = index;
        return;
      } else {
        // Same track: stop music
        this.soundService.setSoundsEnabled(false);
        this.isMusicPlaying = false;
        this.previousTrackIndex = null;
        return;
      }
    }

    // Start music
    this.soundService.setSoundsEnabled(true);
    this.soundService.play(tracks[index]);
    this.isMusicPlaying = true;
    this.previousTrackIndex = index;
  }
}