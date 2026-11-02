import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { ThemeSettingsProvider } from "./theme/ThemeSettingsContext";

// A single catch-all route, rather than one per path shape: `App` holds
// cross-cutting state (contacts, tags, sync/admin modals, etc.) that must
// survive navigation between views, and keeping it as one element at one
// position in the tree -- parsing the matched path itself via `useLocation`
// -- guarantees React never unmounts/remounts it while the route changes.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeSettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </ThemeSettingsProvider>
  </StrictMode>
);
