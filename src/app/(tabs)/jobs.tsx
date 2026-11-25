import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// This screen provides the placeholder interface for job search and discovery.
export default function JobsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.icon}>💼</Text>
        <Text style={styles.title}>Recherche d’offres</Text>
        <Text style={styles.description}>
          Le module d’exploration et de matching intelligent des offres d’emploi sera actif lors
          de la prochaine étape du projet.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Étape suivante : recherche intelligente</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// This stylesheet defines styles for the job search placeholder view.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  icon: {
    fontSize: 36,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  badge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  badgeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '500',
  },
});
