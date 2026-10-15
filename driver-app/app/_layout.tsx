// app/_layout.tsx
import { Stack, router, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useAuthStore } from "@/services/auth.service";
import {
  APP_BACKGROUND_COLOR
} from "@/components/AppBackground";

const AUTH_SCREENS = new Set(["/login", "/register"]);

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "transparent",
    card: "transparent"
  }
};

const transparentScreen = {
  contentStyle: { backgroundColor: "transparent" as const },
  cardStyle: { backgroundColor: "transparent" as const }
};

export default function RootLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [bootstrapped, setBootstrapped] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      await useAuthStore.getState().checkAuth();
      if (!cancelled) setBootstrapped(true);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;

    const onAuthScreen = AUTH_SCREENS.has(pathname);

    if (!isAuthenticated && !onAuthScreen) {
      router.replace("/login");
      return;
    }

    if (isAuthenticated && onAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [bootstrapped, isAuthenticated, pathname]);

  const stack = !bootstrapped ? (
    <Stack screenOptions={{ headerShown: false, ...transparentScreen }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  ) : (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: "#111111"
        },
        headerTintColor: "#fff",
        headerTitleStyle: {
          fontWeight: "bold"
        },
        ...transparentScreen
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "Login", headerShown: false }} />
      <Stack.Screen
        name="register"
        options={{ title: "Register as Driver" }}
      />
    </Stack>
  );

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={styles.root}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={APP_BACKGROUND_COLOR}
        />
        {stack}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: APP_BACKGROUND_COLOR
  }
});
