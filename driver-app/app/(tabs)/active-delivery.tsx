import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking
} from "react-native";
import { useEffect, useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/services/auth.service";
import { useDriverStore } from "@/services/driver.service";
import { useOrderStore } from "@/services/order.service";
// Uncomment these once react-native-maps is installed and configured:
// import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { AppScreen } from "@/components/AppBackground";
import { notify, confirmAction } from "@/utils/notify";
import { OtpVerificationModal } from "@/components/OtpVerificationModal";

export default function ActiveDeliveryScreen() {
  const { isAuthenticated } = useAuthStore();
  const updateLocation = useDriverStore((state) => state.updateLocation);
  const {
    activeDelivery,
    fetchMyDeliveries,
    updateDeliveryStatus,
    completeDelivery
  } = useOrderStore();
  const [location, setLocation] = useState<any>(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);

  useEffect(() => {
    // Only load deliveries and request location when authenticated
    if (!isAuthenticated) return;
    loadData();
    requestLocationPermission();
  }, [isAuthenticated]);

  const loadData = async () => {
    await fetchMyDeliveries();
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation.coords);
        await updateLocation(currentLocation.coords.latitude, currentLocation.coords.longitude);
      }
    } catch (err) {
      console.warn("Location permission/dispatch error:", err);
    }
  };

  const handleCall = (phoneNumber?: string) => {
    if (!phoneNumber) {
      notify("No Phone Number", "No contact phone number provided for this stop.");
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      notify("Call Failed", "Unable to open phone dialer on this device.");
    });
  };

  const handleOpenMaps = (addressText?: string) => {
    if (!addressText) {
      notify("No Address", "No address details available for navigation.");
      return;
    }
    const query = encodeURIComponent(addressText);
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    });
  };

  const handleUpdateStatus = (status: string) => {
    confirmAction(
      "Update Status",
      `Update delivery status to "${status.replace("_", " ")}"?`,
      async () => {
        if (activeDelivery) {
          const success = await updateDeliveryStatus(
            activeDelivery._id,
            status
          );
          if (success) {
            notify("Status Updated", `Delivery is now ${status.replace("_", " ")}.`);
            loadData();
          } else {
            notify("Update Failed", "Could not update delivery status.");
          }
        }
      }
    );
  };

  const handleComplete = () => {
    setOtpModalVisible(true);
  };

  const handleVerifyOtp = async (otp: string, notes?: string): Promise<boolean> => {
    if (!activeDelivery) return false;
    const result = await completeDelivery(activeDelivery._id, otp, notes);
    if (result.success) {
      notify("Delivery Verified & Completed", "Proof of delivery confirmed! Delivery completed successfully.");
      loadData();
      return true;
    } else {
      notify("Verification Failed", result.message || "Invalid delivery PIN code. Please confirm the 4-digit code with the customer.");
      return false;
    }
  };

  if (!isAuthenticated) {
    return (
      <AppScreen>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="lock" size={64} color="rgba(255,255,255,0.55)" />
          <Text style={styles.emptyText}>Sign in to view active deliveries</Text>
        </View>
      </AppScreen>
    );
  }

  if (!activeDelivery) {
    return (
      <AppScreen>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="local-shipping" size={64} color="rgba(255,255,255,0.55)" />
          <Text style={styles.emptyText}>No active delivery</Text>
          <Text style={styles.emptySubtext}>
            Accept a delivery to get started
          </Text>
        </View>
      </AppScreen>
    );
  }

  const customerLocation = {
    latitude:
      activeDelivery.deliveryAddress?.coordinates?.latitude || 0,
    longitude:
      activeDelivery.deliveryAddress?.coordinates?.longitude || 0
  };

  return (
    <AppScreen>
    <ScrollView style={styles.container}>
      <View style={styles.mapContainer}>
        {/* Native map (Android/iOS) – enable when react-native-maps is installed */}
        {location && Platform.OS !== "web" && (
          // <MapView
          //   style={styles.map}
          //   initialRegion={{
          //     latitude: location.latitude,
          //     longitude: location.longitude,
          //     latitudeDelta: 0.05,
          //     longitudeDelta: 0.05
          //   }}
          // >
          //   <Marker
          //     coordinate={{
          //       latitude: location.latitude,
          //       longitude: location.longitude
          //     }}
          //     title="Your Location"
          //     pinColor="blue"
          //   />
          //   {customerLocation.latitude !== 0 && (
          //     <Marker
          //       coordinate={customerLocation}
          //       title="Delivery Location"
          //       pinColor="red"
          //     />
          //   )}
          // </MapView>
          <View style={styles.webMapPlaceholder}>
            <MaterialIcons
              name="map"
              size={32}
              color="#D7263D"
            />
            <Text style={styles.webMapTitle}>
              Native map enabled on driver app
            </Text>
            <Text style={styles.webMapText}>
              On this build, the MapView component is commented out until
              react-native-maps is fully configured.
            </Text>
          </View>
        )}

        {/* Web placeholder */}
        {location && Platform.OS === "web" && (
          <View style={styles.webMapPlaceholder}>
            <MaterialIcons
              name="map"
              size={32}
              color="#D7263D"
            />
            <Text style={styles.webMapTitle}>
              Map preview not available on web yet
            </Text>
            <Text style={styles.webMapText}>
              This screen shows a live map on the driver’s mobile app. On
              web, location preview is currently disabled.
            </Text>
          </View>
        )}

        {!location && (
          <View style={styles.webMapPlaceholder}>
            <MaterialIcons
              name="location-searching"
              size={32}
              color="#9E9E9E"
            />
            <Text style={styles.webMapTitle}>
              Getting your location…
            </Text>
            <Text style={styles.webMapText}>
              Once we have your location, we’ll show the pickup and drop‑off
              points.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.deliveryCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>
            {activeDelivery.orderNumber}
          </Text>
          <View
            style={[
              styles.statusBadge,
              getStatusColor(activeDelivery.orderStatus)
            ]}
          >
            <Text style={styles.statusText}>
              {activeDelivery.orderStatus}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Location</Text>
          <View style={styles.infoRow}>
            <MaterialIcons
              name="store"
              size={20}
              color="#D7263D"
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                {activeDelivery.storeId?.name || "Store"}
              </Text>
              <Text style={styles.infoText}>
                {activeDelivery.storeId?.address?.street},{" "}
                {activeDelivery.storeId?.address?.city}
              </Text>
              <Text style={styles.infoText}>
                {activeDelivery.storeId?.contactInfo?.phone}
              </Text>

              <View style={styles.actionRow}>
                {activeDelivery.storeId?.contactInfo?.phone ? (
                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => handleCall(activeDelivery.storeId?.contactInfo?.phone)}
                  >
                    <MaterialIcons name="call" size={16} color="#D7263D" />
                    <Text style={styles.actionChipText}>Call Store</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.actionChip}
                  onPress={() =>
                    handleOpenMaps(
                      `${activeDelivery.storeId?.address?.street || ""}, ${activeDelivery.storeId?.address?.city || ""}`
                    )
                  }
                >
                  <MaterialIcons name="directions" size={16} color="#2196F3" />
                  <Text style={[styles.actionChipText, { color: "#2196F3" }]}>Directions</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Location</Text>
          <View style={styles.infoRow}>
            <MaterialIcons
              name="location-on"
              size={20}
              color="#f44336"
            />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                {activeDelivery.deliveryAddress?.fullName || "Customer"}
              </Text>
              <Text style={styles.infoText}>
                {activeDelivery.deliveryAddress?.street},{" "}
                {activeDelivery.deliveryAddress?.city}
              </Text>
              <Text style={styles.infoText}>
                {activeDelivery.deliveryAddress?.phone}
              </Text>

              <View style={styles.actionRow}>
                {activeDelivery.deliveryAddress?.phone ? (
                  <TouchableOpacity
                    style={styles.actionChip}
                    onPress={() => handleCall(activeDelivery.deliveryAddress?.phone)}
                  >
                    <MaterialIcons name="call" size={16} color="#D7263D" />
                    <Text style={styles.actionChipText}>Call Customer</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.actionChip}
                  onPress={() =>
                    handleOpenMaps(
                      `${activeDelivery.deliveryAddress?.street || ""}, ${activeDelivery.deliveryAddress?.city || ""}`
                    )
                  }
                >
                  <MaterialIcons name="directions" size={16} color="#2196F3" />
                  <Text style={[styles.actionChipText, { color: "#2196F3" }]}>Directions</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Details</Text>
          <View style={styles.orderDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Items:</Text>
              <Text style={styles.detailValue}>
                {activeDelivery.items?.length || 0}
              </Text>
            </View>
            {Array.isArray(activeDelivery.items) && activeDelivery.items.length > 0 && (
              <View style={[styles.detailRow, { flexDirection: 'column', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 }]}>
                {activeDelivery.items.map((it: any, idx: number) => (
                  <Text key={idx} style={[styles.infoText, { marginBottom: 3 }]}>
                    • {it.quantity || 1}x {it.productId?.name || it.name || "Product"}
                  </Text>
                ))}
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                Delivery Fee:
              </Text>
              <Text style={styles.detailValue}>
                {formatCurrency(activeDelivery.deliveryFee)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total:</Text>
              <Text style={styles.detailValue}>
                {formatCurrency(activeDelivery.total)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionButtons}>
          {activeDelivery.orderStatus === "in_transit" ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleComplete}
            >
              <Text style={styles.primaryButtonText}>
                Mark as Delivered
              </Text>
            </TouchableOpacity>
          ) : activeDelivery.orderStatus !== "delivered" && activeDelivery.orderStatus !== "cancelled" ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => handleUpdateStatus("in_transit")}
            >
              <Text style={styles.primaryButtonText}>
                Start Delivery
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.infoRow, { justifyContent: "center" }]}>
              <Text style={{ color: "#D7263D", fontWeight: "600" }}>
                Delivery completed
              </Text>
            </View>
          )}
        </View>
      </View>

      <OtpVerificationModal
        visible={otpModalVisible}
        onClose={() => setOtpModalVisible(false)}
        onVerify={handleVerifyOtp}
        customerName={activeDelivery?.deliveryAddress?.fullName}
        orderNumber={activeDelivery?.orderNumber}
      />
    </ScrollView>
    </AppScreen>
  );
}

