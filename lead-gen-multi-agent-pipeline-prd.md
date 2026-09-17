# PRD: Multi-Agent Lead-Gen Pipeline (Local → Cloud)

## 1. Summary

Refactor the existing lead-gen bot (single-threaded script, `contacted.json`, sequential scraping) into a multi-agent pipeline: **Discovery → Verification → Personalization → Dispatch**, coordinated by a **Monitoring Agent** that feeds deliverability signals back upstream. Ship it running locally first, architected from day one so it can be lifted into a cloud deployment without a rewrite.

**Target volume:** 1,000 unique emails/day
**Current volume:** 20–50 emails/day

---

## 2. Goals

- Decouple lead discovery from sending so a slow AI call or a bad scrape target never stalls the whole system.
- Give each stage independent retry, scaling, and failure isolation.
- Build the local version on primitives that map 1:1 onto managed cloud equivalents — no architecture change at migration time, only endpoint/config changes.
- Keep the cost of local development at $0 (no cloud spend until you're ready to scale past what one machine can send safely).

## 3. Non-Goals

- Building custom warmup/reputation infrastructure (see prior discussion — bring-your-own-SMTP through Smartlead/Instantly's API for the sending layer, or accept slower organic warmup if fully self-hosted).
- Multi-tenant support (this PRD is single-operator; multi-client agency use is a phase-2 concern).

---

## 4. Architecture: Local-First, Cloud-Ready

The core design principle: **every local primitive has a drop-in managed equivalent.** You develop against Docker Compose on your machine; deployment is swapping connection strings, not rewriting agents.

| Layer | Local (Phase 1) | Cloud (Phase 2) |
|---|---|---|
| Queue / job broker | Redis (Docker container) | Managed Redis (Upstash / Railway Redis / AWS ElastiCache) |
| Queue library | BullMQ | BullMQ (unchanged — it's Redis-agnostic) |
| Database | SQLite (`better-sqlite3`, file-based) | Postgres (Railway / Supabase / RDS) |
| Agent processes | Node processes on your machine (`pm2` or plain `node`) | Containerized workers (Docker images), one per agent |
| Scheduler / always-on runner | Your machine staying on | Cloud host keeps workers alive 24/7 — this is the #1 reason to migrate |
| Secrets (.env) | Local `.env` file | Platform secret manager (Railway vars / AWS Secrets Manager) |
| Monitoring agent output | Console logs + SQLite table | Same table (in Postgres) + optional Telegram bot alerts (you already have `telegramBot.js`) |

**Why this matters for your specific case:** the single biggest reason to go cloud isn't performance — it's that a local machine can't stay on 24/7 reliably (sleep, restarts, your own laptop needing to be shut for class/travel). At 1,000/day paced across business hours, a dispatcher that silently stops running for 6 hours because your laptop slept is worse than a slower but *always-on* system.

---

## 5. Agent Specifications

### 5.1 Discovery Agent
- **Input:** city/region targets, search radius
- **Output:** raw lead records → `leads_raw` table
- **Concurrency:** `SCRAPER_CONCURRENCY` workers (5–10), via BullMQ concurrency setting on the queue
- **Local runtime:** Node worker process, polls OSM/Maps API
- **Cloud runtime:** identical code, containerized; scale by increasing BullMQ worker concurrency, not by adding more containers (I/O-bound, not CPU-bound)

### 5.2 Verification Agent
- **Input:** `leads_raw` rows
- **Output:** `leads_verified` (MX check passed, SMTP handshake passed, not a catch-all)
- **Key logic:** dedup against `leads` table (email + domain), suppression-list check
- **Failure mode to handle:** SMTP handshake timeouts — set a hard 3.5s timeout per check, don't let one slow mail server stall the queue

### 5.3 Personalization Agent
- **Input:** `leads_verified` rows
- **Output:** drafted email → `send_queue`
- **Model:** Gemini 1.5/2.0 Flash, rate-throttled to 15 RPM
- **Extra step recommended:** self-critique pass — have the model score its own draft (1–5) on genericness before queueing; auto-flag anything scoring low for manual review instead of auto-sending

### 5.4 Dispatch Agent
- **Input:** `send_queue`
- **Output:** sent email, logged to `sent_log`
- **Pacing:** 1 email per 25–40s per active inbox, randomized, business-hours window
- **Inbox selection:** least-recently-used, respecting per-inbox daily cap and current health status (see Monitoring Agent)

### 5.5 Monitoring Agent
- **Input:** bounce/complaint webhooks (or IMAP polling if self-managing SMTP), reply detection
- **Output:** writes to `inbox_health` table; can pause a BullMQ queue (`dispatchQueue.pause()`) or mark an inbox unusable
- **Feedback actions:**
  - Inbox bounce rate > threshold → pause that inbox, alert via Telegram
  - City/region yielding high invalid-email rate → deprioritize in Discovery's next run
  - Suppression list hit → hard-block, independent of dedup logic

---

## 6. Database Schema (SQLite → Postgres, same schema)

```
leads_raw       (id, business_name, domain, place_id, city, scraped_at)
leads_verified  (id, email, domain, mx_valid, smtp_valid, verified_at)
send_queue      (id, lead_id, draft_text, personalization_score, scheduled_at, status)
sent_log        (id, lead_id, inbox_id, sent_at, bounced, replied)
inboxes         (id, provider, daily_cap, sent_today, health_status, last_reset)
suppression     (email UNIQUE, reason, added_at)
```

Using SQLite locally and Postgres in the cloud means near-identical SQL — avoid SQLite-specific syntax (e.g., use standard `TIMESTAMP`, avoid `AUTOINCREMENT` quirks) so the migration is a `pg_dump`-style export/import, not a rewrite.

---

## 7. Local → Cloud Migration Path

### Phase 1 — Local (current target)
1. `docker-compose.yml` with Redis + your Node agents as services (even locally, this gets you Docker-image parity with what you'll deploy).
2. SQLite file mounted as a volume.
3. Run all 5 agents as separate `node` processes (or `pm2` for auto-restart) — this is what makes them independently deployable later.

### Phase 2 — Cloud (when ready)
1. **Pick a host.** For your scale and Node/Express stack, in order of setup simplicity:
   - **Railway** — easiest; supports Docker Compose-like multi-service deploys, has managed Redis + Postgres as one-click add-ons, generous enough for this workload. Good first choice given your existing stack.
   - **Render** — similar simplicity, background workers as a first-class concept (maps directly onto your agents).
   - **Fly.io** — more control, still simple, good if you want workers in a specific region close to your target cities' mail servers.
   - **AWS (ECS Fargate + ElastiCache + RDS)** — most control, most setup overhead; only worth it once you're past this scale or need it for a client deliverable (e.g., if this becomes a Galileo & Duke product).
2. **Containerize each agent** as its own Dockerfile (or one image, different entrypoint commands per agent — simpler to maintain).
3. **Swap connection strings**: `REDIS_URL`, `DATABASE_URL` point to managed services instead of `localhost`.
4. **Move secrets** (Gemini API key, SMTP credentials) into the platform's secret manager — never in the Docker image.
5. **Add health checks**: each worker process exposes a `/health` endpoint so the platform can restart it if it crashes silently.
6. **Keep the Telegram bot as your ops dashboard** — `/inboxes` and `/queue` commands become your remote monitoring, since you won't be watching a local terminal anymore.

### What does NOT change between phases
- BullMQ job definitions and agent logic
- Database schema
- Gemini prompt logic
- Dispatch pacing rules

This is the point of the local-first design — you're not building a throwaway local prototype, you're building the cloud system and running it on your laptop first.

---

## 8. Open Questions

1. **Sending layer:** self-managed SMTP pool, or route Dispatch through Smartlead/Instantly's API for warmup + deliverability (recommended given prior discussion)?
2. **Cloud host preference:** Railway (fastest to ship) vs. more control (Fly.io/AWS)?
3. **Budget ceiling** for managed Redis/Postgres + hosting — this affects host choice more than anything else at this scale (Railway/Render should run well under $20–30/month for this workload).
4. **Alerting:** Telegram-only, or do you also want email/SMS alerts if the Monitoring Agent detects a mass-bounce event?

---

## 9. Verification Plan

- **Local:** run all 5 agents via Docker Compose, dry-run 50 leads end-to-end, confirm queue hand-offs and Telegram status commands work.
- **Pre-cloud:** confirm the same Docker images run correctly with `REDIS_URL`/`DATABASE_URL` pointed at a temporary cloud Redis/Postgres instance before cutting over fully.
- **Post-cloud:** 24-hour soak test at low volume (50–100/day) to confirm workers survive restarts, health checks fire correctly, and the Monitoring Agent's pause logic actually stops a bad inbox before it does damage.
