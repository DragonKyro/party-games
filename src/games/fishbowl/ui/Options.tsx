import { OptionRow, OptionSection, Segmented, Stepper, Toggle, formatSeconds } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import { MAX_SLIPS, MIN_SLIPS, ROUND_INFO, ROUND_KINDS, readOptions, type FishbowlOptions, type RoundKind } from '../rules';

export default function FishbowlOptionsPanel({ value, onChange, playerCount }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<FishbowlOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const toggleRound = (r: RoundKind) => {
    const on = o.rounds.includes(r);
    if (on && o.rounds.length === 1) return;
    set({ rounds: ROUND_KINDS.filter((k) => (k === r ? !on : o.rounds.includes(k))) });
  };

  return (
    <>
      <WordSourcePicker
        value={o.words}
        onChange={(words) => set({ words })}
        playerCount={playerCount}
        minEntries={MIN_SLIPS}
        fit="describe"
        title="What goes in the bowl"
        collectLabel="Everyone writes slips"
        collectHint="The classic way: famous names, places, things, inside jokes."
      />
      <OptionSection title="Rounds" hint="Played in this order, with the same slips each time.">
        <div style={{ display: 'grid', gap: 8 }}>
          {ROUND_KINDS.map((r) => {
            const on = o.rounds.includes(r);
            const n = o.rounds.indexOf(r) + 1;
            return (
              <OptionRow key={r} label={`${ROUND_INFO[r].emoji} ${on ? `${n}. ` : ''}${ROUND_INFO[r].name}`} hint={ROUND_INFO[r].rule}>
                <Toggle checked={on} onChange={() => toggleRound(r)} label={ROUND_INFO[r].name} />
              </OptionRow>
            );
          })}
        </div>
      </OptionSection>
      <OptionSection title="Game">
        <OptionRow label="Teams">
          <Segmented
            value={o.teamCount}
            onChange={(teamCount) => set({ teamCount })}
            options={[2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
            label="Number of teams"
          />
        </OptionRow>
        <OptionRow label="Turn length">
          <Stepper
            value={o.turnSeconds}
            min={15}
            max={180}
            step={15}
            onChange={(turnSeconds) => set({ turnSeconds })}
            format={formatSeconds}
          />
        </OptionRow>
        <OptionRow label="Slips in the bowl" hint="Player slips always go in; packs and lists top up to this.">
          <Stepper value={o.bowlSize} min={MIN_SLIPS} max={MAX_SLIPS} step={4} onChange={(bowlSize) => set({ bowlSize })} />
        </OptionRow>
        <OptionRow label="Skipping">
          <Segmented
            value={o.skipRule}
            onChange={(skipRule) => set({ skipRule })}
            options={[
              { value: 'free', label: 'Any time' },
              { value: 'one', label: '1 per turn' },
              { value: 'none', label: 'Never' },
            ]}
          />
        </OptionRow>
        <OptionRow label="Carry over time" hint="If you empty the bowl, you start the next round with what’s left.">
          <Toggle checked={o.carryOver} onChange={(carryOver) => set({ carryOver })} />
        </OptionRow>
      </OptionSection>
    </>
  );
}
