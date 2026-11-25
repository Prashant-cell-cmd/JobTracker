import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/use-auth';
import { Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, error, clearError } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    clearError();
    if (!email.trim()) {
      setFormError('Enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (isRegistering && password.length < 12) {
      setFormError('Choose a password with at least 12 characters.');
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      setFormError('Your passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      router.replace('/');
    } catch {
      // The auth provider keeps the API error available for display.
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    clearError();
    setFormError(null);
    setIsRegistering((current) => !current);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Spacing.four, paddingTop: insets.top + Spacing.four },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View pointerEvents="none" style={styles.decorOrbTop} />
        <View pointerEvents="none" style={styles.decorOrbBottom} />
        <View pointerEvents="none" style={styles.decorGrid}>
          {Array.from({ length: 12 }).map((_, index) => (
            <View key={index} style={styles.decorDot} />
          ))}
        </View>
        <View style={styles.container}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>J</Text>
          </View>
          <Text style={styles.eyebrow}>YOUR CAREER DASHBOARD</Text>
          <Text style={styles.title}>{isRegistering ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.subtitle}>
            {isRegistering
              ? 'Keep your job search organized in one secure place.'
              : 'Sign in to pick up where you left off.'}
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#849087"
              returnKeyType="next"
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              onChangeText={setPassword}
              placeholder={isRegistering ? 'At least 12 characters' : 'Enter your password'}
              placeholderTextColor="#849087"
              returnKeyType={isRegistering ? 'next' : 'go'}
              secureTextEntry
              style={styles.input}
              textContentType={isRegistering ? 'newPassword' : 'password'}
              value={password}
            />

            {isRegistering ? (
              <>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  accessibilityLabel="Confirm password"
                  autoCapitalize="none"
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={() => void submit()}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#849087"
                  returnKeyType="done"
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </>
            ) : null}

            {formError || error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {formError ?? error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.submitButton, (pressed || isSubmitting) && styles.pressed]}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in'}
              </Text>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={toggleMode} style={styles.modeButton}>
              <Text style={styles.modeText}>
                {isRegistering ? 'Already have an account? Sign in' : 'New to JobTracker? Create an account'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.securityNote}>Your password is securely hashed and never stored as plain text.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { backgroundColor: '#F5F7F4', flex: 1 },
  scrollContent: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  container: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(32,55,44,0.08)',
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 470,
    paddingHorizontal: 22,
    paddingVertical: 28,
    shadowColor: '#20372C',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    width: '100%',
  },
  decorOrbTop: {
    backgroundColor: '#C6F36A',
    borderRadius: 180,
    height: 230,
    opacity: 0.32,
    position: 'absolute',
    right: -125,
    top: -100,
    width: 230,
  },
  decorOrbBottom: {
    backgroundColor: '#BFD0B3',
    borderRadius: 220,
    bottom: -160,
    height: 300,
    left: -170,
    opacity: 0.28,
    position: 'absolute',
    width: 300,
  },
  decorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, left: 24, opacity: 0.32, position: 'absolute', top: 44, width: 45 },
  decorDot: { backgroundColor: '#71846F', borderRadius: 2, height: 4, width: 4 },
  brandMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#20372C',
    borderRadius: 22,
    height: 56,
    justifyContent: 'center',
    marginBottom: 22,
    width: 56,
  },
  brandMarkText: { color: '#C6F36A', fontSize: 28, fontWeight: '800' },
  eyebrow: { color: '#758078', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center' },
  title: { color: '#202923', fontSize: 29, fontWeight: '800', letterSpacing: -0.8, marginTop: 8, textAlign: 'center' },
  subtitle: { color: '#758078', fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  form: { marginTop: 30, width: '100%' },
  label: { color: '#354138', fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 15 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE4DD',
    borderRadius: 12,
    borderWidth: 1,
    color: '#202923',
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  error: { color: '#A13E3E', fontSize: 13, lineHeight: 19, marginTop: 13 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#20372C',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 52,
  },
  submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modeButton: { alignItems: 'center', paddingVertical: 18 },
  modeText: { color: '#49683D', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  securityNote: { color: '#849087', fontSize: 11, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
