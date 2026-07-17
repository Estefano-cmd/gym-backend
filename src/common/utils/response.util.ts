export function successResponse<T>(data: T, meta?: Record<string, unknown>) {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function paginatedList<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    },
  };
}
