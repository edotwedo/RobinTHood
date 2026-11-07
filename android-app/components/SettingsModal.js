import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { LANG_NAMES, SUPPORTED_LANGS, t } from '../i18n';
import { C, F } from '../theme';
import { nameOf, pickFolder } from '../files';
import { discoverOllamaLan } from '../ollamaDiscovery';

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

  const folderLabel = settings.filesUri ? (nameOf(settings.filesUri) || 'Chosen folder') : 'Choose a folder';

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
            <Section title="Language">
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

            <Section title="Assistant" note="How Robin answers, and what it is allowed to reach.">
              <ToggleRow
                label="Air-gapped mode"
                hint="Disables web search and keeps every query on your own Ollama server — 100% offline."
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

            <Section title="Models" note="Optional. Leave blank to use the free hosted models.">
              <Stack>
                <Field
                  label="Home Ollama URL"
                  value={settings.ollamaUrl}
                  placeholder="http://my-pc.tailscale.net:11434"
                  onChange={(v) => setSettings((s) => ({ ...s, ollamaUrl: v.trim() }))}
                />
                {/^http:\/\//i.test(settings.ollamaUrl) ? (
                  <Text style={styles.inlineHint}>http:// is not encrypted. Fine over Tailscale or your home Wi-Fi, not the open internet.</Text>
                ) : null}
              </Stack>
              <Stack>
                <Field
                  label="Ollama model"
                  value={settings.ollamaModel}
                  placeholder="llama3.1"
                  onChange={(v) => setSettings((s) => ({ ...s, ollamaModel: v.trim() }))}
                />
              </Stack>
              <Row
                label="Find Ollama on this network"
                hint={ollamaStatus || 'Scans your LAN for a running Ollama server.'}
                onPress={async () => {
                  setOllamaStatus('Searching LAN for Ollama…');
                  const found = await discoverOllamaLan(settings.ollamaUrl ? [settings.ollamaUrl] : []);
                  if (found) {
                    setSettings((s) => ({
                      ...s,
                      ollamaUrl: found.url,
                      ollamaModel: found.recommendedModel || s.ollamaModel || 'llama3.2',
                    }));
                    setOllamaStatus(`Found ${found.url} (${found.recommendedModel})`);
                  } else {
                    setOllamaStatus('No Ollama instance found on this network');
                  }
                }}
                last
              />
            </Section>

            <Section title="OpenRouter" note="Optional. Bring your own key for extra models.">
              <Stack>
                <Field
                  label="API key"
                  value={settings.openRouterKey}
                  placeholder="sk-or-v1-…"
                  secure
                  onChange={(v) => setSettings((s) => ({ ...s, openRouterKey: v.trim() }))}
                />
              </Stack>
              <Stack last>
                <Field
                  label="Model"
                  value={settings.openRouterModel}
                  placeholder="openrouter/free"
                  onChange={(v) => setSettings((s) => ({ ...s, openRouterModel: v.trim() }))}
                />
              </Stack>
            </Section>

            <Section title="Files & notes" note="Robin reads and writes plain text and Markdown in one place you choose.">
              {isIos ? (
                <Row label="Robin's files" hint="In the Files app: On My iPhone, then RobinTHood." last />
              ) : allFiles ? (
                <Row
                  label="Whole phone access"
                  hint="Personal build. Files without a folder go to Documents/RobinTHood."
                  value="On"
                  onPress={() => openAllFilesSetting(packageName).catch(() => {})}
                  last
                />
              ) : (
                <Row
                  label="Robin's folder"
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
                label="Obsidian vault"
                value={
                  settings.obsidianVault
                    ? (allFiles ? 'Documents/Obsidian' : (nameOf(settings.obsidianVault) || 'Connected'))
                    : 'Not connected'
                }
                hint={vaultStatus || 'Secrets from _vault_secrets.json or note frontmatter are shielded before sending.'}
                onPress={async () => {
                  try {
                    if (allFiles) {
                      setSettings((s) => ({ ...s, obsidianVault: 'Documents/Obsidian', filesUri: 'allfiles:Documents/Obsidian' }));
                      setVaultStatus('Connected to Documents/Obsidian');
                    } else {
                      const uri = await pickFolder();
                      if (uri) {
                        setSettings((s) => ({ ...s, obsidianVault: uri, filesUri: uri }));
                        setVaultStatus(`Connected: ${nameOf(uri) || 'Obsidian vault'}`);
                      }
                    }
                  } catch {}
                }}
                last
              />
            </Section>

            <Section title="Audio">
              <Row label="Music volume" last>
                <Pills
                  options={[['Quiet', 0.15], ['Normal', 0.3], ['Loud', 0.6]]}
                  value={settings.musicVolume}
                  onChange={(v) => setSettings((s) => ({ ...s, musicVolume: v, music: true }))}
                />
              </Row>
            </Section>

            <Section title="Privacy & data">
              <Row label="Privacy and your data" onPress={onOpenPrivacy} last />
              {!settings.isPro ? <Row label="Ad privacy choices" onPress={openAdPrivacyOptions} last /> : null}
              <Row
                label="Privacy policy"
                onPress={() => handleOpenSource('https://robinthood-search.phone-liaison.workers.dev/privacy')}
                last
              />
            </Section>

            {__DEV__ ? (
              <Section title="Developer">
                <Row
                  label="RobinTHood Pro (dev toggle)"
                  hint="Turns the ads off. Testing only until Play Billing is set up."
                  value={settings.isPro ? 'Active' : 'Off'}
                  onPress={() => setSettings((s) => ({ ...s, isPro: !s.isPro }))}
                  last
                />
              </Section>
            ) : null}

            <Text style={styles.about}>
              RobinTHood {Constants.expoConfig?.version}. When Web Search is on, queries go through our edge
              infrastructure to live search providers (Brave Search, DuckDuckGo, Wikipedia) and the pages are read
              there, never from your phone. Chat history and keys stay on this device. The free version shows Google
              ads, and Google's ads SDK collects device identifiers, as the privacy policy explains.
            </Text>

            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneText}>Done</Text>
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
