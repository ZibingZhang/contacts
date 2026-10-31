import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ThemeSettingsProvider } from "./theme/ThemeSettingsContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeSettingsProvider>
      <App />
    </ThemeSettingsProvider>
  </StrictMode>
);
