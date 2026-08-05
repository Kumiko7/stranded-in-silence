/**
 * The reusable screen controls: a labelled slider, an on/off switch and a tab
 * strip. Everything the options menu is made of, and the first pieces of the
 * component set plan step 6 asked for.
 *
 * Three rules hold for all of them:
 *   - no colour, size or radius literal - only the CSS variables fed from
 *     `config/ui.json` (docs/systems/UI.md);
 *   - no user-visible string - the caller passes text it has already run
 *     through `t()`, so nothing here needs to know about locales;
 *   - keyboard and mouse are equal citizens, with a visible focus state.
 *
 * The slider is a real `<input type="range">` under a full custom skin. Nothing
 * of the browser's own appearance survives, and dragging, arrow keys, Home/End
 * and page keys all come free and correct rather than being re-implemented.
 */
import type { ComponentChildren } from 'preact';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as the player should read it - "82%", "75°", "1.4x". */
  display: string;
  onChange(value: number): void;
}

export function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  // The filled portion is drawn behind the thumb from this, so the track shows
  // how far along it is without a second element to keep in step.
  const filled = max > min ? (value - min) / (max - min) : 0;

  return (
    <label class="field">
      <span class="field__label">{label}</span>
      <span class="field__control">
        <input
          class="slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--filled': `${filled * 100}%` }}
          onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
        />
        <span class="field__value">{display}</span>
      </span>
    </label>
  );
}

interface SwitchProps {
  label: string;
  value: boolean;
  /** Already localised: what the two positions are called. */
  onLabel: string;
  offLabel: string;
  onChange(value: boolean): void;
}

/**
 * A sliding switch, not a two-option segmented control. The segmented idiom is
 * right for "pick one of three" (voice modes) and wrong for a boolean: it
 * highlights whichever option is selected, so a setting that is OFF lights the
 * word OFF up in the accent colour and reads, at a glance, as on.
 */
export function Switch({ label, value, onLabel, offLabel, onChange }: SwitchProps) {
  return (
    <div class="field">
      <span class="field__label">{label}</span>
      <span class="field__control field__control--switch">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          class={value ? 'switch switch--on' : 'switch'}
          onClick={() => onChange(!value)}
        >
          <span class="switch__knob" />
        </button>
        <span class="field__value">{value ? onLabel : offLabel}</span>
      </span>
    </div>
  );
}

interface TabsProps<Id extends string> {
  tabs: readonly { id: Id; label: string }[];
  active: Id;
  onSelect(id: Id): void;
}

export function Tabs<Id extends string>({ tabs, active, onSelect }: TabsProps<Id>) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          class={tab.id === active ? 'tabs__tab tabs__tab--active' : 'tabs__tab'}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** A titled block of fields. Groups a tab's contents into readable chunks. */
export function FieldGroup({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class="field-group">
      <h3 class="field-group__title">{title}</h3>
      {children}
    </section>
  );
}
