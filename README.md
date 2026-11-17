<div align="center">

# 📝 Noted.
### Clinical Symptom Timeline Builder & Pre-Visit Intelligence Platform

Turn unstructured, natural symptom logs into structured, doctor-ready timelines with AI normalization, pattern detection, treatment correlation, and specialty-tailored PDF exports.

[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-Better--SQLite3-003b57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Groq AI](https://img.shields.io/badge/Groq-LLaMA_3_70B-f55036?style=for-the-badge)](https://groq.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

</div>

---

## 🌟 Overview

During typical clinical encounters, patients struggle to accurately recount symptom frequencies, triggers, and severity over weeks or months. **Noted.** bridges this communication gap.

Patients can log symptoms using free-form natural language (e.g. *"Woke up with a pounding headache behind my left eye after 4 hours of broken sleep and staring at screens"*). The platform normalizes this data in real time, correlates it with treatments and contextual triggers, tracks longitudinal changes, and generates specialty-specific clinical consultation briefs before appointments.

---

## ✨ Key Features & Clinical Differentiators

### 1. 🤖 Groq AI Symptom Normalization
- Powered by **Groq Cloud API (LLaMA 3)** for ultra-fast, structured extraction.
- Automatically extracts:
  - **Standardized Symptom Entity** (e.g., *Migraine*, *Acid Reflux*, *Sciatica*, *Tension Headache*)
  - **Clinically Calibrated Severity (1–5)**
  - **Anatomical Body Location** (e.g., *Left Temple & Behind Eye*, *L4–L5 Lumbar Spine*, *Epigastrium*)
  - **Contextual Trigger Tags** (`poor_sleep`, `screen_time`, `caffeine`, `after_food`, `stress`, etc.)
  - **Temporal Stamping**

### 2. 📅 90-Day Longitudinal Activity Matrix & Heatmap
- Dense, GitHub-style interactive activity matrix mapping daily symptom occurrences and peak daily severity.
- Visualizes health fluctuations across Jun, Jul, Aug, and Sep with severity-colored intensity gradients.

### 3. 📊 Statistical Trigger Engine (with Daily Check-ins)
- A 30-second **daily check-in** records sleep, stress, caffeine, alcohol, exercise, screen time and custom factors on *every* day, including symptom-free ones.
- The unit of analysis is the patient-day. For every symptom × factor pair the engine builds a 2×2 table (symptom day vs symptom-free day, exposed vs not) and reports an **odds ratio with 95% CI** (Woolf, Haldane-corrected), a **Fisher exact p-value**, and a **Benjamini–Hochberg FDR q-value** across all tests.
- **Lagged effects**: tests both same-day and previous-day exposure (e.g. poor sleep yesterday → migraine today).
- Exposures come only from check-ins. Tags extracted from symptom entries exist only on symptom days, so using them would manufacture associations.
- Activates after 14 check-in days. Until then, co-occurrence and time-of-day patterns are shown, clearly labelled as *hypotheses*.
- Implementation: `server/stats.js` (pure functions, unit-tested).

### 3b. 🚨 Red-Flag Safety Escalation
- Every entry is screened **before and independently of the LLM** by deterministic rules (`server/redflags.js`) for emergencies: cardiac chest pain, thunderclap headache, stroke (FAST), breathing difficulty/anaphylaxis, seizure, cauda equina, suicidal language (English + Hinglish), plus urgent flags (meningitis triad, GI bleeding, fainting, new chest pain).
- Handles negation ("no chest pain", "not suicidal") without hiding real risk ("no idea why, but chest pain…").
- Shows a blocking alert with tap-to-call numbers (112/108, Tele-MANAS 14416, 911/988). The patient must acknowledge it, and the acknowledgement is timestamped.
- Flagged entries are badged in the timeline and listed under *Safety Alerts* in the doctor PDF.

### 4. 💊 Treatment & Medication Correlation Overlay
- Tracks ongoing and completed treatment trials (dosages, schedules, clinician notes).
- Automatically calculates pre- vs. post-treatment severity shifts to objectively evaluate treatment efficacy.

### 5. 🔄 Longitudinal Symptom Evolution (Diffing)
- Compares earlier vs. later halves of any selected observation window (30, 60, or 90 days).
- Quantifies exact percentage changes in frequency (+/- %) and severity (+/- %).
- Includes dynamic symptom selector across all logged entities.

### 6. ✏️ Retroactive Timeline Correction
- Full support for retroactive updates and timeline adjustments with edit timestamps and revision preservation.

### 7. 🩺 Specialty-Aware Doctor Reports & Question Predictors
- Interactive pre-visit summaries customized for:
  - 🧠 **Neurology** (*Headaches, migraines, visual aura, dizziness, brain fog*)
  - 🩺 **Gastroenterology** (*Acid reflux, bloating, epigastric cramps, nausea*)
  - 🦴 **Orthopedics & Physical Therapy** (*Spine, lumbar pain, muscle spasms, sciatica*)
  - 💓 **Mental Health & Cardiology** (*Anxiety, panic attacks, palpitations, insomnia*)
  - 🩺 **General Practice / PCP** (*Multisystem wellness and general timeline*)
- Predicts high-yield diagnostic questions clinicians are most likely to ask during the consultation.
- Generates one-click downloadable **PDF Clinical Reports** with frequency tables, treatment lists, and pattern summaries.

### 8. 🔎 Searchable Timeline & Data Export
- Search entries across natural-language notes, normalized symptoms, body locations, and trigger tags.
- Filter by date range and severity, then sort by recency or intensity.
- Export the active filtered view as a clinician-friendly CSV for portability.
- Safely edit or delete individual entries while preserving retroactive timestamp corrections.

### 9. ✅ Visit Preparation & Tracking Readiness
- Mark generated doctor questions as prepared before an appointment.
- Keep private, browser-local visit notes for changes and topics to discuss.
- See a transparent tracking-readiness guide based on recent logging coverage and contextual detail.
- Readiness is a data-completeness aid, not a medical or symptom severity score.

### 10. 🔗 Secure Clinician Share Links
- Send a doctor a **read-only link instead of an attachment**. The clinician needs no account and sees a live web summary plus a PDF.
- The patient sets **expiry** (24h–14 days), **look-back window** (30/60/90 days), a **maximum number of opens**, and whether the patient's own words are included or only structured data (HIPAA "minimum necessary").
- Links are **revocable instantly**. Only a SHA-256 of the token is stored, so a database leak exposes no live links.
- **Accounting of disclosures**: every open and PDF download is logged with time, user agent and a pseudonymised (HMAC) network address, visible to the patient.
- Responses carry `Referrer-Policy: no-referrer`, `Cache-Control: no-store` and `X-Robots-Tag: noindex`.
- Implementation: `server/sharing.js`, `src/components/SharePanel.jsx`, `src/pages/SharedReportPage.jsx`.

### 11. 🛡️ Tamper-Evident Timeline (Hash-Chained Audit Ledger)
- Every create, edit, delete and red-flag acknowledgement appends a ledger row whose SHA-256 hash covers the previous row. Rewriting history breaks the chain, and editing the database directly no longer matches the latest snapshot. **Both are detected.**
- Real **version history** for every entry (Edit → *Show version history*).
- **Recall-bias indicator**: the share of entries logged within 6 hours of onset, plus the median delay. A clinician can tell a real-time diary from one reconstructed the night before the visit.
- The integrity status and ledger head hash are printed on every PDF and shown in the clinician view.
- Limits: this proves the timeline matches what the patient recorded. It does not stop the server operator rebuilding the whole chain. Anchoring the head hash with an RFC 3161 timestamp authority would close that gap.
- Implementation: `server/ledger.js`.

### 12. 🏥 HL7 FHIR R4 Export & Data Rights
- One-click **FHIR R4 Bundle**: `Patient`, `Observation` (patient-reported, severity component, body site, context, safety-screen notes, `amended` status for edited entries) and `MedicationStatement`. It is importable by FHIR-capable EHRs and health-record platforms.
- Common symptoms carry **SNOMED CT** codes; the rest are sent as text, which FHIR allows. Have a clinical terminologist review `SNOMED_MAP` in `server/fhir.js` before production use.
- **Right of access / portability**: a full JSON archive (entries, check-ins, treatments, audit ledger, share access history).
- **Right to erasure** (GDPR Art. 17 / India DPDP Act 2023): password-confirmed account deletion that removes every record and kills all share links.
- Everything lives on the new **Privacy** page.

### 13. 🔐 Security Baseline
- Session tokens are 256-bit random values, **expire after 14 days** (`SESSION_TTL_DAYS`), are accepted **only in the `Authorization` header** (never the URL), and can be revoked by *logout* or *sign out of all devices*.
- **Rate limiting**: login (10 / 15 min per IP+email), registration, public share endpoints, and account deletion.
- Constant-time login failure (no account enumeration via timing), 8-character password minimum, case-insensitive email.
- Security headers, a CORS allow-list (`CORS_ORIGINS`), a 100 kB JSON body cap, and validated entry edits (severity 1–5, real timestamps, length limits).

---

## 🎨 User Interface & Design Philosophy

- **Bright & Modern**: Curated vibrant aesthetic with high-contrast typography and accessibility.
- **Glassmorphic Accents & Ambient Orbs**: Subtle background depth with glowing CSS radial gradients.
- **Micro-Animations & Smooth Transitions**: Interactive states, animated severity indicators, and pop-in cards.
- **Stateful Session Auth**: High-performance, clean UUID session tokens stored in SQLite (strictly avoiding JWT complexities).

---

## 👥 Demo Patient Accounts

The database comes pre-seeded with **640+ entries** across 90 continuous days for 5 distinct clinical profiles:

| Patient | Email | Password | Clinical Focus | Entries | Active Treatments |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Alice Vance** | `alice@test.com` | `password` | Neurological / Migraines | 131+ | Magnesium Glycinate 400mg, Sumatriptan 50mg, Propranolol (Trial) |
| **Bob Martinez** | `bob@test.com` | `password` | Gastroenterology / Reflux | 139+ | Omeprazole 20mg, Famotidine 20mg, Pepto-Bismol (Trial) |
| **Charlie Chen** | `charlie@test.com` | `password` | Orthopedic / Lumbar Spine | 130+ | Physical Therapy, Standing Desk Setup, Cyclobenzaprine (Trial) |
| **Diana Prince** | `diana@test.com` | `password` | Anxiety & Palpitations | 124+ | Ashwagandha KSM-66 600mg, MBSR Breathwork, Hydroxyzine (Trial) |
| **Evan Miller** | `evan@test.com` | `password` | Multisystem Fatigue | 124+ | Vitamin D3 5000 IU, CoQ10 200mg, Melatonin (Trial) |

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 19, Vite
- **Styling**: Vanilla CSS Design System with custom utility variables & Tailwind CSS
- **Data Visualization**: Recharts (Responsive bar and area charts)
- **Icons**: Lucide React
- **Date Utilities**: Date-fns

### Backend
- **Runtime**: Node.js (ES Modules)
- **Web Server**: Express.js with CORS & JSON body parsing
- **Database**: SQLite via `better-sqlite3` with Write-Ahead Logging (`WAL` mode)
- **AI Normalizer**: Groq SDK (`llama-3.3-70b-versatile` / `llama3-70b-8192`)
- **PDF Generation**: PDFKit (server-side stream generation)
- **Auth**: UUID v4 session management mapped to user profiles

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Groq API Key](https://console.groq.com/) (free tier available)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Yash151005/Symptomline.git
   cd Symptomline
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the project root:
   ```env
   PORT=3001
   GROQ_API_KEY=your_groq_api_key_here
   SESSION_SECRET=your_secret_key_here
   # Optional
   SESSION_TTL_DAYS=14                        # session lifetime
   CORS_ORIGINS=http://localhost:5173         # comma-separated allow-list
   AUDIT_SALT=long_random_string              # HMAC key for pseudonymised share-access IPs
   TRUST_PROXY=1                              # set when running behind a reverse proxy
   ```

4. **Seed the Database:**
   Populates dense 90-day histories for all 5 demo patients:
   ```bash
   npm run seed
   ```

5. **Start Development Servers:**
   - **Frontend Dev Server (Port 5173):**
     ```bash
     npm run dev
     ```
   - **Backend API Server (Port 3001):**
     ```bash
     npm run server
     ```

6. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```
   Log in with any of the demo accounts listed above or register a new account!

7. **Run the tests** (Node's built-in test runner; covers statistics, red-flag rules, the audit ledger, share links and FHIR mapping):
   ```bash
   npm test
   ```

---

## 🔌 API Architecture

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user and initialize health profile |
| `POST` | `/api/auth/login` | Authenticate user and issue session token |
| `GET` | `/api/entries` | List symptom entries for authenticated user |
| `POST` | `/api/entries` | Log new entry (normalizes text via Groq AI) |
| `PUT` | `/api/entries/:id` | Retroactive timeline update / entry correction |
| `DELETE` | `/api/entries/:id` | Remove symptom entry |
| `GET` | `/api/treatments` | Retrieve user active and past treatments |
| `POST` | `/api/treatments` | Add a new treatment regimen |
| `PUT` | `/api/treatments/:id` | Update treatment dates or notes |
| `DELETE` | `/api/treatments/:id` | Delete a treatment |
| `POST` | `/api/entries/:id/acknowledge-flags` | Record that the patient saw red-flag safety guidance |
| `GET` | `/api/checkins?days=30` | List daily check-ins |
| `GET` | `/api/checkins/:date` | Get the check-in for a date (`YYYY-MM-DD`) |
| `PUT` | `/api/checkins/:date` | Create or update a daily check-in |
| `GET` | `/api/triggers` | Trigger-engine status (days observed, tests run, significant findings) |
| `GET` | `/api/patterns` | Statistical trigger findings (OR, 95% CI, p, FDR q) + labelled descriptive hypotheses |
| `GET` | `/api/diff/:symptom` | Symptom evolution diff across historical windows |
| `GET` | `/api/questions/:specialty` | Specialty-specific predicted clinician questions |
| `GET` | `/api/report/:specialty/pdf` | Generate and download tailored PDF clinical summary |
| `GET` | `/api/stats` | Aggregate metrics (logged today, week, avg severity, patterns) |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `POST` | `/api/auth/logout-all` | Revoke every session for the user |
| `GET` | `/api/entries/:id/history` | Every recorded version of an entry (audit ledger) |
| `GET` | `/api/integrity` | Ledger verification + logging-timeliness (recall-bias) metrics |
| `GET` | `/api/shares` | List clinician share links with status and last access |
| `POST` | `/api/shares` | Create a link (`specialty`, `expires_in_hours`, `window_days`, `max_views`, `include_raw_text`); token returned once |
| `DELETE` | `/api/shares/:id` | Revoke a link |
| `GET` | `/api/shares/:id/access-log` | Accounting of disclosures for a link |
| `GET` | `/api/shared/:token` | **Public**: clinician summary for a valid link |
| `GET` | `/api/shared/:token/pdf` | **Public**: clinician PDF for an opened link |
| `GET` | `/api/export/fhir` | HL7 FHIR R4 Bundle |
| `GET` | `/api/export/json` | Complete data archive |
| `DELETE` | `/api/account` | Erase account and all data (requires `password`) |

---

## 📄 Medical Disclaimer

*Noted. is designed exclusively as an organizational and communication aid for patients and healthcare providers. It does not provide medical diagnoses, treatment plans, or clinical recommendations. Always consult a qualified physician for any health concerns or before making changes to any treatment regimen.*

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
