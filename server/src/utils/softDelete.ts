export interface PaginationParams {
  currentPage: number;
  perPage: number;
  sortField?: string;
  sortDirection?: string;
  searchValue?: string;
  status?: string;
  isDeleted?: boolean;
  category?: number;
  isManagement?: boolean;
}

const MAX_PER_PAGE = 100;

export function parsePagination(query: Record<string, unknown>): PaginationParams {
  let currentPage = parseInt(String(query.CurrentPage || query.currentPage || "1"), 10);
  let perPage = parseInt(String(query.PerPage || query.perPage || "10"), 10);
  if (isNaN(currentPage) || currentPage < 1) currentPage = 1;
  if (isNaN(perPage) || perPage < 1) perPage = 10;
  if (perPage > MAX_PER_PAGE) perPage = MAX_PER_PAGE;

  const isDeletedRaw = query.IsDeleted || query.isDeleted;
  let isDeleted: boolean | undefined;
  if (isDeletedRaw !== undefined && isDeletedRaw !== null) {
    isDeleted = String(isDeletedRaw).toLowerCase() === "true";
  }

  const categoryRaw = query.Category || query.category;
  let category: number | undefined;
  if (categoryRaw !== undefined && categoryRaw !== null) {
    const parsed = parseInt(String(categoryRaw), 10);
    if (!isNaN(parsed)) category = parsed;
  }

  const isManagementRaw = query.isManagement || query.IsManagement;
  let isManagement: boolean | undefined;
  if (isManagementRaw !== undefined && isManagementRaw !== null) {
    isManagement = String(isManagementRaw).toLowerCase() === "true";
  }

  return {
    currentPage,
    perPage,
    sortField: (query.SortField || query.sortField) as string | undefined,
    sortDirection: (query.SortDirection || query.sortDirection) as string | undefined,
    searchValue: (query.SearchValue || query.searchValue) as string | undefined,
    status: (query.Status || query.status) as string | undefined,
    isDeleted,
    category,
    isManagement,
  };
}

export function softDeleteFilter(
  tableAlias: string,
  isDeleted: boolean | undefined,
  conditions: string[]
): void {
  if (isDeleted === true) {
    conditions.push(`${tableAlias}.is_deleted = true`);
  } else {
    conditions.push(`(${tableAlias}.is_deleted IS NULL OR ${tableAlias}.is_deleted = false)`);
  }
}

export function buildSortClause(
  sortField: string | undefined,
  isAsc: boolean,
  columnMap: Record<string, string>,
  defaultColumn: string
): string {
  const col = columnMap[(sortField || "").toLowerCase()] || defaultColumn;
  return `${col} ${isAsc ? "ASC" : "DESC"}`;
}
