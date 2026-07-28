import { FileAuthor, type AuthorResult } from './file-author.js';

/**
 * SwappableFileAuthor (WP1) — a FileAuthor whose scoped root follows the ACTIVE
 * project's output dir. The WebviewHarness captures its FileAuthor once at
 * construction (`webview-harness.ts:32` — live-verified, out of scope to edit),
 * so per-project routing has to happen INSIDE the author: this subclass
 * delegates every write/delete to an inner FileAuthor that is rebuilt whenever
 * the root moves. All of FileAuthor's guarantees (escape refusal, atomic
 * writes, best-effort git commit) hold — they live in the inner instance.
 */
export class SwappableFileAuthor extends FileAuthor {
  private inner: FileAuthor;
  private currentRoot: string;

  constructor(initialRoot: string) {
    super({ root: initialRoot });
    this.inner = new FileAuthor({ root: initialRoot });
    this.currentRoot = initialRoot;
  }

  /** Repoint the scoped root (e.g. on project switch). No-op if unchanged. */
  setRoot(root: string): void {
    if (root === this.currentRoot) return;
    this.inner = new FileAuthor({ root });
    this.currentRoot = root;
  }

  /** The current scoped root (base class keeps its own private `root`). */
  get activeRoot(): string {
    return this.currentRoot;
  }

  override write(
    relPath: string,
    content: string | Uint8Array,
    message?: string,
  ): Promise<AuthorResult> {
    return this.inner.write(relPath, content, message);
  }

  override delete(relPath: string, message?: string): Promise<AuthorResult> {
    return this.inner.delete(relPath, message);
  }
}
