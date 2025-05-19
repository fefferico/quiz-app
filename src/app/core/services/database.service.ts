// src/app/core/services/database.service.ts
import { Injectable } from '@angular/core';
import { Question } from '../../models/question.model'; // Adjust path if necessary
import { QuizAttempt, TopicCount } from '../../models/quiz.model';   // Adjust path if necessary
import { AppDB } from './appDB';

@Injectable({
  providedIn: 'root' // Ensures this service is a singleton
})
export class DatabaseService {
  private db: AppDB;

  constructor() {
    console.log('DatabaseService constructor called.');
    this.db = new AppDB();

    this.db.open().then(async () => {
      console.log('Database opened successfully by DatabaseService.');
      // The populateInitialDataIfNeeded from AppDB's on('populate') or the upgrade function
      // will handle initial data or schema changes.
      // No need for an additional populateInitialDataIfNeeded() call here from the service
      // unless it serves a different purpose (e.g., fetching dynamic data not in initialQuestions.ts).
    }).catch(err => {
      console.error('Failed to open database from DatabaseService: ', err.stack || err);
    });
  }

  // --- Question Table Methods ---
  getAllQuestions(contestId: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId).toArray();
  }

  getAllQuestionAnsweredAtLeastOnce(contestId: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) > 0 || (question?.timesIncorrect ?? 0) > 0))
      .toArray();
  }

  getAllQuestionCorrectlyAnsweredAtLeastOnce(contestId: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) > 0))
      .toArray();
  }

  getOnlyQuestionCorrectlyAnswered(contestId: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) > 0 && (question?.timesIncorrect ?? 0) === 0))
      .toArray();
  }

  getQuestionsByCorrectnessRange(contestId: string, min: number, max: number): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => question !== undefined && this.rateOfCorrectlyAnswered(question) >= min && this.rateOfCorrectlyAnswered(question) >= min)
      .toArray();
  }

  getAllQuestionNeverAnswered(contestId: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => question !== undefined && ((question?.timesCorrect ?? 0) === 0 && (question?.timesIncorrect ?? 0) === 0))
      .toArray();
  }

  getAllQuestionWronglyAnsweredAtLeastOnce(contestId: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => question !== undefined && ((question?.timesIncorrect ?? 0) > 0))
      .toArray();
  }

  rateOfCorrectlyAnswered(question: Question): number {
    return ((question.timesCorrect ?? 0) / ((question.timesCorrect ?? 0) + (question.timesIncorrect ?? 0))) * 100;
  }

  getQuestionsByTopic(contestId: string, topic: string): Promise<Question[]> {
    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => topic.toLowerCase() === (question.topic ?? '').toLowerCase()).toArray();
  }

  getQuestionsByTopics(contestId: string, topics: string[]): Promise<Question[]> {
    if (!topics || topics.length === 0) {
      return this.getAllQuestions(contestId); // Or handle as an error/empty array
    }

    return this.db.questions.where('publicContest').equals(contestId)
      .filter(question => {
        return topics.some(topic => topic.toLowerCase() === (question.topic ?? '').toLowerCase());
      })
      .toArray();
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
    contestId: string,
    count: number, // Overall target count, or sum from distribution
    topics: string[] = [], // For simple mode or fallback
    keywords: string[] = [],
    questionIDs: string[] = [],
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
        if (questionIDs && questionIDs.length > 0) {
          query = this.db.questions.where('publicContest').equals(contestId)
            .filter(question => {
              return topics.some(topic => topic.toLowerCase() === (question.topic ?? '').toLowerCase());
            }).filter(qst => questionIDs.includes(qst.id));

        } else {
          query = this.db.questions.where('publicContest').equals(contestId)
            .filter(question => dist.topic.toLowerCase() === (question.topic ?? '').toLowerCase());
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
      if (questionIDs && questionIDs.length > 0) {
        query = this.getQuestionByIds(questionIDs);
      } else {
        console.log('[DBService] Using Simple Mode. Topics:', topics, 'Global count:', count);
        query = this.getQuestionsByTopics(contestId, topics);
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

  async getNeverEncounteredRandomQuestionsByParams(
    contestId: string,
    count: number,
    topics: string[] = [],
    keywords: string[] = [],
    questionIDs: string[] = [],
    topicDistribution?: TopicCount[]
  ): Promise<Question[]> {
    let allFetchedQuestions: Question[] = [];

    if (topicDistribution && topicDistribution.length > 0) {
      for (const dist of topicDistribution) {
        if (dist.count <= 0) continue;

        let query = null;
        if (questionIDs && questionIDs.length > 0) {
          query = this.db.questions.where('publicContest').equals(contestId)
            .filter(qst => questionIDs.includes(qst.id));
        } else {
          query = this.db.questions.where('publicContest').equals(contestId)
            .filter(question => dist.topic.toLowerCase() === (question.topic ?? '').toLowerCase());
        }
        let topicSpecificQuestions = await query
          .filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0)
          .toArray();

        if (keywords.length > 0) {
          topicSpecificQuestions = topicSpecificQuestions.filter(question => {
            const questionTextLower = question.text.toLowerCase();
            return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
          });
        }

        const shuffledTopicQuestions = topicSpecificQuestions.sort(() => 0.5 - Math.random());
        allFetchedQuestions.push(...shuffledTopicQuestions.slice(0, dist.count));
      }
      allFetchedQuestions.sort(() => 0.5 - Math.random());
      return allFetchedQuestions;
    } else {
      let questions: Question[] = [];
      if (questionIDs && questionIDs.length > 0) {
        questions = await this.getQuestionByIds(questionIDs);
      } else if (topics && topics.length > 0) {
        questions = await this.getQuestionsByTopics(contestId, topics);
      } else {
        questions = await this.getAllQuestions(contestId);
      }

      let filteredQuestions = questions.filter(
        q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0
      );

      if (keywords.length > 0) {
        filteredQuestions = filteredQuestions.filter(question => {
          const questionTextLower = question.text.toLowerCase();
          return keywords.some(kw => questionTextLower.includes(kw.toLowerCase()));
        });
      }

      const shuffled = filteredQuestions.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
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
  async addQuizAttempt(quizAttempt: QuizAttempt): Promise<string> {
    const attemptToSave: QuizAttempt = {
      ...quizAttempt,
      timestampStart: new Date(quizAttempt.timestampStart),
      timestampEnd: quizAttempt.timestampEnd ? new Date(quizAttempt.timestampEnd) : undefined
    };
    return this.db.quizAttempts.add(attemptToSave);
  }

  getAllQuizAttemptsByContest(contestId: string | null): Promise<QuizAttempt[]> {
    // Order by most recent first
    if (!contestId || contestId === null) {
      return Promise.resolve([]);
    }

    return this.db.quizAttempts.where('settings.publicContest').equals(contestId).toArray();
  }

  getAllTodayQuizAttempts(contestId: string): Promise<QuizAttempt[]> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return this.db.quizAttempts.where('settings.publicContest').equals(contestId)
      .filter(attempt =>
        (attempt.timestampStart >= startOfDay && attempt.timestampStart <= endOfDay) ||
        (attempt.timestampEnd !== undefined && attempt.timestampEnd >= startOfDay && attempt.timestampStart <= endOfDay)
      ).toArray();
  }

  getAllYesterdayQuizAttempts(contestId: string): Promise<QuizAttempt[]> {
    const today = new Date();
    const startOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const endOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return this.db.quizAttempts.where('settings.publicContest').equals(contestId)
      .filter(attempt =>
        (attempt.timestampStart >= startOfYesterday && attempt.timestampStart <= endOfYesterday) ||
        (attempt.timestampEnd !== undefined && attempt.timestampEnd >= startOfYesterday && attempt.timestampStart <= endOfYesterday)
      ).toArray();
  }

  async getYesterdayProblematicQuestion(contestId: string | null = null): Promise<Question[]> {
    const ids = await this.getProblematicQuestionsIdsByDate('yesterday', contestId);
    return this.getQuestionByIds(ids);
  }


  async getProblematicQuestionsIdsByDate(
    dateSpecifier: 'today' | 'yesterday' | Date,
    contestId: string | null = null // Optional contestId

  ): Promise<string[]> {
    let startDate: Date;
    let endDate: Date;

    if (dateSpecifier === 'today') {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }
    else if (dateSpecifier === 'yesterday') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    }
    else {
      startDate = new Date(dateSpecifier);
      endDate = new Date(dateSpecifier);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    let query = this.db.quizAttempts
      .where('timestampEnd')
      .between(startDate, endDate, true, true);

    // --- SCOPE BY CONTEST IF PROVIDED ---
    if (contestId) {
      // This assumes you add 'settings.publicContest' to your quizAttempts index
      // and save it when a contest-specific quiz is taken.
      // If not indexed, this filter will be less performant on large datasets.
      // Alternatively, filter after fetching all attempts for the date.
      // For now, let's assume you'll filter after fetching if not indexed.
      // If indexed: query = query.and(attempt => attempt.settings.publicContest === contestId);
    }

    let attempts: QuizAttempt[] = await query.toArray();
    let unansweredIDs = new Set<string>();
    let answeredWronglyIDs = new Set<string>();

    const problematicIds = new Set<string>();
    if (!attempts || attempts.length === 0) {
      return Array.from(problematicIds);
    } else {
      for (const attempt of attempts) {

        // --- If contestId is provided, only process attempts matching that contest ---
        if (contestId && attempt.settings.publicContest !== contestId) {
          continue;
        }

        if (attempt.answeredQuestions && attempt.answeredQuestions.length > 0) {
          for (const aq of attempt.allQuestions) {
            const qst = await this.getQuestionById(aq.questionId);
            // recovering the correctness from the question and the attempt itself
            const isUnansweredInsideAttempt = attempt.allQuestions && attempt.allQuestions.some(attemptQst => attemptQst?.questionId === qst?.id);
            const isWrongInsideAttempt = aq?.isCorrect === false;
            const isQstNeverBeenAnswered = (qst?.lastAnsweredTimestamp ?? 0) === 0;

            let isWrongInsideQst: boolean | undefined = true;
            isWrongInsideQst = qst && (isQstNeverBeenAnswered || ((qst?.lastAnsweredTimestamp ?? 0) >= startDate.getTime() && (qst?.lastAnsweredTimestamp ?? 0) <= endDate.getTime() && !qst?.lastAnswerCorrect));
            if (((isWrongInsideAttempt || isUnansweredInsideAttempt) && (!isWrongInsideQst && isQstNeverBeenAnswered)) || isWrongInsideQst) {
              problematicIds.add(aq.questionId);
              answeredWronglyIDs.add(aq.questionId);
            }
          }
        } else {
          if (attempt.unansweredQuestions && attempt.unansweredQuestions.length > 0) {
            for (const qst of attempt.unansweredQuestions) {
              if (qst && qst.questionId) {
                problematicIds.add(qst.questionId);
                unansweredIDs.add(qst.questionId);
              }
            }
          }
        }
      }
      // we have to be 100% certain that previously skipped questions (unansweredIDs) does not contain IDs of questions which has been marked as correct lately
      // Remove from unansweredIDs any question that has since been answered correctly
      for (const id of unansweredIDs) {
        const qst = await this.getQuestionById(id);
        let isCorrectInsideQst: boolean | undefined = false;
        isCorrectInsideQst = qst && (qst?.lastAnsweredTimestamp ?? 0) > 0 && (((qst?.lastAnsweredTimestamp ?? 0) >= startDate.getTime() && (qst?.lastAnsweredTimestamp ?? 0) <= endDate.getTime() && qst?.lastAnswerCorrect));
        if (isCorrectInsideQst) {
          unansweredIDs.delete(id);
        }
      }

      const resultingSet = new Set([...answeredWronglyIDs, ...unansweredIDs]);
      return Array.from(resultingSet);
    }
  }

  async getTodayProblematicQuestion(contestId: string | null = null): Promise<Question[]> {
    const ids = await this.getProblematicQuestionsIdsByDate('today', contestId);
    return this.getQuestionByIds(ids);
  }

  async getXDayProblematicQuestion(date: Date, contestId: string | null = null): Promise<Question[]> {
    const ids = await this.getProblematicQuestionsIdsByDate(date, contestId);
    return this.getQuestionByIds(ids);
  }

  async getNeverAnsweredQuestionIds(contestId: string | null = null): Promise<string[]> {
    let query = this.db.questions.filter(q => (q.timesCorrect ?? 0) === 0 && (q.timesIncorrect ?? 0) === 0);
    if (contestId) {
      query = query.and(q => q.publicContest === contestId);
    }
    const questions = await query.toArray();
    return questions.map(q => q.id);
  }


  getQuizAttemptById(id: string): Promise<QuizAttempt | undefined> {
    return this.db.quizAttempts.get(id);
  }

  deleteQuizAttempt(id: string): Promise<void> {
    return this.db.quizAttempts.delete(id);
  }

  async clearAllQuizAttempts(contestId: string): Promise<void> {
    try {
      // Step 1: Find the primary keys of the items to delete
      const questionKeysToDelete = await this.db.quizAttempts
        .where('settings.publicContest') // Assuming 'publicContest' is an indexed field
        .equals(contestId)
        .primaryKeys(); // Gets an array of primary keys

      if (questionKeysToDelete.length > 0) {
        // Step 2: Delete the items by their primary keys
        await this.db.quizAttempts.bulkDelete(questionKeysToDelete);
        console.log(`Successfully deleted ${questionKeysToDelete.length} attempts for contest ${contestId}`);
      } else {
        console.log(`No questions found for contest ${contestId} to delete.`);
      }
    } catch (error) {
      console.error(`Error deleting questions for contest ${contestId}:`, error);
      // Handle the error appropriately
    }
  }

  async clearAllQuestions(contestId: string): Promise<void> {
    try {
      // Step 1: Find the primary keys of the items to delete
      const questionKeysToReset = await this.db.questions
        .where('publicContest') // Assuming 'publicContest' is an indexed field
        .equals(contestId).toArray();

      if (questionKeysToReset.length > 0) {
        // Reset fields for each question to initial values
        await this.db.questions.bulkPut(
          questionKeysToReset.map(q => ({
            ...q,
            timesCorrect: 0,
            timesIncorrect: 0,
            lastAnsweredTimestamp: 0,
            lastAnswerCorrect: false,
            isFavorite: 0,
            accuracy: 0
          }))
        );
        console.log(`Successfully reset ${questionKeysToReset.length} questions for contest ${contestId}`);

        // Verification step:
        if (questionKeysToReset[0] && questionKeysToReset[0].id) { // Assuming 'id' is the primary key
          const firstUpdatedQuestionFromDB = await this.db.questions.get(questionKeysToReset[0].id);
          console.log("First question after bulkPut (from DB):", firstUpdatedQuestionFromDB);
          // Check if firstUpdatedQuestionFromDB.timesCorrect is 0, etc.
        }
      }
      else {
        console.log(`No questions found for contest ${contestId} to delete.`);
      }
    } catch (error) {
      console.error(`Error deleting questions for contest ${contestId}:`, error);
      // Handle the error appropriately
    }
  }

  // --- General DB Methods ---
  async resetContest(contestId: string): Promise<void> {
    await this.clearAllQuestions(contestId);
    await this.clearAllQuizAttempts(contestId);
    console.log('Database has been reset.');
  }

  // IMPORTANT: WHEN SAVING A QUIZ ATTEMPT THAT WAS CONTEST-SPECIFIC
  async saveQuizAttempt(quizAttempt: QuizAttempt): Promise<string> {
    console.log('[DBService] Saving/Updating Quiz Attempt:', quizAttempt.id, 'Status:', quizAttempt.status);
    const attemptToSave: QuizAttempt = {
      ...quizAttempt,
      timestampStart: new Date(quizAttempt.timestampStart),
      timestampEnd: quizAttempt.timestampEnd ? new Date(quizAttempt.timestampEnd) : undefined,
      // Ensure settings.publicContest is saved if the quiz was from a contest
      settings: {
        ...quizAttempt.settings,
        // publicContest should be passed from QuizTakingComponent based on queryParams
      }
    };
    return this.db.quizAttempts.put(attemptToSave);
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
    // await this.db.populateInitialDataIfNeeded(); // Call populate here
  }

  // async getAllQuestionsNew(): Promise<Question[]> {
  //   // Implement logic to fetch every single question from your database
  //   // Example using Dexie:
  //   // return this.db.questions.toArray();
  //   // This is highly dependent on your actual database implementation.
  //   // For now, a placeholder:
  //   console.warn("DatabaseService.getAllQuestions() needs to be implemented fully.");
  //   const allAttempts = await this.getAllQuizAttempts();
  //   const questionMap = new Map<string, Question>();
  //   allAttempts.forEach(attempt => {
  //     attempt.allQuestions.forEach(qInfo => {
  //       if (!questionMap.has(qInfo.questionId)) {
  //         questionMap.set(qInfo.questionId, {
  //           id: qInfo.questionId,
  //           text: qInfo.questionSnapshot.text,
  //           options: qInfo.questionSnapshot.options,
  //           correctAnswerIndex: qInfo.questionSnapshot.correctAnswerIndex,
  //           topic: qInfo.questionSnapshot.topic,
  //           explanation: qInfo.questionSnapshot.explanation,
  //           // isFavorite might not be in snapshot or needs to be fetched separately
  //         });
  //       }
  //     });
  //   });
  //   return Array.from(questionMap.values());
  // }

  // IMPORTANT: Ensure your updateQuestionStats correctly updates whatever fields
  // getNeverAnsweredQuestionIds relies on (e.g., a 'answeredCount' or 'lastAnsweredDate' on the question or its stats)
  async updateQuestionStats(questionId: string, isCorrect: boolean): Promise<void> {
    try {
      // Dexie's update method can take a function to modify the object
      await this.db.questions.where({ id: questionId }).modify(question => {
        question.timesCorrect = (question.timesCorrect || 0) + (isCorrect ? 1 : 0);
        question.timesIncorrect = (question.timesIncorrect || 0) + (isCorrect ? 0 : 1);
        question.lastAnsweredTimestamp = new Date().getTime();
        question.lastAnswerCorrect = isCorrect;

        const timesAnswered = question.timesCorrect + question.timesIncorrect;
        if (timesAnswered > 0) {
          question.accuracy = parseFloat(((question.timesCorrect / timesAnswered) * 100).toFixed(2));
        } else {
          question.accuracy = undefined; // Or 0, depending on preference
        }
      });
    } catch (error) {
      console.error(`Error updating stats for question ${questionId}:`, error);
    }
  }

  async getQuizAttemptsBySpecificDate(contestId: string, date: Date): Promise<QuizAttempt[]> {
    const xDayStart: Date = new Date(date);
    const xDayEnd: Date = new Date(date);

    xDayStart.setHours(0, 0, 0, 0);
    xDayEnd.setHours(23, 59, 59, 999);

    const attempts = this.db.quizAttempts.where('settings.publicContest').equals(contestId)
      .filter(attempt =>
        (attempt.timestampStart >= xDayStart && attempt.timestampStart <= xDayEnd) ||
        (attempt.timestampEnd !== undefined && attempt.timestampEnd >= xDayStart && attempt.timestampStart <= xDayEnd)
      ).toArray();
    return attempts;
  }

  async getAvailablePublicContests(): Promise<string[]> {
    const allQuestions = await this.db.questions.toArray();
    const contestSet = new Set<string>();
    allQuestions.forEach(q => {
      if (q.publicContest && q.publicContest.trim() !== '') {
        contestSet.add(q.publicContest);
      }
    });
    return Array.from(contestSet).sort(); // Sort them alphabetically
  }

  async getQuestionsByPublicContest(contestIdentifier: string): Promise<Question[]> {
    if (!contestIdentifier) {
      return Promise.resolve([]);
    }
    return this.db.questions.where('publicContest').equalsIgnoreCase(contestIdentifier).toArray();
  }


}
