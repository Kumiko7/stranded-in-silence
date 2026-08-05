/**
 * Key rebinding: the Controls tab of the options menu.
 *
 * Click an action, press a key. Three rules the design brief asks for
 * (docs/systems/UI.md):
 *
 *   - **conflicts are shown, not silently resolved.** Binding a key another
 *     action already has does not unbind that action. It tells you, and leaves
 *     the choice with you - two actions on one key is occasionally deliberate,
 *     and quietly taking somebody's other key away is worse than saying so.
 *   - **only the primary key moves.** WASD ships with the arrow keys as a second
 *     binding; rebinding W should not cost you the up arrow.
 *   - **some actions do not move at all.** Escape is how you reach the menu that
 *     would undo a bad rebind, so `input.json` marks it unrebindable and it is
 *     drawn locked rather than hidden.
 *
 * While capturing, the whole window is listening: a key, a mouse button, or
 * Escape to give up. That listener is deliberately on `capture` so it runs
 * before the game's own input handler, which is otherwise perfectly happy to
 * interpret the key you are trying to bind.
 */
import { useEffect, useState } from 'preact/hooks';
import type { ActionInfo } from '@/input/index';
import { t } from '@/i18n/index';
import { KeyCap } from '../components/KeyCap';

interface Props {
  actions: ActionInfo[];
  /** Applies the rebind. Returns the ids of any actions now sharing the key. */
  onRebind(action: string, code: string): string[];
  onResetBinds(): void;
}

/** Action ids that ended up sharing a key, and the one that caused it. */
interface Clash {
  action: string;
  others: string[];
}

export function ControlsTab({ actions, onRebind, onResetBinds }: Props) {
  const [capturing, setCapturing] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);

  useEffect(() => {
    if (!capturing) return;

    const finish = (code: string): void => {
      setCapturing(null);
      if (!code) return;
      const others = onRebind(capturing, code);
      setClash(others.length ? { action: capturing, others } : null);
    };

    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      // Escape backs out rather than binding itself. It is also the one key
      // guaranteed to be reachable if you have just bound something unusable.
      finish(event.code === 'Escape' ? '' : event.code);
    };
    const onMouse = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      finish(`Mouse${event.button}`);
    };
    const onContextMenu = (event: Event): void => event.preventDefault();

    // Capture phase: the game's own listeners are on the same window and would
    // otherwise act on the key being bound.
    addEventListener('keydown', onKey, true);
    addEventListener('mousedown', onMouse, true);
    addEventListener('contextmenu', onContextMenu, true);
    return () => {
      removeEventListener('keydown', onKey, true);
      removeEventListener('mousedown', onMouse, true);
      removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [capturing, onRebind]);

  // Categories in the order `input.json` lists them, which is the order they
  // matter in - movement first, system last.
  const categories: { id: string; actions: ActionInfo[] }[] = [];
  for (const action of actions) {
    let group = categories.find((entry) => entry.id === action.category);
    if (!group) {
      group = { id: action.category, actions: [] };
      categories.push(group);
    }
    group.actions.push(action);
  }

  return (
    <>
      {categories.map((category) => (
        <section key={category.id} class="field-group">
          <h3 class="field-group__title">{t(`options.category.${category.id}`)}</h3>

          {category.actions.map((action) => {
            const isCapturing = capturing === action.id;
            const clashed = clash?.action === action.id ? clash.others : null;

            return (
              <div key={action.id} class="bind">
                <div class="bind__row">
                  <span class="bind__label">{t(action.labelKey)}</span>

                  <div class="bind__keys">
                    {/* Alternates are shown but not editable - they are what
                        keeps arrow keys working after you move WASD. */}
                    {action.keys.slice(1).map((code) => (
                      <span key={code} class="bind__alt">
                        <KeyCap code={code} size="small" />
                      </span>
                    ))}

                    <button
                      type="button"
                      class={`bind__key${isCapturing ? ' bind__key--capturing' : ''}${action.rebindable ? '' : ' bind__key--locked'}`}
                      disabled={!action.rebindable}
                      title={action.rebindable ? undefined : t('options.rebind.locked')}
                      onClick={() => {
                        setClash(null);
                        setCapturing(isCapturing ? null : action.id);
                      }}
                    >
                      {isCapturing ? (
                        <span class="bind__listening">{t('options.rebind.listening')}</span>
                      ) : (
                        <KeyCap code={action.keys[0] ?? ''} size="small" />
                      )}
                    </button>
                  </div>
                </div>

                {isCapturing && <p class="bind__note">{t('options.rebind.prompt', { action: t(action.labelKey) })}</p>}

                {clashed && (
                  <p class="bind__note bind__note--clash">
                    {t('options.rebind.conflict', {
                      action: clashed.map((id) => t(labelKeyOf(actions, id))).join(', '),
                    })}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <div class="panel__inline-action">
        <button class="btn btn--small" onClick={onResetBinds}>
          {t('options.rebind.reset')}
        </button>
      </div>
    </>
  );
}

function labelKeyOf(actions: ActionInfo[], id: string): string {
  return actions.find((action) => action.id === id)?.labelKey ?? id;
}
