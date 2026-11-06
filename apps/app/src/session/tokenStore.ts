import { createVault } from './vault';

/**
 * Where the GitHub token lives. It never leaves the device except in requests to api.github.com.
 *   native → iOS Keychain / Android Keystore (expo-secure-store), key 'gitling.token'
 *   web    → IndexedDB, AES-GCM encrypted with a non-extractable WebCrypto key that is also kept in
 *            IndexedDB (entries 'token' and 'key'). Script on the page can still *use* the key, but can't
 *            export it, so a copied database or a dumped localStorage doesn't reveal the token.
 *            A plain-text token left in localStorage by M1 is moved into the vault on first read.
 *
 * Built on createVault (./vault.ts), which keeps these exact storage names for the token so nobody is signed
 * out by an update. clear() (sign-out) removes only the token and its own key; other vaults, such as the
 * authenticator's, have separate keys and are untouched.
 */
export const tokenStore = createVault('token');
