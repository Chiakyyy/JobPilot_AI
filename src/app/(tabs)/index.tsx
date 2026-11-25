import { Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';

// This screen presents the main dashboard and overview for the candidate.
export default function HomeScreen() {
  const { user, profile } = useAuth();

  const candidateName = profile?.display_name || user?.email?.split('@')[0] || 'Candidat';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.welcomeCard}>
        <Text style={styles.greeting}>Bonjour, {candidateName}</Text>
        <Text style={styles.tagline}>
          Bienvenue sur JobPilot AI, votre copilote intelligent pour vos candidatures.
        </Text>
      </View>

      <View style={styles.statusSection}>
        <Text style={styles.sectionHeader}>État de votre profil</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {profile?.target_role ? profile.target_role : 'Profil à compléter'}
          </Text>
          <Text style={styles.cardDescription}>
            {profile?.skills && profile.skills.length > 0
              ? `Compétences : ${profile.skills.join(', ')}`
              : 'Ajoutez vos compétences clés pour activer la recommandation automatique.'}
          </Text>
          <Link href="/(tabs)/profile" asChild>
            <Pressable style={styles.actionButton}>
              <Text style={styles.actionButtonText}>Gérer mon profil</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.featuresGrid}>
        <View style={styles.featureBox}>
          <Text style={styles.featureIcon}>💼</Text>
          <Text style={styles.featureTitle}>Offres ciblées</Text>
          <Text style={styles.featureDescription}>
            Recherchez et filtrez les offres d’emploi selon vos critères.
          </Text>
          <Link href="/(tabs)/jobs" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Explorer</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.featureBox}>
          <Text style={styles.featureIcon}>📋</Text>
          <Text style={styles.featureTitle}>Candidatures</Text>
          <Text style={styles.featureDescription}>
            Suivez l’avancement et l’historique de toutes vos candidatures.
          </Text>
          <Link href="/(tabs)/applications" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Consulter</Text>
            </Pressable>
          </Link>
        </View>
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
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
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
  },
  statusSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  actionButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  featuresGrid: {
    flexDirection: 'column',
    gap: 14,
  },
  featureBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '500',
  },
});
