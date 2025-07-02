-- First, drop the view if it exists, to make this script re-runnable
DROP VIEW IF EXISTS searchable_questions;

-- Create a view that includes all original columns from 'questions'
-- plus a new 'searchable_text' column for easy searching.
CREATE VIEW searchable_questions AS
SELECT
  -- Select all original columns from the questions table
  id,
  created_at,
  text,
  options,
  fk_contest_id,
  topic,
  "scoreIsWrong",
  "scoreIsCorrect", -- Added the missing comma here
  "scoreIsSkip",
  explanation,
  -- Add any other columns you have...

  -- Create the combined, searchable text field
  -- 1. COALESCE handles cases where text might be null
  -- 2. array_to_string converts the text[] array into a single string with spaces
  -- 3. The || operator concatenates everything together
  COALESCE(text, '') || ' ' || COALESCE(array_to_string(options, ' '), '') || COALESCE(explanation, '') AS searchable_text
FROM
  questions;