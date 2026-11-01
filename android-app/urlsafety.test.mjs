// node --test android-app/urlsafety.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnsafeUrl, parseIPv4 } from './urlsafety.js';

test('ordinary public pages are allowed', () => {
  for (const url of ['https://en.wikipedia.org/wiki/Tacoma', 'http://example.com/a?b=c', 'https://news.ycombinator.com:443/', 'https://8.8.8.8/', 'https://172.32.0.1/']) {
    assert.equal(isUnsafeUrl(url), false, url);
  }
});

test('the home network and the phone itself are refused, however the address is written', () => {
  for (const url of [
    'http://192.168.1.1/', 'http://192.168.1.171:8080/', 'http://10.0.0.1/', 'http://172.16.5.4/', 'http://172.31.255.255/',
    'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/',
    'http://3232235777/', 'http://0.0.0.0/', 'http://0/', 'http://169.254.169.254/latest/', 'http://100.64.0.1/', 'http://224.0.0.1/',
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fe80::1]/', 'http://[fd00::1]/', 'http://[::]/',
    'http://localhost/', 'http://LOCALHOST./', 'http://foo.localhost/', 'http://router/', 'http://printer.local/',
    'http://nas.lan/', 'http://box.home.arpa/', 'http://192.168.1.1./',
  ]) {
    assert.equal(isUnsafeUrl(url), true, url);
  }
});

test('non-web schemes, odd ports and credentials are refused', () => {
  for (const url of ['file:///sdcard/a.txt', 'intent://x#Intent;end', 'javascript:alert(1)', 'ftp://example.com/', 'http://example.com:22/', 'http://user:pw@example.com/', 'not a url', '']) {
    assert.equal(isUnsafeUrl(url), true, url);
  }
});

test('IPv4 literals parse the way the URL parser reads them', () => {
  assert.equal(parseIPv4('127.0.0.1'), 0x7f000001);
  assert.equal(parseIPv4('127.1'), 0x7f000001);
  assert.equal(parseIPv4('0x7f.1'), 0x7f000001);
  assert.equal(parseIPv4('example.com'), null);
  assert.equal(parseIPv4('256.1.1.1'), null);
});
