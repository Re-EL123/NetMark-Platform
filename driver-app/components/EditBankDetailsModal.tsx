import React, { useState, useEffect } from "react";
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
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useDriverStore } from "@/services/driver.service";
import { notify } from "@/utils/notify";

interface EditBankDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  currentBankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    bankCode?: string;
  };
}

const COMMON_SA_BANKS = [
  "Capitec Bank",
  "FNB (First National Bank)",
  "Standard Bank",
  "Nedbank",
  "Absa Bank",
  "TymeBank",
  "African Bank",
  "Investec",
  "Discovery Bank",
];

export function EditBankDetailsModal({
  visible,
  onClose,
  currentBankDetails,
}: EditBankDetailsModalProps) {
  const [bankName, setBankName] = useState(currentBankDetails?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(
    currentBankDetails?.accountNumber || ""
  );
  const [accountName, setAccountName] = useState(
    currentBankDetails?.accountName || ""
  );
  const [bankCode, setBankCode] = useState(currentBankDetails?.bankCode || "");
  const [loading, setLoading] = useState(false);

  const updateProfile = useDriverStore((state) => state.updateProfile);

  useEffect(() => {
    if (visible && currentBankDetails) {
      setBankName(currentBankDetails.bankName || "");
      setAccountNumber(currentBankDetails.accountNumber || "");
      setAccountName(currentBankDetails.accountName || "");
      setBankCode(currentBankDetails.bankCode || "");
    }
  }, [visible, currentBankDetails]);

  const handleSave = async () => {
    if (!bankName.trim()) {
      notify("Missing Bank Name", "Please specify your bank name.");
      return;
    }
    if (!accountNumber.trim() || accountNumber.trim().length < 6) {
      notify(
        "Invalid Account Number",
        "Please enter a valid bank account number (at least 6 digits)."
      );
      return;
    }
    if (!accountName.trim()) {
      notify(
        "Missing Account Holder",
        "Please enter the account holder name as registered with your bank."
      );
      return;
    }

    setLoading(true);
    const result = await updateProfile({
      bankDetails: {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        bankCode: bankCode.trim(),
      },
    });
    setLoading(false);

    if (result.success) {
      notify("Bank Details Saved", "Your banking details have been updated successfully.", () => {
        onClose();
      });
    } else {
      notify("Update Failed", result.message || "Failed to update bank details.");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.titleContainer}>
              <MaterialIcons name="account-balance" size={24} color="#E50914" />
              <Text style={styles.modalTitle}>Banking Details</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Your earnings will be paid out to this account. Ensure the details match your bank statements.
          </Text>

          <ScrollView style={styles.formContainer} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Select or Enter Bank Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Capitec, FNB, Standard Bank"
              value={bankName}
              onChangeText={setBankName}
            />

            <View style={styles.bankChipsContainer}>
              {COMMON_SA_BANKS.slice(0, 5).map((bank) => (
                <TouchableOpacity
                  key={bank}
                  style={[
                    styles.bankChip,
                    bankName === bank && styles.bankChipSelected,
                  ]}
                  onPress={() => setBankName(bank)}
                >
                  <Text
                    style={[
                      styles.bankChipText,
                      bankName === bank && styles.bankChipTextSelected,
                    ]}
                  >
                    {bank}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Account Holder Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              value={accountName}
              onChangeText={setAccountName}
            />

            <Text style={styles.fieldLabel}>Account Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter bank account number"
              keyboardType="number-pad"
              value={accountNumber}
              onChangeText={setAccountNumber}
            />

            <Text style={styles.fieldLabel}>Branch Code (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Universal branch code (e.g. 470010)"
              keyboardType="number-pad"
              value={bankCode}
              onChangeText={setBankCode}
            />

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Details</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
    lineHeight: 18,
  },
  formContainer: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#444",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#f9f9f9",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  bankChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  bankChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fafafa",
  },
  bankChipSelected: {
    borderColor: "#E50914",
    backgroundColor: "#FEE2E2",
  },
  bankChipText: {
    fontSize: 12,
    color: "#666",
  },
  bankChipTextSelected: {
    color: "#B91C1C",
    fontWeight: "bold",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cancelButtonText: {
    color: "#666",
    fontWeight: "600",
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: "#E50914",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
});
