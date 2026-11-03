"""Extract contact information (email, phone) from resume text"""
import re
from typing import Optional, Dict

def extract_email(text: str) -> Optional[str]:
    """Extract email address from text"""
    if not text:
        return None
    
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
    matches = re.findall(email_pattern, text)
    
    if matches:
        # Return first valid email
        return matches[0]
    return None

def _is_year_sequence(value: str) -> bool:
    """True if every digit group in the value is a 4-digit year (19xx/20xx)"""
    groups = re.findall(r'\d+', value)
    return bool(groups) and all(re.fullmatch(r'(?:19|20)\d{2}', g) for g in groups)


def extract_phone(text: str) -> Optional[str]:
    """Extract phone number from text - supports multiple formats"""
    if not text:
        return None
    
    # Multiple phone patterns for different formats
    phone_patterns = [
        # International formats
        r'\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}',
        # US/Canada formats
        r'\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',
        r'\(\d{3}\)\s?\d{3}[-.\s]?\d{4}',  # (123) 456-7890
        r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',  # 123-456-7890
        # Indian format (10 digits, may start with +91)
        r'\+?91[-.\s]?\d{5}[-.\s]?\d{5}',
        r'\d{5}[-.\s]?\d{5}',
        # UK format
        r'\+?44[-.\s]?\d{4}[-.\s]?\d{6}',
        # Generic 10-15 digit numbers
        r'\+?\d{10,15}',
    ]
    
    # Also look for phone labels
    phone_label_patterns = [
        r'(?:phone|mobile|cell|tel|contact)[:\s]+([+\d\s\-\(\)\.]{10,})',
        r'(?:mob|ph)[:\s]+([+\d\s\-\(\)\.]{10,})',
    ]
    
    # Check labeled phone numbers first (more reliable)
    for pattern in phone_label_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            phone = re.sub(r'[^\d+]', '', matches[0])
            if len(phone) >= 10:
                return phone
    
    # Check general patterns
    for pattern in phone_patterns:
        matches = re.findall(pattern, text)
        if matches:
            for match in matches:
                # Clean up the phone number
                phone = re.sub(r'[^\d+]', '', match)
                # Filter out dates, years, and other numeric sequences
                if len(phone) >= 10 and len(phone) <= 15:
                    # Don't match if it's just a run of years (e.g. "2015 2019 2021")
                    if not _is_year_sequence(match):
                        return phone
    
    return None

def extract_contact_info(text: str) -> Dict[str, Optional[str]]:
    """Extract all contact information"""
    return {
        'email': extract_email(text),
        'phone': extract_phone(text),
    }
