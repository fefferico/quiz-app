// src/app/core/services/database.service.ts
import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Question, QuestionDifficulty } from '../../models/question.model'; // Adjust path if necessary
import { QuizAttempt, TopicCount } from '../../models/quiz.model';   // Adjust path if necessary
import e from 'express';
import { BehaviorSubject, catchError, tap, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { initialQuestions } from '../../../assets/data/quiz_data';

// --- IMPORTANT: Increment this version number whenever you update initialQuestions ---
const CURRENT_DB_SCHEMA_VERSION = 14; // Example: If previous was 5

// 1. Define a class that extends Dexie
export class AppDB extends Dexie {



  // 2. Define tables as properties
  questions!: Table<Question, string>; // string = type of the primary key (Question['id'])
  quizAttempts!: Table<QuizAttempt, string>; // string = type of the primary key (QuizAttempt['id'])

  private jsonPath = 'assets/data/quiz_data.ts';

  constructor(private http: HttpClient) {
    super('QuizAppDB');
    this.version(CURRENT_DB_SCHEMA_VERSION).stores({
      questions: 'id, topic, difficulty, timesCorrect, timesIncorrect, isFavorite, questionVersion',  // Removed & for boolean indexing
      quizAttempts: 'id, timestampEnd, status, settings.selectedTopics,timestampStart' // Status index added
    }).upgrade(async tx => {


      // This upgrade function runs if the database version is older than CURRENT_DB_SCHEMA_VERSION
      console.log(`Upgrading database to version ${CURRENT_DB_SCHEMA_VERSION}`);

      // Logic to update questions without losing other data
      const questionsTable = tx.table<Question, string>('questions');
      const currentQuestionsInDb = await questionsTable.toArray();
      const currentQuestionsMap = new Map(currentQuestionsInDb.map(q => [q.id, q]));

      const puts: Question[] = [];
      const adds: Question[] = [];
      const idsInNewSet = new Set<string>();

      for (const newQ of initialQuestions) {
        idsInNewSet.add(newQ.id);
        const existingQ = currentQuestionsMap.get(newQ.id);

        if (existingQ) {
          // Question exists, check if it needs an update
          // Compare based on questionVersion or a more complex diff if needed
          if (!existingQ.questionVersion || (newQ.questionVersion && newQ.questionVersion > existingQ.questionVersion) ||
            JSON.stringify(existingQ.options) !== JSON.stringify(newQ.options) || // Basic content check
            existingQ.text !== newQ.text ||
            existingQ.correctAnswerIndex !== newQ.correctAnswerIndex ||
            existingQ.topic !== newQ.topic ||
            existingQ.explanation !== newQ.explanation
          ) {
            console.log(`Updating question: ${newQ.id}`);
            // Merge new data with existing isFavorite status (if you want to preserve user's favorites)
            const questionToPut = {
              ...newQ, // All new data
              isFavorite: existingQ.isFavorite || 0 // Preserve existing favorite status
            };
            puts.push(questionToPut);
          }
        } else {
          // New question, add it
          console.log(`Adding new question: ${newQ.id}`);
          adds.push({ ...newQ, isFavorite: newQ.isFavorite || 0 }); // Ensure isFavorite has a default
        }
      }

      if (puts.length > 0) {
        await questionsTable.bulkPut(puts);
        console.log(`Updated ${puts.length} questions.`);
      }
      if (adds.length > 0) {
        await questionsTable.bulkAdd(adds);
        console.log(`Added ${adds.length} new questions.`);
      }

      // Optional: Handle questions removed from initialQuestions.ts
      // For now, we'll keep them in the DB (soft delete would be better if actual removal is needed)
      // If you want to hard-delete questions no longer in initialQuestions:
      // const deletes: string[] = [];
      // currentQuestionsInDb.forEach(dbQ => {
      //   if (!idsInNewSet.has(dbQ.id)) {
      //     deletes.push(dbQ.id);
      //   }
      // });
      // if (deletes.length > 0) {
      //   await questionsTable.bulkDelete(deletes);
      //   console.log(`Deleted ${deletes.length} questions no longer in the initial set.`);
      //   // BE CAREFUL: This will break display of old quiz attempts if they used these questions,
      //   // unless quiz attempts store full question snapshots.
      // }

    });

    // Initial population for a brand new database (version 1 or first time this version runs)
    // This on.populate only runs if the DB is being created from scratch.
    // The upgrade handler above deals with existing DBs.
    this.on('populate', async () => {
      console.log('Populating new database...');
      const questionsWithDefaults = initialQuestions.map(q => ({
        ...q,
        isFavorite: q.isFavorite || 0, // Ensure default for isFavorite
        questionVersion: q.questionVersion || 1 // Ensure default for questionVersion
      }));
      let currentQuestion = null;
      try {
        for (const quest of questionsWithDefaults) {
          currentQuestion = quest;
          await this.questions.add(quest);
        }
      }  catch (error) {
        console.error('Error populating initial questions:', currentQuestion);
      }
      console.log('Database populated with initial questions.');
    });

    //this.loadInitialQuestions();
  }

  public loadInitialQuestions(): void {
    this.http.get<Question[]>(this.jsonPath).pipe(
      tap(questions => {
        this.allQuestionsSubject.next(questions);
        const uniqueTopics = [...new Set(questions.map(q => q.topic))];
        this.topicsSubject.next(uniqueTopics);
        // Optionally load a default topic or all questions initially
        this.currentTopicQuestionsSubject.next(questions);
        console.log("Questions loaded and topics extracted.");
      }),
      catchError(this.handleError)
    ).subscribe(questions => {
      this.questions.bulkAdd(questions);
    });
  }

  private handleError(error: any) {
    console.error('An error occurred while fetching questions:', error);
    return throwError(() => new Error('Something bad happened; please try again later.'));
  }

  // Optional: Method to populate initial data if the DB is empty
  // src/app/core/services/database.service.ts

  // ... other imports and AppDB class definition ...

  // ... constructor and schema definition ...

  // BehaviorSubjects to hold and broadcast data
  private allQuestionsSubject = new BehaviorSubject<Question[]>([]);
  allQuestions$ = this.allQuestionsSubject.asObservable();

  private currentTopicQuestionsSubject = new BehaviorSubject<Question[]>([]);
  currentTopicQuestions$ = this.currentTopicQuestionsSubject.asObservable();

  private topicsSubject = new BehaviorSubject<string[]>([]);
  topics$ = this.topicsSubject.asObservable();

  async populateInitialDataIfNeeded() {
    const questionCount = await this.questions.count();
    if (questionCount === 0) {
      console.log('Populating initial question data with stats fields...');
      const sampleQuestions: any[] = initialQuestions
        .map(q => ({
          ...q,
          timesCorrect: q.timesCorrect || 0, // Initialize new fields
          timesIncorrect: q.timesIncorrect || 0, // Initialize new fields,
          isFavorite: q.isFavorite || 0 // Initialize new field
        }));
      let currentQuestion = null;
      try {
        // FOR TESTING WRONG QUESTIONS
        // for (const quest of sampleQuestions) {
        //   currentQuestion = quest;
        //           console.log('Adding quest: ',quest);
        //   await this.questions.add(quest);
        // }
        await this.questions.bulkAdd(sampleQuestions);
        console.log('Initial questions (expanded set) added successfully.');
      } catch (error) {
        console.error('Error populating initial questions:', error);
      }
    } else {
      console.log('Question data already exists. Not repopulating.');
    }
  }
  // ... rest of DatabaseService ...
}


@Injectable({
  providedIn: 'root' // Ensures this service is a singleton
})
export class DatabaseService {
  private db: AppDB;

  constructor(private http: HttpClient, private authService: AuthService) {
    console.log('DatabaseService constructor called.'); // <-- ADD THIS
    this.db = new AppDB(http);

    //if (!this.authService.isAuthenticated()) { // <<< CHECK AUTHENTICATION
    //  console.log("User not authenticated. Questions not loaded.");
    //  // You might want to listen for login events to then fetch questions
    //  return;
    //}


    this.db.open().then(async () => {
      console.log('Database opened successfully.');
      //this.db.loadInitialQuestions(); // Call populate here
      //this.resetDatabase();

      await this.db.populateInitialDataIfNeeded(); // Call populate here
    }).catch(err => {
      console.error('Failed to open database: ', err.stack || err);
    });
  }

  // --- Question Table Methods ---
  getAllQuestions(): Promise<Question[]> {
    return this.db.questions.toArray();
  }

  getAllQuestionAnsweredAtLeastOnce(): Promise<Question[]> {
    return this.db.questions
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) > 0 || (question?.timesIncorrect ?? 0) > 0))
      .toArray();
  }

  getAllQuestionCorrectlyAnsweredAtLeastOnce(): Promise<Question[]> {
    return this.db.questions
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) > 0))
      .toArray();
  }

  getOnlyQuestionCorrectlyAnswered(): Promise<Question[]> {
    return this.db.questions
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) > 0 && (question?.timesIncorrect ?? 0) === 0))
      .toArray();
  }

  getQuestionsByCorrectnessRange(min: number, max: number): Promise<Question[]> {
    return this.db.questions
      .filter(question => question !== undefined && this.rateofCorrectlyAnswered(question) >= min && this.rateofCorrectlyAnswered(question) >= min)
      .toArray();
  }

  getAllQuestionNeverAnswered(): Promise<Question[]> {
    return this.db.questions
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) === 0 && (question?.timesIncorrect ?? 0) === 0))
      .toArray();
  }

  getAllQuestionWronglyAnsweredAtLeastOnce(): Promise<Question[]> {
    return this.db.questions
      .filter(question => question !== undefined && ((question?.timesIncorrect ?? 0) > 0))
      .toArray();
  }

  rateofCorrectlyAnswered(question: Question): number {
    return ((question.timesCorrect ?? 0) / ((question.timesCorrect ?? 0) + (question.timesIncorrect ?? 0))) * 100;
  }

  getAllQuestionWhichYouAreQuiteGoodAt(min: number, max?: number): Promise<Question[]> {
    if (min && max) {
      return this.db.questions
        .filter(question => question !== undefined && this.rateofCorrectlyAnswered(question) >= min && this.rateofCorrectlyAnswered(question) <= max)
        .toArray();
    } else if (min && !max) {
      return this.db.questions
        .filter(question => question !== undefined && this.rateofCorrectlyAnswered(question) >= min)
        .toArray();
    } else if (!min && max) {
      return this.db.questions
        .filter(question => question !== undefined && this.rateofCorrectlyAnswered(question) <= min)
        .toArray();
    }
    return Promise.resolve([]);
  }



  getQuestionsByTopic(topic: string): Promise<Question[]> {
    return this.db.questions.where('topic').equalsIgnoreCase(topic).toArray();
  }

  getQuestionsByTopics(topics: string[]): Promise<Question[]> {
    if (!topics || topics.length === 0) {
      return this.getAllQuestions(); // Or handle as an error/empty array
    }
    return this.db.questions.where('topic').anyOfIgnoreCase(topics).toArray();
  }

  // get question by id
  getQuestionById(id: string): Promise<Question | undefined> {
    return this.db.questions.get(id);
  }

  // Method to fetch questions by a list of IDs
  async getQuestionByIds(ids: string[]): Promise<Question[]> {
    if (!ids || ids.length === 0) {
      return Promise.resolve([]); // Return empty array if no IDs are provided
    }

    const questions: Question[] = [];

    // Dexie's `bulkGet()` is efficient for fetching multiple items by their primary keys.
    for (const id of ids) {
      const question = await this.db.questions.where("id").equalsIgnoreCase(id).first();
      if (question) {
        questions.push(question);
      }
    }
    return questions;
  }

  // Example of getting a specific number of random questions from selected topics
  async getRandomQuestions(
    count: number, // Overall target count, or sum from distribution
    topics: string[] = [], // For simple mode or fallback
    keywords: string[] = [],
    questiondIDs: string[] = [],
    topicDistribution?: TopicCount[] // <-- NEW: Topic distribution
  ): Promise<Question[]> {
    console.log('[DBService] getRandomQuestions called with:', { count, topics, keywords, topicDistribution });

    let allFetchedQuestions: Question[] = [];

    if (topicDistribution && topicDistribution.length > 0) {
      // Mode 1: Use topicDistribution
      console.log('[DBService] Using Topic Distribution:', topicDistribution);
      for (const dist of topicDistribution) {
        if (dist.count <= 0) continue;

        let query = null;
        if (questiondIDs && questiondIDs.length > 0) {
          query = this.db.questions.where('topic').equalsIgnoreCase(dist.topic).filter(qst => questiondIDs.includes(qst.id));
        } else {
          query = this.db.questions.where('topic').equalsIgnoreCase(dist.topic);
        }
        let topicSpecificQuestions = await query.toArray();

        // Apply keyword filter if keywords are present
        if (keywords.length > 0) {
          topicSpecificQuestions = topicSpecificQuestions.filter(question => {
            const questionTextLower = question.text.toLowerCase();
            return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
          });
        }

        // Shuffle and take specified count for this topic
        const shuffledTopicQuestions = topicSpecificQuestions.sort(() => 0.5 - Math.random());
        allFetchedQuestions.push(...shuffledTopicQuestions.slice(0, dist.count));
      }
      // Shuffle all collected questions together at the end
      allFetchedQuestions.sort(() => 0.5 - Math.random());
      console.log('[DBService] Total questions from distribution:', allFetchedQuestions.length, allFetchedQuestions);
      return allFetchedQuestions;

    } else {
      // Mode 2: Simple mode (all topics or selected topics with global count)
      let query = null;
      if (questiondIDs && questiondIDs.length > 0) {
        query = this.getQuestionByIds(questiondIDs);
      } else {
        console.log('[DBService] Using Simple Mode. Topics:', topics, 'Global count:', count);
        query = this.getQuestionsByTopics(topics);
      }

      let filteredQuestions = await query;

      if (keywords.length > 0) {
        filteredQuestions = filteredQuestions.filter(question => {
          const questionTextLower = question.text.toLowerCase();
          return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
        });
      }

      const shuffled = filteredQuestions.sort(() => 0.5 - Math.random());
      const result = shuffled.slice(0, count);
      console.log('[DBService] Questions from simple mode:', result.length, result);
      return result;
    }
  }

  async addQuestion(question: Question): Promise<string> {
    const questionWithDefaults = {
      ...question,
      isFavorite: question.isFavorite || 0,
      questionVersion: question.questionVersion || 1
    };
    return this.db.questions.add(questionWithDefaults);
  }

  async updateQuestion(id: string, changes: Partial<Question>): Promise<number> {
    // If updating content, also update questionVersion
    if (changes.text || changes.options || changes.correctAnswerIndex || changes.topic || changes.explanation) {
      const currentQuestion = await this.db.questions.get(id);
      changes.questionVersion = (currentQuestion?.questionVersion || 0) + 1;
    }
    return this.db.questions.update(id, changes);
  }

  deleteQuestion(id: string): Promise<void> {
    return this.db.questions.delete(id);
  }

  // --- QuizAttempt Table Methods ---
  addQuizAttempt(quizAttempt: QuizAttempt): Promise<string> {
    return this.db.quizAttempts.add(quizAttempt);
  }

  getAllQuizAttempts(): Promise<QuizAttempt[]> {
    // Order by most recent first
    return this.db.quizAttempts.orderBy('timestampEnd').reverse().toArray();
  }

  getAllTodayQuizAttempts(): Promise<QuizAttempt[]> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return this.db.quizAttempts
      .where('timestampStart')
      .between(startOfDay, endOfDay)
      .or('timestampEnd')
      .between(startOfDay, endOfDay)
      .toArray();
  }

  getAllYesterdayQuizAttempts(): Promise<QuizAttempt[]> {
    const today = new Date();
    const startOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const endOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return this.db.quizAttempts
      .where('timestampStart')
      .between(startOfYesterday, endOfYesterday)
      .or('timestampEnd')
      .between(startOfYesterday, endOfYesterday)
      .toArray();
  }

  // --- NEW METHOD: Get Yesterday's Wrong/Unanswered Question IDs ---
  async getYesterdayProblematicQuestionIds(): Promise<string[]> {
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date();
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayAttempts = await this.db.quizAttempts
      .where('timestampEnd') // Assuming timestampEnd is set when a quiz is completed/paused
      .between(yesterdayStart, yesterdayEnd, true, true)
      .toArray();

    const problematicQuestionIds = new Set<string>();

    yesterdayAttempts.forEach(attempt => {
      // 1. Questions answered incorrectly
      attempt.answeredQuestions.forEach(answeredQ => {
        if (!answeredQ.isCorrect && !problematicQuestionIds.has(answeredQ.questionId)) {
          problematicQuestionIds.add(answeredQ.questionId);
        }
      });

      // 2. Questions that were part of the quiz but not in answeredQuestions (i.e., unanswered)
      //    We rely on `attempt.allQuestions` which should have all questions *in that attempt*.
      if (attempt.allQuestions && attempt.allQuestions.length > 0) {
        const answeredIds = new Set(attempt.answeredQuestions.map(aq => aq.questionId));
        attempt.allQuestions.forEach(qInfoInAttempt => {
          if (!answeredIds.has(qInfoInAttempt.questionId) && !problematicQuestionIds.has(qInfoInAttempt.questionId)) {
            problematicQuestionIds.add(qInfoInAttempt.questionId);
          }
        });
      }
      // Fallback or alternative: if `unansweredQuestions` array is reliably populated on quiz end/pause
      // attempt.unansweredQuestions?.forEach(unansweredQ => {
      //   if (unansweredQ) problematicQuestionIds.add(unansweredQ.questionId);
      // });
    });

    return Array.from(problematicQuestionIds);
  }
  // --- END NEW METHOD

  // --- NEW METHOD: Get Todays's Wrong/Unanswered Question IDs ---
  async getTodayProblematicQuestionIds(): Promise<string[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setDate(todayEnd.getDate());
    todayEnd.setHours(23, 59, 59, 999);

    const todayAttempts = await this.db.quizAttempts
      .where('timestampEnd') // Assuming timestampEnd is set when a quiz is completed/paused
      .between(todayStart, todayEnd, true, true)
      .toArray();

    const problematicQuestionIds = new Set<string>();

    todayAttempts.forEach(attempt => {
      // 1. Questions answered incorrectly
      attempt.answeredQuestions.forEach(answeredQ => {
        if (!answeredQ.isCorrect && !problematicQuestionIds.has(answeredQ.questionId)) {
          problematicQuestionIds.add(answeredQ.questionId);
        }
      });

      // 2. Questions that were part of the quiz but not in answeredQuestions (i.e., unanswered)
      //    We rely on `attempt.allQuestions` which should have all questions *in that attempt*.
      if (attempt.allQuestions && attempt.allQuestions.length > 0) {
        const answeredIds = new Set(attempt.answeredQuestions.map(aq => aq.questionId));
        attempt.allQuestions.forEach(qInfoInAttempt => {
          if (!answeredIds.has(qInfoInAttempt.questionId) && !problematicQuestionIds.has(qInfoInAttempt.questionId)) {
            problematicQuestionIds.add(qInfoInAttempt.questionId);
          }
        });
      }
      // Fallback or alternative: if `unansweredQuestions` array is reliably populated on quiz end/pause
      // attempt.unansweredQuestions?.forEach(unansweredQ => {
      //   if (unansweredQ) problematicQuestionIds.add(unansweredQ.questionId);
      // });
    });

    return Array.from(problematicQuestionIds);
  }
  // --- END NEW METHOD

  // --- NEW METHOD: Get Todays's Wrong/Unanswered Question ---
  async getTodayProblematicQuestion(): Promise<Question[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setDate(todayEnd.getDate());
    todayEnd.setHours(23, 59, 59, 999);

    const todayAttempts = await this.db.quizAttempts
      .where('timestampEnd') // Assuming timestampEnd is set when a quiz is completed/paused
      .between(todayStart, todayEnd, true, true)
      .toArray();

    const problematicQuestion = new Set<Question>();

    todayAttempts.forEach(attempt => {
      // 1. Questions answered incorrectly
      attempt.answeredQuestions.forEach(answeredQ => {
        if (!answeredQ.isCorrect) {
          problematicQuestion.add({
            ...answeredQ.questionSnapshot,
            id: answeredQ.questionId // Ensure the id is included
          });
        }
      });

      // 2. Questions that were part of the quiz but not in answeredQuestions (i.e., unanswered)
      //    We rely on `attempt.allQuestions` which should have all questions *in that attempt*.
      if (attempt.allQuestions && attempt.allQuestions.length > 0) {
        const answeredIds = new Set(attempt.answeredQuestions.map(aq => aq.questionId));
        attempt.allQuestions.forEach(qInfoInAttempt => {
          if (!answeredIds.has(qInfoInAttempt.questionId)) {
            problematicQuestion.add({
              ...qInfoInAttempt.questionSnapshot,
              id: qInfoInAttempt.questionId // Ensure the id is included
            });
          }
        });
      }
      // Fallback or alternative: if `unansweredQuestions` array is reliably populated on quiz end/pause
      // attempt.unansweredQuestions?.forEach(unansweredQ => {
      //   if (unansweredQ) problematicQuestionIds.add(unansweredQ.questionId);
      // });
    });

    // Ensure unique records by using a Map with question IDs as keys
    const uniqueProblematicQuestions = new Map<string, Question>();
    problematicQuestion.forEach(question => {
      if (!uniqueProblematicQuestions.has(question.id)) {
        uniqueProblematicQuestions.set(question.id, question);
      }
    });
    problematicQuestion.clear();
    uniqueProblematicQuestions.forEach((question) => problematicQuestion.add(question));

    return Promise.resolve(Array.from(uniqueProblematicQuestions.values()));
  }
  // --- END NEW METHOD

  // --- NEW METHOD: Get Yesterdays's Wrong/Unanswered Question ---
  async getYesterdayProblematicQuestion(): Promise<Question[]> {
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date();
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayAttempts = await this.db.quizAttempts
      .where('timestampEnd') // Assuming timestampEnd is set when a quiz is completed/paused
      .between(yesterdayStart, yesterdayEnd, true, true)
      .toArray();

    const problematicQuestion = new Set<Question>();

    yesterdayAttempts.forEach(attempt => {
      // 1. Questions answered incorrectly
      attempt.answeredQuestions.forEach(answeredQ => {
        if (!answeredQ.isCorrect) {
          problematicQuestion.add({
            ...answeredQ.questionSnapshot,
            id: answeredQ.questionId // Ensure the id is included
          });
        }
      });

      // 2. Questions that were part of the quiz but not in answeredQuestions (i.e., unanswered)
      //    We rely on `attempt.allQuestions` which should have all questions *in that attempt*.
      if (attempt.allQuestions && attempt.allQuestions.length > 0) {
        const answeredIds = new Set(attempt.answeredQuestions.map(aq => aq.questionId));
        attempt.allQuestions.forEach(qInfoInAttempt => {
          if (!answeredIds.has(qInfoInAttempt.questionId)) {
            problematicQuestion.add({
              ...qInfoInAttempt.questionSnapshot,
              id: qInfoInAttempt.questionId // Ensure the id is included
            });
          }
        });
      }
      // Fallback or alternative: if `unansweredQuestions` array is reliably populated on quiz end/pause
      // attempt.unansweredQuestions?.forEach(unansweredQ => {
      //   if (unansweredQ) problematicQuestionIds.add(unansweredQ.questionId);
      // });
    });

    // Ensure unique records by using a Map with question IDs as keys
    const uniqueProblematicQuestions = new Map<string, Question>();
    problematicQuestion.forEach(question => {
      if (!uniqueProblematicQuestions.has(question.id)) {
        uniqueProblematicQuestions.set(question.id, question);
      }
    });
    problematicQuestion.clear();
    uniqueProblematicQuestions.forEach((question) => problematicQuestion.add(question));

    return Promise.resolve(Array.from(uniqueProblematicQuestions.values()));
  }
  // --- END NEW METHOD


  getQuizAttemptById(id: string): Promise<QuizAttempt | undefined> {
    return this.db.quizAttempts.get(id);
  }

  deleteQuizAttempt(id: string): Promise<void> {
    return this.db.quizAttempts.delete(id);
  }

  clearAllQuizAttempts(): Promise<void> {
    return this.db.quizAttempts.clear();
  }

  clearAllQuestions(): Promise<void> {
    return this.db.questions.clear();
  }

  // --- General DB Methods ---
  async resetDatabase(): Promise<void> {
    await this.clearAllQuestions();
    await this.clearAllQuizAttempts();
    // Optionally re-populate initial questions or leave it empty
    await this.db.populateInitialDataIfNeeded();
    //this.db.loadInitialQuestions();
    console.log('Database has been reset.');
  }

  saveQuizAttempt(quizAttempt: QuizAttempt): Promise<string> {
    console.log('[DBService] Saving/Updating Quiz Attempt:', quizAttempt.id, 'Status:', quizAttempt.status);
    return this.db.quizAttempts.put(quizAttempt); // put will add if new, update if exists
  }

  async getPausedQuiz(): Promise<QuizAttempt | undefined> {
    // Assuming only one quiz can be paused at a time.
    // If multiple could be paused, this logic would need to change (e.g., return an array or most recent).
    const pausedAttempts = await this.db.quizAttempts.where('status').equals('paused').toArray();
    if (pausedAttempts.length > 0) {
      console.log('[DBService] Found paused quiz:', pausedAttempts[0]);
      // Optionally sort by timestampStart descending if multiple are somehow paused, and return the latest.
      return pausedAttempts.sort((a, b) => new Date(b.timestampStart).getTime() - new Date(a.timestampStart).getTime())[0];
    }
    return undefined;
  }

  // Method to update question stats
  async updateQuestionStats(questionId: string, wasCorrect: boolean): Promise<void> {
    try {
      const question = await this.db.questions.get(questionId);
      if (question) {
        question.timesCorrect = question.timesCorrect || 0;
        question.timesIncorrect = question.timesIncorrect || 0;
        if (wasCorrect) {
          question.timesCorrect++;
        } else {
          question.timesIncorrect++;
        }
        await this.db.questions.put(question); // Update the question
        // console.log(`Stats updated for question ${questionId}: C=${question.timesCorrect}, I=${question.timesIncorrect}`);
      }
    } catch (error) {
      console.error(`Error updating stats for question ${questionId}:`, error);
    }
  }

  async toggleFavoriteStatus(questionId: string): Promise<number | undefined> {
    const question = await this.db.questions.get(questionId);
    if (question) {
      question.isFavorite = question.isFavorite ? 0 : 1; // Toggle between 0 and 1
      await this.db.questions.put(question);
      console.log(`Question ${questionId} favorite status: ${question.isFavorite}`);
      return question.isFavorite;
    }
    console.warn(`Question ${questionId} not found for toggling favorite.`);
    return undefined;
  }

  getFavoriteQuestions(): Promise<Question[]> {
    return this.db.questions.where('isFavorite').equals(1).toArray(); // Fixed boolean indexing
  }

  // Call this method after successful login
  public async onUserLoggedIn(): Promise<void> {
    await this.db.populateInitialDataIfNeeded(); // Call populate here
  }

  async getAllQuestionsNew(): Promise<Question[]> {
    // Implement logic to fetch every single question from your database
    // Example using Dexie:
    // return this.db.questions.toArray();
    // This is highly dependent on your actual database implementation.
    // For now, a placeholder:
    console.warn("DatabaseService.getAllQuestions() needs to be implemented fully.");
    const allAttempts = await this.getAllQuizAttempts();
    const questionMap = new Map<string, Question>();
    allAttempts.forEach(attempt => {
      attempt.allQuestions.forEach(qInfo => {
        if (!questionMap.has(qInfo.questionId)) {
          questionMap.set(qInfo.questionId, {
            id: qInfo.questionId,
            text: qInfo.questionSnapshot.text,
            options: qInfo.questionSnapshot.options,
            correctAnswerIndex: qInfo.questionSnapshot.correctAnswerIndex,
            topic: qInfo.questionSnapshot.topic,
            explanation: qInfo.questionSnapshot.explanation,
            // isFavorite might not be in snapshot or needs to be fetched separately
          });
        }
      });
    });
    return Array.from(questionMap.values());
    // return Promise.resolve([]); // Replace with actual implementation
  }


}
