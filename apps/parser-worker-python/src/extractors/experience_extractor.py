"""Extract work experience from resume text"""
import re
from typing import List, Dict, Any, Optional

_MONTH = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?'


def _is_ocr_bullet(line: str) -> bool:
    """OCR renders bullet glyphs as a lone lowercase letter ("e Built APIs"); "I"/"A" are real words"""
    return bool(re.match(r'^[a-z]\s+', line))


def extract_experience(text: str) -> List[Dict[str, Any]]:
    """Extract work experience entries with detailed information"""
    if not text:
        return []
    
    experiences = []
    lines = text.split('\n')
    
    current_exp: Dict[str, Any] = {}
    in_experience = False
    collecting_bullets = False
    
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            collecting_bullets = False
            continue
        
        line_lower = line_stripped.lower()
        
        # Detect experience section start (more variations)
        experience_keywords = ['experience', 'work history', 'employment', 'professional experience',
                             'work experience', 'career', 'employment history', 'professional background']
        if len(line_stripped) < 40 and any(keyword == line_lower or line_lower.startswith(keyword + ':') for keyword in experience_keywords):
            in_experience = True
            continue
        
        # Stop if we hit another major section
        if in_experience and len(line_stripped) < 40 and not _is_bullet_point(line_stripped):
            if any(keyword == line_lower or line_lower.startswith(keyword + ':') for keyword in ['education', 'projects', 'skills', 'certifications', 'achievements', 'awards']):
                break
        
        if in_experience:
            # Skip bullet points that start with single letters (like "e " which are OCR artifacts)
            if _is_ocr_bullet(line_stripped) and len(line_stripped) > 20:
                # This is likely a bullet point, not a job title
                if current_exp.get('title'):
                    # Add as responsibility
                    bullet_text = re.sub(r'^[a-z]\s+', '', line_stripped).strip()
                    if bullet_text:
                        current_exp['responsibilities'].append(bullet_text)
                        collecting_bullets = True
                continue
            
            # Check for "Company | Title | Location | Dates" format (pipe-separated)
            pipe_parts = [p.strip() for p in line_stripped.split('|')]
            if len(pipe_parts) >= 2 and not _is_bullet_point(line_stripped):
                # This might be a formatted experience entry
                parsed_entry = _parse_pipe_formatted_entry(pipe_parts, i, lines)
                if parsed_entry:
                    if current_exp and _is_complete_experience(current_exp):
                        experiences.append(current_exp)
                    current_exp = parsed_entry
                    collecting_bullets = False
                    continue

            # Check for "Title, Company, Location" format (comma-separated)
            # Only if line is reasonably short < 120 chars and NOT a bullet
            if ',' in line_stripped and len(line_stripped) < 120 and not _is_bullet_point(line_stripped):
                 parsed_entry = _parse_comma_separated_entry(line_stripped, i, lines)
                 if parsed_entry:
                    if current_exp and _is_complete_experience(current_exp):
                        experiences.append(current_exp)
                    current_exp = parsed_entry
                    collecting_bullets = False
                    continue
            
            # Detect dates first (they often appear on same line as title/company)
            date_info = None
            if _contains_date(line_stripped):
                date_info = _extract_date_info(line_stripped)
            
            # Detect job title (enhanced detection) - check if line contains title pattern
            # Skip if it's a bullet point
            is_title = False
            if not _is_bullet_point(line_stripped) and not _is_ocr_bullet(line_stripped):
                is_title = _is_job_title(line_stripped, i, lines)
            
            # If we find a new title, save previous experience
            if is_title:
                if current_exp and _is_complete_experience(current_exp):
                    experiences.append(current_exp)
                
                # Extract title (remove date if present on same line)
                title_line = _remove_date_from_line(line_stripped)
                current_exp = {
                    'title': title_line,
                    'company': None,
                    'location': None,
                    'startDate': None,
                    'endDate': None,
                    'duration': None,
                    'description': '',
                    'responsibilities': [],
                    'technologies': [],
                }
                collecting_bullets = False
                
                # If date was on same line as title, extract it
                if date_info:
                    current_exp['startDate'] = date_info.get('start')
                    current_exp['endDate'] = date_info.get('end')
                    current_exp['duration'] = date_info.get('duration')
            
            # If we have a title, process the line
            elif current_exp.get('title'):
                # Dates on separate line
                if date_info:
                    if not current_exp.get('startDate'):
                        current_exp['startDate'] = date_info.get('start')
                        current_exp['endDate'] = date_info.get('end')
                        current_exp['duration'] = date_info.get('duration')
                    elif not current_exp.get('endDate'):
                        current_exp['endDate'] = date_info.get('start') or date_info.get('end')
                
                # Company name (usually after title, before description)
                elif not current_exp.get('company') and not collecting_bullets and not _is_bullet_point(line_stripped):
                    if not _contains_date(line_stripped) and not is_title and len(line_stripped) < 80:
                        # Check if it might be location instead
                        if _is_location(line_stripped):
                            current_exp['location'] = line_stripped
                        else:
                            # Remove date if present
                            company_line = _remove_date_from_line(line_stripped)
                            # Skip if it's clearly a bullet point
                            if not _is_ocr_bullet(company_line):
                                current_exp['company'] = company_line
                
                # Location (often after company or on same line)
                elif not current_exp.get('location') and _is_location(line_stripped):
                    if not _contains_date(line_stripped):
                        current_exp['location'] = line_stripped
                
                # Bullet points (responsibilities) - more patterns
                elif _is_bullet_point(line_stripped):
                    bullet_text = _extract_bullet_text(line_stripped)
                    if bullet_text:
                        current_exp['responsibilities'].append(bullet_text)
                        collecting_bullets = True
                
                # Technologies used
                elif _contains_technologies(line_stripped):
                    techs = _extract_technologies(line_stripped)
                    current_exp['technologies'].extend(techs)
                
                # Description (non-bullet text, meaningful content)
                elif not collecting_bullets and len(line_stripped) > 15:
                    # Skip if it's just a date or location
                    if not _contains_date(line_stripped) and not _is_location(line_stripped):
                        # Skip single-letter bullet points
                        if not _is_ocr_bullet(line_stripped):
                            if current_exp.get('description'):
                                current_exp['description'] += ' ' + line_stripped
                            else:
                                current_exp['description'] = line_stripped
    
    # Add last experience if exists
    if current_exp and _is_complete_experience(current_exp):
        experiences.append(current_exp)
    
    # Deduplication based on title and company
    unique_exps = []
    seen = set()
    for exp in experiences:
        key = (str(exp.get('title')).lower(), str(exp.get('company')).lower())
        if key not in seen:
            seen.add(key)
            unique_exps.append(exp)
            
    return unique_exps

