import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { markFor, privacyOf } from '../privacy';
import { C } from '../theme';

export default function ModelPickerModal({
  visible,
  onClose,
  models,
  selectedModel,
  onSelectModel,
  onOpenPrivacy,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Choose a model</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {models.map((m) => {
              const active = m.id === selectedModel;
              return (
                <Pressable
                  key={m.id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => onSelectModel(m.id)}
                >
                  <Text style={[styles.optionText, active && { color: '#fff', fontWeight: '700' }]}>
                    {m.label}
                    {markFor(m.id)}
                  </Text>
                  <Text style={styles.optionNote} numberOfLines={1}>
                    {privacyOf(m.id).short}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.hint}>
            If the chosen model is down, Robin falls back to the next free one and tells you. * = may collect your messages.
          </Text>
          <Pressable style={styles.linkBtn} onPress={onOpenPrivacy}>
            <Text style={styles.linkBtnText}>How your data is handled ›</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f9fafb', marginBottom: 14 },
  option: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: C.panel2 },
  optionActive: { backgroundColor: C.green },
  optionText: { color: C.dim, fontSize: 14 },
  optionNote: { color: C.faint, fontSize: 11, marginTop: 2 },
  hint: { color: C.faint, fontSize: 12, marginTop: 12 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginTop: 6 },
  linkBtnText: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
});
