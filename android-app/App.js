import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';

import { availableModels, labelFor } from './engines';
import { actAndAnswer } from './agent';
import { flushReports, submitReport } from './report';
import { ALL_FILES_ROOT, IS_IOS, hasAllFilesAccess, iosFolder, nameOf, openAllFilesSetting, pickFolder, pickAttachment } from './files';
import { DEFAULT_PHOTO_PROMPT, keepRecentImages } from './photos';
import { getDeviceLocale, t } from './i18n';
import { AdBanner, openAdPrivacyOptions } from './AdBanner';
import { wrapFile } from './actions';
import { detectSensitive, detokenizeText, markFor, maskSensitive, mayCollect, tokenizeSensitive } from './privacy';
import { C, F } from './theme';

import MessageRow from './components/MessageRow';
import SettingsModal from './components/SettingsModal';
import ModelPickerModal from './components/ModelPickerModal';
import ReportModal from './components/ReportModal';
import PrivacyScreen from './components/PrivacyScreen';
import ChatHistoryModal from './components/ChatHistoryModal';
import ZeroState from './components/ZeroState';
import { lightTick, successTick } from './haptics';

const ALL_FILES = Boolean(Constants.expoConfig?.extra?.allFiles);
const PACKAGE = Constants.expoConfig?.android?.package || 'com.edotwedo.robinthood';

const KEYS = {
  settings: '@robinthood_settings_v2',
  chat: '@robinthood_chat_v2',
  sessions: '@robinthood_sessions_v1',
  activeSessionId: '@robinthood_active_session_v1',
};

const DEFAULT_SETTINGS = {
  selectedModel: 'ovh-120b',
  webSearch: true,
  music: true,
  musicVolume: 0.3,
  filesUri: '',
  ollamaUrl: '',
  ollamaModel: '',
  openRouterKey: '',
  openRouterModel: '',
  obsidianVault: '',
  airGapped: false,
  isPro: false,
  lang: getDeviceLocale(),
};

const INTRO = {
  id: 'intro',
  role: 'assistant',
  intro: true,
  content: 'RobinTHood is ready. Free AI, no account. How it works: Robin routes between multiple leading AI models so you get fast, reliable answers without subscriptions. A * next to a model means it may collect your messages. Tap the model name up top to switch models. 🌐 Web on lets me search the internet and read pages myself. I can also save files, like .md notes, to a folder on your phone. ♪ turns the music on or off.',
  model: 'RobinTHood',
};

let idCounter = 0;
const newId = () => `${Date.now()}-${idCounter++}`;

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const labelsOf = (found) => [...new Set(found.map((f) => f.label))].join(', ');

