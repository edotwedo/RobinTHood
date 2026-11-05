import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import mobileAds, { AdsConsent, BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// The banner unit ID comes from adsConfig.js, passed through app.config.js `extra`. Until a
// real one is set, a dev build or a release falls back to Google's test banner, so a request
// always fills and no sample ID is mistaken for a live one.
const configuredUnit = (Constants.expoConfig?.extra || {})[Platform.OS === 'ios' ? 'adMobBannerIos' : 'adMobBannerAndroid'];
const AD_UNIT_ID = __DEV__ || !configuredUnit ? TestIds.ADAPTIVE_BANNER : configuredUnit;

// House cards shown when AdMob has no fill or is offline. Only the developer's own
// projects, labelled as such: no partner, sponsor or audience claims without a deal behind them.
const SPONSORS = [
  { text: 'From Robin\'s developer: Dualtooth — Bluetooth & dual monitor sync', url: 'https://github.com/edotwedo/Dualtooth' },
  { text: 'From Robin\'s developer: Mega Zword — one hub for all your AIs (Windows)', url: 'https://github.com/edotwedo/mega-zword' },
];

// Google's consent form (UMP) runs once per launch before any ad request; in the EEA and
// UK it asks the user, elsewhere it returns at once. Offline, last launch's answer stands.
// The form's text is set up in AdMob under Privacy & messaging.
let consentOnce;
function adsAllowed() {
  consentOnce ??= (async () => {
    let canRequestAds = false;
    try {
      ({ canRequestAds } = await AdsConsent.gatherConsent());
    } catch {
      try { ({ canRequestAds } = await AdsConsent.getConsentInfo()); } catch {}
    }
    if (canRequestAds) await mobileAds().initialize().catch(() => {});
    return Boolean(canRequestAds);
  })();
  return consentOnce;
}

// Settings button: lets the user change their ad consent later, as UMP requires.
export function openAdPrivacyOptions() {
  return AdsConsent.showPrivacyOptionsForm().catch(() => {});
}

export function AdBanner({ hidden }) {
  const [allowed, setAllowed] = useState(null);
  const [adFailed, setAdFailed] = useState(false);
  const [sponsorIdx] = useState(() => Math.floor(Math.random() * SPONSORS.length));

  useEffect(() => {
    let live = true;
    adsAllowed().then((ok) => live && setAllowed(ok));
    return () => { live = false; };
  }, []);

  if (allowed === null) return null;
  const sponsor = SPONSORS[sponsorIdx];

  return (
    <View style={[styles.container, hidden && styles.hidden]}>
      {allowed && !adFailed ? (
        <BannerAd
          unitId={AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          onAdFailedToLoad={() => setAdFailed(true)}
        />
      ) : (
        <Pressable
          style={styles.sponsorCard}
          onPress={() => sponsor?.url && Linking.openURL(sponsor.url)}
          hitSlop={8}
        >
          <Text style={styles.sponsorText} numberOfLines={1}>
            {sponsor?.text}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070a13',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    minHeight: 50,
  },
  hidden: { display: 'none' },
  sponsorCard: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
  },
  sponsorText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '500',
  },
});
