# Classroom Focus Seating

A teacher-friendly, local-first seating plan generator that prioritizes students with higher needs first, enforces hard constraints, and optimizes soft preferences.

## What This App Does

- Builds classroom layouts (`rows x columns`) with blocked and accessibility seats.
- Lets you define per-student hard constraints:
  - cannot sit next to specific students
  - cannot sit near specific students (radius-based)
  - must be in a zone (`Front`, `Middle`, `Back`)
  - must be in a row range
  - needs accessibility seat
  - lock to a specific seat
- Lets you define soft constraints:
  - works well with specific students
  - prefer near teacher
  - prefer group clustering
- Generates plans with:
  - MRV backtracking + forward-checking
  - greedy + local-repair fallback if time/iteration limit is reached
- Supports manual drag/drop swaps and seat locking.
- Persists roster, layout, settings, and latest plan in `localStorage`.

## Privacy

This app is fully offline and local:

- No network calls
- No analytics
- No external libraries
- All data is saved only in your browser `localStorage`

UI reminder is included at the top: "All data stays on this device; nothing is uploaded."

## Run Locally (VS Code + Live Server)

1. Open this folder in VS Code.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html` and choose **Open with Live Server**.
4. Use the app in your browser.

## How To Use

1. Set layout and settings in the right panel.
2. Add/edit students in the left panel.
3. Enter constraints:
   - Multi-name fields use `|` separator, for example: `Alex|Sam|Jordan`
4. Click **Generate Plan**.
5. Use drag/drop to tweak placements.
6. Click the pin icon on a seated student to lock them.
7. Click **Regenerate** to solve again while keeping locks.
8. Click **Save** to persist now (auto-persistence also runs on changes).
9. Use **Print** for printable grid output.

## CSV Import/Export

Expected CSV header:

```csv
name,priorityLevel,cannotSitNextTo,cannotSitNear,worksWellWith,mustBeInZone,mustBeInRowRange,needsAccessibilitySeat,preferNearTeacher,preferGroup,lockToSeat
```

- Use `|` to separate multiple names in list fields.
- Empty cell means no constraint.
- Boolean fields accept `true/false`, `1/0`, `yes/no`.
- Row range uses `min-max` (example: `2-4`).

A starter file is provided: `sample-students.csv`.

## Hard vs Soft Constraints

- Hard constraints are never intentionally violated by the solver.
- Soft constraints contribute to score and are optimized when possible.
- If a full valid placement cannot be found, diagnostics explain likely blockers and unplaced students.

## Solver Notes

- Priority order places students with lock/accessibility/strict location/conflict density first.
- Uses MRV (minimum remaining values) and degree heuristics.
- Uses forward-checking to avoid branches that make future placements impossible.
- Falls back to greedy placement + local repair swaps if backtracking reaches iteration limit.
- Determinism/variety is controlled by **Random Seed**.

## Tips If Solver Cannot Find A Plan

- Reduce blocked seats.
- Add more accessibility seats when needed.
- Widen Front/Middle/Back zone boundaries.
- Reduce near radius in tight rooms.
- Review mutual `cannotSitNear` chains in small layouts.
- Use lock seats sparingly if conflicts are high.

## Known Limitations

- Name matching is case-insensitive but duplicate names can still be ambiguous.
- Unknown names in constraints are shown in diagnostics with manual mapping options.
- Very dense conflict graphs can still produce partial results under strict node limits.

## Reporting Issues

When sharing an issue, include:

- layout (`rows`, `cols`, near radius)
- random seed and max nodes
- a CSV sample that reproduces the issue
- diagnostics text shown in the app