def _is_job_title(line: str, line_index: int = 0, all_lines: List[str] = None) -> bool:
    """Check if line looks like a job title"""
    if len(line) > 120:  # Titles are usually shorter, but some can be long
        return False
    
    # Skip if it starts with a single letter followed by space (OCR bullet point artifact)
    if _is_ocr_bullet(line):
        return False
    
    # Skip if it's clearly a bullet point
    if _is_bullet_point(line):
        return False
    
    # Exclude lines starting with verbs (likely responsibilities)
    # Common past tense verbs used in bullet points
    initial_verbs = ['mentored', 'collaborated', 'designed', 'developed', 'implemented', 
                    'managed', 'created', 'led', 'analyzed', 'built', 'improved', 'increased',
                    'facilitated', 'coordinated', 'supported', 'maintained', 'initiated',
                    'optimized', 'utilized', 'enhanced', 'demonstrated', 'engaged', 'automated',
                    'migrated', 'gained', 'received',
                    # Sentence openers (first-person / articles), never part of a job title
                    'i', 'we', 'my', 'our', 'a', 'an']
    
    first_word = re.split(r'\s', line.strip())[0].lower() if line.strip() else ''
    # Remove bullet markers if attached
    first_word = re.sub(r'^[^\w]+', '', first_word)
    
    if first_word in initial_verbs:
        return False

    title_keywords = ['engineer', 'developer', 'manager', 'director', 'lead', 'senior', 
                     'junior', 'principal', 'architect', 'analyst', 'specialist', 
                     'consultant', 'coordinator', 'executive', 'officer', 'associate',
                     'intern', 'internship', 'trainee', 'assistant', 'specialist',
                     'technician', 'administrator', 'designer', 'programmer', 'scientist',
                     'researcher', 'professor', 'instructor', 'teacher', 'trainer',
                     'head', 'chief', 'founder', 'co-founder'] # Added fewer missing ones
    line_lower = line.lower()
    
    # Check for title keywords
    has_title_keyword = any(keyword in line_lower for keyword in title_keywords)
    
    # Check if it's likely a title (title case, not all caps, not all lowercase)
    is_title_case = line[0].isupper() if line else False
    not_all_caps = not line.isupper() or len(line) < 10
    
    # Check next line for company/date pattern - ONLY if all_lines matches
    is_followed_by_company = False
    if all_lines and line_index + 1 < len(all_lines):
        next_line = all_lines[line_index + 1].strip()
        # Ensure next line isn't a bullet point (responsibility) or another title
        if next_line and (len(next_line) < 60 or _contains_date(next_line)) and not _is_bullet_point(next_line):
             # Also check if next line looks like a responsibility (starts with verb)
             next_first = re.split(r'\s', next_line)[0].lower()
             if next_first not in initial_verbs:
                is_followed_by_company = True
    
    # Must have title keyword AND proper casing
    return (has_title_keyword and is_title_case and not_all_caps) or (is_followed_by_company and has_title_keyword)

