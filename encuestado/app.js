// ==========================================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================================
const SUPABASE_URL = "https://jzworsqfyajqyvqxeagm.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnmHnqscciaH547wIWTeyA_-galABYH";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado del Encuestado
let surveyData = null;
let questionsData = [];
let conditionsData = [];
let userAnswers = {};

// Referencias del DOM
const surveyBody = document.getElementById('survey-body');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorTitle = document.getElementById('error-title');
const errorDesc = document.getElementById('error-desc');
const surveyContainer = document.getElementById('survey-container');
const surveyHeaderCard = document.getElementById('survey-header-card');
const surveyDisplayTitle = document.getElementById('survey-display-title');
const surveyDisplayDesc = document.getElementById('survey-display-desc');
const questionsList = document.getElementById('questions-list');
const answersForm = document.getElementById('answers-form');
const btnSubmitSurvey = document.getElementById('btn-submit-survey');
const btnSubmitText = document.getElementById('btn-submit-text');
const successState = document.getElementById('success-state');

// ==========================================================
// 1. CARGA INICIAL POR SLUG PÚBLICO
// ==========================================================
async function initSurvey() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('s');

  if (!slug) {
    showError("Enlace Inválido", "No se especificó ninguna encuesta en el enlace.");
    return;
  }

  try {
    const { data: survey, error: sError } = await supabaseClient
      .from('surveys')
      .select('*')
      .eq('slug', slug)
      .single();

    if (sError || !survey) {
      showError("Encuesta No Encontrada", "La encuesta no existe o ha sido eliminada.");
      return;
    }

    if (!survey.is_published) {
      showError("Encuesta en Borrador", "Esta encuesta se encuentra en modo borrador y aún no acepta respuestas.");
      return;
    }

    surveyData = survey;

    const { data: questions, error: qError } = await supabaseClient
      .from('questions')
      .select(`
        id,
        title,
        question_type,
        is_required,
        order_index,
        question_options(id, label, order_index)
      `)
      .eq('survey_id', survey.id)
      .order('order_index', { ascending: true });

    if (qError) throw qError;
    questionsData = questions || [];

    const { data: conditions, error: cError } = await supabaseClient
      .from('question_conditions')
      .select('*')
      .eq('survey_id', survey.id);

    if (cError) throw cError;
    conditionsData = conditions || [];

    applySurveyTheme(surveyData);
    renderQuestions();

    loadingState.classList.add('hidden');
    surveyContainer.classList.remove('hidden');

  } catch (err) {
    console.error("Error al cargar encuesta:", err);
    showError("Error de Conexión", "No se pudo conectar con el servidor para cargar las preguntas.");
  }
}

// ==========================================================
// 2. APLICAR TEMA Y TIPOGRAFÍAS DINÁMICAS
// ==========================================================
function applySurveyTheme(theme) {
  if (theme.font_family) {
    try {
      const fontObj = JSON.parse(theme.font_family);
      if (fontObj && fontObj.url && fontObj.url.startsWith('http')) {
        const linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = fontObj.url;
        document.head.appendChild(linkEl);
      }
      const fontName = fontObj.name || 'Inter';
      surveyBody.style.fontFamily = `'${fontName}', system-ui, sans-serif`;
    } catch (e) {
      surveyBody.style.fontFamily = `'${theme.font_family}', system-ui, sans-serif`;
    }
  }

  const primary = theme.primary_color || '#4f46e5';
  surveyHeaderCard.style.borderTopColor = primary;
  btnSubmitSurvey.style.backgroundColor = primary;

  if (theme.background_type === 'image' && theme.background_value) {
    surveyBody.classList.add('bg-is-image');
    surveyBody.style.backgroundImage = `url('${theme.background_value}')`;
  } else if (theme.background_value) {
    surveyBody.style.backgroundColor = theme.background_value;
  }

  surveyDisplayTitle.textContent = theme.title;
  surveyDisplayDesc.textContent = theme.description || '';
}

