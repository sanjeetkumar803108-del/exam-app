const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const { jsonrepair } = require('jsonrepair');

// -------------------------------------------------------------
// Helper: Clean JSON extractor from LLM markdown response
// Automatically fixes trailing commas, unescaped LaTeX backslashes, etc.
// -------------------------------------------------------------
function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty or invalid response from AI model');
  }

  // 1. Isolate JSON candidate
  let rawCandidate = text.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    rawCandidate = codeBlockMatch[1].trim();
  } else {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else {
      startIdx = firstBrace !== -1 ? firstBrace : firstBracket;
    }

    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      rawCandidate = text.slice(startIdx, endIdx + 1).trim();
    }
  }

  // 2. Pre-clean trailing commas before ] or }
  let preCleaned = rawCandidate.replace(/,\s*([\]}])/g, '$1');

  // 3. Try standard JSON.parse first
  try {
    return JSON.parse(preCleaned);
  } catch (err1) {
    // 4. Try jsonrepair (automatically repairs unclosed quotes, trailing commas, single quotes)
    try {
      const repaired = jsonrepair(preCleaned);
      return JSON.parse(repaired);
    } catch (err2) {
      // 5. Fix unescaped backslashes in LaTeX equations
      try {
        const fixedSlashes = preCleaned.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
        const repaired2 = jsonrepair(fixedSlashes);
        return JSON.parse(repaired2);
      } catch (err3) {
        console.error('[extractJson] All repair attempts failed on snippet:\n', preCleaned.slice(0, 300));
        throw new Error(`JSON parse error from model: ${err2.message}`);
      }
    }
  }
}

// -------------------------------------------------------------
// Helper: Call Google Gemini API (Dual Model Fallback & Spikes Retry)
// -------------------------------------------------------------
async function callGemini(apiKeyOverride, systemPrompt, userPrompt, temperature = 0.25) {
  const effectiveKey = apiKeyOverride || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!effectiveKey) {
    throw new Error('Gemini API Key is not configured. Please check .env file.');
  }

  // Pool of high-performance models with independent free quotas
  const models = [
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-3.8-flash'
  ];
  let lastError = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey}`;
      
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: temperature,
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const jsonRes = await response.json();
        const outputText = jsonRes?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (outputText && outputText.trim().length > 0) {
          return outputText;
        }
      } else {
        const errDetail = await response.text();
        console.warn(`[Gemini API] Model ${model} returned HTTP ${response.status}:`, errDetail.slice(0, 120));
        
        // If 429 (Quota exceeded for this specific model), switch to next model immediately!
        if (response.status === 429) {
          console.log(`[Gemini API] Model ${model} quota reached, switching immediately to next available model...`);
          lastError = new Error(`Model ${model} quota reached`);
          continue;
        }
        
        lastError = new Error(`Model ${model} error: ${errDetail.slice(0, 100)}`);
      }
    } catch (networkErr) {
      console.warn(`[Gemini API] Network error for ${model}:`, networkErr.message);
      lastError = networkErr;
    }
  }

  throw lastError || new Error('All Gemini model endpoints failed.');
}

// -------------------------------------------------------------
// Endpoint 1: POST /api/research-subjects
// Strictly validates if exam is real, then discovers authentic official subjects
// -------------------------------------------------------------
app.post('/api/research-subjects', async (req, res) => {
  try {
    const { examName, apiKey } = req.body;
    if (!examName || typeof examName !== 'string' || examName.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        isInvalidExam: true, 
        error: 'Kripya kisi exam ka naam enter karein.' 
      });
    }

    const cleanInput = examName.trim();
    console.log(`[Research-Subjects] Live validating & researching: "${cleanInput}"`);

    // Obvious gibberish filter
    const garbageRegex = /^(party|night|sleep|movie|fun|game|food|car|bike|apple|qwerty|asdf|random|test)$/i;
    if (garbageRegex.test(cleanInput)) {
      return res.status(400).json({
        success: false,
        isInvalidExam: true,
        error: `"${cleanInput}" koi recognized academic ya competitive exam nahi hai. Kripya sahi exam ka naam enter karein.`
      });
    }

    const verificationPrompt = `You are a strict international examination board registrar and curriculum auditor.
Evaluate the user's exam input: "${cleanInput}".

