import Dexie, { Table } from 'dexie';
import { Question } from '../../models/question.model'; // Adjust path if necessary
import { QuizAttempt } from '../../models/quiz.model';   // Adjust path if necessary
import { initialQuestions } from '../../../assets/data/quiz_data';
import { AuthService } from './auth.service';


// --- IMPORTANT: Increment this version number whenever you update initialQuestions ---
const CURRENT_DB_SCHEMA_VERSION = 30; // Example: If previous was 5

// 1. Define a class that extends Dexie
export class AppDB extends Dexie {



  // 2. Define tables as properties
  questions!: Table<Question, string>; // string = type of the primary key (Question['id'])
  quizAttempts!: Table<QuizAttempt, string>; // string = type of the primary key (QuizAttempt['id'])

  private jsonPath = 'assets/data/quiz_data.ts';

  constructor(private authService: AuthService) {
    super('QuizAppDB');
    if (!authService.getCurrentUserSnapshot()) {
      return;
    }
    console.log("here I am logged in")
    this.version(CURRENT_DB_SCHEMA_VERSION).stores({
      questions: 'id, topic, difficulty, timesCorrect, timesIncorrect, isFavorite, questionVersion, lastAnsweredTimestamp, lastAnswerCorrect, accuracy, publicContest',  // Removed & for boolean indexing
      quizAttempts: 'id, timestampEnd, status, settings.selectedTopics, timestampStart, settings.publicContest' // Status index added
    }).upgrade(async tx => {


      // This upgrade function runs if the database version is older than CURRENT_DB_SCHEMA_VERSION
      console.log(`Upgrading database to version ${CURRENT_DB_SCHEMA_VERSION}`);

      // Logic to update questions without losing other data
      const questionsTable = tx.table<Question, string>('questions');
      const currentQuestionsInDb = await questionsTable.toArray();
      const currentQuestionsMap = new Map(currentQuestionsInDb.map(q => [q.id, q]));

      const questionsToPut: Question[] = []; // For updates
      const questionsToAdd: Question[] = []; // For new questions
      const idsInInitialSet = new Set<string>();

      const puts: Question[] = [];
      const adds: Question[] = [];
      const idsInNewSet = new Set<string>();

      for (const newQ_from_initial of initialQuestions) {
        idsInInitialSet.add(newQ_from_initial.id);
        const existingQ_in_db = currentQuestionsMap.get(newQ_from_initial.id);

        if (existingQ_in_db) {
          // Question exists in DB. Check if content from initialQuestions is newer or different.
          const newVersion = newQ_from_initial.questionVersion || 1;
          const existingVersion = existingQ_in_db.questionVersion || 0; // Default to 0 if not present

          // Define what constitutes a content change that requires an update
          const contentChanged =
            existingQ_in_db.text !== newQ_from_initial.text ||
            JSON.stringify(existingQ_in_db.options) !== JSON.stringify(newQ_from_initial.options) ||
            existingQ_in_db.correctAnswerIndex !== newQ_from_initial.correctAnswerIndex ||
            existingQ_in_db.topic !== newQ_from_initial.topic ||
            existingQ_in_db.explanation !== newQ_from_initial.explanation ||
            existingQ_in_db.difficulty !== newQ_from_initial.difficulty ||
            existingQ_in_db.publicContest !== newQ_from_initial.publicContest; // Assuming publicContest can change

          if (newVersion > existingVersion || (newVersion === existingVersion && contentChanged)) {
            console.log(`Updating question content for ID: ${newQ_from_initial.id}. New version: ${newVersion}`);
            // Preserve user-specific stats from the existing DB record
            questionsToPut.push({
              ...newQ_from_initial, // Base new content
              id: existingQ_in_db.id, // Ensure ID is from existing
              // Preserve these user-specific fields from the database version
              timesCorrect: existingQ_in_db.timesCorrect || 0,
              timesIncorrect: existingQ_in_db.timesIncorrect || 0,
              isFavorite: existingQ_in_db.isFavorite || 0,
              lastAnsweredTimestamp: existingQ_in_db.lastAnsweredTimestamp,
              lastAnswerCorrect: existingQ_in_db.lastAnswerCorrect,
              accuracy: existingQ_in_db.accuracy,
              // Update questionVersion from the initialQuestions if it's higher
              questionVersion: newVersion,
              scoreIsCorrect: existingQ_in_db.scoreIsCorrect,
              scoreIsWrong: existingQ_in_db.scoreIsWrong,
              scoreIsSkip: existingQ_in_db.scoreIsSkip,
              contestId: existingQ_in_db.contestId
            });
          } else {
            // No content update needed based on version or content diff,
            // but we might still want to ensure all fields from initialQuestions are present
            // if the schema added new ones that aren't user-specific.
            // For now, we assume if version is same/lower and content same, no action.
            // If you add new non-stat fields to `Question` and want them from `initialQuestions`
            // even if version is same, you'd add that logic here.
          }
        } else {
          // Question is in initialQuestions but not in DB (new question)
          console.log(`Adding new question from initial set: ${newQ_from_initial.id}`);
          questionsToAdd.push({
            ...newQ_from_initial,
            // Initialize stats for new questions
            timesCorrect: 0,
            timesIncorrect: 0,
            isFavorite: newQ_from_initial.isFavorite || 0, // Use provided or default
            lastAnsweredTimestamp: undefined,
            lastAnswerCorrect: undefined,
            accuracy: undefined,
            questionVersion: newQ_from_initial.questionVersion || 1,
            scoreIsCorrect: 0.029,
            scoreIsWrong: 0.029,
            scoreIsSkip: 0,
            contestId: 1 // default
          });
        }
      }

      if (questionsToPut.length > 0) {
        await questionsTable.bulkPut(questionsToPut);
        console.log(`Successfully updated content for ${questionsToPut.length} questions while preserving stats.`);
      }
      if (questionsToAdd.length > 0) {
        await questionsTable.bulkAdd(questionsToAdd);
        console.log(`Successfully added ${questionsToAdd.length} new questions with initial stats.`);
      }

      // Optional: Handle questions that are in the DB but NO LONGER in initialQuestions.
      // This depends on your desired behavior (keep them, mark as obsolete, delete them).
      // Deleting can cause issues if old quiz attempts reference these question IDs
      // and don't have full snapshots.
      const questionsToDeleteIds: string[] = [];
      currentQuestionsInDb.forEach(dbQ => {
        if (!idsInInitialSet.has(dbQ.id)) {
          // This question is in the DB but not in the new initialQuestions.ts
          console.log(`Question ID ${dbQ.id} is in DB but not in the new initial set. Consider how to handle.`);
          // Example: Mark as obsolete (requires adding an 'isObsolete' field to Question model and schema)
          // questionsToPut.push({ ...dbQ, isObsolete: true });
          // Example: Delete (USE WITH CAUTION)
          // questionsToDeleteIds.push(dbQ.id);
        }
      });
      // if (questionsToDeleteIds.length > 0) {
      //   await questionsTable.bulkDelete(questionsToDeleteIds);
      //   console.log(`Deleted ${questionsToDeleteIds.length} questions no longer present in initialQuestions.ts`);
      // }

    }); // End of upgrade

    // This on.populate only runs if the DB is being created from scratch for this version.
    this.on('populate', async () => {
      console.log('Populating new database with initialQuestions...');
      const questionsWithDefaults = initialQuestions.map(q => ({
        ...q,
        timesCorrect: 0,
        timesIncorrect: 0,
        isFavorite: q.isFavorite || 0,
        questionVersion: q.questionVersion || 1,
        lastAnsweredTimestamp: undefined,
        lastAnswerCorrect: undefined,
        accuracy: undefined,
        scoreIsCorrect: 0.029,// default
        scoreIsWrong: 0.029,// default
        scoreIsSkip: 0,// default
        // Ensure all fields defined in the schema have a default or are from initialQuestions
        publicContest: q.publicContest, // If publicContest is in your Question model
        contestId: 1
      }));
      try {
        await this.questions.bulkAdd(questionsWithDefaults);
        console.log(`Database populated with ${questionsWithDefaults.length} initial questions.`);
      } catch (error) {
        console.error('Error populating initial questions:', error);
      }
    });
  } // End of AppDB constructor

  // The BehaviorSubject related methods (allQuestionsSubject, etc.) and populateInitialDataIfNeeded
  // are more for managing an in-memory state or initial load from a JSON file via HTTP,
  // which is different from the Dexie `on('populate')` or `upgrade` logic for the DB itself.
  // If initialQuestions.ts is your single source of truth for the question *content*,
  // these might not be needed in AppDB. They fit better in DatabaseService if you want to
  // fetch from a dynamic source.

  // Remove these from AppDB if initialQuestions.ts is the sole source for DB population:
  // private allQuestionsSubject = new BehaviorSubject<Question[]>([]);
  // allQuestions$ = this.allQuestionsSubject.asObservable();
  // private currentTopicQuestionsSubject = new BehaviorSubject<Question[]>([]);
  // currentTopicQuestions$ = this.currentTopicQuestionsSubject.asObservable();
  // private topicsSubject = new BehaviorSubject<string[]>([]);
  // topics$ = this.topicsSubject.asObservable();
  // public loadInitialQuestions(): void { ... }
  // private handleError(error: any) { ... }
  // async populateInitialDataIfNeeded() { ... }
}
