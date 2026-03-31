import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const API_ACCESS_TOKEN = import.meta.env.VITE_API_ACCESS_TOKEN || "";

function getToken(): string {
  try {
    const raw = localStorage.getItem("persist:root");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed.token) {
      try {
        const tokenData = JSON.parse(parsed.token);
        if (tokenData.token) return tokenData.token;
      } catch {
        // token value itself is a plain JWT string
        if (typeof parsed.token === "string") return parsed.token;
      }
    }
  } catch { }
  return "";
}

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Api-Access-Token": API_ACCESS_TOKEN,
  },
});

axiosInstance.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosInstance;
