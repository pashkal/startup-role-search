// Mirrors the config module pattern from expense-tracker-claude: the API key
// lives in localStorage under a namespaced key, and all API calls go through
// apiFetch so the auth header is never forgotten at a call site.
const STORAGE_KEY = "startup-role-search-api-key";

export const getApiKey = () => localStorage.getItem(STORAGE_KEY) || "";

export const setApiKey = (key) => localStorage.setItem(STORAGE_KEY, key);

export const apiFetch = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, "X-API-Key": getApiKey() },
  });
