"use client";

import { Component, ReactNode } from "react";
import { LangProvider } from "@/lib/language";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Experience from "@/components/Experience";
import Gallery from "@/components/Gallery";
import MenuSection from "@/components/MenuSection";
import Info from "@/components/Info";
import Footer from "@/components/Footer";
import StickyMobileCTA from "@/components/StickyMobileCTA";
import { CookieBanner } from "@/components/CookieBanner";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-background text-foreground">
          <div className="text-center">
            <p className="mb-2 text-lg font-light tracking-wider text-gold">DAIMASU</p>
            <p className="text-sm text-text-muted">
              Something went wrong. Please refresh the page.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  return (
    <ErrorBoundary>
      <LangProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:text-background"
        >
          Skip to content
        </a>
        <Header />
        <main id="main-content">
          <span id="top" aria-hidden="true" />
          <Hero />
          <About />
          <Experience />
          <Gallery />
          <MenuSection />
          <Info />
        </main>
        <Footer />
        <StickyMobileCTA />
        <CookieBanner />
      </LangProvider>
    </ErrorBoundary>
  );
}
