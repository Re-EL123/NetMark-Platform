import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useEffect, useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useAuthStore } from "@/services/auth.service";
import { useOrderStore } from "@/services/order.service";
import { AppScreen } from "@/components/AppBackground";
import { formatCurrency } from "@/utils/currency";
import { notify, confirmAction } from "@/utils/notify";
import { router } from "expo-router";

export default function OrdersScreen() {
  const { isAuthenticated } = useAuthStore();
  const {
    availableOrders,
    fetchAvailableOrders,
    acceptOrder
  } = useOrderStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Only load orders when authenticated
    if (!isAuthenticated) return;
    loadOrders();

    // Auto-poll for newly available deliveries every 15 seconds
    const intervalId = setInterval(() => {
      fetchAvailableOrders();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [isAuthenticated]);

  const loadOrders = async () => {
    await fetchAvailableOrders();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const handleAcceptOrder = (orderId: string) => {
    confirmAction(
      "Accept Delivery",
      "Are you sure you want to accept this delivery?",
      async () => {
        const success = await acceptOrder(orderId);
        if (success) {
          notify("Delivery Accepted", "You have claimed this delivery. Moving to active delivery screen.", () => {
            router.push("/(tabs)/active-delivery");
          });
        } else {
          notify("Error", "Failed to accept delivery. It may already be assigned or you need to be online.");
        }
      }
    );
  };

  const renderOrderItem = ({ item }: any) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderNumber}>{item.orderNumber}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {formatCurrency(item.deliveryFee)}
          </Text>
        </View>
      </View>

      <View style={styles.orderInfo}>
        <View style={styles.infoRow}>
          <MaterialIcons name="store" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.storeId?.name || "N/A"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialIcons name="person" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.customerId?.name || "N/A"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialIcons name="location-on" size={16} color="#666" />
          <Text style={styles.infoText} numberOfLines={1}>
            {item.deliveryAddress?.street}, {item.deliveryAddress?.city}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialIcons name="inventory" size={16} color="#666" />
          <Text style={styles.infoText} numberOfLines={2}>
            {Array.isArray(item.items) && item.items.length > 0
              ? `${item.items.length} item${item.items.length > 1 ? "s" : ""}: ${item.items.map((it: any) => `${it.quantity || 1}x ${it.productId?.name || it.name || "Item"}`).join(", ")}`
              : `${item.items?.length || 0} items`}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.acceptButton}
        onPress={() => handleAcceptOrder(item._id)}
      >
        <Text style={styles.acceptButtonText}>Accept Delivery</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <AppScreen style={styles.container}>
      <FlatList
        data={availableOrders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={["#E50914"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="inbox" size={64} color="rgba(255,255,255,0.55)" />
            <Text style={styles.emptyText}>No available deliveries</Text>
            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
          </View>
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent"
  },
  listContainer: {
    padding: 15
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "bold"
  },
  badge: {
    backgroundColor: "#E50914",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15
  },
  badgeText: {
    color: "#fff",
    fontWeight: "600"
  },
  orderInfo: {
    marginBottom: 15
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#333",
    flex: 1
  },
  acceptButton: {
    backgroundColor: "#E50914",
    padding: 12,
    borderRadius: 8,
    alignItems: "center"
  },
  acceptButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100
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
  }
});