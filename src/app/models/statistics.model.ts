// src/app/models/statistics.model.ts

export interface TopicPerformance {
  topic: string;
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number; // 0.0 to 1.0
}

export interface OverallStatistics {
  totalQuizzesTaken: number;
  totalQuestionsAttempted: number;
  totalCorrectAnswers: number;
  overallAccuracy: number; // 0.0 to 1.0
  averageScorePercentage: number; // Average percentage score across all quizzes
  performanceByTopic: TopicPerformance[];
  // Potentially:
  // quizScoresOverTime: { date: Date, score: number }[];
}

export interface GenericData {
  topic: string;
  count: number;
  questionIds: string[]; // IDs of questions in this topic
  isMaxReached?: boolean; // Indicates if the max number of questions has been reached
}
