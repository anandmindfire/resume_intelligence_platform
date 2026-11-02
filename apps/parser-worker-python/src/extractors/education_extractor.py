"""Extract education information from resume text"""
import re
from typing import List, Dict, Any, Optional

_MONTH = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?'


def extract_education(text: str) -> List[Dict[str, Any]]:
    """Extract education entries with detailed information"""
    if not text:
        return []
    
    educations = []
    lines = text.split('\n')
    
    current_edu: Dict[str, Any] = {}
    in_education = False
    
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        line_lower = line_stripped.lower()
        
        # Detect education section (more variations)
        # Removed 'university', 'college' as they cause lines starting with proper names to be skipped as headers
        education_keywords = ['education', 'academic', 'qualifications', 'academic background',
                            'educational background', 'degrees']
        
        # Only use university/college as section header if the line is short (likely a header)
        if len(line_stripped) < 30 and any(keyword in line_lower for keyword in ['university', 'college']):
             education_keywords.extend(['university', 'college'])

        if any(keyword in line_lower for keyword in education_keywords):
            in_education = True
            continue
        
        # Stop at next major section
        if in_education and any(keyword in line_lower for keyword in ['experience', 'projects', 
                                                                      'skills', 'certifications', 'achievements']):
            break
        
        if in_education:
            # Check for date on this line
            has_date = _contains_date(line_stripped)
            date_value = _extract_date(line_stripped) if has_date else None
            
            # Detect degree (enhanced) - may be on same line as other info
            is_degree_line = _is_degree(line_stripped)
            
            # Check if this line is an institution (before degree line); a degree line is never one
            is_institution_line = (_is_institution(line_stripped) or _looks_like_institution(line_stripped)) \
                and not has_date and not is_degree_line
            
            # If we find an institution line before a degree, store it
            if is_institution_line and not current_edu.get('degree'):
                # This might be an institution name on a separate line before the degree
                # Store it temporarily to use when we find the degree
                if not current_edu:
                    current_edu = {
                        'degree': None,
                        'institution': line_stripped,
                        'location': None,
                        'graduationDate': None,
                        'field': None,
                        'gpa': None,
                        'honors': None,
                    }
                elif not current_edu.get('institution'):
                    current_edu['institution'] = line_stripped
            
            elif is_degree_line:
                if current_edu and _is_complete_education(current_edu):
                    educations.append(current_edu)
                
                # Extract degree (remove date/institution if on same line)
                degree_line = _remove_date_from_line(line_stripped)
                # Try to separate degree from institution if both on same line
                degree_parts = _split_degree_and_institution(degree_line)
                
                # Only an institution seeded from a preceding line (no degree yet) belongs to this
                # degree; a completed previous entry's institution must not carry over
                existing_institution = current_edu.get('institution') if current_edu and not current_edu.get('degree') else None
                
                # If still no institution, check previous line immediately (lookback)
                if not existing_institution and i > 0:
                     prev_line = lines[i-1].strip()
                     # Clean up previous line (remove date)
                     prev_line_clean = _remove_date_from_line(prev_line)
                     if (_is_institution(prev_line_clean) or _looks_like_institution(prev_line_clean)) and not _is_degree(prev_line):
                         existing_institution = prev_line_clean
                
                # If still no institution, check previous line immediately (lookback)
                if not existing_institution and i > 0:
                     prev_line = lines[i-1].strip()
                     # Clean up previous line (remove date)
                     prev_line_clean = _remove_date_from_line(prev_line)
                     if (_is_institution(prev_line_clean) or _looks_like_institution(prev_line_clean)) and not _is_degree(prev_line):
                         existing_institution = prev_line_clean
                
                # Determine final institution
                # If we have an existing institution (from prev line) and the split one doesn't look like a strong institution match (no keywords), keep existing
                final_inst = degree_parts.get('institution')
                if existing_institution:
                    if not final_inst or (not _is_institution(final_inst) and _is_institution(existing_institution)):
                        final_inst = existing_institution
                
                # If the "institution" from split looks like a field of study (e.g. Computer Science), treat it as field
                field = None
                if final_inst and not _is_institution(final_inst):
                     # If it doesn't have "University" etc, it might be a field
                     # Check if it was extracted from the degree line
                     if degree_parts.get('institution') == final_inst:
                         # It came from the comma split "Degree, Field"
                         field = final_inst
                         if existing_institution:
                            final_inst = existing_institution
                         else:
                            # If no existing inst, we might have misidentified field as inst. 
                            # But for now, keep as inst if we have nothing else, or set to None?
                            # Better safely assume it's field if it doesn't look like institution
                            final_inst = None

                current_edu = {
                    'degree': degree_parts.get('degree', degree_line),
                    'institution': final_inst,
                    'location': None,
                    'graduationDate': date_value if has_date else None,
                    'field': field,
                    'gpa': None,
                    'honors': None,
                }
            
            # If we have a degree, process the line
            elif current_edu.get('degree'):
                # Institution detection (more flexible) - check previous lines too
                if not current_edu.get('institution'):
                    if _is_institution(line_stripped) or _looks_like_institution(line_stripped):
                        inst_line = _remove_date_from_line(line_stripped)
                        current_edu['institution'] = inst_line
                    # If line is short and looks like institution name
                    elif len(line_stripped) < 60 and not has_date and not _is_location(line_stripped):
                        # Check if it might be institution (proper nouns, contains "of", "the", etc.)
                        if _looks_like_institution(line_stripped):
                            current_edu['institution'] = line_stripped
                    # Also check previous line if current line is degree
                    # This handles "UNIVERSITY OF ARIZONA\nM.S., ..."
                    elif i > 0:
                        prev_line = lines[i - 1].strip()
                        # Only look back if previous line wasn't part of another section
                        if prev_line and len(prev_line) < 80 and not _is_degree(prev_line) and not _contains_date(prev_line):
                             is_inst = _is_institution(prev_line) or _looks_like_institution(prev_line)
                             if is_inst:
                                 current_edu['institution'] = prev_line
                
                # Location (city, country)
                elif not current_edu.get('location') and _is_location(line_stripped):
                    if not has_date:
                        current_edu['location'] = line_stripped
                
                # Graduation date
                elif has_date and not current_edu.get('graduationDate'):
                    current_edu['graduationDate'] = date_value
                
                # GPA
                elif _contains_gpa(line_stripped):
                    current_edu['gpa'] = _extract_gpa(line_stripped)
                
                # Honors
                elif _is_honors(line_stripped):
                    current_edu['honors'] = line_stripped
                
                # Field of study (usually after degree, before institution)
                elif not current_edu.get('field') and not current_edu.get('institution'):
                    if not _is_institution(line_stripped) and not has_date and len(line_stripped) < 60:
                        # Field is usually a short description
                        if not _is_location(line_stripped) and not _contains_gpa(line_stripped):
                            current_edu['field'] = line_stripped
    
    # Add last education if exists
    if current_edu and _is_complete_education(current_edu):
        educations.append(current_edu)
    
    # Simple deduplication based on degree and institution
    unique_edus = []
    seen = set()
    for edu in educations:
        key = (str(edu.get('degree')).lower(), str(edu.get('institution')).lower())
        if key not in seen:
            seen.add(key)
            unique_edus.append(edu)
            
    return unique_edus

