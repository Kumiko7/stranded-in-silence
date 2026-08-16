/**
 * Putting the lobby code on the clipboard, wherever the game is running.
 *
 * One helper rather than two call sites doing it themselves, because the answer
 * is different in the desktop shell and because it can *fail* - and a Copy
 * button that silently does nothing while still saying "Copied" is worse than
 * one that admits it.
 *
 * Three routes, in order of how much they can be trusted:
 *
 *  1. **The shell.** `navigator.clipboard` is behind `clipboard-sanitized-write`,
 *     which the shell's permission handler refuses along with everything else
 *     the game has no business asking for. Widening that for a six-character
 *     code is the wrong trade, so the shell copies it directly instead.
 *  2. **The async clipboard.** What a browser wants, and what it gets.
 *  3. **A hidden textarea and `execCommand`.** Deprecated, and still the only
 *     thing that works in a page that is not a secure context.
 */

export async function copyText(text: string): Promise<boolean> {
  const shell = window.strandedShell?.clipboard;
  if (shell) {
    shell.write(text);
    return true;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

/**
 * The old way: a text field off screen, selected, copied, removed. `opacity`
 * and a corner rather than `display: none`, because a field that is not laid
 * out cannot be selected and the copy silently takes nothing.
 */
function legacyCopy(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(field);

  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
