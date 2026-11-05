import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TEST, resolveAds } = require('./adsConfig.js');

test('with no env, app IDs are Google test IDs and no banner unit is set', () => {
  const ads = resolveAds({});
  assert.equal(ads.androidApp, TEST.androidApp);
  assert.equal(ads.iosApp, TEST.iosApp);
  assert.equal(ads.androidBanner, '');
  assert.equal(ads.iosBanner, '');
});

test('env values win for all four IDs', () => {
  const ads = resolveAds({
    ROBIN_ADMOB_ANDROID_APP: 'ca-app-pub-1~2',
    ROBIN_ADMOB_IOS_APP: 'ca-app-pub-3~4',
    ROBIN_ADMOB_ANDROID_BANNER: 'ca-app-pub-1/2',
    ROBIN_ADMOB_IOS_BANNER: 'ca-app-pub-3/4',
  });
  assert.deepEqual(ads, {
    androidApp: 'ca-app-pub-1~2',
    iosApp: 'ca-app-pub-3~4',
    androidBanner: 'ca-app-pub-1/2',
    iosBanner: 'ca-app-pub-3/4',
  });
});

test('blank or whitespace env falls back to the test default', () => {
  const ads = resolveAds({ ROBIN_ADMOB_ANDROID_APP: '   ', ROBIN_ADMOB_IOS_APP: '', ROBIN_ADMOB_ANDROID_BANNER: ' ' });
  assert.equal(ads.androidApp, TEST.androidApp);
  assert.equal(ads.iosApp, TEST.iosApp);
  assert.equal(ads.androidBanner, '');
});

test('the default app IDs are Google-published test IDs, not invented live IDs', () => {
  assert.match(TEST.androidApp, /^ca-app-pub-3940256099942544~\d+$/);
  assert.match(TEST.iosApp, /^ca-app-pub-3940256099942544~\d+$/);
});
