# Marketing.md — Cold Outreach Playbook for Maximum Conversion

Freelancer-positioned cold outreach to US local businesses (see PRD §2). This covers **when** to send, **what** to say, and **how** to structure it for the best realistic open/reply rates.

---

## 1. Reality Check on Numbers

Before optimizing anything: for freelancer cold email to small local businesses, realistic benchmarks are roughly **40–60% open rate** and **1–5% reply rate**. Timing only accounts for ~3–6 percentage points of variation — **list quality, personalization, and subject line matter far more than the exact minute you hit send.** Get those right first; use the timing data below as a tiebreaker, not the main lever.

---

## 2. Best Time of Day (US Local Time) — by Niche Type

Two peaks consistently show up in 2026 data, and which one to use depends on the business type:

| Local Send Window | Best For | Why |
|---|---|---|
| **7:00 AM – 8:30 AM** | Trades, healthcare, manufacturing, contractors, local service businesses | These owners often check email before opening up shop / first appointment |
| **8:30 AM – 10:00 AM** | SaaS, tech, professional services, office-based businesses | Checked after morning routine, before meetings ramp up |
| 1:30 PM – 3:30 PM | Backup window / follow-ups | Post-lunch recovery, decent secondary window |

**Avoid:** 12:00–1:30 PM (lunch dip), after 5:00 PM, and anything after 7:00 PM local (steep drop-off).

Since Galileo & Duke's niches skew toward local service businesses, **default to the 7:00–8:30 AM local window** unless the niche is clearly office/tech-based, in which case use 8:30–10:00 AM.

---

## 3. Converted to Indian Standard Time (IST)

The bot runs from India, so here's the US-local send window converted to **your** send time. US is currently on **Daylight Time** (as of Sept 2026); this shifts by 1 hour when Daylight Time ends (first Sunday of November 2026) — noted below.

### Primary window (7:00–8:30 AM local, trades/healthcare/local service)

| US Region (current UTC offset) | Local Send Time | **Your Send Time (IST)** |
|---|---|---|
| Eastern (EDT, UTC-4) | 7:00–8:30 AM | **4:30 PM – 6:00 PM IST** |
| Central (CDT, UTC-5) | 7:00–8:30 AM | **5:30 PM – 7:00 PM IST** |
| Mountain (MDT, UTC-6) | 7:00–8:30 AM | **6:30 PM – 8:00 PM IST** |
| Pacific (PDT, UTC-7) | 7:00–8:30 AM | **7:30 PM – 9:00 PM IST** |

### Secondary window (8:30–10:00 AM local, office/tech/SaaS)

| US Region | Local Send Time | **Your Send Time (IST)** |
|---|---|---|
| Eastern (EDT) | 8:30–10:00 AM | **6:00 PM – 7:30 PM IST** |
| Central (CDT) | 8:30–10:00 AM | **7:00 PM – 8:30 PM IST** |
| Mountain (MDT) | 8:30–10:00 AM | **8:00 PM – 9:30 PM IST** |
| Pacific (PDT) | 8:30–10:00 AM | **9:00 PM – 10:30 PM IST** |

**⚠️ Daylight Time ends Sun, Nov 1, 2026.** After that, every US zone falls back 1 hour (EST = UTC-5, CST = UTC-6, MST = UTC-7, PST = UTC-8), which shifts all the IST windows above **1 hour earlier**. Re-check before scheduling sends in November or later.

**Practical takeaway:** if the bot targets, say, Austin, TX (Central) in September 2026, schedule sends for **5:30–7:00 PM IST**, any weekday.

---

## 5. Subject Line Rules

- **Under 50 characters** — must display fully on mobile, where most opens happen.
- **Personalize it** — name/business name in the subject line boosts open rates roughly 26–50% across studies. Never send a generic subject.
- **Make it about them, not you** — reference something specific to their business/site, not your service.
- **No clickbait, no spam trigger words** ("free," "guarantee," excessive punctuation/emoji) — hurts deliverability and trust.
- **Curiosity or specificity beats cleverness** — e.g. referencing an actual thing you noticed on their site outperforms a punchy one-liner.

---

## 6. Email Body Structure (What Actually Converts)

1. **Open with them, not you.** First line should reference something specific and real — their business name, something on their site, their niche. No "Hi, I'm a web developer" opener.
2. **State the observation.** 1–2 concrete, specific points (from the site analyzer) — not generic ("your site could be better") but specific ("your booking form doesn't work on mobile," "no way to see pricing without calling").
3. **Bridge to value**, briefly — what fixing it would mean for them (more bookings, fewer missed calls), not a feature list.
4. **One clear CTA.** A single, low-friction ask — e.g. "Want me to send a quick before/after mockup?" — not "let's hop on a call" (too much commitment for a first touch).
5. **Freelancer sign-off** — your name, direct contact, optional one-line credibility mention (see PRD §2). No company signature block.

**Length: 75–125 words.** Longer cold emails convert worse — this isn't the pitch, it's the doorway.

---

## 7. Personalization Depth

Basic (name/company merge tags) is table stakes now and barely moves the needle alone. What matters:
- Reference something **only true of their specific site/business** (pulled from the analyzer's output) — this is the single biggest lever available in this system.
- If no website: reference something findable about the business itself (niche, location, what a customer would be trying to do — book, order, check hours) rather than generic "I noticed you don't have a website."

---

## 8. Deliverability & Volume Discipline

- Rate-limit sends (already built into the bot — `EMAIL_DELAY_MS`). Bursts of identical-looking emails from one Gmail account get flagged.
- Keep `DRY_RUN` on and manually review the first batch of drafts before trusting the analyzer's output at volume.
- Avoid spam-trigger words and excessive links/images — plain text, mostly, reads more human and deliverable than an HTML template.
- Stay under Gmail's practical daily send ceiling; better to run smaller, well-timed batches than one large blast.

---

## 9. Follow-Up Cadence

- One follow-up 3–5 business days after the first email if no reply, referencing the original email rather than restarting the pitch.
- Stop after 2 total touches for cold outreach — a third unsolicited email has a poor return and higher spam-complaint risk.
- (Follow-up automation is out of scope for the bot's v1 per PRD §10 — track manually via `results.csv` for now.)

---

## 10. Sources

- Zeliq — Best Time to Send Cold Emails: Data-Backed Guide for 2026
- LeadHaste — Best Time to Send Cold Emails 2026 (day/hour reply-rate breakdown)
- InboxAlly — The Best Time to Send Cold Emails
- Instantly.ai — When Should You Send Follow-Up Emails for Best Open Rates
- QuickMail, Mailshake, B2B Rocket, Smartlead — subject line & personalization best practices
