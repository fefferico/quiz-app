import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { QuizSettings, TopicCount } from '../../../../models/quiz.model';
import { GenericData } from '../../../../models/statistics.model';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-setup-modal', // Changed selector to avoid confusion
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './setup-modal.component.html', // New template name
  styleUrls: ['./setup-modal.component.scss'] // New style name
})
export class QuestionFeedbackContentComponent implements OnInit {
  private router = inject(Router);

  @Input() topics: GenericData[] = []; // Placeholder for topic counts if needed
  clonedTopics: GenericData[] = []; // Placeholder for topic counts if needed
  @Input() modalTitle: string = "Dettagli domanda non disponibili."; // To display for context
  @Output() submitFeedback = new EventEmitter<any>();
  @Output() cancelFeedback = new EventEmitter<void>();

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
        timerDurationSeconds: 0
      };
    } else {
      quizSettings = {
        numQuestions: this.selectedNumQuestions,
        selectedTopics: [], // Empty means all if selectAllTopics is true
        enableTimer: false,
        timerDurationSeconds: 0
      };
    }
    quizSettings.keywords = []; // Add keywords to both modes

    console.log(`Starting quiz with settings:`, quizSettings);

    const fixedQuestionIds: string[] = this.clonedTopics.filter(_topic => _topic.count > 0) ? this.clonedTopics.filter(_topic => _topic.count > 0)[0].questionIds : [];

    this.router.navigate([navigateToPath], { // Use dynamic path
      queryParams: {
        numQuestions: quizSettings.numQuestions, // Could be very large for "all" in study mode
        topics: quizSettings.selectedTopics?.join(','),
        keywords: quizSettings.keywords.join(','),
        // For quiz mode, pass other relevant params
        topicDistribution: quizSettings.topicDistribution ? JSON.stringify(quizSettings.topicDistribution) : '',
        enableTimer: false,
        timerDuration: 0,
        // get specific question id
        fixedQuestionIds: fixedQuestionIds
      }
    });
  }

  onInternalCancel(): void {
    this.cancelFeedback.emit();
  }

  // Call this when individual topic counts change or when mode changes
  calculateTotalQuestionsFromTopicCounts($event: any, topic: GenericData): void {
    if (this.useDetailedTopicCounts && this.clonedTopics.length > 0) {
      let newCount = 0;
      if ($event?.target?.value) {
        newCount = Number($event.target.value);
      } else {
        newCount = topic.count;
      }
      const currentTopic = this.clonedTopics.find(tc => tc.topic === topic.topic);
      const currentOriginalTopic = this.topics.find(tc => tc.topic === topic.topic);

      if (currentTopic && currentOriginalTopic) {
        currentTopic.isMaxReached = newCount >= currentOriginalTopic.count; // Set the flag if max reached
        // set new count considering the one just changed
        if (currentTopic.isMaxReached) {
          newCount = currentOriginalTopic.count;
          currentTopic.count = newCount;
          console.error('Cannot increase count beyond original topic count');
          // Update the count for the current topic
          this.clonedTopics
          .filter(tc => tc.topic === topic.topic)
          .forEach(tc => {
            tc.count = newCount; // Ensure no negative counts
          });
        }
        

        // Calculate the total number of questions based on the updated topic counts
        this.selectedNumQuestions = this.clonedTopics.filter(_topic => _topic.topic !== topic.topic).reduce((sum, tc) => sum + Number(tc.count || 0), 0) + newCount;
      }
    } else if (this.selectAllTopics) {
      // Keep the last selectedNumQuestions or a default if "All Topics" is re-selected
      // For simplicity, let's reset to a default or retain.
      // If you want to retain, you'd need to store the "global" selectedNumQuestions separately.
      // For now, let's assume the numQuestionsOptions dropdown is the master for "All Topics" mode.
      // This means this.selectedNumQuestions is already set from that dropdown.
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

}