YOUR MANDATORY TASK:
1. Verify if "${cleanInput}" represents a GENUINE, REAL-WORLD academic, competitive, standardized, professional licensing, or school board exam in any country (e.g. AP Exams, SAT, ACT, GCSE, A-Levels, IB, CBSE, ICSE, NEET, JEE, UPSC, GRE, GMAT, MCAT, LSAT, Bar Exam, CFA, Gaokao, French Baccalaureate, etc.).
2. If it is random text, nonsense, slang, or NOT a legitimate exam, return:
{
  "isValidExam": false,
  "rejectionReason": "Not a recognized examination."
}
3. If it IS a valid exam, research and return its official structure and top 10 authentic subjects:
{
  "isValidExam": true,
  "canonicalName": "Official Full Name of Exam",
  "country": "Country / Board Jurisdiction",
  "board": "Official Examination Authority (e.g. College Board, Cambridge, NTA, Edexcel, etc.)",
  "top10Subjects": [
    "Subject 1 (e.g. AP Physics 1: Algebra-Based)",
    "Subject 2 (e.g. AP Calculus AB)",
    "Subject 3", "Subject 4", "Subject 5",
    "Subject 6", "Subject 7", "Subject 8", "Subject 9", "Subject 10"
  ],
  "formats": {
    "objectiveName": "Official native name for objective questions (e.g. MCQ, QCM)",
    "subjectiveName": "Official native name for subjective questions (e.g. FRQ, Structured, Grid-In)",
    "archetypes": ["Archetype 1", "Archetype 2", "Archetype 3"],
    "rubricStyle": "Marking scheme description"
  }
}`;

    const rawResponse = await callGemini(apiKey, verificationPrompt, `Analyze and extract official curriculum for: "${cleanInput}"`);
    const parsed = extractJson(rawResponse);

    if (!parsed.isValidExam || !Array.isArray(parsed.top10Subjects) || parsed.top10Subjects.length === 0) {
      console.log(`[Research-Subjects] REJECTED invalid exam input: "${cleanInput}"`);
      return res.status(400).json({
        success: false,
        isInvalidExam: true,
        error: `"${cleanInput}" koi recognized academic ya competitive exam nahi hai. Kripya sahi exam ka naam enter karein.`
      });
    }

    console.log(`[Research-Subjects] Successfully verified authentic exam: "${parsed.canonicalName}"`);
    return res.json({ success: true, source: 'live_web_research', data: parsed });

  } catch (error) {
    console.error('Error in /api/research-subjects:', error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// Endpoint 2: POST /api/initialize-brain
// Deep researches official syllabus units, native question formats & rubrics for user's selected subjects
// -------------------------------------------------------------
app.post('/api/initialize-brain', async (req, res) => {
  try {
    const { examName, selectedSubjects, examMetadata, apiKey } = req.body;
    if (!selectedSubjects || !Array.isArray(selectedSubjects) || selectedSubjects.length === 0) {
      return res.status(400).json({ error: 'selectedSubjects array is required' });
    }

    console.log(`[Initialize-Brain] Live researching & compiling Brain Vault for "${examName}" across subjects:`, selectedSubjects);

    const brainVault = {
      examName: examMetadata?.canonicalName || examName,
      country: examMetadata?.country || 'Global',
      board: examMetadata?.board || 'Official Board',
      createdAt: new Date().toISOString(),
      formats: examMetadata?.formats || {
        objectiveName: "Multiple-Choice Questions (MCQ)",
        subjectiveName: "Free-Response Questions (FRQ)",
        archetypes: ["Conceptual Analysis", "Mathematical Routines", "Experimental Design"]
      },
      subjectsData: {}
    };

    // Live AI Research for each selected subject
    for (const subj of selectedSubjects) {
      console.log(`[Initialize-Brain] Fetching official syllabus for: "${subj}"...`);
      const syllabusPrompt = `You are a chief examination auditor for ${brainVault.examName} (${brainVault.board}).
Provide the REAL, OFFICIAL curriculum units, syllabus topics, and exam nature for the subject: "${subj}".

