import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { availableModels, labelFor } from './engines';
import { actAndAnswer } from './agent';
import { flushReports, REPORT_REASONS, submitReport } from './report';
import Constants from 'expo-constants';
import { ALL_FILES_ROOT, IS_IOS, hasAllFilesAccess, iosFolder, nameOf, openAllFilesSetting, pickFolder } from './files';
import { getDeviceLocale, t } from './i18n';
import { AdBanner, openAdPrivacyOptions } from './AdBanner';
import { parseBlocks, parseInline } from './markdown';
import { AVOID, FINE, HOW_IT_WORKS, OBFUSCATE, SELF_CHECK, assess, detectSensitive, markFor, maskSensitive, mayCollect, privacyOf } from './privacy';

// Phil's personal build (whole-phone file access) vs the Play Store build.
const ALL_FILES = Boolean(Constants.expoConfig?.extra?.allFiles);
const PACKAGE = Constants.expoConfig?.android?.package || 'com.edotwedo.robinthood';

const KEYS = {
  settings: '@robinthood_settings_v2',
  chat: '@robinthood_chat_v2',
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
  isPro: false,
  lang: getDeviceLocale(),
};

const INTRO = {
  id: 'intro',
  role: 'assistant',
  intro: true,
  content: 'RobinTHood is ready. Free AI, no account. How it works: Robin has no AI of its own. It hops between free services, and we do that work for you. A * next to a model means it may collect your messages. Tap the model name up top to switch models. 🌐 Web on lets me search the internet and read pages myself. I can also save files, like .md notes, to a folder on your phone. ♪ turns the music on or off.',
  model: 'RobinTHood',
};

const C = {
  bg: '#0b0f19', panel: '#111827', panel2: '#1f2937', line: '#1f2937', border: '#374151',
  text: '#f3f4f6', dim: '#9ca3af', faint: '#6b7280', green: '#10b981', user: '#1e293b', red: '#f87171',
};

let idCounter = 0;
const newId = () => `${Date.now()}-${idCounter++}`;

// The last few lines of a model's running reasoning, cut at a word, for the live panel.
// The reply header only keeps the model's label, so find its engine to get the mark.
function markForLabel(label, settings) {
  const m = availableModels(settings).find((x) => x.label === label);
  return m ? markFor(m.id) : '';
}

const THINKING_TAIL_CHARS = 420;
function thinkingTail(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= THINKING_TAIL_CHARS) return t;
  const cut = t.slice(-THINKING_TAIL_CHARS);
  return '…' + cut.slice(cut.indexOf(' ') + 1);
}

// "{name} is busy" with { name: 'X' } -> "X is busy", for the translated dialog strings.
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const labelsOf = (found) => [...new Set(found.map((f) => f.label))].join(', ');

