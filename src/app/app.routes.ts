// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { QuizSetupComponent } from './pages/quiz-setup/quiz-setup.component';
import { QuizTakingComponent } from './features/quiz/quiz-taking/quiz-taking.component';
import { QuizResultsComponent } from './features/quiz/quiz-results/quiz-results.component';
import { QuizHistoryComponent } from './pages/quiz-history/quiz-history.component'; // <-- IMPORT
import { StatisticsComponent } from './pages/statistics/statistics.component';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard'; // <-- IMPORT THE GUARD
import { StudyFocusComponent } from './pages/study-focus/study-focus.component'; // <-- IMPORT
import { FavoriteQuestionsComponent } from './pages/favorite-questions/favorite-questions.component'; // <-- IMPORT
import { QuizStudyComponent } from './features/quiz/quiz-study/quiz-study.component'; // <-- IMPORT

export const routes: Routes = [
  { path: 'home', component: HomeComponent, title: 'Quiz App - Home' },
  { path: 'quiz/setup', component: QuizSetupComponent, title: 'Impostazione Quiz' },
  { path: 'quiz/take', component: QuizTakingComponent, title: 'Esegui Quiz', canDeactivate: [unsavedChangesGuard] },
  { path: 'quiz/results/:id', component: QuizResultsComponent, title: 'Risultati Quiz' },
  { path: 'quiz/history', component: QuizHistoryComponent, title: 'Cronologia Quiz' },
  { path: 'statistics', component: StatisticsComponent, title: 'Statistiche Quiz' },
  { path: 'study-focus', component: StudyFocusComponent, title: 'Focus di Studio' },
  { path: 'favorites', component: FavoriteQuestionsComponent, title: 'Domande Preferite' },
  { path: 'quiz/study', component: QuizStudyComponent, title: 'Modalità studio' },
  { path: '**', redirectTo: 'home' },
];
