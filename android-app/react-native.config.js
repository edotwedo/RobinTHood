// The all-files library is linked only into Phil's personal build (ROBIN_ALL_FILES=1),
// so the Play Store build never carries its storage permission.
const personal = process.env.ROBIN_ALL_FILES === '1';
module.exports = {
  dependencies: personal ? {} : { '@dr.pogodin/react-native-fs': { platforms: { android: null, ios: null } } },
};
