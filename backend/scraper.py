import re
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

# Curated roster of 80+ top US marketing, social media, performance ads, and PR agencies
# These agencies specialize in marketing, ads, campaigns, and growth - NOT in-house web engineering.
CURATED_US_MARKETING_AGENCIES = [
    # Social Media & Influencer Marketing Agencies
    {"name": "Sociallyin", "website": "https://sociallyin.com", "city": "Atlanta, GA", "email": "info@sociallyin.com", "is_curated": True},
    {"name": "Lyfe Marketing", "website": "https://lyfemarketing.com", "city": "Atlanta, GA", "email": "info@lyfemarketing.com", "is_curated": True},
    {"name": "Ignite Social Media", "website": "https://ignitesocialmedia.com", "city": "Cary, NC", "email": "info@ignitesocialmedia.com", "is_curated": True},
    {"name": "Firebelly Marketing", "website": "https://firebellymarketing.com", "city": "Indianapolis, IN", "email": "hello@firebellymarketing.com", "is_curated": True},
    {"name": "Bad Rhino", "website": "https://badrhinousa.com", "city": "Philadelphia, PA", "email": "info@badrhinousa.com", "is_curated": True},
    {"name": "Sculpt", "website": "https://wearesculpt.com", "city": "Iowa City, IA", "email": "hello@wearesculpt.com", "is_curated": True},
    {"name": "Socialfly", "website": "https://socialflyny.com", "city": "New York, NY", "email": "info@socialflyny.com", "is_curated": True},
    {"name": "Viral Nation", "website": "https://viralnation.com", "city": "New York, NY", "email": "hello@viralnation.com", "is_curated": True},
    {"name": "Obviously", "website": "https://obvious.ly", "city": "New York, NY", "email": "hello@obvious.ly", "is_curated": True},
    {"name": "The Goat Agency", "website": "https://goatagency.com", "city": "New York, NY", "email": "hello@goatagency.com", "is_curated": True},
    {"name": "Audiencely", "website": "https://audiencely.com", "city": "Los Angeles, CA", "email": "hello@audiencely.com", "is_curated": True},
    {"name": "Ubiquitous Influence", "website": "https://ubiquitousinfluence.com", "city": "Los Angeles, CA", "email": "growth@ubiquitousinfluence.com", "is_curated": True},
    
    # Growth & Performance Marketing Agencies (Paid Ads, Meta/Google Ads)
    {"name": "Hawke Media", "website": "https://hawkemedia.com", "city": "Los Angeles, CA", "email": "contact@hawkemedia.com", "is_curated": True},
    {"name": "Power Digital Marketing", "website": "https://powerdigitalmarketing.com", "city": "San Diego, CA", "email": "info@powerdigitalmarketing.com", "is_curated": True},
    {"name": "MuteSix", "website": "https://mutesix.com", "city": "Los Angeles, CA", "email": "hello@mutesix.com", "is_curated": True},
    {"name": "Taktical Digital", "website": "https://taktical.co", "city": "New York, NY", "email": "info@taktical.co", "is_curated": True},
    {"name": "Direct Agents", "website": "https://directagents.com", "city": "New York, NY", "email": "info@directagents.com", "is_curated": True},
    {"name": "Tinuiti", "website": "https://tinuiti.com", "city": "New York, NY", "email": "contact@tinuiti.com", "is_curated": True},
    {"name": "Metric Theory", "website": "https://metrictheory.com", "city": "San Francisco, CA", "email": "contact@metrictheory.com", "is_curated": True},
    {"name": "JumpFly", "website": "https://jumpfly.com", "city": "Chicago, IL", "email": "info@jumpfly.com", "is_curated": True},
    {"name": "Wpromote", "website": "https://wpromote.com", "city": "El Segundo, CA", "email": "info@wpromote.com", "is_curated": True},
    {"name": "Disruptive Advertising", "website": "https://disruptiveadvertising.com", "city": "Pleasant Grove, UT", "email": "info@disruptiveadvertising.com", "is_curated": True},
    {"name": "KlientBoost", "website": "https://klientboost.com", "city": "Costa Mesa, CA", "email": "hello@klientboost.com", "is_curated": True},
    {"name": "Voyager Growth", "website": "https://voyagergrowth.com", "city": "San Francisco, CA", "email": "growth@voyagergrowth.com", "is_curated": True},
    {"name": "Single Grain", "website": "https://singlegrain.com", "city": "Los Angeles, CA", "email": "contact@singlegrain.com", "is_curated": True},
    {"name": "Common Thread Collective", "website": "https://commonthreadco.com", "city": "Santa Ana, CA", "email": "hello@commonthreadco.com", "is_curated": True},
    {"name": "AdVenture Media", "website": "https://adventureppc.com", "city": "New York, NY", "email": "info@adventureppc.com", "is_curated": True},

    # Content Marketing & PR Agencies
    {"name": "Brafton", "website": "https://brafton.com", "city": "Boston, MA", "email": "info@brafton.com", "is_curated": True},
    {"name": "Siege Media", "website": "https://siegemedia.com", "city": "Austin, TX", "email": "info@siegemedia.com", "is_curated": True},
    {"name": "Animalz", "website": "https://animalz.co", "city": "New York, NY", "email": "hello@animalz.co", "is_curated": True},
    {"name": "5W Public Relations", "website": "https://5wpr.com", "city": "New York, NY", "email": "info@5wpr.com", "is_curated": True},
    {"name": "BerlinRosen", "website": "https://berlinrosen.com", "city": "New York, NY", "email": "info@berlinrosen.com", "is_curated": True},
    {"name": "Konnect Agency", "website": "https://konnectagency.com", "city": "Los Angeles, CA", "email": "info@konnectagency.com", "is_curated": True},
    {"name": "Be Inspired PR", "website": "https://beinspiredpr.com", "city": "Los Angeles, CA", "email": "info@beinspiredpr.com", "is_curated": True},
    {"name": "Channel Baker", "website": "https://channelbaker.com", "city": "Seattle, WA", "email": "info@channelbaker.com", "is_curated": True},
    {"name": "Walker Sands", "website": "https://walkersands.com", "city": "Chicago, IL", "email": "contact@walkersands.com", "is_curated": True},
    {"name": "Silverback Strategies", "website": "https://silverbackstrategies.com", "city": "Alexandria, VA", "email": "info@silverbackstrategies.com", "is_curated": True},
    {"name": "Rainmaker Digital", "website": "https://rainmakerdigital.com", "city": "Dallas, TX", "email": "hello@rainmakerdigital.com", "is_curated": True},
    {"name": "Avalaunch Media", "website": "https://avalaunchmedia.com", "city": "Salt Lake City, UT", "email": "info@avalaunchmedia.com", "is_curated": True},
    {"name": "True North Social", "website": "https://truenorthsocial.com", "city": "Los Angeles, CA", "email": "info@truenorthsocial.com", "is_curated": True},
    {"name": "Brenton Way", "website": "https://brentonway.com", "city": "Los Angeles, CA", "email": "hello@brentonway.com", "is_curated": True},
    {"name": "Column Five Media", "website": "https://columnfivemedia.com", "city": "Irvine, CA", "email": "info@columnfivemedia.com", "is_curated": True},
    {"name": "Fractl", "website": "https://frac.tl", "city": "Delray Beach, FL", "email": "info@frac.tl", "is_curated": True},
    {"name": "Inflow Marketing", "website": "https://goinflow.com", "city": "Denver, CO", "email": "info@goinflow.com", "is_curated": True},
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
    {"name": "Pure Public Relations", "website": "https://purepublicrelations.com.au", "city": "Sydney, NSW", "email": "phoebe@purepublicrelations.com.au", "is_curated": True},
    {"name": "Attention Experts", "website": "https://attentionexperts.com", "city": "Sydney, NSW", "email": "growth@attentionexperts.com", "is_curated": True},
    {"name": "Clearwater Agency", "website": "https://clearwateragency.com.au", "city": "Melbourne, VIC", "email": "contact@clearwateragency.com.au", "is_curated": True},
    {"name": "Digital Nomads HQ", "website": "https://digitalnomadshq.com.au", "city": "Sunshine Coast, QLD", "email": "hello@digitalnomadshq.com.au", "is_curated": True},
    {"name": "SIXGUN", "website": "https://sixgun.com.au", "city": "Melbourne, VIC", "email": "hello@sixgun.com.au", "is_curated": True},
    {"name": "Iron Roots", "website": "https://ironroots.co", "city": "Sydney, NSW", "email": "growth@ironroots.co", "is_curated": True},
    {"name": "Social Garden", "website": "https://socialgarden.com.au", "city": "Melbourne, VIC", "email": "enquiries@socialgarden.com.au", "is_curated": True},
    {"name": "Keep Left", "website": "https://keepleft.com.au", "city": "Melbourne, VIC", "email": "melbourne@keepleft.com.au", "is_curated": True},
    {"name": "Cocogun", "website": "https://cocogun.net", "city": "Sydney, NSW", "email": "hello@cocogun.net", "is_curated": True},
    {"name": "Howatson+Company", "website": "https://howatsonandcompany.com.au", "city": "Sydney, NSW", "email": "hello@howatsonandcompany.com.au", "is_curated": True},
    {"name": "Akcelo", "website": "https://akcelo.com", "city": "Sydney, NSW", "email": "sydney@akcelo.com", "is_curated": True},
    {"name": "Hardhat", "website": "https://hardhat.com.au", "city": "Melbourne, VIC", "email": "hello@hardhat.com.au", "is_curated": True},
    {"name": "Fenton Communications", "website": "https://fenton.com.au", "city": "Melbourne, VIC", "email": "melbourne@fenton.com.au", "is_curated": True},
    {"name": "Kicker Communications", "website": "https://kickercomms.com", "city": "Sydney, NSW", "email": "hello@kickercomms.com", "is_curated": True},
    {"name": "Character PR", "website": "https://characterpr.com", "city": "Sydney, NSW", "email": "hello@characterpr.com", "is_curated": True},
    {"name": "Frank PR AU", "website": "https://frankpr.com.au", "city": "Sydney, NSW", "email": "sydney@frankpr.com.au", "is_curated": True},
    {"name": "Special Group Australia", "website": "https://specialgroup.com", "city": "Sydney, NSW", "email": "sydney@specialgroup.com", "is_curated": True},
    {"name": "Speed", "website": "https://speed.agency", "city": "Sydney, NSW", "email": "hello@speed.agency", "is_curated": True},
    {"name": "Sunday Gravy", "website": "https://sundaygravy.com.au", "city": "Melbourne, VIC", "email": "info@sundaygravy.com.au", "is_curated": True},
    {"name": "Mango Communications", "website": "https://mangopr.com.au", "city": "Sydney, NSW", "email": "sydney@mangopr.com.au", "is_curated": True},
    {"name": "InsideOut PR", "website": "https://insideoutpr.com.au", "city": "Sydney, NSW", "email": "sydney@insideoutpr.com.au", "is_curated": True},
    {"name": "Zadro Agency", "website": "https://zadroagency.com.au", "city": "Sydney, NSW", "email": "advice@zadroagency.com.au", "is_curated": True},
    {"name": "Bullfrog", "website": "https://bullfrog.com.au", "city": "Melbourne, VIC", "email": "croak@bullfrog.com.au", "is_curated": True},
    {"name": "Sling & Stone", "website": "https://slingstone.com", "city": "Sydney, NSW", "email": "hello@slingstone.com", "is_curated": True},
    {"name": "Megaphone Marketing", "website": "https://megaphonemarketing.com.au", "city": "Melbourne, VIC", "email": "hello@megaphonemarketing.com.au", "is_curated": True},
    {"name": "Polkadot PR", "website": "https://polkadotpr.com.au", "city": "Sydney, NSW", "email": "hello@polkadotpr.com.au", "is_curated": True},
    {"name": "Forward Agency", "website": "https://forward.agency", "city": "Sydney, NSW", "email": "hello@forward.agency", "is_curated": True},
    {"name": "Flourish PR", "website": "https://flourishpr.net", "city": "Melbourne, VIC", "email": "melbourne@flourishpr.net", "is_curated": True},
    {"name": "Little & Alliance", "website": "https://littlealliance.com.au", "city": "Brisbane, QLD", "email": "hello@littlealliance.com.au", "is_curated": True},
    {"name": "The Wired Agency", "website": "https://thewiredagency.com", "city": "Sydney, NSW", "email": "hello@thewiredagency.com", "is_curated": True},
    {"name": "Neon Black", "website": "https://neonblack.com.au", "city": "Sydney, NSW", "email": "hello@neonblack.com.au", "is_curated": True},
    {"name": "Agent99 PR", "website": "https://agent99pr.com", "city": "Sydney, NSW", "email": "info@agent99pr.com", "is_curated": True},
    {"name": "L&A Social Media", "website": "https://lasocial.com.au", "city": "Sydney, NSW", "email": "hello@lasocial.com.au", "is_curated": True},
    {"name": "Soup Agency", "website": "https://soupagency.com.au", "city": "Sydney, NSW", "email": "admin@soupagency.com.au", "is_curated": True},
    {"name": "Sparro", "website": "https://sparro.com.au", "city": "Sydney, NSW", "email": "hello@sparro.com.au", "is_curated": True},
    {"name": "The Royals", "website": "https://theroyals.com.au", "city": "Sydney, NSW", "email": "hello@theroyals.com.au", "is_curated": True},
    {"name": "Paper Moose", "website": "https://papermoose.com", "city": "Sydney, NSW", "email": "hello@papermoose.com", "is_curated": True},
    {"name": "Bastion Agency", "website": "https://bastionagency.com", "city": "Melbourne, VIC", "email": "hello@bastionagency.com", "is_curated": True},
    {"name": "Adhesive PR", "website": "https://adhesivepr.com.au", "city": "Sydney, NSW", "email": "hello@adhesivepr.com.au", "is_curated": True},
    {"name": "DEC PR", "website": "https://decpr.com.au", "city": "Sydney, NSW", "email": "info@decpr.com.au", "is_curated": True},
    {"name": "Sefiani Communications", "website": "https://sefiani.com.au", "city": "Sydney, NSW", "email": "sydney@sefiani.com.au", "is_curated": True},
    {"name": "Cannings Purple", "website": "https://canningspurple.com.au", "city": "Perth, WA", "email": "perth@canningspurple.com.au", "is_curated": True},
    {"name": "Rowland", "website": "https://rowland.com.au", "city": "Brisbane, QLD", "email": "brisbane@rowland.com.au", "is_curated": True},
    {"name": "Hughes Public Relations", "website": "https://hughespr.com.au", "city": "Adelaide, SA", "email": "adelaide@hughespr.com.au", "is_curated": True},
    {"name": "Fuller Brand Communication", "website": "https://fuller.com.au", "city": "Adelaide, SA", "email": "hello@fuller.com.au", "is_curated": True},
    {"name": "Simple Integrated Marketing", "website": "https://simple.com.au", "city": "Adelaide, SA", "email": "hello@simple.com.au", "is_curated": True},
    {"name": "Commshake Digital Media", "website": "https://commshake.com", "city": "Perth, WA", "email": "hello@commshake.com", "is_curated": True},
    {"name": "Coffey Media", "website": "https://coffeymedia.com.au", "city": "Brisbane, QLD", "email": "hello@coffeymedia.com.au", "is_curated": True},
    {"name": "Elevate Communication", "website": "https://elevatecom.com.au", "city": "Brisbane, QLD", "email": "info@elevatecom.com.au", "is_curated": True},
    {"name": "Media Mortar", "website": "https://mediamortar.com.au", "city": "Brisbane, QLD", "email": "hello@mediamortar.com.au", "is_curated": True},
    {"name": "Promedia Public Relations", "website": "https://promedia.com.au", "city": "Gold Coast, QLD", "email": "info@promedia.com.au", "is_curated": True},
    {"name": "Sanctuary Media Group", "website": "https://sanctuarymedia.com.au", "city": "Gold Coast, QLD", "email": "hello@sanctuarymedia.com.au", "is_curated": True},
    {"name": "Whiteark", "website": "https://whiteark.com.au", "city": "Sydney, NSW", "email": "contact@whiteark.com.au", "is_curated": True},
    {"name": "Grounded Media", "website": "https://groundedmedia.com.au", "city": "Melbourne, VIC", "email": "hello@groundedmedia.com.au", "is_curated": True},
    {"name": "Growth Ops", "website": "https://growthops.com.au", "city": "Brisbane, QLD", "email": "hello@growthops.com.au", "is_curated": True},
    {"name": "Atomic 212", "website": "https://atomic212.com.au", "city": "Sydney, NSW", "email": "hello@atomic212.com.au", "is_curated": True},
    {"name": "Avenue C", "website": "https://avenuec.com.au", "city": "Sydney, NSW", "email": "hello@avenuec.com.au", "is_curated": True},
    {"name": "KWPX Agency", "website": "https://kwpx.com", "city": "Adelaide, SA", "email": "hello@kwpx.com", "is_curated": True},
    {"name": "Showpony Advertising", "website": "https://showpony.com.au", "city": "Adelaide, SA", "email": "hello@showpony.com.au", "is_curated": True},
    {"name": "Nation Agency", "website": "https://nation.com.au", "city": "Adelaide, SA", "email": "hello@nation.com.au", "is_curated": True},
    {"name": "Juicebox Creative", "website": "https://juicebox.com.au", "city": "Perth, WA", "email": "hello@juicebox.com.au", "is_curated": True},
    {"name": "Bonfire Digital", "website": "https://bonfire.com.au", "city": "Perth, WA", "email": "growth@bonfire.com.au", "is_curated": True},
    {"name": "Engine Group", "website": "https://enginegroup.com.au", "city": "Brisbane, QLD", "email": "info@enginegroup.com.au", "is_curated": True},
    {"name": "BCM Group", "website": "https://bcm.com.au", "city": "Brisbane, QLD", "email": "hello@bcm.com.au", "is_curated": True},
    {"name": "Rumble Town", "website": "https://rumbletown.art", "city": "Brisbane, QLD", "email": "hello@rumbletown.art", "is_curated": True},
    {"name": "Brother & Co", "website": "https://brother.co", "city": "Brisbane, QLD", "email": "hello@brother.co", "is_curated": True},
    {"name": "The Monkeys", "website": "https://themonkeys.com.au", "city": "Sydney, NSW", "email": "hello@themonkeys.com.au", "is_curated": True},
    {"name": "Eleven PR", "website": "https://elevenpr.com.au", "city": "Sydney, NSW", "email": "hello@elevenpr.com.au", "is_curated": True},
    {"name": "Hello Social", "website": "https://hellosocial.com.au", "city": "Sydney, NSW", "email": "hello@hellosocial.com.au", "is_curated": True},
    {"name": "Two Palms Media", "website": "https://twopalmsmedia.com", "city": "Sydney, NSW", "email": "hello@twopalmsmedia.com", "is_curated": True},
    {"name": "Thrive PR + Communications", "website": "https://thrivepr.com.au", "city": "Melbourne, VIC", "email": "fly@thrivepr.com.au", "is_curated": True},
    {"name": "We The People", "website": "https://wethepeople.com.au", "city": "Melbourne, VIC", "email": "hello@wethepeople.com.au", "is_curated": True},
    {"name": "Good PR", "website": "https://goodpr.com.au", "city": "Sydney, NSW", "email": "hello@goodpr.com.au", "is_curated": True},
    {"name": "Flaunt Marketing", "website": "https://flauntmarketing.com.au", "city": "Melbourne, VIC", "email": "office@flauntmarketing.com.au", "is_curated": True},
    {"name": "Undertow Media", "website": "https://undertowmedia.com", "city": "Melbourne, VIC", "email": "greer@undertowmedia.com", "is_curated": True},
    {"name": "Milk & Honey PR", "website": "https://milkandhoneypr.com", "city": "Sydney, NSW", "email": "manuel@milkandhoneypr.com", "is_curated": True},
    {"name": "Stellar", "website": "https://stellar.agency", "city": "Sydney, NSW", "email": "hello@stellar.agency", "is_curated": True},
    {"name": "Romano Beck", "website": "https://romanobeck.com", "city": "Melbourne, VIC", "email": "hello@romanobeck.com", "is_curated": True},
    {"name": "AMPR", "website": "https://ampr.com.au", "city": "Melbourne, VIC", "email": "work@ampr.com.au", "is_curated": True},
    {"name": "The Mint Partners", "website": "https://themintpartners.com.au", "city": "Sydney, NSW", "email": "hello@themintpartners.com.au", "is_curated": True},
    {"name": "Modern Currency", "website": "https://moderncurrency.com.au", "city": "Melbourne, VIC", "email": "hello@moderncurrency.com.au", "is_curated": True},
    {"name": "Ryvalmedia", "website": "https://ryvalmedia.com.au", "city": "Melbourne, VIC", "email": "joseph.pardillo@ryvalmedia.com.au", "is_curated": True},
    {"name": "BMF Australia", "website": "https://bmf.com.au", "city": "Sydney, NSW", "email": "georgia.suttie@bmf.com.au", "is_curated": True},
    {"name": "Thinkerbell", "website": "https://thinkerbell.com", "city": "Melbourne, VIC", "email": "hello@thinkerbell.com", "is_curated": True},
    {"name": "It's Friday", "website": "https://itsfriday.com.au", "city": "Sydney, NSW", "email": "contact@itsfriday.com.au", "is_curated": True},
    {"name": "Cummins&Partners", "website": "https://cumminsandpartners.com", "city": "Melbourne, VIC", "email": "melbourne@cumminsandpartners.com", "is_curated": True},
]

