import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { copyToClipboard } from '../clipboard';
import { availableModels } from '../engines';
import { splitFollowups } from '../followups';
import { lightTick } from '../haptics';
import { t } from '../i18n';
import { markFor } from '../privacy';
import { FormattedMessage } from './MarkdownView';
import { C } from '../theme';

const THINKING_TAIL_CHARS = 420;

export function thinkingTail(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= THINKING_TAIL_CHARS) return t;
  const cut = t.slice(-THINKING_TAIL_CHARS);
  return '…' + cut.slice(cut.indexOf(' ') + 1);
}

export function markForLabel(label, settings) {
  const m = availableModels(settings).find((x) => x.label === label);
  return m ? markFor(m.id) : '';
}

export default function MessageRow({
  item,
  settings,
  isExpanded,
  toggleSteps,
  openReport,
  onOpenPrivacy,
  handleOpenSource,
  status,
  onSuggest,
  streaming,
  onRetry,
}) {
  const mine = item.role === 'user';
  const [checkOpen, setCheckOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lang = settings?.lang;
  const shown = mine ? item.content : splitFollowups(item.content).text;
  const chips = !mine && !streaming && !item.pending && !item.error && !item.intro ? (item.followups || []) : [];

  const handleCopy = async () => {
    const textToCopy = mine ? item.content : shown;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      lightTick();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={[styles.msg, mine ? styles.userMsg : styles.botMsg]}>
      {!mine && (
        <View style={styles.msgHeader}>
          <Text style={[styles.modelTag, item.error && { color: C.red }]}>
            {item.model}
            {markForLabel(item.model, settings)}
          </Text>
          {item.seconds ? <Text style={styles.latency}>{item.seconds.toFixed(1)}s</Text> : null}
          <View style={styles.headerActions}>
            {!item.intro && !item.pending && item.content ? (
              <>
                <Pressable style={styles.actionBtn} hitSlop={8} onPress={handleCopy}>
                  <Text style={[styles.actionBtnText, copied && { color: C.green }]}>
                    {copied ? '✓ Copied' : '⧉ Copy'}
                  </Text>
                </Pressable>
                {onRetry && !streaming ? (
                  <Pressable style={styles.actionBtn} hitSlop={8} onPress={() => onRetry(item)}>
                    <Text style={styles.actionBtnText}>↻ Retry</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.actionBtn} hitSlop={8} onPress={() => openReport(item)}>
                  <Text style={styles.actionBtnText}>{item.reported ? 'Reported' : '⚑ Report'}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      )}
      {mine && (
        <View style={styles.userActionRow}>
          <Pressable style={styles.userCopyBtn} hitSlop={8} onPress={handleCopy}>
            <Text style={[styles.userCopyText, copied && { color: C.green }]}>
              {copied ? '✓ Copied' : '⧉'}
            </Text>
          </Pressable>
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
              <Pressable style={styles.stepsToggle} onPress={() => toggleSteps(item.id)} hitSlop={6}>
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
        <Pressable style={styles.linkBtn} onPress={onOpenPrivacy}>
          <Text style={styles.linkBtnText}>{t('privacyLink', settings.lang)}</Text>
        </Pressable>
      ) : null}

      {item.content ? (
        <>
          {item.image ? (
            <Image source={{ uri: `data:image/jpeg;base64,${item.image}` }} style={styles.photo} resizeMode="cover" />
          ) : item.imageDropped ? (
            <Text style={styles.attachChip}>📷 {item.attachment} (older photo, not kept)</Text>
          ) : item.attachment ? (
            <Text style={styles.attachChip}>📎 {item.attachment}</Text>
          ) : null}
          <FormattedMessage text={item.attachment ? item.typed : shown} />
        </>
      ) : (
        <>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={C.green} />
            <Text style={styles.loadingText}>{status || 'Thinking…'}</Text>
          </View>
          {item.pending && item.thinking ? (
            <View style={styles.thinkingBox}>
              <Text style={styles.thinkingText}>{thinkingTail(item.thinking)}</Text>
            </View>
          ) : null}
        </>
      )}

      {chips.length ? (
        <View style={styles.followups}>
          <Text style={styles.followupsLabel}>{t('followupsLabel', lang)}</Text>
          {chips.map((q) => (
            <Pressable key={q} style={styles.followupChip} onPress={() => onSuggest?.(q)}>
              <Text style={styles.followupChipText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {item.verify?.claims?.length ? (
        <View style={styles.checkContainer}>
          <Pressable onPress={() => setCheckOpen((v) => !v)} hitSlop={6}>
            <Text style={styles.checkHeader}>
              {t('checkHeader', lang)}{'  '}
              <Text style={styles.checkOk}>✓ {item.verify.counts.supported}</Text>{'  '}
              <Text style={styles.checkPartial}>~ {item.verify.counts.partial}</Text>{'  '}
              <Text style={styles.checkMissing}>✗ {item.verify.counts.unsupported}</Text>
              {'  '}{checkOpen ? '▾' : '▸'}
            </Text>
          </Pressable>
          {checkOpen ? (
            <>
              <Text style={styles.checkHint}>{t('checkHint', lang)}</Text>
              {item.verify.claims.map((c, i) => (
                <Pressable key={i} disabled={!c.url} onPress={() => c.url && handleOpenSource(c.url)} style={styles.checkRow}>
                  <Text style={[styles.checkMark, c.level === 'supported' ? styles.checkOk : c.level === 'partial' ? styles.checkPartial : styles.checkMissing]}>
                    {c.level === 'supported' ? '✓' : c.level === 'partial' ? '~' : '✗'}
                  </Text>
                  <Text style={styles.checkText}>
                    {c.text}
                    {c.missing?.length ? <Text style={styles.checkMissing}>{'  '}({t('checkNotInSource', lang)}: {c.missing.join(', ')})</Text> : null}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

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
              try {
                domain = new URL(src.url).hostname.replace(/^www\./, '');
              } catch {
                domain = 'web';
              }
              return (
                <Pressable
                  key={src.url || i}
                  style={[styles.sourceCard, src.opened && styles.sourceCardOpened]}
                  onPress={() => handleOpenSource(src.url)}
                >
                  <View style={styles.sourceCardHeader}>
                    <Text style={styles.sourceBadge}>{src.opened ? '📄 READ' : '🔗 LINK'}</Text>
                    <Text style={styles.sourceDomain} numberOfLines={1}>
                      {domain}
                    </Text>
                  </View>
                  <Text style={styles.sourceTitle} numberOfLines={2}>
                    {src.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  msg: { padding: 14, borderRadius: 12, marginBottom: 12, maxWidth: '88%' },
  userMsg: { backgroundColor: C.user, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  botMsg: { backgroundColor: C.panel, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: C.line },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 8 },
  actionBtn: { paddingVertical: 2, paddingHorizontal: 4 },
  actionBtnText: { fontSize: 11, color: C.faint, fontWeight: '500' },
  userActionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  userCopyBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  userCopyText: { fontSize: 11, color: C.faint },
  reportBtn: { marginLeft: 'auto', paddingLeft: 12 },
  reportText: { fontSize: 11, color: C.faint },
  modelTag: { fontSize: 10, fontWeight: '700', color: C.green, textTransform: 'uppercase' },
  latency: { fontSize: 10, color: C.faint, marginLeft: 6 },
  stepsContainer: { marginBottom: 8 },
  stepsToggle: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6, backgroundColor: C.panel2, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  stepsToggleText: { fontSize: 11, color: C.dim, fontWeight: '600' },
  stepsList: { paddingLeft: 4, marginTop: 4, marginBottom: 4 },
  step: { color: C.faint, fontSize: 12, marginBottom: 2 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginTop: 6 },
  linkBtnText: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
  photo: { width: 200, height: 200, borderRadius: 8, marginBottom: 6 },
  attachChip: { color: C.dim, fontSize: 12, flexShrink: 1, marginBottom: 4 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { color: C.dim, fontSize: 12, marginLeft: 8 },
  thinkingBox: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.border },
  thinkingText: { color: C.faint, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  checkContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  checkHeader: { fontSize: 10, fontWeight: '700', color: C.faint, letterSpacing: 0.8 },
  checkHint: { fontSize: 11, color: C.faint, marginTop: 6, marginBottom: 4 },
  checkRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  checkMark: { fontSize: 13, fontWeight: '700', width: 14 },
  checkText: { flex: 1, fontSize: 12, color: C.dim, lineHeight: 17 },
  checkOk: { color: C.green },
  checkPartial: { color: C.dim },
  checkMissing: { color: C.red },
  sourcesContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  sourcesHeader: { fontSize: 10, fontWeight: '700', color: C.faint, letterSpacing: 0.8, marginBottom: 6 },
  sourcesScroll: { marginTop: 2 },
  sourcesRow: { gap: 8, paddingRight: 4 },
  sourceCard: { backgroundColor: C.panel2, borderRadius: 8, padding: 8, width: 140, borderWidth: 1, borderColor: C.border },
  sourceCardOpened: { borderColor: C.green },
  sourceCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sourceBadge: { fontSize: 9, fontWeight: '700', color: C.green },
  sourceDomain: { fontSize: 10, color: C.faint, flex: 1, textAlign: 'right', marginLeft: 4 },
  sourceTitle: { fontSize: 11, color: '#93c5fd', lineHeight: 15 },
  note: { color: C.faint, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  followups: { marginTop: 10 },
  followupsLabel: { fontSize: 10, fontWeight: '700', color: C.faint, letterSpacing: 0.8, marginBottom: 6 },
  followupChip: { alignSelf: 'flex-start', backgroundColor: C.panel2, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  followupChipText: { color: C.text, fontSize: 13 },
});
