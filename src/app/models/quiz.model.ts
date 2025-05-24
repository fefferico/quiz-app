// src/app/models/quiz.model.ts

import { Contest } from './contes.model';
import { Question } from './question.model';

// Settings chosen by the user for a particular quiz session
export interface QuizSettings {
  totalQuestionsInQuiz: number;
  selectedTopics: string[]; // Array of topic names. Empty array or a special value like 'ALL_TOPICS' could mean all topics.
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'Any'; // Optional: Filter by difficulty,
  isFavoriteOnly?: boolean; // Optional: Filter to show only favorite questions
}

// Represents a question as it was answered by the user during a specific quiz
export interface AnsweredQuestion {
  questionId: string; // Reference to the original question's ID
  userAnswerIndex: number; // The index of the option the user selected
  isCorrect: boolean;
  // Snapshot of the question at the time of the quiz for robust review
  // This is important if questions in the main bank can be edited
  questionSnapshot: QuestionSnapshotInfo,
  contestId: number
}

export interface QuestionSnapshotInfo {
  text: string;
  topic: string;
  options: string[];
  scoreIsCorrect: number;
  scoreIsWrong: number;
  scoreIsSkip: number;
  correctAnswerIndex: number;
  explanation?: string;
  isFavorite?: number; // <-- NEW: To show if the question was marked as favorite
}

export interface TopicCount {
  topic: string;
  count: number;
}

// Represents a completed quiz session and its results
export interface QuizAttempt {
  id: string;
  timestampStart: Date;
  timestampEnd?: Date; // Becomes optional until completed
  settings: QuizSettings;
  score?: number; // Optional until completed
  totalQuestionsInQuiz: number;
  answeredQuestions: AnsweredQuestion[];
  unansweredQuestions: (AnsweredQuestion | undefined)[];
  allQuestions: AnsweredQuestion[]; // <-- NEW: For review

  status: QuizStatus; // <-- NEW
  currentQuestionIndex?: number; // <-- NEW: For resuming
  timeLeftOnPauseSeconds?: number; // <-- NEW: For resuming timed quiz
  timeElapsedOnPauseSeconds?: number; // <-- NEW: For resuming timed quiz
  contestId: number;
  userId: number;
}

export interface QuizSettings {
  totalQuestionsInQuiz: number;
  selectedTopics: string[];
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'Any';
  keywords?: string[];
  topicDistribution?: TopicCount[];
  enableTimer?: boolean;      // <-- NEW
  enableCronometer?: boolean;      // <-- NEW
  enableStreakSounds?: boolean;      // <-- NEW
  timerDurationSeconds?: number; // <-- NEW (total duration in seconds
  questionIDs?: string[];
  publicContest: number;
  hideCorrectAnswer?: boolean;
}

export type QuizStatus = 'in-progress' | 'paused' | 'completed' | 'timed-out';


