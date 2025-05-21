// src/app/app.routes.ts
import {Routes} from '@angular/router';
import {HomeComponent} from './pages/home/home.component';
import {QuizSetupComponent} from './pages/quiz-setup/quiz-setup.component';
import {QuizTakingComponent} from './features/quiz/quiz-taking/quiz-taking.component';
import {QuizResultsComponent} from './features/quiz/quiz-results/quiz-results.component';
import {QuizHistoryComponent} from './pages/quiz-history/quiz-history.component';
import {StatisticsComponent} from './pages/statistics/statistics.component';
import {unsavedChangesGuard} from './core/guards/unsaved-changes.guard';
import {StudyFocusComponent} from './pages/study-focus/study-focus.component';
import {FavoriteQuestionsComponent} from './pages/favorite-questions/favorite-questions.component';
import {QuizStudyComponent} from './features/quiz/quiz-study/quiz-study.component';
import {AuthGuard} from './guards/auth.guard';
import {LoginComponent} from './components/login/login.component';
import {UserRole} from './core/services/auth.service';

export const routes: Routes = [
  {path: '', redirectTo: 'login', pathMatch: 'full'},
  {path: 'login', component: LoginComponent, title: 'Login'}, // <-- LOGIN ROUTE (unguarded)
  {path: 'home', component: HomeComponent, title: 'Quiz App - Home', canActivate: [AuthGuard]},
  {
    path: 'quiz/setup',
    component: QuizSetupComponent,
    title: 'Impostazione Quiz',
    canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {
    path: 'quiz/take',
    component: QuizTakingComponent,
    title: 'Esegui Quiz',
    canDeactivate: [unsavedChangesGuard],
    canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {
    path: 'quiz/results/:id', component: QuizResultsComponent, title: 'Risultati Quiz', canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {
    path: 'quiz/history', component: QuizHistoryComponent, title: 'Cronologia Quiz', canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {path: 'statistics', component: StatisticsComponent, title: 'Statistiche Quiz', canActivate: [AuthGuard]},
  {
    path: 'study-focus', component: StudyFocusComponent, title: 'Focus di Studio', canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {
    path: 'favorites', component: FavoriteQuestionsComponent, title: 'Domande Preferite', canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {
    path: 'quiz/study', component: QuizStudyComponent, title: 'Modalità studio', canActivate: [AuthGuard],
    data: {allowedRoles: [UserRole.Admin, UserRole.QuizTaker]}
  },
  {
    path: '**', redirectTo: 'home', pathMatch: 'full' // Redirect to home for any unknown routes
  },
];
