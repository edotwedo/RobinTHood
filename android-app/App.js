import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { availableModels, complete, labelFor } from './engines';

const KEYS = {
  settings: '@robinthood_settings_v2',
  chat: '@robinthood_chat_v2',
};

const DEFAULT_SETTINGS = {
  selectedModel: 'ovh-120b',
  ollamaUrl: '',
  ollamaModel: '',
  openRouterKey: '',
  openRouterModel: '',
};

const INTRO = {
  id: 'intro',
  role: 'assistant',
  intro: true,
  content: 'RobinTHood is ready. Free AI, no account. Tap the model name up top to switch models.',
  model: 'RobinTHood',
};

const C = {
  bg: '#0b0f19', panel: '#111827', panel2: '#1f2937', line: '#1f2937', border: '#374151',
  text: '#f3f4f6', dim: '#9ca3af', faint: '#6b7280', green: '#10b981', user: '#1e293b', red: '#f87171',
};

let idCounter = 0;
const newId = () => `${Date.now()}-${idCounter++}`;

function Chat() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState([INTRO]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [picker, setPicker] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef(null);
  const abortRef = useRef(null);

  // Load saved settings and conversation.
  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([AsyncStorage.getItem(KEYS.settings), AsyncStorage.getItem(KEYS.chat)]);
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
        if (c) {
          const saved = JSON.parse(c);
          if (Array.isArray(saved) && saved.length) setMessages(saved);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);

  useEffect(() => {
    if (loaded && !busy) AsyncStorage.setItem(KEYS.chat, JSON.stringify(messages.slice(-200))).catch(() => {});
  }, [messages, loaded, busy]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg = { id: newId(), role: 'user', content: text };
    const replyId = newId();
    const history = [...messages, userMsg];
    setMessages([...history, { id: replyId, role: 'assistant', content: '', model: labelFor(settings.selectedModel, settings), pending: true }]);
    setInput('');
    setBusy(true);
    scrollToEnd();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const update = (patch) => setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...patch } : m)));

    try {
      const result = await complete({
        history,
        settings,
        signal: ctrl.signal,
        onChunk: (partial, engineId) => {
          setStatus(`Asking ${labelFor(engineId, settings)}…`);
          update({ content: partial, model: labelFor(engineId, settings) });
        },
      });
      if (result.ok) {
        update({
          content: result.text,
          model: result.model,
          seconds: result.seconds,
          note: result.fellBack ? `${labelFor(settings.selectedModel, settings)} failed, used ${result.model}` : undefined,
          pending: false,
        });
      } else {
        update({ content: result.text, model: 'error', error: true, pending: false });
      }
    } catch (err) {
      update({ content: err.message === 'Stopped' ? '(stopped)' : `Error: ${err.message}`, error: true, pending: false });
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStatus('');
      scrollToEnd();
    }
  }, [input, busy, messages, settings, scrollToEnd]);

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    if (busy) stop();
    setMessages([INTRO]);
  };

  const renderItem = ({ item }) => {
    const mine = item.role === 'user';
    return (
      <View style={[styles.msg, mine ? styles.userMsg : styles.botMsg]}>
        {!mine && (
          <View style={styles.msgHeader}>
            <Text style={[styles.modelTag, item.error && { color: C.red }]}>{item.model}</Text>
            {item.seconds ? <Text style={styles.latency}>{item.seconds.toFixed(1)}s</Text> : null}
          </View>
        )}
        {item.content ? (
          <Text selectable style={styles.msgText}>{item.content}</Text>
        ) : (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={C.green} />
            <Text style={styles.loadingText}>{status || 'Thinking…'}</Text>
          </View>
        )}
        {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
      </View>
    );
  };

  const models = availableModels(settings);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>RobinTHood</Text>
          <Pressable onPress={() => setPicker(true)} hitSlop={8}>
            <Text style={styles.modelChip} numberOfLines={1}>{labelFor(settings.selectedModel, settings)} ▾</Text>
          </Pressable>
        </View>
        <Pressable onPress={newChat} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>New</Text>
        </Pressable>
        <Pressable onPress={() => setSettingsOpen(true)} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.gear}>⚙</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        />
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Robin"
            placeholderTextColor={C.faint}
            multiline
            onFocus={scrollToEnd}
          />
          {busy ? (
            <Pressable style={[styles.sendBtn, { backgroundColor: C.red }]} onPress={stop}>
              <Text style={styles.sendText}>■</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]} onPress={send} disabled={!input.trim()}>
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setPicker(false)}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Choose a model</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {models.map((m) => {
                const active = m.id === settings.selectedModel;
                return (
                  <Pressable
                    key={m.id}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => { setSettings((s) => ({ ...s, selectedModel: m.id })); setPicker(false); }}
                  >
                    <Text style={[styles.optionText, active && { color: '#fff', fontWeight: '700' }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.hint}>If the chosen model is down, Robin falls back to the next free one and tells you.</Text>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={[styles.overlay, { paddingTop: insets.top + 20 }]}>
          <View style={styles.card}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.cardTitle}>Settings</Text>
              <Field label="Home Ollama URL (optional)" value={settings.ollamaUrl} placeholder="http://my-pc.tailscale.net:11434"
                onChange={(v) => setSettings((s) => ({ ...s, ollamaUrl: v.trim() }))} />
              <Field label="Ollama model" value={settings.ollamaModel} placeholder="llama3.1"
                onChange={(v) => setSettings((s) => ({ ...s, ollamaModel: v.trim() }))} />
              <Field label="OpenRouter key (optional)" value={settings.openRouterKey} placeholder="sk-or-v1-..." secure
                onChange={(v) => setSettings((s) => ({ ...s, openRouterKey: v.trim() }))} />
              <Field label="OpenRouter model" value={settings.openRouterModel} placeholder="openrouter/free"
                onChange={(v) => setSettings((s) => ({ ...s, openRouterModel: v.trim() }))} />
              <Text style={styles.hint}>RobinTHood Android 0.4.0. Your chats and keys stay on this phone.</Text>
              <Pressable style={styles.closeBtn} onPress={() => setSettingsOpen(false)}>
                <Text style={styles.closeText}>Done</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, placeholder, onChange, secure }) {
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

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <Chat />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { color: C.text, fontSize: 18, fontWeight: '800' },
  modelChip: { color: C.green, fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6, backgroundColor: C.panel2, borderRadius: 8 },
  headerBtnText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  gear: { color: C.dim, fontSize: 16 },
  chatContent: { padding: 14 },
  msg: { padding: 14, borderRadius: 12, marginBottom: 12, maxWidth: '88%' },
  userMsg: { backgroundColor: C.user, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  botMsg: { backgroundColor: C.panel, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: C.line },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  modelTag: { fontSize: 10, fontWeight: '700', color: C.green, textTransform: 'uppercase' },
  latency: { fontSize: 10, color: C.faint, marginLeft: 6 },
  msgText: { color: C.text, fontSize: 15, lineHeight: 22 },
  note: { color: C.faint, fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { color: C.dim, fontSize: 12, marginLeft: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  input: { flex: 1, backgroundColor: C.panel, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#f9fafb', fontSize: 15, maxHeight: 140, borderWidth: 1, borderColor: C.border },
  sendBtn: { backgroundColor: C.green, width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f9fafb', marginBottom: 14 },
  option: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4, backgroundColor: C.panel2 },
  optionActive: { backgroundColor: C.green },
  optionText: { color: C.dim, fontSize: 14 },
  hint: { color: C.faint, fontSize: 12, marginTop: 12 },
  fieldLabel: { fontSize: 12, color: C.dim, marginTop: 12, marginBottom: 6, fontWeight: '600' },
  fieldInput: { backgroundColor: C.panel2, borderRadius: 8, padding: 10, color: '#f9fafb', fontSize: 14, borderWidth: 1, borderColor: C.border },
  closeBtn: { backgroundColor: C.green, padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  closeText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
