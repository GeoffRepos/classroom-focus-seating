(() => {
  "use strict";

  const STORAGE_KEYS = {
    students: "seating.students",
    layout: "seating.layout",
    plan: "seating.plan",
    settings: "seating.settings"
  };

  const DEFAULT_LAYOUT = {
    rows: 6,
    cols: 6,
    nearRadius: 1,
    teacherAt: "FrontCenter",
    blockedSeatIds: [],
    accessibleSeatIds: ["R1C1", "R1C2"],
    frontEndRow: 2,
    middleEndRow: 4
  };

  const DEFAULT_SETTINGS = {
    randomSeed: 42,
    maxNodes: 5000,
    nameAliases: {}
  };

  const DEFAULT_PLAN = {
    assignment: {},
    score: 0,
    diagnostics: {
      warnings: [],
      violations: [],
      unresolved: [],
      unplaced: [],
      solverNotes: []
    },
    meta: {
      complete: false,
      nodeExpansions: 0,
      method: "none"
    }
  };

  const state = {
    students: [],
    layout: { ...DEFAULT_LAYOUT },
    settings: { ...DEFAULT_SETTINGS },
    plan: deepClone(DEFAULT_PLAN),
    ui: {
      selectedStudentId: null,
      seatEditMode: "none",
      dragStudentId: null,
      statusText: "Ready.",
      pendingAliasSelections: {}
    }
  };

  const dom = {};

  init();

  function init() {
    cacheDom();
    loadState();
    normalizeLayout(state.layout);

    if (state.students.length === 0) {
      state.students = getSeedStudents();
    }

    if (!state.ui.selectedStudentId && state.students[0]) {
      state.ui.selectedStudentId = state.students[0].id;
    }

    bindEvents();
    reconcileReferences();
    renderAll();
  }

  function cacheDom() {
    dom.studentList = document.getElementById("student-list");
    dom.studentForm = document.getElementById("student-form");

    dom.studentName = document.getElementById("student-name");
    dom.studentPriority = document.getElementById("student-priority");
    dom.studentCannotNext = document.getElementById("student-cannot-next");
    dom.studentCannotNear = document.getElementById("student-cannot-near");
    dom.studentWorksWell = document.getElementById("student-works-well");
    dom.studentZone = document.getElementById("student-zone");
    dom.studentRowRange = document.getElementById("student-row-range");
    dom.studentGroup = document.getElementById("student-group");
    dom.studentLockSeat = document.getElementById("student-lock-seat");
    dom.studentAccess = document.getElementById("student-access");
    dom.studentNearTeacher = document.getElementById("student-near-teacher");

    dom.layoutRows = document.getElementById("layout-rows");
    dom.layoutCols = document.getElementById("layout-cols");
    dom.layoutRadius = document.getElementById("layout-radius");
    dom.layoutTeacher = document.getElementById("layout-teacher");
    dom.layoutSeed = document.getElementById("layout-seed");
    dom.layoutMaxNodes = document.getElementById("layout-max-nodes");

    dom.zoneFrontEnd = document.getElementById("zone-front-end");
    dom.zoneMiddleEnd = document.getElementById("zone-middle-end");
    dom.zoneFrontOutput = document.getElementById("zone-front-output");
    dom.zoneMiddleOutput = document.getElementById("zone-middle-output");

    dom.gridStage = document.getElementById("grid-stage");
    dom.gridOrientation = document.getElementById("grid-orientation");
    dom.teacherLabel = document.getElementById("teacher-label");
    dom.seatingGrid = document.getElementById("seating-grid");

    dom.unresolvedMappings = document.getElementById("unresolved-mappings");
    dom.diagnosticsList = document.getElementById("diagnostics-list");

    dom.statusText = document.getElementById("status-text");
    dom.scoreText = document.getElementById("score-text");

    dom.btnGenerate = document.getElementById("btn-generate");
    dom.btnRegenerate = document.getElementById("btn-regenerate");
    dom.btnSave = document.getElementById("btn-save");
    dom.btnPrint = document.getElementById("btn-print");
    dom.btnExport = document.getElementById("btn-export");
    dom.btnImport = document.getElementById("btn-import");
    dom.btnReset = document.getElementById("btn-reset");
    dom.btnAddStudent = document.getElementById("btn-add-student");
    dom.btnRemoveStudent = document.getElementById("btn-remove-student");
    dom.btnApplyMappings = document.getElementById("btn-apply-mappings");

    dom.csvImportInput = document.getElementById("csv-import-input");
  }

  function bindEvents() {
    dom.btnGenerate.addEventListener("click", () => runSolver("generate"));
    dom.btnRegenerate.addEventListener("click", () => runSolver("regenerate"));

    dom.btnSave.addEventListener("click", () => {
      persistState();
      setStatus("Saved to localStorage.");
      renderStatus();
    });

    dom.btnPrint.addEventListener("click", () => window.print());
    dom.btnExport.addEventListener("click", exportCsv);
    dom.btnImport.addEventListener("click", () => dom.csvImportInput.click());

    dom.btnReset.addEventListener("click", () => {
      if (!window.confirm("Reset app data, including roster, layout, and plan?")) return;
      resetAllData();
    });

    dom.btnAddStudent.addEventListener("click", () => {
      const student = createStudent(`Student ${state.students.length + 1}`);
      state.students.push(student);
      state.ui.selectedStudentId = student.id;
      reconcileReferences();
      persistState();
      renderAll();
      setStatus("Added a new student.");
      renderStatus();
    });

    dom.btnRemoveStudent.addEventListener("click", () => {
      const id = state.ui.selectedStudentId;
      if (!id) return;
      const index = state.students.findIndex((s) => s.id === id);
      if (index < 0) return;
      const removed = state.students[index];
      state.students.splice(index, 1);
      removeStudentFromPlan(removed.id);
      state.ui.selectedStudentId = state.students[index]?.id || state.students[index - 1]?.id || null;
      reconcileReferences();
      persistState();
      renderAll();
      setStatus(`Removed ${removed.name || "student"}.`);
      renderStatus();
    });

    dom.studentList.addEventListener("click", (event) => {
      const row = event.target.closest("[data-student-id]");
      if (!row) return;
      state.ui.selectedStudentId = row.dataset.studentId;
      renderStudents();
      renderStudentEditor();
    });

    dom.studentForm.addEventListener("input", () => {
      const selected = getSelectedStudent();
      if (!selected) return;
      applyFormToStudent(selected);
      reconcileReferences();
      persistState();
      renderStudents();
      renderDiagnostics();
    });

    const layoutInputs = [
      dom.layoutRows,
      dom.layoutCols,
      dom.layoutRadius,
      dom.layoutTeacher,
      dom.layoutSeed,
      dom.layoutMaxNodes,
      dom.zoneFrontEnd,
      dom.zoneMiddleEnd
    ];

    layoutInputs.forEach((el) => {
      el.addEventListener("input", () => {
        applyLayoutForm();
        reconcileReferences();
        persistState();
        renderLayout();
        renderGrid();
        renderDiagnostics();
      });
    });

    document.querySelectorAll("input[name='seat-edit-mode']").forEach((radio) => {
      radio.addEventListener("change", (event) => {
        state.ui.seatEditMode = event.target.value;
      });
    });

    dom.seatingGrid.addEventListener("click", onGridClick);
    dom.seatingGrid.addEventListener("dragstart", onGridDragStart);
    dom.seatingGrid.addEventListener("dragover", onGridDragOver);
    dom.seatingGrid.addEventListener("drop", onGridDrop);
    dom.seatingGrid.addEventListener("keydown", onGridKeyDown);

    dom.csvImportInput.addEventListener("change", onCsvImportChange);

    dom.btnApplyMappings.addEventListener("click", () => {
      const selects = dom.unresolvedMappings.querySelectorAll("select[data-unresolved-name]");
      let applied = 0;
      selects.forEach((select) => {
        const unresolved = select.dataset.unresolvedName;
        const mappedId = select.value;
        if (unresolved && mappedId) {
          state.settings.nameAliases[normalizeName(unresolved)] = mappedId;
          applied += 1;
        }
      });

      reconcileReferences();
      persistState();
      renderDiagnostics();
      renderStudents();

      if (applied > 0) {
        setStatus(`Applied ${applied} name mapping(s).`);
      } else {
        setStatus("No mappings selected.");
      }
      renderStatus();
    });
  }

  function runSolver(mode) {
    reconcileReferences();
    const result = solve({
      students: state.students,
      layout: state.layout,
      settings: state.settings,
      existingAssignment: state.plan.assignment,
      mode
    });

    state.plan = result;
    persistState();
    renderGrid();
    renderDiagnostics();
    renderStatus();

    if (result.meta.complete) {
      setStatus(`Plan generated using ${result.meta.method}.`);
    } else {
      setStatus("Plan partially generated. See diagnostics for blockers.");
    }
    renderStatus();
  }

  function solve({ students, layout, settings, existingAssignment }) {
    const normalizedLayout = deepClone(layout);
    normalizeLayout(normalizedLayout);

    const seatData = buildSeats(normalizedLayout);
    const graph = buildSeatGraph(seatData, normalizedLayout.nearRadius);
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const ctx = {
      students,
      studentMap,
      seatData,
      graph,
      layout: normalizedLayout,
      settings
    };

    const diagnostics = {
      warnings: [],
      violations: [],
      unresolved: deepClone(state.plan.diagnostics.unresolved || []),
      unplaced: [],
      solverNotes: []
    };

    const preflight = collectPreflightWarnings(ctx);
    diagnostics.warnings.push(...preflight.warnings);

    if (preflight.fatal) {
      diagnostics.unplaced = students.map((s) => s.name);
      return {
        assignment: {},
        score: 0,
        diagnostics,
        meta: {
          complete: false,
          nodeExpansions: 0,
          method: "none"
        }
      };
    }

    const lockedAssignment = buildLockedAssignment(students, existingAssignment);
    const lockValidation = validateLockedAssignment(lockedAssignment, ctx);
    if (lockValidation.violations.length > 0) {
      diagnostics.violations.push(...lockValidation.violations);
      diagnostics.unplaced = students.map((s) => s.name);
      return {
        assignment: lockValidation.assignment,
        score: 0,
        diagnostics,
        meta: {
          complete: false,
          nodeExpansions: 0,
          method: "none"
        }
      };
    }

    const rng = createSeededRng(Number(settings.randomSeed) || 42);

    const backtrackingResult = backtrackingWithForwardChecking({
      ctx,
      initialAssignment: lockValidation.assignment,
      maxNodes: Number(settings.maxNodes) || 5000,
      rng
    });

    let finalAssignment = backtrackingResult.assignment;
    let method = "backtracking";

    if (!backtrackingResult.complete) {
      diagnostics.solverNotes.push("Backtracking stopped before full placement; using greedy repair fallback.");
      const unassigned = students
        .map((s) => s.id)
        .filter((id) => finalAssignment[id] == null);

      const greedy = greedyFillAndLocalRepair({
        ctx,
        assignment: finalAssignment,
        unassignedIds: unassigned,
        rng,
        iterations: 140
      });

      finalAssignment = greedy.assignment;
      method = "greedy-repair";
      if (greedy.notes.length > 0) diagnostics.solverNotes.push(...greedy.notes);
    }

    const hardCheck = validateAllHard(finalAssignment, ctx);
    diagnostics.violations.push(...hardCheck.violations);

    const unplacedIds = students.map((s) => s.id).filter((id) => finalAssignment[id] == null);
    diagnostics.unplaced = unplacedIds.map((id) => studentMap.get(id)?.name || id);

    if (unplacedIds.length > 0) {
      unplacedIds.forEach((id) => {
        const student = studentMap.get(id);
        const report = explainNoSeatOptions(student, finalAssignment, ctx);
        diagnostics.solverNotes.push(report);
      });
    }

    const score = computeTotalSoftScore(finalAssignment, ctx);
    const complete = diagnostics.violations.length === 0 && diagnostics.unplaced.length === 0;

    return {
      assignment: finalAssignment,
      score,
      diagnostics,
      meta: {
        complete,
        nodeExpansions: backtrackingResult.nodeExpansions,
        method
      }
    };
  }

  function backtrackingWithForwardChecking({ ctx, initialAssignment, maxNodes, rng }) {
    const assignment = { ...initialAssignment };
    const allIds = ctx.students.map((s) => s.id);
    let nodeExpansions = 0;

    const unassignedStart = allIds.filter((id) => assignment[id] == null);

    function recurse(localAssignment, unassignedIds, currentScore) {
      if (unassignedIds.length === 0) {
        return {
          success: true,
          assignment: { ...localAssignment },
          score: currentScore
        };
      }

      if (nodeExpansions >= maxNodes) {
        return { success: false, timeout: true };
      }

      nodeExpansions += 1;

      // MRV + degree heuristic: pick the most constrained student first.
      const pick = pickNextStudentMRV(unassignedIds, localAssignment, ctx);
      if (!pick || pick.candidates.length === 0) {
        return { success: false };
      }

      const candidateSeats = pick.candidates
        .map((seatId) => {
          const delta = softScoreDelta(pick.student, seatId, localAssignment, ctx);
          return { seatId, delta, tie: rng() };
        })
        .sort((a, b) => b.delta - a.delta || a.tie - b.tie)
        .map((x) => x.seatId);

      for (const seatId of candidateSeats) {
        localAssignment[pick.student.id] = seatId;

        const remaining = unassignedIds.filter((id) => id !== pick.student.id);
        // Forward-checking: reject branches that leave any future student with zero legal seats.
        if (hasForwardCheckFailure(remaining, localAssignment, ctx)) {
          delete localAssignment[pick.student.id];
          continue;
        }

        const delta = softScoreDelta(pick.student, seatId, localAssignment, ctx);
        const result = recurse(localAssignment, remaining, currentScore + delta);
        if (result.success) return result;

        delete localAssignment[pick.student.id];
      }

      return { success: false };
    }

    const result = recurse(assignment, unassignedStart, 0);

    if (result.success) {
      return {
        assignment: result.assignment,
        complete: true,
        nodeExpansions
      };
    }

    return {
      assignment: assignment,
      complete: false,
      nodeExpansions
    };
  }

  function greedyFillAndLocalRepair({ ctx, assignment, unassignedIds, rng, iterations }) {
    const nextAssignment = { ...assignment };
    const notes = [];
    const studentsByPriority = orderStudentsByPriorityAndConstraintDensity(
      ctx.students.filter((s) => unassignedIds.includes(s.id))
    );

    studentsByPriority.forEach((student) => {
      const candidates = getCandidateSeats(student, nextAssignment, ctx).valid;
      if (candidates.length === 0) return;

      let best = candidates[0];
      let bestScore = Number.NEGATIVE_INFINITY;

      candidates.forEach((seatId) => {
        const score = softScoreDelta(student, seatId, nextAssignment, ctx) + rng();
        if (score > bestScore) {
          best = seatId;
          bestScore = score;
        }
      });

      nextAssignment[student.id] = best;
    });

    for (let i = 0; i < iterations; i += 1) {
      const improvedMove = tryRelocateOrSwap(nextAssignment, ctx, rng);
      if (!improvedMove) break;
    }

    const stillUnplaced = ctx.students
      .map((s) => s.id)
      .filter((id) => nextAssignment[id] == null)
      .length;

    if (stillUnplaced > 0) {
      notes.push(`${stillUnplaced} student(s) could not be placed in greedy fallback.`);
    }

    return {
      assignment: nextAssignment,
      notes
    };
  }

  function tryRelocateOrSwap(assignment, ctx, rng) {
    const students = shuffleArray(ctx.students.slice(), rng);
    const initial = computeTotalSoftScore(assignment, ctx);

    for (const student of students) {
      if (student.hard.lockToSeat) continue;
      const currentSeat = assignment[student.id];
      if (!currentSeat) continue;

      const candidates = getCandidateSeats(student, assignment, ctx).valid;
      for (const seatId of shuffleArray(candidates.slice(), rng)) {
        if (seatId === currentSeat) continue;

        const occupantId = getSeatOccupants(assignment)[seatId];
        if (occupantId && ctx.studentMap.get(occupantId)?.hard.lockToSeat) continue;

        const test = { ...assignment };
        if (occupantId) {
          test[student.id] = seatId;
          test[occupantId] = currentSeat;
        } else {
          test[student.id] = seatId;
        }

        const check = validateAllHard(test, ctx);
        if (check.violations.length > 0) continue;

        const score = computeTotalSoftScore(test, ctx);
        if (score > initial) {
          Object.keys(assignment).forEach((k) => delete assignment[k]);
          Object.assign(assignment, test);
          return true;
        }
      }
    }

    return false;
  }

  function pickNextStudentMRV(unassignedIds, assignment, ctx) {
    let best = null;

    unassignedIds.forEach((id) => {
      const student = ctx.studentMap.get(id);
      const candidateData = getCandidateSeats(student, assignment, ctx);
      const candidateCount = candidateData.valid.length;

      const degree = getDegree(student, unassignedIds, ctx.studentMap);
      const bucket = placementBucket(student);

      const rank = {
        student,
        candidates: candidateData.valid,
        candidateCount,
        degree,
        bucket,
        priorityLevel: student.priorityLevel || 1
      };

      if (!best) {
        best = rank;
        return;
      }

      const better =
        rank.candidateCount < best.candidateCount ||
        (rank.candidateCount === best.candidateCount && rank.bucket < best.bucket) ||
        (rank.candidateCount === best.candidateCount && rank.bucket === best.bucket && rank.degree > best.degree) ||
        (rank.candidateCount === best.candidateCount && rank.bucket === best.bucket && rank.degree === best.degree && rank.priorityLevel > best.priorityLevel);

      if (better) best = rank;
    });

    return best;
  }

  function hasForwardCheckFailure(unassignedIds, assignment, ctx) {
    for (const id of unassignedIds) {
      const student = ctx.studentMap.get(id);
      const candidates = getCandidateSeats(student, assignment, ctx).valid;
      if (candidates.length === 0) return true;
    }
    return false;
  }

  function getDegree(student, unassignedIds, studentMap) {
    const unassignedSet = new Set(unassignedIds);
    let degree = 0;

    student.hard.cannotSitNextTo.forEach((id) => {
      if (unassignedSet.has(id)) degree += 2;
    });
    student.hard.cannotSitNear.forEach((id) => {
      if (unassignedSet.has(id)) degree += 1;
    });

    student.soft.worksWellWith.forEach((id) => {
      if (unassignedSet.has(id)) degree += 1;
    });

    unassignedIds.forEach((otherId) => {
      const other = studentMap.get(otherId);
      if (!other || other.id === student.id) return;
      if (other.hard.cannotSitNextTo.includes(student.id)) degree += 2;
      if (other.hard.cannotSitNear.includes(student.id)) degree += 1;
      if (other.soft.worksWellWith.includes(student.id)) degree += 1;
    });

    return degree;
  }

  function placementBucket(student) {
    if (student.hard.lockToSeat) return 0;
    if (student.hard.needsAccessibilitySeat) return 1;
    if (student.hard.mustBeInZone || student.hard.mustBeInRowRange) return 2;
    return 3;
  }

  function constraintDensity(student) {
    return (
      student.hard.cannotSitNextTo.length * 2 +
      student.hard.cannotSitNear.length +
      student.soft.worksWellWith.length +
      (student.hard.mustBeInZone ? 1 : 0) +
      (student.hard.mustBeInRowRange ? 1 : 0) +
      (student.hard.needsAccessibilitySeat ? 1 : 0)
    );
  }

  function orderStudentsByPriorityAndConstraintDensity(students) {
    return students.slice().sort((a, b) => {
      const bucketDiff = placementBucket(a) - placementBucket(b);
      if (bucketDiff !== 0) return bucketDiff;

      const priorityDiff = (b.priorityLevel || 1) - (a.priorityLevel || 1);
      if (priorityDiff !== 0) return priorityDiff;

      const densityDiff = constraintDensity(b) - constraintDensity(a);
      if (densityDiff !== 0) return densityDiff;

      return a.name.localeCompare(b.name);
    });
  }

  function getCandidateSeats(student, assignment, ctx) {
    const valid = [];
    const reasonCounts = {};

    ctx.seatData.availableSeatIds.forEach((seatId) => {
      const check = validateHardPlacement(student, seatId, assignment, ctx);
      if (check.ok) {
        valid.push(seatId);
      } else {
        reasonCounts[check.reason] = (reasonCounts[check.reason] || 0) + 1;
      }
    });

    return { valid, reasonCounts };
  }

  function validateHardPlacement(student, seatId, assignment, ctx) {
    const seat = ctx.seatData.seatMap.get(seatId);
    if (!seat) return { ok: false, reason: "Unknown seat" };
    if (seat.isBlocked) return { ok: false, reason: "Seat is blocked" };

    const seatOccupants = getSeatOccupants(assignment);
    const occupiedBy = seatOccupants[seatId];
    if (occupiedBy && occupiedBy !== student.id) {
      return { ok: false, reason: "Seat already occupied" };
    }

    if (student.hard.lockToSeat && student.hard.lockToSeat !== seatId) {
      return { ok: false, reason: "Locked to a different seat" };
    }

    if (student.hard.mustBeInZone && student.hard.mustBeInZone !== seat.zone) {
      return { ok: false, reason: "Required zone mismatch" };
    }

    if (student.hard.mustBeInRowRange) {
      const [min, max] = student.hard.mustBeInRowRange;
      if (seat.row < min || seat.row > max) {
        return { ok: false, reason: "Required row range mismatch" };
      }
    }

    if (student.hard.needsAccessibilitySeat && !seat.isAccessible) {
      return { ok: false, reason: "Needs accessibility seat" };
    }

    const nextToSet = ctx.graph.nextTo.get(seatId) || new Set();
    const nearSet = ctx.graph.near.get(seatId) || new Set();

    for (const otherId of student.hard.cannotSitNextTo) {
      const otherSeat = assignment[otherId];
      if (otherSeat && nextToSet.has(otherSeat)) {
        return { ok: false, reason: "Cannot sit next to specific student" };
      }
    }

    for (const otherId of student.hard.cannotSitNear) {
      const otherSeat = assignment[otherId];
      if (otherSeat && nearSet.has(otherSeat)) {
        return { ok: false, reason: "Cannot sit near specific student" };
      }
    }

    for (const [otherId, otherSeat] of Object.entries(assignment)) {
      if (!otherSeat || otherId === student.id) continue;
      const other = ctx.studentMap.get(otherId);
      if (!other) continue;

      const otherNextTo = ctx.graph.nextTo.get(otherSeat) || new Set();
      const otherNear = ctx.graph.near.get(otherSeat) || new Set();

      if (other.hard.cannotSitNextTo.includes(student.id) && otherNextTo.has(seatId)) {
        return { ok: false, reason: "Reciprocal next-to conflict" };
      }

      if (other.hard.cannotSitNear.includes(student.id) && otherNear.has(seatId)) {
        return { ok: false, reason: "Reciprocal near conflict" };
      }
    }

    return { ok: true };
  }

  function validateAllHard(assignment, ctx) {
    const violations = [];
    const seatOccupants = {};

    for (const [studentId, seatId] of Object.entries(assignment)) {
      if (!seatId) continue;
      if (seatOccupants[seatId] && seatOccupants[seatId] !== studentId) {
        violations.push(`Seat ${seatId} assigned to multiple students.`);
      }
      seatOccupants[seatId] = studentId;
    }

    for (const student of ctx.students) {
      const seatId = assignment[student.id];
      if (!seatId) continue;

      const check = validateHardPlacement(student, seatId, assignment, ctx);
      if (!check.ok) {
        violations.push(`${student.name}: ${check.reason}.`);
      }
    }

    return { violations };
  }

  function softScoreDelta(student, seatId, assignment, ctx) {
    const seat = ctx.seatData.seatMap.get(seatId);
    if (!seat) return Number.NEGATIVE_INFINITY;

    let score = 0;

    if (student.soft.preferNearTeacher && seat.isNearTeacher) {
      score += 2;
    }

    const nearSet = ctx.graph.near.get(seatId) || new Set();

    student.soft.worksWellWith.forEach((mateId) => {
      const mateSeat = assignment[mateId];
      if (!mateSeat) return;
      if (nearSet.has(mateSeat)) score += 2;
    });

    if (student.soft.preferGroup) {
      Object.entries(assignment).forEach(([otherId, otherSeat]) => {
        if (!otherSeat || otherId === student.id) return;
        const other = ctx.studentMap.get(otherId);
        if (!other || other.soft.preferGroup !== student.soft.preferGroup) return;
        if (nearSet.has(otherSeat)) score += 1;
      });
    }

    return score;
  }

  function computeTotalSoftScore(assignment, ctx) {
    let total = 0;
    const seenPairs = new Set();

    for (const student of ctx.students) {
      const seatId = assignment[student.id];
      if (!seatId) continue;

      const seat = ctx.seatData.seatMap.get(seatId);
      if (student.soft.preferNearTeacher && seat?.isNearTeacher) {
        total += 2;
      }

      const nearSet = ctx.graph.near.get(seatId) || new Set();

      student.soft.worksWellWith.forEach((mateId) => {
        const mateSeat = assignment[mateId];
        if (!mateSeat) return;

        const pairKey = [student.id, mateId].sort().join("|");
        if (seenPairs.has(pairKey)) return;
        seenPairs.add(pairKey);

        if (nearSet.has(mateSeat)) total += 2;
      });

      if (student.soft.preferGroup) {
        Object.entries(assignment).forEach(([otherId, otherSeat]) => {
          if (!otherSeat || otherId === student.id) return;
          const other = ctx.studentMap.get(otherId);
          if (!other || other.soft.preferGroup !== student.soft.preferGroup) return;

          const pairKey = ["group", student.id, otherId].sort().join("|");
          if (seenPairs.has(pairKey)) return;
          seenPairs.add(pairKey);

          if (nearSet.has(otherSeat)) total += 1;
        });
      }
    }

    return total;
  }

  function explainNoSeatOptions(student, assignment, ctx) {
    const data = getCandidateSeats(student, assignment, ctx);
    const top = Object.entries(data.reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => `${reason} (${count})`)
      .join(", ");

    return `${student.name} has no valid seat options. Main blockers: ${top || "insufficient seat options"}.`;
  }

  function collectPreflightWarnings(ctx) {
    const warnings = [];

    if (ctx.seatData.availableSeatIds.length < ctx.students.length) {
      warnings.push(
        `Only ${ctx.seatData.availableSeatIds.length} available seats for ${ctx.students.length} students. Reduce blocked seats or class size.`
      );
      return { warnings, fatal: true };
    }

    const requiredAccessibility = ctx.students.filter((s) => s.hard.needsAccessibilitySeat).length;
    const accessibleSeats = ctx.seatData.seats.filter((s) => s.isAccessible && !s.isBlocked).length;

    if (requiredAccessibility > accessibleSeats) {
      warnings.push(
        `Accessibility seats are fewer than needed (${accessibleSeats} seats for ${requiredAccessibility} students).`
      );
    }

    const zoneCounts = { Front: 0, Middle: 0, Back: 0 };
    ctx.seatData.seats.forEach((seat) => {
      if (!seat.isBlocked) zoneCounts[seat.zone] += 1;
    });

    const zoneNeeds = { Front: 0, Middle: 0, Back: 0 };
    ctx.students.forEach((student) => {
      if (student.hard.mustBeInZone) zoneNeeds[student.hard.mustBeInZone] += 1;
    });

    ["Front", "Middle", "Back"].forEach((zone) => {
      if (zoneNeeds[zone] > zoneCounts[zone]) {
        warnings.push(
          `${zone} zone has ${zoneCounts[zone]} seats but ${zoneNeeds[zone]} students require it. Consider widening zone boundaries.`
        );
      }
    });

    if (ctx.layout.nearRadius > Math.min(ctx.layout.rows, ctx.layout.cols)) {
      warnings.push("Near radius is very large for this room; consider reducing near radius.");
    }

    return { warnings, fatal: false };
  }

  function buildLockedAssignment(students, existingAssignment) {
    const assignment = {};
    students.forEach((student) => {
      if (student.hard.lockToSeat) {
        assignment[student.id] = student.hard.lockToSeat;
      }
    });

    Object.entries(existingAssignment || {}).forEach(([studentId, seatId]) => {
      const student = students.find((s) => s.id === studentId);
      if (student?.hard.lockToSeat && seatId === student.hard.lockToSeat) {
        assignment[studentId] = seatId;
      }
    });

    return assignment;
  }

  function validateLockedAssignment(assignment, ctx) {
    const next = { ...assignment };
    const violations = [];

    for (const [studentId, seatId] of Object.entries(next)) {
      const student = ctx.studentMap.get(studentId);
      if (!student) continue;
      const check = validateHardPlacement(student, seatId, next, ctx);
      if (!check.ok) {
        violations.push(`Locked seat invalid for ${student.name}: ${check.reason}.`);
      }
    }

    return { assignment: next, violations };
  }

  function buildSeats(layout) {
    const blockedSet = new Set(layout.blockedSeatIds);
    const accessibleSet = new Set(layout.accessibleSeatIds);
    const seats = [];
    const seatMap = new Map();
    const availableSeatIds = [];

    for (let row = 1; row <= layout.rows; row += 1) {
      for (let col = 1; col <= layout.cols; col += 1) {
        const id = seatId(row, col);
        const isBlocked = blockedSet.has(id);
        const seat = {
          id,
          row,
          col,
          zone: getZoneForRow(row, layout),
          isBlocked,
          isAccessible: accessibleSet.has(id) && !isBlocked,
          isNearTeacher: isSeatNearTeacher(row, col, layout)
        };

        seats.push(seat);
        seatMap.set(id, seat);
        if (!isBlocked) availableSeatIds.push(id);
      }
    }

    return { seats, seatMap, availableSeatIds };
  }

  function buildSeatGraph(seatData, nearRadius) {
    const nextTo = new Map();
    const near = new Map();

    const byRowCol = new Map();
    seatData.seats.forEach((seat) => {
      byRowCol.set(`${seat.row}:${seat.col}`, seat);
    });

    seatData.seats.forEach((seat) => {
      if (seat.isBlocked) return;

      const nextSet = new Set();
      const nearSet = new Set();

      const orthoOffsets = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];

      orthoOffsets.forEach(([dr, dc]) => {
        const other = byRowCol.get(`${seat.row + dr}:${seat.col + dc}`);
        if (other && !other.isBlocked) {
          nextSet.add(other.id);
        }
      });

      for (let dr = -nearRadius; dr <= nearRadius; dr += 1) {
        for (let dc = -nearRadius; dc <= nearRadius; dc += 1) {
          if (dr === 0 && dc === 0) continue;
          if (Math.max(Math.abs(dr), Math.abs(dc)) > nearRadius) continue;

          const other = byRowCol.get(`${seat.row + dr}:${seat.col + dc}`);
          if (other && !other.isBlocked) {
            nearSet.add(other.id);
          }
        }
      }

      nextTo.set(seat.id, nextSet);
      near.set(seat.id, nearSet);
    });

    return { nextTo, near };
  }

  function isSeatNearTeacher(row, col, layout) {
    const teacher = getTeacherPoint(layout);
    const dr = row - teacher.row;
    const dc = col - teacher.col;
    const distance = Math.sqrt(dr * dr + dc * dc);
    return distance <= 2.2;
  }

  function getTeacherPoint(layout) {
    const centerCol = (layout.cols + 1) / 2;
    const centerRow = (layout.rows + 1) / 2;

    switch (layout.teacherAt) {
      case "Front":
      case "FrontCenter":
        return { row: 0, col: centerCol };
      case "Back":
        return { row: layout.rows + 1, col: centerCol };
      case "Left":
        return { row: centerRow, col: 0 };
      case "Right":
        return { row: centerRow, col: layout.cols + 1 };
      default:
        return { row: 0, col: centerCol };
    }
  }

  function getZoneForRow(row, layout) {
    if (row <= layout.frontEndRow) return "Front";
    if (row <= layout.middleEndRow) return "Middle";
    return "Back";
  }

  function seatId(row, col) {
    return `R${row}C${col}`;
  }

  function normalizeLayout(layout) {
    layout.rows = clamp(toInt(layout.rows, DEFAULT_LAYOUT.rows), 3, 12);
    layout.cols = clamp(toInt(layout.cols, DEFAULT_LAYOUT.cols), 1, 12);
    layout.nearRadius = clamp(toInt(layout.nearRadius, DEFAULT_LAYOUT.nearRadius), 1, 4);
    layout.frontEndRow = clamp(toInt(layout.frontEndRow, 2), 1, layout.rows);
    layout.middleEndRow = clamp(toInt(layout.middleEndRow, 4), layout.frontEndRow + 1, layout.rows);

    const validSeatIds = new Set();
    for (let r = 1; r <= layout.rows; r += 1) {
      for (let c = 1; c <= layout.cols; c += 1) {
        validSeatIds.add(seatId(r, c));
      }
    }

    layout.blockedSeatIds = dedupe((layout.blockedSeatIds || []).filter((id) => validSeatIds.has(id)));
    layout.accessibleSeatIds = dedupe(
      (layout.accessibleSeatIds || []).filter((id) => validSeatIds.has(id) && !layout.blockedSeatIds.includes(id))
    );

    if (!layout.teacherAt) {
      layout.teacherAt = "FrontCenter";
    }
  }

  function renderAll() {
    renderStudents();
    renderStudentEditor();
    renderLayout();
    renderGrid();
    renderDiagnostics();
    renderStatus();
  }

  function renderStudents() {
    dom.studentList.innerHTML = "";

    state.students
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((student) => {
        const item = document.createElement("li");
        item.className = "student-item" + (student.id === state.ui.selectedStudentId ? " selected" : "");
        item.dataset.studentId = student.id;

        const left = document.createElement("div");
        left.textContent = `${student.name || "(unnamed)"} [P${student.priorityLevel}]`;

        const badges = document.createElement("div");
        badges.className = "badges";

        if (student.hard.lockToSeat) badges.appendChild(makeBadge(`Lock ${student.hard.lockToSeat}`, "hard"));
        if (student.hard.needsAccessibilitySeat) badges.appendChild(makeBadge("A11y", "hard"));
        if (student.hard.mustBeInZone) badges.appendChild(makeBadge(student.hard.mustBeInZone, "hard"));
        if (student.hard.cannotSitNear.length || student.hard.cannotSitNextTo.length) {
          badges.appendChild(makeBadge("Conflict", "hard"));
        }

        if (student.soft.preferNearTeacher) badges.appendChild(makeBadge("NearTeacher", "soft"));
        if (student.soft.preferGroup) badges.appendChild(makeBadge(student.soft.preferGroup, "soft"));

        item.appendChild(left);
        item.appendChild(badges);
        dom.studentList.appendChild(item);
      });
  }

  function renderStudentEditor() {
    const selected = getSelectedStudent();
    const disabled = !selected;

    Array.from(dom.studentForm.elements).forEach((el) => {
      el.disabled = disabled;
    });

    if (!selected) {
      dom.studentName.value = "";
      dom.studentPriority.value = "1";
      dom.studentCannotNext.value = "";
      dom.studentCannotNear.value = "";
      dom.studentWorksWell.value = "";
      dom.studentZone.value = "";
      dom.studentRowRange.value = "";
      dom.studentGroup.value = "";
      dom.studentLockSeat.value = "";
      dom.studentAccess.checked = false;
      dom.studentNearTeacher.checked = false;
      return;
    }

    dom.studentName.value = selected.name || "";
    dom.studentPriority.value = String(selected.priorityLevel || 1);
    dom.studentCannotNext.value = selected.raw.cannotSitNextTo || "";
    dom.studentCannotNear.value = selected.raw.cannotSitNear || "";
    dom.studentWorksWell.value = selected.raw.worksWellWith || "";
    dom.studentZone.value = selected.hard.mustBeInZone || "";
    dom.studentRowRange.value = rowRangeToText(selected.hard.mustBeInRowRange);
    dom.studentGroup.value = selected.soft.preferGroup || "";
    dom.studentLockSeat.value = selected.hard.lockToSeat || "";
    dom.studentAccess.checked = !!selected.hard.needsAccessibilitySeat;
    dom.studentNearTeacher.checked = !!selected.soft.preferNearTeacher;
  }

  function renderLayout() {
    normalizeLayout(state.layout);

    dom.layoutRows.value = state.layout.rows;
    dom.layoutCols.value = state.layout.cols;
    dom.layoutRadius.value = state.layout.nearRadius;
    dom.layoutTeacher.value = state.layout.teacherAt;
    dom.layoutSeed.value = state.settings.randomSeed;
    dom.layoutMaxNodes.value = state.settings.maxNodes;

    dom.zoneFrontEnd.min = "1";
    dom.zoneFrontEnd.max = String(Math.max(1, state.layout.rows - 1));
    dom.zoneMiddleEnd.min = String(Math.max(2, state.layout.frontEndRow + 1));
    dom.zoneMiddleEnd.max = String(state.layout.rows);

    dom.zoneFrontEnd.value = String(state.layout.frontEndRow);
    dom.zoneMiddleEnd.value = String(state.layout.middleEndRow);
    dom.zoneFrontOutput.textContent = String(state.layout.frontEndRow);
    dom.zoneMiddleOutput.textContent = String(state.layout.middleEndRow);
  }

  function renderGrid() {
    const seatData = buildSeats(state.layout);
    const assignment = state.plan.assignment || {};
    const seatOccupants = getSeatOccupants(assignment);
    const teacherPosition = getTeacherPositionKey(state.layout.teacherAt);

    if (dom.gridStage) {
      dom.gridStage.dataset.teacherAt = teacherPosition;
    }

    if (dom.gridOrientation) {
      dom.gridOrientation.setAttribute("aria-label", `Teacher at ${teacherPosition}`);
    }

    if (dom.teacherLabel) {
      dom.teacherLabel.textContent = `Teacher (${capitalizeWord(teacherPosition)})`;
    }

    dom.seatingGrid.style.gridTemplateColumns = `repeat(${state.layout.cols}, minmax(74px, 1fr))`;
    dom.seatingGrid.innerHTML = "";

    seatData.seats.forEach((seat) => {
      const seatEl = document.createElement("button");
      seatEl.type = "button";
      seatEl.className = `seat ${seat.zone.toLowerCase()}${seat.isBlocked ? " blocked" : ""}${
        seat.isAccessible ? " accessible" : ""
      }${seat.isNearTeacher ? " near-teacher" : ""}`;
      seatEl.dataset.seatId = seat.id;
      seatEl.dataset.row = String(seat.row);
      seatEl.dataset.col = String(seat.col);
      seatEl.setAttribute("role", "gridcell");
      seatEl.setAttribute("aria-label", `${seat.id} ${seat.zone} seat`);

      const idEl = document.createElement("div");
      idEl.className = "seat-id";
      idEl.textContent = seat.id;
      seatEl.appendChild(idEl);

      if (seat.isBlocked) {
        const blocked = document.createElement("div");
        blocked.className = "student-name";
        blocked.textContent = "Blocked";
        seatEl.appendChild(blocked);
      } else {
        const studentId = seatOccupants[seat.id];
        const student = studentId ? state.students.find((s) => s.id === studentId) : null;

        const nameEl = document.createElement("div");
        nameEl.className = "student-name";
        nameEl.textContent = student ? student.name : "Empty";
        seatEl.appendChild(nameEl);

        if (student) {
          seatEl.draggable = true;
          seatEl.dataset.studentId = student.id;
          seatEl.title = buildStudentTooltip(student);

          const isLocked = student.hard.lockToSeat === seat.id;
          if (isLocked) seatEl.classList.add("locked");

          const lockBtn = document.createElement("button");
          lockBtn.type = "button";
          lockBtn.className = "lock-btn";
          lockBtn.dataset.lockStudentId = student.id;
          lockBtn.title = isLocked ? "Unlock seat" : "Lock seat";
          lockBtn.textContent = isLocked ? "*" : "o";
          seatEl.appendChild(lockBtn);
        }
      }

      dom.seatingGrid.appendChild(seatEl);
    });
  }

  function getTeacherPositionKey(teacherAt) {
    switch (teacherAt) {
      case "Back":
        return "back";
      case "Left":
        return "left";
      case "Right":
        return "right";
      case "Front":
      case "FrontCenter":
      default:
        return "front";
    }
  }

  function capitalizeWord(word) {
    if (!word) return "Front";
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function renderDiagnostics() {
    const diagnostics = state.plan.diagnostics || DEFAULT_PLAN.diagnostics;
    const unresolved = diagnostics.unresolved || [];

    dom.unresolvedMappings.innerHTML = "";
    if (unresolved.length > 0) {
      const heading = document.createElement("p");
      heading.textContent = "Unknown names found in constraints. Map them below:";
      dom.unresolvedMappings.appendChild(heading);

      unresolved.forEach((entry, idx) => {
        const row = document.createElement("div");
        row.className = "mapping-row";

        const label = document.createElement("span");
        label.textContent = `${entry.studentName}: ${entry.value}`;

        const select = document.createElement("select");
        select.dataset.unresolvedName = entry.value;

        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Select student...";
        select.appendChild(empty);

        state.students.forEach((student) => {
          const opt = document.createElement("option");
          opt.value = student.id;
          opt.textContent = student.name;
          select.appendChild(opt);
        });

        row.appendChild(label);
        row.appendChild(select);
        dom.unresolvedMappings.appendChild(row);
      });
    }

    dom.diagnosticsList.innerHTML = "";

    const items = [];
    diagnostics.violations.forEach((v) => items.push(`[Hard] ${v}`));
    diagnostics.warnings.forEach((w) => items.push(`[Warn] ${w}`));
    diagnostics.solverNotes.forEach((n) => items.push(`[Info] ${n}`));

    if (items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No diagnostics to show.";
      dom.diagnosticsList.appendChild(li);
      return;
    }

    items.slice(0, 14).forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      dom.diagnosticsList.appendChild(li);
    });
  }

  function renderStatus() {
    const complete = state.plan.meta?.complete;
    const unplaced = state.plan.diagnostics?.unplaced?.length || 0;
    const violations = state.plan.diagnostics?.violations?.length || 0;
    const method = state.plan.meta?.method || "none";
    const nodes = state.plan.meta?.nodeExpansions || 0;

    let status = state.ui.statusText || "Ready.";
    if (complete) {
      status = `${status} Complete plan. Method: ${method}. Nodes: ${nodes}.`;
    } else if (unplaced > 0 || violations > 0) {
      status = `${status} Unplaced: ${unplaced}. Hard issues: ${violations}.`;
    }

    dom.statusText.textContent = status;
    dom.scoreText.textContent = `Score: ${state.plan.score || 0}`;
  }

  function onGridClick(event) {
    const lockBtn = event.target.closest("[data-lock-student-id]");
    if (lockBtn) {
      const studentId = lockBtn.dataset.lockStudentId;
      toggleStudentLock(studentId);
      return;
    }

    const seatEl = event.target.closest(".seat");
    if (!seatEl) return;

    if (state.ui.seatEditMode !== "none") {
      toggleSeatMarker(seatEl.dataset.seatId, state.ui.seatEditMode);
    }
  }

  function onGridDragStart(event) {
    const seat = event.target.closest(".seat");
    if (!seat || !seat.dataset.studentId) return;

    const student = state.students.find((s) => s.id === seat.dataset.studentId);
    if (student?.hard.lockToSeat) {
      event.preventDefault();
      return;
    }

    state.ui.dragStudentId = seat.dataset.studentId;
    event.dataTransfer.setData("text/plain", seat.dataset.studentId);
  }

  function onGridDragOver(event) {
    const seat = event.target.closest(".seat");
    if (!seat) return;
    event.preventDefault();
  }

  function onGridDrop(event) {
    const targetSeatEl = event.target.closest(".seat");
    if (!targetSeatEl) return;

    event.preventDefault();

    const sourceStudentId = event.dataTransfer.getData("text/plain") || state.ui.dragStudentId;
    if (!sourceStudentId) return;

    manualMoveOrSwap(sourceStudentId, targetSeatEl.dataset.seatId);
    state.ui.dragStudentId = null;
  }

  function onGridKeyDown(event) {
    const seat = event.target.closest(".seat");
    if (!seat) return;

    const row = toInt(seat.dataset.row, 1);
    const col = toInt(seat.dataset.col, 1);

    let targetRow = row;
    let targetCol = col;

    switch (event.key) {
      case "ArrowUp":
        targetRow -= 1;
        break;
      case "ArrowDown":
        targetRow += 1;
        break;
      case "ArrowLeft":
        targetCol -= 1;
        break;
      case "ArrowRight":
        targetCol += 1;
        break;
      default:
        return;
    }

    event.preventDefault();

    const next = dom.seatingGrid.querySelector(`[data-row='${targetRow}'][data-col='${targetCol}']`);
    if (next) next.focus();
  }

  function toggleSeatMarker(seatIdValue, mode) {
    const blocked = new Set(state.layout.blockedSeatIds);
    const accessible = new Set(state.layout.accessibleSeatIds);

    if (mode === "blocked") {
      if (blocked.has(seatIdValue)) {
        blocked.delete(seatIdValue);
      } else {
        blocked.add(seatIdValue);
        accessible.delete(seatIdValue);
        clearStudentAtSeat(seatIdValue);
      }
    }

    if (mode === "accessible") {
      if (blocked.has(seatIdValue)) return;
      if (accessible.has(seatIdValue)) {
        accessible.delete(seatIdValue);
      } else {
        accessible.add(seatIdValue);
      }
    }

    state.layout.blockedSeatIds = Array.from(blocked);
    state.layout.accessibleSeatIds = Array.from(accessible);
    normalizeLayout(state.layout);

    persistState();
    renderGrid();
    renderDiagnostics();
    setStatus(`Updated seat ${seatIdValue} as ${mode}.`);
    renderStatus();
  }

  function clearStudentAtSeat(seatIdValue) {
    const assignment = state.plan.assignment || {};
    Object.keys(assignment).forEach((studentId) => {
      if (assignment[studentId] === seatIdValue) {
        delete assignment[studentId];
        const student = state.students.find((s) => s.id === studentId);
        if (student?.hard.lockToSeat === seatIdValue) {
          student.hard.lockToSeat = null;
        }
      }
    });
  }

  function toggleStudentLock(studentId) {
    const assignment = state.plan.assignment || {};
    const student = state.students.find((s) => s.id === studentId);
    if (!student) return;

    const seat = assignment[studentId];
    if (!seat) return;

    student.hard.lockToSeat = student.hard.lockToSeat === seat ? null : seat;

    reconcileReferences();
    persistState();
    renderStudents();
    renderStudentEditor();
    renderGrid();

    setStatus(student.hard.lockToSeat ? `${student.name} locked to ${seat}.` : `${student.name} unlocked.`);
    renderStatus();
  }

  function manualMoveOrSwap(sourceStudentId, targetSeatId) {
    const assignment = { ...(state.plan.assignment || {}) };
    const sourceStudent = state.students.find((s) => s.id === sourceStudentId);
    if (!sourceStudent) return;

    if (sourceStudent.hard.lockToSeat) {
      setStatus("Unlock that student before moving.");
      renderStatus();
      return;
    }

    const sourceSeatId = assignment[sourceStudentId];
    if (!sourceSeatId || sourceSeatId === targetSeatId) return;

    const seatOccupants = getSeatOccupants(assignment);
    const targetStudentId = seatOccupants[targetSeatId] || null;
    if (targetStudentId) {
      const targetStudent = state.students.find((s) => s.id === targetStudentId);
      if (targetStudent?.hard.lockToSeat) {
        setStatus("Target student is locked. Unlock first.");
        renderStatus();
        return;
      }
    }

    if (targetStudentId) {
      assignment[sourceStudentId] = targetSeatId;
      assignment[targetStudentId] = sourceSeatId;
    } else {
      assignment[sourceStudentId] = targetSeatId;
    }

    const ctx = {
      students: state.students,
      studentMap: new Map(state.students.map((s) => [s.id, s])),
      seatData: buildSeats(state.layout),
      graph: buildSeatGraph(buildSeats(state.layout), state.layout.nearRadius),
      layout: state.layout,
      settings: state.settings
    };

    const check = validateAllHard(assignment, ctx);
    if (check.violations.length > 0) {
      setStatus(`Move rejected: ${check.violations[0]}`);
      renderStatus();
      return;
    }

    state.plan.assignment = assignment;
    state.plan.score = computeTotalSoftScore(assignment, ctx);
    state.plan.diagnostics.violations = [];

    persistState();
    renderGrid();
    renderDiagnostics();

    setStatus("Manual move applied.");
    renderStatus();
  }

  function applyFormToStudent(student) {
    student.name = dom.studentName.value.trim() || "Unnamed";
    student.priorityLevel = clamp(toInt(dom.studentPriority.value, 1), 1, 3);

    student.raw.cannotSitNextTo = dom.studentCannotNext.value.trim();
    student.raw.cannotSitNear = dom.studentCannotNear.value.trim();
    student.raw.worksWellWith = dom.studentWorksWell.value.trim();

    student.hard.mustBeInZone = dom.studentZone.value || null;
    student.hard.mustBeInRowRange = parseRowRange(dom.studentRowRange.value);
    student.hard.needsAccessibilitySeat = !!dom.studentAccess.checked;

    const lockValue = dom.studentLockSeat.value.trim().toUpperCase();
    student.hard.lockToSeat = lockValue || null;

    student.soft.preferNearTeacher = !!dom.studentNearTeacher.checked;
    student.soft.preferGroup = dom.studentGroup.value.trim() || null;
  }

  function applyLayoutForm() {
    state.layout.rows = clamp(toInt(dom.layoutRows.value, state.layout.rows), 3, 12);
    state.layout.cols = clamp(toInt(dom.layoutCols.value, state.layout.cols), 1, 12);
    state.layout.nearRadius = clamp(toInt(dom.layoutRadius.value, state.layout.nearRadius), 1, 4);
    state.layout.teacherAt = dom.layoutTeacher.value;

    state.settings.randomSeed = clamp(toInt(dom.layoutSeed.value, state.settings.randomSeed), 1, 999999);
    state.settings.maxNodes = clamp(toInt(dom.layoutMaxNodes.value, state.settings.maxNodes), 100, 50000);

    const front = clamp(toInt(dom.zoneFrontEnd.value, state.layout.frontEndRow), 1, state.layout.rows - 1);
    const middle = clamp(toInt(dom.zoneMiddleEnd.value, state.layout.middleEndRow), front + 1, state.layout.rows);

    state.layout.frontEndRow = front;
    state.layout.middleEndRow = middle;

    normalizeLayout(state.layout);
  }

  function reconcileReferences() {
    const nameMap = new Map();
    const duplicateNames = new Set();

    state.students.forEach((student) => {
      const key = normalizeName(student.name);
      if (!key) return;
      if (nameMap.has(key)) duplicateNames.add(key);
      if (!nameMap.has(key)) nameMap.set(key, student.id);
    });

    const unresolved = [];

    state.students.forEach((student) => {
      student.hard.cannotSitNextTo = resolveNameList(student.raw.cannotSitNextTo, nameMap, student, "cannotSitNextTo", unresolved);
      student.hard.cannotSitNear = resolveNameList(student.raw.cannotSitNear, nameMap, student, "cannotSitNear", unresolved);
      student.soft.worksWellWith = resolveNameList(student.raw.worksWellWith, nameMap, student, "worksWellWith", unresolved);

      student.hard.cannotSitNextTo = student.hard.cannotSitNextTo.filter((id) => id !== student.id);
      student.hard.cannotSitNear = student.hard.cannotSitNear.filter((id) => id !== student.id);
      student.soft.worksWellWith = student.soft.worksWellWith.filter((id) => id !== student.id);

      if (student.hard.lockToSeat) {
        student.hard.lockToSeat = student.hard.lockToSeat.toUpperCase();
      }
    });

    const warnings = [];
    if (duplicateNames.size > 0) {
      warnings.push("Duplicate names detected. Constraints by name may resolve to the first match.");
    }

    state.plan.diagnostics = state.plan.diagnostics || deepClone(DEFAULT_PLAN.diagnostics);
    state.plan.diagnostics.unresolved = unresolved;
    state.plan.diagnostics.warnings = dedupe([...(state.plan.diagnostics.warnings || []), ...warnings]);
  }

  function resolveNameList(raw, nameMap, ownerStudent, field, unresolvedOut) {
    const items = splitPipe(raw);
    const ids = [];

    items.forEach((name) => {
      const key = normalizeName(name);
      if (!key) return;

      const aliasId = state.settings.nameAliases[key];
      if (aliasId && state.students.some((s) => s.id === aliasId)) {
        ids.push(aliasId);
        return;
      }

      const id = nameMap.get(key);
      if (id) {
        ids.push(id);
      } else {
        unresolvedOut.push({
          studentId: ownerStudent.id,
          studentName: ownerStudent.name,
          field,
          value: name
        });
      }
    });

    return dedupe(ids);
  }

  function getSelectedStudent() {
    return state.students.find((s) => s.id === state.ui.selectedStudentId) || null;
  }

  function makeBadge(text, kind) {
    const badge = document.createElement("span");
    badge.className = `badge ${kind}`;
    badge.textContent = text;
    return badge;
  }

  function getSeatOccupants(assignment) {
    const out = {};
    Object.entries(assignment || {}).forEach(([studentId, seatIdValue]) => {
      if (seatIdValue) out[seatIdValue] = studentId;
    });
    return out;
  }

  function removeStudentFromPlan(studentId) {
    delete state.plan.assignment[studentId];
  }

  function buildStudentTooltip(student) {
    const parts = [`Priority ${student.priorityLevel}`];

    if (student.hard.mustBeInZone) parts.push(`Zone: ${student.hard.mustBeInZone}`);
    if (student.hard.mustBeInRowRange) parts.push(`Rows: ${rowRangeToText(student.hard.mustBeInRowRange)}`);
    if (student.hard.needsAccessibilitySeat) parts.push("Needs accessibility seat");
    if (student.hard.cannotSitNextTo.length) parts.push("Cannot sit next to specified students");
    if (student.hard.cannotSitNear.length) parts.push("Cannot sit near specified students");
    if (student.soft.preferNearTeacher) parts.push("Prefers near teacher");
    if (student.soft.preferGroup) parts.push(`Group: ${student.soft.preferGroup}`);

    return parts.join(" | ");
  }

  function parseRowRange(value) {
    const text = (value || "").trim();
    if (!text) return null;

    const match = text.match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (!match) return null;

    const min = toInt(match[1], 1);
    const max = toInt(match[2], min);
    if (min <= 0 || max < min) return null;

    return [min, max];
  }

  function rowRangeToText(range) {
    if (!range || !Array.isArray(range) || range.length !== 2) return "";
    return `${range[0]}-${range[1]}`;
  }

  function splitPipe(text) {
    return (text || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function onCsvImportChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      importStudentsFromCsv(text);
      dom.csvImportInput.value = "";
    };
    reader.readAsText(file);
  }

  function importStudentsFromCsv(text) {
    const parsed = parseCsv(text);
    if (parsed.rows.length === 0) {
      setStatus("CSV import failed: no rows found.");
      renderStatus();
      return;
    }

    const rows = parsed.rows;
    const imported = [];

    rows.forEach((row) => {
      const name = (row.name || "").trim();
      if (!name) return;

      const student = createStudent(name);
      student.priorityLevel = clamp(toInt(row.priorityLevel, 1), 1, 3);

      student.raw.cannotSitNextTo = (row.cannotSitNextTo || "").trim();
      student.raw.cannotSitNear = (row.cannotSitNear || "").trim();
      student.raw.worksWellWith = (row.worksWellWith || "").trim();

      student.hard.mustBeInZone = normalizeZone(row.mustBeInZone);
      student.hard.mustBeInRowRange = parseRowRange((row.mustBeInRowRange || "").trim());
      student.hard.needsAccessibilitySeat = parseBoolean(row.needsAccessibilitySeat);
      student.hard.lockToSeat = ((row.lockToSeat || "").trim().toUpperCase() || null);

      student.soft.preferNearTeacher = parseBoolean(row.preferNearTeacher);
      student.soft.preferGroup = (row.preferGroup || "").trim() || null;

      imported.push(student);
    });

    if (imported.length === 0) {
      setStatus("CSV import finished but no valid student rows were found.");
      renderStatus();
      return;
    }

    if (state.students.length > 0) {
      const replace = window.confirm("Replace current student roster with imported CSV data?");
      if (!replace) return;
    }

    state.students = imported;
    state.ui.selectedStudentId = state.students[0]?.id || null;
    state.plan = deepClone(DEFAULT_PLAN);

    reconcileReferences();
    persistState();
    renderAll();

    setStatus(`Imported ${imported.length} students from CSV.`);
    renderStatus();
  }

  function exportCsv() {
    const headers = [
      "name",
      "priorityLevel",
      "cannotSitNextTo",
      "cannotSitNear",
      "worksWellWith",
      "mustBeInZone",
      "mustBeInRowRange",
      "needsAccessibilitySeat",
      "preferNearTeacher",
      "preferGroup",
      "lockToSeat"
    ];

    const idToName = new Map(state.students.map((s) => [s.id, s.name]));

    const rows = state.students.map((student) => {
      const nextTo = student.raw.cannotSitNextTo || student.hard.cannotSitNextTo.map((id) => idToName.get(id) || "").filter(Boolean).join("|");
      const near = student.raw.cannotSitNear || student.hard.cannotSitNear.map((id) => idToName.get(id) || "").filter(Boolean).join("|");
      const works = student.raw.worksWellWith || student.soft.worksWellWith.map((id) => idToName.get(id) || "").filter(Boolean).join("|");

      return {
        name: student.name,
        priorityLevel: student.priorityLevel,
        cannotSitNextTo: nextTo,
        cannotSitNear: near,
        worksWellWith: works,
        mustBeInZone: student.hard.mustBeInZone || "",
        mustBeInRowRange: rowRangeToText(student.hard.mustBeInRowRange),
        needsAccessibilitySeat: String(!!student.hard.needsAccessibilitySeat),
        preferNearTeacher: String(!!student.soft.preferNearTeacher),
        preferGroup: student.soft.preferGroup || "",
        lockToSeat: student.hard.lockToSeat || ""
      };
    });

    const csv = stringifyCsv(headers, rows);
    downloadFile("students-export.csv", csv, "text/csv;charset=utf-8");

    setStatus("Exported CSV for current roster and constraints.");
    renderStatus();
  }

  function parseCsv(text) {
    const lines = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = parseCsvLine(lines[0]).map((h) => normalizeHeader(h));
    const rows = [];

    for (let i = 1; i < lines.length; i += 1) {
      const values = parseCsvLine(lines[i]);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] != null ? values[index].trim() : "";
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  function parseCsvLine(line) {
    const out = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        out.push(current);
        current = "";
        continue;
      }

      current += ch;
    }

    out.push(current);
    return out;
  }

  function stringifyCsv(headers, rows) {
    const headerLine = headers.join(",");
    const body = rows.map((row) => headers.map((h) => escapeCsvValue(row[h] ?? "")).join(",")).join("\n");
    return `${headerLine}\n${body}`;
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function normalizeHeader(header) {
    const h = String(header || "").trim();
    const lower = h.toLowerCase();

    const aliases = {
      name: "name",
      prioritylevel: "priorityLevel",
      cannotsitnextto: "cannotSitNextTo",
      cannotsitnear: "cannotSitNear",
      workswellwith: "worksWellWith",
      mustbeinzone: "mustBeInZone",
      mustbeinrowrange: "mustBeInRowRange",
      needsaccessibilityseat: "needsAccessibilitySeat",
      prefernearteacher: "preferNearTeacher",
      prefergroup: "preferGroup",
      locktoseat: "lockToSeat"
    };

    return aliases[lower.replace(/[^a-z]/g, "")] || h;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function parseBoolean(value) {
    const text = String(value || "").trim().toLowerCase();
    return text === "true" || text === "1" || text === "yes" || text === "y";
  }

  function normalizeZone(value) {
    const text = String(value || "").trim().toLowerCase();
    if (text === "front") return "Front";
    if (text === "middle") return "Middle";
    if (text === "back") return "Back";
    return null;
  }

  function persistState() {
    localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(state.students));
    localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(state.layout));
    localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(state.plan));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  }

  function loadState() {
    state.students = safeReadJson(STORAGE_KEYS.students, []);
    state.layout = { ...DEFAULT_LAYOUT, ...safeReadJson(STORAGE_KEYS.layout, {}) };
    state.plan = { ...deepClone(DEFAULT_PLAN), ...safeReadJson(STORAGE_KEYS.plan, {}) };
    state.settings = { ...DEFAULT_SETTINGS, ...safeReadJson(STORAGE_KEYS.settings, {}) };

    state.students = state.students.map((item) => hydrateStudent(item));
  }

  function resetAllData() {
    localStorage.removeItem(STORAGE_KEYS.students);
    localStorage.removeItem(STORAGE_KEYS.layout);
    localStorage.removeItem(STORAGE_KEYS.plan);
    localStorage.removeItem(STORAGE_KEYS.settings);

    state.students = getSeedStudents();
    state.layout = { ...DEFAULT_LAYOUT };
    state.settings = { ...DEFAULT_SETTINGS };
    state.plan = deepClone(DEFAULT_PLAN);
    state.ui.selectedStudentId = state.students[0]?.id || null;

    reconcileReferences();
    persistState();
    renderAll();

    setStatus("Reset complete.");
    renderStatus();
  }

  function safeReadJson(key, fallback) {
    try {
      const text = localStorage.getItem(key);
      if (!text) return fallback;
      return JSON.parse(text);
    } catch (_err) {
      return fallback;
    }
  }

  function createStudent(name) {
    return {
      id: makeId(),
      name: name || "Unnamed",
      priorityLevel: 1,
      raw: {
        cannotSitNextTo: "",
        cannotSitNear: "",
        worksWellWith: ""
      },
      hard: {
        cannotSitNextTo: [],
        cannotSitNear: [],
        mustBeInZone: null,
        mustBeInRowRange: null,
        needsAccessibilitySeat: false,
        lockToSeat: null
      },
      soft: {
        worksWellWith: [],
        preferNearTeacher: false,
        preferGroup: null
      }
    };
  }

  function hydrateStudent(raw) {
    const student = createStudent(raw?.name || "Unnamed");
    student.id = raw?.id || makeId();
    student.priorityLevel = clamp(toInt(raw?.priorityLevel, 1), 1, 3);

    student.raw.cannotSitNextTo = raw?.raw?.cannotSitNextTo || raw?.cannotSitNextTo || "";
    student.raw.cannotSitNear = raw?.raw?.cannotSitNear || raw?.cannotSitNear || "";
    student.raw.worksWellWith = raw?.raw?.worksWellWith || raw?.worksWellWith || "";

    student.hard.mustBeInZone = normalizeZone(raw?.hard?.mustBeInZone || raw?.mustBeInZone);
    student.hard.mustBeInRowRange = Array.isArray(raw?.hard?.mustBeInRowRange)
      ? raw.hard.mustBeInRowRange
      : parseRowRange(raw?.mustBeInRowRange || "");

    student.hard.needsAccessibilitySeat = !!(raw?.hard?.needsAccessibilitySeat || raw?.needsAccessibilitySeat);
    student.hard.lockToSeat = (raw?.hard?.lockToSeat || raw?.lockToSeat || "").toUpperCase() || null;

    student.soft.preferNearTeacher = !!(raw?.soft?.preferNearTeacher || raw?.preferNearTeacher);
    student.soft.preferGroup = raw?.soft?.preferGroup || raw?.preferGroup || null;

    return student;
  }

  function getSeedStudents() {
    return [
      createStudent("Alex"),
      createStudent("Sam"),
      createStudent("Jordan"),
      createStudent("Taylor"),
      createStudent("Riley"),
      createStudent("Morgan")
    ].map((student, idx) => {
      student.priorityLevel = idx < 2 ? 3 : 1;
      return student;
    });
  }

  function setStatus(text) {
    state.ui.statusText = text;
  }

  function createSeededRng(seed) {
    let t = seed >>> 0;
    return function rng() {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleArray(list, rng) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function dedupe(arr) {
    return Array.from(new Set(arr || []));
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toInt(value, fallback) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `id-${Math.random().toString(36).slice(2, 10)}`;
  }
})();
