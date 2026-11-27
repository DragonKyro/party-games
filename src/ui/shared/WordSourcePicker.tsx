import { useState, useSyncExternalStore } from 'react';
import { PACK_LIST, type PackFit, type PackId } from '@/words';
import { loadLists, subscribeLists, type ListKind, type SavedList } from '@/words/library';
import {
  estimatePoolSize,
  promptSourceProblem,
  sourceProblem,
  type PromptSource,
  type WordSource,
} from '@/words/source';
import { Stepper, Toggle } from './controls';
import { ListManager } from './ListManager';
import styles from './WordSourcePicker.module.css';

// Where the words come from — the same three choices in every game:
// built-in packs, the host's saved lists ("bring your own vocabulary"), and
// players writing their own at the start of the match. Any combination.

export function useSavedLists(kind?: ListKind): SavedList[] {
  const all = useSyncExternalStore(subscribeLists, loadLists, loadLists);
  return kind ? all.filter((l) => l.kind === kind) : all;
}

const FIT_LABEL: Record<PackFit, string> = { draw: 'drawing', act: 'acting', describe: 'describing' };

export function WordSourcePicker({
  value,
  onChange,
  playerCount,
  minEntries,
  fit,
  title = 'Words',
  collectLabel = 'Players write their own',
  collectHint = 'Everyone types some in at the start — the heart of the game!',
  collectMax = 8,
}: {
  value: WordSource;
  onChange: (next: WordSource) => void;
  playerCount: number;
  minEntries: number;
  /** Highlight packs that suit this kind of play. */
  fit?: PackFit;
  title?: string;
  collectLabel?: string;
  collectHint?: string;
  collectMax?: number;
}) {
  const lists = useSavedLists('words');
  const [managing, setManaging] = useState(false);
  const sizes = Object.fromEntries(lists.map((l) => [l.id, l.entries.length]));
  const listIds = value.listIds.filter((id) => sizes[id] !== undefined);
  const source = { ...value, listIds };
  const problem = sourceProblem(source, sizes, playerCount, minEntries);
  const estimate = estimatePoolSize(source, sizes, playerCount);

  const togglePack = (id: PackId) =>
    onChange({
      ...source,
      packs: source.packs.includes(id) ? source.packs.filter((p) => p !== id) : [...source.packs, id],
    });
  const toggleList = (id: string) =>
    onChange({
      ...source,
      listIds: source.listIds.includes(id) ? source.listIds.filter((x) => x !== id) : [...source.listIds, id],
    });

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <span className={`pg-chip ${problem ? '' : 'pg-chip-accent'}`}>
          ~{estimate} {estimate === 1 ? 'entry' : 'entries'}
        </span>
      </header>

      <div className={styles.collect}>
        <div className={styles.collectText}>
          <strong>✍️ {collectLabel}</strong>
          <small>{collectHint}</small>
        </div>
        <div className={styles.collectControls}>
          {source.perPlayer > 0 && (
            <Stepper
              value={source.perPlayer}
              min={1}
              max={collectMax}
              onChange={(n) => onChange({ ...source, perPlayer: n })}
              format={(n) => `${n} each`}
              label="Entries per player"
            />
          )}
          <Toggle
            checked={source.perPlayer > 0}
            onChange={(on) => onChange({ ...source, perPlayer: on ? Math.min(collectMax, 4) : 0 })}
            label={collectLabel}
          />
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupHead}>
          <span className="pg-kicker">Built-in packs</span>
          {fit && <span className={styles.fitNote}>★ = great for {FIT_LABEL[fit]}</span>}
        </div>
        <div className={styles.packs}>
          {PACK_LIST.map((p) => {
            const on = source.packs.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`${styles.pack} ${on ? styles.on : ''}`}
                onClick={() => togglePack(p.id)}
                aria-pressed={on}
                title={p.blurb}
              >
                <span className={styles.emoji} aria-hidden>
                  {p.emoji}
                </span>
                <span className={styles.packText}>
                  <span className={styles.packName}>
                    {p.name}
                    {fit && p.fit[0] === fit && <span className={styles.star}>★</span>}
                  </span>
                  <span className={styles.count}>
                    {p.adultsOnly ? '18+ · ' : ''}
                    {p.words.length} words
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupHead}>
          <span className="pg-kicker">Your saved lists</span>
          <button type="button" className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => setManaging(true)}>
            {lists.length ? 'Manage lists' : '+ New list'}
          </button>
        </div>
        {lists.length === 0 ? (
          <p className={styles.empty}>
            Paste in your own vocabulary — inside jokes, a class word list, anything. Saved on this device, and only sent
            to the game when it starts.
          </p>
        ) : (
          <div className={styles.lists}>
            {lists.map((l) => {
              const on = source.listIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`${styles.list} ${on ? styles.on : ''}`}
                  onClick={() => toggleList(l.id)}
                  aria-pressed={on}
                >
                  <span className={styles.check}>{on ? '✓' : ''}</span>
                  <span className={styles.packName}>{l.name}</span>
                  <span className={styles.count}>{l.entries.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {problem && <p className={styles.problem}>{problem}</p>}
      {managing && <ListManager kind="words" onClose={() => setManaging(false)} />}
    </section>
  );
}

/** The same idea for prompt-style content (Rank It criteria, Tune In spectrums). */
export function PromptSourcePicker({
  value,
  onChange,
  kind,
  title,
  builtInLabel,
  builtInCount,
  spicyCount,
  playerCount,
  minEntries,
  collectLabel,
  collectHint,
  collectMax = 4,
}: {
  value: PromptSource;
  onChange: (next: PromptSource) => void;
  kind: Exclude<ListKind, 'words'>;
  title: string;
  builtInLabel: string;
  builtInCount: number;
  spicyCount: number;
  playerCount: number;
  minEntries: number;
  collectLabel: string;
  collectHint?: string;
  collectMax?: number;
}) {
  const lists = useSavedLists(kind);
  const [managing, setManaging] = useState(false);
  const sizes = Object.fromEntries(lists.map((l) => [l.id, l.entries.length]));
  const source = { ...value, listIds: value.listIds.filter((id) => sizes[id] !== undefined) };
  const problem = promptSourceProblem(source, sizes, playerCount, minEntries, builtInCount);
  const toggleList = (id: string) =>
    onChange({
      ...source,
      listIds: source.listIds.includes(id) ? source.listIds.filter((x) => x !== id) : [...source.listIds, id],
    });

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
      </header>
      <div className={styles.collect}>
        <div className={styles.collectText}>
          <strong>📚 {builtInLabel}</strong>
          <small>{builtInCount} ready to go</small>
        </div>
        <Toggle checked={source.builtIn} onChange={(on) => onChange({ ...source, builtIn: on })} label={builtInLabel} />
      </div>
      {spicyCount > 0 && (
        <div className={styles.collect}>
          <div className={styles.collectText}>
            <strong>🌶️ After dark (18+)</strong>
            <small>{spicyCount} cheekier extras</small>
          </div>
          <Toggle checked={source.spicy} onChange={(on) => onChange({ ...source, spicy: on })} label="18+ extras" />
        </div>
      )}
      <div className={styles.collect}>
        <div className={styles.collectText}>
          <strong>✍️ {collectLabel}</strong>
          {collectHint && <small>{collectHint}</small>}
        </div>
        <div className={styles.collectControls}>
          {source.perPlayer > 0 && (
            <Stepper
              value={source.perPlayer}
              min={1}
              max={collectMax}
              onChange={(n) => onChange({ ...source, perPlayer: n })}
              format={(n) => `${n} each`}
            />
          )}
          <Toggle
            checked={source.perPlayer > 0}
            onChange={(on) => onChange({ ...source, perPlayer: on ? Math.min(collectMax, 2) : 0 })}
            label={collectLabel}
          />
        </div>
      </div>
      <div className={styles.group}>
        <div className={styles.groupHead}>
          <span className="pg-kicker">Your saved lists</span>
          <button type="button" className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => setManaging(true)}>
            {lists.length ? 'Manage lists' : '+ New list'}
          </button>
        </div>
        {lists.length > 0 && (
          <div className={styles.lists}>
            {lists.map((l) => {
              const on = source.listIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`${styles.list} ${on ? styles.on : ''}`}
                  onClick={() => toggleList(l.id)}
                  aria-pressed={on}
                >
                  <span className={styles.check}>{on ? '✓' : ''}</span>
                  <span className={styles.packName}>{l.name}</span>
                  <span className={styles.count}>{l.entries.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {problem && <p className={styles.problem}>{problem}</p>}
      {managing && <ListManager kind={kind} onClose={() => setManaging(false)} />}
    </section>
  );
}
