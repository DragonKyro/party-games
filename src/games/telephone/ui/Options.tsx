import { OptionRow, OptionSection, Stepper, Toggle, formatSeconds } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import {
  DRAW_SECONDS,
  GUESS_SECONDS,
  PROMPT_CHOICES,
  chainLength,
  readOptions,
  type TelephoneOptions,
} from '../rules';

const DEFAULT_CAP = 8;

export default function TelephoneOptionsPanel({ value, onChange, playerCount, online }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<TelephoneOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const n = Math.max(3, playerCount);
  const steps = chainLength(n, o.maxSteps);
  const full = chainLength(n);
  const drawings = steps / 2;
  const minutes = Math.ceil((drawings * o.drawSeconds + drawings * o.guessSeconds) / 60);

  return (
    <>
      <WordSourcePicker
        value={o.words}
        onChange={(words) => set({ words })}
        playerCount={playerCount}
        minEntries={o.words.perPlayer > 0 ? 1 : n * PROMPT_CHOICES}
        fit="draw"
        title="Starting prompts"
        collectLabel="Everyone writes their own"
        collectHint="Each player starts their sketchbook with a prompt they make up. Otherwise everyone picks 1 of 3 from the packs."
        collectMax={1}
      />
      <OptionSection
        title="Passing"
        hint={`With ${n} players each book is passed on ${steps} times: ${drawings} drawings and ${drawings} guesses.`}
      >
        <OptionRow
          label="Cap long chains"
          hint={o.maxSteps > 0 ? 'Shorter books for big groups. Still ends on a guess.' : 'Every book goes round the whole table.'}
        >
          <Toggle
            checked={o.maxSteps > 0}
            onChange={(on) => set({ maxSteps: on ? Math.min(DEFAULT_CAP, full) : 0 })}
            label="Cap long chains"
          />
        </OptionRow>
        {o.maxSteps > 0 && (
          <OptionRow label="Passes per book">
            <Stepper
              value={o.maxSteps % 2 ? o.maxSteps + 1 : o.maxSteps}
              min={2}
              max={16}
              step={2}
              onChange={(maxSteps) => set({ maxSteps })}
              format={(v) => `${v} passes`}
              label="Passes per book"
            />
          </OptionRow>
        )}
      </OptionSection>
      <OptionSection
        title="Timer"
        hint={
          online
            ? o.timed
              ? `About ${minutes} min of drawing and guessing, then the reveal.`
              : 'Each step waits for everyone. The host can hurry people along.'
            : 'On one device each player’s clock starts when they take the phone.'
        }
      >
        <OptionRow label="Timed steps" hint="When time’s up, whatever is on the page gets passed on.">
          <Toggle checked={o.timed} onChange={(timed) => set({ timed })} label="Timed steps" />
        </OptionRow>
        {o.timed && (
          <>
            <OptionRow label="✏️ Drawing time">
              <Stepper
                value={o.drawSeconds}
                min={DRAW_SECONDS.min}
                max={DRAW_SECONDS.max}
                step={15}
                onChange={(drawSeconds) => set({ drawSeconds })}
                format={formatSeconds}
                label="Drawing time"
              />
            </OptionRow>
            <OptionRow label="💭 Guessing time">
              <Stepper
                value={o.guessSeconds}
                min={GUESS_SECONDS.min}
                max={GUESS_SECONDS.max}
                step={5}
                onChange={(guessSeconds) => set({ guessSeconds })}
                format={formatSeconds}
                label="Guessing time"
              />
            </OptionRow>
          </>
        )}
      </OptionSection>
    </>
  );
}
