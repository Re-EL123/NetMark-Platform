import { Alert, Platform } from "react-native";

/**
 * Web-safe notification dialog (replaces Alert.alert for simple informational alerts).
 */
export function notify(title: string, message: string, onOk?: () => void): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(`${title}\n\n${message}`);
    }
    onOk?.();
    return;
  }

  Alert.alert(title, message, [{ text: "OK", onPress: onOk }]);
}

/**
 * Web-safe confirmation dialog (replaces Alert.alert with Cancel/Confirm buttons).
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  confirmText = "Confirm",
  cancelText = "Cancel"
): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      const accepted = window.confirm(`${title}\n\n${message}`);
      if (accepted) {
        onConfirm();
      } else {
        onCancel?.();
      }
      return;
    }
    onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: "cancel", onPress: onCancel },
    { text: confirmText, onPress: onConfirm },
  ]);
}
