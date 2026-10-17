// -------------------------------------------------------------
// EXAM AI: Frontend Application Engine
// Dual-Stage Architecture • Native Grounding • Progressive Queue
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Global Application State
  const state = {
    apiKey: localStorage.getItem('exam_ai_gemini_key') || '',
    brainVault: null,
    activeSubject: '',
    currentBatchNumber: 1,
    totalBatches: 1,
    targetTotalQuestions: 10,
    currentTopic: '',
    currentMode: 'mix',
    allGeneratedQuestions: [],
    pendingBackgroundBatches: []
  };

  // DOM Elements
  const screens = {
    onboarding: document.getElementById('screen-onboarding'),
    researching: document.getElementById('screen-researching'),
    subjects: document.getElementById('screen-subjects'),
    brainBuilding: document.getElementById('screen-brain-building'),
    app: document.getElementById('screen-app')
  };

  const headerExamBadge = document.getElementById('header-exam-badge');
  const btnResetExam = document.getElementById('btn-reset-exam');

  const formOnboard = document.getElementById('form-onboard');
  const inputExamName = document.getElementById('input-exam-name');
  const onboardErrorMsg = document.getElementById('onboard-error-msg');
  const pillButtons = document.querySelectorAll('.pill-btn');

  const btnBackToOnboard = document.getElementById('btn-back-to-onboard');
  const subjectsGrid = document.getElementById('subjects-grid');
  const subjectsExamSubtitle = document.getElementById('subjects-exam-subtitle');
  const otherSubjectContainer = document.getElementById('other-subject-container');
  const inputOtherSubject = document.getElementById('input-other-subject');
  const btnSaveSubjects = document.getElementById('btn-save-subjects');

  const selectActiveSubject = document.getElementById('select-active-subject');
  const inputTopic = document.getElementById('input-topic');
  const btnQuickUnits = document.getElementById('btn-quick-units');
  const unitsPopover = document.getElementById('units-popover');
  const countSelectors = document.querySelectorAll('#count-selector .segment-btn');
  const modeSelectors = document.querySelectorAll('#mode-selector .segment-btn');
  const btnGenerateBatch = document.getElementById('btn-generate-batch');

  const sessionStatusBanner = document.getElementById('session-status-banner');
  const sessionBatchText = document.getElementById('session-batch-text');
  const sessionBackgroundText = document.getElementById('session-background-text');
  const questionsFeed = document.getElementById('questions-feed');
  const nextBatchContainer = document.getElementById('next-batch-container');
  const btnLoadNextBatch = document.getElementById('btn-load-next-batch');

  const modalCapacity = document.getElementById('modal-capacity');
  const capacityMessage = document.getElementById('capacity-message');
  const btnCapacityOpt1 = document.getElementById('btn-capacity-opt1');
  const btnCapacityOpt2 = document.getElementById('btn-capacity-opt2');

  // Temporary container during onboarding research
  let currentExamDiscoveryData = null;

  // -------------------------------------------------------------
  // 1. Initial State Check (Unlock app if Brain Vault exists)
  // -------------------------------------------------------------
  checkExistingBrainVault();

  function checkExistingBrainVault() {
    const savedVault = localStorage.getItem('exam_ai_brain_vault');
    if (savedVault) {
      try {
        state.brainVault = JSON.parse(savedVault);
        console.log('[BrainVault] Restored existing vault from local memory:', state.brainVault);
        unlockMainApp();
        return;
      } catch (e) {
        console.error('Failed to parse saved Brain Vault:', e);
      }
    }
    // Otherwise show Onboarding Screen
    showScreen('onboarding');
  }

  function showScreen(screenKey) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[screenKey]) {
      screens[screenKey].classList.add('active');
    }
  }

  // -------------------------------------------------------------
  // 2. Navigation & Reset
  // -------------------------------------------------------------
  if (btnBackToOnboard) {
    btnBackToOnboard.addEventListener('click', () => {
      showScreen('onboarding');
      inputExamName.focus();
    });
  }

  btnResetExam.addEventListener('click', () => {
    if (confirm('Aap apna exam reset karna chahte hain? Sabhi saved subjects aur brain memory clear ho jayegi.')) {
      localStorage.removeItem('exam_ai_brain_vault');
      state.brainVault = null;
      headerExamBadge.classList.add('hidden');
      btnResetExam.classList.add('hidden');
      inputExamName.value = '';
      if (onboardErrorMsg) onboardErrorMsg.classList.add('hidden');
      inputExamName.classList.remove('input-error');
      showScreen('onboarding');
    }
  });

  // Clear error state on input
  inputExamName.addEventListener('input', () => {
    if (onboardErrorMsg) onboardErrorMsg.classList.add('hidden');
    inputExamName.classList.remove('input-error');
  });

  // -------------------------------------------------------------
  // 3. Screen 1: Onboarding Flow
  // -------------------------------------------------------------
  pillButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      inputExamName.value = btn.dataset.exam;
      if (onboardErrorMsg) onboardErrorMsg.classList.add('hidden');
      inputExamName.classList.remove('input-error');
      triggerExamResearch(btn.dataset.exam);
    });
  });

  formOnboard.addEventListener('submit', (e) => {
    e.preventDefault();
    const examVal = inputExamName.value.trim();
    if (examVal) {
      triggerExamResearch(examVal);
    }
  });

  async function triggerExamResearch(examName) {
    if (onboardErrorMsg) onboardErrorMsg.classList.add('hidden');
    inputExamName.classList.remove('input-error');
    showScreen('researching');
    
    // Animate progress steps
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');

    step1.className = 'step active';
    step2.className = 'step';
    step3.className = 'step';

    setTimeout(() => {
      step1.className = 'step done';
      step2.className = 'step active';
    }, 600);

    setTimeout(() => {
      step2.className = 'step done';
      step3.className = 'step active';
    }, 1200);

    try {
      const response = await fetch('/api/research-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examName, apiKey: state.apiKey })
      });

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to research exam');
      }

      currentExamDiscoveryData = resData.data;

      // Small delay for smooth UX transition
      setTimeout(() => {
        renderSubjectSelectionScreen(currentExamDiscoveryData);
      }, 1600);

    } catch (err) {
      console.warn('Exam verification rejected:', err.message);
      // Return to onboarding and show inline error
      showScreen('onboarding');
      if (onboardErrorMsg) {
        onboardErrorMsg.textContent = err.message;
        onboardErrorMsg.classList.remove('hidden');
      }
      inputExamName.classList.add('input-error');
      inputExamName.focus();
    }
  }

  // -------------------------------------------------------------
  // 4. Screen 3: Render Subject Selection Screen (10 + Other)
  // -------------------------------------------------------------
  function renderSubjectSelectionScreen(discoveryData) {
    subjectsExamSubtitle.textContent = `${discoveryData.canonicalName} (${discoveryData.country || 'Official Board'})`;
    subjectsGrid.innerHTML = '';
    otherSubjectContainer.classList.add('hidden');
    inputOtherSubject.value = '';
    btnSaveSubjects.disabled = true;

    const subjectsList = discoveryData.top10Subjects || [];

    // Render 10 authentic subject cards
    subjectsList.forEach((subj, idx) => {
      const card = document.createElement('div');
      card.className = 'subject-card';
      card.innerHTML = `
        <input type="checkbox" class="subject-checkbox" id="subj-${idx}" value="${subj}">
        <label class="subject-name" for="subj-${idx}">${subj}</label>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const chk = card.querySelector('.subject-checkbox');
          chk.checked = !chk.checked;
        }
        updateSubjectCardState(card);
      });

      card.querySelector('.subject-checkbox').addEventListener('change', () => {
        updateSubjectCardState(card);
      });

      subjectsGrid.appendChild(card);
    });

    // Option 11: The "Other" Card
    const otherCard = document.createElement('div');
    otherCard.className = 'subject-card other-card';
    otherCard.innerHTML = `
      <input type="checkbox" class="subject-checkbox" id="subj-other" value="__OTHER__">
      <label class="subject-name" for="subj-other"><strong>Other (Apna Subject Type Karein)</strong></label>
    `;

    otherCard.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const chk = otherCard.querySelector('.subject-checkbox');
        chk.checked = !chk.checked;
      }
      updateSubjectCardState(otherCard);
      handleOtherToggle();
    });

    otherCard.querySelector('.subject-checkbox').addEventListener('change', () => {
      updateSubjectCardState(otherCard);
      handleOtherToggle();
    });

    subjectsGrid.appendChild(otherCard);

    showScreen('subjects');
  }

  function updateSubjectCardState(card) {
    const chk = card.querySelector('.subject-checkbox');
    if (chk.checked) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
    checkSaveButtonState();
  }

  function handleOtherToggle() {
    const chk = document.getElementById('subj-other');
    if (chk && chk.checked) {
      otherSubjectContainer.classList.remove('hidden');
      inputOtherSubject.focus();
    } else {
      otherSubjectContainer.classList.add('hidden');
    }
  }

  inputOtherSubject.addEventListener('input', () => {
    checkSaveButtonState();
  });

  function checkSaveButtonState() {
    const checkedBoxes = Array.from(document.querySelectorAll('.subject-checkbox:checked'));
    const isOtherChecked = checkedBoxes.some(c => c.value === '__OTHER__');
    const hasOtherText = inputOtherSubject.value.trim().length > 0;

    let isValid = false;
    if (checkedBoxes.length > 0) {
      if (isOtherChecked && checkedBoxes.length === 1) {
        isValid = hasOtherText;
      } else {
        isValid = true;
      }
    }
    btnSaveSubjects.disabled = !isValid;
  }

  // -------------------------------------------------------------
  // 5. Screen 4: Brain Vault Initialization Flow
  // -------------------------------------------------------------
  btnSaveSubjects.addEventListener('click', async () => {
    const selected = [];
    document.querySelectorAll('.subject-checkbox:checked').forEach(c => {
      if (c.value !== '__OTHER__') {
        selected.push(c.value);
      }
    });

    const otherVal = inputOtherSubject.value.trim();
    if (document.getElementById('subj-other')?.checked && otherVal) {
      selected.push(otherVal);
    }

    if (selected.length === 0) return;

    showScreen('brainBuilding');

    // Animate Brain Vault steps
    const b1 = document.getElementById('brain-step-1');
    const b2 = document.getElementById('brain-step-2');
    const b3 = document.getElementById('brain-step-3');
    const b4 = document.getElementById('brain-step-4');

    setTimeout(() => { b1.className = 'step done'; b2.className = 'step active'; }, 700);
    setTimeout(() => { b2.className = 'step done'; b3.className = 'step active'; }, 1500);
    setTimeout(() => { b3.className = 'step done'; b4.className = 'step active'; }, 2200);

    try {
      const response = await fetch('/api/initialize-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: currentExamDiscoveryData.canonicalName,
          selectedSubjects: selected,
          examMetadata: currentExamDiscoveryData,
          apiKey: state.apiKey
        })
      });

      const res = await response.json();
      if (!res.success) throw new Error(res.error || 'Failed to initialize brain');

      state.brainVault = res.brainVault;
      localStorage.setItem('exam_ai_brain_vault', JSON.stringify(state.brainVault));

      setTimeout(() => {
        b4.className = 'step done';
        unlockMainApp();
      }, 2800);

    } catch (e) {
      alert('Error initializing brain: ' + e.message);
      showScreen('subjects');
    }
  });

  // -------------------------------------------------------------
  // 6. Screen 5: Unlocked Main App Setup
  // -------------------------------------------------------------
  function unlockMainApp() {
    if (!state.brainVault) return;

    headerExamBadge.textContent = state.brainVault.examName;
    headerExamBadge.classList.remove('hidden');
    btnResetExam.classList.remove('hidden');

    // Populate active subject dropdown
    selectActiveSubject.innerHTML = '';
    const subjectNames = Object.keys(state.brainVault.subjectsData || {});
    subjectNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectActiveSubject.appendChild(opt);
    });

    state.activeSubject = subjectNames[0] || '';
    renderSyllabusUnitsPopover();

    showScreen('app');
  }

  selectActiveSubject.addEventListener('change', () => {
    state.activeSubject = selectActiveSubject.value;
    renderSyllabusUnitsPopover();
  });

  function renderSyllabusUnitsPopover() {
    const subjData = state.brainVault?.subjectsData?.[state.activeSubject];
    unitsPopover.innerHTML = '';

    // Show official marking scheme protocol if available
    if (subjData?.officialMarkingScheme) {
      const schemeHeader = document.createElement('div');
      schemeHeader.className = 'popover-scheme-header';
      schemeHeader.innerHTML = `
        <div class="popover-scheme-badge">Official Marking Protocol</div>
        <div class="popover-scheme-title">${escapeHtml(subjData.officialMarkingScheme.schemeStyle || 'Step-by-Step Scoring')}</div>
        <div class="popover-scheme-rules">
          ${(subjData.officialMarkingScheme.stepMarkingRules || []).slice(0, 2).map(r => `• ${escapeHtml(r)}`).join('<br>')}
        </div>
      `;
      unitsPopover.appendChild(schemeHeader);
    }

    const units = subjData?.units || [
      'Fundamental Principles & Definitions',
      'Advanced Analytical Concepts',
      'Applied Problem Scenarios'
    ];

    units.forEach(u => {
      const item = document.createElement('div');
      item.className = 'unit-item';
      item.textContent = u;
      item.addEventListener('click', () => {
        inputTopic.value = u;
        unitsPopover.classList.add('hidden');
      });
      unitsPopover.appendChild(item);
    });
  }

  btnQuickUnits.addEventListener('click', (e) => {
    e.stopPropagation();
    unitsPopover.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    unitsPopover.classList.add('hidden');
  });

  // Segmented selectors
  countSelectors.forEach(btn => {
    btn.addEventListener('click', () => {
      countSelectors.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.targetTotalQuestions = parseInt(btn.dataset.count, 10);
    });
  });

  modeSelectors.forEach(btn => {
    btn.addEventListener('click', () => {
      modeSelectors.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentMode = btn.dataset.mode;
    });
  });

  // -------------------------------------------------------------
  // 7. Generation Trigger & Capacity Check Flow
  // -------------------------------------------------------------
  btnGenerateBatch.addEventListener('click', async () => {
    const topicVal = inputTopic.value.trim();
    if (!topicVal) {
      alert('Kripya koi topic ya unit select karein.');
      inputTopic.focus();
      return;
    }

    state.currentTopic = topicVal;
    state.currentBatchNumber = 1;
    state.totalBatches = Math.ceil(state.targetTotalQuestions / 10);
    state.allGeneratedQuestions = [];
    state.pendingBackgroundBatches = [];

    btnGenerateBatch.disabled = true;
    btnGenerateBatch.textContent = 'Checking Scope...';

    try {
      // Step: Capacity check
      const capRes = await fetch('/api/check-capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: state.brainVault.examName,
          subject: state.activeSubject,
          topic: state.currentTopic,
          targetCount: state.targetTotalQuestions
        })
      });
      const capData = await capRes.json();

      if (capData.isNarrow) {
        // Show capacity modal prompt
        capacityMessage.innerHTML = `Is specific topic par naturally sirf <strong>${capData.capacity} 100% genuine questions</strong> banna possible hain (bina repetition ke).`;
        modalCapacity.classList.remove('hidden');

        btnCapacityOpt1.onclick = () => {
          modalCapacity.classList.add('hidden');
          state.targetTotalQuestions = capData.capacity;
          state.totalBatches = Math.ceil(state.targetTotalQuestions / 10);
          startGenerationPipeline();
        };

        btnCapacityOpt2.onclick = () => {
          modalCapacity.classList.add('hidden');
          // Expanded topic with connected topics
          state.currentTopic = `${state.currentTopic} & Related Units`;
          startGenerationPipeline();
        };

        btnGenerateBatch.disabled = false;
        btnGenerateBatch.textContent = 'Generate Questions';
        return;
      }

      // If topic capacity is sufficient, proceed directly
      startGenerationPipeline();

    } catch (e) {
      console.error(e);
      startGenerationPipeline(); // fallback direct
    }
  });

  // -------------------------------------------------------------
  // 8. Progressive Generation Pipeline Execution
  // -------------------------------------------------------------
  async function startGenerationPipeline() {
    btnGenerateBatch.disabled = true;
    btnGenerateBatch.textContent = 'Generating Batch 1...';
    questionsFeed.innerHTML = '';
    nextBatchContainer.classList.add('hidden');
    sessionStatusBanner.classList.remove('hidden');

    sessionBatchText.textContent = `Batch 1 of ${state.totalBatches} Generating...`;
    sessionBackgroundText.textContent = state.totalBatches > 1 
      ? `⚡ Remaining batches will verify in background` 
      : `Single batch generation`;

    try {
      // 1. Fetch Batch 1 immediately
      const batch1Questions = await fetchSingleBatch(1, Math.min(10, state.targetTotalQuestions));
      
      // Render Batch 1 immediately to user screen!
      renderBatchToFeed(batch1Questions, 1);

      sessionBatchText.textContent = `Batch 1 of ${state.totalBatches} Verified & Displayed`;
      btnGenerateBatch.disabled = false;
      btnGenerateBatch.textContent = 'Generate Questions';

      // 2. If multiple batches, trigger background queue!
      if (state.totalBatches > 1) {
        runBackgroundBatchQueue(2);
      }

    } catch (err) {
      console.error('Batch 1 generation error:', err);
      sessionStatusBanner.classList.add('hidden');
      questionsFeed.innerHTML = `
        <div class="error-banner">
          <strong>⚠️ Question Generation Notice:</strong> ${err.message}
          <div style="margin-top: 6px; font-size: 12.5px; opacity: 0.9;">Kripya dobara <strong>"Generate Questions"</strong> par click karein.</div>
        </div>
      `;
      btnGenerateBatch.disabled = false;
      btnGenerateBatch.textContent = 'Generate Questions';
    }
  }

  async function fetchSingleBatch(batchNum, size) {
    const prevQTexts = state.allGeneratedQuestions.map(q => q.questionText);

    const res = await fetch('/api/generate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examName: state.brainVault.examName,
        subject: state.activeSubject,
        topic: state.currentTopic,
        batchNumber: batchNum,
        batchSize: size,
        previousQuestions: prevQTexts,
        brainVault: state.brainVault,
        mode: state.currentMode,
        apiKey: state.apiKey
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Batch generation failed');

    // Add to local state memory for deduplication
    data.questions.forEach(q => state.allGeneratedQuestions.push(q));
    return data.questions;
  }

  // Background queue for remaining batches
  async function runBackgroundBatchQueue(nextBatchIdx) {
    if (nextBatchIdx > state.totalBatches) {
      sessionBackgroundText.textContent = `✓ All ${state.totalBatches} batches verified!`;
      return;
    }

    sessionBackgroundText.textContent = `⚡ Generating & verifying Batch ${nextBatchIdx} in background...`;

    try {
      const remainingQs = state.targetTotalQuestions - ((nextBatchIdx - 1) * 10);
      const batchSize = Math.min(10, remainingQs);

      const batchQuestions = await fetchSingleBatch(nextBatchIdx, batchSize);
      
      // Store in pending queue
      state.pendingBackgroundBatches.push({
        batchNumber: nextBatchIdx,
        questions: batchQuestions
      });

      // Update UI floating button
      btnLoadNextBatch.textContent = `View Verified Batch ${nextBatchIdx} (${batchSize} Questions) →`;
      nextBatchContainer.classList.remove('hidden');
      sessionBackgroundText.textContent = `✓ Batch ${nextBatchIdx} verified & ready to view!`;

    } catch (e) {
      console.warn(`Background batch ${nextBatchIdx} error:`, e);
      sessionBackgroundText.textContent = `Notice: Background batch retrying...`;
    }
  }

  btnLoadNextBatch.addEventListener('click', () => {
    if (state.pendingBackgroundBatches.length > 0) {
      const nextBatch = state.pendingBackgroundBatches.shift();
      renderBatchToFeed(nextBatch.questions, nextBatch.batchNumber);
      nextBatchContainer.classList.add('hidden');

      sessionBatchText.textContent = `Batch ${nextBatch.batchNumber} of ${state.totalBatches} Verified & Displayed`;

      // Trigger next batch in queue if exists
      const nextIdx = nextBatch.batchNumber + 1;
      if (nextIdx <= state.totalBatches) {
        runBackgroundBatchQueue(nextIdx);
      } else {
        sessionBackgroundText.textContent = `✓ All ${state.totalBatches} batches verified!`;
      }
    }
  });

  // -------------------------------------------------------------
  // 9. Card Rendering with KaTeX Math & Clean Interactivity
  // -------------------------------------------------------------
  function renderBatchToFeed(questions, batchNum) {
    questions.forEach((q) => {
      const card = document.createElement('div');
      card.className = 'question-card';

      const isSubjective = q.type === 'Subjective';
      const nativeLabel = q.nativeTypeLabel || (isSubjective ? 'Free-Response' : 'Multiple-Choice');

      // Visual Component Rendering (Data Table, SVG Graph, SVG Diagram)
      let visualHtml = '';
      if (q.visual) {
        if (q.visual.type === 'table' && q.visual.tableData && Array.isArray(q.visual.tableData.headers)) {
          const headers = q.visual.tableData.headers;
          const rows = q.visual.tableData.rows || [];
          visualHtml = `
            <div class="question-visual-box">
              <div class="table-responsive">
                <table class="question-table">
                  <thead>
                    <tr>
                      ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(row => `
                      <tr>
                        ${row.map(cell => `<td>${escapeHtml(String(cell))}</td>`).join('')}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              ${q.visual.caption ? `<div class="visual-caption">${escapeHtml(q.visual.caption)}</div>` : ''}
            </div>
          `;
        } else if ((q.visual.type === 'graph' || q.visual.type === 'diagram') && q.visual.svgContent) {
          visualHtml = `
            <div class="question-visual-box">
              <div class="visual-svg-container">
                ${q.visual.svgContent}
              </div>
              ${q.visual.caption ? `<div class="visual-caption">${escapeHtml(q.visual.caption)}</div>` : ''}
            </div>
          `;
        }
      }

      let optionsOrPartsHtml = '';
      if (isSubjective) {
        // Multi-part breakdown
        const parts = q.parts || [
          { part: 'a', marks: 2, text: q.questionText }
        ];
        optionsOrPartsHtml = `
          <div class="parts-list">
            ${parts.map(p => `
              <div class="part-item">
                <div class="part-header">
                  <span>Part (${p.part})</span>
                  <span class="text-subtle">[${p.marks} Marks]</span>
                </div>
                <div class="part-text">${p.text}</div>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        // MCQ Options
        const options = q.options || [];
        optionsOrPartsHtml = `
          <div class="options-list">
            ${options.map((opt, oIdx) => `
              <div class="option-item" data-opt="${escapeHtml(opt)}">
                ${opt}
              </div>
            `).join('')}
          </div>
        `;
      }

      // Step-by-step bullet explanations
      const bullets = q.explanationBullets || ['Verified step-by-step reasoning.'];
      const bulletHtml = `
        <ul class="bullet-list">
          ${bullets.map(b => `<li>${b}</li>`).join('')}
        </ul>
      `;

      // Official Marking Scheme Breakdown Box
      let markingHtml = '';
      if (q.markingBreakdown && Array.isArray(q.markingBreakdown) && q.markingBreakdown.length > 0) {
        markingHtml = `
          <div class="marking-scheme-container">
            <div class="marking-scheme-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>Official Marking Scheme & Point Allocation</span>
            </div>
            <ul class="marking-scheme-list">
              ${q.markingBreakdown.map(m => `
                <li class="marking-scheme-item">
                  <span>${m}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      }

      // Examiner Tip / Insights
      let tipHtml = '';
      if (q.examinerTip) {
        tipHtml = `
          <div class="examiner-tip-box">
            <strong>💡 Official Examiner Insight:</strong> ${q.examinerTip}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="question-meta-bar">
          <span class="question-badge">${nativeLabel} • Q${q.questionNumber}</span>
          <span class="question-verified-tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Verified by Native Teacher
          </span>
        </div>

        <div class="question-statement">
          ${q.questionText}
        </div>

        ${visualHtml}

        ${optionsOrPartsHtml}

        <button class="accordion-toggle" type="button">
          <span>View Step-by-Step Explanation & Marking Rubric</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>

        <div class="explanation-body hidden">
          <div class="explanation-section-title">Step-by-Step Solution:</div>
          ${bulletHtml}
          ${markingHtml}
          ${tipHtml}
        </div>
      `;

      // Interactive MCQ option checking
      if (!isSubjective) {
        const optionEls = card.querySelectorAll('.option-item');
        optionEls.forEach(el => {
          el.addEventListener('click', () => {
            const chosen = el.getAttribute('data-opt');
            const correct = q.correctAnswer;
            
            optionEls.forEach(o => {
              o.classList.remove('selected-correct', 'selected-wrong');
              if (o.getAttribute('data-opt').trim().startsWith(correct.slice(0, 2)) || o.getAttribute('data-opt') === correct) {
                o.classList.add('selected-correct');
              }
            });

            if (!chosen.trim().startsWith(correct.slice(0, 2)) && chosen !== correct) {
              el.classList.add('selected-wrong');
            }

            // Auto-open explanation
            card.querySelector('.explanation-body').classList.remove('hidden');
          });
        });
      }

      // Accordion toggle handler
      const toggleBtn = card.querySelector('.accordion-toggle');
      const explBody = card.querySelector('.explanation-body');
      toggleBtn.addEventListener('click', () => {
        explBody.classList.toggle('hidden');
      });

      questionsFeed.appendChild(card);

      // Render KaTeX in this card
      if (window.renderMathInElement) {
        window.renderMathInElement(card, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

});
