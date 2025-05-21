// src/app/core/services/database.service.ts
import {Injectable, OnDestroy} from '@angular/core';
import {Question} from '../../models/question.model'; // Adjust path if necessary
import {AnsweredQuestion, QuizAttempt, TopicCount} from '../../models/quiz.model';   // Adjust path if necessary
import {AppDB} from './appDB';
import {SupabaseService} from './supabase-service.service'; // Your Supabase client wrapper
import {PostgrestError, SupabaseClient} from '@supabase/supabase-js';
import {AuthService} from './auth.service';
import {Subscription} from 'rxjs'; // Added import

// Define a more specific interface for the expected Supabase response structure
// This helps in typing the 'data' and 'error' properties consistently.
interface BaseSupabaseResponse {
  data: any | null; // Can be an array of items, a single item, or null
  error: PostgrestError | null;
  // Supabase responses also include 'count', 'status', 'statusText', etc.
  // but handleSupabaseFetch primarily uses 'data' and 'error'.
}

@Injectable({
  providedIn: 'root' // Ensures this service is a singleton
})
export class DatabaseService implements OnDestroy {
  private dexieDB!: AppDB; // Changed: Definite assignment assertion
  private supabase: SupabaseClient;
  private isDbInitialized = false; // Added: Flag to track DB initialization
  private authSubscription: Subscription | undefined; // Added: For managing subscription

