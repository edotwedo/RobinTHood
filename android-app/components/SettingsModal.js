import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { LANG_NAMES, SUPPORTED_LANGS, t } from '../i18n';
import { C, F } from '../theme';
import { nameOf, pickFolder } from '../files';
import { discoverOllamaLan } from '../ollamaDiscovery';
import { FEEDBACK_MAX, submitFeedback } from '../report';

export function Field({ label, value, placeholder, onChange, secure }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
      />
    </View>
  );
}

function Section({ title, note, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, hint, value, onPress, right, last }) {
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue} numberOfLines={2}>{value}</Text> : null}
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {right}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );
  const style = [styles.row, !last && styles.rowDivider];
  return onPress ? (
    <Pressable style={style} onPress={onPress} android_ripple={{ color: C.panel2 }}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

function Stack({ last, children }) {
  return <View style={[styles.stackRow, !last && styles.rowDivider]}>{children}</View>;
}

function Pills({ options, value, onChange }) {
  return (
    <View style={styles.pillRow}>
      {options.map(([label, v]) => {
        const active = value === v;
        return (
          <Pressable key={String(v)} style={[styles.pill, active && styles.pillActive]} onPress={() => onChange(v)}>
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleRow({ label, hint, value, onToggle }) {
  return (
    <Row
      label={label}
      hint={hint}
      last
      right={<Switch value={value} onValueChange={onToggle} trackColor={{ false: C.panel2, true: C.green }} thumbColor="#fff" />}
    />
  );
}

export default function SettingsModal({
  visible,
  onClose,
  settings,
  setSettings,
  onOpenPrivacy,
  insetsTop = 0,
  isIos = false,
  allFiles = false,
  packageName = 'com.edotwedo.robinthood',
  openAllFilesSetting,
  openAdPrivacyOptions,
  handleOpenSource,
}) {
  const [ollamaStatus, setOllamaStatus] = useState('');
  const [vaultStatus, setVaultStatus] = useState('');
  const lang = settings.lang;
  const [feedback, setFeedback] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const sendingRef = useRef(false);

  const folderLabel = settings.filesUri ? (nameOf(settings.filesUri) || t('setChosenFolder', lang)) : t('setChooseFolder', lang);

  useEffect(() => { if (!visible) setFeedbackStatus(''); }, [visible]);

  const sendFeedback = async () => {
    if (!feedback.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setFeedbackSending(true);
    try {
      const outcome = await submitFeedback({ note: feedback, version: Constants.expoConfig?.version });
      if (outcome === 'sent' || outcome === 'queued') setFeedback('');
      setFeedbackStatus(
        outcome === 'sent' ? t('setFeedbackThanks', lang)
          : outcome === 'queued' ? t('setFeedbackQueued', lang)
            : t('setFeedbackFail', lang)
      );
    } finally {
      sendingRef.current = false;
      setFeedbackSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insetsTop }]}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('settingsTitle', settings.lang)}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollBody}>
            <Section title={t('setFeedback', lang)} note={t('setFeedbackDesc', lang)}>
              <Stack last>
                <TextInput
                  style={[styles.fieldInput, styles.feedbackInput]}
                  value={feedback}
                  onChangeText={(v) => { setFeedback(v); if (feedbackStatus) setFeedbackStatus(''); }}
                  placeholder={t('setFeedbackPlaceholder', lang)}
                  placeholderTextColor={C.faint}
                  multiline
                  maxLength={FEEDBACK_MAX}
                  accessibilityLabel={t('setFeedback', lang)}
                />
                <Pressable
                  style={[styles.feedbackBtn, (!feedback.trim() || feedbackSending) && { opacity: 0.5 }]}
                  onPress={sendFeedback}
                  disabled={!feedback.trim() || feedbackSending}
                  accessibilityRole="button"
                >
                  <Text style={styles.feedbackBtnText}>{feedbackSending ? t('setFeedbackSending', lang) : t('setFeedbackSend', lang)}</Text>
                </Pressable>
                {feedbackStatus ? <Text style={styles.feedbackStatus}>{feedbackStatus}</Text> : null}
              </Stack>
            </Section>

            <Section title={t('setLang', lang)}>
              <View style={styles.pillWrap}>
                {SUPPORTED_LANGS.map((code) => {
                  const active = settings.lang === code;
                  return (
                    <Pressable
                      key={code}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => setSettings((s) => ({ ...s, lang: code }))}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{LANG_NAMES[code] || code}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Section title={t('setAssistant', lang)} note={t('setAssistantNote', lang)}>
              <ToggleRow
                label={t('setLocalOnly', lang)}
                hint={t('setLocalOnlyHint', lang)}
                value={settings.airGapped}
                onToggle={() =>
                  setSettings((s) => {
                    const next = !s.airGapped;
                    return {
                      ...s,
                      airGapped: next,
                      webSearch: next ? false : s.webSearch,
                      selectedModel: next ? 'ollama' : (s.selectedModel === 'ollama' ? 'ovh-120b' : s.selectedModel),
                    };
                  })
                }
              />
            </Section>

            <Section title={t('setModels', lang)} note={t('setModelsNote', lang)}>
              <Stack>
                <Field
                  label={t('setOllamaUrl', lang)}
                  value={settings.ollamaUrl}
                  placeholder="http://my-pc.tailscale.net:11434"
                  onChange={(v) => setSettings((s) => ({ ...s, ollamaUrl: v.trim() }))}
                />
                {/^http:\/\//i.test(settings.ollamaUrl) ? (
                  <Text style={styles.inlineHint}>{t('setHttpHint', lang)}</Text>
                ) : null}
              </Stack>
              <Stack>
                <Field
                  label={t('setOllamaModel', lang)}
                  value={settings.ollamaModel}
                  placeholder="llama3.1"
                  onChange={(v) => setSettings((s) => ({ ...s, ollamaModel: v.trim() }))}
                />
              </Stack>
              <Row
                label={t('setFindOllama', lang)}
                hint={ollamaStatus || t('setFindOllamaHint', lang)}
                onPress={async () => {
                  setOllamaStatus(t('setSearchingLan', lang));
                  const found = await discoverOllamaLan(settings.ollamaUrl ? [settings.ollamaUrl] : []);
                  if (found) {
                    setSettings((s) => ({
                      ...s,
                      ollamaUrl: found.url,
                      ollamaModel: found.recommendedModel || s.ollamaModel || 'llama3.2',
                    }));
                    setOllamaStatus(`${t('setFoundOllama', lang)} ${found.url} (${found.recommendedModel})`);
                  } else {
                    setOllamaStatus(t('setNoOllama', lang));
                  }
                }}
                last
              />
            </Section>

            <Section title={t('setOpenRouter', lang)} note={t('setOpenRouterNote', lang)}>
              <Stack>
                <Field
                  label={t('setApiKey', lang)}
                  value={settings.openRouterKey}
                  placeholder="sk-or-v1-…"
                  secure
                  onChange={(v) => setSettings((s) => ({ ...s, openRouterKey: v.trim() }))}
                />
              </Stack>
              <Stack last>
                <Field
                  label={t('setOrModel', lang)}
                  value={settings.openRouterModel}
                  placeholder="openrouter/free"
                  onChange={(v) => setSettings((s) => ({ ...s, openRouterModel: v.trim() }))}
                />
              </Stack>
            </Section>

            <Section title={t('setFiles', lang)} note={t('setFilesNote', lang)}>
              {isIos ? (
                <Row label={t('setIosFiles', lang)} hint={t('setIosFilesHint', lang)} last />
              ) : allFiles ? (
                <Row
                  label={t('setWholePhone', lang)}
                  hint={t('setWholePhoneHint', lang)}
                  value={t('setOn', lang)}
                  onPress={() => openAllFilesSetting(packageName).catch(() => {})}
                  last
                />
              ) : (
                <Row
                  label={t('setRobinFolder', lang)}
                  value={folderLabel}
                  onPress={async () => {
                    try {
                      const uri = await pickFolder();
                      setSettings((s) => ({ ...s, filesUri: uri }));
                    } catch {}
                  }}
                  last
                />
              )}
              <Row
                label={t('setObsidian', lang)}
                value={
                  settings.obsidianVault
                    ? (allFiles ? 'Documents/Obsidian' : (nameOf(settings.obsidianVault) || t('setConnected', lang)))
                    : t('setNotConnected', lang)
                }
                hint={vaultStatus || t('setObsidianHint', lang)}
                onPress={async () => {
                  try {
                    if (allFiles) {
                      setSettings((s) => ({ ...s, obsidianVault: 'Documents/Obsidian', filesUri: 'allfiles:Documents/Obsidian' }));
                      setVaultStatus(t('setConnectedDocs', lang));
                    } else {
                      const uri = await pickFolder();
                      if (uri) {
                        setSettings((s) => ({ ...s, obsidianVault: uri, filesUri: uri }));
                        setVaultStatus(`${t('setConnectedPrefix', lang)} ${nameOf(uri) || t('setObsidian', lang)}`);
                      }
                    }
                  } catch {}
                }}
                last
              />
            </Section>

            <Section title={t('setAudio', lang)}>
              <Row label={t('setMusicRow', lang)} last>
                <Pills
                  options={[[t('setQuiet', lang), 0.15], [t('setNormal', lang), 0.3], [t('setLoud', lang), 0.6]]}
                  value={settings.musicVolume}
                  onChange={(v) => setSettings((s) => ({ ...s, musicVolume: v, music: true }))}
                />
              </Row>
            </Section>

            <Section title={t('setPrivacySection', lang)}>
              <Row label={t('setPrivacyRow', lang)} onPress={onOpenPrivacy} last />
              {!settings.isPro ? <Row label={t('setAdPrivacy', lang)} onPress={openAdPrivacyOptions} last /> : null}
              <Row
                label={t('setPolicy', lang)}
                onPress={() => handleOpenSource('https://robinthood-search.phone-liaison.workers.dev/privacy')}
                last
              />
            </Section>

            {__DEV__ ? (
              <Section title={t('setDeveloper', lang)}>
                <Row
                  label={t('setProDev', lang)}
                  hint={t('setProHint', lang)}
                  value={settings.isPro ? t('setActive', lang) : t('setOff', lang)}
                  onPress={() => setSettings((s) => ({ ...s, isPro: !s.isPro }))}
                  last
                />
              </Section>
            ) : null}

            <Text style={styles.about}>
              RobinTHood {Constants.expoConfig?.version}. {t('setAbout', lang)}
            </Text>

            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneText}>{t('setDone', lang)}</Text>
            </Pressable>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: C.border,
    height: '92%',
  },
  feedbackInput: { minHeight: 80, textAlignVertical: 'top', marginTop: 4 },
  feedbackBtn: { backgroundColor: C.green, padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  feedbackBtnText: { color: '#fff', fontFamily: F.semibold, fontSize: 15 },
  feedbackStatus: { color: C.green, fontSize: 12, fontFamily: F.regular, marginTop: 8 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sheetTitle: { color: C.text, fontSize: 20, fontFamily: F.bold },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { color: C.dim, fontSize: 14, fontFamily: F.semibold },
  scrollBody: { padding: 16 },

  section: { marginBottom: 22 },
  sectionTitle: { color: C.green, fontSize: 12, fontFamily: F.semibold, letterSpacing: 1.2, marginBottom: 4, marginLeft: 2 },
  sectionNote: { color: C.faint, fontSize: 12, fontFamily: F.regular, lineHeight: 17, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: C.panel, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  stackRow: { paddingHorizontal: 14, paddingVertical: 13 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.line },
  rowText: { flex: 1 },
  rowLabel: { color: C.text, fontSize: 14.5, fontFamily: F.medium },
  rowValue: { color: C.dim, fontSize: 12.5, fontFamily: F.regular, marginTop: 3 },
  rowHint: { color: C.faint, fontSize: 12, fontFamily: F.regular, lineHeight: 17, marginTop: 3 },
  chevron: { color: C.faint, fontSize: 20, fontFamily: F.regular },

  field: { marginTop: 6 },
  fieldLabel: { color: C.faint, fontSize: 11.5, fontFamily: F.medium, marginBottom: 6 },
  fieldInput: {
    backgroundColor: C.panel2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.text,
    fontSize: 14,
    fontFamily: F.regular,
    borderWidth: 1,
    borderColor: C.border,
  },
  inlineHint: { color: C.faint, fontSize: 11.5, fontFamily: F.regular, lineHeight: 16, marginTop: 6 },

  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border },
  pillActive: { backgroundColor: C.green, borderColor: C.green },
  pillText: { color: C.dim, fontSize: 13, fontFamily: F.medium },
  pillTextActive: { color: '#04140d', fontFamily: F.semibold },

  about: { color: C.faint, fontSize: 11.5, fontFamily: F.regular, lineHeight: 17, marginHorizontal: 2, marginBottom: 16 },
  doneBtn: { backgroundColor: C.green, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  doneText: { color: '#04140d', fontFamily: F.semibold, fontSize: 15 },
});
