// 교직원 연수 문제 풀이 앱 핵심 로직 (app.js)

// 상태 관리 객체
const state = {
  currentTab: 'quiz', // 'quiz', 'study', 'wrong', 'stats'
  quizStatus: 'setup', // 'setup', 'in_progress', 'result'
  selectedUnits: [1, 2, 3, 4, 5, 6],
  selectedCount: 10,
  quizMode: 'realtime', // 'realtime' (즉시 피드백) or 'exam' (일괄 채점)
  currentQuestions: [],
  currentIndex: 0,
  userAnswers: {}, // questionId -> selectedOptionIndex
  timerSeconds: 0,
  timerInterval: null,
  bookmarks: JSON.parse(localStorage.getItem('gyoyuk_bookmarks') || '[]'),
  wrongQuestions: JSON.parse(localStorage.getItem('gyoyuk_wrong') || '[]'),
  quizHistory: JSON.parse(localStorage.getItem('gyoyuk_history') || '[]'),
  searchKeyword: '',
  selectedStudyUnit: 0 // 0: 전체
};

// DOM 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  renderSetupUnits();
  renderStudyUnitsFilter();
  renderStudyCards();
  renderWrongNoteList();
  renderStats();
  setupEventListeners();
  updateBookmarkBadges();
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 네비게이션 탭 전환
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // 학습실 검색
  const searchInput = document.getElementById('study-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchKeyword = e.target.value.trim().toLowerCase();
      renderStudyCards();
    });
  }
}

// 탭 전환
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.dataset.tab === tab) {
      b.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      b.classList.remove('text-slate-600', 'hover:bg-slate-100');
    } else {
      b.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      b.classList.add('text-slate-600', 'hover:bg-slate-100');
    }
  });

  // 컨테이너 표시/숨김
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  const target = document.getElementById(`tab-${tab}`);
  if (target) target.classList.remove('hidden');

  if (tab === 'wrong') {
    renderWrongNoteList();
  } else if (tab === 'stats') {
    renderStats();
  } else if (tab === 'study') {
    renderStudyCards();
  } else if (tab === 'pdf') {
    renderMainPdfPage(pdfViewerState.pageNum || 1);
  }
}

// ==================== 1. 문제 설정 및 퀴즈 시작 ====================

const UNIT_NAMES = {
  1: "제1편 생활지도 및 학생 이해",
  2: "제2편 학교폭력·위기대응 및 교실 안전",
  3: "제3편 성희롱·성폭력 및 불법촬영 대응",
  4: "제4편 학부모 상담 및 특이민원 응대",
  5: "제5편 교직 문화, 동료 교사 및 관리자 관계",
  6: "제6편 교원 복무, 보수, 휴직 및 교권 보호"
};

function renderSetupUnits() {
  const container = document.getElementById('unit-checkboxes');
  if (!container) return;

  container.innerHTML = Object.entries(UNIT_NAMES).map(([id, name]) => `
    <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition">
      <input type="checkbox" value="${id}" checked class="unit-check w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
      <div class="flex-1">
        <span class="text-sm font-semibold text-slate-800">${name}</span>
        <span class="text-xs text-slate-500 block">문항 수: ${quizQuestions.filter(q => q.unitId == id).length}문제</span>
      </div>
    </label>
  `).join('');

  document.querySelectorAll('.unit-check').forEach(chk => {
    chk.addEventListener('change', updateSelectedUnits);
  });
}

function toggleAllUnits(checked) {
  document.querySelectorAll('.unit-check').forEach(chk => {
    chk.checked = checked;
  });
  updateSelectedUnits();
}

function updateSelectedUnits() {
  state.selectedUnits = Array.from(document.querySelectorAll('.unit-check:checked')).map(c => parseInt(c.value));
  const availableCount = quizQuestions.filter(q => state.selectedUnits.includes(q.unitId)).length;
  const countSpan = document.getElementById('available-question-count');
  if (countSpan) countSpan.textContent = `${availableCount}문제 선택 가능`;
}

