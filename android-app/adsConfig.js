// The single place every AdMob ID is chosen. Real IDs come from the build environment
// (ROBIN_ADMOB_*); when one is unset the app falls back to Google's published test IDs, so
// a release never carries a make-believe live ID. To swap in real IDs, set the env vars —
// app.config.js feeds them to the native plugin and to the in-app banner, no code change.
//
// CommonJS on purpose: app.config.js requires it at build time, and it stays plain enough to
// load under `node --test` (see adsConfig.test.mjs).
const TEST = {
  androidApp: 'ca-app-pub-3940256099942544~3347511713',
  iosApp: 'ca-app-pub-3940256099942544~1458002511',
  // No banner unit on purpose: with none set, AdBanner uses the SDK's TestIds banner.
  banner: '',
};

const pick = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

function resolveAds(env = {}) {
  return {
    androidApp: pick(env.ROBIN_ADMOB_ANDROID_APP, TEST.androidApp),
    iosApp: pick(env.ROBIN_ADMOB_IOS_APP, TEST.iosApp),
    androidBanner: pick(env.ROBIN_ADMOB_ANDROID_BANNER, TEST.banner),
    iosBanner: pick(env.ROBIN_ADMOB_IOS_BANNER, TEST.banner),
  };
}

module.exports = { TEST, resolveAds };
