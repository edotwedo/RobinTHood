import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { availableModels } from '../engines';
import { AVOID, FINE, HOW_IT_WORKS, OBFUSCATE, SELF_CHECK, assess, privacyOf } from '../privacy';
import { C } from '../theme';

const TONE_COLOR = { ok: '#34d399', warn: '#fbbf24' };

export default function PrivacyScreen({ visible, onClose, settings, insetTop = 0 }) {
  const [answers, setAnswers] = useState({});
  const answered = SELF_CHECK.every((q) => answers[q.id] !== undefined);
  const result = answered ? assess(answers) : null;
  const models = availableModels(settings).filter((m) => m.id !== 'auto').concat([{ id: 'auto', label: 'Auto' }]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insetTop + 20 }]}>
        <View style={styles.card}>
          <ScrollView>
            <Text style={styles.cardTitle}>How Robin is free</Text>
            {HOW_IT_WORKS.map((line, i) => (
              <Text key={i} style={styles.privPara}>{line}</Text>
            ))}

            <Text style={styles.privHead}>Who can see your messages</Text>
            {models.map((m) => {
              const pv = privacyOf(m.id);
              return (
                <View key={m.id} style={styles.privRow}>
                  <Text style={styles.privModel}>{m.label}{pv.mark}</Text>
                  <Text style={[styles.privLevel, { color: TONE_COLOR[pv.tone] }]}>{pv.short}</Text>
                  <Text style={styles.privNote}>{pv.provider}. {pv.note}</Text>
                </View>
              );
            })}

            <Text style={styles.privHead}>Quick self check</Text>
            <Text style={styles.privNote}>Five questions. Your answers stay on this phone.</Text>
            {SELF_CHECK.map((q) => (
              <View key={q.id} style={{ marginTop: 10 }}>
                <Text style={styles.privQ}>{q.q}</Text>
                {q.options.map((o, i) => (
                  <Pressable
                    key={i}
                    style={[styles.option, answers[q.id] === i && styles.optionActive]}
                    onPress={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                  >
                    <Text style={[styles.optionText, answers[q.id] === i && { color: '#fff', fontWeight: '700' }]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {result ? (
              <View style={styles.privResult}>
                <Text style={[styles.privHead, { marginTop: 0, color: result.tier === 'low' ? TONE_COLOR.ok : TONE_COLOR.warn }]}>
                  {result.headline}
                </Text>
                <Text style={styles.privPara}>{result.body}</Text>
              </View>
            ) : null}

            <Text style={styles.privHead}>Keep these out of chats</Text>
            {AVOID.map((x, i) => (
              <Text key={i} style={styles.privItem}>✕  {x}</Text>
            ))}
            <Text style={styles.privHead}>Usually fine</Text>
            {FINE.map((x, i) => (
              <Text key={i} style={styles.privItem}>✓  {x}</Text>
            ))}
            <Text style={styles.privHead}>How to share less</Text>
            {OBFUSCATE.map((x, i) => (
              <Text key={i} style={styles.privItem}>•  {x}</Text>
            ))}
            <Text style={[styles.privNote, { marginTop: 14 }]}>
              This is general guidance, not legal or security advice. Robin also checks your message for things like emails,
              phone numbers and card numbers before it goes to a model marked *, and offers to mask them.
            </Text>
          </ScrollView>
          <Pressable style={[styles.pill, { marginTop: 10, alignItems: 'center' }]} onPress={onClose}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f9fafb', marginBottom: 14 },
  privHead: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  privPara: { color: C.text, fontSize: 14, lineHeight: 20, marginTop: 6 },
  privRow: { marginTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  privModel: { color: C.text, fontSize: 14, fontWeight: '700' },
  privLevel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  privNote: { color: C.faint, fontSize: 12, lineHeight: 17, marginTop: 2 },
  privQ: { color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  privResult: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: C.panel2 },
  privItem: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  option: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: C.panel2 },
  optionActive: { backgroundColor: C.green },
  optionText: { color: C.dim, fontSize: 14 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: C.panel2 },
});
