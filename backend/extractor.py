import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

import config

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
INSTAGRAM_REGEX = re.compile(r'https?://(?:www\.)?instagram\.com/([a-zA-Z0-9_.-]+)/?', re.IGNORECASE)

IGNORED_DOMAINS = {
    "sentry.io", "wix.com", "wordpress.org", "schema.org", "example.com", 
    "domain.com", "email.com", "cloudflare.com", "googleapis.com", 
    "github.com", "w3.org", "jsdelivr.net", "polyfill.io", "gravatar.com"
}
IGNORED_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js", ".ico", ".woff", ".woff2", ".ttf"}
IGNORED_IG = {"p", "reel", "reels", "stories", "explore", "about", "legal", "terms", "privacy", "developer", "accounts"}

PRIORITY_PREFIXES = [
    "hello", "hi", "newbiz", "contact", "letschat", "growth", 
    "partnerships", "inquiries", "work", "team"
]

# Strict signals indicating an agency builds websites in-house
WEB_SIGNALS = [
    r'\bweb(site)?\s*(design|development|dev|redesign|building)\b',
    r'\bbuild(ing)?\s*(custom\s*)?websites?\b',
    r'\be-?commerce\s*(development|design|store)\b',
    r'\bshopify\s*(partner|development|plus)\b',
    r'\bwordpress\s*(development|agency|design)\b',
    r'\bwebflow\s*(partner|development|agency)\b',
    r'\bfrontend\s*development\b',
    r'\bfull-?stack\s*development\b',
    r'\bcustom\s*web\s*apps?\b'
]
WEB_PATTERNS = [re.compile(p, re.IGNORECASE) for p in WEB_SIGNALS]

MARKETING_KEYWORDS = [
    "marketing", "digital marketing", "social media", "growth marketing", 
    "content marketing", "paid ads", "performance marketing", "advertising", 
    "public relations", "influencer marketing", "brand strategy", "media buying",
    "branding", "creative", "campaigns"
]

def is_info_email(email):
    """Checks if an email is a generic info/information inbox."""
    if not email or "@" not in email:
        return False
    user = email.split("@")[0].lower().strip()
    return user in ["info", "information"] or bool(re.match(r"^info[._-]", user))

def is_valid_email(email):
    """Rigorous check for real email vs javascript library artifacts."""
    if not email or "@" not in email:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    user, domain = parts[0], parts[1]
    
    # Ignore info@ emails to protect deliverability and avoid unmonitored gatekeeper inboxes
    if getattr(config, "IGNORE_INFO_EMAILS", True) and is_info_email(email):
        return False

    if re.search(r'^\d+(\.\d+)*$', domain):
        return False
    if "." not in domain:
        return False
        
    tld = domain.split(".")[-1].lower()
    if len(tld) < 2 or not tld.isalpha():
        return False
        
    for ext in IGNORED_EXTS:
        if email.lower().endswith(ext):
            return False
            
    for ign in IGNORED_DOMAINS:
        if ign in domain.lower():
            return False
            
    if len(email) < 6 or len(email) > 60:
        return False
        
    return True

ROLE_EMAIL_PREFIXES = {
    "info", "information", "hello", "hi", "contact", "support", "help", "team", 
    "general", "office", "admin", "enquiries", "inquiries", "inquiry", "enquiry",
    "careers", "career", "jobs", "job", "work", "recruitment", "hiring",
    "billing", "accounts", "invoice", "finance", "legal", "privacy", "security",
    "press", "media", "pr", "marketing", "sales", "newbiz", "growth", "partnerships",
    "letschat", "collaborate", "mail", "post", "feedback", "newsletter", "frontdesk"
}

