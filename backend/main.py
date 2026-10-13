import sys
import os
import time
import random
import argparse
import config
from scraper import (
    active_scrape_generator, 
    clean_agency_name,
    get_us_marketing_agencies, 
    get_au_marketing_agencies, 
    get_marketing_agencies
)
from extractor import extract_agency_intelligence, is_info_email
from pitch_generator import generate_marketing_pitch
from mailer import TitanMailer
from tracker import LeadTracker, get_domain
from pdf_exporter import generate_leads_pdf

def print_banner(region=None):
    r = region or getattr(config, "TARGET_COUNTRY", "Australia")
    banner = f"""
========================================================================
   GALILEO & DUKE  |  MARKETING AGENCY RADAR
   Target: {r} Marketing, Social Media & PR Agencies (No Web Dev)
   Studio Flagship: https://www.galileoandduke.com
   Sender: {config.SMTP_USER}
========================================================================
"""
    print(banner)

def run_test_email(mailer):
    """Sends 1 test email to user's specified address to verify SMTP setup."""
    print("\n--- TEST EMAIL VERIFICATION ---")
    recipient = input("Enter your personal email address to receive a test email: ").strip()
    if not recipient or "@" not in recipient:
        print("[!] Invalid email address.")
        return

    print(f"[*] Sending test email to {recipient} via {config.SMTP_HOST}...")
    pitch = generate_marketing_pitch(
        "Sample Marketing Co", 
        city="Sydney, NSW", 
        ig_handle="@samplemarketing", 
        specialties=["Digital Marketing", "Social Media"]
    )
    
    try:
        mailer.send_email(
            to_email=recipient,
            subject="[TEST] " + pitch["subject"],
            plain_text=pitch["plain_text"],
            html_text=pitch["html_text"]
        )
        print(f"[+] SUCCESS! Test email delivered to {recipient}.")
        print("    Check your inbox (and webmail Sent folder) to verify formatting.")
    except Exception as e:
        print(f"[!] FAILED to send test email: {e}")

