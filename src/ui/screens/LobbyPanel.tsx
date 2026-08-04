/**
 * The expedition panel, top right of the lobby: what has been picked, how many
 * picked it, what difficulty the lever is on, and how long is left.
 *
 * Map voting itself happens on the 3D poster wall, not here (docs/systems/UI.md).
 * This is the readout, and it is the only place the countdown appears - it has to
 * be visible from anywhere in the cabin, including while facing the fire.
 */
import { t } from '@/i18n/index';
import type { LobbyView } from '@/game/Lobby';

export function LobbyPanel({ view, maxPlayers }: { view: LobbyView; maxPlayers: number }) {
  const urgent = view.countdown !== null && view.countdown <= 10;

  return (
    <div class="expedition">
      <div class="expedition__head">
        <span class="expedition__title">{t('lobby.expedition')}</span>
        <span class="expedition__players">{t('lobby.players', { current: view.players, max: maxPlayers })}</span>
      </div>

      {view.tally.length === 0 ? (
        <p class="expedition__empty">{t('lobby.noMapChosen')}</p>
      ) : (
        <ul class="expedition__list">
          {view.tally.map((entry) => (
            <li key={entry.mapId} class={entry.mine ? 'expedition__row expedition__row--mine' : 'expedition__row'}>
              <span class="expedition__map">{t(entry.nameKey)}</span>
              {view.players > 1 && <span class="expedition__votes">{t('lobby.votes', { count: entry.votes })}</span>}
            </li>
          ))}
        </ul>
      )}

      <div class="expedition__line">
        <span class="expedition__label">{t('lobby.difficulty')}</span>
        <span class="expedition__value">{t(view.difficultyNameKey)}</span>
      </div>

      {view.countdown !== null && (
        <div class={urgent ? 'expedition__clock expedition__clock--urgent' : 'expedition__clock'}>
          {t('lobby.startingIn', { seconds: view.countdown })}
        </div>
      )}

      {view.countdown !== null && view.undecided > 0 && (
        <p class="expedition__note">{t('lobby.waitingForVotes', { count: view.undecided })}</p>
      )}
    </div>
  );
}
