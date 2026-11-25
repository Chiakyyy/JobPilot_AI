import { Link, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { ApplicationStatus } from '@/types/database';

const STATUS_LABELS: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  Saved: { label: 'Enregistrée', color: '#475569', bg: '#F1F5F9' },
  Applied: { label: 'Postulé', color: '#2563EB', bg: '#EFF6FF' },
  Interview: { label: 'Entretien', color: '#D97706', bg: '#FEF3C7' },
  Offer: { label: 'Offre', color: '#059669', bg: '#ECFDF5' },
  Rejected: { label: 'Refusée', color: '#DC2626', bg: '#FEF2F2' },
};

// This screen presents the candidate overview dashboard with application metrics and quick actions.
export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { data: stats, isLoading, isError, error, refetch, isRefetching } = useDashboardStats();

  const candidateName = profile?.display_name || user?.email?.split('@')[0] || 'Candidat';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />
      }>
      <View style={styles.welcomeCard}>
        <Text style={styles.greeting}>Bonjour, {candidateName}</Text>
        <Text style={styles.tagline}>
          Suivez vos opportunités et pilotez l’avancement de vos candidatures.
        </Text>

        <View style={styles.actionRow}>
          <Link href="/offers/new" asChild>
            <Pressable style={styles.primaryActionButton}>
              <Text style={styles.primaryActionButtonText}>+ Ajouter une offre</Text>
            </Pressable>
          </Link>
          <Link href="/(tabs)/offers" asChild>
            <Pressable style={styles.secondaryActionButton}>
              <Text style={styles.secondaryActionButtonText}>Voir les offres</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Aperçu des candidatures</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.loadingText}>Calcul des indicateurs...</Text>
          </View>
        ) : isError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : 'Erreur lors du calcul des statistiques.'}
            </Text>
            <Pressable style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statCardHighlight}>
              <Text style={styles.statHighlightValue}>{stats?.total || 0}</Text>
              <Text style={styles.statHighlightLabel}>Total candidatures</Text>
            </View>

            <View style={styles.statRow}>
              {(['Applied', 'Interview', 'Offer', 'Rejected'] as ApplicationStatus[]).map(
                (status) => {
                  const config = STATUS_LABELS[status];
                  const count = stats?.byStatus[status] || 0;
                  return (
                    <View key={status} style={[styles.statBadgeCard, { backgroundColor: config.bg }]}>
                      <Text style={[styles.statBadgeValue, { color: config.color }]}>{count}</Text>
                      <Text style={[styles.statBadgeLabel, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>
                  );
                }
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Dernières candidatures</Text>
          <Link href="/(tabs)/applications" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.seeAllText}>Tout voir →</Text>
            </Pressable>
          </Link>
        </View>

        {!isLoading && (!stats?.recentApplications || stats.recentApplications.length === 0) ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Aucune candidature enregistrée</Text>
            <Text style={styles.emptyText}>
              Ajoutez une offre d’emploi et convertissez-la en candidature pour activer votre tableau
              de bord.
            </Text>
            <Link href="/offers/new" asChild>
              <Pressable style={styles.emptyCtaButton}>
                <Text style={styles.emptyCtaButtonText}>Ajouter une offre</Text>
              </Pressable>
            </Link>
          </View>
        ) : (
          <View style={styles.recentList}>
            {stats?.recentApplications.map((app) => {
              const config = STATUS_LABELS[app.status] || STATUS_LABELS.Applied;
              const formattedDate = new Date(app.updated_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              });

              return (
                <Pressable
                  key={app.id}
                  style={styles.recentCard}
                  onPress={() => router.push(`/applications/${app.id}` as never)}>
                  <View style={styles.recentCardLeft}>
                    <Text style={styles.recentCompany}>{app.offer?.company || 'Entreprise'}</Text>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {app.offer?.title || 'Poste'}
                    </Text>
                  </View>
                  <View style={styles.recentCardRight}>
                    <View style={[styles.recentStatusBadge, { backgroundColor: config.bg }]}>
                      <Text style={[styles.recentStatusText, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </View>
                    <Text style={styles.recentDate}>{formattedDate}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// This stylesheet defines display rules for the dashboard screen.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },
  welcomeCard: {
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
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryActionButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    flex: 1,
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  secondaryActionButtonText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  seeAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748B',
  },
  errorBox: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F87171',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statsGrid: {
    gap: 10,
  },
  statCardHighlight: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statHighlightValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  statHighlightLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DBEAFE',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBadgeCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  statBadgeValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  statBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  emptyCtaButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  emptyCtaButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  recentList: {
    gap: 8,
  },
  recentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  recentCardLeft: {
    flex: 1,
    marginRight: 10,
  },
  recentCompany: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  recentCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  recentStatusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recentStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recentDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
});
