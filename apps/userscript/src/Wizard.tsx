import type { StatusOutput } from '@kp/core';
import type { ComponentChildren } from 'preact';
import type { CharacterScan, TrackChoice } from './controller';
import { lokalizatorSeconds, type GameSnapshot } from './game';

const RACE = ['Goku', 'Vegeta', 'Gohan', 'Trunks', 'Broly', 'Black', 'Bardock', 'Cumber'];
const REBORN = ['N', 'R', 'G', 'U', 'S', 'H', 'M'];

export interface WizardProps {
  game?: GameSnapshot;
  tracked: boolean;
  pendingNew: boolean;
  scan?: CharacterScan;
  result?: StatusOutput;
  collapsed: boolean;
  onToggle(): void;
  onTrack(choice: TrackChoice): void;
}

function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

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

/** Kreator skanu: postać → lokalizator → Teleportacje → Dziennik zadań → podsumowanie. */
export function Wizard(props: WizardProps) {
  const c = props.game?.character;
  const lok = lokalizatorSeconds(props.game);
  const tp = props.scan?.teleports;
  const log = props.scan?.questLog;
  const statuses = Object.values(props.result?.statuses ?? {});
  const count = (s: string) => statuses.filter((r) => r.status === s).length;
  const outside = props.result?.unmatched.length ?? 0;
  const ready = !!c && !!tp && !!log;

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

  if (props.collapsed) {
    return (
      <button
        type="button"
        class="kp-wizard kp-wizard-line"
        aria-expanded="false"
        onClick={props.onToggle}
      >
        {ready ? '✓' : '○'} Skan:{' '}
        {ready
          ? `zrobione ${count('done')} · w trakcie ${count('active')} · do wzięcia ${count('available')}`
          : 'otwórz Teleportacje i Dziennik zadań'}
        <span class="kp-muted"> ▾</span>
      </button>
    );
  }

  return (
    <section class="kp-wizard">
      <div class="kp-wizard-head">
        <strong>Skan gry</strong>
        <button type="button" class="kp-link" onClick={props.onToggle}>
          zwiń
        </button>
      </div>
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
          title={lok > 0 ? `Lokalizator: jeszcze ${duration(lok)}` : 'Lokalizator nieaktywny'}
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
