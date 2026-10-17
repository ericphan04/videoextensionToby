(function (root) {
  "use strict";
  root.TrackerRegenProjection = {
    batchJobs(jobs) {
      const ownerIds = new Set(
        (jobs || [])
          .filter((job) => job.owner === "prompts" && job.regenDisplay?.jobId)
          .map((job) => job.regenDisplay.jobId),
      );
      if (!ownerIds.size) return jobs || [];
      const linked = jobs.filter(
        (job) =>
          job.owner === "prompts" &&
          (ownerIds.has(job.id) || ownerIds.has(job.regenDisplay?.jobId)),
      );
      const linkedIds = new Set(linked.map((job) => job.id));
      const projected = this.jobs(linked);
      const byId = new Map(projected.map((job) => [job.id, job]));
      const emitted = new Set();
      const result = [];
      for (const job of jobs) {
        if (!linkedIds.has(job.id)) {
          result.push(job);
          continue;
        }
        const display = byId.get(job.id);
        if (display && !emitted.has(display.id)) {
          result.push(display);
          emitted.add(display.id);
        }
      }
      for (const job of projected) if (!emitted.has(job.id)) result.push(job);
      return result;
    },
    jobs(jobs) {
      jobs = (jobs || []).map((job) => ({
        ...job,
        items: (job.items || []).map((item) =>
          item.state === "RECOVERY_REQUIRED" &&
          item.error === "REGEN_LIVE_SNAPSHOT_MISSING"
            ? {
                ...item,
                state: "FAILED",
                providerGenerationState: null,
                _regenOptimistic: false,
                recoveryExhausted: true,
                recoveryLabel: null,
                statusLabel: null,
                statusKind: "unverified",
                operationId: null,
                flowOperationId: null,
                flowApiLineage: [],
                flowApiAccepted: false,
                hasFlowOperationId: false,
              }
            : item,
        ),
      }));
      const entries = new Map(),
        slots = new Map();
      for (const job of jobs || [])
        for (const [index, item] of (job.items || []).entries()) {
          if (!item?.id) continue;
          const prior = entries.get(item.id);
          if (
            !prior ||
            Number(item.createdAt || 0) >= Number(prior.item.createdAt || 0)
          )
            entries.set(item.id, { item, job });
        }
      const keyOf = (item) => {
        let key = item._regenSlotRoot || item.regenOf || item.id;
        const seen = new Set([item.id]);
        while (entries.has(key) && !seen.has(key)) {
          seen.add(key);
          const parent = entries.get(key).item;
          const next = parent._regenSlotRoot || parent.regenOf;
          if (!next || next === key) break;
          key = next;
        }
        return key;
      };
      for (const job of jobs || [])
        for (const [index, item] of (job.items || []).entries()) {
          if (!item?.id) continue;
          const key = keyOf(item),
            slot = slots.get(key);
          if (!slot)
            slots.set(key, {
              job,
              index,
              source: item,
              winner: entries.get(item.id),
              key,
            });
          else {
            if (item.id === key) {
              slot.job = job;
              slot.index = index;
              slot.source = item;
            }
            if (
              Number(item.createdAt || 0) >=
              Number(slot.winner.item.createdAt || 0)
            )
              slot.winner = entries.get(item.id);
          }
        }
      const outputJobs = [...(jobs || [])],
        jobsById = new Map(outputJobs.map((job) => [job.id, job]));
      const syntheticOwners = new Map();
      for (const slot of slots.values()) {
        const display = slot.winner.job?.regenDisplay || slot.job?.regenDisplay;
        if (!display?.jobId) continue;
        let owner = jobsById.get(display.jobId);
        if (!owner) {
          owner = syntheticOwners.get(display.jobId);
          if (!owner) {
            owner = {
              ...slot.job,
              id: display.jobId,
              sessionId: display.sessionId || slot.job.sessionId,
              label: display.label || slot.job.label,
              owner: display.owner || slot.job.owner,
              startedAt: display.startedAt || slot.job.startedAt,
              _regenDisplaySynthetic: true,
            };
            syntheticOwners.set(display.jobId, owner);
            outputJobs.push(owner);
          }
        }
        const ownerIndex = (owner.items || []).findIndex(
          (item) => keyOf(item) === slot.key,
        );
        if (ownerIndex >= 0) {
          slot.index = ownerIndex;
          slot.source = owner.items[ownerIndex];
        }
        slot.job = owner;
      }
      return outputJobs
        .map((job) => {
          const owned = [...slots.values()]
            .filter((slot) => slot.job === job)
            .sort((a, b) => a.index - b.index);
          if (!owned.length) return null;
          const items = owned.map((slot) => ({
            ...slot.winner.item,
            promptIndex:
              slot.source.promptIndex ??
              slot.winner.item.promptIndex ??
              slot.index,
            ...(slot.winner.item.id !== slot.key
              ? {
                  _regenSlotRoot: slot.key,
                  _regenExecutionJobId:
                    slot.winner.item._regenExecutionJobId || slot.winner.job.id,
                }
              : {}),
          }));
          const recoverableApi = (item) =>
            item?.state === "RECOVERY_REQUIRED" &&
            item.genMode === "api" &&
            item.recoveryExhausted !== true &&
            (item.flowApiAccepted === true ||
              !!item.operationId ||
              !!item.flowOperationId ||
              item.hasFlowOperationId === true);
          const isActive = (slot) =>
            [
              "PENDING",
              "SUBMITTING",
              "SUBMITTED",
              "MONITORING",
              "RETRY_SUBMIT",
              "WAITING_USER",
              "WAITING_PROVIDER",
              "WAITING_DEPENDENCY",
            ].includes(slot.winner.item.state) ||
            recoverableApi(slot.winner.item);
          const manualAttempt = job.manualRegenItemId
            ? owned.find(
                (slot) =>
                  slot.winner.item.id === job.manualRegenItemId &&
                  isActive(slot),
              )
            : null;
          const active = manualAttempt || owned.find(isActive);
          const winnerJobs = owned.map((slot) => slot.winner.job);
          const terminalStatus = winnerJobs.some(
            (winnerJob) => winnerJob.status === "stopped",
          )
            ? "stopped"
            : winnerJobs.some((winnerJob) => winnerJob.status === "failed")
              ? "failed"
              : "completed";
          const completedAt = Math.max(
            0,
            ...owned.map((slot) =>
              Number(
                slot.winner.item.completedAt ||
                  slot.winner.job.completedAt ||
                  0,
              ),
            ),
          );
          const completed = items.filter((item) =>
            ["COMPLETED", "PARTIAL_FAIL"].includes(item.state),
          ).length;
          const failed = items.filter(
            (item) =>
              [
                "FAILED",
                "PARTIAL_FAIL",
                "BLOCKED",
                "RECOVERY_REQUIRED",
              ].includes(item.state) && !recoverableApi(item),
          ).length;
          const manualJobId =
            manualAttempt?.winner.item._regenExecutionJobId ||
            manualAttempt?.winner.job.id;
          const manualStatus = manualAttempt
            ? manualAttempt.winner.job === job
              ? job.manualRegenStatus
              : manualAttempt.winner.job.status
            : null;
          const modes = new Set(
            [job.modeType, ...items.map((item) => item.genMode)].filter(
              (mode) => mode === "web" || mode === "api",
            ),
          );
          return {
            ...job,
            items,
            total: items.length,
            totalExpected: items.length,
            completed,
            completedCount: completed,
            failed,
            failedCount: failed,
            modeType: modes.size > 1 ? "mixed" : job.modeType,
            manualRegenActive: !!manualAttempt,
            manualRegenJobId: manualAttempt ? manualJobId : null,
            manualRegenStatus: manualStatus,
            ...(active
              ? {
                  status: manualAttempt
                    ? job.status
                    : active.winner.job.status === "paused"
                      ? "paused"
                      : "running",
                  completedAt: null,
                  pauseReason: manualAttempt
                    ? job.pauseReason || null
                    : active.winner.job.pauseReason || null,
                  executionJobId: manualAttempt
                    ? job.id
                    : active.winner.item._regenExecutionJobId ||
                      active.winner.job.id,
                }
              : {
                  status: terminalStatus,
                  completedAt: completedAt || job.completedAt || null,
                  pauseReason: null,
                  executionJobId: null,
                }),
          };
        })
        .filter(Boolean);
    },
  };
})(typeof window !== "undefined" ? window : self);
