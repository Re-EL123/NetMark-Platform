import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import api, { getApiErrorMessage } from '@/services/api';
import { AppScreen } from '@/components/AppBackground';
import { notify } from '@/utils/notify';

const VEHICLE_TYPES = [
  { label: 'Motorcycle', value: 'motorcycle' },
  { label: 'Car', value: 'car' },
  { label: 'Van', value: 'van' },
  { label: 'Bicycle', value: 'bicycle' },
];

function normalizeLicenseExpiry(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  const iso =
    /^\d{8}$/.test(digits) && !trimmed.includes('-')
      ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
      : trimmed;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }

  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return iso;
}

export default function RegisterScreen() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    vehicleType: 'motorcycle',
    vehicleNumber: '',
    vehicleModel: '',
    licenseNumber: '',
    licenseExpiry: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();
    const phone = formData.phone.trim();
    const password = formData.password;
    const vehicleNumber = formData.vehicleNumber.trim();
    const vehicleModel = formData.vehicleModel.trim();
    const licenseNumber = formData.licenseNumber.trim();
    const licenseExpiry = formData.licenseExpiry.trim();

    if (!name || !email || !phone || !password) {
      setError('Please fill in all required personal details.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (!vehicleNumber || !licenseNumber) {
      setError('Please fill in vehicle number and license number.');
      return;
    }

    if (!licenseExpiry) {
      setError('Please enter a license expiry date in YYYY-MM-DD format.');
      return;
    }

    const normalizedExpiry = normalizeLicenseExpiry(licenseExpiry);
    if (!normalizedExpiry) {
      setError('License expiry must be a valid date in YYYY-MM-DD format.');
      return;
    }

    setError('');
    setLoading(true);

    const driverInfo: Record<string, string> = {
      vehicleType: formData.vehicleType,
      vehicleNumber,
      vehicleModel,
      licenseNumber,
      licenseExpiry: normalizedExpiry,
    };

    const payload = {
      name,
      email,
      phone,
      password,
      role: 'driver',
      driverInfo,
    };

    try {
      const response = await api.post('/auth/register', payload);

      if (response?.success === false) {
        throw response;
      }

      notify(
        'Registration submitted',
        'Your driver account is pending approval. You can log in after an admin approves it.',
        () => router.replace('/login')
      );
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Registration failed');
      setError(message);
      notify('Registration failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Register as Driver</Text>
          <Text style={styles.subtitle}>
            Create your driver account. An admin must approve it before you can take deliveries.
          </Text>
        </View>

        <View style={styles.form}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Text style={styles.label}>Personal Information</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name *"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Email *"
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone *"
            value={formData.phone}
            onChangeText={(text) => setFormData({ ...formData, phone: text })}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Password *"
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            secureTextEntry
          />

          <Text style={styles.label}>Vehicle Information</Text>
          <View style={styles.vehicleRow}>
            {VEHICLE_TYPES.map((type) => {
              const selected = formData.vehicleType === type.value;
              return (
                <TouchableOpacity
                  key={type.value}
                  style={[styles.vehicleChip, selected && styles.vehicleChipSelected]}
                  onPress={() => setFormData({ ...formData, vehicleType: type.value })}
                >
                  <Text
                    style={[
                      styles.vehicleChipText,
                      selected && styles.vehicleChipTextSelected,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Vehicle Number *"
            value={formData.vehicleNumber}
            onChangeText={(text) => setFormData({ ...formData, vehicleNumber: text })}
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.input}
            placeholder="Vehicle Model"
            value={formData.vehicleModel}
            onChangeText={(text) => setFormData({ ...formData, vehicleModel: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="License Number *"
            value={formData.licenseNumber}
            onChangeText={(text) => setFormData({ ...formData, licenseNumber: text })}
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.input}
            placeholder="License Expiry (YYYY-MM-DD) *"
            value={formData.licenseExpiry}
            onChangeText={(text) => setFormData({ ...formData, licenseExpiry: text })}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Registering...' : 'Register'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.linkText}>Already have an account? Login</Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 20,
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 50,
    elevation: 12,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D7263D',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  form: {
    width: '100%',
  },
  errorText: {
    backgroundColor: '#fdecea',
    color: '#c62828',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 14,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  vehicleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 15,
  },
  vehicleChip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  vehicleChipSelected: {
    backgroundColor: '#D7263D',
    borderColor: '#D7263D',
  },
  vehicleChipText: {
    color: '#333',
    fontSize: 14,
  },
  vehicleChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#D7263D',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 20,
    marginBottom: 40,
    alignItems: 'center',
  },
  linkText: {
    color: '#D7263D',
    fontSize: 14,
  },
});
