// app.json is the Play Store app. ROBIN_ALL_FILES=1 turns it into Phil's personal
// build: a separate app (own name and package, installs next to the Play version)
// that can ask for Android's "All files access" so Robin can use the whole phone.
module.exports = ({ config }) => {
  const personal = process.env.ROBIN_ALL_FILES === '1';
  if (!personal) return { ...config, extra: { ...config.extra, allFiles: false } };
  return {
    ...config,
    name: 'Robin (Phil)',
    android: {
      ...config.android,
      package: 'com.edotwedo.robinthood.phil',
      permissions: [...(config.android?.permissions || []), 'MANAGE_EXTERNAL_STORAGE'],
      // Storage permissions stay for the file library; mic/overlay/background audio stay blocked.
      blockedPermissions: (config.android?.blockedPermissions || []).filter((p) => !/EXTERNAL_STORAGE/.test(p)),
    },
    extra: { ...config.extra, allFiles: true },
  };
};
