import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
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
import { useApplication, useApplicationMutations } from '@/hooks/useApplications';
import { useCandidateCv, useCvMutations } from '@/hooks/useCv';
import { ApplicationStatus } from '@/types/database';

const STATUS_OPTIONS: { label: string; value: ApplicationStatus; color: string; bg: string }[] = [
  { label: 'Enregistrée', value: 'Saved', color: '#475569', bg: '#F1F5F9' },
  { label: 'Postulé', value: 'Applied', color: '#2563EB', bg: '#EFF6FF' },
  { label: 'Entretien', value: 'Interview', color: '#D97706', bg: '#FEF3C7' },
  { label: 'Offre', value: 'Offer', color: '#059669', bg: '#ECFDF5' },
  { label: 'Refusée', value: 'Rejected', color: '#DC2626', bg: '#FEF2F2' },
];

// This screen presents complete application details, dual-role status updates and recruiter consultation tracking.
export default function ApplicationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const { data: application, isLoading, isError, error, refetch } = useApplication(id);
  const {
    updateStatus,
    updateNotes,
    deleteApplication,
    markViewed,
    isUpdatingStatus,
    isUpdatingNotes,
    isDeleting,
  } = useApplicationMutations();

  const isOfferPoster = Boolean(
    user?.id && application?.offer?.user_id && application.offer.user_id === user.id
  );
  const isApplicant = Boolean(user?.id && application?.user_id && application.user_id === user.id);

  const { data: candidateCv, isLoading: isCandidateCvLoading } = useCandidateCv(
    isOfferPoster ? application?.user_id : undefined
  );
  const { getSignedCvUrl } = useCvMutations();
  const [isOpeningCandidateCv, setIsOpeningCandidateCv] = useState<boolean>(false);

  const [notes, setNotes] = useState<string>('');
  const [notesSavedNotice, setNotesSavedNotice] = useState<boolean>(false);
  const markedViewedRef = useRef<boolean>(false);

  // This effect automatically records recruiter consultation when the offer poster opens the application.
  useEffect(() => {
    if (
      isOfferPoster &&
      application?.id &&
      !application.viewed_by_recruiter_at &&
      !markedViewedRef.current
    ) {
      markedViewedRef.current = true;
      markViewed({ applicationId: application.id }).catch((err) => {
        console.error('Failed to mark application as viewed', err);
      });
    }
  }, [isOfferPoster, application?.id, application?.viewed_by_recruiter_at, markViewed]);

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

  // This function saves notes for this application.
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
          <View style={styles.headerTop}>
            <Text style={styles.companyName}>{application.offer?.company || 'Entreprise'}</Text>
            {isOfferPoster ? (
              <View style={styles.roleBadgePoster}>
                <Text style={styles.roleBadgePosterText}>Candidature reçue</Text>
              </View>
            ) : (
              <View style={styles.roleBadgeCandidate}>
                <Text style={styles.roleBadgeCandidateText}>Votre candidature</Text>
              </View>
            )}
          </View>

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

        {isApplicant && (
          <View
            style={[
              styles.recruiterStatusCard,
              application.viewed_by_recruiter_at
                ? styles.recruiterStatusCardViewed
                : styles.recruiterStatusCardPending,
            ]}>
            <Ionicons
              name={application.viewed_by_recruiter_at ? 'eye-outline' : 'time-outline'}
              size={20}
              color={application.viewed_by_recruiter_at ? '#059669' : '#D97706'}
              style={styles.recruiterStatusIcon}
            />
            <View style={styles.recruiterStatusTextContainer}>
              <Text
                style={[
                  styles.recruiterStatusTitle,
                  { color: application.viewed_by_recruiter_at ? '#065F46' : '#92400E' },
                ]}>
                {application.viewed_by_recruiter_at
                  ? 'Candidature consultée par le recruteur'
                  : 'En attente de consultation par le recruteur'}
              </Text>
              {application.viewed_by_recruiter_at ? (
                <Text style={styles.recruiterStatusDate}>
                  Consultée le{' '}
                  {new Date(application.viewed_by_recruiter_at).toLocaleString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              ) : (
                <Text style={styles.recruiterStatusSubtitle}>
                  Le recruteur n’a pas encore ouvert votre dossier de candidature.
                </Text>
              )}
            </View>
          </View>
        )}

        {isOfferPoster && application.viewed_by_recruiter_at && (
          <View style={styles.posterConsultedBanner}>
            <Ionicons name="eye-outline" size={14} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.posterConsultedText}>
              Consultée par vous le{' '}
              {new Date(application.viewed_by_recruiter_at).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        )}

        {isOfferPoster && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Profil du candidat</Text>
            <View style={styles.applicantProfileBox}>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Nom affiché :</Text>
                <Text style={styles.profileValue}>
                  {application.applicant?.display_name || 'Non renseigné'}
                </Text>
              </View>

              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Titre recherché :</Text>
                <Text style={styles.profileValue}>
                  {application.applicant?.target_role || 'Non renseigné'}
                </Text>
              </View>

              {application.applicant?.experience_level && (
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Expérience :</Text>
                  <Text style={styles.profileValue}>
                    {application.applicant.experience_level}
                  </Text>
                </View>
              )}

              <View style={styles.profileSkillsBlock}>
                <Text style={styles.profileLabel}>Compétences :</Text>
                {application.applicant?.skills && application.applicant.skills.length > 0 ? (
                  <View style={styles.skillsGrid}>
                    {application.applicant.skills.map((skill, sIdx) => (
                      <View key={sIdx} style={styles.skillPill}>
                        <Text style={styles.skillPillText}>{skill}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptySkillsText}>Aucune compétence renseignée.</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {isOfferPoster && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Curriculum Vitae du candidat</Text>
            {isCandidateCvLoading ? (
              <ActivityIndicator color="#2563EB" style={{ marginVertical: 12 }} />
            ) : candidateCv ? (
              <View style={styles.candidateCvCard}>
                <View style={styles.candidateCvLeft}>
                  <Ionicons name="document-text" size={28} color="#2563EB" />
                  <View style={styles.candidateCvInfo}>
                    <Text style={styles.candidateCvName} numberOfLines={1}>
                      {candidateCv.file_name}
                    </Text>
                    <Text style={styles.candidateCvSize}>
                      {Math.round(candidateCv.file_size_bytes / 1024)} Ko • Format PDF
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[styles.viewCvButton, isOpeningCandidateCv && styles.buttonDisabled]}
                  disabled={isOpeningCandidateCv}
                  onPress={async () => {
                    try {
                      setIsOpeningCandidateCv(true);
                      const signedUrl = await getSignedCvUrl(candidateCv.file_path);
                      await WebBrowser.openBrowserAsync(signedUrl);
                    } catch (err) {
                      console.error('Failed to open candidate cv', err);
                      Alert.alert('Erreur', 'Impossible d’ouvrir le CV du candidat.');
                    } finally {
                      setIsOpeningCandidateCv(false);
                    }
                  }}>
                  {isOpeningCandidateCv ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="eye-outline"
                        size={15}
                        color="#FFFFFF"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.viewCvButtonText}>Consulter le CV du candidat</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.noCvNotice}>
                <Ionicons
                  name="document-outline"
                  size={18}
                  color="#94A3B8"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.noCvText}>Le candidat n’a pas encore importé de CV</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Statut actuel</Text>
          <Text style={styles.sectionSubtitle}>
            {isOfferPoster
              ? 'Faites évoluer le statut du candidat dans votre processus de recrutement :'
              : 'Touchez un statut pour mettre à jour l’avancement :'}
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
          <Text style={styles.sectionTitle}>
            {isOfferPoster ? 'Notes du recruteur' : 'Notes et mémo'}
          </Text>
          {notesSavedNotice && (
            <View style={styles.notesNotice}>
              <Text style={styles.notesNoticeText}>Notes enregistrées avec succès.</Text>
            </View>
          )}

          <TextInput
            style={styles.notesInput}
            placeholder={
              isOfferPoster
                ? 'Notes sur le candidat, debriefing d’entretien, évaluation...'
                : 'Ex. Contact rencontré, questions préparées, relance...'
            }
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

        {isApplicant && (
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
        )}
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
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  companyName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  roleBadgePoster: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgePosterText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '600',
  },
  roleBadgeCandidate: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeCandidateText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  viewOfferButtonText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
  recruiterStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  recruiterStatusCardViewed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  recruiterStatusCardPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  recruiterStatusIcon: {
    marginRight: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  recruiterStatusTextContainer: {
    flex: 1,
  },
  recruiterStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  recruiterStatusDate: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '500',
  },
  recruiterStatusSubtitle: {
    fontSize: 12,
    color: '#B45309',
  },
  posterConsultedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  posterConsultedText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
  },
  applicantProfileBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    marginTop: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    minWidth: 110,
  },
  profileValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  profileSkillsBlock: {
    marginTop: 4,
  },
  skillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  skillPill: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  skillPillText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '500',
  },
  emptySkillsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
    alignSelf: 'flex-start',
  },
  timelineList: {
    marginTop: 6,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 52,
  },
  timelineMarker: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#CBD5E1',
    marginTop: 2,
    marginBottom: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 14,
  },
  timelineStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  timelineDateText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: '#64748B',
  },
  notesNotice: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  notesNoticeText: {
    color: '#059669',
    fontSize: 13,
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    color: '#0F172A',
    fontSize: 14,
    marginBottom: 12,
  },
  saveNotesButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
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
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  candidateCvCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    marginTop: 6,
  },
  candidateCvLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  candidateCvInfo: {
    flex: 1,
  },
  candidateCvName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  candidateCvSize: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  viewCvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
  },
  viewCvButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  noCvNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
  },
  noCvText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
  },
});
