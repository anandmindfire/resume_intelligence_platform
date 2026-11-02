"""Extract achievements, awards, and certifications from resume text"""
import re
from typing import List, Dict, Any

def extract_achievements(text: str) -> List[Dict[str, Any]]:
    """Extract achievements, awards, and certifications"""
    if not text:
        return []
    
    achievements = []
    lines = text.split('\n')
    
    current_achievement: Dict[str, Any] = {}
    in_section = False
    
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        line_lower = line_stripped.lower()
        
        # Detect achievements/awards/certifications section
        section_keywords = ['achievements', 'awards', 'honors', 'certifications', 
                          'certificates', 'recognition', 'accomplishments', 'publications']
        if any(keyword in line_lower for keyword in section_keywords):
            in_section = True
            continue
        
        # Stop at next major section
        if in_section and any(keyword in line_lower for keyword in ['experience', 'education', 'projects', 'skills']):
            if current_achievement:
                achievements.append(current_achievement)
            current_achievement = {}  # already saved; don't add it again after the loop
            break
        
        if in_section:
            # Detect achievement entry (usually bullet points or numbered)
            if _is_achievement_entry(line_stripped):
                if current_achievement:
                    achievements.append(current_achievement)
                title = _strip_bullet(line_stripped)
                current_achievement = {
                    'title': title,
                    'description': '',
                    'date': None,
                    'issuer': None,
                    'type': _classify_achievement_type(title),
                }
            # Date
            elif current_achievement and _contains_date(line_stripped) and not current_achievement.get('date'):
                current_achievement['date'] = _extract_date(line_stripped)
            # Issuer (organization that gave the award/certification)
            elif current_achievement and _is_issuer(line_stripped):
                current_achievement['issuer'] = line_stripped
            # Additional description
            elif current_achievement and len(line_stripped) > 10:
                if current_achievement['description']:
                    current_achievement['description'] += ' ' + line_stripped
                else:
                    current_achievement['description'] = line_stripped
    
    # Add last achievement
    if current_achievement:
        achievements.append(current_achievement)
    
    return achievements

def _is_achievement_entry(line: str) -> bool:
    """Check if line is an achievement entry"""
    # Achievements often start with bullets, numbers, or are short descriptive lines
    if len(line) < 5:
        return False
    
    # Bullet point
    if re.match(r'^[•\-\*\+]\s+', line):
        return True
    
    # Numbered
    if re.match(r'^\d+[\.\)]\s+', line):
        return True
    
    # Short descriptive line (achievement-like)
    if 10 < len(line) < 100 and not _contains_date(line):
        # Check for achievement keywords
        achievement_keywords = ['award', 'certified', 'published', 'presented', 
                              'recognized', 'winner', 'achieved', 'completed',
                              'certification', 'license', 'honor']
        line_lower = line.lower()
        if any(keyword in line_lower for keyword in achievement_keywords):
            return True
    
    return False

def _strip_bullet(line: str) -> str:
    """Remove a leading bullet / list number ("- ", "1. ", "2) ")"""
    return re.sub(r'^(?:[•\-\*\+]|\d+[\.\)])\s+', '', line).strip() or line


def _classify_achievement_type(line: str) -> str:
    """Classify the type of achievement"""
    line_lower = line.lower()
    
    if any(keyword in line_lower for keyword in ['certified', 'certification', 'license', 'certificate']):
        return 'certification'
    elif any(keyword in line_lower for keyword in ['award', 'winner', 'honor', 'recognition']):
        return 'award'
    elif any(keyword in line_lower for keyword in ['published', 'paper', 'article', 'research']):
        return 'publication'
    elif any(keyword in line_lower for keyword in ['presented', 'speaker', 'talk', 'conference']):
        return 'presentation'
    else:
        return 'achievement'

def _is_issuer(line: str) -> bool:
    """Check if line looks like an issuer/organization name"""
    issuer_keywords = ['university', 'college', 'institute', 'association', 
                      'organization', 'company', 'corporation', 'foundation',
                      'council', 'board', 'society']
    line_lower = line.lower()
    return any(keyword in line_lower for keyword in issuer_keywords)

def _contains_date(line: str) -> bool:
    """Check if line contains a date"""
    date_patterns = [
        r'\d{4}',
        r'\d{1,2}[/-]\d{4}',
        r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}',
    ]
    return any(re.search(pattern, line.lower()) for pattern in date_patterns)

def _extract_date(line: str) -> str:
    """Extract date from line"""
    date_pattern = r'(\d{1,2}[/-])?\d{4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}'
    match = re.search(date_pattern, line.lower())
    if match:
        return match.group(0)
    return ''
