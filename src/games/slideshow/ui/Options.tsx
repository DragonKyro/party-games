import { OptionRow, OptionSection, Segmented, Stepper, Toggle, formatSeconds } from '@/ui/shared/controls';
import type { OptionsProps } from '@/ui/shared/types';
import { WordSourcePicker } from '@/ui/shared/WordSourcePicker';
import {
  AUTO_ADVANCE_CHOICES,
  MAX_RATE_SECONDS,
  MAX_SLIDES,
  MAX_TOPICS_PER_PLAYER,
  MIN_RATE_SECONDS,
  MIN_SLIDES,
  TALK_TIMER_CHOICES,
  readOptions,
  type SlideshowOptions,
} from '../rules';

export default function SlideshowOptionsPanel({ value, onChange, playerCount, online }: OptionsProps) {
  const o = readOptions(value);
  const set = (patch: Partial<SlideshowOptions>) => onChange({ ...o, ...patch } as unknown as Record<string, unknown>);

  return (
    <>
      <WordSourcePicker
        value={o.words}
        onChange={(words) => set({ words })}
        playerCount={playerCount}
        minEntries={Math.max(2, playerCount * o.talksEach)}
        fit="describe"
        title="Talk topics"
        collectLabel="Players write topics"
        collectHint="Nobody ever presents their own — someone else gets your “haunted printer”."
        collectMax={MAX_TOPICS_PER_PLAYER}
      />
      <OptionSection title="The deck" hint="Every talk gets a fresh random deck: one look, a few recurring words, no repeats.">
        <OptionRow label="Slides per talk" hint="Title and closing slide included.">
          <Stepper value={o.slides} min={MIN_SLIDES} max={MAX_SLIDES} onChange={(slides) => set({ slides })} label="Slides per talk" />
        </OptionRow>
        <OptionRow label="Auto-advance" hint="Slides move on by themselves, ready or not.">
          <Segmented
            value={o.autoAdvance}
            onChange={(autoAdvance) => set({ autoAdvance })}
            options={AUTO_ADVANCE_CHOICES.map((s) => ({ value: s as number, label: s === 0 ? 'Off' : `${s}s` }))}
            label="Auto-advance"
          />
        </OptionRow>
        <OptionRow label="Talk timer" hint="When it runs out, the talk is over.">
          <Segmented
            value={o.talkSeconds}
            onChange={(talkSeconds) => set({ talkSeconds })}
            options={TALK_TIMER_CHOICES.map((s) => ({ value: s as number, label: s === 0 ? 'Off' : formatSeconds(s) }))}
            label="Talk timer"
          />
        </OptionRow>
      </OptionSection>
      <OptionSection title="Extras">
        <OptionRow label="⚡ Wildcard twist" hint="Mid-talk, a twist lands on every screen: “The CEO just walked in.”">
          <Toggle checked={o.twists} onChange={(twists) => set({ twists })} label="Wildcard twist" />
        </OptionRow>
        <OptionRow label="🙋 Audience Q&A" hint="One or two awkward questions after the last slide.">
          <Toggle checked={o.qa} onChange={(qa) => set({ qa })} label="Audience Q&A" />
        </OptionRow>
        <OptionRow label="Talks each">
          <Segmented
            value={o.talksEach}
            onChange={(talksEach) => set({ talksEach })}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
            ]}
            label="Talks per player"
          />
        </OptionRow>
      </OptionSection>
      <OptionSection title="Rating" hint="The audience gives every talk 1–5 stars, hidden until everyone’s in.">
        {online ? (
          <OptionRow label="Time to vote">
            <Stepper
              value={o.rateSeconds}
              min={MIN_RATE_SECONDS}
              max={MAX_RATE_SECONDS}
              step={15}
              onChange={(rateSeconds) => set({ rateSeconds })}
              format={formatSeconds}
              label="Time to vote"
            />
          </OptionRow>
        ) : (
          <OptionRow
            label="On one device"
            hint={o.localRating === 'applause' ? 'The crowd cheers; whoever holds the device reads the meter.' : 'Each listener taps their stars in private, then passes it on.'}
          >
            <Segmented
              value={o.localRating}
              onChange={(localRating) => set({ localRating })}
              options={[
                { value: 'applause', label: '👏 Applause meter' },
                { value: 'pass', label: '🤲 Pass to vote' },
              ]}
              label="How the crowd rates"
            />
          </OptionRow>
        )}
      </OptionSection>
    </>
  );
}
