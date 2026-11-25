import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCvMutations, useUserCv } from '@/hooks/useCv';

// This function formats byte counts into human readable kilobyte and megabyte strings.
function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// This screen provides candidates with private cv upload, signed preview, replacement and deletion.
export default function CvManagementScreen() {
  const { data: userCv, isLoading, isError, error, refetch } = useUserCv();
  const { uploadCv, deleteCv, getSignedCvUrl, isUploading, isDeleting } = useCvMutations();

  const [isOpeningUrl, setIsOpeningUrl] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // This function prompts file selection and executes document upload.
  const handleUploadOrReplace = async () => {
    setActionError(null);
    try {
      await uploadCv(userCv?.file_path || null);
    } catch (err) {
      if (err instanceof Error && err.message === 'Sélection de document annulée.') {
        return;
      }
      setActionError(
        err instanceof Error ? err.message : 'Une erreur est survenue lors de l’envoi du CV.'
      );
    }
  };

  // This function generates a temporary signed url and presents the document preview.
  const handlePreviewCv = async () => {
    if (!userCv?.file_path || isOpeningUrl) {
      return;
    }
    setActionError(null);
    try {
      setIsOpeningUrl(true);
      const signedUrl = await getSignedCvUrl(userCv.file_path);
      await WebBrowser.openBrowserAsync(signedUrl);
    } catch (err) {
      console.error('Failed to open signed cv url', err);
      setActionError('Impossible d’ouvrir le document en aperçu.');
    } finally {
      setIsOpeningUrl(false);
    }
  };

  // This function prompts for confirmation before permanently deleting the stored cv.
  const handleDeleteCv = () => {
    if (!userCv) {
      return;
    }
    Alert.alert(
      'Supprimer mon CV',
      'Êtes-vous sûr de vouloir supprimer votre CV ? Les recruteurs ne pourront plus le consulter.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setActionError(null);
            try {
              await deleteCv({ id: userCv.id, filePath: userCv.file_path });
            } catch (err) {
              console.error('Failed to delete cv', err);
              setActionError('Impossible de supprimer le CV.');
            }
          },
        },
      ]
    );
  };

  const isBusy = isUploading || isDeleting || isOpeningUrl;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.noticeBanner}>
        <Ionicons name="information-circle-outline" size={18} color="#2563EB" style={styles.noticeIcon} />
        <Text style={styles.noticeText}>
          Format PDF avec texte sélectionnable uniquement • 5 Mo maximum • Stockage privé sécurisé
        </Text>
      </View>

      {actionError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={18} color="#DC2626" style={styles.errorBannerIcon} />
          <Text style={styles.errorBannerText}>{actionError}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Chargement de votre document...</Text>
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Erreur de chargement</Text>
          <Text style={styles.errorSubtitle}>
            {error instanceof Error ? error.message : 'Impossible de récupérer votre CV.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : userCv ? (
        <View style={styles.documentCard}>
          <View style={styles.documentHeader}>
            <View style={styles.docIconBox}>
              <Ionicons name="document-text" size={32} color="#2563EB" />
            </View>
            <View style={styles.docMetadata}>
              <Text style={styles.fileName} numberOfLines={2}>
                {userCv.file_name}
              </Text>
              <Text style={styles.fileDetails}>
                {formatBytes(userCv.file_size_bytes)} • Ajouté le{' '}
                {new Date(userCv.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </View>

          <View style={styles.actionsBlock}>
            <Pressable
              style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
              disabled={isBusy}
              onPress={handlePreviewCv}>
              {isOpeningUrl ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="eye-outline" size={16} color="#FFFFFF" style={styles.buttonIcon} />
                  <Text style={styles.primaryButtonText}>Consulter le CV</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, isBusy && styles.buttonDisabled]}
              disabled={isBusy}
              onPress={handleUploadOrReplace}>
              {isUploading ? (
                <ActivityIndicator color="#2563EB" size="small" />
              ) : (
                <>
                  <Ionicons name="swap-horizontal" size={16} color="#2563EB" style={styles.buttonIcon} />
                  <Text style={styles.secondaryButtonText}>Remplacer</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.deleteButton, isBusy && styles.buttonDisabled]}
              disabled={isBusy}
              onPress={handleDeleteCv}>
              {isDeleting ? (
                <ActivityIndicator color="#DC2626" size="small" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" style={styles.buttonIcon} />
                  <Text style={styles.deleteButtonText}>Supprimer</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="cloud-upload-outline" size={42} color="#2563EB" />
          </View>
          <Text style={styles.emptyTitle}>Aucun CV enregistré</Text>
          <Text style={styles.emptySubtitle}>
            Importez votre CV au format PDF pour permettre aux recruteurs de consulter votre profil
            lors de vos candidatures.
          </Text>

          <Pressable
            style={[styles.uploadButton, isUploading && styles.buttonDisabled]}
            disabled={isUploading}
            onPress={handleUploadOrReplace}>
            {isUploading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="add" size={18} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.uploadButtonText}>Importer un CV (PDF)</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Normes de validation du CV</Text>
        <View style={styles.infoRow}>
          <Ionicons name="checkmark-circle" size={16} color="#059669" style={styles.infoIcon} />
          <Text style={styles.infoItemText}>
            Format PDF standard contenant du texte numérique sélectionnable.
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="checkmark-circle" size={16} color="#059669" style={styles.infoIcon} />
          <Text style={styles.infoItemText}>Taille maximale autorisée : 5 Mo.</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="close-circle" size={16} color="#DC2626" style={styles.infoIcon} />
          <Text style={styles.infoItemText}>
            Les documents scannés ou images raster sans calque texte ne sont pas acceptés.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// This stylesheet defines layout and appearance parameters for the cv management screen.
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
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 10,
  },
  noticeIcon: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 8,
  },
  errorBannerIcon: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  centerBox: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748B',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
  },
  retryButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  documentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 16,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docIconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docMetadata: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  fileDetails: {
    fontSize: 12,
    color: '#64748B',
  },
  actionsBlock: {
    gap: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoItemText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
});
