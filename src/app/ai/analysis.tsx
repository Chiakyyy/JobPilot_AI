import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useAiQuota, useAnalyzeCvOffer } from '@/hooks/useAiAssistant';
import { useUserCv } from '@/hooks/useCv';
import { useOffer } from '@/hooks/useOffers';
import { CvAnalysisResult } from '@/types/database';

// This screen provides candidate cv to job offer alignment analysis with explicit privacy consent.
export default function AiAnalysisScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ offerId?: string | string[] }>();
  const rawOfferId = searchParams.offerId;
  const offerId = Array.isArray(rawOfferId) ? rawOfferId[0] : rawOfferId;

  // This effect logs a warning when the offer identifier parameter is missing.
  useEffect(() => {
    if (!offerId) {
      console.warn('AiAnalysisScreen: missing offerId in route parameters');
    }
  }, [offerId]);

  const { data: offer, isLoading: isOfferLoading } = useOffer(offerId);
  const { data: userCv, isLoading: isCvLoading } = useUserCv();
  const { data: quota, refetch: refetchQuota } = useAiQuota();

  const { mutateAsync: analyzeCv, isPending } = useAnalyzeCvOffer();

  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<CvAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // This function initiates the cv to offer analysis workflow.
  const handleRunAnalysis = async () => {
    if (!offerId || !consentAccepted) {
      return;
    }

    setErrorMessage(null);
    try {
      const result = await analyzeCv({ offerId });
      setAnalysisResult(result);
      void refetchQuota();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur inattendue est survenue.';
      setErrorMessage(message);
    }
  };

  // If the offer identifier is missing, render an informative error state.
  if (!offerId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Identifiant manquant</Text>
        <Text style={styles.errorBody}>Aucun identifiant d’offre d’emploi n’a été fourni.</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  if (isOfferLoading || isCvLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Chargement des informations...</Text>
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Offre introuvable</Text>
        <Text style={styles.errorBody}>L’offre demandée n’existe pas ou a été supprimée.</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  // If the user has not uploaded a cv, prompt them to upload one first.
  if (!userCv) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCvCard}>
          <Text style={styles.emptyCvEmoji}>📄</Text>
          <Text style={styles.emptyCvTitle}>CV requis pour l’analyse</Text>
          <Text style={styles.emptyCvText}>
            Pour évaluer l’adéquation de votre profil avec le poste de {offer.title} chez{' '}
            {offer.company}, vous devez importer votre CV au format PDF.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/cv' as never)}>
            <Text style={styles.primaryButtonText}>Gérer mon CV</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const remainingQuota = quota?.cvAnalysisRemaining ?? 3;
  const isQuotaExhausted = remainingQuota <= 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerCard}>
        <Text style={styles.headerSubtitle}>Analyse d’adéquation</Text>
        <Text style={styles.headerTitle}>{offer.title}</Text>
        <Text style={styles.companyText}>{offer.company}</Text>
      </View>

      <View style={styles.consentCard}>
        <View style={styles.quotaRow}>
          <Text style={styles.quotaLabel}>Quota quotidien :</Text>
          <View style={[styles.quotaBadge, isQuotaExhausted && styles.quotaBadgeExhausted]}>
            <Text style={[styles.quotaBadgeText, isQuotaExhausted && styles.quotaBadgeTextExhausted]}>
              {remainingQuota} / 3 restantes aujourd’hui
            </Text>
          </View>
        </View>

        <Text style={styles.consentHeading}>Protection de vos données personnelles</Text>
        <Text style={styles.consentBody}>
          Le texte extrait de votre CV et le descriptif du poste sont transmis de façon sécurisée à
          l’intelligence artificielle uniquement pour exécuter cette analyse. Aucun document ni
          texte brut n’est conservé en base de données.
        </Text>

        <View style={styles.switchRow}>
          <Switch
            value={consentAccepted}
            onValueChange={setConsentAccepted}
            trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
            thumbColor={consentAccepted ? '#2563EB' : '#F8FAFC'}
          />
          <Text style={styles.switchLabel}>J’accepte l’envoi de mes données pour cette analyse</Text>
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            (!consentAccepted || isQuotaExhausted || isPending) && styles.buttonDisabled,
          ]}
          disabled={!consentAccepted || isQuotaExhausted || isPending}
          onPress={handleRunAnalysis}>
          {isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isQuotaExhausted ? 'Quota journalier atteint' : 'Lancer l’analyse d’adéquation'}
            </Text>
          )}
        </Pressable>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {analysisResult && (
        <View style={styles.resultsContainer}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Compétences confirmées</Text>
            {analysisResult.matched_skills.length === 0 ? (
              <Text style={styles.emptySectionText}>Aucune correspondance directe identifiée.</Text>
            ) : (
              <View style={styles.chipsWrap}>
                {analysisResult.matched_skills.map((skill, index) => (
                  <View key={index} style={styles.matchChip}>
                    <Text style={styles.matchChipText}>✓ {skill}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Compétences à valoriser ou manquantes</Text>
            {analysisResult.missing_skills.length === 0 ? (
              <Text style={styles.emptySectionText}>Toutes les compétences clés mentionnées figurent sur le profil.</Text>
            ) : (
              <View style={styles.chipsWrap}>
                {analysisResult.missing_skills.map((skill, index) => (
                  <View key={index} style={styles.missingChip}>
                    <Text style={styles.missingChipText}>• {skill}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Points forts du profil</Text>
            {analysisResult.strengths.map((point, index) => (
              <View key={index} style={styles.bulletItem}>
                <Text style={styles.bulletSymbol}>▸</Text>
                <Text style={styles.bulletText}>{point}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Écarts et points de vigilance</Text>
            {analysisResult.gaps_and_risks.map((gap, index) => (
              <View key={index} style={styles.bulletItem}>
                <Text style={styles.bulletWarningSymbol}>▸</Text>
                <Text style={styles.bulletText}>{gap}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Actions recommandées</Text>
            {analysisResult.actionable_recommendations.map((action, index) => (
              <View key={index} style={styles.bulletItem}>
                <Text style={styles.bulletActionSymbol}>➔</Text>
                <Text style={styles.bulletText}>{action}</Text>
              </View>
            ))}
          </View>

          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>Limites de l’analyse IA</Text>
            <Text style={styles.disclaimerText}>{analysisResult.disclaimer}</Text>
            <Text style={styles.disclaimerSubtext}>
              JobPilot AI n’attribue délibérément aucun score arbitraire pour favoriser une lecture
              qualitative de vos compétences.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  companyText: {
    fontSize: 15,
    color: '#64748B',
  },
  consentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quotaLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  quotaBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  quotaBadgeExhausted: {
    backgroundColor: '#FEF2F2',
  },
  quotaBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  quotaBadgeTextExhausted: {
    color: '#DC2626',
  },
  consentHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
  },
  consentBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    marginBottom: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  switchLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emptyCvCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    margin: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyCvEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyCvTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyCvText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#B91C1C',
    lineHeight: 18,
  },
  resultsContainer: {
    gap: 14,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  emptySectionText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchChip: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  matchChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#047857',
  },
  missingChip: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  missingChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#B45309',
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  bulletSymbol: {
    fontSize: 14,
    color: '#2563EB',
    lineHeight: 20,
  },
  bulletWarningSymbol: {
    fontSize: 14,
    color: '#D97706',
    lineHeight: 20,
  },
  bulletActionSymbol: {
    fontSize: 13,
    color: '#059669',
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
  },
  disclaimerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    marginBottom: 6,
  },
  disclaimerSubtext: {
    fontSize: 11,
    lineHeight: 15,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});
