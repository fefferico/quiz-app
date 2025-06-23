// src/app/pages/admin-dashboard/admin-dashboard.component.ts
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe, SlicePipe } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatabaseService } from '../../core/services/database.service';
import { AlertService } from '../../services/alert.service';
import { Role, User } from '../../models/user.model';
import { Contest } from '../../models/contest.model';
import { Question } from '../../models/question.model';
import { AuthService } from '../../core/services/auth.service';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, startWith, tap } from 'rxjs/operators';
import { SpinnerService } from '../../core/services/spinner.service';
import { QuizAttempt, QuizStatus, QuizType } from '../../models/quiz.model';

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, SlicePipe, DatePipe],
    templateUrl: './admin-dashboard.html',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
    private dbService = inject(DatabaseService);
    private alertService = inject(AlertService);
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private spinnerService = inject(SpinnerService);

    activeView: 'dashboard' | 'users' | 'contests' | 'questions' | 'attempts' = 'dashboard';

    // Data stores
    users: User[] = [];
    contests: Contest[] = [];
    allRoles: Role[] = []; // NEW: To store all available roles
    types: QuizType[] = ['Standard', 'Esame', 'Revisione errori', 'Domande mai risposte', 'Contest', 'Timed', 'Revisione errori globale'];
    questions: Question[] = [];
    filteredQuestions: Question[] = [];
    allUserAttempts: QuizAttempt[] = []; // Holds all attempts for the selected user before client-side filtering
    userAttempts: QuizAttempt[] = []; // Holds the displayed (filtered) attempts

    // Forms
    userForm!: FormGroup;
    contestForm!: FormGroup;
    questionForm!: FormGroup;
    questionFilterForm!: FormGroup;
    attemptForm!: FormGroup;
    attemptFilterForm!: FormGroup;

    // State for editing
    editingUserId: number | null = null;
    editingContestId: number | null = null;
    editingQuestionId: string | null = null;

    // For user permissions
    allContestsForPermissions: Contest[] = [];
    userContestPermissions: { [key: number]: boolean } = {};
    userRolePermissions: { [key: number]: boolean } = {}; // NEW: For role checkboxes

    // For question management
    selectedContestForQuestions: number | '' = '';
    parsedQuestions: Partial<Question>[] = [];
    isUploading = false;

    // --- PAGINATION STATE ---
    questionsCurrentPage = 1;
    questionsItemsPerPage = 15;
    totalQuestions = 0;

    attemptsCurrentPage = 1;
    attemptsItemsPerPage = 10;
    totalAttempts = 0;

    private subscriptions = new Subscription();

    get totalQuestionPages(): number {
        return Math.ceil(this.totalQuestions / this.questionsItemsPerPage);
    }

    get totalAttemptPages(): number {
        return Math.ceil(this.totalAttempts / this.attemptsItemsPerPage);
    }

    ngOnInit(): void {
        this.initializeForms();
        this.loadInitialData();
        this.setupFilterListeners();
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
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
            status: ['completed', Validators.required],
            timestampStart: ['', Validators.required],
            timestampEnd: [''],
            timeElapsed: ['']
        });

        this.attemptFilterForm = this.fb.group({
            userId: [''],
            contestId: [''],
            attemptId: [''],
            attemptType: ['']
        });
    }

    setupFilterListeners(): void {
        const questionFilter$ = this.questionFilterForm.valueChanges.pipe(
            debounceTime(300),
            distinctUntilChanged()
        ).subscribe(filters => this.applyQuestionFilters(filters));
        this.subscriptions.add(questionFilter$);

        const attemptFilter$ = this.attemptFilterForm.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
            tap(() => this.attemptsCurrentPage = 1) // Reset page on any filter change
        ).subscribe(() => {
            this.loadPaginatedAttempts();
        });
        this.subscriptions.add(attemptFilter$);
    }

    applyQuestionFilters(filters: { text: string, topic: string, id: string }): void {
        // This is a client-side filter for the currently loaded page of questions.
        // For a full DB search, this would need to call `loadQuestionsForContest`.
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
            this.spinnerService.show('Loading Admin Data...');
            const [contests, users, roles] = await Promise.all([
                this.dbService.getAllContests(),
                this.dbService.getAllUsers(),
                this.dbService.getAllRoles() // Fetch roles
            ]);
            this.contests = Array.isArray(contests) ? contests.sort((a, b) => a.id - b.id) : [];
            this.users = Array.isArray(users) ? users : [];
            this.allRoles = Array.isArray(roles) ? roles : [];
            this.allContestsForPermissions = [...this.contests];
        } catch (error) {
            this.alertService.showToast({ message: 'Failed to load initial admin data.', type: 'error' });
        } finally {
            this.spinnerService.hide();
        }
    }

    changeView(view: 'dashboard' | 'users' | 'contests' | 'questions' | 'attempts'): void {
        this.activeView = view;
        if (view === 'questions' && this.selectedContestForQuestions === null) {
            this.selectedContestForQuestions = '';
            this.loadQuestionsForContest('');
        }
    }

    // --- CONTEST MANAGEMENT --- (No changes)
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
    onSelectContestForEdit(contest: Contest): void { this.editingContestId = contest.id; this.contestForm.patchValue(contest); }
    resetContestForm(): void { this.editingContestId = null; this.contestForm.reset({ name: '', isActive: true }); }
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

    // --- QUESTION MANAGEMENT --- (No changes)
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
            this.questions = []; this.filteredQuestions = []; this.totalQuestions = 0; this.questionsCurrentPage = 1;
            return;
        }
        const contestId = contestIdStr ? Number(contestIdStr) : null;
        this.questionsCurrentPage = page;
        const offset = (this.questionsCurrentPage - 1) * this.questionsItemsPerPage;
        try {
            this.spinnerService.show('Loading questions...');
            if (page === 1 || this.totalQuestions === 0) {
                this.totalQuestions = await this.dbService.countAllRows(contestId!);
            }
            this.questions = await this.dbService.getAllQuestionsPaginated(contestId, this.questionsItemsPerPage, offset);
            this.filteredQuestions = [...this.questions];
        } catch (error) {
            this.alertService.showToast({ message: 'Failed to load questions for this contest.', type: 'error' });
            this.questions = []; this.filteredQuestions = []; this.totalQuestions = 0;
        } finally {
            this.spinnerService.hide();
        }
    }
    goToQuestionPage(page: number): void {
        if (page >= 1 && page <= this.totalQuestionPages && page !== this.questionsCurrentPage) {
            this.loadQuestionsForContest(this.selectedContestForQuestions.toString(), page);
        }
    }
    firstQuestionPage(): void { this.goToQuestionPage(1); }
    previousQuestionPage(): void { this.goToQuestionPage(this.questionsCurrentPage - 1); }
    nextQuestionPage(): void { this.goToQuestionPage(this.questionsCurrentPage + 1); }
    lastQuestionPage(): void { this.goToQuestionPage(this.totalQuestionPages); }
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
            this.loadQuestionsForContest(this.selectedContestForQuestions.toString(), this.questionsCurrentPage);
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
                if (this.filteredQuestions.length === 1 && this.questionsCurrentPage > 1) {
                    this.goToQuestionPage(this.questionsCurrentPage - 1);
                } else {
                    this.loadQuestionsForContest(this.selectedContestForQuestions!.toString(), this.questionsCurrentPage);
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
    async loadPaginatedAttempts(page: number = 1): Promise<void> {
        this.resetAttemptForm();
        const filters = this.attemptFilterForm.value;
        if (!filters.userId) {
            this.userAttempts = [];
            this.totalAttempts = 0;
            this.attemptsCurrentPage = 1;
            return;
        }

        this.attemptsCurrentPage = page;
        const offset = (this.attemptsCurrentPage - 1) * this.attemptsItemsPerPage;

        try {
            this.spinnerService.show('Loading attempts...');
            const [total, attempts] = await Promise.all([
                this.dbService.countQuizAttempts(filters),
                this.dbService.getPaginatedQuizAttempts(filters, this.attemptsItemsPerPage, offset)
            ]);
            this.totalAttempts = total;
            this.userAttempts = attempts;

        } catch (error) {
            this.alertService.showToast({ message: 'Failed to load quiz attempts.', type: 'error' });
            this.userAttempts = [];
            this.totalAttempts = 0;
        } finally {
            this.spinnerService.hide();
        }
    }

    goToAttemptPage(page: number): void {
        if (page >= 1 && page <= this.totalAttemptPages && page !== this.attemptsCurrentPage) {
            this.loadPaginatedAttempts(page);
        }
    }
    firstAttemptPage(): void { this.goToAttemptPage(1); }
    previousAttemptPage(): void { this.goToAttemptPage(this.attemptsCurrentPage - 1); }
    nextAttemptPage(): void { this.goToAttemptPage(this.attemptsCurrentPage + 1); }
    lastAttemptPage(): void { this.goToAttemptPage(this.totalAttemptPages); }

    onSelectAttemptForEdit(attempt: QuizAttempt): void {
        this.attemptForm.reset();
        const formatForInput = (date: Date | undefined) => {
            if (!date) return null;
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        };

        this.attemptForm.patchValue({
            id: attempt.id,
            quizTitle: attempt.quizTitle,
            score: attempt.score,
            status: attempt.status,
            timestampStart: formatForInput(attempt.timestampStart),
            timestampEnd: formatForInput(attempt.timestampEnd),
            timeElapsed: attempt.timeElapsed
        });
    }

    onAttemptFormSubmit(): void {
        if (this.attemptForm.invalid) {
            this.alertService.showToast({ message: 'Form is invalid.', type: 'warning' });
            return;
        }

        const formValue = this.attemptForm.getRawValue();
        const originalAttempt = this.userAttempts.find(a => a.id === formValue.id);
        if (!originalAttempt) {
            this.alertService.showToast({ message: 'Original attempt not found.', type: 'error' });
            return;
        }

        const updatedAttempt: Partial<QuizAttempt> = {
            ...originalAttempt,
            id: formValue.id,
            quizTitle: formValue.quizTitle,
            score: Number(formValue.score),
            status: formValue.status,
            timestampStart: new Date(formValue.timestampStart),
            timestampEnd: formValue.timestampEnd ? new Date(formValue.timestampEnd) : undefined,
            timeElapsed: formValue.timeElapsed
        };

        this.spinnerService.show('Saving attempt...');
        this.dbService.saveQuizAttempt(updatedAttempt as QuizAttempt).then(() => {
            this.alertService.showToast({ message: 'Attempt updated successfully.', type: 'success' });
            this.loadPaginatedAttempts(this.attemptsCurrentPage);
            this.resetAttemptForm();
        }).catch(err => {
            this.alertService.showToast({ message: `Failed to update attempt: ${err.message}`, type: 'error' });
        }).finally(() => {
            this.spinnerService.hide();
        });
    }

    async onDeleteAttempt(id: string): Promise<void> {
        if ((await this.alertService.showConfirm('Delete Attempt', `Are you sure you want to delete this quiz attempt? This action is irreversible.`))?.role === 'confirm') {
            try {
                await this.dbService.deleteQuizAttempt(id);
                this.alertService.showToast({ message: 'Quiz attempt deleted.', type: 'success' });
                // After deleting, reload the current page. It might be empty, so handle that.
                if (this.userAttempts.length === 1 && this.attemptsCurrentPage > 1) {
                    this.goToAttemptPage(this.attemptsCurrentPage - 1);
                } else {
                    this.loadPaginatedAttempts(this.attemptsCurrentPage);
                }
            } catch (err) {
                this.alertService.showToast({ message: `Failed to delete attempt`, type: 'error' });
            }
        }
    }

    resetAttemptForm(): void {
        this.attemptForm.reset();
    }

    getUsername(userId: number | string): string {
        return this.users.find(u => u.id === Number(userId))?.displayName || `User ID: ${userId}`;
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
        return this.dbService.calcDurataQuiz(quizAttempt);
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

        let userId = this.editingUserId;
        if (!userId) {
            try {
                const maxId = await this.dbService.getHighestUserId();
                userId = (Number(maxId) ?? 0) + 1;
            } catch (err) {
                this.alertService.showToast({ message: 'Failed to determine next user ID.', type: 'error' });
                return;
            }
        }

        const userData: User = { id: userId, ...this.userForm.value };
        delete userData.hashedPassword;
        if (this.userForm.value.password) userData.hashedPassword = await this.hashPasswordSHA256(this.userForm.value.password);

        this.dbService.upsertUser(userData).then(async savedUser => {
            if (this.editingUserId) {
                const contestPermissionIds = Object.entries(this.userContestPermissions).filter(([, h]) => h).map(([c]) => Number(c));
                await this.dbService.updateContestsForUser(this.editingUserId, contestPermissionIds);

                // NEW: Save role permissions
                const rolePermissionIds = Object.entries(this.userRolePermissions).filter(([, hasAccess]) => hasAccess).map(([roleId]) => Number(roleId));
                await this.dbService.updateRolesForUser(this.editingUserId, rolePermissionIds);
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
        this.resetUserForm();
        this.editingUserId = user.id!;
        this.userForm.patchValue(user);
        this.userForm.controls['username'].disable();

        try {
            this.spinnerService.show('Loading permissions...');
            const [permittedContestIds, permittedRoles] = await Promise.all([
                this.dbService.getUserContestIds(user.id!),
                this.dbService.getRolesForUser(user.id!)
            ]);

            this.userContestPermissions = this.allContestsForPermissions.reduce((acc, c) => {
                if (c.id != null) {
                    return { ...acc, [c.id]: permittedContestIds.includes(c.id) };
                }
                return acc;
            }, {});

            const permittedRoleIds = permittedRoles
                .filter(r => r.id != null)
                .map(r => r.id as number);
            this.userRolePermissions = this.allRoles.reduce<{ [key: number]: boolean }>(
                (acc, r) => {
                    if (r.id != null) {
                        return { ...acc, [r.id]: permittedRoleIds.includes(r.id) };
                    }
                    return acc;
                },
                {}
            );

        } catch (error) {
            console.log(error)
            this.alertService.showToast({ message: 'Could not load user permissions.', type: 'error' });
        } finally {
            this.spinnerService.hide();
        }
    }

    resetUserForm(): void {
        this.editingUserId = null;
        this.userForm.reset({ username: '', displayName: '', password: '', isActive: true });
        this.userForm.controls['username'].enable();
        this.userContestPermissions = {};
        this.userRolePermissions = {};
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
    toggleContestPermission(contestId: number): void { this.userContestPermissions[contestId] = !this.userContestPermissions[contestId]; }
    toggleRolePermission(roleId: number): void { this.userRolePermissions[roleId] = !this.userRolePermissions[roleId]; }
}