def _is_degree(line: str) -> bool:
    """Check if line contains a degree - more comprehensive"""
    degree_keywords = [
        'bachelor', 'master', 'phd', 'doctorate', 'degree', 
        'b.s.', 'b.a.', 'b.sc', 'b.tech', 'b.e.', 'b.eng',
        'm.s.', 'm.a.', 'm.sc', 'm.tech', 'm.e.', 'm.eng',
        'mba', 'associate', 'diploma', 'certificate', 'ph.d',
        'bachelor of', 'master of', 'doctor of', 'bachelor\'s', 'master\'s',
        'undergraduate', 'graduate', 'postgraduate', 'high school', 'hsc', 'ssc'
    ]
    line_lower = line.lower()
    
    # Check for degree keywords
    if any(keyword in line_lower for keyword in degree_keywords):
        return True
    
    # Check for degree abbreviations pattern (B.S., M.S., etc.)
    if re.search(r'\b([BM]\.?[AS]\.?|B\.?Tech|M\.?Tech|B\.?E\.?|M\.?E\.?|MBA|PhD)\b', line, re.IGNORECASE):
        return True
    
    return False

def _is_institution(line: str) -> bool:
    """Check if line looks like an institution name"""
    institution_keywords = ['university', 'college', 'institute', 'school', 'academy', 
                          'polytechnic', 'technical', 'state university', 'national']
    line_lower = line.lower()
    if any(keyword in line_lower for keyword in institution_keywords):
        return True
    # Well-known acronyms (IIT Delhi, MIT)
    return bool(re.search(r'\b(iit|iiit|nit|iim|mit)\b', line_lower))

def _looks_like_institution(line: str) -> bool:
    """Check if line might be an institution (heuristic)"""
    # Institutions are often proper nouns, 3-8 words, may contain "of", "the"
    words = line.split()
    if 2 <= len(words) <= 8:
        # Check for common institution patterns
        if any(word.lower() in ['of', 'the', 'at'] for word in words):
            return True
        # Check if most words start with capital (proper noun)
        capitalized = sum(1 for word in words if word and word[0].isupper())
        if capitalized >= len(words) * 0.6:
            return True
    return False

def _is_location(line: str) -> bool:
    """Check if line looks like a location"""
    location_patterns = [
        r'[A-Z][a-z]+,\s*[A-Z]{2}',  # City, ST
        r'[A-Z][a-z]+,\s*[A-Z][a-z]+',  # City, State
        r'[A-Z][a-z]+,\s*[A-Z][a-z]+,\s*[A-Z][a-z]+',  # City, State, Country
    ]
    return any(re.search(pattern, line) for pattern in location_patterns)

