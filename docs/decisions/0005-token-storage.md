# 0005: Token storage

**Decision.**
- **Native:** the token goes in the iOS Keychain or Android Keystore through `expo-secure-store`.
- **Web:** the token goes in IndexedDB, AES-GCM encrypted. The key is a **non-extractable** WebCrypto key,
  also kept in IndexedDB.
- M1 stored plain tokens in localStorage. Those migrate on first read, and the plain copy is deleted.
- If IndexedDB is unavailable, the token stays in memory for the tab.

**Why.** No server ever holds user tokens (in phase 1). On web this doesn't stop script running on the page
from using the token. Nothing can; the app loads no third-party scripts, which keeps that surface small. It does mean a copied
browser profile or a storage dump doesn't reveal the token in plain text.

**Consequences.** Sign-out deletes both the token and the key. A 401 from GitHub signs out automatically.
