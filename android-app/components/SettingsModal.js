import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { LANG_NAMES, SUPPORTED_LANGS, t } from '../i18n';
import { C } from '../theme';
import { nameOf, pickFolder } from '../files';
import { discoverOllamaLan } from '../ollamaDiscovery';
import { submitFeedback } from '../report';

export function Field({ label, value, placeholder, onChange, secure }) {
  return (
    <View>
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
  const [feedback, setFeedback] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);

  const sendFeedback = async () => {
    if (!feedback.trim() || feedbackSending) return;
    setFeedbackSending(true);
    try {
      const outcome = await submitFeedback({ note: feedback, version: Constants.expoConfig?.version });
      setFeedback('');
      setFeedbackStatus(outcome === 'sent' ? 'Thanks! Phil reads every one.' : 'Thanks! Saved, and it will send when you are back online.');
    } catch {
      setFeedbackStatus('Could not send. Try again in a minute.');
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insetsTop + 20 }]}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.cardTitle}>{t('settingsTitle', settings.lang)}</Text>
            <Pressable style={styles.linkBtn} onPress={onOpenPrivacy}>
              <Text style={styles.linkBtnText}>Privacy and your data ›</Text>
            </Pressable>

            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackTitle}>Send feedback</Text>
              <Text style={styles.feedbackDesc}>Bug, idea, or something you liked? Tell us. No account needed.</Text>
              <TextInput
                style={[styles.fieldInput, styles.feedbackInput]}
                value={feedback}
                onChangeText={(v) => { setFeedback(v); if (feedbackStatus) setFeedbackStatus(''); }}
                placeholder="What should we know?"
                placeholderTextColor={C.faint}
                multiline
                maxLength={4000}
                accessibilityLabel="Feedback message"
              />
              <Pressable
                style={[styles.feedbackBtn, (!feedback.trim() || feedbackSending) && { opacity: 0.5 }]}
                onPress={sendFeedback}
                disabled={!feedback.trim() || feedbackSending}
                accessibilityRole="button"
              >
                <Text style={styles.closeText}>{feedbackSending ? 'Sending…' : 'Send feedback'}</Text>
              </Pressable>
              {feedbackStatus ? <Text style={styles.feedbackStatus}>{feedbackStatus}</Text> : null}
            </View>

            {__DEV__ ? (
              <>
                <Text style={styles.fieldLabel}>RobinTHood Pro (dev toggle)</Text>
                <Pressable
                  style={[styles.proCard, settings.isPro && styles.proCardActive]}
                  onPress={() => setSettings((s) => ({ ...s, isPro: !s.isPro }))}
                >
                  <View style={styles.proCardHeader}>
                    <Text style={styles.proCardTitle}>{settings.isPro ? '✨ Pro Unlocked' : '🚀 Upgrade to Pro'}</Text>
                    <Text style={styles.proCardPrice}>{settings.isPro ? 'ACTIVE' : '$49.99'}</Text>
                  </View>
                  <Text style={styles.proCardDesc}>
                    {settings.isPro ? 'Ads are off.' : 'Turns the ads off. Testing only until Play Billing is set up.'}
                  </Text>
                  <View style={[styles.proCardAction, settings.isPro && { backgroundColor: '#065f46' }]}>
                    <Text style={styles.proCardActionText}>
                      {settings.isPro ? '✓ Pro Active (Tap to Toggle Test)' : 'Unlock Lifetime Pro ($49.99)'}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}

            <Text style={styles.fieldLabel}>Language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {SUPPORTED_LANGS.map((code) => {
                const label = LANG_NAMES[code] || code;
                return (
                  <Pressable
                    key={code}
                    style={[styles.pill, settings.lang === code && styles.optionActive, { marginRight: 6 }]}
                    onPress={() => setSettings((s) => ({ ...s, lang: code }))}
                  >
                    <Text style={[styles.optionText, settings.lang === code && { color: '#fff', fontWeight: '700' }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Field
              label="Home Ollama URL (optional)"
              value={settings.ollamaUrl}
              placeholder="http://my-pc.tailscale.net:11434"
              onChange={(v) => setSettings((s) => ({ ...s, ollamaUrl: v.trim() }))}
            />
            {/^http:\/\//i.test(settings.ollamaUrl) ? (
              <Text style={styles.hint}>
                http:// is not encrypted. That is fine over Tailscale or your home Wi-Fi, not over the open internet.
              </Text>
            ) : null}

            <Field
              label="Ollama model"
              value={settings.ollamaModel}
              placeholder="llama3.1"
              onChange={(v) => setSettings((s) => ({ ...s, ollamaModel: v.trim() }))}
            />
            <Pressable
              style={[styles.pill, { alignSelf: 'flex-start', marginTop: 4, marginBottom: 8 }]}
              onPress={async () => {
                setOllamaStatus('Searching LAN for Ollama...');
                const found = await discoverOllamaLan(settings.ollamaUrl ? [settings.ollamaUrl] : []);
                if (found) {
                  setSettings((s) => ({
                    ...s,
                    ollamaUrl: found.url,
                    ollamaModel: found.recommendedModel || s.ollamaModel || 'llama3.2',
                  }));
                  setOllamaStatus(`✓ Found Ollama: ${found.url} (${found.recommendedModel})`);
                } else {
                  setOllamaStatus('✗ No Ollama instance detected on local network');
                }
              }}
            >
              <Text style={styles.optionText}>🔍 Auto-Detect Home Ollama on LAN</Text>
            </Pressable>
            {ollamaStatus ? <Text style={styles.hint}>{ollamaStatus}</Text> : null}

            <Text style={styles.fieldLabel}>Air-Gapped Mode (100% Offline)</Text>
            <Pressable
              style={[styles.pill, settings.airGapped && styles.optionActive]}
              onPress={() =>
                setSettings((s) => {
                  const nextAirGapped = !s.airGapped;
                  return {
                    ...s,
                    airGapped: nextAirGapped,
                    webSearch: nextAirGapped ? false : s.webSearch,
                    selectedModel: nextAirGapped ? 'ollama' : (s.selectedModel === 'ollama' ? 'ovh-120b' : s.selectedModel),
                  };
                })
              }
            >
              <Text style={[styles.optionText, settings.airGapped && { color: '#fff', fontWeight: '700' }]}>
                {settings.airGapped ? '🛡️ Air-Gapped Mode: ON (Local / Ollama Only)' : '🛡️ Air-Gapped Mode: OFF'}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              Disables web search and restricts queries strictly to your local Ollama instance for 100% offline, zero-cloud querying.
            </Text>

            <Field
              label="OpenRouter key (optional)"
              value={settings.openRouterKey}
              placeholder="sk-or-v1-..."
              secure
              onChange={(v) => setSettings((s) => ({ ...s, openRouterKey: v.trim() }))}
            />
            <Field
              label="OpenRouter model"
              value={settings.openRouterModel}
              placeholder="openrouter/free"
              onChange={(v) => setSettings((s) => ({ ...s, openRouterModel: v.trim() }))}
            />

            {isIos ? (
              <>
                <Text style={styles.fieldLabel}>Robin's files</Text>
                <Text style={styles.hint}>Saved in the Files app: On My iPhone, then RobinTHood.</Text>
              </>
            ) : allFiles ? (
              <>
                <Text style={styles.fieldLabel}>Files: whole phone (personal build)</Text>
                <Pressable style={styles.pill} onPress={() => openAllFilesSetting(packageName).catch(() => {})}>
                  <Text style={styles.optionText}>📂 All files access: open the switch</Text>
                </Pressable>
                <Text style={styles.hint}>New files without a folder go to Documents/RobinTHood.</Text>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Robin's folder (files Robin can read and write)</Text>
                <Pressable
                  style={styles.pill}
                  onPress={async () => {
                    try {
                      const uri = await pickFolder();
                      setSettings((s) => ({ ...s, filesUri: uri }));
                    } catch {}
                  }}
                >
                  <Text style={styles.optionText}>
                    {settings.filesUri ? `📁 ${nameOf(settings.filesUri) || 'Chosen folder'}  (tap to change)` : '📁 Choose a folder'}
                  </Text>
                </Pressable>
              </>
            )}

            <Text style={styles.fieldLabel}>Obsidian Vault Quick-Connect</Text>
            <Pressable
              style={[styles.pill, settings.obsidianVault && styles.optionActive]}
              onPress={async () => {
                try {
                  if (allFiles) {
                    setSettings((s) => ({ ...s, obsidianVault: 'Documents/Obsidian', filesUri: 'allfiles:Documents/Obsidian' }));
                    setVaultStatus('✓ Connected to Documents/Obsidian');
                  } else {
                    const uri = await pickFolder();
                    if (uri) {
                      setSettings((s) => ({ ...s, obsidianVault: uri, filesUri: uri }));
                      setVaultStatus(`✓ Connected: ${nameOf(uri) || 'Obsidian Vault'}`);
                    }
                  }
                } catch {}
              }}
            >
              <Text style={[styles.optionText, settings.obsidianVault && { color: '#fff', fontWeight: '700' }]}>
                {settings.obsidianVault
                  ? `🔮 Obsidian Vault: ${allFiles ? 'Documents/Obsidian' : (nameOf(settings.obsidianVault) || 'Connected')}`
                  : '🔮 Quick-Connect Obsidian Vault (Documents/Obsidian)'}
              </Text>
            </Pressable>
            {vaultStatus ? <Text style={styles.hint}>{vaultStatus}</Text> : null}
            <Text style={styles.hint}>
              Reads and writes Markdown notes in your vault. Custom secrets defined in _vault_secrets.json or note frontmatter (secrets: [...]) are shielded before leaving the phone.
            </Text>

            <Text style={styles.fieldLabel}>Music volume</Text>
            <View style={styles.pillRow}>
              {[
                ['Quiet', 0.15],
                ['Normal', 0.3],
                ['Loud', 0.6],
              ].map(([name, v]) => (
                <Pressable
                  key={name}
                  style={[styles.pill, settings.musicVolume === v && styles.optionActive]}
                  onPress={() => setSettings((s) => ({ ...s, musicVolume: v, music: true }))}
                >
                  <Text style={[styles.optionText, settings.musicVolume === v && { color: '#fff', fontWeight: '700' }]}>
                    {name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.hint}>
              RobinTHood {Constants.expoConfig?.version}. When Web Search is enabled, queries are retrieved securely via our
              edge infrastructure using live search providers (Brave Search, DuckDuckGo, Wikipedia). Chat history and private
              keys remain stored locally on your device. The free version shows Google ads; the ads SDK collects device
              identifiers, as the privacy policy explains.
            </Text>

            {!settings.isPro ? (
              <Pressable style={[styles.pill, { marginTop: 8, alignItems: 'center' }]} onPress={openAdPrivacyOptions}>
                <Text style={styles.optionText}>Ad privacy choices</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.pill, { marginTop: 8, alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => handleOpenSource('https://robinthood-search.phone-liaison.workers.dev/privacy')}
            >
              <Text style={[styles.optionText, { color: C.green, fontWeight: '600' }]}>
                🔒 Privacy Policy & Data Disclosures ↗
              </Text>
            </Pressable>

            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f9fafb', marginBottom: 14 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginTop: 6 },
  linkBtnText: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 12, color: C.dim, marginTop: 12, marginBottom: 6, fontWeight: '600' },
  fieldInput: { backgroundColor: C.panel2, borderRadius: 8, padding: 10, color: '#f9fafb', fontSize: 14, borderWidth: 1, borderColor: C.border },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: C.panel2 },
  pillRow: { flexDirection: 'row', gap: 8 },
  optionActive: { backgroundColor: C.green },
  optionText: { color: C.dim, fontSize: 14 },
  hint: { color: C.faint, fontSize: 12, marginTop: 12 },
  closeBtn: { backgroundColor: C.green, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  closeText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  feedbackCard: { backgroundColor: C.panel2, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.green, marginTop: 10, marginBottom: 4 },
  feedbackTitle: { fontSize: 15, fontWeight: '700', color: '#f3f4f6' },
  feedbackDesc: { fontSize: 12, color: C.dim, lineHeight: 16, marginTop: 2, marginBottom: 8 },
  feedbackInput: { minHeight: 80, textAlignVertical: 'top' },
  feedbackBtn: { backgroundColor: C.green, padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  feedbackStatus: { color: C.green, fontSize: 12, marginTop: 8 },
  proCard: {
    backgroundColor: C.panel2,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 14,
  },
  proCardActive: {
    borderColor: C.green,
    backgroundColor: '#06281e',
  },
  proCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  proCardTitle: { fontSize: 15, fontWeight: '700', color: '#f3f4f6' },
  proCardPrice: { fontSize: 13, fontWeight: '700', color: C.green },
  proCardDesc: { fontSize: 12, color: C.dim, lineHeight: 16, marginBottom: 10 },
  proCardAction: {
    backgroundColor: C.green,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  proCardActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
