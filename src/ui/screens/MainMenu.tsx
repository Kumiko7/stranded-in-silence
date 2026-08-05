import { useState } from 'preact/hooks';
import { t } from '@/i18n/index';

interface Props {
  code: string;
  status: 'connecting' | 'ready' | 'error';
  error: string | null;
  onStart(): void;
  onJoin(code: string): void;
  onOptions(): void;
}

export function MainMenu({ code, status, error, onStart, onJoin, onOptions }: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const ready = status === 'ready';

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div class="menu">
      <h1 class="menu__title">{t('game.title')}</h1>
      <p class="menu__tagline">{t('game.tagline')}</p>

      <div class="menu__panel">
        {/* The two things you can always do, stacked and the same width, with
            the code and join rows underneath them. */}
        <button class="btn btn--primary menu__action" disabled={!ready} onClick={onStart}>
          {t('menu.play')}
        </button>

        <button class="btn menu__action" onClick={onOptions}>
          {t('menu.options')}
        </button>

        <div class="menu__row">
          <span class="menu__label">{t('menu.yourCode')}</span>
          <code class="menu__code">{ready ? code : '------'}</code>
          <button class="btn btn--small" disabled={!ready} onClick={copy}>
            {copied ? t('common.copied') : t('lobby.copyCode')}
          </button>
        </div>

        <div class="menu__row">
          <input
            class="menu__input"
            maxLength={6}
            placeholder={t('join.prompt')}
            value={joinCode}
            disabled={!ready}
            onInput={(event) => setJoinCode((event.target as HTMLInputElement).value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && joinCode.length === 6) onJoin(joinCode);
            }}
          />
          <button class="btn" disabled={!ready || joinCode.length !== 6} onClick={() => onJoin(joinCode)}>
            {t('menu.join')}
          </button>
        </div>
      </div>

      <p class={`menu__status ${status === 'error' ? 'menu__status--error' : ''}`}>
        {error ?? (ready ? t('menu.status.ready') : t('join.connecting'))}
      </p>
    </div>
  );
}
