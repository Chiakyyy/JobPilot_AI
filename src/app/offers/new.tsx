import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
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

import { useOfferMutations } from '@/hooks/useOffers';
import { OfferFormData, offerSchema } from '@/lib/validations/offer';

// This screen provides the form interface to record a new job offer.
export default function NewOfferScreen() {
  const router = useRouter();
  const { createOffer, isCreating } = useOfferMutations();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<OfferFormData>({
    resolver: zodResolver(offerSchema),
    defaultValues: {
      title: '',
      company: '',
      location: '',
      url: '',
      description: '',
      notes: '',
    },
  });

  // This function submits the offer form and navigates to the newly created record.
  const onSubmit = async (values: OfferFormData) => {
    try {
      setErrorMessage(null);
      const created = await createOffer({
        title: values.title,
        company: values.company,
        location: values.location || null,
        url: values.url || null,
        description: values.description || null,
        notes: values.notes || null,
      });

      router.replace(`/offers/${created.id}` as never);
    } catch (err) {
      console.error('Failed to create offer', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Une erreur est survenue lors de l’enregistrement.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.formCard}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Titre du poste *</Text>
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.title && styles.inputError]}
                  placeholder="ex. Développeur Full Stack React Native"
                  placeholderTextColor="#94A3B8"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isCreating}
                />
              )}
            />
            {errors.title && <Text style={styles.fieldError}>{errors.title.message}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Entreprise *</Text>
            <Controller
              control={control}
              name="company"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.company && styles.inputError]}
                  placeholder="ex. TechCorp Solutions"
                  placeholderTextColor="#94A3B8"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  editable={!isCreating}
                />
              )}
            />
            {errors.company && <Text style={styles.fieldError}>{errors.company.message}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Localisation</Text>
            <Controller
              control={control}
              name="location"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.location && styles.inputError]}
                  placeholder="ex. Paris, France / Télétravail"
                  placeholderTextColor="#94A3B8"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value || ''}
                  editable={!isCreating}
                />
              )}
            />
            {errors.location && <Text style={styles.fieldError}>{errors.location.message}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Lien de l’offre</Text>
            <Controller
              control={control}
              name="url"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.url && styles.inputError]}
                  placeholder="https://..."
                  placeholderTextColor="#94A3B8"
                  keyboardType="url"
                  autoCapitalize="none"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value || ''}
                  editable={!isCreating}
                />
              )}
            />
            {errors.url && <Text style={styles.fieldError}>{errors.url.message}</Text>}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Description du poste</Text>
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.textArea, errors.description && styles.inputError]}
                  placeholder="Collez ici le descriptif pour la future analyse automatique..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value || ''}
                  editable={!isCreating}
                />
              )}
            />
            {errors.description && (
              <Text style={styles.fieldError}>{errors.description.message}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Notes personnelles</Text>
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.textArea, errors.notes && styles.inputError]}
                  placeholder="Remarques, contacts ou points d'attention..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value || ''}
                  editable={!isCreating}
                />
              )}
            />
            {errors.notes && <Text style={styles.fieldError}>{errors.notes.message}</Text>}
          </View>

          <Pressable
            style={[styles.submitButton, isCreating && styles.buttonDisabled]}
            disabled={isCreating}
            onPress={() => handleSubmit(onSubmit)()}>
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Enregistrer l’offre</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// This stylesheet defines styles for the job offer creation screen.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 80,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  fieldError: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 4,
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
    fontSize: 15,
    fontWeight: '600',
  },
});
