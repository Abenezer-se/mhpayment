import { useEffect, useState } from "react";
import { Icon } from "./icons";

const KEY = "mh_theme";
export type Theme = "light" | "dark";

export const getTheme = (): Theme => {
  try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
};
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0b2239" : "#17426b");
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
}

/** Light is the default; the choice is remembered on this device. */
export function ThemeToggle({ floating }: { floating?: boolean }) {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const dark = theme === "dark";
  const label = dark ? "ወደ ብርሃን ገጽታ ቀይር" : "ወደ ጨለማ ገጽታ ቀይር";
  return (
    <button type="button" className={`icon-btn ${floating ? "floating" : ""}`} onClick={() => setTheme(dark ? "light" : "dark")} aria-label={label} title={label}>
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}