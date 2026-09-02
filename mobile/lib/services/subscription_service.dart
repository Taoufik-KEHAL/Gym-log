import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

/// Client-side Play Billing subscription entitlement for the History/Trends
/// paywall (see widgets/paywall_gate.dart). There is no backend receipt
/// validation here -- entitlement is trusted from the on-device purchase
/// stream, which is appropriate for a small personal app but not
/// tamper-proof against a determined user. Wraps the official
/// `in_app_purchase` plugin.
///
/// NOTE: [premiumProductId] is a placeholder. Create a matching
/// subscription product with this *exact* ID in Play Console
/// (play.google.com/console) before this can load a real product or take a
/// real payment -- until then, [product] stays null and [buy] has nothing
/// to purchase.
class SubscriptionService extends ChangeNotifier {
  SubscriptionService._();
  static final SubscriptionService instance = SubscriptionService._();

  static const String premiumProductId = 'gymlog_premium_monthly';

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSub;
  bool _isSubscribed = false;
  ProductDetails? _product;

  bool get isSubscribed => _isSubscribed;
  ProductDetails? get product => _product;

  Future<void> initialize() async {
    if (!await _iap.isAvailable()) return;
    _purchaseSub = _iap.purchaseStream.listen(_onPurchaseUpdate, onError: (_) {});
    await _loadProduct();
    await _iap.restorePurchases();
  }

  Future<void> _loadProduct() async {
    final response = await _iap.queryProductDetails({premiumProductId});
    if (response.productDetails.isEmpty) return;
    _product = response.productDetails.first;
    notifyListeners();
  }

  void _onPurchaseUpdate(List<PurchaseDetails> purchases) {
    for (final purchase in purchases) {
      if (purchase.productID != premiumProductId) continue;
      final active = purchase.status == PurchaseStatus.purchased || purchase.status == PurchaseStatus.restored;
      if (active != _isSubscribed) {
        _isSubscribed = active;
        notifyListeners();
      }
      if (purchase.pendingCompletePurchase) _iap.completePurchase(purchase);
    }
  }

  Future<void> buy() async {
    final product = _product;
    if (product == null) return;
    await _iap.buyNonConsumable(purchaseParam: PurchaseParam(productDetails: product));
  }

  Future<void> restorePurchases() => _iap.restorePurchases();

  @override
  void dispose() {
    _purchaseSub?.cancel();
    super.dispose();
  }
}
