import dayjs from "dayjs";

export function formatDate(val: string | Date | null | undefined, fallback: string = "—"): string {
  if (!val) return fallback;
  if (typeof val === "string" && val === "Evergreen") return "Evergreen";
  const d = dayjs(val);
  return d.isValid() ? d.format("MM/DD/YYYY") : fallback;
}

export function formatDateTime(val: string | Date | null | undefined, fallback: string = "—"): string {
  if (!val) return fallback;
  const d = dayjs(val);
  return d.isValid() ? d.format("MM/DD/YYYY h:mm A") : fallback;
}

export function formatLongDate(val: string | Date | null | undefined, fallback: string = "—"): string {
  if (!val) return fallback;
  const d = dayjs(val);
  return d.isValid() ? d.format("MMM D, YYYY") : fallback;
}

export function formatFullDate(val: string | Date | null | undefined, fallback: string = "—"): string {
  if (!val) return fallback;
  const d = dayjs(val);
  return d.isValid() ? d.format("MMMM D, YYYY") : fallback;
}

export function formatDateISO(val: string | Date | null | undefined): string {
  if (!val) return "";
  const d = dayjs(val);
  return d.isValid() ? d.format("YYYY-MM-DD") : "";
}

export function formatTime12h(timeVal: string): string {
  if (!timeVal) return "";
  const d = dayjs(`1970-01-01T${timeVal}`);
  return d.isValid() ? d.format("h:mm A") : timeVal;
}

export const currency_format = (digit: number | string | null | undefined, abbreviate: boolean = false, decimals: number = 2, defaultValue: any = '$0.00') => {
  if (digit === null || digit === undefined || digit === '') {
    return defaultValue;
  }
  const num = typeof digit === 'string' ? parseFloat(digit) : digit;
  if (isNaN(num) || num === 0) {
    return defaultValue;
  }

  if (abbreviate) {
    if (num >= 1000000) {
      return '$' + (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return '$' + Math.round(num / 1000) + 'K';
    }
  }
  return '$' + num.toFixed(decimals).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
};
