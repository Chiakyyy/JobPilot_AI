import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useApplicationByOffer, useApplicationMutations } from '@/hooks/useApplications';
import { useOffer, useOfferMutations } from '@/hooks/useOffers';

// This screen displays complete details and actions for a specific job offer.
export default function OfferDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: offer, isLoading, isError, error, refetch } = useOffer(id);
  const { data: existingApp, isLoading: isAppLoading } = useApplicationByOffer(id);
  const { deleteOffer, isDeleting } = useOfferMutations();
  const { createApplication, isCreating } = useApplicationMutations();

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
      Alert.alert('Erreur', 'Impossible de créer la candidature.');
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

  if (isLoading || isAppLoading) {
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.companyName}>{offer.company}</Text>
        <Text style={styles.jobTitle}>{offer.title}</Text>
        {offer.location && <Text style={styles.locationText}>📍 {offer.location}</Text>}
        <Text style={styles.dateText}>Ajoutée le {formattedDate}</Text>

        {offer.url && (
          <Pressable style={styles.linkButton} onPress={() => handleOpenUrl(offer.url!)}>
            <Text style={styles.linkButtonText}>Ouvrir l’annonce en ligne ↗</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Candidature</Text>
        <Pressable
          style={[styles.primaryButton, isCreating && styles.buttonDisabled]}
          disabled={isCreating}
          onPress={handleApplicationAction}>
          {isCreating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {existingApp?.id ? 'Voir la candidature' : 'Créer une candidature'}
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Assistance intelligente</Text>
        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>Analyser CV et offre</Text>
          <Text style={styles.featureDesc}>
            Évaluez l’adéquation de votre profil et identifiez les mots-clés manquants.
          </Text>
          <Pressable style={styles.disabledButton} disabled>
            <Text style={styles.disabledButtonText}>Bientôt disponible — Étape 4/5</Text>
          </Pressable>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureTitle}>Préparer l’entretien</Text>
          <Text style={styles.featureDesc}>
            Générez des questions types et des suggestions de réponses ciblées.
          </Text>
          <Pressable style={styles.disabledButton} disabled>
            <Text style={styles.disabledButtonText}>Bientôt disponible — Étape 4/5</Text>
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
          <Text style={styles.sectionTitle}>Notes personnelles</Text>
          <Text style={styles.bodyText}>{offer.notes}</Text>
        </View>
      )}

      <View style={styles.dangerCard}>
        <Pressable
          style={[styles.deleteButton, isDeleting && styles.buttonDisabled]}
          disabled={isDeleting}
          onPress={handleDelete}>
          {isDeleting ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <Text style={styles.deleteButtonText}>Supprimer cette offre</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
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
    marginBottom: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
  },
  linkButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  linkButtonText: {
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
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
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
  bodyText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
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
