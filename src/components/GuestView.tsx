import React, { useEffect, useState } from 'react';
import {
  Calculator,
  Home,
  Landmark,
  PiggyBank,
  Sun,
  Moon,
  User,
  ArrowRight,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import type { ThemeMode } from '../types/app';
import { BrandLogo } from './BrandLogo';
import { LoanSimulator } from './LoanSimulator';

interface GuestViewProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

const GUEST_SECTIONS = [
  { id: 'g-hero', label: 'Beranda' },
  { id: 'g-pinjaman', label: 'Pinjaman' },
  { id: 'g-tabungan', label: 'Tabungan' },
  { id: 'g-simulasi', label: 'Simulasi' },
] as const;

export const GuestView: React.FC<GuestViewProps> = ({
  theme,
  onToggleTheme,
  onOpenAuth,
}) => {
  const [activeSec, setActiveSec] = useState<string>('g-hero');

  const scrollToSection = (id: string) => {
    setActiveSec(id);
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        let current = 'g-hero';
        for (const sec of GUEST_SECTIONS) {
          const el = document.getElementById(sec.id);
          if (el && el.getBoundingClientRect().top <= 170) {
            current = sec.id;
          }
        }
        setActiveSec(current);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky Header following clean 3-zone layout */}
      <header className="fixed top-0 inset-x-0 z-30 h-14 md:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#g-hero"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('g-hero');
            }}
            className="shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md"
          >
            <BrandLogo />
          </a>

          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300"
          >
            {GUEST_SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => scrollToSection(sec.id)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeSec === sec.id
                    ? 'border-blue-600 text-blue-700 dark:text-blue-400'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-[18px] h-[18px]" />
              ) : (
                <Moon className="w-[18px] h-[18px]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              Daftar
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-24 pb-24 md:pb-14 space-y-6">
        {/* Hero */}
        <section
          id="g-hero"
          className="rounded-2xl bg-gradient-to-br from-blue-50 via-white to-amber-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 border border-slate-200 dark:border-slate-800 p-6 sm:p-10"
        >
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">
            Platform Pinjaman &amp; Tabungan Digital
          </p>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight max-w-3xl text-balance">
            Solusi Pinjaman Cepat &amp; Tabungan Terencana dalam Satu Aplikasi
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-3 max-w-2xl leading-relaxed">
            Kelola kebutuhan dana tunai dengan tenor fleksibel 1 hingga 12 bulan serta bangun kebiasaan menabung rutin bersama{' '}
            <strong className="font-bold text-slate-900 dark:text-white">OZdigiFinance</strong>.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => scrollToSection('g-simulasi')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
            >
              <span>Simulasi Pinjaman</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-800 dark:text-slate-100 text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Masuk Akun Nasabah
            </button>
          </div>
        </section>

        {/* Product Overview Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <article
            id="g-pinjaman"
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Pinjaman Digital
                </h2>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                  Tenor 1 – 12 Bulan
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
                Limit mulai <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-100">Rp 500.000</span> hingga{' '}
                <span className="font-mono-num font-semibold text-slate-800 dark:text-slate-100">Rp 20.000.000</span> dengan proses pengajuan cepat, transparan, dan cicilan bulanan terjangkau.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => scrollToSection('g-simulasi')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition-colors whitespace-nowrap"
              >
                Hitung Cicilan
              </button>
            </div>
          </article>

          <article
            id="g-tabungan"
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Tabungan Digital
                </h2>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Fleksibel
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-4">
                Pilih opsi menabung sesuai kenyamanan Anda:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-1.5" aria-hidden="true" />
                  <strong className="block text-xs font-bold text-slate-900 dark:text-white">
                    Menabung Harian
                  </strong>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Setoran ringan setiap hari
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <CalendarDays className="w-4 h-4 text-blue-600 dark:text-blue-400 mb-1.5" aria-hidden="true" />
                  <strong className="block text-xs font-bold text-slate-900 dark:text-white">
                    Menabung Mingguan
                  </strong>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Setoran rutin per minggu
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <CalendarRange className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" aria-hidden="true" />
                  <strong className="block text-xs font-bold text-slate-900 dark:text-white">
                    Menabung Bulanan
                  </strong>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Setoran terencana bulanan
                  </span>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
              >
                Mulai Menabung
              </button>
            </div>
          </article>
        </section>

        {/* Interactive Loan Calculator */}
        <section
          id="g-simulasi"
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Kalkulator Simulasi Pinjaman
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Pilih nominal &amp; tenor 1–12 bulan
            </span>
          </div>

          <LoanSimulator
            idPrefix="guest"
            ctaLabel="Ajukan Sekarang"
            onSubmitCta={() => onOpenAuth('login')}
          />
        </section>
      </main>

      {/* Mobile-only Sticky Bottom Nav (compact <= 60px) */}
      <nav
        aria-label="Navigasi tamu mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
        <button
          type="button"
          onClick={() => scrollToSection('g-hero')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold ${
            activeSec === 'g-hero'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className="w-[18px] h-[18px]" />
          <span>Beranda</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('g-pinjaman')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold ${
            activeSec === 'g-pinjaman'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Landmark className="w-[18px] h-[18px]" />
          <span>Pinjaman</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('g-tabungan')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold ${
            activeSec === 'g-tabungan'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <PiggyBank className="w-[18px] h-[18px]" />
          <span>Tabungan</span>
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('g-simulasi')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold ${
            activeSec === 'g-simulasi'
              ? 'text-blue-600 dark:text-blue-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Calculator className="w-[18px] h-[18px]" />
          <span>Simulasi</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenAuth('login')}
          className="flex flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400"
        >
          <User className="w-[18px] h-[18px]" />
          <span>Masuk</span>
        </button>
      </nav>
    </div>
  );
};
