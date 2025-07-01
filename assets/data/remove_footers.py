from docx import Document
import os

def remove_all_headers_and_footers(doc_path):
    """
    Removes all headers and footers from every section of a .docx file.
    
    Args:
        doc_path (str): The full path to the .docx file.
    """
    try:
        # Load the document
        doc = Document(doc_path)
        print(f"Processing document: {doc_path}")

        # Iterate through all sections in the document
        for section in doc.sections:
            # --- THE FIX IS HERE: .clear() instead of .clear_content() ---
            
            # Clear the primary header and footer
            section.header._element.clear()
            section.footer._element.clear()
            
            # Clear the first page header and footer (if they exist)
            if section.first_page_header:
                section.first_page_header._element.clear()
            if section.first_page_footer:
                section.first_page_footer._element.clear()
            
            # Clear the even page header and footer (if they exist)
            if section.even_page_header:
                section.even_page_header._element.clear()
            if section.even_page_footer:
                section.even_page_footer._element.clear()

        # Create a new filename for the cleaned document
        base_name = os.path.basename(doc_path)
        dir_name = os.path.dirname(doc_path)
        new_filename = os.path.join(dir_name, f"cleaned_{base_name}")

        # Save the modified document
        doc.save(new_filename)
        print(f"Successfully removed all headers and footers. Cleaned file saved as: {new_filename}\n")

    except Exception as e:
        print(f"An error occurred while processing {doc_path}: {e}\n")


# --- USAGE EXAMPLE ---
if __name__ == "__main__":
    # Replace this with the path to your document
    # Example for Windows: 'C:\\Users\\YourUser\\Documents\\BANCADATICAR25_removed.docx'
    # Example for macOS/Linux: '/home/user/documents/BANCADATICAR25_removed.docx'
    document_to_clean = 'BANCADATICAR25_removed.docx' 
    
    if os.path.exists(document_to_clean):
        remove_all_headers_and_footers(document_to_clean)
    else:
        print(f"Error: The file '{document_to_clean}' was not found.")
        print("Please update the 'document_to_clean' variable with the correct file path.")