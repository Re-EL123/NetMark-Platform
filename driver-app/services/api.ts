import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(callback: (() => void) | null) {
  onUnauthorizedCallback = callback;
}

const REMOTE_API_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  "https://api.netmark.re-el.co.za/api";

function isLocalWebHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function resolveApiUrl(): string {
  if (Platform.OS === "web") {
    const location = globalThis.location;
    if (location?.hostname && location.origin && isLocalWebHost(location.hostname)) {
      return `${location.origin}/api`;
    }
  }

  return REMOTE_API_URL;
}

const API_URL = resolveApiUrl();

console.log("API_URL at runtime:", API_URL);

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json"
  }
});

// Request interceptor: attach the current Supabase access token.
apiClient.interceptors.request.use(
  async (config) => {
    let token = await AsyncStorage.getItem("token");

    try {
      const { data } = await supabase.auth.getSession();
      const freshToken = data.session?.access_token;
      if (freshToken) {
        token = freshToken;
        await AsyncStorage.setItem("token", freshToken);
      }
    } catch (e) {
      console.warn("Supabase token refresh fallback to stored token:", e);
    }

    if (!config.headers) {
      config.headers = {};
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

function formatValidationErrors(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  return errors
    .map((err) => {
      if (typeof err === "string") return err;
      if (!err || typeof err !== "object") return "";
      const item = err as { field?: string; path?: string; message?: string; msg?: string };
      const field = item.field || item.path || "";
      const msg = item.message || item.msg || "";
      return field ? `${field}: ${msg}` : msg;
    })
    .filter(Boolean)
    .join(", ");
}

export function getApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (!error) return fallback;
  if (typeof error === "string") {
    return error === "Network Error"
      ? "Unable to reach the server. Please try again."
      : error;
  }

  const err = error as {
    message?: string;
    error?: string;
    msg?: string;
    errors?: unknown;
  };

  const validationMessage = formatValidationErrors(err.errors);
  if (validationMessage) return validationMessage;

  const message = err.message || err.error || err.msg || fallback;
  if (message === "Network Error") {
    return "Unable to reach the server. Please try again.";
  }

  return message;
}

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem("token");
      try {
        onUnauthorizedCallback?.();
      } catch (cbErr) {
        console.warn("Failed to run onUnauthorized callback:", cbErr);
      }
    }

    const data = error.response?.data;
    if (data && typeof data === "object") {
      return Promise.reject(data);
    }

    if (typeof data === "string" && data.trim()) {
      return Promise.reject({ message: data });
    }

    return Promise.reject({
      message: error.message || "Unable to reach the server. Please try again."
    });
  }
);

export default {
  get: (url: string, params?: any) => apiClient.get(url, { params }),
  post: (url: string, data?: any) => apiClient.post(url, data),
  put: (url: string, data?: any) => apiClient.put(url, data),
  delete: (url: string) => apiClient.delete(url)
};
