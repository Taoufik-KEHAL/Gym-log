import 'dart:io';

import 'package:google_mobile_ads/google_mobile_ads.dart';

/// Thin wrapper around google_mobile_ads. Ads are only ever loaded/shown on
/// Android/iOS -- feature-detected via [isSupported] -- so this plugin is
/// never touched on other platforms or in widget tests (which run on the
/// host OS, not a real device, and have no ads MethodChannel registered).
///
/// NOTE: the ad unit IDs below are Google's official *test* IDs -- they
/// always serve a placeholder test ad and never earn real revenue. Create
/// an AdMob account at admob.google.com, register this app, and swap these
/// (plus the matching test App ID in
/// android/app/src/main/AndroidManifest.xml) for your real IDs before
/// shipping to the Play Store -- Google suspends accounts caught shipping
/// test ad units in a production build.
class AdsService {
  AdsService._();
  static final AdsService instance = AdsService._();

  static bool get isSupported => Platform.isAndroid || Platform.isIOS;

  static const String bannerAdUnitId = 'ca-app-pub-3940256099942544/6300978111';
  static const String interstitialAdUnitId = 'ca-app-pub-3940256099942544/1033173712';

  InterstitialAd? _interstitialAd;
  bool _loadingInterstitial = false;

  Future<void> initialize() async {
    if (!isSupported) return;
    await MobileAds.instance.initialize();
    _loadInterstitial();
  }

  void _loadInterstitial() {
    if (!isSupported || _loadingInterstitial) return;
    _loadingInterstitial = true;
    InterstitialAd.load(
      adUnitId: interstitialAdUnitId,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          _loadingInterstitial = false;
          _interstitialAd = ad;
        },
        onAdFailedToLoad: (error) {
          _loadingInterstitial = false;
          _interstitialAd = null;
        },
      ),
    );
  }

  /// Shows the preloaded interstitial if one is ready, then starts loading
  /// the next one. No-ops if none is ready yet (including on unsupported
  /// platforms) -- callers should never wait on this.
  void showInterstitialIfReady() {
    final ad = _interstitialAd;
    if (ad == null) return;
    _interstitialAd = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (ad) {
        ad.dispose();
        _loadInterstitial();
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        ad.dispose();
        _loadInterstitial();
      },
    );
    ad.show();
  }
}
