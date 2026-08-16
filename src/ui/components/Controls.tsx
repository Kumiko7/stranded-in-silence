/**
 * The reusable screen controls: a labelled slider, an on/off switch, a text
 * field and a tab strip. Everything the options menu is made of, and the first
 * pieces of the component set plan step 6 asked for.
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

interface TextFieldProps {
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  onChange(value: string): void;
}

/**
 * A line of text. The only one in the options menu, and the only control here
 * whose value is not a number or a choice.
 *
 * It writes through on every keystroke like everything else on this screen -
 * there is no Apply button anywhere in it - which is also why nothing is done
 * to what is typed while it is being typed: trimming or collapsing spaces under
 * the cursor makes a field that fights the person using it. That tidying is the
 * caller's, on the way into the profile (`@shared/playerName`).
 */
export function TextField({ label, value, placeholder, maxLength, onChange }: TextFieldProps) {
  return (
    <label class="field">
      <span class="field__label">{label}</span>
      <span class="field__control">
        <input
          class="text-field"
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
        />
      </span>
    </label>
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

/**
 * A block of fields. Groups a tab's contents into readable chunks.
 *
 * The title is optional: a `Choice` already carries its own label above its
 * chips, and a heading over it saying the same word twice is worse than no
 * heading at all.
 */
export function FieldGroup({ title, children }: { title?: string; children: ComponentChildren }) {
  return (
    <section class="field-group">
      {title && <h3 class="field-group__title">{title}</h3>}
      {children}
    </section>
  );
}

interface ChoiceProps<Id extends string> {
  label: string;
  value: Id;
  options: readonly { id: Id; label: string }[];
  onChange(id: Id): void;
}

/**
 * Pick one of several, as a wrapping row of chips.
 *
 * Deliberately not a dropdown. A native `<select>` renders as the operating
 * system's control, which in the middle of a horror game reads as a web page
 * instantly; and a hand-built dropdown has to float its list, which gets
 * clipped the moment it opens inside the options panel's scrolling body. Chips
 * have neither problem, every option is readable at a glance, and picking one
 * is a single click rather than two.
 *
 * It is the same idiom as the voice mode switch in the pause menu, wrapped -
 * one control shape for "pick one of these", however many there are.
 */
export function Choice<Id extends string>({ label, value, options, onChange }: ChoiceProps<Id>) {
  return (
    <div class="field field--stacked">
      <span class="field__label">{label}</span>
      <div class="chips" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            class={option.id === value ? 'chip-btn chip-btn--active' : 'chip-btn'}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
