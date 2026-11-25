import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { useApplication, useApplicationMutations } from '@/hooks/useApplications';
import { ApplicationStatus } from '@/types/database';

const STATUS_OPTIONS: { label: string; value: ApplicationStatus; color: string; bg: string }[] = [
  { label: 'Enregistrée', value: 'Saved', color: '#475569', bg: '#F1F5F9' },
  { label: 'Postulé', value: 'Applied', color: '#2563EB', bg: '#EFF6FF' },
  { label: 'Entretien', value: 'Interview', color: '#D97706', bg: '#FEF3C7' },
  { label: 'Offre', value: 'Offer', color: '#059669', bg: '#ECFDF5' },
  { label: 'Refusée', value: 'Rejected', color: '#DC2626', bg: '#FEF2F2' },
];

// This screen presents complete application details, status updates, notes and timeline history.
export default function ApplicationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: application, isLoading, isError, error, refetch } = useApplication(id);
  const {
    updateStatus,
    updateNotes,
    deleteApplication,
    isUpdatingStatus,
    isUpdatingNotes,
    isDeleting,
  } = useApplicationMutations();

  const [notes, setNotes] = useState<string>('');
  const [notesSavedNotice, setNotesSavedNotice] = useState<boolean>(false);

  // This effect syncs local notes state with the loaded application record.
  useEffect(() => {
    if (application?.notes !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotes(application.notes || '');
    }
  }, [application?.notes]);

  // This function prompts for confirmation before permanently deleting the application.
  const handleDelete = () => {
    if (!id) {
      return;
    }
    Alert.alert(
      'Supprimer la candidature',
      'Êtes-vous sûr de vouloir supprimer cette candidature ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteApplication({ id, offerId: application?.offer_id });
              router.replace('/(tabs)/applications');
            } catch (err) {
              console.error('Delete application failed', err);
              Alert.alert('Erreur', 'Impossible de supprimer la candidature.');
            }
          },
        },
      ]
    );
  };

  // This function transitions the application status to the selected state.
  const handleStatusChange = async (newStatus: ApplicationStatus) => {
    if (!id || application?.status === newStatus || isUpdatingStatus) {
      return;
    }
    try {
      await updateStatus({ id, newStatus });
    } catch (err) {
      console.error('Status transition failed', err);
      Alert.alert('Erreur', 'Impossible de modifier le statut.');
    }
  };

  // This function saves candidate notes for this application.
  const handleSaveNotes = async () => {
    if (!id || isUpdatingNotes) {
      return;
    }
    try {
      await updateNotes({ id, notes });
      setNotesSavedNotice(true);
      setTimeout(() => setNotesSavedNotice(false), 3000);
    } catch (err) {
      console.error('Failed to update notes', err);
      Alert.alert('Erreur', 'Impossible d’enregistrer les notes.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>Chargement des détails de la candidature...</Text>
      </View>
    );
  }

  if (isError || !application) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorTitle}>Candidature introuvable</Text>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Cette candidature n’existe pas ou a été supprimée.'}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  const history = application.status_history || [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <Text style={styles.companyName}>{application.offer?.company || 'Entreprise'}</Text>
          <Text style={styles.jobTitle}>{application.offer?.title || 'Poste'}</Text>
          {application.offer?.location && (
            <Text style={styles.locationText}>📍 {application.offer.location}</Text>
          )}

          <Pressable
            style={styles.viewOfferButton}
            onPress={() => router.push(`/offers/${application.offer_id}` as never)}>
            <Text style={styles.viewOfferButtonText}>Consulter la fiche offre ↗</Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Statut actuel</Text>
          <Text style={styles.sectionSubtitle}>
            Touchez un statut pour mettre à jour l’avancement :
          </Text>

          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((opt) => {
              const isActive = application.status === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.statusPill,
                    { backgroundColor: opt.bg, borderColor: isActive ? opt.color : '#E2E8F0' },
                    isActive && styles.statusPillActive,
                    isUpdatingStatus && styles.buttonDisabled,
                  ]}
                  disabled={isUpdatingStatus}
                  onPress={() => handleStatusChange(opt.value)}>
                  <Text style={[styles.statusPillText, { color: opt.color }]}>
                    {isActive ? `✓ ${opt.label}` : opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {isUpdatingStatus && (
            <ActivityIndicator style={styles.statusSpinner} size="small" color="#2563EB" />
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Historique des étapes</Text>
          {history.length === 0 ? (
            <Text style={styles.emptyHistoryText}>Aucun changement de statut enregistré.</Text>
          ) : (
            <View style={styles.timelineList}>
              {history.map((item, index) => {
                const opt = STATUS_OPTIONS.find((s) => s.value === item.status);
                const dateLabel = new Date(item.changed_at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <View key={`${item.status}-${index}`} style={styles.timelineItem}>
                    <View style={styles.timelineMarker}>
                      <View style={[styles.timelineDot, { backgroundColor: opt?.color || '#2563EB' }]} />
                      {index < history.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[styles.timelineStatusTitle, { color: opt?.color || '#0F172A' }]}>
                        {opt?.label || item.status}
                      </Text>
                      <Text style={styles.timelineDateText}>{dateLabel}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Notes et mémo</Text>
          {notesSavedNotice && (
            <View style={styles.notesNotice}>
              <Text style={styles.notesNoticeText}>Notes enregistrées avec succès.</Text>
            </View>
          )}

          <TextInput
            style={styles.notesInput}
            placeholder="Ex. Contact RH rencontré, salaire discuté, relance prévue..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            editable={!isUpdatingNotes}
          />

          <Pressable
            style={[styles.saveNotesButton, isUpdatingNotes && styles.buttonDisabled]}
            disabled={isUpdatingNotes}
            onPress={handleSaveNotes}>
            {isUpdatingNotes ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveNotesButtonText}>Enregistrer les notes</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.dangerCard}>
          <Pressable
            style={[styles.deleteButton, isDeleting && styles.buttonDisabled]}
            disabled={isDeleting}
            onPress={handleDelete}>
            {isDeleting ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <Text style={styles.deleteButtonText}>Supprimer cette candidature</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// This stylesheet defines display parameters for the application detail view.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F8FAFC',
  },
  stateText: {
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
  errorText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  headerCard: {
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
  companyName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  locationText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 12,
  },
  viewOfferButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  viewOfferButtonText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  statusPillActive: {
    borderWidth: 2,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusSpinner: {
    marginTop: 10,
  },
  emptyHistoryText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  timelineList: {
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineMarker: {
    alignItems: 'center',
    width: 24,
    marginRight: 10,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  timelineDateText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  notesNotice: {
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  notesNoticeText: {
    color: '#065F46',
    fontSize: 13,
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 90,
    marginBottom: 12,
  },
  saveNotesButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveNotesButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    alignItems: 'center',
  },
  deleteButton: {
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
