export default {
  expo: {
    name: "NetMark Driver",
    slug: "driver-app", // must match the EAS project slug
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1A0A0D"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.greenworld.driver",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "We need your location to show nearby deliveries and track your delivery route.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "We need your location to show nearby deliveries and track your delivery route."
      }
    },
    android: {
      package: "com.greenworld.driver",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1A0A0D"
      },
      permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"]
    },
    web: {
      bundler: "metro",
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow NetMark Driver to use your location."
        }
      ]
    ],
    extra: {
      apiUrl:
        process.env.API_URL ||
        "https://greenworldplatform.duckdns.org/api",
      eas: {
        projectId: "8e17e5e3-ff75-4133-b2c1-db2f1795861d"
      }
    }
  }
};