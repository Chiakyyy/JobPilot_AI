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
    backgroundColor: '#0B1120',
  },
  content: {
    padding: 16,
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  icon: {
    fontSize: 36,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  badge: {
    backgroundColor: '#0F172A',
    borderColor: '#38BDF8',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '500',
  },
});
