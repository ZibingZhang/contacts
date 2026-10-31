import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { paletteOptionsFor, type PaletteName, type ResolvedMode } from "./palettes";

export type AppearanceMode = "system" | "light" | "dark";

const MODE_STORAGE_KEY = "contacts.theme.mode";
const PALETTE_STORAGE_KEY = "contacts.theme.palette";

function readStoredMode(): AppearanceMode {
  const raw = localStorage.getItem(MODE_STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function readStoredPalette(): PaletteName {
  const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
  return raw === "solarized" || raw === "rose-pine" ? raw : "default";
}

interface ThemeSettings {
  mode: AppearanceMode;
  setMode: (mode: AppearanceMode) => void;
  palette: PaletteName;
  setPalette: (palette: PaletteName) => void;
  resolvedMode: ResolvedMode;
}

const ThemeSettingsContext = createContext<ThemeSettings | null>(null);

export function useThemeSettings(): ThemeSettings {
  const context = useContext(ThemeSettingsContext);
  if (!context) {
    throw new Error("useThemeSettings must be used within a ThemeSettingsProvider");
  }
  return context;
}

export function ThemeSettingsProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppearanceMode>(readStoredMode);
  const [palette, setPalette] = useState<PaletteName>(readStoredPalette);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  }, [palette]);

  // Only matters while mode is "system", but cheap enough to always track.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(event: MediaQueryListEvent) {
      setSystemPrefersDark(event.matches);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const resolvedMode: ResolvedMode = mode === "system" ? (systemPrefersDark ? "dark" : "light") : mode;

  const theme = useMemo(
    () => createTheme({ palette: paletteOptionsFor(palette, resolvedMode) }),
    [palette, resolvedMode]
  );

  const settings = useMemo(
    () => ({ mode, setMode, palette, setPalette, resolvedMode }),
    [mode, palette, resolvedMode]
  );

  return (
    <ThemeSettingsContext.Provider value={settings}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeSettingsContext.Provider>
  );
}
