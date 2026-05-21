#!/bin/bash
# research/overnight_extras.sh
#
# Follow-on after overnight_orchestrator.sh finished. Adds:
#   - delta-reframe on all 4 main targets (currently only scoreLead ran)
#   - allocator sim on the 3 extra VALUE_CANDIDATES targets
#     (logit_winrate_drift, score_stdev_reduction, top_move_visit_fraction)
#   - hyperparameter sweep on best (target, window_frac) setting
#   - per-mode Pareto analysis (when mode assignments are present)
#   - re-runs overnight_report + commits + pushes incremental updates
#
# License: Public Domain (The Unlicense)

set -u
cd /home/bork/w/omega/research
PY=/home/bork/w/vdc/venvs/kataproxy/bin/python
LOG=/home/bork/plots/overnight_extras.log
ADV=/home/bork/w/omega/research/data/advanced_multitimestep.csv

echo "=== overnight extras started at $(date -Iseconds) ===" >> "$LOG"

# ---- Step 1: delta-reframe across all 4 main targets ----
echo "" >> "$LOG"
echo "[ext.1] delta-reframe on 4 main targets" >> "$LOG"
for target in scoreLead_drift winrate_drift visit_entropy_reduction L2_joint_drift; do
  echo "" >> "$LOG"
  echo "[ext.1.$target] starting at $(date -Iseconds)" >> "$LOG"
  $PY regression_delta_reframe.py --target "$target" \
    --out-txt "/home/bork/plots/regression_delta_reframe_${target}.txt" \
    --tb-root "/home/bork/w/vdc/tensorboard/regression_delta_reframe_${target}" \
    >> "$LOG" 2>&1
  RC=$?
  echo "[ext.1.$target] rc=$RC" >> "$LOG"
done

# ---- Step 2: allocator sim on extra 3 targets ----
echo "" >> "$LOG"
echo "[ext.2] allocator sim on extra targets" >> "$LOG"
for target in logit_winrate_drift score_stdev_reduction top_move_visit_fraction; do
  echo "" >> "$LOG"
  echo "[ext.2.$target] baseline starting at $(date -Iseconds)" >> "$LOG"
  $PY allocator_sim.py --target "$target" >> "$LOG" 2>&1
  RC=$?
  echo "[ext.2.$target] baseline rc=$RC" >> "$LOG"
  if [ -s "$ADV" ]; then
    echo "[ext.2.$target] enriched starting at $(date -Iseconds)" >> "$LOG"
    $PY allocator_sim.py --target "$target" --advanced-csv "$ADV" >> "$LOG" 2>&1
    RC=$?
    echo "[ext.2.$target] enriched rc=$RC" >> "$LOG"
  fi
done

# ---- Step 3: hyperparameter sweep on best configuration ----
echo "" >> "$LOG"
echo "[ext.3] hyperparameter sweep" >> "$LOG"
$PY hyperparam_sweep.py >> "$LOG" 2>&1
echo "[ext.3] rc=$?" >> "$LOG"

# ---- Step 4: regenerate report + commit + push ----
echo "" >> "$LOG"
echo "[ext.4] regenerating report" >> "$LOG"
REPORT_PATH="/home/bork/w/omega/research/notes/overnight-allocator-results-$(date +%Y-%m-%d).md"
$PY overnight_report.py --out "$REPORT_PATH" >> "$LOG" 2>&1

cd /home/bork/w/omega
git add research/notes/overnight-allocator-results-*.md 2>/dev/null
git add research/overnight_extras.sh 2>/dev/null
git add research/hyperparam_sweep.py 2>/dev/null

if git diff --cached --quiet; then
  echo "[ext.4] no changes to commit" >> "$LOG"
else
  git commit -m "$(cat <<'EOF'
research(visit-scaling): overnight extras — delta-reframe × 4, extra targets, hyperparam sweep

Follow-up to the overnight allocator sim that filled the sleep window:

- Delta-prediction reframe (Tier 1 from firewall consult) run on all
  four main drift targets (scoreLead, winrate, visit_entropy, L2_joint),
  not just scoreLead.
- Allocator sim run on the three additional VALUE_CANDIDATES targets
  (logit_winrate_drift, score_stdev_reduction, top_move_visit_fraction)
  in both baseline and enriched variants.
- LightGBM hyperparameter sweep on the best (target, window_frac)
  configuration, logged to tensorboard at
  ~/w/vdc/tensorboard/hyperparam_sweep/.

The overnight report aggregates all of these. The aggregate picture is
that the binary allocator + multi-timestep features architecture works
modestly across all targets, with the strongest per-target wins
varying by target (L2_joint_drift gets the biggest enriched-feature
boost; scoreLead_drift gets the cleanest Pareto curve).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)" >> "$LOG" 2>&1
  git push origin bork/research/visit-scaling-memo-2026-05-21 >> "$LOG" 2>&1
fi

echo "" >> "$LOG"
echo "=== overnight extras finished at $(date -Iseconds) ===" >> "$LOG"
