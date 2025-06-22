// src/app/pages/admin-dashboard/admin-dashboard.component.ts
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe, SlicePipe } from '@angular/common';
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
import { QuizAttempt, QuizStatus } from '../../models/quiz.model';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, SlicePipe, DatePipe],
    templateUrl: './admin-dashboard.html',
    // No styleUrl needed as Tailwind is used
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
    private dbService = inject(DatabaseService);
    private alertService = inject(AlertService);
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private spinnerService = inject(SpinnerService);

    activeView: 'dashboard' | 'users' | 'contests' | 'questions' | 'attempts' = 'dashboard';

    filterByAttemptID: string = '';

    // Data stores
    users: User[] = [];
    contests: Contest[] = [];
    questions: Question[] = [];
    filteredQuestions: Question[] = [];
    userAttempts: QuizAttempt[] = [];

    // Forms
    userForm!: FormGroup;
    contestForm!: FormGroup;
    questionForm!: FormGroup;
    questionFilterForm!: FormGroup;
    attemptForm!: FormGroup;

    // State for editing
    editingUserId: number | null = null;
    editingContestId: number | null = null;
    editingQuestionId: string | null = null;
    selectedUserForAttempts: number | null = null;

    // For user permissions
    allContestsForPermissions: Contest[] = [];
    userContestPermissions: { [key: number]: boolean } = {};

    // For question management
    selectedContestForQuestions: number | '' = '';
    parsedQuestions: Partial<Question>[] = [];
    isUploading = false;

    // --- PAGINATION STATE ---
    currentPage = 1;
    itemsPerPage = 15;
    totalQuestions = 0;

    private filterSubscription!: Subscription;

    get totalPages(): number {
        return Math.ceil(this.totalQuestions / this.itemsPerPage);
    }
    // --- END PAGINATION STATE ---

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
            contestId: [null, Validators.required],
            text: ['', Validators.required],
            topic: ['', Validators.required],
            explanation: [''],
            scoreIsCorrect: [1, Validators.required],
            scoreIsWrong: [0, Validators.required],
            scoreIsSkip: [0, Validators.required],
            correctAnswerIndex: [null, Validators.required],
            options: this.fb.array([], Validators.minLength(2))
        });

        this.questionFilterForm = this.fb.group({
            text: [''],
            topic: [''],
            id: ['']
        });

        this.attemptForm = this.fb.group({
            id: [{ value: '', disabled: true }],
            quizTitle: ['', Validators.required],
            score: [0, Validators.required],
            status: ['completed', Validators.required]
        });
    }

    setupFilterListener(): void {
        this.filterSubscription = this.questionFilterForm.valueChanges.pipe(
            debounceTime(300),
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
            const contests = await this.dbService.getAllContests();
            this.contests = Array.isArray(contests) ? contests : [];
            this.users = await this.dbService.getAllUsers();
            this.allContestsForPermissions = [...this.contests];
        } catch (error) {
            this.alertService.showToast({ message: 'Failed to load initial admin data.', type: 'error' });
        }
    }

    changeView(view: 'dashboard' | 'users' | 'contests' | 'questions' | 'attempts'): void {
        this.activeView = view;
        if (view === 'questions' && this.selectedContestForQuestions === null) {
            this.selectedContestForQuestions = ''; // Default to "All Contests"
            this.loadQuestionsForContest('');
        }
    }

    // --- CONTEST MANAGEMENT ---
    onContestFormSubmit(): void {
        if (this.contestForm.invalid) return;
        const contestData: Contest = { id: this.editingContestId!, ...this.contestForm.value };

        this.dbService.upsertContest(contestData).then(savedContest => {
            this.alertService.showToast({ message: `Contest '${savedContest.name}' saved successfully.`, type: 'success' });
            this.resetContestForm();
            this.loadInitialData();
        }).catch(err => {
            this.alertService.showToast({ message: `Failed to save contest: ${err.message}`, type: 'error' });
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
        if (confirmation?.role === 'confirm') {
            try {
                await this.dbService.deleteContest(id);
                this.alertService.showToast({ message: 'Contest deleted.', type: 'success' });
                this.loadInitialData();
            } catch (error) {
                this.alertService.showToast({ message: `Failed to delete contest. Ensure it is not in use.`, type: 'error' });
            }
        }
    }

    // --- USER MANAGEMENT ---
    async onUserFormSubmit(): Promise<void> {
        if (this.userForm.invalid) return;
        if (!this.editingUserId) this.userForm.controls['password'].setValidators([Validators.required, Validators.minLength(6)]);
        else this.userForm.controls['password'].clearValidators();
        this.userForm.controls['password'].updateValueAndValidity();
        if (this.userForm.invalid) {
            this.alertService.showToast({ message: 'Please fill all required fields.', type: 'warning' });
            return;
        }

        const userData: User = { id: this.editingUserId!, ...this.userForm.value };
        delete userData.hashedPassword;
        if (this.userForm.value.password) userData.hashedPassword = await this.hashPasswordSHA256(this.userForm.value.password);

        this.dbService.upsertUser(userData).then(async savedUser => {
            if (this.editingUserId) {
                const permissionIds = Object.entries(this.userContestPermissions).filter(([, h]) => h).map(([c]) => Number(c));
                await this.dbService.updateContestsForUser(this.editingUserId, permissionIds);
            }
            this.alertService.showToast({ message: `User '${savedUser.username}' saved.`, type: 'success' });
            this.resetUserForm(); this.loadInitialData();
        }).catch(err => {
            this.alertService.showToast({ message: `Failed to save user: ${err.message}`, type: 'error' });
        });
    }

    private async hashPasswordSHA256(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async onSelectUserForEdit(user: User): Promise<void> {
        this.resetUserForm(); this.editingUserId = user.id!;
        this.userForm.patchValue(user); this.userForm.controls['username'].disable();
        try {
            const permittedIds = await this.dbService.getUserContestIds(user.id!);
            this.userContestPermissions = this.allContestsForPermissions.reduce((acc, c) => ({ ...acc, [c.id]: permittedIds.includes(c.id) }), {});
        } catch {
            this.alertService.showToast({ message: 'Could not load user permissions.', type: 'error' });
        }
    }

    resetUserForm(): void {
        this.editingUserId = null; this.userForm.reset({ username: '', displayName: '', password: '', isActive: true });
        this.userForm.controls['username'].enable(); this.userContestPermissions = {};
    }

    async onDeleteUser(id: number, username: string): Promise<void> {
        if ((await this.alertService.showConfirm('Delete User', `Are you sure you want to delete "${username}"? This is IRREVERSIBLE.`))?.role === 'confirm') {
            try {
                await this.dbService.deleteUser(id);
                this.alertService.showToast({ message: 'User deleted.', type: 'success' }); this.loadInitialData();
            } catch (error) {
                this.alertService.showToast({ message: 'Failed to delete user.', type: 'error' });
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

    async loadQuestionsForContest(contestIdStr: string, page: number = 1): Promise<void> {
        this.resetQuestionForm();
        this.questionFilterForm.reset({ text: '', topic: '', id: '' }, { emitEvent: false });
        this.selectedContestForQuestions = Number(contestIdStr);

        if (contestIdStr === '') {
            this.questions = [];
            this.filteredQuestions = [];
            this.totalQuestions = 0;
            this.currentPage = 1;
            return;
        }

        const contestId = contestIdStr ? Number(contestIdStr) : null;
        this.currentPage = page;
        const offset = (this.currentPage - 1) * this.itemsPerPage;

        try {
            this.spinnerService.show('Loading questions...');
            if (page === 1 || this.totalQuestions === 0) {
                this.totalQuestions = await this.dbService.countAllRows(contestId!);
            }
            this.questions = await this.dbService.getAllQuestionsPaginated(contestId, this.itemsPerPage, offset);
            this.filteredQuestions = [...this.questions];
        } catch (error) {
            this.alertService.showToast({ message: 'Failed to load questions for this contest.', type: 'error' });
            this.questions = []; this.filteredQuestions = [];
            this.totalQuestions = 0;
        } finally {
            this.spinnerService.hide();
        }
    }

    goToPage(page: number): void {
        if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
            this.loadQuestionsForContest(this.selectedContestForQuestions.toString(), page);
        }
    }
    firstPage(): void { this.goToPage(1); }
    previousPage(): void { this.goToPage(this.currentPage - 1); }
    nextPage(): void { this.goToPage(this.currentPage + 1); }
    lastPage(): void { this.goToPage(this.totalPages); }

    getContestName(contestId: number | ''): string {
        if (contestId === '') return 'All Contests';
        return this.contests.find(c => c.id === contestId)?.name || 'Unknown';
    }

    onSelectQuestionForEdit(question: Question): void {
        this.resetQuestionForm(); this.editingQuestionId = question.id;
        this.questionForm.patchValue(question);
        question.options.forEach(optionText => this.addOption(optionText));
    }

    resetQuestionForm(): void {
        this.editingQuestionId = null;
        this.questionForm.reset({
            contestId: this.selectedContestForQuestions || null,
            scoreIsCorrect: 1, scoreIsWrong: 0, scoreIsSkip: 0, correctAnswerIndex: null
        });
        this.options.clear();
    }

    async onQuestionFormSubmit(): Promise<void> {
        if (this.questionForm.invalid) {
            this.alertService.showToast({ message: 'Please fill all required question fields.', type: 'warning' });
            return;
        }
        const questionData: Partial<Question> = { ...this.questionForm.value };
        this.spinnerService.show("Saving question...");

        if (!this.editingQuestionId) {
            try {
                const maxId = await this.dbService.getHighestQuestionId();
                questionData.id = ((Number(maxId) ?? 0) + 1).toString();
            } catch (err) {
                this.alertService.showToast({ message: 'Failed to determine next question ID.', type: 'error' });
                this.spinnerService.hide(); return;
            }
        }

        const promise = this.editingQuestionId
            ? this.dbService.updateQuestion(this.editingQuestionId, questionData)
            : this.dbService.addQuestion(questionData as Question);

        promise.then(() => {
            this.alertService.showToast({ message: `Question ${this.editingQuestionId ? 'updated' : 'created'}.`, type: 'success' });
            this.loadQuestionsForContest(this.selectedContestForQuestions.toString(), this.currentPage);
            this.resetQuestionForm();
        }).catch(err => {
            this.alertService.showToast({ message: `Failed to save question: ${err.message}`, type: 'error' });
        }).finally(() => {
            this.spinnerService.hide();
        });
    }

    async onDeleteQuestion(id: string): Promise<void> {
        if ((await this.alertService.showConfirm('Delete Question', `Are you sure you want to delete this question? This action is irreversible.`))?.role === 'confirm') {
            try {
                await this.dbService.deleteQuestion(id);
                this.alertService.showToast({ message: 'Question deleted.', type: 'success' });
                if (this.filteredQuestions.length === 1 && this.currentPage > 1) {
                    this.goToPage(this.currentPage - 1);
                } else {
                    this.loadQuestionsForContest(this.selectedContestForQuestions!.toString(), this.currentPage);
                }
            } catch (err) {
                this.alertService.showToast({ message: `Failed to delete question`, type: 'error' });
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
            const values = line.split(',');
            const question: Partial<Question> = { contestId: Number(this.selectedContestForQuestions) };
            headers.forEach((header, index) => {
                const key = header.trim(); const value = values[index]?.trim();
                if (key === 'options' && value) (question as any)[key] = value.split('|');
                else if (['correctAnswerIndex', 'scoreIsCorrect', 'scoreIsWrong', 'scoreIsSkip'].includes(key) && value) (question as any)[key] = Number(value);
                else if (value) (question as any)[key] = value;
            });
            return question;
        });
        this.alertService.showToast({ message: `${this.parsedQuestions.length} questions parsed from file.`, type: 'info' });
    }

    async handleBulkUpload(): Promise<void> {
        if (this.parsedQuestions.length === 0 || this.selectedContestForQuestions === '' || this.selectedContestForQuestions === null) {
            this.alertService.showToast({ message: 'Please select a contest before bulk uploading.', type: 'warning' });
            return;
        };
        this.isUploading = true;
        this.spinnerService.show('Uploading questions...');
        try {
            await this.dbService.addQuestionsBulk(this.parsedQuestions);
            this.alertService.showToast({ message: 'Bulk upload successful!', type: 'success' });
            this.parsedQuestions = [];
            this.loadQuestionsForContest(this.selectedContestForQuestions.toString());
        } catch (err) {
            this.alertService.showToast({ message: `Could not upload questions`, type: 'error' });
        } finally {
            this.isUploading = false;
            this.spinnerService.hide();
        }
    }

    async handleResetContest(contestIdStr: string) {
        const contestId = Number(contestIdStr); const contest = this.contests.find(c => c.id === contestId); if (!contest) return;
        if ((await this.alertService.showConfirm('Confirm Contest Reset', `This will permanently delete all quiz history and reset all question statistics for the contest "${contest.name}". Are you sure?`))?.role === 'confirm') {
            try {
                const currentUserId = this.authService.getCurrentUserId(); if (!currentUserId) throw new Error("No logged in user found.");
                await this.dbService.resetContest(contest.id, currentUserId);
                this.alertService.showToast({ message: `Contest "${contest.name}" has been reset.`, type: 'success' });
            } catch (error) {
                this.alertService.showToast({ message: `Failed to reset contest.`, type: 'error' });
            }
        }
    }

    // --- QUIZ ATTEMPT MANAGEMENT ---
    async loadAttemptsForUser(userIdStr: string, contestIdStr?: string): Promise<void> {
        this.resetAttemptForm();
        if (!userIdStr) {
            this.selectedUserForAttempts = null;
            this.userAttempts = [];
            return;
        }

        this.selectedUserForAttempts = Number(userIdStr);
        const contestId = contestIdStr ? Number(contestIdStr) : null;

        try {
            this.spinnerService.show('Loading attempts...');
            this.userAttempts = await this.dbService.getAllQuizAttempts(contestId, userIdStr);
        } catch (error) {
            this.alertService.showToast({ message: 'Failed to load quiz attempts.', type: 'error' });
            this.userAttempts = [];
        } finally {
            this.spinnerService.hide();
        }
    }

    /**
     * Filters userAttempts by multiple criteria.
     * @param filters Object with optional properties: method, type, userId, contestId, status, minScore, maxScore
     */
    filterAttempts(
        //     filters: {
        //     method?: string;
        //     type?: string;
        //     userId?: number;
        //     contestId?: number;
        //     status?: QuizStatus;
        //     minScore?: number;
        //     maxScore?: number;
        // }
    ): void {
        // Always start from the full list (assume you have a backup or reload from DB if needed)
        let attempts = [...this.userAttempts];

        // if (filters.method) {
        //     attempts = attempts.filter(a => a.method === filters.method);
        // }
        // if (filters.type) {
        //     attempts = attempts.filter(a => a.quizType === filters.type);
        // }
        // if (filters.userId !== undefined) {
        //     attempts = attempts.filter(a => a.userId === filters.userId);
        // }
        // if (filters.contestId !== undefined) {
        //     attempts = attempts.filter(a => a.contestId === filters.contestId);
        // }
        // if (filters.status) {
        //     attempts = attempts.filter(a => a.status === filters.status);
        // }
        // if (filters.minScore !== undefined) {
        //     attempts = attempts.filter(a => a.score >= filters.minScore!);
        // }
        // if (filters.maxScore !== undefined) {
        //     attempts = attempts.filter(a => a.score <= filters.maxScore!);
        // }

        if (this.filterByAttemptID) {
            attempts = attempts.filter(a => a.id.toLowerCase().includes(this.filterByAttemptID.toLowerCase().trim()));
        }

        this.userAttempts = attempts;
    }

    onSelectAttemptForEdit(attempt: QuizAttempt): void {
        this.attemptForm.reset();
        this.attemptForm.patchValue({
            id: attempt.id,
            quizTitle: attempt.quizTitle,
            score: attempt.score,
            status: attempt.status
        });
    }

    onAttemptFormSubmit(): void {
        if (this.attemptForm.invalid) {
            this.alertService.showToast({ message: 'Form is invalid.', type: 'warning' });
            return;
        }

        const formValue = this.attemptForm.getRawValue();
        const updatedAttempt: Partial<QuizAttempt> = {
            id: formValue.id,
            quizTitle: formValue.quizTitle,
            score: Number(formValue.score),
            status: formValue.status
        };

        this.spinnerService.show('Saving attempt...');
        this.dbService.saveQuizAttempt(updatedAttempt as QuizAttempt).then(() => {
            this.alertService.showToast({ message: 'Attempt updated successfully.', type: 'success' });
            this.resetAttemptForm();
            // Reload attempts for the currently selected user
            if (this.selectedUserForAttempts) {
                this.loadAttemptsForUser(this.selectedUserForAttempts.toString());
            }
        }).catch(err => {
            this.alertService.showToast({ message: `Failed to update attempt: ${err.message}`, type: 'error' });
        }).finally(() => {
            this.spinnerService.hide();
        });
    }

    resetAttemptForm(): void {
        this.attemptForm.reset();
    }

    getUsername(userId: number): string {
        return this.users.find(u => u.id === userId)?.displayName || `User ID: ${userId}`;
    }

    getStatusClass(status: QuizStatus): string {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800';
            case 'in-progress':
            case 'in svolgimento': return 'bg-blue-100 text-blue-800';
            case 'paused': return 'bg-yellow-100 text-yellow-800';
            case 'cancelled': return 'bg-gray-100 text-gray-800';
            case 'error': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    calcDurataQuiz(quizAttempt: QuizAttempt): string {
        if (
            quizAttempt &&
            quizAttempt.timestampEnd &&
            quizAttempt.timestampStart
        ) {
            // Get timestamps as milliseconds
            const endTime =
                typeof quizAttempt.timestampEnd === 'string' || typeof quizAttempt.timestampEnd === 'number'
                    ? new Date(quizAttempt.timestampEnd).getTime()
                    : quizAttempt.timestampEnd.getTime();
            const startTime =
                typeof quizAttempt.timestampStart === 'string' || typeof quizAttempt.timestampStart === 'number'
                    ? new Date(quizAttempt.timestampStart).getTime()
                    : quizAttempt.timestampStart.getTime();

            if (!isNaN(endTime) && !isNaN(startTime)) {
                // Subtract paused time if present, unless pausedSeconds equals the total duration (startTime - endTime)
                const pausedSeconds = quizAttempt.timeElapsedOnPauseSeconds || 0;
                const totalMs = endTime - startTime;
                let elapsedMs: number = totalMs;
                if (pausedSeconds * 1000 !== totalMs) {
                    if (pausedSeconds * 1000 < totalMs) {
                        return this.msToTime(elapsedMs);
                    }
                    elapsedMs = Math.max(0, totalMs - pausedSeconds * 1000);
                }
                return this.msToTime(elapsedMs);
            }
        }
        return "N/D";
    }




    private msToTime(ms: number): string {
        if (ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
}