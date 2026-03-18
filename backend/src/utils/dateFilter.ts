/**
 * Shared date-range filtering utilities.
 *
 * Standard rule (applied consistently across ALL modules):
 *   dateStart → start of day  (00:00:00.000, local time)
 *   dateEnd   → end of day    (23:59:59.999, local time)
 *
 * This ensures single-day filters (dateStart == dateEnd) return the full day's
 * data and eliminates off-by-one-day bugs caused by raw Date parsing of
 * YYYY-MM-DD strings.
 */

/**
 * Build a Prisma-compatible date range filter from optional YYYY-MM-DD strings.
 * Normalises the end date to 23:59:59.999 (inclusive end-of-day).
 *
 * @example
 *   // In a controller — parse raw query strings:
 *   const dateFilter = buildDateRangeFilter(req.query.startDate, req.query.endDate);
 *   // → { gte: Date(00:00), lte: Date(23:59:59.999) }
 *
 * @returns `{ gte?, lte? }` or `undefined` when both inputs are absent.
 */
export function buildDateRangeFilter(
  dateStart?: string,
  dateEnd?: string,
): { gte?: Date; lte?: Date } | undefined {
  if (!dateStart && !dateEnd) return undefined;

  const filter: { gte?: Date; lte?: Date } = {};

  if (dateStart) {
    filter.gte = new Date(dateStart); // YYYY-MM-DD → 00:00:00.000 local time
  }

  if (dateEnd) {
    const end = new Date(dateEnd);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }

  return filter;
}

/**
 * Build a Prisma-compatible date range filter from pre-normalised Date objects.
 * Use this in repositories where dates have already been validated and normalised
 * by the controller layer.
 *
 * @example
 *   // In a repository — dates already normalised by the controller:
 *   const dateFilter = buildDateRangeFilterFromDates(startDate, endDate);
 *   if (dateFilter) where.createdAt = dateFilter;
 *   if (dateFilter) where.timestamp = dateFilter;
 *
 * @returns `{ gte?, lte? }` or `undefined` when both inputs are absent.
 */
export function buildDateRangeFilterFromDates(
  startDate?: Date,
  endDate?: Date,
): { gte?: Date; lte?: Date } | undefined {
  if (!startDate && !endDate) return undefined;

  const filter: { gte?: Date; lte?: Date } = {};
  if (startDate) filter.gte = startDate;
  if (endDate)   filter.lte = endDate;
  return filter;
}
