import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { JobStoreProvider } from '../hooks/use-job-store';

void SplashScreen.preventAutoHideAsync();

function ApplicationStack({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-job" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

function AppRoutes() {
  const { session, isLoading, expireSession } = useAuth();
  const colorScheme = useColorScheme();
  const isAuthenticated = !!session;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {isLoading ? (
        <View style={{ backgroundColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF', flex: 1 }} />
      ) : session ? (
        <JobStoreProvider token={session.token} onSessionExpired={expireSession}>
          <ApplicationStack isAuthenticated={isAuthenticated} />
        </JobStoreProvider>
      ) : (
        <ApplicationStack isAuthenticated={false} />
      )}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
