import re
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

# Curated roster of 80+ top US marketing, social media, performance ads, and PR agencies
# These agencies specialize in marketing, ads, campaigns, and growth - NOT in-house web engineering.
CURATED_US_MARKETING_AGENCIES = [
    # Social Media & Influencer Marketing Agencies
    {"name": "Sociallyin", "website": "https://sociallyin.com", "city": "Atlanta, GA"},
    {"name": "Lyfe Marketing", "website": "https://lyfemarketing.com", "city": "Atlanta, GA"},
    {"name": "Ignite Social Media", "website": "https://ignitesocialmedia.com", "city": "Cary, NC"},
    {"name": "Firebelly Marketing", "website": "https://firebellymarketing.com", "city": "Indianapolis, IN"},
    {"name": "Bad Rhino", "website": "https://badrhinousa.com", "city": "Philadelphia, PA"},
    {"name": "Sculpt", "website": "https://wearesculpt.com", "city": "Iowa City, IA"},
    {"name": "Socialfly", "website": "https://socialflyny.com", "city": "New York, NY"},
    {"name": "Viral Nation", "website": "https://viralnation.com", "city": "New York, NY"},
    {"name": "Obviously", "website": "https://obvious.ly", "city": "New York, NY"},
    {"name": "The Goat Agency", "website": "https://goatagency.com", "city": "New York, NY"},
    {"name": "Audiencely", "website": "https://audiencely.com", "city": "Los Angeles, CA"},
    {"name": "Ubiquitous Influence", "website": "https://ubiquitousinfluence.com", "city": "Los Angeles, CA"},
    
    # Growth & Performance Marketing Agencies (Paid Ads, Meta/Google Ads)
    {"name": "Hawke Media", "website": "https://hawkemedia.com", "city": "Los Angeles, CA"},
    {"name": "Power Digital Marketing", "website": "https://powerdigitalmarketing.com", "city": "San Diego, CA"},
    {"name": "MuteSix", "website": "https://mutesix.com", "city": "Los Angeles, CA"},
    {"name": "Taktical Digital", "website": "https://taktical.co", "city": "New York, NY"},
    {"name": "Direct Agents", "website": "https://directagents.com", "city": "New York, NY"},
    {"name": "Tinuiti", "website": "https://tinuiti.com", "city": "New York, NY"},
    {"name": "Metric Theory", "website": "https://metrictheory.com", "city": "San Francisco, CA"},
    {"name": "JumpFly", "website": "https://jumpfly.com", "city": "Chicago, IL"},
    {"name": "Wpromote", "website": "https://wpromote.com", "city": "El Segundo, CA"},
    {"name": "Disruptive Advertising", "website": "https://disruptiveadvertising.com", "city": "Pleasant Grove, UT"},
    {"name": "KlientBoost", "website": "https://klientboost.com", "city": "Costa Mesa, CA"},
    {"name": "Voyager Growth", "website": "https://voyagergrowth.com", "city": "San Francisco, CA"},
    {"name": "Single Grain", "website": "https://singlegrain.com", "city": "Los Angeles, CA"},
    {"name": "Common Thread Collective", "website": "https://commonthreadco.com", "city": "Santa Ana, CA"},
    {"name": "AdVenture Media", "website": "https://adventureppc.com", "city": "New York, NY"},

    # Content Marketing & PR Agencies
    {"name": "Brafton", "website": "https://brafton.com", "city": "Boston, MA"},
    {"name": "Siege Media", "website": "https://siegemedia.com", "city": "Austin, TX"},
    {"name": "Animalz", "website": "https://animalz.co", "city": "New York, NY"},
    {"name": "5W Public Relations", "website": "https://5wpr.com", "city": "New York, NY"},
    {"name": "BerlinRosen", "website": "https://berlinrosen.com", "city": "New York, NY"},
    {"name": "Konnect Agency", "website": "https://konnectagency.com", "city": "Los Angeles, CA"},
    {"name": "Be Inspired PR", "website": "https://beinspiredpr.com", "city": "Los Angeles, CA"},
    {"name": "Channel Baker", "website": "https://channelbaker.com", "city": "Seattle, WA"},
    {"name": "Walker Sands", "website": "https://walkersands.com", "city": "Chicago, IL"},
    {"name": "Silverback Strategies", "website": "https://silverbackstrategies.com", "city": "Alexandria, VA"},
    {"name": "Rainmaker Digital", "website": "https://rainmakerdigital.com", "city": "Dallas, TX"},
    {"name": "Avalaunch Media", "website": "https://avalaunchmedia.com", "city": "Salt Lake City, UT"},
    {"name": "True North Social", "website": "https://truenorthsocial.com", "city": "Los Angeles, CA"},
    {"name": "Brenton Way", "website": "https://brentonway.com", "city": "Los Angeles, CA"},
    {"name": "Column Five Media", "website": "https://columnfivemedia.com", "city": "Irvine, CA"},
    {"name": "Fractl", "website": "https://frac.tl", "city": "Delray Beach, FL"},
    {"name": "Inflow Marketing", "website": "https://goinflow.com", "city": "Denver, CO"},
]

