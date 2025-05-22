// src/app/models/question.model.ts

export interface Question {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  difficulty?: QuestionDifficulty;
  timesCorrect?: number;
  timesIncorrect?: number;
  isFavorite?: number; // <-- NEW (initialize to false)
  questionVersion?: number; // NEW: Optional version for the question content
  lastAnsweredTimestamp?: number;
  lastAnswerCorrect?: boolean;
  accuracy?: number;
  publicContest?: string;
  scoreIsCorrect: number;
  scoreIsWrong: number;
  scoreIsSkip: number;
}

export enum QuestionDifficulty {
  Easy = "Easy",
  Medium = "Medium",
  Hard = "Hard"
}
