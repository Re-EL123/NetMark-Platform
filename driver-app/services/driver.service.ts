import create from "zustand";
import api, { getApiErrorMessage } from "./api";

function extractDriver(payload: any) {
  if (!payload) return null;
  return (
    payload.data?.driver ||
    payload.data?.driverProfile ||
    payload.driver ||
    payload.driverProfile ||
    (payload.data?.vehicleType ? payload.data : null)
  );
}

export interface AvailabilityResult {
  success: boolean;
  message?: string;
}

interface DriverState {
  driverProfile: any;
  stats: any;
  error: string | null;
  fetchDriverProfile: () => Promise<boolean>;
  applyProfile: (driver: any) => void;
  clearProfile: () => void;
  updateAvailability: (status: string) => Promise<AvailabilityResult>;
  updateLocation: (latitude: number, longitude: number) => Promise<boolean>;
  updateProfile: (data: any) => Promise<{ success: boolean; message?: string }>;
  registerPushToken: (pushToken: string) => Promise<boolean>;
}

export const useDriverStore = create<DriverState>((set, get) => ({
  driverProfile: null,
  stats: null,
  error: null,

  applyProfile: (driver) => {
    if (!driver) return;
    set({
      driverProfile: driver,
      stats: driver.stats ?? null,
      error: null
    });
  },

  clearProfile: () => {
    set({ driverProfile: null, stats: null, error: null });
  },

  fetchDriverProfile: async () => {
    try {
      const response = await api.get("/drivers/me");
      const driver = extractDriver(response);
      if (response?.success && driver) {
        get().applyProfile(driver);
        return true;
      }

      set({
        error:
          response?.message ||
          "Driver profile not found. Contact an admin if this continues."
      });
      return false;
    } catch (error) {
      console.error("Error fetching driver profile:", error);
      set({
        error: getApiErrorMessage(
          error,
          "Could not load your driver profile."
        )
      });
      return false;
    }
  },

  updateAvailability: async (status: string): Promise<AvailabilityResult> => {
    try {
      const response = await api.put("/drivers/availability", { status });
      if (response?.success) {
        await get().fetchDriverProfile();
        return { success: true, message: response.message };
      }
      return {
        success: false,
        message: response?.message || "Failed to update availability status."
      };
    } catch (error) {
      console.error("Error updating availability:", error);
      const message = getApiErrorMessage(error, "Failed to update availability.");
      return { success: false, message };
    }
  },

  updateLocation: async (latitude: number, longitude: number): Promise<boolean> => {
    try {
      const response = await api.put("/drivers/location", { latitude, longitude });
      return !!response?.success;
    } catch (error) {
      console.error("Error updating location:", error);
      return false;
    }
  },

  updateProfile: async (data: any): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await api.put("/drivers/me", data);
      const driver = extractDriver(response);
      if (response?.success && driver) {
        get().applyProfile(driver);
        return { success: true, message: response.message };
      }
      return {
        success: false,
        message: response?.message || "Failed to update profile."
      };
    } catch (error) {
      console.error("Error updating profile:", error);
      const message = getApiErrorMessage(error, "Failed to update profile.");
      return { success: false, message };
    }
  },

  registerPushToken: async (pushToken: string): Promise<boolean> => {
    try {
      const response = await api.put("/drivers/push-token", { pushToken });
      return !!response?.success;
    } catch (error) {
      console.warn("Error registering push token:", error);
      return false;
    }
  }
}));
