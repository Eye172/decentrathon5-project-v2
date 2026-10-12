# inVision U: from applicant context to reviewable evidence

inVision U is the QwertyS prototype for Decentrathon 5.0's AI inDrive / inVision U
case. [The event record](HACKATHON.md) links the official event and Astana Hub
announcement. The project is presented as an MVP, without an award or verified
admissions-office deployment claim.

## Two roles need different views

The candidate journey collects a profile, life-map events, a focused written
response, situational tasks and an interview. The commission surface uses
candidate identifiers, comparative review and inspectable assessment context.
Anonymized presentation is a design choice; it does not by itself prove fairness.

The retained frontend is React 19 / TypeScript / Vite with multilingual resources,
motion and chart components. The Python backend uses FastAPI, SQLAlchemy and
SQLite. Routes separate authentication, candidate application, interviews,
commission access, scoring and video handling.

## Authentication and provider boundaries

The source implementation uses opaque random session tokens associated with
users; it does not implement the JWT scheme named in an older source overview.
The local prototype's authentication and storage are not evidence of enterprise
security certification. Recordings and in-memory interview state also require
additional operational controls before a real multi-instance deployment.

Model-generated interview questions/evaluation, Whisper transcription and speech
output are separate configured integrations. Browser speech and deterministic
prompt handling provide fallback paths. A visible AI label must not be used as
proof that a particular screenshot executed a live model call.

The implementation explores MediaPipe face-landmark telemetry. It is not a
validated measure of honesty, personality or applicant suitability. The older
landing's psychometric, zero-bias, GDPR and encryption marketing labels are not
established product results and are not used as portfolio evidence here.

## What the dated interface tour shows

The new 24-second walkthrough uses an isolated local checkout and a fresh,
explicitly fictional `Demo Applicant` account. It records a completed profile,
an event editor, a seven-event life map including one setback, and the next
focused-response prompt. Browser captures are assembled into a silent tour.

No essay was submitted, no interview was recorded, no provider was called and
no candidate was scored. The moment-selection prompt follows the deterministic
fallback. A minor translation-marker defect is visible in the retained prototype
life-map helper; it is not a product-validity or AI result.

## Inspect the code and run a local copy

The [public Decentrathon source](https://github.com/Eye172/decentrathon5-project-v2)
contains the original detailed guide, environment example and application code.
Its source overview has older wording; use the implementation and the bounds
above when interpreting claims about authentication or assessment validity.

```sh
cd backend
python -m venv .venv
# Activate the environment for your shell.
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

The development frontend proxies API requests to the backend. Configure your
own provider keys through the source's environment template when exercising
voice/model paths. The form-only tour does not require those calls. Do not use
real applicant records as demonstration fixtures.

The project is jointly attributed to Nurkhan Aimukatov and Shakhnazar Akhmer as
equal engineering partners. The public case study follows the team's confirmed
roles rather than reconstructing individual work from the older copy's prose
or commit counts.