function getStatusColor(status: string) {
  const colors: any = {
    ready: { backgroundColor: "#FF9800" },
    in_transit: { backgroundColor: "#2196F3" },
    delivered: { backgroundColor: "#D7263D" }
  };
  return colors[status] || { backgroundColor: "#9E9E9E" };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent"
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "transparent"
  },
  emptyText: {
    fontSize: 18,
    color: "#fff",
    marginTop: 15
  },
  emptySubtext: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 5
  },
  mapContainer: {
    height: 250
  },
  map: {
    flex: 1
  },
  webMapPlaceholder: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 8
  },
  webMapTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    textAlign: "center"
  },
  webMapText: {
    marginTop: 4,
    fontSize: 14,
    color: "#666",
    textAlign: "center"
  },
  deliveryCard: {
    backgroundColor: "#fff",
    padding: 15
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: "bold"
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15
  },
  statusText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12
  },
  section: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    color: "#333"
  },
  infoRow: {
    flexDirection: "row",
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8
  },
  infoContent: {
    marginLeft: 12,
    flex: 1
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2
  },
  orderDetails: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6
  },
  detailLabel: {
    fontSize: 14,
    color: "#666"
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600"
  },
  actionButtons: {
    marginTop: 10
  },
  primaryButton: {
    backgroundColor: "#D7263D",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 10,
    gap: 10,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  actionChipText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#D7263D",
  }
});