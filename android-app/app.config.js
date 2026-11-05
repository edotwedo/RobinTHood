// app.json is the Play Store app. ROBIN_ALL_FILES=1 turns it into Phil's personal
// build: a separate app (own name and package, installs next to the Play version)
// that can ask for Android's "All files access" so Robin can use the whole phone.
const { withProjectBuildGradle, withAndroidManifest } = require('@expo/config-plugins');
const { resolveAds } = require('./adsConfig');

const withSecurityHardening = (cfg) => {
  return withAndroidManifest(cfg, (modConfig) => {
    const mainApp = modConfig.modResults.manifest.application?.[0];
    if (mainApp) {
      mainApp.$['android:allowBackup'] = 'false';
    }
    return modConfig;
  });
};

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
  // Every AdMob ID comes from one place, adsConfig.js: real IDs from the build environment,
  // Google's published test IDs otherwise.
  const adIds = resolveAds(process.env);
  const ads = { adMobBannerAndroid: adIds.androidBanner, adMobBannerIos: adIds.iosBanner };

  // Home Ollama is usually plain http:// over Tailscale or the home network, which Android
  // blocks in release builds unless cleartext is allowed. Every other address the app
  // uses is https.
  const baseConfig = withSecurityHardening(withAdMobCompatibility({
    ...config,
    plugins: [
      ...(config.plugins || []),
      ['react-native-google-mobile-ads', { androidAppId: adIds.androidApp, iosAppId: adIds.iosApp }],
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: true,
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            extraProguardRules: `
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-keep interface com.google.android.gms.ads.** { *; }
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class expo.modules.** { *; }
            `.trim(),
          },
        },
      ],
    ],
  }));

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
