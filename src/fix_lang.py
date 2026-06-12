import re
import glob

def clean_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    def replace_in_string(m):
        string_content = m.group(0)
        # If it has Sinhala characters
        if re.search(r'[\u0D80-\u0DFF]', string_content):
            # Remove anything like " (English text)"
            # Wait, some English words don't have spaces inside parens like (O/L), (A/L)
            # So let's match any parenthesis that contains at least one letter and no Sinhala characters.
            string_content = re.sub(r'\s*\([^)\u0D80-\u0DFF]+[a-zA-Z][^)\u0D80-\u0DFF]*\)', '', string_content)
        return string_content

    new_content = re.sub(r'(?:\'[^\']*\')|(?:\"[^\"]*\")|(?:`[^`]*`)', replace_in_string, content)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
for f in glob.glob('c:/Users/induw/mehewara-site/src/**/*.tsx', recursive=True):
    clean_file(f)