def _contains_date(line: str) -> bool:
    """Check if line contains a date"""
    # Look for year patterns (YYYY or MM/YYYY)
    # But exclude percentages and other numeric patterns
    date_patterns = [
        r'\b(19|20)\d{2}\b',  # Years 1900-2099 (with word boundaries)
        r'\d{1,2}[/-]\d{4}',  # MM/YYYY
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}',  # Month Year
    ]
    
    # Exclude if it's clearly a percentage or other number
    if re.search(r'\d+%', line.lower()):
        return False
    
    # Exclude if it's a 4-digit number that's too large (like 3050)
    four_digit_match = re.search(r'\b\d{4}\b', line)
    if four_digit_match:
        year = int(four_digit_match.group(0))
        if year > 2100 or year < 1900:
            return False
    
    return any(re.search(pattern, line.lower()) for pattern in date_patterns)

def _extract_date_info(line: str) -> Optional[Dict[str, Any]]:
    """Extract date information including range and duration"""
    # Look for date ranges like "Jan 2020 - Dec 2022" or "2020 - 2022"
    date_range_pattern = (
        rf'(\d{{4}}|{_MONTH}\s+\d{{4}})\s*[-–—]\s*(\d{{4}}|{_MONTH}\s+\d{{4}}|present|current|now)'
    )
    match = re.search(date_range_pattern, line, re.IGNORECASE)
    if match:
        start = match.group(1)
        end = match.group(2)
        # Validate years
        start_year_match = re.search(r'\d{4}', start)
        if start_year_match:
            start_year = int(start_year_match.group(0))
            if start_year < 1900 or start_year > 2100:
                return None
        duration = _calculate_duration(start, end)
        return {
            'start': start,
            'end': end if end.lower() not in ['present', 'current', 'now'] else 'Present',
            'duration': duration
        }
    
    # Single date
    date_pattern = r'\b((19|20)\d{2})\b|(\d{1,2}[/-]\d{4})|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})'
    match = re.search(date_pattern, line.lower())
    if match:
        date_str = match.group(0)
        # Validate if it's a year
        year_match = re.search(r'\d{4}', date_str)
        if year_match:
            year = int(year_match.group(0))
            if year < 1900 or year > 2100:
                return None
        return {
            'start': date_str,
            'end': None,
            'duration': None
        }
    
    return None