// What the WRITE tap shows: the name, whether it replaces a file, and how the contents start.
const PREVIEW_CHARS = 300;
function writeDetail(action, lang) {
  const body = String(action.body || '').trim();
  const preview = body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}…` : body;
  return `${action.arg}${action.exists ? `\n${t('confirmReplaces', lang)}` : ''}\n\n“${preview}”`;
}

function openLink(url) {
  if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
}

// Inline spans from markdown.js as nested Text, so bold, links etc. wrap with the line.
function Inline({ text, style }) {
  return (
    <Text selectable style={style}>
      {parseInline(text).map((s, i) => (
        <Text
          key={i}
          style={[
            s.bold && styles.mdBold,
            s.italic && styles.mdItalic,
            s.strike && styles.mdStrike,
            s.code && styles.mdInlineCode,
            s.url && styles.mdLink,
            s.hint && styles.mdHint,
          ]}
          onPress={s.url ? () => openLink(s.url) : undefined}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

const HEADING_STYLES = [null, 'mdH1', 'mdH2', 'mdH3', 'mdH4', 'mdH4', 'mdH4'];

function FormattedMessage({ text }) {
  if (!text) return null;
  const blocks = parseBlocks(text);
  return (
    <View style={styles.formattedContainer}>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'code':
            return (
              <View key={idx} style={styles.codeBlock}>
                <View style={styles.codeHeader}>
                  <Text style={styles.codeLang}>{b.lang || 'code'}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                  <Text selectable style={styles.codeText}>{b.text}</Text>
                </ScrollView>
              </View>
            );
          case 'heading':
            return <Inline key={idx} text={b.text} style={[styles.msgText, styles[HEADING_STYLES[b.level]]]} />;
          case 'hr':
            return <View key={idx} style={styles.mdHr} />;
          case 'quote':
            return (
              <View key={idx} style={styles.mdQuote}>
                <Inline text={b.text} style={[styles.msgText, styles.mdQuoteText]} />
              </View>
            );
          case 'item':
            return (
              <View key={idx} style={[styles.mdItem, { paddingLeft: 4 + b.depth * 16 }]}>
                <Text style={[styles.msgText, styles.mdMarker]}>{b.ordered ? `${b.number}.` : b.depth ? '◦' : '•'}</Text>
                <Inline text={b.text} style={[styles.msgText, styles.mdItemText]} />
              </View>
            );
          case 'table':
            return (
              <ScrollView key={idx} horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                <View style={styles.mdTable}>
                  {[b.header, ...b.rows].map((row, r) => (
                    <View key={r} style={[styles.mdRow, r === 0 && styles.mdHeadRow]}>
                      {row.map((cell, c) => (
                        <View key={c} style={styles.mdCell}>
                          <Inline text={cell} style={[styles.mdCellText, r === 0 && styles.mdBold]} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          default:
            return <Inline key={idx} text={b.text} style={styles.msgText} />;
        }
      })}
    </View>
  );
}

const TONE_COLOR = { ok: '#34d399', warn: '#fbbf24' };

// Plain-language explanation of how Robin is free, who can see messages, and a short
// self check. Everything on it is computed on the phone; no answers are stored or sent.
function PrivacyScreen({ visible, onClose, settings, insetTop }) {
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
            {HOW_IT_WORKS.map((line, i) => <Text key={i} style={styles.privPara}>{line}</Text>)}

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
                  <Pressable key={i} style={[styles.option, answers[q.id] === i && styles.optionActive]} onPress={() => setAnswers((a) => ({ ...a, [q.id]: i }))}>
                    <Text style={[styles.optionText, answers[q.id] === i && { color: '#fff', fontWeight: '700' }]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {result ? (
              <View style={styles.privResult}>
                <Text style={[styles.privHead, { marginTop: 0, color: result.tier === 'low' ? TONE_COLOR.ok : TONE_COLOR.warn }]}>{result.headline}</Text>
                <Text style={styles.privPara}>{result.body}</Text>
              </View>
            ) : null}

            <Text style={styles.privHead}>Keep these out of chats</Text>
            {AVOID.map((x, i) => <Text key={i} style={styles.privItem}>✕  {x}</Text>)}
            <Text style={styles.privHead}>Usually fine</Text>
            {FINE.map((x, i) => <Text key={i} style={styles.privItem}>✓  {x}</Text>)}
            <Text style={styles.privHead}>How to share less</Text>
            {OBFUSCATE.map((x, i) => <Text key={i} style={styles.privItem}>•  {x}</Text>)}
            <Text style={[styles.privNote, { marginTop: 14 }]}>This is general guidance, not legal or security advice. Robin also checks your message for things like emails, phone numbers and card numbers before it goes to a model marked *, and offers to mask them.</Text>
          </ScrollView>
          <Pressable style={[styles.pill, { marginTop: 10, alignItems: 'center' }]} onPress={onClose}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Chat() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState([INTRO]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [expandedSteps, setExpandedSteps] = useState({});
  const [picker, setPicker] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reporting, setReporting] = useState(null); // { message, question }
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

  // Background theme: loops while the app is open, mixes with other audio,
  // stops when the app goes to the background.
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

  // Load saved settings and conversation.
  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([AsyncStorage.getItem(KEYS.settings), AsyncStorage.getItem(KEYS.chat)]);
        // Pro can only be switched on in a dev build (see Settings), so a saved flag
        // from an older release build doesn't keep ads off.
        if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s), ...(__DEV__ ? {} : { isPro: false }) });
        if (c) {
          const saved = JSON.parse(c);
          if (Array.isArray(saved) && saved.length) setMessages(saved);
        }
      } catch {}
      setLoaded(true);
      flushReports().catch(() => {});
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

  const send = useCallback(async (override, opts = {}) => {
    // onPress hands us the tap event; only a string means "send exactly this".
    const checked = typeof override === 'string';
    const text = (checked ? override : input).trim();
    if (!text || busy) return;
    const collects = mayCollect(settings.selectedModel || 'auto');
    // The earlier chat goes along with every message, so a * model also gets what was
    // typed while a model with no * was picked. Check the user messages it hasn't seen
    // yet (no sharedStar) along with this one.
    const unseen = (m) => m.role === 'user' && !m.sharedStar;
    if (!checked && collects) {
      const earlier = messages.filter(unseen).map((m) => m.content).join('\n');
      const found = detectSensitive(`${earlier}\n${text}`);
      if (found.length) {
        const where = detectSensitive(earlier).length ? 'This chat' : 'Your message';
        Alert.alert(
          'Looks like private info',
          `${where} seems to include: ${labelsOf(found)}. The model you're using (marked *) may collect messages, including earlier ones in this chat.`,
          [
            { text: 'Mask it & send', onPress: () => send(maskSensitive(text).text, { maskEarlier: true }) },
            { text: 'Send anyway', style: 'destructive', onPress: () => send(text) },
            { text: 'Edit', style: 'cancel' },
          ],
        );
        return;
      }
    }
    let prior = messages;
    if (opts.maskEarlier) prior = prior.map((m) => (unseen(m) ? { ...m, content: maskSensitive(m.content).text } : m));
    if (collects) prior = prior.map((m) => (unseen(m) ? { ...m, sharedStar: true } : m));
    const userMsg = { id: newId(), role: 'user', content: text, ...(collects ? { sharedStar: true } : {}) };
    const replyId = newId();
    const history = [...prior, userMsg];
    setMessages([...history, { id: replyId, role: 'assistant', content: '', model: labelFor(settings.selectedModel, settings), pending: true }]);
    setInput('');
    setBusy(true);
    scrollToEnd();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const update = (patch) => setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...patch } : m)));

    try {
      // Robin acts for itself: web search and page reading (when Web is on) and
      // its folder of files on the phone (always).
      const result = await actAndAnswer({
        history,
        settings,
        signal: ctrl.signal,
        ctx: {
          web: settings.webSearch,
          allFiles: ALL_FILES,
          lang: settings.lang || 'en',
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
          // After Robin has read the web, a page could be steering it; the user approves each risky step.
          confirm: (action) => new Promise((resolve) => {
            const lang = settings.lang;
            const detail = action.kind === 'OPEN' ? action.arg
              : action.kind === 'LIST' ? (action.arg || t('confirmYourFiles', lang))
              : action.kind === 'WRITE' ? writeDetail(action, lang)
              : action.arg;
            setStatus(t('confirmWaiting', lang));
            Alert.alert(
              t(action.kind === 'WRITE' && action.exists ? 'confirmWRITEReplace' : `confirm${action.kind}`, lang),
              `${detail}\n\n${t('confirmWhy', lang)}`,
              [
                { text: t('confirmDeny', lang), style: 'cancel', onPress: () => resolve(false) },
                { text: t('confirmAllow', lang), onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          }),
          // The chosen model (no *) or Home Ollama failed and the next one may collect
          // messages. Resolves 'mask', 'send' or false.
          confirmFallback: ({ from, to, found }) => new Promise((resolve) => {
            const lang = settings.lang;
            let body = fill(t('fallbackBody', lang), { from, to });
            if (found.length) body += `\n\n${fill(t('fallbackFound', lang), { what: labelsOf(found) })}`;
            setStatus(t('confirmWaiting', lang));
            Alert.alert(
              t('fallbackTitle', lang),
              body,
              [
                { text: t('fallbackStop', lang), style: 'cancel', onPress: () => resolve(false) },
                ...(found.length ? [{ text: t('fallbackMask', lang), onPress: () => resolve('mask') }] : []),
                { text: t('fallbackSend', lang), style: found.length ? 'destructive' : 'default', onPress: () => resolve('send') },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          }),
          // A file Robin read has private details and the model may collect messages.
          // Resolves 'mask', 'send' or false (keep the file out of the chat).
          confirmShare: ({ name, to, found }) => new Promise((resolve) => {
            const lang = settings.lang;
            setStatus(t('confirmWaiting', lang));
            Alert.alert(
              t('shareTitle', lang),
              fill(t('shareBody', lang), { name, to, what: labelsOf(found) }),
              [
                { text: t('shareKeep', lang), style: 'cancel', onPress: () => resolve(false) },
                { text: t('fallbackMask', lang), onPress: () => resolve('mask') },
                { text: t('shareSend', lang), style: 'destructive', onPress: () => resolve('send') },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          }),
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
          model: result.model,
          seconds: result.seconds,
          sources: result.sources,
          steps: result.steps,
          note: result.fellBack ? `${labelFor(settings.selectedModel, settings)} failed, used ${result.model}` : undefined,
          pending: false,
          thinking: undefined,
        });
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
  }, [input, busy, messages, settings, scrollToEnd]);

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    if (busy) stop();
    setMessages([INTRO]);
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
    setReportDone(outcome === 'sent' ? 'Thanks. Your report was sent.' : 'Thanks. Your report is saved and will be sent when the connection is back.');
  };

  const toggleSteps = (id) => setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderItem = ({ item }) => {
    const mine = item.role === 'user';
    const isExpanded = expandedSteps[item.id];
    return (
      <View style={[styles.msg, mine ? styles.userMsg : styles.botMsg]}>
        {!mine && (
          <View style={styles.msgHeader}>
            <Text style={[styles.modelTag, item.error && { color: C.red }]}>{item.model}{markForLabel(item.model, settings)}</Text>
            {item.seconds ? <Text style={styles.latency}>{item.seconds.toFixed(1)}s</Text> : null}
            {!item.intro && !item.pending && item.content ? (
              <Pressable style={styles.reportBtn} hitSlop={10} onPress={() => openReport(item)}>
                <Text style={styles.reportText}>{item.reported ? 'Reported' : '⚑ Report'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {item.steps?.length ? (
          <View style={styles.stepsContainer}>
            {item.pending ? (
              <View style={styles.stepsList}>
                {item.steps.map((st, i) => (
                  <Text key={i} style={styles.step} numberOfLines={1}>
                    {st.startsWith('Searching') ? '🔎 ' : st.startsWith('Reading') ? '📄 ' : st.startsWith('Saving') ? '💾 ' : '📁 '}
                    {st}
                  </Text>
                ))}
              </View>
            ) : (
              <>
                <Pressable
                  style={styles.stepsToggle}
                  onPress={() => toggleSteps(item.id)}
                  hitSlop={6}
                >
                  <Text style={styles.stepsToggleText}>
                    {isExpanded ? '▾' : '▸'} {item.steps.length} research {item.steps.length === 1 ? 'step' : 'steps'}
                  </Text>
                </Pressable>
                {isExpanded ? (
                  <View style={styles.stepsList}>
                    {item.steps.map((st, i) => (
                      <Text key={i} style={styles.step} numberOfLines={1}>
                        {st.startsWith('Searching') ? '🔎 ' : st.startsWith('Reading') ? '📄 ' : st.startsWith('Saving') ? '💾 ' : '📁 '}
                        {st}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}
        {item.intro ? (
          <Pressable style={styles.linkBtn} onPress={() => setPrivacyOpen(true)}>
            <Text style={styles.linkBtnText}>How Robin is free, and your data ›</Text>
          </Pressable>
        ) : null}
        {item.content ? (
          <FormattedMessage text={item.content} />
        ) : (
          <>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={C.green} />
              <Text style={styles.loadingText}>{status || 'Thinking…'}</Text>
            </View>
            {item.pending && item.thinking ? (
              // Thinking models reason for up to a few minutes before answering; show the
              // latest of it live so the wait isn't a blank spinner.
              <View style={styles.thinkingBox}>
                <Text style={styles.thinkingText}>{thinkingTail(item.thinking)}</Text>
              </View>
            ) : null}
          </>
        )}
        {item.sources?.length ? (
          <View style={styles.sourcesContainer}>
            <Text style={styles.sourcesHeader}>SOURCES</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.sourcesScroll}
              contentContainerStyle={styles.sourcesRow}
            >
              {item.sources.map((src, i) => {
                let domain = '';
                try { domain = new URL(src.url).hostname.replace(/^www\./, ''); } catch { domain = 'web'; }
                return (
                  <Pressable
                    key={src.url || i}
                    style={[styles.sourceCard, src.opened && styles.sourceCardOpened]}
                    onPress={() => handleOpenSource(src.url)}
                  >
                    <View style={styles.sourceCardHeader}>
                      <Text style={styles.sourceBadge}>{src.opened ? '📄 READ' : '🔗 LINK'}</Text>
                      <Text style={styles.sourceDomain} numberOfLines={1}>{domain}</Text>
                    </View>
                    <Text style={styles.sourceTitle} numberOfLines={2}>{src.title}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
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
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.title}>{t('appTitle', settings.lang)}</Text>
            {settings.isPro ? <Text style={styles.proBadge}>PRO</Text> : null}
          </View>
          <Pressable onPress={() => setPicker(true)} hitSlop={8}>
            <Text style={styles.modelChip} numberOfLines={1}>{labelFor(settings.selectedModel, settings)}{markFor(settings.selectedModel || 'auto')} ▾</Text>
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
        <Pressable onPress={newChat} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.headerBtnText}>{t('newChat', settings.lang)}</Text>
        </Pressable>
        <Pressable onPress={() => setSettingsOpen(true)} style={styles.headerBtn} hitSlop={8}>
          <Text style={styles.gear}>⚙</Text>
        </Pressable>
      </View>

      {/* Android runs edge-to-edge (app.json), so the system no longer resizes the window for
          the keyboard; without padding here the keyboard covered the text box while typing. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.chatContent, { paddingBottom: 16 }]}
          onContentSizeChange={scrollToEnd}
          keyboardShouldPersistTaps="handled"
        />
        <View style={[styles.inputRow, { paddingBottom: isKeyboardVisible ? 8 : Math.max(insets.bottom, 10) }]}>
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
            <Pressable style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]} onPress={send} disabled={!input.trim()}>
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          )}
        </View>
        {/* Kept mounted while the keyboard is up (hidden instead), so typing a message doesn't load a new ad. */}
        {!settings.isPro ? <AdBanner hidden={isKeyboardVisible} /> : null}
      </KeyboardAvoidingView>

      <Modal visible={!!reporting} transparent animationType="fade" onRequestClose={() => setReporting(null)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            {reportDone ? (
              <>
                <Text style={styles.cardTitle}>Report received</Text>
                <Text style={styles.msgText}>{reportDone}</Text>
                <Pressable style={styles.closeBtn} onPress={() => setReporting(null)}><Text style={styles.closeText}>Done</Text></Pressable>
              </>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.cardTitle}>Report this answer</Text>
                <Text style={styles.hint}>The answer and your question are sent to the RobinTHood developer so it can be reviewed.</Text>
                {REPORT_REASONS.map((r) => (
                  <Pressable key={r.id} style={[styles.option, reportReason === r.id && styles.optionActive]} onPress={() => setReportReason(r.id)}>
                    <Text style={[styles.optionText, reportReason === r.id && { color: '#fff', fontWeight: '700' }]}>{r.label}</Text>
                  </Pressable>
                ))}
                <TextInput style={[styles.fieldInput, { marginTop: 8 }]} value={reportNote} onChangeText={setReportNote}
                  placeholder="Anything else? (optional)" placeholderTextColor={C.faint} multiline />
                <Pressable style={[styles.closeBtn, (!reportReason || reportSending) && { opacity: 0.4 }]} disabled={!reportReason || reportSending} onPress={sendReport}>
                  <Text style={styles.closeText}>{reportSending ? 'Sending…' : 'Send report'}</Text>
                </Pressable>
                <Pressable style={{ alignItems: 'center', marginTop: 12 }} onPress={() => setReporting(null)}>
                  <Text style={styles.hint}>Cancel</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <PrivacyScreen visible={privacyOpen} onClose={() => setPrivacyOpen(false)} settings={settings} insetTop={insets.top} />

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
                    <Text style={[styles.optionText, active && { color: '#fff', fontWeight: '700' }]}>{m.label}{markFor(m.id)}</Text>
                    <Text style={styles.optionNote} numberOfLines={1}>{privacyOf(m.id).short}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.hint}>If the chosen model is down, Robin falls back to the next free one and tells you. * = may collect your messages.</Text>
            <Pressable style={styles.linkBtn} onPress={() => { setPicker(false); setPrivacyOpen(true); }}>
              <Text style={styles.linkBtnText}>How your data is handled ›</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={[styles.overlay, { paddingTop: insets.top + 20 }]}>
          <View style={styles.card}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.cardTitle}>{t('settingsTitle', settings.lang)}</Text>
              <Pressable style={styles.linkBtn} onPress={() => { setSettingsOpen(false); setPrivacyOpen(true); }}>
                <Text style={styles.linkBtnText}>Privacy and your data ›</Text>
              </Pressable>

              {/* No Play Billing yet, so Pro is a developer toggle only; a release build must
                  not show a price or a purchase it can't make. */}
              {__DEV__ ? (<>
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
                  {settings.isPro
                    ? 'Ads are off.'
                    : 'Turns the ads off. Testing only until Play Billing is set up.'}
                </Text>
                <View style={[styles.proCardAction, settings.isPro && { backgroundColor: '#065f46' }]}>
                  <Text style={styles.proCardActionText}>
                    {settings.isPro ? '✓ Pro Active (Tap to Toggle Test)' : 'Unlock Lifetime Pro ($49.99)'}
                  </Text>
                </View>
              </Pressable>
              </>) : null}

              <Text style={styles.fieldLabel}>Language</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {[
                  ['en', 'English'],
                  ['es', 'Español'],
                  ['fr', 'Français'],
                  ['de', 'Deutsch'],
                  ['pt', 'Português'],
                  ['ja', '日本語'],
                  ['zh', '中文'],
                  ['hi', 'हिन्दी'],
                ].map(([code, label]) => (
                  <Pressable
                    key={code}
                    style={[styles.pill, settings.lang === code && styles.optionActive, { marginRight: 6 }]}
                    onPress={() => setSettings((s) => ({ ...s, lang: code }))}
                  >
                    <Text style={[styles.optionText, settings.lang === code && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Field label="Home Ollama URL (optional)" value={settings.ollamaUrl} placeholder="http://my-pc.tailscale.net:11434"
                onChange={(v) => setSettings((s) => ({ ...s, ollamaUrl: v.trim() }))} />
              {/^http:\/\//i.test(settings.ollamaUrl) ? (
                <Text style={styles.hint}>http:// is not encrypted. That is fine over Tailscale or your home Wi-Fi, not over the open internet.</Text>
              ) : null}
              <Field label="Ollama model" value={settings.ollamaModel} placeholder="llama3.1"
                onChange={(v) => setSettings((s) => ({ ...s, ollamaModel: v.trim() }))} />
              <Field label="OpenRouter key (optional)" value={settings.openRouterKey} placeholder="sk-or-v1-..." secure
                onChange={(v) => setSettings((s) => ({ ...s, openRouterKey: v.trim() }))} />
              <Field label="OpenRouter model" value={settings.openRouterModel} placeholder="openrouter/free"
                onChange={(v) => setSettings((s) => ({ ...s, openRouterModel: v.trim() }))} />
              {IS_IOS ? (
                <>
                  <Text style={styles.fieldLabel}>Robin's files</Text>
                  <Text style={styles.hint}>Saved in the Files app: On My iPhone, then RobinTHood.</Text>
                </>
              ) : ALL_FILES ? (
                <>
                  <Text style={styles.fieldLabel}>Files: whole phone (personal build)</Text>
                  <Pressable style={styles.pill} onPress={() => openAllFilesSetting(PACKAGE).catch(() => {})}>
                    <Text style={styles.optionText}>📂 All files access: open the switch</Text>
                  </Pressable>
                  <Text style={styles.hint}>New files without a folder go to Documents/RobinTHood.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Robin's folder (files Robin can read and write)</Text>
                  <Pressable style={styles.pill} onPress={async () => {
                    try { const uri = await pickFolder(); setSettings((s) => ({ ...s, filesUri: uri })); } catch {}
                  }}>
                    <Text style={styles.optionText}>{settings.filesUri ? `📁 ${nameOf(settings.filesUri) || 'Chosen folder'}  (tap to change)` : '📁 Choose a folder'}</Text>
                  </Pressable>
                </>
              )}
              <Text style={styles.fieldLabel}>Music volume</Text>
              <View style={styles.pillRow}>
                {[['Quiet', 0.15], ['Normal', 0.3], ['Loud', 0.6]].map(([name, v]) => (
                  <Pressable key={name} style={[styles.pill, settings.musicVolume === v && styles.optionActive]}
                    onPress={() => setSettings((s) => ({ ...s, musicVolume: v, music: true }))}>
                    <Text style={[styles.optionText, settings.musicVolume === v && { color: '#fff', fontWeight: '700' }]}>{name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>RobinTHood 0.7.9. When Web Search is enabled, queries are retrieved securely via our edge infrastructure using live search providers (Brave Search, DuckDuckGo, Wikipedia). Chat history and private keys remain stored locally on your device. The free version shows Google ads; the ads SDK collects device identifiers, as the privacy policy explains.</Text>
              {!settings.isPro ? (
                <Pressable style={[styles.pill, { marginTop: 8, alignItems: 'center' }]} onPress={openAdPrivacyOptions}>
                  <Text style={styles.optionText}>Ad privacy choices</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.pill, { marginTop: 8, alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => handleOpenSource('https://phil-projects.phone-liaison.workers.dev/privacy.html')}
              >
                <Text style={[styles.optionText, { color: C.green, fontWeight: '600' }]}>
                  🔒 Privacy Policy & Data Disclosures ↗
                </Text>
              </Pressable>
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
  optionNote: { color: C.faint, fontSize: 11, marginTop: 2 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginTop: 6 },
  linkBtnText: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
  privHead: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  privPara: { color: C.text, fontSize: 14, lineHeight: 20, marginTop: 6 },
  privRow: { marginTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  privModel: { color: C.text, fontSize: 14, fontWeight: '700' },
  privLevel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  privNote: { color: C.faint, fontSize: 12, lineHeight: 17, marginTop: 2 },
  privQ: { color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  privResult: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: C.panel2 },
  privItem: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  modelChip: { color: C.green, fontSize: 12, fontWeight: '600', marginTop: 2 },
  headerBtn: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 6, backgroundColor: C.panel2, borderRadius: 8 },
  headerBtnText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  gear: { color: C.dim, fontSize: 16 },
  chatContent: { padding: 14 },
  msg: { padding: 14, borderRadius: 12, marginBottom: 12, maxWidth: '88%' },
  userMsg: { backgroundColor: C.user, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  botMsg: { backgroundColor: C.panel, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: C.line },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  reportBtn: { marginLeft: 'auto', paddingLeft: 12 },
  reportText: { fontSize: 11, color: C.faint },
  modelTag: { fontSize: 10, fontWeight: '700', color: C.green, textTransform: 'uppercase' },
  latency: { fontSize: 10, color: C.faint, marginLeft: 6 },
  msgText: { color: C.text, fontSize: 15, lineHeight: 22 },
  webOn: { backgroundColor: '#065f46' },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: C.panel2 },
  steps: { marginBottom: 8 },
  step: { color: C.faint, fontSize: 12, marginBottom: 2 },
  stepsContainer: { marginBottom: 8 },
  stepsToggle: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6, backgroundColor: C.panel2, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  stepsToggleText: { fontSize: 11, color: C.dim, fontWeight: '600' },
  stepsList: { paddingLeft: 4, marginTop: 4, marginBottom: 4 },
  sources: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  source: { color: '#60a5fa', fontSize: 12, marginTop: 3 },
  sourcesContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  sourcesHeader: { fontSize: 10, fontWeight: '700', color: C.faint, letterSpacing: 0.8, marginBottom: 6 },
  // A horizontal ScrollView defaults to flexGrow: 1; inside a list cell on Android that
  // stretched the row, and every card in it, to many screens tall. Keep it content-sized.
  sourcesScroll: { flexGrow: 0, flexShrink: 0 },
  sourcesRow: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 4 },
  sourceCard: {
    backgroundColor: C.panel2,
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    width: 150,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: C.border,
  },
  sourceCardOpened: {
    borderColor: C.green,
    backgroundColor: '#06281e',
  },
  sourceCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sourceBadge: { fontSize: 9, fontWeight: '700', color: C.green },
  sourceDomain: { fontSize: 10, color: C.faint, flex: 1, textAlign: 'right', marginLeft: 4 },
  sourceTitle: { fontSize: 11, color: '#93c5fd', lineHeight: 15 },
  formattedContainer: { gap: 6 },
  hScroll: { flexGrow: 0, flexShrink: 0 },
  mdBold: { fontWeight: '700' },
  mdItalic: { fontStyle: 'italic' },
  mdStrike: { textDecorationLine: 'line-through' },
  mdInlineCode: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: '#060913', color: '#e2e8f0', fontSize: 13 },
  mdLink: { color: '#60a5fa', textDecorationLine: 'underline' },
  mdHint: { color: C.faint, fontSize: 12 },
  mdH1: { fontSize: 21, lineHeight: 28, fontWeight: '800', marginTop: 4 },
  mdH2: { fontSize: 18, lineHeight: 25, fontWeight: '700', marginTop: 4 },
  mdH3: { fontSize: 16, lineHeight: 23, fontWeight: '700', marginTop: 2 },
  mdH4: { fontSize: 15, fontWeight: '700' },
  mdHr: { height: 1, backgroundColor: C.border, marginVertical: 6 },
  mdQuote: { borderLeftWidth: 3, borderLeftColor: C.border, paddingLeft: 10 },
  mdQuoteText: { color: C.dim },
  mdItem: { flexDirection: 'row', alignItems: 'flex-start' },
  mdMarker: { width: 22, color: C.dim },
  mdItemText: { flex: 1 },
  mdTable: { borderWidth: 1, borderColor: C.border, borderRadius: 6, overflow: 'hidden' },
  mdRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border },
  mdHeadRow: { backgroundColor: C.panel2, borderTopWidth: 0 },
  mdCell: { width: 140, padding: 8, borderLeftWidth: 1, borderLeftColor: C.line },
  mdCellText: { color: C.text, fontSize: 13, lineHeight: 18 },
  codeBlock: {
    backgroundColor: '#060913',
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  codeHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  codeLang: { color: C.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  codeText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    padding: 10,
    lineHeight: 18,
  },
  note: { color: C.faint, fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { color: C.dim, fontSize: 12, marginLeft: 8 },
  thinkingBox: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.border },
  thinkingText: { color: C.faint, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
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
