import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { QuizSettings } from '../../../../models/quiz.model';
import { GenericData } from '../../../../models/statistics.model';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faPersonMilitaryRifle, faCancel, faTrashCan, faEraser } from '@fortawesome/free-solid-svg-icons';

@Component({
  selector: 'app-setup-modal', // Changed selector to avoid confusion
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FontAwesomeModule],
  templateUrl: './setup-modal.component.html', // New template name
  styleUrls: ['./setup-modal.component.scss'] // New style name
})
export class SetupModalComponent implements OnInit {
  private router = inject(Router);

  @Input() topics: GenericData[] = []; // Placeholder for topic counts if needed
  clonedTopics: GenericData[] = []; // Placeholder for topic counts if needed
  @Input() modalTitle: string = "Dettagli domanda non disponibili."; // To display for context
  @Input() contestName: string = '';
  @Output() submitFeedback = new EventEmitter<any>();
  @Output() cancelFeedback = new EventEmitter<void>();

  // icons
  military: IconDefinition = faPersonMilitaryRifle;
  faCancel: IconDefinition = faCancel;
  faTrashBin: IconDefinition = faTrashCan;
  faEraser: IconDefinition = faEraser;

  setupQuizForm: FormGroup;
  isLoading = false;
  submitError: string | null = null;
  submitSuccess: string | null = null;

  useDetailedTopicCounts = true; // NEW: To switch between simple and detailed mode
  selectedNumQuestions: number = 0; // Default, will be overridden
  selectAllTopics = true; // NEW: To select all topics

  constructor(private fb: FormBuilder) {
    this.setupQuizForm = this.fb.group({
      isMarkedIncorrect: [false],
      reasonText: [''],
      suggestedCorrectionText: ['']
    });
  }

  ngOnInit(): void {
    this.selectedNumQuestions = this.topics.reduce((sum, tc) => sum + Number(tc.count || 0), 0);
    this.clonedTopics = this.topics.map(tc => ({ ...tc })); // Clone the topics for internal use
  }

  onInternalSubmit(): void {
    let quizSettings: Partial<QuizSettings> = {}; // Use Partial as some fields are mode-dependent

    let navigateToPath = '/quiz/take'; // Default path
    if (this.useDetailedTopicCounts && this.clonedTopics.length > 0) {
      quizSettings = {
        numQuestions: this.clonedTopics.reduce((sum, tc) => sum + tc.count, 0),
        selectedTopics: [],
        topicDistribution: this.clonedTopics.map(tc => ({
          topic: tc.topic,
          count: tc.count
        })),
        enableTimer: false,
        timerDurationSeconds: 0,
        publicContest: this.contestName
      };
    } else {
      quizSettings = {
        numQuestions: this.selectedNumQuestions,
        selectedTopics: [], // Empty means all if selectAllTopics is true
        enableTimer: false,
        timerDurationSeconds: 0,
        publicContest: this.contestName
      };
    }
    quizSettings.keywords = []; // Add keywords to both modes

    console.log(`Starting quiz with settings:`, quizSettings);

    const fixedQuestionIds: string[] = this.clonedTopics
      .filter(_topic => _topic.count > 0)
      .map(q => q.questionIds)
      .flat()
      .slice(0, quizSettings.numQuestions ?? 0);

    const
      queryParams = {
        numQuestions: quizSettings.numQuestions, // Could be very large for "all" in study mode
        topics: quizSettings.selectedTopics?.join(','),
        keywords: quizSettings.keywords.join(','),
        // For quiz mode, pass other relevant params
        topicDistribution: quizSettings.topicDistribution ? JSON.stringify(quizSettings.topicDistribution) : '',
        enableTimer: false,
        timerDuration: 0,
        // get specific question id
        fixedQuestionIds: fixedQuestionIds,
        publicContest: this.contestName
      };

    console.log(`Navigating to ${navigateToPath} with queryParams:`, queryParams);
    this.router.navigate([navigateToPath], { state: { quizParams: queryParams } });
  }

  onInternalCancel(): void {
    this.cancelFeedback.emit();
  }

  // Call this when individual topic counts change or when mode changes
  calculateTotalQuestionsFromTopicCounts($event: any, topic: GenericData): void {
    if (this.useDetailedTopicCounts && this.clonedTopics.length > 0) {
      const newCount = $event?.target?.value ? Number($event.target.value) : topic.count;
      const currentTopic = this.clonedTopics.find(tc => tc.topic === topic.topic);
      const originalTopic = this.topics.find(tc => tc.topic === topic.topic);

      if (currentTopic && originalTopic) {
        if (newCount > originalTopic.count) {
          console.error('Cannot increase count beyond original topic count');
          currentTopic.count = originalTopic.count;
          currentTopic.isMaxReached = true;
        } else {
          currentTopic.count = Math.max(0, newCount); // Ensure no negative counts
          currentTopic.isMaxReached = false;
        }

        // Recalculate the total number of questions
        this.selectedNumQuestions = this.clonedTopics.reduce((sum, tc) => sum + Number(tc.count || 0), 0);
      }
    } else if (this.selectAllTopics) {
      // Reset or retain the total number of questions for "All Topics" mode
      this.selectedNumQuestions = this.topics.reduce((sum, tc) => sum + Number(tc.count || 0), 0);
    }
  }


  // Add the decreaseCount method
  decreaseCount(topic: GenericData): void {
    if (topic.count > 1) {
      topic.count--;
      topic.isMaxReached = false; // Reset the flag
      this.calculateTotalQuestionsFromTopicCounts(null, topic);
    }
  }

  // Add the decreaseCount method
  increaseCount(topic: GenericData): void {
    const currentOriginalTopic = this.topics.find(tc => tc.topic === topic.topic);

    if (currentOriginalTopic && topic.count < currentOriginalTopic.count && topic.count > -1) {
      topic.count++;
      this.calculateTotalQuestionsFromTopicCounts(null, topic);
    } else {
      console.error('Cannot increase count beyond original topic count or below 0');
      topic.isMaxReached = true; // Set the flag to indicate max reached
    }
  }

  getMaxCountOfTopic(topic: GenericData): number {
    const currentOriginalTopic = this.topics.find(tc => tc.topic === topic.topic);
    return currentOriginalTopic ? currentOriginalTopic.count : 0;
  }

  resetCount(topic: GenericData | undefined = undefined): void {
    if (!topic) {
      this.clonedTopics.forEach(_topic => { _topic.count = 0; });
      this.selectedNumQuestions = 0;
    }
    // reset count of the corresponding topic
    const originalTopic = this.topics.find(_topic => _topic.topic === topic?.topic);
    const clonedTopic = this.clonedTopics.find(_topic => _topic.topic === topic?.topic);
    if (originalTopic && clonedTopic) {
      clonedTopic.count = 0;
      // Recalculate the total number of questions
      this.selectedNumQuestions = this.clonedTopics.filter(_topic => _topic.topic !== topic?.topic).reduce((sum, tc) => sum + Number(tc.count || 0), 0);
    }
  }

}
