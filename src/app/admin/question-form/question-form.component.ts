import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Question, QuestionAdminService } from '../services/question-admin.service'; // Adjust path
import { Observable } from 'rxjs';

@Component({
  selector: 'app-admin-question-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './question-form.component.html',
  styleUrls: ['./question-form.component.scss']
})
export class AdminQuestionFormComponent implements OnInit, OnChanges {
  @Input() questionToEdit: Question | null = null; // For editing existing questions
  @Input() availableTopics$: Observable<string[]> = new Observable<string[]>();
  @Output() formSubmitted = new EventEmitter<Question>();
  @Output() cancelForm = new EventEmitter<void>();

  questionForm!: FormGroup;
  isEditMode = false;
  isLoading = false;
  submitMessage: string | null = null;
  submitMessageType: 'success' | 'error' = 'success';

  constructor(
    private fb: FormBuilder,
    private questionAdminService: QuestionAdminService
  ) {}

  ngOnInit(): void {
    this.initForm();
    if (!this.availableTopics$) { // Fallback if not provided via input
        this.availableTopics$ = this.questionAdminService.getTopics();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['questionToEdit'] && this.questionToEdit) {
      this.isEditMode = true;
      this.populateForm(this.questionToEdit);
    } else if (changes['questionToEdit'] && !this.questionToEdit) {
      this.isEditMode = false;
      if (this.questionForm) { // if form is already initialized
        this.questionForm.reset();
        this.options.clear(); // Clear existing options
        this.addOption(); // Add at least one default option
        this.addOption(); // And another one
      }
    }
  }

  private initForm(): void {
    this.questionForm = this.fb.group({
      id: [null], // Will be null for new, populated for edit
      text: ['', Validators.required],
      topic: ['', Validators.required],
      options: this.fb.array([], Validators.minLength(2)), // At least 2 options
      correctAnswerIndex: [null, Validators.required], // Will store the index
      explanation: [''],
      difficulty: ['Medium']
    });
    if (!this.questionToEdit) { // Add default options for new question
        this.addOption();
        this.addOption();
    }
  }

  private populateForm(question: Question): void {
    this.questionForm.patchValue({
      id: question.id,
      text: question.text,
      topic: question.topic,
      correctAnswerIndex: question.correctAnswerIndex,
      explanation: question.explanation || '',
      difficulty: question.difficulty || 'Medium'
    });
    this.options.clear(); // Clear previous options
    question.options.forEach(optionText => {
      this.options.push(this.fb.control(optionText, Validators.required));
    });
  }

  get options(): FormArray {
    return this.questionForm.get('options') as FormArray;
  }

  addOption(): void {
    this.options.push(this.fb.control('', Validators.required));
  }

  removeOption(index: number): void {
    if (this.options.length > 2) { // Ensure at least 2 options remain
      // If the removed option was the selected correct answer, reset correctAnswerIndex
      if (this.questionForm.get('correctAnswerIndex')?.value === index) {
        this.questionForm.get('correctAnswerIndex')?.setValue(null);
      } else if (this.questionForm.get('correctAnswerIndex')?.value > index) {
        // Adjust correctAnswerIndex if an option before it was removed
        this.questionForm.get('correctAnswerIndex')?.setValue(this.questionForm.get('correctAnswerIndex')?.value - 1);
      }
      this.options.removeAt(index);
    } else {
      alert("Una domanda deve avere almeno due opzioni di risposta.");
    }
  }

  onSubmit(): void {
    if (this.questionForm.invalid) {
      this.questionForm.markAllAsTouched(); // Show validation errors
      this.submitMessage = "Per favore, compila tutti i campi obbligatori.";
      this.submitMessageType = 'error';
      return;
    }
    if (this.questionForm.get('correctAnswerIndex')?.value === null ||
        this.questionForm.get('correctAnswerIndex')?.value >= this.options.length) {
        this.submitMessage = "Per favore, seleziona una risposta corretta valida.";
        this.submitMessageType = 'error';
        return;
    }


    this.isLoading = true;
    this.submitMessage = null;
    const formValue = this.questionForm.value;

    const questionData: Question | Omit<Question, 'id'> = {
      text: formValue.text,
      topic: formValue.topic,
      options: formValue.options,
      correctAnswerIndex: formValue.correctAnswerIndex,
      explanation: formValue.explanation,
      difficulty: formValue.difficulty
    };

    let operation: Observable<Question>;

    if (this.isEditMode && formValue.id) {
      operation = this.questionAdminService.updateQuestion(formValue.id, questionData as Partial<Question>);
    } else {
      operation = this.questionAdminService.createQuestion(questionData as Omit<Question, 'id'>);
    }

    operation.subscribe({
      next: (savedQuestion) => {
        this.isLoading = false;
        this.submitMessageType = 'success';
        this.submitMessage = this.isEditMode ? 'Domanda aggiornata con successo!' : 'Domanda creata con successo!';
        this.formSubmitted.emit(savedQuestion);
        this.questionForm.reset(); // Or specific reset logic
        this.options.clear();
        this.addOption(); this.addOption(); // Reset to two empty options
        this.isEditMode = false; // Reset edit mode after successful submission
      },
      error: (err) => {
        this.isLoading = false;
        this.submitMessageType = 'error';
        this.submitMessage = `Errore: ${err.message || 'Impossibile salvare la domanda.'}`;
        console.error(err);
      }
    });
  }

  onCancel(): void {
    this.cancelForm.emit();
    this.questionForm.reset();
    this.options.clear();
    this.addOption(); this.addOption();
    this.isEditMode = false;
    this.submitMessage = null;
  }
}