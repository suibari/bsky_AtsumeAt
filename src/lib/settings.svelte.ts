
import { translations, type Language, type TranslationKey } from "./translations";

class SettingsManager {
  disableRotation = $state(false);
  #lang = $state<Language>("ja");
  #theme = $state<"system" | "light" | "dark">("system");

  constructor() {
    this.init();
  }

  private init() {
    if (typeof localStorage !== "undefined") {
      // Rotation Setting
      const savedRotation = localStorage.getItem("settings:disableRotation");
      if (savedRotation) {
        this.disableRotation = savedRotation === "true";
      }

      // Language Setting
      const savedLang = localStorage.getItem("lang") as Language;
      if (savedLang && (savedLang === "ja" || savedLang === "en")) {
        this.#lang = savedLang;
      } else {
        const browserLang = navigator.language.split("-")[0];
        this.#lang = browserLang === "ja" ? "ja" : "en";
      }

      // Theme Setting
      const savedTheme = localStorage.getItem("settings:theme");
      if (savedTheme && ["system", "light", "dark"].includes(savedTheme)) {
        this.#theme = savedTheme as "system" | "light" | "dark";
      }
      this.applyTheme();

      // System theme listener
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
          if (this.#theme === "system") {
            this.applyTheme();
          }
        });
    }
  }

  setDisableRotation(value: boolean) {
    this.disableRotation = value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("settings:disableRotation", String(value));
    }
  }

  get theme() {
    return this.#theme;
  }

  set theme(value: "system" | "light" | "dark") {
    this.#theme = value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("settings:theme", value);
      this.applyTheme();
    }
  }

  public applyTheme() {
    if (typeof document === "undefined") return;

    const isDark =
      this.#theme === "dark" ||
      (this.#theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  get lang() {
    return this.#lang;
  }

  set lang(value: Language) {
    this.#lang = value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("lang", value);
    }
  }

  get t(): TranslationKey {
    return translations[this.#lang];
  }

  resolve(path: string): string {
    const keys = path.split('.');
    let current: any = this.t;
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return path; // Fallback to key
      }
    }
    return typeof current === 'string' ? current : path;
  }
}

export const settings = new SettingsManager();
