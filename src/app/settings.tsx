import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { useCvMutations, useUserCv } from '@/hooks/useCv';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

// This screen provides privacy documentation, cv deletion and complete account erasure controls.
export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: userCv, isLoading: isCvLoading } = useUserCv();
  const { deleteCv, isDeleting: isDeletingCv } = useCvMutations();

  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState<boolean>(false);
  const [confirmationInput, setConfirmationInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // This function prompts for confirmation and removes the candidate cv document.
  const handleConfirmDeleteCv = () => {
    Alert.alert(
      'Supprimer mon CV',
      'Êtes-vous sûr de vouloir supprimer définitivement votre CV ? Les recruteurs ne pourront plus le consulter.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (!userCv) {
              return;
            }
            try {
              setErrorMessage(null);
              await deleteCv({ id: userCv.id, filePath: userCv.file_path });
              Alert.alert('Succès', 'Votre CV a été supprimé.');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Échec de la suppression du CV.';
              setErrorMessage(message);
            }
          },
        },
      ]
    );
  };

  // This function executes server side account and storage deletion followed by local session cleanup.
  const handleExecuteAccountDeletion = async () => {
    if (confirmationInput.trim().toUpperCase() !== 'SUPPRIMER') {
      return;
    }

    try {
      setIsDeletingAccount(true);
      setErrorMessage(null);

      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {},
      });

      if (error) {
        throw new Error(error.message || 'Impossible de joindre le serveur pour supprimer votre compte.');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setDeleteModalVisible(false);

      // Clear local authentication state and tanstack query cache.
      await supabase.auth.signOut({ scope: 'local' });
      queryClient.clear();
      router.replace('/(auth)/login');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de la suppression du compte.';
      setErrorMessage(message);
      setIsDeletingAccount(false);
    }
  };

  const isConfirmed = confirmationInput.trim().toUpperCase() === 'SUPPRIMER';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>Paramètres et confidentialité</Text>
        <Text style={styles.headerSubtitle}>
          {user?.email ? `Compte connecté : ${user.email} • ` : ''}Contrôlez vos données personnelles et consultez nos engagements de transparence.
        </Text>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconBoxTeal}>
            <Ionicons name="shield-checkmark" size={22} color="#0D9488" />
          </View>
          <View style={styles.cardHeaderTexts}>
            <Text style={styles.cardTitle}>Protection de vos données</Text>
            <Text style={styles.cardSubtitle}>Conformité et respect de votre vie privée</Text>
          </View>
        </View>

        <View style={styles.guaranteeList}>
          <View style={styles.guaranteeItem}>
            <Ionicons name="lock-closed-outline" size={18} color="#2563EB" style={styles.guaranteeIcon} />
            <View style={styles.guaranteeContent}>
              <Text style={styles.guaranteeTitle}>Cloisonnement strict par base de données</Text>
              <Text style={styles.guaranteeDescription}>
                Chaque profil, candidature et offre est isolé au niveau des lignes de la base postgresql.
              </Text>
            </View>
          </View>

          <View style={styles.guaranteeItem}>
            <Ionicons name="document-text-outline" size={18} color="#2563EB" style={styles.guaranteeIcon} />
            <View style={styles.guaranteeContent}>
              <Text style={styles.guaranteeTitle}>Stockage sécurisé et temporaire du CV</Text>
              <Text style={styles.guaranteeDescription}>
                Votre document pdf est conservé dans un espace privé accessible uniquement via des liens signés éphémères de 5 minutes.
              </Text>
            </View>
          </View>

          <View style={styles.guaranteeItem}>
            <Ionicons name="sparkles-outline" size={18} color="#2563EB" style={styles.guaranteeIcon} />
            <View style={styles.guaranteeContent}>
              <Text style={styles.guaranteeTitle}>Traitement par intelligence artificielle éphémère</Text>
              <Text style={styles.guaranteeDescription}>
                L’analyse de CV et la préparation d’entretien s’exécutent en mémoire. Aucun texte brut de CV n’est conservé dans les journaux de télémétrie.
              </Text>
            </View>
          </View>

          <View style={styles.guaranteeItem}>
            <Ionicons name="heart-outline" size={18} color="#2563EB" style={styles.guaranteeIcon} />
            <View style={styles.guaranteeContent}>
              <Text style={styles.guaranteeTitle}>Zéro revente de données</Text>
              <Text style={styles.guaranteeDescription}>
                Vos informations ne sont ni revendues à des courtiers de données ni transmises à des plateformes publicitaires.
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconBoxBlue}>
            <Ionicons name="document-attach-outline" size={22} color="#2563EB" />
          </View>
          <View style={styles.cardHeaderTexts}>
            <Text style={styles.cardTitle}>Gestion du CV</Text>
            <Text style={styles.cardSubtitle}>Suppression ciblée de votre document</Text>
          </View>
        </View>

        {isCvLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : userCv ? (
          <View style={styles.cvContainer}>
            <View style={styles.cvRow}>
              <Ionicons name="document" size={20} color="#64748B" />
              <View style={styles.cvDetails}>
                <Text style={styles.cvName}>{userCv.file_name}</Text>
                <Text style={styles.cvSize}>
                  {userCv.file_size_bytes ? `${Math.round(userCv.file_size_bytes / 1024)} ko` : 'Taille inconnue'}
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.deleteCvButton, isDeletingCv && styles.buttonDisabled]}
              onPress={handleConfirmDeleteCv}
              disabled={isDeletingCv}>
              {isDeletingCv ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <Text style={styles.deleteCvButtonText}>Supprimer uniquement mon CV</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={styles.noCvNotice}>
            Aucun CV n’est actuellement associé à votre profil.
          </Text>
        )}
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.iconBoxRed}>
            <Ionicons name="trash-outline" size={22} color="#DC2626" />
          </View>
          <View style={styles.cardHeaderTexts}>
            <Text style={styles.dangerTitle}>Zone de danger</Text>
            <Text style={styles.dangerSubtitle}>Droit à l’effacement définitif (RGPD)</Text>
          </View>
        </View>

        <Text style={styles.dangerDescription}>
          Cette action est irréversible. Elle supprimera immédiatement et définitivement votre compte, votre profil, toutes vos offres publiées, vos candidatures ainsi que votre fichier CV de nos serveurs.
        </Text>

        <Pressable
          style={[styles.deleteAccountButton, isDeletingAccount && styles.buttonDisabled]}
          onPress={() => {
            setConfirmationInput('');
            setDeleteModalVisible(true);
          }}
          disabled={isDeletingAccount}>
          <Text style={styles.deleteAccountButtonText}>
            Supprimer mon compte et toutes mes données
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingAccount) {
            setDeleteModalVisible(false);
          }
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.iconBoxRedLarge}>
                <Ionicons name="warning-outline" size={26} color="#DC2626" />
              </View>
              <Text style={styles.modalTitle}>Confirmer la suppression</Text>
            </View>

            <Text style={styles.modalBody}>
              Cette action supprimera définitivement votre profil, vos candidatures et votre CV. Cette opération ne peut pas être annulée.
            </Text>

            <Text style={styles.modalInstruction}>
              Pour confirmer, veuillez saisir le mot <Text style={styles.boldRed}>SUPPRIMER</Text> ci-dessous :
            </Text>

            <TextInput
              style={styles.modalInput}
              value={confirmationInput}
              onChangeText={setConfirmationInput}
              placeholder="SUPPRIMER"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeletingAccount}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeletingAccount}>
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalConfirmButton,
                  (!isConfirmed || isDeletingAccount) && styles.buttonDisabled,
                ]}
                onPress={handleExecuteAccountDeletion}
                disabled={!isConfirmed || isDeletingAccount}>
                {isDeletingAccount ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>Supprimer définitivement</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// This stylesheet defines layout, typography and color palettes for the settings interface.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBox: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconBoxTeal: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxBlue: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxRed: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxRedLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardHeaderTexts: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  guaranteeList: {
    gap: 14,
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  guaranteeIcon: {
    marginTop: 2,
  },
  guaranteeContent: {
    flex: 1,
  },
  guaranteeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  guaranteeDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
  },
  loadingBox: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cvContainer: {
    gap: 12,
  },
  cvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cvDetails: {
    flex: 1,
  },
  cvName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  cvSize: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  deleteCvButton: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF1F2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteCvButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  noCvNotice: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
  },
  dangerCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFBFB',
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
  },
  dangerSubtitle: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
  },
  dangerDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#7F1D1D',
    marginBottom: 16,
  },
  deleteAccountButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAccountButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalInstruction: {
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  boldRed: {
    fontWeight: '700',
    color: '#DC2626',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1.5,
    backgroundColor: '#DC2626',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
