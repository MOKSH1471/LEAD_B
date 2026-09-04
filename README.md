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
  - Tracks processed businesses by `place_id` and unique `email`.
  - Re-running on the same region will safely skip previously processed leads.
- **Automated Multi-Stage Follow-Ups**:
  - **Stage 1 (Gentle Bump)**: Sent 3 days after initial email if no response received.
  - **Stage 2 (Final Breakup)**: Sent 4 days after Stage 1 (7 days total). Halts further contact automatically.
  - Preserves email subject threading (`Re: ...`).
- **Instant Response Alert & Follow-Up Suppression**:
  - Automatically detects replies via IMAP.
  - Instantly halts all future follow-ups for that prospect and fires an alert with message preview to your Telegram.
- **24/7 Autonomous Autopilot**:
  - Rotates through target niches and regions, performing client discovery, website inspection, initial email sending, and follow-up sweeps continuously on schedule.

---

## 🤖 Telegram Bot & Command Center

Run the Telegram Bot locally:
```bash
npm run telegram
```

| Command | Action |
|---|---|
| `/autopilot on` | Starts 24/7 background client prospecting & follow-ups |
| `/autopilot off` | Stops autopilot |
| `/autopilot status` | Shows current schedule, next run time, and target cities |
| `/followups` | Shows real-time queue breakdown (leads waiting for Stage 1/2) |
| `/followups run` | Manually triggers an immediate follow-up sweep |
| `/run <niche> in <city> [count]` | Launches a manual search campaign |
| `/replies` | Displays all prospect responses received |
| `/status` | Complete ledger, queue, and system status |
| `/dryrun [on\|off]` | Toggles between preview and live sending mode |

---

## 📁 Output Files

| File | Description |
|---|---|
| `results.csv` | Full audit log of all processed businesses: name, address, phone, website, status (`sent`, `followup_1_sent`, `dry_run_preview`, etc.), and notes/pointers. |
| `call_list.csv` | Clean list of qualified leads for manual calling (no website or no discoverable email) including phone numbers and address. |
| `contacted.json` | JSON ledger tracking contacted businesses, email stages, and reply statuses. |
| `replies.json` | Captured replies from prospects with snippets, timestamps, and sender details. |

---

## 🏗️ Project Architecture

```
bot/
├── src/
│   ├── config.js         # Loads & validates .env settings (follow-ups, autopilot, search)
│   ├── osmSearch.js      # OpenStreetMap Overpass search (100% free / no keys needed)
│   ├── placesSearch.js   # Google Places Text Search + Details enrichment (optional)
│   ├── websiteCheck.js   # Liveness check, HTML parsing, email regex & mailto extraction
│   ├── analyzer.js       # Gemini 2.0 Flash site analysis & custom email generation
│   ├── followUpEngine.js # Multi-stage follow-up generation & sweep execution
│   ├── autopilot.js      # 24/7 autonomous lead search & follow-up scheduler
│   ├── replyTracker.js   # IMAP background reply polling & instant alerts
│   ├── telegramBot.js    # Telegram Bot interactive command center
│   ├── emailTemplates.js # Fallback email templates if AI service is unavailable
│   ├── emailSender.js    # Nodemailer Gmail SMTP sender with throttling
│   ├── tracker.js        # Manages dedupe ledger, follow-up queue, and CSV writing
│   └── index.js          # Main pipeline orchestrator
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