def run_pipeline(dry_run=False, target_count=20, skip_web_agencies=True, region="Australia", subject_template=None):
    """
    Main active execution loop:
    1. Actively searches & scrapes marketing agencies for the target region on the fly
    2. Deeply inspects each website: checks services, extracts business email & Instagram
    3. Filters out agencies that build websites in-house
    4. Generates tailored pitch with custom subject line
    5. Sends (or previews) and loops continuously until target_count is reached!
    """
    tracker = LeadTracker()
    mailer = TitanMailer()
    
    clean_region = region.strip() if region else "Australia"
    
    if not dry_run:
        print("\n[*] Checking email connection...")
        success, msg = mailer.test_connection()
        if not success:
            print(f"\n[!] SMTP ERROR: {msg}")
            return
        print(f"[+] {msg}")

    already_contacted = tracker.get_already_contacted_domains_and_emails()
    print(f"[*] Found {len(already_contacted)} already contacted agencies in database (duplicates will be skipped).")
    
    sent_count = 0
    discovered_count = 0
    inspected_count = 0
    session_leads = []

    mode_label = "DRY RUN (PREVIEW ONLY)" if dry_run else "LIVE OUTREACH"
    print(f"\n========================================================")
    print(f"  STARTING {mode_label}")
    print(f"  Target Region: {clean_region}")
    print(f"  Goal: Run continuously until {target_count} emails are reached")
    print(f"  Filter: Marketing agencies that DO NOT build websites")
    print(f"========================================================\n")

    for agency in active_scrape_generator(region=clean_region):
        if sent_count >= target_count:
            print(f"\n[+] TARGET REACHED: Successfully processed {sent_count}/{target_count} emails!")
            break

        inspected_count += 1
        raw_name = agency.get("name", "")
        website = agency.get("website", "")
        city = agency.get("city", clean_region)
        domain = get_domain(website)

        if not domain or domain in already_contacted:
            continue

        print(f"\n--> [Lead #{inspected_count}] Inspecting: {raw_name or domain} ({website}) - {city}")
        
        try:
            intel = extract_agency_intelligence(website)
        except Exception as e:
            print(f"    [-] Error inspecting website: {e}. Moving to next.")
            continue

        email = intel["primary_email"]
        ig_handle = intel["instagram_handle"]
        ig_url = intel["instagram_url"]
        li_url = intel.get("linkedin_url", "")
        founder_url = intel.get("founder_search_url", "")
        offers_web = intel["offers_web_dev"]
        specialties = intel["specialties"]

        # Determine best clean agency name
        agency_name = raw_name
        if not agency_name or agency_name.lower() in [domain, "marketing studio"]:
            agency_name = clean_agency_name(intel.get("site_title"), domain)

        # Filter out agencies that already offer web development in-house
        if skip_web_agencies and offers_web:
            print(f"    [-] Excluded: Actively offers website services ({intel.get('web_reason', '')}). Skipping.")
            continue

        # Strictly ensure agency is focused on marketing / ads / social / PR
        if not intel.get("is_marketing", False):
            print(f"    [-] Not a marketing agency. Skipping.")
            continue

        if not email:
            print(f"    [!] No public non-info contact email found on site. Moving to next.")
            continue

        if getattr(config, "IGNORE_INFO_EMAILS", True) and is_info_email(email):
            print(f"    [-] Ignoring generic info email ({email}). Skipping.")
            continue

        if email in already_contacted:
            print(f"    [-] Email {email} already contacted. Skipping.")
            continue

        discovered_count += 1
        tracker.save_discovered_lead(agency_name, website, city, email, ig_handle, specialties, offers_web)

        pitch = generate_marketing_pitch(
            agency_name=agency_name,
            city=city,
            ig_handle=ig_handle,
            specialties=specialties,
            site_title=intel.get("site_title"),
            subject_template=subject_template
        )

        ai_badge = " [✨ Gemini AI]" if pitch.get("source") == "gemini" else ""
        print(f"    [+] Target Email: {email}")
        print(f"    [+] Instagram: {ig_handle} ({ig_url if ig_url else 'N/A'})")
        print(f"    [+] LinkedIn: {li_url if li_url else 'Company Profile Available'}")
        print(f"    [+] Specialties: {', '.join(specialties)}")
        print(f"    [+] In-House Web Dev: NO (Ideal digital partner!)")
        print(f"    [+] Subject: {pitch['subject']}{ai_badge}")

        lead_record = {
            "agency_name": agency_name,
            "website": website,
            "city": city,
            "email": email,
            "instagram_handle": ig_handle,
            "instagram_url": ig_url,
            "linkedin_url": li_url,
            "founder_search_url": founder_url,
            "subject": pitch["subject"],
            "status": "SENT" if not dry_run else "PREVIEWED",
            "linkedin_note": pitch.get("linkedin_note", ""),
            "instagram_dm": pitch.get("instagram_dm", "")
        }

        if dry_run:
            print(f"\n--- PREVIEW PITCH TO {agency_name} ({email}) ---")
            print(pitch["plain_text"])
            print("--------------------------------------------------\n")
            session_leads.append(lead_record)
            sent_count += 1
            print(f"    [✓] Previewed {sent_count}/{target_count} leads.")
            time.sleep(1)
        else:
            print(f"    [*] Sending via Titan/GoDaddy Mail to {email}...")
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
                session_leads.append(lead_record)
                sent_count += 1
                print(f"    [✓] SENT successfully! (Progress: {sent_count}/{target_count})")

                if sent_count < target_count:
                    delay = random.randint(config.MIN_DELAY_SECONDS, config.MAX_DELAY_SECONDS)
                    print(f"    [*] Waiting {delay}s before next email to protect deliverability...")
                    time.sleep(delay)

            except Exception as e:
                print(f"    [!] Failed to send email to {email}: {e}")

    # Generate PDF report for all leads discovered/sent in this session
    pdf_path = None
    if session_leads:
        try:
            pdf_path = generate_leads_pdf(session_leads, region=clean_region)
        except Exception as e:
            print(f"[!] Warning: Could not generate PDF report: {e}")

    print(f"\n========================================================")
    print(f"  SESSION COMPLETE")
    print(f"  Target Region: {clean_region}")
    print(f"  Websites Inspected: {inspected_count}")
    print(f"  Qualified Leads Discovered: {discovered_count}")
    print(f"  Emails Processed: {sent_count}/{target_count}")
    print(f"  Saved in leads_discovered.csv & leads_sent.csv")
    if pdf_path:
        print(f"  [📄 PDF DOSSIER] Saved at: {pdf_path}")
        print(f"  (Contains clickable LinkedIn & Instagram links + ready-to-copy notes)")
    print(f"========================================================\n")



