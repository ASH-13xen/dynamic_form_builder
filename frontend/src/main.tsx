import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import axios from "axios";

// 1. Set the Base URL for all Axios requests
// If VITE_API_URL exists (Production), use it.
// If not (Localhost), use empty string (and let the Vite proxy handle it).
const apiUrl = import.meta.env.VITE_API_URL;

// Ensure we don't have double slashes if the env var ends in /
axios.defaults.baseURL = apiUrl ? apiUrl.replace(/\/$/, "") : "";
axios.defaults.withCredentials = true; // Important for Cookies
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
