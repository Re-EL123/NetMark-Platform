import { Redirect } from 'expo-router';
import { useAuthStore } from '@/services/auth.service';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/login'} />;
}
