// services/auth.service.ts
import create from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
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
  const code = error?.code;
  if (
    code === "auth/invalid-credential" ||
    code === "auth/user-not-found" ||
    code === "auth/wrong-password"
  ) {
    return "Invalid email or password. Please check your credentials.";
  }
  if (code === "auth/user-disabled") {
    return "This user account has been disabled. Please contact support.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many failed login attempts. Please try again in a few minutes.";
  }
  if (code === "auth/network-request-failed") {
    return "Network connection failed. Please check your internet connection.";
  }
  if (error?.message) {
    return error.message;
  }
  return "An unexpected error occurred during login. Please try again.";
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const token = await userCredential.user.getIdToken();
      await AsyncStorage.setItem("token", token);

      const response = await api.get("/auth/me");

      if (!response?.success || !response.data?.user) {
        throw new Error(response?.message || "Failed to load user profile.");
      }

      const user = response.data.user;
      if (user.role !== "driver") {
        await signOut(auth).catch(() => {});
        await AsyncStorage.removeItem("token");
        useDriverStore.getState().clearProfile();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: `Access denied. This account is registered as '${user.role}'. The Driver app is for delivery drivers only.`
        };
      }

      const driverProfile = response.data.driverProfile || response.data.driver;

      if (driverProfile?.status === "pending") {
        await signOut(auth).catch(() => {});
        await AsyncStorage.removeItem("token");
        useDriverStore.getState().clearProfile();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: "Your driver account is pending administrator approval. You will receive an email once approved."
        };
      }

      if (driverProfile?.status === "rejected") {
        await signOut(auth).catch(() => {});
        await AsyncStorage.removeItem("token");
        useDriverStore.getState().clearProfile();
        set({ user: null, token: null, isAuthenticated: false });
        return {
          success: false,
          error: `Your driver application was rejected. ${driverProfile.rejectionReason ? `Reason: ${driverProfile.rejectionReason}` : "Please contact support for details."}`
        };
      }

      if (driverProfile?.status === "suspended") {
        await signOut(auth).catch(() => {});
        await AsyncStorage.removeItem("token");
        useDriverStore.getState().clearProfile();
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
      await signOut(auth).catch(() => {});
      await AsyncStorage.removeItem("token");
      useDriverStore.getState().clearProfile();
      set({ user: null, token: null, isAuthenticated: false });
      return {
        success: false,
        error: parseLoginError(error)
      };
    }
  },

  logout: async () => {
    try {
      await signOut(auth);
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
        await signOut(auth).catch(() => {});
        await AsyncStorage.removeItem("token");
        useDriverStore.getState().clearProfile();
        set({ user: null, token: null, isAuthenticated: false });
      }
    } catch (error) {
      console.error("checkAuth error:", error);
      await signOut(auth).catch(() => {});
      await AsyncStorage.removeItem("token");
      useDriverStore.getState().clearProfile();
      set({ user: null, token: null, isAuthenticated: false });
    }
  }
}));

// Automatically logout when receiving a 401 response from the API
setOnUnauthorized(() => {
  useAuthStore.getState().logout();
});