def process_custom_urls():
    """Allows user to paste a list of custom marketing agency URLs."""
    print("\n--- PROCESS CUSTOM AGENCY URLS ---")
    print("Paste agency websites (comma-separated or one per line, end with empty line):")
    urls = []
    while True:
        line = input().strip()
        if not line:
            break
        for part in line.split(","):
            u = part.strip()
            if u:
                if not u.startswith("http"):
                    u = "https://" + u
                urls.append(u)

    if not urls:
        print("[!] No URLs provided.")
        return

    tracker = LeadTracker()
    mailer = TitanMailer()
    already_contacted = tracker.get_already_contacted_domains_and_emails()

    for idx, url in enumerate(urls, 1):
        domain = get_domain(url)
        if domain in already_contacted:
            print(f"[-] Skipping {url} (already contacted).")
            continue

        print(f"\n--> [{idx}/{len(urls)}] Inspecting {url}...")
        intel = extract_agency_intelligence(url)
        email = intel["primary_email"]
        ig = intel["instagram_handle"]
        offers_web = intel["offers_web_dev"]

        if not email:
            print(f"    [!] No valid non-info email found on {url}.")
            continue

        if getattr(config, "IGNORE_INFO_EMAILS", True) and is_info_email(email):
            print(f"    [-] Ignoring generic info email ({email}). Skipping.")
            continue

        agency_name = domain.split(".")[0].capitalize()
        pitch = generate_marketing_pitch(agency_name, ig_handle=ig)

        print(f"    [+] Found Email: {email}")
        print(f"    [+] Instagram: {ig}")
        print(f"    [+] Offers Web In-House: {'YES' if offers_web else 'NO'}")
        
        confirm = input(f"    Send white-label partnership pitch to {email}? (y/n/skip all): ").strip().lower()
        if confirm == "y":
            try:
                mailer.send_email(email, pitch["subject"], pitch["plain_text"], pitch["html_text"])
                tracker.mark_lead_sent(agency_name, url, email, ig, pitch["subject"])
                print(f"    [✓] Sent to {email}!")
            except Exception as e:
                print(f"    [!] Send error: {e}")
        elif confirm == "skip all":
            break

def show_stats():
    tracker = LeadTracker()
    stats = tracker.get_stats()
    print("\n--- CURRENT OUTREACH STATS ---")
    print(f"Total Marketing Leads Discovered: {stats['total_discovered']}")
    print(f"Total Agencies Contacted: {stats['total_contacted']}")
    print(f"Database files: {config.LEADS_DISCOVERED_CSV} and {config.LEADS_SENT_CSV}")

def export_all_discovered_leads_to_pdf():
    tracker = LeadTracker()
    leads = tracker.get_discovered_leads()
    if not leads:
        print("[!] No discovered leads in database yet.")
        return
    pdf_path = generate_leads_pdf(leads, region="Discovered Database Leads")
    print(f"\n[+] Full database of {len(leads)} leads exported to PDF: {pdf_path}")

