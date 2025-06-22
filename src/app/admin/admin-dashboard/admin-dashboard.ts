// src/app/pages/admin-dashboard/admin-dashboard.component.ts
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatabaseService } from '../../core/services/database.service';
import { AlertService } from '../../services/alert.service';
import { User } from '../../models/user.model';
import { Contest } from '../../models/contes.model';
import { Question } from '../../models/question.model';
import { AuthService } from '../../core/services/auth.service';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SpinnerService } from '../../core/services/spinner.service';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, SlicePipe],
    templateUrl: './admin-dashboard.html',
    // No styleUrl needed as Tailwind is used
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
    private dbService = inject(DatabaseService);
    private alertService = inject(AlertService);
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private spinnerService = inject(SpinnerService);

    activeView: 'dashboard' | 'users' | 'contests' | 'questions' = 'dashboard';

    // Data stores
    users: User[] = [];
    contests: Contest[] = [];
    questions: Question[] = [];
    filteredQuestions: Question[] = []; // For displaying filtered results

    // Forms
    userForm!: FormGroup;
    contestForm!: FormGroup;
    questionForm!: FormGroup;
    questionFilterForm!: FormGroup; // NEW: Form for filtering questions

    // State for editing
    editingUserId: number | null = null;
    editingContestId: number | null = null;
    editingQuestionId: string | null = null;

    // For user permissions
    allContestsForPermissions: Contest[] = [];
    userContestPermissions: { [key: number]: boolean } = {};

    // For question management
    selectedContestForQuestions: number | null = null;
    parsedQuestions: Partial<Question>[] = [];
    isUploading = false;

    private filterSubscription!: Subscription;

    ngOnInit(): void {
        this.initializeForms();
        this.loadInitialData();
        this.setupFilterListener();
    }

    ngOnDestroy(): void {
        if (this.filterSubscription) {
            this.filterSubscription.unsubscribe();
        }
    }

    initializeForms(): void {
        this.contestForm = this.fb.group({
            name: ['', Validators.required],
            isActive: [true]
        });

        this.userForm = this.fb.group({
            username: ['', Validators.required],
            displayName: [''],
            password: [''],
            isActive: [true]
        });

        this.questionForm = this.fb.group({
            text: ['', Validators.required],
            topic: ['', Validators.required],
            explanation: [''],
            scoreIsCorrect: [1, Validators.required],
            scoreIsWrong: [0, Validators.required],
            scoreIsSkip: [0, Validators.required],
            correctAnswerIndex: [null, Validators.required],
            options: this.fb.array([], Validators.minLength(2))
        });

        // NEW: Initialize the filter form
        this.questionFilterForm = this.fb.group({
            text: [''],
            topic: [''],
            id: ['']
        });
    }

    // NEW: Listen for changes in the filter form and apply filters
    setupFilterListener(): void {
        this.filterSubscription = this.questionFilterForm.valueChanges.pipe(
            debounceTime(300), // Wait for 300ms of inactivity before applying filters
            distinctUntilChanged()
        ).subscribe(filters => {
            this.applyQuestionFilters(filters);
        });
    }

    applyQuestionFilters(filters: { text: string, topic: string, id: string }): void {
        const textFilter = filters.text.toLowerCase().trim();
        const topicFilter = filters.topic.toLowerCase().trim();
        const idFilter = filters.id.trim();

        this.filteredQuestions = this.questions.filter(q => {
            const textMatch = textFilter ? (
                q.text.toLowerCase().includes(textFilter) ||
                (q.explanation || '').toLowerCase().includes(textFilter) ||
                q.options.some(opt => opt.toLowerCase().includes(textFilter))
            ) : true;

            const topicMatch = topicFilter ? q.topic.toLowerCase().includes(topicFilter) : true;

            const idMatch = idFilter ? q.id.toString().includes(idFilter) : true;

            return textMatch && topicMatch && idMatch;
        });
    }

    async loadInitialData(): Promise<void> {
        try {
            // Load all contests, including those that may be null/undefined/empty
            const contests = await this.dbService.getAllContests();
            this.contests = Array.isArray(contests) ? contests : [];
            // Optionally, include empty/null/undefined contests explicitly
            this.contests.push({
                id: 0,
                name: '(No Contest)',
                isActive: false
            } as any);
            this.users = await this.dbService.getAllUsers();
            this.allContestsForPermissions = [...this.contests];
        } catch (error) {
            this.alertService.showAlert('Errore', 'Failed to load initial admin data.');
        }
    }

    changeView(view: 'dashboard' | 'users' | 'contests' | 'questions'): void {
        this.activeView = view;
    }

    // --- CONTEST MANAGEMENT ---
    onContestFormSubmit(): void {
        if (this.contestForm.invalid) return;
        const contestData: Contest = { id: this.editingContestId!, ...this.contestForm.value };

        this.dbService.upsertContest(contestData).then(savedContest => {
            this.alertService.showAlert('Info', `Contest '${savedContest.name}' saved successfully.`);
            this.resetContestForm();
            this.loadInitialData();
        }).catch(err => {
            this.alertService.showAlert('Error', `Failed to save contest: ${err.message}`);
        });
    }

    onSelectContestForEdit(contest: Contest): void {
        this.editingContestId = contest.id;
        this.contestForm.patchValue(contest);
    }

    resetContestForm(): void {
        this.editingContestId = null;
        this.contestForm.reset({ name: '', isActive: true });
    }

    async onDeleteContest(id: number, name: string): Promise<void> {
        const confirmation = await this.alertService.showConfirm('Delete Contest', `Are you sure you want to delete "${name}"? This will delete all associated questions and quiz attempts. This action is IRREVERSIBLE.`);
        if (confirmation) {
            try {
                await this.dbService.deleteContest(id);
                this.alertService.showAlert('Success', 'Contest deleted.');
                this.loadInitialData();
            } catch (error) {
                this.alertService.showAlert('Error', `Failed to delete contest. Ensure it is not in use.`);
            }
        }
    }

    // --- USER MANAGEMENT ---
    onUserFormSubmit(): void {
        if (this.userForm.invalid) return;
        if (!this.editingUserId) this.userForm.controls['password'].setValidators([Validators.required, Validators.minLength(6)]);
        else this.userForm.controls['password'].clearValidators();
        this.userForm.controls['password'].updateValueAndValidity();
        if (this.userForm.invalid) {
            this.alertService.showAlert('Warning', 'Please fill all required fields.');
            return;
        }
        const userData: User = { id: this.editingUserId!, ...this.userForm.value };
        delete userData.hashedPassword;
        if (this.userForm.value.password) userData.hashedPassword = this.userForm.value.password;

        this.dbService.upsertUser(userData).then(async savedUser => {
            if (this.editingUserId) {
                const permissionIds = Object.entries(this.userContestPermissions).filter(([, h]) => h).map(([c]) => Number(c));
                await this.dbService.updateContestsForUser(this.editingUserId, permissionIds);
            }
            this.alertService.showAlert('Success', `User '${savedUser.username}' saved.`);
            this.resetUserForm(); this.loadInitialData();
        }).catch(err => {
            this.alertService.showAlert('Error', `Failed to save user: ${err.message}`);
        });
    }

    async onSelectUserForEdit(user: User): Promise<void> {
        this.resetUserForm(); this.editingUserId = user.id!;
        this.userForm.patchValue(user); this.userForm.controls['username'].disable();
        try {
            const permittedIds = await this.dbService.getUserContestIds(user.id!);
            this.userContestPermissions = this.allContestsForPermissions.reduce((acc, c) => ({ ...acc, [c.id]: permittedIds.includes(c.id) }), {});
        } catch {
            this.alertService.showAlert('Error', 'Could not load user permissions.');
        }
    }

    resetUserForm(): void {
        this.editingUserId = null; this.userForm.reset({ username: '', displayName: '', password: '', isActive: true });
        this.userForm.controls['username'].enable(); this.userContestPermissions = {};
    }

    async onDeleteUser(id: number, username: string): Promise<void> {
        if (await this.alertService.showConfirm('Delete User', `Are you sure you want to delete "${username}"? This is IRREVERSIBLE.`)) {
            try {
                await this.dbService.deleteUser(id);
                this.alertService.showAlert('Success', 'User deleted.'); this.loadInitialData();
            } catch (error) {
                this.alertService.showAlert('Error', 'Failed to delete user.');
            }
        }
    }

    toggleContestPermission(contestId: number): void {
        this.userContestPermissions[contestId] = !this.userContestPermissions[contestId];
    }

    // --- QUESTION MANAGEMENT ---
    get options(): FormArray { return this.questionForm.get('options') as FormArray; }
    get correctAnswerIndexControl(): FormControl { return this.questionForm.get('correctAnswerIndex') as FormControl; }

    addOption(text: string = ''): void { this.options.push(new FormControl(text, Validators.required)); }
    removeOption(index: number): void {
        this.options.removeAt(index);
        if (this.questionForm.value.correctAnswerIndex === index) this.questionForm.patchValue({ correctAnswerIndex: null });
    }

    async loadQuestionsForContest(contestIdStr: string): Promise<void> {
        this.resetQuestionForm();
        this.questionFilterForm.reset({ text: '', topic: '', id: '' });

        if (!contestIdStr) {
            this.selectedContestForQuestions = null;
            try {
                // Load all questions across all contests
                this.questions = await this.dbService.getAllQuestions();
                this.filteredQuestions = [...this.questions];
            } catch (error) {
                this.alertService.showAlert('Error', 'Failed to load questions.');
                this.questions = []; this.filteredQuestions = [];
            }
            return;
        }

        this.selectedContestForQuestions = Number(contestIdStr);
        try {
            this.questions = await this.dbService.getAllQuestions(this.selectedContestForQuestions);
            this.filteredQuestions = [...this.questions];
        } catch (error) {
            this.alertService.showAlert('Error', 'Failed to load questions for this contest.');
            this.questions = []; this.filteredQuestions = [];
        }
    }

    getContestName(contestId: number): string { return this.contests.find(c => c.id === contestId)?.name || 'Unknown'; }

    onSelectQuestionForEdit(question: Question): void {
        this.resetQuestionForm(); this.editingQuestionId = question.id;
        this.questionForm.patchValue(question);
        question.options.forEach(optionText => this.addOption(optionText));
    }

    resetQuestionForm(): void {
        this.editingQuestionId = null;
        this.questionForm.reset({ scoreIsCorrect: 1, scoreIsWrong: 0, scoreIsSkip: 0, correctAnswerIndex: null });
        this.options.clear();
    }

    async onQuestionFormSubmit(): Promise<void> {

        if (this.questionForm.invalid) {
            this.alertService.showAlert('Warning', 'Please fill all required question fields.');
            return;
        }
        const questionData: Partial<Question> = { ...this.questionForm.value, contestId: this.selectedContestForQuestions };

        this.spinnerService.show("Caricamento nuova domanda in corso...");
        if (!this.editingQuestionId) {
            try {
                const maxId = await this.dbService.getHighestQuestionId();
                questionData.id = ((Number(maxId) ?? 0) + 1).toString();
            } catch (err) {
                this.alertService.showAlert('Error', 'Failed to determine next question ID.');
                this.spinnerService.hide();
                return;
            }
        }

        console.log("new question data: ", questionData)

        const promise = this.editingQuestionId
            ? this.dbService.updateQuestion(this.editingQuestionId, questionData)
            : this.dbService.addQuestion(questionData as Question);

        promise.then(() => {
            this.spinnerService.hide();
            this.alertService.showAlert('Success', `Question ${this.editingQuestionId ? 'updated' : 'created'}.`);
            this.resetQuestionForm();
            this.loadQuestionsForContest(this.selectedContestForQuestions!.toString());
        }).catch(err => {
            this.spinnerService.hide();
            this.alertService.showAlert('Error', `Failed to save question: ${err.message}`);
        });
    }

    async onDeleteQuestion(id: string): Promise<void> {
        if (await this.alertService.showConfirm('Delete Question', `Are you sure you want to delete this question? This action is irreversible.`)) {
            try {
                await this.dbService.deleteQuestion(id);
                this.alertService.showAlert('Success', 'Question deleted.');
                this.loadQuestionsForContest(this.selectedContestForQuestions!.toString());
            } catch (err) {
                this.alertService.showAlert('Error', `Failed to delete question`);
            }
        }
    }

    onFileSelected(event: any): void {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => this.parseCsv(e.target?.result as string);
        reader.readAsText(file);
    }

    parseCsv(csvText: string): void {
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        const headers = lines.shift()?.trim().split(',').map(h => h.trim()) || [];
        this.parsedQuestions = lines.map(line => {
            const values = line.split(','); const question: Partial<Question> = { contestId: this.selectedContestForQuestions! };
            headers.forEach((header, index) => {
                const key = header.trim(); const value = values[index]?.trim();
                if (key === 'options' && value) (question as any)[key] = value.split('|');
                else if (['correctAnswerIndex', 'scoreIsCorrect', 'scoreIsWrong', 'scoreIsSkip'].includes(key) && value) (question as any)[key] = Number(value);
                else if (value) (question as any)[key] = value;
            });
            return question;
        });
        this.alertService.showAlert('Info', `${this.parsedQuestions.length} questions parsed from file.`);
    }

    async handleBulkUpload(): Promise<void> {
        if (this.parsedQuestions.length === 0 || !this.selectedContestForQuestions) return;
        this.isUploading = true;
        try {
            await this.dbService.addQuestionsBulk(this.parsedQuestions);
            this.alertService.showAlert('Success', 'Bulk upload successful!');
            this.parsedQuestions = [];
            this.loadQuestionsForContest(this.selectedContestForQuestions.toString());
        } catch (err) {
            this.alertService.showAlert('Error', `Could not upload questions`);
        } finally {
            this.isUploading = false;
        }
    }

    // --- DASHBOARD ---
    async handleResetContest(contestIdStr: string) {
        const contestId = Number(contestIdStr); const contest = this.contests.find(c => c.id === contestId); if (!contest) return;
        if (await this.alertService.showConfirm('Confirm Contest Reset', `This will permanently delete all quiz history and reset all question statistics for the contest "${contest.name}". Are you sure?`)) {
            try {
                const currentUserId = this.authService.getCurrentUserId(); if (!currentUserId) throw new Error("No logged in user found.");
                await this.dbService.resetContest(contest.id, currentUserId);
                this.alertService.showAlert('Success', `Contest "${contest.name}" has been reset.`);
            } catch (error) {
                this.alertService.showAlert('Error', `Failed to reset contest.`);
            }
        }
    }
}