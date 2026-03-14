import React from 'react';

interface PageContentProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContent({ children, className = "" }: PageContentProps) {
  return (
    <div className={`mx-auto px-4 lg:px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}
