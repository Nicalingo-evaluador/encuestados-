// ==========================================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================================
const SUPABASE_URL = "https://jzworsqfyajqyvqxeagm.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnmHnqscciaH547wIWTeyA_-galABYH";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado de la pantalla
let currentUser = null;
let allSurveys = [];
let activeSurveyId = null;
let activeSurveyQuestions = [];
let activeSurveyRawResponses = []; // Estructura plana de respuestas de cada encuestado
let currentChartInstance = null;

// Elementos del DOM
const searchSurveyInput = document.getElementById('search-survey-input');
const carouselContainer = document.getElementById('carousel-container');
const loadingSpinner = document.getElementById('loading-spinner');
const statsDashboard = document.getElementById('stats-dashboard');
const emptyState = document.getElementById('empty-state');
const activeSurveyTitle = document.getElementById('active-survey-title');
const activeSurveyDesc = document.getElementById('active-survey-desc');
const activeSurveyResponses = document.getElementById('active-survey-responses');
const chartTypeSelect = document.getElementById('chart-type-select');
const primaryQuestionSelect = document.getElementById('primary-question-select');
const filterAQuestion = document.getElementById('filter-a-question');
const filterAValue = document.getElementById('filter-a-value');
const filterBQuestion = document.getElementById('filter-b-question');
const filterBValue = document.getElementById('filter-b-value');
const btnApplyFilters = document.getElementById('btn-apply-filters');
const btnDownloadChart = document.getElementById('btn-download-chart');

// Botón de exportación a Excel
const btnExportExcel = document.getElementById('btn-export-excel');

const chartDisplayTitle = document.getElementById('chart-display-title');
const chartSubLabel = document.getElementById('chart-sub-label');
const noFilteredData = document.getElementById('no-filtered-data');
const filteredSampleCount = document.getElementById('filtered-sample-count');
const btnLogout = document.getElementById('btn-logout');

// ==========================================================
// 1. SESIÓN Y NAVEGACIÓN
// ==========================================================
async function initSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "../index.html";
    return;
  }
  currentUser = session.user;
  await fetchCreatorSurveys();
}

window.goToBuilder = () => {
  window.location.href = "../crear-encuesta/index.html";
};

window.goToHistory = () => {
  window.location.href = "../historial/index.html";
};

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "../index.html";
  });
}

// ==========================================================
// 2. OBTENER ÚNICAMENTE LAS ENCUESTAS DEL USUARIO LOGUEADO
// ==========================================================
async function fetchCreatorSurveys() {
  loadingSpinner.classList.remove('hidden');
  statsDashboard.classList.add('hidden');
  emptyState.classList.add('hidden');

  // Filtro estricto por user_id del usuario con sesión activa
  const { data, error } = await supabaseClient
    .from('surveys')
    .select(`
      id,
      title,
      description,
      is_published,
      published_at,
      created_at,
      user_id,
      survey_responses(count)
    `)
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error al obtener encuestas:", error);
    alert("Error al cargar encuestas: " + error.message);
    loadingSpinner.classList.add('hidden');
    return;
  }

  allSurveys = data || [];

  if (allSurveys.length === 0) {
    loadingSpinner.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  renderCarousel(allSurveys);

  // Validar si el ID recibido por URL pertenece a este usuario
  const params = new URLSearchParams(window.location.search);
  const targetId = params.get('id');

  if (targetId && allSurveys.some(s => s.id === targetId)) {
    selectSurvey(targetId);
  } else {
    selectSurvey(allSurveys[0].id);
  }
}

