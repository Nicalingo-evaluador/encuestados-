// ==========================================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================================
const SUPABASE_URL = "https://jzworsqfyajqyvqxeagm.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnmHnqscciaH547wIWTeyA_-galABYH";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado general del constructor
let currentUser = null;
let editingSurveyId = null; // Almacena el ID de la encuesta en modo edición
let uploadedImageUrl = null;
let questions = [];

// Referencias del DOM
const surveyTitle = document.getElementById('survey-title');
const surveyDesc = document.getElementById('survey-desc');
const surveyColor = document.getElementById('survey-color');
const colorHexLabel = document.getElementById('color-hex-label');
const surveyBgType = document.getElementById('survey-bg-type');
const surveyFont = document.getElementById('survey-font');
const customFontBox = document.getElementById('custom-font-box');
const customFontLink = document.getElementById('custom-font-link');
const customFontName = document.getElementById('custom-font-name');
const btnPreviewFont = document.getElementById('btn-preview-font');
const customFontPreview = document.getElementById('custom-font-preview');
const bgSolidPicker = document.getElementById('bg-solid-picker');
const bgSolidColor = document.getElementById('bg-solid-color');
const bgHexLabel = document.getElementById('bg-hex-label');
const bgImageUploader = document.getElementById('bg-image-uploader');
const bgImageFile = document.getElementById('bg-image-file');
const bgImagePreviewContainer = document.getElementById('bg-image-preview-container');
const bgImagePreview = document.getElementById('bg-image-preview');
const uploadStatus = document.getElementById('upload-status');
const questionsContainer = document.getElementById('questions-container');
const questionsCounter = document.getElementById('questions-counter');
const btnAddQuestion = document.getElementById('btn-add-question');
const btnSaveDraft = document.getElementById('btn-save-draft');
const btnPublish = document.getElementById('btn-publish');
const btnLogout = document.getElementById('btn-logout');

// ==========================================================
// 1. SESIÓN, NAVEGACIÓN Y CARGA DE EDICIÓN
// ==========================================================
async function initSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "../index.html";
    return;
  }
  currentUser = session.user;

  // Leer si viene un parámetro ?edit=ID en la URL
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');

  if (editId) {
    editingSurveyId = editId;
    await loadSurveyForEditing(editId);
  } else {
    btnAddQuestion.click();
  }
}

window.goToHistory = () => {
  window.location.href = "../historial/index.html";
};

window.goToStats = () => {
  window.location.href = "../estadisticas/index.html";
};

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "../index.html";
  });
}

