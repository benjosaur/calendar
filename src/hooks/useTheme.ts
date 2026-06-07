"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  // Start with "light" for SSR consistency; synced to stored preference on mount.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(stored === "dark" || (!stored && prefersDark) ? "dark" : "light");
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem("theme", next);
      return next;
    });
  };

  return { theme, toggle };
}
