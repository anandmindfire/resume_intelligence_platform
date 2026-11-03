"""Extract name from resume text"""
import re
from typing import Optional

def extract_name(text: str) -> Optional[str]:
    """Extract name from resume text - comprehensive detection for any format"""
    if not text:
        return None
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return None
    
    # Strategy 1: Look for labeled name patterns (most reliable)
    for line in lines[:15]:
        name_labels = [
            r'name\s*[:]\s*([A-Za-z\s\.\-\']+)',
            r'full\s+name\s*[:]\s*([A-Za-z\s\.\-\']+)',
            r'candidate\s+name\s*[:]\s*([A-Za-z\s\.\-\']+)',
            r'applicant\s+name\s*[:]\s*([A-Za-z\s\.\-\']+)',
        ]
        for pattern in name_labels:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                if _is_valid_name(name):
                    return name
    
    # Strategy 2: First significant line (most resumes start with name)
    for i, line in enumerate(lines[:8]):
        # Skip empty lines and common headers
        if not line or len(line) < 3:
            continue
        
        # Skip if it's clearly not a name
        if _is_not_name(line):
            continue
        
        # Check if it looks like a name
        if _is_likely_name(line, i, lines):
            return line.strip()
    
    # Strategy 3: Look for patterns like "FirstName LastName" in first 10 lines
    for line in lines[:10]:
        # Pattern: 2-4 capitalized words, no special chars except hyphens/apostrophes
        name_pattern = r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$'
        if re.match(name_pattern, line):
            if _is_valid_name(line):
                return line
    
    # Strategy 4: Look for lines with title case (2-4 words) in header area
    for line in lines[:6]:
        words = line.split()
        if 2 <= len(words) <= 4:
            # Check if most words are capitalized (title case)
            capitalized = sum(1 for w in words if w and w[0].isupper())
            if capitalized >= len(words) * 0.75:  # 75% capitalized
                # Must be all letters (with allowed punctuation)
                if re.match(r'^[A-Za-z\s\.\-\']+$', line):
                    if _is_valid_name(line):
                        return line
    
    return None

def _is_valid_name(name: str) -> bool:
    """Validate if a string is likely a person's name"""
    if not name or len(name) < 2:
        return False
    
    words = name.split()
    if len(words) < 1 or len(words) > 5:
        return False
    
    # Filter out common non-name patterns
    non_name_keywords = [
        'resume', 'cv', 'curriculum vitae', 'phone', 'email', 'address',
        'objective', 'summary', 'profile', 'contact', 'linkedin', 'github',
        'experience', 'education', 'skills', 'projects', 'achievements',
        'professional', 'summary', 'overview', 'about', 'background'
    ]
    
    name_lower = name.lower()
    if any(keyword in name_lower for keyword in non_name_keywords):
        return False
    
    # Must contain at least some letters
    if not re.search(r'[A-Za-z]', name):
        return False
    
    # Should not be all numbers or special characters
    if re.match(r'^[\d\s\-\.]+$', name):
        return False
    
    return True

def _is_not_name(line: str) -> bool:
    """Check if line is definitely not a name"""
    line_lower = line.lower()
    
    # Document titles ("Resume", "Curriculum Vitae", "CV")
    if re.match(r'^(curriculum vitae|r[eé]sum[eé]|cv)\b', line_lower):
        return True

    # Contains email
    if '@' in line or re.search(r'[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', line_lower):
        return True
    
    # Contains phone number
    if re.search(r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}', line) or re.search(r'\+?\d{10,}', line):
        return True
    
    # Contains URL
    if re.search(r'https?://|www\.|linkedin\.com|github\.com', line_lower):
        return True
    
    # Too long (names are usually short)
    if len(line) > 60:
        return True
    
    # Contains numbers (except in middle initials like "John A. Doe")
    if re.search(r'\d', line) and not re.search(r'[A-Z]\.', line):
        return True
    
    # Common section headers
    section_headers = ['objective', 'summary', 'experience', 'education', 'skills',
                      'projects', 'certifications', 'achievements', 'awards', 'contact']
    if any(header in line_lower for header in section_headers):
        return True
    
    return False

def _is_likely_name(line: str, line_index: int, all_lines: list) -> bool:
    """Check if line is likely a name based on context"""
    words = line.split()
    
    # Name should be 2-4 words typically
    if not (2 <= len(words) <= 4):
        return False
    
    # Check capitalization pattern
    capitalized = sum(1 for w in words if w and w[0].isupper())
    if capitalized < len(words) * 0.7:  # Less than 70% capitalized
        return False
    
    # Must be all letters (with allowed punctuation)
    if not re.match(r'^[A-Za-z\s\.\-\']+$', line):
        return False
    
    # Check context - name is usually followed by contact info
    if line_index + 1 < len(all_lines):
        next_line = all_lines[line_index + 1].strip()
        # If next line has email/phone, this is likely the name
        if '@' in next_line or re.search(r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}', next_line):
            return True
        # If next line is short and looks like contact info
        if len(next_line) < 50 and (re.search(r'[a-z]+@', next_line.lower()) or 
                                     re.search(r'\+?\d', next_line)):
            return True
    
    # If it's the first non-empty line, it's likely the name
    if line_index == 0 or (line_index == 1 and not all_lines[0].strip()):
        return True
    
    return False
