import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { copyToClipboard } from '../clipboard';
import { lightTick } from '../haptics';
import { parseBlocks, parseInline } from '../markdown';
import { C } from '../theme';

export function openLink(url) {
  if (/^https?:\/\//i.test(url)) Linking.openURL(url).catch(() => {});
}

export function Inline({ text, style }) {
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

export function CodeBlock({ block }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(block.text);
    if (ok) {
      lightTick();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang}>{block.lang || 'code'}</Text>
        <Pressable onPress={handleCopy} hitSlop={8} style={styles.codeCopyBtn}>
          <Text style={[styles.codeCopyText, copied && { color: C.green }]}>
            {copied ? '✓ Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
        <Text selectable style={styles.codeText}>{block.text}</Text>
      </ScrollView>
    </View>
  );
}

export function FormattedMessage({ text }) {
  if (!text) return null;
  const blocks = parseBlocks(text);
  return (
    <View style={styles.formattedContainer}>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'code':
            return <CodeBlock key={idx} block={b} />;
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

const styles = StyleSheet.create({
  formattedContainer: { gap: 6 },
  hScroll: { flexGrow: 0, flexShrink: 0 },
  msgText: { fontSize: 14, color: C.text, lineHeight: 20 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeLang: { color: C.faint, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  codeCopyBtn: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  codeCopyText: { color: C.dim, fontSize: 11, fontWeight: '600' },
  codeText: {
    color: '#e2e8f0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
  },
});