function renderCarousel(surveys) {
  carouselContainer.innerHTML = '';

  surveys.forEach(survey => {
    const rawDate = survey.published_at || survey.created_at;
    const dateFormatted = new Date(rawDate).toLocaleDateString('es-ES', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const count = survey.survey_responses?.[0]?.count || 0;
    const isSelected = survey.id === activeSurveyId;

    const card = document.createElement('div');
    card.id = `survey-card-${survey.id}`;
    card.className = `carousel-card p-4 rounded-2xl bg-white snap-start ${isSelected ? 'active-card' : ''}`;
    card.onclick = () => selectSurvey(survey.id);

    card.innerHTML = `
      <div class="flex items-center justify-between gap-1 mb-2">
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${survey.is_published ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}">
          ${survey.is_published ? 'Publicada' : 'Borrador'}
        </span>
        <span class="text-[11px] text-slate-400 font-medium">${dateFormatted}</span>
      </div>
      <h4 class="text-sm font-bold text-slate-900 line-clamp-1 mb-1" title="${escapeHtml(survey.title)}">
        ${escapeHtml(survey.title)}
      </h4>
      <p class="text-xs text-slate-500 line-clamp-2 mb-3">
        ${escapeHtml(survey.description || 'Sin descripción.')}
      </p>
      <div class="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50/70 py-1 px-2.5 rounded-lg border border-indigo-100 font-semibold">
        <span>👥</span> ${count} ${count === 1 ? 'encuestado' : 'encuestados'}
      </div>
    `;

    carouselContainer.appendChild(card);
  });
}

window.scrollCarousel = (direction) => {
  carouselContainer.scrollBy({ left: direction * 290, behavior: 'smooth' });
};

// Buscador en tiempo real de encuestas del usuario logueado
searchSurveyInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  const filtered = allSurveys.filter(s => s.title.toLowerCase().includes(query));
  renderCarousel(filtered);
});

// ==========================================================
// 3. SELECCIONAR ENCUESTA Y CARGAR DATOS PROPIOS
// ==========================================================
async function selectSurvey(surveyId) {
  // Asegurar que la encuesta seleccionada pertenezca al usuario logueado
  const selectedSurvey = allSurveys.find(s => s.id === surveyId && s.user_id === currentUser.id);
  if (!selectedSurvey) {
    alert("Acceso denegado: esta encuesta no pertenece a tu cuenta.");
    if (allSurveys.length > 0) {
      selectSurvey(allSurveys[0].id);
    }
    return;
  }

  activeSurveyId = surveyId;
  window.history.replaceState({}, '', `?id=${surveyId}`);

  // Actualizar tarjeta activa en el carrusel
  document.querySelectorAll('.carousel-card').forEach(el => el.classList.remove('active-card'));
  const activeEl = document.getElementById(`survey-card-${surveyId}`);
  if (activeEl) activeEl.classList.add('active-card');

  loadingSpinner.classList.remove('hidden');
  statsDashboard.classList.add('hidden');

  activeSurveyTitle.textContent = selectedSurvey.title;
  activeSurveyDesc.textContent = selectedSurvey.description || 'Sin descripción proporcionada.';
  activeSurveyResponses.textContent = selectedSurvey.survey_responses?.[0]?.count || 0;

  try {
    // 1. Obtener preguntas de la encuesta
    const { data: questions, error: qError } = await supabaseClient
      .from('questions')
      .select(`
        id,
        title,
        question_type,
        order_index,
        question_options(label, order_index)
      `)
      .eq('survey_id', surveyId)
      .order('order_index', { ascending: true });

    if (qError) throw qError;
    activeSurveyQuestions = questions || [];

    // 2. Obtener respuestas crudas de los encuestados
    const { data: responses, error: rError } = await supabaseClient
      .from('survey_responses')
      .select(`
        id,
        response_answers(
          question_id,
          text_value,
          score_value
        )
      `)
      .eq('survey_id', surveyId);

    if (rError) throw rError;

    // Normalizar respuestas en una lista plana de objetos por encuestado:
    // [ { q_id1: ['Docente'], q_id2: ['Matemáticas'], q_id3: [5] }, ... ]
    activeSurveyRawResponses = (responses || []).map(r => {
      const answersMap = {};
      (r.response_answers || []).forEach(ans => {
        if (!answersMap[ans.question_id]) {
          answersMap[ans.question_id] = [];
        }
        if (ans.text_value !== null && ans.text_value !== '') {
          answersMap[ans.question_id].push(ans.text_value);
        } else if (ans.score_value !== null) {
          answersMap[ans.question_id].push(String(ans.score_value));
        }
      });
      return answersMap;
    });

    populateFilterSelectors();
    generateCustomChart();

    loadingSpinner.classList.add('hidden');
    statsDashboard.classList.remove('hidden');

  } catch (err) {
    console.error("Error al cargar datos:", err);
    alert("No se pudieron cargar los datos de la encuesta: " + err.message);
    loadingSpinner.classList.add('hidden');
  }
}

