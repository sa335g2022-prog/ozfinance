import React from 'react';
import { CheckCircle2, Clock, AlertCircle, CircleDashed } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(({ status }) => {
  const lower = status.toLowerCase();

  if (lower.includes('belum lunas') || lower.includes('terjadwal')) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
        <CircleDashed className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{status}</span>
      </span>
    );
  }

  const isDanger = lower.includes('penarikan') || lower.includes('gagal');
  if (isDanger) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{status}</span>
      </span>
    );
  }

  const isWarn = lower.includes('menunggu') || lower.includes('jatuh tempo');
  if (isWarn) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{status}</span>
      </span>
    );
  }

  const isSuccess =
    lower.includes('terverifikasi') ||
    lower.includes('berhasil') ||
    lower.includes('lunas') ||
    lower.includes('aktif') ||
    lower.includes('berjalan') ||
    lower.includes('setoran') ||
    lower.includes('online');

  if (isSuccess) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{status}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
      <span>{status}</span>
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';
