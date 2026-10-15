import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/services/auth.service";
import { useDriverStore } from "@/services/driver.service";
import { router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { AppScreen } from "@/components/AppBackground";
import { notify, confirmAction } from "@/utils/notify";
import { EditBankDetailsModal } from "@/components/EditBankDetailsModal";

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const driverProfile = useDriverStore((state) => state.driverProfile);
  const profileError = useDriverStore((state) => state.error);
  const fetchDriverProfile = useDriverStore((state) => state.fetchDriverProfile);
  const [bankModalVisible, setBankModalVisible] = useState(false);

  const handleLogout = () => {
    confirmAction(
      "Logout",
      "Are you sure you want to log out of your driver account?",
      async () => {
        await logout();
        router.replace("/login");
      },
      undefined,
      "Log Out",
      "Cancel"
    );
  };

  const handleEditProfile = () => {
    notify(
      "Edit Profile",
      "To change your vehicle, license, or banking details, please contact platform dispatch or administration to ensure document compliance."
    );
  };

  const handleSettings = () => {
    notify(
      "App Settings",
      "NetMark Driver App v1.0.0\nEnvironment: Production Lightsail\nGPS Tracking: Enabled\nCurrency: South African Rand (ZAR)"
    );
  };

  const handleHelp = () => {
    notify(
      "Help & Support",
      "Need dispatch assistance?\nEmail: support@greenworldplatform.com\nSupport Hours: 08:00 - 18:00 SAST"
    );
  };

  useEffect(() => {
    if (!isAuthenticated || driverProfile) return;
    fetchDriverProfile();
  }, [isAuthenticated, driverProfile, fetchDriverProfile]);

  // Simple guard: show a loading state if auth or driverProfile isn't ready
  if (!isAuthenticated || !user) {
    return (
      <AppScreen style={styles.container}>
        <Text style={styles.emailText}>Loading profile...</Text>
      </AppScreen>
    );
  }

  if (!driverProfile) {
    return (
      <AppScreen style={styles.container}>
        <Text style={styles.emailText}>
          {profileError || "Could not load your driver profile."}
        </Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => fetchDriverProfile()}
        >
          <Text style={styles.actionButtonText}>Retry</Text>
        </TouchableOpacity>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.nameText}>{user?.name}</Text>
        <Text style={styles.emailText}>{user?.email}</Text>
        <View
          style={[
            styles.statusBadge,
            getStatusColor(driverProfile?.status)
          ]}
        >
          <Text style={styles.statusText}>{driverProfile?.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <MaterialIcons name="phone" size={20} color="#666" />
            <Text style={styles.infoLabel}>Phone:</Text>
            <Text style={styles.infoValue}>{user?.phone}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="email" size={20} color="#666" />
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Information</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <MaterialIcons name="directions-car" size={20} color="#666" />
            <Text style={styles.infoLabel}>Type:</Text>
            <Text style={styles.infoValue}>
              {driverProfile?.vehicleType}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="confirmation-number" size={20} color="#666" />
            <Text style={styles.infoLabel}>Number:</Text>
            <Text style={styles.infoValue}>
              {driverProfile?.vehicleNumber}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="card-membership" size={20} color="#666" />
            <Text style={styles.infoLabel}>License:</Text>
            <Text style={styles.infoValue}>
              {driverProfile?.licenseNumber}
            </Text>
          </View>
          {driverProfile?.licenseExpiry && (
            <View style={styles.infoRow}>
              <MaterialIcons name="event" size={20} color="#666" />
              <Text style={styles.infoLabel}>Expiry:</Text>
              <Text style={styles.infoValue}>
                {new Date(driverProfile.licenseExpiry).toISOString().slice(0, 10)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={styles.sectionTitle}>Bank Details</Text>
          <TouchableOpacity onPress={() => setBankModalVisible(true)}>
            <Text style={{ color: "#E50914", fontWeight: "600", fontSize: 14 }}>
              {driverProfile?.bankDetails?.accountNumber ? "Edit" : "+ Add"}
            </Text>
          </TouchableOpacity>
        </View>

        {driverProfile?.bankDetails?.accountNumber ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MaterialIcons name="account-balance" size={20} color="#666" />
              <Text style={styles.infoLabel}>Bank:</Text>
              <Text style={styles.infoValue}>
                {driverProfile.bankDetails.bankName || "Not set"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="account-circle" size={20} color="#666" />
              <Text style={styles.infoLabel}>Account:</Text>
              <Text style={styles.infoValue}>
                {driverProfile.bankDetails.accountNumber}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="person" size={20} color="#666" />
              <Text style={styles.infoLabel}>Name:</Text>
              <Text style={styles.infoValue}>
                {driverProfile.bankDetails.accountName || "Not set"}
              </Text>
            </View>
            {driverProfile.bankDetails.bankCode ? (
              <View style={styles.infoRow}>
                <MaterialIcons name="numbers" size={20} color="#666" />
                <Text style={styles.infoLabel}>Branch Code:</Text>
                <Text style={styles.infoValue}>
                  {driverProfile.bankDetails.bankCode}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.infoCard, { alignItems: "center", paddingVertical: 18, borderStyle: "dashed", borderWidth: 1, borderColor: "#bbb" }]}
            onPress={() => setBankModalVisible(true)}
          >
            <MaterialIcons name="add-circle-outline" size={28} color="#E50914" />
            <Text style={{ marginTop: 6, color: "#E50914", fontWeight: "600" }}>
              Add Bank Account for Payouts
            </Text>
            <Text style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              Capitec, FNB, Standard Bank, Absa, etc.
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setBankModalVisible(true)}
        >
          <MaterialIcons name="account-balance" size={24} color="#E50914" />
          <Text style={styles.actionButtonText}>Update Bank Details</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleEditProfile}>
          <MaterialIcons name="directions-car" size={24} color="#E50914" />
          <Text style={styles.actionButtonText}>Vehicle & License Info</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleSettings}>
          <MaterialIcons name="settings" size={24} color="#E50914" />
          <Text style={styles.actionButtonText}>Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleHelp}>
          <MaterialIcons name="help" size={24} color="#E50914" />
          <Text style={styles.actionButtonText}>Help & Support</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.logoutButton]}
          onPress={handleLogout}
        >
          <MaterialIcons name="logout" size={24} color="#B91C1C" />
          <Text
            style={[styles.actionButtonText, styles.logoutText]}
          >
            Logout
          </Text>
        </TouchableOpacity>
      </View>

      <EditBankDetailsModal
        visible={bankModalVisible}
        onClose={() => setBankModalVisible(false)}
        currentBankDetails={driverProfile?.bankDetails}
      />
    </ScrollView>
    </AppScreen>
  );
}

function getStatusColor(status?: string) {
  const colors: any = {
    approved: { backgroundColor: "#E50914" },
    active: { backgroundColor: "#E50914" },
    pending: { backgroundColor: "#B45309" },
    inactive: { backgroundColor: "#6B7280" }
  };
  return colors[status || "inactive"] || { backgroundColor: "#6B7280" };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent"
  },
  profileHeader: {
    backgroundColor: "#E50914",
    padding: 30,
    alignItems: "center"
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#E50914"
  },
  nameText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 5
  },
  emailText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 10
  },
  statusBadge: {
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 15
  },
  statusText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 15
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#fff"
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  infoLabel: {
    marginLeft: 10,
    fontSize: 14,
    color: "#666",
    width: 80
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500"
  },
  actions: {
    marginTop: 20,
    paddingHorizontal: 15,
    paddingBottom: 30
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  actionButtonText: {
    marginLeft: 15,
    fontSize: 16,
    color: "#333"
  },
  logoutButton: {
    marginTop: 10
  },
  logoutText: {
    color: "#B91C1C"
  }
});