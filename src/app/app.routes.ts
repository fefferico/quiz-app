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
import { AuthGuard } from './guards/auth.guard'; // Adjust path
import { LoginComponent } from './components/login/login.component';


export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent, title: 'Quiz App - Home' },
  { path: 'quiz/setup', component: QuizSetupComponent, title: 'Quiz Setup' },
  { path: 'quiz/take', component: QuizTakingComponent, title: 'Take Quiz', canDeactivate: [unsavedChangesGuard] }, // <-- APPLY THE GUARD }, // We'll likely pass params here later
  { path: 'quiz/results/:id', component: QuizResultsComponent, title: 'Quiz Results' }, // ':id' for specific quiz result
  { path: 'quiz/history', component: QuizHistoryComponent, title: 'Quiz History' }, // <-- ADD ROUTE
  { path: 'statistics', component: StatisticsComponent, title: 'Quiz Statistics' }, // <-- ADD ROUTE
  { path: 'study-focus', component: StudyFocusComponent, title: 'Study Focus' }, // <-- ADD ROUTE
  { path: 'favorites', component: FavoriteQuestionsComponent, title: 'Favorite Questions' }, // <-- ADD ROUTE
  { path: 'quiz/study', component: QuizStudyComponent, title: 'Study Questions' }, // <-- ADD ROUTE
  // Add a catch-all for undefined routes, redirecting to home or a NotFoundComponent later
  //{ path: '**', redirectTo: '/home' } // Or a dedicated NotFoundComponent,
];