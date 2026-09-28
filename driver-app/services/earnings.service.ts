import create from "zustand";
import api from "./api";

interface EarningsState {
  earnings: any[];
  summary: any;
  fetchEarnings: () => Promise<void>;
  fetchSummary: () => Promise<void>;
}

function extractEarningsList(response: any): any[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.earnings)) return response.earnings;
  if (Array.isArray(response.data?.earnings)) return response.data.earnings;
  if (Array.isArray(response.data?.data)) return response.data.data;
  return [];
}

export const useEarningsStore = create<EarningsState>((set) => ({
  earnings: [],
  summary: null,

  fetchEarnings: async () => {
    try {
      const response = await api.get("/drivers/earnings");
      if (response?.success || Array.isArray(response) || Array.isArray(response?.data)) {
        const list = extractEarningsList(response);
        const updates: Partial<EarningsState> = { earnings: list };
        if (response?.summary) {
          updates.summary = response.summary;
        } else if (response?.data?.summary) {
          updates.summary = response.data.summary;
        }
        set(updates);
      } else {
        console.error("Error fetching earnings:", response);
      }
    } catch (error) {
      console.error("Error fetching earnings:", error);
    }
  },

  fetchSummary: async () => {
    try {
      const response = await api.get("/drivers/earnings/summary");
      if (response?.success) {
        const summary = response.data?.report || response.data?.summary || response.summary || response.data;
        set({ summary });
      } else {
        console.error("Error fetching summary:", response);
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
    }
  },
}));