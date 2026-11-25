import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { RegisterFormData, registerSchema } from '@/lib/validations/auth';

// This component provides the registration screen and email confirmation state.
export default function RegisterScreen() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [resendSuccess, setResendSuccess] = useState<boolean>(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  // This effect counts down the cooldown timer for the resend button.
  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // This function registers a new candidate user through supabase auth.
  const onSubmit = async (values: RegisterFormData) => {
    try {
      setAuthError(null);
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });

      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('already registered') || message.includes('user already exists')) {
          setAuthError('Un compte est déjà associé à cette adresse e-mail.');
        } else if (message.includes('password') && message.includes('weak')) {
          setAuthError('Le mot de passe choisi est trop faible.');
        } else {
          setAuthError(error.message);
        }
        return;
      }

      if (data.session) {
        router.replace('/(tabs)');
      } else {
        setRegisteredEmail(values.email);
        setResendCooldown(60);
      }
    } catch (err) {
      console.error('Registration failed', err);
      setAuthError('Une erreur inattendue est survenue. Veuillez réessayer.');
    }
  };

  // This function requests a fresh confirmation email if the previous one expired.
  const handleResend = async () => {
    if (!registeredEmail || resendCooldown > 0) {
      return;
    }
    try {
      setAuthError(null);
      setResendSuccess(false);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: registeredEmail,
      });
      if (error) {
        setAuthError('Impossible de renvoyer le courriel pour le moment.');
      } else {
        setResendSuccess(true);
        setResendCooldown(60);
      }
    } catch (err) {
      console.error('Failed to resend confirmation email', err);
      setAuthError('Erreur lors de l’envoi de l’e-mail de confirmation.');
    }
  };

  // This condition renders the confirmation prompt when registration succeeds.
  if (registeredEmail) {
    return (
      <View style={styles.confirmContainer}>
        <View style={styles.card}>
          <Text style={styles.brandTitle}>JobPilot AI</Text>
          <Text style={styles.screenTitle}>Vérifiez votre boîte e-mail</Text>
          <Text style={styles.confirmDescription}>
            Un e-mail de confirmation a été envoyé à l’adresse :
          </Text>
          <Text style={styles.highlightEmail}>{registeredEmail}</Text>
          <Text style={styles.confirmHint}>
            Cliquez sur le lien contenu dans le message pour activer votre compte et accéder à vos offres.
          </Text>

          {resendSuccess && (
            <View style={styles.successBanner}>
              <Text style={styles.successBannerText}>
                Un nouvel e-mail de confirmation vient de vous être envoyé.
              </Text>
            </View>
          )}

          {authError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          )}

          <Pressable
            style={[styles.resendButton, resendCooldown > 0 && styles.buttonDisabled]}
            disabled={resendCooldown > 0}
            onPress={handleResend}>
            <Text style={styles.resendButtonText}>
              {resendCooldown > 0
                ? `Renvoyer l’e-mail (${resendCooldown}s)`
                : 'Renvoyer l’e-mail de confirmation'}
            </Text>
          </Pressable>

          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.backToLoginButton}>
              <Text style={styles.backToLoginText}>Retour à la connexion</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>JobPilot AI</Text>
            <Text style={styles.screenTitle}>Créer un compte</Text>
            <Text style={styles.subtitle}>Rejoignez la plateforme et pilotez vos candidatures</Text>
          </View>

          {authError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{authError}</Text>
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Adresse e-mail</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="nom@exemple.fr"
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isSubmitting}
                />
              )}
            />
            {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Mot de passe</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.password && styles.inputError]}
                  placeholder="Minimum 8 caractères"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isSubmitting}
                />
              )}
            />
            {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}
            <Text style={styles.hintText}>
              Au moins 8 caractères avec 1 majuscule, 1 minuscule et 1 chiffre.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.confirmPassword && styles.inputError]}
                  placeholder="Répétez votre mot de passe"
                  placeholderTextColor="#64748B"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isSubmitting}
                />
              )}
            />
            {errors.confirmPassword && (
              <Text style={styles.fieldError}>{errors.confirmPassword.message}</Text>
            )}
          </View>

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
            onPress={() => handleSubmit(onSubmit)()}
            disabled={isSubmitting}>
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>S’inscrire</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Vous avez déjà un compte ? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable hitSlop={8}>
                <Text style={styles.signInLink}>Se connecter</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// This stylesheet defines styles for the registration flow and confirmation banner.
const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  confirmContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#0B1120',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 6,
    textAlign: 'center',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  confirmDescription: {
    fontSize: 15,
    color: '#E2E8F0',
    marginTop: 12,
    textAlign: 'center',
  },
  highlightEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: '#38BDF8',
    marginVertical: 8,
    textAlign: 'center',
  },
  confirmHint: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  successBanner: {
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#D1FAE5',
    fontSize: 13,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#7F1D1D',
    borderColor: '#DC2626',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#FEE2E2',
    fontSize: 14,
    lineHeight: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E2E8F0',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F8FAFC',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  fieldError: {
    color: '#F87171',
    fontSize: 12,
    marginTop: 6,
  },
  hintText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 6,
  },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  resendButton: {
    backgroundColor: '#0284C7',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  resendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  backToLoginButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  backToLoginText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  signInLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#38BDF8',
  },
});
