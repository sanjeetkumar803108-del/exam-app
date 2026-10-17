# 🎓 Exam AI: Zero-Defect Global Question Generation & Verification Pipeline

A production-grade, multi-agent AI system designed to generate 100% authentic, curriculum-aligned, and verified examination questions for any standardized or competitive exam worldwide (e.g., AP Exams, SAT, GCSE, A-Levels, NEET, JEE, CBSE).

---

## 🌟 Key Architecture & Highlights

### 1. Two-Stage Autonomous Architecture
* **Stage 1 (One-Time Onboarding & Brain Initialization):**
  * Single Question Input: *"Aap kis exam ki tayyari kar rahe hain?"*
  * Autonomous Web Grounding: Discovers official examination authority and Top 10 authentic subjects (+ "Other" custom option).
  * Personal Exam Brain Vault: Fetches official syllabus units, official question archetypes (MCQ, FRQ, QQT, Structured Questions), and marking rubrics, locking it permanently into local memory.
* **Stage 2 (Progressive Daily Practice Engine):**
  * Dynamic Topic Scope & Capacity Pre-check (Quality-first vs. Syllabus-expansion choice).
  * Blueprint Lock & Subject Nature Guard (Enforces **0% numericals** for pure theoretical topics like History, Civics, Biology).

### 2. Dual-Agent 10-Question Batch Pipeline
* **Agent 1 (Generator):** Generates questions in 10-question batches using native exam terminology, misconception-based distractors, and clean KaTeX LaTeX notation.
* **Agent 2 (Strict Native Teacher Verifier):** Executes a strict 3-step audit:
  1. *Validity & Syllabus Alignment:* Checks logic and scientific soundness from all angles.
  2. *Options & Key Integrity:* Verifies unambiguous single correct answer and valid distractors.
  3. *Step-by-Step Bullet Explanations & KaTeX Sanitizer:* Verifies point-by-point logic and repairs all LaTeX syntax.
* **Auto-Correction Engine:** Flaws are automatically healed into clean, bug-free JSON.

### 3. Progressive Delivery (Zero-Waiting UX)
* **Batch 1 (First 10 Questions)** displays immediately on screen.
* **Subsequent batches** generate and verify seamlessly in the background with cross-batch deduplication memory.

---

## 🚀 Getting Started

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/sanjeetkumar803108-del/exam-app.git
cd exam-app
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and add your Google Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Start the Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🛠️ Tech Stack
* **Backend:** Node.js, Express, `jsonrepair`, Google Gemini API (`gemini-3.5-flash`, `gemini-3.1-flash-lite` with multi-model failover)
* **Frontend:** Modern Vanilla HTML5, CSS3 (Pristine White Minimalist Design), JavaScript (ES6+), KaTeX (Math & Science LaTeX Rendering)

---

## 🛡️ License
MIT License.
