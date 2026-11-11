import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { lightTick } from '../haptics';
import { C } from '../theme';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ChatHistoryModal({
  visible,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onClearAll,
}) {
  const [search, setSearch] = useState('');

  const filtered = (sessions || []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const titleMatch = s.title?.toLowerCase().includes(q);
    const lastMsg = s.messages?.[s.messages.length - 1]?.content?.toLowerCase() || '';
    return titleMatch || lastMsg.includes(q);
  });

  const handleSelect = (session) => {
    lightTick();
    onSelectSession(session);
    onClose();
  };

  const handleNew = () => {
    lightTick();
    onNewChat();
    onClose();
  };

  const handleDelete = (session) => {
    lightTick();
    Alert.alert('Delete Chat', `Delete "${session.title || 'Untitled'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDeleteSession(session.id),
      },
    ]);
  };

  const handleClearConfirm = () => {
    Alert.alert('Clear All History', 'Delete all conversation history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: onClearAll },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Conversations</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.newBtn} onPress={handleNew} hitSlop={8}>
              <Text style={styles.newBtnText}>+ New Chat</Text>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search past conversations…"
            placeholderTextColor={C.faint}
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isActive = item.id === activeSessionId;
            const lastMsg = item.messages?.slice(-1)[0]?.content || 'Empty chat';
            const cleanPreview = lastMsg.replace(/\s+/g, ' ').trim();

            return (
              <Pressable
                style={[styles.sessionRow, isActive && styles.sessionRowActive]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.sessionInfo}>
                  <View style={styles.sessionTitleRow}>
                    <Text style={[styles.sessionTitle, isActive && styles.sessionTitleActive]} numberOfLines={1}>
                      {item.title || 'Untitled conversation'}
                    </Text>
                    <Text style={styles.sessionDate}>{formatTime(item.updatedAt)}</Text>
                  </View>
                  <Text style={styles.sessionPreview} numberOfLines={2}>
                    {cleanPreview}
                  </Text>
                </View>

                <Pressable
                  style={styles.deleteBtn}
                  hitSlop={10}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDelete(item);
                  }}
                >
                  <Text style={styles.deleteText}>🗑</Text>
                </Pressable>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {search.trim() ? 'No matching conversations' : 'No past conversations'}
              </Text>
              <Text style={styles.emptySub}>
                {search.trim() ? 'Try another keyword' : 'Start a chat and it will show up here'}
              </Text>
            </View>
          }
        />

        {sessions?.length > 1 ? (
          <View style={styles.footer}>
            <Pressable onPress={handleClearConfirm} hitSlop={8}>
              <Text style={styles.clearAllText}>Clear all conversations</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  newBtn: {
    backgroundColor: C.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  newBtnText: { color: '#0b0f19', fontSize: 13, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 18, color: C.dim, fontWeight: '600' },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  searchInput: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: C.text,
    fontSize: 13,
  },
  listContent: { padding: 12, flexGrow: 1 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  sessionRowActive: {
    borderColor: C.green,
    backgroundColor: C.panel2,
  },
  sessionInfo: { flex: 1, marginRight: 8 },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    flex: 1,
    marginRight: 8,
  },
  sessionTitleActive: {
    color: C.green,
  },
  sessionDate: { fontSize: 11, color: C.faint },
  sessionPreview: { fontSize: 12, color: C.dim, lineHeight: 16 },
  deleteBtn: { padding: 8 },
  deleteText: { fontSize: 14, opacity: 0.6 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: C.dim, marginBottom: 4 },
  emptySub: { fontSize: 12, color: C.faint },
  footer: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  clearAllText: { fontSize: 12, color: C.red, fontWeight: '600' },
});
