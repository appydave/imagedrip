/**
 * ChatGPT selectors — the ONE swappable module (spec §4).
 *
 * Every DOM selector + predicate ChatGPT can break lives here, so re-pinning is a
 * 5-minute edit (then a rebuild), not a code hunt. Imported by BOTH the webview
 * preload (bundled into the ChatGPT view) and the harness (main).
 *
 * ⚠️ UNVERIFIED PLACEHOLDERS. These reflect ChatGPT's DOM as best understood at
 * authoring time (2026-07-19). They are NOT confirmed against a live logged-in
 * session — that is Probe C's job (a human must log in). Treat re-pinning as
 * expected maintenance, not a bug (spec §4/§8).
 */

export interface ChatGPTSelectors {
  /** The composer — a contenteditable in current ChatGPT (was a <textarea>). */
  promptInput: string;
  /** Container of the newest assistant message. */
  latestAssistantTurn: string;
  /** <img> within an assistant turn. */
  imageInTurn: string;
  /** True only for a real, decoded image (not a spinner/placeholder). */
  isLoaded(img: HTMLImageElement): boolean;
  /** The "you've hit your image limit" surface. */
  rateLimitBanner: string;
  /** Content-policy refusal marker (optional — best-effort). */
  refusalMarker?: string;
  /** The submit key. If ChatGPT ever needs Cmd+Enter, flip it here. */
  submitKey: 'Return' | 'Cmd+Return';
  /** New-chat URL, navigated before each batch. */
  newChatUrl: string;
  /**
   * Substrings the preload text-matches to confirm a rate-limit state, since the
   * banner has no stable class. Case-insensitive, matched against the banner's
   * textContent as a second gate over `rateLimitBanner`.
   */
  rateLimitPhrases: string[];
  /** Substrings that mark a content-policy refusal (text-matched in the preload). */
  refusalPhrases: string[];
}

export const CHATGPT_SELECTORS: ChatGPTSelectors = {
  // Composer: current ChatGPT uses a ProseMirror contenteditable with this id.
  promptInput: '#prompt-textarea',

  // Assistant turns carry a data attribute; the preload takes the LAST match.
  latestAssistantTurn: '[data-message-author-role="assistant"]',

  // Generated images render as <img> inside the assistant turn. Exclude tiny
  // avatar/icon imagery via the isLoaded size gate below.
  imageInTurn: 'img',

  isLoaded(img: HTMLImageElement): boolean {
    const src = img.currentSrc || img.src || '';
    const realProtocol = src.startsWith('https://') || src.startsWith('blob:');
    // Placeholders/spinners are data: URIs or 0-sized; a decoded image has natural size.
    const decoded = img.complete && img.naturalWidth > 32 && img.naturalHeight > 32;
    return realProtocol && decoded;
  },

  // No stable class for the limit banner — pair a broad role selector with the
  // text gate (rateLimitPhrases) in the preload.
  rateLimitBanner: '[role="alert"], [role="status"]',
  refusalMarker: '[data-message-author-role="assistant"]',

  submitKey: 'Return',
  newChatUrl: 'https://chatgpt.com/',

  rateLimitPhrases: [
    'image generation limit',
    "you've hit your",
    'you have hit your',
    'limit for images',
    'try again later',
    'reached your limit',
    'come back later',
  ],
  refusalPhrases: [
    "i can't create",
    "i can't generate",
    "i cannot create",
    "i'm not able to create",
    "i'm unable to create",
    'violates our content policy',
    'against our usage policies',
  ],
};
