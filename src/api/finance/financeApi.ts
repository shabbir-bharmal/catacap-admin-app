import axiosInstance from "../axios";

export interface InvestmentTheme {
  name: string;
  pending: number;
  approved: number;
  total: number;
}

export interface FinanceData {
  users: {
    active: number;
    inactive: number;
    accountBalances: number;
    investments: number;
    investmentsPlusAccountBalances: number;
  };
  groups: {
    investments: number;
    leaders: number;
    members: number;
    corporate: number;
  };
  recommendations: {
    pending: number;
    approved: number;
    rejected: number;
    approvedAndPending: number;
    total: number;
  };
  investments: {
    average: number;
    active: number;
    over25K: number;
    over50K: number;
    completed: number;
    totalActive: number;
    totalCompleted: number;
    totalActiveAndClosed: number;
    assets: number;
  };
  investmentThemes: InvestmentTheme[];
  grants: {
    pendingAndInTransit: number;
    pendingAndInTransitOtherAssets: number;
  };
  toBalance: {
    recommendations: number;
    activeAndClosed: number;
    difference: number;
  };
}

export async function fetchFinanceData(): Promise<FinanceData> {
  const response = await axiosInstance.get<FinanceData>("/api/admin/finance");
  return response.data;
}

export async function exportFinanceData(): Promise<void> {
  const response = await axiosInstance.get("/api/admin/finance/export", {
    responseType: "blob",
  });

  const blob = new Blob([response.data]);
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  link.setAttribute("download", `Consolidated Finances_${dateStr}.xlsx`);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}
