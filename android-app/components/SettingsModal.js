import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { LANG_NAMES, SUPPORTED_LANGS, t } from '../i18n';
import { C } from '../theme';
import { nameOf, pickFolder } from '../files';

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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingTop: insetsTop + 20 }]}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.cardTitle}>{t('settingsTitle', settings.lang)}</Text>
            <Pressable style={styles.linkBtn} onPress={onOpenPrivacy}>
              <Text style={styles.linkBtnText}>Privacy and your data ›</Text>
            </Pressable>

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