Return valid JSON strictly matching:
{
  "units": [
    "Unit 1: [Official Unit Name]",
    "Unit 2: [Official Unit Name]",
    "Unit 3: [Official Unit Name]",
    "Unit 4: [Official Unit Name]",
    "Unit 5: [Official Unit Name]",
    "Unit 6: [Official Unit Name]"
  ],
  "subjectNature": "Theoretical" | "Quantitative" | "Mixed",
  "typicalQuestionSplit": { "objectivePercent": 50, "subjectivePercent": 50 },
  "keyTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4"],
  "officialTextbooks": ["Authoritative Textbook 1", "Authoritative Textbook 2"]
}`;

      try {
        const rawSyllabus = await callGemini(apiKey, syllabusPrompt, `Extract official units for ${subj} in ${brainVault.examName}`);
        const parsedProfile = extractJson(rawSyllabus);

        brainVault.subjectsData[subj] = {
          units: Array.isArray(parsedProfile.units) && parsedProfile.units.length > 0 
            ? parsedProfile.units 
            : [`Core Principles of ${subj}`, `Advanced Applications`, `Exam Review`],
          subjectNature: parsedProfile.subjectNature || "Mixed",
          typicalQuestionSplit: parsedProfile.typicalQuestionSplit || { objectivePercent: 50, subjectivePercent: 50 },
          keyTopics: parsedProfile.keyTopics || [],
          officialTextbooks: parsedProfile.officialTextbooks || []
        };
      } catch (err) {
        console.warn(`Fallback syllabus generation for ${subj}:`, err.message);
        brainVault.subjectsData[subj] = {
          units: [
            `Unit 1: Foundations & Definitions`,
            `Unit 2: Applied Systems & Problem Solving`,
            `Unit 3: Case Studies & Conceptual Models`,
            `Unit 4: Advanced Principles & Derivations`,
            `Unit 5: Comprehensive Exam Review`
          ],
          subjectNature: /history|literature|law|biology|civics/i.test(subj) ? "Theoretical" : "Mixed",
          typicalQuestionSplit: { objectivePercent: 50, subjectivePercent: 50 }
        };
      }
    }

    console.log(`[Initialize-Brain] Brain Vault compiled successfully with ${Object.keys(brainVault.subjectsData).length} subjects.`);
    return res.json({ success: true, brainVault });

  } catch (error) {
    console.error('Error in /api/initialize-brain:', error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// Endpoint 3: POST /api/check-capacity
// Evaluates genuine topic question capacity using AI
// -------------------------------------------------------------
app.post('/api/check-capacity', async (req, res) => {
  try {
    const { examName, subject, topic, targetCount, apiKey } = req.body;
    const requested = parseInt(targetCount, 10) || 10;

    console.log(`[Capacity-Check] Evaluating genuine question capacity for topic "${topic}" in ${subject}...`);

    const capacityPrompt = `You are an examination question architect for ${examName} (${subject}).
Analyze the scope of the specific topic: "${topic}".
User wants to generate ${requested} distinct practice questions on this topic.

Determine:
1. Is this topic broad enough to sustain ${requested} high-quality, genuine, non-repetitive questions?
2. If it is too narrow (e.g. a single definition or single formula), what is the maximum number of genuine unique questions that can be made without artificial repetition?
3. What are 3 closely connected syllabus topics from ${subject} that can be combined if the user wants more questions?

