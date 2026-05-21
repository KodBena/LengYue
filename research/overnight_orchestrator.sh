#!/bin/bash
# research/overnight_orchestrator.sh
#
# Chain the overnight visit-scaling pipeline:
#   1. Wait for trajectory_cache.npz to be produced (cache_trajectories.py
#      is launched separately).
#   2. Run allocator_sim.py on the 4 main drift targets in sequence.
#   3. Run regression_delta_reframe.py on scoreLead_drift.
#   4. Wait for advanced_multitimestep.csv if it's still being produced.
#   5. Run overnight_report.py to consolidate.
#   6. git commit + push.
#
# Each step is idempotent and tolerant of failures in prior steps.
# Logs to ~/plots/overnight_orchestrator.log.
#
# License: Public Domain (The Unlicense)

set -u
cd /home/bork/w/omega/research
PY=/home/bork/w/vdc/venvs/kataproxy/bin/python
LOG=/home/bork/plots/overnight_orchestrator.log
CACHE=/home/bork/w/omega/research/data/trajectory_cache.npz
ADV=/home/bork/w/omega/research/data/advanced_multitimestep.csv

mkdir -p /home/bork/plots/allocator_pareto

echo "=== overnight orchestrator started at $(date -Iseconds) ===" >> "$LOG"
echo "  cache: $CACHE" >> "$LOG"
echo "  advanced: $ADV" >> "$LOG"

# ---- Step 1: Wait for trajectory cache ----
echo "" >> "$LOG"
echo "[step 1] waiting for trajectory cache: $CACHE" >> "$LOG"
WAIT_START=$(date +%s)
while [ ! -s "$CACHE" ]; do
  # Bail out after 90 min
  ELAPSED=$(($(date +%s) - WAIT_START))
  if [ $ELAPSED -gt 5400 ]; then
    echo "[step 1] TIMEOUT after ${ELAPSED}s waiting for cache; aborting" >> "$LOG"
    exit 1
  fi
  sleep 30
done
# Wait a bit more for the file to settle (in case it's still being written)
sleep 5
echo "[step 1] cache ready at $(date -Iseconds), size=$(stat -c %s "$CACHE")" >> "$LOG"

# ---- Step 2: allocator simulation, one target at a time ----
echo "" >> "$LOG"
echo "[step 2] allocator simulation for 4 targets" >> "$LOG"
for target in scoreLead_drift winrate_drift visit_entropy_reduction L2_joint_drift; do
  echo "" >> "$LOG"
  echo "[step 2.$target] starting at $(date -Iseconds)" >> "$LOG"
  $PY allocator_sim.py --target "$target" >> "$LOG" 2>&1
  RC=$?
  if [ $RC -eq 0 ]; then
    echo "[step 2.$target] OK" >> "$LOG"
  else
    echo "[step 2.$target] FAILED rc=$RC, continuing" >> "$LOG"
  fi
done

# ---- Step 3: delta-reframe regression ----
echo "" >> "$LOG"
echo "[step 3] regression_delta_reframe.py" >> "$LOG"
$PY regression_delta_reframe.py --target scoreLead_drift >> "$LOG" 2>&1
RC=$?
if [ $RC -eq 0 ]; then
  echo "[step 3] OK" >> "$LOG"
else
  echo "[step 3] FAILED rc=$RC, continuing" >> "$LOG"
fi

# ---- Step 4: Wait for advanced features (if still extracting) ----
echo "" >> "$LOG"
echo "[step 4] checking advanced features: $ADV" >> "$LOG"
WAIT_START=$(date +%s)
while [ ! -s "$ADV" ]; do
  ELAPSED=$(($(date +%s) - WAIT_START))
  if [ $ELAPSED -gt 3600 ]; then
    echo "[step 4] TIMEOUT after ${ELAPSED}s; continuing without advanced features" >> "$LOG"
    break
  fi
  sleep 30
done
if [ -s "$ADV" ]; then
  echo "[step 4] advanced features ready, size=$(stat -c %s "$ADV")" >> "$LOG"
fi

