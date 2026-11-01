// app.json is the Play Store app. ROBIN_ALL_FILES=1 turns it into Phil's personal
// build: a separate app (own name and package, installs next to the Play version)
// that can ask for Android's "All files access" so Robin can use the whole phone.
const { withProjectBuildGradle } = require('@expo/config-plugins');

const withAdMobCompatibility = (cfg) => {
  return withProjectBuildGradle(cfg, (modConfig) => {
    if (!modConfig.modResults.contents.includes('play-services-ads:23.6.0')) {
      modConfig.modResults.contents += `
allprojects {
  configurations.all {
    resolutionStrategy {
      force "com.google.android.gms:play-services-ads:23.6.0"
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
  const baseConfig = withAdMobCompatibility(config);

  if (!personal) {
    return {
      ...baseConfig,
      extra: { ...baseConfig.extra, allFiles: false },
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
    extra: { ...baseConfig.extra, allFiles: true },
  };
};
