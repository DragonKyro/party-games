import type { CSSProperties, ReactNode } from 'react';
import type { SlideSpec, TableCell } from '../deck';
import { Chart, Diagram } from './charts';
import { onColor } from './color';
import { Picture } from './pictures';
import styles from './Slide.module.css';

// ============================================================================
// Renders one `SlideSpec` at 16:9. The slide is a size container and every
// length inside is in container units (cqw), so it scales crisply from a
// phone to a TV; charts, diagrams and pictures are SVG with a viewBox.
// Exactly one main element per slide, plus its title and at most a caption.
// ============================================================================

export function Slide({ slide, index, total, className }: { slide: SlideSpec; index: number; total: number; className?: string }) {
  const { palette, layout, font, footer } = slide.theme;
  const vars = {
    '--s-bg': palette.bg,
    '--s-surface': palette.surface,
    '--s-ink': palette.ink,
    '--s-muted': palette.muted,
    '--s-a0': palette.accents[0],
    '--s-a1': palette.accents[1],
    '--s-a2': palette.accents[2],
    '--s-a3': palette.accents[3],
    '--s-on-a0': onColor(palette.accents[0]),
    '--s-on-a1': onColor(palette.accents[1]),
  } as CSSProperties;

  let content: ReactNode;
  if (slide.kind === 'title') {
    content = (
      <div className={styles.cover}>
        <p className={styles.kicker}>{slide.subtitle}</p>
        <h2 className={styles.coverTitle}>{slide.title}</h2>
        <div className={styles.byline}>
          <strong>{slide.presenter}</strong>
          <span>{slide.role}</span>
        </div>
      </div>
    );
  } else if (slide.kind === 'closer') {
    content = (
      <div className={`${styles.cover} ${styles.closer}`}>
        <h2 className={styles.coverTitle}>{slide.title}</h2>
        <p className={styles.closerSub}>{slide.subtitle}</p>
      </div>
    );
  } else {
    const caption = slide.kind === 'chart' || slide.kind === 'diagram' || slide.kind === 'image' ? slide.caption : null;
    content = (
      <>
        <header className={styles.head}>
          <h2 className={styles.title}>{slide.title}</h2>
        </header>
        <div className={styles.main} data-main={slide.kind}>
          <Main slide={slide} />
        </div>
        {caption && <p className={styles.caption}>{caption}</p>}
      </>
    );
  }

  return (
    <div
      className={`${styles.slide} ${className ?? ''}`}
      style={vars}
      data-layout={layout}
      data-font={font}
      data-kind={slide.kind}
      data-dark={palette.dark ? '' : undefined}
      role="group"
      aria-roledescription="slide"
      aria-label={`Slide ${index + 1} of ${total}: ${slide.title}`}
    >
      <div className={styles.canvas}>
        {content}
        <footer className={styles.foot}>
          <span>{footer}</span>
          <span className={styles.page}>{index + 1}</span>
        </footer>
      </div>
    </div>
  );
}

function Main({ slide }: { slide: Exclude<SlideSpec, { kind: 'title' | 'closer' }> }) {
  const palette = slide.theme.palette;
  switch (slide.kind) {
    case 'bullets':
      return (
        <ul className={styles.bullets} data-count={slide.bullets.length}>
          {slide.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      );
    case 'chart':
      return <Chart chart={slide.chart} palette={palette} />;
    case 'table':
      return (
        <table className={styles.table}>
          <thead>
            <tr>
              {slide.columns.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slide.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row">
                      <Cell cell={cell} />
                    </th>
                  ) : (
                    <td key={c} data-t={cell.t}>
                      <Cell cell={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'image':
      return <Picture scene={slide.scene} seed={slide.seed} palette={palette} className={styles.picture} />;
    case 'diagram':
      return <Diagram diagram={slide.diagram} palette={palette} />;
    case 'bigNumber':
      return (
        <div className={styles.big}>
          <span className={styles.bigValue}>{slide.value}</span>
          <span className={styles.bigCaption}>{slide.caption}</span>
        </div>
      );
    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <p>{slide.quote}</p>
          <footer>
            — {slide.author}
            {slide.role && <span>, {slide.role}</span>}
          </footer>
        </blockquote>
      );
    case 'timeline':
      return (
        <ol className={styles.timeline} data-n={slide.points.length} style={{ '--n': slide.points.length } as CSSProperties}>
          {slide.points.map((p, i) => (
            <li key={i}>
              <span className={styles.when}>{p.when}</span>
              <span className={styles.dot} aria-hidden />
              <span className={styles.event}>{p.label}</span>
            </li>
          ))}
        </ol>
      );
  }
}

function Cell({ cell }: { cell: TableCell }) {
  switch (cell.t) {
    case 'check':
      return cell.v ? (
        <span className={styles.yes} aria-label="yes">
          ✓
        </span>
      ) : (
        <span className={styles.no} aria-label="no">
          ✗
        </span>
      );
    case 'stars':
      return (
        <span className={styles.stars} aria-label={`${cell.v} out of 5 stars`}>
          <span>{'★'.repeat(cell.v)}</span>
          <span className={styles.starsOff}>{'★'.repeat(5 - cell.v)}</span>
        </span>
      );
    default:
      return <>{cell.v}</>;
  }
}
