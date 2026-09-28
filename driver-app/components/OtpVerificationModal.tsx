import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { notify } from "@/utils/notify";

interface OtpVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  onVerify: (otp: string, notes?: string) => Promise<boolean>;
  customerName?: string;
  orderNumber?: string;
}

export function OtpVerificationModal({
  visible,
  onClose,
  onVerify,
  customerName,
  orderNumber,
}: OtpVerificationModalProps) {
  const [otp, setOtp] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!otp.trim() || otp.trim().length !== 4) {
      notify(
        "Invalid PIN",
        "Please enter the complete 4-digit Delivery PIN provided by the customer."
      );
      return;
    }

    setLoading(true);
    const success = await onVerify(otp.trim(), notes.trim());
    setLoading(false);

    if (success) {
      setOtp("");
      setNotes("");
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="verified-user" size={36} color="#4CAF50" />
          </View>

          <Text style={styles.modalTitle}>Proof of Delivery</Text>
          <Text style={styles.subtitle}>
            Ask {customerName ? `"${customerName}"` : "the customer"} for their 4-digit Delivery PIN to verify and complete order{" "}
            <Text style={{ fontWeight: "bold" }}>{orderNumber}</Text>.
          </Text>

          <View style={styles.pinContainer}>
            <TextInput
              style={styles.pinInput}
              placeholder="0000"
              placeholderTextColor="#ccc"
              keyboardType="number-pad"
              maxLength={4}
              value={otp}
              onChangeText={(val) => setOtp(val.replace(/[^0-9]/g, ""))}
              autoFocus={true}
            />
          </View>

          <TextInput
            style={styles.notesInput}
            placeholder="Delivery notes (optional, e.g. Handed to customer)"
            value={notes}
            onChangeText={setNotes}
            multiline={true}
            numberOfLines={2}
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.confirmBtn]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Verify & Complete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#222",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  pinContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },
  pinInput: {
    width: 180,
    height: 56,
    borderWidth: 2,
    borderColor: "#4CAF50",
    borderRadius: 12,
    textAlign: "center",
    fontSize: 32,
    fontWeight: "bold",
    letterSpacing: 12,
    color: "#2E7D32",
    backgroundColor: "#F1F8E9",
  },
  notesInput: {
    width: "100%",
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    marginBottom: 20,
    textAlignVertical: "top",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cancelBtnText: {
    color: "#666",
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: "#4CAF50",
  },
  confirmBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
