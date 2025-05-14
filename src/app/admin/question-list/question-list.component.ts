import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Question, QuestionAdminService } from '../services/question-admin.service'; // Adjust path
import { AdminQuestionFormComponent } from '../question-form/question-form.component'; // Adjust path
import { Observable } from 'rxjs';
import { AlertService } from '../../services/alert.service';

@Component({
  selector: 'app-admin-question-list',
  standalone: true,
  imports: [CommonModule, AdminQuestionFormComponent],
  templateUrl: './question-list.component.html',
  styleUrls: ['./question-list.component.scss']
})
export class AdminQuestionListComponent implements OnInit {
  questions$: Observable<Question[]> = new Observable<Question[]>();
  selectedQuestion: Question | null = null;
  showForm = false;
  availableTopics$: Observable<string[]> = new Observable<string[]>();
  private alertService = inject(AlertService);

  constructor(private questionAdminService: QuestionAdminService) { }

  ngOnInit(): void {
    this.loadQuestions();
    this.availableTopics$ = this.questionAdminService.getTopics();
  }

  loadQuestions(): void {
    this.questions$ = this.questionAdminService.getQuestions();
  }

  onAddNewQuestion(): void {
    this.selectedQuestion = null; // Ensure form is for new question
    this.showForm = true;
  }

  onEditQuestion(question: Question): void {
    this.selectedQuestion = { ...question }; // Create a copy to avoid direct mutation
    this.showForm = true;
  }

  onDeleteQuestion(id: string | number): void {
    if (confirm('Sei sicuro di voler eliminare questa domanda?')) {
      this.questionAdminService.deleteQuestion(id).subscribe({
        next: () => {
          this.loadQuestions(); // Refresh the list
          this.alertService.showAlert("Info","Domanda eliminata con successo.");
        },
        error: (err) => this.alertService.showAlert("Attenzione",err.message)
      });
    }
  }

  handleFormSubmission(question: Question): void {
    this.loadQuestions(); // Refresh list
    this.showForm = false; // Hide form
    this.selectedQuestion = null;
  }

  handleCancelForm(): void {
    this.showForm = false;
    this.selectedQuestion = null;
  }
}