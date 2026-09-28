import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl
} from "react-native";
import { useEffect, useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { useEarningsStore } from "@/services/earnings.service";
import { useAuthStore } from "@/services/auth.service";
import { AppScreen } from "@/components/AppBackground";
import { formatCurrency } from "@/utils/currency";

export default function EarningsScreen() {
  const { earnings, summary, fetchEarnings, fetchSummary } = useEarningsStore();
  const { isAuthenticated } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Only load data when the driver is authenticated
    if (!isAuthenticated) return;
    loadData();
  }, [isAuthenticated]);

  const loadData = async () => {
    await fetchEarnings();
    await fetchSummary();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderEarningItem = ({ item }: any) => (
    <View style={styles.earningCard}>
      <View style={styles.earningHeader}>
        <Text style={styles.orderNumber}>{item.orderId?.orderNumber}</Text>
        <View style={[styles.badge, getPayoutStatusColor(item.payoutStatus)]}>
          <Text style={styles.badgeText}>{item.payoutStatus}</Text>
        </View>
      </View>
      <View style={styles.earningDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Delivery Fee:</Text>
          <Text style={styles.detailValue}>
            {formatCurrency(item.deliveryFee)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Your Earnings:</Text>
          <Text style={[styles.detailValue, styles.earningValue]}>
            {formatCurrency(item.driverAmount)}
          </Text>
        </View>
        {item.tip > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Tip:</Text>
            <Text style={styles.detailValue}>
              {formatCurrency(item.tip)}
            </Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date:</Text>
          <Text style={styles.detailValue}>
            {new Date(item.deliveryDate).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <AppScreen style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Earnings Summary</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <MaterialIcons name="attach-money" size={32} color="#4CAF50" />
            <Text style={styles.summaryValue}>
              {formatCurrency(summary?.totalEarnings || 0)}
            </Text>
            <Text style={styles.summaryLabel}>Total Earnings</Text>
          </View>
          <View style={styles.summaryItem}>
            <MaterialIcons name="pending" size={32} color="#FF9800" />
            <Text style={styles.summaryValue}>
              {formatCurrency(summary?.pendingEarnings || 0)}
            </Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryItem}>
            <MaterialIcons name="check-circle" size={32} color="#4CAF50" />
            <Text style={styles.summaryValue}>
              {formatCurrency(summary?.paidEarnings || 0)}
            </Text>
            <Text style={styles.summaryLabel}>Paid Out</Text>
          </View>
          <View style={styles.summaryItem}>
            <MaterialIcons name="local-shipping" size={32} color="#2196F3" />
            <Text style={styles.summaryValue}>
              {summary?.totalDeliveries || 0}
            </Text>
            <Text style={styles.summaryLabel}>Deliveries</Text>
          </View>
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Transaction History</Text>
      </View>

      <FlatList
        data={earnings}
        renderItem={renderEarningItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={["#4CAF50"]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt" size={64} color="rgba(255,255,255,0.55)" />
            <Text style={styles.emptyText}>No earnings yet</Text>
          </View>
        }
      />
    </AppScreen>
  );
}

function getPayoutStatusColor(status: string) {
  const colors: any = {
    pending: { backgroundColor: "#FF9800" },
    paid: { backgroundColor: "#4CAF50" },
    processing: { backgroundColor: "#2196F3" }
  };
  return colors[status] || { backgroundColor: "#9E9E9E" };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent"
  },
  summaryCard: {
    backgroundColor: "#fff",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  summaryItem: {
    width: "48%",
    alignItems: "center",
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    marginBottom: 10
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 4
  },
  summaryLabel: {
    fontSize: 12,
    color: "#666"
  },
  listHeader: {
    padding: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "600"
  },
  listContainer: {
    padding: 15
  },
  earningCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  earningHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: "600"
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600"
  },
  earningDetails: {},
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4
  },
  detailLabel: {
    fontSize: 13,
    color: "#666"
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500"
  },
  earningValue: {
    color: "#4CAF50",
    fontWeight: "600"
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60
  },
  emptyText: {
    fontSize: 16,
    color: "#fff",
    marginTop: 15
  }
});