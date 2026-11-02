import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import mobileAds, { AdsConsent, BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// Public test IDs for development and verification before live approval
const AD_UNIT_ID = __DEV__ ? TestIds.ADAPTIVE_BANNER : 'ca-app-pub-3940256099942544/6300978111';

// Built-in fallback sponsor cards if AdMob has no fill or is offline
const SPONSORS = [
  { text: '★ PARTNER: Neon Serverless Postgres — Zero-wait DBs & autoscaling', url: 'https://neon.tech' },
  { text: '★ FEATURED: Dualtooth — Instant Bluetooth & Dual Monitor Sync', url: 'https://github.com/edotwedo/Dualtooth' },
  { text: '★ SPONSOR: Advertise your developer tool to 50k+ AI users', url: 'mailto:sponsor@robincode.dev' },
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
