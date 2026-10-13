import smtplib
import imaplib
import ssl
import time
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
        self.imap_host = "imap.secureserver.net"
        self.imap_port = 993

    def test_connection(self):
        """Verifies email credentials and connection."""
        if not self.password:
            return False, "SMTP_PASSWORD is not set. Please update your .env file."

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
            return True, "Successfully connected and authenticated!"
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
        Sends an outreach email via SMTP using standard RFC CRLF policy 
        and syncs to webmail Sent folder.
        """
        if not self.password:
            raise ValueError("SMTP_PASSWORD is missing in .env")

        user_prefix = to_email.split("@")[0].lower().strip() if "@" in to_email else ""
        if getattr(config, "IGNORE_INFO_EMAILS", True) and (user_prefix in ["info", "information"] or user_prefix.startswith("info.") or user_prefix.startswith("info_") or user_prefix.startswith("info-")):
            raise ValueError(f"Aborted send: '{to_email}' is a generic info email and IGNORE_INFO_EMAILS is enabled.")

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

        # 1. Send via SMTP with generous timeout (60s) and fallback retry
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
