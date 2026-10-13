# Galileo & Duke — Agency Client Radar

Autonomous lead discovery, AI qualification, and cold outreach engine built for **Galileo & Duke** (White-Label Digital Engineering).

Includes a FastAPI backend automation engine, real-time SSE telemetry, and a mobile client app (Android APK + Web PWA) styled in luxury Silver & Obsidian Black.

---

## 📁 Repository Structure

```
├── GalileoDukeRadar.apk       # Ready-to-install Android mobile app (built with custom G&D branding)
│
├── backend/                   # Python FastAPI outreach engine & scrapers
│   ├── config.py              # Environment configuration & rate limits
│   ├── scraper.py             # DuckDuckGo agency discovery & search query engine
│   ├── extractor.py           # Deep website crawler (emails, LinkedIn, Instagram, tech stack)
│   ├── pitch_generator.py     # Gemini 2.0 AI tailored white-label pitch drafter
│   ├── mailer.py              # Titan / GoDaddy SMTP sender & DKIM/SPF safe delivery
│   ├── tracker.py             # CSV pipeline persistence & daily limit manager
│   ├── pdf_exporter.py        # Executive PDF dossier generator (ReportLab)
│   ├── web_server.py          # FastAPI REST API & Server-Sent Events (SSE) server
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example           # Example configuration template
│   └── README.md              # Backend setup and API documentation
│
└── frontend/                  # Mobile & Web client app
    ├── index.html             # Responsive mobile-first UI with native gesture layout
    ├── style.css              # Silver & Obsidian Black metallic luxury design system
    ├── app.js                 # Dynamic UI logic, real-time SSE stream & server switcher
    ├── logo.jpg               # Official Galileo & Duke circular monogram asset
    ├── manifest.json          # Web PWA manifest
    ├── capacitor.config.json  # Capacitor native bridge configuration
    ├── package.json           # Frontend dependencies
    ├── GalileoDukeRadar.apk   # Mirrored Android APK binary
    ├── android/               # Android Studio project with custom G&D launcher icons
    └── README.md              # Frontend & APK compilation guide
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Fill in GEMINI_API_KEY, SMTP credentials, etc.

python web_server.py
```
Backend runs at `http://0.0.0.0:8000` (accessible from both localhost and local Wi-Fi IP).

### 2. Mobile App (Android APK)

- Install `GalileoDukeRadar.apk` directly on any Android device.
- Open the app, tap the **⚙️ (Settings)** icon in the navigation dock.
- Under **SERVER CONFIGURATION**, tap **SERVER 🌐** and set your backend server URL (e.g. `http://YOUR_SERVER_IP:8000` or a deployed cloud HTTPS domain like `https://your-backend.onrender.com`).
- The app immediately connects to your live outreach radar, streams campaigns in real time, and allows one-tap PDF exports.

---

## 🛡️ Security

- Real credentials (`.env`, private keys) and production outreach data (`*.csv`, `*.pdf`) are strictly ignored by `.gitignore`.
- Always configure `.env` on your deployment host before launching live campaigns.
