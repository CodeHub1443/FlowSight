# Software Project Operating Rules

**A reusable rulebook for software development with an AI coding
assistant**

-   **Version:** 1.1
-   **Purpose:** Establish consistent rules for project discovery,
    planning, implementation, parallel work, verification, and
    integration across software projects.

------------------------------------------------------------------------

## 1. Governing principles

1.  **Understand before changing.** Inspect the repository, existing
    instructions, current state, requirements, and relevant contracts
    before proposing or making changes.
2.  **Plan before complex implementation.** Use Plan mode for
    architecture work, consequential decisions, and multi-file changes
    when supported.
3.  **Approval before consequential action.** Do not implement, edit
    files, run state-changing commands, alter data, commit, push,
    deploy, or affect external systems until the user has explicitly
    approved the action and its scope. Read-only inspection is allowed
    when requested or clearly necessary and safe.
4.  **One task per session.** Give each session one bounded task and one
    clear deliverable.
5.  **Parallelize independent work; serialize conflicting work.** More
    sessions do not automatically mean faster or better delivery.
6.  **Preserve existing work.** Never discard, reset, stash, overwrite,
    or repurpose uncommitted changes without explicit authorization.
7.  **Evidence over claims.** Report actual files inspected or changed,
    commands run, test results, limitations, and remaining risks.
8.  **Review before integration.** Work is not accepted merely because a
    session says it is complete.
9.  **Do not invent certainty.** Distinguish observed facts, inferences,
    assumptions, proposals, and unresolved questions.
10. **Resolve ambiguity explicitly.** When authoritative requirements
    conflict or a prerequisite is missing, report the issue and ask for
    a decision rather than silently inventing a resolution.

## 2. Instruction header

Every task instruction should begin with these fields, in this order:

``` text
Model: [model name]
Mode: [mode supported by the environment]
Effort: [effort level supported by the environment]
```

Use the model-selection policy in Section 7 as the default. If a model,
mode, or effort setting is unavailable, do not claim to have selected
it. State the limitation and use an alternative only when authorized or
clearly agreed.

After the header, state: - objective and expected deliverable; -
authoritative context and baseline; - scope and exclusions; - permitted
and prohibited actions; - acceptance criteria; - required evidence and
final-report format.

## 3. Starting a new project

Do not jump directly into implementation. Begin with discovery and
planning.

### Stage 1 --- Establish the source of truth

1.  Identify the repository root and relevant project instructions, such
    as `AGENTS.md`, `CLAUDE.md`, README files, contribution guides, and
    existing architecture documents.
2.  Inspect the current Git branch, commit, and working-tree status
    before operations that could change repository state.
3.  Identify uncommitted changes and treat them as protected work.
4.  Locate the current specification, architecture decisions, API
    contracts, data model, build/test commands, and deployment
    boundaries.
5.  Identify language/runtime versions, frameworks, dependencies,
    environment configuration, and test setup where relevant.
6.  Separate confirmed facts from assumptions and missing information.

Do not assume that a document is authoritative merely because it exists.
Ask which source takes precedence when authority is unclear.

### Stage 2 --- Produce a project baseline brief

Summarize: - purpose, users, and primary workflows; - current
implementation and repository structure; - architecture and component
boundaries; - data stores and external integrations; - build, test, and
run procedures; - security, privacy, and operational constraints; -
known defects, incomplete work, and dependencies; - uncommitted changes
and protected areas; - decisions needed before implementation.

Support repository-derived findings with file paths, symbols, or
document sections. Avoid broad claims without evidence.

### Stage 3 --- Propose a plan

Include: - objectives and non-goals; - ordered tasks and dependencies; -
tasks that can safely run in parallel; - proposed session/worktree
ownership where relevant; - model, mode, and effort for each task; -
acceptance criteria and verification plan; - risks, unknowns, and
decisions requiring approval.

For architecture, security, reliability, schema, API-contract, release,
or multi-file decisions, use Plan mode when available and seek explicit
approval before implementation.

### Stage 4 --- Wait for approval

Present the baseline brief, plan, and consequential choices. Do not
execute or implement the proposed plan until the user explicitly
approves it. If approval covers only part of the plan, proceed only with
that approved part.

## 4. Work modes and permissions

State the mode explicitly for every task.

### `READ-ONLY`

Allowed: - inspect files, history, configuration, logs, and
documentation; - search the repository; - report evidence-based
findings.

Not allowed unless separately approved: - edit or generate repository
files; - run tests or commands that modify state; - install
dependencies; - change branches, commits, or repository state; - modify
databases, external systems, or deployment state.

### `DESIGN-ONLY`

Allowed: - analyze approved sources; - propose architecture, interfaces,
data flow, alternatives, trade-offs, risks, and acceptance criteria; -
create a design artifact only when writing it and its destination are
authorized.

