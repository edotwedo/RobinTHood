// node --test android-app/privacy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assess, detectSensitive, detokenizeText, entityToPlaceholder, markFor, maskSensitive, mayCollect, parseFrontmatterEntities, parseVaultSecrets, privacyOf, SELF_CHECK, tokenizeSensitive } from './privacy.js';

const types = (t) => detectSensitive(t).map((f) => f.type);

test('every engine id in engines.js has a privacy entry, and Auto counts as may-collect', () => {
  const src = readFileSync(new URL('./engines.js', import.meta.url), 'utf8');
  const ids = [...src.matchAll(/\{ id: '([a-z0-9-]+)', label:/g)].map((m) => m[1]);
  assert.ok(ids.length >= 5, 'found the keyless engines');
  for (const id of ids) assert.notEqual(privacyOf(id).provider, 'Unknown', `${id} has no privacy entry`);
  assert.equal(markFor('ovh-120b'), '');
  assert.equal(markFor('kilo-auto'), '*');
  assert.equal(markFor('auto'), '*');
  assert.equal(mayCollect('ollama'), false);
  assert.equal(markFor('something-new'), '*', 'unknown engines default to the cautious mark');
});

test('finds emails, phones, SSNs, addresses and passwords', () => {
  assert.deepEqual(types('mail me at sam.doe@example.com'), ['email']);
  assert.deepEqual(types('call 253-555-0142 or (206) 555-0199'), ['phone', 'phone']);
  assert.deepEqual(types('my ssn is 123-45-6789'), ['ssn']);
  assert.deepEqual(types('I live at 1234 North Pine Street'), ['address']);
  assert.deepEqual(types('the password is hunter2!'), ['password']);
});

test('card numbers only count when they pass the Luhn check', () => {
  assert.deepEqual(types('card 4111 1111 1111 1111 thanks'), ['card']);
  assert.ok(!types('order 1234 5678 9012 3456').includes('card'));
});

test('finds API keys and tokens', () => {
  assert.deepEqual(types('key sk-abcdefghijklmnopqrstuvwx'), ['secret']);
  assert.deepEqual(types('key ' + ['sk', '_test', '_abcdefghijklmnopqrstuvwx'].join('') + ''), ['secret']);
  assert.deepEqual(types('token ghp_abcdefghijklmnopqrstuvwxyz0123'), ['secret']);
  assert.deepEqual(types('AKIAIOSFODNN7EXAMPLE'), ['secret']);
  assert.deepEqual(types('Bearer ya29.a0AfH6SMAAAAAAAAAAAAAAAAAAAAAAAAAAA'), ['secret']);
  assert.deepEqual(types('-----BEGIN RSA PRIVATE KEY-----'), ['secret']);
});

test('regex runs fast and safe on long base64 strings', () => {
  const longBase64 = 'A'.repeat(30000);
  const t0 = Date.now();
  assert.deepEqual(detectSensitive(longBase64), []);
  assert.ok(Date.now() - t0 < 100, 'scanned 30k base64 without regex freeze');
});

test('ordinary text, dates and versions are not flagged', () => {
  for (const t of ['What should I plant in May in Tacoma?', 'On 2026-11-02 version 0.7.8 shipped', 'It costs $49.99 for 3 months', 'Call it 2 * 3 * 4 = 24']) {
    assert.deepEqual(detectSensitive(t), [], t);
  }
});

test('masking replaces only the sensitive parts and counts them', () => {
  const r = maskSensitive('Email sam@ex.com, phone 253-555-0142, and plant tomatoes.');
  assert.equal(r.text, 'Email [EMAIL], phone [PHONE], and plant tomatoes.');
  assert.equal(r.count, 2);
  assert.equal(maskSensitive('nothing here').text, 'nothing here');
});

test('tokenizeSensitive and detokenizeText provide bi-directional secret shielding', () => {
  const input = 'Contact alice@corp.com or bob@other.org at 555-123-4567 regarding API key sk-abcdefghijklmnopqrstuvwx.';
  const { tokenizedText, tokenMap } = tokenizeSensitive(input);

  assert.match(tokenizedText, /\[EMAIL_1\]/);
  assert.match(tokenizedText, /\[EMAIL_2\]/);
  assert.match(tokenizedText, /\[PHONE_1\]/);
  assert.match(tokenizedText, /\[SECRET_1\]/);
  assert.ok(!tokenizedText.includes('alice@corp.com'));
  assert.ok(!tokenizedText.includes('sk-abcdefghijklmnopqrstuvwx'));

  // Simulated LLM answer containing the placeholders
  const aiResponse = 'I have scheduled notifications to [EMAIL_1] and [EMAIL_2], calling [PHONE_1]. Your token [SECRET_1] was verified.';
  const hydrated = detokenizeText(aiResponse, tokenMap);

  assert.equal(
    hydrated,
    'I have scheduled notifications to alice@corp.com and bob@other.org, calling 555-123-4567. Your token sk-abcdefghijklmnopqrstuvwx was verified.'
  );

  // Custom vault entity replacement (e.g. secret project names or client names)
  const vaultEntities = { 'Project Skynet': '[PROJECT_ALPHA]', 'Cyberdyne Systems': '[ORG_1]' };
  const customInput = 'Deploy Project Skynet for Cyberdyne Systems using key sk-abcdefghijklmnopqrstuvwx.';
  const res2 = tokenizeSensitive(customInput, {}, vaultEntities);

  assert.match(res2.tokenizedText, /\[PROJECT_ALPHA\]/);
  assert.match(res2.tokenizedText, /\[ORG_1\]/);
  assert.match(res2.tokenizedText, /\[SECRET_1\]/);
  assert.ok(!res2.tokenizedText.includes('Project Skynet'));

  const aiRes2 = 'Confirmation: [PROJECT_ALPHA] is live at [ORG_1] with credentials [SECRET_1].';
  assert.equal(
    detokenizeText(aiRes2, res2.tokenMap),
    'Confirmation: Project Skynet is live at Cyberdyne Systems with credentials sk-abcdefghijklmnopqrstuvwx.'
  );
});

test('self check scores into three tiers', () => {
  const all = (n) => Object.fromEntries(SELF_CHECK.map((q) => [q.id, n]));
  assert.equal(assess(all(0)).tier, 'low');
  assert.equal(assess({ ...all(0), use: 1, paste: 1 }).tier, 'low');
  assert.equal(assess({ ...all(0), use: 2, paste: 1, harm: 1 }).tier, 'medium');
  assert.equal(assess(all(2)).tier, 'high');
  assert.equal(assess({}).tier, 'low', 'no answers yet');
});

test('parseVaultSecrets and parseFrontmatterEntities extract shielded entities for Obsidian vaults', () => {
  // 1. _vault_secrets.json parsing
  const jsonDict = JSON.stringify({ 'Omega Protocol': '[OMEGA]', 'Initech Corp': '[INITECH]' });
  assert.deepEqual(parseVaultSecrets(jsonDict), {
    'Omega Protocol': '[OMEGA]',
    'Initech Corp': '[INITECH]',
  });

  const jsonList = JSON.stringify(['Project Apollo', 'Top Secret Key']);
  assert.deepEqual(parseVaultSecrets(jsonList), {
    'Project Apollo': '[ENTITY_1]',
    'Top Secret Key': '[ENTITY_2]',
  });

  // Invalid JSON should return empty object gracefully
  assert.deepEqual(parseVaultSecrets('{ invalid json'), {});

  // Prototype pollution protection
  const polluted = JSON.stringify({ '__proto__': 'evil', 'constructor': 'evil', 'Valid Key': '[VAL]' });
  assert.deepEqual(parseVaultSecrets(polluted), { 'Valid Key': '[VAL]' });

  // 2. Obsidian Markdown Frontmatter parsing
  const mdWithList = `---
title: Project Brief
secrets:
  - Operation Starlight
  - Target Alpha
tags:
  - internal
---
# Meeting Notes
Discuss Operation Starlight with the team.
`;
  assert.deepEqual(parseFrontmatterEntities(mdWithList), {
    'Operation Starlight': '[ENTITY_1]',
    'Target Alpha': '[ENTITY_2]',
  });

  const mdWithDict = `---
shield:
  Acme Corp: "[CLIENT_1]"
  Project X: "[PRJ_X]"
---
Notes here.
`;
  assert.deepEqual(parseFrontmatterEntities(mdWithDict), {
    'Acme Corp': '[CLIENT_1]',
    'Project X': '[PRJ_X]',
  });

  // Inline array in frontmatter and UTF-8 BOM handling
  const mdWithInlineAndBom = `\uFEFF---
secrets: [Operation Starlight, "Target Alpha"]
---
`;
  assert.deepEqual(parseFrontmatterEntities(mdWithInlineAndBom), {
    'Operation Starlight': '[ENTITY_1]',
    'Target Alpha': '[ENTITY_2]',
  });

  // Markdown without frontmatter
  assert.deepEqual(parseFrontmatterEntities('# Regular note with no frontmatter'), {});

  // Existing entities collision prevention and monotonic numbering
  const existing = { 'Prior Secret': '[ENTITY_1]', 'Operation Starlight': '[ENTITY_0]' };
  const mergedEntities = parseFrontmatterEntities(mdWithList, { existingEntities: existing });
  assert.equal(mergedEntities['Operation Starlight'], '[ENTITY_0]', 'Reuses existing placeholder');
  assert.equal(mergedEntities['Target Alpha'], '[ENTITY_2]', 'Allocates next unused index to avoid collision');

  // Explicit duplicate placeholder and tokenMap collision protection
  const dupDict = JSON.stringify({ 'Secret A': '[SHARED]', 'Secret B': '[SHARED]' });
  const parsedDup = parseVaultSecrets(dupDict, { tokenMap: { '[ENTITY_1]': 'something' } });
  assert.equal(parsedDup['Secret A'], '[SHARED]');
  assert.notEqual(parsedDup['Secret B'], '[SHARED]', 'Does not assign same explicit token to two secrets');
  assert.equal(parsedDup['Secret B'], '[ENTITY_2]', 'Skips [ENTITY_1] present in tokenMap');
});

test('tokenizeSensitive and detokenizeText handle substrings and length descending ordering', () => {
  // Longest substring replaced first: "Acme Corporation" before "Acme"
  const customEntities = {
    'Acme': '[ENTITY_1]',
    'Acme Corporation': '[ENTITY_2]',
  };
  const text = 'Welcome to Acme Corporation and Acme branch.';
  const { tokenizedText, tokenMap } = tokenizeSensitive(text, {}, customEntities);
  assert.equal(tokenizedText, 'Welcome to [ENTITY_2] and [ENTITY_1] branch.');

  // Detokenize handles longer tokens first so [ENTITY_10] is not broken by [ENTITY_1]
  const placeholderMap = {
    '[ENTITY_1]': 'Short',
    '[ENTITY_10]': 'Longer Ten',
  };
  const tokenizedResponse = 'Result: [ENTITY_10] and [ENTITY_1].';
  assert.equal(detokenizeText(tokenizedResponse, placeholderMap), 'Result: Longer Ten and Short.');
});


test('two names given the same placeholder both come back (QA P1: "Alice met Bob" became "Bob met Bob")', () => {
  const map = {};
  const { tokenizedText } = tokenizeSensitive('Alice met Bob', map, { Alice: '[PERSON]', Bob: '[PERSON]' });
  assert.notEqual(tokenizedText.split(' ')[0], tokenizedText.split(' ')[2], 'each name gets its own placeholder');
  assert.ok(!tokenizedText.includes('Alice') && !tokenizedText.includes('Bob'));
  assert.equal(detokenizeText(tokenizedText, map), 'Alice met Bob');
});

test('a placeholder used earlier in the chat is not reassigned to a new name', () => {
  const map = {};
  const first = tokenizeSensitive('Ask Alice', map, { Alice: '[ENTITY_1]' }).tokenizedText;
  const second = tokenizeSensitive('Ask Bob', map, { Bob: '[ENTITY_1]' }).tokenizedText;
  assert.equal(detokenizeText(`${first}. ${second}.`, map), 'Ask Alice. Ask Bob.');
  // and the same name keeps the same placeholder on the next message
  assert.equal(tokenizeSensitive('Bob again', map, { Bob: '[ENTITY_1]' }).tokenizedText, `${second.split(' ')[1]} again`);
});

test('a short name never matches inside a placeholder written for a longer one', () => {
  const map = {};
  const { tokenizedText } = tokenizeSensitive('Bob and NT', map, { Bob: '[ENTITY_1]', NT: '[ENTITY_2]' });
  assert.equal(tokenizedText, '[ENTITY_1] and [ENTITY_2]');
  assert.equal(detokenizeText(tokenizedText, map), 'Bob and NT');
});

test('detokenize is one pass: a restored value that looks like a placeholder stays as written', () => {
  assert.equal(detokenizeText('[ENTITY_1] and [ENTITY_2]', { '[ENTITY_1]': 'see [ENTITY_2]', '[ENTITY_2]': 'Bob' }), 'see [ENTITY_2] and Bob');
  assert.equal(detokenizeText('pay [SECRET_1]', { '[SECRET_1]': 'a$&b$1' }), 'pay a$&b$1', 'replacement text is literal');
});

test('email stops at the TLD when the next sentence follows without a space (#40)', () => {
  const hit = (t) => detectSensitive(t).filter((f) => f.type === 'email').map((f) => f.text);
  assert.deepEqual(hit('Email alice@example.com.Then call me'), ['alice@example.com']);
  assert.deepEqual(hit('see foo@bar.com.Please reply'), ['foo@bar.com']);
  assert.deepEqual(hit('write to bob@mail.example.co.uk today'), ['bob@mail.example.co.uk']);
  assert.deepEqual(hit('SHOUT@EXAMPLE.COM'), ['SHOUT@EXAMPLE.COM']);
});

test('card masking keeps the space after the number (#41)', () => {
  const { tokenizedText } = tokenizeSensitive('Card 4111 1111 1111 1111 and alice@example.com ok');
  assert.match(tokenizedText, /\[CARD_1\] and \[EMAIL_1\] ok$/);
  assert.deepEqual(detectSensitive('card 4111-1111-1111-1111- next').map((f) => f.text), ['4111-1111-1111-1111']);
});

test('quoted inline vault entities containing a comma stay whole (#42)', () => {
  assert.deepEqual(parseFrontmatterEntities('---\nsecrets: ["ACME, Inc", Other]\n---\n'), {
    'ACME, Inc': '[ENTITY_1]',
    Other: '[ENTITY_2]',
  });
});
