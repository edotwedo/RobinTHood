import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { REPORT_REASONS } from '../report';
import { C } from '../theme';

export default function ReportModal({
  visible,
  onClose,
  reportDone,
  reportReason,
  setReportReason,
  reportNote,
  setReportNote,
  reportSending,
  sendReport,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {reportDone ? (
            <>
              <Text style={styles.cardTitle}>Report received</Text>
              <Text style={styles.msgText}>{reportDone}</Text>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.cardTitle}>Report this answer</Text>
              <Text style={styles.hint}>The answer and your question are sent to the RobinTHood developer so it can be reviewed.</Text>
              {REPORT_REASONS.map((r) => (
                <Pressable
                  key={r.id}
                  style={[styles.option, reportReason === r.id && styles.optionActive]}
                  onPress={() => setReportReason(r.id)}
                >
                  <Text style={[styles.optionText, reportReason === r.id && { color: '#fff', fontWeight: '700' }]}>{r.label}</Text>
                </Pressable>
              ))}
              <TextInput
                style={[styles.fieldInput, { marginTop: 8 }]}
                value={reportNote}
                onChangeText={setReportNote}
                placeholder="Anything else? (optional)"
                placeholderTextColor={C.faint}
                multiline
              />
              <Pressable
                style={[styles.closeBtn, (!reportReason || reportSending) && { opacity: 0.4 }]}
                disabled={!reportReason || reportSending}
                onPress={sendReport}
              >
                <Text style={styles.closeText}>{reportSending ? 'Sending…' : 'Send report'}</Text>
              </Pressable>
              <Pressable style={{ alignItems: 'center', marginTop: 12 }} onPress={onClose}>
                <Text style={styles.hint}>Cancel</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f9fafb', marginBottom: 14 },
  msgText: { color: C.text, fontSize: 14, lineHeight: 20 },
  hint: { color: C.faint, fontSize: 12, marginTop: 12 },
  option: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: C.panel2 },
  optionActive: { backgroundColor: C.green },
  optionText: { color: C.dim, fontSize: 14 },
  fieldInput: { backgroundColor: C.panel2, borderRadius: 8, padding: 10, color: '#f9fafb', fontSize: 14, borderWidth: 1, borderColor: C.border },
  closeBtn: { backgroundColor: C.green, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  closeText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
