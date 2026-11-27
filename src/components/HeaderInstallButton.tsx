import React from 'react';
import { Download } from 'lucide-react';

interface HeaderInstallButtonProps {
  isInstalled: boolean;
  onClick: () => void;
  compact?: boolean;
  sidebar?: boolean;
}

export const HeaderInstallButton: React.FC<HeaderInstallButtonProps> = React.memo(
  ({ isInstalled, onClick, compact = false, sidebar = false }) => {
    if (isInstalled) return null;

    return (
      <button
        type="button"
        data-testid="header-install-btn"
        onClick={onClick}
        aria-label="Instal aplikasi OZdigiFinance ke perangkat"
        className={`inline-flex items-center gap-1 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/95 dark:bg-blue-950/70 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-blue-700 dark:text-blue-300 font-bold transition-colors whitespace-nowrap shrink-0 shadow-xs ${
          sidebar
            ? 'min-h-[28px] px-2 py-1 text-[10.5px]'
            : compact
              ? 'min-h-[30px] px-2 sm:px-2.5 py-1 text-[11px]'
              : 'min-h-[34px] px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs'
        }`}
      >
        <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" aria-hidden="true" />
        {sidebar ? (
          <span>Install</span>
        ) : (
          <>
            <span className="sm:hidden">Install</span>
            <span className="hidden sm:inline">Install App</span>
          </>
        )}
      </button>
    );
  }
);

HeaderInstallButton.displayName = 'HeaderInstallButton';
