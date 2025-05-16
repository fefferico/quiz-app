// src/app/pages/favorite-questions/favorite-questions.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { Question } from '../../models/question.model';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { IconDefinition, faHome } from '@fortawesome/free-solid-svg-icons'; // Added faAdjust
import { AlertService } from '../../services/alert.service';
import { ContestSelectionService } from '../../core/services/contest-selection.service';

@Component({
  selector: 'app-favorite-questions',
  standalone: true,
  imports: [CommonModule, RouterLink, FontAwesomeModule],
  templateUrl: './favorite-questions.component.html',
  styleUrls: ['./favorite-questions.component.scss']
})
export class FavoriteQuestionsComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private router = inject(Router);
  private alertService = inject(AlertService);
  private contestSelectionService = inject(ContestSelectionService); // Inject the new service

  // -- icons
  homeIcon: IconDefinition = faHome; // This was already here, seems unused in the template you showed previously

  favoriteQuestions: Question[] = [];
  isLoading = true;

  // Getter to easily access the contest from the template
  get selectedPublicContest(): string {
    return this.contestSelectionService.getCurrentSelectedContest() || '';
  }

  private chckForContest(): void {
    if (!this.selectedPublicContest) {
      this.alertService.showAlert("Info", "Non è stata selezionata alcuna Banca Dati: si verrà ora rediretti alla pagina principale").then(() => {
        this.router.navigate(['/home']);
      })
    }
  }

  ngOnInit(): void {
    this.chckForContest();
    this.loadFavorites();
  }

  async loadFavorites(): Promise<void> {
    this.isLoading = true;
    try {
      this.favoriteQuestions = await this.dbService.getFavoriteQuestions();
    } catch (error) {
      console.error("Error loading favorite questions:", error);
    } finally {
      this.isLoading = false;
    }
  }

  async unmarkFavorite(questionId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation(); // Prevent other click actions
    const newFavStatus = await this.dbService.toggleFavoriteStatus(questionId);
    if (newFavStatus === 0) { // Successfully unfavorited
      this.favoriteQuestions = this.favoriteQuestions.filter(q => q.id !== questionId);
    }
  }

  startQuizWithFavorites(): void {
    if (this.favoriteQuestions.length === 0) {
      this.alertService.showAlert("Attenzione", "Non sono presenti domande preferite con cui poter iniziare un quiz.");
      return;
    }
    const questionIds = this.favoriteQuestions.map(q => q.id);
    console.log("Starting quiz with favorite question IDs:", questionIds);

    // Navigate to QuizSetup with parameters to load these specific IDs
    // This requires QuizSetupComponent and subsequently QuizTakingComponent to handle a 'fixedQuestionIds' param
    this.router.navigate(['/quiz/take'], {
      queryParams: {
        // numQuestions: questionIds.length, // numQuestions will be derived from IDs length
        fixedQuestionIds: questionIds
        // We can also set a default title or context for this type of quiz
      }
    });
  }
}