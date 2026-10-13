import re
import json
import requests
import config

def format_html_pitch(plain_text):
    """Wraps plain text in modern responsive email styling with Galileo & Duke branding."""
    clean = plain_text.strip()
    paragraphs = clean.split("\n\n")
    html_paragraphs = []
    
    for p in paragraphs:
        if "best," in p.lower() or "moksh & varul" in p.lower():
            html_paragraphs.append(f"""  <p style="margin-bottom: 0;">
    Best,<br/>
    <strong>Moksh &amp; Varul</strong><br/>
    <span style="color: #666666; font-size: 13px;">Founders, <a href="{config.STUDIO_URL}" style="color: #666666; text-decoration: none;">Galileo &amp; Duke</a></span><br/>
    <span style="color: #888888; font-size: 12px;"><a href="mailto:{config.SENDER_EMAIL}" style="color: #888888;">{config.SENDER_EMAIL}</a> &bull; <a href="{config.STUDIO_URL}" style="color: #888888;">galileoandduke.com</a></span>
  </p>""")
        else:
            formatted_p = p.replace("\n", "<br/>")
            if config.STUDIO_URL not in formatted_p and "Galileo & Duke" in formatted_p:
                formatted_p = formatted_p.replace("Galileo & Duke", f'<a href="{config.STUDIO_URL}" style="color: #000000; font-weight: 600; text-decoration: underline;">Galileo &amp; Duke</a>')
            html_paragraphs.append(f"  <p>{formatted_p}</p>")

    return f"""<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 580px;">
{"".join(html_paragraphs)}
</div>""".strip()

def generate_pitch_with_gemini(agency_name, city=None, ig_handle=None, specialties=None, site_title=None, subject_template=None, contact_name=None, api_key=None):
    """
    Uses Google Gemini API (Free tier) to craft hyper-personalized cold outreach pitches.
    """
    key = api_key or getattr(config, "GEMINI_API_KEY", "").strip()
    if not key:
        return None

    clean_name = agency_name.strip() if agency_name else "team"
    location_str = f" in {city}" if city and city != "Unknown" else ""
    ig_str = f" ({ig_handle})" if ig_handle and ig_handle != "Not Listed" else ""
    spec_str = ", ".join(specialties) if specialties else "Marketing & Growth Campaigns"
    title_snippet = f"Website Tagline/Headline: {site_title}" if site_title else ""
    person_snippet = f"- Target Individual: {contact_name} at {clean_name}" if contact_name else f"- Target Agency: {clean_name}"
    greeting_rule = f"Address them directly as 'Hi {contact_name},'" if contact_name else f"Address them as 'Hi {clean_name} team,'"

    model = getattr(config, "GEMINI_MODEL", "gemini-2.0-flash").strip()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    
    prompt = f"""You are Moksh & Varul, co-founders of Galileo & Duke (https://www.galileoandduke.com), a premier creative web studio specializing in Next.js, Three.js 3D, and high-converting interactive websites.

Write a hyper-personalized, authentic, concise cold partnership pitch to this marketing agency.

Target Agency Profile:
{person_snippet}
- Location: {location_str or 'Australia'}
- Instagram: {ig_str or 'Active'}
- Core Services: {spec_str}
- {title_snippet}

Offer & Context:
Galileo & Duke acts as their white-label digital engineering partner. Because this agency focuses on marketing, PR, ads, and branding, and DOES NOT build websites in-house, they can sell high-ticket websites and custom landing pages to their clients under their brand, while we build them silently.

Writing Rules:
1. Tone & Greeting: Start with "{greeting_rule}". Warm, human, founder-to-founder peer conversation. Absolutely ZERO corporate fluff, cringe buzzwords, or robotic AI intros (never start with "I hope this email finds you well").
2. Subject line: Follow the clean enquiry format: "Enquiry for {clean_name}" or "Enquiry for {clean_name} — Web Development Partner".
3. Length: Maximum 3 to 4 punchy sentences/short paragraphs.
4. Call to Action: Low-friction (e.g. "Open to seeing a couple of recent websites we've built?").
5. Sign off:
Best,
Moksh & Varul
Founders, Galileo & Duke
studio@galileoandduke.com
https://www.galileoandduke.com

Respond in STRICT JSON:
{{
  "subject": "Enquiry for ...",
  "plain_text": "Hi {clean_name} team,\\n\\n...",
  "linkedin_note": "Under 300 char connection invite note to founder referencing their agency work and the white-label web partnership email.",
  "instagram_dm": "Friendly 2-sentence Instagram DM to agency account referencing your email pitch and white-label web builds."
}}
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 800
        }
    }

    try:
        resp = requests.post(url, json=payload, timeout=6)
        if resp.status_code == 200:
            result = resp.json()
            candidates = result.get("candidates", [])
            if candidates:
                part = candidates[0].get("content", {}).get("parts", [{}])[0]
                text = part.get("text", "").strip()
                
                match = re.search(r"\{.*\}", text, re.DOTALL)
                if match:
                    data = json.loads(match.group(0))
                    subject = data.get("subject", f"Enquiry for {clean_name}")
                    plain_text = data.get("plain_text", "").strip()
                    linkedin_note = data.get("linkedin_note", "").strip()
                    instagram_dm = data.get("instagram_dm", "").strip()
                    
                    if plain_text:
                        return {
                            "subject": subject,
                            "plain_text": plain_text,
                            "html_text": format_html_pitch(plain_text),
                            "linkedin_note": linkedin_note or f"Hi! Loved {clean_name}'s work. We run Galileo & Duke (web studio) - sent a note to your studio inbox regarding a white-label web partnership. Would love to connect!",
                            "instagram_dm": instagram_dm or f"Hey {clean_name} team! Loved your campaigns. Sent a quick note to your email about partnering as a white-label web studio for your clients. Open to checking out recent builds?",
                            "source": "gemini"
                        }
    except Exception:
        pass

    return None

def generate_template_pitch(agency_name, city=None, ig_handle=None, specialties=None, subject_template=None, contact_name=None):
    """
    Proven, high-converting standard template pitch used as baseline and fallback.
    """
    clean_name = agency_name.strip() if agency_name else "team"
    location_str = f" in {city}" if city and city != "Unknown" else ""
    ig_mention = f" and on Instagram ({ig_handle})" if ig_handle and ig_handle != "Not Listed" else ""
    greeting = f"Hi {contact_name}," if contact_name else f"Hi {clean_name} team,"

    template = subject_template or getattr(config, "EMAIL_SUBJECT_TEMPLATE", "Enquiry for {agency_name}")
    try:
        subject = template.format(agency_name=clean_name, clean_name=clean_name)
    except Exception:
        subject = template

    plain_body = f"""{greeting}

