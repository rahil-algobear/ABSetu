"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PageHeaderProps {
  title: string | React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  className = "",
  isCollapsible = true,
  defaultCollapsed = false,
}: PageHeaderProps) {
  const [isCollapsed, setIsCollapsed] = useState(
    isCollapsible ? defaultCollapsed : false
  );

  return (
    <div
      className={`relative bg-white border-b border-gray-50 shadow-sm ${className}`}
    >
      {(!isCollapsible || !isCollapsed) && (
        <div className="px-4 lg:px-6 pt-6 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 break-words">
                {title}
              </h1>
              {description && (
                <p className="text-gray-600 break-words mt-1 text-sm">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex-shrink-0 min-w-0">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {actions}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isCollapsible && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute bottom-[-5px] right-4 sm:right-6 transform translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow-sm transition-all duration-200 z-10"
          aria-label={isCollapsed ? "Expand header" : "Collapse header"}
        >
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-600" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-600" />
          )}
        </button>
      )}
    </div>
  );
}
