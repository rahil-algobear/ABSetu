import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "./button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (limit: number) => void;
  itemLabel?: string;
  className?: string;
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50];

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = "items",
  className = "",
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getVisiblePages = () => {
    const delta = 1;
    const range: (number | string)[] = [];

    // Always include page 1
    range.push(1);

    const start = Math.max(2, currentPage - delta);
    const end = Math.min(totalPages - 1, currentPage + delta);

    if (start > 2) {
      range.push("...");
    }

    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    if (end < totalPages - 1) {
      range.push("...");
    }

    if (totalPages > 1) {
      range.push(totalPages);
    }

    return range;
  };

  if (totalItems === 0) return null;

  return (
    <div className={`px-4 py-3 bg-white border-t border-gray-200 ${className}`}>
      {/* Mobile */}
      <div className="sm:hidden space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            <span className="font-medium">{startItem}</span>-
            <span className="font-medium">{endItem}</span> of{" "}
            <span className="font-medium">{totalItems}</span>
          </p>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
            className="border rounded-md px-2 py-1 text-sm"
          >
            {ITEMS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex justify-center">
            <nav className="inline-flex rounded-md shadow-sm -space-x-px">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-l-md px-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {getVisiblePages().map((p, i) =>
                p === "..." ? (
                  <span
                    key={`dots-${i}`}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 bg-white text-sm text-gray-500"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(p as number)}
                    className={`px-3 ${
                      p === currentPage
                        ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                        : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-r-md px-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
            className="border rounded-md px-2 py-1 text-sm"
          >
            {ITEMS_PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startItem}</span> to{" "}
            <span className="font-medium">{endItem}</span> of{" "}
            <span className="font-medium">{totalItems}</span> {itemLabel}
          </p>
        </div>
        {totalPages > 1 && (
          <nav className="inline-flex rounded-md shadow-sm -space-x-px">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded-l-md px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {getVisiblePages().map((p, i) =>
              p === "..." ? (
                <span
                  key={`dots-${i}`}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm text-gray-500"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </span>
              ) : (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange(p as number)}
                  className={`px-4 ${
                    p === currentPage
                      ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                      : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded-r-md px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
