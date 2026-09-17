// Configuración de Supabase
const SUPABASE_URL = "https://jzworsqfyajqyvqxeagm.supabase.co";
const SUPABASE_KEY = "sb_publishable_UnmHnqscciaH547wIWTeyA_-galABYH";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const btnSubmit = document.getElementById('btn-submit');
const btnText = document.getElementById('btn-text');

// Redirección segura compatible con subdirectorios de GitHub Pages
function navigateTo(targetRelativePath) {
  const fullUrl = window.location.href;
  const baseUrl = fullUrl.includes('index.html')
    ? fullUrl.substring(0, fullUrl.lastIndexOf('/'))
    : fullUrl.replace(/\/+$/, '');

  window.location.href = `${baseUrl}/${targetRelativePath}`;
}

// Verificar si ya hay una sesión activa
async function checkAuthSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    navigateTo("crear-encuesta/index.html");
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  btnSubmit.disabled = true;
  btnText.textContent = "Verificando...";

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    loginError.textContent = "Error al iniciar sesión: " + error.message;
    loginError.classList.remove('hidden');
    btnSubmit.disabled = false;
    btnText.textContent = "Ingresar al Constructor";
  } else {
    navigateTo("crear-encuesta/index.html");
  }
});

window.addEventListener('DOMContentLoaded', checkAuthSession);