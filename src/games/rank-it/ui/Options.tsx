import { OptionRow, OptionSection, Segmented, Stepper } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { PromptSourcePicker, WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import { RANK_CRITERIA, RANK_CRITERIA_SPICY } from '@/words/prompts/rank';
import {
  MAX_ITEMS,
  MAX_ROTATIONS,
  MAX_ROUNDS,
  MIN_ITEMS,
  MIN_ROTATIONS,
  MIN_ROUNDS,
  TIME_LIMITS,
  readOptions,
  totalRounds,
  type RankItOptions,
} from '../rules';
import styles from './Options.module.css';

/** Most a player can be asked to write (WordSourcePicker's stepper goes to this too). */
const WRITE_MAX = 8;

export default function RankItOptionsPanel({ value, onChange, playerCount, online }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<RankItOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const writing = o.items.perPlayer > 0;
  const rounds = totalRounds(o, playerCount);

  return (
    <>
      {/* The star mode, up front: your friends' things, ranked. */}
      <section className={`${styles.star} ${writing ? styles.starOn : ''}`}>
        <span className={styles.starIcon} aria-hidden>
          ✍️
        </span>
        <div className={styles.starText}>
          <strong>Everyone writes the items</strong>
          <p>
            The best way to play. Everyone writes {writing ? o.items.perPlayer : o.itemCount} things — your car, a
            celebrity, Mondays, Grandma’s lasagna — then you rank them by “most useful in a zombie apocalypse”.
          </p>
        </div>
        {writing ? (
          <button type="button" className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => set({ items: { ...o.items, perPlayer: 0 } })}>
            ✓ On · turn off
          </button>
        ) : (
          <button
            type="button"
            className="pg-btn pg-btn-primary"
            onClick={() => set({ items: { ...o.items, perPlayer: Math.min(WRITE_MAX, o.itemCount) } })}
          >
            Turn it on
          </button>
        )}
      </section>

      <OptionSection
        title="Mode"
        hint={
          o.mode === 'ranker'
            ? 'One player ranks in secret; everyone else guesses their order. The Ranker scores when they’re easy to read.'
            : 'No Ranker. Everyone ranks, and scores by how close they are to the room’s average order.'
        }
      >
        <Segmented
          value={o.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'ranker', label: '🎯 Ranker' },
            { value: 'crowd', label: '👥 Crowd' },
          ]}
          label="Mode"
        />
        {o.mode === 'ranker' ? (
          <OptionRow label="Turns as Ranker" hint={`${rounds} rounds with ${playerCount} players.`}>
            <Stepper
              value={o.rotations}
              min={MIN_ROTATIONS}
              max={MAX_ROTATIONS}
              onChange={(rotations) => set({ rotations })}
              format={(n) => `${n}× each`}
              label="Turns as Ranker"
            />
          </OptionRow>
        ) : (
          <>
            <OptionRow label="Rounds">
              <Stepper value={o.rounds} min={MIN_ROUNDS} max={MAX_ROUNDS} onChange={(r) => set({ rounds: r })} label="Rounds" />
            </OptionRow>
            <OptionRow label="Criterion" hint="Drawn at random, or a rotating player picks from two (or writes one).">
              <Segmented
                value={o.crowdPick}
                onChange={(crowdPick) => set({ crowdPick })}
                options={[
                  { value: 'random', label: 'Random' },
                  { value: 'chooser', label: 'A player picks' },
                ]}
                label="How the criterion is picked"
              />
            </OptionRow>
          </>
        )}
      </OptionSection>

      <OptionSection title="Each round">
        <OptionRow label="Items to rank">
          <Stepper value={o.itemCount} min={MIN_ITEMS} max={MAX_ITEMS} onChange={(itemCount) => set({ itemCount })} label="Items per round" />
        </OptionRow>
        <OptionRow
          label="Time to rank"
          hint={
            online
              ? 'Anyone not locked in at the buzzer scores 0. No order from the Ranker = a void round.'
              : 'On one device the clock is shared while the phone goes round — give it plenty, or leave it off.'
          }
        >
          <Segmented
            value={o.timeLimit}
            onChange={(timeLimit) => set({ timeLimit })}
            options={TIME_LIMITS.map((t) => ({ value: t, label: t === 0 ? 'Off' : `${t}s` }))}
            label="Ranking time limit"
          />
        </OptionRow>
      </OptionSection>

      <WordSourcePicker
        value={o.items}
        onChange={(items) => set({ items })}
        playerCount={playerCount}
        minEntries={o.itemCount}
        title="Things to rank"
        collectLabel="Everyone writes things"
        collectHint="Dealt before any pack item. Packs top up the rest."
        collectMax={WRITE_MAX}
      />

      <PromptSourcePicker
        value={o.criteria}
        onChange={(criteria) => set({ criteria })}
        kind="prompts"
        title="Criteria · “Most → least: …”"
        builtInLabel="Built-in criteria"
        builtInCount={RANK_CRITERIA.length}
        spicyCount={RANK_CRITERIA_SPICY.length}
        playerCount={playerCount}
        minEntries={1}
        collectLabel="Everyone writes criteria"
        collectHint="e.g. “likely to survive the washing machine”. The Ranker can always write their own, too."
      />
    </>
  );
}
