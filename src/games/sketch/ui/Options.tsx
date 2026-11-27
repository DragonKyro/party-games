import { OptionRow, OptionSection, Segmented, Stepper, Toggle, formatSeconds } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import {
  MAX_ROUNDS,
  MAX_TURN_SECONDS,
  MIN_ROUNDS,
  MIN_TURN_SECONDS,
  MIN_WORDS,
  readOptions,
  type GuessMode,
  type SketchOptions,
} from '../rules';

const GUESS_HINT: Record<GuessMode, string> = {
  typed: 'Everyone types guesses on their phone, and the game checks them. Best online.',
  spoken: 'Everyone shouts. The artist taps whoever got it. Best in the same room.',
};

export default function SketchOptionsPanel({ value, onChange, playerCount, online }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<SketchOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const turns = o.rounds * Math.max(2, playerCount);

  return (
    <>
      <WordSourcePicker
        value={o.words}
        onChange={(words) => set({ words })}
        playerCount={playerCount}
        minEntries={Math.max(MIN_WORDS, turns)}
        fit="draw"
        title="Words to draw"
        collectLabel="Players write words"
        collectHint="Everyone writes a few things to draw. Nobody is ever asked to draw their own."
        collectMax={5}
      />
      <OptionSection title="Game">
        <OptionRow label="Rounds" hint="Everyone draws once per round.">
          <Stepper
            value={o.rounds}
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            onChange={(rounds) => set({ rounds })}
            label="Rounds"
          />
        </OptionRow>
        <OptionRow label="Drawing time">
          <Stepper
            value={o.turnSeconds}
            min={MIN_TURN_SECONDS}
            max={MAX_TURN_SECONDS}
            step={10}
            onChange={(turnSeconds) => set({ turnSeconds })}
            format={formatSeconds}
            label="Drawing time"
          />
        </OptionRow>
        <OptionRow
          label="Guessing"
          hint={online ? GUESS_HINT[o.guessing] : 'One device: everyone shouts, and the artist taps whoever got it.'}
        >
          {online ? (
            <Segmented
              value={o.guessing}
              onChange={(guessing) => set({ guessing })}
              options={[
                { value: 'typed', label: '⌨️ Typed' },
                { value: 'spoken', label: '📣 Shouted' },
              ]}
              label="Guessing"
            />
          ) : (
            <span className="pg-chip">📣 Shouted</span>
          )}
        </OptionRow>
        <OptionRow label="Hints" hint="Show the blanks, and reveal a few letters as time runs down.">
          <Toggle checked={o.hints} onChange={(hints) => set({ hints })} label="Hints" />
        </OptionRow>
      </OptionSection>
    </>
  );
}