// ==========================================================
// 4. SELECTORES DE FILTROS CRUZADOS
// ==========================================================
function populateFilterSelectors() {
  primaryQuestionSelect.innerHTML = '';
  filterAQuestion.innerHTML = '<option value="">-- Sin Filtro #1 --</option>';
  filterBQuestion.innerHTML = '<option value="">-- Sin Filtro #2 --</option>';
  filterAValue.classList.add('hidden');
  filterBValue.classList.add('hidden');

  activeSurveyQuestions.forEach((q, idx) => {
    const label = `P${idx + 1}: ${q.title}`;
    primaryQuestionSelect.innerHTML += `<option value="${q.id}">${escapeHtml(label)}</option>`;
    filterAQuestion.innerHTML += `<option value="${q.id}">${escapeHtml(label)}</option>`;
    filterBQuestion.innerHTML += `<option value="${q.id}">${escapeHtml(label)}</option>`;
  });
}

// Filtro A
filterAQuestion.addEventListener('change', (e) => {
  populateFilterValues(e.target.value, filterAValue);
});

// Filtro B
filterBQuestion.addEventListener('change', (e) => {
  populateFilterValues(e.target.value, filterBValue);
});

function populateFilterValues(questionId, valueSelectElement) {
  if (!questionId) {
    valueSelectElement.classList.add('hidden');
    valueSelectElement.innerHTML = '<option value="">-- Selecciona valor exacto --</option>';
    return;
  }

  const question = activeSurveyQuestions.find(q => q.id === questionId);
  const uniqueValues = new Set();

  if (question && question.question_options && question.question_options.length > 0) {
    question.question_options.forEach(opt => uniqueValues.add(opt.label));
  } else if (question && question.question_type === 'scale') {
    [1, 2, 3, 4, 5].forEach(n => uniqueValues.add(String(n)));
  }

  activeSurveyRawResponses.forEach(resp => {
    const vals = resp[questionId] || [];
    vals.forEach(v => uniqueValues.add(v));
  });

  valueSelectElement.innerHTML = '<option value="">-- Selecciona valor exacto --</option>';
  Array.from(uniqueValues).sort().forEach(val => {
    valueSelectElement.innerHTML += `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`;
  });

  valueSelectElement.classList.remove('hidden');
}

// ==========================================================
// 5. PROCESAMIENTO Y GENERACIÓN DEL GRÁFICO
// ==========================================================
btnApplyFilters.addEventListener('click', generateCustomChart);
chartTypeSelect.addEventListener('change', generateCustomChart);

function generateCustomChart() {
  const primaryQId = primaryQuestionSelect.value;
  if (!primaryQId) return;

  const primaryQuestion = activeSurveyQuestions.find(q => q.id === primaryQId);
  const filterAQId = filterAQuestion.value;
  const filterAVal = filterAValue.value;
  const filterBQId = filterBQuestion.value;
  const filterBVal = filterBValue.value;

  // Filtrado cruzado: los encuestados deben cumplir ambas condiciones a la vez
  const filteredSubmissions = activeSurveyRawResponses.filter(resp => {
    if (filterAQId && filterAVal) {
      const valsA = resp[filterAQId] || [];
      if (!valsA.includes(filterAVal)) return false;
    }
    if (filterBQId && filterBVal) {
      const valsB = resp[filterBQId] || [];
      if (!valsB.includes(filterBVal)) return false;
    }
    return true;
  });

  filteredSampleCount.textContent = `Muestras analizadas: ${filteredSubmissions.length} encuestados`;

  const countsMap = {};

  if (primaryQuestion.question_options && primaryQuestion.question_options.length > 0) {
    primaryQuestion.question_options.forEach(opt => { countsMap[opt.label] = 0; });
  } else if (primaryQuestion.question_type === 'scale') {
    [1, 2, 3, 4, 5].forEach(n => { countsMap[`Nivel ${n}`] = 0; });
  }

  filteredSubmissions.forEach(resp => {
    const rawVals = resp[primaryQId] || [];
    rawVals.forEach(val => {
      const key = primaryQuestion.question_type === 'scale' ? `Nivel ${val}` : val;
      countsMap[key] = (countsMap[key] || 0) + 1;
    });
  });

  const labels = Object.keys(countsMap);
  const dataValues = Object.values(countsMap);
  const totalVotes = dataValues.reduce((a, b) => a + b, 0);

  let conditionsText = [];
  if (filterAQId && filterAVal) conditionsText.push(`${filterAVal}`);
  if (filterBQId && filterBVal) conditionsText.push(`${filterBVal}`);

  chartDisplayTitle.textContent = primaryQuestion.title;
  chartSubLabel.textContent = conditionsText.length > 0 
    ? `Filtrado por: ${conditionsText.join(' + ')}` 
    : `Total sin filtros (${filteredSubmissions.length} encuestados)`;

  if (totalVotes === 0) {
    noFilteredData.classList.remove('hidden');
    if (currentChartInstance) currentChartInstance.destroy();
    return;
  }

  noFilteredData.classList.add('hidden');
  renderChartObject(labels, dataValues);
}

