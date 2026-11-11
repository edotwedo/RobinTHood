import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { lightTick } from '../haptics';
import { C } from '../theme';

const PROMPT_SUGGESTIONS = [
  {
    icon: '💡',
    title: 'Explain simply',
    prompt: 'Explain how large language models work in plain, simple terms without jargon.',
  },
  {
    icon: '📝',
    title: 'Draft a message',
    prompt: 'Help me draft a polite, professional message following up on a pending project update.',
  },
  {
    icon: '🌐',
    title: 'Live web research',
    prompt: 'Search the web and summarize the latest updates on space exploration milestones this year.',
  },
  {
    icon: '💻',
    title: 'Code & debug',
    prompt: 'Write a clean Python script that fetches JSON from an API with retry logic and error handling.',
  },
];

export default function ZeroState({ onSelectPrompt, onOpenPrivacy }) {
  const handlePress = (prompt) => {
    lightTick();
    onSelectPrompt(prompt);
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.badgeRow}>
          <Text style={styles.badgeText}>PRIVATE • MULTI-MODEL • KEYLESS</Text>
        </View>
        <Text style={styles.greeting}>What can I help you with?</Text>
        <Text style={styles.subGreeting}>
          Ask anything, search the live web, or attach documents. Robin routes across leading AI models freely.
        </Text>
      </View>

      <View style={styles.grid}>
        {PROMPT_SUGGESTIONS.map((item, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => handlePress(item.prompt)}
          >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardPrompt} numberOfLines={2}>
                {item.prompt}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.privacyStrip} onPress={onOpenPrivacy}>
        <Text style={styles.privacyText}>
          🔒 <Text style={styles.privacyLink}>Zero accounts. Local-first privacy.</Text> Tap to see how your data is handled.
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badgeRow: {
    backgroundColor: C.panel2,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.green,
    letterSpacing: 0.8,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  subGreeting: {
    fontSize: 13,
    color: C.dim,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  grid: {
    gap: 10,
    marginBottom: 18,
  },
  card: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardPressed: {
    backgroundColor: C.panel2,
    borderColor: C.green,
  },
  cardIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    marginBottom: 2,
  },
  cardPrompt: {
    fontSize: 12,
    color: C.dim,
    lineHeight: 16,
  },
  privacyStrip: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  privacyText: {
    fontSize: 11,
    color: C.faint,
    textAlign: 'center',
  },
  privacyLink: {
    color: '#60a5fa',
    fontWeight: '600',
  },
});
