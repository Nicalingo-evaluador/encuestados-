// ==========================================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================================
const SUPABASE_URL = "https://jzworsqfyajqyvqxeagm.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnmHnqscciaH547wIWTeyA_-galABYH";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allSurveys = [];

// Elementos del DOM
const loadingSpinner = document.getElementById('loading-spinner');
const surveysGrid = document.getElementById('surveys-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const btnLogout = document.getElementById('btn-logout');

// 1. Validar Sesión del Creador
async function initSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "../index.html";
    return;
  }
  currentUser = session.user;
  await fetchSurveys();
}

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "../index.html";
  });
}

// 2. Navegación Segura en Header
window.goToBuilder = () => {
  window.location.href = "../crear-encuesta/index.html";
};

window.goToStats = (surveyId) => {
  if (surveyId) {
    window.location.href = `../estadisticas/index.html?id=${surveyId}`;
  } else if (allSurveys.length > 0) {
    window.location.href = `../estadisticas/index.html?id=${allSurveys[0].id}`;
  } else {
    window.location.href = "../estadisticas/index.html";
  }
};

// 3. Consultar Encuestas desde Supabase
async function fetchSurveys() {
  loadingSpinner.classList.remove('hidden');
  surveysGrid.classList.add('hidden');
  emptyState.classList.add('hidden');

  const { data, error } = await supabaseClient
    .from('surveys')
    .select(`
      id,
      title,
      description,
      slug,
      is_published,
      published_at,
      created_at,
      primary_color,
      background_type,
      background_value,
      survey_responses(count)
    `)
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  loadingSpinner.classList.add('hidden');

  if (error) {
    console.error("Error al cargar encuestas:", error);
    alert("Error al cargar el historial: " + error.message);
    return;
  }

  allSurveys = data || [];
  renderCards(allSurveys);
}

// 4. Renderizar Cards con Datos y Botones
function renderCards(surveysList) {
  if (surveysList.length === 0) {
    surveysGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  surveysGrid.classList.remove('hidden');
  surveysGrid.innerHTML = '';

  surveysList.forEach(survey => {
    const rawDate = survey.published_at || survey.created_at;
    const dateFormatted = new Date(rawDate).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    const responseCount = survey.survey_responses?.[0]?.count || 0;

    const card = document.createElement('div');
    card.className = 'app-card survey-card p-6 bg-white border border-slate-200';

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${survey.is_published ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}">
            ${survey.is_published ? '● Publicada' : '○ Borrador'}
          </span>
          <span class="text-xs text-slate-400 font-medium">
            ${survey.is_published ? 'Lanzada:' : 'Creada:'} ${dateFormatted}
          </span>
        </div>

        <h2 class="text-lg font-bold text-slate-900 mb-1 leading-snug line-clamp-1" title="${escapeHtml(survey.title)}">
          ${escapeHtml(survey.title)}
        </h2>
        <p class="text-sm text-slate-500 line-clamp-2 mb-4">
          ${escapeHtml(survey.description || 'Sin descripción proporcionada.')}
        </p>

        <!-- Contador de respuestas recibidas -->
        <div class="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 mb-4">
          <span>📊</span>
          <span class="font-semibold text-indigo-600">${responseCount}</span> respuestas recopiladas
        </div>
      </div>

      <!-- Pie de la Card con Enlace, Estadísticas, Editar y Eliminar -->
      <div class="pt-4 border-t border-slate-100 space-y-3">
        <div class="flex items-center justify-between">
          <button type="button" onclick="copyLink('${survey.slug}')" class="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
            🔗 Copiar Enlace
          </button>
          
          <button type="button" onclick="goToStats('${survey.id}')" class="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium py-1.5 px-3 rounded-lg transition inline-flex items-center gap-1">
            📈 Ver Gráficas
          </button>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
          <button type="button" onclick="editSurvey('${survey.id}')" class="text-xs text-slate-600 hover:text-indigo-600 font-medium py-1 px-2.5 rounded transition flex items-center gap-1" title="Editar Encuesta">
            ✏️ Editar
          </button>
          <button type="button" onclick="deleteSurvey('${survey.id}', '${survey.background_type}', '${survey.background_value}')" class="text-xs text-slate-400 hover:text-red-600 font-medium py-1 px-2.5 rounded transition flex items-center gap-1" title="Eliminar Encuesta">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    `;

    surveysGrid.appendChild(card);
  });
}

// 5. Copiar enlace público de la sub-web
window.copyLink = (slug) => {
  const baseUrl = window.location.href.split('/historial/')[0];
  const publicUrl = `${baseUrl}/encuestado/index.html?s=${slug}`;
  navigator.clipboard.writeText(publicUrl);
  alert("¡Enlace directo copiado al portapapeles!");
};

// 6. Editar Encuesta
window.editSurvey = (surveyId) => {
  window.location.href = `../crear-encuesta/index.html?edit=${surveyId}`;
};

// 7. Eliminar Encuesta y limpiar archivo de Storage
window.deleteSurvey = async (surveyId, bgType, bgValue) => {
  if (!confirm("¿Estás seguro de eliminar esta encuesta? Se borrarán todas las preguntas y respuestas recopiladas de forma permanente.")) {
    return;
  }

  try {
    if (bgType === 'image' && bgValue && bgValue.includes('survey-backgrounds')) {
      const urlParts = bgValue.split('survey-backgrounds/');
      if (urlParts[1]) {
        const filePath = decodeURIComponent(urlParts[1]);
        await supabaseClient.storage.from('survey-backgrounds').remove([filePath]);
      }
    }

    const { error } = await supabaseClient
      .from('surveys')
      .delete()
      .eq('id', surveyId);

    if (error) throw error;

    alert("Encuesta eliminada correctamente.");
    await fetchSurveys();
  } catch (err) {
    console.error("Error al eliminar:", err);
    alert("No se pudo eliminar la encuesta: " + err.message);
  }
};

// 8. Buscador en tiempo real
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = allSurveys.filter(s => s.title.toLowerCase().includes(query));
    renderCards(filtered);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.addEventListener('DOMContentLoaded', initSession);