Not allowed: - implement the proposal; - modify shared source files or
contracts; - treat proposed interfaces as approved contracts; - resolve
conflicts silently.

### `IMPLEMENTATION`

Allowed only after explicit approval of the task and scope: - edit
assigned files in the assigned working directory or worktree; - run
authorized tests and relevant verification commands; - make changes
required by the approved design.

Still prohibited unless separately approved: - materially expand
scope; - change architecture or public contracts without approval; -
perform destructive operations; - commit, push, deploy, migrate
production data, or change external systems; - edit files owned by
another session.

### `REVIEW`

Review the specified change or artifact against the stated baseline and
requirements. Report findings, severity, evidence, and recommended
fixes. Do not fix findings unless implementation is explicitly
authorized.

## 5. Parallel sessions and Git worktrees

### 5.1 Start with limited concurrency

Use two or three sessions only when tasks are genuinely independent. A
useful pattern is: - **Main session:** the active approved task. -
**Review session:** an independent, read-only audit against a stable
baseline. - **Design session:** a separate proposal that does not
implement or modify shared source files.

Add concurrency only when the work can be reviewed properly. If review
or integration becomes the bottleneck, reduce concurrency.

### 5.2 Worktree isolation

-   Every parallel session that may edit code must use its own Git
    worktree and branch.
-   Never run two editing sessions in the same working directory.
-   Inspect Git status before creating worktrees or running Git
    operations.
-   Do not reset, stash, clean, switch branches in, or otherwise
    repurpose a working directory containing uncommitted work.
-   Use a named baseline commit or frozen snapshot for each task.
-   Keep each session inside its assigned worktree and file ownership.
-   A worktree provides isolation; it does not itself authorize changes.

### 5.3 Decide what can run in parallel

Usually safe: - read-only audits on a stable snapshot; - independent
design proposals; - implementations with non-overlapping file ownership
and approved interfaces; - isolated documentation tasks.

Usually sequential: - tasks editing the same files; - schema/API design
and dependent implementation; - tasks dependent on another unfinished
change; - root-cause investigation and a fix before the cause is
established; - migrations and code that depends on an unapproved
migration.

If a task depends on another task, wait for the prerequisite or
explicitly label work as provisional against a named frozen snapshot.

### 5.4 Give each session its own context

Do not assume sessions share context, decisions, or memory. Give every
session: - relevant source paths and approved documents; - baseline
commit/snapshot; - scope, exclusions, and file ownership; - mode and
permitted actions; - required output and acceptance criteria; - current
decisions, constraints, and unresolved questions.

### 5.5 Review and integrate

Before integration: 1. Inspect the full diff and changed-file list. 2.
Check for unrelated edits, generated artifacts, secrets, and formatting
churn. 3. Check conformance to approved architecture and contracts. 4.
Review test commands and actual outcomes; disclose tests not run. 5.
Decide explicitly whether to accept, revise, or reject the change. 6.
Merge or cherry-pick only after review and authorization. 7. Run
relevant integration/regression checks after integration.

Remove a worktree only after its work is integrated or explicitly
abandoned and needed evidence is preserved. Never run cleanup commands
against a protected working directory.

## 6. Model selection and effort

