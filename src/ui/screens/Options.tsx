/**
 * The options menu. Reachable from the main menu, the pause menu and the
 * lobby's escape menu - it is the same screen in all three, laid over whatever
 * was already there.
 *
 * Deliberately the basics: what every game has and nothing else. Key rebinding,
 * a language selector and per-effect graphics switches are not here, and the
 * things this project decided against (quality presets, accessibility settings)
 * are on the "Deliberately NOT built" list in docs/ARCHITECTURE.md.
 *
 * Every control writes through immediately - there is no Apply button, because
 * a setting you cannot hear or see change while you drag it is a setting you
 * have to guess at. The save profile is written on each change; the seam is
 * `Save.setOptions()`.
 *
 * Which volume sliders exist is read from `audio.json -> buses` rather than
 * listed here, so adding a bus adds its slider.
 */
import { useState } from 'preact/hooks';
import type { AudioConfig } from '@/config/types';
import type { Options, OptionRanges } from '@/save/index';
import { t } from '@/i18n/index';
import { FieldGroup, Slider, Switch, Tabs } from '../components/Controls';

type TabId = 'gameplay' | 'graphics' | 'audio';

const TAB_IDS: readonly TabId[] = ['gameplay', 'graphics', 'audio'];

interface Props {
  options: Options;
  ranges: OptionRanges;
  buses: AudioConfig['buses'];
  onChange(patch: Partial<Options>): void;
  onReset(): void;
  onClose(): void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export function Options({ options, ranges, buses, onChange, onReset, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('gameplay');

  // The sensitivity slider is a multiplier on the radians-per-pixel figure in
  // player.json, so it reads as "1.0x" rather than as a number nobody can place.
  const sensitivityLabel = `${options.controls.sensitivity.toFixed(2)}x`;

  return (
    <div class="overlay overlay--options">
      <div class="panel panel--options">
        <header class="panel__head">
          <h2 class="panel__title">{t('options.title')}</h2>
          <Tabs<TabId>
            tabs={TAB_IDS.map((id) => ({ id, label: t(`options.tab.${id}`) }))}
            active={tab}
            onSelect={setTab}
          />
        </header>

        <div class="panel__body">
          {tab === 'gameplay' && (
            <FieldGroup title={t('options.group.look')}>
              <Slider
                label={t('options.sensitivity')}
                value={options.controls.sensitivity}
                min={ranges.sensitivity.min}
                max={ranges.sensitivity.max}
                step={0.05}
                display={sensitivityLabel}
                onChange={(sensitivity) => onChange({ controls: { ...options.controls, sensitivity } })}
              />
              <Switch
                label={t('options.invertY')}
                value={options.controls.invertY}
                onLabel={t('common.on')}
                offLabel={t('common.off')}
                onChange={(invertY) => onChange({ controls: { ...options.controls, invertY } })}
              />
            </FieldGroup>
          )}

          {tab === 'graphics' && (
            <FieldGroup title={t('options.group.display')}>
              <Slider
                label={t('options.fov')}
                value={options.graphics.fovDegrees}
                min={ranges.fov.min}
                max={ranges.fov.max}
                step={1}
                display={t('options.degrees', { value: Math.round(options.graphics.fovDegrees) })}
                onChange={(fovDegrees) => onChange({ graphics: { ...options.graphics, fovDegrees } })}
              />
              <Slider
                label={t('options.brightness')}
                value={options.graphics.brightness}
                min={ranges.brightness.min}
                max={ranges.brightness.max}
                step={0.01}
                display={percent(options.graphics.brightness)}
                onChange={(brightness) => onChange({ graphics: { ...options.graphics, brightness } })}
              />
              <Switch
                label={t('options.shadows')}
                value={options.graphics.shadows}
                onLabel={t('common.on')}
                offLabel={t('common.off')}
                onChange={(shadows) => onChange({ graphics: { ...options.graphics, shadows } })}
              />
            </FieldGroup>
          )}

          {tab === 'audio' && (
            <FieldGroup title={t('options.group.volume')}>
              {Object.entries(buses)
                .filter(([, bus]) => bus.labelKey)
                .map(([id, bus]) => (
                  <Slider
                    key={id}
                    label={t(bus.labelKey ?? '')}
                    value={options.volumes[id] ?? bus.defaultVolume}
                    min={ranges.volume.min}
                    max={ranges.volume.max}
                    step={0.01}
                    display={percent(options.volumes[id] ?? bus.defaultVolume)}
                    onChange={(volume) => onChange({ volumes: { ...options.volumes, [id]: volume } })}
                  />
                ))}
            </FieldGroup>
          )}
        </div>

        <footer class="panel__foot">
          <button class="btn btn--small" onClick={onReset}>
            {t('common.reset')}
          </button>
          <button class="btn btn--primary" data-sfx="back" onClick={onClose}>
            {t('common.back')}
          </button>
        </footer>
      </div>
    </div>
  );
}
