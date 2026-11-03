// app.json is the Play Store app. ROBIN_ALL_FILES=1 turns it into Phil's personal
// build: a separate app (own name and package, installs next to the Play version)
// that can ask for Android's "All files access" so Robin can use the whole phone.
const { withProjectBuildGradle } = require('@expo/config-plugins');

const withAdMobCompatibility = (cfg) => {
  return withProjectBuildGradle(cfg, (modConfig) => {
    if (!modConfig.modResults.contents.includes('-Xskip-metadata-version-check')) {
      modConfig.modResults.contents += `
allprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions {
      freeCompilerArgs += ["-Xskip-metadata-version-check"]
    }
  }
}
`;
    }
    return modConfig;
  });
};

module.exports = ({ config }) => {
  const personal = process.env.ROBIN_ALL_FILES === '1';
  // Search worker signing key, from CI secrets. Without it the app skips the worker.
  const robinSecret = process.env.ROBIN_CLIENT_SECRET || '';
  // Home Ollama is usually plain http:// over Tailscale or the home network, which Android
  // blocks in release builds unless cleartext is allowed. Every other address the app
  // uses is https.
  // Real AdMob IDs, injected at build time (CI secrets) so no test IDs reach a release.
  // The app IDs live on the plugin; the banner unit IDs reach the app through extra.
  const admob = {
    androidApp: process.env.ROBIN_ADMOB_ANDROID_APP || '',
    iosApp: process.env.ROBIN_ADMOB_IOS_APP || '',
    androidBanner: process.env.ROBIN_ADMOB_ANDROID_BANNER || '',
    iosBanner: process.env.ROBIN_ADMOB_IOS_BANNER || '',
  };
  const plugins = (config.plugins || []).map((entry) => {
    const [name, opts = {}] = Array.isArray(entry) ? entry : [entry];
    if (name !== 'react-native-google-mobile-ads') return entry;
    return [name, { ...opts, androidAppId: admob.androidApp || opts.androidAppId, iosAppId: admob.iosApp || opts.iosAppId }];
  });
  const ads = { adMobBannerAndroid: admob.androidBanner, adMobBannerIos: admob.iosBanner };

  const baseConfig = withAdMobCompatibility({
    ...config,
    plugins: [...plugins, ['expo-build-properties', { android: { usesCleartextTraffic: true } }]],
  });

  if (!personal) {
    return {
      ...baseConfig,
      extra: { ...baseConfig.extra, allFiles: false, robinSecret, ...ads },
    };
  }

  return {
    ...baseConfig,
    name: 'Robin (Phil)',
    android: {
      ...baseConfig.android,
      package: 'com.edotwedo.robinthood.phil',
      permissions: [...(baseConfig.android?.permissions || []), 'MANAGE_EXTERNAL_STORAGE'],
      // Storage permissions stay for the file library; mic/overlay/background audio stay blocked.
      blockedPermissions: (baseConfig.android?.blockedPermissions || []).filter((p) => !/EXTERNAL_STORAGE/.test(p)),
    },
    extra: { ...baseConfig.extra, allFiles: true, robinSecret, ...ads },
  };
};
