import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { injectSpeedInsights } from "@vercel/speed-insights";
import "./styles/tokens.css";
import "./styles/app.css";
import App from "./App";

injectSpeedInsights();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