// Cargar datos de la encuesta existente
async function loadSurveyForEditing(surveyId) {
  try {
    // 1. Cargar datos principales de la encuesta
    const { data: survey, error: sError } = await supabaseClient
      .from('surveys')
      .select('*')
      .eq('id', surveyId)
      .eq('user_id', currentUser.id)
      .single();

    if (sError || !survey) {
      alert("No se pudo cargar la encuesta solicitada o no tienes permisos.");
      window.location.href = "index.html";
      return;
    }

    // Rellenar formulario principal
    surveyTitle.value = survey.title || '';
    surveyDesc.value = survey.description || '';
    surveyColor.value = survey.primary_color || '#4f46e5';
    colorHexLabel.textContent = survey.primary_color || '#4f46e5';

    // Tipografía
    if (survey.font_family) {
      try {
        const parsed = JSON.parse(survey.font_family);
        surveyFont.value = 'custom';
        customFontBox.classList.remove('hidden');
        customFontName.value = parsed.name || '';
        customFontLink.value = parsed.url || '';
        applyCustomFontPreview();
      } catch (e) {
        surveyFont.value = survey.font_family;
        document.body.style.fontFamily = `'${survey.font_family}', system-ui, sans-serif`;
      }
    }

    // Fondo
    surveyBgType.value = survey.background_type || 'color';
    if (survey.background_type === 'image') {
      bgSolidPicker.classList.add('hidden');
      bgImageUploader.classList.remove('hidden');
      if (survey.background_value) {
        uploadedImageUrl = survey.background_value;
        bgImagePreview.src = survey.background_value;
        bgImagePreviewContainer.classList.remove('hidden');
      }
    } else {
      bgSolidPicker.classList.remove('hidden');
      bgImageUploader.classList.add('hidden');
      if (survey.background_value) {
        bgSolidColor.value = survey.background_value;
        bgHexLabel.textContent = survey.background_value;
      }
    }

    // 2. Cargar preguntas y opciones
    const { data: qData, error: qError } = await supabaseClient
      .from('questions')
      .select(`
        id,
        title,
        question_type,
        is_required,
        order_index,
        question_options(id, label, order_index)
      `)
      .eq('survey_id', surveyId)
      .order('order_index', { ascending: true });

    if (qError) throw qError;

    // 3. Cargar condiciones
    const { data: condData, error: cError } = await supabaseClient
      .from('question_conditions')
      .select('*')
      .eq('survey_id', surveyId);

    if (cError) throw cError;

    // Reconstruir estructura de memoria local
    questions = (qData || []).map(q => {
      const opts = (q.question_options || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(o => o.label);

      const conditionMatch = (condData || []).find(c => c.target_question_id === q.id);

      return {
        id: q.id,
        title: q.title || '',
        type: q.question_type || 'multiple_choice',
        is_required: !!q.is_required,
        options: opts.length > 0 ? opts : ['Opción 1', 'Opción 2'],
        condition: {
          depends_on_question_id: conditionMatch ? conditionMatch.depends_on_question_id : null,
          trigger_value: conditionMatch ? conditionMatch.trigger_value : ''
        }
      };
    });

    renderQuestions();
  } catch (err) {
    console.error("Error al cargar encuesta en edición:", err);
    alert("Error al recuperar los datos de la encuesta: " + err.message);
  }
}

// ==========================================================
// 2. CONFIGURACIÓN VISUAL Y GESTIÓN DE FUENTES
// ==========================================================
surveyColor.addEventListener('input', (e) => {
  colorHexLabel.textContent = e.target.value;
});

bgSolidColor.addEventListener('input', (e) => {
  bgHexLabel.textContent = e.target.value;
});

surveyBgType.addEventListener('change', (e) => {
  if (e.target.value === 'color') {
    bgSolidPicker.classList.remove('hidden');
    bgImageUploader.classList.add('hidden');
  } else {
    bgSolidPicker.classList.add('hidden');
    bgImageUploader.classList.remove('hidden');
  }
});

surveyFont.addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    customFontBox.classList.remove('hidden');
  } else {
    customFontBox.classList.add('hidden');
    document.body.style.fontFamily = `'${e.target.value}', system-ui, sans-serif`;
  }
});

btnPreviewFont.addEventListener('click', applyCustomFontPreview);

function applyCustomFontPreview() {
  const linkHtml = customFontLink.value.trim();
  const fontName = customFontName.value.trim();

  if (!fontName) {
    alert("Por favor ingresa el nombre de la familia tipográfica (por ejemplo: Google Sans).");
    customFontName.focus();
    return;
  }

  if (linkHtml) {
    const hrefMatch = linkHtml.match(/href=["']([^"']+)["']/);
    const fontUrl = hrefMatch ? hrefMatch[1] : linkHtml;

    if (fontUrl.startsWith('http')) {
      const existingLink = document.getElementById('dynamic-custom-font');
      if (existingLink) existingLink.remove();

      const linkEl = document.createElement('link');
      linkEl.id = 'dynamic-custom-font';
      linkEl.rel = 'stylesheet';
      linkEl.href = fontUrl;
      document.head.appendChild(linkEl);
    }
  }

  customFontPreview.style.fontFamily = `'${fontName}', sans-serif`;
  document.body.style.fontFamily = `'${fontName}', sans-serif`;
}

bgImageFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("El archivo supera el límite de 5MB.");
    bgImageFile.value = "";
    return;
  }

  uploadStatus.textContent = "Subiendo imagen al bucket...";
  const fileExt = file.name.split('.').pop();
  const filePath = `${currentUser.id}/${Date.now()}_bg.${fileExt}`;

  const { data, error } = await supabaseClient.storage
    .from('survey-backgrounds')
    .upload(filePath, file, { upsert: true });

  if (error) {
    console.error("Error al subir archivo a Storage:", error);
    uploadStatus.textContent = "Error al subir la imagen.";
    return;
  }

  const { data: { publicUrl } } = supabaseClient.storage
    .from('survey-backgrounds')
    .getPublicUrl(filePath);

  uploadedImageUrl = publicUrl;
  uploadStatus.textContent = "¡Imagen guardada exitosamente!";
  bgImagePreview.src = publicUrl;
  bgImagePreviewContainer.classList.remove('hidden');
});

