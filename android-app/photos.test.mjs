// node --test android-app/photos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasImage, keepRecentImages, mapText, textOf, withImages } from './photos.js';

const parts = (m) => (Array.isArray(m.content) ? m.content.map((p) => p.type) : 'text');

test('only the newest photos go to the model, as content parts', () => {
  const turns = [
    { role: 'user', content: 'a', image: 'AAA' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'b', image: 'BBB' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'c', image: 'CCC' },
  ];
  const out = withImages(turns, 2);
  assert.deepEqual(out.map(parts), ['text', 'text', ['text', 'image_url'], 'text', ['text', 'image_url']]);
  assert.equal(out[0].content, 'a');
  assert.equal(out[4].content[1].image_url.url, 'data:image/jpeg;base64,CCC');
  assert.ok(hasImage(out));
  assert.ok(!hasImage(withImages([{ role: 'user', content: 'x' }])));
});

test('text helpers see through content parts and leave images alone', () => {
  const c = [{ type: 'text', text: 'card 4111' }, { type: 'image_url', image_url: { url: 'data:x' } }];
  assert.equal(textOf(c), 'card 4111');
  assert.equal(textOf('plain'), 'plain');
  const masked = mapText(c, (s) => s.replace('4111', '[CARD]'));
  assert.equal(masked[0].text, 'card [CARD]');
  assert.equal(masked[1].image_url.url, 'data:x');
  assert.equal(mapText('a 4111', (s) => s.replace('4111', 'X')), 'a X');
});

test('saved chats keep only the newest photos', () => {
  const msgs = [1, 2, 3, 4, 5].map((n) => ({ id: n, image: `I${n}` }));
  const out = keepRecentImages(msgs, 3);
  assert.deepEqual(out.map((m) => m.image ?? null), [null, null, 'I3', 'I4', 'I5']);
  assert.ok(out[0].imageDropped && !out[4].imageDropped);
  assert.equal(msgs[0].image, 'I1', 'the live chat is not changed');
});