function startQuiz(customQuestions = null) {
  let pool = [];
  if (customQuestions) {
    pool = [...customQuestions];
  } else {
    updateSelectedUnits();
    if (state.selectedUnits.length === 0) {
      alert('최소 하나 이상의 단원을 선택해 주세요!');
      return;
    }

    pool = quizQuestions.filter(q => state.selectedUnits.includes(q.unitId));
    if (pool.length === 0) {
      alert('선택한 단원에 해당하는 문제가 없습니다.');
      return;
    }

    // 셔플
    pool.sort(() => Math.random() - 0.5);

    // 문항 수 결정
    const countSelect = document.getElementById('question-count-select');
    const selectedVal = countSelect ? countSelect.value : '10';
    const num = selectedVal === 'all' ? pool.length : parseInt(selectedVal);
    pool = pool.slice(0, Math.min(num, pool.length));

    // 모드
    const modeRadio = document.querySelector('input[name="quiz-mode"]:checked');
    state.quizMode = modeRadio ? modeRadio.value : 'realtime';
  }

  state.currentQuestions = pool;
  state.currentIndex = 0;
  state.userAnswers = {};
  state.quizStatus = 'in_progress';
  state.timerSeconds = 0;

  // 타이머 시작
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    const timerDisplay = document.getElementById('quiz-timer');
    if (timerDisplay) {
      const min = Math.floor(state.timerSeconds / 60).toString().padStart(2, '0');
      const sec = (state.timerSeconds % 60).toString().padStart(2, '0');
      timerDisplay.textContent = `⏱️ ${min}:${sec}`;
    }
  }, 1000);

  // 뷰 전환
  document.getElementById('quiz-setup-view').classList.add('hidden');
  document.getElementById('quiz-active-view').classList.remove('hidden');
  document.getElementById('quiz-result-view').classList.add('hidden');

  renderCurrentQuestion();
}

// ==================== 2. 문제 풀이 화면 렌더링 ====================

function renderCurrentQuestion() {
  const q = state.currentQuestions[state.currentIndex];
  if (!q) return;

  // 진행도
  const total = state.currentQuestions.length;
  const curr = state.currentIndex + 1;
  const pct = Math.round((curr / total) * 100);

  document.getElementById('quiz-progress-bar').style.width = `${pct}%`;
  document.getElementById('quiz-progress-text').textContent = `${curr} / ${total}`;

  // 북마크 상태
  const isBookmarked = state.bookmarks.includes(q.id);
  const bookmarkBtn = document.getElementById('quiz-bookmark-btn');
  if (bookmarkBtn) {
    bookmarkBtn.innerHTML = isBookmarked ? '⭐ 북마크됨' : '☆ 북마크';
    bookmarkBtn.className = isBookmarked
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 transition'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition';
  }

  // 문제 정보
  document.getElementById('question-badge-unit').textContent = q.unitName;
  document.getElementById('question-badge-chapter').textContent = q.chapter;
  document.getElementById('question-title').textContent = `Q${curr}. ${q.question}`;

  const directPdfBtn = document.getElementById('question-pdf-direct-btn');
  if (directPdfBtn) {
    directPdfBtn.innerHTML = `<span>📑 원본 교재 (p.${q.pdfPage || 1})</span>`;
    directPdfBtn.onclick = () => openPdfModal(q.pdfPage || 1, `${q.chapter}`);
  }

  // 보기 렌더링
  const optionsContainer = document.getElementById('question-options-container');
  const answered = state.userAnswers[q.id] !== undefined;
  const userChoice = state.userAnswers[q.id];

  optionsContainer.innerHTML = q.options.map((opt, idx) => {
    let btnStyle = "border-slate-200 bg-white hover:bg-slate-50 text-slate-800";
    let badgeText = q.type === 'ox' ? (idx === 0 ? 'O' : 'X') : `${idx + 1}`;
    let badgeStyle = "bg-slate-100 text-slate-700";

    if (state.quizMode === 'realtime' && answered) {
      if (idx === q.answer) {
        btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-2 ring-emerald-400";
        badgeStyle = "bg-emerald-500 text-white";
      } else if (idx === userChoice) {
        btnStyle = "border-rose-500 bg-rose-50 text-rose-900 font-semibold ring-2 ring-rose-400";
        badgeStyle = "bg-rose-500 text-white";
      } else {
        btnStyle = "border-slate-200 bg-slate-50 text-slate-400 opacity-60";
      }
    } else if (answered && idx === userChoice) {
      btnStyle = "border-blue-500 bg-blue-50 text-blue-900 font-semibold ring-2 ring-blue-400";
      badgeStyle = "bg-blue-600 text-white";
    }

    return `
      <button onclick="handleOptionSelect(${idx})" ${state.quizMode === 'realtime' && answered ? 'disabled' : ''}
        class="w-full text-left p-4 rounded-xl border ${btnStyle} transition flex items-start gap-3.5 group shadow-sm">
        <span class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${badgeStyle} transition">
          ${badgeText}
        </span>
        <span class="text-sm leading-relaxed flex-1 pt-0.5">${opt}</span>
      </button>
    `;
  }).join('');

  // 실시간 피드백 및 해설 박스
  const feedbackBox = document.getElementById('quiz-feedback-box');
  if (state.quizMode === 'realtime' && answered) {
    feedbackBox.classList.remove('hidden');
    const isCorrect = userChoice === q.answer;
    feedbackBox.className = `p-4 rounded-xl border mt-5 ${
      isCorrect ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' : 'bg-rose-50/80 border-rose-300 text-rose-950'
    }`;
    feedbackBox.innerHTML = `
      <div class="flex items-center gap-2 mb-2 font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}">
        <span>${isCorrect ? '🎉 정답입니다!' : '❌ 오답입니다.'}</span>
        <span class="text-xs font-normal text-slate-500 ml-auto">출처: ${q.referencePage}</span>
      </div>
      <p class="text-sm leading-relaxed text-slate-800 mb-3">${q.explanation}</p>
      
      <!-- 교재 연동 버튼 그룹 -->
      <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60">
        <button onclick="openPdfModal(${q.pdfPage || 1}, '${q.chapter}')" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1 transition">
          <span>📑 원본 교재 스캔본 팝업 보기</span>
        </button>
        <button onclick="openPdfTab(${q.pdfPage || 1})" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm flex items-center gap-1 transition">
          <span>전체 PDF 탭에서 열기</span> ↗️
        </button>
        <button onclick="showReferenceModal('${q.chapter}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition ml-auto">
          📖 핵심 요약 노트
        </button>
      </div>
    `;
  } else {
    feedbackBox.classList.add('hidden');
  }

  // 하단 버튼 제어
  document.getElementById('prev-question-btn').disabled = state.currentIndex === 0;
  const nextBtn = document.getElementById('next-question-btn');
  if (state.currentIndex === total - 1) {
    nextBtn.textContent = '결과 확인하기 🏁';
    nextBtn.className = "px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow transition";
  } else {
    nextBtn.textContent = '다음 문제 ➔';
    nextBtn.className = "px-6 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow transition";
  }
}

