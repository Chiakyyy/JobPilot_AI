import { Link, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useOffers } from '@/hooks/useOffers';
import { JobOffer } from '@/types/database';

// This screen presents the searchable and paginated job offers catalog.
export default function OffersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const pageSize = 15;

  const { data, isLoading, isError, error, refetch, isRefetching } = useOffers({
    search,
    page,
    pageSize,
  });

  const offers = data?.data || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // This function navigates to the detailed view of a selected offer.
  const handleSelectOffer = (id: string) => {
    router.push(`/offers/${id}` as never);
  };

  // This function renders an individual job offer card item.
  const renderItem = ({ item }: { item: JobOffer }) => {
    const formattedDate = new Date(item.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return (
      <Pressable style={styles.card} onPress={() => handleSelectOffer(item.id)}>
        <View style={styles.cardHeader}>
          <Text style={styles.companyName}>{item.company}</Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>
        <Text style={styles.jobTitle}>{item.title}</Text>
        {item.location && <Text style={styles.locationText}>📍 {item.location}</Text>}
        {item.description && (
          <Text style={styles.snippetText} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par titre ou entreprise..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            setPage(0);
          }}
          clearButtonMode="while-editing"
        />

        <Link href="/offers/new" asChild>
          <Pressable style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Ajouter une offre</Text>
          </Pressable>
        </Link>
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Chargement des offres...</Text>
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Erreur de chargement</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Impossible de récupérer les offres.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : offers.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyIcon}>💼</Text>
          <Text style={styles.emptyTitle}>Aucune offre enregistrée</Text>
          <Text style={styles.emptySubtitle}>
            {search.trim()
              ? 'Aucun résultat ne correspond à votre recherche.'
              : 'Commencez à suivre vos opportunités en ajoutant votre première offre d’emploi.'}
          </Text>
          <Link href="/offers/new" asChild>
            <Pressable style={styles.emptyCtaButton}>
              <Text style={styles.emptyCtaButtonText}>+ Ajouter une offre</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          <FlatList
            data={offers}
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

// This stylesheet defines display parameters for the job offers screen.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    fontSize: 14,
    color: '#0F172A',
  },
  addButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  locationText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 6,
  },
  snippetText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  centerBox: {
    flex: 1,
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
  emptyCtaButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyCtaButtonText: {
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
