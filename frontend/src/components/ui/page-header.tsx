'use client';

import React, { useState } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface PageHeaderProps {
  title: string | React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  isCollapsible?: boolean;
  defaultExpanded?: boolean;
}

export function PageHeader({
  title,
  description,
  actions,
  className = "",
  isCollapsible = true,
  defaultExpanded = true,
}: PageHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const showToggle = isCollapsible && description;

  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {showToggle && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors duration-200"
              aria-label={isExpanded ? "Collapse description" : "Expand description"}
            >
              {isExpanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && (
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            !showToggle || isExpanded
              ? "max-h-40 opacity-100 mt-1"
              : "max-h-0 opacity-0 mt-0"
          }`}
        >
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      )}
    </div>
  );
}