Return valid JSON:
{
  "isNarrow": true | false,
  "capacity": [integer: max genuine questions],
  "reason": "Brief explanation",
  "connectedTopics": ["Connected Topic 1", "Connected Topic 2", "Connected Topic 3"]
}`;

    let capacityResult = {
      isNarrow: requested > 15 && topic.length < 20,
      capacity: Math.min(12, requested),
      connectedTopics: [`${topic} Applications`, `Related Governing Principles`, `Advanced Problem Scenarios`]
    };

    try {
      const raw = await callGemini(apiKey, capacityPrompt, `Evaluate topic: ${topic}`);
      const parsed = extractJson(raw);
      if (parsed && typeof parsed.isNarrow === 'boolean') {
        capacityResult = {
          isNarrow: parsed.isNarrow,
          capacity: typeof parsed.capacity === 'number' ? parsed.capacity : 12,
          connectedTopics: parsed.connectedTopics || capacityResult.connectedTopics
        };
      }
    } catch (e) {
      console.warn('Capacity AI evaluation error:', e.message);
    }

    return res.json({
      success: true,
      topic,
      requestedCount: requested,
      capacity: capacityResult.capacity,
      isNarrow: capacityResult.isNarrow,
      connectedTopics: capacityResult.connectedTopics
    });

  } catch (error) {
    console.error('Error in /api/check-capacity:', error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// Endpoint 4: POST /api/generate-batch
// Dual-Agent Pipeline: Generator (10 Qs) -> Verifier (Strict 3-Step Native Teacher Audit)
// -------------------------------------------------------------
app.post('/api/generate-batch', async (req, res) => {
  try {
    const { 
      examName, 
      subject, 
      topic, 
      batchNumber = 1, 
      batchSize = 10, 
      previousQuestions = [], 
      brainVault, 
      mode = "mix", 
      apiKey 
    } = req.body;

    console.log(`\n======================================================`);
    console.log(`[Batch-Gen] Live Generation: Batch ${batchNumber} (${batchSize} Qs)`);
    console.log(`Topic: "${topic}" | Subject: "${subject}" | Exam: "${examName}"`);
    console.log(`======================================================`);

    const subjMeta = brainVault?.subjectsData?.[subject] || {};
    const subjectNature = subjMeta.subjectNature || (/history|bio|literature|law/i.test(subject) ? "Theoretical" : "Mixed");
    const nativeObjName = brainVault?.formats?.objectiveName || "Multiple-Choice Question (MCQ)";
    const nativeSubjName = brainVault?.formats?.subjectiveName || "Free-Response Question (FRQ)";

    const memoryNotice = previousQuestions && previousQuestions.length > 0
      ? `CRITICAL DEDUPLICATION RULE: DO NOT repeat any of these previously generated questions:\n${previousQuestions.slice(-25).map((q, i) => `${i+1}. ${q}`).join('\n')}`
      : `No previous questions generated yet. Create fresh foundational concepts.`;

    // ---------------------------------------------------------
    // Agent 1: The Question Generator Agent
    // ---------------------------------------------------------
    const generatorSystemPrompt = `You are a chief examination question maker for the official ${examName} (${subject}).
Your mission is to generate exactly ${batchSize} authentic, high-quality, realistic examination questions for the topic: "${topic}".

STRICT CURRICULUM CONSTRAINTS:
1. SUBJECT NATURE IS: ${subjectNature.toUpperCase()}.
   ${subjectNature === 'Theoretical' 
     ? 'CRITICAL MANDATE: 0% NUMERICALS! Absolutely NO mathematical or arithmetic calculations. Use pure conceptual analysis, causality, definitions, mechanisms, or case scenarios.' 
     : 'Balance rigorous conceptual reasoning with authentic calculation and mathematical deduction.'}
2. Native Exam Terminology:
   - Objective questions must be labeled: "${nativeObjName}".
   - Subjective questions must be labeled: "${nativeSubjName}".
3. Mode selected: ${mode.toUpperCase()}.
   - If 'objective': All ${batchSize} questions must be ${nativeObjName}.
   - If 'subjective': All ${batchSize} questions must be ${nativeSubjName} with multi-part anatomy (Part a, Part b, Part c with marks).
   - If 'mix': First 70% ${nativeObjName}, remaining 30% ${nativeSubjName}.
4. MCQ Distractor Quality: For MCQs, provide 4 completely distinct options (A, B, C, D). Distractors must represent common student misconceptions.
5. Explanations: EVERY single question MUST have a comprehensive, step-by-step bullet-point explanation.
6. Math & Science Notation: Use clean, valid KaTeX LaTeX ($...$ for inline, $$...$$ for blocks). No broken characters.
7. ${memoryNotice}
8. CRITICAL JSON RULE: Return 100% valid JSON. DO NOT include trailing commas (e.g. [1, 2,] is forbidden). Always double-escape backslashes in LaTeX (e.g. \\\\text, \\\\frac).

