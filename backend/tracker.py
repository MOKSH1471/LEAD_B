import os
import csv
from datetime import datetime
from urllib.parse import urlparse
import config

def get_domain(url_or_email):
    """Extract clean root domain from URL or email to prevent duplicate company outreach."""
    if not url_or_email:
        return ""
    if "@" in url_or_email:
        return url_or_email.split("@")[-1].lower().strip()
    try:
        netloc = urlparse(url_or_email).netloc
        if not netloc:
            netloc = urlparse("https://" + url_or_email).netloc
        domain = netloc.lower().replace("www.", "").strip()
        return domain
    except Exception:
        return url_or_email.lower().strip()

class LeadTracker:
    def __init__(self):
        self._init_files()

    def _init_files(self):
        if not os.path.exists(config.LEADS_DISCOVERED_CSV):
            with open(config.LEADS_DISCOVERED_CSV, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "agency_name", "website", "domain", "city", 
                    "email", "instagram", "specialties", "offers_web", "date_discovered"
                ])

        if not os.path.exists(config.LEADS_SENT_CSV):
            with open(config.LEADS_SENT_CSV, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "agency_name", "website", "domain", "email", 
                    "instagram", "subject", "date_sent", "status"
                ])

    def get_already_contacted_domains_and_emails(self):
        """Returns set of domains and emails that have already been sent an email."""
        contacted = set()
        if os.path.exists(config.LEADS_SENT_CSV):
            with open(config.LEADS_SENT_CSV, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get("email"):
                        contacted.add(row["email"].lower().strip())
                    if row.get("domain"):
                        contacted.add(row["domain"].lower().strip())
        return contacted

    def get_discovered_leads(self):
        """Reads all discovered leads."""
        leads = []
        if os.path.exists(config.LEADS_DISCOVERED_CSV):
            with open(config.LEADS_DISCOVERED_CSV, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    leads.append(row)
        return leads

    def save_discovered_lead(self, agency_name, website, city, email, instagram, specialties, offers_web):
        """Saves a new discovered multimedia lead."""
        domain = get_domain(website or email)
        already_saved_domains = set()
        
        if os.path.exists(config.LEADS_DISCOVERED_CSV):
            with open(config.LEADS_DISCOVERED_CSV, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    already_saved_domains.add(row.get("domain", "").lower().strip())

        if domain and domain in already_saved_domains:
            return False

        with open(config.LEADS_DISCOVERED_CSV, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                agency_name,
                website,
                domain,
                city,
                email,
                instagram,
                ", ".join(specialties) if isinstance(specialties, list) else str(specialties),
                "YES" if offers_web else "NO",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ])
        return True

    def mark_lead_sent(self, agency_name, website, email, instagram, subject):
        """Logs an outreach email sent."""
        domain = get_domain(website or email)
        with open(config.LEADS_SENT_CSV, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                agency_name,
                website,
                domain,
                email,
                instagram,
                subject,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "sent"
            ])

    def get_stats(self):
        discovered = len(self.get_discovered_leads())
        contacted = len(self.get_already_contacted_domains_and_emails())
        return {
            "total_discovered": discovered,
            "total_contacted": contacted
        }
