import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/account_info.dart';
import '../services/subscription_service.dart';
import '../utils/trial.dart';

/// Wraps a premium screen (History, Trends): shows [child] during the free
/// trial or once subscribed, otherwise a paywall in its place.
class PaywallGate extends StatelessWidget {
  final Widget child;
  const PaywallGate({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final sub = context.watch<SubscriptionService>();
    final account = context.read<AccountInfo>();
    if (sub.isSubscribed || isTrialActive(account.createdAt)) return child;
    return _Paywall(sub: sub);
  }
}

class _Paywall extends StatelessWidget {
  final SubscriptionService sub;
  const _Paywall({required this.sub});

  @override
  Widget build(BuildContext context) {
    final product = sub.product;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, size: 48),
            const SizedBox(height: 16),
            const Text(
              'Your 14-day free trial has ended',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Subscribe to keep tracking your history and trends.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: product == null ? null : sub.buy,
              child: Text(product == null ? 'Loading...' : 'Subscribe (${product.price})'),
            ),
            TextButton(onPressed: sub.restorePurchases, child: const Text('Restore purchases')),
          ],
        ),
      ),
    );
  }
}
