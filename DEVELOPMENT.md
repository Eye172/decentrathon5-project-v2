# inVisionU — application and interview review platform

A structured admissions workflow that combines applications, voice interviews and explainable AI assessments for human reviewers.

**QwertyS · Decentrathon 5.0 · AI inDrive track · March–April 2026 · MVP**

## Workflow

Applicants complete a profile, an interactive life timeline, an essay and a situational judgement test before a recorded interview. Reviewers browse anonymized application lists, inspect interview recordings and compare criterion-based assessments with a rule-based baseline. **People make the final decision.**

- Multi-step applications and persistent applicant records.
- Generated interview questions, speech transcription and spoken prompts.
- A commission dashboard with anonymous IDs, assessment explanations and adjustable criteria.
- English, Russian and Kazakh interface.

## Architecture

**Frontend:** React, TypeScript, Vite and MediaPipe. **Backend:** Python, FastAPI, SQLite and JWT authentication. **AI integrations:** Anthropic for interview and scoring workflows; OpenAI Whisper and TTS for speech.

API routers separate authentication, applications, live interview sessions and commission access. Services manage transcription, generated questions, scoring and the comparison baseline. Interview transcripts and recordings are linked to the applicant record.

Camera-derived gaze and facial signals are experimental context in this MVP. They are not validated measures of honesty or applicant suitability. Live interview sessions currently reside in the API process; multi-instance deployment requires shared session storage or suitable routing.

## Run locally

Use Python and Node.js. Start the backend first:

```bash
cd backend
python -m venv .venv
# Activate the virtual environment for your shell.
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Set `ANTHROPIC_API_KEY` for the interview and assessment models, and `OPENAI_API_KEY` for the complete speech workflow. In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The development frontend proxies API requests to port 8000. SQLite tables and demonstration reviewer accounts are initialized by the backend.

## Team and contribution

Built by **[Shakhnazar Akhmer](https://github.com/Eye172)** and **[Nurkhan Aimukatov](https://github.com/pip00sya)** as **QwertyS** for Decentrathon 5.0, March 27–April 5, 2026. Shakhnazar worked on architecture, prompts, frontend and ML/CV integration. Nurkhan contributed quality assurance, testing, debugging and refinement.

[Original detailed documentation in Russian](README.original.md) retains the route reference, scripts, data model and full implementation notes. Use the environment templates for local configuration and keep service credentials outside version control.
