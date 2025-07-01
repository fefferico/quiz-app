import json
import re
import PyPDF2
import pdfplumber
from typing import List, Dict, Optional
import argparse
import sys

class QuestionExtractor:
    def __init__(self):
        self.questions = []
        
    def extract_text_from_pdf(self, pdf_path: str, start_page: int = None, end_page: int = None) -> str:
        """Extract text from PDF using pdfplumber for better text extraction"""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                total_pages = len(pdf.pages)
                
                # Determine page range
                start_idx = (start_page - 1) if start_page else 0
                end_idx = end_page if end_page else total_pages
                
                # Validate page range
                start_idx = max(0, start_idx)
                end_idx = min(total_pages, end_idx)
                
                if start_idx >= end_idx:
                    print(f"Warning: Invalid page range. Start: {start_page}, End: {end_page}, Total pages: {total_pages}")
                    return ""
                
                print(f"Extracting text from pages {start_idx + 1} to {end_idx} (Total pages: {total_pages})")
                
                text = ""
                for i in range(start_idx, end_idx):
                    page_text = pdf.pages[i].extract_text()
                    if page_text:
                        text += page_text + "\n"
                return text
        except Exception as e:
            print(f"Error extracting text with pdfplumber: {e}")
            # Fallback to PyPDF2
            return self.extract_text_pypdf2(pdf_path, start_page, end_page)
    
    def extract_text_pypdf2(self, pdf_path: str, start_page: int = None, end_page: int = None) -> str:
        """Fallback method using PyPDF2"""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                total_pages = len(pdf_reader.pages)
                
                # Determine page range
                start_idx = (start_page - 1) if start_page else 0
                end_idx = end_page if end_page else total_pages
                
                # Validate page range
                start_idx = max(0, start_idx)
                end_idx = min(total_pages, end_idx)
                
                if start_idx >= end_idx:
                    print(f"Warning: Invalid page range. Start: {start_page}, End: {end_page}, Total pages: {total_pages}")
                    return ""
                
                text = ""
                for i in range(start_idx, end_idx):
                    text += pdf_reader.pages[i].extract_text() + "\n"
                return text
        except Exception as e:
            print(f"Error extracting text with PyPDF2: {e}")
            return ""
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize the extracted text"""
        # Remove extra whitespaces and normalize line breaks
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\n+', '\n', text)
        return text.strip()
    
    def parse_question_block(self, block: str) -> Optional[Dict]:
        """Parse a single question block and extract components"""
        lines = [line.strip() for line in block.split('\n') if line.strip()]
        
        if not lines:
            return None
        
        # Look for question ID pattern (4 digits at start of line)
        question_id = None
        question_text = ""
        options = {"A": "", "B": "", "C": "", "D": ""}
        correct_answer = None
        
        # Find question ID
        for line in lines:
            id_match = re.search(r'\b(\d{4})\b', line)
            if id_match:
                question_id = id_match.group(1)
                break
        
        if not question_id:
            return None
        
        # Extract question text and options
        full_text = " ".join(lines)
        
        # Try to find the main question text (usually contains "quale delle seguenti" or similar patterns)
        question_patterns = [
            r'([^"]*"[^"]*"[^"]*quale delle seguenti[^?]*\?)',
            r'([^"]*"[^"]*"[^"]*In base[^?]*\?)',
            r'([^"]*quale delle seguenti[^?]*\?)'
        ]
        
        for pattern in question_patterns:
            match = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
            if match:
                question_text = match.group(1).strip()
                question_text = re.sub(r'\s+', ' ', question_text)
                break
        
        # Extract options - look for patterns that indicate options
        # This is complex due to the formatting, so we'll use multiple strategies
        
        # Strategy 1: Look for clear option separators
        option_patterns = [
            r'([A-D])\s*[:\-]?\s*([^A-D\n]{10,}?)(?=[A-D]\s*[:\-]|$)',
            r'(?:^|\s)([A-D])\s+([^A-D\n]{5,}?)(?=\s[A-D]\s|$)',
        ]
        
        # Strategy 2: Split by common separators and try to identify options
        potential_options = []
        
        # Look for text segments that might be options
        segments = re.split(r'[A-D]\s*[:\-]?\s*', full_text)
        if len(segments) > 4:  # We expect at least 5 segments (text before A, then A, B, C, D)
            for i in range(1, min(5, len(segments))):  # Take segments 1-4 as potential options
                option_text = segments[i].strip()
                if len(option_text) > 5 and len(option_text) < 500:  # Reasonable option length
                    potential_options.append(option_text)
        
        # If we found potential options, assign them
        if len(potential_options) >= 4:
            options["A"] = potential_options[0]
            options["B"] = potential_options[1] 
            options["C"] = potential_options[2]
            options["D"] = potential_options[3]
        
        # Try to determine correct answer (this is challenging without clear marking)
        # For now, we'll set it to 0 as requested, but this should be manually verified
        correct_answer_index = 0
        
        # Create question object if we have minimum required data
        if question_id and question_text and any(options.values()):
            return {
                "id": question_id,
                "text": question_text,
                "topic": "",
                "options": [options["A"], options["B"], options["C"], options["D"]],
                "correctAnswerIndex": correct_answer_index,
                "explanation": "",
                "difficulty": "Medium",
                "timesCorrect": 0,
                "timesIncorrect": 0,
                "isFavorite": 0,
                "questionVersion": 0,
                "lastAnsweredTimestamp": -1,
                "lastAnswerCorrect": False,
                "accuracy": 0,
                "publicContest": "polizia_2025",
                "scoreIsCorrect": 0.029,
                "scoreIsWrong": 0.029,
                "scoreIsSkip": 0,
                "contestId": 8
            }
        
        return None
    
    def extract_questions_from_text(self, text: str) -> List[Dict]:
        """Extract all questions from the text"""
        questions = []
        
        # Clean the text
        text = self.clean_text(text)
        
        # Split text into potential question blocks
        # Look for question ID patterns to split
        question_blocks = re.split(r'(?=\d{4}\s)', text)
        
        for block in question_blocks:
            if not block.strip():
                continue
                
            question = self.parse_question_block(block)
            if question:
                questions.append(question)
        
        return questions
    
    def manual_extraction_fallback(self, text: str) -> List[Dict]:
        """Fallback method for manual extraction when automatic parsing fails"""
        print("Automatic extraction failed. Here's the extracted text for manual processing:")
        print("=" * 80)
        print(text[:2000] + "..." if len(text) > 2000 else text)
        print("=" * 80)
        
        # Return empty list - user will need to implement manual parsing
        return []
    
    def process_pdf(self, pdf_path: str, output_path: str = None, start_page: int = None, end_page: int = None) -> List[Dict]:
        """Main method to process PDF and extract questions"""
        print(f"Processing PDF: {pdf_path}")
        
        if start_page or end_page:
            print(f"Page range: {start_page or 'start'} to {end_page or 'end'}")
        
        # Extract text from PDF
        text = self.extract_text_from_pdf(pdf_path, start_page, end_page)
        
        if not text:
            print("Failed to extract text from PDF")
            return []
        
        print(f"Extracted {len(text)} characters of text")
        
        # Extract questions
        questions = self.extract_questions_from_text(text)
        
        if not questions:
            print("No questions found with automatic extraction. Trying fallback method...")
            questions = self.manual_extraction_fallback(text)
        
        print(f"Extracted {len(questions)} questions")
        
        # Save to JSON file
        if output_path:
            self.save_questions_to_json(questions, output_path)
        
        return questions
    
    def save_questions_to_json(self, questions: List[Dict], output_path: str):
        """Save questions to JSON file"""
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(questions, f, ensure_ascii=False, indent=2)
            print(f"Questions saved to: {output_path}")
        except Exception as e:
            print(f"Error saving questions to JSON: {e}")
    
    def print_questions_summary(self, questions: List[Dict]):
        """Print a summary of extracted questions"""
        print(f"\nExtracted {len(questions)} questions:")
        print("-" * 50)
        
        for i, q in enumerate(questions[:5], 1):  # Show first 5 questions
            print(f"Question {i} (ID: {q['id']}):")
            print(f"Text: {q['text'][:100]}...")
            print(f"Options: {len([opt for opt in q['options'] if opt.strip()])}/4 non-empty")
            print(f"Correct Answer Index: {q['correctAnswerIndex']}")
            print("-" * 50)
        
        if len(questions) > 5:
            print(f"... and {len(questions) - 5} more questions")

def main():
    parser = argparse.ArgumentParser(description='Extract questions from PDF exam files')
    parser.add_argument('pdf_path', help='Path to the PDF file')
    parser.add_argument('-o', '--output', help='Output JSON file path', 
                       default='extracted_questions.json')
    parser.add_argument('-s', '--start-page', type=int, help='Starting page number (1-based)', 
                       metavar='PAGE')
    parser.add_argument('-e', '--end-page', type=int, help='Ending page number (inclusive)', 
                       metavar='PAGE')
    parser.add_argument('-v', '--verbose', action='store_true', 
                       help='Print detailed information')
    
    args = parser.parse_args()
    
    # Validate page range
    if args.start_page and args.start_page < 1:
        print("Error: Start page must be 1 or greater")
        sys.exit(1)
    
    if args.end_page and args.end_page < 1:
        print("Error: End page must be 1 or greater")
        sys.exit(1)
    
    if args.start_page and args.end_page and args.start_page > args.end_page:
        print("Error: Start page cannot be greater than end page")
        sys.exit(1)
    
    try:
        extractor = QuestionExtractor()
        questions = extractor.process_pdf(args.pdf_path, args.output, args.start_page, args.end_page)
        
        if args.verbose:
            extractor.print_questions_summary(questions)
        
        if questions:
            print(f"\nSuccessfully extracted {len(questions)} questions")
            print(f"Output saved to: {args.output}")
        else:
            print("\nNo questions were extracted. You may need to:")
            print("1. Check if the PDF format is supported")
            print("2. Manually adjust the parsing patterns in the code")
            print("3. Verify the PDF contains the expected question format")
            print("4. Check if the specified page range contains questions")
            
    except FileNotFoundError:
        print(f"Error: PDF file '{args.pdf_path}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # If running without command line arguments, provide example usage
    if len(sys.argv) == 1:
        print("PDF Question Extractor")
        print("Usage: python script.py <pdf_path> [-o output.json] [-s start_page] [-e end_page] [-v]")
        print("\nExamples:")
        print("  python script.py exam.pdf -o questions.json -v")
        print("  python script.py exam.pdf -s 5 -e 15  # Extract pages 5-15")
        print("  python script.py exam.pdf -s 10       # Extract from page 10 to end")
        print("  python script.py exam.pdf -e 20       # Extract from start to page 20")
        print("\nParameters:")
        print("  -s, --start-page  Starting page number (1-based)")
        print("  -e, --end-page    Ending page number (inclusive)")
        print("  -o, --output      Output JSON file path")
        print("  -v, --verbose     Print detailed information")
        print("\nRequired packages:")
        print("  pip install PyPDF2 pdfplumber")
        sys.exit(0)
    
    main()