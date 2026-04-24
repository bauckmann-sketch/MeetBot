"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // Načti preferenci z localStorage
    const saved = localStorage.getItem("meetbot-theme");
    const isDark = saved ? saved === "dark" : true;
    setDark(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("meetbot-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="btn btn-ghost btn-sm"
      title={dark ? "Přepnout na světlý mód" : "Přepnout na tmavý mód"}
      style={{ fontSize: 16, padding: "6px 10px" }}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
