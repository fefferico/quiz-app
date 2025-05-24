// src/app/core/services/database.service.ts
import { Injectable, OnDestroy } from '@angular/core';
import { Question } from '../../models/question.model'; // Adjust path if necessary
import { AnsweredQuestion, QuizAttempt, TopicCount } from '../../models/quiz.model';   // Adjust path if necessary
import { AppDB } from './appDB';
import { SupabaseService } from './supabase-service.service'; // Your Supabase client wrapper
import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { Subscription } from 'rxjs'; // Added import
import { User } from '../../models/user.model';
import { Contest } from '../../models/contes.model';
import { error } from 'console';

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
  private supabase: SupabaseClient;
  private isDbInitialized = false; // Added: Flag to track DB initialization
  private authSubscription: Subscription | undefined; // Added: For managing subscription

  constructor(
    private supabaseService: SupabaseService,
  ) {
    console.log('DatabaseService constructor called.');
    this.supabase = this.supabaseService.client; // Changed to use the client getter
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
      scoreIsCorrect: supabaseQuestion.scoreIsCorrect,
      scoreIsWrong: supabaseQuestion.scoreIsWrong,
      scoreIsSkip: supabaseQuestion.scoreIsSkip,
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
      contestId: supabaseQuestion.fk_contest_id
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
      contestId: supabaseAttempt.fk_contest_id,
      userId: supabaseAttempt.fk_user_id
    };
  }

  private mapQuizAttemptToSupabase(appAttempt: Partial<QuizAttempt>): any {
    const supabaseAttempt: any = {};
    if (appAttempt.id !== undefined) supabaseAttempt.id = appAttempt.id;
    if (appAttempt.timestampStart !== undefined) supabaseAttempt.timestamp_start = appAttempt.timestampStart.toISOString();
    if (appAttempt.timestampEnd !== undefined) supabaseAttempt.timestamp_end = appAttempt.timestampEnd?.toISOString();
    if (appAttempt.settings !== undefined) {
      supabaseAttempt.settings = appAttempt.settings;
      supabaseAttempt.num_questions_setting = appAttempt.settings.totalQuestionsInQuiz;
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
    if (appAttempt.contestId !== undefined) supabaseAttempt.fk_contest_id = appAttempt.contestId;
    if (appAttempt.userId !== undefined) supabaseAttempt.fk_user_id = appAttempt.userId;
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

  async getAllQuestionAnsweredAtLeastOnce(contestId: number): Promise<Question[]> {
  const { data, error } = await this.supabase
    .from('questions')
    .select('*')
    .eq('fk_contest_id', contestId)
    .or('times_correct.gt.0,times_incorrect.gt.0');

  if (error) {
    console.error('Supabase error in getAllQuestionAnsweredAtLeastOnce:', error);
    throw error;
  }
  return (data ?? []).map(this.mapQuestionFromSupabase);
}


  async getAllQuestionCorrectlyAnsweredAtLeastOnce(contestId: number): Promise<Question[]> {
    const operationName = `getAllQuestionCorrectlyAnsweredAtLeastOnce for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
      .eq('fk_contest_id', contestId)
      .gt('times_correct', 0),
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
      operationName
    ) as Promise<Question[]>;
  }

  async getAllQuestionCorrectlyAnsweredAtLeastOnceCount(contestId: number): Promise<number> {
    const { count, error } = await this.supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('fk_contest_id', contestId)
      .gt('times_correct', 0);

    if (error) {
      console.error('Error fetching count:', error);
      return 0;
    }
    return count ?? 0;
  }

  async getOnlyQuestionCorrectlyAnswered(contestId: number): Promise<Question[]> {
    const operationName = `getOnlyQuestionCorrectlyAnswered for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
      .eq('fk_contest_id', contestId)
      .gt('times_correct', 0)
      .eq('times_incorrect', 0),
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
      operationName
    ) as Promise<Question[]>;
  }

  async getQuestionsByCorrectnessRange(contestId: number, min: number, max: number): Promise<Question[]> {
    const operationName = `getQuestionsByCorrectnessRange for contest ${contestId} (min: ${min}, max: ${max})`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('fk_contest_id', contestId)
        .gte('accuracy', min)
        .lte('accuracy', max),
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
      operationName
    ) as Promise<Question[]>;
  }

  async getAllQuestionNeverAnswered(contestId: number): Promise<string[]> {
    const operationName = `getAllQuestionNeverAnswered for contest ${contestId}`;
    const chunkSize = 1000; // Supabase limit
    let allRows: any[] = [];
    let start = 0;
    while (true) {
      const { data, error } = await this.supabase.from('questions').select('id')
        .eq('fk_contest_id', contestId)
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

  async getAllQuestionWronglyAnsweredAtLeastOnce(contestId: number): Promise<Question[]> {
    const operationName = `getAllQuestionWronglyAnsweredAtLeastOnce for contest ${contestId}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('fk_contest_id', contestId)
        .gt('times_incorrect', 0),
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
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

  async getQuestionsByTopic(contestId: number, topic: string): Promise<Question[]> {
    const operationName = `getQuestionsByTopic for contest ${contestId}, topic '${topic}'`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('fk_contest_id', contestId)
        .ilike('topic', topic), // Case-insensitive match for topic
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
      operationName
    ) as Promise<Question[]>;
  }

  async getQuestionsByTopics(contestId: number, topics: string[]): Promise<Question[]> {
    if (!topics || topics.length === 0) {
      return this.getAllQuestions(contestId);
    }
    const operationName = `getQuestionsByTopics for contest ${contestId}, topics [${topics.join(', ')}]`;

    // For Supabase, use OR with ILIKE for each topic
    // Example: .or('topic.ilike.History,topic.ilike.Geography')
    const orConditions = topics.map(t => `topic.ilike.%${t}%`).join(','); // Using % for broader match if needed, adjust if exact match required

    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*')
        .eq('fk_contest_id', contestId)
        .or(orConditions),
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
      operationName
    ) as Promise<Question[]>;
  }

  async getRandomQuestions(
    contestId: number,
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
              q.contestId === contestId &&
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
            filteredQuestions = filteredQuestions.filter(q => q.contestId === contestId);
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
      throw error;
    }
  }

  async getNeverEncounteredRandomQuestionsByParams(
    contestId: number,
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
      topicDistribution,
      contestId
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
              q.contestId === contestId &&
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
            baseQuestions = baseQuestions.filter(q => q.contestId === contestId);
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
      throw error;
    }
  }

  async getAllQuizAttemptsByContest(contestId: number | null, userId: number): Promise<QuizAttempt[]> {
    const operationName = `getAllQuizAttemptsByContest for contest ${contestId}`;
    if (!contestId) return Promise.resolve([]);

    const { data, error } = await this.supabase.from('quiz_attempts')
      .select('*')
      .eq('fk_contest_id', contestId)
      .eq('fk_user_id',userId);

    if (error) {
      console.error(`[DatabaseService] Supabase error in ${operationName}:`, error);
      return [];
    }
    return (data ?? []).map(this.mapQuizAttemptFromSupabase);
  }

  async getQuizAttemptsBySpecificDate(contestId: number, date: Date, userId: number): Promise<QuizAttempt[]> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1); // Exclusive end
    const operationName = `getQuizAttemptsBySpecificDate for contest ${contestId}, date ${date.toDateString()}`;

    return this.handleSupabaseFetch<QuizAttempt>(
      this.supabase.from('quiz_attempts').select('*')
        .eq('fk_contest_id', contestId)
        .eq('fk_user_id', userId)
        .gte('timestamp_start', startOfDay.toISOString())
        .lt('timestamp_start', endOfDay.toISOString())
        .order('timestamp_start', { ascending: false }),
      this.mapQuizAttemptFromSupabase,
      async () => {},
      async () => [],
      operationName
    ) as Promise<QuizAttempt[]>;
  }

  // --- Question Table Methods (Supabase-first from original) ---
  async getAllQuestions(contestId?: number | null): Promise<Question[]> {
    const operationName = `getAllQuestions` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('*');
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('fk_contest_id', contestId);
    }

    const { data, error } = await supabaseQuery;

    if (error) {
      console.error('Supabase error in getAllQuestions:', error);
      throw error;
    }
    return (data ?? []).map(this.mapQuestionFromSupabase);    
  }

  async getQuestionById(id: string): Promise<Question | undefined> {
    const operationName = `getQuestionById for ID ${id}`;
    return this.handleSupabaseFetch<Question>(
      this.supabase.from('questions').select('*').eq('id', id).single(),
      this.mapQuestionFromSupabase,
      async () => {},
      async () => [],
      operationName,
      true // isSingleItem
    ) as Promise<Question | undefined>;
  }

  async getQuestionByIds(ids: string[]): Promise<Question[]> {
    if (!ids || ids.length === 0) return [];
    // Filter out any undefined/null IDs to prevent Supabase errors
    const validIds = ids.filter(id => id);
    if (validIds.length === 0) return [];

    const { data, error } = await this.supabase.from('questions').select('*').in('id', validIds);

    if (error) {
      console.error('Supabase error in getAllQuestionAnsweredAtLeastOnce:', error);
      throw error;
    }
    return (data ?? []).map(this.mapQuestionFromSupabase);
  }

  async addQuestion(questionData: Question): Promise<Question> {
    // This method primarily writes; fallback for write is more complex (queueing)
    // For now, prioritize Supabase write, then update Dexie.
    const supabaseData = this.mapQuestionToSupabase(questionData);
    const { data, error } = await this.supabase
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
    return newQuestion;
  }

  async updateQuestion(id: string, changes: Partial<Question>): Promise<Question> {
    const supabaseChanges = this.mapQuestionToSupabase(changes);
    const { data, error } = await this.supabase
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
    return updatedQuestion;
  }

  async deleteQuestion(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('questions')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Supabase error deleting question:', error);
      throw error;
    }
  }

  // --- QuizAttempt Table Methods (Supabase-first from original) ---
  async saveQuizAttempt(quizAttempt: QuizAttempt): Promise<QuizAttempt> {
    const supabaseAttemptData = this.mapQuizAttemptToSupabase(quizAttempt);
    const { data, error } = await this.supabase
      .from('quiz_attempts')
      .upsert(supabaseAttemptData)
      .select()
      .single();

    if (error) {
      console.error('Supabase error saving quiz attempt:', error);
      throw error;
    }
    const savedAttempt = this.mapQuizAttemptFromSupabase(data);
    return savedAttempt;
  }

  async getQuizAttemptById(id: string): Promise<QuizAttempt | undefined> {
    const { data, error } = await this.supabase.from('quiz_attempts').select('*').eq('id', id).single();
    if (error) {
      console.error(`Supabase error in getQuizAttemptById for ID ${id}:`, error);
      throw error;
    }
    return data ? this.mapQuizAttemptFromSupabase(data) : undefined;
  }

  async getAllQuizAttempts(contestId?: number | null, userId?: string): Promise<QuizAttempt[]> {
    const operationName = `getAllQuizAttempts` + (contestId ? ` for contest ${contestId}` : '') + (userId ? ` for user ${userId}` : '');
    let query = this.supabase.from('quiz_attempts').select('*');

    if (contestId) {
      query = query.eq('fk_contest_id', contestId); // Standardized to use this column
    }
    if (userId) {
      // Assuming 'user_id' is a column on quiz_attempts table for multi-user scenarios.
      // If user_id is part of settings JSONB: query = query.eq('settings->>userId', userId);
      // For this example, let's assume a direct user_id column if provided.
      // query = query.eq('user_id', userId); // Uncomment and adjust if you have a user_id column
    }
    query = query.order('timestamp_start', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error in getAllQuizAttempts:', error);
      throw error;
    }
    return (data ?? []);
  }

  async deleteQuizAttempt(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('quiz_attempts')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Supabase error deleting quiz attempt:', error);
      throw error;
    }
  }

  async clearAllQuizAttempts(contestId: number): Promise<void> {
    console.log(`Attempting to clear Supabase quiz attempts for contest: ${contestId}`);
    const { error: supabaseError } = await this.supabase
      .from('quiz_attempts')
      .delete()
      .eq('fk_contest_id', contestId); // Standardized

    if (supabaseError) {
      console.error(`Supabase error clearing quiz attempts for contest ${contestId}:`, supabaseError);
      throw supabaseError;
    }
    console.log(`Supabase quiz attempts cleared for contest ${contestId}. Now clearing Dexie.`);
  }

  // --- Methods requiring more complex logic ---
  async getProblematicQuestionsIdsByDate(
    dateSpecifier: 'today' | 'yesterday' | Date,
    contestId: number | null = null,
    userId: number
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
        attemptsQuery = attemptsQuery.eq('fk_contest_id', contestId).eq('fk_user_id',userId);
      }
      // if (userId) { attemptsQuery = attemptsQuery.eq('user_id', userId); }

      const { data: attemptsData, error: attemptsError } = await attemptsQuery;

      if (attemptsError) {
        console.error(`Supabase error fetching attempts in ${operationName}:`, attemptsError);
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
      throw err;
    }
  }

  async getNeverAnsweredQuestionIds(contestId: number, userId?: string): Promise<string[]> {
    const operationName = `getNeverAnsweredQuestionIds` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('id')
      .eq('times_correct', 0)
      .eq('times_incorrect', 0);
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('fk_contest_id', contestId).limit(10000);
    }
    // userId not used here as it's about global "never answered" based on question stats

    try {
      const { data, error } = await supabaseQuery;
      if (error) {
        throw error;
      }
      return data ? data.map(q => q.id) : [];
    } catch (err) {
      console.error(`Error in ${operationName}, potentially falling back to Dexie:`, err);
      throw err;
    }
  }

  async getNeverAnsweredQuestionCount(contestId: number, userId: number): Promise<number> {
    const operationName = `getNeverAnsweredQuestionCount` + (contestId ? ` for contest ${contestId}` : '');
    let neverAnsweredQuestions = this.supabase.from('quiz_attempts').select('*')
      .eq('fk_contest_id', contestId)
      .eq('fk_user_id', userId);

      // Only call countAllRows if contestId?.id is defined and you need its result
      // await this.countAllRows(contestId?.id); // Remove or use if needed

      let countRows = 0;
      if (contestId && contestId !== undefined){
        countRows = await this.countAllRows(contestId);
      } else {
        throw new Error('contestId is required for getNeverAnsweredQuestionCount');
      }

    try {
      const { data, error } = await neverAnsweredQuestions;
      if (error) {
        console.error(`Supabase error in ${operationName}:`, error);
        throw error;
      }
      // Flatten all answered_questions arrays and collect unique question IDs
      const answeredIds = new Set<number>();
      if (data) {
        for (const attempt of data) {
          if (Array.isArray(attempt.answered_questions)) {
        for (const q of attempt.answered_questions) {
          if (q && q.questionId) {
            answeredIds.add(q.questionId);
          }
        }
          }
        }
      }
      return countRows - answeredIds.size;
    } catch (err) {
      console.error(`Error in ${operationName}, potentially falling back to Dexie:`, err);
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
      const { data: currentQuestionsData, error: fetchError } = await this.supabase
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
      const { data: updatedSupabaseQuestions, error: upsertError } = await this.supabase
        .from('questions')
        .upsert(supabaseUpdatePayloads, { onConflict: 'id' }) // Explicitly state conflict column
        .select(); // Important: select() to get the updated/inserted rows back

      if (upsertError) {
        console.error(`[${operationName}] Supabase error upserting question stats:`, upsertError);
        if (!navigator.onLine) {
          console.warn(`[${operationName}] Offline during Supabase upsert. Dexie will not be updated with these changes.`);
        }
        throw upsertError; // Re-throw
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
      const { data: currentQData, error: fetchError } = await this.supabase
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

      const { error: updateError } = await this.supabase
        .from('questions')
        .update(updates)
        .eq('id', questionId);

      if (updateError) {
        console.error(`Supabase error updating stats for question ${questionId}:`, updateError);
        // If Supabase update fails, consider if Dexie should still be updated or not.
        // For now, throwing error to indicate failure.
        throw updateError;
      }
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

  async getAvailablePublicContests(userId: number): Promise<Contest[]> {
    const operationName = 'getAvailablePublicContests';
    try {
      // Using distinct on public_contest column
      const { data, error } = await this.supabase
        .from('contests')
        .select('*, users_contests!inner(*)')
        .eq('is_active', true)
        .eq('users_contests.fk_user_id', userId);
      if (error || !data) {
        if (error) {
          console.error(`Supabase error fetching all contests values:`, error);
          throw error;
        }
      }
      return (data as Array<Contest>);
    } catch (err) {
      console.error(`Error in ${operationName}, falling back to Dexie:`, err);
      throw err;
    }
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


  async getQuestionsByPublicContestForSimulation(contestIdentifier: Contest): Promise<Question[]> {
    if (!contestIdentifier) return [];

    // This method simulates a test with 100 quiz questions distributed as follows:
    // 20% CULTURA GENERALE - Cultura Generale (20 questions)
    // 12% ITALIANO - Letteratura (12 questions)
    // 12% ITALIANO - Grammatica or Ragionamento Critico - Verbale (12 questions)
    // 12% MATEMATICA or Ragionamento Logico Matematico (12 questions)
    // 12% STORIA - Storia (12 questions)
    // 12% EDUCAZIONE CIVICA - Educazione Civica (12 questions)
    // 12% INGLESE - Lingua Inglese (12 questions)
    // 8% INFORMATICA - Informatica (8 questions)
    const topicDistribution: { topic: string | string[]; count: number }[] = [
      { topic: 'CULTURA GENERALE', count: 20 },
      { topic: 'Letteratura', count: 12 },
      { topic: ['Grammatica', 'RAGIONAMENTO CRITICO'], count: 12 },
      { topic: ['MATEMATICA', 'RAGIONAMENTO LOGICO'], count: 12 },
      { topic: 'STORIA', count: 12 },
      { topic: 'COSTITUZIONE', count: 12 },
      { topic: 'INGLESE', count: 12 },
      { topic: 'INFORMATICA', count: 8 }
    ];

    // Try to fetch all questions that have never been encountered
    const allQuestions: Question[] = await this.fetchAllNeverEncounteredRows(contestIdentifier.id);
    const selectedQuestions: Question[] = [];

    for (const dist of topicDistribution) {
      let candidates: Question[];
      if (Array.isArray(dist.topic)) {
        candidates = allQuestions.filter(q =>
        (Array.isArray(dist.topic)
          ? dist.topic.some((t: string) => (q.topic ?? '').trim().toLowerCase().indexOf((t as string).trim().toLowerCase()) >= 0)
          : (q.topic ?? '').trim().toLowerCase().indexOf((dist.topic as string).trim().toLowerCase()) >= 0)
        );
      } else {
        candidates = allQuestions.filter(q => (q.topic ?? '').trim().toLowerCase().indexOf((dist.topic as string).trim().toLowerCase()) >= 0);
      }
      // Shuffle candidates
      candidates = candidates.sort(() => 0.5 - Math.random());
      selectedQuestions.push(...candidates.slice(0, dist.count));
    }

    // If less than 100 due to missing topics, fill with random remaining questions
    if (selectedQuestions.length < 100) {
      const remaining = allQuestions.filter(q => !selectedQuestions.some(sq => sq.id === q.id));
      const needed = 100 - selectedQuestions.length;
      selectedQuestions.push(...remaining.sort(() => 0.5 - Math.random()).slice(0, needed));
    }

    return selectedQuestions.slice(0, 100);
  }

  async getQuestionsByPublicContest(contestIdentifier: number): Promise<Question[]> {
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
    await this.updateQuestion(questionId, { isFavorite: newFavoriteStatus });
    return newFavoriteStatus;
  }

  async getFavoriteQuestions(contestId?: number | null): Promise<Question[]> {
    const operationName = `getFavoriteQuestions` + (contestId ? ` for contest ${contestId}` : '');
    let supabaseQuery = this.supabase.from('questions').select('*').eq('is_favorite', 1); // Assuming 1 for true
    if (contestId) {
      supabaseQuery = supabaseQuery.eq('fk_contest_id', contestId);
    }

    const { data, error } = await supabaseQuery;
    if (error) {
      console.error('Supabase error in getFavoriteQuestions:', error);
      throw error;
    }
    return (data ?? []).map(this.mapQuestionFromSupabase);
  }

  async getPausedQuiz(contestId: number, userId: number): Promise<QuizAttempt | undefined> {
    const operationName = `getPausedQuiz` + (userId ? ` for user ${userId}` : '');
    let query = this.supabase.from('quiz_attempts')
      .select('*')
      .eq('status', 'paused')
      .eq('fk_contest_id',contestId)
      .eq('fk_user_id',userId)
      .order('timestamp_start', { ascending: false });
    // if (userId) { query = query.eq('user_id', userId); } // For multi-user

    return this.handleSupabaseFetch<QuizAttempt>(
      query,
      this.mapQuizAttemptFromSupabase,
      async () => {},
      async () => undefined,
      operationName,
      true
    ).then(results => Array.isArray(results) ? results[0] : results) as Promise<QuizAttempt | undefined>;
  }


  async clearAllQuestions(contestId: number, userId: number): Promise<void> {
    // This RESETS stats, doesn't delete questions.
    console.log(`Attempting to reset Supabase question stats for contest: ${contestId}`);
    // An RPC function would be more atomic. Client-side: fetch IDs, map to reset objects, then upsert.
    try {
      const { data: questionsToReset, error: fetchError } = await this.supabase
        .from('questions')
        .select('*') // only fetch id
        .eq('fk_contest_id', contestId);

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

        const { error: updateError } = await this.supabase.from('questions').upsert(updates);
        if (updateError) throw updateError;
      } else {
        console.log(`No questions found in contest ${contestId} to reset stats.`);
      }
    } catch (error) {
      console.error(`Error resetting question stats for contest ${contestId}:`, error);
      // throw error; // Avoid throwing to allow app to continue if reset fails
    }
  }

  // --- General DB Methods ---
  async resetContest(contestId: number, userId: number): Promise<void> {
    console.log(`Resetting contest ${contestId} in Supabase and Dexie.`);
    try {
      await this.clearAllQuestions(contestId, userId); // Resets stats (Supabase-first)
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

  async fetchAllNeverEncounteredRows(contestId: number, tableName: string = "questions"): Promise<Question[]> {
    const chunkSize = 1000; // Supabase limit
    let allRows: Question[] = [];
    let start = 0;

    while (true) {
      const { data, error } = await this.supabase.from('questions').select('*')
        .eq('fk_contest_id', contestId)
        .eq('times_correct', 0)
        .eq('times_incorrect', 0)
        .range(start, start + chunkSize - 1)
        .order('id', { ascending: true });

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

  async fetchAllRows(contestId: number, tableName: string = "questions", userId?: number): Promise<Question[]> {
    const chunkSize = 1000; // Supabase limit
    let allRows: Question[] = [];
    let start = 0;

    while (true) {
      const { data, error } = await this.supabase.from('questions').select('*')
        .eq('fk_contest_id', contestId)
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

  async countAllRows(contestId: number, tableName: string = "questions", userId?: number): Promise<number> {
    const { count, error } = await this.supabase.from(tableName).select('id', { count: 'exact', head: true })
      .eq('fk_contest_id', contestId);

    if (error) {
      console.error('Error fetching rows:', error);
      throw error;
    }

    return count ?? 0;
  }

  mapAnsweredQuestionToQuestion(answered: AnsweredQuestion): Question {
    return {
      id: answered.questionId,
      text: answered.questionSnapshot.text,
      topic: answered.questionSnapshot.topic,
      scoreIsCorrect: answered.questionSnapshot.scoreIsCorrect,
      scoreIsWrong: answered.questionSnapshot.scoreIsWrong,
      scoreIsSkip: answered.questionSnapshot.scoreIsSkip,
      contestId: answered.contestId,
      options: answered.questionSnapshot.options,
      correctAnswerIndex: answered.questionSnapshot.correctAnswerIndex,
      explanation: answered.questionSnapshot.explanation,
      isFavorite: answered.questionSnapshot.isFavorite,
      // Add other fields as needed, possibly with default values or undefined
    };
  }

  async getAllUsers(): Promise<User[]> {
    const operationName = 'getAllUsers';
    try {
      const { data, error } = await this.supabase.from('users').select('*');
      if (error) {
        console.error(`[DatabaseService] Supabase error in ${operationName}:`, error);
        if (!navigator.onLine) {
          console.warn(`[DatabaseService] Offline: No Dexie fallback for users table.`);
          return [];
        }
        throw error;
      }
          return data.map(row => this.mapUserFromDB(row)) ?? [];
    } catch (err) {
      console.error(`Error in ${operationName}:`, err);
      if (!navigator.onLine) {
        console.warn(`[DatabaseService] Offline: No Dexie fallback for users table.`);
        return [];
      }
      throw err;
    }
  }

  async getUserByUsername(username: string): Promise<User> {
    const operationName = 'getUserByUsername';
    try {
      const { data, error } = await this.supabase.from('users').select('*').eq('username',username);
      if (error) {
        console.error(`[DatabaseService] Supabase error in ${operationName}:`, error);
        throw error;
      }
      return this.mapUserFromDB(data[0]);
    } catch (err) {
      console.error(`Error in ${operationName}:`, err);
      throw err;
    }
  }

  private mapUserFromDB(dbUser: any): User {
    if (!dbUser) return undefined as any;
    const userResult = {
      id: dbUser.id,
      username: dbUser.username,
      hashedPassword: dbUser.password,
      isActive: dbUser.is_active,
      displayName: dbUser.display_name ?? dbUser.displayName,
      // createdAt: supabaseUser.created_at ? new Date(supabaseUser.created_at) : undefined,
      // Add other fields as needed, mapping snake_case to camelCase
    };
    return userResult;
  }
}
