
import { translations, type Language, type TranslationKey } from "./translations";

class SettingsManager {
  disableRotation = $state(false);
  #lang = $state<Language>("ja");

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
    }
  }

  setDisableRotation(value: boolean) {
    this.disableRotation = value;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("settings:disableRotation", String(value));
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
