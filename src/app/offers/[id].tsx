import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import {
  useApplicationByOffer,
  useApplicationMutations,
  useOfferApplicants,
} from '@/hooks/useApplications';
import { useOffer, useOfferMutations } from '@/hooks/useOffers';
import { ApplicationStatus } from '@/types/database';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; bg: string; text: string }> = {
  Saved: { label: 'Enregistrée', bg: '#F1F5F9', text: '#475569' },
  Applied: { label: 'Postulé', bg: '#EFF6FF', text: '#2563EB' },
  Interview: { label: 'Entretien', bg: '#FEF3C7', text: '#D97706' },
  Offer: { label: 'Offre', bg: '#ECFDF5', text: '#059669' },
  Rejected: { label: 'Refusée', bg: '#FEF2F2', text: '#DC2626' },
};

// This screen displays complete details, creator actions and received applicants for a job offer.
export default function OfferDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const { data: offer, isLoading, isError, error, refetch } = useOffer(id);
  const isOwner = Boolean(user?.id && offer?.user_id === user.id);

  const { data: existingApp, isLoading: isAppLoading } = useApplicationByOffer(
    !isOwner ? id : undefined
  );
  const { data: applicants, isLoading: isApplicantsLoading } = useOfferApplicants(
    isOwner ? id : undefined
  );

  const { deleteOffer, updateOffer, isDeleting, isUpdating } = useOfferMutations();
  const { createApplication, isCreating } = useApplicationMutations();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editCompany, setEditCompany] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editUrl, setEditUrl] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  // This function initializes form fields and opens the edit modal dialog.
  const handleStartEdit = () => {
    if (!offer) {
      return;
    }
    setEditTitle(offer.title);
    setEditCompany(offer.company);
    setEditLocation(offer.location || '');
    setEditUrl(offer.url || '');
    setEditDescription(offer.description || '');
    setEditNotes(offer.notes || '');
    setIsEditing(true);
  };

  // This function persists edited offer properties to the database.
  const handleSaveEdit = async () => {
    if (!id || !editTitle.trim() || !editCompany.trim()) {
      Alert.alert('Champs requis', 'Veuillez renseigner au minimum le titre et l’entreprise.');
      return;
    }
    try {
      await updateOffer({
        id,
        input: {
          title: editTitle.trim(),
          company: editCompany.trim(),
          location: editLocation.trim() || null,
          url: editUrl.trim() || null,
          description: editDescription.trim() || null,
          notes: editNotes.trim() || null,
        },
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update offer', err);
      Alert.alert('Erreur', 'Impossible de modifier l’offre.');
    }
  };

  // This function prompts for confirmation before deleting a job offer record.
  const handleDelete = () => {
    if (!id) {
      return;
    }
    Alert.alert(
      'Supprimer l’offre',
      'Êtes-vous sûr de vouloir supprimer cette offre ? Les candidatures liées seront également supprimées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOffer(id);
              router.replace('/(tabs)/offers');
            } catch (err) {
              console.error('Delete offer failed', err);
              Alert.alert('Erreur', 'Impossible de supprimer l’offre.');
            }
          },
        },
      ]
    );
  };

  // This function creates a new application or navigates to an existing application.
  const handleApplicationAction = async () => {
    if (!id) {
      return;
    }
    if (existingApp?.id) {
      router.push(`/applications/${existingApp.id}` as never);
      return;
    }

    try {
      const created = await createApplication({
        offer_id: id,
        status: 'Applied',
      });
      router.push(`/applications/${created.id}` as never);
    } catch (err) {
      console.error('Failed to create application from offer', err);
      Alert.alert('Erreur', 'Impossible de postuler à cette offre.');
    }
  };

  // This function opens the external offer url in a web browser view.
  const handleOpenUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.error('Failed to open url', err);
    }
  };

  if (isLoading || (!isOwner && isAppLoading)) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>Chargement des détails de l’offre...</Text>
      </View>
    );
  }

  if (isError || !offer) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorTitle}>Offre introuvable</Text>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Cette offre n’existe pas ou a été supprimée.'}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  const formattedDate = new Date(offer.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.companyName}>{offer.company}</Text>
            {isOwner ? (
              <View style={styles.mineBadge}>
                <Text style={styles.mineBadgeText}>Votre publication</Text>
              </View>
            ) : (
              <View style={styles.otherBadge}>
                <Text style={styles.otherBadgeText}>
                  Publiée par {offer.poster?.display_name || 'un recruteur'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.jobTitle}>{offer.title}</Text>
          {offer.location && <Text style={styles.locationText}>📍 {offer.location}</Text>}
          <Text style={styles.dateText}>Ajoutée le {formattedDate}</Text>

          {offer.url && (
            <Pressable style={styles.linkButton} onPress={() => handleOpenUrl(offer.url!)}>
              <Text style={styles.linkButtonText}>Ouvrir l’annonce en ligne ↗</Text>
            </Pressable>
          )}

          {isOwner && (
            <View style={styles.ownerActionsRow}>
              <Pressable style={styles.editButton} onPress={handleStartEdit}>
                <Text style={styles.editButtonText}>Modifier l’offre</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteButtonSmall, isDeleting && styles.buttonDisabled]}
                disabled={isDeleting}
                onPress={handleDelete}>
                <Text style={styles.deleteButtonSmallText}>Supprimer</Text>
              </Pressable>
            </View>
          )}
        </View>

        {isOwner ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Candidatures reçues</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{applicants?.length || 0}</Text>
              </View>
            </View>

            {isApplicantsLoading ? (
              <ActivityIndicator color="#2563EB" style={{ marginVertical: 12 }} />
            ) : !applicants || applicants.length === 0 ? (
              <View style={styles.emptyApplicantsBox}>
                <Text style={styles.emptyApplicantsText}>
                  Aucune candidature reçue pour le moment.
                </Text>
              </View>
            ) : (
              <View style={styles.applicantsList}>
                {applicants.map((app) => {
                  const cfg = STATUS_CONFIG[app.status] || {
                    label: app.status,
                    bg: '#EFF6FF',
                    text: '#2563EB',
                  };
                  return (
                    <Pressable
                      key={app.id}
                      style={styles.applicantItem}
                      onPress={() => router.push(`/applications/${app.id}` as never)}>
                      <View style={styles.applicantHeader}>
                        <Text style={styles.applicantName}>
                          {app.applicant?.display_name || 'Candidat'}
                        </Text>
                        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.statusPillText, { color: cfg.text }]}>
                            {cfg.label}
                          </Text>
                        </View>
                      </View>

                      {app.applicant?.target_role && (
                        <Text style={styles.applicantRole}>{app.applicant.target_role}</Text>
                      )}
                      {app.applicant?.experience_level && (
                        <Text style={styles.applicantExp}>
                          Expérience : {app.applicant.experience_level}
                        </Text>
                      )}

                      {app.applicant?.skills && app.applicant.skills.length > 0 && (
                        <View style={styles.skillsRow}>
                          {app.applicant.skills.slice(0, 4).map((skill, sIdx) => (
                            <View key={sIdx} style={styles.skillChip}>
                              <Text style={styles.skillChipText}>{skill}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      <Text style={styles.applicantAppliedDate}>
                        Postulé le {new Date(app.applied_at).toLocaleDateString('fr-FR')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Votre candidature</Text>
            <Pressable
              style={[styles.primaryButton, isCreating && styles.buttonDisabled]}
              disabled={isCreating}
              onPress={handleApplicationAction}>
              {isCreating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {existingApp?.id ? 'Voir ma candidature' : 'Postuler à cette offre'}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Assistance intelligente</Text>
          <View style={styles.featureItem}>
            <Text style={styles.featureTitle}>Analyser CV et offre</Text>
            <Text style={styles.featureDesc}>
              Évaluez l’adéquation du profil et identifiez les compétences recherchées.
            </Text>
            <Pressable
              style={styles.aiActionButton}
              onPress={() => router.push({ pathname: '/ai/analysis', params: { offerId: offer.id } } as never)}>
              <Text style={styles.aiActionButtonText}>Lancer l’analyse IA ➔</Text>
            </Pressable>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureTitle}>Préparer l’entretien</Text>
            <Text style={styles.featureDesc}>
              Générez des questions types et des suggestions de réponses ciblées.
            </Text>
            <Pressable
              style={styles.aiActionButton}
              onPress={() => router.push({ pathname: '/ai/interview', params: { offerId: offer.id } } as never)}>
              <Text style={styles.aiActionButtonText}>Préparer mon entretien ➔</Text>
            </Pressable>
          </View>
        </View>

        {offer.description && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Description du poste</Text>
            <Text style={styles.bodyText}>{offer.description}</Text>
          </View>
        )}

        {offer.notes && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.bodyText}>{offer.notes}</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={isEditing} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modifier l’offre</Text>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Titre du poste *</Text>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Ex. Développeur React Native"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.inputLabel}>Entreprise *</Text>
              <TextInput
                style={styles.input}
                value={editCompany}
                onChangeText={setEditCompany}
                placeholder="Ex. TechCorp"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.inputLabel}>Localisation</Text>
              <TextInput
                style={styles.input}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Ex. Paris, Télétravail"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.inputLabel}>Lien de l’annonce (URL)</Text>
              <TextInput
                style={styles.input}
                value={editUrl}
                onChangeText={setEditUrl}
                placeholder="https://..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Description du poste..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Remarques et informations complémentaires..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={2}
              />
            </ScrollView>

            <View style={styles.modalButtonsRow}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setIsEditing(false)}
                disabled={isUpdating}>
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveButton, isUpdating && styles.buttonDisabled]}
                onPress={handleSaveEdit}
                disabled={isUpdating}>
                {isUpdating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveButtonText}>Enregistrer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// This stylesheet defines display parameters for the job offer detail screen.
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
  mineBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mineBadgeText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '600',
  },
  otherBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  otherBadgeText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '500',
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
    marginBottom: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  linkButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  linkButtonText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
  ownerActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteButtonSmall: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  deleteButtonSmallText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyApplicantsBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyApplicantsText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  applicantsList: {
    gap: 12,
  },
  applicantItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  applicantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  applicantName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  applicantRole: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '500',
    marginBottom: 2,
  },
  applicantExp: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  skillChip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  skillChipText: {
    fontSize: 10,
    color: '#2563EB',
    fontWeight: '500',
  },
  applicantAppliedDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  featureItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  disabledButtonText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  aiActionButton: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiActionButtonText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
  bodyText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  modalScroll: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 40,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
