import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';

// This layout configures the bottom tab bar with the four primary application sections.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTitleStyle: {
          color: '#0F172A',
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
        },
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#64748B',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'house.fill', android: 'home', web: 'home' }}
              tintColor={color}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Offres',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'briefcase.fill', android: 'work', web: 'work' }}
              tintColor={color}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Candidatures',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'doc.text.fill', android: 'assignment', web: 'assignment' }}
              tintColor={color}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'person.crop.circle.fill', android: 'person', web: 'person' }}
              tintColor={color}
              size={22}
            />
          ),
        }}
      />
    </Tabs>
  );
}
