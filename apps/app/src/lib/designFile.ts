import { DESIGN_FILE_EXT, DESIGN_FILE_MAX_BYTES } from '@gitling/design';
import { Platform, Share } from 'react-native';
import { isMobileBrowser } from '@/pwa/InstallSheet';

/**
 * Saving and opening design files (`*.gitling.json`, format in docs/DESIGN-FILE.md). The format lives in
 * packages/design (designToFile / readDesignText); this file only moves text between the app and the device.
 *  - web: the share sheet on phones (Web Share with a file), otherwise a normal download; the browser's file picker
 *  - native: the share sheet (Save to Files, AirDrop, mail…). Opening a file on native isn't wired up yet (it
 *    needs expo-document-picker); people paste the file's text into Studio instead.
 */

/** True where "Open a file" works. */
export const canOpenFiles = Platform.OS === 'web';

export async function saveDesignFile(text: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Phone browsers: hand the file to the share sheet (Save to Files, Drive, a chat…) instead of a download that
    // lands somewhere hard to find. Desktop browsers and older phones fall back to a normal download.
    const file = typeof File !== 'undefined' ? new File([text], fileName, { type: 'application/json' }) : null;
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (file && isMobileBrowser() && nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: fileName }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; /* the share sheet failed: download instead */ }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  await Share.share({ title: fileName, message: text });
}

/** Opens the file picker and resolves with the chosen file's text, or null if nothing was picked. */
export function openDesignFile(): Promise<string | null> {
  if (Platform.OS !== 'web') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${DESIGN_FILE_EXT},.json,application/json`;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      if (f.size > DESIGN_FILE_MAX_BYTES) return reject(new Error('That file is too big to be a Gitling design.'));
      f.text().then(resolve, () => reject(new Error("Couldn't read that file.")));
    };
    // Closing the picker without choosing fires "cancel" in current browsers; older ones just never call back.
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
