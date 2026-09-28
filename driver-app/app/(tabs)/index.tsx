import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl
} from "react-native";
import { useEffect, useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/services/auth.service";
import { useDriverStore } from "@/services/driver.service";
import { router } from "expo-router";
import { AppScreen } from "@/components/AppBackground";
import { formatCurrency } from "@/utils/currency";
import { notify } from "@/utils/notify";

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const driverProfile = useDriverStore((state) => state.driverProfile);
  const stats = useDriverStore((state) => state.stats);
  const profileError = useDriverStore((state) => state.error);
  const fetchDriverProfile = useDriverStore((state) => state.fetchDriverProfile);
  const updateAvailability = useDriverStore((state) => state.updateAvailability);
  const [refreshing, setRefreshing] = useState(false);
  const [loadAttempted, setLoadAttempted] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadData();
  }, [isAuthenticated]);

  const loadData = async () => {
    await fetchDriverProfile();
    setLoadAttempted(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleAvailability = async () => {
    if (!driverProfile) return;

    if (driverProfile.status !== "approved" && driverProfile.status !== "active") {
      notify(
        "Account Not Approved",
        `Your driver account status is "${driverProfile.status || "pending"}". You can only go online once an administrator approves your account.`
      );
      return;
    }

    const newStatus =
      driverProfile?.availability === "available" ? "offline" : "online";
    const result = await updateAvailability(newStatus);
    if (!result.success) {
      notify("Status Update Failed", result.message || "Could not update availability status.");
    }
  };

  const getAvailabilityColor = () => {
    switch (driverProfile?.availability) {
      case "available":
        return "#D7263D";
      case "busy":
        return "#FF9800";
      default:
        return "#9E9E9E";
    }
  };

  const getAvailabilityText = () => {
    switch (driverProfile?.availability) {
      case "available":
        return "Available";
      case "busy":
        return "Busy";
      default:
        return "Offline";
    }
  };

  if (!user || (!driverProfile && !loadAttempted)) {
    return (
      <AppScreen style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </AppScreen>
    );
  }

  if (!driverProfile) {
    return (
      <AppScreen style={styles.container}>
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={48} color="#fff" />
          <Text style={styles.loadingText}>
            {profileError || "Could not load your driver profile."}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#fff"
          colors={["#D7263D"]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.nameText}>{user.name}</Text>
      </View>

      {driverProfile.status !== "approved" && driverProfile.status !== "active" && (
        <View style={styles.pendingBanner}>
          <MaterialIcons name="info" size={20} color="#E65100" />
          <Text style={styles.pendingBannerText}>
            Account Status: {driverProfile.status?.toUpperCase() || "PENDING"}. Awaiting administrator approval before you can go online.
          </Text>
        </View>
      )}

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusLabel}>Status</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getAvailabilityColor() }
            ]}
          >
            <Text style={styles.statusBadgeText}>{getAvailabilityText()}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            {
              backgroundColor:
                driverProfile.availability === "available"
                  ? "#f44336"
                  : "#9E9E9E"
            }
          ]}
          onPress={toggleAvailability}
        >
          <Text style={styles.toggleButtonText}>
            {driverProfile.availability === "available"
              ? "Go Offline"
              : "Go Online"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            ★ {stats?.averageRating ? Number(stats.averageRating).toFixed(1) : "5.0"}
          </Text>
          <Text style={styles.statLabel}>Driver Rating</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats?.totalDeliveries || 0}
          </Text>
          <Text style={styles.statLabel}>Total Deliveries</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats?.completedDeliveries || 0}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {formatCurrency(stats?.totalEarnings || 0)}
          </Text>
          <Text style={styles.statLabel}>Total Earnings</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {formatCurrency(stats?.pendingPayout || 0)}
          </Text>
          <Text style={styles.statLabel}>Pending Payout</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/orders")}
        >
          <MaterialIcons name="list" size={24} color="#D7263D" />
          <Text style={styles.actionButtonText}>
            View Available Deliveries
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/active-delivery")}
        >
          <MaterialIcons name="local-shipping" size={24} color="#D7263D" />
          <Text style={styles.actionButtonText}>Active Delivery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push("/earnings")}
        >
          <MaterialIcons name="attach-money" size={24} color="#D7263D" />
          <Text style={styles.actionButtonText}>View Earnings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.vehicleInfo}>
        <Text style={styles.sectionTitle}>Vehicle Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Type:</Text>
          <Text style={styles.infoValue}>{driverProfile.vehicleType}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Number:</Text>
          <Text style={styles.infoValue}>{driverProfile.vehicleNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>License:</Text>
          <Text style={styles.infoValue}>{driverProfile.licenseNumber}</Text>
        </View>
      </View>
    </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent"
  },
  loadingText: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 40,
    color: "#fff",
    paddingHorizontal: 24
  },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: "#D7263D",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  welcomeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14
  },
  nameText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold"
  },
  pendingBanner: {
    backgroundColor: "#FFF3E0",
    borderColor: "#FFE0B2",
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 15,
    marginTop: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center"
  },
  pendingBannerText: {
    color: "#E65100",
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 8,
    flex: 1
  },
  statusCard: {
    backgroundColor: "#fff",
    margin: 15,
    padding: 20,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: "600"
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15
  },
  statusBadgeText: {
    color: "#fff",
    fontWeight: "600"
  },
  toggleButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: "center"
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10
  },
  statCard: {
    width: "48%",
    backgroundColor: "#fff",
    margin: "1%",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#D7263D",
    marginBottom: 5
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center"
  },
  quickActions: {
    backgroundColor: "#fff",
    margin: 15,
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 15
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 10
  },
  actionButtonText: {
    marginLeft: 15,
    fontSize: 16,
    color: "#333"
  },
  vehicleInfo: {
    backgroundColor: "#fff",
    margin: 15,
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  infoLabel: {
    fontSize: 14,
    color: "#666"
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600"
  }
});