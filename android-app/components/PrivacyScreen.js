import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { availableModels } from '../engines';
import { t } from '../i18n';
import { SELF_CHECK, assess, privacyOf } from '../privacy';
import { C } from '../theme';

const TONE_COLOR = { ok: '#34d399', warn: '#fbbf24' };
const HOW_KEYS = ['privacyHow0', 'privacyHow1', 'privacyHow2', 'privacyHow3', 'privacyHow4'];
const AVOID_KEYS = ['privacyAvoid0', 'privacyAvoid1', 'privacyAvoid2', 'privacyAvoid3', 'privacyAvoid4', 'privacyAvoid5', 'privacyAvoid6'];
const FINE_KEYS = ['privacyFine0', 'privacyFine1', 'privacyFine2', 'privacyFine3', 'privacyFine4'];
const LESS_KEYS = ['privacyLess0', 'privacyLess1', 'privacyLess2', 'privacyLess3', 'privacyLess4', 'privacyLess5', 'privacyLess6', 'privacyLess7'];
const TIER_TITLE = { low: 'privacyTierLow', medium: 'privacyTierMedium', high: 'privacyTierHigh' };
const TIER_BODY = { low: 'privacyTierLowBody', medium: 'privacyTierMediumBody', high: 'privacyTierHighBody' };

function levelKey(level) {
  if (level === 'stated') return 'privacyLevelStated';
  if (level === 'private') return 'privacyLevelPrivate';
  return 'privacyLevelMayCollect';
}

function providerKey(id) {
  if (String(id).startsWith('ovh-')) return null;
  if (String(id).startsWith('kilo-')) return 'privacyProvKilo';
  return {
    ollama: 'privacyProvOllama',
    openrouter: 'privacyProvOpenrouter',
    auto: 'privacyProvAuto',
  }[id] || 'privacyProvUnknown';
}

function noteKey(id) {
  if (String(id).startsWith('ovh-')) return 'privacyNoteOvh';
  if (String(id).startsWith('kilo-')) return 'privacyNoteKilo';
  return {
    ollama: 'privacyNoteOllama',
    openrouter: 'privacyNoteOpenrouter',
    auto: 'privacyNoteAuto',
  }[id] || 'privacyNoteUnknown';
}

export default function PrivacyScreen({ visible, onClose, settings, insetTop = 0 }) {
  const [answers, setAnswers] = useState({});
  const answered = SELF_CHECK.every((q) => answers[q.id] !== undefined);
  const result = answered ? assess(answers) : null;
  const lang = settings?.lang || 'en';
  const models = availableModels(settings).filter((m) => m.id !== 'auto').concat([{ id: 'auto', label: 'Auto' }]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insetTop + 20 }]}>
        <View style={styles.card}>
          <ScrollView>
            <Text style={styles.cardTitle}>{t('privacyTitle', lang)}</Text>
            {HOW_KEYS.map((key) => (
              <Text key={key} style={styles.privPara}>{t(key, lang)}</Text>
            ))}

            <Text style={styles.privHead}>{t('privacyWho', lang)}</Text>
            {models.map((m) => {
              const pv = privacyOf(m.id);
              const prov = providerKey(m.id);
              return (
                <View key={m.id} style={styles.privRow}>
                  <Text style={styles.privModel}>{m.label}{pv.mark}</Text>
                  <Text style={[styles.privLevel, { color: TONE_COLOR[pv.tone] }]}>{t(levelKey(pv.level), lang)}</Text>
                  <Text style={styles.privNote}>{prov ? t(prov, lang) : pv.provider}. {t(noteKey(m.id), lang)}</Text>
                </View>
              );
            })}

            <Text style={styles.privHead}>{t('privacyCheck', lang)}</Text>
            <Text style={styles.privNote}>{t('privacyCheckNote', lang)}</Text>
            {SELF_CHECK.map((q) => (
              <View key={q.id} style={{ marginTop: 10 }}>
                <Text style={styles.privQ}>{t(`privacyQ${q.id}`, lang)}</Text>
                {q.options.map((_, i) => (
                  <Pressable
                    key={i}
                    style={[styles.option, answers[q.id] === i && styles.optionActive]}
                    onPress={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                  >
                    <Text style={[styles.optionText, answers[q.id] === i && { color: '#fff', fontWeight: '700' }]}>{t(`privacyQ${q.id}${i}`, lang)}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {result ? (
              <View style={styles.privResult}>
                <Text style={[styles.privHead, { marginTop: 0, color: result.tier === 'low' ? TONE_COLOR.ok : TONE_COLOR.warn }]}>
                  {t(TIER_TITLE[result.tier], lang)}
                </Text>
                <Text style={styles.privPara}>{t(TIER_BODY[result.tier], lang)}</Text>
              </View>
            ) : null}

            <Text style={styles.privHead}>{t('privacyAvoid', lang)}</Text>
            {AVOID_KEYS.map((key) => (
              <Text key={key} style={styles.privItem}>✕  {t(key, lang)}</Text>
            ))}
            <Text style={styles.privHead}>{t('privacyFine', lang)}</Text>
            {FINE_KEYS.map((key) => (
              <Text key={key} style={styles.privItem}>✓  {t(key, lang)}</Text>
            ))}
            <Text style={styles.privHead}>{t('privacyLess', lang)}</Text>
            {LESS_KEYS.map((key) => (
              <Text key={key} style={styles.privItem}>•  {t(key, lang)}</Text>
            ))}
            <Text style={[styles.privNote, { marginTop: 14 }]}>{t('privacyDisclaimer', lang)}</Text>
          </ScrollView>
          <Pressable style={[styles.pill, { marginTop: 10, alignItems: 'center' }]} onPress={onClose}>
            <Text style={{ color: C.text, fontWeight: '600' }}>{t('close', lang)}</Text>
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
