import { translations, type Language, type TranslationKey } from "./translations";

class I18nManager {
  #lang = $state<Language>("ja");

  constructor() {
    this.init();
  }

  private init() {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("lang") as Language;
      if (saved && (saved === "ja" || saved === "en")) {
        this.#lang = saved;
      } else {
        const browserLang = navigator.language.split("-")[0];
        this.#lang = browserLang === "ja" ? "ja" : "en";
      }
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
}

export const i18n = new I18nManager();
