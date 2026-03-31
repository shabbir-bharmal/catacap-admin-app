import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  currentPage: number;
  totalCount: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rows: number) => void;
  pageSizeOptions?: number[];
  dataTestId?: string;
  className?: string;
}

export function PaginationControls({
  currentPage,
  totalCount,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  pageSizeOptions = [10, 20, 50, 100],
  dataTestId = "pagination-controls",
  className,
}: PaginationControlsProps) {
  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const startIdx = totalCount > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx = Math.min(currentPage * rowsPerPage, totalCount);

  return (
    <div className={cn("flex items-center justify-between gap-4 flex-wrap border-t px-6 py-4", className)} data-testid={dataTestId}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(v) => {
            onRowsPerPageChange(Number(v));
          }}
        >
          <SelectTrigger className="h-8 w-[70px]" data-testid={`${dataTestId}-rows-per-page`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground" data-testid={`${dataTestId}-info`}>
          {totalCount > 0 ? `${startIdx}-${endIdx} of ${totalCount}` : "0 results"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            data-testid={`${dataTestId}-prev`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            data-testid={`${dataTestId}-next`}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