def main():
    parser = argparse.ArgumentParser(description="Galileo & Duke Marketing Agency Radar")
    parser.add_argument("--region", "--country", type=str, default=None, help="Target region/country/city (e.g. Australia, Sydney, Melbourne, US)")
    parser.add_argument("--dry-run", action="store_true", help="Run in dry run / preview mode")
    parser.add_argument("--live", action="store_true", help="Run in live outreach mode")
    parser.add_argument("--target", "--limit", dest="target", type=int, default=None, help="Target emails to reach")
    parser.add_argument("--subject", type=str, default=getattr(config, "EMAIL_SUBJECT_TEMPLATE", "Enquiry for {agency_name}"), help="Email subject template")
    
    args, unknown = parser.parse_known_args()
    
    default_region = args.region or getattr(config, "TARGET_COUNTRY", "Australia")
    if default_region.upper() == "AU":
        default_region = "Australia"
    elif default_region.upper() == "US":
        default_region = "United States"

    subject_template = args.subject

    if args.dry_run or args.live:
        region = default_region
        print_banner(region)
        limit = args.target or (5 if args.dry_run else 20)
        run_pipeline(dry_run=args.dry_run, target_count=limit, region=region, subject_template=subject_template)
        return

    print_banner(default_region)
    tracker = LeadTracker()
    mailer = TitanMailer()

    while True:
        print(f"\n[Active Defaults: Region = '{default_region}' | Subject = '{subject_template}']")
        print("Choose an action:")
        print("  1. Run Live Outreach Campaign (Actively scrape, send live emails & generate PDF)")
        print("  2. Dry Run / Preview Mode (Actively scrape, preview pitches & generate PDF)")
        print(f"  3. Change Default Region (Currently '{default_region}')")
        print(f"  4. Change Subject Template (Currently '{subject_template}')")
        print("  5. Send 1 Test Email to Yourself (Verify inbox & formatting)")
        print("  6. Process Custom List of Agency URLs (Paste your own list)")
        print("  7. View Outreach Stats")
        print("  8. Export All Discovered Leads to PDF Dossier")
        print("  9. Exit")
        
        choice = input("\nEnter choice [1-9]: ").strip()
        
        if choice == "1":
            region_input = input(f"Enter target region/country/city [default: {default_region}]: ").strip()
            target_region = region_input if region_input else default_region
            
            limit_input = input(f"Enter target number of live emails to send [default: 20]: ").strip()
            limit = int(limit_input) if limit_input.isdigit() else 20
            
            confirm = input(f"Are you sure you want to actively scrape and LIVE SEND {limit} emails to {target_region} agencies from {config.SMTP_USER}? (yes/no): ").strip().lower()
            if confirm in ["yes", "y"]:
                run_pipeline(dry_run=False, target_count=limit, region=target_region, subject_template=subject_template)
            else:
                print("Cancelled.")
        elif choice == "2":
            region_input = input(f"Enter target region/country/city [default: {default_region}]: ").strip()
            target_region = region_input if region_input else default_region
            
            limit_input = input(f"Enter target number of leads to preview [default: 5]: ").strip()
            limit = int(limit_input) if limit_input.isdigit() else 5
            
            run_pipeline(dry_run=True, target_count=limit, region=target_region, subject_template=subject_template)
        elif choice == "3":
            new_reg = input(f"Enter new default region (e.g. Australia, Sydney, Melbourne, United States) [current: {default_region}]: ").strip()
            if new_reg:
                default_region = new_reg
                print(f"[+] Updated default region to: {default_region}")
        elif choice == "4":
            new_subj = input(f"Enter new subject template (use {{agency_name}} for company name) [current: {subject_template}]: ").strip()
            if new_subj:
                subject_template = new_subj
                print(f"[+] Updated subject template to: \"{subject_template}\"")
        elif choice == "5":
            run_test_email(mailer)
        elif choice == "6":
            process_custom_urls()
        elif choice == "7":
            show_stats()
        elif choice == "8":
            export_all_discovered_leads_to_pdf()
        elif choice == "9":
            print("\nGoodbye and happy hunting!")
            sys.exit(0)
        else:
            print("[!] Invalid choice. Please enter 1-9.")


if __name__ == "__main__":
    main()


