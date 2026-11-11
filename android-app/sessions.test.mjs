import assert from 'node:assert/strict';
import test from 'node:test';

function generateTitle(text, maxLength = 34) {
  if (!text || typeof text !== 'string') return 'New Chat';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New Chat';
  return clean.slice(0, maxLength).trim() + (clean.length > maxLength ? '…' : '');
}

function updateSessions(prevSessions, activeSessionId, cleanMsgs) {
  const idx = prevSessions.findIndex((s) => s.id === activeSessionId);
  let title = prevSessions[idx]?.title;
  const firstUserMsg = cleanMsgs.find((m) => m.role === 'user');
  if (firstUserMsg && (!title || title === 'New Chat')) {
    title = generateTitle(firstUserMsg.content);
  }
  const updated = {
    id: activeSessionId,
    title: title || 'New Chat',
    updatedAt: Date.now(),
    messages: cleanMsgs,
  };
  return idx >= 0
    ? [...prevSessions.slice(0, idx), updated, ...prevSessions.slice(idx + 1)]
    : [updated, ...prevSessions];
}

test('generateTitle: generates clean title from first user prompt', () => {
  assert.equal(generateTitle(''), 'New Chat');
  assert.equal(generateTitle('   '), 'New Chat');
  assert.equal(generateTitle('Explain quantum physics in plain English'), 'Explain quantum physics in plain E…');
  assert.equal(generateTitle('Short prompt'), 'Short prompt');
  assert.equal(generateTitle('Line 1\nLine 2\nLine 3'), 'Line 1 Line 2 Line 3');
});

test('updateSessions: creates and updates active conversation sessions', () => {
  const initial = [];
  const activeId = 'sess_1';
  const msgs1 = [{ id: '1', role: 'user', content: 'What is photosynthesis?' }];

  const sessions1 = updateSessions(initial, activeId, msgs1);
  assert.equal(sessions1.length, 1);
  assert.equal(sessions1[0].id, activeId);
  assert.equal(sessions1[0].title, 'What is photosynthesis?');
  assert.equal(sessions1[0].messages.length, 1);

  // Subsequent assistant response preserves the title
  const msgs2 = [
    ...msgs1,
    { id: '2', role: 'assistant', content: 'Photosynthesis is the process...' },
  ];
  const sessions2 = updateSessions(sessions1, activeId, msgs2);
  assert.equal(sessions2.length, 1);
  assert.equal(sessions2[0].title, 'What is photosynthesis?');
  assert.equal(sessions2[0].messages.length, 2);

  // Adding a second new session prepends or appends without overwriting the first
  const activeId2 = 'sess_2';
  const msgs3 = [{ id: '3', role: 'user', content: 'Draft a quick resume summary' }];
  const sessions3 = updateSessions(sessions2, activeId2, msgs3);
  assert.equal(sessions3.length, 2);
  assert.equal(sessions3[0].title, 'Draft a quick resume summary');
  assert.equal(sessions3[1].title, 'What is photosynthesis?');
});
