

## Plan: "No Prefect Left Without a Duty" Rule

### What Changes

Add a **Phase 5** to the `autoAssign` function in `src/store/prefectStore.ts` that runs after all existing phases (Heads, Co-Heads, Special Duties, Classrooms).

### Logic

1. **Find unassigned prefects** — any prefect with `getDutyCount === 0` who is not a Head Prefect (Head Prefects are excluded from duties).

2. **Get all classroom duty places** — sorted by grade (11 → 4), same list used in Phase 4.

3. **Round-robin distribute** unassigned prefects across classrooms:
   - Increase `maxPrefects` on each classroom as needed (since the current cap is 1, the system would block extra assignments).
   - Iterate classrooms in order, assigning one prefect per classroom per round until no unassigned prefects remain.
   - Each round: loop through all classrooms, assign the next unassigned prefect (respecting same-age exclusion: prefect grade must be > class grade, except Grade 11 can cover Grade 10/11).
   - Never assign the same prefect twice.

4. **Update the report** with a count of how many prefects were placed in this overflow phase.

### Key Detail: maxPrefects Override

Currently classrooms have `maxPrefects = 1`, which would block `assignPrefect()`. The Phase 5 logic will temporarily increase each classroom's `maxPrefects` to accommodate the round-robin overflow, or bypass the cap check by directly creating assignments (same pattern as existing `assignPrefect` but without the max check for this specific phase).

### Files Modified

- **`src/store/prefectStore.ts`** — Add Phase 5 block (~30-40 lines) after the Phase 4 classroom loop (after line 611, before `return report`).

### No Other Changes

No UI, DB schema, or type changes needed. The validation panel will naturally show any grade mismatches from overflow assignments.

