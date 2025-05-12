// src/app/models/question.model.ts

export interface Question {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  timesCorrect?: number;
  timesIncorrect?: number;
  isFavorite?: number; // <-- NEW (initialize to false)
}

export enum QuestionDifficulty {
  Easy = "Easy",
  Medium = "Medium",
  Hard = "Hard"
}
