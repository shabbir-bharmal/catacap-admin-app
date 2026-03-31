import { useState } from "react";

export type SortDir = "asc" | "desc" | null;

export function useSort<T extends string>(initialField: T | null = null, initialDir: SortDir = null) {
  const [sortField, setSortField] = useState<T | null>(initialField);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const handleSort = (field: T) => {
    if (sortField === field) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (sortDir === "desc") {
        setSortField(null);
        setSortDir(null);
      } else {
        setSortDir("asc");
      }
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return {
    sortField,
    sortDir,
    handleSort,
    setSortField,
    setSortDir,
  };
}
