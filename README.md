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

### 3. 🔍 Confidence-Scored Pattern Detection
- Identifies trigger co-occurrences with statistical confidence scores (50%–95%).
- Time-of-day clustering (morning, afternoon, evening, night).
- Generates actionable clinical hypotheses and lifestyle suggestions.

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
| `GET` | `/api/patterns` | Confidence-scored trigger and treatment correlations |
| `GET` | `/api/diff/:symptom` | Symptom evolution diff across historical windows |
| `GET` | `/api/questions/:specialty` | Specialty-specific predicted clinician questions |
| `GET` | `/api/report/:specialty/pdf` | Generate and download tailored PDF clinical summary |
| `GET` | `/api/stats` | Aggregate metrics (logged today, week, avg severity, patterns) |

---

## 📄 Medical Disclaimer

*Noted. is designed exclusively as an organizational and communication aid for patients and healthcare providers. It does not provide medical diagnoses, treatment plans, or clinical recommendations. Always consult a qualified physician for any health concerns or before making changes to any treatment regimen.*

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).
