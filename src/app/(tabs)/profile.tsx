import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { ProfileFormData, profileSchema } from '@/lib/validations/auth';
import { Profile } from '@/types/database';

// This component provides the candidate profile screen with editing and logout capabilities.
export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, refreshProfile } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: '',
      target_role: '',
      location: '',
      skills: '',
      experience_level: '',
      education_summary: '',
      experience_summary: '',
    },
  });

  const currentRole = useWatch({ control, name: 'target_role' });
  const currentSkills = useWatch({ control, name: 'skills' });

  // This function fetches profile details from the database for the active user.
  const fetchProfileDetails = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        setLoadError('Impossible de charger les données du profil.');
        return;
      }

      if (!data) {
        const { data: createdRecord } = await supabase
          .from('profiles')
          .upsert({ id: user.id })
          .select('*')
          .maybeSingle();

        if (createdRecord) {
          const profileRecord = createdRecord as Profile;
          reset({
            display_name: profileRecord.display_name || '',
            target_role: profileRecord.target_role || '',
            location: profileRecord.location || '',
            skills: (profileRecord.skills || []).join(', '),
            experience_level: profileRecord.experience_level || '',
            education_summary: profileRecord.education_summary || '',
            experience_summary: profileRecord.experience_summary || '',
          });
        }
      } else {
        const profileRecord = data as Profile;
        reset({
          display_name: profileRecord.display_name || '',
          target_role: profileRecord.target_role || '',
          location: profileRecord.location || '',
          skills: (profileRecord.skills || []).join(', '),
          experience_level: profileRecord.experience_level || '',
          education_summary: profileRecord.education_summary || '',
          experience_summary: profileRecord.experience_summary || '',
        });
      }
    } catch (err) {
      console.error('Error fetching profile', err);
      setLoadError('Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  }, [user, reset]);

  // This effect loads profile data when the screen mounts.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfileDetails();
  }, [fetchProfileDetails]);

  // This function persists candidate profile updates to the database.
  const onSubmit = async (values: ProfileFormData) => {
    if (!user?.id) {
      return;
    }
    try {
      setSaveSuccess(false);
      setSaveError(null);

      const parsedSkills = values.skills
        .split(',')
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0);

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: values.display_name,
          target_role: values.target_role,
          location: values.location,
          skills: parsedSkills,
          experience_level: values.experience_level,
          education_summary: values.education_summary || null,
          experience_summary: values.experience_summary || null,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        setSaveError('Impossible d’enregistrer le profil. Veuillez réessayer.');
        return;
      }

      setSaveSuccess(true);
      await refreshProfile();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error('Profile update failed', err);
      setSaveError('Une erreur inattendue est survenue lors de l’enregistrement.');
    }
  };

  // This function signs out the candidate and navigates to the login screen.
  const handleLogout = async () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoggingOut(true);
              await signOut();
              router.replace('/(auth)/login');
            } catch (err) {
              console.error('Logout error', err);
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const isIncomplete = !currentRole || !currentSkills;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Chargement de votre profil...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorTitle}>Erreur de chargement</Text>
            <Text style={styles.errorDescription}>{loadError}</Text>
            <Pressable style={styles.retryButton} onPress={fetchProfileDetails}>
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {isIncomplete && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningTitle}>Profil incomplet</Text>
                <Text style={styles.warningText}>
                  Remplissez au minimum votre titre recherché et vos compétences pour débloquer les
                  recommandations personnalisées d’offres d’emploi.
                </Text>
              </View>
            )}

            {saveSuccess && (
              <View style={styles.successBanner}>
                <Text style={styles.successBannerText}>Profil mis à jour avec succès.</Text>
              </View>
            )}

            {saveError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{saveError}</Text>
              </View>
            )}

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Informations principales</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Nom affiché</Text>
                <Controller
                  control={control}
                  name="display_name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.display_name && styles.inputError]}
                      placeholder="ex. Jean Dupont"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.display_name && (
                  <Text style={styles.fieldError}>{errors.display_name.message}</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Titre recherché</Text>
                <Controller
                  control={control}
                  name="target_role"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.target_role && styles.inputError]}
                      placeholder="ex. Développeur React Native Senior"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.target_role && (
                  <Text style={styles.fieldError}>{errors.target_role.message}</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Localisation</Text>
                <Controller
                  control={control}
                  name="location"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.location && styles.inputError]}
                      placeholder="ex. Paris, France (Télétravail accepté)"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.location && (
                  <Text style={styles.fieldError}>{errors.location.message}</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Niveau d’expérience</Text>
                <Controller
                  control={control}
                  name="experience_level"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.experience_level && styles.inputError]}
                      placeholder="ex. Débutant, Intermédiaire, Senior, Expert"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.experience_level && (
                  <Text style={styles.fieldError}>{errors.experience_level.message}</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Compétences (séparées par des virgules)</Text>
                <Controller
                  control={control}
                  name="skills"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.skills && styles.inputError]}
                      placeholder="ex. TypeScript, React Native, Supabase, Node.js"
                      placeholderTextColor="#94A3B8"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.skills && <Text style={styles.fieldError}>{errors.skills.message}</Text>}
              </View>

              <Text style={styles.sectionTitle}>Parcours et expérience</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Formation</Text>
                <Controller
                  control={control}
                  name="education_summary"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.textArea, errors.education_summary && styles.inputError]}
                      placeholder="Diplômes, certifications ou formations suivies..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value || ''}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.education_summary && (
                  <Text style={styles.fieldError}>{errors.education_summary.message}</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Expérience professionnelle</Text>
                <Controller
                  control={control}
                  name="experience_summary"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.textArea, errors.experience_summary && styles.inputError]}
                      placeholder="Résumé de vos postes précédents et réalisations marquantes..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value || ''}
                      editable={!isSubmitting}
                    />
                  )}
                />
                {errors.experience_summary && (
                  <Text style={styles.fieldError}>{errors.experience_summary.message}</Text>
                )}
              </View>

              <Pressable
                style={[styles.saveButton, isSubmitting && styles.buttonDisabled]}
                onPress={() => handleSubmit(onSubmit)()}
                disabled={isSubmitting}>
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Enregistrer mon profil</Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        <View style={styles.accountCard}>
          <Text style={styles.accountTitle}>Compte connecté</Text>
          <Text style={styles.accountEmail}>{user?.email || 'Non renseigné'}</Text>

          <Pressable
            style={[styles.logoutButton, isLoggingOut && styles.buttonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}>
            {isLoggingOut ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <Text style={styles.logoutButtonText}>Se déconnecter</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// This stylesheet defines display parameters for the profile editor interface.
const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  stateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#DC2626',
    marginBottom: 8,
  },
  errorDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  warningBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  warningTitle: {
    color: '#92400E',
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  warningText: {
    color: '#B45309',
    fontSize: 13,
    lineHeight: 18,
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#065F46',
    fontSize: 14,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
    marginBottom: 16,
    marginTop: 8,
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
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  accountTitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 16,
  },
  logoutButton: {
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
  },
});
