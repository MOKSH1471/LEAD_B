import os
from dotenv import load_dotenv

# Ensure .env is always loaded from the directory where config.py lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
env_file = os.path.join(BASE_DIR, ".env")
load_dotenv(dotenv_path=env_file, override=True)

# SMTP Configuration (Secureserver / GoDaddy / Titan)
SMTP_HOST = os.getenv("SMTP_HOST", "smtpout.secureserver.net").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))
SMTP_USER = os.getenv("SMTP_USER", "studio@galileoandduke.com").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()

# Resend HTTP Email API (Recommended for Render & Cloud - uses HTTPS port 443)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "").strip()

# Sender Information
SENDER_NAME = os.getenv("SENDER_NAME", "Moksh | Galileo & Duke").strip()
SENDER_EMAIL = SMTP_USER
REPLY_TO = os.getenv("REPLY_TO", "studio@galileoandduke.com").strip()

# Portfolio & Branding
STUDIO_NAME = "Galileo & Duke"
STUDIO_URL = "https://www.galileoandduke.com"
FOUNDERS = "Moksh & Varul"

# Safeguards to protect your domain & email reputation
DAILY_SEND_LIMIT = int(os.getenv("DAILY_SEND_LIMIT", 30))
MIN_DELAY_SECONDS = int(os.getenv("MIN_DELAY_SECONDS", 35))
MAX_DELAY_SECONDS = int(os.getenv("MAX_DELAY_SECONDS", 65))
IGNORE_INFO_EMAILS = os.getenv("IGNORE_INFO_EMAILS", "true").lower() in ("true", "1", "yes")

# Target Market & Subject Configuration
TARGET_COUNTRY = os.getenv("TARGET_COUNTRY", "AU").upper().strip()
EMAIL_SUBJECT_TEMPLATE = os.getenv("EMAIL_SUBJECT_TEMPLATE", "Enquiry for {agency_name}").strip()

# Gemini AI Custom Pitch Generation (Optional free tier key)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest").strip()

# File paths
DATA_DIR = BASE_DIR
LEADS_DISCOVERED_CSV = os.path.join(DATA_DIR, "leads_discovered.csv")
LEADS_SENT_CSV = os.path.join(DATA_DIR, "leads_sent.csv")
