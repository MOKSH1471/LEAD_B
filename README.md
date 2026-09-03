# Galileo & Duke Lead-Gen Bot

An automated prospecting and cold-outreach tool designed for freelance web designers and local agency consultants. 

Given a **business niche** and a **region**, it automatically:
1. Discovers local businesses via **OpenStreetMap (100% Free, no keys/cards required)** or **Google Places API**.
2. Checks if each business has an active, live website (filters out dead or parked domains).
3. If no website or no email is found → logs the business with phone & address to `call_list.csv` for manual phone outreach.
4. If a live website + email is found → scrapes the site content, uses **Google Gemini 2.0 Flash** to generate concrete, high-converting improvement pointers, drafts a natural 1-on-1 freelancer outreach email, and delivers (or previews) the email via **Gmail SMTP**.
5. Maintains a deduplication ledger in `contacted.json` so you never double-contact a business.

---

## 📋 Prerequisites

- **Node.js**: v18.0.0 or higher
- **Gemini API Key** (100% Free): Get yours in 10 seconds from [Google AI Studio](https://aistudio.google.com/) (Sign in with any Google account — **No credit card required**).
- **Gmail App Password** *(Only if sending real live emails)*: Enable 2-Step Verification in your Google Account, then generate an App Password under Security.
- *(Optional)* **Google Places API Key**: Only needed if you explicitly switch `SEARCH_PROVIDER=google`.

---

## 🚀 Quick Start (No Credit Card / No Google Cloud Required)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file (or copy `.env.example`):
```bash
cp .env.example .env
```

Edit `.env`:

```ini
# Search Provider: 'osm' is 100% FREE and requires no credit card or API key
SEARCH_PROVIDER=osm

# Gemini API Key (100% Free from https://aistudio.google.com/)
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere

# Sender Identity (Freelancer First-Person)
FROM_NAME=Your Name

# Target Prospecting Parameters
NICHE=dentists
REGION=Austin, TX
MAX_RESULTS=20

# Safety Controls
DRY_RUN=true
EMAIL_DELAY_MS=30000
```

### 3. Run the Bot
```bash
npm start
```

---

## 🛡️ Safety Rails & Modes

- **Dry Run Mode (`DRY_RUN=true`)**:
  - Enabled by default!
  - No emails are actually sent. The bot will print full draft previews to the console and log them to `results.csv`.
- **Live Mode (`DRY_RUN=false`)**:
  - Live outreach emails are sent through your Gmail account.
  - Automatically respects `EMAIL_DELAY_MS` (default 30 seconds) between sends to protect your inbox reputation and stay within Gmail sending caps.
- **Deduplication (`contacted.json`)**:
  - Tracks processed businesses by their `place_id`.
  - Re-running the script on the same region will safely skip previously processed leads.

---

## 📁 Output Files

| File | Description |
|---|---|
| `results.csv` | Full audit log of all processed businesses: name, address, phone, website, status (`sent`, `dry_run_preview`, `call_list_*`, `error`), and notes/pointers. |
| `call_list.csv` | Clean list of qualified leads for manual calling (no website or no discoverable email) including phone numbers and address. |
| `contacted.json` | JSON ledger preventing duplicate outreach across runs. |

---

## 🏗️ Project Architecture

```
bot/
├── src/
│   ├── config.js         # Loads & validates .env settings
│   ├── osmSearch.js      # OpenStreetMap Overpass search (100% free / no keys needed)
│   ├── placesSearch.js   # Google Places Text Search + Details enrichment (optional)
│   ├── websiteCheck.js   # Liveness check, HTML parsing, email regex & mailto extraction
│   ├── analyzer.js       # Gemini 2.0 Flash site analysis & custom email generation
│   ├── emailTemplates.js # Fallback email templates if AI service is unavailable
│   ├── emailSender.js    # Nodemailer Gmail SMTP sender with throttling
│   ├── tracker.js        # Manages dedupe ledger and CSV writing
│   └── index.js          # Main pipeline orchestrator
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
