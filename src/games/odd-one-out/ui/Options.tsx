import { OptionRow, OptionSection, Segmented, Stepper, formatSeconds } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import {
  FORMAT_INFO,
  MAX_DISCUSS_SECONDS,
  MAX_ROUNDS,
  MAX_TALK_MINUTES,
  MIN_BOARD,
  MIN_ROUNDS,
  MIN_TALK_MINUTES,
  TWO_OUTSIDER_MIN,
  readOptions,
  type OddOneOutOptions,
} from '../rules';

export default function OddOneOutOptionsPanel({ value, onChange, playerCount, online }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<OddOneOutOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);
  const twoOk = playerCount >= TWO_OUTSIDER_MIN;

  return (
    <>
      <WordSourcePicker
        value={o.words}
        onChange={(words) => set({ words })}
        playerCount={playerCount}
        minEntries={MIN_BOARD}
        fit="describe"
        title="Board words"
        collectLabel="Players write the board"
        collectHint="Everyone adds words and the board becomes “Our words”. Packs top it up if it’s short."
      />
      <OptionSection title="Each round" hint="Every board comes from one pack or list, so it has a clear category.">
        <OptionRow label="Rounds">
          <Stepper value={o.rounds} min={MIN_ROUNDS} max={MAX_ROUNDS} onChange={(rounds) => set({ rounds })} />
        </OptionRow>
        <OptionRow label="Board size">
          <Segmented
            value={o.boardSize}
            onChange={(boardSize) => set({ boardSize })}
            options={[
              { value: 12, label: '12 words' },
              { value: 16, label: '16 words' },
            ]}
            label="Board size"
          />
        </OptionRow>
        <OptionRow
          label="Outsiders"
          hint={twoOk ? 'Two outsiders don’t know each other.' : `Two outsiders needs ${TWO_OUTSIDER_MIN}+ players.`}
        >
          <Segmented
            value={o.outsiders}
            onChange={(outsiders) => set({ outsiders: outsiders === 2 && !twoOk ? 1 : outsiders })}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2', hint: twoOk ? undefined : `Needs ${TWO_OUTSIDER_MIN}+ players` },
            ]}
            label="Number of outsiders"
          />
        </OptionRow>
      </OptionSection>
      <OptionSection title="Format">
        <Segmented
          value={o.format}
          onChange={(format) => set({ format })}
          options={(['clues', 'questions'] as const).map((f) => ({
            value: f,
            label: `${FORMAT_INFO[f].emoji} ${FORMAT_INFO[f].name}`,
          }))}
          label="Format"
        />
        <p className="pg-dim" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
          {FORMAT_INFO[o.format].rule}
          {o.format === 'clues' && (online ? ' Clues are typed and shown to everyone.' : ' Clues are said out loud.')}
        </p>
        {o.format === 'clues' ? (
          <OptionRow label="Discussion timer" hint="After the last clue. Off: the host calls the vote.">
            <Stepper
              value={o.discussSeconds}
              min={0}
              max={MAX_DISCUSS_SECONDS}
              step={30}
              onChange={(discussSeconds) => set({ discussSeconds })}
              format={(s) => (s === 0 ? 'Off' : formatSeconds(s))}
            />
          </OptionRow>
        ) : (
          <OptionRow label="Talk time" hint="The host can call the vote early.">
            <Stepper
              value={o.talkMinutes}
              min={MIN_TALK_MINUTES}
              max={MAX_TALK_MINUTES}
              onChange={(talkMinutes) => set({ talkMinutes })}
              format={(m) => `${m} min`}
            />
          </OptionRow>
        )}
      </OptionSection>
      {!online && (
        <OptionSection title="Voting on one device">
          <OptionRow
            label="How to vote"
            hint={
              o.voting === 'secret'
                ? 'Pass the device round; everyone votes in private.'
                : 'Everyone points at once; tap whoever got the most. No voting bonus.'
            }
          >
            <Segmented
              value={o.voting}
              onChange={(voting) => set({ voting })}
              options={[
                { value: 'secret', label: 'Secret ballots' },
                { value: 'open', label: 'Open vote' },
              ]}
              label="Voting"
            />
          </OptionRow>
        </OptionSection>
      )}
    </>
  );
}
