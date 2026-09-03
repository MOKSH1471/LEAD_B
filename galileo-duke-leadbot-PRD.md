# PRD — Galileo & Duke Lead-Gen Bot

## 1. Overview

An internal tool for Galileo & Duke that automates cold-outreach prospecting. Given a **business niche** and a **US region**, it finds local businesses, determines whether each has a website, and takes one of two paths:

- **No website** → business is added to a **call list** (no email address is discoverable via this method — see §4.1).
- **Has website** → the site is scraped and analyzed by an AI model, which generates specific, concrete improvement pointers. A personalized outreach email is drafted using those pointers and sent (or queued in dry-run mode).

Goal: turn a niche + region into a ready-to-work pipeline of qualified leads with minimal manual research.

## 2. Outreach Positioning

Outreach is sent as an **individual freelancer**, not as "Galileo & Duke" the agency. For cold first-touch emails to small local businesses, freelancer framing reads as cheaper, more personal, and more likely to get a reply than an agency pitch. Galileo & Duke may still be the entity that delivers the work once a lead converts, but it is not the headline of the outreach.

Implications for the system:
- **Sender identity** — emails go out under the operator's own name, not "Galileo & Duke."
- **Voice** — first-person ("I noticed your site...", "I can help you..."), not "we/our team."
- **Agency mention** — optional, soft credibility line only if included (e.g., "I build sites through a small studio I co-run") — never the primary framing.
- **Sign-off** — operator's name, phone/contact — not a company signature block.

## 3. Goals / Non-Goals

**Goals**
- Automate discovery of businesses in a niche/region via Google Places.
- Reliably detect whether a business has a live, real website (not parked/expired domains).
- Produce genuinely specific (not generic/templated-sounding) improvement pointers per site.
- Auto-send outreach emails with safety rails (dry-run, rate limits, dedupe).
- Never double-contact the same business across runs.

**Non-Goals**
- Not a full CRM — no pipeline stages, follow-up sequencing, or reply tracking in v1.
- Not guaranteed to find every business's email — sites without a discoverable email go to the call list, not a guessed address.
- Not a scraper that bypasses Google ToS — uses official Places API only.

## 4. Key Constraints

### 4.1 Email address availability
Google Places API returns name, address, phone, rating, and website — **not email**. Consequences:
- Businesses **without a website** have no available email path in this system → routed to `call_list.csv` (name, phone, address) for manual outreach.
- Businesses **with a website but no discoverable email** (no mailto link, no visible contact-page email) → also routed to the call list, tagged `has_site_no_email`.
- Only businesses with a **verifiable scraped email** get an automated email.

### 4.2 Sending limits & deliverability
- Gmail SMTP caps around ~500 sends/day on a standard account.
- Delay between sends (default 30s) to avoid spam-pattern flags.
- All sends default to **dry run** until explicitly disabled.

### 4.3 Rate & cost limits
- Google Places API: paid per request beyond free credit ($200/mo credit typically covers a single niche+region run comfortably; large `MAX_RESULTS` or many regions can exceed it).
- Gemini API: free tier has per-minute/per-day request caps — large batches need throttling.

## 5. User Flow

1. Operator sets `.env`: niche, region, max results, dry-run flag.
2. Script runs `npm start`.
3. For each business found:
   a. Look up Place Details (phone, website, rating).
   b. If no website → log to call list. Done.
   c. If website exists → fetch page, verify it's live/real.
      - Dead/parked domain → treat as "no website" (call list).
      - Live site → extract visible text + look for email.
        - No email found → call list, tagged.
        - Email found → send to analyzer.
4. Analyzer (Gemini) reads site text + niche context, returns:
   - 3–5 specific improvement pointers (e.g., "no mobile nav menu," "contact form has no confirmation state," "hero image is a stock photo unrelated to the service").
   - A short, non-generic email draft referencing 1–2 of those pointers.
5. Email sender sends (or logs, if dry-run) with delay between sends.
6. Every outcome — sent, dry-run-logged, call-list, skipped/error — is written to `results.csv`. Contacted businesses are recorded in `contacted.json` keyed by Google `place_id` to prevent duplicate contact on future runs.

## 6. System Components

| Component | Responsibility |
|---|---|
| `config.js` | Load & validate `.env` (API keys, niche, region, dry-run, rate limits) |
| `placesSearch.js` | Google Places Text Search + Place Details, pagination |
| `websiteCheck.js` | Fetch site, verify liveness, extract text + contact email |
| `analyzer.js` | Gemini API call — site analysis + email draft generation |
| `emailTemplates.js` | Static fallback templates if Gemini analysis fails |
| `emailSender.js` | Nodemailer over Gmail SMTP, rate-limited sends |
| `tracker.js` | Dedupe (`contacted.json`), output logs (`results.csv`, `call_list.csv`) |
| `index.js` | Orchestrates the full run |

## 7. Outputs

- **`results.csv`** — every business processed: name, address, phone, website (y/n), status (sent / dry-run / call-list / error), timestamp.
- **`call_list.csv`** — name, phone, address, reason (`no_website` / `has_site_no_email`).
- **`contacted.json`** — dedupe ledger, keyed by `place_id`.
- **Console log** — live progress per business.

## 8. Configuration (.env)

```
GOOGLE_PLACES_API_KEY=
GEMINI_API_KEY=
GMAIL_USER=
GMAIL_APP_PASSWORD=
FROM_NAME=Galileo & Duke
NICHE=dentists
REGION=Austin, TX
MAX_RESULTS=20
DRY_RUN=true
EMAIL_DELAY_MS=30000
```

## 9. Safety Rails

- `DRY_RUN=true` by default — no email leaves the system until explicitly turned off.
- Rate limiting on both Gemini calls and email sends.
- Dedupe ledger prevents re-emailing the same business across runs.
- Website liveness check prevents false "has a website" classification on dead/parked domains.

## 10. Open Questions / Future Scope

- Should call-list businesses also get a **secondary email lookup** pass (e.g., checking their Facebook/Instagram "About" page for an email) instead of going straight to manual outreach?
- Should sent emails be logged into a CRM/Sheet for reply tracking, or is `results.csv` sufficient for v1?
- Multi-region / multi-niche batch runs in one execution vs. one run = one niche+region (current design)?
- Follow-up sequence (e.g., auto follow-up after 5 days no reply) — out of scope for v1, worth revisiting once initial response rates are seen.

## 11. Tech Stack

Node.js · Google Places API (Text Search + Details) · Gemini API (`gemini-2.0-flash`, free tier) · Cheerio (site scraping) · Nodemailer (Gmail SMTP)
