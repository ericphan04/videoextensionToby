(() => {
  "use strict";
  let databaseFlight = null;
  let creationFlight = null;
  const stagingFlights = new Map();
  const fail = (code) => Object.assign(new Error(code), { code });
  const hex = (bytes) =>
    Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  async function database() {
    if (!databaseFlight)
      databaseFlight = new Promise((resolve, reject) => {
        const request = indexedDB.open("tobyflow_device_identity", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("keys", { keyPath: "id" });
        request.onerror = () => reject(fail("LOCAL_KEY_UNAVAILABLE"));
        request.onblocked = () => reject(fail("LOCAL_KEY_UNAVAILABLE"));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            databaseFlight = null;
          };
          resolve(db);
        };
      }).catch((error) => {
        databaseFlight = null;
        throw error;
      });
    return databaseFlight;
  }
  async function transaction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("keys", mode);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(fail("LOCAL_KEY_UNAVAILABLE"));
      try {
        operation(tx.objectStore("keys"), (next) => {
          value = next;
        });
      } catch (_) {
        tx.abort();
      }
    });
  }
  async function get(id = "current") {
    return transaction("readonly", (store, done) => {
      const read = store.get(id);
      read.onsuccess = () => done(read.result || null);
    });
  }
  async function put(record) {
    await transaction("readwrite", (store) => store.put(record));
    return record;
  }
  async function generate(id, clientId) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    );
    const der = await crypto.subtle.exportKey("spki", pair.publicKey);
    return {
      id,
      client_id: clientId,
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      public_key_spki: base64(der),
      key_id: hex(await crypto.subtle.digest("SHA-256", der)),
      key_revision: 0,
      bootstrap: null,
    };
  }
  async function ensure(clientId) {
    if (!clientId) throw fail("ENROLLMENT_REQUIRED");
    if (!creationFlight)
      creationFlight = (async () => {
        const existing = await get();
        if (existing) {
          if (existing.client_id !== clientId) throw fail("KEY_MISMATCH");
          if (
            !existing.privateKey ||
            existing.privateKey.extractable ||
            existing.privateKey.type !== "private"
          ) {
            throw fail("KEY_MISSING");
          }
          return existing;
        }
        return put(await generate("current", clientId));
      })().finally(() => {
        creationFlight = null;
      });
    const result = await creationFlight;
    if (result.client_id !== clientId) throw fail("KEY_MISMATCH");
    return result;
  }
  async function reconcile(clientId, status, bootstrap) {
    if (status.revoked) throw fail("DEVICE_KEY_REVOKED");
    if (!status.registered) await ensure(clientId);
    const result = await transaction("readwrite", (store, done) => {
      const readCurrent = store.get("current");
      const readPending = store.get("pending_rotation");
      let reads = 0;
      const finish = () => {
        if (++reads !== 2) return;
        try {
          let current = readCurrent.result;
          const pending = readPending.result;
          if (
            current?.client_id === clientId &&
            current.key_revision > (status.registered ? status.key_revision : 0)
          ) {
            throw fail("CONFIG_SCOPE_CHANGED");
          }
          const promote =
            status.registered &&
            pending?.client_id === clientId &&
            pending.key_id === status.key_id;
          if (promote) current = pending;
          if (
            status.registered &&
            (!current ||
              current.client_id !== clientId ||
              current.key_id !== status.key_id)
          ) {
            throw fail(current ? "KEY_MISMATCH" : "KEY_MISSING");
          }
          if (
            !current ||
            !current.privateKey ||
            current.privateKey.extractable ||
            current.privateKey.type !== "private"
          )
            throw fail("KEY_MISSING");
          if (current.client_id !== clientId) throw fail("KEY_MISMATCH");
          const record = {
            ...current,
            id: "current",
            bootstrap,
            key_revision: status.registered ? status.key_revision : 0,
          };
          store.put(record);
          if (promote) store.delete("pending_rotation");
          done({ record });
        } catch (error) {
          done({ error });
        }
      };
      readCurrent.onsuccess = readPending.onsuccess = finish;
    });
    if (result.error) throw result.error;
    return result.record;
  }
  function stageOnce(id, operation) {
    if (stagingFlights.has(id)) return stagingFlights.get(id);
    const flight = operation();
    stagingFlights.set(id, flight);
    return flight.finally(() => {
      if (stagingFlights.get(id) === flight) stagingFlights.delete(id);
    });
  }
  function stageRotation(clientId) {
    return stageOnce("pending_rotation", () => createRotation(clientId));
  }
  async function createRotation(clientId) {
    const current = await get();
    if (!current || current.client_id !== clientId || current.key_revision < 1)
      throw fail("KEY_MISSING");
    const pending = await get("pending_rotation");
    if (pending) {
      if (pending.client_id !== clientId) throw fail("KEY_MISMATCH");
      return pending;
    }
    return put(await generate("pending_rotation", clientId));
  }
  function stageReplacement(retryOrphan = false) {
    return stageOnce("pending_replacement", () =>
      createReplacement(retryOrphan),
    );
  }
  async function createReplacement(retryOrphan = false) {
    const existing = await get("pending_replacement");
    if (
      existing &&
      !(retryOrphan && existing.request_sent && !existing.enrollment)
    )
      return existing;
    const record = await generate("pending_replacement", null);
    record.device_fingerprint = crypto.randomUUID();
    record.enrollment = null;
    record.request_sent = false;
    return put(record);
  }
  async function commitReplacement(enrollment) {
    const pending = await get("pending_replacement");
    if (
      !pending ||
      !enrollment?.client_id ||
      !enrollment.secret ||
      enrollment.device_fingerprint !== pending.device_fingerprint
    )
      throw fail("KEY_MISMATCH");
    const next = {
      ...pending,
      id: "current",
      client_id: enrollment.client_id,
      enrollment,
    };
    await transaction("readwrite", (store) => {
      store.put(next);
      store.delete("pending_rotation");
      store.delete("pending_replacement");
    });
    return next;
  }
  async function recoverReplacement() {
    const record = await get();
    if (!record?.enrollment) return;
    await chrome.storage.local.set({
      toby_client_enrollment: record.enrollment,
      toby_device_fp: record.enrollment.device_fingerprint,
    });
    await transaction("readwrite", (store) => {
      const read = store.get("current");
      read.onsuccess = () => {
        const latest = read.result;
        if (
          latest?.key_id !== record.key_id ||
          latest.client_id !== record.client_id
        )
          return;
        const { enrollment, device_fingerprint, request_sent, ...settled } =
          latest;
        store.put(settled);
      };
    });
  }
  self.DeviceKeyStore = Object.freeze({
    get,
    put,
    ensure,
    reconcile,
    stageRotation,
    stageReplacement,
    commitReplacement,
    recoverReplacement,
    nonce: () => hex(crypto.getRandomValues(new Uint8Array(16))),
    sign: async (record, message) => {
      if (!record?.privateKey) throw fail("KEY_MISSING");
      const bytes = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        record.privateKey,
        new TextEncoder().encode(message),
      );
      if (bytes.byteLength !== 64) throw fail("LOCAL_KEY_UNAVAILABLE");
      return base64(bytes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    },
  });
})();
