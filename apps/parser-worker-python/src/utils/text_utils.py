"""Text utility functions for parser worker"""
import re
from typing import List

def split_into_sections(text: str) -> dict:
    """Split resume text into sections"""
    sections = {}
    current_section = None
    current_content = []
    
    lines = text.split('\n')
    
    section_keywords = {
        'experience': ['experience', 'work history', 'employment', 'professional experience'],
        'education': ['education', 'academic', 'qualifications'],
        'skills': ['skills', 'technical skills', 'technologies', 'tools'],
        'projects': ['projects', 'portfolio'],
        'certifications': ['certifications', 'certificates', 'licenses'],
    }
    
    for line in lines:
        line_lower = line.lower().strip()
        
        # Check if line is a section header
        found_section = None
        for section_name, keywords in section_keywords.items():
            if any(keyword in line_lower for keyword in keywords):
                # Save previous section
                if current_section:
                    sections[current_section] = '\n'.join(current_content)
                # Start new section
                current_section = section_name
                current_content = []
                found_section = True
                break
        
        if not found_section and current_section:
            current_content.append(line)
    
    # Save last section
    if current_section:
        sections[current_section] = '\n'.join(current_content)
    
    return sections

def extract_sentences(text: str) -> List[str]:
    """Extract sentences from text"""
    # Simple sentence splitting
    sentences = re.split(r'[.!?]+', text)
    return [s.strip() for s in sentences if s.strip()]

def remove_urls(text: str) -> str:
    """Remove URLs from text"""
    url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    return re.sub(url_pattern, '', text)

MONTH_NAMES_PATTERN = r'(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?'


def strip_bullet(line: str) -> str:
    """Remove a leading bullet / list number ("- ", "1. ", "2) ", "▸ ")."""
    return re.sub(r'^(?:[•\-\*\+▪▫▸▹→]\s*)?(?:\d+[\.\)]\s*)?', '', line).strip()


def extract_bullet_points(text: str) -> List[str]:
    """Extract bullet points from text"""
    bullet_patterns = [
        r'^[\u2022\u2023\u25E6\u2043\u2219\*\-]\s*(.+)$',  # Various bullet characters
        r'^\d+[\.\)]\s*(.+)$',  # Numbered lists
    ]
    
    bullets = []
    for line in text.split('\n'):
        for pattern in bullet_patterns:
            match = re.match(pattern, line.strip())
            if match:
                bullets.append(match.group(1).strip())
                break
    
    return bullets