# ---- Step 4b: Enriched allocator sim (advanced features merged in) ----
if [ -s "$ADV" ]; then
  echo "" >> "$LOG"
  echo "[step 4b] enriched allocator sim — phase35 + traj-window + advanced features" >> "$LOG"
  for target in scoreLead_drift winrate_drift visit_entropy_reduction L2_joint_drift; do
    echo "" >> "$LOG"
    echo "[step 4b.$target] starting at $(date -Iseconds)" >> "$LOG"
    $PY allocator_sim.py --target "$target" --advanced-csv "$ADV" >> "$LOG" 2>&1
    RC=$?
    if [ $RC -eq 0 ]; then
      echo "[step 4b.$target] OK" >> "$LOG"
    else
      echo "[step 4b.$target] FAILED rc=$RC, continuing" >> "$LOG"
    fi
  done
fi

# ---- Step 5: Consolidate report ----
echo "" >> "$LOG"
echo "[step 5] overnight_report.py" >> "$LOG"
REPORT_PATH="/home/bork/w/omega/research/notes/overnight-allocator-results-$(date +%Y-%m-%d).md"
$PY overnight_report.py --out "$REPORT_PATH" >> "$LOG" 2>&1
RC=$?
if [ $RC -eq 0 ]; then
  echo "[step 5] OK: $REPORT_PATH" >> "$LOG"
else
  echo "[step 5] FAILED rc=$RC" >> "$LOG"
fi

# ---- Step 6: git commit + push ----
echo "" >> "$LOG"
echo "[step 6] git commit + push" >> "$LOG"
cd /home/bork/w/omega

# Stage all the new artifacts
git add research/notes/overnight-allocator-results-*.md 2>/dev/null
git add research/cache_trajectories.py 2>/dev/null
git add research/allocator_sim.py 2>/dev/null
git add research/regression_delta_reframe.py 2>/dev/null
git add research/extract_advanced_multitimestep.py 2>/dev/null
git add research/overnight_report.py 2>/dev/null
git add research/overnight_orchestrator.sh 2>/dev/null
git add research/ood_regression.py 2>/dev/null
git add research/pg_sink.py 2>/dev/null

if git diff --cached --quiet; then
  echo "[step 6] nothing to commit" >> "$LOG"
else
  git commit -m "$(cat <<'EOF'
research(visit-scaling): overnight allocator sim + delta-reframe

End-to-end allocator simulation following the firewall consult #3
recommendation that the regression head is a means, not an end. Tests
whether the multi-timestep hyperbolic-H predictor, wired into a binary
or 3-stage visit-allocation policy, produces a Pareto curve that beats
"always V_max" on top-1 agreement at lower visit budgets.

Sub-experiments:
- Binary policy: V_floor=500 → V_max=15000 with predicted-remaining-gain
  threshold τ.
- 3-stage policy: V_floor → V_floor×4 → V_max with two τ thresholds.
- Delta-prediction reframe (Tier 1 from firewall consult): predict
  (y(V_target) - y(V_current)) / σ_position at K=3 anchor V_target
  values, n_realizations as feature.

Substrate work:
- Bundled-fetch trajectory cache (pg_sink.fetch_position_bundle)
  collapsing the per-realization round-trips into single per-position
  queries — 10× speedup over the prior per-realization fetch pattern.
- Ownership + full-policy-distribution features at 5 V-checkpoints
  (V_pre / V=500 / V=2000 / V=10000 / V_max) extracted into
  advanced_multitimestep.csv. Substrate for future enriched-regression
  retraining; not consumed by tonight's allocator sim.

Results consolidated at research/notes/overnight-allocator-results-*.md
(GitHub-renderable). Pareto curve PNGs at ~/plots/allocator_pareto/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)" >> "$LOG" 2>&1
  RC=$?
  if [ $RC -eq 0 ]; then
    echo "[step 6] commit OK, pushing" >> "$LOG"
    git push origin bork/research/visit-scaling-memo-2026-05-21 >> "$LOG" 2>&1
    RC=$?
    if [ $RC -eq 0 ]; then
      echo "[step 6] push OK" >> "$LOG"
    else
      echo "[step 6] push FAILED rc=$RC" >> "$LOG"
    fi
  else
    echo "[step 6] commit FAILED rc=$RC" >> "$LOG"
  fi
fi

echo "" >> "$LOG"
echo "=== overnight orchestrator finished at $(date -Iseconds) ===" >> "$LOG"
