import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = React.memo(({ size = 'md' }) => {
  const sizeClass =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-[21px]';

  return (
    <span className={`brand-wordmark ${sizeClass}`} aria-label="OZdigiFinance">
      <span className="brand-blue">OZdigi</span>
      <span className="brand-silver">Finance</span>
    </span>
  );
});

BrandLogo.displayName = 'BrandLogo';
