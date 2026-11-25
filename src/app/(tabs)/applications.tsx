import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// This screen provides the placeholder interface for candidate job applications.
export default function ApplicationsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.icon}>📋</Text>
        <Text style={styles.title}>Suivi des candidatures</Text>
        <Text style={styles.description}>
          Le tableau de bord de suivi de vos candidatures et d’analyse des retours sera connecté
          dans les prochaines étapes.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Étape suivante : gestion des candidatures</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// This stylesheet defines styles for the applications placeholder view.
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
