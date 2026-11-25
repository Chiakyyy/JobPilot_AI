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

import { useAiQuota, useGenerateInterviewPrep } from '@/hooks/useAiAssistant';
import { useUserCv } from '@/hooks/useCv';
import { useOffer } from '@/hooks/useOffers';
import { InterviewPrepResult } from '@/types/database';

// This screen generates targeted interview preparation questions based on the job offer and candidate cv.
export default function AiInterviewScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ offerId?: string | string[] }>();
  const rawOfferId = searchParams.offerId;
  const offerId = Array.isArray(rawOfferId) ? rawOfferId[0] : rawOfferId;

  // This effect logs a warning when the offer identifier parameter is missing.
  useEffect(() => {
    if (!offerId) {
      console.warn('AiInterviewScreen: missing offerId in route parameters');
    }
  }, [offerId]);

  const { data: offer, isLoading: isOfferLoading } = useOffer(offerId);
  const { data: userCv, isLoading: isCvLoading } = useUserCv();
  const { data: quota, refetch: refetchQuota } = useAiQuota();

  const { mutateAsync: generatePrep, isPending } = useGenerateInterviewPrep();

  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [includeCv, setIncludeCv] = useState<boolean>(Boolean(userCv));
  const [prepResult, setPrepResult] = useState<InterviewPrepResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // This function initiates the interview preparation generation workflow.
  const handleGenerateQuestions = async () => {
    if (!offerId || !consentAccepted) {
      return;
    }

    setErrorMessage(null);
    try {
      const result = await generatePrep({
        offerId,
        includeCv: Boolean(includeCv && userCv),
      });
      setPrepResult(result);
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
        <Text style={styles.loadingText}>Chargement de l’offre...</Text>
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

  const remainingQuota = quota?.interviewPrepRemaining ?? 5;
  const isQuotaExhausted = remainingQuota <= 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerCard}>
        <Text style={styles.headerSubtitle}>Préparation d’entretien</Text>
        <Text style={styles.headerTitle}>{offer.title}</Text>
        <Text style={styles.companyText}>{offer.company}</Text>
      </View>

      <View style={styles.consentCard}>
        <View style={styles.quotaRow}>
          <Text style={styles.quotaLabel}>Quota quotidien :</Text>
          <View style={[styles.quotaBadge, isQuotaExhausted && styles.quotaBadgeExhausted]}>
            <Text style={[styles.quotaBadgeText, isQuotaExhausted && styles.quotaBadgeTextExhausted]}>
              {remainingQuota} / 5 restantes aujourd’hui
            </Text>
          </View>
        </View>

        <Text style={styles.consentHeading}>Protection de vos données personnelles</Text>
        <Text style={styles.consentBody}>
          Les détails de l’offre et votre profil sont transmis de manière sécurisée au modèle
          d’intelligence artificielle uniquement pour concevoir vos questions d’entraînement.
        </Text>

        <View style={styles.switchRow}>
          <Switch
            value={consentAccepted}
            onValueChange={setConsentAccepted}
            trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
            thumbColor={consentAccepted ? '#2563EB' : '#F8FAFC'}
          />
          <Text style={styles.switchLabel}>
            J’accepte l’envoi de mes données pour cette préparation
          </Text>
        </View>

        {userCv ? (
          <View style={styles.switchRow}>
            <Switch
              value={includeCv}
              onValueChange={setIncludeCv}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={includeCv ? '#2563EB' : '#F8FAFC'}
            />
            <Text style={styles.switchLabel}>
              Personnaliser avec les compétences de mon CV ({userCv.file_name})
            </Text>
          </View>
        ) : (
          <View style={styles.noCvNotice}>
            <Text style={styles.noCvNoticeText}>
              Conseil : importez un CV dans votre profil pour obtenir des questions encore plus
              personnalisées.
            </Text>
          </View>
        )}

        <Pressable
          style={[
            styles.primaryButton,
            (!consentAccepted || isQuotaExhausted || isPending) && styles.buttonDisabled,
          ]}
          disabled={!consentAccepted || isQuotaExhausted || isPending}
          onPress={handleGenerateQuestions}>
          {isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isQuotaExhausted ? 'Quota journalier atteint' : 'Générer les questions d’entretien'}
            </Text>
          )}
        </Pressable>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {prepResult && (
        <View style={styles.resultsContainer}>
          <View style={styles.questionsHeader}>
            <Text style={styles.questionsCountTitle}>
              {prepResult.questions.length} questions d’entraînement suggérées
            </Text>
            <Text style={styles.questionsCountSubtitle}>
              Entraînez-vous à répondre à voix haute ou par écrit avant votre entretien.
            </Text>
          </View>

          {prepResult.questions.map((item, index) => {
            const isTech = item.category === 'Technique';
            const diffColor =
              item.difficulty === 'Facile'
                ? '#059669'
                : item.difficulty === 'Difficile'
                ? '#DC2626'
                : '#D97706';

            return (
              <View key={index} style={styles.questionCard}>
                <View style={styles.questionCardHeader}>
                  <View style={styles.badgesRow}>
                    <View
                      style={[
                        styles.categoryBadge,
                        isTech ? styles.categoryBadgeTech : styles.categoryBadgeRh,
                      ]}>
                      <Text
                        style={[
                          styles.categoryBadgeText,
                          isTech ? styles.categoryBadgeTextTech : styles.categoryBadgeTextRh,
                        ]}>
                        {item.category}
                      </Text>
                    </View>
                    <View style={styles.difficultyBadge}>
                      <Text style={[styles.difficultyBadgeText, { color: diffColor }]}>
                        ● {item.difficulty}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.questionNumberText}>#{index + 1}</Text>
                </View>

                <Text style={styles.questionText}>{item.question}</Text>

                <View style={styles.rationaleBox}>
                  <Text style={styles.rationaleHeading}>Pourquoi cette question ?</Text>
                  <Text style={styles.rationaleText}>{item.rationale}</Text>
                </View>

                <View style={styles.guidelinesBox}>
                  <Text style={styles.guidelinesHeading}>Pistes de réponse suggérées :</Text>
                  {item.answer_guidelines.map((guideline, gIdx) => (
                    <View key={gIdx} style={styles.guidelineItem}>
                      <Text style={styles.guidelineSymbol}>✓</Text>
                      <Text style={styles.guidelineText}>{guideline}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          <View style={styles.disclaimerCard}>
            <Text style={styles.disclaimerTitle}>Limites des suggestions IA</Text>
            <Text style={styles.disclaimerText}>{prepResult.disclaimer}</Text>
            <Text style={styles.disclaimerSubtext}>
              Ces questions sont formulées à titre d’entraînement et ne garantissent pas les
              questions exactes posées par le recruteur.
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
    marginBottom: 14,
  },
  switchLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  noCvNotice: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noCvNoticeText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  questionsHeader: {
    marginBottom: 4,
  },
  questionsCountTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  questionsCountSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  questionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeTech: {
    backgroundColor: '#EFF6FF',
  },
  categoryBadgeRh: {
    backgroundColor: '#FAF5FF',
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryBadgeTextTech: {
    color: '#2563EB',
  },
  categoryBadgeTextRh: {
    color: '#9333EA',
  },
  difficultyBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  difficultyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  questionNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    color: '#0F172A',
    marginBottom: 12,
  },
  rationaleBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  rationaleHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  rationaleText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
  },
  guidelinesBox: {
    gap: 6,
  },
  guidelinesHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  guidelineSymbol: {
    fontSize: 12,
    color: '#059669',
    lineHeight: 18,
  },
  guidelineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
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
