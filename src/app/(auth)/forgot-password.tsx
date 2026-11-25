import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import React, { useState } from 'react';
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
import { ForgotPasswordFormData, forgotPasswordSchema } from '@/lib/validations/auth';

// This component provides the password reset request screen.
export default function ForgotPasswordScreen() {
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  // This function requests a password recovery email without leaking account existence.
  const onSubmit = async (values: ForgotPasswordFormData) => {
    try {
      setErrorMessage(null);
      const { error } = await supabase.auth.resetPasswordForEmail(values.email);

      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('network') || message.includes('fetch')) {
          setErrorMessage('Impossible de joindre le serveur. Vérifiez votre connexion internet.');
          return;
        }
      }

      setIsSuccess(true);
    } catch (err) {
      console.error('Password reset request error', err);
      setErrorMessage('Une erreur inattendue est survenue. Veuillez réessayer.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>JobPilot AI</Text>
            <Text style={styles.screenTitle}>Mot de passe oublié</Text>
            <Text style={styles.subtitle}>
              Recevez les instructions de réinitialisation par e-mail
            </Text>
          </View>

          {isSuccess ? (
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>E-mail envoyé</Text>
              <Text style={styles.successDescription}>
                Si cette adresse est enregistrée, vous recevrez un e-mail avec les instructions pour
                réinitialiser votre mot de passe d’ici quelques instants.
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable style={styles.backButton}>
                  <Text style={styles.backButtonText}>Retour à la connexion</Text>
                </Pressable>
              </Link>
            </View>
          ) : (
            <>
              {errorMessage && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
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

              <Pressable
                style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
                onPress={() => handleSubmit(onSubmit)()}
                disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Envoyer les instructions</Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Link href="/(auth)/login" asChild>
                  <Pressable hitSlop={8}>
                    <Text style={styles.backLink}>Retour à la connexion</Text>
                  </Pressable>
                </Link>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// This stylesheet provides styles for the password recovery interface.
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
  successBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#34D399',
    marginBottom: 10,
  },
  successDescription: {
    fontSize: 14,
    color: '#E2E8F0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
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
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
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
    alignItems: 'center',
    marginTop: 20,
  },
  backLink: {
    fontSize: 14,
    color: '#38BDF8',
    fontWeight: '500',
  },
});
