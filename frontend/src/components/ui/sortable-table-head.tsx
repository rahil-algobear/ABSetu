import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  currentSortBy: string | null;
  currentSortOrder: "asc" | "desc";
  onSort: (key: string, order: "asc" | "desc") => void;
  className?: string;
}

export function SortableTableHead({
  label,
  sortKey,
  currentSortBy,
  currentSortOrder,
  onSort,
  className = "",
}: SortableTableHeadProps) {
  const isActive = currentSortBy === sortKey;

  const handleClick = () => {
    if (isActive) {
      onSort(sortKey, currentSortOrder === "asc" ? "desc" : "asc");
    } else {
      onSort(sortKey, "desc");
    }
  };

  return (
    <th
      className={`px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0 cursor-pointer select-none hover:bg-gray-100 transition-colors ${
        isActive ? "text-blue-600 bg-blue-50/50" : ""
      } ${className}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentSortOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
        )}
      </span>
    </th>
  );
}
