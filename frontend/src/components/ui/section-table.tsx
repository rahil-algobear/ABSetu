import React from 'react';
import { cn } from '@/utils/cn';

interface SectionTableProps {
  children: React.ReactNode;
  className?: string;
}

interface SectionTableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface SectionTableBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface SectionTableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  // Override alternate row styling
  alternateRowColor?: boolean;
  rowIndex?: number; // For automatic alternate row styling
}

interface SectionTableHeadProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  colSpan?: number;
}

interface SectionTableCellProps {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}

export function SectionTable({ children, className = "" }: SectionTableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full border border-gray-300">
        {children}
      </table>
    </div>
  );
}

export function SectionTableHeader({ children, className = "" }: SectionTableHeaderProps) {
  return (
    <thead className={className}>
      {children}
    </thead>
  );
}

export function SectionTableBody({ children, className = "" }: SectionTableBodyProps) {
  return (
    <tbody className={className}>
      {children}
    </tbody>
  );
}

export function SectionTableRow({
  children,
  className = "",
  onClick,
  alternateRowColor = true,
  rowIndex
}: SectionTableRowProps) {
  // Determine background color based on alternate row logic
  const bgColor = alternateRowColor && rowIndex !== undefined && rowIndex % 2 === 0
    ? 'bg-gray-100'
    : '';

  return (
    <tr
      className={cn(
        'border-b border-gray-300',
        bgColor,
        onClick ? 'cursor-pointer hover:bg-gray-50' : '',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function SectionTableHead({ children, className = "", style, colSpan }: SectionTableHeadProps) {
  return (
    <th
      className={cn(
        'border border-gray-300 px-2 py-1 text-left text-[16px] font-medium text-gray-700',
        className
      )}
      style={style}
      colSpan={colSpan}
    >
      {children}
    </th>
  );
}

export function SectionTableCell({ children, className = "", colSpan }: SectionTableCellProps) {
  return (
    <td
      className={cn(
        'border border-gray-300 px-2 py-1 text-[16px] text-gray-900',
        className
      )}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}