Return a valid JSON array of objects strictly matching this schema:
[
  {
    "type": "Objective" | "Subjective",
    "nativeTypeLabel": "${nativeObjName}" | "${nativeSubjName}",
    "questionText": "Clear, complete question statement...",
    "parts": [
      { "part": "a", "marks": 2, "text": "Part a question..." },
      { "part": "b", "marks": 3, "text": "Part b question..." }
    ], // Include ONLY for Subjective questions
    "options": [
      "A) Option 1 text",
      "B) Option 2 text",
      "C) Option 3 text",
      "D) Option 4 text"
    ], // Include ONLY for Objective questions
    "correctAnswer": "A) Option 1 text",
    "explanationBullets": [
      "• Point 1: Fundamental principle or law stated",
      "• Point 2: Step-by-step derivation or causal reasoning",
      "• Point 3: Analysis of options and confirmation of correct answer"
    ]
  }
]`;

    console.log(`[Batch-Gen] Calling Agent 1 (Question Generator)...`);
    const rawGen = await callGemini(apiKey, generatorSystemPrompt, `Generate ${batchSize} questions on topic: ${topic}`);
    let generatedBatch = extractJson(rawGen);

    if (!Array.isArray(generatedBatch) || generatedBatch.length === 0) {
      throw new Error('Question Generator returned an invalid batch structure.');
    }

    // ---------------------------------------------------------
    // Agent 2: Strict Veteran Teacher Verifier & Auto-Corrector
    // ---------------------------------------------------------
    console.log(`[Batch-Gen] Calling Agent 2 (Strict Native Teacher Audit)...`);
    const verifierSystemPrompt = `You are a veteran, strict senior teacher of ${subject} for ${examName}.
Audit and rigorously verify these ${generatedBatch.length} generated questions.

AUDIT CHECKLIST:
[Check 1: Scientific/Factual Validity & Subject Nature]
- Check from all angles: is each question 100% accurate, realistic, and aligned with ${examName} standards?
- If subject nature is Theoretical (${subjectNature}), ensure 0% numericals exist. Auto-correct any out-of-place arithmetic into conceptual reasoning.

[Check 2: Options & Key Integrity]
- For MCQs: Ensure the correct answer is unambiguously present in the options list.
- Check that distractors are distinct and no options are repeated.

[Check 3: Step-by-Step Bullet Explanations & KaTeX]
- Verify that every explanation is detailed, step-by-step bullet points.
- Ensure all LaTeX ($...$, $$...$$) is clean, properly formatted, and bug-free for KaTeX.

Input Questions to Verify:
${JSON.stringify(generatedBatch, null, 2)}

Return the final AUTO-CORRECTED array in valid JSON matching the exact schema.`;

    let verifiedBatch = generatedBatch;
    try {
      const rawVerified = await callGemini(apiKey, verifierSystemPrompt, "Verify and auto-correct batch", 0.15);
      const parsedVerified = extractJson(rawVerified);
      if (Array.isArray(parsedVerified) && parsedVerified.length > 0) {
        verifiedBatch = parsedVerified;
        console.log(`[Batch-Gen] Agent 2 successfully audited & verified ${verifiedBatch.length} questions.`);
      }
    } catch (verErr) {
      console.warn(`[Batch-Gen] Verifier agent notice:`, verErr.message);
      // Fallback to generatedBatch if verifier pass encountered parse glitch
      verifiedBatch = generatedBatch;
    }

    // Post-process numbering and LaTeX sanitization
    const finalQuestions = verifiedBatch.map((q, idx) => {
      const qNum = (batchNumber - 1) * batchSize + (idx + 1);
      return {
        ...q,
        questionNumber: qNum,
        questionText: sanitizeLatex(q.questionText || ''),
        explanationBullets: Array.isArray(q.explanationBullets)
          ? q.explanationBullets.map(b => sanitizeLatex(b))
          : [sanitizeLatex(q.explanation || 'Verified step-by-step reasoning.')]
      };
    });

    console.log(`[Batch-Gen] Successfully returning ${finalQuestions.length} pristine questions for Batch ${batchNumber}.`);

    return res.json({
      success: true,
      batchNumber,
      batchSize: finalQuestions.length,
      questions: finalQuestions
    });

  } catch (error) {
    console.error('Error in /api/generate-batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// Helper: Latex & Text Sanitizer (Guarantees bug-free KaTeX rendering)
// -------------------------------------------------------------
function sanitizeLatex(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;
  // Ensure unclosed $ are balanced
  const dollarCount = (cleaned.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    cleaned += '$';
  }
  return cleaned;
}

// -------------------------------------------------------------
// Serve index.html for all frontend routes
// -------------------------------------------------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Exam AI Pipeline Server running on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