  constructor(
    private supabaseService: SupabaseService,
    private authService: AuthService,
  ) {
    console.log('DatabaseService constructor called.');
    this.supabase = this.supabaseService.client; // Changed to use the client getter

    // Subscribe to user authentication state
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      if (user && !this.isDbInitialized) {
        console.log('User authenticated, initializing AppDB in DatabaseService.');
        this.dexieDB = new AppDB(this.authService); // Initialize Dexie
        this.dexieDB.open().then(() => {
          console.log('DexieDB opened successfully by DatabaseService.');
          this.isDbInitialized = true;
        }).catch(err => {
          console.error('Failed to open DexieDB from DatabaseService: ', err.stack || err);
          // Optionally, reset isDbInitialized or handle error state more robustly
        });
      } else if (!user && this.isDbInitialized) {
        // User logged out, and DB was initialized
        console.log('User logged out. DexieDB was initialized. Consider cleanup if needed.');
        this.isDbInitialized = false;
      }
    });
  }

  // Added: ngOnDestroy lifecycle hook to unsubscribe
  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  // --- Helper for mapping Supabase (snake_case) to App (camelCase) ---
  private mapQuestionFromSupabase(supabaseQuestion: any): Question {
    if (!supabaseQuestion) return undefined as any;
    return {
      id: supabaseQuestion.id,
      text: supabaseQuestion.text,
      topic: supabaseQuestion.topic,
      options: supabaseQuestion.options,
      correctAnswerIndex: supabaseQuestion.correct_answer_index,
      explanation: supabaseQuestion.explanation,
      difficulty: supabaseQuestion.difficulty,
      timesCorrect: supabaseQuestion.times_correct,
      timesIncorrect: supabaseQuestion.times_incorrect,
      isFavorite: supabaseQuestion.is_favorite,
      questionVersion: supabaseQuestion.question_version,
      lastAnsweredTimestamp: supabaseQuestion.last_answered_timestamp,
      lastAnswerCorrect: supabaseQuestion.last_answer_correct,
      accuracy: supabaseQuestion.accuracy,
      publicContest: supabaseQuestion.public_contest,
    };
  }

  private mapQuestionToSupabase(appQuestion: Partial<Question>): any {
    const supabaseQuestion: any = {};
    if (appQuestion.id !== undefined) supabaseQuestion.id = appQuestion.id;
    if (appQuestion.text !== undefined) supabaseQuestion.text = appQuestion.text;
    if (appQuestion.topic !== undefined) supabaseQuestion.topic = appQuestion.topic;
    if (appQuestion.options !== undefined) supabaseQuestion.options = appQuestion.options;
    if (appQuestion.correctAnswerIndex !== undefined) supabaseQuestion.correct_answer_index = appQuestion.correctAnswerIndex;
    if (appQuestion.explanation !== undefined) supabaseQuestion.explanation = appQuestion.explanation;
    if (appQuestion.difficulty !== undefined) supabaseQuestion.difficulty = appQuestion.difficulty;
    if (appQuestion.timesCorrect !== undefined) supabaseQuestion.times_correct = appQuestion.timesCorrect;
    if (appQuestion.timesIncorrect !== undefined) supabaseQuestion.times_incorrect = appQuestion.timesIncorrect;
    if (appQuestion.isFavorite !== undefined) supabaseQuestion.is_favorite = appQuestion.isFavorite;
    if (appQuestion.questionVersion !== undefined) supabaseQuestion.question_version = appQuestion.questionVersion;
    if (appQuestion.lastAnsweredTimestamp !== undefined) supabaseQuestion.last_answered_timestamp = appQuestion.lastAnsweredTimestamp;
    if (appQuestion.lastAnswerCorrect !== undefined) supabaseQuestion.last_answer_correct = appQuestion.lastAnswerCorrect;
    if (appQuestion.accuracy !== undefined) supabaseQuestion.accuracy = appQuestion.accuracy;
    if (appQuestion.publicContest !== undefined) supabaseQuestion.public_contest = appQuestion.publicContest;
    return supabaseQuestion;
  }

  private mapQuizAttemptFromSupabase(supabaseAttempt: any): QuizAttempt {
    if (!supabaseAttempt) return undefined as any;
    return {
      id: supabaseAttempt.id,
      timestampStart: new Date(supabaseAttempt.timestamp_start),
      timestampEnd: supabaseAttempt.timestamp_end ? new Date(supabaseAttempt.timestamp_end) : undefined,
      settings: supabaseAttempt.settings,
      score: supabaseAttempt.score,
      totalQuestionsInQuiz: supabaseAttempt.total_questions_in_quiz,
      answeredQuestions: supabaseAttempt.answered_questions || [],
      unansweredQuestions: supabaseAttempt.unanswered_questions || [],
      allQuestions: supabaseAttempt.all_questions || [],
      status: supabaseAttempt.status,
      currentQuestionIndex: supabaseAttempt.current_question_index,
      timeLeftOnPauseSeconds: supabaseAttempt.time_left_on_pause_seconds,
      timeElapsedOnPauseSeconds: supabaseAttempt.time_elapsed_on_pause_seconds,
    };
  }

  private mapQuizAttemptToSupabase(appAttempt: Partial<QuizAttempt>): any {
    const supabaseAttempt: any = {};
    if (appAttempt.id !== undefined) supabaseAttempt.id = appAttempt.id;
    if (appAttempt.timestampStart !== undefined) supabaseAttempt.timestamp_start = appAttempt.timestampStart.toISOString();
    if (appAttempt.timestampEnd !== undefined) supabaseAttempt.timestamp_end = appAttempt.timestampEnd?.toISOString();
    if (appAttempt.settings !== undefined) {
      supabaseAttempt.settings = appAttempt.settings;
      supabaseAttempt.num_questions_setting = appAttempt.settings.numQuestions;
      supabaseAttempt.selected_topics_setting = appAttempt.settings.selectedTopics;
      supabaseAttempt.difficulty_setting = appAttempt.settings.difficulty;
      supabaseAttempt.keywords_setting = appAttempt.settings.keywords;
      supabaseAttempt.topic_distribution_setting = appAttempt.settings.topicDistribution;
      supabaseAttempt.enable_timer_setting = appAttempt.settings.enableTimer;
      supabaseAttempt.enable_cronometer_setting = appAttempt.settings.enableCronometer;
      supabaseAttempt.enable_streak_sounds_setting = appAttempt.settings.enableStreakSounds;
      supabaseAttempt.timer_duration_seconds_setting = appAttempt.settings.timerDurationSeconds;
      supabaseAttempt.question_ids_setting = appAttempt.settings.questionIDs;
      supabaseAttempt.public_contest_setting = appAttempt.settings.publicContest;
    }
    if (appAttempt.score !== undefined) supabaseAttempt.score = appAttempt.score;
    if (appAttempt.totalQuestionsInQuiz !== undefined) supabaseAttempt.total_questions_in_quiz = appAttempt.totalQuestionsInQuiz;
    if (appAttempt.answeredQuestions !== undefined) supabaseAttempt.answered_questions = appAttempt.answeredQuestions;
    if (appAttempt.unansweredQuestions !== undefined) supabaseAttempt.unanswered_questions = appAttempt.unansweredQuestions;
    if (appAttempt.allQuestions !== undefined) supabaseAttempt.all_questions = appAttempt.allQuestions;
    if (appAttempt.status !== undefined) supabaseAttempt.status = appAttempt.status;
    if (appAttempt.currentQuestionIndex !== undefined) supabaseAttempt.current_question_index = appAttempt.currentQuestionIndex;
    if (appAttempt.timeLeftOnPauseSeconds !== undefined) supabaseAttempt.time_left_on_pause_seconds = appAttempt.timeLeftOnPauseSeconds;
    if (appAttempt.timeElapsedOnPauseSeconds !== undefined) supabaseAttempt.time_elapsed_on_pause_seconds = appAttempt.timeElapsedOnPauseSeconds;
    return supabaseAttempt;
  }

  // Updated handleSupabaseFetch method
  private async handleSupabaseFetch<T>( // T is the type of the mapped application model (e.g., Question)
    supabaseQuery: PromiseLike<BaseSupabaseResponse>, // Changed from Promise to PromiseLike, and using BaseSupabaseResponse
    mapFunction: (item: any) => T, // Maps a single raw item from Supabase to T
    cacheUpdateFunction: (items: T[]) => Promise<any>, // Expects an array of T for caching
    dexieFallbackQuery: () => Promise<T[] | T | undefined>, // Fallback can return T[] or T
    operationName: string,
    isSingleItem: boolean = false // Indicates if the expected outcome is a single T or T[]
  ): Promise<T[] | T | undefined> { // Return type matches dexieFallbackQuery possibilities
    try {
      const response = await supabaseQuery; // await works on PromiseLike
      const rawData = response.data; // This is `any` from BaseSupabaseResponse, could be Item[] or Item
      const error = response.error;

      // PGRST116: "The result contains 0 rows" - typically for .single() queries that find nothing.
      // This is not an actual error for our logic if isSingleItem is true and no data is fine.
      if (error && (!isSingleItem || (error as any).code !== 'PGRST116')) {
        console.error(`Supabase error during ${operationName}:`, error);
        if (!navigator.onLine) {
          console.warn(`[DatabaseService] Offline: Falling back to Dexie for ${operationName}. Data might be stale.`);
          return dexieFallbackQuery();
        }
        throw error;
      }

      let mappedResults: T[] = []; // Always work with an array internally for mapping and caching

      if (Array.isArray(rawData)) {
        mappedResults = rawData.map(mapFunction).filter(item => item !== undefined) as T[]; // Filter out undefined results from mapping
      } else if (rawData) { // Single item was returned (and it's not null)
        const mappedItem = mapFunction(rawData);
        if (mappedItem !== undefined) {
          mappedResults = [mappedItem];
        }
      }
      // If rawData is null (e.g. .single() found nothing and error.code was PGRST116, or an empty array was returned),
      // mappedResults remains [].

      if (mappedResults.length > 0) {
        // Ensure that the items being cached are valid (e.g. not undefined if mapFunction can return that)
        await cacheUpdateFunction(mappedResults.filter(item => item !== undefined) as T[]);
      }

      if (isSingleItem) {
        return mappedResults.length > 0 ? mappedResults[0] : undefined; // Return single item or undefined
      } else {
        return mappedResults; // Return array of items (could be empty if no data or all mapped to undefined)
      }

    } catch (err: any) { // Catch block with explicit 'any' or 'unknown' for err
      // Check if the error is a PostgrestError and handle its 'code' if necessary
      // For instance, if a specific PostgrestError code should also trigger Dexie fallback even when online.
      console.error(`Error in ${operationName}, potentially falling back to Dexie:`, err);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Final fallback to Dexie for ${operationName} due to error. Data might be stale.`);
        return dexieFallbackQuery();
      }
      throw err; // Re-throw if not handled by offline fallback
    }
  }

  // --- Question Table Methods ---

  async getAllQuestionAnsweredAtLeastOnce(contestId: string): Promise<Question[]> {
    const operationName = `getAllQuestionAnsweredAtLeastOnce for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .or('times_correct.gt.0,times_incorrect.gt.0'),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => (q.timesCorrect ?? 0) > 0 || (q.timesIncorrect ?? 0) > 0)
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getAllQuestionCorrectlyAnsweredAtLeastOnce(contestId: string): Promise<Question[]> {
    const operationName = `getAllQuestionCorrectlyAnsweredAtLeastOnce for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .gt('times_correct', 0),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => (q.timesCorrect ?? 0) > 0)
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getAllQuestionCorrectlyAnsweredAtLeastOnceCount(contestId: string): Promise<number> {
    const {count, error} = await this.supabase
      .from('questions')
      .select('id', {count: 'exact', head: true})
      .eq('public_contest', contestId)
      .gt('times_correct', 0);

    if (error) {
      console.error('Error fetching count:', error);
      return 0;
    }
    return count ?? 0;
  }

  async getOnlyQuestionCorrectlyAnswered(contestId: string): Promise<Question[]> {
    const operationName = `getOnlyQuestionCorrectlyAnswered for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .gt('times_correct', 0)
        .eq('times_incorrect', 0),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => (q.timesCorrect ?? 0) > 0 && (q.timesIncorrect ?? 0) === 0)
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getQuestionsByCorrectnessRange(contestId: string, min: number, max: number): Promise<Question[]> {
    const operationName = `getQuestionsByCorrectnessRange for contest ${contestId} (min: ${min}, max: ${max})`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .gte('accuracy', min)
        .lte('accuracy', max),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => this.rateOfCorrectlyAnswered(q) >= min && this.rateOfCorrectlyAnswered(q) <= max) // Corrected Dexie logic
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getAllQuestionNeverAnswered(contestId: string): Promise<string[]> {
    const operationName = `getAllQuestionNeverAnswered for contest ${contestId}`;
    const chunkSize = 1000; // Supabase limit
    let allRows: any[] = [];
    let start = 0;
    while (true) {
      const {data, error} = await this.supabase.from('questions').select('id')
        .eq('public_contest', contestId)
        .eq('times_correct', 0)
        .eq('times_incorrect', 0)
        .range(start, start + chunkSize - 1);
      if (error) {
        console.error('Error fetching rows:', error);
        throw error;
      }
      if (!data || data.length === 0) {
        break; // Exit loop when no more rows are returned
      }
      allRows = allRows.concat(data);
      start += chunkSize; // Move to the next chunk
    }
    return allRows.map(q => q.id); // Return only the IDs
  }

  async getAllQuestionWronglyAnsweredAtLeastOnce(contestId: string): Promise<Question[]> {
    const operationName = `getAllQuestionWronglyAnsweredAtLeastOnce for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .gt('times_incorrect', 0),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => (q.timesIncorrect ?? 0) > 0)
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  rateOfCorrectlyAnswered(question: Question): number {
    const timesCorrect = question.timesCorrect ?? 0;
    const timesIncorrect = question.timesIncorrect ?? 0;
    const totalAnswered = timesCorrect + timesIncorrect;
    if (totalAnswered === 0) return 0; // Or handle as per your preference for never-answered questions
    return (timesCorrect / totalAnswered) * 100;
  }

  async getQuestionsByTopic(contestId: string, topic: string): Promise<Question[]> {
    const operationName = `getQuestionsByTopic for contest ${contestId}, topic '${topic}'`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .ilike('topic', topic), // Case-insensitive match for topic
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => topic.toLowerCase() === (q.topic ?? '').toLowerCase())
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getQuestionsByTopics(contestId: string, topics: string[]): Promise<Question[]> {
    if (!topics || topics.length === 0) {
      return this.getAllQuestions(contestId);
    }
    const operationName = `getQuestionsByTopics for contest ${contestId}, topics [${topics.join(', ')}]`;

    // For Supabase, use OR with ILIKE for each topic
    // Example: .or('topic.ilike.History,topic.ilike.Geography')
    const orConditions = topics.map(t => `topic.ilike.%${t}%`).join(','); // Using % for broader match if needed, adjust if exact match required

    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .or(orConditions),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      async () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        const lowerTopics = topics.map(t => t.toLowerCase());
        return this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => lowerTopics.includes((q.topic ?? '').toLowerCase()))
          .toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getRandomQuestions(
    contestId: string,
    count: number,
    topics: string[] = [],
    keywords: string[] = [],
    questionIDs: string[] = [], // Corrected typo: questiondIDs -> questionIDs
    topicDistribution?: TopicCount[]
  ): Promise<Question[]> {
    console.log('[DBService] getRandomQuestions called with:', {
      count,
      topics,
      keywords,
      questionIDs,
      topicDistribution
    });
    let allFetchedQuestions: Question[] = [];

    try {
      if (topicDistribution && topicDistribution.length > 0) {
        console.log('[DBService] Using Topic Distribution:', topicDistribution);
        for (const dist of topicDistribution) {
          if (dist.count <= 0) continue;

          let topicSpecificQuestions: Question[];
          if (questionIDs && questionIDs.length > 0) {
            // Fetch by specific IDs, then filter by topic client-side
            const questionsById = await this.getQuestionByIds(questionIDs.filter(id => id)); // ensure no undefined ids
            topicSpecificQuestions = questionsById.filter(q =>
              q.publicContest === contestId &&
              dist.topic.toLowerCase() === (q.topic ?? '').toLowerCase()
            );

          } else {
            topicSpecificQuestions = await this.getQuestionsByTopic(contestId, dist.topic);
          }

          if (keywords.length > 0) {
            topicSpecificQuestions = topicSpecificQuestions.filter(q => {
              const questionTextLower = q.text.toLowerCase();
              return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
            });
          }
          const shuffledTopicQuestions = topicSpecificQuestions.sort(() => 0.5 - Math.random());
          allFetchedQuestions.push(...shuffledTopicQuestions.slice(0, dist.count));
        }
      } else {
        console.log('[DBService] Using Simple Mode. Topics:', topics, 'Global count:', count);
        let filteredQuestions: Question[];
        if (questionIDs && questionIDs.length > 0) {
          filteredQuestions = await this.getQuestionByIds(questionIDs.filter(id => id));
          if (contestId) { // Ensure contest ID matches if provided
            filteredQuestions = filteredQuestions.filter(q => q.publicContest === contestId);
          }
        } else if (topics && topics.length > 0) {
          filteredQuestions = await this.getQuestionsByTopics(contestId, topics);
        } else {
          filteredQuestions = await this.getAllQuestions(contestId);
        }

        if (keywords.length > 0) {
          filteredQuestions = filteredQuestions.filter(q => {
            const questionTextLower = q.text.toLowerCase();
            return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
          });
        }
        allFetchedQuestions = filteredQuestions;
      }

      allFetchedQuestions.sort(() => 0.5 - Math.random());
      const result = allFetchedQuestions.slice(0, count);
      console.log('[DBService] Total questions selected:', result.length, result);
      return result;

    } catch (error) {
      console.error(`[DBService] Error in getRandomQuestions, falling back to empty array or simpler Dexie logic if applicable:`, error);
      // Fallback logic for getRandomQuestions is complex.
      // For now, just returning empty or rethrowing.
      // A full Dexie-only version of this function would be needed here for a true fallback.
      // Given the constituent calls (getQuestionsByTopic etc.) handle their own fallbacks,
      // this catch might be for errors during the combination/filtering logic.
      if (!navigator.onLine) {
        console.warn(`[DBService] Offline during getRandomQuestions. Results might be incomplete or based on stale local data.`);
        // Attempt a simplified Dexie version if primary fetches failed severely
        // This is a placeholder for a more robust Dexie-only getRandomQuestions
        const allDexieQuestions = await this.dexieDB.questions.where('publicContest').equals(contestId).toArray();
        return allDexieQuestions.sort(() => 0.5 - Math.random()).slice(0, count);
      }
      throw error;
    }
  }

  async getNeverEncounteredRandomQuestionsByParams(
    contestId: string,
    count: number,
    topics: string[] = [],
    keywords: string[] = [],
    questionIDs: string[] = [], // Corrected typo: questiondIDs -> questionIDs
    topicDistribution?: TopicCount[]
  ): Promise<Question[]> {
    // This method will leverage getRandomQuestions and then filter for never encountered.
    // Or, modify the fetching logic within getRandomQuestions' structure.

    console.log('[DBService] getNeverEncounteredRandomQuestionsByParams called with:', {
      count,
      topics,
      keywords,
      questionIDs,
      topicDistribution
    });
    let allPotentialQuestions: Question[] = [];

    // Adapt logic from getRandomQuestions to fetch candidates
    // Then filter by (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0
    try {
      if (topicDistribution && topicDistribution.length > 0) {
        for (const dist of topicDistribution) {
          if (dist.count <= 0) continue;
          let topicSpecificQuestions: Question[];
          if (questionIDs && questionIDs.length > 0) {
            const questionsById = await this.getQuestionByIds(questionIDs.filter(id => id));
            topicSpecificQuestions = questionsById.filter(q =>
              q.publicContest === contestId &&
              dist.topic.toLowerCase() === (q.topic ?? '').toLowerCase() &&
              (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0
            );
          } else {
            // Fetch all by topic, then filter for never answered
            const allTopicQuestions = await this.getQuestionsByTopic(contestId, dist.topic);
            topicSpecificQuestions = allTopicQuestions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);
          }

          if (keywords.length > 0) {
            topicSpecificQuestions = topicSpecificQuestions.filter(q => {
              const questionTextLower = q.text.toLowerCase();
              return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
            });
          }
          const shuffledTopicQuestions = topicSpecificQuestions.sort(() => 0.5 - Math.random());
          allPotentialQuestions.push(...shuffledTopicQuestions.slice(0, dist.count)); // Take up to dist.count
        }
      } else {
        let baseQuestions: Question[];
        if (questionIDs && questionIDs.length > 0) {
          baseQuestions = await this.getQuestionByIds(questionIDs.filter(id => id));
          if (contestId) {
            baseQuestions = baseQuestions.filter(q => q.publicContest === contestId);
          }
        } else if (topics && topics.length > 0) {
          baseQuestions = await this.getQuestionsByTopics(contestId, topics);
        } else {
          baseQuestions = await this.getAllQuestions(contestId);
        }

        allPotentialQuestions = baseQuestions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);

        if (keywords.length > 0) {
          allPotentialQuestions = allPotentialQuestions.filter(q => {
            const questionTextLower = q.text.toLowerCase();
            return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
          });
        }
      }

      allPotentialQuestions.sort(() => 0.5 - Math.random());
      const result = allPotentialQuestions.slice(0, count);
      console.log('[DBService] Never encountered questions selected:', result.length, result);
      return result;

    } catch (error) {
      console.error(`[DBService] Error in getNeverEncounteredRandomQuestionsByParams:`, error);
      if (!navigator.onLine) {
        console.warn(`[DBService] Offline during getNeverEncounteredRandomQuestionsByParams. Using Dexie fallback.`);
        // Simplified Dexie fallback
        let dexieQuery = this.dexieDB.questions.where('publicContest').equals(contestId)
          .filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);

        // Basic topic and keyword filtering for Dexie fallback
        if (topics.length > 0) {
          const lowerTopics = topics.map(t => t.toLowerCase());
          dexieQuery = dexieQuery.filter(q => lowerTopics.includes((q.topic ?? '').toLowerCase()));
        }
        let dexieCandidates = await dexieQuery.toArray();
        if (keywords.length > 0) {
          dexieCandidates = dexieCandidates.filter(q => {
            const questionTextLower = q.text.toLowerCase();
            return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
          });
        }
        return dexieCandidates.sort(() => 0.5 - Math.random()).slice(0, count);
      }
      throw error;
    }
  }

  async getAllQuizAttemptsByContest(contestId: string | null): Promise<QuizAttempt[]> {
    const operationName = `getAllQuizAttemptsByContest for contest ${contestId}`;
    if (!contestId) return Promise.resolve([]);

    const {data, error} = await this.supabase.from('quiz_attempts')
      .select('*')
      .eq('public_contest_setting', contestId);

    if (error) {
      console.error(`[DatabaseService] Supabase error in ${operationName}:`, error);
      return [];
    }
    return (data ?? []).map(this.mapQuizAttemptFromSupabase);
  }

  async getQuizAttemptsBySpecificDate(contestId: string, date: Date): Promise<QuizAttempt[]> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1); // Exclusive end
    const operationName = `getQuizAttemptsBySpecificDate for contest ${contestId}, date ${date.toDateString()}`;

    return this.handleSupabaseFetch<QuizAttempt>(
      this.supabase.from('quiz_attempts').select('*')
        .eq('public_contest_setting', contestId)
        .gte('timestamp_start', startOfDay.toISOString())
        .lt('timestamp_start', endOfDay.toISOString())
        .order('timestamp_start', {ascending: false}),
      this.mapQuizAttemptFromSupabase,
      (attempts) => this.dexieDB.quizAttempts.bulkPut(attempts),
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.quizAttempts.where('settings.publicContest').equals(contestId)
          .filter(attempt =>
            attempt.timestampStart >= startOfDay && attempt.timestampStart < endOfDay
          )
          .reverse().sortBy('timestampStart');
      },
      operationName
    ) as Promise<QuizAttempt[]>;
  }

  // --- Question Table Methods (Supabase-first from original) ---
  async getAllQuestions(contestId?: string | null): Promise<Question[]> {
    const operationName = `getAllQuestions` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('*');
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('public_contest', contestId);
    }

    return this.handleSupabaseFetch<Question>(
      supabaseQuery,
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      async () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        let dexieQueryBuilder = this.dexieDB.questions;
        if (contestId) {
          return dexieQueryBuilder.where('publicContest').equals(contestId).toArray();
        }
        return dexieQueryBuilder.toArray(); // Fetch all if no contestId
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getQuestionById(id: string): Promise<Question | undefined> {
    const operationName = `getQuestionById for ID ${id}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*').eq('id', id).single(),
      this.mapQuestionFromSupabase,
      async (questions) => {
        if (questions.length > 0) await this.dexieDB.questions.put(questions[0]);
      },
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.questions.get(id);
      },
      operationName,
      true // isSingleItem
    ) as Promise<Question | undefined>;
  }

  async getQuestionByIds(ids: string[]): Promise<Question[]> {
    if (!ids || ids.length === 0) return [];
    // Filter out any undefined/null IDs to prevent Supabase errors
    const validIds = ids.filter(id => id);
    if (validIds.length === 0) return [];

    const operationName = `getQuestionByIds for IDs [${validIds.join(', ')}]`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*').in('id', validIds),
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      async () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return (await this.dexieDB.questions.bulkGet(validIds)).filter(q => q !== undefined) as Question[];
      },
      operationName
    ) as Promise<Question[]>;
  }

  async addQuestion(questionData: Question): Promise<Question> {
    // This method primarily writes; fallback for write is more complex (queueing)
    // For now, prioritize Supabase write, then update Dexie.
    const supabaseData = this.mapQuestionToSupabase(questionData);
    const {data, error} = await this.supabase
      .from('questions')
      .insert(supabaseData)
      .select()
      .single();

    if (error) {
      console.error('Supabase error adding question:', error);
      // Consider offline queueing strategy here if needed
      throw error;
    }
    const newQuestion = this.mapQuestionFromSupabase(data);
    await this.dexieDB.questions.add(newQuestion); // Add to Dexie after successful Supabase add
    return newQuestion;
  }

  async updateQuestion(id: string, changes: Partial<Question>): Promise<Question> {
    const supabaseChanges = this.mapQuestionToSupabase(changes);
    const {data, error} = await this.supabase
      .from('questions')
      .update(supabaseChanges)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating question:', error);
      throw error;
    }
    const updatedQuestion = this.mapQuestionFromSupabase(data);
    await this.dexieDB.questions.put(updatedQuestion);
    return updatedQuestion;
  }

  async deleteQuestion(id: string): Promise<void> {
    const {error} = await this.supabase
      .from('questions')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Supabase error deleting question:', error);
      throw error;
    }
    await this.dexieDB.questions.delete(id);
  }

  // --- QuizAttempt Table Methods (Supabase-first from original) ---
  async saveQuizAttempt(quizAttempt: QuizAttempt): Promise<QuizAttempt> {
    const supabaseAttemptData = this.mapQuizAttemptToSupabase(quizAttempt);
    const {data, error} = await this.supabase
      .from('quiz_attempts')
      .upsert(supabaseAttemptData)
      .select()
      .single();

    if (error) {
      console.error('Supabase error saving quiz attempt:', error);
      // Optionally try to save to Dexie if offline to sync later
      if (!navigator.onLine) {
        console.warn('[DatabaseService] Offline: Saving quiz attempt to Dexie only. Will need sync later.');
        await this.dexieDB.quizAttempts.put(quizAttempt); // Save original attempt to Dexie
        return quizAttempt; // Return original attempt as Supabase failed
      }
      throw error;
    }
    const savedAttempt = this.mapQuizAttemptFromSupabase(data);
    await this.dexieDB.quizAttempts.put(savedAttempt);
    return savedAttempt;
  }

  async getQuizAttemptById(id: string): Promise<QuizAttempt | undefined> {
    const operationName = `getQuizAttemptById for ID ${id}`;
    return this.handleSupabaseFetch<QuizAttempt>(
      this.supabase.from('quiz_attempts').select('*').eq('id', id).single(),
      this.mapQuizAttemptFromSupabase,
      async (attempts) => {
        if (attempts.length > 0) await this.dexieDB.quizAttempts.put(attempts[0]);
      },
      () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        return this.dexieDB.quizAttempts.get(id);
      },
      operationName,
      true // isSingleItem
    ) as Promise<QuizAttempt | undefined>;
  }

  async getAllQuizAttempts(contestId?: string | null, userId?: string): Promise<QuizAttempt[]> {
    const operationName = `getAllQuizAttempts` + (contestId ? ` for contest ${contestId}` : '') + (userId ? ` for user ${userId}` : '');
    let query = this.supabase.from('quiz_attempts').select('*');

    if (contestId) {
      query = query.eq('public_contest_setting', contestId); // Standardized to use this column
    }
    if (userId) {
      // Assuming 'user_id' is a column on quiz_attempts table for multi-user scenarios.
      // If user_id is part of settings JSONB: query = query.eq('settings->>userId', userId);
      // For this example, let's assume a direct user_id column if provided.
      // query = query.eq('user_id', userId); // Uncomment and adjust if you have a user_id column
    }
    query = query.order('timestamp_start', {ascending: false});

    return this.handleSupabaseFetch<QuizAttempt>(
      query,
      this.mapQuizAttemptFromSupabase,
      (attempts) => this.dexieDB.quizAttempts.bulkPut(attempts),
      async () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        let dexieQuery = this.dexieDB.quizAttempts.orderBy('timestampStart').reverse();
        if (contestId) {
          // Dexie uses settings.publicContest based on schema
          const allAttempts = await dexieQuery.toArray();
          return allAttempts.filter(a => a.settings.publicContest === contestId);
        }
        // Add userId filter for Dexie if applicable
        // if (userId) { ... }
        return dexieQuery.toArray();
      },
      operationName
    ) as Promise<QuizAttempt[]>;
  }

  async deleteQuizAttempt(id: string): Promise<void> {
    const {error} = await this.supabase
      .from('quiz_attempts')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Supabase error deleting quiz attempt:', error);
      throw error;
    }
    await this.dexieDB.quizAttempts.delete(id);
  }

  async clearAllQuizAttempts(contestId: string): Promise<void> {
    console.log(`Attempting to clear Supabase quiz attempts for contest: ${contestId}`);
    const {error: supabaseError} = await this.supabase
      .from('quiz_attempts')
      .delete()
      .eq('public_contest_setting', contestId); // Standardized

    if (supabaseError) {
      console.error(`Supabase error clearing quiz attempts for contest ${contestId}:`, supabaseError);
      throw supabaseError;
    }
    console.log(`Supabase quiz attempts cleared for contest ${contestId}. Now clearing Dexie.`);
    const dexieKeysToDelete = await this.dexieDB.quizAttempts
      .where('settings.publicContest').equals(contestId) // Dexie uses settings.publicContest
      .primaryKeys();
    if (dexieKeysToDelete.length > 0) {
      await this.dexieDB.quizAttempts.bulkDelete(dexieKeysToDelete);
    }
    console.log(`Dexie quiz attempts cleared for contest ${contestId}.`);
  }

  // --- Methods requiring more complex logic ---
  async getProblematicQuestionsIdsByDate(
    dateSpecifier: 'today' | 'yesterday' | Date,
    contestId: string | null = null,
    userId?: string
  ): Promise<string[]> {
    const operationName = `getProblematicQuestionsIdsByDate for ${typeof dateSpecifier === 'string' ? dateSpecifier : dateSpecifier.toDateString()}` + (contestId ? `, contest ${contestId}` : '');

    let startDate: Date, endDate: Date;
    const today = new Date();
    if (dateSpecifier === 'today') {
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999); // Inclusive end for the day
    } else if (dateSpecifier === 'yesterday') {
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      endDate.setHours(23, 59, 59, 999); // Inclusive end for yesterday
    } else {
      startDate = new Date(dateSpecifier.getFullYear(), dateSpecifier.getMonth(), dateSpecifier.getDate());
      endDate = new Date(dateSpecifier.getFullYear(), dateSpecifier.getMonth(), dateSpecifier.getDate(), 23, 59, 59, 999); // Inclusive end
    }

    const startDateIso = startDate.toISOString();
    // For Supabase range, the end is typically exclusive, so for a full day ending at 23:59:59.999,
    // we might query up to the start of the next day.
    const nextDayStartDate = new Date(endDate);
    nextDayStartDate.setDate(endDate.getDate() + 1);
    nextDayStartDate.setHours(0, 0, 0, 0);
    const endDateIsoExclusive = nextDayStartDate.toISOString();


    try {
      // Step 1: Fetch relevant quiz attempts from Supabase
      let attemptsQuery = this.supabase.from('quiz_attempts')
        .select('answered_questions, unanswered_questions, all_questions, settings, timestamp_end') // Include all_questions for your logic
        .gte('timestamp_start', startDateIso) // Use timestamp_start or timestamp_end based on your definition
        .lt('timestamp_start', endDateIsoExclusive); // Attempts started within the day

      if (contestId) {
        attemptsQuery = attemptsQuery.eq('public_contest_setting', contestId);
      }
      // if (userId) { attemptsQuery = attemptsQuery.eq('user_id', userId); }

      const {data: attemptsData, error: attemptsError} = await attemptsQuery;

      if (attemptsError) {
        console.error(`Supabase error fetching attempts in ${operationName}:`, attemptsError);
        if (!navigator.onLine) {
          console.warn(`[DatabaseService] Offline: Falling back to Dexie for ${operationName} (attempts fetch).`);
          // Note: The Dexie fallback here would need to implement the full nuanced logic.
          // For simplicity, the current getProblematicIdsFromDexie is more basic.
          // A more complete Dexie version of *this* multi-step logic would be needed.
          return this.getProblematicIdsFromDexieNuanced(startDate, endDate, contestId);
        }
        throw attemptsError;
      }

      if (!attemptsData || attemptsData.length === 0) {
        return [];
      }

      const candidateProblematicIds = new Set<string>();
      const attemptQuestionDetails = new Map<string, { wasUnansweredInAttempt: boolean, wasWrongInAttempt: boolean }>();

      for (const attempt of attemptsData) {
        const attemptTimestampEnd = attempt.timestamp_end ? new Date(attempt.timestamp_end).getTime() : Date.now(); // Use actual end or assume current if ongoing

        // Only consider attempts that ended within the desired date range
        // This aligns more with your original Dexie logic using 'timestampEnd'
        if (attemptTimestampEnd < startDate.getTime() || attemptTimestampEnd > endDate.getTime()) {
          continue;
        }

        const allQsInAttempt = (attempt.all_questions || []) as Array<{
          questionId: string,
          questionSnapshot?: any,
          isCorrect?: boolean
        }>; // Assuming all_questions has at least questionId
        const answeredQs = (attempt.answered_questions || []) as Array<{ questionId: string, isCorrect: boolean }>;
        const unansweredQs = (attempt.unanswered_questions || []) as Array<{ questionId: string }>;

        const answeredIdsInAttempt = new Set(answeredQs.map(aq => aq.questionId));

        for (const qInfo of allQsInAttempt) {
          candidateProblematicIds.add(qInfo.questionId);
          const existingDetail = attemptQuestionDetails.get(qInfo.questionId) || {
            wasUnansweredInAttempt: false,
            wasWrongInAttempt: false
          };

          const answeredDetail = answeredQs.find(aq => aq.questionId === qInfo.questionId);
          if (answeredDetail) {
            if (!answeredDetail.isCorrect) {
              existingDetail.wasWrongInAttempt = true;
            }
          } else { // Not in answeredQuestions, implies unanswered for this attempt
            existingDetail.wasUnansweredInAttempt = true;
          }
          attemptQuestionDetails.set(qInfo.questionId, existingDetail);
        }
      }

      if (candidateProblematicIds.size === 0) {
        return [];
      }

      // Step 2: Fetch global status for all candidate problematic questions
      const globalQuestionStatuses = await this.getQuestionByIds(Array.from(candidateProblematicIds));
      const globalStatusMap = new Map(globalQuestionStatuses.map(q => [q.id, q]));

      const finalProblematicIds = new Set<string>();

      for (const questionId of candidateProblematicIds) {
        const globalQst = globalStatusMap.get(questionId);
        const attemptDetail = attemptQuestionDetails.get(questionId);

        if (!globalQst || !attemptDetail) continue; // Should not happen if data is consistent

        const isUnansweredInThisAttempt = attemptDetail.wasUnansweredInAttempt;
        const isWrongInThisAttempt = attemptDetail.wasWrongInAttempt;

        const isGloballyNeverAnswered = (globalQst.lastAnsweredTimestamp ?? 0) === 0;
        let isWrongGloballyOrInDateRange = false;
        let isCorrectGloballyOrInDateRange = false;
        if (globalQst.lastAnsweredTimestamp) {
          const globalLastAnsweredTime = globalQst.lastAnsweredTimestamp; // Assuming this is a number (milliseconds)
          isWrongGloballyOrInDateRange = globalLastAnsweredTime >= startDate.getTime() &&
            globalLastAnsweredTime <= endDate.getTime() &&
            globalQst.lastAnswerCorrect === false;
          isCorrectGloballyOrInDateRange = globalLastAnsweredTime >= startDate.getTime() &&
            globalLastAnsweredTime <= endDate.getTime() &&
            globalQst.lastAnswerCorrect === true;
        }

        if (((isWrongInThisAttempt || isUnansweredInThisAttempt) && (!isWrongGloballyOrInDateRange && isGloballyNeverAnswered)) || isWrongGloballyOrInDateRange) {
          finalProblematicIds.add(questionId);
          continue;
        }

        if (isUnansweredInThisAttempt) {
          let globallyCorrectInDateRange = false;
          if (globalQst.lastAnsweredTimestamp && globalQst.lastAnswerCorrect === true) {
            const globalLastAnsweredTime = globalQst.lastAnsweredTimestamp;
            if (globalLastAnsweredTime >= startDate.getTime() && globalLastAnsweredTime <= endDate.getTime()) {
              globallyCorrectInDateRange = true;
            }
          }

          if (!globallyCorrectInDateRange) {
            finalProblematicIds.add(questionId);
          }
        }
      }

      return Array.from(finalProblematicIds);

    } catch (err) {
      console.error(`Error in ${operationName} (outer catch):`, err);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Final fallback to Dexie for ${operationName} due to error (outer catch).`);
        return this.getProblematicIdsFromDexieNuanced(startDate, endDate, contestId);
      }
      throw err;
    }
  }

  private async getProblematicIdsFromDexie(startDate: Date, endDate: Date, contestId: string | null): Promise<string[]> {
    let attemptsQuery = this.dexieDB.quizAttempts;
    let filteredAttempts: QuizAttempt[];

    if (contestId) {
      filteredAttempts = await attemptsQuery
        .where('settings.publicContest').equals(contestId)
        .filter(att => att.timestampStart >= startDate && att.timestampStart < endDate)
        .toArray();
    } else {
      filteredAttempts = await attemptsQuery
        .where('timestampStart').between(startDate.getTime(), endDate.getTime(), true, false)
        .toArray();
    }

    const problematicIds = new Set<string>();
    filteredAttempts.forEach(attempt => {
      if (attempt.answeredQuestions) {
        attempt.answeredQuestions.forEach(aq => {
          if (aq && !aq.isCorrect && aq.questionId) {
            problematicIds.add(aq.questionId);
          }
        });
      }
    });
    return Array.from(problematicIds);
  }

  // You'll need a Dexie equivalent of the nuanced logic for a true offline fallback
  private async getProblematicIdsFromDexieNuanced(startDate: Date, endDate: Date, contestId: string | null): Promise<string[]> {
    console.warn("[DBService] Using getProblematicIdsFromDexieNuanced. Ensure this matches your intended logic.");
    // This needs to replicate the multi-step logic using Dexie:
    // 1. Fetch attempts from Dexie within date range and contestId
    // 2. Collect candidateProblematicIds and their in-attempt status
    // 3. Fetch global status of these candidates using this.dexieDB.questions.bulkGet(...)
    // 4. Apply the same final filtering logic.

    let dexieAttemptsQuery = this.dexieDB.quizAttempts
      .where('timestampEnd') // Using timestampEnd as per your original logic for Dexie
      .between(startDate.getTime(), endDate.getTime(), true, true);

    let attempts: QuizAttempt[];
    if (contestId) {
      // If 'settings.publicContest' is indexed, this is efficient.
      // Otherwise, filter after fetching.
      const allDateAttempts = await dexieAttemptsQuery.toArray();
      attempts = allDateAttempts.filter(att => att.settings.publicContest === contestId);
    } else {
      attempts = await dexieAttemptsQuery.toArray();
    }

    if (!attempts || attempts.length === 0) {
      return [];
    }

    const candidateProblematicIds = new Set<string>();
    const attemptQuestionDetails = new Map<string, { wasUnansweredInAttempt: boolean, wasWrongInAttempt: boolean }>();

    for (const attempt of attempts) {
      const allQsInAttempt = (attempt.allQuestions || []) as Array<{ questionId: string, isCorrect?: boolean }>;
      const answeredQs = (attempt.answeredQuestions || []) as Array<{ questionId: string, isCorrect: boolean }>;

      for (const qInfo of allQsInAttempt) {
        candidateProblematicIds.add(qInfo.questionId);
        const existingDetail = attemptQuestionDetails.get(qInfo.questionId) || {
          wasUnansweredInAttempt: false,
          wasWrongInAttempt: false
        };
        const answeredDetail = answeredQs.find(aq => aq.questionId === qInfo.questionId);
        if (answeredDetail) {
          if (!answeredDetail.isCorrect) existingDetail.wasWrongInAttempt = true;
        } else {
          existingDetail.wasUnansweredInAttempt = true;
        }
        attemptQuestionDetails.set(qInfo.questionId, existingDetail);
      }
    }


    if (candidateProblematicIds.size === 0) return [];

    const globalQuestionStatuses = (await this.dexieDB.questions.bulkGet(Array.from(candidateProblematicIds))).filter(q => q !== undefined) as Question[];
    const globalStatusMap = new Map(globalQuestionStatuses.map(q => [q.id, q]));
    const finalProblematicIds = new Set<string>();

    for (const questionId of candidateProblematicIds) {
      const globalQst = globalStatusMap.get(questionId);
      const attemptDetail = attemptQuestionDetails.get(questionId);

      if (!globalQst || !attemptDetail) continue;

      if (attemptDetail.wasWrongInAttempt) {
        finalProblematicIds.add(questionId);
        continue;
      }
      if (attemptDetail.wasUnansweredInAttempt) {
        let globallyCorrectInDateRange = false;
        if (globalQst.lastAnsweredTimestamp && globalQst.lastAnswerCorrect === true) {
          const globalLastAnsweredTime = globalQst.lastAnsweredTimestamp;
          if (globalLastAnsweredTime >= startDate.getTime() && globalLastAnsweredTime <= endDate.getTime()) {
            globallyCorrectInDateRange = true;
          }
        }
        if (!globallyCorrectInDateRange) {
          finalProblematicIds.add(questionId);
        }
      }
    }
    return Array.from(finalProblematicIds);
  }

  async getNeverAnsweredQuestionIds(contestId: string, userId?: string): Promise<string[]> {
    const operationName = `getNeverAnsweredQuestionIds` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('id')
      .eq('times_correct', 0)
      .eq('times_incorrect', 0);
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('public_contest', contestId).limit(10000);
    }
    // userId not used here as it's about global "never answered" based on question stats

    try {
      const {data, error} = await supabaseQuery;
      if (error) {
        console.error(`Supabase error in ${operationName}:`, error);
        if (!navigator.onLine) {
          console.warn(`[DatabaseService] Offline: Falling back to Dexie for ${operationName}.`);
          let dexieQuery = this.dexieDB.questions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);
          if (contestId) dexieQuery = dexieQuery.and(q => q.publicContest === contestId);
          return (await dexieQuery.toArray()).map(q => q.id);
        }
        throw error;
      }
      return data ? data.map(q => q.id) : [];
    } catch (err) {
      console.error(`Error in ${operationName}, potentially falling back to Dexie:`, err);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Final fallback to Dexie for ${operationName} due to error.`);
        let dexieQuery = this.dexieDB.questions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);
        if (contestId) dexieQuery = dexieQuery.and(q => q.publicContest === contestId);
        return (await dexieQuery.toArray()).map(q => q.id);
      }
      throw err;
    }
  }

  async getNeverAnsweredQuestionCount(contestId: string | null = null, userId?: string): Promise<number> {
    const operationName = `getNeverAnsweredQuestionCount` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('id', {count: 'exact', head: true})
      .eq('times_correct', 0)
      .eq('times_incorrect', 0);
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('public_contest', contestId);
    }
    // userId not used here as it's about global "never answered" based on question stats

    try {
      const {count, error} = await supabaseQuery;
      if (error) {
        console.error(`Supabase error in ${operationName}:`, error);
        if (!navigator.onLine) {
          console.warn(`[DatabaseService] Offline: Falling back to Dexie for ${operationName}.`);
          let dexieQuery = this.dexieDB.questions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);
          if (contestId) dexieQuery = dexieQuery.and(q => q.publicContest === contestId);
          return (await dexieQuery.toArray()).length;
        }
        throw error;
      }
      return count ?? 0;
    } catch (err) {
      console.error(`Error in ${operationName}, potentially falling back to Dexie:`, err);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Final fallback to Dexie for ${operationName} due to error.`);
        let dexieQuery = this.dexieDB.questions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);
        if (contestId) dexieQuery = dexieQuery.and(q => q.publicContest === contestId);
        return (await dexieQuery.toArray()).length;
      }
      throw err;
    }
  }

  async updateQuestionsStatsBulk(answers: AnsweredQuestion[]): Promise<void> {
    if (!answers || answers.length === 0) {
      return;
    }

    const operationName = 'updateQuestionsStatsBulk';
    console.log(`[${operationName}] Starting for ${answers.length} answers.`);

    try {
      const questionIds = [...new Set(answers.map(a => a.questionId))];

      // 1. Fetch current stats for all relevant questions from Supabase
      const {data: currentQuestionsData, error: fetchError} = await this.supabase
        .from('questions')
        .select('id, times_correct, times_incorrect') // Only fetch what's needed for calculation
        .in('id', questionIds);

      if (fetchError) {
        console.error(`[${operationName}] Supabase error fetching current question stats:`, fetchError);
        if (!navigator.onLine) {
          console.warn(`[${operationName}] Offline. Stats update will be skipped.`);
          // Optionally, implement offline queueing here if this is critical path when offline
        }
        throw fetchError; // Re-throw to let the caller know the operation failed
      }

      if (!currentQuestionsData) {
        console.warn(`[${operationName}] No current question data returned from Supabase for IDs: ${questionIds.join(', ')}. Operation cannot proceed.`);
        return; // Cannot proceed without current stats
      }

      const currentStatsMap = new Map(currentQuestionsData.map(q => [q.id, {
        times_correct: q.times_correct || 0,
        times_incorrect: q.times_incorrect || 0
      }]));

      const supabaseUpdatePayloads: Question[] = [];
      const newTimestamp = new Date().getTime();

      for (const answer of answers) {
        const currentStats = currentStatsMap.get(answer.questionId);

        // If the questionId from the input answers was not found in our initial fetch from Supabase,
        // skip it to prevent trying to upsert a partial record as a new row.
        if (currentStats === undefined) {
          console.warn(`[${operationName}] Question ID ${answer.questionId} from input 'answers' was not found in the initial Supabase fetch or had no stats. Skipping stats update for this ID.`);
          continue; // Skip to the next answer
        }

        // Now we are sure currentStats is defined for this answer.questionId
        const baseTimesCorrect = currentStats.times_correct || 0; // Default to 0 if null/undefined from DB
        const baseTimesIncorrect = currentStats.times_incorrect || 0; // Default to 0 if null/undefined from DB

        const newTimesCorrect = baseTimesCorrect + (answer.isCorrect ? 1 : 0);
        const newTimesIncorrect = baseTimesIncorrect + (answer.isCorrect ? 0 : 1);
        const timesAnswered = newTimesCorrect + newTimesIncorrect;
        const newAccuracy = timesAnswered > 0 ? parseFloat(((newTimesCorrect / timesAnswered) * 100).toFixed(2)) : 0;

        const newQuestionValue: Question = {
          ...this.mapQuestionToSupabase(this.mapAnsweredQuestionToQuestion(answer)),
          times_correct: newTimesCorrect,
          times_incorrect: newTimesIncorrect,
          last_answered_timestamp: newTimestamp,
          last_answer_correct: answer.isCorrect,
          accuracy: newAccuracy
        }
        supabaseUpdatePayloads.push(newQuestionValue);
      }

      if (supabaseUpdatePayloads.length === 0) {
        console.log(`[${operationName}] No valid payloads to update after processing answers. Exiting.`);
        return;
      }

      // 2. Perform bulk update/insert to Supabase
      const {data: updatedSupabaseQuestions, error: upsertError} = await this.supabase
        .from('questions')
        .upsert(supabaseUpdatePayloads, {onConflict: 'id'}) // Explicitly state conflict column
        .select(); // Important: select() to get the updated/inserted rows back

      if (upsertError) {
        console.error(`[${operationName}] Supabase error upserting question stats:`, upsertError);
        if (!navigator.onLine) {
          console.warn(`[${operationName}] Offline during Supabase upsert. Dexie will not be updated with these changes.`);
        }
        throw upsertError; // Re-throw
      }

      // 3. Update Dexie with the successfully updated questions
      if (updatedSupabaseQuestions && updatedSupabaseQuestions.length > 0) {
        const dexieQuestionsToUpdate = updatedSupabaseQuestions.map(sq => this.mapQuestionFromSupabase(sq));
        try {
          await this.dexieDB.questions.bulkPut(dexieQuestionsToUpdate);
          console.log(`[${operationName}] Successfully updated ${dexieQuestionsToUpdate.length} questions in Dexie.`);
        } catch (dexieError) {
          console.error(`[${operationName}] Error updating Dexie after Supabase success:`, dexieError);
        }
      } else {
        console.warn(`[${operationName}] Supabase upsert reported success but returned no data. Dexie not updated.`);
      }

      console.log(`[${operationName}] Completed successfully for ${supabaseUpdatePayloads.length} payloads.`);

    } catch (error) {
      console.error(`[${operationName}] General error during bulk update:`, error);
      if (!(error as any).message?.includes('Failed to fetch')) {
        // throw error;
      }
    }
  }

  async updateQuestionStats(questionId: string, isCorrect: boolean, userId?: string): Promise<void> {
    // This is primarily a write operation. Fallback for writes is complex (queueing).
    // For now, it directly attempts Supabase and then updates Dexie.
    // An RPC function in Supabase is better for atomicity.
    try {
      const {data: currentQData, error: fetchError} = await this.supabase
        .from('questions')
        .select('times_correct, times_incorrect, accuracy')
        .eq('id', questionId)
        .single();

      if (fetchError) {
        console.error(`Supabase error fetching question stats for ${questionId}:`, fetchError);
        // No simple fallback for stat update if fetch fails, could lead to inconsistency.
        throw fetchError;
      }
      if (!currentQData) {
        console.error(`Question ${questionId} not found for stat update.`);
        return;
      }

      const newTimesCorrect = (currentQData.times_correct || 0) + (isCorrect ? 1 : 0);
      const newTimesIncorrect = (currentQData.times_incorrect || 0) + (isCorrect ? 0 : 1);
      const timesAnswered = newTimesCorrect + newTimesIncorrect;
      const newAccuracy = timesAnswered > 0 ? parseFloat(((newTimesCorrect / timesAnswered) * 100).toFixed(2)) : 0; // Default to 0 accuracy

      const updates = {
        times_correct: newTimesCorrect,
        times_incorrect: newTimesIncorrect,
        last_answered_timestamp: new Date().getTime(), // Ensure this is a number if Dexie expects number
        last_answer_correct: isCorrect,
        accuracy: newAccuracy
      };

      const {error: updateError} = await this.supabase
        .from('questions')
        .update(updates)
        .eq('id', questionId);

      if (updateError) {
        console.error(`Supabase error updating stats for question ${questionId}:`, updateError);
        // If Supabase update fails, consider if Dexie should still be updated or not.
        // For now, throwing error to indicate failure.
        throw updateError;
      }
      // Update Dexie if Supabase was successful
      await this.dexieDB.questions.where({id: questionId}).modify(q => {
        q.timesCorrect = newTimesCorrect;
        q.timesIncorrect = newTimesIncorrect;
        q.lastAnsweredTimestamp = updates.last_answered_timestamp;
        q.lastAnswerCorrect = isCorrect;
        q.accuracy = newAccuracy;
      });
    } catch (error) {
      console.error(`Failed to update question stats for ${questionId}:`, error);
      // If offline during this, stats will not be updated on Supabase or Dexie consistently.
      // A robust offline strategy would queue this update.
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Failed to update question stats for ${questionId}. Stats may be out of sync.`);
      }
      // Re-throw if not handled by specific offline logic
      // throw error; // Decided to not re-throw to prevent app crash on simple stat update failure when offline
    }
  }

  async getAvailablePublicContests(): Promise<string[]> {
    const operationName = 'getAvailablePublicContests';
    try {
      // Using distinct on public_contest column
      const {data, error} = await this.supabase
        .rpc('get_distinct_public_contests'); // Assumes a PL/pgSQL function exists
      if (error || !data) {
        console.error(`Supabase error or no data from RPC in ${operationName}:`, error);
        // Fallback to selecting all and processing client-side if RPC fails or doesn't exist
        const {data: qData, error: qError} = await this.supabase.from('questions').select('public_contest');
        if (qError) {
          console.error(`Supabase error fetching all public_contest values:`, qError);
          if (!navigator.onLine) {
            console.warn(`[DatabaseService] Offline: Falling back to Dexie for ${operationName}.`);
            return this.getAvailablePublicContestsFromDexie();
          }
          throw qError;
        }
        const contestSet = new Set<string>();
        if (qData) {
          qData.forEach(q => {
            if (q.public_contest && q.public_contest.trim() !== '') contestSet.add(q.public_contest);
          });
        }
        return Array.from(contestSet).sort();
      }
      // Assuming RPC returns an array of objects like { public_contest: 'ContestName' }
      return (data as Array<{
        public_contest: string
      }>).map(item => item.public_contest).filter(c => c && c.trim() !== '').sort();

    } catch (err) {
      console.error(`Error in ${operationName}, falling back to Dexie:`, err);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Final fallback to Dexie for ${operationName} due to error.`);
        return this.getAvailablePublicContestsFromDexie();
      }
      throw err;
    }
  }

  // Helper for Dexie fallback for getAvailablePublicContests
  private async getAvailablePublicContestsFromDexie(): Promise<string[]> {
    const allDexieQuestions = await this.dexieDB.questions.toArray();
    const contestSet = new Set<string>();
    allDexieQuestions.forEach(q => {
      if (q.publicContest && q.publicContest.trim() !== '') contestSet.add(q.publicContest);
    });
    return Array.from(contestSet).sort();
  }

  /*
  Example Supabase RPC function for distinct public_contest:
  CREATE OR REPLACE FUNCTION get_distinct_public_contests()
  RETURNS TABLE(public_contest TEXT) AS $$
  BEGIN
    RETURN QUERY SELECT DISTINCT q.public_contest FROM questions q WHERE q.public_contest IS NOT NULL AND q.public_contest <> '';
  END;
  $$ LANGUAGE plpgsql;
  */


  async getQuestionsByPublicContest(contestIdentifier: string): Promise<Question[]> {
    if (!contestIdentifier) return [];
    return this.getAllQuestions(contestIdentifier); // Leverages existing Supabase-first logic
  }

  async toggleFavoriteStatus(questionId: string): Promise<number | undefined> {
    // This involves a read then a write.
    const question = await this.getQuestionById(questionId); // Supabase-first read
    if (!question) {
      console.warn(`Question ${questionId} not found for toggling favorite.`);
      return undefined;
    }
    const newFavoriteStatus = question.isFavorite ? 0 : 1; // Supabase uses 0/1 for boolean typically
    // Update operation will also update Dexie via updateQuestion's logic
    await this.updateQuestion(questionId, {isFavorite: newFavoriteStatus});
    return newFavoriteStatus;
  }

  async getFavoriteQuestions(contestId?: string | null): Promise<Question[]> {
    const operationName = `getFavoriteQuestions` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('*').eq('is_favorite', 1); // Assuming 1 for true
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('public_contest', contestId);
    }

    return this.handleSupabaseFetch<Question>(
      supabaseQuery,
      this.mapQuestionFromSupabase,
      (questions) => this.dexieDB.questions.bulkPut(questions),
      async () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        let dexieQuery = this.dexieDB.questions.where('isFavorite').equals(1);
        if (contestId) dexieQuery = dexieQuery.and(q => q.publicContest === contestId);
        return dexieQuery.toArray();
      },
      operationName
    ) as Promise<Question[]>;
  }

  async getPausedQuiz(userId?: string): Promise<QuizAttempt | undefined> {
    const operationName = `getPausedQuiz` + (userId ? ` for user ${userId}` : '');
    let query = this.supabase.from('quiz_attempts')
      .select('*')
      .eq('status', 'paused')
      .order('timestamp_start', {ascending: false});
    // if (userId) { query = query.eq('user_id', userId); } // For multi-user

    return this.handleSupabaseFetch<QuizAttempt>(
      query, // Limit 1 could be added server-side or client-side for "latest"
      this.mapQuizAttemptFromSupabase,
      async (attempts) => {
        if (attempts.length > 0) await this.dexieDB.quizAttempts.put(attempts[0]);
      }, // Cache if found
      async () => {
        console.warn(`[DatabaseService] Using Dexie fallback for ${operationName}.`);
        const pausedDexie = await this.dexieDB.quizAttempts.where('status').equals('paused')
          // .and(attempt => !userId || attempt.userId === userId) // If userId is stored
          .reverse().sortBy('timestampStart');
        return pausedDexie.length > 0 ? pausedDexie[0] : undefined;
      },
      operationName,
      true // Expecting single or none. Supabase query doesn't use .single() to allow empty result gracefully
    ).then(results => Array.isArray(results) ? results[0] : results) as Promise<QuizAttempt | undefined>;
  }


  async clearAllQuestions(contestId: string): Promise<void> {
    // This RESETS stats, doesn't delete questions.
    console.log(`Attempting to reset Supabase question stats for contest: ${contestId}`);
    // An RPC function would be more atomic. Client-side: fetch IDs, map to reset objects, then upsert.
    try {
      const {data: questionsToReset, error: fetchError} = await this.supabase
        .from('questions')
        .select('*') // only fetch id
        .eq('public_contest', contestId);

      if (fetchError) throw fetchError;

      if (questionsToReset && questionsToReset.length > 0) {
        const updates = questionsToReset.map((q: Question) => ({
          ...q, // Spread to include existing fields
          times_correct: 0,
          times_incorrect: 0,
          last_answered_timestamp: null, // Use null for Supabase timestamp reset
          last_answer_correct: false,
          is_favorite: 0,
          accuracy: 0,
        }));

        const {error: updateError} = await this.supabase.from('questions').upsert(updates);
        if (updateError) throw updateError;

        // Update Dexie: map back from the reset "Supabase-like" structure
        const dexieUpdates = updates.map(u => this.mapQuestionFromSupabase(u));
        try {
          await this.dexieDB.questions.bulkPut(dexieUpdates);
          console.log(`Stats reset for ${updates.length} questions in contest ${contestId}`);
        } catch (dexieError) {
          console.error(`Error updating Dexie after Supabase success:`, dexieError);
        }
      } else {
        console.log(`No questions found in contest ${contestId} to reset stats.`);
      }
    } catch (error) {
      console.error(`Error resetting question stats for contest ${contestId}:`, error);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Failed to reset question stats for ${contestId}. Operation might be incomplete.`);
        // Attempt Dexie reset anyway
        const existingDexieQuestions = await this.dexieDB.questions.where('publicContest').equals(contestId).toArray();
        const finalDexieUpdates: Question[] = existingDexieQuestions.map(dq => ({
          ...dq,
          timesCorrect: 0,
          timesIncorrect: 0,
          isFavorite: 0,
          lastAnsweredTimestamp: undefined,
          lastAnswerCorrect: false,
          accuracy: 0,
        }));
        await this.dexieDB.questions.bulkPut(finalDexieUpdates);
        console.log(`Dexie question stats reset for contest ${contestId} during offline fallback.`);
      }
      // throw error; // Avoid throwing to allow app to continue if reset fails
    }
  }

  // --- General DB Methods ---
  async resetContest(contestId: string): Promise<void> {
    console.log(`Resetting contest ${contestId} in Supabase and Dexie.`);
    try {
      await this.clearAllQuestions(contestId); // Resets stats (Supabase-first)
      await this.clearAllQuizAttempts(contestId); // Deletes attempts (Supabase-first)
      console.log(`Contest ${contestId} has been reset.`);
    } catch (error) {
      console.error(`Failed to fully reset contest ${contestId}:`, error);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: Contest reset for ${contestId} may be incomplete.`);
      }
      // throw error; // Avoid throwing to allow app to continue
    }
  }

  async fetchAllRows(tableName: string, contestId: string): Promise<Question[]> {
    const chunkSize = 1000; // Supabase limit
    let allRows: Question[] = [];
    let start = 0;

    while (true) {
      const {data, error} = await this.supabase.from('questions').select('*')
        .eq('public_contest', contestId)
        .range(start, start + chunkSize - 1);

      if (error) {
        console.error('Error fetching rows:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        break; // Exit loop when no more rows are returned
      }

      allRows = allRows.concat(data);
      start += chunkSize; // Move to the next chunk
    }

    return allRows.map(row => this.mapQuestionFromSupabase(row));
  }

  mapAnsweredQuestionToQuestion(answered: AnsweredQuestion): Question {
    return {
      id: answered.questionId,
      text: answered.questionSnapshot.text,
      topic: answered.questionSnapshot.topic,
      options: answered.questionSnapshot.options,
      correctAnswerIndex: answered.questionSnapshot.correctAnswerIndex,
      explanation: answered.questionSnapshot.explanation,
      isFavorite: answered.questionSnapshot.isFavorite,
      // Add other fields as needed, possibly with default values or undefined
    };
  }
}
