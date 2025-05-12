// src/app/pages/home/home.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { QuizAttempt } from '../../models/quiz.model'; // Import QuizAttempt

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);

  pausedQuiz: QuizAttempt | undefined; // <-- NEW

  ngOnInit(): void {
    this.checkForPausedQuiz(); // <-- NEW
  }

  async checkForPausedQuiz(): Promise<void> { // <-- NEW
    this.pausedQuiz = await this.dbService.getPausedQuiz();
  }

  resumePausedQuiz(): void { // <-- NEW
    if (this.pausedQuiz) {
      this.router.navigate(['/quiz/take'], { queryParams: { resumeAttemptId: this.pausedQuiz.id } });
    }
  }
}