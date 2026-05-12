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
  // English is the default surface; Japanese is fully opt-in via the
  // visible toggle in the header. UX 2026-05-13: the previous behaviour
  // auto-switched to JA when navigator.language started with "ja", which
  // disoriented users on iPhones with JA system language — they landed
  // on a Japanese page with the toggle hidden in the hamburger menu.
  // Only respect an explicit stored preference now; browser locale is
  // not consulted.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "ja") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe bootstrap from explicit stored preference
        setLangState("ja");
      }
    } catch {
      /* private browsing, no-op */
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
