import { OptionRow, OptionSection, Segmented, Stepper, formatSeconds } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import {
  MAX_ROUNDS,
  MAX_TURN_SECONDS,
  MIN_CARDS,
  MIN_ROUNDS,
  MIN_TURN_SECONDS,
  cardsNeeded,
  readOptions,
  type DisplayMode,
  type ForeheadOptions,
} from '../rules';

export default function ForeheadOptionsPanel({ value, onChange, playerCount, online }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<ForeheadOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const players = Math.max(2, playerCount);
  const rounds = Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => MIN_ROUNDS + i);

  return (
    <>
      <WordSourcePicker
        value={o.words}
        onChange={(words) => set({ words })}
        playerCount={playerCount}
        minEntries={MIN_CARDS}
        fit="describe"
        title="The deck"
        collectLabel="Players write cards"
        collectHint="Everyone adds a few names or things. Nobody ever gets a card they wrote."
      />
      <OptionSection
        title="Game"
        hint={`${online ? '' : 'One phone, passed to each guesser in turn. '}A brisk group gets through about ${
          cardsNeeded(o, players) - 10
        } cards in a match this size.`}
      >
        <OptionRow label="Turn length">
          <Stepper
            value={o.turnSeconds}
            min={MIN_TURN_SECONDS}
            max={MAX_TURN_SECONDS}
            step={15}
            onChange={(turnSeconds) => set({ turnSeconds })}
            format={formatSeconds}
            label="Turn length"
          />
        </OptionRow>
        <OptionRow label="Rounds" hint="Everyone guesses once per round.">
          <Segmented
            value={o.rounds}
            onChange={(r) => set({ rounds: r })}
            options={rounds.map((r) => ({ value: r, label: String(r) }))}
            label="Rounds"
          />
        </OptionRow>
      </OptionSection>
      {online ? (
        <OptionSection title="Where the word shows">
          <Segmented<DisplayMode>
            value={o.display}
            onChange={(display) => set({ display })}
            options={[
              { value: 'forehead', label: '🤳 On the forehead', hint: 'The guesser holds their phone up; tilt to answer.' },
              { value: 'others', label: '👀 On everyone else’s phone', hint: 'Clue-givers see it and tap Correct / Pass.' },
            ]}
            label="Where the word shows"
          />
          <p className="pg-faint" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>
            {o.display === 'forehead'
              ? 'The guesser’s phone goes on their forehead, screen out. Tilt down for got it, up to pass.'
              : 'The guesser’s phone never gets the word. Any clue-giver taps Correct or Pass. Great over a video call.'}
          </p>
        </OptionSection>
      ) : null}
    </>
  );
}
