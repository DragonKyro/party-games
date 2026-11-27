import { SPECTRUMS, SPECTRUMS_SPICY } from '@/words/prompts/spectrums';
import { OptionRow, OptionSection, Segmented, Stepper } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { PromptSourcePicker } from '@/ui/shared/WordSourcePicker';
import {
  MAX_ROTATIONS,
  MAX_ROUNDS,
  MIN_ROTATIONS,
  MIN_ROUNDS,
  MIN_SPECTRUMS,
  ZONE_NAMES,
  ZONE_PRESETS,
  presetFor,
  readOptions,
  totalRounds,
  type TuneInOptions,
  type ZonePreset,
} from '../rules';

const PRESETS = Object.keys(ZONE_PRESETS) as ZonePreset[];

export default function TuneInOptionsPanel({ value, onChange, playerCount }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<TuneInOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const preset = presetFor(o.bands);
  const rounds = totalRounds(o, Math.max(2, playerCount));

  return (
    <>
      <OptionSection title="How to play">
        <OptionRow
          label="Mode"
          hint={
            o.mode === 'everyone'
              ? 'Everyone sets their own needle in secret. Closest wins.'
              : 'Co-op: the table argues over one shared needle and chases a team rating.'
          }
        >
          <Segmented
            value={o.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'team', label: 'Co-op' },
            ]}
            label="Mode"
          />
        </OptionRow>
        {o.mode === 'everyone' ? (
          <OptionRow label="Turns as Tuner" hint={`Each player tunes this many times: ${rounds} rounds with ${playerCount} players.`}>
            <Stepper
              value={o.rotations}
              min={MIN_ROTATIONS}
              max={MAX_ROTATIONS}
              onChange={(rotations) => set({ rotations })}
              format={(n) => `${n}×`}
              label="Turns as Tuner"
            />
          </OptionRow>
        ) : (
          <OptionRow label="Rounds" hint="The Tuner rotates round the table.">
            <Stepper value={o.rounds} min={MIN_ROUNDS} max={MAX_ROUNDS} onChange={(r) => set({ rounds: r })} label="Rounds" />
          </OptionRow>
        )}
        <OptionRow label="Guessing timer" hint="When it runs out, needles lock where they are.">
          <Segmented
            value={o.guessSeconds}
            onChange={(guessSeconds) => set({ guessSeconds })}
            options={[
              { value: 0, label: 'Off' },
              { value: 60, label: '60s' },
              { value: 90, label: '90s' },
            ]}
            label="Guessing timer"
          />
        </OptionRow>
        <OptionRow
          label="Scoring zones"
          hint={`4 points within ±${o.bands[0]}, 3 within ±${o.bands[1]}, 2 within ±${o.bands[2]}, 1 within ±${o.bands[3]}.`}
        >
          <Segmented<ZonePreset | 'custom'>
            value={preset ?? 'custom'}
            onChange={(p) => {
              if (p !== 'custom') set({ bands: [...ZONE_PRESETS[p]] });
            }}
            options={[
              ...PRESETS.map((p) => ({ value: p, label: ZONE_NAMES[p] })),
              ...(preset ? [] : [{ value: 'custom' as const, label: 'Custom' }]),
            ]}
            label="Scoring zones"
          />
        </OptionRow>
      </OptionSection>
      <PromptSourcePicker
        value={o.spectrums}
        onChange={(spectrums) => set({ spectrums })}
        kind="spectrums"
        title="Spectrums"
        builtInLabel="Built-in spectrums"
        builtInCount={SPECTRUMS.length}
        spicyCount={SPECTRUMS_SPICY.length}
        playerCount={playerCount}
        minEntries={MIN_SPECTRUMS}
        collectLabel="Everyone writes spectrums"
        collectHint="Two opposite ends each, like Cold ↔ Hot. Inside jokes welcome."
      />
    </>
  );
}
