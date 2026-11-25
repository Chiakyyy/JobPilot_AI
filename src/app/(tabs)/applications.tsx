import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useApplications } from '@/hooks/useApplications';
import { Application, ApplicationStatus } from '@/types/database';

interface FilterOption {
  label: string;
  value: string;
}

const STATUS_FILTERS: FilterOption[] = [
  { label: 'Toutes', value: 'All' },
  { label: 'Enregistrée', value: 'Saved' },
  { label: 'Postulé', value: 'Applied' },
  { label: 'Entretien', value: 'Interview' },
  { label: 'Offre', value: 'Offer' },
  { label: 'Refusée', value: 'Rejected' },
];

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; bg: string; text: string }> = {
  Saved: { label: 'Enregistrée', bg: '#F1F5F9', text: '#475569' },
  Applied: { label: 'Postulé', bg: '#EFF6FF', text: '#2563EB' },
  Interview: { label: 'Entretien', bg: '#FEF3C7', text: '#D97706' },
  Offer: { label: 'Offre', bg: '#ECFDF5', text: '#059669' },
  Rejected: { label: 'Refusée', bg: '#FEF2F2', text: '#DC2626' },
};

// This screen presents candidate applications with status filters and progression cards.
export default function ApplicationsScreen() {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [page, setPage] = useState<number>(0);
  const pageSize = 15;

  const { data, isLoading, isError, error, refetch, isRefetching } = useApplications({
    status: selectedStatus,
    page,
    pageSize,
  });

  const applications = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // This function navigates to the detailed view of a selected application.
  const handleSelectApplication = (id: string) => {
    router.push(`/applications/${id}` as never);
  };

  // This function renders an individual application card.
  const renderItem = ({ item }: { item: Application }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.Applied;
    const formattedDate = new Date(item.applied_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <Pressable style={styles.card} onPress={() => handleSelectApplication(item.id)}>
        <View style={styles.cardTopRow}>
          <Text style={styles.companyName}>{item.offer?.company || 'Entreprise'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
            <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
          </View>
        </View>

        <Text style={styles.jobTitle}>{item.offer?.title || 'Poste sans titre'}</Text>

        {item.offer?.location && (
          <Text style={styles.locationText}>📍 {item.offer.location}</Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>Postulé le {formattedDate}</Text>
          <Text style={styles.chevronText}>Détails →</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          {STATUS_FILTERS.map((filter) => {
            const isSelected = selectedStatus === filter.value;
            return (
              <Pressable
                key={filter.value}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => {
                  setSelectedStatus(filter.value);
                  setPage(0);
                }}>
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Chargement des candidatures...</Text>
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Erreur de chargement</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Impossible de récupérer les candidatures.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : applications.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Aucune candidature</Text>
          <Text style={styles.emptySubtitle}>
            {selectedStatus !== 'All'
              ? 'Aucune candidature ne se trouve dans cette catégorie.'
              : 'Vous n’avez pas encore postulé à une offre. Explorez vos offres pour démarrer un suivi.'}
          </Text>
          <Pressable
            style={styles.emptyButton}
            onPress={() => router.push('/(tabs)/offers' as never)}>
            <Text style={styles.emptyButtonText}>Consulter les offres</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={applications}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} />
            }
          />

          {totalPages > 1 && (
            <View style={styles.paginationRow}>
              <Pressable
                style={[styles.pageButton, page === 0 && styles.pageButtonDisabled]}
                disabled={page === 0}
                onPress={() => setPage((p) => Math.max(0, p - 1))}>
                <Text style={styles.pageButtonText}>Précédent</Text>
              </Pressable>
              <Text style={styles.pageInfoText}>
                Page {page + 1} sur {totalPages}
              </Text>
              <Pressable
                style={[
                  styles.pageButton,
                  page >= totalPages - 1 && styles.pageButtonDisabled,
                ]}
                disabled={page >= totalPages - 1}
                onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                <Text style={styles.pageButtonText}>Suivant</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// This stylesheet defines display parameters for the applications tracking tab.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  companyName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  dateText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  chevronText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  pageButton: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 13,
  },
  pageInfoText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
});
