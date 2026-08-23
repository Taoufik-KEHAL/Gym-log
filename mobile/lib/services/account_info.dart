/// Signed-in account details handed down via [Provider] so screens (like
/// the Data tab) can show who's signed in and offer a sign-out button
/// without talking to Firebase directly — keeps them testable without
/// Firebase being initialized at all.
class AccountInfo {
  final String? email;
  final Future<void> Function()? signOut;

  const AccountInfo({this.email, this.signOut});
}
