// src/app/pages/quiz-history/quiz-history.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // Import DatePipe
import { Router, RouterLink } from '@angular/router'; // Import RouterLink

import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt } from '../../models/quiz.model';

@Component({
  selector: 'app-quiz-history',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe], // Add DatePipe and RouterLink
  templateUrl: './quiz-history.component.html',
  styleUrls: ['./quiz-history.component.scss']
})
export class QuizHistoryComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  quizAttempts: QuizAttempt[] = [];
  isLoading = true;
  errorLoading = '';

  ngOnInit(): void {
    this.loadQuizHistory();
  }

  async loadQuizHistory(): Promise<void> {
    this.isLoading = true;
    this.errorLoading = '';
    try {
      // getAllQuizAttempts in DatabaseService should sort by timestampEnd descending
      this.quizAttempts = await this.dbService.getAllQuizAttempts();
      if (this.quizAttempts.length === 0) {
        console.log('No quiz history found.');
      }
    } catch (error) {
      console.error('Error loading quiz history:', error);
      this.errorLoading = 'Failed to load quiz history. Please try again later.';
    } finally {
      this.isLoading = false;
    }
  }

  viewResults(attemptId: string): void {
    this.router.navigate(['/quiz/results', attemptId]);
  }

  getTopicsSummary(topics: string[] | undefined): string {
    if (!topics || topics.length === 0) {
      return 'All Topics';
    }
    if (topics.length > 3) {
      return topics.slice(0, 3).join(', ') + '...';
    }
    return topics.join(', ');
  }

  async deleteAttempt(attemptId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation(); // Prevent navigating to results when clicking delete
    if (confirm('Are you sure you want to delete this quiz attempt? This action cannot be undone.')) {
      try {
        await this.dbService.deleteQuizAttempt(attemptId);
        // Refresh the list
        this.quizAttempts = this.quizAttempts.filter(attempt => attempt.id !== attemptId);
        console.log(`Quiz attempt ${attemptId} deleted.`);
        if (this.quizAttempts.length === 0) {
          // Handle UI update if list becomes empty
        }
      } catch (error) {
        console.error(`Error deleting quiz attempt ${attemptId}:`, error);
        // Optionally show an error message to the user
        alert('Failed to delete quiz attempt.');
      }
    }
  }

  async clearAllHistory(): Promise<void> {
     if (confirm('Are you sure you want to delete ALL quiz history? This action cannot be undone.')) {
      try {
        await this.dbService.clearAllQuizAttempts();
        this.quizAttempts = []; // Clear the local array
        console.log('All quiz history cleared.');
      } catch (error) {
        console.error('Error clearing all quiz history:', error);
        alert('Failed to clear all quiz history.');
      }
    }
  }
}