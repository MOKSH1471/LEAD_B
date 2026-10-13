import os
import re
from datetime import datetime
import pymupdf
import config

def escape_html(text):
    if not text:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )

def generate_leads_pdf(leads, output_filename=None, region="Australia"):
    """
    Generates an executive, clickable PDF dossier for all processed leads.
    Includes:
      - Agency Details & Website Link
      - Contact Email & Pitch Status
      - Clickable Company LinkedIn & 1-Click Founder Search URL
      - Copy-Paste LinkedIn Connection Note (<300 chars)
      - Clickable Instagram Profile & Copy-Paste Instagram DM
    """
    if not leads:
        print("[!] No leads to generate PDF.")
        return None

    if not output_filename:
        reports_dir = os.path.join(config.BASE_DIR, "reports")
        os.makedirs(reports_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = os.path.join(reports_dir, f"leads_report_{timestamp}.pdf")

    latest_filename = os.path.join(config.BASE_DIR, "leads_report_latest.pdf")

    doc = pymupdf.open()
    
    # Page dimensions (A4 in points: 595 x 842)
    page_width = 595
    page_height = 842
    margin = 36
    content_rect = pymupdf.Rect(margin, margin, page_width - margin, page_height - margin)

    css = """
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 10px;
        color: #1a1a1a;
        margin: 0;
        padding: 0;
    }
    .header-box {
        background: #0f172a;
        color: #ffffff;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
    }
    .header-title {
        font-size: 16px;
        font-weight: 700;
        margin: 0 0 4px 0;
        letter-spacing: 0.5px;
    }
    .header-subtitle {
        font-size: 11px;
        color: #94a3b8;
        margin: 0 0 10px 0;
    }
    .stats-bar {
        font-size: 10px;
        color: #cbd5e1;
        border-top: 1px solid #334155;
        padding-top: 8px;
    }
    .card {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        border-radius: 8px;
        padding: 14px;
        margin-bottom: 14px;
    }
    .card-title {
        font-size: 13px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 4px 0;
    }
    .agency-link {
        color: #2563eb;
        text-decoration: underline;
        font-weight: 600;
    }
    .meta-line {
        color: #64748b;
        font-size: 9.5px;
        margin-bottom: 10px;
    }
    .section-label {
        font-weight: 700;
        font-size: 9.5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 8px;
        margin-bottom: 4px;
    }
    .email-label { color: #0284c7; }
    .li-label { color: #0077b5; }
    .ig-label { color: #e1306c; }
    
    .msg-box {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-left: 3px solid #2563eb;
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 9.5px;
        line-height: 1.45;
        color: #1e293b;
        margin-bottom: 6px;
    }
    .ig-box {
        border-left-color: #e1306c;
    }
    .action-btn {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 4px;
        text-decoration: none;
        font-weight: 600;
        font-size: 9px;
        margin-right: 6px;
    }
    .li-btn {
        background: #0077b5;
        color: #ffffff;
    }
    .ig-btn {
        background: #e1306c;
        color: #ffffff;
    }
    .search-btn {
        background: #475569;
        color: #ffffff;
    }
    .footer {
        font-size: 8.5px;
        color: #94a3b8;
        text-align: center;
        margin-top: 10px;
    }
    """

    # We format 2 leads per page for clean, legible layout
    leads_per_page = 2
    chunks = [leads[i:i + leads_per_page] for i in range(0, len(leads), leads_per_page)]

    for page_idx, chunk in enumerate(chunks, 1):
        page = doc.new_page(width=page_width, height=page_height)
        
        cards_html = []

        # If first page, add header banner
        if page_idx == 1:
            header_html = f"""
            <div class="header-box">
                <div class="header-title">GALILEO &amp; DUKE — CLIENT ACQUISITION DOSSIER</div>
                <div class="header-subtitle">White-Label Digital Engineering Partner | Flagship: galileoandduke.com</div>
                <div class="stats-bar">
                    <b>Target Region:</b> {escape_html(region)} &nbsp;|&nbsp; 
                    <b>Total Leads in Session:</b> {len(leads)} &nbsp;|&nbsp; 
                    <b>Generated:</b> {datetime.now().strftime('%b %d, %Y - %H:%M')}
                </div>
            </div>
            """
            cards_html.append(header_html)

        for lead_num, lead in enumerate(chunk, 1):
            overall_index = (page_idx - 1) * leads_per_page + lead_num
            name = escape_html(lead.get("name") or lead.get("agency_name") or "Marketing Studio")
            website = lead.get("website", "")
            city = escape_html(lead.get("city", region))
            email = escape_html(lead.get("email") or lead.get("primary_email") or "N/A")
            status = escape_html(lead.get("status", "Discovered / Previewed"))
            
            # Instagram
            ig_handle = escape_html(lead.get("instagram_handle") or lead.get("instagram") or "Not Listed")
            ig_url = lead.get("instagram_url") or (f"https://instagram.com/{ig_handle.lstrip('@')}" if ig_handle and ig_handle != "Not Listed" else "")
            ig_dm = escape_html(lead.get("instagram_dm") or f"Hey {name} team! Loved your campaigns in {city}. Sent a quick note to your inbox about partnering as a white-label web studio for your clients. Open to checking out recent builds?")

            # LinkedIn
            li_url = lead.get("linkedin_url", "")
            founder_url = lead.get("founder_search_url", "")
            brand_query = re.sub(r'[^a-zA-Z0-9\s]', '', name).strip()
            if not founder_url:
                founder_url = f"https://www.google.com/search?q=site:linkedin.com/in+%22Founder%22+OR+%22Managing+Director%22+%22{brand_query}%22"

            li_note = escape_html(lead.get("linkedin_note") or f"Hi! Loved {name}'s work in {city}. We run Galileo & Duke (creative web studio) — sent a quick note to your studio inbox about partnering on white-label websites for your clients. Would love to connect here!")

            # Email pitch subject
            subject = escape_html(lead.get("subject") or f"Enquiry for {name}")

            website_link_html = f'<a href="{escape_html(website)}" class="agency-link">{escape_html(website)}</a>' if website else "N/A"
            
            li_actions_html = ""
            if li_url:
                li_actions_html += f'<a href="{escape_html(li_url)}" class="action-btn li-btn">Company LinkedIn</a> '
            li_actions_html += f'<a href="{escape_html(founder_url)}" class="action-btn search-btn">Find Founder on LinkedIn &rarr;</a>'

            ig_actions_html = ""
            if ig_url:
                ig_actions_html += f'<a href="{escape_html(ig_url)}" class="action-btn ig-btn">Instagram: {ig_handle}</a>'
            else:
                ig_actions_html += f'<span style="color:#64748b;">Instagram: {ig_handle}</span>'

            contact_name = escape_html(lead.get("contact_person") or "")
            contact_meta = f" &bull; <b>Direct Contact:</b> {contact_name}" if contact_name else ""

            card_html = f"""
            <div class="card">
                <div class="card-title">#{overall_index}. {name}</div>
                <div class="meta-line">
                    <b>Website:</b> {website_link_html} &bull; 
                    <b>Location:</b> {city} &bull; 
                    <b>Status:</b> {status}{contact_meta}
                </div>

                <!-- EMAIL SECTION -->
                <div class="section-label email-label">&bull; Email Outreach</div>
                <div style="font-size: 9.5px; margin-bottom: 6px;">
                    <b>To:</b> <a href="mailto:{email}" style="color:#0284c7;">{email}</a> &nbsp;|&nbsp; 
                    <b>Subject:</b> <i>"{subject}"</i>
                </div>

                <!-- LINKEDIN SECTION -->
                <div class="section-label li-label">&bull; LinkedIn Connection Playbook</div>
                <div style="margin-bottom: 4px;">{li_actions_html}</div>
                <div class="msg-box">
                    <b>Ready-to-Copy LinkedIn Note (&lt;300 chars):</b><br/>
                    "{li_note}"
                </div>

                <!-- INSTAGRAM SECTION -->
                <div class="section-label ig-label">&bull; Instagram Direct Outreach</div>
                <div style="margin-bottom: 4px;">{ig_actions_html}</div>
                <div class="msg-box ig-box">
                    <b>Ready-to-Copy Instagram DM:</b><br/>
                    "{ig_dm}"
                </div>
            </div>
            """
            cards_html.append(card_html)

        footer_html = f"""
        <div class="footer">
            Page {page_idx} of {len(chunks)} &bull; Galileo &amp; Duke Automated Radar &bull; studio@galileoandduke.com
        </div>
        """
        cards_html.append(footer_html)

        page_html = f"""
        <html>
        <head>
            <style>{css}</style>
        </head>
        <body>
            {''.join(cards_html)}
        </body>
        </html>
        """

        page.insert_htmlbox(content_rect, page_html)

    # Save to file
    doc.save(output_filename)
    # Also save/overwrite latest copy for quick 1-click access
    doc.save(latest_filename)
    doc.close()

    print(f"\n[+] PDF DOSSIER GENERATED:")
    print(f"    &bull; Latest: {latest_filename}")
    print(f"    &bull; Archive: {output_filename}")

    return latest_filename
