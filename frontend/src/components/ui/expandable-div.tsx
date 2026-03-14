'use client';

import React, { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { Button } from './button';

export interface ExpandableDivProps {
  children: React.ReactNode;
  showRoundedCorners?: boolean;
  showShadow?: boolean;
  showBorder?: boolean;
  disableStickyTop?: boolean;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

const ExpandableDiv: React.FC<ExpandableDivProps> = ({
  children,
  showRoundedCorners = false,
  showShadow = false,
  showBorder = false,
  disableStickyTop = true,
  isCollapsible = false,
  defaultCollapsed = false,
  className = ''
}) => {
  const [isCollapsed, setIsCollapsed] = useState(isCollapsible ? defaultCollapsed : false);

  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`relative bg-white ${showRoundedCorners ? 'rounded-lg overflow-hidden' : ''} ${showShadow ? 'shadow-sm' : ''} ${showBorder ? 'border border-gray-200' : ''} ${!disableStickyTop ? 'sticky top-0 z-10' : ''} ${className}`}>
      {(!isCollapsible || !isCollapsed) && (
        <div>
          {children}
        </div>
      )}

      {/* Floating toggle button - only show if collapsible */}
      {isCollapsible && (
        <Button
          onClick={toggleCollapsed}
          variant="outline"
          size="icon"
          className="absolute bottom-[-2px] right-4 sm:right-6 transform translate-y-1/2 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow-sm transition-all duration-200 z-10"
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? (
            <ChevronDownIcon className="h-4 w-4 text-gray-600" />
          ) : (
            <ChevronUpIcon className="h-4 w-4 text-gray-600" />
          )}
        </Button>
      )}
    </div>
  );
};

export default ExpandableDiv;