The following is a default policy based on the supplied model-selection
table. Exact model names and settings may differ by product version or
environment. Confirm availability before use.

  --------------------------------------------------------------------------
  Task              Default model                   Effort Guidance
  ----------------- ---------------- --------------------- -----------------
  Project           Opus 5.5                          High Define
  specification                                            requirements,
                                                           goals, and
                                                           non-goals

  System            Opus 5.5                          High Design services,
  architecture                                             components, and
                                                           structure

  Architecture      Opus 5.5                          High Evaluate
  decisions                                                alternatives and
                                                           trade-offs

  API contract /    Opus 5.5                          High Define
  OpenAPI                                                  authentication,
                                                           versioning,
                                                           errors,
                                                           pagination

  Database schema   Opus 5.5                          High Design tables,
  design                                                   relationships,
                                                           indexes,
                                                           migrations

  Event-bus design  Opus 5.5                          High Define schemas,
                                                           ordering,
                                                           retries,
                                                           idempotency,
                                                           dead-letter
                                                           queues

  Performance       Opus 5.5                          High Analyze profiler
  analysis                                                 evidence and
                                                           bottlenecks

  Security audit    Opus 5.5                          High Review
                                                           authorization,
                                                           injection,
                                                           secrets, SSRF

  Reliability       Opus 5.5                          High Analyze failure
  engineering                                              modes, timeouts,
                                                           retries,
                                                           fallbacks, health
                                                           checks

  Difficult bug /   Opus 5.5                          High Investigate
  root-cause                                               evidence and rank
  analysis                                                 likely causes

  Code review       Opus 5.5                          High Review
                                                           correctness,
                                                           design, and
                                                           security

  Multi-file        Opus 5.5                          High Plan first;
  changes (\>3                                             implement only
  files)                                                   after approval

  Frontend          Sonnet 5                        Medium Implement UI
  development                                              against approved
                                                           design

  Backend           Sonnet 5                        Medium Implement APIs,
  development                                              services, and
                                                           business logic

  API               Sonnet 5                        Medium Follow an
  implementation                                           approved contract

  Database queries  Sonnet 5                        Medium Implement queries
  / repositories                                           and repositories

  Event producers / Sonnet 5                        Medium Implement
  consumers                                                approved event
                                                           contracts

  Performance       Sonnet 5                        Medium Implement fixes
  optimization                                             for identified
                                                           bottlenecks

  Security fixes    Sonnet 5                        Medium Implement
                                                           approved audit
                                                           fixes

  Unit /            Sonnet 5                        Medium Cover edge cases,
  integration                                              failures, and
  testing                                                  regressions

  End-to-end /      Sonnet 5                        Medium Create
  load-test scripts                                        Playwright, k6,
                                                           or equivalent
                                                           scripts

  Simple bug fixes  Sonnet 5                        Medium Fix bounded,
                                                           understood
                                                           defects

  Project           Sonnet 5                           Low Set up structure,
  scaffolding / CI                                         linting, CI, and
  setup                                                    test harness

  Test boilerplate  Haiku 4.5                          Low Generate basic
                                                           test scaffolding

  Repository        Haiku 4.5 /                        Low Map codebase and
  exploration       Sonnet 5                               generate
                                                           documentation

  Repository-wide   Haiku 4.5 /             Task-dependent Search large
  research          Sonnet 5 +                             codebases,
                    subagent                               inspect logs,
                                                           gather evidence

  Documentation     Haiku 4.5                          Low Write README
                                                           files, comments,
                                                           and simple
                                                           documentation

  Rename /          Haiku 4.5                          Low Handle small,
  formatting /                                             straightforward
  config edits                                             changes

  Commit messages   Haiku 4.5                          Low Draft concise
                                                           messages
  --------------------------------------------------------------------------

### Escalation

If Sonnet fails to solve the same problem twice, stop repeating the same
approach and escalate investigation to Opus / High where available.
Provide the exact problem, expected behavior, code paths, logs, prior
attempts, constraints, hypotheses, and reproduction steps.

### Context management

-   Use `/clear` for a genuinely new task after preserving essential
    decisions and constraints in the task brief.
-   Use `/compact` when context is around half full or has accumulated
    substantial irrelevant history.
-   Do not remove the only record of a critical decision, baseline, or
    uncommitted change; summarize it first.

## 7. Required task brief

Every task should use this template, beginning with **Model**, **Mode**,
and **Effort**.

``` text
Model: [model]
Mode: [Plan / READ-ONLY / DESIGN-ONLY / IMPLEMENTATION / REVIEW, as supported]
Effort: [effort]

Task name:
[Short, specific name]

Objective:
[One main outcome]

Expected deliverable:
[Report, proposal, code change, tests, etc.]

Authoritative context:
[Repository root, baseline commit/snapshot, source documents, contracts, paths]

Scope and ownership:
[What this session may inspect/change; owned files/components]

Out of scope:
[Explicit exclusions]

Permissions:
[Exact actions allowed]

Prohibited actions:
[Actions not authorized, such as edits, tests, commits, pushes, deployments, migrations, external calls]

Acceptance criteria:
[Observable conditions for completion]

Verification:
[Required checks and evidence; identify checks that are not authorized]

Dependencies and assumptions:
[Prerequisites, known decisions, assumptions to validate]

Stop conditions:
[Conflicting contracts, changed baseline, overlapping ownership, missing prerequisites, risky operations]

Required final report:
1. Summary
2. Files/sections inspected or changed
3. Findings/decisions with evidence
4. Commands and tests run, with exact results
5. Checks not run and why
6. Risks, assumptions, and unresolved questions
7. Recommended next step
```

## 8. Review checklist

### Scope and state

-   [ ] Was the baseline commit/snapshot identified?
-   [ ] Did the task stay within its approved scope and assigned
    worktree?
-   [ ] Were uncommitted changes preserved?
-   [ ] Were state-changing actions authorized?

### Architecture and contracts

-   [ ] Does the result respect approved boundaries, interfaces, and
    contracts?
-   [ ] Are assumptions and deviations explicit?
-   [ ] Were conflicts reported rather than silently resolved?
-   [ ] Is compatibility addressed where required?

### Diff and code quality

-   [ ] Is every changed file necessary?
-   [ ] Are unrelated changes and formatting churn absent?
-   [ ] Are secrets and sensitive data absent from diffs and logs?
-   [ ] Are relevant error paths, edge cases, and resource limits
    handled?

### Verification

