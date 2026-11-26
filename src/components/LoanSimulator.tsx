import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  NOMINAL_PRESETS,
  TENOR_PRESETS,
  computeLoan,
  formatRupiah,
  formatShortNominal,
} from '../utils/finance';

interface LoanSimulatorProps {
  ctaLabel: string;
  onSubmitCta: (amount: number, months: number) => void;
  idPrefix?: string;
}

export const LoanSimulator: React.FC<LoanSimulatorProps> = ({
  ctaLabel,
  onSubmitCta,
  idPrefix = 'sim',
}) => {
  const [amount, setAmount] = useState<number>(3_000_000);
  const [manualText, setManualText] = useState<string>('3000000');
  const [months, setMonths] = useState<number>(6);

  const result = useMemo(() => computeLoan(amount, months), [amount, months]);

  const amountInputId = `${idPrefix}-amount-range`;
  const manualInputId = `${idPrefix}-manual-amount`;
  const tenorInputId = `${idPrefix}-tenor-range`;

  const applyPresetOrSliderAmount = (val: number) => {
    setAmount(val);
    setManualText(String(val));
  };

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    setManualText(rawDigits);
    if (!rawDigits) {
      setAmount(0);
      return;
    }
    const parsed = Number(rawDigits);
    if (Number.isFinite(parsed)) {
      setAmount(Math.min(500_000_000, parsed));
    }
  };

  const handleManualBlur = () => {
    if (amount < 100_000) {
      applyPresetOrSliderAmount(500_000);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Controls */}
      <div className="lg:col-span-7 space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <label
              htmlFor={manualInputId}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Nominal Pinjaman
            </label>
            <span className="text-lg font-extrabold text-blue-700 dark:text-blue-400 font-mono-num">
              {formatRupiah(amount)}
            </span>
          </div>

          {/* Manual Input */}
          <div className="mb-3">
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-xs font-bold text-slate-500 dark:text-slate-400 pointer-events-none">
                Rp
              </span>
              <input
                id={manualInputId}
                data-testid={`${idPrefix}-manual-amount`}
                type="text"
                inputMode="numeric"
                value={manualText}
                onChange={handleManualInputChange}
                onBlur={handleManualBlur}
                placeholder="Masukkan nominal manual (contoh: 1750000)"
                aria-label="Masukkan nominal pinjaman manual"
                className="w-full min-h-[42px] pl-10 pr-36 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold font-mono-num text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <span className="absolute right-3 text-[11px] font-medium text-slate-400 dark:text-slate-500 pointer-events-none">
                Input Manual / Geser
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {NOMINAL_PRESETS.map((preset) => {
              const active = amount === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPresetOrSliderAmount(preset)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  {formatShortNominal(preset)}
                </button>
              );
            })}
          </div>

          <input
            id={amountInputId}
            aria-label="Slider nominal pinjaman"
            type="range"
            className="oz-range"
            min={500_000}
            max={20_000_000}
            step={500_000}
            value={Math.min(20_000_000, Math.max(500_000, amount || 500_000))}
            onChange={(e) => applyPresetOrSliderAmount(Number(e.target.value))}
          />
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
            <span>Rp 500 rb</span>
            <span>Rp 20 jt (atau ketik manual)</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <label
              htmlFor={tenorInputId}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Tenor Pinjaman (1 – 12 Bulan)
            </label>
            <span className="text-base font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">
              {months} Bulan
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-3">
            {TENOR_PRESETS.map((m) => {
              const active = months === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-2 py-2 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-blue-600 ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  {m} Bln
                </button>
              );
            })}
          </div>

          <input
            id={tenorInputId}
            type="range"
            className="oz-range"
            min={1}
            max={12}
            step={1}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
          />
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
            <span>1 Bulan</span>
            <span>12 Bulan</span>
          </div>
        </div>
      </div>

      {/* Right: Summary & Primary Action */}
      <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Estimasi Cicilan / Bulan
          </span>
          <strong
            data-testid={`${idPrefix}-installment`}
            className="text-2xl sm:text-[26px] font-extrabold text-blue-700 dark:text-blue-400 tabular-nums tracking-tight block mt-1"
          >
            {formatRupiah(result.monthlyInstallment)}
          </strong>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Dana Diterima
            </span>
            <strong
              data-testid={`${idPrefix}-net`}
              className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400 font-mono-num block mt-0.5"
            >
              {formatRupiah(result.netDisbursed)}
            </strong>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              Tenor Pilihan
            </span>
            <strong
              data-testid={`${idPrefix}-tenor`}
              className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums block mt-0.5"
            >
              {result.months} Bulan
            </strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSubmitCta(amount, months)}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-all shadow-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
