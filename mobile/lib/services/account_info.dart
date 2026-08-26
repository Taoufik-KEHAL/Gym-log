/// Signed-in account details handed down via [Provider] so screens (like
/// the Data tab) can show who's signed in and offer a sign-out button
/// without talking to Firebase directly — keeps them testable without
/// Firebase being initialized at all.
class AccountInfo {
  final String? email;
  final Future<void> Function()? signOut;

  /// When this account first signed in -- the free-trial clock (see
  /// lib/utils/trial.dart) starts here.
  final DateTime? createdAt;

  const AccountInfo({this.email, this.signOut, this.createdAt});
}
