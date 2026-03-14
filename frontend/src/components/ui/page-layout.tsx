import React from 'react';

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function PageLayout({ children, className = "" }: PageLayoutProps) {
  return (
    <div className={`mx-auto ${className}`}>
      {children}
    </div>
  );
}
