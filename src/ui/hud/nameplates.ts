/**
 * The name over a teammate's head.
 *
 * Plain DOM rather than Preact (docs/systems/UI.md), and for the strongest
 * version of that reason in the game: these move every frame, with the camera,
 * for up to three players at once. A vdom diff per plate per frame would be
 * pure waste.
 *
 * It draws where it is told and decides nothing. Which teammates have a plate
 * at all - visible, in the map, in range, and with line of sight - is
 * `Game.nameplates()`, because every one of those questions is about the world
 * rather than about the interface.
 *
 * One element per player, kept and reused: a run creates at most three of them,
 * and rebuilding the node is what would make the text flicker as somebody walks
 * behind a doorframe.
 */
import type { NameplateView } from '@/game/Game';
import { playerLabel } from '../playerLabel';

export interface Nameplates {
  update(views: readonly NameplateView[]): void;
  unmount(): void;
}

interface Plate {
  element: HTMLElement;
  /** What is currently written in it, so an unchanged name is not rewritten. */
  label: string;
}

export function mountNameplates(parent: HTMLElement): Nameplates {
  const root = document.createElement('div');
  root.className = 'nameplates';
  parent.append(root);

  const plates = new Map<string, Plate>();

  return {
    update(views): void {
      for (const view of views) {
        let plate = plates.get(view.id);
        if (!plate) {
          const element = document.createElement('div');
          element.className = 'nameplate';
          root.append(element);
          plate = { element, label: '' };
          plates.set(view.id, plate);
        }

        const label = playerLabel(view.name, view.index);
        if (label !== plate.label) {
          plate.label = label;
          plate.element.textContent = label;
        }

        // Positioned from the top-left of its own box so the name is centred
        // over the head rather than starting at it.
        plate.element.style.left = `${view.x}%`;
        plate.element.style.top = `${view.y}%`;
        plate.element.style.opacity = String(view.opacity);
        plate.element.hidden = false;
      }

      // Anybody not in this frame's list is hidden rather than removed: they
      // are usually behind a door for a second, and their element is worth more
      // than the two lines it costs to keep.
      if (plates.size === views.length) return;
      for (const [id, plate] of plates) {
        if (!views.some((view) => view.id === id)) plate.element.hidden = true;
      }
    },

    unmount(): void {
      root.remove();
      plates.clear();
    },
  };
}