def _calculate_duration(start: str, end: str) -> Optional[str]:
    """Calculate duration between two dates"""
    try:
        # Extract year from start
        start_year_match = re.search(r'\d{4}', start)
        if not start_year_match:
            return None
        
        start_year = int(start_year_match.group(0))
        
        # Extract year from end
        if end.lower() in ['present', 'current', 'now']:
            from datetime import datetime
            end_year = datetime.now().year
        else:
            end_year_match = re.search(r'\d{4}', end)
            if not end_year_match:
                return None
            end_year = int(end_year_match.group(0))
        
        years = end_year - start_year
        if years < 0:
            return None
        elif years == 0:
            return "Less than 1 year"
        elif years == 1:
            return "1 year"
        else:
            return f"{years} years"
    except:
        return None

def _is_location(line: str) -> bool:
    """Check if line looks like a location"""
    location_keywords = ['city', 'state', 'country', 'remote', 'hybrid', 'onsite']
    location_patterns = [
        r'[A-Z][a-z]+,\s*[A-Z]{2}',  # City, ST
        r'[A-Z][a-z]+,\s*[A-Z][a-z]+',  # City, State
    ]
    
    line_lower = line.lower()
    if any(keyword in line_lower for keyword in location_keywords):
        return True
    
    return any(re.search(pattern, line) for pattern in location_patterns)

def _contains_technologies(line: str) -> bool:
    """Check if line mentions technologies"""
    tech_keywords = ['built with', 'using', 'technologies', 'tech stack', 'stack:', 
                    'tools:', 'languages:', 'framework', 'library', 'api']
    line_lower = line.lower()
    return any(keyword in line_lower for keyword in tech_keywords)

def _extract_technologies(line: str) -> List[str]:
    """Extract technology names from line"""
    techs = re.split(r'[,;|•\-\n]', line)
    technologies = []
    for tech in techs:
        tech = tech.strip()
        tech = re.sub(r'^(built with|using|technologies?|tech stack|stack|tools?|languages?)[:\s]+', '', tech, flags=re.IGNORECASE)
        tech = tech.strip()
        if tech and len(tech) > 1 and len(tech) < 50:
            technologies.append(tech)
    return technologies

def _remove_date_from_line(line: str) -> str:
    """Remove date patterns from a line"""
    # Remove date ranges
    line = re.sub(r'\d{4}\s*[-–—]\s*(\d{4}|present|current|now)', '', line, flags=re.IGNORECASE)
    # Remove single dates
    line = re.sub(r'\d{1,2}[/-]\d{4}', '', line)
    line = re.sub(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}', '', line, flags=re.IGNORECASE)
    line = re.sub(r'\d{4}', '', line)  # Remove standalone years
    return line.strip()

def _is_bullet_point(line: str) -> bool:
    """Check if line is a bullet point (various formats)"""
    bullet_patterns = [
        r'^[•\-\*\+]\s+',  # Standard bullets
        r'^\d+[\.\)]\s+',  # Numbered
        r'^[a-z][\.\)]\s+',  # Lettered
        r'^[▪▫▸▹]\s+',  # Unicode bullets
        r'^→\s+',  # Arrow
    ]
    return any(re.match(pattern, line) for pattern in bullet_patterns)

