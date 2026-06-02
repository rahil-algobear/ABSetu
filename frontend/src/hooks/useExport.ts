import { useCallback, useState } from "react";
import toast from "react-hot-toast";

export interface ExportFile {
  blob: Blob;
  filename: string;
}

/**
 * Triggers a browser download from a blob-returning request — used by the
 * list-export "Download" buttons (entities now, activities next).
 *
 * Because the export request uses `responseType: 'blob'`, a backend error
 * (e.g. the row-cap message) arrives as a Blob rather than parsed JSON, so we
 * read it back out to surface a useful toast.
 */
export function useExport() {
  const [isExporting, setIsExporting] = useState(false);

  const runExport = useCallback(async (fetchFile: () => Promise<ExportFile>) => {
    setIsExporting(true);
    try {
      const { blob, filename } = await fetchFile();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((await extractErrorMessage(err)) || "Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { isExporting, runExport };
}

async function extractErrorMessage(err: unknown): Promise<string | null> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed.message || parsed.detail || null;
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object") {
    const obj = data as { message?: string; detail?: string };
    return obj.message || obj.detail || null;
  }
  return null;
}
