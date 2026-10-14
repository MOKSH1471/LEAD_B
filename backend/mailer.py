import smtplib
import imaplib
import ssl
import time
import requests
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
from email.policy import SMTP
import config

class TitanMailer:
    def __init__(self):
        self.host = config.SMTP_HOST
        self.port = config.SMTP_PORT
        self.user = config.SMTP_USER
        self.password = config.SMTP_PASSWORD
        self.sender_name = config.SENDER_NAME
        self.sender_email = config.SENDER_EMAIL
        self.reply_to = config.REPLY_TO
        self.resend_api_key = getattr(config, "RESEND_API_KEY", "").strip()
        self.resend_from_email = getattr(config, "RESEND_FROM_EMAIL", "").strip() or self.sender_email
        self.imap_host = "imap.secureserver.net"
        self.imap_port = 993

    @property
    def is_resend_active(self):
        return bool(self.resend_api_key)

    def test_connection(self):
        """Verifies email credentials and connection (Resend API or SMTP)."""
        if self.is_resend_active:
            try:
                headers = {
                    "Authorization": f"Bearer {self.resend_api_key}",
                    "Content-Type": "application/json"
                }
                resp = requests.get("https://api.resend.com/api_keys", headers=headers, timeout=10)
                if resp.status_code == 200:
                    return True, "Successfully connected to Resend HTTP API!"
                elif resp.status_code == 401:
                    return False, "Resend API key is invalid or unauthorized."
                else:
                    return False, f"Resend API check returned HTTP {resp.status_code}: {resp.text}"
            except Exception as e:
                return False, f"Resend API connection failed: {str(e)}"

        if not self.password:
            return False, "Neither RESEND_API_KEY nor SMTP_PASSWORD is set in configuration."

        try:
            if self.port == 465:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(self.host, self.port, context=context, timeout=45) as server:
                    server.login(self.user, self.password)
            else:
                with smtplib.SMTP(self.host, self.port, timeout=45) as server:
                    server.ehlo()
                    server.starttls()
                    server.login(self.user, self.password)
            return True, "Successfully connected and authenticated via SMTP!"
        except Exception as e:
            return False, f"Authentication failed: {str(e)}"

    def _save_to_sent_folder(self, raw_bytes):
        """Appends the sent email to your webmail 'Sent' folder via IMAP."""
        try:
            imap = imaplib.IMAP4_SSL(self.imap_host, self.imap_port, timeout=30)
            imap.login(self.user, self.password)
            imap.append('Sent', '\\Seen', imaplib.Time2Internaldate(time.time()), raw_bytes)
            imap.logout()
        except Exception:
            pass

    def send_email(self, to_email, subject, plain_text, html_text):
        """
        Sends an outreach email via Resend HTTP API (recommended on cloud/Render)
        or falls back to SMTP.
        """
        user_prefix = to_email.split("@")[0].lower().strip() if "@" in to_email else ""
        if getattr(config, "IGNORE_INFO_EMAILS", True) and (user_prefix in ["info", "information"] or user_prefix.startswith("info.") or user_prefix.startswith("info_") or user_prefix.startswith("info-")):
            raise ValueError(f"Aborted send: '{to_email}' is a generic info email and IGNORE_INFO_EMAILS is enabled.")

        # =========================================================================
        # METHOD 1: Resend HTTP REST API (Over HTTPS Port 443 - Never blocked on Render)
        # =========================================================================
        if self.is_resend_active:
            from_address = f"{self.sender_name} <{self.resend_from_email}>" if self.sender_name else self.resend_from_email
            headers = {
                "Authorization": f"Bearer {self.resend_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "from": from_address,
                "to": [to_email],
                "subject": subject,
                "html": html_text,
                "text": plain_text,
                "reply_to": self.reply_to or self.resend_from_email
            }
            
            try:
                resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=20)
                if resp.status_code in [200, 201]:
                    email_id = resp.json().get("id", "")
                    print(f"[+] [Resend HTTP API] Outreach successfully delivered to {to_email} (ID: {email_id})")
                    return True
                else:
                    err_msg = resp.text
                    try:
                        err_json = resp.json()
                        err_msg = err_json.get("message") or err_msg
                    except Exception:
                        pass
                    raise RuntimeError(f"Resend HTTP API returned error ({resp.status_code}): {err_msg}")
            except requests.exceptions.RequestException as req_err:
                raise RuntimeError(f"Resend HTTP request failed: {str(req_err)}")

        # =========================================================================
        # METHOD 2: Direct SMTP Fallback (Standard socket connection)
        # =========================================================================
        if not self.password:
            raise ValueError("Email delivery error: Neither RESEND_API_KEY nor SMTP_PASSWORD is configured.")

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{self.sender_name} <{self.sender_email}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="galileoandduke.com")
        msg["Reply-To"] = self.reply_to

        # Normalize any raw newlines to CRLF
        clean_plain = plain_text.replace("\r\n", "\n").replace("\n", "\r\n")
        clean_html = html_text.replace("\r\n", "\n").replace("\n", "\r\n")

        msg.attach(MIMEText(clean_plain, "plain", "utf-8"))
        msg.attach(MIMEText(clean_html, "html", "utf-8"))

        # Generate strictly RFC-compliant CRLF bytes using policy=SMTP
        raw_bytes = msg.as_bytes(policy=SMTP)

        sent = False
        last_err = None
        
        ports_to_try = [self.port]
        if self.port == 465:
            ports_to_try.append(587)
        elif self.port == 587:
            ports_to_try.append(465)

        for port in ports_to_try:
            try:
                if port == 465:
                    context = ssl.create_default_context()
                    with smtplib.SMTP_SSL(self.host, port, context=context, timeout=60) as server:
                        server.login(self.user, self.password)
                        server.sendmail(self.sender_email, [to_email], raw_bytes)
                else:
                    with smtplib.SMTP(self.host, port, timeout=60) as server:
                        server.ehlo()
                        server.starttls()
                        server.login(self.user, self.password)
                        server.sendmail(self.sender_email, [to_email], raw_bytes)
                sent = True
                break
            except Exception as e:
                last_err = e
                continue

        if not sent:
            raise last_err

        # 2. Sync to Webmail Sent folder
        self._save_to_sent_folder(raw_bytes)

        return True
