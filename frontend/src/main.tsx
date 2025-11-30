import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import axios from "axios";

const apiUrl = import.meta.env.VITE_API_URL;

axios.defaults.baseURL = apiUrl ? apiUrl.replace(/\/$/, "") : "";
axios.defaults.withCredentials = true;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