function handleOptionSelect(optionIndex) {
  const q = state.currentQuestions[state.currentIndex];
  state.userAnswers[q.id] = optionIndex;

  // 오답 노트 자동 기록/삭제 로직
  const isCorrect = optionIndex === q.answer;
  if (!isCorrect) {
    if (!state.wrongQuestions.some(item => item.id === q.id)) {
      state.wrongQuestions.push({
        id: q.id,
        date: new Date().toLocaleDateString('ko-KR')
      });
      saveWrongQuestions();
    }
  } else {
    // 맞힌 경우 오답노트에서 자동 제거 선택 (선택적)
  }

  renderCurrentQuestion();
}

function nextQuestion() {
  if (state.currentIndex < state.currentQuestions.length - 1) {
    state.currentIndex++;
    renderCurrentQuestion();
  } else {
    finishQuiz();
  }
}

function prevQuestion() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    renderCurrentQuestion();
  }
}

function toggleCurrentBookmark() {
  const q = state.currentQuestions[state.currentIndex];
  if (!q) return;

  const idx = state.bookmarks.indexOf(q.id);
  if (idx > -1) {
    state.bookmarks.splice(idx, 1);
  } else {
    state.bookmarks.push(q.id);
  }
  localStorage.setItem('gyoyuk_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkBadges();
  renderCurrentQuestion();
}

// ==================== 3. 결과 및 복습 화면 ====================

function finishQuiz() {
  if (state.timerInterval) clearInterval(state.timerInterval);

  let correctCount = 0;
  state.currentQuestions.forEach(q => {
    if (state.userAnswers[q.id] === q.answer) {
      correctCount++;
    } else {
      // 오답 목록에 보장 추가
      if (!state.wrongQuestions.some(item => item.id === q.id)) {
        state.wrongQuestions.push({
          id: q.id,
          date: new Date().toLocaleDateString('ko-KR')
        });
      }
    }
  });
  saveWrongQuestions();

  const total = state.currentQuestions.length;
  const score = Math.round((correctCount / total) * 100);

  // 이력 저장
  const record = {
    date: new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    total,
    correct: correctCount,
    score,
    durationSeconds: state.timerSeconds
  };
  state.quizHistory.unshift(record);
  if (state.quizHistory.length > 20) state.quizHistory.pop();
  localStorage.setItem('gyoyuk_history', JSON.stringify(state.quizHistory));

  // 화면 전환
  document.getElementById('quiz-setup-view').classList.add('hidden');
  document.getElementById('quiz-active-view').classList.add('hidden');
  document.getElementById('quiz-result-view').classList.remove('hidden');

  // 결과 수치 주입
  document.getElementById('result-score').textContent = `${score}점`;
  document.getElementById('result-correct-count').textContent = `${correctCount} / ${total} 문제 정답`;
  const min = Math.floor(state.timerSeconds / 60);
  const sec = state.timerSeconds % 60;
  document.getElementById('result-time').textContent = `소요 시간: ${min}분 ${sec}초`;

  // 오답만 다시 풀기 버튼 제어
  const wrongOnlyBtn = document.getElementById('retry-wrong-btn');
  const wrongInThisQuiz = state.currentQuestions.filter(q => state.userAnswers[q.id] !== q.answer);
  if (wrongInThisQuiz.length > 0) {
    wrongOnlyBtn.classList.remove('hidden');
    wrongOnlyBtn.onclick = () => {
      startQuiz(wrongInThisQuiz);
    };
  } else {
    wrongOnlyBtn.classList.add('hidden');
  }

  // 문항별 풀이 해설 리스트 렌더링
  renderReviewList(state.currentQuestions);
}

function renderReviewList(questions) {
  const container = document.getElementById('result-review-list');
  if (!container) return;

  container.innerHTML = questions.map((q, idx) => {
    const userChoice = state.userAnswers[q.id];
    const isCorrect = userChoice === q.answer;

    return `
      <div class="p-5 rounded-2xl border ${isCorrect ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'}">
        <div class="flex items-center gap-2 mb-2">
          <span class="px-2.5 py-1 rounded-full text-xs font-bold ${isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${isCorrect ? '✓ 정답' : '✗ 오답'}
          </span>
          <span class="text-xs text-slate-500 font-medium">${q.unitName} · ${q.chapter}</span>
          <button onclick="toggleBookmarkById(${q.id})" class="ml-auto text-xs ${state.bookmarks.includes(q.id) ? 'text-amber-500 font-bold' : 'text-slate-400'}">
            ${state.bookmarks.includes(q.id) ? '⭐ 북마크됨' : '☆ 북마크'}
          </button>
        </div>
        <h4 class="font-bold text-slate-900 text-sm mb-3">Q${idx + 1}. ${q.question}</h4>
        
        <div class="space-y-1.5 mb-3 text-xs">
          <p><span class="font-semibold text-slate-500">내가 선택한 답:</span> 
             <span class="${isCorrect ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}">
               ${userChoice !== undefined ? `${userChoice + 1}번. ${q.options[userChoice]}` : '미선택'}
             </span>
          </p>
          ${!isCorrect ? `
            <p><span class="font-semibold text-slate-500">정답:</span> 
               <span class="text-emerald-700 font-bold">${q.answer + 1}번. ${q.options[q.answer]}</span>
            </p>
          ` : ''}
        </div>

        <div class="p-3 bg-white/80 rounded-xl text-xs text-slate-700 border border-slate-100 leading-relaxed">
          <span class="font-semibold text-slate-900 block mb-1">💡 상세 해설</span>
          ${q.explanation}
          <div class="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <span class="text-slate-400 font-medium">출처: ${q.referencePage}</span>
            <div class="flex items-center gap-1.5">
              <button onclick="openPdfModal(${q.pdfPage || 1}, '${q.chapter}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition">
                📑 원본 교재 팝업 보기
              </button>
              <button onclick="openPdfTab(${q.pdfPage || 1})" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition">
                전체 PDF 탭 ↗️
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function resetToSetup() {
  document.getElementById('quiz-setup-view').classList.remove('hidden');
  document.getElementById('quiz-active-view').classList.add('hidden');
  document.getElementById('quiz-result-view').classList.add('hidden');
}

// ==================== 4. 연수 교재 학습실 (Study & Reference) ====================

function renderStudyUnitsFilter() {
  const container = document.getElementById('study-unit-filters');
  if (!container) return;

  const units = [{ id: 0, name: "전체 단원" }, ...Object.entries(UNIT_NAMES).map(([id, name]) => ({ id: parseInt(id), name }))];

  container.innerHTML = units.map(u => `
    <button onclick="filterStudyUnit(${u.id})" class="study-filter-btn px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
      state.selectedStudyUnit === u.id
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
    }">
      ${u.name}
    </button>
  `).join('');
}

function filterStudyUnit(unitId) {
  state.selectedStudyUnit = unitId;
  renderStudyUnitsFilter();
  renderStudyCards();
}

function renderStudyCards() {
  const container = document.getElementById('study-cards-container');
  if (!container) return;

  let filtered = trainingSummaryData;
  if (state.selectedStudyUnit > 0) {
    filtered = filtered.filter(item => item.unitId === state.selectedStudyUnit);
  }

  if (state.searchKeyword) {
    filtered = filtered.filter(item =>
      item.title.toLowerCase().includes(state.searchKeyword) ||
      item.chapter.toLowerCase().includes(state.searchKeyword) ||
      item.keyPoints.some(p => p.toLowerCase().includes(state.searchKeyword)) ||
      item.lawAndTip.toLowerCase().includes(state.searchKeyword)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 col-span-full">
        <p class="text-slate-400 text-sm">검색 결과가 없습니다.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition">
      <div class="flex items-center gap-2 mb-2">
        <span class="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          ${item.chapter}
        </span>
        <span class="text-xs text-slate-400 font-medium">${item.unitName}</span>
      </div>
      
      <h3 class="text-base font-bold text-slate-900 mb-3">${item.title}</h3>

      <div class="mb-3.5">
        <h4 class="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
          <span>🎯</span> 학습 목표
        </h4>
        <ul class="text-xs text-slate-600 space-y-1 list-disc list-inside">
          ${item.objectives.map(obj => `<li>${obj}</li>`).join('')}
        </ul>
      </div>

      <div class="mb-3.5 p-3.5 bg-slate-50/80 rounded-xl">
        <h4 class="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
          <span>📌</span> 핵심 요약 & 실천 노하우
        </h4>
        <ul class="text-xs text-slate-700 space-y-1">
          ${item.keyPoints.map(pt => `<li class="leading-relaxed">• ${pt}</li>`).join('')}
        </ul>
      </div>

      <div class="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-relaxed mb-3">
        <span class="font-bold text-amber-800 block mb-0.5">⚖️ 법령 및 지도 팁</span>
        ${item.lawAndTip}
      </div>

      <!-- 교재 원본 보기 버튼 -->
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button onclick="openPdfModal(${item.pdfPage || 1}, '${item.chapter} ${item.title}')" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition flex items-center gap-1">
          <span>📑 원본 교재(p.${item.pdfPage || 1}) 팝업 보기</span>
        </button>
        <button onclick="openPdfTab(${item.pdfPage || 1})" class="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition flex items-center gap-1">
          <span>전체 PDF 탭에서 열기</span> ↗️
        </button>
      </div>
    </div>
  `).join('');
}

// 팝업 모달로 해당 챕터 연수 내용 열람
function showReferenceModal(chapterKeyword) {
  const found = trainingSummaryData.find(item => item.chapter.includes(chapterKeyword) || chapterKeyword.includes(item.chapter));
  const modal = document.getElementById('reference-modal');
  const modalBody = document.getElementById('reference-modal-body');
  if (!modal || !modalBody) return;

  if (found) {
    modalBody.innerHTML = `
      <div class="space-y-4">
        <div>
          <span class="px-2.5 py-1 rounded bg-blue-100 text-blue-800 text-xs font-bold">${found.chapter}</span>
          <h3 class="text-lg font-bold text-slate-900 mt-2">${found.title}</h3>
          <p class="text-xs text-slate-500">${found.unitName}</p>
        </div>
        <div class="p-3.5 bg-slate-50 rounded-xl">
          <h4 class="text-xs font-bold text-slate-700 mb-2">📌 핵심 내용</h4>
          <ul class="text-xs text-slate-700 space-y-1.5">
            ${found.keyPoints.map(p => `<li>• ${p}</li>`).join('')}
          </ul>
        </div>
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
          <span class="font-bold text-amber-800 block mb-1">⚖️ 관련 법령 및 생활지도 고시 팁</span>
          ${found.lawAndTip}
        </div>
        <div class="pt-2 text-right">
          <button onclick="openPdfModal(${found.pdfPage || 1}, '${found.chapter} ${found.title}')" class="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition">
            📑 원본 교재 스캔본(p.${found.pdfPage || 1}) 바로보기
          </button>
        </div>
      </div>
    `;
  } else {
    modalBody.innerHTML = `<p class="text-sm text-slate-600">해당 단원의 상세 요약 자료를 준비 중입니다.</p>`;
  }

  modal.classList.remove('hidden');
}

// ==================== PDF.js 캔버스 렌더링 엔진 (Chrome 차단 방지) ====================

const pdfViewerState = {
  pdfDoc: null,
  pageNum: 1,
  pageRendering: false,
  pageNumPending: null,
  scale: 1.3,
  modalPageNum: 1,
  modalRendering: false,
  modalPagePending: null
};

// PDF 문서 로드
function initPdfDoc() {
  if (pdfViewerState.pdfDoc) return Promise.resolve(pdfViewerState.pdfDoc);
  if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js 라이브러리가 로드되지 않았습니다.');
    return Promise.reject();
  }

  return pdfjsLib.getDocument('training_book.pdf').promise.then(pdf => {
    pdfViewerState.pdfDoc = pdf;
    return pdf;
  }).catch(err => {
    console.error('PDF 로드 실패:', err);
    const spinner = document.getElementById('pdf-loading-spinner');
    if (spinner) spinner.innerHTML = `<p class="text-rose-400 text-xs">PDF 교재를 불러오지 못했습니다. <a href="training_book.pdf" target="_blank" class="underline font-bold">여기</a>를 눌러 직접 열어보세요.</p>`;
  });
}