// ==========================================================
// 3. CONSTRUCTOR DE PREGUNTAS Y CAMINOS CONDICIONALES
// ==========================================================
function updateCounter() {
  const total = questions.length;
  questionsCounter.textContent = `${total} ${total === 1 ? 'pregunta añadida' : 'preguntas añadidas'}`;
}

btnAddQuestion.addEventListener('click', () => {
  const newQuestion = {
    id: 'q_' + Math.random().toString(36).substring(2, 9),
    title: '',
    type: 'multiple_choice',
    is_required: false,
    options: ['Opción 1', 'Opción 2'],
    condition: {
      depends_on_question_id: null,
      trigger_value: ''
    }
  };
  questions.push(newQuestion);
  renderQuestions();
});

function renderQuestions() {
  questionsContainer.innerHTML = '';

  questions.forEach((q, qIndex) => {
    const card = document.createElement('div');
    card.className = 'app-card question-card p-6 border border-slate-200 bg-white relative space-y-4';

    const previousQuestions = questions.slice(0, qIndex);
    let conditionSelectOptions = `<option value="">-- Sin condición (Mostrar a todos) --</option>`;
    
    previousQuestions.forEach((prevQ, pIdx) => {
      const qNum = pIdx + 1;
      const qText = prevQ.title.trim() ? prevQ.title.substring(0, 32) : `Pregunta ${qNum}`;
      const isSelected = q.condition.depends_on_question_id === prevQ.id ? 'selected' : '';
      conditionSelectOptions += `<option value="${prevQ.id}" ${isSelected}>Mostrar si P${qNum}: ${escapeHtml(qText)}</option>`;
    });

    const selectedParentQuestion = questions.find(item => item.id === q.condition.depends_on_question_id);
    let triggerValueFieldHtml = '';

    if (!selectedParentQuestion) {
      triggerValueFieldHtml = `<div id="cond-box-${qIndex}" class="hidden"></div>`;
    } else {
      triggerValueFieldHtml = `<div id="cond-box-${qIndex}">` + getTriggerInputHtml(selectedParentQuestion, q.condition.trigger_value, qIndex) + `</div>`;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
          Pregunta #${qIndex + 1}
        </span>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
            <input type="checkbox" onchange="toggleRequired(${qIndex}, this.checked)" ${q.is_required ? 'checked' : ''} class="rounded text-indigo-600 focus:ring-indigo-500">
            Obligatoria
          </label>
          <button type="button" onclick="removeQuestion(${qIndex})" class="text-slate-400 hover:text-red-500 transition text-sm" title="Eliminar Pregunta">
            🗑️
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="sm:col-span-2">
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Título de la Pregunta</label>
          <input type="text" class="app-input text-sm" placeholder="Ej. ¿Cuál es tu área o interés principal?" value="${escapeHtml(q.title)}" oninput="updateQuestionTitle(${qIndex}, this.value)">
        </div>
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Tipo de Respuesta</label>
          <select class="app-input text-sm" onchange="updateQuestionType(${qIndex}, this.value)">
            <option value="multiple_choice" ${q.type === 'multiple_choice' ? 'selected' : ''}>Opción única (Radio)</option>
            <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>Selección múltiple (Casillas)</option>
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>Respuesta abierta (Texto)</option>
            <option value="scale" ${q.type === 'scale' ? 'selected' : ''}>Grado de conformidad (1 a 5)</option>
          </select>
        </div>
      </div>

      <div id="options-box-${qIndex}" class="pt-2">
        ${renderTypeContent(q, qIndex)}
      </div>

      <div class="pt-4 border-t border-slate-100 bg-slate-50/70 p-4 rounded-xl space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-indigo-600 font-bold">🔀</span>
          <label class="text-xs font-bold uppercase tracking-wider text-slate-700">
            Camino de Selección (Lógica Condicional)
          </label>
        </div>
        <p class="text-xs text-slate-500">Muestra esta pregunta solo si el encuestado seleccionó una opción específica antes.</p>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <select class="app-input text-xs bg-white" onchange="updateConditionDependence(${qIndex}, this.value)">
            ${conditionSelectOptions}
          </select>
          ${triggerValueFieldHtml}
        </div>
      </div>
    `;

    questionsContainer.appendChild(card);
  });

  updateCounter();
}

function getTriggerInputHtml(parentQuestion, currentValue, qIndex) {
  if (parentQuestion.type === 'multiple_choice' || parentQuestion.type === 'checkbox') {
    let optionsHtml = `<option value="">-- Elige la opción que la activa --</option>`;
    parentQuestion.options.forEach(opt => {
      const isSel = (opt.trim() === String(currentValue).trim() && opt.trim() !== '') ? 'selected' : '';
      optionsHtml += `<option value="${escapeHtml(opt)}" ${isSel}>Opción: "${escapeHtml(opt)}"</option>`;
    });
    return `
      <select class="app-input text-xs bg-white font-medium text-indigo-700" onchange="updateConditionValue(${qIndex}, this.value)">
        ${optionsHtml}
      </select>
    `;
  } else if (parentQuestion.type === 'scale') {
    return `
      <select class="app-input text-xs bg-white font-medium text-indigo-700" onchange="updateConditionValue(${qIndex}, this.value)">
        <option value="">-- Elige la puntuación que la activa --</option>
        ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${String(currentValue) === String(n) ? 'selected' : ''}>Puntuación: ${n}</option>`).join('')}
      </select>
    `;
  } else {
    return `
      <input type="text" class="app-input text-xs bg-white" placeholder="Texto exacto que la activa" value="${escapeHtml(currentValue)}" oninput="updateConditionValue(${qIndex}, this.value)">
    `;
  }
}

function renderTypeContent(q, qIndex) {
  if (q.type === 'multiple_choice' || q.type === 'checkbox') {
    let optionsHtml = `<div class="space-y-2 mb-2">`;
    q.options.forEach((opt, optIndex) => {
      optionsHtml += `
        <div class="flex items-center gap-2 option-row">
          <span class="text-slate-400 text-xs">${q.type === 'multiple_choice' ? '⚪' : '◻️'}</span>
          <input type="text" class="app-input text-sm py-1.5" value="${escapeHtml(opt)}" oninput="updateOptionValue(${qIndex}, ${optIndex}, this.value)" placeholder="Opción ${optIndex + 1}">
          ${q.options.length > 1 ? `<button type="button" onclick="removeOption(${qIndex},${optIndex})" class="text-slate-400 hover:text-red-500 text-xs px-2 py-1">✕</button>` : ''}
        </div>
      `;
    });
    optionsHtml += `</div>
      <button type="button" onclick="addOption(${qIndex})" class="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 mt-1">
        + Añadir Opción
      </button>
    `;
    return optionsHtml;
  } else if (q.type === 'scale') {
    return `
      <div class="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <span>⭐ Escala del 1 al 5:</span>
        <span class="font-medium text-slate-700">1 (Totalmente en desacuerdo) ➔ 5 (Totalmente de acuerdo)</span>
      </div>
    `;
  } else {
    return `
      <input type="text" disabled placeholder="Campo de respuesta abierta para el encuestado..." class="app-input text-xs bg-slate-50 cursor-not-allowed opacity-75">
    `;
  }
}

window.updateQuestionTitle = (qIndex, value) => { questions[qIndex].title = value; };
window.updateQuestionType = (qIndex, value) => { questions[qIndex].type = value; renderQuestions(); };
window.toggleRequired = (qIndex, value) => { questions[qIndex].is_required = value; };

window.removeQuestion = (qIndex) => { 
  const removedId = questions[qIndex].id;
  questions.splice(qIndex, 1);
  questions.forEach(q => {
    if (q.condition.depends_on_question_id === removedId) {
      q.condition.depends_on_question_id = null;
      q.condition.trigger_value = '';
    }
  });
  renderQuestions(); 
};

window.addOption = (qIndex) => {
  questions[qIndex].options.push(`Opción ${questions[qIndex].options.length + 1}`);
  renderQuestions();
};

window.updateOptionValue = (qIndex, optIndex, value) => { 
  questions[qIndex].options[optIndex] = value;
};

window.removeOption = (qIndex, optIndex) => {
  questions[qIndex].options.splice(optIndex, 1);
  renderQuestions();
};

window.updateConditionDependence = (qIndex, parentId) => {
  questions[qIndex].condition.depends_on_question_id = parentId ? parentId : null;
  questions[qIndex].condition.trigger_value = '';
  
  const condBox = document.getElementById(`cond-box-${qIndex}`);
  if (!parentId) {
    condBox.classList.add('hidden');
    condBox.innerHTML = '';
  } else {
    const parentQuestion = questions.find(q => q.id === parentId);
    condBox.innerHTML = getTriggerInputHtml(parentQuestion, '', qIndex);
    condBox.classList.remove('hidden');
  }
};

window.updateConditionValue = (qIndex, value) => { 
  questions[qIndex].condition.trigger_value = value; 
};

// ==========================================================
// 4. GUARDAR / EDITAR ENCUESTA
// ==========================================================
btnSaveDraft.addEventListener('click', () => saveSurvey(false));
btnPublish.addEventListener('click', () => saveSurvey(true));

async function saveSurvey(isPublished) {
  const title = surveyTitle.value.trim();
  if (!title) {
    alert("Por favor ingresa un título para la encuesta.");
    surveyTitle.focus();
    return;
  }

  if (questions.length === 0) {
    alert("Debes agregar al menos una pregunta a la encuesta.");
    return;
  }

  for (let i = 0; i < questions.length; i++) {
    if (!questions[i].title.trim()) {
      alert(`La Pregunta #${i + 1} no tiene título.`);
      return;
    }
  }

  const bgType = surveyBgType.value;
  const bgValue = bgType === 'image' ? (uploadedImageUrl || '#f8fafc') : bgSolidColor.value;
  const primaryCol = surveyColor.value;

  let fontFamilyPayload = surveyFont.value;
  if (surveyFont.value === 'custom') {
    const fName = customFontName.value.trim();
    const fLink = customFontLink.value.trim();

    if (!fName) {
      alert("Por favor indica el nombre de la familia tipográfica personalizada.");
      customFontName.focus();
      return;
    }

    const hrefMatch = fLink.match(/href=["']([^"']+)["']/);
    const cleanUrl = hrefMatch ? hrefMatch[1] : fLink;

    fontFamilyPayload = JSON.stringify({
      name: fName,
      url: cleanUrl
    });
  }

  btnSaveDraft.disabled = true;
  btnPublish.disabled = true;

  try {
    let surveyId = editingSurveyId;
    let finalSlug = '';

    if (editingSurveyId) {
      // MODO EDICIÓN: Actualizar registro existente
      const { data: currentSurvey, error: getError } = await supabaseClient
        .from('surveys')
        .select('slug')
        .eq('id', editingSurveyId)
        .single();

      if (getError) throw getError;
      finalSlug = currentSurvey.slug;

      const { error: updateError } = await supabaseClient
        .from('surveys')
        .update({
          title: title,
          description: surveyDesc.value.trim(),
          is_published: isPublished,
          published_at: isPublished ? new Date().toISOString() : null,
          primary_color: primaryCol,
          background_type: bgType,
          background_value: bgValue,
          font_family: fontFamilyPayload
        })
        .eq('id', editingSurveyId);

      if (updateError) throw updateError;

      // Limpiar preguntas previas (cascada elimina opciones y condiciones)
      await supabaseClient.from('questions').delete().eq('survey_id', editingSurveyId);

    } else {
      // MODO CREACIÓN: Insertar nueva encuesta
      const baseSlug = title
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      finalSlug = `${baseSlug || 'encuesta'}-${Math.random().toString(36).substring(2, 7)}`;

      const { data: surveyData, error: surveyError } = await supabaseClient
        .from('surveys')
        .insert({
          user_id: currentUser.id,
          title: title,
          description: surveyDesc.value.trim(),
          slug: finalSlug,
          is_published: isPublished,
          published_at: isPublished ? new Date().toISOString() : null,
          primary_color: primaryCol,
          background_type: bgType,
          background_value: bgValue,
          font_family: fontFamilyPayload
        })
        .select()
        .single();

      if (surveyError) throw surveyError;
      surveyId = surveyData.id;
    }

    // Insertar preguntas y opciones
    const idMapping = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const { data: qData, error: qError } = await supabaseClient
        .from('questions')
        .insert({
          survey_id: surveyId,
          title: q.title,
          question_type: q.type,
          is_required: q.is_required,
          order_index: i
        })
        .select()
        .single();

      if (qError) throw qError;
      idMapping[q.id] = qData.id;

      if (q.type === 'multiple_choice' || q.type === 'checkbox') {
        const optionsPayload = q.options.map((optLabel, oIdx) => ({
          question_id: qData.id,
          label: optLabel,
          order_index: oIdx
        }));

        const { error: optError } = await supabaseClient
          .from('question_options')
          .insert(optionsPayload);

        if (optError) throw optError;
      }
    }

    // Insertar condiciones
    const conditionsPayload = [];
    questions.forEach(q => {
      if (q.condition.depends_on_question_id && idMapping[q.condition.depends_on_question_id]) {
        conditionsPayload.push({
          survey_id: surveyId,
          target_question_id: idMapping[q.id],
          depends_on_question_id: idMapping[q.condition.depends_on_question_id],
          operator: 'EQUALS',
          trigger_value: q.condition.trigger_value
        });
      }
    });

    if (conditionsPayload.length > 0) {
      const { error: condError } = await supabaseClient
        .from('question_conditions')
        .insert(conditionsPayload);
      if (condError) throw condError;
    }

    showSuccessModal(finalSlug, isPublished);

  } catch (err) {
    console.error("Error al guardar:", err);
    alert("Ocurrió un error al guardar la encuesta: " + err.message);
  } finally {
    btnSaveDraft.disabled = false;
    btnPublish.disabled = false;
  }
}

function showSuccessModal(slug, isPublished) {
  const fullHref = window.location.href;
  let baseUrl = '';

  if (fullHref.includes('/crear-encuesta/')) {
    baseUrl = fullHref.split('/crear-encuesta/')[0];
  } else if (fullHref.includes('/crear-encuesta')) {
    baseUrl = fullHref.split('/crear-encuesta')[0];
  } else {
    baseUrl = fullHref.substring(0, fullHref.lastIndexOf('/'));
  }

  const directSurveyUrl = `${baseUrl}/encuestado/index.html?s=${slug}`;

  const modalHtml = `
    <div id="survey-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
      <div class="app-card max-w-md w-full p-6 sm:p-8 space-y-6 text-center">
        <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center text-3xl">
          🎉
        </div>
        
        <div>
          <h3 class="text-xl font-bold text-slate-900">
            ${isPublished ? '¡Encuesta Publicada!' : '¡Borrador Guardado!'}
          </h3>
          <p class="text-sm text-slate-500 mt-1">
            Tu sub-web ya está en línea y lista para recopilar respuestas anónimas.
          </p>
        </div>

        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Enlace directo para encuestados</label>
          <div class="flex items-center gap-2">
            <input type="text" readonly value="${directSurveyUrl}" id="modal-url-input" class="app-input text-xs bg-white select-all">
            <button type="button" onclick="copyModalUrl()" class="btn-primary text-xs py-2 px-3 whitespace-nowrap">
              Copiar
            </button>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 pt-2">
          <a href="${directSurveyUrl}" target="_blank" class="btn-primary flex-1 text-sm py-2.5">
            🌐 Abrir Sub-Web
          </a>
          <button type="button" onclick="goToHistory()" class="btn-secondary flex-1 text-sm py-2.5">
            📑 Ver Historial
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.copyModalUrl = () => {
  const input = document.getElementById('modal-url-input');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert("¡Enlace copiado al portapapeles!");
};

function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.addEventListener('DOMContentLoaded', () => {
  initSession();
});