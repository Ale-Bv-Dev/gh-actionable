# ROADMAP — gh-actionable v2 (precision-first)

> Documento operativo per Claude Code (Opus 4.8).
> Metodologia: NMO — single-task, inspect-before-modify, micro-step con verifica continua, auditabilità, rollback.
> Regole globali per l'agente:
> - Eseguire UNA fase per sessione. Non anticipare fasi successive.
> - Prima di ogni modifica: leggere i file coinvolti (mai modificare a memoria).
> - Ogni micro-step termina con: `npm run build && npm run typecheck && npm test` verdi + 1 commit (Conventional Commits, in inglese).
> - Ai punti marcati **[GATE UMANO]**: fermarsi, riassumere, attendere approvazione esplicita di Alessandro.
> - Nessun push senza gate umano. Nessuna modifica a `docs/adr/` esistenti: gli ADR si aggiungono, non si riscrivono.
> - Non introdurre scope fuori roadmap (no discovery mode, no auto-comment, no auto-PR).

---

## FASE 0 — Ripresa e baseline (sola lettura)

Obiettivo: fotografare lo stato reale prima di toccare qualsiasi cosa.

- [ ] 0.1 `git pull`, `npm install --ignore-scripts`
- [ ] 0.2 Eseguire `npm run build && npm run typecheck && npm test` — atteso: tutto verde (baseline: 183 test)
- [ ] 0.3 Leggere `docs/specs/mvp-v1.md`, `docs/adr/`, `docs/project-log.md` e riassumere: architettura, filtri v1 attivi, non-goal dichiarati
- [ ] 0.4 Produrre `docs/status-2026-07.md`: stato, ultimo commit, motivo della pausa (falsi positivi), obiettivo v2
- [ ] 0.5 Commit: `docs: add project status snapshot before v2 work`

**Criterio di uscita:** report di stato approvato. **[GATE UMANO]**

---

## FASE 1 — Eval set: misurare prima di correggere

Obiettivo: dataset etichettato di issue promosse dal tool, con verdetto umano TP/FP e causa. Nessuna modifica ai filtri in questa fase.

- [ ] 1.1 Definire la tassonomia dei falsi positivi in `docs/specs/eval-v2.md`:
      `stale-label` · `informal-claim` (claim via commento senza assignment) · `unlinked-pr` (PR che cita #N senza link formale) · `ghost-maintainer` (attività recente ma solo "is this still open?") · `too-complex` · `other`
- [ ] 1.2 Creare `scripts/eval-collect.ts`: esegue scan su 4–6 repo/org campione (scelti da Alessandro al gate), salva le issue promosse in `eval/candidates.json` (id, repo, url, why-selected, segnali)
- [ ] 1.3 Creare `scripts/eval-label.ts`: workflow interattivo — mostra un candidato alla volta, Alessandro assegna `TP` o `FP` + categoria; output `eval/labeled.json`
- [ ] 1.4 Creare `scripts/eval-report.ts`: calcola precision baseline e distribuzione FP per categoria
- [ ] 1.5 Test per i tre script; commit per micro-step (`feat(eval): ...`)

**[GATE UMANO]** — Alessandro etichetta 30–50 candidati (lavoro manuale suo, non dell'agente).

- [ ] 1.6 Committare `eval/labeled.json` + report: `docs(eval): add labeled v1 baseline (precision NN%)`

**Criterio di uscita:** precision baseline misurata e distribuzione FP nota. Le categorie più frequenti decidono l'ordine della Fase 2.

---

## FASE 2 — Filtri v2 guidati dai dati

Obiettivo: alzare la precision sull'eval set. UN filtro per micro-step; dopo ogni filtro rieseguire `eval-report` e registrare il delta in `docs/project-log.md`.

Ordine di default (riordinare in base ai dati della Fase 1):

- [ ] 2.1 **Claim detection nei commenti** — pattern multilingua ("I'll take this", "can I work on", "posso occuparmene", …) negli ultimi N commenti → esclusione o warning forte
- [ ] 2.2 **PR cross-reference** — GitHub Search: `repo:{owner/name} type:pr in:body "#{N}"` (+ timeline cross-referenced events) → esclusione se PR aperta/mergiata cita l'issue
- [ ] 2.3 **Label freshness** — età dell'evento `labeled` per `good first issue`/`help wanted`; label più vecchia di X mesi senza attività maintainer → warning/esclusione
- [ ] 2.4 **Maintainer responsiveness** — ultimo intervento di un maintainer vs ultima domanda della community; silenzio prolungato → `ghost-maintainer`
- [ ] 2.5 **[GATE UMANO]** Nuovo ADR: rivalutare il non-goal "weighted scoring" alla luce dei dati. Decisione di Alessandro; l'agente prepara solo l'ADR con opzioni e trade-off
- [ ] 2.6 (Solo se ADR approvato) Scoring pesato con soglia configurabile

**Criterio di uscita:** precision sull'eval set ≥ 70% (target rivedibile al gate), tutti i test verdi, delta documentati. **[GATE UMANO]**

---

## FASE 3 — Igiene repo e pubblicazione

Obiettivo: repo presentabile a un reviewer + metriche npm attivabili.

- [ ] 3.1 CI: `.github/workflows/ci.yml` (Node 20 e 22 · install · build · typecheck · test) — `ci: add GitHub Actions workflow`
- [ ] 3.2 README: aggiornare Status a v2, riscrivere la sezione Caution ("early-stage, not production-ready" — rimuovere "cautious portfolio development"), aggiungere badge CI, sezione risultati eval (precision v1 → v2)
- [ ] 3.3 `package.json`: rimuovere `"private": true`; aggiungere `repository`, `keywords`, `files`, `homepage`; verificare disponibilità del nome su npm — **[GATE UMANO]** se serve scoped package `@ale-bv-dev/gh-actionable`
- [ ] 3.4 `CHANGELOG.md` + tag `v0.2.0` + GitHub Release con note
- [ ] 3.5 **[GATE UMANO]** `npm publish` (login e conferma sono azioni di Alessandro)
- [ ] 3.6 Aggiornare README con istruzioni `npm install -g` post-pubblicazione

**Criterio di uscita:** CI verde su main, release v0.2.0 pubblicata su GitHub e npm.

---

## FASE 4 — Candidatura Claude for OSS (azione umana)

L'agente NON invia nulla: prepara solo i testi finali.

- [ ] 4.1 Aggiornare i testi della candidatura (già abbozzati in chat con Claude) con la storia v2 reale: v1 costruita → falsi positivi misurati → v2 eval-driven → precision migliorata da NN% a MM%
- [ ] 4.2 Verifica finale coerenza: ogni affermazione nel form deve essere verificabile su GitHub/npm
- [ ] 4.3 **[GATE UMANO]** Alessandro compila e invia il form su claude.com/contact-sales/claude-for-oss

---

## Definizione di "fatto" (ogni fase)

1. Build, typecheck e test verdi
2. Commit atomici con messaggi Conventional Commits
3. `docs/project-log.md` aggiornato con cosa/perché/risultato
4. Gate umano superato dove previsto
