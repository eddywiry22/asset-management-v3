import { useCallback, useState } from 'react';
import {
  reportService,
  StockOpnameFilters,
  StockOpnameReport,
} from '../services/report.service';

interface UseStockOpnameReportResult {
  data: StockOpnameReport | null;
  loading: boolean;
  error: string | null;
  fetchReport: (filters: StockOpnameFilters) => Promise<void>;
  reset: () => void;
}

export function useStockOpnameReport(): UseStockOpnameReportResult {
  const [data, setData] = useState<StockOpnameReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (filters: StockOpnameFilters) => {
    setLoading(true);
    setError(null);
    try {
      const report = await reportService.getStockOpnameReport(filters);
      setData(report);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (err as Error)?.message ??
        'Failed to load stock opname report';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, fetchReport, reset };
}

export default useStockOpnameReport;
