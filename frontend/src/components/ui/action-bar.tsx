'use client';

import React from 'react';

export interface ActionBarProps {
  children?: React.ReactNode;
  showShadow?: boolean;
  showBorder?: boolean;
  disableStickyTop?: boolean;
  className?: string;
}

export default function ActionBar({
  children,
  showShadow = false,
  showBorder = false,
  disableStickyTop = true,
  className = '',
}: ActionBarProps) {
  return (
    <div className={`bg-white ${showShadow ? 'shadow-md' : ''} ${showBorder ? 'border-b border-gray-200' : ''} ${!disableStickyTop ? 'sticky top-0 z-10' : ''} ${className}`}>
      <div className="px-4 lg:px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-6 items-stretch w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