-   [ ] Are exact test commands and outcomes recorded?
-   [ ] Are failed, skipped, or unrun checks disclosed?
-   [ ] Does evidence correspond to the final diff?
-   [ ] Are relevant regression/integration checks identified?

### Integration

-   [ ] Has the full diff been reviewed?
-   [ ] Is the decision recorded as accepted, revise, or reject?
-   [ ] Is integration explicitly authorized?
-   [ ] Are post-integration checks planned or complete?

## 9. Stop conditions and escalation

Stop and report instead of improvising when: - the source of truth or
baseline is ambiguous; - requirements or contracts conflict; - the task
requires actions outside its permission boundary; - another session owns
the same files; - the baseline changes while work is underway; - an
operation risks deleting or overwriting user work; - a change affects
security, data integrity, public contracts, deployment, or production
state beyond approved scope; - required credentials, environment
details, or prerequisites are missing.

The report must state the issue, evidence, impact, decision needed, and
safest next step. Do not invent missing contracts, silently widen scope,
or turn an audit/design task into implementation.

## 10. Data, migration, release, and external-system safeguards

These actions require explicit, specific approval even when
implementation has been approved: - production database access or
mutation; - schema migrations and migration runners; - data deletion,
backfills, or irreversible transformations; - production deployments,
releases, rollbacks, or infrastructure changes; - commits, pushes, pull
requests, or branch operations affecting shared work; - external API
actions that create, update, delete, charge, notify, or otherwise affect
real users or systems; - dependency installations or runtime/tooling
changes that materially affect the environment.

Before a migration or release, inspect and report relevant history,
schema, backup/restore strategy, execution order,
roles/ownership/privileges, access policies (including row-level
security where applicable), locks, failure recovery, and rollback
limits. Verify what the migration runner actually executes; do not
assume it applies only the intended change.

Never print secrets in reports or logs. Do not use production
credentials or connect to production systems without explicit
authorization for the exact operation and target.

## 11. Copy-ready prompts

### Independent architecture audit

``` text
Model: Opus 5.5
Mode: Review
Effort: High

Review the named authoritative documents, approved contracts, and frozen baseline.

Mode: READ-ONLY. Do not edit files, run tests, commit, switch branches, or change repository state.

Identify concrete gaps, contradictions, missing invariants, boundary violations, coupling, and risks. For every finding, provide evidence (file/path and relevant symbol or section), impact, severity, and recommended next step. Separate confirmed findings from assumptions and open questions. Do not implement fixes. If the baseline is unclear or changed, stop and report it.
```

### Independent design proposal

``` text
Model: Opus 5.5
Mode: Plan
Effort: High

Prepare a design proposal for [component/feature] using the authoritative documents, approved contracts, and frozen baseline.

Mode: DESIGN-ONLY. Do not implement code, edit shared source files, run tests, commit, or change repository state.

Cover purpose and non-goals, responsibilities, interfaces/contracts, data flow, dependencies, lifecycle/state, failure handling, security, performance, observability, alternatives/trade-offs, assumptions, unresolved questions, and acceptance criteria. Mark unsupported points as proposals or open questions. Do not silently resolve contract conflicts. Submit the proposal for approval before implementation.
```

### Approved implementation

``` text
Model: Sonnet 5
Mode: [implementation mode supported by the environment]
Effort: Medium

Implement only this approved task: [task].

Baseline: [commit/snapshot]
Authoritative contracts: [paths]
Owned scope/files: [paths/components]
Out of scope: [explicit exclusions]
Acceptance criteria: [observable outcomes]
Tests authorized/required: [commands or categories]

Work only in the assigned worktree. Do not change approved architecture/contracts, expand scope, commit, push, deploy, migrate data, or modify external systems unless explicitly authorized. If scope overlap, baseline drift, missing prerequisites, or conflicting requirements are discovered, stop and report.

Before finishing, summarize changed files, important decisions, exact tests and results, checks not run, remaining risks, and required follow-up.
```

### Code review

``` text
Model: Opus 5.5
Mode: Review
Effort: High

Review the specified diff against the approved requirements, architecture, and baseline. Do not edit or fix code.

Prioritize correctness, security, data integrity, API/contract compatibility, concurrency, error handling, performance, maintainability, and regression risk. Report actionable findings with severity and evidence. Distinguish confirmed defects from possible concerns. If no findings are identified, state the limits of the review and checks not performed.
```

## 12. Definition of done

A task is complete only when: - the approved objective and acceptance
criteria are met; - scope and working-directory boundaries were
respected; - changed files and decisions are documented; - verification
evidence is provided and unrun checks are disclosed; - unresolved risks
and assumptions are explicit; - required review and approval have
occurred; - integration, commit, deployment, or external actions
happened only when separately authorized.

**Final rule:** Optimize for correct, reviewable progress while
preserving the user's control over the codebase.
