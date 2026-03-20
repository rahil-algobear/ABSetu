import React from 'react';

interface TableProps {
  children: React.ReactNode;
  className?: string;
  stickyRows?: number; // Number of rows to make sticky from the top
  maxHeight?: string; // Max height for the table container (e.g., "400px", "50vh")
}

interface TableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}

export function Table({ children, className = "", stickyRows = 0, maxHeight }: TableProps) {
  const containerStyle = maxHeight ? { maxHeight, height: maxHeight } : {};

  return (
    <div
      className={`overflow-auto ${className}`}
      style={containerStyle}
    >
      <table className="min-w-full divide-y divide-gray-200">
        {React.Children.map(children, (child, index) => {
          if (React.isValidElement(child) && index < stickyRows) {
            // Clone the child and add sticky positioning
            const existingClassName = (child.props as any)?.className || '';
            return React.cloneElement(child as React.ReactElement<any>, {
              className: `${existingClassName} sticky top-0 z-10 bg-gray-50`
            });
          }
          return child;
        })}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = "" }: TableHeaderProps) {
  return (
    <thead className={`bg-gray-50 ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = "" }: TableBodyProps) {
  return (
    <tbody className={`bg-white divide-y divide-gray-200 ${className}`}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = "", onClick }: TableRowProps) {
  return (
    <tr
      className={`hover:bg-gray-50 transition-colors border-b border-gray-200 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = "", style }: TableHeadProps) {
  return (
    <th className={`px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0 ${className}`} style={style}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", colSpan }: TableCellProps) {
  // Check if className contains whitespace override classes
  const hasWhitespaceOverride = className.includes('whitespace-normal') ||
                                className.includes('whitespace-pre') ||
                                className.includes('whitespace-pre-wrap') ||
                                className.includes('whitespace-pre-line') ||
                                className.includes('whitespace-break-spaces');

  const baseClasses = hasWhitespaceOverride
    ? "px-4 lg:px-4 py-4 text-sm text-gray-900"
    : "px-4 lg:px-4 py-4 whitespace-nowrap text-sm text-gray-900";

  return (
    <td className={`${baseClasses} border-r border-gray-200 last:border-r-0 ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
