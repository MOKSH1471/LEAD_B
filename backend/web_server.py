import os
import sys
import csv
import json
import time
import queue
import threading
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Ensure current directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import config
from scraper import active_scrape_generator, clean_agency_name
from extractor import extract_agency_intelligence, is_info_email
from pitch_generator import generate_marketing_pitch
from mailer import TitanMailer
from tracker import LeadTracker, get_domain
from pdf_exporter import generate_leads_pdf

app = FastAPI(title="Galileo & Duke Radar Mobile App", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global campaign state and event broadcast system
campaign_lock = threading.Lock()
campaign_state = {
    "is_running": False,
    "region": "Australia",
    "mode": "dry_run",
    "target_count": 10,
    "current_count": 0,
    "inspected_count": 0,
    "discovered_count": 0,
    "status_message": "Ready to launch",
    "current_lead": None,
    "session_leads": [],
    "latest_pdf_path": None,
    "start_time": None
}
stop_campaign_flag = threading.Event()
event_subscribers: List[queue.Queue] = []

def broadcast_event(event_type: str, data: Dict[str, Any]):
    """Broadcast an SSE event to all connected mobile clients."""
    payload = json.dumps({"type": event_type, "data": data, "timestamp": datetime.now().isoformat()})
    for q in list(event_subscribers):
        try:
            q.put_nowait(payload)
        except Exception:
            pass

class CampaignRequest(BaseModel):
    region: str = "Australia"
    target: int = 10
    dry_run: bool = True
    subject_template: Optional[str] = "Enquiry for {agency_name}"

class SettingsRequest(BaseModel):
    target_country: Optional[str] = None
    email_subject_template: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    daily_send_limit: Optional[int] = None
    min_delay_seconds: Optional[int] = None
    max_delay_seconds: Optional[int] = None
    resend_api_key: Optional[str] = None
    resend_from_email: Optional[str] = None

def run_campaign_worker(req: CampaignRequest):
    """Background worker for live or preview campaigns."""
    global campaign_state
    tracker = LeadTracker()
    mailer = TitanMailer()
    
    clean_region = req.region.strip() if req.region else "Australia"
    mode_label = "DRY_RUN" if req.dry_run else "LIVE"

    with campaign_lock:
        campaign_state["is_running"] = True
        campaign_state["region"] = clean_region
        campaign_state["mode"] = mode_label
        campaign_state["target_count"] = req.target
        campaign_state["current_count"] = 0
        campaign_state["inspected_count"] = 0
        campaign_state["discovered_count"] = 0
        campaign_state["session_leads"] = []
        campaign_state["status_message"] = f"Starting {mode_label} campaign for {clean_region}..."
        campaign_state["start_time"] = datetime.now().isoformat()

    stop_campaign_flag.clear()
    broadcast_event("campaign_started", {
        "region": clean_region,
        "target": req.target,
        "mode": mode_label
    })

    already_contacted = tracker.get_already_contacted_domains_and_emails()
    session_leads = []
    sent_count = 0
    inspected_count = 0
    discovered_count = 0

    try:
        for agency in active_scrape_generator(region=clean_region):
            if stop_campaign_flag.is_set():
                broadcast_event("campaign_stopped", {"reason": "User manually stopped the campaign"})
                break

            if sent_count >= req.target:
                break

            inspected_count += 1
            raw_name = agency.get("name", "")
            website = agency.get("website", "")
            city = agency.get("city", clean_region)
            domain = get_domain(website)

            if not domain or domain in already_contacted:
                continue

            with campaign_lock:
                campaign_state["inspected_count"] = inspected_count
                campaign_state["current_lead"] = {
                    "name": raw_name or domain,
                    "website": website,
                    "city": city,
                    "status": "Inspecting Website..."
                }
                campaign_state["status_message"] = f"Inspecting {raw_name or domain}..."

            broadcast_event("lead_inspecting", {
                "name": raw_name or domain,
                "website": website,
                "city": city,
                "inspected_count": inspected_count
            })

            try:
                intel = extract_agency_intelligence(website)
            except Exception as e:
                print(f"[!] Intelligence extraction error for {website}: {e}")
                intel = {}

            email = intel.get("primary_email") or agency.get("email")
            ig_handle = intel.get("instagram_handle") or agency.get("instagram", "Not Listed")
            ig_url = intel.get("instagram_url") or ""
            li_url = intel.get("linkedin_url", "")
            founder_url = intel.get("founder_search_url", "")
            offers_web = intel.get("offers_web_dev", False)
            specialties = intel.get("specialties") or ["Marketing & Brand Strategy"]
            is_curated = agency.get("is_curated", False)

            # Determine clean agency name
            agency_name = raw_name
            if not agency_name or agency_name.lower() in [domain, "marketing studio"]:
                agency_name = clean_agency_name(intel.get("site_title"), domain)

            # Skip agencies that already do web development (curated agencies are pre-vetted marketing/PR studios)
            if offers_web and not is_curated:
                broadcast_event("lead_skipped", {
                    "name": agency_name,
                    "reason": f"Offers in-house web dev ({intel.get('web_reason', '')})"
                })
                continue

            # Must be marketing focus
            if not intel.get("is_marketing", False) and not is_curated:
                broadcast_event("lead_skipped", {
                    "name": agency_name,
                    "reason": "Not a marketing/PR agency"
                })
                continue

            if not email:
                broadcast_event("lead_skipped", {
                    "name": agency_name,
                    "reason": "No public business email found"
                })
                continue

            if getattr(config, "IGNORE_INFO_EMAILS", True) and is_info_email(email):
                alt_email = next((e for e in intel.get("all_emails", []) if not is_info_email(e)), None)
                if alt_email:
                    email = alt_email
                elif not is_curated:
                    broadcast_event("lead_skipped", {
                        "name": agency_name,
                        "reason": f"Filtered generic gatekeeper email ({email})"
                    })
                    continue

            if email in already_contacted:
                continue

            discovered_count += 1
            tracker.save_discovered_lead(agency_name, website, city, email, ig_handle, specialties, offers_web)

            contact_person = intel.get("contact_person")

            # Generate pitch using Gemini AI or template addressed directly to contact person
            pitch = generate_marketing_pitch(
                agency_name=agency_name,
                city=city,
                ig_handle=ig_handle,
                specialties=specialties,
                site_title=intel.get("site_title"),
                subject_template=req.subject_template,
                contact_name=contact_person
            )

            lead_record = {
                "agency_name": agency_name,
                "contact_person": contact_person or "",
                "website": website,
                "city": city,
                "email": email,
                "instagram_handle": ig_handle,
                "instagram_url": ig_url,
                "linkedin_url": li_url,
                "founder_search_url": founder_url,
                "subject": pitch["subject"],
                "status": "SENT" if not req.dry_run else "PREVIEWED",
                "source": pitch.get("source", "template"),
                "linkedin_note": pitch.get("linkedin_note", ""),
                "instagram_dm": pitch.get("instagram_dm", ""),
                "plain_text": pitch.get("plain_text", ""),
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

            if req.dry_run:
                sent_count += 1
                session_leads.append(lead_record)
                with campaign_lock:
                    campaign_state["current_count"] = sent_count
                    campaign_state["discovered_count"] = discovered_count
                    campaign_state["session_leads"].append(lead_record)
                    campaign_state["status_message"] = f"Previewed {sent_count}/{req.target} leads"

                broadcast_event("lead_processed", {
                    "lead": lead_record,
                    "current": sent_count,
                    "target": req.target,
                    "mode": "preview"
                })
                time.sleep(1.2)
            else:
                try:
                    mailer.send_email(
                        to_email=email,
                        subject=pitch["subject"],
                        plain_text=pitch["plain_text"],
                        html_text=pitch["html_text"]
                    )
                    tracker.mark_lead_sent(agency_name, website, email, ig_handle, pitch["subject"])
                    already_contacted.add(email)
                    already_contacted.add(domain)
                    sent_count += 1
                    session_leads.append(lead_record)

                    with campaign_lock:
                        campaign_state["current_count"] = sent_count
                        campaign_state["discovered_count"] = discovered_count
                        campaign_state["session_leads"].append(lead_record)
                        campaign_state["status_message"] = f"Sent email {sent_count}/{req.target}"

                    broadcast_event("lead_processed", {
                        "lead": lead_record,
                        "current": sent_count,
                        "target": req.target,
                        "mode": "sent"
                    })

                    if sent_count < req.target:
                        delay = getattr(config, "MIN_DELAY_SECONDS", 35)
                        for d in range(delay, 0, -1):
                            if stop_campaign_flag.is_set():
                                break
                            campaign_state["status_message"] = f"Deliverability pause: {d}s remaining..."
                            time.sleep(1)

                except Exception as send_err:
                    broadcast_event("lead_failed", {
                        "name": agency_name,
                        "email": email,
                        "error": str(send_err)
                    })

    except Exception as e:
        print(f"[!] Campaign worker error: {e}")
        import traceback
        traceback.print_exc()
        broadcast_event("campaign_error", {"error": str(e)})

    # Generate PDF Dossier
    pdf_path = None
    if session_leads:
        try:
            pdf_path = generate_leads_pdf(session_leads, region=clean_region)
        except Exception as e:
            pass

    with campaign_lock:
        campaign_state["is_running"] = False
        if sent_count > 0:
            campaign_state["status_message"] = f"Campaign finished: {sent_count}/{req.target} leads processed"
        else:
            campaign_state["status_message"] = f"Finished: All available agencies in {clean_region} already contacted or skipped"
        campaign_state["latest_pdf_path"] = pdf_path

    broadcast_event("campaign_completed", {
        "sent_count": sent_count,
        "discovered_count": discovered_count,
        "inspected_count": inspected_count,
        "pdf_available": bool(pdf_path)
    })

# ======================== API ROUTES ========================

@app.get("/api/stats")
def get_stats():
    tracker = LeadTracker()
    stats = tracker.get_stats()
    
    # Today's sent count
    today_sent = 0
    today_str = datetime.now().strftime("%Y-%m-%d")
    if os.path.exists(config.LEADS_SENT_CSV):
        with open(config.LEADS_SENT_CSV, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("date_sent", "").startswith(today_str):
                    today_sent += 1

    return {
        "total_discovered": stats["total_discovered"],
        "total_contacted": stats["total_contacted"],
        "today_sent": today_sent,
        "daily_limit": getattr(config, "DAILY_SEND_LIMIT", 30),
        "target_country": getattr(config, "TARGET_COUNTRY", "Australia"),
        "sender_email": getattr(config, "SMTP_USER", "studio@galileoandduke.com"),
        "sender_name": getattr(config, "SENDER_NAME", "Moksh | Galileo & Duke"),
        "gemini_active": bool(getattr(config, "GEMINI_API_KEY", "")),
        "gemini_model": getattr(config, "GEMINI_MODEL", "gemini-2.0-flash"),
        "pdf_ready": os.path.exists(os.path.join(config.BASE_DIR, "leads_report_latest.pdf"))
    }

@app.get("/api/leads")
def get_leads(limit: int = 50, filter_type: str = "all"):
    """Returns discovered and sent leads with all multi-channel links."""
    leads = []
    
    sent_map = {}
    if os.path.exists(config.LEADS_SENT_CSV):
        with open(config.LEADS_SENT_CSV, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                d = row.get("domain", "").lower().strip()
                if d:
                    sent_map[d] = row

    if os.path.exists(config.LEADS_DISCOVERED_CSV):
        with open(config.LEADS_DISCOVERED_CSV, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                domain = row.get("domain", "").lower().strip()
                is_sent = domain in sent_map
                
                if filter_type == "sent" and not is_sent:
                    continue
                if filter_type == "discovered" and is_sent:
                    continue

                agency_name = row.get("agency_name", "Marketing Studio")
                ig = row.get("instagram", "Not Listed")
                ig_url = f"https://instagram.com/{ig.lstrip('@')}" if ig and ig != "Not Listed" else ""
                
                # Brand query for founder
                clean_brand = agency_name.split(".")[0].replace("-", " ")
                founder_url = f"https://www.google.com/search?q=site:linkedin.com/in+%22Founder%22+OR+%22Managing+Director%22+%22{clean_brand}%22"

                leads.append({
                    "agency_name": agency_name,
                    "website": row.get("website", ""),
                    "domain": domain,
                    "city": row.get("city", "Australia"),
                    "email": row.get("email", ""),
                    "instagram_handle": ig,
                    "instagram_url": ig_url,
                    "linkedin_url": row.get("linkedin_url", ""),
                    "founder_search_url": founder_url,
                    "specialties": row.get("specialties", "Marketing"),
                    "offers_web": row.get("offers_web", "NO"),
                    "date": row.get("date_discovered", ""),
                    "is_sent": is_sent,
                    "subject": sent_map[domain].get("subject", f"Enquiry for {agency_name}") if is_sent else f"Enquiry for {agency_name}"
                })

    leads.reverse() # Most recent first
    return {"leads": leads[:limit], "total_count": len(leads)}

@app.get("/api/campaign/status")
def get_campaign_status():
    with campaign_lock:
        return dict(campaign_state)

@app.post("/api/campaign/start")
def start_campaign(req: CampaignRequest):
    with campaign_lock:
        if campaign_state["is_running"]:
            raise HTTPException(status_code=400, detail="A campaign is already running!")

    thread = threading.Thread(target=run_campaign_worker, args=(req,), daemon=True)
    thread.start()
    return {"status": "started", "region": req.region, "target": req.target, "mode": "dry_run" if req.dry_run else "live"}

@app.post("/api/campaign/stop")
def stop_campaign():
    stop_campaign_flag.set()
    return {"status": "stopping"}

@app.get("/api/campaign/stream")
def campaign_stream():
    """Server-Sent Events endpoint for real-time mobile app updates."""
    client_queue = queue.Queue(maxsize=100)
    event_subscribers.append(client_queue)

    def event_generator():
        try:
            # Send initial state
            initial_data = json.dumps({"type": "init", "data": campaign_state})
            yield f"data: {initial_data}\n\n"
            
            while True:
                try:
                    payload = client_queue.get(timeout=3.0)
                    yield f"data: {payload}\n\n"
                except queue.Empty:
                    # Keep-alive heartbeat every 3 seconds to prevent proxy and mobile timeouts
                    yield f": keep-alive\n\n"
        except GeneratorExit:
            if client_queue in event_subscribers:
                event_subscribers.remove(client_queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/download-pdf")
def download_pdf():
    pdf_path = os.path.join(config.BASE_DIR, "leads_report_latest.pdf")
    if not os.path.exists(pdf_path):
        # Generate on demand if file not found
        tracker = LeadTracker()
        leads = tracker.get_discovered_leads()
        if leads:
            generate_leads_pdf(leads, region="Australia")
        else:
            raise HTTPException(status_code=404, detail="No leads available to generate PDF")
            
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename="Galileo_Duke_Leads_Dossier.pdf"
    )

@app.post("/api/generate-pdf")
def trigger_generate_pdf():
    tracker = LeadTracker()
    leads = tracker.get_discovered_leads()
    if not leads:
        raise HTTPException(status_code=400, detail="No leads discovered yet")
    pdf_path = generate_leads_pdf(leads, region=getattr(config, "TARGET_COUNTRY", "Australia"))
    return {"status": "success", "pdf_url": "/api/download-pdf", "total_leads": len(leads)}

@app.get("/api/settings")
def get_settings():
    resend_set = bool(getattr(config, "RESEND_API_KEY", ""))
    return {
        "target_country": getattr(config, "TARGET_COUNTRY", "AU"),
        "email_subject_template": getattr(config, "EMAIL_SUBJECT_TEMPLATE", "Enquiry for {agency_name}"),
        "gemini_api_key_set": bool(getattr(config, "GEMINI_API_KEY", "")),
        "gemini_model": getattr(config, "GEMINI_MODEL", "gemini-2.0-flash"),
        "daily_send_limit": getattr(config, "DAILY_SEND_LIMIT", 30),
        "min_delay_seconds": getattr(config, "MIN_DELAY_SECONDS", 35),
        "max_delay_seconds": getattr(config, "MAX_DELAY_SECONDS", 65),
        "smtp_host": getattr(config, "SMTP_HOST", ""),
        "smtp_user": getattr(config, "SMTP_USER", ""),
        "resend_api_key_set": resend_set,
        "resend_from_email": getattr(config, "RESEND_FROM_EMAIL", "") or getattr(config, "SENDER_EMAIL", ""),
        "delivery_mode": "Resend HTTP API (Port 443 - Cloud Safe)" if resend_set else "Direct SMTP (Port 465)"
    }

@app.get("/api/test-email")
def test_email_connection():
    mailer = TitanMailer()
    success, message = mailer.test_connection()
    return {
        "success": success,
        "message": message,
        "mode": "Resend HTTP API" if mailer.is_resend_active else "Direct SMTP"
    }

@app.post("/api/settings")
def update_settings(settings: SettingsRequest):
    env_file = os.path.join(config.BASE_DIR, ".env")
    lines = []
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            lines = f.readlines()

    settings_dict = {}
    if settings.target_country: settings_dict["TARGET_COUNTRY"] = settings.target_country
    if settings.email_subject_template: settings_dict["EMAIL_SUBJECT_TEMPLATE"] = settings.email_subject_template
    if settings.gemini_api_key: settings_dict["GEMINI_API_KEY"] = settings.gemini_api_key
    if settings.gemini_model: settings_dict["GEMINI_MODEL"] = settings.gemini_model
    if settings.daily_send_limit: settings_dict["DAILY_SEND_LIMIT"] = str(settings.daily_send_limit)
    if settings.min_delay_seconds: settings_dict["MIN_DELAY_SECONDS"] = str(settings.min_delay_seconds)
    if settings.max_delay_seconds: settings_dict["MAX_DELAY_SECONDS"] = str(settings.max_delay_seconds)
    if settings.resend_api_key is not None: settings_dict["RESEND_API_KEY"] = settings.resend_api_key
    if settings.resend_from_email: settings_dict["RESEND_FROM_EMAIL"] = settings.resend_from_email

    updated_keys = set()
    new_lines = []
    for line in lines:
        if "=" in line and not line.startswith("#"):
            k = line.split("=")[0].strip()
            if k in settings_dict:
                new_lines.append(f"{k}={settings_dict[k]}\n")
                updated_keys.add(k)
                continue
        new_lines.append(line)

    for k, v in settings_dict.items():
        if k not in updated_keys:
            new_lines.append(f"{k}={v}\n")

    with open(env_file, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    # Reload config
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=env_file, override=True)
    if hasattr(config, "TARGET_COUNTRY") and settings.target_country: config.TARGET_COUNTRY = settings.target_country
    if hasattr(config, "EMAIL_SUBJECT_TEMPLATE") and settings.email_subject_template: config.EMAIL_SUBJECT_TEMPLATE = settings.email_subject_template
    if hasattr(config, "GEMINI_API_KEY") and settings.gemini_api_key: config.GEMINI_API_KEY = settings.gemini_api_key
    if hasattr(config, "GEMINI_MODEL") and settings.gemini_model: config.GEMINI_MODEL = settings.gemini_model
    if hasattr(config, "RESEND_API_KEY") and settings.resend_api_key is not None: config.RESEND_API_KEY = settings.resend_api_key
    if hasattr(config, "RESEND_FROM_EMAIL") and settings.resend_from_email: config.RESEND_FROM_EMAIL = settings.resend_from_email

    return {"status": "saved"}

# Mount frontend
candidates = [
    os.path.abspath(os.path.join(BASE_DIR, "..", "frontend")),
    os.path.abspath(os.path.join(BASE_DIR, "..", "web", "static")),
    os.path.abspath(os.path.join(BASE_DIR, "web", "static")),
    os.path.abspath(os.path.join(BASE_DIR, "static")),
]
STATIC_DIR = next((p for p in candidates if os.path.exists(p) and os.path.exists(os.path.join(p, "index.html"))), os.path.join(BASE_DIR, "static"))
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web_server:app", host="0.0.0.0", port=8000, reload=False)