function renderChartObject(labels, dataValues) {
  if (currentChartInstance) {
    currentChartInstance.destroy();
  }

  const selectedType = chartTypeSelect.value;
  const canvas = document.getElementById('main-analytics-canvas');
  const ctx = canvas.getContext('2d');

  const colors = [
    'rgba(79, 70, 229, 0.8)',
    'rgba(16, 185, 129, 0.8)',
    'rgba(245, 158, 11, 0.8)',
    'rgba(239, 68, 68, 0.8)',
    'rgba(6, 182, 212, 0.8)',
    'rgba(168, 85, 247, 0.8)',
    'rgba(236, 72, 153, 0.8)',
    'rgba(100, 116, 139, 0.8)'
  ];

  const borderColors = [
    '#4f46e5',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
    '#a855f7',
    '#ec4899',
    '#64748b'
  ];

  let chartConfig = {};

  if (selectedType === 'bar') {
    chartConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Frecuencia',
          data: dataValues,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    };
  } else if (selectedType === 'horizontalBar') {
    chartConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Frecuencia',
          data: dataValues,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 8
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    };
  } else if (selectedType === 'line') {
    chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tendencia',
          data: dataValues,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.15)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    };
  } else if (selectedType === 'pie') {
    chartConfig = {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    };
  } else if (selectedType === 'doughnut') {
    chartConfig = {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { position: 'bottom' } }
      }
    };
  }

  currentChartInstance = new Chart(ctx, chartConfig);
}

// ==========================================================
// 6. EXPORTACIÓN A EXCEL NATIVO CON FILTROS
// ==========================================================

function getSafeFileName(extension) {
  const rawTitle = activeSurveyTitle.textContent || 'encuesta';
  const cleanTitle = rawTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');
  return `respuestas_${cleanTitle}_${Date.now()}.${extension}`;
}

// Exportar TODOS los datos crudos e incrustar la función de Autofiltro de Excel
function exportToExcel() {
  if (!activeSurveyQuestions.length || !activeSurveyRawResponses.length) {
    alert("No hay respuestas disponibles para exportar.");
    return;
  }

  // 1. Mapear datos en bruto (sin filtros visuales)
  const rows = activeSurveyRawResponses.map((resp, index) => {
    const rowObj = { '#': index + 1 };
    activeSurveyQuestions.forEach((q, idx) => {
      const answers = resp[q.id] || [];
      rowObj[`P${idx + 1}: ${q.title}`] = answers.join(', ');
    });
    return rowObj;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // 2. Ajuste automático de ancho de las celdas
  const colWidths = Object.keys(rows[0]).map(key => ({ wch: Math.max(key.length, 15) }));
  worksheet['!cols'] = colWidths;

  // 3. Activar los filtros nativos de Excel en la primera fila (los encabezados)
  if (worksheet['!ref']) {
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Datos Completos");

  XLSX.writeFile(workbook, getSafeFileName('xlsx'));
}

// Listener del botón de Excel
if (btnExportExcel) {
  btnExportExcel.addEventListener('click', exportToExcel);
}

// ==========================================================
// 7. EXPORTAR / DESCARGAR EN PNG
// ==========================================================
btnDownloadChart.addEventListener('click', () => {
  const canvas = document.getElementById('main-analytics-canvas');
  if (!currentChartInstance) {
    alert("No hay ningún gráfico para descargar.");
    return;
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.fillStyle = '#ffffff';
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(canvas, 0, 0);

  const imageLink = document.createElement('a');
  imageLink.download = `grafica_${activeSurveyTitle.textContent.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.png`;
  imageLink.href = tempCanvas.toDataURL('image/png', 1.0);
  imageLink.click();
});

function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.addEventListener('DOMContentLoaded', initSession);