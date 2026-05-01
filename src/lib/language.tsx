"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

type Lang = "ja" | "en";

interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: <T extends ReactNode>(ja: T, en: T) => T;
}

const STORAGE_KEY = "daimasu-lang";

const LangContext = createContext<LangContextType>({
  lang: "en",
  setLang: () => {},
  t: (_ja, en) => en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  // English is the primary surface; Japanese is opt-in (manual toggle, stored
  // preference, or JA browser locale). SSR + first client render both use "en"
  // to keep hydration in sync.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let shouldSwitchToJa = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "ja") shouldSwitchToJa = true;
      else if (stored !== "en" && navigator.language.startsWith("ja"))
        shouldSwitchToJa = true;
    } catch {
      /* private browsing, no-op */
    }
    if (shouldSwitchToJa) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe bootstrap from external storage/navigator
      setLangState("ja");
    }
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      /* no-op */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    <T extends ReactNode>(ja: T, en: T): T => (lang === "ja" ? ja : en),
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