Loved your marketing work{location_str}{ig_mention} - really impressed by the campaigns and growth you drive for your clients.

I was looking through your services and noticed you don't offer website design or development.

We run Galileo & Duke (https://www.galileoandduke.com), a creative web studio that builds modern, high-converting interactive websites.

Whenever your marketing or advertising clients need a new website or landing page to go with your campaigns, we'd love to partner with you as your white-label web team. You handle the marketing and strategy; we build the website under your brand so you can offer complete web packages without needing to hire in-house developers.

Open to seeing a couple of recent websites we've built?

Best,
Moksh & Varul
Founders, Galileo & Duke
studio@galileoandduke.com
https://www.galileoandduke.com
"""

    linkedin_note = f"Hi! Loved {clean_name}'s creative campaigns{location_str}. We run Galileo & Duke (creative web studio) — sent a quick note to your studio inbox about partnering on white-label websites for your clients. Would love to connect here!"
    if len(linkedin_note) > 295:
        linkedin_note = f"Hi! Loved {clean_name}'s work. We run Galileo & Duke (web studio) - sent a note to your studio email about a white-label web partnership. Would love to connect here!"

    instagram_dm = f"Hey {clean_name} team! Loved your campaigns{location_str}. Shot a quick note to your team inbox about partnering as a white-label web studio for your clients whenever they need interactive sites or landing pages. Open to checking out recent builds?"

    return {
        "subject": subject,
        "plain_text": plain_body.strip(),
        "html_text": format_html_pitch(plain_body),
        "linkedin_note": linkedin_note.strip(),
        "instagram_dm": instagram_dm.strip(),
        "source": "template"
    }


def generate_marketing_pitch(agency_name, city=None, ig_handle=None, specialties=None, site_title=None, subject_template=None, contact_name=None):
    """
    Main generator: Uses Gemini AI when GEMINI_API_KEY is configured, 
    otherwise falls back to the high-converting default template.
    """
    if getattr(config, "GEMINI_API_KEY", ""):
        ai_pitch = generate_pitch_with_gemini(
            agency_name=agency_name,
            city=city,
            ig_handle=ig_handle,
            specialties=specialties,
            site_title=site_title,
            subject_template=subject_template,
            contact_name=contact_name
        )
        if ai_pitch:
            return ai_pitch

    return generate_template_pitch(
        agency_name=agency_name,
        city=city,
        ig_handle=ig_handle,
        specialties=specialties,
        subject_template=subject_template,
        contact_name=contact_name
    )

