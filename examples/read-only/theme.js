// The example keeps UI theme state on the app root; diagram styles remain independent.
const STORAGE_KEY = 'archimate-js.ui-theme';
const choices = new Set(['default', 'light', 'dark', 'high-contrast-light', 'high-contrast-dark']);
const app = document.querySelector('.am-app');
const selector = document.querySelector('#theme-choice');
const preference = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveTheme(choice) {
  return choice === 'default' ? (preference.matches ? 'dark' : 'light') : choice;
}

function applyTheme() {
  app.dataset.theme = effectiveTheme(selector.value);
  selector.setAttribute('aria-label', `Theme: ${selector.selectedOptions[0].textContent}`);
}

try {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (choices.has(stored)) selector.value = stored;
} catch {
  // Storage can be unavailable in restricted or private browsing contexts.
}

applyTheme();
selector.addEventListener('change', () => {
  applyTheme();
  try { window.localStorage.setItem(STORAGE_KEY, selector.value); } catch { /* ephemeral choice */ }
});
preference.addEventListener('change', () => {
  if (selector.value === 'default') applyTheme();
});