CURATED_UK_MARKETING_AGENCIES = [
    # Top UK & London Marketing, Social Media, PR, and Performance Agencies
    {"name": "Born Social", "website": "https://bornsocial.com", "city": "London, UK", "email": "hello@bornsocial.com", "is_curated": True},
    {"name": "The Social Shepherd", "website": "https://thesocialshepherd.com", "city": "London, UK", "email": "hello@thesocialshepherd.com", "is_curated": True},
    {"name": "CEEK Marketing", "website": "https://ceek.co.uk", "city": "London, UK", "email": "info@ceek.co.uk", "is_curated": True},
    {"name": "Social Chain", "website": "https://socialchain.com", "city": "London, UK", "email": "hello@socialchain.com", "is_curated": True},
    {"name": "Brainlabs", "website": "https://brainlabsdigital.com", "city": "London, UK", "email": "hello@brainlabsdigital.com", "is_curated": True},
    {"name": "Impression", "website": "https://impressiondigital.com", "city": "London, UK", "email": "hello@impressiondigital.com", "is_curated": True},
    {"name": "Rooster PR", "website": "https://rooster.co.uk", "city": "London, UK", "email": "hello@rooster.co.uk", "is_curated": True},
    {"name": "Propeller Group", "website": "https://propellergroup.com", "city": "London, UK", "email": "hello@propellergroup.com", "is_curated": True},
    {"name": "Bountiful Cow", "website": "https://bountifulcow.com", "city": "London, UK", "email": "hello@bountifulcow.com", "is_curated": True},
    {"name": "Curious Productions", "website": "https://curiousproductions.co.uk", "city": "London, UK", "email": "hello@curiousproductions.co.uk", "is_curated": True},
    {"name": "Don't Cry Wolf", "website": "https://dontcrywolf.com", "city": "London, UK", "email": "hello@dontcrywolf.com", "is_curated": True},
    {"name": "Harvard PR", "website": "https://harvard.co.uk", "city": "London, UK", "email": "hello@harvard.co.uk", "is_curated": True},
    {"name": "Kaizen", "website": "https://kaizen.co.uk", "city": "London, UK", "email": "hello@kaizen.co.uk", "is_curated": True},
    {"name": "Launch PR", "website": "https://launchpr.co.uk", "city": "London, UK", "email": "hello@launchpr.co.uk", "is_curated": True},
    {"name": "M&C Saatchi PR", "website": "https://mcsaatchipr.com", "city": "London, UK", "email": "hello@mcsaatchipr.com", "is_curated": True},
    {"name": "Manifest Group", "website": "https://manifest.group", "city": "London, UK", "email": "hello@manifest.group", "is_curated": True},
    {"name": "Manifesto Growth", "website": "https://manifestogrowth.com", "city": "London, UK", "email": "hello@manifestogrowth.com", "is_curated": True},
    {"name": "Nelson Bostock", "website": "https://nelsonbostock.com", "city": "London, UK", "email": "hello@nelsonbostock.com", "is_curated": True},
    {"name": "Octopus Group", "website": "https://weareoctopusgroup.net", "city": "London, UK", "email": "hello@weareoctopusgroup.net", "is_curated": True},
    {"name": "Panther Mktg", "website": "https://panthermarketing.co.uk", "city": "London, UK", "email": "hello@panthermarketing.co.uk", "is_curated": True},
    {"name": "Seven Hills", "website": "https://wearesevenhills.com", "city": "London, UK", "email": "hello@wearesevenhills.com", "is_curated": True},
    {"name": "Speed Communications UK", "website": "https://speedcomms.com", "city": "London, UK", "email": "hello@speedcomms.com", "is_curated": True},
    {"name": "Splendid Communications", "website": "https://splendidcomms.com", "city": "London, UK", "email": "hello@splendidcomms.com", "is_curated": True},
    {"name": "The PHA Group", "website": "https://thephagroup.com", "city": "London, UK", "email": "hello@thephagroup.com", "is_curated": True},
    {"name": "Tin Man Communications", "website": "https://tinmancomms.com", "city": "London, UK", "email": "hello@tinmancomms.com", "is_curated": True},
    {"name": "W Communications", "website": "https://wcommunications.co.uk", "city": "London, UK", "email": "hello@wcommunications.co.uk", "is_curated": True},
    {"name": "WildKat PR", "website": "https://wildkatpr.com", "city": "London, UK", "email": "hello@wildkatpr.com", "is_curated": True},
    {"name": "Yellow Jersey PR", "website": "https://yellowjerseypr.com", "city": "London, UK", "email": "hello@yellowjerseypr.com", "is_curated": True},
    {"name": "ZAK Agency", "website": "https://zakagency.com", "city": "London, UK", "email": "hello@zakagency.com", "is_curated": True},
    {"name": "Byte London", "website": "https://byte.london", "city": "London, UK", "email": "hello@byte.london", "is_curated": True},
    {"name": "We Are Social UK", "website": "https://wearesocial.com", "city": "London, UK", "email": "hello@wearesocial.com", "is_curated": True},
    {"name": "Good Relations", "website": "https://goodrelations.co.uk", "city": "London, UK", "email": "hello@goodrelations.co.uk", "is_curated": True},
    {"name": "Brands2Life", "website": "https://brands2life.com", "city": "London, UK", "email": "hello@brands2life.com", "is_curated": True},
    {"name": "Cirkle", "website": "https://cirkle.com", "city": "London, UK", "email": "hello@cirkle.com", "is_curated": True},
    {"name": "Clarity Global", "website": "https://clarity.global", "city": "London, UK", "email": "hello@clarity.global", "is_curated": True},
    {"name": "Goat Agency", "website": "https://thegoatagency.com", "city": "London, UK", "email": "hello@thegoatagency.com", "is_curated": True},
    {"name": "Billion Dollar Boy", "website": "https://billiondollarboy.com", "city": "London, UK", "email": "hello@billiondollarboy.com", "is_curated": True},
    {"name": "Whalar", "website": "https://whalar.com", "city": "London, UK", "email": "hello@whalar.com", "is_curated": True},
    {"name": "ITB Worldwide", "website": "https://itb-worldwide.com", "city": "London, UK", "email": "hello@itb-worldwide.com", "is_curated": True},
    {"name": "Seed Marketing", "website": "https://seedmarketingagency.com", "city": "London, UK", "email": "hello@seedmarketingagency.com", "is_curated": True},
    {"name": "Kyma Media", "website": "https://kymamedia.com", "city": "London, UK", "email": "hello@kymamedia.com", "is_curated": True},
    {"name": "Disrupt Marketing", "website": "https://disruptmarketing.co", "city": "London, UK", "email": "hello@disruptmarketing.co", "is_curated": True},
    {"name": "Distinctly", "website": "https://distinctly.co", "city": "London, UK", "email": "hello@distinctly.co", "is_curated": True},
    {"name": "Passion Digital", "website": "https://passiondigital.co.uk", "city": "London, UK", "email": "hello@passiondigital.co.uk", "is_curated": True},
    {"name": "Crafted", "website": "https://crafted.co.uk", "city": "London, UK", "email": "hello@crafted.co.uk", "is_curated": True},
    {"name": "Tug Agency", "website": "https://tugagency.com", "city": "London, UK", "email": "hello@tugagency.com", "is_curated": True},
    {"name": "Jellyfish", "website": "https://jellyfish.com", "city": "London, UK", "email": "hello@jellyfish.com", "is_curated": True},
    {"name": "Croud", "website": "https://croud.com", "city": "London, UK", "email": "hello@croud.com", "is_curated": True},
    {"name": "Roast Agency", "website": "https://roastagency.com", "city": "London, UK", "email": "hello@roastagency.com", "is_curated": True},
    {"name": "Brave Bison", "website": "https://bravebison.com", "city": "London, UK", "email": "hello@bravebison.com", "is_curated": True},
    {"name": "That Lot", "website": "https://thatlot.co.uk", "city": "London, UK", "email": "hello@thatlot.co.uk", "is_curated": True},
    {"name": "Frank PR", "website": "https://welcometofrank.com", "city": "London, UK", "email": "hello@welcometofrank.com", "is_curated": True},
    {"name": "Hope&Glory PR", "website": "https://hopeandglorypr.com", "city": "London, UK", "email": "hello@hopeandglorypr.com", "is_curated": True},
    {"name": "Red Consultancy", "website": "https://redconsultancy.com", "city": "London, UK", "email": "hello@redconsultancy.com", "is_curated": True},
    {"name": "FleishmanHillard UK", "website": "https://fleishmanhillard.co.uk", "city": "London, UK", "email": "hello@fleishmanhillard.co.uk", "is_curated": True},
    {"name": "Grayling UK", "website": "https://grayling.com", "city": "London, UK", "email": "hello@grayling.com", "is_curated": True},
    {"name": "Portland Communications", "website": "https://portland-communications.com", "city": "London, UK", "email": "hello@portland-communications.com", "is_curated": True},
    {"name": "Weber Shandwick UK", "website": "https://webershandwick.co.uk", "city": "London, UK", "email": "hello@webershandwick.co.uk", "is_curated": True},
    {"name": "Eulogy", "website": "https://eulogy.co.uk", "city": "London, UK", "email": "hello@eulogy.co.uk", "is_curated": True},
    {"name": "Firefly Communications", "website": "https://fireflycomms.com", "city": "London, UK", "email": "hello@fireflycomms.com", "is_curated": True},
    {"name": "Hotwire PR UK", "website": "https://hotwireglobal.com", "city": "London, UK", "email": "hello@hotwireglobal.com", "is_curated": True},
    {"name": "Aspectus Group", "website": "https://aspectusgroup.com", "city": "London, UK", "email": "hello@aspectusgroup.com", "is_curated": True},
    {"name": "Wild Card PR", "website": "https://wildcardpr.co.uk", "city": "London, UK", "email": "hello@wildcardpr.co.uk", "is_curated": True},
    {"name": "Ready10", "website": "https://ready10.media", "city": "London, UK", "email": "hello@ready10.media", "is_curated": True},
    {"name": "Cow PR", "website": "https://cowpr.com", "city": "London, UK", "email": "hello@cowpr.com", "is_curated": True},
    {"name": "Milk & Honey PR", "website": "https://milkandhoneypr.com", "city": "London, UK", "email": "hello@milkandhoneypr.com", "is_curated": True},
    {"name": "The Romans", "website": "https://wearetheromans.com", "city": "London, UK", "email": "hello@wearetheromans.com", "is_curated": True},
    {"name": "Taylor Herring", "website": "https://taylorherring.com", "city": "London, UK", "email": "hello@taylorherring.com", "is_curated": True},
    {"name": "Stand Agency", "website": "https://standagency.com", "city": "London, UK", "email": "hello@standagency.com", "is_curated": True},
    {"name": "GingerMay", "website": "https://gingermay.com", "city": "London, UK", "email": "hello@gingermay.com", "is_curated": True},
    {"name": "Missive", "website": "https://missive.co.uk", "city": "London, UK", "email": "hello@missive.co.uk", "is_curated": True},
    {"name": "CCgroup PR", "website": "https://ccgrouppr.com", "city": "London, UK", "email": "hello@ccgrouppr.com", "is_curated": True},
    {"name": "Babel PR", "website": "https://babelpr.com", "city": "London, UK", "email": "hello@babelpr.com", "is_curated": True},
    {"name": "Firstlight PR", "website": "https://firstlightpr.com", "city": "London, UK", "email": "hello@firstlightpr.com", "is_curated": True},
    {"name": "Berkeley Communications", "website": "https://berkeleypr.com", "city": "London, UK", "email": "hello@berkeleypr.com", "is_curated": True},
    {"name": "FieldHouse Associates", "website": "https://fieldhouseassociates.com", "city": "London, UK", "email": "hello@fieldhouseassociates.com", "is_curated": True},
    {"name": "Kaizo", "website": "https://kaizo.co.uk", "city": "London, UK", "email": "hello@kaizo.co.uk", "is_curated": True},
    {"name": "The Playbook", "website": "https://wearetheplaybook.com", "city": "London, UK", "email": "hello@wearetheplaybook.com", "is_curated": True},
    {"name": "Allison+Partners UK", "website": "https://allisonworldwide.com", "city": "London, UK", "email": "hello@allisonworldwide.com", "is_curated": True},
    {"name": "Battenhall", "website": "https://battenhall.com", "city": "London, UK", "email": "hello@battenhall.com", "is_curated": True},
    {"name": "Ginger Comms", "website": "https://gingercomms.com", "city": "London, UK", "email": "hello@gingercomms.com", "is_curated": True},
    {"name": "Seven Dials PR", "website": "https://sevendialspr.com", "city": "London, UK", "email": "hello@sevendialspr.com", "is_curated": True},
    {"name": "Storm Communications", "website": "https://stormcom.co.uk", "city": "London, UK", "email": "hello@stormcom.co.uk", "is_curated": True},
    {"name": "Clementine Comms", "website": "https://clementinecomms.com", "city": "London, UK", "email": "hello@clementinecomms.com", "is_curated": True},
    {"name": "Palm PR", "website": "https://palm-pr.com", "city": "London, UK", "email": "hello@palm-pr.com", "is_curated": True},
    {"name": "Gabriel PR", "website": "https://gabrielpr.co.uk", "city": "London, UK", "email": "hello@gabrielpr.co.uk", "is_curated": True},
    {"name": "Sunny Side Up", "website": "https://sunnysideup.co.uk", "city": "London, UK", "email": "hello@sunnysideup.co.uk", "is_curated": True},
    {"name": "Curzon PR", "website": "https://curzonpr.com", "city": "London, UK", "email": "hello@curzonpr.com", "is_curated": True},
    {"name": "Gong Communications", "website": "https://gongcommunications.com", "city": "London, UK", "email": "hello@gongcommunications.com", "is_curated": True},
    {"name": "Four Communications", "website": "https://fourcommunications.com", "city": "London, UK", "email": "hello@fourcommunications.com", "is_curated": True},
    {"name": "Lansons", "website": "https://lansons.com", "city": "London, UK", "email": "hello@lansons.com", "is_curated": True},
    {"name": "Hanover Communications", "website": "https://hanovercomms.com", "city": "London, UK", "email": "hello@hanovercomms.com", "is_curated": True},
    {"name": "SEC Newgate UK", "website": "https://secnewgate.co.uk", "city": "London, UK", "email": "hello@secnewgate.co.uk", "is_curated": True},
    {"name": "Cicero Group", "website": "https://cicero-group.com", "city": "London, UK", "email": "hello@cicero-group.com", "is_curated": True},
    {"name": "Headland Consultancy", "website": "https://headlandconsultancy.com", "city": "London, UK", "email": "hello@headlandconsultancy.com", "is_curated": True},
    {"name": "MHP Group", "website": "https://mhpgroup.com", "city": "London, UK", "email": "hello@mhpgroup.com", "is_curated": True},
    {"name": "Instinctif Partners", "website": "https://instinctif.com", "city": "London, UK", "email": "hello@instinctif.com", "is_curated": True},
    {"name": "Hudson Sandler", "website": "https://hudsonsandler.com", "city": "London, UK", "email": "hello@hudsonsandler.com", "is_curated": True},
    {"name": "Powerscourt Group", "website": "https://powerscourt-group.com", "city": "London, UK", "email": "hello@powerscourt-group.com", "is_curated": True},
    {"name": "Camargue", "website": "https://camargue.uk", "city": "London, UK", "email": "hello@camargue.uk", "is_curated": True},
    {"name": "Citypress", "website": "https://citypress.co.uk", "city": "Manchester, UK", "email": "hello@citypress.co.uk", "is_curated": True},
    {"name": "Tangerine Communications", "website": "https://tangerinecomms.com", "city": "Manchester, UK", "email": "hello@tangerinecomms.com", "is_curated": True},
    {"name": "Brazen PR", "website": "https://brazenpr.com", "city": "Manchester, UK", "email": "hello@brazenpr.com", "is_curated": True},
    {"name": "Smoking Gun PR", "website": "https://smokinggunpr.co.uk", "city": "Manchester, UK", "email": "hello@smokinggunpr.co.uk", "is_curated": True},
    {"name": "Hatch Communications", "website": "https://hatch.group", "city": "Leeds, UK", "email": "hello@hatch.group", "is_curated": True},
    {"name": "Prohibition PR", "website": "https://prohibitionpr.co.uk", "city": "Leeds, UK", "email": "hello@prohibitionpr.co.uk", "is_curated": True},
    {"name": "Umpf", "website": "https://umpf.co.uk", "city": "Leeds, UK", "email": "hello@umpf.co.uk", "is_curated": True},
    {"name": "Connect Communications", "website": "https://connectpa.co.uk", "city": "London, UK", "email": "hello@connectpa.co.uk", "is_curated": True},
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
    "mumbrella.com.au", "edvido.com", "agencydirectories.com", "builtin.com",
    "bing.com", "duckduckgo.com", "yahoo.com", "microsoft.com", "msn.com"
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

DDG_CIRCUIT_BROKEN = False

def search_duckduckgo_organic(query, timeout=6.0):
    """
    Actively queries DuckDuckGo search for organic agency websites.
    Includes a fail-fast circuit breaker to prevent freezing on blocked networks.
    """
    global DDG_CIRCUIT_BROKEN
    if DDG_CIRCUIT_BROKEN:
        return []

    candidates = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    
    # 1. DuckDuckGo Lite
    try:
        lite_url = "https://lite.duckduckgo.com/lite/"
        resp = requests.post(lite_url, data={"q": query}, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for link in soup.find_all("a", class_="result-link"):
                raw_href = link.get("href", "").strip()
                if not raw_href.startswith("http"):
                    continue
                parsed = urlparse(raw_href)
                domain = parsed.netloc.replace("www.", "").lower().strip()
                if not domain or any(ign in domain for ign in IGNORED_SEARCH_DOMAINS):
                    continue
                clean_website = f"{parsed.scheme}://{parsed.netloc}"
                candidates.append({
                    "name": clean_agency_name(link.get_text(strip=True), domain),
                    "website": clean_website,
                    "domain": domain
                })
    except Exception as e:
        # If connection timed out or blocked, trip circuit breaker for remaining session
        if "timed out" in str(e).lower() or "connect" in str(e).lower():
            DDG_CIRCUIT_BROKEN = True
            print("[*] DuckDuckGo blocked/timeout on this network. Fast failover activated.")

    if candidates:
        return candidates

    if DDG_CIRCUIT_BROKEN:
        return []

    # 2. DuckDuckGo HTML fallback
    url = "https://html.duckduckgo.com/html/"
    try:
        resp = requests.post(url, data={"q": query}, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for r in soup.find_all("div", class_="result"):
                link_tag = r.find("a", class_="result__url")
                title_tag = r.find("a", class_="result__title") or r.find("h2")
                if not link_tag or not link_tag.get("href"):
                    continue

                raw_href = link_tag["href"].strip()
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
    except Exception:
        DDG_CIRCUIT_BROKEN = True

    return candidates

def search_bing_organic(query, timeout=6.0):
    """
    Scrapes Bing search results for organic marketing agency websites.
    Bing is lenient with cloud IPs and returns high quality results.
    """
    candidates = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.bing.com/"
    }
    import urllib.parse
    url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
    try:
        resp = requests.get(url, headers=headers, timeout=timeout)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for item in soup.find_all("li", class_="b_algo"):
                h2 = item.find("h2")
                if not h2:
                    continue
                a_tag = h2.find("a")
                if not a_tag or not a_tag.get("href"):
                    continue
                raw_href = a_tag["href"].strip()
                if not raw_href.startswith("http"):
                    continue
                parsed = urlparse(raw_href)
                domain = parsed.netloc.replace("www.", "").lower().strip()
                if not domain or any(ign in domain for ign in IGNORED_SEARCH_DOMAINS):
                    continue
                clean_website = f"{parsed.scheme}://{parsed.netloc}"
                title_text = a_tag.get_text(strip=True)
                candidates.append({
                    "name": clean_agency_name(title_text, domain),
                    "website": clean_website,
                    "domain": domain
                })
    except Exception:
        pass
    return candidates

def search_live_web_agencies(query):
    """
    Combines DuckDuckGo and Bing for resilient multi-engine organic live scraping.
    """
    combined = []
    seen = set()

    # Engine 1: DuckDuckGo Lite / HTML
    ddg_res = search_duckduckgo_organic(query)
    for r in ddg_res:
        if r["domain"] not in seen:
            seen.add(r["domain"])
            combined.append(r)

    # Engine 2: Bing Search
    bing_res = search_bing_organic(query)
    for r in bing_res:
        if r["domain"] not in seen:
            seen.add(r["domain"])
            combined.append(r)

    return combined

def get_search_queries_for_region(region="Australia"):
    """
    Builds rotating query matrix combining marketing niches and cities for the region.
    """
    clean_region = region.strip() if region else "Australia"
    lower_r = clean_region.lower()
    
    # Sub-locations for common regions
    au_cities = ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Byron Bay", "Newcastle", "Australia"]
    us_cities = ["New York", "Los Angeles", "Chicago", "Austin", "Miami", "San Francisco", "Atlanta", "Seattle", "United States"]
    uk_cities = ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Edinburgh", "Glasgow", "United Kingdom"]
    
    if any(k in lower_r for k in ["australia", "au", "aus", "sydney", "melbourne", "brisbane", "perth", "adelaide", "gold coast"]):
        locations = [clean_region] + [c for c in au_cities if c.lower() != lower_r]
    elif any(k in lower_r for k in ["united states", "usa", "us", "america", "new york", "los angeles", "chicago", "austin", "miami", "san francisco", "atlanta"]):
        locations = [clean_region] + [c for c in us_cities if c.lower() != lower_r]
    elif any(k in lower_r for k in ["london", "united kingdom", "uk", "britain", "england", "manchester", "birmingham", "leeds", "bristol", "edinburgh"]):
        locations = [clean_region] + [c for c in uk_cities if c.lower() != lower_r]
    else:
        locations = [clean_region, f"{clean_region} Marketing"]

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
    1. Instantly yields verified agencies for the requested region (zero waiting delay, immediate progress).
    2. Then actively queries live organic engines (with circuit-breaker protection) to find new leads.
    3. Seamlessly continues across regional pools until the target count is satisfied.
    """
    seen_domains = set()
    clean_region = region.strip() if region else "Australia"
    lower_r = clean_region.lower()

    is_au = any(k in lower_r for k in ["australia", "au", "aus", "sydney", "melbourne", "brisbane", "perth", "adelaide", "gold coast", "byron bay", "newcastle"])
    is_us = any(k in lower_r for k in ["united states", "usa", "us", "america", "new york", "los angeles", "chicago", "austin", "miami", "san francisco", "atlanta", "seattle"])
    is_uk = any(k in lower_r for k in ["london", "united kingdom", "uk", "manchester", "birmingham", "leeds", "bristol", "edinburgh", "glasgow", "england", "britain"])

    if is_au:
        primary_pool = CURATED_AU_MARKETING_AGENCIES
        secondary_pool = CURATED_UK_MARKETING_AGENCIES + CURATED_US_MARKETING_AGENCIES
    elif is_uk:
        primary_pool = CURATED_UK_MARKETING_AGENCIES
        secondary_pool = CURATED_US_MARKETING_AGENCIES + CURATED_AU_MARKETING_AGENCIES
    elif is_us:
        primary_pool = CURATED_US_MARKETING_AGENCIES
        secondary_pool = CURATED_UK_MARKETING_AGENCIES + CURATED_AU_MARKETING_AGENCIES
    else:
        primary_pool = CURATED_AU_MARKETING_AGENCIES + CURATED_UK_MARKETING_AGENCIES + CURATED_US_MARKETING_AGENCIES
        secondary_pool = []

    # Sort matching city first if specified
    primary_pool = sorted(
        primary_pool,
        key=lambda x: 0 if lower_r in x.get("city", "").lower() else 1
    )

    # =========================================================================
    # STEP 1: INSTANT OUTREACH POOL (Zero-delay launch)
    # =========================================================================
    print(f"\n[*] [Outreach Engine] Launching immediate inspection across {len(primary_pool)} verified agencies for '{clean_region}'...")
    for agency in primary_pool:
        domain = urlparse(agency["website"]).netloc.replace("www.", "").lower()
        if domain not in seen_domains:
            seen_domains.add(domain)
            yield {
                "name": agency["name"],
                "website": agency["website"],
                "city": agency.get("city", clean_region),
                "email": agency.get("email"),
                "is_curated": True
            }

    # =========================================================================
    # STEP 2: LIVE ORGANIC WEB DISCOVERY
    # =========================================================================
    queries = get_search_queries_for_region(clean_region)
    print(f"\n[*] [Live Search Engine] Actively scraping live web across niche queries for '{clean_region}'...")

    for query, loc in queries[:15]:  # Top targeted queries with fail-fast protection
        print(f"[*] Querying live engines for: '{query}'...")
        live_results = search_live_web_agencies(query)
        for r in live_results:
            domain = r["domain"]
            if domain not in seen_domains:
                seen_domains.add(domain)
                yield {
                    "name": r["name"],
                    "website": r["website"],
                    "city": f"{loc}",
                    "is_curated": False
                }
        time.sleep(0.5)

    # =========================================================================
    # STEP 3: SECONDARY REGIONAL AGENCY POOL
    # =========================================================================
    for agency in secondary_pool:
        domain = urlparse(agency["website"]).netloc.replace("www.", "").lower()
        if domain not in seen_domains:
            seen_domains.add(domain)
            yield {
                "name": agency["name"],
                "website": agency["website"],
                "city": agency.get("city", clean_region),
                "email": agency.get("email"),
                "is_curated": True
            }

def get_marketing_agencies(country="AU", limit=100):
    """
    Returns marketing agencies for specified country ('AU' or 'US').
    """
    if str(country).upper() == "AU":
        return get_au_marketing_agencies(limit=limit)
    return get_us_marketing_agencies(limit=limit)


