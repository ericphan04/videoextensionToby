(() => {
  "use strict";
  const MAX_RETRIES = 3;
  let dependencies;
  let journal = null;
  let loaded = false;
  let mutations = Promise.resolve();
  let flight = null;
  const serial = (operation) => {
    const next = mutations.then(operation, operation);
    mutations = next.catch(() => {});
    return next;
  };
  async function load() {
    if (!loaded) {
      journal = await dependencies.read();
      loaded = true;
    }
  }
  async function save() {
    await dependencies.write(journal);
  }
  async function arm() {
    await dependencies.cancel();
    if (
      journal?.pending &&
      !journal.blocked &&
      journal.attempts < MAX_RETRIES
    ) {
      await dependencies.schedule(Math.max(Date.now(), journal.notBefore));
    }
  }
  function retryable(failure) {
    if (
      /^(KEY_|LOCAL_|DEVICE_KEY_|CLIENT_|ACCOUNT_|EXTENSION_DEVICE_|INVALID_DEVICE_)/.test(
        failure?.code || "",
      ) ||
      [
        "EXTENSION_NOT_AUTHORIZED",
        "LEGACY_CONTRACT_STATE_UNAVAILABLE",
      ].includes(failure?.code)
    )
      return false;
    return (
      failure?.retryable === true ||
      [
        "NETWORK_ERROR",
        "REQUEST_TIMEOUT",
        "HTTP_SERVICE_UNAVAILABLE",
        "RATE_LIMITED",
        "NETWORK_CIRCUIT_OPEN",
        "PROOF_STORE_UNAVAILABLE",
        "CONFIG_CONTRACT_UNAVAILABLE",
      ].includes(failure?.code)
    );
  }
  function admission(owner) {
    if (
      owner &&
      journal?.owner === owner &&
      journal.pending &&
      !journal.blocked &&
      ((!flight && journal.attempts >= MAX_RETRIES) ||
        journal.notBefore > Date.now())
    ) {
      return {
        allowed: false,
        code: journal.code,
        httpStatus: 503,
        retryable: true,
        recoveryDeferred: true,
        retryAfterMs: Math.max(0, (journal.notBefore || 0) - Date.now()),
      };
    }
    return { allowed: true };
  }
  async function failed(failure, needsClaim = false) {
    if (failure?.recoveryDeferred || failure?.code === "CONFIG_SCOPE_CHANGED")
      return;
    return serial(async () => {
      await load();
      const owner = await dependencies.owner();
      if (!owner || (failure?.owner && failure.owner !== owner)) return;
      if (!journal || journal.owner !== owner)
        journal = {
          owner,
          attempts: 0,
          pending: false,
          blocked: false,
          needsClaim: false,
        };
      if (
        failure?.code === "DEVICE_UNREGISTERED" &&
        journal.pending &&
        journal.needsClaim
      )
        return;
      if (
        needsClaim &&
        retryable(failure) &&
        journal.code === "DEVICE_UNREGISTERED"
      )
        journal.blocked = false;
      if (!retryable(failure)) {
        journal = {
          ...journal,
          pending: false,
          blocked: true,
          needsClaim: journal.needsClaim || needsClaim,
          code: failure?.code || "CONFIG_ACCESS_REQUIRED",
        };
      } else {
        const delay = 2e3 * 2 ** journal.attempts * (1 + Math.random() * 0.2);
        const backoffAt =
          journal.pending && journal.notBefore > Date.now()
            ? journal.notBefore
            : Date.now() + delay;
        journal = {
          ...journal,
          pending: true,
          blocked: false,
          code: failure.code,
          needsClaim: journal.needsClaim || needsClaim,
          uncertainClaim:
            journal.uncertainClaim ||
            (needsClaim && failure.endpoint === "extension-devices/claim"),
          cooldownUntil: Math.max(
            journal.cooldownUntil || 0,
            Date.now() + (failure.retryAfterMs || 0),
          ),
          notBefore: Math.max(
            backoffAt,
            Date.now() + (failure.retryAfterMs || 0),
          ),
        };
      }
      await save();
      if (!flight) await arm();
    });
  }
  async function claimed(owner) {
    return serial(async () => {
      await load();
      if (journal?.owner === owner) {
        journal.needsClaim = false;
        journal.uncertainClaim = false;
        if (journal.code === "DEVICE_UNREGISTERED") journal.blocked = false;
        await save();
      }
    });
  }
  async function authorized(owner) {
    return serial(async () => {
      await load();
      if (journal?.owner === owner && journal.blocked) {
        journal = null;
        await save();
        await dependencies.cancel();
      }
    });
  }
  async function reset() {
    return serial(async () => {
      await load();
      journal = null;
      await save();
      await dependencies.cancel();
    });
  }
  async function restore() {
    return serial(async () => {
      await load();
      if (journal && journal.owner !== (await dependencies.owner()))
        journal = null;
      await save();
      await arm();
    });
  }
  function run(trigger = "alarm") {
    if (flight) return flight;
    const task = runOnce(trigger).finally(async () => {
      await serial(async () => {
        if (journal?.owner === (await dependencies.owner())) await arm();
      });
      if (flight === task) flight = null;
    });
    flight = task;
    return task;
  }
  async function runOnce(trigger) {
    let attempt;
    await serial(async () => {
      await load();
      const owner = await dependencies.owner();
      if (!journal || journal.owner !== owner) {
        if (!journal && owner && trigger === "manual")
          attempt = { owner, idle: true };
        return;
      }
      if (
        trigger === "manual" &&
        journal.blocked &&
        ["LOCAL_KEY_UNAVAILABLE", "LOCAL_STORAGE_UNAVAILABLE"].includes(
          journal.code,
        )
      ) {
        journal.pending = true;
        journal.blocked = false;
      }
      if (!journal.pending || journal.blocked) return;
      if (
        trigger === "manual" ||
        (trigger === "online" && Date.now() - (journal.lastOnline || 0) >= 3e4)
      ) {
        journal.attempts = 0;
        journal.notBefore = journal.cooldownUntil || 0;
        if (trigger === "online") journal.lastOnline = Date.now();
      }
      const admission2 = dependencies.admit();
      journal.notBefore = Math.max(
        journal.notBefore || 0,
        Date.now() + (admission2.retryAfterMs || 0),
      );
      if (Date.now() < journal.notBefore || journal.attempts >= MAX_RETRIES) {
        await save();
        await arm();
        return;
      }
      journal.attempts++;
      journal.notBefore = 0;
      attempt = { ...journal };
      await save();
      await dependencies.cancel();
    });
    if (!attempt)
      return {
        success: false,
        error: { code: journal?.code || "CONFIG_ACCESS_REQUIRED" },
      };
    try {
      if (attempt.owner !== (await dependencies.owner()))
        return { success: false, error: { code: "CONFIG_SCOPE_CHANGED" } };
      if (attempt.needsClaim) {
        const result = await dependencies.claim(
          attempt.uncertainClaim,
          attempt.owner,
        );
        if (result.data?.registered !== true) {
          await failed({
            code: result.data?.registration_code || "DEVICE_LIMIT_REACHED",
            owner: attempt.owner,
          });
          return result;
        }
      }
      if (attempt.owner !== (await dependencies.owner()))
        return { success: false, error: { code: "CONFIG_SCOPE_CHANGED" } };
      await dependencies.prefetch();
      let completed = false;
      await serial(async () => {
        if (attempt.owner !== (await dependencies.owner())) return;
        if (
          attempt.idle
            ? journal !== null
            : journal?.owner !== attempt.owner || journal.blocked
        )
          return;
        journal = null;
        await save();
        await dependencies.cancel();
        completed = true;
      });
      if (completed) dependencies.recovered();
      return {
        success: completed,
        error: completed ? void 0 : { code: "CONFIG_SCOPE_CHANGED" },
      };
    } catch (failure) {
      await failed(Object.assign(failure, { owner: attempt.owner }));
      return {
        success: false,
        error: { code: failure.code || "CONFIG_FETCH_FAILED" },
      };
    }
  }
  self.ConfigAccessRecovery = Object.freeze({
    configure: (value) => {
      dependencies = value;
    },
    failed,
    claimed,
    authorized,
    reset,
    restore,
    run,
    retryable,
    admission,
  });
})();
