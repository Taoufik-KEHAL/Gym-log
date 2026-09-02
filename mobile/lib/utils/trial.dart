const int freeTrialDays = 14;

/// Whether the free trial is still active for an account created at
/// [createdAt]. An unknown creation date (shouldn't normally happen --
/// Firebase always sets this on sign-in) is treated as still-trialing
/// rather than locking someone out over missing data.
bool isTrialActive(DateTime? createdAt) {
  if (createdAt == null) return true;
  return DateTime.now().difference(createdAt).inDays < freeTrialDays;
}
