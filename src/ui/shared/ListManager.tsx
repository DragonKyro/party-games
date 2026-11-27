import { useState } from 'react';
import { deleteList, newListId, parseListText, saveList, type ListKind, type SavedList } from '@/words/library';
import { Modal } from './Modal';
import { useSavedLists } from './WordSourcePicker';
import styles from './ListManager.module.css';

// Create / edit / delete the host's saved lists (kept in this browser).

const KIND_COPY: Record<ListKind, { noun: string; placeholder: string; help: string }> = {
  words: {
    noun: 'word list',
    placeholder: 'Grandma’s meatloaf\nThe office printer\nTaylor Swift\n…',
    help: 'One per line (commas work too). Names, places, phrases, inside jokes — anything.',
  },
  prompts: {
    noun: 'prompt list',
    placeholder: 'useful on a camping trip\nlikely to go viral\nembarrassing to be caught doing\n…',
    help: 'One per line. For Rank It, write criteria that finish “most … least”.',
  },
  spectrums: {
    noun: 'spectrum list',
    placeholder: 'Cold | Hot\nOverrated | Underrated\nBad pizza topping | Good pizza topping\n…',
    help: 'One per line, two ends separated by “|”.',
  },
};

export function ListManager({ kind, onClose }: { kind: ListKind; onClose: () => void }) {
  const lists = useSavedLists(kind);
  const [editing, setEditing] = useState<SavedList | null>(null);
  const copy = KIND_COPY[kind];

  if (editing) {
    return <ListEditor list={editing} kind={kind} onDone={() => setEditing(null)} onClose={onClose} />;
  }

  return (
    <Modal title="Your saved lists" onClose={onClose}>
      <div className={styles.root}>
        <p className="pg-dim">Saved on this device only. Players never see a list until the game deals from it.</p>
        {lists.length === 0 && <p className={styles.empty}>No {copy.noun}s yet.</p>}
        <ul className={styles.items}>
          {lists.map((l) => (
            <li key={l.id} className={styles.item}>
              <span className={styles.name}>{l.name}</span>
              <span className={styles.count}>{l.entries.length}</span>
              <button className="pg-btn pg-btn-sm pg-btn-ghost" onClick={() => setEditing(l)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
        <button
          className="pg-btn pg-btn-primary"
          onClick={() => setEditing({ id: newListId(), name: '', kind, entries: [], updatedAt: 0 })}
        >
          + New {copy.noun}
        </button>
      </div>
    </Modal>
  );
}

function ListEditor({
  list,
  kind,
  onDone,
  onClose,
}: {
  list: SavedList;
  kind: ListKind;
  onDone: () => void;
  onClose: () => void;
}) {
  const copy = KIND_COPY[kind];
  const isNew = list.updatedAt === 0;
  const [name, setName] = useState(list.name);
  const [text, setText] = useState(list.entries.join('\n'));
  const entries = parseListText(text, kind);
  const canSave = name.trim().length > 0 && entries.length > 0;

  const save = () => {
    if (!canSave) return;
    saveList({ ...list, name: name.trim().slice(0, 40), entries });
    onDone();
  };

  return (
    <Modal
      title={isNew ? `New ${copy.noun}` : `Edit “${list.name}”`}
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button
              className="pg-btn pg-btn-bad pg-btn-sm"
              onClick={() => {
                if (window.confirm?.(`Delete “${list.name}”?`) ?? true) {
                  deleteList(list.id);
                  onDone();
                }
              }}
            >
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="pg-btn pg-btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button className="pg-btn pg-btn-primary" onClick={save} disabled={!canSave}>
            Save
          </button>
        </>
      }
    >
      <div className={styles.root}>
        <label className={styles.label}>
          <span className="pg-kicker">Name</span>
          <input
            className="pg-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Office party"
            autoFocus
          />
        </label>
        <label className={styles.label}>
          <span className="pg-kicker">Entries · {entries.length}</span>
          <textarea
            className={`pg-input ${styles.textarea}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={copy.placeholder}
            rows={10}
            spellCheck
          />
        </label>
        <p className="pg-faint">{copy.help}</p>
      </div>
    </Modal>
  );
}