const PREVIEW_CHARS = 300;
function writeDetail(action, lang) {
  const body = String(action.body || '').trim();
  const preview = body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}…` : body;
  return `${action.arg}${action.exists ? `\n${t('confirmReplaces', lang)}` : ''}\n\n“${preview}”`;
}

function withAttachment(text, file) {
  if (!file) return text;
  if (file.kind === 'image') return text || DEFAULT_PHOTO_PROMPT;
  const body = wrapFile(file.text);
  const longest = Math.max(0, ...(body.match(/`+/g) || []).map((r) => r.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${text}${text ? '\n\n' : ''}[Attached file: ${file.name}]\n${fence}\n${body}\n${fence}`;
}

function Chat() {
  const insets = useSafeAreaInsets();
  // Load the bundled fonts before first paint. If they fail, fall through to the system font
  // rather than blocking the app on a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    [F.regular]: require('./assets/fonts/Poppins-Regular.ttf'),
    [F.medium]: require('./assets/fonts/Poppins-Medium.ttf'),
    [F.semibold]: require('./assets/fonts/Poppins-SemiBold.ttf'),
    [F.bold]: require('./assets/fonts/Poppins-Bold.ttf'),
  });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [expandedSteps, setExpandedSteps] = useState({});
  const [picker, setPicker] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [reportReason, setReportReason] = useState(null);
  const [reportNote, setReportNote] = useState('');
  const [reportDone, setReportDone] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleOpenSource = async (url) => {
    if (!url || typeof url !== 'string') return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
    } catch {}
  };

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const theme = useAudioPlayer(require('./assets/theme.m4a'));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded || !theme) return;
    try {
      theme.loop = true;
      theme.volume = settings.musicVolume;
      if (settings.music) theme.play(); else theme.pause();
    } catch {}
  }, [theme, loaded, settings.music, settings.musicVolume]);

  const abortRef = useRef(null);
  const pendingAskRef = useRef(null);
  const tokenMapRef = useRef({});

  // Unified ask helper for confirmations
  const ask = useCallback(({ title, body, buttons, cancelValue = false }) => {
    return new Promise((resolve) => {
      pendingAskRef.current = () => resolve(cancelValue);
      setStatus(t('confirmWaiting', settings.lang));
      const alertButtons = buttons.map((b) => ({
        text: b.text,
        style: b.style,
        onPress: () => resolve(b.value),
      }));
      Alert.alert(title, body, alertButtons, {
        cancelable: true,
        onDismiss: () => resolve(cancelValue),
      });
    });
  }, [settings.lang]);

  useEffect(() => {
    (async () => {
      try {
        const [s, sessStr, legacyChat] = await Promise.all([
          AsyncStorage.getItem(KEYS.settings),
          AsyncStorage.getItem(KEYS.sessions),
          AsyncStorage.getItem(KEYS.chat),
        ]);
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s), ...(__DEV__ ? {} : { isPro: false }) });

        let loadedSessions = [];
        if (sessStr) {
          try {
            loadedSessions = JSON.parse(sessStr) || [];
          } catch {}
        }
        if (!loadedSessions.length && legacyChat) {
          try {
            const parsedLegacy = JSON.parse(legacyChat);
            if (Array.isArray(parsedLegacy) && parsedLegacy.some((m) => m.role === 'user')) {
              const firstUser = parsedLegacy.find((m) => m.role === 'user');
              const title = firstUser?.content?.slice(0, 32).trim() || 'Previous Chat';
              loadedSessions = [{
                id: 'sess_' + Date.now(),
                title,
                updatedAt: Date.now(),
                messages: parsedLegacy.filter((m) => !m.intro),
              }];
            }
          } catch {}
        }

        const storedActiveId = await AsyncStorage.getItem(KEYS.activeSessionId);
        let currentSess = loadedSessions.find((x) => x.id === storedActiveId) || loadedSessions[0];
        if (!currentSess) {
          currentSess = {
            id: 'sess_' + Date.now(),
            title: 'New Chat',
            updatedAt: Date.now(),
            messages: [],
          };
          loadedSessions = [currentSess];
        }

        setSessions(loadedSessions);
        setActiveSessionId(currentSess.id);
        setMessages((currentSess.messages || []).filter((m) => !m.intro));
      } catch {}
      setLoaded(true);
      flushReports().catch(() => {});
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);

  useEffect(() => {
    if (!loaded || !activeSessionId) return;
    const cleanMsgs = keepRecentImages(messages.slice(-200));
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === activeSessionId);
      let title = prev[idx]?.title;
      const firstUserMsg = cleanMsgs.find((m) => m.role === 'user');
      if (firstUserMsg && (!title || title === 'New Chat')) {
        title = firstUserMsg.content.slice(0, 34).trim() + (firstUserMsg.content.length > 34 ? '…' : '');
      }
      const updated = {
        id: activeSessionId,
        title: title || 'New Chat',
        updatedAt: Date.now(),
        messages: cleanMsgs,
      };
      const nextSessions = idx >= 0
        ? [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
        : [updated, ...prev];
      if (!busy) {
        AsyncStorage.setItem(KEYS.sessions, JSON.stringify(nextSessions)).catch(() => {});
        AsyncStorage.setItem(KEYS.chat, JSON.stringify(cleanMsgs)).catch(() => {});
      }
      return nextSessions;
    });
  }, [messages, loaded, busy, activeSessionId]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(async (override, opts = {}) => {
    lightTick();
    const checked = typeof override === 'string';
    const text = (checked ? override : input).trim();
    const file = checked ? opts.file : attachment;
    if ((!text && !file) || busy) return;
    const collects = mayCollect(settings.selectedModel || 'auto');

    let currentMessages = (opts.retryHistory || messages).filter((m) => !m.intro);
    const unseen = (m) => m.role === 'user' && !m.sharedStar;
    if (!checked && collects) {
      const earlier = currentMessages.filter(unseen).map((m) => m.content).join('\n');
      const earlierFound = earlier ? detectSensitive(earlier) : [];
      const textFound = text ? detectSensitive(text) : [];
      const fileFound = (file && file.text) ? detectSensitive(file.text) : [];
      const found = [...earlierFound, ...textFound, ...fileFound];
      if (found.length) {
        const where = earlierFound.length ? 'This chat' : fileFound.length ? 'Your file' : 'Your message';
        Alert.alert(
          'Looks like private info',
          `${where} seems to include: ${labelsOf(found)}. The model you're using (marked *) may collect messages, including earlier ones in this chat.`,
          [
            { text: 'Mask it & send', onPress: () => send(maskSensitive(text).text, { maskEarlier: true, file: file?.kind === 'text' ? { ...file, text: maskSensitive(file.text).text } : file, retryHistory: opts.retryHistory }) },
            { text: 'Send anyway', style: 'destructive', onPress: () => send(text, { file, retryHistory: opts.retryHistory }) },
            { text: 'Edit', style: 'cancel' },
          ],
        );
        return;
      }
    }

    let prior = currentMessages;
    if (opts.maskEarlier) prior = prior.map((m) => (unseen(m) ? { ...m, content: maskSensitive(m.content).text } : m));
    if (collects) prior = prior.map((m) => (unseen(m) ? { ...m, sharedStar: true } : m));

    const userMsg = {
      id: newId(), role: 'user', content: withAttachment(text, file),
      ...(file ? { attachment: file.name, typed: text } : {}), ...(file?.kind === 'image' ? { image: file.base64 } : {}),
      ...(collects ? { sharedStar: true } : {}),
    };
    const replyId = newId();
    const history = [...prior, userMsg];
    setMessages([...history, { id: replyId, role: 'assistant', content: '', model: labelFor(settings.selectedModel, settings), pending: true }]);
    setInput('');
    setAttachment(null);
    setBusy(true);
    scrollToEnd();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const update = (patch) => setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...patch } : m)));

    try {
      const activeSettings = settings.airGapped
        ? { ...settings, webSearch: false, selectedModel: 'ollama' }
        : settings;
      const effectiveFolder = activeSettings.obsidianVault && ALL_FILES
        ? activeSettings.obsidianVault
        : 'Documents/RobinTHood';

      const result = await actAndAnswer({
        history,
        settings: activeSettings,
        signal: ctrl.signal,
        ctx: {
          web: activeSettings.webSearch,
          allFiles: ALL_FILES,
          defaultFolder: effectiveFolder,
          tokenMap: tokenMapRef.current,
          lang: activeSettings.lang || 'en',
          getFolder: async () => {
            if (IS_IOS) return iosFolder();
            if (ALL_FILES) {
              if (await hasAllFilesAccess()) return ALL_FILES_ROOT;
              setStatus('Turn on All files access for Robin, then ask again…');
              await openAllFilesSetting(PACKAGE);
              throw new Error('All files access is off. Switch it on in the screen that just opened, come back, and ask again');
            }
            if (settingsRef.current.filesUri) return settingsRef.current.filesUri;
            setStatus('Pick a folder for Robin\'s files…');
            const uri = await pickFolder();
            setSettings((s) => ({ ...s, filesUri: uri }));
            settingsRef.current = { ...settingsRef.current, filesUri: uri };
            return uri;
          },
          confirm: (action) => {
            const lang = settings.lang;
            const detail = action.kind === 'OPEN' ? action.arg
              : action.kind === 'LIST' ? (action.arg || t('confirmYourFiles', lang))
              : (action.kind === 'WRITE' || action.kind === 'APPEND') ? writeDetail(action, lang)
              : action.arg;
            return ask({
              title: t(action.kind === 'WRITE' && action.exists ? 'confirmWRITEReplace' : `confirm${action.kind}`, lang),
              body: `${detail}\n\n${t('confirmWhy', lang)}`,
              buttons: [
                { text: t('confirmDeny', lang), style: 'cancel', value: false },
                { text: t('confirmAllow', lang), value: true },
              ],
            });
          },
          confirmFallback: ({ from, to, found }) => {
            const lang = settings.lang;
            let body = fill(t('fallbackBody', lang), { from, to });
            if (found.length) body += `\n\n${fill(t('fallbackFound', lang), { what: labelsOf(found) })}`;
            return ask({
              title: t('fallbackTitle', lang),
              body,
              buttons: [
                { text: t('fallbackStop', lang), style: 'cancel', value: false },
                ...(found.length ? [{ text: t('fallbackMask', lang), value: 'mask' }] : []),
                { text: t('fallbackSend', lang), style: found.length ? 'destructive' : 'default', value: 'send' },
              ],
            });
          },
          confirmShare: ({ name, to, found }) => {
            const lang = settings.lang;
            return ask({
              title: t('shareTitle', lang),
              body: fill(t('shareBody', lang), { name, to, what: labelsOf(found) }),
              buttons: [
                { text: t('shareKeep', lang), style: 'cancel', value: false },
                { text: t('fallbackMask', lang), value: 'mask' },
                { text: t('shareSend', lang), style: 'destructive', value: 'send' },
              ],
            });
          },
        },
        onEvent: (ev) => {
          if (ev.type === 'text') { setStatus(`Asking ${ev.model}…`); update({ content: ev.text, model: ev.model }); }
          if (ev.type === 'thinking') { setStatus(`${ev.model} is thinking…`); update({ thinking: ev.text, model: ev.model }); }
          if (ev.type === 'step') { setStatus(ev.label + '…'); update({ steps: ev.steps, content: '', thinking: '' }); }
          if (ev.type === 'model') update({ model: ev.model });
        },
      });

      if (result.ok) {
        update({
          content: result.text,
          followups: result.followups,
          model: result.model,
          seconds: result.seconds,
          sources: result.sources,
          verify: result.verify,
          steps: result.steps,
          tainted: result.tainted || undefined,
          note: result.forPhoto ? `${labelFor(settings.selectedModel, settings)} can't see photos, so ${result.model} answered`
            : result.fellBack ? `${labelFor(settings.selectedModel, settings)} failed, used ${result.model}` : undefined,
          pending: false,
          thinking: undefined,
        });
        successTick();
      } else {
        update({ content: result.text, model: 'error', error: true, pending: false, thinking: undefined });
      }
    } catch (err) {
      update({ content: err.message === 'Stopped' ? '(stopped)' : `Error: ${err.message}`, error: true, pending: false, thinking: undefined });
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStatus('');
      scrollToEnd();
    }
  }, [input, attachment, busy, messages, settings, scrollToEnd, ask]);

  const attachFile = async () => {
    try {
      const file = await pickAttachment();
      if (file) setAttachment(file);
    } catch (err) {
      Alert.alert('Can\'t attach that file', err.message);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    pendingAskRef.current?.();
    pendingAskRef.current = null;
  };

  const newChat = () => {
    if (busy) stop();
    lightTick();
    tokenMapRef.current = {};
    const newSessId = 'sess_' + Date.now();
    const newSess = {
      id: newSessId,
      title: 'New Chat',
      updatedAt: Date.now(),
      messages: [],
    };
    setSessions((prev) => [newSess, ...prev]);
    setActiveSessionId(newSessId);
    setMessages([]);
    AsyncStorage.setItem(KEYS.activeSessionId, newSessId).catch(() => {});
  };

  const handleSelectSession = (sess) => {
    if (busy) stop();
    lightTick();
    tokenMapRef.current = {};
    setActiveSessionId(sess.id);
    setMessages((sess.messages || []).filter((m) => !m.intro));
    AsyncStorage.setItem(KEYS.activeSessionId, sess.id).catch(() => {});
  };

  const handleDeleteSession = (sessId) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessId);
      AsyncStorage.setItem(KEYS.sessions, JSON.stringify(next)).catch(() => {});
      if (sessId === activeSessionId) {
        const fallback = next[0] || {
          id: 'sess_' + Date.now(),
          title: 'New Chat',
          updatedAt: Date.now(),
          messages: [],
        };
        setActiveSessionId(fallback.id);
        setMessages((fallback.messages || []).filter((m) => !m.intro));
        AsyncStorage.setItem(KEYS.activeSessionId, fallback.id).catch(() => {});
        if (!next.length) return [fallback];
      }
      return next;
    });
  };

  const handleClearAllSessions = () => {
    const fresh = {
      id: 'sess_' + Date.now(),
      title: 'New Chat',
      updatedAt: Date.now(),
      messages: [],
    };
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setMessages([]);
    AsyncStorage.setItem(KEYS.sessions, JSON.stringify([fresh])).catch(() => {});
    AsyncStorage.setItem(KEYS.activeSessionId, fresh.id).catch(() => {});
    AsyncStorage.removeItem(KEYS.chat).catch(() => {});
  };

  const handleRetry = (botMsg) => {
    if (busy) return;
    lightTick();
    const botIdx = messages.findIndex((m) => m.id === botMsg.id);
    if (botIdx < 0) return;
    const precedingUser = [...messages.slice(0, botIdx)].reverse().find((m) => m.role === 'user');
    if (!precedingUser) return;
    const userIdx = messages.findIndex((m) => m.id === precedingUser.id);
    const trimmed = messages.slice(0, userIdx + 1);
    setMessages(trimmed);
    send(precedingUser.content, { retryHistory: trimmed.slice(0, -1) });
  };

  const openReport = (item) => {
    const idx = messages.findIndex((m) => m.id === item.id);
    const question = [...messages.slice(0, idx)].reverse().find((m) => m.role === 'user')?.content || '';
    setReporting({ message: item, question });
    setReportReason(null);
    setReportNote('');
    setReportDone('');
  };

  const sendReport = async () => {
    if (!reporting || !reportReason || reportSending) return;
    setReportSending(true);
    let outcome;
    try {
      outcome = await submitReport({
        reason: reportReason,
        note: reportNote.trim(),
        model: reporting.message.model,
        question: reporting.question,
        answer: reporting.message.content,
        version: Constants.expoConfig?.version,
      });
    } finally {
      setReportSending(false);
    }
    setMessages((prev) => prev.map((m) => (m.id === reporting.message.id ? { ...m, reported: true } : m)));
    setReportDone(
      outcome === 'sent' ? 'Thanks. Your report was sent.'
        : outcome === 'queued' ? 'Thanks. Your report is saved and will be retried later.'
          : 'Sorry, the report could not be sent. Please try again.'
    );
  };

  const toggleSteps = (id) => setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));

  const models = availableModels(settings);

  if (!fontsLoaded && !fontError) return <View style={styles.boot} />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.title}>{t('appTitle', settings.lang)}</Text>
            {settings.isPro ? <Text style={styles.proBadge}>PRO</Text> : null}
          </View>
          <Pressable onPress={() => setPicker(true)} hitSlop={8}>
            <Text style={styles.modelChip} numberOfLines={1}>
              {labelFor(settings.selectedModel, settings)}
              {markFor(settings.selectedModel || 'auto')} ▾
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setSettings((s) => ({ ...s, webSearch: !s.webSearch }))}
          style={[styles.headerBtn, settings.webSearch && styles.webOn]}
          hitSlop={8}
        >
          <Text style={[styles.headerBtnText, settings.webSearch && { color: '#fff' }]}>{t('webBtn', settings.lang)}</Text>
        </Pressable>
        <Pressable
          onPress={() => setSettings((s) => ({ ...s, music: !s.music }))}
          style={[styles.headerBtn, settings.music && styles.webOn]}
          hitSlop={8}
        >
          <Text style={[styles.headerBtnText, settings.music && { color: '#fff' }]}>{settings.music ? '♪' : '♪̸'}</Text>
        </Pressable>
        <Pressable onPress={() => setHistoryOpen(true)} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>💬</Text>
        </Pressable>
        <Pressable onPress={newChat} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>{t('newChat', settings.lang)}</Text>
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
          ListEmptyComponent={
            <ZeroState
              onSelectPrompt={(p) => send(p)}
              onOpenPrivacy={() => setPrivacyOpen(true)}
            />
          }
          renderItem={({ item }) => (
            <MessageRow
              item={item}
              settings={settings}
              isExpanded={expandedSteps[item.id]}
              toggleSteps={toggleSteps}
              openReport={openReport}
              onOpenPrivacy={() => setPrivacyOpen(true)}
              handleOpenSource={handleOpenSource}
              status={status}
              streaming={busy}
              onSuggest={(q) => setInput(q)}
              onRetry={handleRetry}
            />
          )}
          contentContainerStyle={[
            styles.chatContent,
            messages.length === 0 && { flexGrow: 1, justifyContent: 'center' },
            { paddingBottom: 16 }
          ]}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        />
        {attachment ? (
          <View style={styles.attachBar}>
            <Text style={styles.attachChip} numberOfLines={1}>{attachment.kind === 'image' ? '📷' : '📎'} {attachment.name}</Text>
            <Pressable onPress={() => setAttachment(null)} hitSlop={10}><Text style={styles.attachRemove}>✕</Text></Pressable>
          </View>
        ) : null}
        <View style={[styles.inputRow, { paddingBottom: isKeyboardVisible ? 8 : Math.max(insets.bottom, 10) }]}>
          <Pressable style={styles.attachBtn} onPress={attachFile} disabled={busy} hitSlop={6}>
            <Text style={styles.attachIcon}>📎</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t('inputPlaceholder', settings.lang)}
            placeholderTextColor={C.faint}
            multiline
            onFocus={scrollToEnd}
          />
          {busy ? (
            <Pressable style={[styles.sendBtn, { backgroundColor: C.red }]} onPress={stop}>
              <Text style={styles.sendText}>■</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.sendBtn, !input.trim() && !attachment && { opacity: 0.4 }]} onPress={send} disabled={!input.trim() && !attachment}>
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          )}
        </View>
        {!settings.isPro ? <AdBanner hidden={isKeyboardVisible} /> : null}
      </KeyboardAvoidingView>

      <ReportModal
        visible={!!reporting}
        onClose={() => setReporting(null)}
        reportDone={reportDone}
        reportReason={reportReason}
        setReportReason={setReportReason}
        reportNote={reportNote}
        setReportNote={setReportNote}
        reportSending={reportSending}
        sendReport={sendReport}
      />

      <PrivacyScreen
        visible={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        settings={settings}
        insetTop={insets.top}
      />

      <ModelPickerModal
        visible={picker}
        onClose={() => setPicker(false)}
        models={models}
        selectedModel={settings.selectedModel}
        onSelectModel={(id) => {
          setSettings((s) => ({ ...s, selectedModel: id }));
          setPicker(false);
        }}
        onOpenPrivacy={() => {
          setPicker(false);
          setPrivacyOpen(true);
        }}
      />

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        setSettings={setSettings}
        onOpenPrivacy={() => {
          setSettingsOpen(false);
          setPrivacyOpen(true);
        }}
        insetsTop={insets.top}
        isIos={IS_IOS}
        allFiles={ALL_FILES}
        packageName={PACKAGE}
        openAllFilesSetting={openAllFilesSetting}
        openAdPrivacyOptions={openAdPrivacyOptions}
        handleOpenSource={handleOpenSource}
      />

      <ChatHistoryModal
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={newChat}
        onDeleteSession={handleDeleteSession}
        onClearAll={handleClearAllSessions}
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
  boot: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { color: C.text, fontSize: 19, fontFamily: F.bold },
  modelChip: { color: C.green, fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6, backgroundColor: C.panel2, borderRadius: 8 },
  headerBtnText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  webOn: { backgroundColor: '#065f46' },
  gear: { color: C.dim, fontSize: 16 },
  chatContent: { padding: 14 },
  proBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0b0f19',
    backgroundColor: C.green,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    overflow: 'hidden',
  },
  attachBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  attachChip: { color: C.dim, fontSize: 12, flexShrink: 1, marginBottom: 4 },
  attachRemove: { color: C.faint, fontSize: 14, marginLeft: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  attachBtn: { width: 36, height: 42, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  attachIcon: { fontSize: 20 },
  input: { flex: 1, backgroundColor: C.panel, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#f9fafb', fontSize: 15.5, fontFamily: F.regular, maxHeight: 140, borderWidth: 1, borderColor: C.border },
  sendBtn: { backgroundColor: C.green, width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  sendText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