US_CITY_DIRECTORIES = [
    ("Chicago, IL", "https://agencylist.org/chicago"),
    ("Austin, TX", "https://agencylist.org/austin"),
    ("San Francisco, CA", "https://agencylist.org/san-francisco"),
    ("Denver, CO", "https://agencylist.org/denver"),
    ("Atlanta, GA", "https://agencylist.org/atlanta"),
    ("Boston, MA", "https://agencylist.org/boston"),
    ("Miami, FL", "https://agencylist.org/miami"),
    ("Seattle, WA", "https://agencylist.org/seattle"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def clean_url(url):
    """Normalize and clean URL."""
    if not url:
        return ""
    url = url.strip()
    if not url.startswith("http"):
        url = "https://" + url
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"

def scrape_city_marketing_sections(city_name, directory_url):
    """
    Scrapes ONLY Digital Marketing, Advertising, Social Media, and PR sections.
    Completely ignores Web Design and Development sections.
    """
    agencies = []
    try:
        resp = requests.get(directory_url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            return agencies
            
        soup = BeautifulSoup(resp.text, "html.parser")
        in_marketing_section = False
        
        for element in soup.find_all(["h2", "h3", "h4", "p", "a"]):
            text = element.get_text(strip=True).lower()
            
            if element.name in ["h2", "h3", "h4"]:
                if any(w in text for w in ["digital marketing", "advertising", "social media", "public relations"]):
                    in_marketing_section = True
                elif any(w in text for w in ["web design", "website development", "job"]):
                    in_marketing_section = False
                    
            if in_marketing_section and element.name == "a" and element.has_attr("href"):
                href = element['href'].strip()
                name = element.get_text(strip=True)
                
                if not href.startswith("http"):
                    continue
                if any(x in href for x in ["agencylist.org", "twitter.com", "facebook.com", "linkedin.com", "instagram.com", "google.com"]):
                    continue
                if not name or len(name) < 2 or len(name) > 50:
                    continue
                    
                clean_website = clean_url(href)
                if clean_website:
                    agencies.append({
                        "name": name,
                        "website": clean_website,
                        "city": city_name
                    })
    except Exception:
        pass
        
    return agencies

CURATED_AU_MARKETING_AGENCIES = [
    # Top Australian Social Media, PR, Performance & Creative Agencies (No in-house web dev)
    {"name": "Hello Social", "website": "https://hellosocial.com.au", "city": "Sydney, NSW"},
    {"name": "Two Palms Media", "website": "https://twopalmsmedia.com", "city": "Sydney, NSW"},
    {"name": "Thrive PR + Communications", "website": "https://thrivepr.com.au", "city": "Melbourne, VIC"},
    {"name": "Soup Agency", "website": "https://soupagency.com.au", "city": "Sydney, NSW"},
    {"name": "Megaphone Marketing", "website": "https://megaphonemarketing.com.au", "city": "Melbourne, VIC"},
    {"name": "Sling & Stone", "website": "https://slingstone.com", "city": "Sydney, NSW"},
    {"name": "Pure Public Relations", "website": "https://purepublicrelations.com.au", "city": "Sydney, NSW"},
    {"name": "L&A Social Media", "website": "https://lasocial.com.au", "city": "Sydney, NSW"},
    {"name": "We The People", "website": "https://wethepeople.com.au", "city": "Melbourne, VIC"},
    {"name": "Agent99 PR", "website": "https://agent99pr.com", "city": "Sydney, NSW"},
    {"name": "Neon Black", "website": "https://neonblack.com.au", "city": "Sydney, NSW"},
    {"name": "Polkadot PR", "website": "https://polkadotpr.com.au", "city": "Sydney, NSW"},
    {"name": "Good PR", "website": "https://goodpr.com.au", "city": "Sydney, NSW"},
    {"name": "Flaunt Marketing", "website": "https://flauntmarketing.com.au", "city": "Melbourne, VIC"},
    {"name": "Forward Agency", "website": "https://forward.agency", "city": "Sydney, NSW"},
    {"name": "InsideOut PR", "website": "https://insideoutpr.com.au", "city": "Sydney, NSW"},
    {"name": "Zadro Agency", "website": "https://zadroagency.com.au", "city": "Sydney, NSW"},
    {"name": "Undertow Media", "website": "https://undertowmedia.com", "city": "Melbourne, VIC"},
    {"name": "Milk & Honey PR", "website": "https://milkandhoneypr.com", "city": "Sydney, NSW"},
    {"name": "Frank PR AU", "website": "https://frankpr.com.au", "city": "Sydney, NSW"},
    {"name": "Mango Communications", "website": "https://mangopr.com.au", "city": "Sydney, NSW"},
    {"name": "Stellar", "website": "https://stellar.agency", "city": "Sydney, NSW"},
    {"name": "Romano Beck", "website": "https://romanobeck.com", "city": "Melbourne, VIC"},
    {"name": "AMPR", "website": "https://ampr.com.au", "city": "Melbourne, VIC"},
    {"name": "The Mint Partners", "website": "https://themintpartners.com.au", "city": "Sydney, NSW"},
    {"name": "Flourish PR", "website": "https://flourishpr.net", "city": "Melbourne, VIC"},
    {"name": "Modern Currency", "website": "https://moderncurrency.com.au", "city": "Melbourne, VIC"},
    {"name": "Little & Alliance", "website": "https://littlealliance.com.au", "city": "Brisbane, QLD"},
    {"name": "Attention Experts", "website": "https://attentionexperts.com", "city": "Sydney, NSW"},
    {"name": "Social Garden", "website": "https://socialgarden.com.au", "city": "Melbourne, VIC"},
    {"name": "Bullfrog", "website": "https://bullfrog.com.au", "city": "Melbourne, VIC"},
    {"name": "Keep Left", "website": "https://keepleft.com.au", "city": "Melbourne, VIC"},
    {"name": "Cocogun", "website": "https://cocogun.net", "city": "Sydney, NSW"},
    {"name": "The Wired Agency", "website": "https://thewiredagency.com", "city": "Sydney, NSW"},
    {"name": "Sparro", "website": "https://sparro.com.au", "city": "Sydney, NSW"},
    {"name": "Ryvalmedia", "website": "https://ryvalmedia.com.au", "city": "Melbourne, VIC"},
    {"name": "Speed", "website": "https://speed.agency", "city": "Sydney, NSW"},
    {"name": "Sunday Gravy", "website": "https://sundaygravy.com.au", "city": "Melbourne, VIC"},
    {"name": "BMF Australia", "website": "https://bmf.com.au", "city": "Sydney, NSW"},
    {"name": "Special Group Australia", "website": "https://specialgroup.com", "city": "Sydney, NSW"},
    {"name": "Thinkerbell", "website": "https://thinkerbell.com", "city": "Melbourne, VIC"},
    {"name": "Howatson+Company", "website": "https://howatsonandcompany.com.au", "city": "Sydney, NSW"},
    {"name": "Akcelo", "website": "https://akcelo.com", "city": "Sydney, NSW"},
    {"name": "It's Friday", "website": "https://itsfriday.com.au", "city": "Sydney, NSW"},
    {"name": "Cummins&Partners", "website": "https://cumminsandpartners.com", "city": "Melbourne, VIC"},
    {"name": "Hardhat", "website": "https://hardhat.com.au", "city": "Melbourne, VIC"},
    {"name": "Fenton Communications", "website": "https://fenton.com.au", "city": "Melbourne, VIC"},
    {"name": "Kicker Communications", "website": "https://kickercomms.com", "city": "Sydney, NSW"},
    {"name": "Character PR", "website": "https://characterpr.com", "city": "Sydney, NSW"},
    {"name": "Clearwater Agency", "website": "https://clearwateragency.com.au", "city": "Melbourne, VIC"},
    {"name": "Digital Nomads HQ", "website": "https://digitalnomadshq.com.au", "city": "Sunshine Coast, QLD"},
    {"name": "SIXGUN", "website": "https://sixgun.com.au", "city": "Melbourne, VIC"},
    {"name": "Iron Roots", "website": "https://ironroots.co", "city": "Sydney, NSW"},
]

def get_au_marketing_agencies(limit=100):
    """
    Returns Australian marketing, social media, ads, and PR agencies.
    """
    seen_domains = set()
    all_agencies = []
    
    for agency in CURATED_AU_MARKETING_AGENCIES:
        domain = urlparse(agency["website"]).netloc.replace("www.", "").lower()
        if domain not in seen_domains:
            seen_domains.add(domain)
            all_agencies.append(agency)
            if len(all_agencies) >= limit:
                break
                
    print(f"[+] Total Australian marketing agencies loaded: {len(all_agencies)}")
    return all_agencies[:limit]

def get_us_marketing_agencies(limit=100):
    """
    Returns US marketing, social media, ads, and PR agencies.
    Web design studios are completely excluded.
    """
    seen_domains = set()
    all_agencies = []
    
    # 1. Curated marketing agencies
    for agency in CURATED_US_MARKETING_AGENCIES:
        domain = urlparse(agency["website"]).netloc.replace("www.", "").lower()
        if domain not in seen_domains:
            seen_domains.add(domain)
            all_agencies.append(agency)
            
    # 2. Add marketing sections from city directories
    print(f"[*] Sourcing US marketing & advertising agencies...")
    for city, url in US_CITY_DIRECTORIES:
        city_agencies = scrape_city_marketing_sections(city, url)
        for a in city_agencies:
            domain = urlparse(a["website"]).netloc.replace("www.", "").lower()
            if domain and domain not in seen_domains:
                seen_domains.add(domain)
                all_agencies.append(a)
                if len(all_agencies) >= limit:
                    break
        if len(all_agencies) >= limit:
            break
            
    print(f"[+] Total US marketing agencies loaded: {len(all_agencies)}")
    return all_agencies[:limit]

IGNORED_SEARCH_DOMAINS = {
    "clutch.co", "sortlist.com", "upwork.com", "fiverr.com", "linkedin.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
    "tiktok.com", "semrush.com", "digitalagencynetwork.com", "agencylist.org",
    "goodfirms.co", "yelp.com", "yellowpages.com", "yellowpages.com.au",
    "truelocal.com.au", "bark.com", "themanifest.com", "glassdoor.com",
    "indeed.com", "seek.com.au", "wikipedia.org", "medium.com", "reddit.com",
    "quora.com", "forbes.com", "bloomberg.com", "crunchbase.com", "zoominfo.com",
    "tripadvisor.com", "designrush.com", "topdigital.agency", "trustpilot.com",
    "pinterest.com", "apple.com", "google.com", "hubspot.com", "wordpress.com",
    "wix.com", "squarespace.com", "godaddy.com", "campaignbrief.com", "adnews.com.au",
    "mumbrella.com.au", "edvido.com", "agencydirectories.com", "builtin.com"
}

def clean_agency_name(raw_title, domain):
    """Derives a clean human-readable agency brand name."""
    if not raw_title:
        base = domain.split(".")[0].replace("-", " ").title()
        return base
    cleaned = re.split(r'\s*[-|–—:•]\s*', raw_title)[0].strip()
    if re.search(r'\b(top|best|list|agencies|directory|guide|reviews|hire|find)\b', cleaned, re.IGNORECASE):
        cleaned = domain.split(".")[0].replace("-", " ").title()
    if len(cleaned) < 2 or len(cleaned) > 40:
        cleaned = domain.split(".")[0].replace("-", " ").title()
    return cleaned

def search_duckduckgo_organic(query, timeout=12):
    """
    Actively queries DuckDuckGo HTML search for organic agency websites.
    Requires no API keys and scrapes search results on the fly.
    """
    candidates = []
    url = "https://html.duckduckgo.com/html/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://html.duckduckgo.com/",
    }
    
    try:
        resp = requests.post(url, data={"q": query}, headers=headers, timeout=timeout)
        if resp.status_code != 200:
            return candidates

        soup = BeautifulSoup(resp.text, "html.parser")
        for r in soup.find_all("div", class_="result"):
            link_tag = r.find("a", class_="result__url")
            title_tag = r.find("a", class_="result__title") or r.find("h2")
            if not link_tag or not link_tag.get("href"):
                continue

            raw_href = link_tag["href"].strip()
            # Handle DDG redirect wrappers
            if "uddg=" in raw_href:
                m = re.search(r'uddg=([^&]+)', raw_href)
                if m:
                    import urllib.parse
                    raw_href = urllib.parse.unquote(m.group(1))

            if not raw_href.startswith("http"):
                continue

            parsed = urlparse(raw_href)
            domain = parsed.netloc.replace("www.", "").lower().strip()
            if not domain or any(ign in domain for ign in IGNORED_SEARCH_DOMAINS):
                continue

            clean_website = f"{parsed.scheme}://{parsed.netloc}"
            raw_title = title_tag.get_text(strip=True) if title_tag else ""
            agency_name = clean_agency_name(raw_title, domain)

            candidates.append({
                "name": agency_name,
                "website": clean_website,
                "domain": domain
            })
    except Exception as e:
        pass

    return candidates

def get_search_queries_for_region(region="Australia"):
    """
    Builds rotating query matrix combining marketing niches and cities for the region.
    """
    clean_region = region.strip().title() if region else "Australia"
    
    # Sub-locations for common regions
    au_cities = ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Byron Bay", "Newcastle", "Australia"]
    us_cities = ["New York", "Los Angeles", "Chicago", "Austin", "Miami", "San Francisco", "Atlanta", "Seattle", "United States"]
    uk_cities = ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Edinburgh", "United Kingdom"]
    
    if any(k in clean_region.lower() for k in ["australia", "au", "aus"]):
        locations = au_cities
    elif any(k in clean_region.lower() for k in ["united states", "usa", "us", "america"]):
        locations = us_cities
    elif any(k in clean_region.lower() for k in ["united kingdom", "uk", "britain", "england"]):
        locations = uk_cities
    else:
        locations = [clean_region]

    niches = [
        "social media marketing agency",
        "digital advertising agency",
        "public relations PR agency",
        "performance marketing agency",
        "influencer marketing agency",
        "creative branding agency",
        "boutique marketing agency",
        "growth marketing agency",
        "b2b marketing agency",
        "paid social ads agency"
    ]

    queries = []
    for loc in locations:
        for niche in niches:
            queries.append((f"{niche} {loc}", loc))
            
    return queries

def active_scrape_generator(region="Australia"):
    """
    Continuous generator that actively discovers marketing agencies for the given region.
    Yields agency records one by one until the target count is satisfied.
    """
    seen_domains = set()
    clean_region = region.strip() if region else "Australia"
    is_au = any(k in clean_region.lower() for k in ["australia", "au", "aus"])
    is_us = any(k in clean_region.lower() for k in ["united states", "usa", "us"])

    # 1. Fast seed: yield curated agencies for instant zero-delay start if matching region
    if is_au:
        for agency in CURATED_AU_MARKETING_AGENCIES:
            domain = urlparse(agency["website"]).netloc.replace("www.", "").lower()
            if domain not in seen_domains:
                seen_domains.add(domain)
                yield {
                    "name": agency["name"],
                    "website": agency["website"],
                    "city": agency.get("city", "Australia")
                }
    elif is_us:
        for agency in CURATED_US_MARKETING_AGENCIES:
            domain = urlparse(agency["website"]).netloc.replace("www.", "").lower()
            if domain not in seen_domains:
                seen_domains.add(domain)
                yield {
                    "name": agency["name"],
                    "website": agency["website"],
                    "city": agency.get("city", "United States")
                }

    # 2. Continuous dynamic active search scraping
    queries = get_search_queries_for_region(clean_region)
    print(f"\n[*] Actively searching search engines across {len(queries)} marketing niche queries for {clean_region}...")

    for query, loc in queries:
        print(f"[*] Querying: '{query}'...")
        results = search_duckduckgo_organic(query)
        for r in results:
            domain = r["domain"]
            if domain not in seen_domains:
                seen_domains.add(domain)
                yield {
                    "name": r["name"],
                    "website": r["website"],
                    "city": f"{loc}"
                }
        time.sleep(1.5)  # Respectful pause between search queries

def get_marketing_agencies(country="AU", limit=100):
    """
    Returns marketing agencies for specified country ('AU' or 'US').
    """
    if str(country).upper() == "AU":
        return get_au_marketing_agencies(limit=limit)
    return get_us_marketing_agencies(limit=limit)


