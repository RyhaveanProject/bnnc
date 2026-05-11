 
Now let me build the frontend with multiple files in parallel:
Action: file_editor create /app/frontend/src/api.js --file-text "import axios from \"axios\";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

client.interceptors.request.use((config) => {
  const t = localStorage.getItem(\"bnnc_token\");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export default client;
"
Observation: Create successful: /app/frontend/src/api.js
