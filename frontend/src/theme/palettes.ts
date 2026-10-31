import type { PaletteOptions } from "@mui/material/styles";

export type PaletteName = "default" | "solarized" | "rose-pine";
export type ResolvedMode = "light" | "dark";

interface Swatches {
  background: string;
  paper: string;
  textPrimary: string;
  textSecondary: string;
  divider: string;
  primary: string;
  secondary: string;
}

// Solarized (https://ethanschoonover.com/solarized/), matching the values
// used by the baystateconferenceswive Jekyll site's solarized skin
// (_sass/skins/_solarized-runtime.scss).
const SOLARIZED: Record<ResolvedMode, Swatches> = {
  light: {
    background: "#fdf6e3", // base3
    paper: "#eee8d5", // base2
    textPrimary: "#4e626a", // base00
    textSecondary: "#93a1a1", // base1
    divider: "#e8e3d4",
    primary: "#2072ac", // dark blue
    secondary: "#d33682", // magenta
  },
  dark: {
    background: "#002b36", // base03
    paper: "#073642", // base02
    textPrimary: "#91a0a1", // base0
    textSecondary: "#586e75", // base01
    divider: "#193843",
    primary: "#469edd", // light blue
    secondary: "#d33682", // magenta
  },
};

// Rosé Pine (https://rosepinetheme.com/), matching the same site's
// rose-pine skin (_sass/skins/_rose-pine-runtime.scss). "Dawn" is the light
// variant, "Moon" is the dark variant.
const ROSE_PINE: Record<ResolvedMode, Swatches> = {
  light: {
    background: "#faf4ed", // dawn base
    paper: "#fffaf3", // dawn surface
    textPrimary: "#575279", // dawn text
    textSecondary: "#797593", // dawn subtle
    divider: "#f4ede8", // dawn highlight-low
    primary: "#286983", // dawn pine
    secondary: "#907aa9", // dawn iris
  },
  dark: {
    background: "#232136", // moon base
    paper: "#2a273f", // moon surface
    textPrimary: "#e0def4", // moon text
    textSecondary: "#908caa", // moon subtle
    divider: "#2a283e", // moon highlight-low
    primary: "#3e8fb0", // moon pine
    secondary: "#c4a7e7", // moon iris
  },
};

export function paletteOptionsFor(name: PaletteName, mode: ResolvedMode): PaletteOptions {
  if (name === "default") {
    return { mode };
  }
  const swatches = (name === "solarized" ? SOLARIZED : ROSE_PINE)[mode];
  return {
    mode,
    background: { default: swatches.background, paper: swatches.paper },
    text: { primary: swatches.textPrimary, secondary: swatches.textSecondary },
    divider: swatches.divider,
    primary: { main: swatches.primary },
    secondary: { main: swatches.secondary },
  };
}

export const PALETTE_LABELS: Record<PaletteName, string> = {
  default: "Default",
  solarized: "Solarized",
  "rose-pine": "Rosé Pine",
};