// 메인 탭 PDF 렌더링
function renderMainPdfPage(num) {
  pdfViewerState.pageNum = Math.max(1, Math.min(143, num));
  const canvas = document.getElementById('pdf-render-canvas');
  const spinner = document.getElementById('pdf-loading-spinner');
  const pageDisplay = document.getElementById('pdf-page-display');
  const zoomDisplay = document.getElementById('pdf-zoom-level');

  if (pageDisplay) pageDisplay.textContent = `${pdfViewerState.pageNum} / 143`;
  if (zoomDisplay) zoomDisplay.textContent = `${Math.round(pdfViewerState.scale * 100)}%`;

  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (spinner) spinner.classList.remove('hidden');
  canvas.classList.add('hidden');

  initPdfDoc().then(pdf => {
    if (!pdf) return;
    pdf.getPage(pdfViewerState.pageNum).then(page => {
      const viewport = page.getViewport({ scale: pdfViewerState.scale });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      page.render(renderContext).promise.then(() => {
        if (spinner) spinner.classList.add('hidden');
        canvas.classList.remove('hidden');
      });
    });
  });
}

function pdfPrevPage() {
  if (pdfViewerState.pageNum <= 1) return;
  renderMainPdfPage(pdfViewerState.pageNum - 1);
}

function pdfNextPage() {
  if (pdfViewerState.pageNum >= 143) return;
  renderMainPdfPage(pdfViewerState.pageNum + 1);
}