def _extract_bullet_text(line: str) -> str:
    """Extract text from bullet point line"""
    # Remove bullet markers
    text = re.sub(r'^[•\-\*\+▪▫▸▹→]\s+', '', line)
    text = re.sub(r'^\d+[\.\)]\s+', '', text)
    text = re.sub(r'^[a-z][\.\)]\s+', '', text, flags=re.IGNORECASE)
    return text.strip()

def _parse_pipe_formatted_entry(parts: List[str], line_index: int, all_lines: List[str]) -> Optional[Dict[str, Any]]:
    """Parse experience entry in format: Company | Title | Location | Dates"""
    if len(parts) < 2:
        return None
    
    entry = {
        'title': None,
        'company': None,
        'location': None,
        'startDate': None,
        'endDate': None,
        'duration': None,
        'description': '',
        'responsibilities': [],
        'technologies': [],
    }
    
    # Try to identify which part is what
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        
        # Check if part contains dates
        if _contains_date(part):
            date_info = _extract_date_info(part)
            if date_info:
                entry['startDate'] = date_info.get('start')
                entry['endDate'] = date_info.get('end')
                entry['duration'] = date_info.get('duration')
            continue
        
        # Check if part is a location
        if _is_location(part):
            entry['location'] = part
            continue
        
        # Check if part is a job title
        # Do NOT pass all_lines here, as we are checking a partial string and don't want checks against the NEXT line of the file
        if _is_job_title(part):
            if not entry['title']:
                entry['title'] = _remove_date_from_line(part)
            continue
        
        # Otherwise, assign based on position
        if not entry['company'] and (i == 0 or entry['title']):
            entry['company'] = _remove_date_from_line(part)
        elif i == 1 and not entry['title']:
            entry['title'] = _remove_date_from_line(part)
        elif i == 2:
            if not entry['location']:
                entry['location'] = part
            elif not entry['title']:
                entry['title'] = part
    
    # If we got company and title, this is valid
    if entry['company'] or entry['title']:
        return entry
    
    return None

def _is_complete_experience(exp: Dict[str, Any]) -> bool:
    """Check if experience entry has minimum required fields"""
    return bool(exp.get('title') or exp.get('company'))

def _parse_comma_separated_entry(line: str, line_index: int, all_lines: List[str]) -> Optional[Dict[str, Any]]:
    """Parse experience entry in format: Title, Company, Location [, Dates]"""
    # Heuristic: Must have at least one comma
    # Must contain a Job Title in one of the parts
    # Usually Title comes first or second
    
    parts = [p.strip() for p in line.split(',')]
    if len(parts) < 2:
        return None
        
    entry = {
        'title': None,
        'company': None,
        'location': None,
        'startDate': None,
        'endDate': None,
        'duration': None,
        'description': '',
        'responsibilities': [],
        'technologies': [],
    }
    
    # Check for dates first in the whole line or last part
    date_info = None
    if _contains_date(line):
         date_info = _extract_date_info(line)
         if date_info:
             entry['startDate'] = date_info.get('start')
             entry['endDate'] = date_info.get('end')
             entry['duration'] = date_info.get('duration')
    
    # Identify parts
    title_found = False
    
    for i, part in enumerate(parts):
        # Remove date info if present to clean up part
        part_clean = _remove_date_from_line(part)
        if not part_clean:
            continue
            
        # Check if part is a job title
        # Relaxed check: purely based on keywords or heuristic
        if not title_found and _is_job_title(part_clean):
            entry['title'] = part_clean
            title_found = True
            continue
            
        # Check if part is location
        if _is_location(part_clean):
            entry['location'] = part_clean
            continue
            
        # If not title or location, assume company if it looks like one
        # Heuristic: Capitalized, not too long
        if not entry['company'] and len(part_clean) < 50 and part_clean[0].isupper():
            # Avoid assigning "Level IV" or similar as company if it follows title
            if "level" in part_clean.lower() or "grade" in part_clean.lower():
                continue
            entry['company'] = part_clean
            
    if entry['title']:
        return entry
        
    return None
