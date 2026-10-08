import type { StatusOutput } from '@kp/core';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { CharacterScan, TrackChoice } from './controller';
import { lokalizatorSeconds, type GameSnapshot } from './game';

const RACE = ['Goku', 'Vegeta', 'Gohan', 'Trunks', 'Broly', 'Black', 'Bardock', 'Cumber'];
const REBORN = ['N', 'R', 'G', 'U', 'S', 'H', 'M'];

export interface WizardProps {
  game?: GameSnapshot;
  tracked: boolean;
  pendingNew: boolean;
  /** Postać z gry została usunięta z przewodnika. */
  removed: boolean;
  onRestore(): void;
  scan?: CharacterScan;
  result?: StatusOutput;
  /** Czas ostatniego pełnego skanu tej postaci (teleportacje bez filtra + dziennik). */
  lastFullScan?: number | null;
  /** Zwinięcie kreatora dla postaci jeszcze bez pełnego skanu (zapamiętywane). */
  collapsed: boolean;
  onToggle(): void;
  onTrack(choice: TrackChoice): void;
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const dateTime = (ms: number) =>
  new Date(ms).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function Step({
  state,
  title,
  children,
}: {
  state: 'ok' | 'todo' | 'warn';
  title: string;
  children?: ComponentChildren;
}) {
  const mark = state === 'ok' ? '✓' : state === 'warn' ? '!' : '○';
  return (
    <li class={`kp-wiz-step kp-wiz-${state}`}>
      <span class="kp-wiz-mark" aria-hidden="true">
        {mark}
      </span>
      <div>
        <strong>{title}</strong>
        {children && <div class="kp-muted">{children}</div>}
      </div>
    </li>
  );
}

/**
 * Kreator skanu: postać → lokalizator → Teleportacje → Dziennik zadań → podsumowanie.
 * Po pierwszym pełnym skanie postaci kreator to jedna linia – skan i tak idzie w tle,
 * gdy gracz otworzy Teleportacje albo Dziennik zadań.
 */
export function Wizard(props: WizardProps) {
  const [expanded, setExpanded] = useState(false);
  const c = props.game?.character;
  const lok = lokalizatorSeconds(props.game);
  const tp = props.scan?.teleports;
  const log = props.scan?.questLog;
  const statuses = Object.values(props.result?.statuses ?? {});
  const count = (s: string) => statuses.filter((r) => r.status === s).length;
  const outside = props.result?.unmatched.length ?? 0;
  const ready = !!c && !!tp && !!log;
  const known = !!props.lastFullScan;
  const collapsed = known ? !expanded : props.collapsed;
  const toggle = known ? () => setExpanded(!expanded) : props.onToggle;
  const filterWarning = tp?.partial && (
    <p class="kp-wizard-warn">
      Lista teleportacji jest przefiltrowana – wyczyść „Szukaj” i ustaw Reborn na „wszystkie”.
    </p>
  );

  if (props.pendingNew && c) {
    return (
      <section class="kp-wizard kp-wizard-ask">
        <p>
          Nowa postać: <strong>{c.name}</strong> ({RACE[c.race]}, {REBORN[c.reborn]}). Śledzić jej
          postęp?
        </p>
        <div class="kp-actions">
          <button
            type="button"
            class="kp-btn kp-btn-small kp-btn-on"
            onClick={() => props.onTrack('yes')}
          >
            Tak
          </button>
          <button
            type="button"
            class="kp-btn kp-btn-small kp-btn-ghost"
            onClick={() => props.onTrack('no')}
          >
            Nie
          </button>
          <button
            type="button"
            class="kp-btn kp-btn-small kp-btn-ghost"
            onClick={() => props.onTrack('always')}
          >
            Zawsze śledź nowe
          </button>
        </div>
      </section>
    );
  }

  if (props.removed && c) {
    return (
      <section class="kp-wizard">
        <p>
          <strong>{c.name}</strong> jest usunięta z przewodnika – jej postęp nie jest zapisywany.
        </p>
        <div class="kp-actions">
          <button type="button" class="kp-btn kp-btn-small" onClick={props.onRestore}>
            Śledź znowu
          </button>
        </div>
      </section>
    );
  }

  if (collapsed) {
    const summary = `zrobione ${count('done')} · w trakcie ${count('active')} · do wzięcia ${count('available')}`;
    return (
      <>
        <button
          type="button"
          class="kp-wizard kp-wizard-line"
          aria-expanded="false"
          onClick={toggle}
        >
          {known ? (
            <>
              ✓ {props.result ? summary : `Ostatni pełny skan: ${dateTime(props.lastFullScan!)}`}
              {c && lok <= 0 && <span class="kp-muted"> · bez lokalizatora</span>}
            </>
          ) : (
            <>
              {ready ? '✓' : '○'} Skan: {ready ? summary : 'otwórz Teleportacje i Dziennik zadań'}
            </>
          )}
          <span class="kp-muted"> ▾</span>
        </button>
        {filterWarning}
      </>
    );
  }

  return (
    <section class="kp-wizard">
      <div class="kp-wizard-head">
        <strong>Skan gry</strong>
        <button type="button" class="kp-link" onClick={toggle}>
          zwiń
        </button>
      </div>
      {known && (
        <p class="kp-muted">
          Ostatni pełny skan: {dateTime(props.lastFullScan!)}. Skan odświeża się sam, gdy otworzysz
          Teleportacje albo Dziennik zadań.
        </p>
      )}
      <ol class="kp-wiz-steps">
        <Step
          state={c ? 'ok' : 'todo'}
          title={c ? `${c.name} · ${RACE[c.race]} ${REBORN[c.reborn]}` : 'Wybierz postać w grze'}
        >
          {c &&
            !props.tracked &&
            'Nie śledzisz tej postaci – postęp nie jest zapisywany (zmienisz w „Postacie”).'}
        </Step>
        <Step
          state={lok > 0 ? 'ok' : 'warn'}
          title={lok > 0 ? 'Lokalizator aktywny' : 'Lokalizator nieaktywny'}
        >
          {lok <= 0 &&
            'Bez niego nie rozpoznam zrobionych zadań z listy teleportacji. Dziennik i mapa lokacji działają nadal.'}
        </Step>
        <Step
          state={tp ? (tp.partial ? 'warn' : 'ok') : 'todo'}
          title={
            tp
              ? `Teleportacje: ${tp.entries.length} lokacji (${time(tp.at)})`
              : 'Otwórz Teleportacje w grze'
          }
        >
          {tp?.partial
            ? 'Lista jest przefiltrowana – wyczyść „Szukaj” i ustaw Reborn na „wszystkie”, żeby zobaczyć całość.'
            : !tp && 'Wystarczy otworzyć okno – przewodnik sam odczyta listę.'}
        </Step>
        <Step
          state={log ? 'ok' : 'todo'}
          title={
            log
              ? `Dziennik zadań: ${log.entries.length} zadań (${time(log.at)})`
              : 'Otwórz Dziennik zadań w grze'
          }
        />
        {props.result && (
          <Step state={ready ? 'ok' : 'todo'} title="Podsumowanie">
            Zrobione {count('done')} · w trakcie {count('active')} · do wzięcia {count('available')}
            {outside > 0 && ` · spoza solucji ${outside} (lista w „Postęp”)`}
          </Step>
        )}
      </ol>
    </section>
  );
}
