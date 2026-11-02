"""Extract skills from resume text"""
from typing import List, Set
import re

# Common technical skills database
TECHNICAL_SKILLS = [
    # Programming Languages
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php',
    'swift', 'kotlin', 'scala', 'r', 'matlab', 'perl', 'shell', 'bash',
    
    # Web Technologies
    'react', 'angular', 'vue', 'node', 'node.js', 'express', 'next.js', 'nuxt.js',
    'html', 'css', 'sass', 'scss', 'less', 'bootstrap', 'tailwind', 'jquery',
    
    # Backend & Databases
    'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
    'django', 'flask', 'fastapi', 'spring', 'laravel', 'rails', 'asp.net',
    
    # Cloud & DevOps
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins',
    'git', 'github', 'gitlab', 'ci/cd', 'github actions', 'gitlab ci',
    
    # Data & ML
    'machine learning', 'deep learning', 'ai', 'tensorflow', 'pytorch', 'scikit-learn',
    'pandas', 'numpy', 'data science', 'data analysis', 'big data', 'hadoop', 'spark',
    
    # Mobile
    'react native', 'flutter', 'ios', 'android', 'xamarin',
    
    # Other
    'microservices', 'rest api', 'graphql', 'grpc', 'websocket', 'linux', 'unix',
    'agile', 'scrum', 'kanban', 'tdd', 'bdd', 'devops', 'sre',
]

# Display names for skills whose canonical casing differs from str.title()
CANONICAL_NAMES = {
    'javascript': 'JavaScript', 'typescript': 'TypeScript', 'php': 'PHP', 'matlab': 'MATLAB',
    'r': 'R', 'node.js': 'Node.js', 'next.js': 'Next.js', 'nuxt.js': 'Nuxt.js',
    'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'jquery': 'jQuery',
    'sql': 'SQL', 'postgresql': 'PostgreSQL', 'mysql': 'MySQL', 'mongodb': 'MongoDB',
    'fastapi': 'FastAPI', 'asp.net': 'ASP.NET', 'aws': 'AWS', 'gcp': 'GCP',
    'github': 'GitHub', 'gitlab': 'GitLab', 'ci/cd': 'CI/CD', 'github actions': 'GitHub Actions',
    'gitlab ci': 'GitLab CI', 'ai': 'AI', 'tensorflow': 'TensorFlow', 'pytorch': 'PyTorch',
    'scikit-learn': 'Scikit-learn', 'numpy': 'NumPy', 'ios': 'iOS', 'rest api': 'REST API',
    'graphql': 'GraphQL', 'grpc': 'gRPC', 'websocket': 'WebSocket', 'tdd': 'TDD', 'bdd': 'BDD',
    'devops': 'DevOps', 'sre': 'SRE',
}

# Words allowed in a skills section heading (e.g. "Technical Skills", "Tools & Technologies")
_SKILLS_HEADING_KEYWORDS = {'skills', 'technologies', 'tools'}
_SKILLS_HEADING_WORDS = _SKILLS_HEADING_KEYWORDS | {
    'technical', 'key', 'core', 'relevant', 'additional', 'professional', 'it', 'and', '&', '/',
    'programming', 'languages', 'frameworks',
}


def _display_name(skill: str) -> str:
    """Canonical display name for a (lowercase) skill"""
    return CANONICAL_NAMES.get(skill.lower(), skill.title())


def extract_skills(text: str) -> List[str]:
    """Extract skills from resume text"""
    if not text:
        return []
    
    found_skills: Set[str] = set()
    lower_text = text.lower()
    
    # Check for skills section
    skills_section = _extract_skills_section(text)
    if skills_section:
        text_to_search = skills_section
    else:
        text_to_search = lower_text
    
    # Match against known skills
    for skill in TECHNICAL_SKILLS:
        # Word boundaries via lookarounds: \b fails for skills ending in a symbol (c++, c#)
        pattern = r'(?<!\w)' + re.escape(skill.lower()) + r'(?!\w)'
        if re.search(pattern, text_to_search):
            found_skills.add(_display_name(skill))
    
    # Also look for skills listed with separators
    skills_list_pattern = r'(?:skills?|technologies?|tools?)[:]\s*([^\n]+)'
    matches = re.findall(skills_list_pattern, lower_text, re.IGNORECASE)
    for match in matches:
        # Split by common separators (but not on hyphens inside words, e.g. Scikit-Learn)
        items = re.split(r'[,;|•\n]|\s+[-–]\s+', match)
        for item in items:
            item = item.strip()
            if item and len(item) > 2:
                found_skills.add(_display_name(item))
    
    return sorted(list(found_skills))

def _extract_skills_section(text: str) -> str:
    """Extract the skills section from resume"""
    lines = text.split('\n')
    in_skills_section = False
    skills_lines = []
    
    for line in lines:
        line_lower = line.lower()
        if not in_skills_section and _is_skills_heading(line_lower):
            in_skills_section = True
            continue
        
        if in_skills_section:
            # Stop at next major section
            if any(keyword in line_lower for keyword in ['experience', 'education', 'projects', 'certifications']):
                break
            skills_lines.append(line)
    
    return '\n'.join(skills_lines).lower()


def _is_skills_heading(line_lower: str) -> bool:
    """True if the line is a skills section heading, not prose or an inline list"""
    words = re.findall(r'[a-z]+|&|/', line_lower.strip().rstrip(':'))
    if ':' in line_lower.strip().rstrip(':') or not words:
        return False
    return (any(w in _SKILLS_HEADING_KEYWORDS for w in words)
            and all(w in _SKILLS_HEADING_WORDS for w in words))
