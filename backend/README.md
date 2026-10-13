# Galileo & Duke — B2B Outreach Backend Engine

FastAPI server powering agency discovery, email extraction, Gemini 2.0 AI pitch generation, Titan SMTP delivery, and PDF dossier generation.

## 🚀 Running Locally
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure credentials in .env
# Set SMTP credentials, GEMINI_API_KEY, etc.

# 3. Start server
python web_server.py
```
Server runs on: `http://localhost:8000` (or local network `http://0.0.0.0:8000`).

## ☁️ Deploying to Cloud (Render / Railway / Fly.io)
1. Point your cloud service to this `backend` folder.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn web_server:app --host 0.0.0.0 --port 8000`
4. Add your `.env` secrets into the cloud provider's Environment Variables dashboard.