function pdfZoomIn() {
  if (pdfViewerState.scale >= 2.5) return;
  pdfViewerState.scale += 0.2;
  renderMainPdfPage(pdfViewerState.pageNum);
}

function pdfZoomOut() {
  if (pdfViewerState.scale <= 0.7) return;
  pdfViewerState.scale -= 0.2;
  renderMainPdfPage(pdfViewerState.pageNum);
}

function jumpPdfToChapter(page) {
  renderMainPdfPage(parseInt(page) || 1);
}

function openPdfTab(page) {
  switchTab('pdf');
  setTimeout(() => {
    renderMainPdfPage(parseInt(page) || 1);
    const select = document.getElementById('pdf-chapter-jump');
    if (select) {
      const options = Array.from(select.options);
      let closest = options[0];
      for (const opt of options) {
        if (parseInt(opt.value) <= page) closest = opt;
      }
      select.value = closest.value;
    }
  }, 100);
}

// ==================== 모달 전용 PDF 렌더링 ====================

function renderModalPdfPage(num) {
  pdfViewerState.modalPageNum = Math.max(1, Math.min(143, num));
  const canvas = document.getElementById('pdf-modal-canvas');
  const spinner = document.getElementById('pdf-modal-loading');
  const pageDisplay = document.getElementById('pdf-modal-page-display');
  const pageInfo = document.getElementById('pdf-modal-page-info');

  if (pageDisplay) pageDisplay.textContent = `${pdfViewerState.modalPageNum} / 143`;
  if (pageInfo) pageInfo.textContent = `스캔 페이지: p.${pdfViewerState.modalPageNum} / 143 (실제 책자 약 p.${(pdfViewerState.modalPageNum - 1) * 2 + 6}쪽)`;

  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (spinner) spinner.classList.remove('hidden');
  canvas.classList.add('hidden');

  initPdfDoc().then(pdf => {
    if (!pdf) return;
    pdf.getPage(pdfViewerState.modalPageNum).then(page => {
      // 모달에서는 가로 너비 기준 1.2배 스케일
      const viewport = page.getViewport({ scale: 1.25 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      page.render(renderContext).promise.then(() => {
        if (spinner) spinner.classList.add('hidden');
        canvas.classList.remove('hidden');
      });
    });
  });
}

function modalPdfPrevPage() {
  if (pdfViewerState.modalPageNum <= 1) return;
  renderModalPdfPage(pdfViewerState.modalPageNum - 1);
}

function modalPdfNextPage() {
  if (pdfViewerState.modalPageNum >= 143) return;
  renderModalPdfPage(pdfViewerState.modalPageNum + 1);
}

function openPdfModal(page, title = "") {
  const modal = document.getElementById('pdf-modal');
  const titleElem = document.getElementById('pdf-modal-title');
  const newTabBtn = document.getElementById('pdf-modal-open-newtab');

  if (!modal) return;
  const p = Math.max(1, Math.min(143, parseInt(page) || 1));

  if (titleElem) titleElem.textContent = title ? `교재 원문: ${title}` : '교직원 연수 교재 스캔본 열람';
  if (newTabBtn) newTabBtn.href = `training_book.pdf#page=${p}`;

  modal.classList.remove('hidden');
  renderModalPdfPage(p);
}

function closePdfModal() {
  const modal = document.getElementById('pdf-modal');
  if (modal) modal.classList.add('hidden');
}

function closeReferenceModal() {
  const modal = document.getElementById('reference-modal');
  if (modal) modal.classList.add('hidden');
}

// ==================== 5. 오답 노트 및 북마크 ====================

function saveWrongQuestions() {
  localStorage.setItem('gyoyuk_wrong', JSON.stringify(state.wrongQuestions));
  updateBookmarkBadges();
}

function renderWrongNoteList() {
  const wrongContainer = document.getElementById('wrong-questions-list');
  const bookmarkContainer = document.getElementById('bookmark-questions-list');

  const wrongList = quizQuestions.filter(q => state.wrongQuestions.some(w => w.id === q.id));
  const bookmarkList = quizQuestions.filter(q => state.bookmarks.includes(q.id));

  // 오답 노트 수
  const wrongCount = document.getElementById('wrong-badge-count');
  if (wrongCount) wrongCount.textContent = `${wrongList.length}문제`;

  if (wrongContainer) {
    if (wrongList.length === 0) {
      wrongContainer.innerHTML = `
        <div class="text-center py-12 text-slate-400 text-sm">
          🎉 틀린 문제가 없습니다! 완벽하게 마스터하셨습니다.
        </div>
      `;
    } else {
      wrongContainer.innerHTML = wrongList.map(q => `
        <div class="p-4 rounded-xl border border-rose-200 bg-rose-50/20 mb-3">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">오답</span>
            <span class="text-xs text-slate-500">${q.unitName} · ${q.chapter}</span>
            <button onclick="removeWrongQuestion(${q.id})" class="ml-auto text-xs text-slate-400 hover:text-rose-600">삭제 ✕</button>
          </div>
          <h4 class="text-sm font-bold text-slate-900 mb-2">${q.question}</h4>
          <p class="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-100 leading-relaxed">
            <span class="font-semibold text-emerald-700 block mb-0.5">정답: ${q.answer + 1}번 (${q.options[q.answer]})</span>
            ${q.explanation}
          </p>
        </div>
      `).join('');
    }
  }

  if (bookmarkContainer) {
    if (bookmarkList.length === 0) {
      bookmarkContainer.innerHTML = `
        <div class="text-center py-12 text-slate-400 text-sm">
          북마크된 중요 문제가 없습니다. 문제 풀이 시 별표를 눌러 추가해 보세요.
        </div>
      `;
    } else {
      bookmarkContainer.innerHTML = bookmarkList.map(q => `
        <div class="p-4 rounded-xl border border-amber-200 bg-amber-50/20 mb-3">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">중요</span>
            <span class="text-xs text-slate-500">${q.unitName} · ${q.chapter}</span>
            <button onclick="toggleBookmarkById(${q.id})" class="ml-auto text-xs text-slate-400 hover:text-amber-600">해제 ✕</button>
          </div>
          <h4 class="text-sm font-bold text-slate-900 mb-2">${q.question}</h4>
          <p class="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-100 leading-relaxed">
            <span class="font-semibold text-emerald-700 block mb-0.5">정답: ${q.answer + 1}번 (${q.options[q.answer]})</span>
            ${q.explanation}
          </p>
        </div>
      `).join('');
    }
  }
}

function startWrongOnlyQuiz() {
  const wrongList = quizQuestions.filter(q => state.wrongQuestions.some(w => w.id === q.id));
  if (wrongList.length === 0) {
    alert('오답 노트에 저장된 문제가 없습니다.');
    return;
  }
  switchTab('quiz');
  startQuiz(wrongList);
}

function startBookmarkOnlyQuiz() {
  const bookmarkList = quizQuestions.filter(q => state.bookmarks.includes(q.id));
  if (bookmarkList.length === 0) {
    alert('북마크된 문제가 없습니다.');
    return;
  }
  switchTab('quiz');
  startQuiz(bookmarkList);
}

function removeWrongQuestion(id) {
  state.wrongQuestions = state.wrongQuestions.filter(item => item.id !== id);
  saveWrongQuestions();
  renderWrongNoteList();
}

function toggleBookmarkById(id) {
  const idx = state.bookmarks.indexOf(id);
  if (idx > -1) state.bookmarks.splice(idx, 1);
  else state.bookmarks.push(id);
  localStorage.setItem('gyoyuk_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkBadges();
  renderWrongNoteList();
}

function updateBookmarkBadges() {
  const wrongCountSpan = document.getElementById('stat-wrong-count');
  const bookmarkCountSpan = document.getElementById('stat-bookmark-count');
  if (wrongCountSpan) wrongCountSpan.textContent = state.wrongQuestions.length;
  if (bookmarkCountSpan) bookmarkCountSpan.textContent = state.bookmarks.length;
}

// ==================== 6. 학습 통계 ====================

function renderStats() {
  const historyContainer = document.getElementById('stats-history-list');
  const totalSolvedSpan = document.getElementById('stat-total-solved');
  const avgScoreSpan = document.getElementById('stat-avg-score');

  let totalSolved = 0;
  let scoreSum = 0;

  state.quizHistory.forEach(h => {
    totalSolved += h.total;
    scoreSum += h.score;
  });

  if (totalSolvedSpan) totalSolvedSpan.textContent = totalSolved;
  if (avgScoreSpan) {
    const avg = state.quizHistory.length > 0 ? Math.round(scoreSum / state.quizHistory.length) : 0;
    avgScoreSpan.textContent = `${avg}%`;
  }

  if (historyContainer) {
    if (state.quizHistory.length === 0) {
      historyContainer.innerHTML = `<p class="text-slate-400 text-sm text-center py-6">아직 응시한 시험 이력이 없습니다.</p>`;
    } else {
      historyContainer.innerHTML = state.quizHistory.map(h => `
        <div class="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl text-xs">
          <div>
            <span class="font-bold text-slate-800">${h.date}</span>
            <span class="text-slate-400 ml-2">(${h.total}문제 중 ${h.correct}문제 정답)</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-bold text-sm ${h.score >= 80 ? 'text-emerald-600' : h.score >= 60 ? 'text-amber-600' : 'text-rose-600'}">
              ${h.score}점
            </span>
          </div>
        </div>
      `).join('');
    }
  }
}