def extract_person_name_from_email(email):
    """
    Extracts a clean human first name if the email belongs to an individual team member.
    e.g. rachel@clarity.global -> 'Rachel'
         john.doe@agency.com -> 'John'
         sarah_connor@agency.com -> 'Sarah'
    Returns None if it is a generic/role inbox.
    """
    if not email or "@" not in email:
        return None
    user = email.split("@")[0].lower().strip()
    
    # Check if generic role inbox
    if user in ROLE_EMAIL_PREFIXES or any(user.startswith(r + ".") or user.startswith(r + "_") for r in ROLE_EMAIL_PREFIXES):
        return None

    # Handle firstname.lastname or firstname_lastname
    if "." in user:
        candidate = user.split(".")[0]
    elif "_" in user:
        candidate = user.split("_")[0]
    elif "-" in user:
        candidate = user.split("-")[0]
    else:
        candidate = user

    # Strip numbers
    candidate = re.sub(r'\d+', '', candidate).strip()
    
    # Must look like a real name (between 2 and 15 letters, purely alphabetic)
    if candidate and candidate.isalpha() and 2 <= len(candidate) <= 15 and candidate not in ROLE_EMAIL_PREFIXES:
        return candidate.capitalize()

    return None

def is_personal_member_email(email):
    """Returns True if the email belongs to an individual team member rather than a shared inbox."""
    return extract_person_name_from_email(email) is not None

def prioritize_emails(email_list, agency_domain):
    """
    Prioritizes individual member/personal emails (#1 priority: name@company.com),
    followed by direct business/newbiz emails, followed by generic inboxes.
    """
    if not email_list:
        return []
        
    unique = list(dict.fromkeys([e.lower().strip() for e in email_list if is_valid_email(e)]))
    
    def score_email(e):
        user = e.split("@")[0].lower()
        domain = e.split("@")[1].lower()
        
        domain_match = 10 if agency_domain and agency_domain in domain else 0
        
        # #1 TOP PRIORITY: Personal member email (e.g. rachel@, alex.smith@)
        if is_personal_member_email(e):
            return 100 + domain_match
            
        # #2 Secondary: Direct agency growth/newbiz mailboxes
        prefix_score = 0
        for idx, pref in enumerate(PRIORITY_PREFIXES):
            if user.startswith(pref):
                prefix_score = 30 - idx
                break
                
        if any(bad in user for bad in ["career", "job", "legal", "privacy", "billing", "press", "info"]):
            prefix_score = -50
            
        return domain_match + prefix_score

    unique.sort(key=score_email, reverse=True)
    return unique

def extract_instagram(soup, raw_text):
    """Extracts Instagram handle and URL from links or page text."""
    if soup:
        for a in soup.find_all("a", href=True):
            href = a['href']
            if "instagram.com" in href:
                match = INSTAGRAM_REGEX.search(href)
                if match:
                    handle = match.group(1).strip()
                    if handle.lower() not in IGNORED_IG:
                        return f"@{handle}", f"https://instagram.com/{handle}"

    match = INSTAGRAM_REGEX.search(raw_text)
    if match:
        handle = match.group(1).strip()
        if handle.lower() not in IGNORED_IG:
            return f"@{handle}", f"https://instagram.com/{handle}"

    return None, None

LINKEDIN_REGEX = re.compile(r'https?://(?:www\.)?linkedin\.com/(?:company|in)/([a-zA-Z0-9_.-]+)/?', re.IGNORECASE)

def extract_linkedin(soup, raw_text):
    """Extracts official LinkedIn company page or profile link."""
    if soup:
        for a in soup.find_all("a", href=True):
            href = a['href'].strip()
            if "linkedin.com" in href and any(x in href for x in ["/company/", "/in/"]):
                clean = href.split("?")[0].rstrip("/")
                return clean

    match = LINKEDIN_REGEX.search(raw_text)
    if match:
        return match.group(0).split("?")[0].rstrip("/")

    return None

def detect_website_services(soup, text, agency_domain):
    """
    Scans on-site links and text to detect if the agency offers website building/development.
    Returns: (offers_web_dev, reason)
    """
    if soup:
        for a in soup.find_all("a", href=True):
            href = a['href'].lower()
            link_text = a.get_text(separator=" ", strip=True).lower()
            
            parsed = urlparse(href)
            if parsed.netloc and agency_domain not in parsed.netloc:
                continue
                
            path = parsed.path
            if any(k in path for k in ["/web-design", "/web-development", "/website-design", "/website-development"]):
                return True, f"Nav link: {path}"
                
            if link_text in ["web design", "website design", "web development", "website development", "websites"]:
                return True, f"Link text: '{link_text}'"

    for pattern in WEB_PATTERNS:
        match = pattern.search(text)
        if match:
            return True, f"Found keyword: '{match.group(0)}'"

    return False, "Strictly NO website services offered"