// ==========================================================
// 3. RENDERIZAR PREGUNTAS
// ==========================================================
function renderQuestions() {
  questionsList.innerHTML = '';

  questionsData.forEach((q, idx) => {
    const qWrapper = document.createElement('div');
    qWrapper.id = `q-card-${q.id}`;
    qWrapper.className = 'app-card survey-card-container p-6 sm:p-7 space-y-4 conditional-question';

    let optionsHtml = '';

    if (q.question_type === 'multiple_choice') {
      const sortedOpts = (q.question_options || []).sort((a, b) => a.order_index - b.order_index);
      optionsHtml = sortedOpts.map(opt => `
        <label class="choice-option-label" onclick="handleChoiceSelect('${q.id}', '${escapeHtml(opt.label)}')">
          <input type="radio" name="answer_${q.id}" value="${escapeHtml(opt.label)}" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500">
          <span class="text-sm font-medium text-slate-700">${escapeHtml(opt.label)}</span>
        </label>
      `).join('');
    } else if (q.question_type === 'checkbox') {
      const sortedOpts = (q.question_options || []).sort((a, b) => a.order_index - b.order_index);
      optionsHtml = sortedOpts.map(opt => `
        <label class="choice-option-label" onclick="handleCheckboxToggle('${q.id}', '${escapeHtml(opt.label)}')">
          <input type="checkbox" name="answer_${q.id}" value="${escapeHtml(opt.label)}" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500">
          <span class="text-sm font-medium text-slate-700">${escapeHtml(opt.label)}</span>
        </label>
      `).join('');
    } else if (q.question_type === 'scale') {
      optionsHtml = `
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2 max-w-sm pt-2">
            ${[1, 2, 3, 4, 5].map(n => `
              <button type="button" id="scale-btn-${q.id}-${n}" onclick="handleScaleSelect('${q.id}',${n})" class="scale-btn">
                ${n}
              </button>
            `).join('')}
          </div>
          <div class="flex justify-between text-xs text-slate-400 font-medium max-w-sm">
            <span>En desacuerdo</span>
            <span>Totalmente de acuerdo</span>
          </div>
        </div>
      `;
    } else if (q.question_type === 'text') {
      optionsHtml = `
        <textarea rows="3" class="app-input text-sm resize-y" placeholder="Escribe tu respuesta aquí..." oninput="handleTextAnswer('${q.id}', this.value)"></textarea>
      `;
    }

    qWrapper.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-base sm:text-lg font-bold text-slate-900 leading-snug">
            <span class="text-indigo-600 mr-1">${idx + 1}.</span> ${escapeHtml(q.title)}
            ${q.is_required ? '<span class="text-red-500 text-sm ml-1" title="Obligatoria">*</span>' : ''}
          </h3>
        </div>
      </div>
      <div class="space-y-2 pt-1">
        ${optionsHtml}
      </div>
    `;

    questionsList.appendChild(qWrapper);
  });

  evaluateConditions();
}

// ==========================================================
// 4. CONTROLADORES DE RESPUESTA
// ==========================================================
window.handleChoiceSelect = (qId, value) => {
  userAnswers[qId] = value;
  evaluateConditions();
};

window.handleCheckboxToggle = (qId, value) => {
  if (!Array.isArray(userAnswers[qId])) {
    userAnswers[qId] = [];
  }
  const index = userAnswers[qId].indexOf(value);
  if (index > -1) {
    userAnswers[qId].splice(index, 1);
  } else {
    userAnswers[qId].push(value);
  }
  evaluateConditions();
};

window.handleScaleSelect = (qId, score) => {
  userAnswers[qId] = score;
  [1, 2, 3, 4, 5].forEach(n => {
    const btn = document.getElementById(`scale-btn-${qId}-${n}`);
    if (btn) {
      if (n === score) {
        btn.style.borderColor = surveyData.primary_color || '#4f46e5';
        btn.style.backgroundColor = surveyData.primary_color || '#4f46e5';
        btn.style.color = '#ffffff';
      } else {
        btn.style.borderColor = '#e2e8f0';
        btn.style.backgroundColor = '#ffffff';
        btn.style.color = '#0f172a';
      }
    }
  });
  evaluateConditions();
};

window.handleTextAnswer = (qId, text) => {
  userAnswers[qId] = text.trim();
  evaluateConditions();
};

// ==========================================================
// 5. EVALUACIÓN CONDICIONAL EN TIEMPO REAL
// ==========================================================
function evaluateConditions() {
  conditionsData.forEach(cond => {
    const targetCard = document.getElementById(`q-card-${cond.target_question_id}`);
    if (!targetCard) return;

    const parentAnswer = userAnswers[cond.depends_on_question_id];
    let isConditionMet = false;

    if (Array.isArray(parentAnswer)) {
      isConditionMet = parentAnswer.includes(cond.trigger_value);
    } else if (parentAnswer !== undefined && parentAnswer !== null) {
      isConditionMet = String(parentAnswer).trim() === String(cond.trigger_value).trim();
    }

    if (isConditionMet) {
      targetCard.classList.remove('hidden-question');
    } else {
      targetCard.classList.add('hidden-question');
      delete userAnswers[cond.target_question_id];
    }
  });
}

// ==========================================================
// 6. ENVÍO DE RESPUESTAS VÍA RPC
// ==========================================================
answersForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  for (let i = 0; i < questionsData.length; i++) {
    const q = questionsData[i];
    const card = document.getElementById(`q-card-${q.id}`);
    const isVisible = !card.classList.contains('hidden-question');

    if (q.is_required && isVisible) {
      const answer = userAnswers[q.id];
      const isEmpty = answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0);
      if (isEmpty) {
        alert(`Por favor responde la pregunta obligatoria: "${q.title}"`);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }

  btnSubmitSurvey.disabled = true;
  btnSubmitText.textContent = "Enviando respuestas...";

  try {
    const answersPayload = [];
    Object.keys(userAnswers).forEach(qId => {
      const q = questionsData.find(item => item.id === qId);
      if (!q) return;

      const ans = userAnswers[qId];

      if (q.question_type === 'scale') {
        answersPayload.push({ question_id: qId, score_value: Number(ans) });
      } else if (q.question_type === 'text' || q.question_type === 'multiple_choice') {
        answersPayload.push({ question_id: qId, text_value: String(ans) });
      } else if (q.question_type === 'checkbox') {
        (ans || []).forEach(selectedVal => {
          answersPayload.push({ question_id: qId, text_value: selectedVal });
        });
      }
    });

    const { error: rpcError } = await supabaseClient.rpc('submit_survey_response', {
      p_survey_id: surveyData.id,
      p_answers: answersPayload
    });

    if (rpcError) throw rpcError;

    surveyContainer.classList.add('hidden');
    successState.classList.remove('hidden');

  } catch (err) {
    console.error("Error al enviar respuestas:", err);
    alert("Hubo un error al guardar tus respuestas: " + err.message);
    btnSubmitSurvey.disabled = false;
    btnSubmitText.textContent = "Enviar Respuestas";
  }
});

function showError(title, message) {
  loadingState.classList.add('hidden');
  errorTitle.textContent = title;
  errorDesc.textContent = message;
  errorState.classList.remove('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.addEventListener('DOMContentLoaded', initSurvey);