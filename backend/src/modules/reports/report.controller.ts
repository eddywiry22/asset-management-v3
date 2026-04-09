import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { getStockOpnameReport } from './report.service';
import { generateStockOpnamePDF } from './reportPdf.service';
import { ValidationError } from '../../utils/errors';

export async function stockOpnameController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { startDate, endDate, locationIds, categoryIds } = req.query as Record<string, string | string[]>;

    // Validate required params
    if (!startDate || typeof startDate !== 'string') {
      throw new ValidationError('startDate is required (e.g. 2024-01-01)');
    }
    if (!endDate || typeof endDate !== 'string') {
      throw new ValidationError('endDate is required (e.g. 2024-01-31)');
    }

    // Validate date formats
    const startParsed = new Date(startDate);
    const endParsed = new Date(endDate);
    if (isNaN(startParsed.getTime())) {
      throw new ValidationError('startDate is not a valid date');
    }
    if (isNaN(endParsed.getTime())) {
      throw new ValidationError('endDate is not a valid date');
    }
    if (startParsed > endParsed) {
      throw new ValidationError('startDate must not be after endDate');
    }

    // Normalize optional array params (Express parses repeated keys as arrays)
    const normalizeIds = (val: string | string[] | undefined): string[] | undefined => {
      if (!val) return undefined;
      const arr = Array.isArray(val) ? val : val.split(',').map((s) => s.trim());
      const filtered = arr.filter(Boolean);
      return filtered.length > 0 ? filtered : undefined;
    };

    const data = await getStockOpnameReport({
      startDate,
      endDate,
      locationIds: normalizeIds(locationIds),
      categoryIds: normalizeIds(categoryIds),
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function exportStockOpnameController(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { startDate, endDate, locationIds, categoryIds } = req.body as {
      startDate: unknown;
      endDate: unknown;
      locationIds?: unknown;
      categoryIds?: unknown;
    };

    // Validate required params
    if (!startDate || typeof startDate !== 'string') {
      throw new ValidationError('startDate is required (e.g. 2024-01-01)');
    }
    if (!endDate || typeof endDate !== 'string') {
      throw new ValidationError('endDate is required (e.g. 2024-01-31)');
    }

    // Validate date formats
    const startParsed = new Date(startDate);
    const endParsed = new Date(endDate);
    if (isNaN(startParsed.getTime())) {
      throw new ValidationError('startDate is not a valid date');
    }
    if (isNaN(endParsed.getTime())) {
      throw new ValidationError('endDate is not a valid date');
    }
    if (startParsed > endParsed) {
      throw new ValidationError('startDate must not be after endDate');
    }

    // Normalize optional array params
    const normalizeIds = (val: unknown): string[] | undefined => {
      if (!val) return undefined;
      const arr = Array.isArray(val)
        ? (val as string[])
        : typeof val === 'string'
          ? val.split(',').map((s) => s.trim())
          : [];
      const filtered = arr.filter(Boolean);
      return filtered.length > 0 ? filtered : undefined;
    };

    const data = await getStockOpnameReport({
      startDate,
      endDate,
      locationIds: normalizeIds(locationIds),
      categoryIds: normalizeIds(categoryIds),
    });

    const pdfBuffer = await generateStockOpnamePDF(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-opname-report.pdf"',
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  } catch (err) {
    next(err);
  }
}