def extract_agency_intelligence(website_url):
    """
    Visits the agency's website to extract:
    1. Direct business emails
    2. Instagram handle / URL
    3. Strict check on whether they build websites in-house
    4. Primary marketing specialties (Social Media, PR, Paid Ads, etc.)
    """
    if not website_url.startswith("http"):
        website_url = "https://" + website_url

    agency_domain = urlparse(website_url).netloc.replace("www.", "").lower()
    visited_urls = set()
    found_emails = []
    found_ig_handle = None
    found_ig_url = None
    found_linkedin_url = None
    site_title = None
    all_page_text = []
    has_web_services = False
    web_reason = "No website services found"
    
    pages_to_check = [
        website_url,
        urljoin(website_url, "/contact"),
        urljoin(website_url, "/about"),
    ]

    for url in pages_to_check:
        if url in visited_urls:
            continue
        visited_urls.add(url)
        
        try:
            resp = requests.get(url, headers=HEADERS, timeout=3.5, allow_redirects=True)
            if resp.status_code != 200:
                continue
                
            content = resp.text
            all_page_text.append(content)
            soup = BeautifulSoup(content, "html.parser")
            
            # Extract site title / brand name if on primary homepage
            if not site_title:
                og_name = soup.find("meta", property="og:site_name")
                if og_name and og_name.get("content"):
                    site_title = og_name["content"].strip()
                elif soup.title and soup.title.string:
                    site_title = soup.title.string.strip()

            # Check for website services
            if not has_web_services:
                offers_web, reason = detect_website_services(soup, content, agency_domain)
                if offers_web:
                    has_web_services = True
                    web_reason = reason
            
            # Instagram extraction
            if not found_ig_handle:
                ig_handle, ig_link = extract_instagram(soup, content)
                if ig_handle:
                    found_ig_handle = ig_handle
                    found_ig_url = ig_link

            # LinkedIn extraction
            if not found_linkedin_url:
                li_link = extract_linkedin(soup, content)
                if li_link:
                    found_linkedin_url = li_link

            # Extract mailto links
            for a in soup.find_all("a", href=True):
                href = a['href'].strip()
                if href.startswith("mailto:"):
                    clean_email = href.replace("mailto:", "").split("?")[0].strip()
                    if is_valid_email(clean_email):
                        found_emails.append(clean_email)
                        
            # Extract regex emails
            for match in EMAIL_REGEX.findall(content):
                clean_email = match.strip()
                if is_valid_email(clean_email):
                    found_emails.append(clean_email)

            # Fast break: if agency offers web dev (disqualified) or if valid email is found, stop querying further pages
            if has_web_services or found_emails:
                break

        except Exception:
            # If the primary homepage fails to connect, abort checking subpages
            if len(visited_urls) <= 1:
                break
            continue

    combined_text = " ".join(all_page_text)
    marketing_hits = [k.title() for k in MARKETING_KEYWORDS if k in combined_text.lower()]
    
    sorted_emails = prioritize_emails(found_emails, agency_domain)
    primary_email = sorted_emails[0] if sorted_emails else None
    contact_person = extract_person_name_from_email(primary_email) if primary_email else None
    
    import urllib.parse
    brand_keyword = agency_domain.split(".")[0].replace("-", " ")
    founder_search_url = f"https://www.google.com/search?q=site:linkedin.com/in+%22Founder%22+OR+%22Managing+Director%22+%22{urllib.parse.quote(brand_keyword)}%22"

    return {
        "primary_email": primary_email,
        "contact_person": contact_person,
        "all_emails": sorted_emails,
        "instagram_handle": found_ig_handle or "Not Listed",
        "instagram_url": found_ig_url or "",
        "linkedin_url": found_linkedin_url or "",
        "founder_search_url": founder_search_url,
        "is_marketing": len(marketing_hits) > 0,
        "offers_web_dev": has_web_services,
        "web_reason": web_reason,
        "specialties": marketing_hits[:3] if marketing_hits else ["Marketing & Brand Strategy"],
        "domain": agency_domain,
        "site_title": site_title or ""
    }