def _contains_gpa(line: str) -> bool:
    """Check if line contains GPA information"""
    gpa_patterns = [
        r'gpa[:\s]+[\d\.]+',
        r'grade point average[:\s]+[\d\.]+',
        r'cgpa[:\s]+[\d\.]+',
    ]
    line_lower = line.lower()
    return any(re.search(pattern, line_lower) for pattern in gpa_patterns)

def _extract_gpa(line: str) -> Optional[str]:
    """Extract GPA from line"""
    gpa_pattern = r'gpa[:\s]+([\d\.]+)|cgpa[:\s]+([\d\.]+)'
    match = re.search(gpa_pattern, line.lower())
    if match:
        return match.group(1) or match.group(2)
    return None

def _is_honors(line: str) -> bool:
    """Check if line mentions honors"""
    honors_keywords = ['summa cum laude', 'magna cum laude', 'cum laude', 
                      'honors', 'dean\'s list', 'valedictorian', 'salutatorian',
                      'distinction', 'merit', 'scholarship']
    line_lower = line.lower()
    return any(keyword in line_lower for keyword in honors_keywords)

def _contains_date(line: str) -> bool:
    """Check if line contains a date"""
    date_patterns = [
        r'\b(19|20)\d{2}\b',  # Years 1900-2099 (with word boundaries)
        r'\d{1,2}[/-]\d{4}',  # MM/YYYY
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}',  # Month Year
    ]
    
    # Exclude if it's clearly a percentage
    if re.search(r'\d+%', line.lower()):
        return False
    
    # Exclude if it's a 4-digit number that's too large
    four_digit_match = re.search(r'\b\d{4}\b', line)
    if four_digit_match:
        year = int(four_digit_match.group(0))
        if year > 2100 or year < 1900:
            return False
    
    return any(re.search(pattern, line.lower()) for pattern in date_patterns)

def _extract_date(line: str) -> Optional[str]:
    """Extract date from line"""
    # Try date range first
    date_range_pattern = rf'(\d{{4}}|{_MONTH}\s+\d{{4}})\s*[-–—]\s*(\d{{4}}|{_MONTH}\s+\d{{4}}|present|current)'
    match = re.search(date_range_pattern, line, re.IGNORECASE)
    if match:
        # Validate years
        start_year_match = re.search(r'\d{4}', match.group(1))
        if start_year_match:
            start_year = int(start_year_match.group(0))
            if start_year < 1900 or start_year > 2100:
                return None
        return match.group(0)
    
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
        return date_str
    return None

def _remove_date_from_line(line: str) -> str:
    """Remove date patterns from a line"""
    # Remove date ranges
    line = re.sub(r'\d{4}\s*[-–—]\s*(\d{4}|present|current|now)', '', line, flags=re.IGNORECASE)
    # Remove single dates
    line = re.sub(r'\d{1,2}[/-]\d{4}', '', line)
    line = re.sub(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}', '', line, flags=re.IGNORECASE)
    line = re.sub(r'\b\d{4}\b', '', line)  # Remove standalone years (with word boundaries)
    
    # Cleanup residue
    # Remove trailing dashes/separators often left by date removal
    line = re.sub(r'\s*[-–—|,]\s*$', '', line)
    
    return line.strip()

def _split_degree_and_institution(line: str) -> Dict[str, Optional[str]]:
    """Try to split a line that might contain both degree and institution"""
    # Common patterns: "B.S. Computer Science, University Name" or "Degree | Institution"
    parts = re.split(r'[,|•\-\n]', line, maxsplit=1)
    if len(parts) == 2:
        degree_part = parts[0].strip()
        inst_part = parts[1].strip()
        
        # Check if second part looks like institution
        # added check to ensure inst_part has reasonable length and letters (avoids single char artifacts)
        if len(inst_part) > 3 and any(c.isalpha() for c in inst_part) and inst_part != ')':
            if _is_institution(inst_part) or _looks_like_institution(inst_part):
                return {'degree': degree_part, 'institution': inst_part}
    
    
    # Check if line contains institution keywords
    if _is_institution(line) or _looks_like_institution(line):
        # Try to find where degree ends and institution starts
        # Look for patterns like "B.S.," or "Master of" followed by institution
        match = re.search(r'([^,]+(?:degree|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|mba|phd)[^,]*),?\s*(.+)', line, re.IGNORECASE)
        if match:
            deg = match.group(1).strip()
            inst = match.group(2).strip()
            # Validate institution part
            if len(inst) > 3 and any(c.isalpha() for c in inst) and inst != ')':
                return {'degree': deg, 'institution': inst}
    
    return {'degree': line, 'institution': None}

def _is_complete_education(edu: Dict[str, Any]) -> bool:
    """Check if education entry has minimum required fields"""
    return bool(edu.get('degree'))
