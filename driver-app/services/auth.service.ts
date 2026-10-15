// services/auth.service.ts
import create from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import api, { setOnUnauthorized } from "./api";
import { useDriverStore } from "./driver.service";

export interface AuthResult {
  success: boolean;
  error?: string;
}

interface AuthState {
  user: any;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

function parseLoginError(error: any): string {
  const message = error?.message || "";
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Invalid email or password. Please check your credentials.";
  }
  if (message.toLowerCase().includes("email not confirmed")) {
    return "This account has not been confirmed. Please contact support.";
  }
  if (message.toLowerCase().includes("too many")) {
    return "Too many failed login attempts. Please try again in a few minutes.";
  }
  if (error?.code === "network" || message.toLowerCase().includes("network")) {
    return "Network connection failed. Please check your internet connection.";
  }
  if (message) {
    return message;
  }
  return "An unexpected error occurred during login. Please try again.";
}

async function clearSession() {
  await supabase.auth.signOut().catch(() => {});
  await AsyncStorage.removeItem("token");
  useDriverStore.getState().clearProfile();
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) {
        throw new Error("Failed to establish a session.");
      }
      await AsyncStorage.setItem("token", token);

      const response = await api.get("/auth/me");

      if (!response?.success || !response.data?.user) {
        throw new Error(response?.message || "Failed to load user profile.");
      }

      const user = response.data.user;
      if (user.role !== "driver") {
        await clearSession();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: `Access denied. This account is registered as '${user.role}'. The Driver app is for delivery drivers only.`
        };
      }

      const driverProfile = response.data.driverProfile || response.data.driver;

      if (driverProfile?.status === "pending") {
        await clearSession();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: "Your driver account is pending administrator approval. You will receive an email once approved."
        };
      }

      if (driverProfile?.status === "rejected") {
        await clearSession();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: `Your driver application was rejected. ${driverProfile.rejectionReason ? `Reason: ${driverProfile.rejectionReason}` : "Please contact support for details."}`
        };
      }

      if (driverProfile?.status === "suspended") {
        await clearSession();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: "Your driver account is suspended. Please contact administrator."
        };
      }

      useDriverStore.getState().applyProfile(driverProfile);
      set({
        user,
        token,
        isAuthenticated: true
      });
      return { success: true };
    } catch (error: any) {
      console.error("Login error:", error);
      await clearSession();
      set({ user: null, token: null, isAuthenticated: false });
      return {
        success: false,
        error: parseLoginError(error)
      };
    }
  },

  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("SignOut error:", e);
    }
    await AsyncStorage.removeItem("token");
    useDriverStore.getState().clearProfile();
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = await AsyncStorage.getItem("token");

    if (!token) {
      useDriverStore.getState().clearProfile();
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }

    try {
      const response = await api.get("/auth/me");

      if (
        response?.success &&
        response.data?.user?.role === "driver" &&
        response.data?.driverProfile?.status !== "rejected" &&
        response.data?.driverProfile?.status !== "suspended"
      ) {
        useDriverStore
          .getState()
          .applyProfile(response.data.driverProfile || response.data.driver);
        set({
          user: response.data.user,
          token,
          isAuthenticated: true
        });
      } else {
        await clearSession();
        set({ user: null, token: null, isAuthenticated: false });
      }
    } catch (error) {
      console.error("checkAuth error:", error);
      await clearSession();
      set({ user: null, token: null, isAuthenticated: false });
    }
  }
}));

// Automatically logout when receiving a 401 response from the API
setOnUnauthorized(() => {
  useAuthStore.getState().logout();
});
