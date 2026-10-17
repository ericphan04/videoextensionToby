if (location.origin !== "https://flow.google.com") {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    respond({ success: false, error: "FLOW_LEGACY_GENERATION_DISABLED" });
    return false;
  });
} else if (self.__tobyflowContentJsLoaded__) {
} else {
  let _flowAuditIdentitySummary2 = function (value) {
      const text = String(value || "");
      if (!text) return { kind: "missing" };
      let hash = 2166136261;
      for (const char of text) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return {
        kind: /^[0-9a-f-]{36}$/i.test(text)
          ? "uuid"
          : /^[A-Za-z0-9_-]{32,1024}$/.test(text)
            ? "asb"
            : text.startsWith("upload_")
              ? "pending_upload"
              : "other",
        length: text.length,
        fingerprint: (hash >>> 0).toString(16).padStart(8, "0"),
      };
    },
    _isLabsFlowLoginLanding2 = function () {
      return (
        location.origin === "https://labs.google" &&
        location.pathname.startsWith("/fx") &&
        !/\/tools\/flow(?:\/|$)/.test(location.pathname)
      );
    },
    _verifyFlowTarget2 = function (message) {
      const live =
        globalThis.FlowDriverRegistry?.describeUrl(location.href) || null;
      _flowPageContext = live;
      const expected = message?._flowTarget;
      if (!live) return { success: false, error: "UNSUPPORTED_FLOW_ORIGIN" };
      if (expected?.driverKey && expected.driverKey !== live.driverKey) {
        return {
          success: false,
          error: "FLOW_DRIVER_MISMATCH",
          expectedDriverKey: expected.driverKey,
          driverKey: live.driverKey,
        };
      }
      if (expected?.origin && expected.origin !== live.origin) {
        return {
          success: false,
          error: "FLOW_ORIGIN_MISMATCH",
          driverKey: live.driverKey,
        };
      }
      if (expected?.projectId && expected.projectId !== live.projectId) {
        return {
          success: false,
          error: "FLOW_PROJECT_MISMATCH",
          driverKey: live.driverKey,
          expectedProjectId: expected.projectId,
          projectId: live.projectId,
        };
      }
      if (
        expected?.routePrefix != null &&
        expected.routePrefix !== (live.routePrefix || "")
      ) {
        return {
          success: false,
          error: "FLOW_ROUTE_MISMATCH",
          driverKey: live.driverKey,
          expectedRoutePrefix: expected.routePrefix,
          routePrefix: live.routePrefix || "",
        };
      }
      return null;
    },
    _getFlowLocaleStrings2 = function (key, field) {
      var config = _getDynamicSelector2(key);
      var arr = _cfgList2(config?.[field]);
      if (arr.length === 0) {
        console.debug(
          "[Tier3] _getFlowLocaleStrings: " +
            key +
            "." +
            field +
            " cache miss/empty",
        );
        return [];
      }
      return arr;
    },
    _queryInputsByAriaLabels2 = function (labels) {
      for (const label of labels) {
        const inputs = document.querySelectorAll(
          `input[aria-label="${label}"]`,
        );
        if (inputs.length > 0) return inputs;
      }
      return [];
    },
    _ariaLabelMatches2 = function (label, expected) {
      return expected.includes(label);
    },
    _textIncludesAny2 = function (text, patterns) {
      const textLower = text.toLowerCase();
      return patterns.some((p) => textLower.includes(p.toLowerCase()));
    },
    _getTileSelector2 = function () {
      var config = _getDynamicSelector2("tile_container");
      var selectors = config?.selectors?.length ? config.selectors : [];
      var attribute = config?.attribute || null;
      if (!selectors.length || !attribute) {
        console.debug("[Tier3] _getTileSelector: tile_container config miss");
        return { selector: null, attribute: null };
      }
      var validSelectors = selectors.filter(function (selector) {
        try {
          document.querySelector(selector);
          return true;
        } catch (_) {
          return false;
        }
      });
      return {
        selector: validSelectors.length ? validSelectors.join(", ") : null,
        attribute,
      };
    },
    _getTileSelectorString2 = function () {
      var now = Date.now();
      if (
        !_tileSelectorCache ||
        now - _tileSelectorCacheTime > _SELECTOR_CACHE_TTL
      ) {
        _tileSelectorCache = _getTileSelector2();
        _tileSelectorCacheTime = now;
        console.log(
          '[TobyFlow] _getTileSelectorString: refreshed cache, selector="' +
            (_tileSelectorCache?.selector || "NULL") +
            '"',
        );
      }
      return _tileSelectorCache?.selector || null;
    },
    _getSlateEditorSelectorString2 = function () {
      var config = _getDynamicSelector2("slate_editor");
      if (config?.selectors?.length) return config.selectors.join(", ");
      console.debug("[Tier3] _getSlateEditorSelectorString miss");
      return null;
    },
    _getMediaUrlPattern2 = function () {
      try {
        var cfg = _apiConfigsCacheLocal?.data?.flow?.configs?.image_url_pattern;
        if (cfg?.url_substring) return cfg.url_substring;
      } catch (_) {}
      if (!_apiConfigsCacheLocal) {
        ConfigSnapshotAccess.read(
          ["toby_provider_api_configs"],
          function (res) {
            if (res.toby_provider_api_configs?.data) {
              _apiConfigsCacheLocal = res.toby_provider_api_configs;
              _apiConfigsCacheLocalTime = Date.now();
            }
          },
        );
      }
      console.debug("[Tier3] _getMediaUrlPattern miss");
      return null;
    },
    _getCachedTiles2 = function () {
      var now = Date.now();
      if (_tileCache && now - _tileCacheTime < _TILE_CACHE_TTL) {
        return _tileCache;
      }
      if (
        !_tileSelectorCache ||
        now - _tileSelectorCacheTime > _SELECTOR_CACHE_TTL
      ) {
        _tileSelectorCache = _getTileSelector2();
        _tileSelectorCacheTime = now;
      }
      _tileCache = _tileSelectorCache.selector
        ? document.querySelectorAll(_tileSelectorCache.selector)
        : [];
      _tileCacheTime = now;
      return _tileCache;
    },
    _invalidateTileCache2 = function () {
      _tileCache = null;
      _tileCacheTime = 0;
      _tileSelectorCache = null;
      _fileNameCache.clear();
    },
    _getTileById2 = function (tileId) {
      const resultOwner = _flowV2ResultOwners?.get(tileId);
      if (
        resultOwner?.tile?.isConnected &&
        resultOwner.projectId === getCurrentProjectId2()
      )
        return resultOwner.tile;
      var config = _getDynamicSelector2("tile_container");
      var attribute = config?.attribute || null;
      if (!attribute) return null;
      var tileSelector = _getTileSelectorString2();
      if (!tileSelector) return null;
      var escaped =
        window.CSS && CSS.escape
          ? CSS.escape(String(tileId))
          : String(tileId).replace(/["\\]/g, "\\$&");
      var direct = document.querySelector(`[${attribute}="${escaped}"]`);
      if (direct && !direct.matches(tileSelector)) {
        direct = direct.closest(tileSelector) || direct;
      }
      if (direct) return direct;
      const nativeVideo = _getObservedFlowMediaMetadata2(tileId);
      for (const tile of _getCachedTiles2()) {
        if (
          _getPersistentMediaId2(tile) === tileId ||
          _getTileRuntimeId2(tile) === tileId
        )
          return tile;
        if (
          nativeVideo &&
          _getPersistentMediaId2(tile) === nativeVideo.persistent_media_id
        )
          return tile;
        if (
          nativeVideo &&
          _getPersistentMediaId2(tile) === nativeVideo.media_uuid
        )
          return tile;
      }
      return null;
    },
    _getConfiguredAttribute2 = function (key, field = "attribute") {
      const value = _getDynamicSelector2(key)?.[field];
      return typeof value === "string" &&
        /^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(value)
        ? value
        : null;
    },
    _getFlowV2AsbMediaId2 = function (value) {
      if (!value) return null;
      try {
        const url = new URL(value, location.href);
        if (
          _flowPageContext?.driverKey !== "flow_v2" ||
          url.origin !== location.origin ||
          !url.pathname.startsWith("/asb/")
        )
          return null;
        let identity = url.pathname.slice("/asb/".length);
        const cfg = _getDynamicSelector2("tile_video");
        const playbackSuffix =
          typeof cfg?.playback_url_suffix === "string"
            ? cfg.playback_url_suffix
            : "";
        if (playbackSuffix && identity.endsWith(playbackSuffix)) {
          identity = identity.slice(0, -playbackSuffix.length);
        } else {
          const pattern =
            typeof cfg?.poster_transform_pattern === "string"
              ? cfg.poster_transform_pattern
              : "";
          if (pattern && pattern.length <= 120)
            identity = identity.replace(new RegExp(pattern, "i"), "");
        }
        return identity || null;
      } catch (_) {
        return null;
      }
    },
    _isFlowV2AsbIdentity2 = function (value) {
      const identity = String(value || "").trim();
      return (
        /^[A-Za-z0-9_-]{32,1024}$/.test(identity) &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identity,
        )
      );
    },
    _buildFlowV2AsbMediaUrl2 = function (mediaId, { playback = false } = {}) {
      const identity = String(mediaId || "").trim();
      if (!_isFlowV2AsbIdentity2(identity)) return "";
      const cfg = _getDynamicSelector2("tile_video");
      const suffix = playback
        ? cfg?.playback_url_suffix
        : cfg?.poster_url_suffix;
      if (
        typeof suffix !== "string" ||
        !/^=(?:s\d+(?:-[a-z]+)*|mm,\d+,\d+)$/.test(suffix)
      )
        return "";
      try {
        const url = new URL(`/asb/${identity}${suffix}`, location.origin);
        const routePrefix =
          FlowDriverRegistry.describeUrl(location.href)?.routePrefix || "";
        const account = routePrefix.match(/(?:^|\/)u\/(\d+)(?:\/|$)/)?.[1];
        if (account !== void 0) url.searchParams.set("authuser", account);
        return url.href;
      } catch (_) {
        return "";
      }
    },
    _getPersistentMediaId2 = function (tile) {
      if (!tile) return null;
      const attribute =
        _getConfiguredAttribute2("tile_image", "persistent_id_attribute") ||
        _getConfiguredAttribute2("tile_container", "persistent_id_attribute");
      if (attribute) {
        const direct = tile.getAttribute?.(attribute);
        if (direct) return direct;
      }
      const isV2VideoOwner =
        _flowPageContext?.driverKey === "flow_v2" &&
        !!_q2("tile_video_owner", tile);
      const video = _q2("tile_video", tile);
      const poster = _q2("tile_video_poster", tile);
      const videoSource =
        video?.currentSrc || video?.src || video?.getAttribute?.("src") || "";
      const posterSource =
        poster?.currentSrc ||
        poster?.src ||
        poster?.getAttribute?.("src") ||
        "";
      const asbMediaId =
        _getFlowV2AsbMediaId2(videoSource) ||
        _getFlowV2AsbMediaId2(posterSource);
      if (asbMediaId) return asbMediaId;
      for (const source of [videoSource, posterSource]) {
        try {
          const parsed = new URL(source, location.href);
          const match =
            parsed.hostname === "flow-content.google"
              ? parsed.pathname.match(
                  /^\/(?:video|image)\/([0-9a-f-]{36})(?:\/|$)/i,
                )
              : null;
          if (match?.[1]) return match[1];
        } catch (_) {}
      }
      if (isV2VideoOwner) return null;
      if (attribute) {
        const resultMedia = _q2("tile_image", tile);
        const owned = resultMedia?.getAttribute?.(attribute) || null;
        if (owned) return owned;
        if (_flowPageContext?.driverKey !== "flow_v2") {
          try {
            return (
              tile.querySelector?.(`[${attribute}]`)?.getAttribute(attribute) ||
              null
            );
          } catch (_) {}
        }
      }
      return null;
    },
    _findReusableFlowUploadTile2 = function (ids, filename) {
      const matches = ids.filter((id) =>
        _matchesFlowUploadName2(_getTileById2(id), filename),
      );
      const uniqueCompleted =
        matches.length > 1
          ? _uniqueCompletedFlowImageUpload2(matches, filename)
          : null;
      if (matches.length !== 1 && !uniqueCompleted) return null;
      const selectedId = uniqueCompleted || matches[0];
      const tile = _getTileById2(selectedId);
      if (!tile || _q2("tile_error_owner", tile)) return null;
      const status = detectTileStatus2(tile);
      return status === "failed" ? null : { id: selectedId, status };
    },
    _uniqueCompletedFlowImageUpload2 = function (ids, filename) {
      if (!_isDeterministicTobyUploadName2(filename)) return null;
      const completed = ids.filter((id) =>
        _isCompletedOwnedFlowImageUpload2(_getTileById2(id), filename),
      );
      return completed.length === 1 ? completed[0] : null;
    },
    _decodeFlowUploadBase642 = function (base64) {
      if (typeof Uint8Array.fromBase64 === "function") {
        try {
          return Uint8Array.fromBase64(base64);
        } catch (_) {}
      }
      let binary;
      try {
        binary = atob(base64);
      } catch (error) {
        console.warn("[FlowUpload] invalid base64 payload", {
          payloadType: typeof base64,
          payloadLength: typeof base64 === "string" ? base64.length : null,
          error: error?.message || String(error),
        });
        throw new Error("FLOW_UPLOAD_BASE64_INVALID");
      }
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    },
    _isDeterministicTobyUploadName2 = function (value) {
      const stem = String(value || "")
        .trim()
        .toLocaleLowerCase()
        .replace(
          /\.(?:png|jpe?g|webp|gif|heif|heic|mp4|m4v|mov|webm|3gp|avi|mkv)$/i,
          "",
        );
      return /^toby_[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        stem,
      );
    },
    _matchesFlowUploadName2 = function (tile, filename) {
      if (!tile || !filename) return false;
      const full = String(filename).trim();
      const stem = full.replace(
        /\.(?:png|jpe?g|webp|gif|heif|heic|mp4|m4v|mov|webm|3gp|avi|mkv)$/i,
        "",
      );
      const value = _getTileDisplayName2(tile);
      return !!value && (value === full || value === stem);
    },
    _isCompletedOwnedFlowImageUpload2 = function (tile, uploadName) {
      if (
        !tile?.isConnected ||
        !_matchesFlowUploadName2(tile, uploadName) ||
        _q2("tile_error_owner", tile)
      )
        return false;
      const image = _q2("tile_image", tile);
      const src = image?.currentSrc || image?.src || "";
      const identity = _getPersistentMediaId2(tile);
      return !!(
        image?.complete === true &&
        image.naturalWidth > 0 &&
        src &&
        _isAllowedFlowMediaUrl2(src) &&
        (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identity || "",
        ) ||
          _isFlowV2AsbIdentity2(identity || ""))
      );
    },
    _getTileDisplayName2 = function (tile) {
      if (!tile) return null;
      const attribute = _getConfiguredAttribute2(
        "tile_container",
        "display_name_attribute",
      );
      const attributeValue = attribute ? tile.getAttribute?.(attribute) : null;
      if (attributeValue && attributeValue.trim()) return attributeValue.trim();
      const displayNameEl = _q2("tile_display_name", tile);
      return displayNameEl?.textContent?.replace(/\s+/g, " ").trim() || null;
    },
    _flowDisplayNamesCorrelate2 = function (left, right) {
      const normalize = (value) =>
        String(value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLocaleLowerCase();
      const a = normalize(left);
      const b = normalize(right);
      if (!a || !b) return false;
      if (a === b) return true;
      if (a.startsWith("toby_") || b.startsWith("toby_")) {
        const uploadStem = (value) =>
          value.replace(
            /\.(?:png|jpe?g|webp|gif|heif|heic|mp4|m4v|mov|webm|3gp|avi|mkv)$/i,
            "",
          );
        const leftStem = uploadStem(a),
          rightStem = uploadStem(b);
        return (
          _isDeterministicTobyUploadName2(leftStem) && leftStem === rightStem
        );
      }
      const isTruncated = (value) => /(?:\u2026|\.{3})$/.test(value);
      if (!isTruncated(a) && !isTruncated(b)) return false;
      const prefix = (value) =>
        value.replace(/(?:\u2026|\.{3})$/, "").trimEnd();
      const pa = prefix(a);
      const pb = prefix(b);
      const shorter = pa.length <= pb.length ? pa : pb;
      const longer = pa.length <= pb.length ? pb : pa;
      return shorter.length >= 12 && longer.startsWith(shorter);
    },
    _pruneDetachedFlowV2ResultOwners2 = function () {
      for (const [id, owner] of _flowV2ResultOwners) {
        if (!owner?.tile?.isConnected) _flowV2ResultOwners.delete(id);
      }
    },
    _flowCommandMemorySnapshot2 = function () {
      const memory = globalThis.performance?.memory;
      const retainedDom = {
        tileCacheSize: _tileCache?.length || 0,
        resultOwnerEntries: _flowV2ResultOwners.size,
      };
      if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
        return { usedJsHeapMb: null, ...retainedDom };
      }
      return {
        usedJsHeapMb: Math.round(memory.usedJSHeapSize / 1048576),
        totalJsHeapMb: Number.isFinite(memory.totalJSHeapSize)
          ? Math.round(memory.totalJSHeapSize / 1048576)
          : null,
        ...retainedDom,
      };
    },
    _claimFlowTile2 = function (runtimeId, operationId) {
      if (!runtimeId || !operationId) return true;
      const now = Date.now();
      for (const [id, claim] of _flowTileOperationClaims) {
        if (!claim || now - claim.claimedAt > 30 * 60 * 1e3)
          _flowTileOperationClaims.delete(id);
      }
      const existing = _flowTileOperationClaims.get(runtimeId);
      if (existing && existing.operationId !== operationId) return false;
      _flowTileOperationClaims.set(runtimeId, { operationId, claimedAt: now });
      return true;
    },
    _isAllowedFlowMediaUrl2 = function (value, { allowBlob = true } = {}) {
      if (typeof value !== "string" || !value) return false;
      try {
        const url = new URL(value, location.href);
        if (url.protocol === "blob:")
          return allowBlob && url.origin === location.origin;
        if (url.protocol !== "https:") return false;
        const host = url.hostname.toLowerCase();
        return (
          host === "flow.google.com" ||
          host === "flow-content.google" ||
          host === "labs.google" ||
          host === "aisandbox-pa.googleapis.com" ||
          host === "googleusercontent.com" ||
          host.endsWith(".googleusercontent.com")
        );
      } catch (_) {
        return false;
      }
    },
    _classifyFlowMediaUrl2 = function (value) {
      if (!value) return null;
      try {
        const url = new URL(value, location.href);
        if (url.protocol === "blob:") return "blob";
        if (url.pathname.includes("/asb/")) return "asb";
        if (url.hostname === "aisandbox-pa.googleapis.com") return "legacy_api";
        if (
          url.hostname === "googleusercontent.com" ||
          url.hostname.endsWith(".googleusercontent.com")
        )
          return "signed_cdn";
        return url.protocol === "https:" ? "https" : null;
      } catch (_) {
        return null;
      }
    },
    _safeFlowUrlForLog2 = function (value) {
      try {
        const url = new URL(value, location.href);
        return `${url.origin}${url.pathname}`;
      } catch (_) {
        return "[invalid-url]";
      }
    },
    _safeFlowIdentityForLog2 = function (value) {
      const identity = String(value || "");
      return _isFlowV2AsbIdentity2(identity)
        ? { kind: "flow_v2_asb", length: identity.length }
        : { kind: identity ? "other" : "missing", length: identity.length };
    },
    _getFlowContentVideoUuid2 = function (url) {
      try {
        const parsed = new URL(url, location.href);
        const match =
          parsed.hostname === "flow-content.google"
            ? parsed.pathname.match(
                /^\/video\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\/|$)/i,
              )
            : null;
        return match?.[1]?.toLowerCase() || null;
      } catch (_) {
        return null;
      }
    },
    _rememberFlowVideoStreamUrl2 = function (url) {
      const projectId = getCurrentProjectId2()?.toLowerCase();
      const uuid = _getFlowContentVideoUuid2(url);
      if (uuid) {
        const previous2 = _flowObservedUuidVideoStreams.get(uuid);
        if (previous2?.projectId !== projectId || previous2.url !== url) {
          _flowObservedUuidVideoStreams.delete(uuid);
          _flowObservedUuidVideoStreams.set(uuid, { projectId, url });
          while (
            _flowObservedUuidVideoStreams.size > _FLOW_NATIVE_MEDIA_MAX_ALIASES
          ) {
            _flowObservedUuidVideoStreams.delete(
              _flowObservedUuidVideoStreams.keys().next().value,
            );
          }
        }
      }
      const asb = _getFlowV2AsbMediaId2(url);
      if (!asb || !/^[A-Za-z0-9_-]+$/.test(asb)) return;
      const previous = _flowObservedVideoStreams.get(asb);
      if (previous?.projectId === projectId && previous.url === url) return;
      _flowObservedVideoStreams.delete(asb);
      _flowObservedVideoStreams.set(asb, { projectId, url });
      while (_flowObservedVideoStreams.size > _FLOW_NATIVE_MEDIA_MAX_ALIASES) {
        _flowObservedVideoStreams.delete(
          _flowObservedVideoStreams.keys().next().value,
        );
      }
    },
    _scheduleFlowNativeMediaIdentityNotification2 = function () {
      if (_flowVideoIdentityNotifyTimer) return;
      _flowVideoIdentityNotifyTimer = setTimeout(() => {
        _flowVideoIdentityNotifyTimer = null;
        try {
          if (self.FloatingTracker?._nativeIdentitySourceData)
            self.FloatingTracker.update(
              self.FloatingTracker._nativeIdentitySourceData,
              { nativeMetadataOnly: true },
            );
        } catch (_) {}
        try {
          chrome.runtime
            .sendMessage({
              action: "workflowExecutionEvent",
              event: "flow:video_identities_updated",
              data: { projectId: _flowObservedVideoIdentityProject },
            })
            .catch(() => {});
        } catch (_) {}
      }, 100);
    },
    _applyFlowNativeMediaIdentitySnapshot2 = function (
      data,
      source = "observer",
    ) {
      const projectId = getCurrentProjectId2()?.toLowerCase();
      if (
        !data ||
        data.projectId !== projectId ||
        !Array.isArray(data.entries) ||
        data.entries.length > _FLOW_NATIVE_MEDIA_MAX_ALIASES
      )
        return false;
      const entries = data.entries.filter(
        (entry) =>
          _isFlowV2AsbIdentity2(entry?.asb) &&
          (entry.mediaUuid === null ||
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              entry.mediaUuid || "",
            )),
      );
      if (
        !entries.length &&
        _flowObservedVideoIdentityProject === projectId &&
        _flowObservedVideoIdentities.size > 0
      )
        return false;
      if (
        _flowObservedVideoIdentityProject !== projectId ||
        (entries.length &&
          data.schemaEpoch &&
          data.schemaEpoch !== _flowObservedMediaSchemaEpoch)
      ) {
        _flowObservedVideoStreams.clear();
        _flowObservedUuidVideoStreams.clear();
        _flowObservedVideoIdentities.clear();
        _flowObservedMediaTypes.clear();
        _flowObservedVideoIdentityProject = projectId;
        _flowObservedMediaSchemaEpoch = data.schemaEpoch || null;
      }
      for (const entry of entries) {
        const uuid = entry.mediaUuid?.toLowerCase() || null;
        const mediaType = entry.mediaType === "image" ? "image" : "video";
        if (_flowObservedVideoIdentities.has(entry.asb)) {
          if (
            _flowObservedVideoIdentities.get(entry.asb) !== uuid ||
            _flowObservedMediaTypes.get(entry.asb) !== mediaType
          )
            _flowObservedVideoIdentities.set(entry.asb, null);
        } else if (
          _flowObservedVideoIdentities.size < _FLOW_NATIVE_MEDIA_MAX_ALIASES
        ) {
          _flowObservedVideoIdentities.set(entry.asb, uuid);
          _flowObservedMediaTypes.set(entry.asb, mediaType);
        }
      }
      const uuidAsbIndex = new Map();
      for (const [asb, uuid] of _flowObservedVideoIdentities)
        if (uuid) uuidAsbIndex.set(uuid, asb);
      _getObservedFlowMediaMetadata2._uuidAsb = uuidAsbIndex;
      _flowObservedMediaRevision++;
      console.info(
        "[FlowNativeMediaIdentity] content map received",
        JSON.stringify({
          projectId,
          source,
          entries: entries.length,
          usableAliases: [..._flowObservedVideoIdentities.values()].filter(
            Boolean,
          ).length,
          conflictingAliases: [..._flowObservedVideoIdentities.values()].filter(
            (value) => value === null,
          ).length,
          revision: _flowObservedMediaRevision,
        }),
      );
      _scheduleFlowNativeMediaIdentityNotification2();
      if (source === "observer") {
        try {
          chrome.storage.local
            .set({
              [_FLOW_NATIVE_MEDIA_SNAPSHOT_KEY]: {
                projectId,
                schemaEpoch: data.schemaEpoch || null,
                entries,
              },
            })
            .catch(() => {});
        } catch (_) {}
      }
      return true;
    },
    _getObservedFlowMediaMetadata2 = function (id) {
      if (
        _flowObservedVideoIdentityProject !==
        getCurrentProjectId2()?.toLowerCase()
      )
        return null;
      let asb = null,
        uuid = null;
      if (_isFlowV2AsbIdentity2(id)) {
        uuid = _flowObservedVideoIdentities.get(id);
        asb = uuid ? id : null;
      } else {
        const requestedUuid = String(id || "").toLowerCase();
        const indexedAsb =
          _getObservedFlowMediaMetadata2._uuidAsb?.get(requestedUuid);
        const candidates = _getObservedFlowMediaMetadata2._uuidAsb
          ? indexedAsb
            ? [[indexedAsb, requestedUuid]]
            : []
          : [..._flowObservedVideoIdentities].filter(
              ([, value]) => value && value === requestedUuid,
            );
        if (candidates.length) [asb, uuid] = candidates[candidates.length - 1];
      }
      if (!asb || !uuid) return null;
      const mediaType = _flowObservedMediaTypes.get(asb) || "video";
      const thumbnail = _buildFlowV2AsbMediaUrl2(asb);
      const stream = _flowObservedVideoStreams.get(asb);
      const actualStream =
        stream?.projectId === _flowObservedVideoIdentityProject
          ? stream.url
          : "";
      const videoUrl =
        mediaType === "video"
          ? actualStream || _buildFlowV2AsbMediaUrl2(asb, { playback: true })
          : "";
      return {
        type: mediaType,
        media_uuid: uuid,
        file_name: asb,
        persistent_media_id: asb,
        identity_durability: "durable",
        identity_aliases: [uuid, asb],
        driver_key: "flow_v2",
        ...(mediaType === "video" && { thumb_is_poster: true }),
        ...(thumbnail && { thumbnail, source_thumbnail: thumbnail }),
        ...(videoUrl && {
          video_url: videoUrl,
          playback_url_source: actualStream
            ? "dom_stream"
            : "configured_transform",
        }),
      };
    },
    _getObservedFlowVideoMetadata2 = function (id) {
      const info = _getObservedFlowMediaMetadata2(id);
      return info?.type === "video" ? info : null;
    },
    _lookupFlowMediaCatalog2 = function (identities) {
      const supported = _flowPageContext?.driverKey === "flow_v2";
      const requested = Array.isArray(identities) ? identities : [];
      const ids = [
        ...new Set(
          requested
            .slice(0, _FLOW_NATIVE_MEDIA_MAX_ALIASES)
            .filter((id) => typeof id === "string" && id),
        ),
      ];
      const known = {},
        unknown = [];
      for (const id of ids) {
        const info = supported ? _getObservedFlowMediaMetadata2(id) : null;
        if (info) known[id] = info;
        else unknown.push(id);
      }
      const aliases =
        typeof _flowObservedVideoIdentities === "undefined"
          ? 0
          : _flowObservedVideoIdentities.size;
      const reason = !supported
        ? _flowPageContext?.driverKey
          ? "legacy_dom"
          : "driver_not_ready"
        : !aliases
          ? "catalog_empty_or_not_observed"
          : unknown.length
            ? "partial_or_unmatched"
            : "requested_identities_known";
      const result = {
        supported,
        projectId: getCurrentProjectId2(),
        known,
        unknown,
        aliases,
        revision:
          typeof _flowObservedMediaRevision === "number"
            ? _flowObservedMediaRevision
            : 0,
        reason,
        truncated: requested.length > _FLOW_NATIVE_MEDIA_MAX_ALIASES,
        complete: false,
        networkValidation: false,
        domScan: false,
      };
      console.info(
        "[FlowMediaCatalog] lookup",
        JSON.stringify({
          supported,
          projectId: result.projectId,
          requested: ids.length,
          known: Object.keys(known).length,
          unknown: unknown.length,
          aliases,
          revision: result.revision,
          reason,
          fallback: supported
            ? "preserve_refs_mounted_then_actual_operation"
            : "legacy_targeted_scan",
          complete: false,
          networkValidation: false,
          domScan: false,
        }),
      );
      return result;
    },
    _typedMediaProjection2 = function (record) {
      if (!record) return {};
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const urlUuid = (value) => {
        try {
          return (
            new URL(String(value || ""), location.href).pathname.match(
              /\/(?:image|video)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i,
            )?.[1] || null
          );
        } catch (_) {
          return null;
        }
      };
      const observed = _getObservedFlowMediaMetadata2(
        record.mediaUuid || record.persistentMediaId,
      );
      const typedObserved =
        observed?.type === record.mediaType ? observed : null;
      const mediaUuid =
        [record.mediaUuid, record.persistentMediaId]
          .map((value) => String(value || "").trim())
          .find((value) => uuidPattern.test(value)) ||
        urlUuid(record.resultUrl) ||
        urlUuid(record.thumbnailUrl) ||
        typedObserved?.media_uuid;
      const nativeInfo =
        typedObserved &&
        (!mediaUuid || typedObserved.media_uuid === mediaUuid.toLowerCase())
          ? typedObserved
          : null;
      return {
        driver_key: record.driverKey || null,
        origin: record.origin || null,
        persistent_media_id: record.persistentMediaId || null,
        display_name: record.displayName || null,
        operation_id: record.operationId || null,
        identity_durability: record.durability || "element-local",
        captured_at: record.capturedAt || Date.now(),
        url_kind: record.urlKind || null,
        ...(mediaUuid && { media_uuid: mediaUuid }),
        ...(nativeInfo && nativeInfo),
      };
    },
    _getTileRuntimeId2 = function (tile) {
      if (!tile) return null;
      const assignedId = _anonymousTileIds.get(tile);
      if (assignedId) return assignedId;
      const nativeAttribute = _getConfiguredAttribute2("tile_container");
      const nativeId =
        (nativeAttribute ? tile.getAttribute?.(nativeAttribute) : null) ||
        _getPersistentMediaId2(tile);
      if (nativeId) return nativeId;
      if (_flowPageContext?.driverKey === "flow_v2") {
        const runtimeId2 = "dom-tile:" + ++_anonymousTileIdSeq;
        _anonymousTileIds.set(tile, runtimeId2);
        return runtimeId2;
      }
      const media = _q2("tile_video", tile) || _q2("tile_image", tile);
      const src =
        media?.currentSrc || media?.src || media?.getAttribute?.("src") || "";
      if (src.includes("/asb/")) return "asb-url:" + src;
      const runtimeId = "dom-tile:" + ++_anonymousTileIdSeq;
      _anonymousTileIds.set(tile, runtimeId);
      return runtimeId;
    },
    _getPersistableResultId2 = function (tile, runtimeId) {
      if (_flowPageContext?.driverKey !== "flow_v2") return runtimeId;
      const persistentMediaId = _getPersistentMediaId2(tile);
      if (persistentMediaId) {
        _flowV2ResultOwners.set(persistentMediaId, {
          tile,
          runtimeId,
          projectId: getCurrentProjectId2(),
        });
        return persistentMediaId;
      }
      let resultId = _flowV2ResultIds.get(tile);
      if (!resultId) {
        const token =
          globalThis.crypto?.randomUUID?.() ||
          Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        resultId = "flow-v2-result:" + token;
        _flowV2ResultIds.set(tile, resultId);
      }
      _flowV2ResultOwners.set(resultId, {
        tile,
        runtimeId,
        projectId: getCurrentProjectId2(),
      });
      return resultId;
    },
    _extractTypedTileRecord2 = function (tile, operationId) {
      if (!tile) return null;
      const mediaType = detectMediaType2(tile);
      const v2MediaId = _getPersistentMediaId2(tile);
      const media =
        mediaType === "video"
          ? _q2("tile_video", tile)
          : _q2("tile_image", tile);
      const videoPoster =
        mediaType === "video" ? _q2("tile_video_poster", tile) : null;
      const posterUrl =
        videoPoster?.currentSrc ||
        videoPoster?.src ||
        videoPoster?.getAttribute?.("src") ||
        (mediaType === "video" ? extractThumbnailUrl2(tile) : null) ||
        null;
      const mountedUrl =
        media?.currentSrc || media?.src || media?.getAttribute?.("src") || null;
      const resultUrl =
        mediaType === "video"
          ? mountedUrl || _deriveFlowV2VideoUrlFromPoster2(posterUrl) || null
          : mountedUrl;
      const status = detectTileStatus2(tile);
      const page =
        typeof FlowDriverRegistry !== "undefined"
          ? FlowDriverRegistry.describeUrl(location.href)
          : null;
      const persistentMediaId =
        page?.driverKey === "flow_v2" ? v2MediaId : null;
      const hasDurableIdentity =
        page?.driverKey === "flow_v2" && mediaType === "video"
          ? _isFlowV2AsbIdentity2(persistentMediaId)
          : !!persistentMediaId;
      return FlowPageDriver.mediaRecord({
        runtimeId: _getTileRuntimeId2(tile),
        persistentMediaId,
        displayName: _getTileDisplayName2(tile),
        operationId: operationId || null,
        mediaType,
        projectId: page?.projectId || null,
        resultUrl,
        thumbnailUrl:
          status === "success" ? posterUrl || extractThumbnailUrl2(tile) : null,
        urlKind: _classifyFlowMediaUrl2(resultUrl),
        capturedAt: Date.now(),
        origin: location.origin,
        driverKey: page?.driverKey || null,
        status,
        durability: hasDurableIdentity
          ? "durable"
          : resultUrl
            ? "session"
            : "element-local",
        observationKey: _getTileRuntimeId2(tile),
      });
    },
    _loadRadixTriggerPattern2 = function () {
      try {
        ConfigSnapshotAccess.read(
          ["toby_provider_api_configs"],
          function (res) {
            var cfg =
              res?.toby_provider_api_configs?.data?.flow?.configs
                ?.radix_trigger_button_pattern;
            if (typeof cfg === "string" && cfg.includes("{suffix}")) {
              _radixTriggerPattern = cfg;
            }
          },
        );
      } catch (_) {}
    },
    _publishNativeMediaSchema2 = function (cache) {
      const schema =
        cache?.data?.flow?.configs?.native_project_media_identity || null;
      window.dispatchEvent(
        new CustomEvent("TOBY_FLOW_NATIVE_MEDIA_SCHEMA", { detail: schema }),
      );
    },
    _loadNativeMediaSchema2 = function () {
      const epoch = ++_nativeMediaSchemaStorageEpoch;
      try {
        ConfigSnapshotAccess.read(["toby_provider_api_configs"], (res) => {
          if (epoch === _nativeMediaSchemaStorageEpoch)
            _publishNativeMediaSchema2(res?.toby_provider_api_configs);
        });
      } catch (_) {
        _publishNativeMediaSchema2(null);
      }
    },
    _buildRadixTriggerSelector2 = function (suffix) {
      if (_radixTriggerPattern) {
        return _radixTriggerPattern.replace("{suffix}", String(suffix));
      }
      console.debug("[Tier3] radix_trigger_button_pattern config miss");
      return null;
    },
    _tfInjectHintStyle2 = function () {
      if (document.getElementById("tf-open-hint-style")) return;
      var st = document.createElement("style");
      st.id = "tf-open-hint-style";
      st.textContent =
        '@keyframes tf-pulse{0%,100%{box-shadow:0 0 0 0 rgba(204,255,0,.6)}50%{box-shadow:0 0 0 9px rgba(204,255,0,0)}}#tobyflow-open-sidebar-btn.tf-pulse-on{animation:tf-pulse 1.6s ease-out infinite}.tf-open-hint{position:absolute;top:calc(100% + 10px);right:0;background:#1a1a1a;color:#fff;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:2147483647;animation:tf-hint-bounce 1.4s ease-in-out infinite}.tf-open-hint::before{content:"";position:absolute;bottom:100%;right:20px;border:6px solid transparent;border-bottom-color:#1a1a1a}@keyframes tf-hint-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}';
      (document.head || document.documentElement).appendChild(st);
    },
    _tfAttachHint2 = function (btn) {
      if (_tfHintSeen) return;
      _tfInjectHintStyle2();
      btn.style.position = "relative";
      btn.classList.add("tf-pulse-on");
      if (!btn.querySelector(".tf-open-hint")) {
        var tip = document.createElement("span");
        tip.className = "tf-open-hint";
        tip.textContent = _TF_HINT_LABEL;
        btn.appendChild(tip);
      }
    },
    _tfDismissHint2 = function (btn) {
      _tfHintSeen = true;
      try {
        chrome.storage.local.set({ tf_open_hint_seen: true });
      } catch (_) {}
      if (btn) {
        btn.classList.remove("tf-pulse-on");
        var tip = btn.querySelector(".tf-open-hint");
        if (tip) tip.remove();
      }
    },
    _tfBuildOpenButton2 = function (label) {
      var logoUrl = "";
      try {
        logoUrl = chrome.runtime.getURL("icons/icon-48.png");
      } catch (_) {}
      var btn = document.createElement("button");
      btn.id = "tobyflow-open-sidebar-btn";
      btn.type = "button";
      btn.title = label;
      btn.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:7px 14px;border:none;border-radius:30px;cursor:pointer;font-size:13px;font-weight:600;line-height:1;white-space:nowrap;flex-shrink:0;background:linear-gradient(90deg, rgb(204, 255, 0) 0%, rgb(234 255 152) 100%);color:#292929;";
      btn.innerHTML =
        (logoUrl
          ? '<img src="' +
            logoUrl +
            '" alt="" style="width:18px;height:18px;border-radius:5px;display:block">'
          : "") +
        '<span class="tf-open-label">' +
        label +
        "</span>";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!_tfContextValid2()) {
          console.warn(
            "[TobyFlow] Sidebar button belongs to a stale extension context; manual Flow refresh required",
          );
          return;
        }
        _tfDismissHint2(btn);
        try {
          chrome.runtime.sendMessage(
            { action: "flow:openSidebar" },
            function () {
              void chrome.runtime.lastError;
            },
          );
        } catch (_) {}
      });
      _tfAttachHint2(btn);
      return btn;
    },
    _tfFindBrandLink2 = function () {
      var links = document.querySelectorAll('a[href$="/tools/flow"]');
      for (var i = 0; i < links.length; i++) {
        if ((links[i].textContent || "").trim() === "Google Flow")
          return links[i];
      }
      return null;
    },
    _tfWatchAnchor2 = function (anchorParent, btn) {
      if (_tfNavObserver) {
        try {
          _tfNavObserver.disconnect();
        } catch (_) {}
        _tfNavObserver = null;
      }
      if (!anchorParent || typeof MutationObserver === "undefined") return;
      _tfNavObserver = new MutationObserver(function () {
        if (!_tfContextValid2()) {
          try {
            _tfNavObserver.disconnect();
          } catch (_) {}
          _tfNavObserver = null;
          return;
        }
        if (
          document.body.contains(anchorParent) &&
          !anchorParent.contains(btn)
        ) {
          try {
            anchorParent.appendChild(btn);
          } catch (_) {}
        }
      });
      _tfNavObserver.observe(anchorParent, { childList: true });
    },
    _tfContextValid2 = function () {
      try {
        return !!(chrome.runtime && chrome.runtime.id);
      } catch (_) {
        return false;
      }
    },
    _injectTobyFlowOpenButton2 = function () {
      if (!_tfContextValid2()) {
        try {
          clearInterval(_tfInjectInterval);
        } catch (_) {}
        if (_tfNavObserver) {
          try {
            _tfNavObserver.disconnect();
          } catch (_) {}
          _tfNavObserver = null;
        }
        return;
      }
      var label = _TF_OPEN_LABEL;
      var existing = document.getElementById("tobyflow-open-sidebar-btn");
      if (existing) return;
      var nav = document.querySelector("nav");
      if (nav) {
        var b = _tfBuildOpenButton2(label);
        nav.appendChild(b);
        _tfWatchAnchor2(nav, b);
        return;
      }
      var brand = _tfFindBrandLink2();
      if (brand && brand.parentElement) {
        var b2 = _tfBuildOpenButton2(label);
        brand.insertAdjacentElement("afterend", b2);
        _tfWatchAnchor2(brand.parentElement, b2);
      }
    },
    _runSelectorWaitLoop2 = function () {
      if (_selectorWaitInProgress) return;
      if (_isLabsFlowLoginLanding2()) {
        document.getElementById("tobyflow-config-error-overlay")?.remove();
        console.log(
          "[Selector:flow:ensure] Labs sign-in landing detected \u2014 selector bootstrap skipped",
        );
        return;
      }
      _selectorWaitInProgress = true;
      var finished = false;
      function finishWait() {
        finished = true;
        clearTimeout(_selectorWaitTimer);
        _selectorWaitTimer = null;
        _selectorWaitInProgress = false;
      }
      var startTime = Date.now();
      var attempts = 0;
      var lastLogElapsed = 0;
      console.log(
        "[Selector:flow:ensure] \u23F3 Waiting for server config in chrome.storage.local (timeout " +
          _SELECTOR_WAIT_MAX_MS +
          "ms)...",
      );
      function scheduleNextCheck() {
        if (finished) return;
        if (!_tfContextValid2()) {
          finishWait();
          return;
        }
        var elapsed = Date.now() - startTime;
        if (elapsed >= _SELECTOR_WAIT_MAX_MS) {
          console.warn(
            "[Selector:flow:ensure] \u274C Timeout after " +
              attempts +
              " attempts (" +
              elapsed +
              "ms). Server unreachable \u2014 showing overlay.",
          );
          _showConfigErrorOverlay2();
          finishWait();
          return;
        }
        if (elapsed - lastLogElapsed >= 2e3) {
          lastLogElapsed = elapsed;
          console.log(
            "[Selector:flow:ensure] still waiting (" + elapsed + "ms)...",
          );
        }
        _selectorWaitTimer = setTimeout(
          checkStorage,
          _SELECTOR_WAIT_INTERVAL_MS,
        );
      }
      function checkStorage() {
        if (finished) return;
        if (!_tfContextValid2()) {
          finishWait();
          return;
        }
        attempts++;
        try {
          ConfigSnapshotAccess.read(
            ["toby_provider_configs", "toby_provider_api_configs"],
            function (res) {
              if (!_tfContextValid2()) {
                finishWait();
                return;
              }
              if (finished) return;
              _apiConfigsCacheLocal = res.toby_provider_api_configs?.data
                ? res.toby_provider_api_configs
                : null;
              _apiConfigsCacheLocalTime = _apiConfigsCacheLocal
                ? Date.now()
                : 0;
              if (res.toby_provider_configs?.data?.flow) {
                _selectorConfig = res.toby_provider_configs.data;
                _selectorConfigTime = Date.now();
                var activeProfileSelectors = _getFlowProfileSelectors2();
                if (!activeProfileSelectors) {
                  scheduleNextCheck();
                  return;
                }
                if (_flowPageContext?.driverKey === "flow_v2") {
                  var driverGate = _getApiConfigValue2(
                    "flow",
                    "flow_v2_driver",
                  );
                  if (!driverGate) {
                    try {
                      chrome.runtime.sendMessage(
                        { action: "getProviderApiConfigs", provider: "flow" },
                        function () {
                          if (chrome.runtime.lastError) {
                          }
                        },
                      );
                    } catch (_) {}
                    scheduleNextCheck();
                    return;
                  }
                  if (driverGate.enabled !== true) {
                    var blockedCopy =
                      driverGate.messages?.[_overlayLocale] ||
                      driverGate.messages?.vi ||
                      null;
                    _showConfigErrorOverlay2(blockedCopy);
                    console.warn(
                      "[Selector:flow:ensure] Flow V2 disabled by server gate",
                    );
                    finishWait();
                    return;
                  }
                }
                _selectorConfigReady = true;
                _publishNativeMediaSchema2(_apiConfigsCacheLocal);
                finishWait();
                var keyCount = Object.keys(activeProfileSelectors).length;
                console.log(
                  "[Selector:flow:ensure] \u2705 Loaded " +
                    keyCount +
                    " Flow selectors after " +
                    attempts +
                    " attempts (" +
                    (Date.now() - startTime) +
                    "ms)",
                );
                var existingOverlay = document.getElementById(
                  "tobyflow-config-error-overlay",
                );
                if (existingOverlay) existingOverlay.remove();
                if (_flowReadyBootstrapStarted) return;
                _flowReadyBootstrapStarted = true;
                async function _runFlowReadyCheckChain() {
                  const retired = () => ({
                    anyFound: false,
                    anyActioned: false,
                    retired: true,
                    r1: null,
                    r2: null,
                    r3: null,
                  });
                  if (!_tfContextValid2()) return retired();
                  if (_flowTileScanActiveDepth > 0) {
                    return {
                      anyFound: false,
                      anyActioned: false,
                      deferred: true,
                      r1: null,
                      r2: null,
                      r3: null,
                    };
                  }
                  if (_flowPageContext?.driverKey === "flow_v2") {
                    const v2 = await _ensureFlowV2AgentReady();
                    return {
                      anyFound: v2.actioned === true,
                      anyActioned: v2.actioned === true,
                      failed: v2.success !== true,
                      error: v2.error || null,
                      v2,
                      r1: null,
                      r2: null,
                      r3: null,
                    };
                  }
                  window._tobyAgentChainLastRunAt = Date.now();
                  let r1 = null,
                    r2 = null,
                    r3 = null;
                  try {
                    if (typeof _ensureFlowAgentInstructionDone === "function") {
                      r1 = await _ensureFlowAgentInstructionDone();
                      if (!_tfContextValid2()) return retired();
                      if (r1.wasOpen && r1.success)
                        console.log(
                          "[FlowAgentInstruction:chain] \u2713 Done clicked",
                        );
                      else if (r1.found)
                        console.log(
                          "[FlowAgentInstruction:chain] \u2713 Dialog already closed",
                        );
                    }
                    if (typeof _ensureFlowChatAgentClosed === "function") {
                      r2 = await _ensureFlowChatAgentClosed();
                      if (!_tfContextValid2()) return retired();
                      if (r2.wasOpen && r2.success)
                        console.log(
                          "[FlowChatAgent:chain] \u2713 Panel closed",
                        );
                      else if (r2.found)
                        console.log(
                          "[FlowChatAgent:chain] \u2713 Panel already closed",
                        );
                    }
                    if (r2?.wasOpen && r2?.success) {
                      await sleep2(1500);
                      if (!_tfContextValid2()) return retired();
                    }
                    if (typeof _ensureFlowAgentModeOff === "function") {
                      r3 = await _ensureFlowAgentModeOff();
                      if (!_tfContextValid2()) return retired();
                      if (r3.wasOn && r3.success)
                        console.log("[FlowAgent:chain] \u2713 Agent disabled");
                      else if (r3.found)
                        console.log(
                          "[FlowAgent:chain] \u2713 Agent already OFF",
                        );
                    }
                  } catch (e) {
                    if (
                      /Extension context invalidated|context invalidated/i.test(
                        e?.message || "",
                      ) ||
                      !_tfContextValid2()
                    ) {
                      return retired();
                    }
                    console.warn("[FlowReadyChain] step exception:", e.message);
                  }
                  return {
                    anyFound: !!(r1?.found || r2?.found || r3?.found),
                    anyActioned: !!(
                      (r1?.wasOpen && r1?.success) ||
                      (r2?.wasOpen && r2?.success) ||
                      (r3?.wasOn && r3?.success)
                    ),
                    r1,
                    r2,
                    r3,
                  };
                }
                document.addEventListener("toby-debug-flow-ready", async () => {
                  console.log(
                    "[FlowReadyChain:manual] === Triggered manually (verbose ON) ===",
                  );
                  if (typeof _findFlowChatAgentCloseButton2 === "function") {
                    const src = _findFlowChatAgentCloseButton2.toString();
                    const hasStats = src.includes("stats.iconCloseMatched");
                    const hasVerbose = src.includes("_tobyVerboseFlowDebug");
                    console.log(
                      `[FlowReadyChain:manual] CodeVersion check: hasStats=${hasStats} hasVerbose=${hasVerbose}`,
                    );
                    if (!hasStats || !hasVerbose) {
                      console.warn(
                        "[FlowReadyChain:manual] \u26A0 OLD CODE VERSION DETECTED \u2014 extension/tab needs reload",
                      );
                    }
                  }
                  const cfgChat =
                    typeof _getDynamicSelector2 === "function"
                      ? _getDynamicSelector2("flow_chat_agent_close_button")
                      : null;
                  const cfgInstr =
                    typeof _getDynamicSelector2 === "function"
                      ? _getDynamicSelector2(
                          "flow_agent_instruction_done_button",
                        )
                      : null;
                  const cfgAgent =
                    typeof _getDynamicSelector2 === "function"
                      ? _getDynamicSelector2("flow_agent_toggle_button")
                      : null;
                  const cfgIcon =
                    typeof _getDynamicSelector2 === "function"
                      ? _getDynamicSelector2("icon_element")
                      : null;
                  console.log(
                    "[FlowReadyChain:manual] flow_chat_agent_close_button JSON:",
                    JSON.stringify(cfgChat),
                  );
                  console.log(
                    "[FlowReadyChain:manual] flow_agent_instruction_done_button JSON:",
                    JSON.stringify(cfgInstr),
                  );
                  console.log(
                    "[FlowReadyChain:manual] flow_agent_toggle_button JSON:",
                    JSON.stringify(cfgAgent),
                  );
                  console.log(
                    "[FlowReadyChain:manual] icon_element JSON:",
                    JSON.stringify(cfgIcon),
                  );
                  _tobyVerboseFlowDebug = true;
                  try {
                    const dialogBtn =
                      typeof _findFlowAgentInstructionDoneButton2 === "function"
                        ? _findFlowAgentInstructionDoneButton2()
                        : null;
                    const chatBtn =
                      typeof _findFlowChatAgentCloseButton2 === "function"
                        ? _findFlowChatAgentCloseButton2()
                        : null;
                    const agentBtn =
                      typeof _findFlowAgentButton2 === "function"
                        ? _findFlowAgentButton2()
                        : null;
                    console.log(
                      "[FlowReadyChain:manual] Instruction Done button:",
                      dialogBtn,
                    );
                    console.log(
                      "[FlowReadyChain:manual] Chat Close button:",
                      chatBtn,
                    );
                    console.log(
                      "[FlowReadyChain:manual] Agent toggle button:",
                      agentBtn,
                    );
                    const r = await _runFlowReadyCheckChain();
                    console.log("[FlowReadyChain:manual] Chain result:", r);
                  } finally {
                    _tobyVerboseFlowDebug = false;
                  }
                });
                (async function _bootstrapWithRetry() {
                  const MAX_ATTEMPTS = 6;
                  const RETRY_DELAY = 1500;
                  await new Promise((res2) => setTimeout(res2, 1e3));
                  let actionedInBootstrap = false;
                  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                    const result = await _runFlowReadyCheckChain();
                    if (result.retired) return;
                    if (result.failed)
                      console.warn(
                        "[FlowReadyChain:bootstrap] V2 Agent guard failed:",
                        result.error,
                      );
                    if (result.anyActioned) {
                      console.log(
                        `[FlowReadyChain:bootstrap] \u2713 Actioned at attempt ${attempt}/${MAX_ATTEMPTS}`,
                      );
                      actionedInBootstrap = true;
                      window._tobyBootstrapAgentActioned = true;
                      await new Promise((res2) => setTimeout(res2, 1e3));
                      const verified = await _runFlowReadyCheckChain();
                      if (verified.retired) return;
                      break;
                    }
                    if (attempt < MAX_ATTEMPTS) {
                      await new Promise((res2) =>
                        setTimeout(res2, RETRY_DELAY),
                      );
                    }
                  }
                  if (!actionedInBootstrap) {
                    console.log(
                      `[FlowReadyChain:bootstrap] No panel/dialog/agent detected after ${MAX_ATTEMPTS} attempts \u2014 starting lifetime DOM monitor`,
                    );
                  }
                  if (
                    !actionedInBootstrap &&
                    !window._tobyOneShotPollInstalled
                  ) {
                    window._tobyOneShotPollInstalled = true;
                    const POLL_INTERVAL_MS = 1500;
                    const MAX_POLL_DURATION_MS = 6e4;
                    const MAX_POLLS = Math.ceil(
                      MAX_POLL_DURATION_MS / POLL_INTERVAL_MS,
                    );
                    let pollCount = 0;
                    let pollRunning = false;
                    let pollerRef = null;
                    let lastPollAt = Date.now();
                    const pollStartedAt = lastPollAt;
                    let delayLogged = false;
                    const cleanup = (reason) => {
                      if (pollerRef) {
                        clearInterval(pollerRef);
                        pollerRef = null;
                      }
                      console.log(
                        `[FlowReadyChain:oneShot] uninstalled (${reason}, polls=${pollCount}/${MAX_POLLS})`,
                      );
                    };
                    pollerRef = setInterval(async () => {
                      const pollAt = Date.now();
                      const gapMs = pollAt - lastPollAt;
                      lastPollAt = pollAt;
                      if (pollAt - pollStartedAt >= MAX_POLL_DURATION_MS) {
                        cleanup("timeout 60s");
                        return;
                      }
                      if (
                        gapMs > 5e3 &&
                        document.visibilityState === "visible" &&
                        !delayLogged
                      ) {
                        delayLogged = true;
                        console.info(
                          "[FlowTimerDelay] readiness poll delayed",
                          JSON.stringify({
                            gapMs,
                            expectedMs: POLL_INTERVAL_MS,
                            visibility: document.visibilityState,
                            scanActive: _flowTileScanActiveDepth > 0,
                            ..._flowCommandMemorySnapshot2(),
                          }),
                        );
                      }
                      pollCount++;
                      if (pollCount > MAX_POLLS) {
                        cleanup("timeout 60s");
                        return;
                      }
                      if (pollRunning) return;
                      pollRunning = true;
                      try {
                        const r = await _runFlowReadyCheckChain();
                        if (r.retired) {
                          cleanup("extension context retired");
                          return;
                        }
                        if (r.anyActioned) {
                          cleanup("actioned");
                        }
                      } catch (e) {
                        console.warn(
                          "[FlowReadyChain:oneShot] error:",
                          e.message,
                        );
                      } finally {
                        pollRunning = false;
                      }
                    }, POLL_INTERVAL_MS);
                    console.log(
                      `[FlowReadyChain:oneShot] \u2713 Periodic poll installed (${POLL_INTERVAL_MS}ms \xD7 ${MAX_POLLS} = ${MAX_POLL_DURATION_MS / 1e3}s window)`,
                    );
                  }
                })();
                return;
              }
              try {
                chrome.runtime.sendMessage(
                  { action: "getProviderConfigs", provider: "flow" },
                  function () {
                    if (chrome.runtime.lastError) {
                    }
                  },
                );
              } catch (_) {}
              var elapsed = Date.now() - startTime;
              if (elapsed - lastLogElapsed >= 1e3) {
                lastLogElapsed = elapsed;
                console.log(
                  "[Selector:flow:ensure] \u23F3 Still waiting (" +
                    (elapsed / 1e3).toFixed(1) +
                    "s/" +
                    _SELECTOR_WAIT_MAX_MS / 1e3 +
                    "s, attempt #" +
                    attempts +
                    ") \u2014 re-triggering background fetch",
                );
              }
              if (elapsed > _SELECTOR_WAIT_MAX_MS) {
                console.error(
                  "[Selector:flow:ensure] \u274C Timeout after " +
                    attempts +
                    " attempts (" +
                    elapsed +
                    "ms). Server unreachable \u2014 showing overlay.",
                );
                _showConfigErrorOverlay2();
                finishWait();
                return;
              }
              _selectorWaitTimer = setTimeout(
                checkStorage,
                _SELECTOR_WAIT_INTERVAL_MS,
              );
            },
          ).catch(() => scheduleNextCheck());
        } catch (_) {
          scheduleNextCheck();
        }
      }
      checkStorage();
    },
    _showCaptchaOverlay2 = function (opts) {
      opts = opts || {};
      var existing = document.getElementById("tobyflow-captcha-overlay");
      if (existing) existing.remove();
      var msg =
        opts.text ||
        "Google detected unusual activity and requires verification.";
      var canResume = opts.canResume !== false;
      var overlay = document.createElement("div");
      overlay.id = "tobyflow-captcha-overlay";
      overlay.className = "tobyflow-cfg-err-overlay";
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:rgba(10,10,14,0.95);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
      overlay.innerHTML =
        '<div style="max-width:440px;text-align:center;padding:32px;"><div style="width:72px;height:72px;border-radius:50%;background:rgba(251,191,36,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><div style="font-size:19px;font-weight:600;margin-bottom:10px;">Google y\xEAu c\u1EA7u x\xE1c minh</div><div style="font-size:14px;line-height:1.6;color:rgba(255,255,255,0.75);margin-bottom:8px;">' +
        _escapeHtmlSafe2(msg) +
        '</div><div style="font-size:13px;line-height:1.6;color:rgba(255,255,255,0.55);margin-bottom:24px;">' +
        (canResume
          ? 'Gi\u1EA3i x\xE1c minh tr\xEAn trang Flow (n\u1EBFu c\xF3), ho\u1EB7c ch\u1EDD ~1 ph\xFAt, r\u1ED3i b\u1EA5m <b style="color:#ccff00;">Ti\u1EBFp t\u1EE5c</b>.'
          : 'Gi\u1EA3i x\xE1c minh tr\xEAn trang Flow, r\u1ED3i <b style="color:#ccff00;">ch\u1EA1y l\u1EA1i workflow</b>.') +
        '</div><div style="display:flex;gap:10px;justify-content:center;">' +
        (canResume
          ? '<button id="tf-captcha-resume" style="height:40px;padding:0 22px;border-radius:999px;border:none;background:#ccff00;color:#161616;font-size:14px;font-weight:600;cursor:pointer;">Ti\u1EBFp t\u1EE5c</button>'
          : "") +
        '<button id="tf-captcha-abort" style="height:40px;padding:0 22px;border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:#fff;font-size:14px;cursor:pointer;">' +
        (canResume ? "D\u1EEBng workflow" : "\u0110\xF3ng") +
        "</button></div></div>";
      document.body.appendChild(overlay);
      var resumeBtn = overlay.querySelector("#tf-captcha-resume");
      if (resumeBtn)
        resumeBtn.addEventListener("click", function () {
          overlay.remove();
          try {
            chrome.runtime.sendMessage(
              { action: "captcha:userAction", decision: "resume" },
              function () {
                void chrome.runtime.lastError;
              },
            );
          } catch (_) {}
        });
      var abortBtn = overlay.querySelector("#tf-captcha-abort");
      if (abortBtn)
        abortBtn.addEventListener("click", function () {
          overlay.remove();
          try {
            chrome.runtime.sendMessage(
              { action: "captcha:userAction", decision: "abort" },
              function () {
                void chrome.runtime.lastError;
              },
            );
          } catch (_) {}
        });
    },
    _hideCaptchaOverlay2 = function () {
      var el = document.getElementById("tobyflow-captcha-overlay");
      if (el) el.remove();
    },
    _escapeHtmlSafe2 = function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c];
      });
    },
    _showConfigErrorOverlay2 = function (copy = null) {
      if (_isLabsFlowLoginLanding2()) {
        document.getElementById("tobyflow-config-error-overlay")?.remove();
        return;
      }
      var mounted = document.getElementById("tobyflow-config-error-overlay");
      if (mounted) {
        if (copy) {
          mounted.querySelector(".tobyflow-cfg-err-title").textContent =
            copy.title || "";
          mounted.querySelector(".tobyflow-cfg-err-desc").textContent =
            copy.desc || "";
          mounted.querySelector(
            ".tobyflow-cfg-err-retry-btn span",
          ).textContent = copy.retry || "";
        }
        console.log(
          "[Selector:flow:overlay] \u21A9 Overlay already mounted \u2014 refreshed copy",
        );
        return;
      }
      var lang = _overlayLocale || "vi";
      var t = copy || _OVERLAY_I18N[lang] || _OVERLAY_I18N.vi;
      var overlay = document.createElement("div");
      overlay.id = "tobyflow-config-error-overlay";
      queueMicrotask(() =>
        ConfigSnapshotAccess.updateOverlay(overlay).catch(() => {}),
      );
      overlay.className = "tobyflow-cfg-err-overlay tf-a91e6b";
      overlay.innerHTML =
        '<style>.tobyflow-cfg-err-overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(10,10,14,0.95); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }.tobyflow-cfg-err-content { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px; max-width: 320px; }.tobyflow-cfg-err-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(239,68,68,0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }.tobyflow-cfg-err-icon svg { color: #ef4444; }.tobyflow-cfg-err-title { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 8px 0; }.tobyflow-cfg-err-desc { font-size: 14px; color: rgba(255,255,255,0.6); margin: 0 0 24px 0; line-height: 1.5; }.tobyflow-cfg-err-retry-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #fff; color: #1a1a1e; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity 0.2s; }.tobyflow-cfg-err-retry-btn:hover { opacity: 0.9; }.tobyflow-cfg-err-retry-btn:active { opacity: 0.8; }.tobyflow-cfg-err-retry-btn svg { color: #1a1a1e; }</style><div class="tobyflow-cfg-err-content"><div class="tobyflow-cfg-err-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M8.5 16.5a5 5 0 0 1 7 0"></path><path d="M2 8.82a15 15 0 0 1 4.17-2.65"></path><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"></path><path d="M16.85 11.25a10 10 0 0 1 2.22 1.68"></path><path d="M5 13a10 10 0 0 1 5.24-2.76"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg></div><h3 class="tobyflow-cfg-err-title"></h3><p class="tobyflow-cfg-err-desc"></p><button class="tobyflow-cfg-err-retry-btn" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg><span></span></button></div>';
      overlay.querySelector(".tobyflow-cfg-err-title").textContent = t.title;
      overlay.querySelector(".tobyflow-cfg-err-desc").textContent = t.desc;
      overlay.querySelector(".tobyflow-cfg-err-retry-btn span").textContent =
        t.retry;
      document.body.appendChild(overlay);
      overlay
        .querySelector(".tobyflow-cfg-err-retry-btn")
        .addEventListener("click", function () {
          console.log(
            "[Selector:flow:overlay] \u{1F504} User clicked retry \u2014 re-fetching config in background",
          );
          overlay.remove();
          _selectorConfigReady = false;
          try {
            chrome.runtime.sendMessage(
              { action: "getProviderConfigs", provider: "flow", force: true },
              function () {
                if (chrome.runtime.lastError) {
                }
              },
            );
            chrome.runtime.sendMessage(
              {
                action: "getProviderApiConfigs",
                provider: "flow",
                force: true,
              },
              function () {
                if (chrome.runtime.lastError) {
                }
              },
            );
          } catch (_) {}
          _runSelectorWaitLoop2();
        });
      console.info(
        "[Selector:flow:overlay] \u{1F6AB} Config/driver gate overlay shown (lang=" +
          lang +
          ") \u2014 user action required",
      );
    },
    _showCloneDetectedOverlay2 = function () {
      if (document.getElementById("tobyflow-clone-detected-overlay")) return;
      var lang = _overlayLocale || "vi";
      var titleMap = {
        vi: "Extension kh\xF4ng h\u1EE3p l\u1EC7",
        en: "Extension Not Authorized",
        ja: "\u62E1\u5F35\u6A5F\u80FD\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
        th: "\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15",
      };
      var descMap = {
        vi: "Phi\xEAn b\u1EA3n extension n\xE0y kh\xF4ng c\xF3 quy\u1EC1n truy c\u1EADp API Toby Flow. Vui l\xF2ng c\xE0i l\u1EA1i t\u1EEB Chrome Web Store \u0111\u1EC3 ti\u1EBFp t\u1EE5c s\u1EED d\u1EE5ng.",
        en: "This extension version is not authorized to access Toby Flow API. Please reinstall from the Chrome Web Store to continue.",
        ja: "\u3053\u306E\u62E1\u5F35\u6A5F\u80FD\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u306F Toby Flow API \u3078\u306E\u30A2\u30AF\u30BB\u30B9\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u304B\u3089\u518D\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        th: "\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E19\u0E35\u0E49\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E43\u0E2B\u0E49\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07 API \u0E02\u0E2D\u0E07 Toby Flow \u0E42\u0E1B\u0E23\u0E14\u0E15\u0E34\u0E14\u0E15\u0E31\u0E49\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E08\u0E32\u0E01 Chrome \u0E40\u0E27\u0E47\u0E1A\u0E2A\u0E42\u0E15\u0E23\u0E4C",
      };
      var btnMap = {
        vi: "M\u1EDF Chrome Web Store",
        en: "Open Chrome Web Store",
        ja: "Chrome \u30A6\u30A7\u30D6\u30B9\u30C8\u30A2\u3092\u958B\u304F",
        th: "\u0E40\u0E1B\u0E34\u0E14 Chrome \u0E40\u0E27\u0E47\u0E1A\u0E2A\u0E42\u0E15\u0E23\u0E4C",
      };
      var overlay = document.createElement("div");
      overlay.id = "tobyflow-clone-detected-overlay";
      overlay.innerHTML =
        '<style>#tobyflow-clone-detected-overlay { position: fixed; inset: 0; z-index: 2147483647; background: rgba(10,10,14,0.97); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }#tobyflow-clone-detected-overlay .cd-content { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px; max-width: 340px; }#tobyflow-clone-detected-overlay .cd-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(239,68,68,0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; color: #ef4444; }#tobyflow-clone-detected-overlay .cd-title { font-size: 18px; font-weight: 600; color: #fff; margin: 0 0 8px 0; }#tobyflow-clone-detected-overlay .cd-desc { font-size: 14px; color: rgba(255,255,255,0.65); margin: 0 0 24px 0; line-height: 1.55; }#tobyflow-clone-detected-overlay .cd-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #fff; color: #1a1a1e; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; transition: opacity 0.2s; }#tobyflow-clone-detected-overlay .cd-btn:hover { opacity: 0.9; }</style><div class="cd-content"><div class="cd-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg></div><h3 class="cd-title"></h3><p class="cd-desc"></p><a class="cd-btn" target="_blank" rel="noopener" href="https://chromewebstore.google.com/"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg><span></span></a></div>';
      overlay.querySelector(".cd-title").textContent =
        titleMap[lang] || titleMap.vi;
      overlay.querySelector(".cd-desc").textContent =
        descMap[lang] || descMap.vi;
      overlay.querySelector(".cd-btn span").textContent =
        btnMap[lang] || btnMap.vi;
      document.body.appendChild(overlay);
      console.error(
        "[Auth:flow] \u{1F6E1}\uFE0F Clone-detected overlay shown \u2014 extension not authorized",
      );
    },
    _hideCloneDetectedOverlay2 = function () {
      var el = document.getElementById("tobyflow-clone-detected-overlay");
      if (el) el.remove();
    },
    _getDynamicSelector2 = function (key) {
      var now = Date.now();
      if (_selectorConfig && now - _selectorConfigTime < _SELECTOR_CACHE_TTL) {
        return _getFlowProfileSelectors2()?.[key] || null;
      }
      if (_tfContextValid2()) {
        try {
          ConfigSnapshotAccess.read(["toby_provider_configs"], function (res) {
            if (!_tfContextValid2()) return;
            if (res.toby_provider_configs?.data?.flow) {
              _selectorConfig = res.toby_provider_configs.data;
              _selectorConfigTime = Date.now();
            }
          });
        } catch (_) {}
      }
      if (!_selectorConfig && !_coldStartWarnedKeys.has(key)) {
        _coldStartWarnedKeys.add(key);
        console.debug(
          '[Selector:flow] _getDynamicSelector("' +
            key +
            '") called before config ready \u2014 returning null (cold start race)',
        );
      }
      return _getFlowProfileSelectors2()?.[key] || null;
    },
    _getFlowProfileSelectors2 = function () {
      if (!ConfigSnapshotAccess.active()) {
        ConfigSnapshotAccess.ensure().catch(() => {});
        return null;
      }
      var flow = _selectorConfig?.flow;
      if (!flow || location.origin !== "https://flow.google.com") return null;
      var profile = flow.profiles?.v2;
      if (
        !profile ||
        !Array.isArray(profile.host_patterns) ||
        !profile.host_patterns.includes(location.origin)
      ) {
        return null;
      }
      return profile.selectors || null;
    },
    _selStr2 = function (key) {
      var cfg = _getDynamicSelector2(key);
      return cfg?.selectors?.length ? cfg.selectors.join(", ") : null;
    },
    _q2 = function (key, scope) {
      var s = _selStr2(key);
      if (!s) {
        console.debug(`[Tier3] _q(${key}) miss`);
        return null;
      }
      return (scope || document).querySelector(s);
    },
    _qa2 = function (key, scope) {
      var s = _selStr2(key);
      if (!s) {
        console.debug(`[Tier3] _qa(${key}) miss`);
        return [];
      }
      return (scope || document).querySelectorAll(s);
    },
    _queryWithFallback2 = function (key, defaultSelectors) {
      var config = _getDynamicSelector2(key);
      var isDynamic = config?.selectors?.length > 0;
      var selectors = isDynamic ? config.selectors : defaultSelectors || [];
      console.log(
        `[Selector:${key}] Source: ${isDynamic ? "\u{1F310} DYNAMIC" : "\u{1F4E6} FALLBACK"} | Trying ${selectors.length} selectors`,
      );
      for (var i = 0; i < selectors.length; i++) {
        try {
          var el = document.querySelector(selectors[i]);
          if (el) {
            console.log(
              `[Selector:${key}] \u2705 Match #${i + 1}: ${selectors[i]}`,
            );
            return el;
          }
        } catch (e) {}
      }
      console.log(`[Selector:${key}] \u274C No match found`);
      return null;
    },
    _cfgList2 = function (v) {
      if (!v) return [];
      const raw = Array.isArray(v) ? v : String(v).split("|");
      return raw.map((s) => String(s).trim()).filter(Boolean);
    },
    _findIconInElement2 = function (parent) {
      if (!parent) return null;
      var config = _getDynamicSelector2("icon_element");
      if (!config?.selectors?.length) return null;
      for (var i = 0; i < config.selectors.length; i++) {
        try {
          var icon = parent.querySelector(config.selectors[i]);
          if (icon) return icon;
        } catch (e) {}
      }
      return null;
    },
    _findIconsInElement2 = function (parent) {
      if (!parent) return [];
      var config = _getDynamicSelector2("icon_element");
      if (!config?.selectors?.length) return [];
      for (var i = 0; i < config.selectors.length; i++) {
        try {
          var icons = parent.querySelectorAll(config.selectors[i]);
          if (icons.length > 0) return Array.from(icons);
        } catch (e) {}
      }
      return [];
    },
    _getApiConfigValue2 = function (provider, key) {
      if (!ConfigSnapshotAccess.active()) {
        ConfigSnapshotAccess.ensure().catch(() => {});
        return null;
      }
      var now = Date.now();
      if (
        _apiConfigsCacheLocal &&
        now - _apiConfigsCacheLocalTime < _API_CONFIGS_CACHE_TTL
      ) {
        return _apiConfigsCacheLocal?.data?.[provider]?.configs?.[key] || null;
      }
      ConfigSnapshotAccess.read(["toby_provider_api_configs"], function (res) {
        if (res.toby_provider_api_configs?.data) {
          _apiConfigsCacheLocal = res.toby_provider_api_configs;
          _apiConfigsCacheLocalTime = Date.now();
        }
      });
      return _apiConfigsCacheLocal?.data?.[provider]?.configs?.[key] || null;
    },
    _getFlowV2DriverGateState2 = function () {
      if (_flowPageContext?.driverKey !== "flow_v2")
        return {
          enabled: false,
          gate: null,
          error: "FLOW_LEGACY_GENERATION_DISABLED",
        };
      var gate = _getApiConfigValue2("flow", "flow_v2_driver");
      return {
        enabled: gate?.enabled === true,
        gate: gate || null,
        error: gate ? "FLOW_V2_DISABLED" : "FLOW_V2_CONFIG_MISSING",
      };
    },
    _isFlowV2GateProtectedAction2 = function (message) {
      const catalogPreparationOnly =
        message.action === "ensureFlowTilesLoaded" &&
        message.purpose === "identity";
      return (
        _flowPageContext?.driverKey === "flow_v2" &&
        !_FLOW_V2_GATE_SAFE_ACTIONS.has(message.action) &&
        !catalogPreparationOnly
      );
    },
    _detectFlowUploadError2 = function () {
      try {
        const cfg = _getApiConfigValue2("flow", "error_patterns");
        const raw = cfg && cfg.upload_blocked_text;
        if (!raw || typeof raw !== "string") return null;
        const patterns = raw
          .split("|")
          .map(function (s) {
            return s.trim().toLowerCase();
          })
          .filter(Boolean);
        if (patterns.length === 0) return null;
        const toasts = document.querySelectorAll("[data-sonner-toast]");
        for (const t of toasts) {
          const text = (t.textContent || "").toLowerCase();
          if (!text) continue;
          if (
            patterns.some(function (p) {
              return text.indexOf(p) !== -1;
            })
          ) {
            const titleEl = t.querySelector("[data-title]") || t;
            return (titleEl.textContent || "").trim();
          }
        }
      } catch (e) {}
      return null;
    },
    _matchFlowPattern2 = function (textLower, key) {
      try {
        const cfg = _getApiConfigValue2("flow", "error_patterns");
        const raw = cfg && cfg[key];
        if (!raw || typeof raw !== "string") return false;
        const patterns = raw
          .split("|")
          .map(function (s) {
            return s.trim().toLowerCase();
          })
          .filter(Boolean);
        return patterns.some(function (p) {
          return textLower.indexOf(p) !== -1;
        });
      } catch (e) {
        return false;
      }
    },
    _classifyFlowErrorText2 = function (text) {
      if (!text || typeof text !== "string") return null;
      const t = text.toLowerCase();
      if (_matchFlowPattern2(t, "captcha_text")) return "captcha";
      if (_matchFlowPattern2(t, "quota_text")) return "quota";
      if (_matchFlowPattern2(t, "rate_limit_text")) return "rate_limit";
      if (_matchFlowPattern2(t, "policy_text")) return "policy";
      return null;
    },
    _classifyFlowToast2 = function () {
      try {
        const toasts = document.querySelectorAll("[data-sonner-toast]");
        let providerCodeToast = null;
        for (const el of toasts) {
          const text = (el.textContent || "").trim();
          if (!text) continue;
          const category = _classifyFlowErrorText2(text);
          if (category) {
            const titleEl = el.querySelector("[data-title]") || el;
            return { category, text: (titleEl.textContent || text).trim() };
          }
          if (!providerCodeToast && /\bPUBLIC_ERROR_[A-Z0-9_]+\b/.test(text)) {
            providerCodeToast = { category: null, text };
          }
        }
        return providerCodeToast;
      } catch (e) {}
      return null;
    },
    _extractTileFailReason2 = function (tileEl) {
      if (!tileEl) return null;
      if (_flowPageContext?.driverKey === "flow_v2") {
        return extractTileFailureReason2(tileEl);
      }
      try {
        const warningTexts = _cfgList2(
          _getDynamicSelector2("warning_icon")?.text_match,
        );
        if (!warningTexts.length) warningTexts.push("warning");
        let warnIcon = null;
        const icons = tileEl.querySelectorAll("i");
        for (const ic of icons) {
          if (warningTexts.includes((ic.textContent || "").trim())) {
            warnIcon = ic;
            break;
          }
        }
        if (!warnIcon) return null;
        let container = warnIcon.parentElement;
        for (let i = 0; i < 4 && container && container !== tileEl; i++) {
          const clone = container.cloneNode(true);
          clone.querySelectorAll("button, i").forEach(function (n) {
            n.remove();
          });
          const txt = (clone.textContent || "").replace(/\s+/g, " ").trim();
          if (txt.length >= 12) return txt;
          container = container.parentElement;
        }
      } catch (e) {}
      return null;
    },
    _detectRecaptchaWidget2 = function () {
      try {
        const sels = [
          'iframe[src*="google.com/recaptcha"]',
          'iframe[src*="recaptcha/api2/bframe"]',
          'iframe[src*="recaptcha/enterprise"]',
        ];
        for (const sel of sels) {
          const nodes = document.querySelectorAll(sel);
          for (const n of nodes) {
            const rect = n.getBoundingClientRect();
            if (rect.width > 40 && rect.height > 40) {
              const cs = window.getComputedStyle(n);
              if (
                cs.display !== "none" &&
                cs.visibility !== "hidden" &&
                cs.opacity !== "0"
              )
                return true;
            }
          }
        }
      } catch (e) {}
      return false;
    },
    _getFlowErrorState2 = function () {
      if (_detectRecaptchaWidget2()) {
        return {
          category: "captcha",
          text: "reCAPTCHA verification required",
          source: "widget",
        };
      }
      const toast = _classifyFlowToast2();
      if (toast) {
        toast.source = "toast";
        return toast;
      }
      return null;
    },
    _clickUploadConsentModal2 = function (key = "upload_consent_confirm") {
      const cfg = _getDynamicSelector2(key);
      const sels = Array.isArray(cfg?.selectors) ? cfg.selectors : [];
      const texts = _cfgList2(cfg?.text_match);
      if (!sels.length || !texts.length) return false;
      const lowered = texts.map((t) => t.toLowerCase());
      for (const sel of sels) {
        let btns;
        try {
          btns = Array.from(document.querySelectorAll(sel));
        } catch (_) {
          continue;
        }
        for (const lt of lowered) {
          const agree = btns.find(
            (b) =>
              !b.disabled &&
              b.getAttribute("aria-disabled") !== "true" &&
              b.getBoundingClientRect().width > 0 &&
              b.getBoundingClientRect().height > 0 &&
              (b.textContent || "").trim().toLowerCase().includes(lt),
          );
          if (agree) {
            console.log(
              `[uploadConsent] click "${(agree.textContent || "").trim()}"`,
            );
            simulateClick2(agree);
            return true;
          }
        }
      }
      return false;
    },
    _getDownloadMenuLabel2 = function (resolution, isVideo) {
      var cfg = _getApiConfigValue2("flow", "download_resolutions");
      if (!cfg) {
        console.debug(
          "[Tier3] _getDownloadMenuLabel: download_resolutions cache empty \u2014 returning null",
        );
        return null;
      }
      var mode = isVideo ? "video" : "image";
      var list = Array.isArray(cfg[mode]) ? cfg[mode] : [];
      var found = list.find(function (r) {
        return r.value === resolution;
      });
      return found?.menu_label || null;
    },
    _getDownloadFallbackChain2 = function (isVideo) {
      var cfg = _getApiConfigValue2("flow", "download_resolutions");
      if (!cfg) {
        console.debug(
          "[Tier3] _getDownloadFallbackChain: download_resolutions cache empty \u2014 returning []",
        );
        return [];
      }
      var key = isVideo ? "video_fallback_chain" : "image_fallback_chain";
      return Array.isArray(cfg[key]) ? cfg[key] : [];
    },
    _getDownloadPixelWidth2 = function (resolution) {
      var cfg = _getApiConfigValue2("flow", "download_resolutions");
      if (!cfg) {
        console.debug(
          "[Tier3] _getDownloadPixelWidth: download_resolutions cache empty \u2014 returning null",
        );
        return null;
      }
      var list = Array.isArray(cfg.image) ? cfg.image : [];
      var found = list.find(function (r) {
        return r.value === resolution;
      });
      return found?.pixel_width || null;
    },
    incrementDownloadCounter2 = function () {
      downloadCounter++;
      try {
        chrome.runtime
          .sendMessage({
            action: "downloadCountUpdate",
            count: downloadCounter,
          })
          .catch(() => {});
      } catch (e) {}
    },
    getDownloadCounter2 = function () {
      return downloadCounter;
    },
    debounce2 = function (fn, delay) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    },
    sleep2 = function (ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
    _setReactInputValue2 = function (el, value) {
      if (!el) return;
      try {
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          setter.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        el.dispatchEvent(
          new Event("change", { bubbles: true, composed: true }),
        );
      } catch (e) {
        el.value = value;
      }
    },
    _findTabByIconText2 = function (iconText) {
      if (!iconText) return null;
      const cfg = _getDynamicSelector2("advanced_menu_voices_tab");
      if (cfg?.selectors?.length) {
        for (const sel of cfg.selectors) {
          try {
            const candidates = document.querySelectorAll(sel);
            for (const btn of candidates) {
              const icon = _findIconInElement2(btn);
              if (icon && icon.textContent?.trim() === iconText) return btn;
            }
          } catch (_) {}
        }
      }
      const tabCfg = _getDynamicSelector2("tab_button_generic");
      const tabSelectors = tabCfg?.selectors?.length
        ? tabCfg.selectors
        : ['button[role="tab"]'];
      for (const sel of tabSelectors) {
        try {
          const tabs = document.querySelectorAll(sel);
          for (const btn of tabs) {
            const icon = _findIconInElement2(btn);
            if (icon && icon.textContent?.trim() === iconText) return btn;
          }
        } catch (_) {}
      }
      return null;
    },
    _v2QueryConfigured2 = function (key, root) {
      const cfg = _getDynamicSelector2(key);
      if (!cfg?.selectors?.length) return null;
      for (const selector of cfg.selectors) {
        try {
          const found = (root || document).querySelector(selector);
          if (found) return found;
        } catch (_) {}
      }
      return null;
    },
    _v2QueryVisibleConfigured2 = function (key, root) {
      const cfg = _getDynamicSelector2(key);
      if (!cfg?.selectors?.length) return null;
      const matches = [];
      for (const selector of cfg.selectors) {
        try {
          matches.push(...(root || document).querySelectorAll(selector));
        } catch (_) {}
      }
      for (let i = matches.length - 1; i >= 0; i--) {
        const candidate = matches[i];
        if (!candidate?.isConnected) continue;
        const rect = candidate.getBoundingClientRect?.();
        if (rect && rect.width > 0 && rect.height > 0) return candidate;
      }
      return null;
    },
    _v2FindSemanticControl2 = function (key, root) {
      const cfg = _getDynamicSelector2(key);
      if (!cfg?.selectors?.length) return null;
      const candidates = [];
      for (const selector of cfg.selectors) {
        try {
          candidates.push(...(root || document).querySelectorAll(selector));
        } catch (_) {}
      }
      for (let i = candidates.length - 1; i >= 0; i--) {
        const candidate = candidates[i];
        if (!candidate?.isConnected) continue;
        if (
          cfg.icon_text &&
          _findIconInElement2(candidate)?.textContent?.trim() !== cfg.icon_text
        )
          continue;
        return candidate;
      }
      return null;
    },
    _closeFlowAdvancedMenu2 = function () {
      if (
        _flowPageContext?.driverKey === "flow_v2" &&
        _v2QueryVisibleConfigured2("add_component_root")
      ) {
        const root = _v2QueryVisibleConfigured2("add_component_root");
        const mobileClose =
          root && _v2QueryConfigured2("add_component_mobile_close", root);
        if (mobileClose) {
          console.log(
            "[FlowV2 add menu] closing mobile picker via configured close control",
          );
          simulateClick2(mobileClose);
          return;
        }
        const triggerCfg = _getDynamicSelector2(
          "composer_advanced_menu_button",
        );
        const closeIconText = triggerCfg?.icon_text_open || null;
        let trigger = null;
        for (const selector of triggerCfg?.selectors || []) {
          try {
            trigger = Array.from(document.querySelectorAll(selector)).find(
              (candidate) => {
                const rect = candidate.getBoundingClientRect?.();
                if (
                  !candidate.isConnected ||
                  !rect ||
                  rect.width <= 0 ||
                  rect.height <= 0
                )
                  return false;
                return (
                  !closeIconText ||
                  _findIconInElement2(candidate)?.textContent?.trim() ===
                    closeIconText
                );
              },
            );
          } catch (_) {}
          if (trigger) break;
        }
        if (trigger) {
          console.log(
            "[FlowV2 add menu] closing via configured open-state trigger",
          );
          simulateClick2(trigger);
          setTimeout(() => {
            if (!_v2QueryVisibleConfigured2("add_component_root")) return;
            if (!closeIconText) return;
            let liveTrigger = null;
            for (const selector of triggerCfg?.selectors || []) {
              try {
                liveTrigger = Array.from(
                  document.querySelectorAll(selector),
                ).find(
                  (candidate) =>
                    _findIconInElement2(candidate)?.textContent?.trim() ===
                    closeIconText,
                );
              } catch (_) {}
              if (liveTrigger) break;
            }
            if (liveTrigger) {
              console.log(
                "[FlowV2 add menu] first close did not settle; retrying owner once",
              );
              simulateClick2(liveTrigger);
            }
          }, 150);
        } else {
          console.warn(
            "[FlowV2 add menu] configured open-state trigger unavailable; closing current overlay via Escape",
          );
          const escapeTarget = root.contains?.(document.activeElement)
            ? document.activeElement
            : root;
          escapeTarget.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Escape",
              code: "Escape",
              bubbles: true,
              cancelable: true,
              composed: true,
            }),
          );
        }
        return;
      }
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
    },
    _flowV2ComponentInfo2 = function (option, kind) {
      const title =
        _v2QueryConfigured2(
          "add_component_title",
          option,
        )?.textContent?.trim() || "";
      if (!title) return null;
      const kindCfg = _getDynamicSelector2(
        kind === "voice"
          ? "add_component_voice_tab"
          : "add_component_character_tab",
      );
      const iconText = _findIconInElement2(option)?.textContent?.trim() || "";
      const image = option.querySelector("img");
      if (
        kind === "voice" &&
        (!kindCfg?.icon_text || iconText !== kindCfg.icon_text)
      )
        return null;
      if (kind === "character" && !image) return null;
      const description =
        kind === "voice"
          ? _v2QueryConfigured2(
              "add_component_description",
              option,
            )?.textContent?.trim() || null
          : null;
      return {
        name: title,
        description,
        thumbnail:
          kind === "character" ? image?.currentSrc || image?.src || null : null,
      };
    },
    _flowV2InlineState2 = function (segments = null) {
      const editor = getEditor2(),
        cfg = _getDynamicSelector2("mention_inline_chip");
      if (
        !editor ||
        !cfg?.selectors?.length ||
        !cfg.voice_id_attribute ||
        !cfg.character_id_attribute
      )
        return { success: false };
      const chips = new Set();
      for (const selector of cfg.selectors)
        for (const chip of editor.querySelectorAll(selector)) chips.add(chip);
      const parts = [];
      const knownVoiceIds = new Map();
      const knownCharacterIds = new Map();
      const appendText = (text) => {
        if (parts.length && parts[parts.length - 1].text !== void 0)
          parts[parts.length - 1].text += text;
        else parts.push({ text });
      };
      const visit = (node) => {
        if (node.nodeType === 3) {
          appendText(node.nodeValue || "");
          return;
        }
        if (node.nodeType !== 1) return;
        if (chips.has(node)) {
          const name = node.textContent.trim();
          let voice = node.getAttribute(cfg.voice_id_attribute);
          let char = node.getAttribute(cfg.character_id_attribute);
          if (voice) knownVoiceIds.set(name, voice);
          if (char) knownCharacterIds.set(name, char);
          if (!voice && !char) {
            const inheritedVoice = knownVoiceIds.get(name) || null;
            const inheritedCharacter = knownCharacterIds.get(name) || null;
            if (inheritedVoice && !inheritedCharacter) voice = inheritedVoice;
            else if (inheritedCharacter && !inheritedVoice)
              char = inheritedCharacter;
          }
          parts.push({
            ...(voice ? { voice: name } : { char: name }),
            id: voice || char || null,
          });
          return;
        }
        if (node.getAttribute("contenteditable") === "false") return;
        if (node.tagName === "BR") {
          appendText("\n");
          return;
        }
        for (const child of node.childNodes) visit(child);
        if (["P", "DIV"].includes(node.tagName)) appendText("\n");
      };
      for (const child of editor.childNodes) visit(child);
      const normalize = (value) =>
        String(value || "")
          .normalize("NFKC")
          .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const canonical = (list) =>
        list
          .filter((part) => part.text === void 0 || normalize(part.text))
          .map((part) =>
            part.text !== void 0
              ? { text: normalize(part.text) }
              : part.voice
                ? { voice: part.voice }
                : { char: part.char },
          );
      const valid = parts.every((part) => part.text !== void 0 || !!part.id);
      return {
        success: valid,
        count: chips.size,
        parts,
        verified:
          valid &&
          Array.isArray(segments) &&
          JSON.stringify(canonical(parts)) ===
            JSON.stringify(canonical(segments)),
        submittedText: normalize(
          parts.map((part) => part.text ?? part.voice ?? part.char).join(""),
        ),
      };
    },
    _flowReferenceGuardMatches2 = function (refGuard) {
      if (!refGuard) return true;
      if (
        !Number.isInteger(refGuard.imageCount) ||
        !Number.isInteger(refGuard.videoCount) ||
        refGuard.imageCount < 0 ||
        refGuard.videoCount < 0
      )
        return false;
      const imageSelector = _selStr2("ingredient_image_chip");
      const videoSelector = _selStr2("ingredient_video_chip");
      if (!imageSelector || !videoSelector) return false;
      try {
        return (
          document.querySelectorAll(imageSelector).length ===
            refGuard.imageCount &&
          document.querySelectorAll(videoSelector).length ===
            refGuard.videoCount
        );
      } catch (_) {
        return false;
      }
    },
    _extractCharOption2 = function (opt, nameSelectors) {
      const img = opt.querySelector("img");
      if (!img) return null;
      let name = "";
      for (const sel of nameSelectors || []) {
        try {
          const v = opt.querySelector(sel)?.textContent?.trim();
          if (v && v.length < 80) {
            name = v;
            break;
          }
        } catch (_) {}
      }
      if (!name) {
        name = (opt.textContent || "").trim();
      }
      if (!name || name.length >= 80) return null;
      let thumb = img.getAttribute("src") || "";
      if (thumb) {
        try {
          thumb = new URL(thumb, window.location.origin).href;
        } catch (_) {}
      }
      return { name, thumbnail: thumb || null };
    },
    _parseComponentMentions2 = function (text) {
      if (!text || typeof text !== "string") return [];
      const out = [];
      const regex = new RegExp(_COMPONENT_MENTION_REGEX.source, "g");
      let m;
      while ((m = regex.exec(text)) !== null) {
        let raw = m[2];
        let fullMatch = m[0];
        let name;
        if (raw.startsWith("[") && raw.endsWith("]")) {
          name = raw.slice(1, -1).trim();
        } else {
          const trimmed = raw.replace(/[.,;!?"')\]]+$/, "");
          fullMatch = fullMatch.slice(
            0,
            fullMatch.length - (raw.length - trimmed.length),
          );
          name = trimmed;
        }
        if (!name) continue;
        out.push({ type: m[1], name, index: m.index, fullMatch });
      }
      return out;
    },
    _stripComponentMentions2 = function (text) {
      const comps = _parseComponentMentions2(text);
      if (comps.length === 0) return text || "";
      let out = "";
      let cursor = 0;
      for (const c of comps) {
        out += text.slice(cursor, c.index);
        cursor = c.index + c.fullMatch.length;
      }
      out += text.slice(cursor);
      return out.replace(/[ \t]{2,}/g, " ").trim();
    },
    _countInlineChips2 = function () {
      if (_flowPageContext?.driverKey === "flow_v2")
        return _flowV2InlineState2().count || 0;
      const editor = getEditor2();
      if (!editor) return 0;
      const cfg = _getDynamicSelector2("mention_inline_chip");
      const sels = cfg?.selectors?.length
        ? cfg.selectors
        : [
            'span[data-slate-node="element"][data-slate-inline="true"][data-slate-void="true"]',
          ];
      for (const sel of sels) {
        try {
          const els = editor.querySelectorAll(sel);
          let n = 0;
          for (const el of els) {
            if (
              el.getAttribute("type") === "button" ||
              el.hasAttribute("aria-haspopup")
            )
              n++;
          }
          return n;
        } catch (_) {}
      }
      return 0;
    },
    _incrementDailyStat2 = function (key) {
      _statQueue = _statQueue
        .then(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const currentUserId = window.authManager?.user?.id || null;
          const res = await new Promise((resolve) =>
            ConfigSnapshotAccess.read(["af_daily_stats"], resolve),
          );
          const stats = res.af_daily_stats || {};
          if (stats._date !== today || stats._user_id !== currentUserId) {
            stats._date = today;
            stats._user_id = currentUserId;
            stats.flow_prompt_total = 0;
            stats.chatgpt_prompt_total = 0;
            stats.gemini_prompt_total = 0;
            stats.grok_prompt_total = 0;
            stats.flow_fail = 0;
            stats.chatgpt_fail = 0;
            stats.gemini_fail = 0;
            stats.grok_fail = 0;
            stats.task_run = 0;
            stats.workflow_run = 0;
            stats.angles_run = 0;
            stats.flow_refresh_success = 0;
            stats.flow_refresh_fail = 0;
          }
          stats[key] = (stats[key] || 0) + 1;
          await new Promise((resolve) =>
            chrome.storage.local.set({ af_daily_stats: stats }, resolve),
          );
        })
        .catch((err) => {
          console.warn("[content.js] _incrementDailyStat error:", err.message);
        });
    },
    getInputTimeoutMs2 = function () {
      if (
        typeof _cachedInputTimeoutMs === "number" &&
        _cachedInputTimeoutMs > 0
      ) {
        return _cachedInputTimeoutMs;
      }
      return window._afSettings?.inputTimeout || 1200;
    },
    getClearEditorDelay2 = function () {
      return Math.round(getInputTimeoutMs2() * 0.4);
    },
    getSubmitDelay2 = function () {
      return Math.round(getInputTimeoutMs2() * 0.5);
    },
    getAfterSubmitDelay2 = function () {
      return Math.round(getInputTimeoutMs2() * 0.8);
    },
    getSettingsStepDelay2 = function () {
      return Math.round(getInputTimeoutMs2() * 0.3);
    },
    getDelayBetweenPromptsMs2 = function () {
      if (
        typeof _cachedDelayBetweenMs === "number" &&
        _cachedDelayBetweenMs > 0
      ) {
        return _cachedDelayBetweenMs;
      }
      const seconds =
        window._afExecConfig?.timing?.delay_between_prompts_sec || 5;
      return seconds * 1e3;
    },
    getRandomDelay2 = function () {
      const min = (window._afSettings?.randomDelayMin || 3) * 1e3;
      const max = (window._afSettings?.randomDelayMax || 10) * 1e3;
      return min + Math.random() * (max - min);
    },
    _isLogSelectorsEnabled2 = function () {
      return !!(typeof window !== "undefined" && window._afDebug);
    },
    _logSelectorPick2 = function (name, tier, tierName, result) {
      if (!_isLogSelectorsEnabled2()) return;
      const status = result ? "found" : "null";
      console.log(
        `[Selector] ${name} \u2192 tier ${tier} (${tierName}) = ${status}`,
      );
    },
    getEditor2 = function () {
      const _sSel = _getSlateEditorSelectorString2();
      const allEditors = _sSel ? document.querySelectorAll(_sSel) : [];
      for (const ed of allEditors) {
        const hasPlaceholder = !!ed.querySelector("[data-slate-placeholder]");
        let container = ed;
        let containerHit = false;
        for (let i = 0; i < 5 && container; i++) {
          container = container.parentElement;
          if (!container) break;
          const iconsInContainer = _findIconsInElement2(container);
          const submitIconText =
            _getDynamicSelector2("submit_button")?.icon_text;
          const settingsIconText =
            _getDynamicSelector2("settings_button")?.icon_text;
          const hasIcon = iconsInContainer.some((ic) => {
            const t = ic.textContent.trim();
            if (submitIconText && t === submitIconText) return true;
            if (settingsIconText && t.startsWith(settingsIconText)) return true;
            return /^add_2/.test(t);
          });
          const hasRadixBtn = !!_q2("settings_button", container);
          const _stCfg = _getDynamicSelector2("settings_button");
          const _menuSel = _stCfg?.selectors?.[0];
          const hasMenuBtn = !!(_menuSel && container.querySelector(_menuSel));
          const hasDialogBtn = !!container.querySelector(
            'button[aria-haspopup="dialog"]',
          );
          if (hasIcon || hasRadixBtn || hasMenuBtn || hasDialogBtn) {
            containerHit = true;
            break;
          }
        }
        if (hasPlaceholder || containerHit) {
          _logSelectorPick2(
            "getEditor",
            1,
            hasPlaceholder ? "placeholder" : "container-marker",
            ed,
          );
          return ed;
        }
      }
      if (allEditors.length > 0) {
        const last = allEditors[allEditors.length - 1];
        _logSelectorPick2("getEditor", "fallback", "last-of-list", last);
        return last;
      }
      _logSelectorPick2("getEditor", "fail", "no-slate-editor", null);
      return null;
    },
    getEditorUserText2 = function (editor = null) {
      const target = editor || getEditor2();
      if (!target) return "";
      if (!target?.classList?.contains("ProseMirror")) {
        return (target.textContent || "").replace(
          /[\u200B\u200C\u200D\uFEFF]/g,
          "",
        );
      }
      const chunks = [];
      const blockTags = new Set([
        "P",
        "DIV",
        "LI",
        "UL",
        "OL",
        "BLOCKQUOTE",
        "PRE",
      ]);
      const visit = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          chunks.push(node.nodeValue || "");
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node;
        if (element.getAttribute("contenteditable") === "false") return;
        if (element.tagName === "BR") {
          chunks.push("\n");
          return;
        }
        const isBlock = blockTags.has(element.tagName);
        if (
          isBlock &&
          chunks.length &&
          !String(chunks[chunks.length - 1]).endsWith("\n")
        )
          chunks.push("\n");
        for (const child of element.childNodes) visit(child);
        if (isBlock && !String(chunks[chunks.length - 1] || "").endsWith("\n"))
          chunks.push("\n");
      };
      visit(target);
      return chunks.join("").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
    },
    getSettingsButton2 = function (submitBtn = null) {
      const settingsConfig = _getDynamicSelector2("settings_button");
      const settingsIconPrefixes = [
        settingsConfig?.icon_text,
        ..._cfgList2(settingsConfig?.icon_texts),
      ].filter(
        (value, index, values) =>
          typeof value === "string" && value && values.indexOf(value) === index,
      );
      const iconPrefixMatch = (icon) =>
        icon &&
        settingsIconPrefixes.some((prefix) =>
          icon.textContent.trim().startsWith(prefix),
        );
      const _sb1 = settingsConfig?.selectors?.[0];
      const menuBtns = _sb1 ? document.querySelectorAll(_sb1) : [];
      for (const btn of menuBtns) {
        const icon = _findIconInElement2(btn);
        if (iconPrefixMatch(icon)) {
          _logSelectorPick2("getSettingsButton", 1, "aria-menu+icon", btn);
          return btn;
        }
      }
      const radixBtns = _qa2("settings_button");
      for (const btn of radixBtns) {
        const icon = _findIconInElement2(btn);
        if (iconPrefixMatch(icon)) {
          _logSelectorPick2("getSettingsButton", 2, "radix-id+icon", btn);
          return btn;
        }
      }
      const sb = submitBtn || getSubmitButton2();
      if (
        sb?.previousElementSibling &&
        sb.previousElementSibling.tagName === "BUTTON"
      ) {
        _logSelectorPick2(
          "getSettingsButton",
          3,
          "positional",
          sb.previousElementSibling,
        );
        return sb.previousElementSibling;
      }
      if (settingsIconPrefixes.length) {
        const allBtns = document.querySelectorAll("button");
        for (const btn of allBtns) {
          if (
            settingsIconPrefixes.some((prefix) =>
              (btn.textContent || "").includes(prefix),
            )
          ) {
            _logSelectorPick2("getSettingsButton", 4, "text-prefix", btn);
            return btn;
          }
        }
      }
      _logSelectorPick2("getSettingsButton", "fail", "all", null);
      return null;
    },
    _getActiveSettingsPanel2 = function () {
      const _candCfg = _getDynamicSelector2("settings_panel_candidates");
      const _candSelectors = _candCfg?.selectors?.length
        ? _candCfg.selectors
        : [];
      const _markerCfg = _getDynamicSelector2("settings_panel_marker");
      const _markerSelector = _markerCfg?.selectors?.[0] || null;
      if (!_candSelectors.length || !_markerSelector) {
        console.debug(
          "[Tier3] _getActiveSettingsPanel: settings_panel_candidates/marker config miss",
        );
        return document;
      }
      const candidates = document.querySelectorAll(_candSelectors.join(", "));
      for (let i = candidates.length - 1; i >= 0; i--) {
        const el = candidates[i];
        try {
          if (el.querySelector(_markerSelector)) return el;
        } catch (_) {}
      }
      if (_flowPageContext?.driverKey === "flow_v2") return document;
      if (candidates.length > 0) return candidates[candidates.length - 1];
      return document;
    },
    getSubmitButton2 = function () {
      var config = _getDynamicSelector2("submit_button");
      var hasConfig = !!config;
      var selectors = config?.selectors || [];
      var iconText = config?.icon_text;
      var submitTexts = config?.button_text?.length ? config.button_text : [];
      if (!iconText) {
        console.debug(
          "[Tier3] getSubmitButton: submit_button.icon_text cache miss",
        );
        iconText = "";
      }
      console.log(
        `[Selector:submit_button] Source: ${hasConfig ? "\u{1F310} DYNAMIC" : "\u{1F4E6} HARDCODED"} | selectors=${selectors.length} | icon_text="${iconText}" | button_text=[${submitTexts.join(", ")}]`,
      );
      for (var s = 0; s < selectors.length; s++) {
        try {
          var el = document.querySelector(selectors[s]);
          if (el) {
            console.log(
              `[Selector:submit_button] \u2705 Tier 0 Match #${s + 1}: ${selectors[s]}`,
            );
            _logSelectorPick2("getSubmitButton", 0, "selector", el);
            return el;
          } else {
            console.log(
              `[Selector:submit_button] \u274C Tier 0 No match: ${selectors[s]}`,
            );
          }
        } catch (e) {}
      }
      var buttons = document.querySelectorAll("button");
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var icon = _findIconInElement2(btn);
        if (icon && icon.textContent.trim() === iconText) {
          _logSelectorPick2("getSubmitButton", 1, "icon", btn);
          return btn;
        }
      }
      for (var j = 0; j < buttons.length; j++) {
        var btn2 = buttons[j];
        var btnText = btn2.textContent.trim();
        if (
          submitTexts.some(function (t) {
            return btnText.includes(t);
          })
        ) {
          _logSelectorPick2("getSubmitButton", 2, "text", btn2);
          return btn2;
        }
      }
      var submitBtn = _queryWithFallback2("submit_button");
      if (submitBtn) {
        _logSelectorPick2("getSubmitButton", 3, "type=submit", submitBtn);
        return submitBtn;
      }
      _logSelectorPick2("getSubmitButton", "fail", "all", null);
      return null;
    },
    sendLog2 = function (msg, level = "info") {
      console.log(`[FlowAuto] ${msg}`);
      const logContainer = document.getElementById("logContainer");
      if (logContainer) {
        const div = document.createElement("div");
        div.className = `log-entry ${level}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
      }
      const logTabBtn = document.querySelector('.tab-btn[data-tab="tab-logs"]');
      if (logTabBtn && !logTabBtn.classList.contains("active")) {
        logTabBtn.classList.add("has-new");
      }
      if (!chrome.runtime?.id) return;
      try {
        chrome.runtime
          .sendMessage({ action: "contentLog", msg, level })
          .catch(() => {});
      } catch (e) {}
    },
    _isFlowCompactLayout2 = function () {
      return (
        !!_q2("compact_layout_marker") ||
        window.matchMedia?.("(max-width: 600px)")?.matches === true
      );
    },
    _setupFlowCompactViewportNotice2 = function () {
      _syncFlowCompactViewportNotice();
      window.addEventListener("resize", _syncFlowCompactViewportNotice, {
        passive: true,
      });
      if (
        !_flowCompactNoticeObserver &&
        !_flowCompactNoticeShown &&
        document.body
      ) {
        let timer = null;
        _flowCompactNoticeObserver = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(_syncFlowCompactViewportNotice, 250);
        });
        _flowCompactNoticeObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
    },
    sendRetryStatus2 = function (text) {
      try {
        chrome.runtime
          .sendMessage({ action: "retry:status", text })
          .catch(() => {});
      } catch (e) {}
    },
    isAutoDownloadEnabled2 = function () {
      const genTabToggle = document.getElementById("genTabAutoDownload");
      if (genTabToggle) return genTabToggle.checked;
      return false;
    },
    getDownloadSettings2 = function () {
      return new Promise((resolve) => {
        ConfigSnapshotAccess.read(["af_settings"], (res) => {
          const s = res.af_settings || {};
          resolve({
            folder: s.downloadFolder || "tobyflow_output",
            template: s.fileNameTemplate || "[Date]_[Project]_[Prompt]_[Index]",
            project: s.fileNameProject || "",
            resolution: s.downloadResolution || "1k",
            videoResolution: s.videoDownloadResolution || "720p",
          });
        });
      });
    },
    _toAscii2 = function (str) {
      if (!str) return str;
      return str
        .replace(/[đĐ]/g, (c) => (c === "\u0111" ? "d" : "D"))
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    },
    _buildFilename2 = function ({
      template,
      project,
      prompt,
      index,
      taskName,
      folder,
      ext,
    }) {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, "-");
      const safeProject = _toAscii2(project || "")
        .substring(0, 30)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const safePrompt = _toAscii2(prompt || "flow")
        .substring(0, 40)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeIndex = index ? String(index).padStart(3, "0") : "";
      let filename = (template || "[Date]_[Prompt]")
        .replace(/\[Date\]/gi, date)
        .replace(/\[Time\]/gi, time)
        .replace(/\[Project\]/gi, safeProject)
        .replace(/\[Prompt\]/gi, safePrompt)
        .replace(/\[Index\]/gi, safeIndex);
      filename = filename.replace(/_+/g, "_").replace(/^_|_$/g, "");
      if (!filename) filename = "flow_" + Date.now();
      const baseFolder = folder || "tobyflow_output";
      const extension = ext || "png";
      if (taskName) {
        const safeTaskName = _toAscii2(taskName)
          .substring(0, 30)
          .replace(/[^a-zA-Z0-9_-]/g, "_");
        if (safeTaskName.toLowerCase() === baseFolder.toLowerCase()) {
          console.warn(
            "[TobyFlow] _buildFilename: taskName tr\xF9ng baseFolder, skip duplicate layer:",
            baseFolder,
          );
          return `${baseFolder}/${filename}.${extension}`;
        }
        return `${baseFolder}/${safeTaskName}/${filename}.${extension}`;
      }
      return `${baseFolder}/${filename}.${extension}`;
    },
    _splitCdnSizeSuffix2 = function (url) {
      const s = String(url || "");
      const qi = s.indexOf("?");
      const path = qi < 0 ? s : s.slice(0, qi);
      const query = qi < 0 ? "" : s.slice(qi);
      if (
        !/googleusercontent\.com|storage\.googleapis\.com|lh\d+\.google|flow\.google\.com\/asb\//.test(
          s,
        ) ||
        !/=[^/?]*$/.test(path)
      ) {
        return { path, query, stripped: false };
      }
      return { path: path.replace(/=[^/]*$/, ""), query, stripped: true };
    },
    _stripCdnSizeSuffix2 = function (url) {
      if (typeof url !== "string" || !url) return url;
      const { path, query, stripped } = _splitCdnSizeSuffix2(url);
      return stripped ? path + query : url;
    },
    applyResolutionToUrl2 = function (url, resolution) {
      if (!url || resolution === "original") return url;
      const targetWidth = _getDownloadPixelWidth2(resolution);
      if (!targetWidth) return url;
      try {
        if (
          url.includes("googleusercontent.com") ||
          url.includes("storage.googleapis.com") ||
          url.includes("lh3.") ||
          url.includes("flow.google.com/asb/")
        ) {
          const { path, query } = _splitCdnSizeSuffix2(url);
          return `${path}=w${targetWidth}${query}`;
        }
        const urlObj = new URL(url);
        urlObj.searchParams.set("w", targetWidth.toString());
        return urlObj.toString();
      } catch (e) {
        return url;
      }
    },
    _waitInterceptDone2 = function (
      timeoutMs,
      operationId = null,
      strictCorrelation = false,
    ) {
      if (window.__tobyInterceptActive !== true) return Promise.resolve(false);
      return new Promise((resolve) => {
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          window.removeEventListener("message", onMsg);
          clearTimeout(timer);
          resolve(v);
        };
        const onMsg = (ev) => {
          if (ev.source !== window) return;
          if (ev.data?.channel === "TOBY_MEDIA_INTERCEPT_DONE") {
            if (strictCorrelation && ev.data.operationId !== operationId)
              return;
            const wmResult = ev.data.cleaned
              ? "\u0111\xE3 xo\xE1"
              : [
                    "not_found",
                    "below_threshold",
                    "already_clean_output",
                  ].includes(ev.data.reason)
                ? "kh\xF4ng ph\xE1t hi\u1EC7n watermark"
                : "b\u1EA3n g\u1ED1c";
            sendLog2(
              `[WM] l\u1EDBp ch\u1EB7n b\xE1o t\u1EA3i xong (${wmResult})`,
              "info",
            );
            try {
              window.postMessage(
                { channel: "TOBY_WM_ORIGIN_TICKET", mode: null },
                "*",
              );
            } catch (_) {}
            finish(true);
          } else if (ev.data?.channel === "TOBY_MEDIA_INTERCEPT_FALLBACK") {
            if (strictCorrelation && ev.data.operationId !== operationId)
              return;
            sendLog2(
              `[WM] l\u1EDBp ch\u1EB7n chuy\u1EC3n sang t\u1EA3i b\u1EA3n g\u1ED1c: ${ev.data.error || "INTERCEPT_FETCH_FAILED"}`,
              "warn",
            );
            finish(false);
          }
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        window.addEventListener("message", onMsg);
      });
    },
    _activateInterceptDownloadContext2 = function (operationId) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          window.removeEventListener("message", onAck);
          resolve(ok);
        };
        const onAck = (ev) => {
          if (ev.source !== window) return;
          const d = ev.data;
          if (
            d?.channel === "TOBY_MEDIA_DOWNLOAD_CONTEXT_ACK" &&
            d.operationId === operationId &&
            d.active
          )
            finish(true);
        };
        const timer = setTimeout(() => finish(false), 150);
        window.addEventListener("message", onAck);
        try {
          window.postMessage(
            { channel: "TOBY_MEDIA_DOWNLOAD_CONTEXT", operationId },
            "*",
          );
        } catch (_) {
          finish(false);
        }
      });
    },
    _clearInterceptDownloadContext2 = function (operationId) {
      try {
        window.postMessage(
          { channel: "TOBY_MEDIA_DOWNLOAD_CONTEXT", operationId, clear: true },
          "*",
        );
        window.postMessage(
          { channel: "TOBY_WM_ORIGIN_TICKET", mode: null },
          "*",
        );
      } catch (_) {}
    },
    _awaitPreparedDownloadCompletion2 = function (requestId, timeoutMs) {
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(onCompletionPush);
          resolve(
            result || { success: false, error: "NO_DOWNLOAD_CONFIRMATION" },
          );
        };
        const onCompletionPush = (message) => {
          if (
            message?.action !== "preparedDownloadCompleted" ||
            message.requestId !== requestId
          )
            return;
          finish(message.result);
        };
        chrome.runtime.onMessage.addListener(onCompletionPush);
        timer = setTimeout(
          () =>
            finish({ success: false, error: "DOWNLOAD_CONFIRMATION_TIMEOUT" }),
          Math.min(Math.max(Number(timeoutMs) || 12e4, 1e3), 10 * 60 * 1e3) +
            2e3,
        );
        try {
          chrome.runtime.sendMessage(
            { action: "awaitPreparedDownload", requestId, timeoutMs },
            (resp) => {
              if (chrome.runtime.lastError) {
                return;
              }
              finish(resp);
            },
          );
        } catch (error) {
          finish({
            success: false,
            error: error?.message || "DOWNLOAD_WAIT_FAILED",
          });
        }
      });
    },
    _waitForElement2 = function (selector, timeoutMs = 3e3, excludeEl = null) {
      return new Promise((resolve) => {
        const existing = document.querySelectorAll(selector);
        for (const el of existing) {
          if (!excludeEl || el !== excludeEl) {
            resolve(el);
            return;
          }
        }
        const observer = new MutationObserver(() => {
          const els = document.querySelectorAll(selector);
          for (const el of els) {
            if (!excludeEl || el !== excludeEl) {
              observer.disconnect();
              clearTimeout(timer);
              resolve(el);
              return;
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timer = setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeoutMs);
      });
    },
    _waitForTileMediaReady2 = function (
      tile,
      timeoutMs = 1e4,
      preferVideo = false,
      allowPoster = true,
      allowUnloadedImage = false,
    ) {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const videoFallbackMs = Math.min(8e3, timeoutMs * 0.6);
        const check = () => {
          const status = detectTileStatus2(tile);
          if (status === "failed") {
            console.warn(
              "[TobyFlow] _waitForTileMediaReady: tile is failed, skip download",
            );
            resolve(null);
            return;
          }
          let media;
          if (preferVideo) {
            media = _q2("tile_video", tile);
            if (
              allowPoster &&
              !media &&
              status === "success" &&
              Date.now() - startTime >= videoFallbackMs
            ) {
              const img =
                _q2("tile_video_poster", tile) || _q2("tile_image", tile);
              if (img) {
                const imgSrc = img.src || "";
                const imgRaw = img.getAttribute("src") || "";
                const isValidUrl =
                  imgSrc.startsWith("http") &&
                  !imgSrc.includes("media.html") &&
                  !imgSrc.endsWith(".html") &&
                  !imgRaw.endsWith(".html");
                if (isValidUrl && img.complete && img.naturalWidth > 0) {
                  console.warn(
                    "[TobyFlow] _waitForTileMediaReady: video not in DOM after " +
                      Math.round(videoFallbackMs / 1e3) +
                      "s, falling back to img early",
                  );
                  resolve(img);
                  return;
                }
              }
            }
          } else {
            media =
              _q2("tile_video", tile) ||
              _q2("tile_video_poster", tile) ||
              _q2("tile_image", tile);
          }
          if (media && status === "success") {
            const src = media.src || "";
            const rawSrc = media.getAttribute("src") || "";
            const isVideoMedia = media.tagName === "VIDEO";
            const isVideoBlobOrRelative =
              isVideoMedia &&
              (src.startsWith("blob:") || rawSrc.startsWith("/fx/"));
            const isPlaceholderUrl =
              src.includes("media.html") ||
              src.endsWith(".html") ||
              rawSrc === "media.html" ||
              rawSrc.endsWith(".html");
            const hasValidSrc =
              (isVideoBlobOrRelative ||
                src.startsWith("http://") ||
                src.startsWith("https://")) &&
              !src.includes("chrome-extension") &&
              !isPlaceholderUrl;
            const isLoaded = isVideoMedia
              ? true
              : (allowUnloadedImage && _isAllowedFlowMediaUrl2(src)) ||
                (media.naturalWidth > 0 && media.complete);
            if (hasValidSrc && isLoaded) {
              resolve(media);
              return;
            }
          }
          if (Date.now() - startTime >= timeoutMs) {
            if (preferVideo && allowPoster) {
              const img =
                _q2("tile_video_poster", tile) || _q2("tile_image", tile);
              if (img) {
                const imgSrc = img.src || "";
                const imgRaw = img.getAttribute("src") || "";
                const isValidUrl =
                  imgSrc.startsWith("http") &&
                  !imgSrc.includes("media.html") &&
                  !imgSrc.endsWith(".html") &&
                  !imgRaw.endsWith(".html");
                if (isValidUrl && img.complete && img.naturalWidth > 0) {
                  console.warn(
                    "[TobyFlow] _waitForTileMediaReady: video not ready, falling back to img",
                  );
                  resolve(img);
                  return;
                }
              }
            }
            resolve(null);
            return;
          }
          setTimeout(check, 200);
        };
        check();
      });
    },
    _closeContextMenu2 = function () {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    },
    _closeOwnedContextMenus2 = function (...owners) {
      for (const owner of owners) {
        if (!owner?.isConnected) continue;
        owner.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      }
    },
    _releaseCtxMenuLock2 = function () {
      if (_ctxMenuLockQueue.length > 0) {
        const next = _ctxMenuLockQueue.shift();
        next();
      } else {
        _ctxMenuLocked = false;
        if (!ExecutionBlocker._blocking) {
          document.body.classList.remove("tobyflow-execution-blocking");
        }
      }
    },
    extractFileName2 = function (tile) {
      if (!tile) return null;
      const tileId = _getTileRuntimeId2(tile);
      if (tileId && _fileNameCache.has(tileId))
        return _fileNameCache.get(tileId);
      const nativeMediaId = _getPersistentMediaId2(tile);
      if (
        nativeMediaId &&
        (/^[a-f0-9-]{8,}$/i.test(nativeMediaId) ||
          _isFlowV2AsbIdentity2(nativeMediaId))
      ) {
        if (tileId) _fileNameCache.set(tileId, nativeMediaId);
        return nativeMediaId;
      }
      const urlPattern = _getMediaUrlPattern2();
      if (!urlPattern) return null;
      const candidates = [
        ...tile.querySelectorAll(`img[src*="${urlPattern}"]`),
        ...tile.querySelectorAll(`a[href*="${urlPattern}"]`),
        ...tile.querySelectorAll(`[src*="${urlPattern}"]`),
      ];
      if (candidates.length === 0) {
        const img = _q2("tile_image", tile);
        if (img?.src?.includes(urlPattern)) candidates.push(img);
      }
      for (const el of candidates) {
        const url = el.src || el.href;
        if (!url) continue;
        const fn = extractFileNameFromUrl2(url);
        if (fn) {
          if (tileId) _fileNameCache.set(tileId, fn);
          return fn;
        }
      }
      return null;
    },
    extractAllFileNames2 = function (tile) {
      if (!tile) return [];
      const persistentMediaId = _getPersistentMediaId2(tile);
      const nativeIds = persistentMediaId ? [persistentMediaId] : [];
      const urlPattern = _getMediaUrlPattern2();
      const names = [];
      const seen = new Set(nativeIds);
      names.push(...seen);
      const isV2 = _flowPageContext?.driverKey === "flow_v2";
      const isV2Video = isV2 && _q2("tile_video_owner", tile);
      const configuredMedia = [
        _q2("tile_video", tile),
        _q2("tile_video_poster", tile),
        isV2Video ? null : _q2("tile_image", tile),
      ].filter(Boolean);
      for (const media of configuredMedia) {
        const value =
          media.currentSrc ||
          media.src ||
          media.href ||
          media.getAttribute?.("src") ||
          "";
        const asb = _getFlowV2AsbMediaId2(value);
        if (asb && !seen.has(asb)) {
          seen.add(asb);
          names.push(asb);
        }
        try {
          const parsed = new URL(value, location.href);
          const match =
            parsed.hostname === "flow-content.google"
              ? parsed.pathname.match(
                  /^\/(?:video|image)\/([0-9a-f-]{36})(?:\/|$)/i,
                )
              : null;
          const uuid = match?.[1] || null;
          if (uuid && !seen.has(uuid)) {
            seen.add(uuid);
            names.push(uuid);
          }
        } catch (_) {}
      }
      if (isV2 || !urlPattern) return names;
      for (const el of tile.querySelectorAll(
        `[src*="${urlPattern}"], a[href*="${urlPattern}"]`,
      )) {
        const name = extractFileNameFromUrl2(el.src || el.href || "");
        if (name && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      }
      return names;
    },
    extractFileNameFromUrl2 = function (url) {
      if (!url || !url.includes(_getMediaUrlPattern2())) return null;
      try {
        const urlObj = new URL(url, window.location.origin);
        const name = urlObj.searchParams.get("name");
        if (name && /^[a-f0-9-]{8,}$/i.test(name)) return name;
        const input = urlObj.searchParams.get("input");
        if (input) {
          const parsed = JSON.parse(decodeURIComponent(input));
          const json = parsed?.json || parsed?.["0"]?.json || parsed;
          if (json?.name && /^[a-f0-9-]{8,}$/i.test(json.name))
            return json.name;
        }
      } catch (e) {}
      return null;
    },
    extractThumbnailUrl2 = function (tile) {
      if (!tile) return null;
      if (
        _flowPageContext?.driverKey === "flow_v2" &&
        _q2("tile_video_owner", tile)
      ) {
        const videoPoster = _q2("tile_video_poster", tile);
        if (videoPoster?.src) return videoPoster.src;
      }
      const _muPat = _getMediaUrlPattern2();
      if (_muPat) {
        const imgFlow = tile.querySelector(`img[src*="${_muPat}"]`);
        if (imgFlow?.src) return imgFlow.src;
        const video = tile.querySelector(`video[src*="${_muPat}"]`);
        if (video?.src) return video.src;
      }
      const imgCdn = _q2("tile_image", tile);
      if (imgCdn?.src) return imgCdn.src;
      const anyImg = tile.querySelector('img[src^="http"]');
      if (anyImg?.src) return anyImg.src;
      const relativeImg = tile.querySelector('img[src^="/fx/"]');
      if (relativeImg?.src) return relativeImg.src;
      return null;
    },
    _stripMediaUrlType2 = function (url) {
      try {
        if (!url || typeof url !== "string") return null;
        const u = new URL(url, window.location.origin);
        if (!u.searchParams.has("mediaUrlType")) return null;
        u.searchParams.delete("mediaUrlType");
        return u.href;
      } catch (_) {
        return null;
      }
    },
    extractVideoUrl2 = function (tile) {
      if (!tile) return null;
      const video = _q2("tile_video", tile);
      if (!video) {
        const poster = _q2("tile_video_poster", tile);
        const posterUrl =
          poster?.currentSrc || poster?.src || extractThumbnailUrl2(tile) || "";
        const derivedUrl = _deriveFlowV2VideoUrlFromPoster2(posterUrl);
        if (derivedUrl) {
          console.debug(
            "[extractVideoUrl] Flow V2 playback derived from at-rest poster",
          );
          return derivedUrl;
        }
        return null;
      }
      let videoUrl = video.src || video.currentSrc || "";
      if (!videoUrl) return null;
      if (!videoUrl.startsWith("http")) {
        try {
          videoUrl = new URL(videoUrl, window.location.origin).href;
        } catch (e) {
          console.warn("[extractVideoUrl] Cannot resolve:", videoUrl);
          return null;
        }
      }
      _rememberFlowVideoStreamUrl2(videoUrl);
      return videoUrl;
    },
    extractFlowFileInfo2 = function (tile) {
      if (!tile) return null;
      const link = _q2("project_link", tile);
      if (!link) return null;
      const match = link.href.match(
        /\/project\/([a-f0-9-]+)\/edit\/([a-f0-9-]+)/,
      );
      if (!match) return null;
      return { project_id: match[1], file_id: match[2] };
    },
    getCurrentProjectId2 = function () {
      if (location.origin === "https://flow.google.com")
        return FlowDriverRegistry.projectIdForUrl(location.href);
      const urlMatch = location.pathname.match(/\/project\/([a-f0-9-]+)/);
      if (urlMatch) return urlMatch[1];
      if (!location.pathname.includes("/project/")) {
        return null;
      }
      const link = _q2("project_link");
      if (link) {
        const m = link.href.match(/\/project\/([a-f0-9-]+)/);
        if (m) return m[1];
      }
      return null;
    },
    _isFlowProjectErrorState2 = function () {
      if (!location.pathname.includes("/project/")) return false;
      if (!_selectorConfig?.flow?.selectors) return false;
      if (
        _q2("slate_editor") ||
        _q2("submit_button") ||
        _q2("tile_container")
      ) {
        return false;
      }
      return !!(
        _q2("project_error_indicator") ||
        document.querySelector('#__next a[href$="/tools/flow"]')
      );
    },
    _isFlowSignedOut2 = function () {
      try {
        if (location.pathname.includes("/project/")) return false;
        if (!_selectorConfig?.flow?.selectors) return false;
        if (
          _q2("tile_container") ||
          _q2("slate_editor") ||
          _q2("project_link")
        ) {
          return false;
        }
        const cfg = _getDynamicSelector2("signed_out_indicator");
        if (!cfg) return false;
        if (Array.isArray(cfg.selectors) && cfg.selectors.length) {
          try {
            if (document.querySelector(cfg.selectors.join(", "))) return true;
          } catch (_) {}
        }
        const textsOut = _cfgList2(cfg?.text_match);
        if (!textsOut.length) return false;
        const textsIn = _cfgList2(
          _getDynamicSelector2("new_project_button")?.text_match,
        );
        const buttons = document.querySelectorAll('button, a[role="button"]');
        const labels = [];
        for (const el of buttons) {
          const t = (el.textContent || "").trim().toLowerCase();
          if (!t || t.length > 60) continue;
          for (const m of textsIn) {
            if (m && t.includes(String(m).toLowerCase())) return false;
          }
          labels.push(t);
        }
        for (const t of labels) {
          for (const m of textsOut) {
            if (m && t.includes(String(m).toLowerCase())) return true;
          }
        }
        return false;
      } catch (_) {
        return false;
      }
    },
    _isFlowMediaViewerOpen2 = function () {
      return /\/project\/[^/]+\/edit\/[^/]+/.test(location.pathname);
    },
    _deriveFlowV2VideoUrlFromPoster2 = function (posterUrl) {
      const cfg = _getDynamicSelector2("tile_video");
      const suffix =
        typeof cfg?.playback_url_suffix === "string"
          ? cfg.playback_url_suffix
          : "";
      const pattern =
        typeof cfg?.poster_transform_pattern === "string"
          ? cfg.poster_transform_pattern
          : "";
      if (!posterUrl || !suffix || !pattern || pattern.length > 120) return "";
      try {
        const url = new URL(posterUrl, location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith("/asb/"))
          return "";
        if (url.pathname.endsWith(suffix)) return url.href;
        url.pathname =
          url.pathname.replace(new RegExp(pattern, "i"), "") + suffix;
        return url.href;
      } catch (_) {
        return "";
      }
    },
    _deriveFlowV2PosterUrlFromVideo2 = function (videoUrl) {
      const cfg = _getDynamicSelector2("tile_video");
      const suffix =
        typeof cfg?.playback_url_suffix === "string"
          ? cfg.playback_url_suffix
          : "";
      const posterSuffix =
        typeof cfg?.poster_url_suffix === "string" ? cfg.poster_url_suffix : "";
      const pattern =
        typeof cfg?.poster_transform_pattern === "string"
          ? cfg.poster_transform_pattern
          : "";
      if (
        !videoUrl ||
        !posterSuffix ||
        (!suffix && !pattern) ||
        pattern.length > 120
      )
        return "";
      try {
        const url = new URL(videoUrl, location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith("/asb/"))
          return "";
        const before = url.pathname;
        const identityPath =
          suffix && before.endsWith(suffix)
            ? before.slice(0, -suffix.length)
            : pattern
              ? before.replace(new RegExp(pattern, "i"), "")
              : before;
        if (identityPath === before) return "";
        url.pathname = identityPath + posterSuffix;
        return url.href;
      } catch (_) {
        return "";
      }
    },
    _activateFlowV2VideoTile2 = function (tile, mountedVideo = null) {
      if (!tile) return;
      const owner = _q2("tile_video_owner", tile) || tile;
      const poster = _q2("tile_video_poster", tile);
      const targets = [
        ...new Set(
          [
            owner,
            owner?.firstElementChild,
            poster?.parentElement,
            poster,
          ].filter(Boolean),
        ),
      ];
      const mouseOptions = { bubbles: true, cancelable: true, view: window };
      const pointerOptions = {
        ...mouseOptions,
        pointerType: "mouse",
        isPrimary: true,
      };
      for (const target of targets) {
        try {
          target.dispatchEvent(new PointerEvent("pointerover", pointerOptions));
        } catch (_) {}
        try {
          target.dispatchEvent(
            new PointerEvent("pointerenter", pointerOptions),
          );
        } catch (_) {}
        try {
          target.dispatchEvent(new PointerEvent("pointermove", pointerOptions));
        } catch (_) {}
        try {
          target.dispatchEvent(new MouseEvent("mouseover", mouseOptions));
        } catch (_) {}
        try {
          target.dispatchEvent(new MouseEvent("mouseenter", mouseOptions));
        } catch (_) {}
        try {
          target.dispatchEvent(new MouseEvent("mousemove", mouseOptions));
        } catch (_) {}
      }
      if (mountedVideo) {
        try {
          mountedVideo.muted = true;
          mountedVideo.play()?.catch?.(() => {});
        } catch (_) {}
      }
    },
    findTileByFileId2 = function (fileId) {
      if (!fileId) return null;
      const editLinks = _qa2("edit_link");
      let link = null;
      for (const el of editLinks) {
        if (el.href && el.href.includes(`/edit/${fileId}`)) {
          link = el;
          break;
        }
      }
      return link ? link.closest(_getTileSelectorString2()) : null;
    },
    resolveTileByFileName2 = function (fileName) {
      if (!fileName) return null;
      const sel = _getTileSelectorString2();
      if (!sel) return null;
      const allTiles = document.querySelectorAll(sel);
      const matches = [];
      for (const tile of allTiles) {
        const aliases =
          _flowPageContext?.driverKey === "flow_v2"
            ? _flowV2OutputIdentityAliases2(tile)
            : extractAllFileNames2(tile);
        if (aliases.includes(fileName)) matches.push(tile);
      }
      return matches.length === 1 ? matches[0] : null;
    },
    _flowV2OutputIdentityAliases2 = function (tile) {
      const own = _getPersistentMediaId2(tile);
      const native = _getObservedFlowMediaMetadata2(own);
      return [
        ...new Set(
          [
            own,
            ...extractAllFileNames2(tile),
            native?.media_uuid,
            native?.persistent_media_id,
          ].filter(Boolean),
        ),
      ];
    },
    _tileOwnsDownloadIdentity2 = function (tile, fileName) {
      if (!tile || !fileName) return false;
      if (_flowPageContext?.driverKey === "flow_v2") {
        return _flowV2OutputIdentityAliases2(tile).includes(fileName);
      }
      return extractAllFileNames2(tile).includes(fileName);
    },
    _resolveDownloadTileByFileName2 = function (fileName) {
      if (!fileName) return null;
      const sel = _getTileSelectorString2();
      if (!sel) return null;
      const matches = [...document.querySelectorAll(sel)].filter((tile) =>
        _tileOwnsDownloadIdentity2(tile, fileName),
      );
      return matches.length === 1 ? matches[0] : null;
    },
    extractProjectName2 = function () {
      if (!location.pathname.match(/\/project\/[a-f0-9-]+/)) {
        return null;
      }
      const projectNameLabels = _getFlowLocaleStrings2(
        "project_name_input",
        "aria_labels",
      );
      const inputs = _queryInputsByAriaLabels2(projectNameLabels);
      const _slSel2 = _getSlateEditorSelectorString2();
      const slateEditor = _slSel2 ? document.querySelector(_slSel2) : null;
      let promptContainer = null;
      if (slateEditor) {
        let probe = slateEditor.parentElement;
        for (let i = 0; i < 6 && probe; i++) {
          if (probe.children.length > 1) {
            promptContainer = probe;
            break;
          }
          probe = probe.parentElement;
        }
        if (!promptContainer) {
          promptContainer =
            slateEditor.parentElement?.parentElement?.parentElement;
        }
      }
      for (const input of inputs) {
        if (!input.closest("nav")) continue;
        if (input.closest(_getTileSelectorString2())) continue;
        if (input.closest('[role="dialog"]')) continue;
        if (promptContainer && promptContainer.contains(input)) continue;
        if (slateEditor && input.closest("[data-slate-editor]")) continue;
        const val = input.value?.trim();
        if (val) return val;
      }
      const title = document.title;
      if (title) {
        const parts = title.split(/\s*[-–—|]\s*/);
        for (const part of parts) {
          const candidate = part.trim();
          if (!candidate || candidate.length === 0 || candidate.length >= 100)
            continue;
          const lower = candidate.toLowerCase();
          if (
            lower === "flow" ||
            lower === "labs" ||
            lower.includes("labs.google") ||
            lower.includes("google")
          )
            continue;
          return candidate;
        }
      }
      return null;
    },
    _collectFlowProjects2 = function () {
      const projects = [];
      const seen = new Set();
      let flowOrder = 0;
      const links = _qa2("project_link");
      for (const link of links) {
        const currentProject =
          location.origin === "https://flow.google.com"
            ? FlowDriverRegistry.projectIdForUrl(link.href)
            : null;
        const m =
          location.origin === "https://flow.google.com"
            ? currentProject
              ? [null, currentProject]
              : null
            : link.href.match(/\/project\/([a-f0-9-]+)/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const order = flowOrder++;
        const projectCardSelector = _selStr2("project_card");
        const card =
          (projectCardSelector ? link.closest(projectCardSelector) : null) ||
          link.closest(_getTileSelectorString2()) ||
          link.parentElement;
        let name = null;
        if (card) {
          let renameInput = null;
          const renameLabels = _getFlowLocaleStrings2(
            "project_name_input",
            "aria_labels",
          );
          for (const label of renameLabels) {
            renameInput = card.querySelector(`input[aria-label="${label}"]`);
            if (renameInput) break;
          }
          if (renameInput?.value?.trim()) name = renameInput.value.trim();
          if (!name) {
            const title = _q2("project_title", card);
            if (title?.textContent?.trim())
              name = title.textContent.replace(/\s+/g, " ").trim();
          }
          if (!name) {
            const ariaLabel =
              link.getAttribute("aria-label") ||
              card.getAttribute("aria-label");
            if (ariaLabel && ariaLabel.length < 100) name = ariaLabel;
          }
          if (!name) {
            const textEls = card.querySelectorAll("span, p");
            for (const el of textEls) {
              if (el.closest("button")) continue;
              let directText = "";
              for (const node of el.childNodes) {
                if (node.nodeType === 3) directText += node.textContent;
              }
              const txt = directText.trim();
              if (!txt || txt.length > 80) continue;
              if (/^\d+$/.test(txt)) continue;
              if (
                /^(chỉnh sửa|xoá|xóa|edit|delete|remove|sửa|new project|tạo|create)/i.test(
                  txt,
                )
              )
                continue;
              name = txt;
              break;
            }
          }
        }
        projects.push({ id: m[1], name, flowOrder: order });
      }
      return projects;
    },
    getUniqueTileIds2 = function (forceRefresh = false) {
      if (forceRefresh) {
        _invalidateTileCache2();
      }
      const tiles = _getCachedTiles2();
      return [...new Set([...tiles].map(_getTileRuntimeId2).filter(Boolean))];
    },
    getExistingFileNames2 = function () {
      const fileNameSet = new Set();
      for (const tile of _getCachedTiles2()) {
        const id = _getPersistentMediaId2(tile);
        if (id && (/^[a-f0-9-]{8,}$/i.test(id) || _buildFlowV2AsbMediaUrl2(id)))
          fileNameSet.add(id);
      }
      const _pat = _getMediaUrlPattern2();
      if (!_pat) return fileNameSet;
      const mediaEls = document.querySelectorAll(
        `[src*="${_pat}"], [href*="${_pat}"]`,
      );
      for (const el of mediaEls) {
        const url = el.src || el.href || "";
        const fn = extractFileNameFromUrl2(url);
        if (fn) fileNameSet.add(fn);
      }
      return fileNameSet;
    },
    isTileComplete2 = function (tile) {
      if (!tile) return false;
      return !!_getPersistentMediaId2(tile);
    },
    validateTileFile2 = function (tileId, expectedFileName) {
      if (!expectedFileName) return true;
      const tile = _getTileById2(tileId);
      if (!tile) return false;
      const currentFileName =
        _getPersistentMediaId2(tile) || extractFileName2(tile);
      if (!currentFileName) return true;
      return currentFileName === expectedFileName;
    },
    clickTileRetryButton2 = function (tileId) {
      const tile = _getTileById2(tileId);
      if (!tile) return false;
      if (_getTileRuntimeId2(tile) !== tileId) {
        console.warn(
          "[Flow:tile_retry] Runtime id no longer owns resolved grid \u2014 skip retry",
          {
            requested: String(tileId || "").slice(0, 20),
            resolved: String(_getTileRuntimeId2(tile) || "").slice(0, 20),
          },
        );
        return false;
      }
      const config = _getDynamicSelector2("tile_retry_button");
      if (
        !config ||
        !Array.isArray(config.selectors) ||
        config.selectors.length === 0
      ) {
        console.warn(
          '[Flow:tile_retry] Config missing/empty \u2014 skip retry. \u0110\u1EE3i server config sync ho\u1EB7c admin seed key "tile_retry_button".',
        );
        return false;
      }
      const selectors = config.selectors;
      const iconText = config.icon_text || null;
      const buttonTextList = Array.isArray(config.button_text)
        ? config.button_text
        : [];
      const errorOwner = _q2("tile_error_owner", tile);
      const retryRoot = errorOwner || tile;
      let candidates = [];
      for (const sel of selectors) {
        try {
          let found = retryRoot.querySelectorAll(sel);
          if (found.length === 0 && errorOwner)
            found = tile.querySelectorAll(sel);
          found = Array.from(found).filter(
            (button) => !errorOwner || errorOwner.contains(button),
          );
          candidates.push(...found);
        } catch (e) {}
      }
      if (candidates.length === 0) {
        console.warn(
          "[Flow:tile_retry] No button candidates matched server selectors:",
          selectors,
        );
        return false;
      }
      const matchingButtons = [];
      for (const btn of candidates) {
        if (iconText) {
          const icon = _findIconInElement2(btn);
          if (icon && icon.textContent.trim() === iconText) {
            matchingButtons.push(btn);
            continue;
          }
        }
        if (buttonTextList.length > 0) {
          const btnText = (btn.textContent || "").trim();
          if (
            btnText &&
            buttonTextList.some((label) => btnText.includes(label))
          ) {
            matchingButtons.push(btn);
          }
        }
      }
      const uniqueMatchingButtons = [...new Set(matchingButtons)];
      if (uniqueMatchingButtons.length !== 1) {
        console.warn(
          "[Flow:tile_retry] Expected exactly one retry button in grid \u2014 skip retry",
          {
            tileId: String(tileId || "").slice(0, 20),
            matches: uniqueMatchingButtons.length,
          },
        );
        return false;
      }
      const retryBtn = uniqueMatchingButtons[0];
      const tileSelector = _getTileSelectorString2();
      let owningGrid = null;
      try {
        owningGrid = tileSelector ? retryBtn.closest(tileSelector) : null;
      } catch (_) {}
      if (
        owningGrid !== tile ||
        !errorOwner ||
        !errorOwner.contains(retryBtn)
      ) {
        console.warn(
          "[Flow:tile_retry] Retry button belongs to a different grid \u2014 skip retry",
          {
            tileId: String(tileId || "").slice(0, 20),
            exactGrid: owningGrid === tile,
            exactErrorOwner: !!errorOwner?.contains(retryBtn),
          },
        );
        return false;
      }
      if (_flowPageContext?.driverKey === "flow_v2") {
        try {
          retryBtn.click();
          console.log(
            "[Flow:tile_retry] Exact owner button.click dispatched:",
            String(tileId || "").slice(0, 20),
          );
          return true;
        } catch (e) {
          console.warn(
            "[Flow:tile_retry] Exact owner button.click failed:",
            e?.message || e,
          );
          return false;
        }
      }
      const propsKey = Object.keys(retryBtn).find((k) =>
        k.startsWith("__reactProps$"),
      );
      if (
        propsKey &&
        retryBtn[propsKey] &&
        typeof retryBtn[propsKey].onClick === "function"
      ) {
        try {
          retryBtn[propsKey].onClick({
            preventDefault: function () {},
            stopPropagation: function () {},
            nativeEvent: new MouseEvent("click"),
            type: "click",
            target: retryBtn,
            currentTarget: retryBtn,
          });
          return true;
        } catch (e) {
          console.warn("[TobyFlow] React onClick retry failed:", e.message);
        }
      }
      simulateClick2(retryBtn);
      return true;
    },
    clickUploadRetryButton2 = function (tileId) {
      const tile = _getTileById2(tileId);
      if (!tile) return false;
      const config = _getDynamicSelector2("tile_retry_button");
      if (
        !config ||
        !Array.isArray(config.selectors) ||
        config.selectors.length === 0
      ) {
        console.warn(
          '[Flow:upload_retry] Config missing/empty \u2014 skip retry. Check key "tile_retry_button" trong admin.',
        );
        return false;
      }
      const selectors = config.selectors;
      const iconText = config.icon_text || null;
      const buttonTextList = _cfgList2(config.button_text);
      let candidates = [];
      for (const sel of selectors) {
        try {
          const found = tile.querySelectorAll(sel);
          candidates.push(...found);
        } catch (e) {}
      }
      if (candidates.length === 0) {
        console.warn(
          "[Flow:upload_retry] No button candidates matched server selectors:",
          selectors,
        );
        return false;
      }
      let retryBtn = null;
      for (const btn of candidates) {
        if (iconText) {
          const icon = _findIconInElement2(btn);
          if (icon && icon.textContent.trim() === iconText) {
            retryBtn = btn;
            break;
          }
        }
        if (buttonTextList.length > 0) {
          const btnText = (btn.textContent || "").trim();
          if (
            btnText &&
            buttonTextList.some((label) => btnText.includes(label))
          ) {
            retryBtn = btn;
            break;
          }
        }
      }
      if (!retryBtn) {
        console.warn(
          "[Flow:upload_retry] No button matched icon_text/button_text criteria",
        );
        return false;
      }
      const propsKey = Object.keys(retryBtn).find((k) =>
        k.startsWith("__reactProps$"),
      );
      if (
        propsKey &&
        retryBtn[propsKey] &&
        typeof retryBtn[propsKey].onClick === "function"
      ) {
        try {
          retryBtn[propsKey].onClick({
            preventDefault: function () {},
            stopPropagation: function () {},
            nativeEvent: new MouseEvent("click"),
            type: "click",
            target: retryBtn,
            currentTarget: retryBtn,
          });
          console.log(
            "[Flow:upload_retry] React onClick triggered for tile:",
            tileId,
          );
          return true;
        } catch (e) {
          console.warn("[Flow:upload_retry] React onClick failed:", e.message);
        }
      }
      simulateClick2(retryBtn);
      console.log(
        "[Flow:upload_retry] Native click triggered for tile:",
        tileId,
      );
      return true;
    },
    detectTileStatus2 = function (tileEl) {
      if (!tileEl) return "processing";
      var _statusTileId = _getTileRuntimeId2(tileEl);
      if (_statusTileId) {
        var _cached = _statusCache.get(_statusTileId);
        if (_cached && Date.now() - _cached.ts < 1500) return _cached.status;
      }
      if (_flowPageContext?.driverKey === "flow_v2") {
        if (
          _q2("tile_error_owner", tileEl) ||
          _v2FindSemanticControl2("tile_retry_button", tileEl)
        ) {
          return "failed";
        }
        const media2 = _q2("tile_video", tileEl) || _q2("tile_image", tileEl);
        const mediaUrl =
          media2?.currentSrc ||
          media2?.src ||
          media2?.getAttribute?.("src") ||
          "";
        if (mediaUrl && _isAllowedFlowMediaUrl2(mediaUrl)) {
          if (_statusTileId)
            _statusCache.set(_statusTileId, {
              status: "success",
              ts: Date.now(),
            });
          return "success";
        }
        if (_q2("tile_video_owner", tileEl) && !_q2("tile_pending", tileEl)) {
          if (_statusTileId)
            _statusCache.set(_statusTileId, {
              status: "success",
              ts: Date.now(),
            });
          return "success";
        }
        return "processing";
      }
      const media = _q2("tile_video", tileEl) || tileEl.querySelector("img");
      if (media && media.src && !media.src.startsWith("data:")) {
        const mediaSrc = media.src || "";
        const rawSrc = media.getAttribute("src") || "";
        const isPlaceholder =
          mediaSrc.includes("media.html") ||
          mediaSrc.endsWith(".html") ||
          rawSrc === "media.html" ||
          rawSrc.endsWith(".html") ||
          (!mediaSrc.startsWith("http://") &&
            !mediaSrc.startsWith("https://") &&
            !mediaSrc.startsWith("blob:"));
        if (!isPlaceholder) {
          if (_statusTileId)
            _statusCache.set(_statusTileId, {
              status: "success",
              ts: Date.now(),
            });
          return "success";
        }
      }
      const progressEl = Array.from(tileEl.querySelectorAll("div")).find(
        (d) => {
          if (d.children.length > 2) return false;
          return /^\d+%$/.test(d.textContent.trim());
        },
      );
      if (progressEl) {
        if (_statusTileId)
          _statusCache.set(_statusTileId, {
            status: "processing",
            ts: Date.now(),
          });
        return "processing";
      }
      const _isElVisible = (el) => {
        try {
          const c = window.getComputedStyle(el);
          if (
            c.opacity === "0" ||
            c.visibility === "hidden" ||
            c.display === "none"
          )
            return false;
        } catch (e) {}
        let p = el.parentElement;
        while (p && p !== tileEl) {
          if (p.style && p.style.opacity === "0") return false;
          try {
            const c = window.getComputedStyle(p);
            if (
              c.opacity === "0" ||
              c.visibility === "hidden" ||
              c.display === "none"
            )
              return false;
          } catch (e) {}
          p = p.parentElement;
        }
        return true;
      };
      const genIcon = Array.from(tileEl.querySelectorAll("i")).find(
        (el) => el.textContent.trim() === "play_circle",
      );
      if (genIcon && _isElVisible(genIcon)) {
        return "processing";
      }
      const warningConfig = _getDynamicSelector2("warning_icon");
      const warningTexts = _cfgList2(warningConfig?.text_match);
      if (!warningTexts.length) {
        console.debug(
          "[Tier3] warning detection: warning_icon.text_match cache miss",
        );
      }
      let warningIcons = [];
      if (
        Array.isArray(warningConfig?.selectors) &&
        warningConfig.selectors.length > 0
      ) {
        for (const sel of warningConfig.selectors) {
          try {
            const found = tileEl.querySelectorAll(sel);
            if (found.length > 0) {
              warningIcons = Array.from(found);
              break;
            }
          } catch (e) {}
        }
      }
      for (const icon of warningIcons) {
        if (!warningTexts.includes(icon.textContent.trim())) continue;
        let isHidden = false;
        try {
          const iconComputed = window.getComputedStyle(icon);
          if (
            iconComputed.opacity === "0" ||
            iconComputed.visibility === "hidden" ||
            iconComputed.display === "none"
          ) {
            isHidden = true;
          }
        } catch (e) {}
        if (!isHidden) {
          let parent = icon.parentElement;
          while (parent && parent !== tileEl) {
            if (parent.style && parent.style.opacity === "0") {
              isHidden = true;
              break;
            }
            try {
              const computed = window.getComputedStyle(parent);
              if (
                computed.opacity === "0" ||
                computed.visibility === "hidden" ||
                computed.display === "none"
              ) {
                isHidden = true;
                break;
              }
            } catch (e) {}
            parent = parent.parentElement;
          }
        }
        if (!isHidden) {
          return "failed";
        }
      }
      return "processing";
    },
    extractTileFailureReason2 = function (tileEl) {
      if (!tileEl || detectTileStatus2(tileEl) !== "failed") return null;
      if (_flowPageContext?.driverKey === "flow_v2") {
        const owner = _q2("tile_error_owner", tileEl);
        const message = owner ? _q2("tile_error_message", owner) : null;
        return (message?.textContent || "").replace(/\s+/g, " ").trim() || null;
      }
      return null;
    },
    _isFlowImageLoadError2 = function (tile) {
      if (_flowPageContext?.driverKey !== "flow_v2" || !tile) return false;
      const errorOwner = _q2("tile_error_owner", tile);
      if (!errorOwner) return false;
      const reason = extractTileFailureReason2(tile);
      const retryConfig = _getDynamicSelector2("tile_retry_button");
      if (
        !Array.isArray(retryConfig?.selectors) ||
        !retryConfig.selectors.length
      )
        return false;
      const controls = new Set();
      for (const selector of retryConfig.selectors) {
        try {
          for (const button of tile.querySelectorAll(selector)) {
            if (errorOwner.contains(button)) controls.add(button);
          }
        } catch (_) {}
      }
      if (controls.size !== 1) return false;
      const raw = _getApiConfigValue2(
        "flow",
        "error_patterns",
      )?.image_load_failed_text;
      return (
        !!reason &&
        typeof raw === "string" &&
        raw
          .split("|")
          .some(
            (pattern) => pattern.trim().toLowerCase() === reason.toLowerCase(),
          )
      );
    },
    detectMediaType2 = function (tile) {
      if (!tile) return "image";
      const video = _q2("tile_video", tile);
      if (video) return "video";
      if (_flowPageContext?.driverKey === "flow_v2") {
        if (_q2("tile_video_owner", tile)) return "video";
        const pending = _q2("tile_pending", tile);
        const videoIconText =
          _getDynamicSelector2("tile_pending")?.video_icon_text || null;
        if (
          pending &&
          videoIconText &&
          _findIconInElement2(pending)?.textContent?.trim() === videoIconText
        )
          return "video";
        return "image";
      }
      const img = tile.querySelector("img");
      if (img?.alt?.toLowerCase().includes("video")) return "video";
      if (
        Array.from(tile.querySelectorAll("i")).some(
          (el) => el.textContent.trim() === "play_circle",
        )
      )
        return "video";
      return "image";
    },
    extractTileProgress2 = function (tileEl) {
      if (!tileEl) return null;
      if (_flowPageContext?.driverKey === "flow_v2") {
        const configured =
          _getDynamicSelector2("tile_pending")?.progress_selectors;
        if (!Array.isArray(configured) || configured.length === 0) return null;
        for (const selector of configured) {
          let candidates = [];
          try {
            candidates = tileEl.querySelectorAll(selector);
          } catch (_) {
            continue;
          }
          for (const el2 of candidates) {
            const match = (el2.textContent || "").trim().match(/^(\d{1,3})%$/);
            if (match) return Math.min(100, parseInt(match[1], 10));
          }
        }
        return null;
      }
      var els = tileEl.querySelectorAll("span, div, p");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.children.length > 2) continue;
        var text = el.textContent.trim();
        if (/^\d{1,3}%$/.test(text)) {
          return parseInt(text, 10);
        }
      }
      return null;
    },
    isHumanizedEnabled2 = function () {
      return window._afSettings?.humanizedMode || false;
    },
    getHumanizedSpeed2 = function () {
      return window._afSettings?.humanizedSpeed || 0.5;
    },
    getHumanizedDelay2 = function (baseMs) {
      const speed = getHumanizedSpeed2();
      const adjusted = baseMs / speed;
      const jitter = adjusted * 0.3;
      return adjusted + (Math.random() * 2 - 1) * jitter;
    },
    injectSlateBridge2 = function () {},
    _slateBridgeCall2 = function (action, detail) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
        let timer;
        const requestId = Math.random().toString(36).substr(2, 9);
        console.log("[TobyFlow] Bridge call:", action, "rid:", requestId);
        let resolved = false;
        const handler = (e) => {
          if (e.source !== window) return;
          if (
            e.data &&
            e.data.source === "flow-auto-slate-result" &&
            e.data.requestId === requestId
          ) {
            resolved = true;
            clearTimeout(timer);
            window.removeEventListener("message", handler);
            console.log(
              "[TobyFlow] Bridge response:",
              action,
              e.data.success,
              e.data.error || "",
              "elapsedMs:",
              Date.now() - startedAt,
            );
            const { source: _s, requestId: _r, ...rest } = e.data;
            resolve(rest);
          }
        };
        window.addEventListener("message", handler);
        window.postMessage(
          {
            source: "flow-auto-slate",
            action,
            requestId,
            slateSelector: _getSlateEditorSelectorString2(),
            ...detail,
          },
          window.location.origin,
        );
        const _btMs = action === "armFilePickerTrap" ? 15e3 : 3e3;
        timer = setTimeout(() => {
          if (!resolved) {
            window.removeEventListener("message", handler);
            console.warn(
              "[TobyFlow] Bridge TIMEOUT:",
              action,
              requestId,
              "elapsedMs:",
              Date.now() - startedAt,
              "budgetMs:",
              _btMs,
            );
            resolve({ success: false, error: "Bridge timeout" });
          }
        }, _btMs);
      });
    },
    _isFlowControlDisabled2 = function (control) {
      if (!control) return true;
      if (control.disabled || control.hasAttribute("disabled")) return true;
      if (
        (control.getAttribute("aria-disabled") || "").toLowerCase() === "true"
      )
        return true;
      const disabledClasses = _cfgList2(
        _getDynamicSelector2("submit_button")?.disabled_classes,
      );
      return disabledClasses.some((className) =>
        control.classList?.contains(className),
      );
    },
    _flowV2IngredientChips2 = function (key) {
      const bar = _q2("ingredient_bar");
      return bar ? Array.from(_qa2(key, bar)) : [];
    },
    readCurrentSettings2 = function () {
      const submitBtn = getSubmitButton2();
      const settingsBtn = getSettingsButton2(submitBtn);
      if (!settingsBtn) return null;
      let ratioIcon = null;
      const icons = _findIconsInElement2(settingsBtn);
      const settingsIconPrefix =
        _getDynamicSelector2("settings_button")?.icon_text;
      if (settingsIconPrefix) {
        for (const icon of icons) {
          const t = icon.textContent.trim();
          if (t.startsWith(settingsIconPrefix)) {
            ratioIcon = t;
            break;
          }
        }
      }
      let quantity = null;
      for (const node of settingsBtn.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const t = (node.textContent || "").trim();
        if (!t) continue;
        const m = t.match(/^(\d)x$|^x(\d)$/);
        if (m) {
          quantity = parseInt(m[1] || m[2]);
          break;
        }
      }
      let model = "";
      for (const node of settingsBtn.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const t = (node.textContent || "").trim();
        if (!t) continue;
        if (/^\d?x\d?$/.test(t)) continue;
        model = t.replace(/^[\u{1F000}-\u{1FFFF}]\s*/u, "").trim();
        break;
      }
      const rawText = settingsBtn.textContent.trim();
      if (!model && !ratioIcon && quantity === null) return null;
      return { model, ratioIcon, quantity, rawText };
    },
    ratioToIconName2 = function (ratio) {
      const r = String(ratio).toLowerCase().trim();
      if (
        r.includes("16:9") ||
        r === "ngang" ||
        r === "widescreen" ||
        r === "16_9"
      )
        return "crop_16_9";
      if (
        r.includes("4:3") ||
        r === "4_3" ||
        r === "ngang 4:3" ||
        r === "landscape"
      )
        return "crop_landscape";
      if (r.includes("1:1") || r === "vu\xF4ng" || r === "square")
        return "crop_square";
      if (
        r.includes("3:4") ||
        r === "3_4" ||
        r === "d\u1ECDc 3:4" ||
        r === "portrait"
      )
        return "crop_portrait";
      if (
        r.includes("9:16") ||
        r === "d\u1ECDc" ||
        r === "story" ||
        r === "9_16"
      )
        return "crop_9_16";
      return null;
    },
    simulateClick2 = function (element) {
      if (!element || !(element instanceof Element)) {
        console.warn("[Flow] simulateClick: invalid element type", element);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.warn(
          "[Flow] simulateClick: element zero-size (hidden/detached), skip",
          element,
        );
        return;
      }
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
          pointerType: "mouse",
        }),
      );
      element.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
      element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
          pointerType: "mouse",
        }),
      );
      element.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    },
    pressFlowEditorSubmit2 = function (editor) {
      if (!editor || !(editor instanceof HTMLElement) || !editor.isConnected)
        return false;
      let keydownDelivered = false;
      const markDelivered = () => {
        keydownDelivered = true;
      };
      editor.addEventListener("keydown", markDelivered, {
        capture: true,
        once: true,
      });
      try {
        editor.focus({ preventScroll: true });
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        const options = {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent("keydown", options));
        editor.dispatchEvent(new KeyboardEvent("keypress", options));
        editor.dispatchEvent(new KeyboardEvent("keyup", options));
      } catch (error) {
        editor.removeEventListener("keydown", markDelivered, { capture: true });
        console.warn(
          "[FlowV2SubmitControl] editor Enter fallback failed:",
          error?.message || error,
        );
        return false;
      }
      console.info(
        "[FlowV2SubmitControl] editor Enter fallback",
        JSON.stringify({ delivered: keydownDelivered }),
      );
      return keydownDelivered;
    },
    simulateContextMenu2 = function (element) {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: x,
          clientY: y,
          pointerType: "mouse",
        }),
      );
      element.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: x,
          clientY: y,
        }),
      );
      element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          buttons: 2,
          clientX: x,
          clientY: y,
        }),
      );
      element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: x,
          clientY: y,
          pointerType: "mouse",
        }),
      );
      element.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: x,
          clientY: y,
        }),
      );
    },
    getExponentialBackoffMs2 = function (retryIdx, retrySettings) {
      const s = retrySettings || {};
      const baseSec = parseInt(s.flowBackoffBaseSec ?? 30, 10);
      const maxSec = parseInt(s.flowBackoffMaxSec ?? 300, 10);
      const jitterPct =
        Math.max(
          0,
          Math.min(50, parseInt(s.flowBackoffJitterPercent ?? 20, 10)),
        ) / 100;
      const baseMs = baseSec * 1e3 * Math.pow(2, Math.max(0, retryIdx));
      const cappedMs = Math.min(baseMs, maxSec * 1e3);
      const jitter = cappedMs * jitterPct * (Math.random() * 2 - 1);
      return Math.round(cappedMs + jitter);
    },
    scanGalleryTiles2 = function () {
      const tileIds = getUniqueTileIds2();
      const results = [];
      for (const tileId of tileIds) {
        const tile = _getTileById2(tileId);
        if (!tile) continue;
        const img = _q2("tile_image", tile);
        const video = _q2("tile_video", tile);
        const typed = _extractTypedTileRecord2(tile, null);
        let mediaType = "unknown";
        let mediaSrc = "";
        let thumbnail = "";
        if (video) {
          mediaType = "video";
          mediaSrc = video.src || video.querySelector("source")?.src || "";
          thumbnail = video.poster || "";
          if (
            !thumbnail &&
            img &&
            img.src &&
            !img.src.startsWith("data:") &&
            !img.src.includes("chrome-extension")
          ) {
            thumbnail = img.src;
          }
          if (!thumbnail) thumbnail = mediaSrc;
        } else if (
          _flowPageContext?.driverKey === "flow_v2" &&
          typed?.mediaType === "video"
        ) {
          mediaType = "video";
          mediaSrc = typed.resultUrl || "";
          thumbnail = typed.thumbnail || mediaSrc;
        } else if (
          img &&
          img.src &&
          !img.src.startsWith("data:") &&
          !img.src.includes("chrome-extension")
        ) {
          mediaType = "image";
          mediaSrc = img.src;
          thumbnail = img.src;
        }
        const status = detectTileStatus2(tile);
        const file_name =
          typed?.persistentMediaId || extractFileName2(tile) || null;
        const flowInfo = extractFlowFileInfo2(tile);
        const resultId = _getPersistableResultId2(tile, tileId);
        results.push({
          tileId: resultId,
          mediaType,
          mediaSrc,
          status,
          thumbnail,
          file_name,
          persistent_media_id: typed?.persistentMediaId || null,
          identity_durability: typed?.durability || "element-local",
          driver_key: typed?.driverKey || null,
          origin: typed?.origin || null,
          operation_id: typed?.operationId || null,
          captured_at: typed?.capturedAt || null,
          url_kind: typed?.urlKind || null,
          ...(flowInfo && {
            file_id: flowInfo.file_id,
            project_id: flowInfo.project_id,
          }),
        });
      }
      return results;
    },
    _flowV2VisiblePageSettingsRoot2 = function (rootSelector) {
      return (
        Array.from(document.querySelectorAll(rootSelector)).find((root) => {
          if (!root.isConnected) return false;
          for (let node = root; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (
              node.hidden ||
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.visibility === "collapse"
            )
              return false;
          }
          return true;
        }) || null
      );
    },
    _checkFlowCreditLimit2 = function () {
      const cfg = _getDynamicSelector2("flow_credit_limit_alert");
      if (!cfg) {
        console.debug(
          "[FlowLimit] flow_credit_limit_alert config missing \u2014 skip check",
        );
        return false;
      }
      const selectors = cfg.selectors?.length ? cfg.selectors : [];
      if (!selectors.length) return false;
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            console.warn(
              `[FlowLimit] \u26A0 Credit limit alert detected via selector "${sel}"`,
            );
            return true;
          }
        } catch (_) {}
      }
      return false;
    },
    _findFlowAgentButton2 = function () {
      const cfg = _getDynamicSelector2("flow_agent_toggle_button");
      if (!cfg) {
        console.log(
          "[FlowAgent] \u26A0 config flow_agent_toggle_button MISSING \u2014 backend c\u1EA7n ch\u1EA1y migration 2026_07_25_100003",
        );
        return null;
      }
      const selectors = cfg.selectors?.length ? cfg.selectors : [];
      const textsMatch = cfg.button_text?.length ? cfg.button_text : [];
      if (!selectors.length || !textsMatch.length) return null;
      for (const sel of selectors) {
        try {
          const candidates = document.querySelectorAll(sel);
          for (const btn of candidates) {
            const icon = _findIconInElement2(btn);
            const text = _stripIconFromButtonText2(btn, icon);
            if (!text) continue;
            if (textsMatch.some((t) => text === t)) {
              return btn;
            }
          }
        } catch (_) {}
      }
      return null;
    },
    _isFlowAgentModeOn2 = function () {
      if (_flowPageContext?.driverKey === "flow_v2") {
        const active = !!_v2QueryVisibleConfigured2("agent_mode_active");
        return { found: active, on: active };
      }
      const btn = _findFlowAgentButton2();
      if (!btn) return { found: false, on: false };
      const cfg = _getDynamicSelector2("flow_agent_toggle_button");
      const onValue = cfg?.aria_pressed_on || "true";
      const isOn = (btn.getAttribute("aria-pressed") || "").trim() === onValue;
      return { found: true, on: isOn };
    },
    _findFlowAgentInstructionDoneButton2 = function () {
      const cfg = _getDynamicSelector2("flow_agent_instruction_done_button");
      if (!cfg) {
        console.log(
          "[FlowAgentInstruction] \u26A0 config flow_agent_instruction_done_button MISSING \u2014 backend c\u1EA7n ch\u1EA1y migration 2026_07_25_100022",
        );
        return null;
      }
      const buttonTexts = cfg.button_text?.length ? cfg.button_text : [];
      const panelLabelTexts = cfg.panel_label_text?.length
        ? cfg.panel_label_text
        : [];
      const walkDepth =
        typeof cfg.anchor_walk_depth === "number" ? cfg.anchor_walk_depth : 6;
      if (!buttonTexts.length || !panelLabelTexts.length) return null;
      let panelLabelEl = null;
      try {
        const allSpans = document.querySelectorAll("span");
        for (const sp of allSpans) {
          const text = (sp.textContent || "").trim();
          if (panelLabelTexts.some((t) => text === t)) {
            panelLabelEl = sp;
            break;
          }
        }
      } catch (_) {}
      if (!panelLabelEl) return null;
      let container = panelLabelEl;
      for (let depth = 0; depth < walkDepth && container; depth++) {
        try {
          const buttons = container.querySelectorAll("button");
          for (const btn of buttons) {
            const icon = _findIconInElement2(btn);
            const text = _stripIconFromButtonText2(btn, icon);
            if (buttonTexts.some((t) => text === t)) {
              return btn;
            }
          }
        } catch (_) {}
        container = container.parentElement;
      }
      return null;
    },
    _isFlowAgentInstructionDialogOpen2 = function () {
      if (_flowPageContext?.driverKey === "flow_v2") {
        const open = !!_v2QueryVisibleConfigured2("agent_instruction_dialog");
        return { found: open, open };
      }
      const btn = _findFlowAgentInstructionDoneButton2();
      return { found: !!btn, open: !!btn };
    },
    _findFlowChatAgentCloseButton2 = function () {
      const cfg = _getDynamicSelector2("flow_chat_agent_close_button");
      if (!cfg) {
        console.log(
          "[FlowChatAgent] \u26A0 config flow_chat_agent_close_button MISSING \u2014 backend c\u1EA7n ch\u1EA1y migration 2026_07_25_100021",
        );
        return null;
      }
      const selectors = cfg.selectors?.length ? cfg.selectors : [];
      const closeIconText = cfg.icon_text || "close";
      const closeTexts = cfg.button_text?.length ? cfg.button_text : [];
      const siblingIconText = cfg.sibling_icon_text || "edit_square";
      const siblingTexts = cfg.sibling_button_text?.length
        ? cfg.sibling_button_text
        : [];
      if (!selectors.length || !closeTexts.length || !siblingTexts.length)
        return null;
      const verbose = !!_tobyVerboseFlowDebug;
      let stats = {
        totalBtns: 0,
        iconCloseMatched: 0,
        textMatched: 0,
        siblingFailed: 0,
        configCfg: cfg,
      };
      for (const sel of selectors) {
        try {
          const candidates = document.querySelectorAll(sel);
          stats.totalBtns += candidates.length;
          for (const btn of candidates) {
            const icon = _findIconInElement2(btn);
            if (!icon || (icon.textContent || "").trim() !== closeIconText)
              continue;
            stats.iconCloseMatched++;
            const text = _stripIconFromButtonText2(btn, icon);
            if (!closeTexts.some((t) => text === t)) {
              if (verbose)
                console.log(
                  `[FlowChatAgent:debug] icon=close but text mismatch: ${JSON.stringify(text)} \u2209 ${JSON.stringify(closeTexts)}`,
                );
              continue;
            }
            stats.textMatched++;
            const parent = btn.parentElement;
            if (!parent) continue;
            const siblings = parent.querySelectorAll("button");
            let hasSessionSibling = false;
            for (const sib of siblings) {
              if (sib === btn) continue;
              const sibIcon = _findIconInElement2(sib);
              if (
                !sibIcon ||
                (sibIcon.textContent || "").trim() !== siblingIconText
              )
                continue;
              const sibText = _stripIconFromButtonText2(sib, sibIcon);
              if (siblingTexts.some((t) => sibText === t)) {
                hasSessionSibling = true;
                break;
              }
            }
            if (!hasSessionSibling) {
              stats.siblingFailed++;
              if (verbose)
                console.log(
                  `[FlowChatAgent:debug] Found close+text match but NO sibling Phi\xEAn m\u1EDBi. Parent has ${siblings.length} button(s).`,
                  btn,
                );
              continue;
            }
            return btn;
          }
        } catch (_) {}
      }
      if (verbose) {
        console.log(`[FlowChatAgent:debug] No match \u2014 stats:`, stats);
      }
      return null;
    },
    _stripIconFromButtonText2 = function (btn, icon) {
      const full = (btn.textContent || "").trim();
      if (!icon) return full;
      const iconText = (icon.textContent || "").trim();
      if (!iconText) return full;
      if (full.startsWith(iconText)) return full.slice(iconText.length).trim();
      if (full.endsWith(iconText))
        return full.slice(0, -iconText.length).trim();
      return full.replace(iconText, "").trim();
    },
    _isFlowChatAgentPanelOpen2 = function () {
      if (_flowPageContext?.driverKey === "flow_v2") {
        const open = !!_v2QueryVisibleConfigured2("agent_panel_owner");
        return { found: open, open };
      }
      const btn = _findFlowChatAgentCloseButton2();
      return { found: !!btn, open: !!btn };
    },
    _showZoomNotice2 = function (textKey, factor) {
      try {
        const inv = factor && factor > 0 ? 1 / factor : 1;
        let notice = document.getElementById("tobyflow-zoom-notice");
        if (!notice) {
          notice = document.createElement("div");
          notice.id = "tobyflow-zoom-notice";
          notice.style.cssText =
            'position:fixed;top:26px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#1fbd53;color:#fff;padding:10px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;max-width:80vw;pointer-events:none;';
          document.body.appendChild(notice);
        }
        notice.innerHTML =
          _ZOOM_NOTICE_SVG + "<span>" + _getTrackerT(textKey) + "</span>";
        notice.style.zoom = String(inv);
        notice.style.display = "flex";
      } catch (_) {}
    },
    _hideZoomNotice2 = function () {
      try {
        const n = document.getElementById("tobyflow-zoom-notice");
        if (n) n.remove();
      } catch (_) {}
    },
    _setCounterScale2 = function (factor) {
      try {
        const inv = factor && factor > 0 ? 1 / factor : 1;
        window._tobyFlowZoomScaleInv = inv;
        const val = inv === 1 ? "" : String(inv);
        const tr = document.getElementById("tobyflow-flow-tracker");
        if (tr) {
          tr.style.transform = "";
          tr.style.transformOrigin = "";
          tr.style.zoom = val;
        }
        const ago = document.querySelector(
          "#tobyflow-api-gen-overlay .tobyflow-ago-inner",
        );
        if (ago) ago.style.zoom = val;
        const toast = document.getElementById("tobyflow-api-gen-notice");
        if (toast) toast.style.zoom = val;
        const notice = document.getElementById("tobyflow-zoom-notice");
        if (notice) notice.style.zoom = val;
      } catch (_) {}
    },
    _clearCounterScale2 = function () {
      _setCounterScale2(1);
    },
    _applyZoomUx2 = function (factor) {
      try {
        _showZoomNotice2("zoomedForFarRef", factor);
        _setCounterScale2(factor);
      } catch (_) {}
    },
    _clearZoomUx2 = function () {
      try {
        _clearCounterScale2();
        _hideZoomNotice2();
      } catch (_) {}
    },
    _zoomGuardSet2 = function (factor, original) {
      try {
        _zoomGuardRefs++;
        chrome.runtime.sendMessage(
          { action: "zoomGuard:begin", factor, original },
          () => {
            void chrome.runtime.lastError;
          },
        );
        if (_zoomGuardHeartbeatTimer) return;
        _zoomGuardHeartbeatTimer = setInterval(() => {
          try {
            chrome.runtime.sendMessage({ action: "zoomGuard:beat" }, () => {
              void chrome.runtime.lastError;
            });
          } catch (_) {}
        }, 2e4);
      } catch (_) {}
    },
    _zoomGuardClear2 = function () {
      try {
        _zoomGuardRefs = Math.max(0, _zoomGuardRefs - 1);
        if (_zoomGuardRefs > 0) return;
        if (_zoomGuardHeartbeatTimer) {
          clearInterval(_zoomGuardHeartbeatTimer);
          _zoomGuardHeartbeatTimer = null;
        }
        chrome.runtime.sendMessage({ action: "zoomGuard:end" }, () => {
          void chrome.runtime.lastError;
        });
      } catch (_) {}
    },
    _zoomGuardRecoverOnLoad2 = function () {
      try {
        chrome.runtime.sendMessage({ action: "zoomGuard:recover" }, (r) => {
          void chrome.runtime.lastError;
          if (r?.recovered)
            console.log(
              `[TobyFlow] zoom guard: kh\xF4i ph\u1EE5c zoom k\u1EB9t \u2192 ${r.original} (session tr\u01B0\u1EDBc ch\u1EBFt gi\u1EEFa ch\u1EEBng)`,
            );
        });
      } catch (_) {}
    },
    _waitZoomPaint2 = function () {
      return new Promise((r) => {
        let done = false;
        const fin = () => {
          if (!done) {
            done = true;
            r();
          }
        };
        requestAnimationFrame(() => requestAnimationFrame(fin));
        setTimeout(fin, 150);
      });
    },
    _armZoomSessionDeadline2 = function () {
      try {
        if (_zoomSessionDeadlineTimer) clearTimeout(_zoomSessionDeadlineTimer);
        _zoomSessionDeadlineTimer = setTimeout(async () => {
          _zoomSessionDeadlineTimer = null;
          const s = window._tobyFlowZoomSession;
          if (!s) return;
          let busy = false;
          try {
            busy =
              typeof ExecutionBlocker !== "undefined" &&
              (!!ExecutionBlocker.isVisible?.() ||
                ExecutionBlocker._pipelineOwned === true);
          } catch (_) {}
          if (busy) {
            _armZoomSessionDeadline2();
            return;
          }
          console.warn(
            "[TobyFlow] zoom session: qu\xE1 h\u1EA1n m\xE0 kh\xF4ng ai nh\u1EA3 + pipeline kh\xF4ng ch\u1EA1y \u2192 t\u1EF1 tr\u1EA3 zoom",
          );
          try {
            await _endZoomSession();
          } catch (_) {}
        }, _ZOOM_SESSION_DEADLINE_MS);
      } catch (_) {}
    },
    _findTilesScroller2 = function () {
      const _fallback = document.scrollingElement || document.documentElement;
      const _canScroll = (el) => {
        if (!el || el === document.body || el === document.documentElement)
          return false;
        if (el.scrollHeight - el.clientHeight < 50) return false;
        const oy = getComputedStyle(el).overflowY;
        return oy === "auto" || oy === "scroll";
      };
      try {
        const tile = document.querySelector(_getTileSelectorString2());
        if (tile) {
          for (
            let el = tile.parentElement, hop = 0;
            el && hop < 30;
            el = el.parentElement, hop++
          ) {
            if (_canScroll(el)) return { el, verified: true };
          }
        }
        let best = null;
        for (const el of document.querySelectorAll("div, main, section")) {
          if (!_canScroll(el)) continue;
          if (!best || el.scrollHeight > best.scrollHeight) best = el;
        }
        if (best) return { el: best, verified: true };
      } catch (e) {
        console.warn("[TobyFlow] _findTilesScroller l\u1ED7i:", e?.message);
      }
      const rootScrolls =
        _fallback && _fallback.scrollHeight - _fallback.clientHeight >= 50;
      return { el: _fallback, verified: !!rootScrolls };
    },
    _createFlowScanRequest2 = function (requestId, deadline) {
      const controller = new AbortController();
      const expiresAt = Number(deadline);
      if (!Number.isFinite(expiresAt) || expiresAt <= 0)
        throw Object.assign(new Error("FLOW_SCAN_TIMEOUT_CONFIG_UNAVAILABLE"), {
          code: "FLOW_SCAN_TIMEOUT_CONFIG_UNAVAILABLE",
          noRetry: true,
        });
      const timeoutError = () =>
        Object.assign(new Error("FLOW_REF_SCAN_TIMEOUT"), {
          code: "FLOW_REF_SCAN_TIMEOUT",
          noRetry: true,
        });
      const control = {
        signal: controller.signal,
        deadline: expiresAt,
        cancel: () =>
          controller.abort(new DOMException("FLOW_SCAN_STOPPED", "AbortError")),
        assertActive: () => {
          if (Date.now() >= expiresAt && !controller.signal.aborted)
            controller.abort(timeoutError());
          if (controller.signal.aborted) throw controller.signal.reason;
        },
      };
      const timer = setTimeout(
        () => controller.abort(timeoutError()),
        Math.max(0, expiresAt - Date.now()),
      );
      control.release = () => {
        clearTimeout(timer);
        if (_flowScanRequests.get(requestId) === control)
          _flowScanRequests.delete(requestId);
      };
      _flowScanRequests.set(requestId, control);
      return control;
    },
    _captureExactUuidImagePreview2 = function (tile, requestedIds) {
      if (!tile || detectMediaType2(tile) !== "image") return null;
      const id = _getPersistentMediaId2(tile);
      if (
        !id ||
        !requestedIds.has(id) ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)
      )
        return null;
      const img = _q2("tile_image", tile);
      const thumbnail = img?.currentSrc || img?.src || "";
      if (!thumbnail || !/^https?:/.test(thumbnail)) return null;
      const persistentId = _getFlowV2AsbMediaId2(thumbnail) || id;
      const displayName = _getTileDisplayName2(tile);
      return {
        id,
        info: {
          thumbnail,
          source_thumbnail: thumbnail,
          type: "image",
          file_name: persistentId,
          persistent_media_id: persistentId,
          media_uuid: id,
          ...(displayName && { display_name: displayName }),
          identity_durability: "durable",
          identity_aliases: [...new Set([id, persistentId])],
        },
      };
    },
    _scanNewTilesInline2 = function (excludeTileIds, excludeFileNames) {
      const excludeIdSet = new Set(excludeTileIds || []);
      const excludeFnSet = new Set((excludeFileNames || []).filter(Boolean));
      const allTiles = document.querySelectorAll(_getTileSelectorString2());
      const newTiles = [];
      const seenTileIds = new Set();
      for (const tile of allTiles) {
        const tileId = _getTileRuntimeId2(tile);
        if (!tileId) continue;
        if (seenTileIds.has(tileId)) continue;
        seenTileIds.add(tileId);
        if (excludeIdSet.has(tileId)) continue;
        const typed = _extractTypedTileRecord2(tile, null);
        const fileName =
          typed?.persistentMediaId || extractFileName2(tile) || null;
        if (fileName && excludeFnSet.has(fileName)) continue;
        newTiles.push({
          tile_id: tileId,
          file_name: fileName || null,
          persistent_media_id: typed?.persistentMediaId || null,
          media_type: detectMediaType2(tile),
          status: typed?.status || detectTileStatus2(tile),
          tile: typed,
        });
      }
      return { success: true, tiles: newTiles };
    },
    _injectTrackerHoverStyles2 = function () {
      if (document.getElementById("tobyflow-tracker-hover-styles")) return;
      var st = document.createElement("style");
      st.id = "tobyflow-tracker-hover-styles";
      st.textContent =
        '#tobyflow-flow-tracker button[data-action="pause"]:hover{background:rgba(255,255,255,0.18)!important;color:#fff!important;}#tobyflow-flow-tracker button[data-action="resume"]:hover{background:rgba(34,197,94,0.34)!important;}#tobyflow-flow-tracker button[data-action="stop"]:hover{background:rgba(239,68,68,0.30)!important;color:#fff!important;}#tobyflow-flow-tracker button[data-action="skip"]:hover{background:rgba(255,255,255,0.24)!important;}#tobyflow-manual-enter-banner .tf-meb-skip:hover{background:rgba(255,255,255,0.32)!important;}#tobyflow-flow-tracker button[data-action="pause"],#tobyflow-flow-tracker button[data-action="resume"],#tobyflow-flow-tracker button[data-action="stop"],#tobyflow-flow-tracker button[data-action="skip"],#tobyflow-manual-enter-banner .tf-meb-skip{transition:background 0.12s ease,color 0.12s ease;}#tobyflow-flow-tracker button.tf-resume-cta{transition:background 0.14s ease,transform 0.14s ease,box-shadow 0.14s ease;}#tobyflow-flow-tracker button.tf-resume-cta[data-action="resume"]:hover{background:linear-gradient(135deg,#3ceb78,#18b552)!important;transform:translateY(-1px)!important;box-shadow:0 6px 18px rgba(22,163,74,0.55),inset 0 1px 0 rgba(255,255,255,0.35)!important;}#tobyflow-flow-tracker button.tf-resume-cta[data-action="resume"]:active{transform:translateY(0)!important;box-shadow:0 2px 8px rgba(22,163,74,0.45),inset 0 1px 0 rgba(255,255,255,0.25)!important;}';
      (document.head || document.documentElement).appendChild(st);
    },
    _showManualEnterBanner2 = function (promptIndex, total, refCount, state) {
      _injectTrackerHoverStyles2();
      let el = document.getElementById("tobyflow-manual-enter-banner");
      if (!el) {
        el = document.createElement("div");
        el.id = "tobyflow-manual-enter-banner";
        el.style.cssText =
          'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,0.42);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.18);max-width:420px;white-space:nowrap;';
        el.innerHTML =
          '<span class="tf-meb-icon" style="flex-shrink:0;display:flex"></span><span class="tf-meb-text" style="line-height:1.3;overflow:hidden;text-overflow:ellipsis"></span><button class="tf-meb-skip" style="flex-shrink:0;background:rgba(255,255,255,0.16);border:none;border-radius:7px;color:#fff;font-size:11px;font-weight:600;padding:4px 9px;cursor:pointer;">Skip</button>';
        document.body.appendChild(el);
        var _skipEl = el.querySelector(".tf-meb-skip");
        var _doSkip = function (ev) {
          if (ev) {
            ev.stopPropagation();
            ev.preventDefault();
          }
          _manualUserSkip = true;
        };
        _skipEl.addEventListener("pointerdown", _doSkip, true);
        _skipEl.addEventListener("click", _doSkip, true);
      }
      const iconEl = el.querySelector(".tf-meb-icon");
      const textEl = el.querySelector(".tf-meb-text");
      const skipBtn = el.querySelector(".tf-meb-skip");
      const posInfo = total > 1 ? " " + promptIndex + "/" + total : "";
      const refInfo = refCount > 0 ? " (" + refCount + " ref)" : "";
      if (state === "submitted") {
        el.style.background =
          "linear-gradient(180deg, rgba(34,197,94,0.32), rgba(20,120,60,0.4))";
        iconEl.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        textEl.textContent = _getTrackerT("manualSubmitted");
        skipBtn.style.display = "none";
      } else if (state === "paused") {
        el.style.background =
          "linear-gradient(180deg, rgba(120,120,130,0.3), rgba(50,50,60,0.42))";
        iconEl.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="#e5e7eb"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
        textEl.textContent = _getTrackerT("manualPaused");
        skipBtn.style.display = "none";
      } else if (state === "click") {
        el.style.background =
          "linear-gradient(180deg, rgba(234,179,8,0.32), rgba(160,120,10,0.44))";
        iconEl.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fde047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>';
        textEl.textContent = _getTrackerT("manualClickFirst", {
          pos: posInfo,
          ref: refInfo,
        });
        skipBtn.style.display = "";
        skipBtn.textContent = _getTrackerT("manualSkip");
      } else {
        el.style.background =
          "linear-gradient(180deg, rgba(34,197,94,0.34), rgba(16,110,55,0.46))";
        iconEl.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>';
        textEl.textContent = _getTrackerT("manualReady", {
          pos: posInfo,
          ref: refInfo,
        });
        skipBtn.style.display = "";
        skipBtn.textContent = _getTrackerT("manualSkip");
      }
      el.style.display = "flex";
    },
    _hideManualEnterBanner2 = function () {
      const el = document.getElementById("tobyflow-manual-enter-banner");
      if (el) el.style.display = "none";
    },
    _expireFlowCorrelationAttempt2 = function (attemptId, entry) {
      if (!entry || Date.now() <= entry.expiresAt) return false;
      if (_flowCorrelationAttempts.get(attemptId) !== entry) return true;
      if (entry.expiryTimer) clearTimeout(entry.expiryTimer);
      for (const waiter of entry.waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(null);
      }
      entry.waiters.clear();
      _flowCorrelationAttempts.delete(attemptId);
      return true;
    },
    _armFlowCorrelation2 = function (message) {
      if (_flowPageContext?.driverKey !== "flow_v2")
        return { success: false, error: "FLOW_V2_REQUIRED" };
      const attemptId = String(message.attemptId || "");
      const mediaType = String(message.mediaType || "").toLowerCase();
      const currentProjectId = _flowPageContext?.projectId || null;
      if (
        !/^[0-9a-f-]{36}$/i.test(attemptId) ||
        !["image", "video"].includes(mediaType)
      ) {
        return { success: false, error: "CORRELATION_ARM_INVALID" };
      }
      if (!/^id-[0-9a-f]{8}$/.test(message.promptFingerprint || "")) {
        return {
          success: false,
          error: "CORRELATION_PROMPT_FINGERPRINT_INVALID",
        };
      }
      if (
        message.structuredPromptFingerprint != null &&
        !/^id-[0-9a-f]{8}$/.test(message.structuredPromptFingerprint)
      ) {
        return {
          success: false,
          error: "CORRELATION_STRUCTURED_PROMPT_INVALID",
        };
      }
      if (!currentProjectId || message.projectId !== currentProjectId) {
        return { success: false, error: "CORRELATION_CONTEXT_MISMATCH" };
      }
      const previous = _flowCorrelationAttempts.get(attemptId);
      const ttlMs = Math.max(5e3, Math.min(9e5, Number(message.ttlMs) || 6e4));
      const detail = {
        schemaVersion: 1,
        nonce: _flowCorrelationNonce,
        attemptId,
        projectId: currentProjectId,
        mediaType,
        expectedQuantity: Math.max(1, Number(message.expectedQuantity) || 1),
        promptFingerprint: message.promptFingerprint,
        promptAnchorFingerprint: /^id-[0-9a-f]{8}$/.test(
          message.promptAnchorFingerprint || "",
        )
          ? message.promptAnchorFingerprint
          : null,
        promptNormalizedLength: Math.max(
          0,
          Math.min(1e6, Number(message.promptNormalizedLength) || 0),
        ),
        structuredPromptFingerprint:
          message.structuredPromptFingerprint || null,
        normalizedVoiceFingerprint: /^id-[0-9a-f]{8}$/.test(
          message.normalizedVoiceFingerprint || "",
        )
          ? message.normalizedVoiceFingerprint
          : null,
        expectedReferenceIds: Array.isArray(message.expectedReferenceIds)
          ? message.expectedReferenceIds
              .filter(
                (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
              )
              .slice(0, 32)
          : [],
        expectedMediaReferenceIds: Array.isArray(
          message.expectedMediaReferenceIds,
        )
          ? message.expectedMediaReferenceIds
              .filter(
                (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
              )
              .slice(0, 32)
          : [],
        expectedCharacterIds: Array.isArray(message.expectedCharacterIds)
          ? message.expectedCharacterIds
              .filter(
                (id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id),
              )
              .slice(0, 32)
          : [],
        expectedGlobalCharacter: message.expectedGlobalCharacter === true,
        expectedGlobalCharacterCount: Math.max(
          0,
          Number(message.expectedGlobalCharacterCount) ||
            (message.expectedGlobalCharacter === true ? 1 : 0),
        ),
        expectedImageModelKey:
          typeof message.expectedImageModelKey === "string" &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(message.expectedImageModelKey)
            ? message.expectedImageModelKey
            : null,
        expectedVideoModelKey:
          typeof message.expectedVideoModelKey === "string" &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(message.expectedVideoModelKey)
            ? message.expectedVideoModelKey
            : null,
        expectedVideoRatioEnum:
          message.expectedVideoRatioEnum != null &&
          Number.isInteger(Number(message.expectedVideoRatioEnum))
            ? Math.max(1, Math.min(16, Number(message.expectedVideoRatioEnum)))
            : null,
        normalizedVideoModelKey:
          typeof message.normalizedVideoModelKey === "string" &&
          /^[a-zA-Z0-9_-]{1,128}$/.test(message.normalizedVideoModelKey)
            ? message.normalizedVideoModelKey
            : null,
        strictDispatch: message.strictDispatch === true,
        ttlMs,
      };
      const armSignature = JSON.stringify(detail);
      const editorDocument = JSON.stringify(_flowV2InlineState2());
      if (previous && Date.now() <= previous.expiresAt) {
        if (
          previous.armSignature === armSignature &&
          previous.editorDocument === editorDocument
        ) {
          return { success: true, attemptId };
        }
        return {
          success: false,
          error: "FLOW_RECOVERY_PRESUBMIT_STALE",
          notDispatched: true,
        };
      }
      if (previous) _expireFlowCorrelationAttempt2(attemptId, previous);
      const entry = {
        projectId: currentProjectId,
        mediaType,
        receipts: [],
        waiters: new Set(),
        sequence: 0,
        expiresAt: Date.now() + ttlMs,
        editorDocument,
        armSignature,
      };
      _flowCorrelationAttempts.set(attemptId, entry);
      entry.expiryTimer = setTimeout(
        () => _expireFlowCorrelationAttempt2(attemptId, entry),
        ttlMs + 100,
      );
      window.dispatchEvent(
        new CustomEvent("TOBY_FLOW_V2_CORRELATION_ARM", { detail }),
      );
      return { success: true, attemptId };
    },
    _waitFlowCorrelation2 = function (message) {
      const attemptId = String(message.attemptId || "");
      const entry = _flowCorrelationAttempts.get(attemptId);
      if (!entry || _expireFlowCorrelationAttempt2(attemptId, entry)) {
        return Promise.resolve({
          success: false,
          error: "CORRELATION_ATTEMPT_NOT_ARMED",
        });
      }
      const stages = new Set(
        Array.isArray(message.stages) ? message.stages : [message.stage],
      );
      const afterSequence = Math.max(0, Number(message.afterSequence) || 0);
      const existing = entry.receipts.find(
        (receipt) =>
          stages.has(receipt.stage) && receipt.sequence > afterSequence,
      );
      if (existing)
        return Promise.resolve({ success: true, receipt: existing });
      const timeoutMs = Math.max(
        100,
        Math.min(12e4, Number(message.timeoutMs) || 5e3),
      );
      return new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const waiter = {
          stages,
          afterSequence,
          resolve: (receipt) =>
            resolve(
              receipt?.observedAt > deadline
                ? { success: false, error: "CORRELATION_RECEIPT_TIMEOUT" }
                : { success: true, receipt },
            ),
          timer: null,
        };
        waiter.timer = setTimeout(() => {
          entry.waiters.delete(waiter);
          resolve({ success: false, error: "CORRELATION_RECEIPT_TIMEOUT" });
        }, timeoutMs);
        entry.waiters.add(waiter);
      });
    },
    _disarmFlowCorrelation2 = function (message) {
      const attemptId = String(message.attemptId || "");
      const entry = _flowCorrelationAttempts.get(attemptId);
      if (entry) {
        if (entry.expiryTimer) clearTimeout(entry.expiryTimer);
        for (const waiter of entry.waiters) {
          clearTimeout(waiter.timer);
          waiter.resolve(null);
        }
        _flowCorrelationAttempts.delete(attemptId);
      }
      window.dispatchEvent(
        new CustomEvent("TOBY_FLOW_V2_CORRELATION_DISARM", {
          detail: {
            nonce: _flowCorrelationNonce,
            attemptId,
            dispatched: message.dispatched !== false,
            discardOnStop: message.discardOnStop === true,
          },
        }),
      );
      return { success: true };
    },
    injectOverlayButtons2 = function () {
      const tileSelector = _getTileSelectorString2();
      if (!tileSelector) return;
      const tiles = document.querySelectorAll(tileSelector);
      tiles.forEach((tile) => {
        const existingButton = tile.querySelector(
          ":scope > .flow-auto-overlay-btn",
        );
        if (existingButton) {
          if (existingButton.dataset.tobyflowEpoch === _tobyflowTilePlusEpoch) {
            tile.dataset.overlayInjected = "1";
            return;
          }
          existingButton.remove();
        }
        tile.dataset.overlayInjected = "1";
        const currentPos = window.getComputedStyle(tile).position;
        if (currentPos === "static") {
          tile.style.position = "relative";
        }
        const PLUS_SVG =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "flow-auto-overlay-btn";
        btn.dataset.tobyflowEpoch = _tobyflowTilePlusEpoch;
        btn.style.cssText = `
            position: absolute;
            bottom: 8px;
            left: 8px;
            width: 30px;
            height: 30px;
            background: #fff;
            border: 1px solid rgba(0, 0, 0, 0.06);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            pointer-events: auto;
            touch-action: manipulation;
            z-index: 30;
            color: #000;
            box-shadow: 0 2px 6px rgba(0,0,0,0.22);
            opacity: 1;
            transition: opacity 0.18s ease, transform 0.1s ease;
        `;
        btn.innerHTML = PLUS_SVG;
        btn.title = "Add this image to Gen tab";
        btn.addEventListener("mouseenter", () => {
          btn.style.transform = "scale(1.08)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.transform = "scale(1)";
        });
        ["pointerdown", "mousedown", "touchstart"].forEach((eventName) => {
          btn.addEventListener(eventName, (e) => {
            e.stopPropagation();
          });
        });
        const activateOverlayButton = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          console.log("[TobyFlow] Tile + activated");
          const persistentId = _getPersistentMediaId2(tile);
          const tileId = persistentId || _getTileRuntimeId2(tile);
          if (!tileId || String(tileId).startsWith("dom-tile:")) {
            console.warn(
              "[TobyFlow] Tile + ignored: persistent media identity is not ready",
              {
                hasPersistentId: !!persistentId,
                runtimeKind: tileId ? "element-local" : "missing",
              },
            );
            btn.style.color = "#dc2626";
            setTimeout(() => {
              btn.innerHTML = PLUS_SVG;
              btn.style.color = "#000";
            }, 1200);
            return;
          }
          const fileName =
            _getPersistentMediaId2(tile) || extractFileName2(tile);
          const thumbnail = extractThumbnailUrl2(tile);
          try {
            if (!chrome.runtime?.id) {
              console.warn(
                "[TobyFlow] Extension context invalidated; manual Flow refresh required",
              );
              return;
            }
            chrome.runtime.sendMessage(
              { action: "queueImageToGenTab", tileId, fileName, thumbnail },
              (response) => {
                if (chrome.runtime.lastError) {
                  const errMsg = chrome.runtime.lastError.message || "";
                  if (
                    errMsg.includes("Extension context invalidated") ||
                    errMsg.includes("Receiving end does not exist")
                  ) {
                    console.warn(
                      "[TobyFlow] Extension runtime unavailable; manual Flow refresh required",
                    );
                  } else {
                    sendLog2(
                      `Kh\xF4ng th\u1EC3 g\u1EEDi \u1EA3nh \u0111\u1EBFn GenTab: ${errMsg}`,
                      "warn",
                    );
                  }
                  return;
                }
                if (response?.success) {
                  if (response.alreadyExists) {
                    sendLog2(
                      `ID: ${tileId.substring(0, 20)}... \u0111\xE3 c\xF3 trong danh s\xE1ch`,
                      "warn",
                    );
                    btn.innerHTML = "...";
                    btn.style.color = "#f9ab00";
                    btn.style.fontSize = "10px";
                    setTimeout(() => {
                      btn.innerHTML = PLUS_SVG;
                      btn.style.color = "#333";
                      btn.style.fontSize = "18px";
                    }, 1e3);
                  } else if (response.queued) {
                    sendLog2(
                      `\u1EA2nh \u0111\xE3 \u0111\u01B0\u1EE3c \u0111\xE1nh d\u1EA5u, m\u1EDF sidebar \u0111\u1EC3 th\xEAm v\xE0o Tab 1`,
                      "info",
                    );
                    btn.innerHTML = "\u25CB";
                    btn.style.color = "#4285f4";
                    setTimeout(() => {
                      btn.innerHTML = PLUS_SVG;
                      btn.style.color = "#333";
                    }, 1500);
                  } else {
                    sendLog2(
                      `\u0110\xE3 th\xEAm \u1EA3nh v\xE0o Tab 1: ${tileId.substring(0, 20)}...`,
                      "success",
                    );
                    btn.innerHTML = "\u2713";
                    btn.style.color = "#0f9d58";
                    setTimeout(() => {
                      btn.innerHTML = PLUS_SVG;
                      btn.style.color = "#333";
                    }, 1e3);
                  }
                } else {
                  const reason = response?.error || "NO_RESPONSE";
                  console.warn(
                    "[TobyFlow] Tile + could not add reference:",
                    reason,
                  );
                  sendLog2(
                    `Kh\xF4ng th\u1EC3 th\xEAm \u1EA3nh v\xE0o GenTab: ${reason}`,
                    "warn",
                  );
                  btn.style.color = "#dc2626";
                  setTimeout(() => {
                    btn.innerHTML = PLUS_SVG;
                    btn.style.color = "#000";
                  }, 1200);
                }
              },
            );
          } catch (err) {
            const errMsg = err.message || "";
            if (errMsg.includes("Extension context invalidated")) {
              console.warn(
                "[TobyFlow] Extension context invalidated; manual Flow refresh required",
              );
            } else {
              console.error("[TobyFlow] addImageToGenTab error:", err);
            }
          }
        };
        btn.__tobyflowActivate = activateOverlayButton;
        btn.addEventListener("click", activateOverlayButton);
        tile.appendChild(btn);
      });
    },
    _setupTileObserver2 = function () {
      if (_tileObserver) _tileObserver.disconnect();
      const tileSelector = _getTileSelectorString2();
      if (!tileSelector) {
        if (_tileObserverRetryCount < 10) {
          _tileObserverRetryCount++;
          setTimeout(() => _tfContextValid2() && _setupTileObserver2(), 1e3);
        }
        return;
      }
      const firstTile = document.querySelector(tileSelector);
      const tileContainer = firstTile
        ? _flowPageContext?.driverKey === "flow_v2"
          ? firstTile.parentElement
          : firstTile.closest(
              '[class*="grid"], [class*="Gallery"], [role="list"]',
            ) || firstTile.parentElement
        : null;
      const target = tileContainer || document.body;
      _tileObserver = new MutationObserver(
        debounce2(() => {
          injectOverlayButtons2();
          void _autoRefreshVisibleImageLoadErrors();
        }, 500),
      );
      _tileObserver.observe(target, { childList: true, subtree: true });
      injectOverlayButtons2();
      void _autoRefreshVisibleImageLoadErrors();
      if (!tileContainer && _tileObserverRetryCount < 10) {
        _tileObserverRetryCount++;
        setTimeout(() => _tfContextValid2() && _setupTileObserver2(), 3e3);
      } else if (tileContainer) {
        _tileObserverRetryCount = 0;
      }
    },
    setupFlowSpaNavigateHookDeferred2 = function () {
      let _lastUrl = location.href;
      function _notifyFlowNavigate() {
        try {
          if (location.href === _lastUrl) return;
          _lastUrl = location.href;
          const m = location.href.match(/\/project\/([a-f0-9-]+)/);
          const projectId = m ? m[1] : null;
          try {
            if (
              self.FloatingTracker &&
              typeof self.FloatingTracker._handleProjectNavigation ===
                "function"
            ) {
              self.FloatingTracker._handleProjectNavigation(projectId);
            }
          } catch (_) {}
          const sendResult = chrome.runtime.sendMessage({
            action: "projectContext",
            projectId,
            projectName: null,
            documentTitle: document.title || null,
            fromSPANavigate: true,
          });
          if (sendResult && typeof sendResult.catch === "function") {
            sendResult.catch(() => {});
          }
        } catch (_) {}
      }
      try {
        const _origPushState = history.pushState;
        const _origReplaceState = history.replaceState;
        history.pushState = function () {
          _origPushState.apply(this, arguments);
          try {
            setTimeout(_notifyFlowNavigate, 50);
          } catch (_) {}
        };
        history.replaceState = function () {
          _origReplaceState.apply(this, arguments);
          try {
            setTimeout(_notifyFlowNavigate, 50);
          } catch (_) {}
        };
        window.addEventListener("popstate", () => {
          try {
            setTimeout(_notifyFlowNavigate, 50);
          } catch (_) {}
        });
      } catch (_) {}
    },
    setupFlowHomepageObserver2 = function () {
      if (location.pathname.match(/\/project\/[a-f0-9-]+/)) return;
      let _lastCount = 0;
      let _debounceTimer = null;
      function _notifyHomepageCountChange() {
        if (_autoScrollInFlight) return;
        const count = _qa2("project_link").length;
        if (count === _lastCount) return;
        _lastCount = count;
        try {
          const sendResult = chrome.runtime.sendMessage({
            action: "flowHomepageProjectsChanged",
            count,
          });
          if (sendResult && typeof sendResult.catch === "function") {
            sendResult.catch(() => {});
          }
        } catch (_) {}
      }
      const tryAttach = () => {
        const container =
          _flowPageContext?.driverKey === "flow_v2"
            ? _q2("projects_page")
            : document.querySelector('[data-testid="virtuoso-item-list"]') ||
              document.querySelector('[data-testid="virtuoso-scroller"]') ||
              document.body;
        if (!container) return false;
        try {
          if (_flowHomepageObserver) _flowHomepageObserver.disconnect();
          const observer = new MutationObserver(() => {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(_notifyHomepageCountChange, 1e3);
          });
          observer.observe(container, { childList: true, subtree: true });
          _flowHomepageObserver = observer;
          _notifyHomepageCountChange();
          return true;
        } catch (_) {
          return false;
        }
      };
      let attempts = 0;
      _flowHomepageRetryInterval = setInterval(() => {
        attempts++;
        if (tryAttach() || attempts >= 20) {
          clearInterval(_flowHomepageRetryInterval);
          _flowHomepageRetryInterval = null;
        }
      }, 500);
    };
  var _flowAuditIdentitySummary = _flowAuditIdentitySummary2,
    _isLabsFlowLoginLanding = _isLabsFlowLoginLanding2,
    _verifyFlowTarget = _verifyFlowTarget2,
    _getFlowLocaleStrings = _getFlowLocaleStrings2,
    _queryInputsByAriaLabels = _queryInputsByAriaLabels2,
    _ariaLabelMatches = _ariaLabelMatches2,
    _textIncludesAny = _textIncludesAny2,
    _getTileSelector = _getTileSelector2,
    _getTileSelectorString = _getTileSelectorString2,
    _getSlateEditorSelectorString = _getSlateEditorSelectorString2,
    _getMediaUrlPattern = _getMediaUrlPattern2,
    _getCachedTiles = _getCachedTiles2,
    _invalidateTileCache = _invalidateTileCache2,
    _getTileById = _getTileById2,
    _getConfiguredAttribute = _getConfiguredAttribute2,
    _getFlowV2AsbMediaId = _getFlowV2AsbMediaId2,
    _isFlowV2AsbIdentity = _isFlowV2AsbIdentity2,
    _buildFlowV2AsbMediaUrl = _buildFlowV2AsbMediaUrl2,
    _getPersistentMediaId = _getPersistentMediaId2,
    _findReusableFlowUploadTile = _findReusableFlowUploadTile2,
    _uniqueCompletedFlowImageUpload = _uniqueCompletedFlowImageUpload2,
    _decodeFlowUploadBase64 = _decodeFlowUploadBase642,
    _isDeterministicTobyUploadName = _isDeterministicTobyUploadName2,
    _matchesFlowUploadName = _matchesFlowUploadName2,
    _isCompletedOwnedFlowImageUpload = _isCompletedOwnedFlowImageUpload2,
    _getTileDisplayName = _getTileDisplayName2,
    _flowDisplayNamesCorrelate = _flowDisplayNamesCorrelate2,
    _pruneDetachedFlowV2ResultOwners = _pruneDetachedFlowV2ResultOwners2,
    _flowCommandMemorySnapshot = _flowCommandMemorySnapshot2,
    _claimFlowTile = _claimFlowTile2,
    _isAllowedFlowMediaUrl = _isAllowedFlowMediaUrl2,
    _classifyFlowMediaUrl = _classifyFlowMediaUrl2,
    _safeFlowUrlForLog = _safeFlowUrlForLog2,
    _safeFlowIdentityForLog = _safeFlowIdentityForLog2,
    _getFlowContentVideoUuid = _getFlowContentVideoUuid2,
    _rememberFlowVideoStreamUrl = _rememberFlowVideoStreamUrl2,
    _scheduleFlowNativeMediaIdentityNotification =
      _scheduleFlowNativeMediaIdentityNotification2,
    _applyFlowNativeMediaIdentitySnapshot =
      _applyFlowNativeMediaIdentitySnapshot2,
    _getObservedFlowMediaMetadata = _getObservedFlowMediaMetadata2,
    _getObservedFlowVideoMetadata = _getObservedFlowVideoMetadata2,
    _lookupFlowMediaCatalog = _lookupFlowMediaCatalog2,
    _typedMediaProjection = _typedMediaProjection2,
    _getTileRuntimeId = _getTileRuntimeId2,
    _getPersistableResultId = _getPersistableResultId2,
    _extractTypedTileRecord = _extractTypedTileRecord2,
    _loadRadixTriggerPattern = _loadRadixTriggerPattern2,
    _publishNativeMediaSchema = _publishNativeMediaSchema2,
    _loadNativeMediaSchema = _loadNativeMediaSchema2,
    _buildRadixTriggerSelector = _buildRadixTriggerSelector2,
    _tfInjectHintStyle = _tfInjectHintStyle2,
    _tfAttachHint = _tfAttachHint2,
    _tfDismissHint = _tfDismissHint2,
    _tfBuildOpenButton = _tfBuildOpenButton2,
    _tfFindBrandLink = _tfFindBrandLink2,
    _tfWatchAnchor = _tfWatchAnchor2,
    _tfContextValid = _tfContextValid2,
    _injectTobyFlowOpenButton = _injectTobyFlowOpenButton2,
    _runSelectorWaitLoop = _runSelectorWaitLoop2,
    _showCaptchaOverlay = _showCaptchaOverlay2,
    _hideCaptchaOverlay = _hideCaptchaOverlay2,
    _escapeHtmlSafe = _escapeHtmlSafe2,
    _showConfigErrorOverlay = _showConfigErrorOverlay2,
    _showCloneDetectedOverlay = _showCloneDetectedOverlay2,
    _hideCloneDetectedOverlay = _hideCloneDetectedOverlay2,
    _getDynamicSelector = _getDynamicSelector2,
    _getFlowProfileSelectors = _getFlowProfileSelectors2,
    _selStr = _selStr2,
    _q = _q2,
    _qa = _qa2,
    _queryWithFallback = _queryWithFallback2,
    _cfgList = _cfgList2,
    _findIconInElement = _findIconInElement2,
    _findIconsInElement = _findIconsInElement2,
    _getApiConfigValue = _getApiConfigValue2,
    _getFlowV2DriverGateState = _getFlowV2DriverGateState2,
    _isFlowV2GateProtectedAction = _isFlowV2GateProtectedAction2,
    _detectFlowUploadError = _detectFlowUploadError2,
    _matchFlowPattern = _matchFlowPattern2,
    _classifyFlowErrorText = _classifyFlowErrorText2,
    _classifyFlowToast = _classifyFlowToast2,
    _extractTileFailReason = _extractTileFailReason2,
    _detectRecaptchaWidget = _detectRecaptchaWidget2,
    _getFlowErrorState = _getFlowErrorState2,
    _clickUploadConsentModal = _clickUploadConsentModal2,
    _getDownloadMenuLabel = _getDownloadMenuLabel2,
    _getDownloadFallbackChain = _getDownloadFallbackChain2,
    _getDownloadPixelWidth = _getDownloadPixelWidth2,
    incrementDownloadCounter = incrementDownloadCounter2,
    getDownloadCounter = getDownloadCounter2,
    debounce = debounce2,
    sleep = sleep2,
    _setReactInputValue = _setReactInputValue2,
    _findTabByIconText = _findTabByIconText2,
    _v2QueryConfigured = _v2QueryConfigured2,
    _v2QueryVisibleConfigured = _v2QueryVisibleConfigured2,
    _v2FindSemanticControl = _v2FindSemanticControl2,
    _closeFlowAdvancedMenu = _closeFlowAdvancedMenu2,
    _flowV2ComponentInfo = _flowV2ComponentInfo2,
    _flowV2InlineState = _flowV2InlineState2,
    _flowReferenceGuardMatches = _flowReferenceGuardMatches2,
    _extractCharOption = _extractCharOption2,
    _parseComponentMentions = _parseComponentMentions2,
    _stripComponentMentions = _stripComponentMentions2,
    _countInlineChips = _countInlineChips2,
    _incrementDailyStat = _incrementDailyStat2,
    getInputTimeoutMs = getInputTimeoutMs2,
    getClearEditorDelay = getClearEditorDelay2,
    getSubmitDelay = getSubmitDelay2,
    getAfterSubmitDelay = getAfterSubmitDelay2,
    getSettingsStepDelay = getSettingsStepDelay2,
    getDelayBetweenPromptsMs = getDelayBetweenPromptsMs2,
    getRandomDelay = getRandomDelay2,
    _isLogSelectorsEnabled = _isLogSelectorsEnabled2,
    _logSelectorPick = _logSelectorPick2,
    getEditor = getEditor2,
    getEditorUserText = getEditorUserText2,
    getSettingsButton = getSettingsButton2,
    _getActiveSettingsPanel = _getActiveSettingsPanel2,
    getSubmitButton = getSubmitButton2,
    sendLog = sendLog2,
    _isFlowCompactLayout = _isFlowCompactLayout2,
    _setupFlowCompactViewportNotice = _setupFlowCompactViewportNotice2,
    sendRetryStatus = sendRetryStatus2,
    isAutoDownloadEnabled = isAutoDownloadEnabled2,
    getDownloadSettings = getDownloadSettings2,
    _toAscii = _toAscii2,
    _buildFilename = _buildFilename2,
    _splitCdnSizeSuffix = _splitCdnSizeSuffix2,
    _stripCdnSizeSuffix = _stripCdnSizeSuffix2,
    applyResolutionToUrl = applyResolutionToUrl2,
    _waitInterceptDone = _waitInterceptDone2,
    _activateInterceptDownloadContext = _activateInterceptDownloadContext2,
    _clearInterceptDownloadContext = _clearInterceptDownloadContext2,
    _awaitPreparedDownloadCompletion = _awaitPreparedDownloadCompletion2,
    _waitForElement = _waitForElement2,
    _waitForTileMediaReady = _waitForTileMediaReady2,
    _closeContextMenu = _closeContextMenu2,
    _closeOwnedContextMenus = _closeOwnedContextMenus2,
    _releaseCtxMenuLock = _releaseCtxMenuLock2,
    extractFileName = extractFileName2,
    extractAllFileNames = extractAllFileNames2,
    extractFileNameFromUrl = extractFileNameFromUrl2,
    extractThumbnailUrl = extractThumbnailUrl2,
    _stripMediaUrlType = _stripMediaUrlType2,
    extractVideoUrl = extractVideoUrl2,
    extractFlowFileInfo = extractFlowFileInfo2,
    getCurrentProjectId = getCurrentProjectId2,
    _isFlowProjectErrorState = _isFlowProjectErrorState2,
    _isFlowSignedOut = _isFlowSignedOut2,
    _isFlowMediaViewerOpen = _isFlowMediaViewerOpen2,
    _deriveFlowV2VideoUrlFromPoster = _deriveFlowV2VideoUrlFromPoster2,
    _deriveFlowV2PosterUrlFromVideo = _deriveFlowV2PosterUrlFromVideo2,
    _activateFlowV2VideoTile = _activateFlowV2VideoTile2,
    findTileByFileId = findTileByFileId2,
    resolveTileByFileName = resolveTileByFileName2,
    _flowV2OutputIdentityAliases = _flowV2OutputIdentityAliases2,
    _tileOwnsDownloadIdentity = _tileOwnsDownloadIdentity2,
    _resolveDownloadTileByFileName = _resolveDownloadTileByFileName2,
    extractProjectName = extractProjectName2,
    _collectFlowProjects = _collectFlowProjects2,
    getUniqueTileIds = getUniqueTileIds2,
    getExistingFileNames = getExistingFileNames2,
    isTileComplete = isTileComplete2,
    validateTileFile = validateTileFile2,
    clickTileRetryButton = clickTileRetryButton2,
    clickUploadRetryButton = clickUploadRetryButton2,
    detectTileStatus = detectTileStatus2,
    extractTileFailureReason = extractTileFailureReason2,
    _isFlowImageLoadError = _isFlowImageLoadError2,
    detectMediaType = detectMediaType2,
    extractTileProgress = extractTileProgress2,
    isHumanizedEnabled = isHumanizedEnabled2,
    getHumanizedSpeed = getHumanizedSpeed2,
    getHumanizedDelay = getHumanizedDelay2,
    injectSlateBridge = injectSlateBridge2,
    _slateBridgeCall = _slateBridgeCall2,
    _isFlowControlDisabled = _isFlowControlDisabled2,
    _flowV2IngredientChips = _flowV2IngredientChips2,
    readCurrentSettings = readCurrentSettings2,
    ratioToIconName = ratioToIconName2,
    simulateClick = simulateClick2,
    pressFlowEditorSubmit = pressFlowEditorSubmit2,
    simulateContextMenu = simulateContextMenu2,
    getExponentialBackoffMs = getExponentialBackoffMs2,
    scanGalleryTiles = scanGalleryTiles2,
    _flowV2VisiblePageSettingsRoot = _flowV2VisiblePageSettingsRoot2,
    _checkFlowCreditLimit = _checkFlowCreditLimit2,
    _findFlowAgentButton = _findFlowAgentButton2,
    _isFlowAgentModeOn = _isFlowAgentModeOn2,
    _findFlowAgentInstructionDoneButton = _findFlowAgentInstructionDoneButton2,
    _isFlowAgentInstructionDialogOpen = _isFlowAgentInstructionDialogOpen2,
    _findFlowChatAgentCloseButton = _findFlowChatAgentCloseButton2,
    _stripIconFromButtonText = _stripIconFromButtonText2,
    _isFlowChatAgentPanelOpen = _isFlowChatAgentPanelOpen2,
    _showZoomNotice = _showZoomNotice2,
    _hideZoomNotice = _hideZoomNotice2,
    _setCounterScale = _setCounterScale2,
    _clearCounterScale = _clearCounterScale2,
    _applyZoomUx = _applyZoomUx2,
    _clearZoomUx = _clearZoomUx2,
    _zoomGuardSet = _zoomGuardSet2,
    _zoomGuardClear = _zoomGuardClear2,
    _zoomGuardRecoverOnLoad = _zoomGuardRecoverOnLoad2,
    _waitZoomPaint = _waitZoomPaint2,
    _armZoomSessionDeadline = _armZoomSessionDeadline2,
    _findTilesScroller = _findTilesScroller2,
    _createFlowScanRequest = _createFlowScanRequest2,
    _captureExactUuidImagePreview = _captureExactUuidImagePreview2,
    _scanNewTilesInline = _scanNewTilesInline2,
    _injectTrackerHoverStyles = _injectTrackerHoverStyles2,
    _showManualEnterBanner = _showManualEnterBanner2,
    _hideManualEnterBanner = _hideManualEnterBanner2,
    _expireFlowCorrelationAttempt = _expireFlowCorrelationAttempt2,
    _armFlowCorrelation = _armFlowCorrelation2,
    _waitFlowCorrelation = _waitFlowCorrelation2,
    _disarmFlowCorrelation = _disarmFlowCorrelation2,
    injectOverlayButtons = injectOverlayButtons2,
    _setupTileObserver = _setupTileObserver2,
    setupFlowSpaNavigateHookDeferred = setupFlowSpaNavigateHookDeferred2,
    setupFlowHomepageObserver = setupFlowHomepageObserver2;
  ConfigSnapshotAccess.start("flow");
  self.__tobyflowContentJsLoaded__ = true;
  var isRunning = false;
  var shouldStop = false;
  var _flowStopEpoch = 0;
  const _manualDownloadRequests = new Map();
  const _flowCancelledUploadRequests = new Set();
  const _flowActiveUploadRequests = new Map();
  var isPaused = false;
  var failedPrompts = [];
  var _TOBYFLOW_CONTENT_SCHEMA = 106;
  var _TOBYFLOW_CONTENT_REVISION = `flow-content-${chrome.runtime.getManifest().version}-r${_TOBYFLOW_CONTENT_SCHEMA}`;
  var _TOBYFLOW_DOCUMENT_EPOCH = crypto.randomUUID();
  var _flowPageContext =
    globalThis.FlowDriverRegistry?.describeUrl(location.href) || null;
  var _tileCache = null;
  var _tileCacheTime = 0;
  var _TILE_CACHE_TTL = 250;
  var _tileSelectorCache = null;
  var _tileSelectorCacheTime = 0;
  var _tileSweepFailUntil = 0;
  if (typeof window !== "undefined") {
    window._getTileSelectorString = _getTileSelectorString2;
  }
  if (typeof window !== "undefined") {
    window._getSlateEditorSelectorString = _getSlateEditorSelectorString2;
  }
  async function _getMediaUrlPatternAsync(timeoutMs = 5e3) {
    var pattern = _getMediaUrlPattern2();
    if (pattern) return pattern;
    var startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await sleep2(200);
      var res = await new Promise((resolve) =>
        ConfigSnapshotAccess.read(["toby_provider_api_configs"], resolve),
      );
      if (
        res.toby_provider_api_configs?.data?.flow?.configs?.image_url_pattern
          ?.url_substring
      ) {
        _apiConfigsCacheLocal = res.toby_provider_api_configs;
        _apiConfigsCacheLocalTime = Date.now();
        return res.toby_provider_api_configs.data.flow.configs.image_url_pattern
          .url_substring;
      }
      try {
        chrome.runtime.sendMessage(
          { action: "getProviderApiConfigs", provider: "flow" },
          function () {
            if (chrome.runtime.lastError) {
            }
          },
        );
      } catch (_) {}
    }
    console.warn(
      "[Tier3] _getMediaUrlPatternAsync timeout after " + timeoutMs + "ms",
    );
    return null;
  }
  if (typeof window !== "undefined") {
    window._getMediaUrlPattern = _getMediaUrlPattern2;
  }
  async function _buildFlowUploadFilename(fd, bytes) {
    const contentHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const source = JSON.stringify([
      "toby-flow-upload-v1",
      fd.key || fd.name || "",
      fd.type || "",
      contentHash,
    ]);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
    );
    digest[6] = (digest[6] & 15) | 128;
    digest[8] = (digest[8] & 63) | 128;
    const hex = Array.from(digest.slice(0, 16), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const extension =
      String(fd.name || "").match(/\.[a-z0-9]{1,10}$/i)?.[0] || "";
    return `toby_${uuid}${extension.toLowerCase()}`;
  }
  var _anonymousTileIds = new WeakMap();
  var _anonymousTileIdSeq = 0;
  var _flowV2ResultIds = new WeakMap();
  var _flowV2ResultOwners = new Map();
  var _flowV2PendingUploads = new Map();
  var _flowTileOperationClaims = new Map();
  var _flowV2IdentityAuditSeen = new Map();
  if (typeof window !== "undefined")
    window._isAllowedFlowMediaUrl = _isAllowedFlowMediaUrl2;
  const _flowObservedVideoIdentities = new Map();
  const _flowObservedVideoStreams = new Map();
  const _flowObservedUuidVideoStreams = new Map();
  const _FLOW_NATIVE_MEDIA_MAX_ALIASES = 4096;
  const _flowObservedMediaTypes = new Map();
  let _flowObservedVideoIdentityProject = null;
  let _flowObservedMediaSchemaEpoch = null;
  let _flowObservedMediaRevision = 0;
  let _flowVideoIdentityNotifyTimer = null;
  const _FLOW_NATIVE_MEDIA_SNAPSHOT_KEY = "toby_flow_v2_media_catalog_snapshot";
  const _flowNativeMediaSnapshotReady = new Promise((resolve) => {
    try {
      ConfigSnapshotAccess.read([_FLOW_NATIVE_MEDIA_SNAPSHOT_KEY], (stored) => {
        const snapshot = stored?.[_FLOW_NATIVE_MEDIA_SNAPSHOT_KEY];
        if (snapshot?.projectId === getCurrentProjectId2()?.toLowerCase()) {
          _applyFlowNativeMediaIdentitySnapshot2(snapshot, "cache");
        }
        resolve();
      });
    } catch (_) {
      resolve();
    }
  });
  window.addEventListener("TOBY_FLOW_V2_MEDIA_IDENTITIES", (event) => {
    _applyFlowNativeMediaIdentitySnapshot2(event.detail, "observer");
  });
  window.dispatchEvent(new CustomEvent("TOBY_FLOW_V2_MEDIA_IDENTITIES_READ"));
  window.addEventListener(
    "loadedmetadata",
    (event) => {
      const selectors = _getDynamicSelector2("tile_video")?.selectors;
      if (!Array.isArray(selectors)) return;
      try {
        if (selectors.some((selector) => event.target?.matches?.(selector))) {
          _rememberFlowVideoStreamUrl2(
            event.target.currentSrc || event.target.src || "",
          );
        }
      } catch (_) {}
    },
    true,
  );
  if (typeof window !== "undefined")
    window._getTileRuntimeId = _getTileRuntimeId2;
  if (typeof window !== "undefined")
    window._extractTypedTileRecord = _extractTypedTileRecord2;
  var _fileNameCache = new Map();
  var _statusCache = new Map();
  var _selectorConfig = null;
  var _selectorConfigTime = 0;
  ConfigSnapshotAccess.onInvalidated(() => {
    _selectorConfig = null;
    _selectorConfigTime = 0;
    _selectorConfigReady = false;
    _apiConfigsCacheLocal = null;
    _tileSelectorCache = null;
    _radixTriggerPattern = null;
    window._afExecConfig = { workflow: {}, timing: {}, flow_recovery: {} };
    _publishNativeMediaSchema2(null);
    _runSelectorWaitLoop2();
  });
  var _tobyVerboseFlowDebug = false;
  var _SELECTOR_CACHE_TTL = 3e4;
  var _coldStartWarnedKeys = new Set();
  var _radixTriggerPattern = null;
  _loadRadixTriggerPattern2();
  var _nativeMediaSchemaStorageEpoch = 0;
  window.addEventListener(
    "TOBY_FLOW_NATIVE_MEDIA_SCHEMA_READ",
    _loadNativeMediaSchema2,
  );
  _loadNativeMediaSchema2();
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes.toby_provider_configs) {
        var snapshot = changes.toby_provider_configs.newValue;
        var providerData = ConfigSnapshotAccess.acceptChange(snapshot)
          ? snapshot.data
          : null;
        _selectorConfig = providerData?.flow ? providerData : null;
        _selectorConfigTime = _selectorConfig ? Date.now() : 0;
        _tileSelectorCache = null;
        var activeSelectors = _getFlowProfileSelectors2();
        var currentGate =
          _flowPageContext?.driverKey === "flow_v2"
            ? _getApiConfigValue2("flow", "flow_v2_driver")
            : { enabled: true };
        _selectorConfigReady =
          !!activeSelectors && currentGate?.enabled === true;
        if (!_selectorConfigReady) _runSelectorWaitLoop2();
      }
      if (area === "local" && changes.toby_provider_api_configs) {
        var next = changes.toby_provider_api_configs.newValue;
        if (!ConfigSnapshotAccess.acceptChange(next)) next = null;
        ++_nativeMediaSchemaStorageEpoch;
        _publishNativeMediaSchema2(next);
        _apiConfigsCacheLocal = next?.data ? next : null;
        _apiConfigsCacheLocalTime = Date.now();
        var cfg = next?.data?.flow?.configs?.radix_trigger_button_pattern;
        if (typeof cfg === "string" && cfg.includes("{suffix}")) {
          _radixTriggerPattern = cfg;
        }
        if (_flowPageContext?.driverKey === "flow_v2") {
          var gate = next?.data?.flow?.configs?.flow_v2_driver;
          if (gate?.enabled === true) {
            _selectorConfigReady = !!_getFlowProfileSelectors2();
            if (_selectorConfigReady)
              document
                .getElementById("tobyflow-config-error-overlay")
                ?.remove();
            else _runSelectorWaitLoop2();
          } else if (gate) {
            _selectorConfigReady = false;
            var copy =
              gate?.messages?.[_overlayLocale] || gate?.messages?.vi || null;
            _showConfigErrorOverlay2(copy);
          } else {
            _selectorConfigReady = false;
            _runSelectorWaitLoop2();
          }
        }
      }
    });
  } catch (_) {}
  var _selectorConfigReady = false;
  var _SELECTOR_WAIT_MAX_MS = 1e4;
  var _SELECTOR_WAIT_INTERVAL_MS = 200;
  var _selectorWaitInProgress = false;
  var _selectorWaitTimer = null;
  var _flowReadyBootstrapStarted = false;
  async function _ensureSelectorConfigReadyForAction(timeoutMs = 3e3) {
    if (!(await ConfigSnapshotAccess.ensure())) return false;
    if (_selectorConfigReady && _getFlowProfileSelectors2()) return true;
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    let fetchRequested = false;
    do {
      if (!_tfContextValid2()) return false;
      try {
        const stored = await new Promise((resolve) => {
          ConfigSnapshotAccess.read(
            ["toby_provider_configs", "toby_provider_api_configs"],
            (value) => resolve(value || {}),
          );
        });
        const providerData = stored.toby_provider_configs?.data;
        if (providerData?.flow) {
          _selectorConfig = providerData;
          _selectorConfigTime = Date.now();
        }
        const apiCache = stored.toby_provider_api_configs;
        if (apiCache?.data) {
          _apiConfigsCacheLocal = apiCache;
          _apiConfigsCacheLocalTime = Date.now();
        }
        const selectors = _getFlowProfileSelectors2();
        const gate =
          _flowPageContext?.driverKey === "flow_v2"
            ? _getApiConfigValue2("flow", "flow_v2_driver")
            : { enabled: true };
        if (selectors && gate?.enabled === true) {
          _selectorConfigReady = true;
          return true;
        }
      } catch (_) {
        if (!_tfContextValid2()) return false;
      }
      if (!fetchRequested) {
        fetchRequested = true;
        try {
          chrome.runtime.sendMessage(
            { action: "getProviderConfigs", provider: "flow" },
            () => void chrome.runtime.lastError,
          );
          chrome.runtime.sendMessage(
            { action: "getProviderApiConfigs", provider: "flow" },
            () => void chrome.runtime.lastError,
          );
        } catch (_) {}
      }
      if (Date.now() >= deadline) break;
      await sleep2(
        Math.min(
          _SELECTOR_WAIT_INTERVAL_MS,
          Math.max(0, deadline - Date.now()),
        ),
      );
    } while (Date.now() <= deadline);
    return false;
  }
  var _OVERLAY_I18N = {
    vi: {
      title: "M\u1EA5t k\u1EBFt n\u1ED1i server",
      desc: "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi m\xE1y ch\u1EE7 Toby. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i sau.",
      retry: "Th\u1EED l\u1EA1i",
    },
    en: {
      title: "Server Connection Lost",
      desc: "Unable to connect to Toby server. Please try again later.",
      retry: "Retry",
    },
    ja: {
      title:
        "\u30B5\u30FC\u30D0\u30FC\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F",
      desc: "Toby\u30B5\u30FC\u30D0\u30FC\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3002\u5F8C\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
      retry: "\u518D\u8A66\u884C",
    },
    th: {
      title:
        "\u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C",
      desc: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E01\u0E31\u0E1A\u0E40\u0E0B\u0E34\u0E23\u0E4C\u0E1F\u0E40\u0E27\u0E2D\u0E23\u0E4C Toby \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07",
      retry:
        "\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
    },
  };
  var _overlayLocale = "vi";
  ConfigSnapshotAccess.read(["af_locale", "af_settings"], function (r) {
    _overlayLocale =
      r.af_locale || (r.af_settings && r.af_settings.language) || "vi";
  });
  var _TF_OPEN_LABEL = "TobyFlow";
  var _TF_HINT_LABEL = "Click here to open TobyFlow";
  var _tfHintSeen = true;
  ConfigSnapshotAccess.read(["tf_open_hint_seen"], function (r) {
    _tfHintSeen = r.tf_open_hint_seen === true;
    if (!_tfHintSeen) {
      var _b = document.getElementById("tobyflow-open-sidebar-btn");
      if (_b) _tfAttachHint2(_b);
    }
  });
  var _tfNavObserver = null;
  var _tfInjectInterval = setInterval(_injectTobyFlowOpenButton2, 2e3);
  _runSelectorWaitLoop2();
  (function _initCloneDetectedListener() {
    try {
      setTimeout(function () {
        if (!_tfContextValid2()) return;
        try {
          ConfigSnapshotAccess.read(
            "tobyflow_extension_not_authorized",
            function (res) {
              if (!_tfContextValid2()) return;
              if (res && res.tobyflow_extension_not_authorized)
                _showCloneDetectedOverlay2();
            },
          );
        } catch (_) {}
      }, 800);
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (!_tfContextValid2()) return;
        if (area !== "local") return;
        if (changes.tobyflow_extension_not_authorized) {
          if (changes.tobyflow_extension_not_authorized.newValue)
            _showCloneDetectedOverlay2();
          else _hideCloneDetectedOverlay2();
        }
      });
      if (chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(function (msg) {
          if (msg && msg.type === "EXTENSION_NOT_AUTHORIZED")
            _showCloneDetectedOverlay2();
          else if (msg && msg.type === "EXTENSION_AUTHORIZED")
            _hideCloneDetectedOverlay2();
        });
      }
      document.addEventListener(
        "click",
        function (e) {
          if (
            e.target &&
            e.target.closest &&
            e.target.closest("#tobyflow-clone-detected-overlay")
          ) {
            try {
              chrome.runtime.sendMessage({ type: "EXTENSION_AUTH_RETRY" });
            } catch (_) {}
          }
        },
        true,
      );
    } catch (_) {}
  })();
  var _apiConfigsCacheLocal = null;
  var _apiConfigsCacheLocalTime = 0;
  var _API_CONFIGS_CACHE_TTL = 3e4;
  (function _preloadApiConfigs() {
    ConfigSnapshotAccess.read(["toby_provider_api_configs"], function (res) {
      if (res.toby_provider_api_configs?.data) {
        _apiConfigsCacheLocal = res.toby_provider_api_configs;
        _apiConfigsCacheLocalTime = Date.now();
        console.log(
          "[ApiConfigs:preload] \u2705 Loaded from storage, providers:",
          Object.keys(res.toby_provider_api_configs.data || {}).join(", "),
        );
      } else {
        console.warn(
          "[ApiConfigs:preload] \u26A0\uFE0F Cache empty \u2014 _getApiConfigValue() s\u1EBD tr\u1EA3 null t\u1EDBi khi background fetch xong",
        );
      }
    });
  })();
  async function _getReadyFlowV2DriverGateState(message) {
    let state = _getFlowV2DriverGateState2();
    if (state.error !== "FLOW_V2_CONFIG_MISSING") return state;
    if (!_flowV2GateRefreshFlight) {
      const refresh = (async () => {
        let checkpoint = {
          stage: "snapshot_read",
          snapshotPresent: false,
          snapshotKeyPresent: false,
          accessCode: ConfigSnapshotAccess.code?.() || null,
          refreshAttempted: false,
        };
        const hydrate = async () => {
          const stored = await ConfigSnapshotAccess.read([
            "toby_provider_api_configs",
          ]);
          const api = stored.toby_provider_api_configs;
          if (api?.data) {
            _apiConfigsCacheLocal = api;
            _apiConfigsCacheLocalTime = Date.now();
          }
          checkpoint = {
            ...checkpoint,
            snapshotPresent: !!api?.data,
            snapshotKeyPresent: !!api?.data?.flow?.configs?.flow_v2_driver,
            accessCode: ConfigSnapshotAccess.code?.() || null,
          };
          return {
            ..._getFlowV2DriverGateState2(),
            gateDiagnostic: checkpoint,
          };
        };
        try {
          let current = await hydrate();
          if (current.error !== "FLOW_V2_CONFIG_MISSING") return current;
          checkpoint = { ...checkpoint, refreshAttempted: true };
          const response = await chrome.runtime.sendMessage({
            action: "getProviderApiConfigs",
            provider: "flow",
            force: true,
          });
          if (!response?.success)
            return {
              enabled: false,
              gate: null,
              error: response?.error?.code || "FLOW_V2_CONFIG_MISSING",
              gateDiagnostic: {
                ...current.gateDiagnostic,
                stage: "refresh_failed",
                refreshAttempted: true,
                refreshSucceeded: false,
                refreshErrorCode: response?.error?.code || null,
              },
            };
          checkpoint = {
            ...checkpoint,
            refreshSucceeded: true,
            refreshKeyPresent: !!response?.data?.configs?.flow_v2_driver,
          };
          current = await hydrate();
          current.gateDiagnostic = {
            ...current.gateDiagnostic,
            stage: "after_refresh",
            refreshAttempted: true,
            refreshSucceeded: true,
            refreshKeyPresent: checkpoint.refreshKeyPresent,
          };
          return current;
        } catch (error) {
          return {
            enabled: false,
            gate: null,
            error: error?.code || "FLOW_V2_CONFIG_MISSING",
            gateDiagnostic: {
              ...checkpoint,
              stage: "refresh_exception",
              refreshErrorCode: error?.code || null,
            },
          };
        }
      })();
      _flowV2GateRefreshFlight = refresh;
      refresh
        .finally(() => {
          if (_flowV2GateRefreshFlight === refresh)
            _flowV2GateRefreshFlight = null;
        })
        .catch(() => {});
    }
    try {
      state = await _flowV2GateRefreshFlight;
    } catch (error) {
      state = {
        enabled: false,
        gate: null,
        error: error?.code || "FLOW_V2_CONFIG_MISSING",
        gateDiagnostic: {
          stage: "refresh_exception",
          snapshotPresent: false,
          accessCode: ConfigSnapshotAccess.code?.() || null,
          refreshAttempted: false,
          refreshErrorCode: error?.code || null,
        },
      };
    }
    if (state.error === "FLOW_V2_CONFIG_MISSING") {
      console.warn(
        "[FlowV2Gate] flow_v2_driver unavailable after config check",
        { action: message.action, diagnostic: state.gateDiagnostic || null },
      );
    }
    return state;
  }
  var _flowV2GateRefreshFlight = null;
  async function _uploadFileViaUploadButton(
    file,
    isStopped = () => shouldStop,
  ) {
    const fail = (error, stage, diagnostics = {}) => ({
      success: false,
      error,
      stage,
      diagnostics,
    });
    injectSlateBridge2();
    const opened = await _openFlowAdvancedMenu(isStopped);
    if (!opened) {
      console.warn("[uploadFilesToFlow] add-menu kh\xF4ng m\u1EDF");
      return fail(
        isStopped() ? "UPLOAD_ABORTED" : "V2_UPLOAD_MENU_NOT_OPEN",
        "open_menu",
        {
          stopped: isStopped() === true,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
          triggerConfigured: !!_getDynamicSelector2(
            "composer_advanced_menu_button",
          )?.selectors?.length,
          menuConfigured:
            !!_getDynamicSelector2("add_component_root")?.selectors?.length,
        },
      );
    }
    const tabCfg = _getDynamicSelector2("add_menu_upload_tab");
    let menuRoot =
      _flowPageContext?.driverKey === "flow_v2"
        ? _v2QueryVisibleConfigured2("add_component_root")
        : document;
    const mobileUploadButton =
      menuRoot && _v2QueryConfigured2("add_menu_upload_media_button", menuRoot);
    const findUploadTab = (root) => {
      if (!root || !tabCfg?.selectors?.length || !tabCfg.icon_text) return null;
      for (const selector of tabCfg.selectors) {
        try {
          for (const candidate of root.querySelectorAll(selector)) {
            if (
              _findIconInElement2(candidate)?.textContent?.trim() ===
              tabCfg.icon_text
            ) {
              return candidate;
            }
          }
        } catch (_) {}
      }
      return null;
    };
    let tab = mobileUploadButton ? null : findUploadTab(menuRoot);
    if (!tab && !mobileUploadButton) {
      console.warn(
        "[uploadFilesToFlow] kh\xF4ng th\u1EA5y Upload category tab",
      );
      _closeFlowAdvancedMenu2();
      return fail("V2_UPLOAD_TAB_NOT_FOUND", "find_upload_tab", {
        hasTabConfig: !!tabCfg?.selectors?.length,
        hasMenuRoot: !!menuRoot,
      });
    }
    const selectedAttr = mobileUploadButton
      ? null
      : tabCfg.attribute_selected || null;
    if (tab && (!selectedAttr || tab.getAttribute(selectedAttr) !== "true")) {
      console.log("[uploadFilesToFlow] chuy\u1EC3n sang Upload category tab");
      simulateClick2(tab);
    }
    const btnCfg = _getDynamicSelector2("add_menu_upload_media_button");
    if (!menuRoot || !btnCfg?.selectors?.length || !btnCfg.icon_text) {
      console.warn("[uploadFilesToFlow] thi\u1EBFu V2 upload selector config");
      _closeFlowAdvancedMenu2();
      return fail("V2_UPLOAD_CONFIG_MISSING", "read_upload_config", {
        hasMenuRoot: !!menuRoot,
        hasButtonSelectors: !!btnCfg?.selectors?.length,
        hasButtonIcon: !!btnCfg?.icon_text,
      });
    }
    const btnSel = btnCfg.selectors.join(", ");
    let btns = [];
    const buttonDeadline = Date.now() + 3e3;
    let tabSelected = !!mobileUploadButton || !selectedAttr;
    let lastTabClickAt = Date.now();
    while (Date.now() < buttonDeadline) {
      menuRoot =
        _flowPageContext?.driverKey === "flow_v2"
          ? _v2QueryVisibleConfigured2("add_component_root") || menuRoot
          : document;
      tab = findUploadTab(menuRoot);
      tabSelected = !selectedAttr || tab?.getAttribute(selectedAttr) === "true";
      try {
        btns = Array.from(menuRoot.querySelectorAll(btnSel));
      } catch (_) {
        btns = [];
      }
      if (btns.length > 0) break;
      if (!tabSelected && tab && Date.now() - lastTabClickAt >= 500) {
        simulateClick2(tab);
        lastTabClickAt = Date.now();
      }
      await sleep2(80);
    }
    const iconMain = btnCfg.icon_text;
    const iconAlt = btnCfg.icon_text_alt || null;
    const texts =
      Array.isArray(btnCfg?.button_text) && btnCfg.button_text.length
        ? btnCfg.button_text.map((t) => t.toLowerCase())
        : [];
    const iconOf = (b) => {
      const i = _findIconInElement2(b);
      return i ? i.textContent.trim() : "";
    };
    const notTab = (b) => b.getAttribute("role") !== "tab";
    const uploadBtn =
      btns.find((b) => notTab(b) && iconOf(b) === iconMain) ||
      btns.find((b) => notTab(b) && iconAlt && iconOf(b) === iconAlt) ||
      btns.find(
        (b) =>
          notTab(b) &&
          texts.some((t) => (b.textContent || "").toLowerCase().includes(t)),
      );
    if (!uploadBtn) {
      console.warn(
        `[uploadFilesToFlow] kh\xF4ng th\u1EA5y n\xFAt "T\u1EA3i n\u1ED9i dung nghe nh\xECn l\xEAn" (tabSelected=${tabSelected}):`,
        btns
          .map(
            (b) =>
              `[${iconOf(b)}|${(b.textContent || "").trim().substring(0, 24)}]`,
          )
          .join(" "),
      );
      _closeFlowAdvancedMenu2();
      return fail("V2_UPLOAD_BUTTON_NOT_FOUND", "find_upload_button", {
        tabSelected,
        candidates: btns
          .slice(0, 8)
          .map((b) => ({
            icon: iconOf(b),
            text: (b.textContent || "").trim().substring(0, 80),
            role: b.getAttribute("role") || null,
          })),
      });
    }
    const trapOwner = crypto.randomUUID();
    let armResult = await _slateBridgeCall2("armFilePickerTrap", {
      file,
      timeoutMs: 1e4,
      trapOwner,
      armDeadline: Date.now() + 15e3,
    });
    if (armResult?.armed === true && !Number.isFinite(armResult.expiresAt)) {
      console.warn(
        "[FlowV2Upload] stale MAIN bridge: missing upload lease; refreshing once",
      );
      let refreshed;
      try {
        refreshed = await chrome.runtime.sendMessage({
          action: "refreshFlowUploadBridge",
        });
      } catch (error) {
        refreshed = { success: false, error: error.message };
      }
      if (refreshed?.success && !isStopped()) {
        armResult = await _slateBridgeCall2("armFilePickerTrap", {
          file,
          timeoutMs: 1e4,
          trapOwner,
          armDeadline: Date.now() + 15e3,
        });
      } else {
        armResult = {
          success: false,
          error: isStopped()
            ? "UPLOAD_ABORTED"
            : "UPLOAD_BRIDGE_REFRESH_FAILED",
        };
      }
    }
    if (
      !armResult?.success ||
      armResult?.armed !== true ||
      !Number.isFinite(armResult.expiresAt) ||
      Date.now() >= armResult.expiresAt
    ) {
      await _slateBridgeCall2("cancelFilePickerTrap", { trapOwner });
      console.warn(
        "[uploadFilesToFlow] filePickerTrap arm failed; refusing native picker click:",
        armResult?.error ||
          (Number.isFinite(armResult?.expiresAt)
            ? "UPLOAD_LEASE_EXPIRED"
            : "UPLOAD_BRIDGE_VERSION_MISMATCH"),
      );
      _closeFlowAdvancedMenu2();
      return fail("V2_UPLOAD_TRAP_ARM_FAILED", "arm_file_trap", {
        bridgeError: armResult?.error || null,
        armed: armResult?.armed === true,
        leasePresent: Number.isFinite(armResult?.expiresAt),
        leaseExpired:
          Number.isFinite(armResult?.expiresAt) &&
          Date.now() >= armResult.expiresAt,
      });
    }
    if (isStopped() || !uploadBtn.isConnected) {
      await _slateBridgeCall2("cancelFilePickerTrap", { trapOwner });
      _closeFlowAdvancedMenu2();
      return fail(
        isStopped() ? "UPLOAD_ABORTED" : "V2_UPLOAD_BUTTON_DETACHED",
        "before_upload_click",
      );
    }
    console.log(
      `[uploadFilesToFlow] click "${(uploadBtn.textContent || "").trim().substring(0, 30)}" (trap armed)`,
    );
    simulateClick2(uploadBtn);
    for (let i = 0; i < 25; i++) {
      await sleep2(200);
      if (isStopped()) {
        await _slateBridgeCall2("cancelFilePickerTrap", { trapOwner });
        _closeFlowAdvancedMenu2();
        return fail("UPLOAD_ABORTED", "wait_file_injection");
      }
      const st = await _slateBridgeCall2("filePickerTrapStatus", {});
      if (st?.fired) {
        const isVideo =
          (file.type || "").startsWith("video/") ||
          /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i.test(file.name || "");
        console.log(
          `[uploadFilesToFlow] ${isVideo ? "video" : "image"} \u2192 filePickerTrap fired qua "${st.fired}"`,
        );
        console.log(
          "[FlowV2Upload] picker retained until result/abort/timeout",
          { isVideo },
        );
        await sleep2(80);
        if (isVideo && isStopped())
          return fail("UPLOAD_ABORTED", "confirm_video");
        return {
          success: true,
          initiated: true,
          stage: "file_injected",
          method: st.fired,
        };
      }
    }
    console.warn(
      "[uploadFilesToFlow] filePickerTrap KH\xD4NG fire sau khi click n\xFAt upload",
    );
    await _slateBridgeCall2("cancelFilePickerTrap", { trapOwner });
    _closeFlowAdvancedMenu2();
    return fail("V2_UPLOAD_TRAP_NOT_FIRED", "wait_file_injection", {
      fileName: file?.name || null,
      fileType: file?.type || null,
      fileSize: file?.size || 0,
    });
  }
  async function _dropVideoToFlow(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropTarget =
      _q2("tile_container") || document.querySelector("main") || document.body;
    const rect = dropTarget.getBoundingClientRect?.();
    const cx = rect
      ? Math.round(rect.left + rect.width / 2)
      : Math.round(window.innerWidth / 2);
    const cy = rect
      ? Math.round(rect.top + rect.height / 2)
      : Math.round(window.innerHeight / 2);
    const fire = (type) => {
      let e;
      try {
        e = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: dt,
          clientX: cx,
          clientY: cy,
        });
      } catch (_) {
        e = new Event(type, { bubbles: true, cancelable: true });
      }
      try {
        if (!e.dataTransfer)
          Object.defineProperty(e, "dataTransfer", { value: dt });
      } catch (_) {}
      dropTarget.dispatchEvent(e);
    };
    try {
      fire("dragenter");
      fire("dragover");
      fire("drop");
      const desc = dropTarget.getAttribute?.("data-tile-id")
        ? "tile-board"
        : (dropTarget.tagName || "body").toLowerCase();
      console.log(
        `[uploadFilesToFlow] video drop dispatched on <${desc}> file="${file.name}"`,
      );
    } catch (e) {
      console.warn(
        "[uploadFilesToFlow] video drop dispatch error:",
        e?.message,
      );
    }
    return _waitVideoConfirmModal();
  }
  async function _waitVideoConfirmModal(isStopped = () => shouldStop) {
    const cfg = _getDynamicSelector2("video_upload_confirm");
    if (!cfg?.selectors?.length || !_cfgList2(cfg.text_match).length) {
      console.warn(
        "[uploadFilesToFlow] video_upload_confirm config missing \u2014 kh\xF4ng auto-click confirm (user click tay n\u1EBFu dialog hi\u1EC7n)",
      );
      return true;
    }
    for (let i = 0; i < 24; i++) {
      if (isStopped()) return false;
      await sleep2(300);
      if (isStopped()) return false;
      if (_clickUploadConsentModal2("video_upload_confirm")) return true;
    }
    console.log(
      "[uploadFilesToFlow] video confirm modal kh\xF4ng xu\u1EA5t hi\u1EC7n (c\xF3 th\u1EC3 \u0111\xE3 t\u1EAFt) \u2014 ti\u1EBFp t\u1EE5c ch\u1EDD tile",
    );
    return true;
  }
  var downloadCounter = 0;
  var ExecutionBlocker = {
    _el: null,
    _styleEl: null,
    _blocking: false,
    _wasBlockingBeforeManual: false,
    _manualSuspended: false,
    _pausedPipelineOwned: false,
    _timeoutId: null,
    _sanityIntervalId: null,
    _escapeCount: 0,
    _escapeTimer: null,
    _pipelineOwned: false,
    _stopReleased: false,
    _activeBlockerRunId: null,
    _trackerBlockerRunId: null,
    _releasedBlockerRunIds: new Set(),
    _MAX_BLOCK_TIME: 5 * 60 * 1e3,
    _SANITY_CHECK_INTERVAL: 30 * 1e3,
    _blockEvent(e) {
      if (!ExecutionBlocker._blocking) return;
      if (!e.isTrusted) return;
      if (
        e.target &&
        e.target.closest &&
        (e.target.closest("#tobyflow-flow-tracker") ||
          (e.target.closest("#tobyflow-ft-grid-overlay") &&
            ExecutionBlocker._shouldClickThrough()) ||
          e.target.closest("#tobyflow-manual-enter-banner"))
      )
        return;
      if (e.type === "keydown" && e.key === "Escape") {
        ExecutionBlocker._escapeCount++;
        clearTimeout(ExecutionBlocker._escapeTimer);
        ExecutionBlocker._escapeTimer = setTimeout(function () {
          ExecutionBlocker._escapeCount = 0;
        }, 2e3);
        if (ExecutionBlocker._escapeCount >= 3) {
          console.warn("[ExecutionBlocker] Force hide via Escape x3");
          ExecutionBlocker._escapeCount = 0;
          ExecutionBlocker.hide();
          if (typeof isRunning !== "undefined") isRunning = false;
          if (typeof isPaused !== "undefined") isPaused = false;
          if (typeof shouldStop !== "undefined") {
            shouldStop = true;
            _flowStopEpoch++;
          }
          return;
        }
      }
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    _injectStyles() {
      if (this._styleEl) return;
      var style = document.createElement("style");
      style.id = "tobyflow-execution-blocker-styles";
      style.textContent = `
      @keyframes tobyflow-glow-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }

      @keyframes tobyflow-glow-paused {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.5; }
      }

      #tobyflow-execution-blocker {
        position: fixed;
        inset: 0;
        /* [Fix 2026-07] z-index TH\u1EA4P H\u01A0N tracker 1 b\u1EADc: overlay t\u1EA1o sau tracker \u2192 n\u1EBFu c\xF9ng
           z-index s\u1EBD stack TR\xCAN \u2192 ph\u1EE7 n\xFAt tracker \u2192 click r\u01A1i v\xE0o overlay (e.target=overlay)
           \u2192 capture-listener exclusion '#tobyflow-flow-tracker' fail \u2192 ch\u1EB7n n\xFAt Ti\u1EBFp t\u1EE5c/Stop.
           H\u1EA1 1 b\u1EADc \u2192 tracker lu\xF4n tr\xEAn \u2192 click t\u1EDBi \u0111\xFAng n\xFAt. V\u1EABn tr\xEAn to\xE0n b\u1ED9 Flow content. */
        z-index: 2147483646;
        pointer-events: all;
        cursor: not-allowed;
        background: transparent;
      }

      /* CSS fallback: tracker LU\xD4N tr\xEAn blocker + nh\u1EADn click, k\u1EC3 c\u1EA3 khi blocker ch\u01B0a k\u1ECBp \u1EA9n. */
      #tobyflow-flow-tracker { z-index: 2147483647 !important; }
      #tobyflow-flow-tracker, #tobyflow-flow-tracker * { pointer-events: auto !important; }

      /* Glow border via pseudo-element (GPU layer v\u1EDBi will-change) */
      /* Multi-layer box-shadow simulate blur effect m\xE0 kh\xF4ng d\xF9ng filter:blur (nh\u1EB9 h\u01A1n) */
      #tobyflow-execution-blocker::before {
        content: '';
        position: absolute;
        inset: 0;
        border: 5px solid #cdff01;
        border-radius: 12px;
        box-shadow:
          inset 0 0 0 2px rgba(205,255,1,0.5),
          inset 0 0 8px rgba(205,255,1,0.3),
          0 0 8px rgba(205,255,1,0.4),
          0 0 20px rgba(205,255,1,0.25),
          0 0 40px rgba(205,255,1,0.15);
        animation: tobyflow-glow-pulse 1.8s ease-in-out infinite;
        will-change: opacity;
        pointer-events: none;
      }

      /* Paused state - slower animation, yellow tint */
      #tobyflow-execution-blocker.tobyflow-paused::before {
        border-color: #facc15;
        box-shadow:
          inset 0 0 0 2px rgba(250,204,21,0.45),
          inset 0 0 6px rgba(250,204,21,0.25),
          0 0 6px rgba(250,204,21,0.35),
          0 0 15px rgba(250,204,21,0.2),
          0 0 30px rgba(250,204,21,0.1);
        animation: tobyflow-glow-paused 3s ease-in-out infinite;
      }

      /* Force Flow context menus (Radix UI) unclickable when blocker active */
      body.tobyflow-execution-blocking [data-radix-popper-content-wrapper],
      body.tobyflow-execution-blocking [role="menu"][data-state="open"] {
        pointer-events: none !important;
      }
    `;
      document.head.appendChild(style);
      this._styleEl = style;
    },
    _attachBlockers() {
      if (this._blocking) return;
      this._blocking = true;
      var events = [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "contextmenu",
        "wheel",
        "touchstart",
        "touchend",
        "touchmove",
        "keydown",
        "keyup",
        "keypress",
      ];
      events.forEach(function (evt) {
        document.addEventListener(evt, ExecutionBlocker._blockEvent, {
          capture: true,
          passive: false,
        });
      });
      document.body.classList.add("tobyflow-execution-blocking");
    },
    _detachBlockers() {
      if (!this._blocking) return;
      this._blocking = false;
      var events = [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "contextmenu",
        "wheel",
        "touchstart",
        "touchend",
        "touchmove",
        "keydown",
        "keyup",
        "keypress",
      ];
      events.forEach(function (evt) {
        document.removeEventListener(evt, ExecutionBlocker._blockEvent, {
          capture: true,
        });
      });
      document.body.classList.remove("tobyflow-execution-blocking");
    },
    _startSanityCheck() {
      var self2 = this;
      this._sanityIntervalId = setInterval(function () {
        if (self2._pipelineOwned) return;
        if (typeof isRunning !== "undefined" && !isRunning) {
          console.log(
            "[ExecutionBlocker] Sanity check: isRunning=false, auto-hiding",
          );
          self2.hide();
        }
      }, this._SANITY_CHECK_INTERVAL);
    },
    _stopSanityCheck() {
      if (this._sanityIntervalId) {
        clearInterval(this._sanityIntervalId);
        this._sanityIntervalId = null;
      }
    },
    _startTimeout() {
      var self2 = this;
      this._timeoutId = setTimeout(function () {
        if (self2._pipelineOwned) return;
        console.warn(
          "[ExecutionBlocker] Auto-timeout after " +
            self2._MAX_BLOCK_TIME / 1e3 +
            "s, force hiding",
        );
        self2.hide();
        if (typeof isRunning !== "undefined") isRunning = false;
        if (typeof isPaused !== "undefined") isPaused = false;
        if (typeof shouldStop !== "undefined") {
          shouldStop = true;
          _flowStopEpoch++;
        }
      }, this._MAX_BLOCK_TIME);
    },
    _stopTimeout() {
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }
    },
    _onVisibilityChange() {
      if (ExecutionBlocker._pipelineOwned) {
        clearTimeout(ExecutionBlocker._visibilityTimeoutId);
        ExecutionBlocker._visibilityTimeoutId = null;
        return;
      }
      if (document.hidden && ExecutionBlocker._blocking) {
        ExecutionBlocker._visibilityTimeoutId = setTimeout(
          function () {
            if (
              !ExecutionBlocker._pipelineOwned &&
              document.hidden &&
              ExecutionBlocker._blocking
            ) {
              console.warn(
                "[ExecutionBlocker] Tab hidden too long, auto-hiding + resetting state",
              );
              ExecutionBlocker.hide();
              if (typeof isRunning !== "undefined") isRunning = false;
              if (typeof isPaused !== "undefined") isPaused = false;
              if (typeof shouldStop !== "undefined") {
                shouldStop = true;
                _flowStopEpoch++;
              }
            }
          },
          2 * 60 * 1e3,
        );
      } else {
        if (ExecutionBlocker._visibilityTimeoutId) {
          clearTimeout(ExecutionBlocker._visibilityTimeoutId);
          ExecutionBlocker._visibilityTimeoutId = null;
        }
      }
    },
    _shouldClickThrough() {
      try {
        return !!(
          self.FloatingTracker &&
          FloatingTracker._isApiSession &&
          FloatingTracker._isApiSession()
        );
      } catch (_) {
        return false;
      }
    },
    _applyMode(allowAcquire) {
      if (!this._el) return;
      var clickThrough = this._shouldClickThrough();
      if (
        (allowAcquire !== true && !this._pipelineOwned) ||
        this._stopReleased
      ) {
        this._el.style.pointerEvents = "none";
        this._el.style.display = "none";
        this._detachBlockers();
        return;
      }
      this._el.style.pointerEvents = clickThrough ? "none" : "all";
      this._el.style.display =
        clickThrough || this._manualSuspended ? "none" : "block";
      if (clickThrough || this._manualSuspended) this._detachBlockers();
      else this._attachBlockers();
    },
    show(options) {
      options = options || {};
      if (this._stopReleased) {
        this.hide();
        return;
      }
      this._injectStyles();
      var wasBlocking = this._blocking;
      if (!wasBlocking) {
        if (!this._pipelineOwned) {
          this._startTimeout();
        }
        this._startSanityCheck();
        document.removeEventListener(
          "visibilitychange",
          this._onVisibilityChange,
        );
        document.addEventListener("visibilitychange", this._onVisibilityChange);
      }
      if (!this._el) {
        var el = document.createElement("div");
        el.id = "tobyflow-execution-blocker";
        document.body.appendChild(el);
        this._el = el;
      }
      this._el.style.display = this._manualSuspended ? "none" : "block";
      this._applyMode(true);
    },
    setPaused(paused) {
      if (!this._el) return;
      if (paused) {
        this._el.classList.add("tobyflow-paused");
      } else {
        this._el.classList.remove("tobyflow-paused");
      }
    },
    update(options) {
      if (typeof isPaused !== "undefined") {
        this.setPaused(isPaused);
      }
    },
    hide() {
      this._detachBlockers();
      this._stopTimeout();
      this._stopSanityCheck();
      this._escapeCount = 0;
      this._pipelineOwned = false;
      clearTimeout(this._escapeTimer);
      clearTimeout(this._visibilityTimeoutId);
      document.removeEventListener(
        "visibilitychange",
        this._onVisibilityChange,
      );
      if (this._el) {
        this._el.style.display = "none";
        this._el.classList.remove("tobyflow-paused");
      }
      try {
        _endZoomSession();
      } catch (_) {}
      try {
        ApiGenNotice.hide();
      } catch (_) {}
    },
    isVisible() {
      return this._el && this._el.style.display !== "none";
    },
    suspendForManual() {
      this._manualSuspended = true;
      this._wasBlockingBeforeManual = this._blocking;
      this._blocking = false;
      if (this._el) this._el.style.display = "none";
    },
    resumeAfterManual(reblock) {
      this._manualSuspended = false;
      var was = this._wasBlockingBeforeManual;
      this._wasBlockingBeforeManual = false;
      if (!reblock) return;
      if (
        shouldStop ||
        (typeof _manualWaitAbort !== "undefined" && _manualWaitAbort)
      )
        return;
      if (was && this._pipelineOwned && this._el) {
        this._blocking = true;
        this._el.style.display = "block";
      }
    },
  };
  async function _openFlowAdvancedMenu(isStopped = () => shouldStop) {
    if (_flowPageContext?.driverKey !== "flow_v2") return false;
    return _openFlowV2ComponentPicker(isStopped);
  }
  var _flowV2ProjectMediaNavigationPending = null;
  async function _ensureFlowV2ProjectMediaReady() {
    if (_flowV2ProjectMediaNavigationPending)
      return _flowV2ProjectMediaNavigationPending;
    const target = FlowDriverRegistry.describeUrl(location.href);
    if (
      target?.driverKey !== "flow_v2" ||
      !target.projectId ||
      target.isProjectEditor ||
      _isFlowMediaViewerOpen2()
    )
      return { success: true, actioned: false };
    const sameTarget = () => {
      const live = FlowDriverRegistry.describeUrl(location.href);
      return (
        live?.origin === target.origin &&
        live.projectId === target.projectId &&
        live.routePrefix === target.routePrefix
      );
    };
    const rootUrl = `${target.origin}${target.routePrefix}/project/${target.projectId}`;
    const operation = (async () => {
      const allMedia = _v2FindSemanticControl2(
        "project_all_media_navigation",
        document,
      );
      if (allMedia && !_isFlowControlDisabled2(allMedia)) {
        console.log("[FlowProjectNavigation] clicking All media", {
          projectId: target.projectId,
        });
        simulateClick2(allMedia);
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
          if (!sameTarget())
            return { success: false, error: "FLOW_EXECUTION_TARGET_CHANGED" };
          if (FlowDriverRegistry.isProjectEditor(location.href)) {
            _flowPageContext = FlowDriverRegistry.describeUrl(location.href);
            return { success: true, actioned: true };
          }
          await sleep2(100);
        }
      }
      if (!sameTarget())
        return { success: false, error: "FLOW_EXECUTION_TARGET_CHANGED" };
      if (FlowDriverRegistry.isProjectEditor(location.href))
        return { success: true, actioned: true };
      console.log("[FlowProjectNavigation] navigating to project root", {
        projectId: target.projectId,
      });
      location.assign(rootUrl);
      return {
        success: false,
        actioned: true,
        error: "FLOW_PROJECT_NAVIGATING",
      };
    })();
    _flowV2ProjectMediaNavigationPending = operation;
    try {
      return await operation;
    } finally {
      if (_flowV2ProjectMediaNavigationPending === operation)
        _flowV2ProjectMediaNavigationPending = null;
    }
  }
  async function _ensureFlowV2AgentReady({
    steps = ["instruction", "panel", "mode"],
    waitForEditor = true,
    projectActioned = false,
  } = {}) {
    if (_flowPageContext?.driverKey !== "flow_v2") {
      return {
        success: true,
        actioned: false,
        driverKey: _flowPageContext?.driverKey || null,
      };
    }
    const projectReady = await _ensureFlowV2ProjectMediaReady();
    if (!projectReady.success) return projectReady;
    let actioned = projectReady.actioned === true || projectActioned;
    const ownerKeys = {
      instruction: "agent_instruction_dialog",
      panel: "agent_panel_owner",
      mode: "agent_mode_active",
    };
    for (const step of steps) {
      const key = ownerKeys[step];
      if (!_getDynamicSelector2(key)?.selectors?.length) {
        return { success: false, actioned, error: `CONFIG_REQUIRED:${key}` };
      }
    }
    const waitGone = async (key, timeoutMs = 2e3) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!_v2QueryVisibleConfigured2(key)) return true;
        await sleep2(100);
      }
      return !_v2QueryVisibleConfigured2(key);
    };
    const instruction =
      steps.includes("instruction") &&
      _v2QueryVisibleConfigured2("agent_instruction_dialog");
    if (instruction) {
      const done = _v2FindSemanticControl2(
        "agent_instruction_done",
        instruction,
      );
      if (!done)
        return { success: false, actioned, error: "V2_AGENT_DONE_NOT_FOUND" };
      console.log("[FlowAgent:v2] Instruction view open -> clicking Done");
      simulateClick2(done);
      actioned = true;
      if (!(await waitGone("agent_instruction_dialog"))) {
        return { success: false, actioned, error: "V2_AGENT_DONE_UNVERIFIED" };
      }
    }
    const panel =
      steps.includes("panel") &&
      _v2QueryVisibleConfigured2("agent_panel_owner");
    if (panel) {
      const close = _v2FindSemanticControl2("agent_panel_close", panel);
      if (!close)
        return {
          success: false,
          actioned,
          error: "V2_AGENT_PANEL_CLOSE_NOT_FOUND",
        };
      console.log("[FlowAgent:v2] Agent panel open -> closing");
      simulateClick2(close);
      actioned = true;
      if (!(await waitGone("agent_panel_owner"))) {
        return {
          success: false,
          actioned,
          error: "V2_AGENT_PANEL_CLOSE_UNVERIFIED",
        };
      }
      await sleep2(300);
    }
    const activeToggle =
      steps.includes("mode") && _v2QueryVisibleConfigured2("agent_mode_active");
    if (activeToggle) {
      console.log("[FlowAgent:v2] Agent mode active -> turning OFF");
      simulateClick2(activeToggle);
      actioned = true;
      if (!(await waitGone("agent_mode_active"))) {
        return {
          success: false,
          actioned,
          error: "V2_AGENT_MODE_OFF_UNVERIFIED",
        };
      }
    }
    const editorReadyMs =
      actioned && waitForEditor ? await _waitForFlowEditorReady(5e3) : 0;
    if (actioned && waitForEditor && editorReadyMs === null) {
      return {
        success: false,
        actioned,
        error: "V2_COMPOSER_NOT_READY_AFTER_AGENT_CLOSE",
      };
    }
    console.log(
      `[FlowAgent:v2] ready (actioned=${actioned}, editorReadyMs=${editorReadyMs || 0})`,
    );
    return {
      success: true,
      actioned,
      editorReadyMs: editorReadyMs || 0,
      driverKey: "flow_v2",
    };
  }
  async function _ensureFlowV2AddMenuTrigger(triggerCfg) {
    const findVisibleTrigger = () => {
      for (const selector of triggerCfg.selectors) {
        try {
          const candidates = Array.from(document.querySelectorAll(selector));
          for (let i = candidates.length - 1; i >= 0; i--) {
            const candidate = candidates[i];
            const rect = candidate.getBoundingClientRect?.();
            if (
              !candidate.isConnected ||
              !rect ||
              rect.width <= 0 ||
              rect.height <= 0
            )
              continue;
            const icon = _findIconInElement2(candidate);
            if (icon?.textContent?.trim() === triggerCfg.icon_text)
              return candidate;
          }
        } catch (_) {}
      }
      return null;
    };
    let trigger = findVisibleTrigger();
    if (trigger) return trigger;
    const ingredientsCfg = _getDynamicSelector2("video_mode_ingredients");
    const settings = getSettingsButton2(getSubmitButton2());
    if (
      !settings ||
      !ingredientsCfg?.selectors?.length ||
      !ingredientsCfg.icon_text
    ) {
      console.warn(
        "[FlowV2 add menu] trigger hidden and mode-switch config unavailable",
      );
      return null;
    }
    let panel = _getActiveSettingsPanel2();
    if (!panel || panel === document) {
      console.log(
        "[FlowV2 add menu] composer + hidden; opening settings to leave Video Frames",
      );
      simulateClick2(settings);
      const panelDeadline = Date.now() + 2500;
      while (Date.now() < panelDeadline) {
        panel = _getActiveSettingsPanel2();
        if (panel && panel !== document) break;
        await sleep2(80);
      }
    }
    if (!panel || panel === document) {
      console.warn(
        "[FlowV2 add menu] settings panel unavailable while composer + is hidden",
      );
      return null;
    }
    const ingredient = _v2FindSemanticControl2("video_mode_ingredients", panel);
    const selectedAttr = ingredientsCfg.attribute_selected || "aria-checked";
    if (!ingredient) {
      console.warn(
        "[FlowV2 add menu] Ingredients control unavailable while composer + is hidden",
      );
      return null;
    }
    if (ingredient.getAttribute(selectedAttr) !== "true")
      simulateClick2(ingredient);
    const modeDeadline = Date.now() + 2e3;
    while (
      Date.now() < modeDeadline &&
      ingredient.getAttribute(selectedAttr) !== "true"
    )
      await sleep2(80);
    if (ingredient.getAttribute(selectedAttr) !== "true") {
      console.warn(
        "[FlowV2 add menu] Video Frames -> Ingredients was not confirmed",
      );
      return null;
    }
    console.log("[FlowV2 add menu] Video Frames -> Ingredients confirmed");
    const livePanel = _getActiveSettingsPanel2();
    const liveSettings = getSettingsButton2(getSubmitButton2());
    if (livePanel && livePanel !== document && liveSettings) {
      simulateClick2(liveSettings);
      const closeDeadline = Date.now() + 2e3;
      while (Date.now() < closeDeadline) {
        const currentPanel = _getActiveSettingsPanel2();
        if (!currentPanel || currentPanel === document) break;
        await sleep2(80);
      }
    }
    const triggerDeadline = Date.now() + 2500;
    while (Date.now() < triggerDeadline && !(trigger = findVisibleTrigger()))
      await sleep2(80);
    if (!trigger)
      console.warn(
        "[FlowV2 add menu] composer + did not return after Ingredients switch",
      );
    return trigger;
  }
  async function _openFlowV2ComponentPicker(isStopped = () => shouldStop) {
    const triggerCfg = _getDynamicSelector2("composer_advanced_menu_button");
    const rootCfg = _getDynamicSelector2("add_component_root");
    if (
      !triggerCfg?.selectors?.length ||
      !triggerCfg.icon_text ||
      !rootCfg?.selectors?.length
    )
      return false;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (isStopped()) return false;
      if (_v2QueryVisibleConfigured2("add_component_root")) return true;
      const trigger = await _ensureFlowV2AddMenuTrigger(triggerCfg);
      if (isStopped()) return false;
      if (!trigger) {
        console.warn(
          "[FlowV2Picker] trigger unavailable",
          JSON.stringify({
            attempt: attempt + 1,
            visibility: document.visibilityState,
            focused: document.hasFocus(),
          }),
        );
        if (attempt === 0) await sleep2(300);
        continue;
      }
      if (_v2QueryVisibleConfigured2("add_component_root")) return true;
      simulateClick2(trigger);
      const deadline = Date.now() + 3e3;
      while (Date.now() < deadline) {
        if (isStopped()) return false;
        if (_v2QueryVisibleConfigured2("add_component_root")) return true;
        await sleep2(80);
      }
      console.warn("[FlowV2Picker] open not acknowledged", {
        attempt: attempt + 1,
        visible: document.visibilityState,
        focused: document.hasFocus(),
        connected: trigger.isConnected,
      });
    }
    return false;
  }
  async function _switchFlowV2ComponentTab(
    kind,
    { allowEmptyList = false } = {},
  ) {
    const root = _v2QueryVisibleConfigured2("add_component_root");
    const key =
      kind === "voice"
        ? "add_component_voice_tab"
        : "add_component_character_tab";
    const cfg = _getDynamicSelector2(key);
    const listboxCfg = _getDynamicSelector2("add_component_listbox");
    if (
      !root ||
      !cfg?.selectors?.length ||
      !cfg.icon_text ||
      !listboxCfg?.selectors?.length
    )
      return false;
    const mobileFilterTrigger = _v2QueryConfigured2(
      "add_component_mobile_filter_trigger",
      root,
    );
    let searchRoot = root;
    if (mobileFilterTrigger) {
      if (mobileFilterTrigger.getAttribute("aria-expanded") !== "true")
        simulateClick2(mobileFilterTrigger);
      const filterDeadline = Date.now() + 2e3;
      let filterList = null;
      while (Date.now() < filterDeadline && !filterList) {
        filterList = _v2QueryVisibleConfigured2(
          "add_component_mobile_filter_list",
        );
        if (!filterList) await sleep2(80);
      }
      if (!filterList) {
        console.warn(
          `[FlowV2 add menu] mobile ${kind} category filter did not open`,
        );
        return false;
      }
      searchRoot = filterList;
    }
    let target = null;
    for (const selector of cfg.selectors) {
      try {
        for (const tab of searchRoot.querySelectorAll(selector)) {
          if (_findIconInElement2(tab)?.textContent?.trim() === cfg.icon_text) {
            target = tab;
            break;
          }
        }
      } catch (_) {}
      if (target) break;
    }
    if (!target) return false;
    if (
      mobileFilterTrigger ||
      target.getAttribute(cfg.attribute_selected || "aria-selected") !== "true"
    ) {
      simulateClick2(target);
    }
    const deadline = Date.now() + 2500;
    let mobileConfirmedAt = 0;
    let categoryConfirmedAt = 0;
    while (Date.now() < deadline) {
      const currentRoot = _v2QueryVisibleConfigured2("add_component_root");
      const listbox =
        currentRoot &&
        _v2QueryConfigured2("add_component_listbox", currentRoot);
      let categoryConfirmed =
        target.getAttribute(cfg.attribute_selected || "aria-selected") ===
        "true";
      if (mobileFilterTrigger) {
        const liveTrigger =
          currentRoot &&
          _v2QueryConfigured2(
            "add_component_mobile_filter_trigger",
            currentRoot,
          );
        const liveIcon =
          liveTrigger && _findIconInElement2(liveTrigger)?.textContent?.trim();
        const filterStillOpen = !!_v2QueryVisibleConfigured2(
          "add_component_mobile_filter_list",
        );
        categoryConfirmed = liveIcon === cfg.icon_text && !filterStillOpen;
        if (categoryConfirmed && !mobileConfirmedAt)
          mobileConfirmedAt = Date.now();
        categoryConfirmed =
          categoryConfirmed && Date.now() - mobileConfirmedAt >= 120;
      }
      if (listbox && categoryConfirmed) {
        console.log(
          `[FlowV2 add menu] ${kind} category selected (${mobileFilterTrigger ? "mobile-filter" : "desktop-tab"})`,
        );
        return true;
      }
      categoryConfirmedAt = categoryConfirmed
        ? categoryConfirmedAt || Date.now()
        : 0;
      await sleep2(80);
    }
    const liveRoot = _v2QueryVisibleConfigured2("add_component_root");
    if (
      allowEmptyList &&
      categoryConfirmedAt &&
      Date.now() - categoryConfirmedAt >= 500 &&
      liveRoot &&
      !_v2QueryConfigured2("add_component_listbox", liveRoot)
    ) {
      if (mobileFilterTrigger) {
        const liveTrigger = _v2QueryConfigured2(
          "add_component_mobile_filter_trigger",
          liveRoot,
        );
        return (
          _findIconInElement2(liveTrigger)?.textContent?.trim() ===
            cfg.icon_text &&
          !_v2QueryVisibleConfigured2("add_component_mobile_filter_list")
        );
      }
      for (const selector of cfg.selectors) {
        try {
          for (const liveTab of liveRoot.querySelectorAll(selector)) {
            if (
              _findIconInElement2(liveTab)?.textContent?.trim() ===
                cfg.icon_text &&
              liveTab.getAttribute(
                cfg.attribute_selected || "aria-selected",
              ) === "true"
            )
              return true;
          }
        } catch (_) {}
      }
    }
    return false;
  }
  async function _switchToVoicesTab() {
    if (_flowPageContext?.driverKey === "flow_v2")
      return _switchFlowV2ComponentTab("voice");
    const iconText =
      _getDynamicSelector2("advanced_menu_voices_tab")?.icon_text ||
      "voice_selection";
    const tab = _findTabByIconText2(iconText);
    if (!tab) {
      console.warn("[FlowVoice] advanced_menu_voices_tab not found");
      return false;
    }
    tab.click();
    await sleep2(200);
    const deadline = Date.now() + 2e3;
    while (Date.now() < deadline) {
      if (document.querySelector('[role="option"]')) return true;
      await sleep2(80);
    }
    return false;
  }
  async function _ensureFlowV2AddMenuClosed(options = {}) {
    const ignoreStop = options.ignoreStop === true;
    const requireEditor = options.requireEditor === true;
    let abortLogged = false;
    const isAborted = () => {
      const aborted = !ignoreStop && shouldStop;
      if (aborted && !abortLogged) {
        abortLogged = true;
        console.warn(
          "[FlowBatchControlAudit]",
          JSON.stringify({
            event: "editor_preflight_aborted",
            visibility: document.visibilityState,
            stopEpoch: _flowStopEpoch,
            pipelineOwned: ExecutionBlocker._pipelineOwned === true,
            blockerRunId: ExecutionBlocker._activeBlockerRunId || null,
            stopReleased: ExecutionBlocker._stopReleased === true,
          }),
        );
      }
      return aborted;
    };
    const waitForEditor = async (result) => {
      if (!requireEditor) return result;
      const editorDeadline = Date.now() + 2500;
      while (Date.now() < editorDeadline) {
        if (isAborted()) return { success: false, error: "ABORTED" };
        if (getEditor2()) return result;
        await sleep2(80);
      }
      return {
        success: false,
        error: "V2_EDITOR_NOT_READY_AFTER_ADD_MENU_CLOSE",
      };
    };
    if (!_v2QueryVisibleConfigured2("add_component_root")) {
      return waitForEditor({ success: true, actioned: false });
    }
    if (isAborted()) return { success: false, error: "ABORTED" };
    _closeFlowAdvancedMenu2();
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      if (isAborted()) return { success: false, error: "ABORTED" };
      if (!_v2QueryVisibleConfigured2("add_component_root")) {
        return waitForEditor({ success: true, actioned: true });
      }
      await sleep2(80);
    }
    return { success: false, error: "V2_ADD_MENU_CLOSE_FAILED" };
  }
  async function scrapeFlowVoices() {
    if (_flowPageContext?.driverKey !== "flow_v2")
      return { success: false, error: "FLOW_LEGACY_GENERATION_DISABLED" };
    return _scrapeFlowV2Components("voice");
  }
  async function _removeAllSelectedFlowVoices() {
    if (_flowPageContext?.driverKey !== "flow_v2") return 0;
    return _removeFlowV2IngredientKind("ingredient_voice_chip");
  }
  async function selectFlowVoice(voicePayload, opts = {}) {
    if (!voicePayload?.search_value) return { success: true, skipped: true };
    if (_flowPageContext?.driverKey !== "flow_v2")
      return { success: false, error: "FLOW_LEGACY_GENERATION_DISABLED" };
    return _selectFlowV2Component("voice", voicePayload.search_value, opts);
  }
  async function _clickAddToPromptButton() {
    const cfg = _getDynamicSelector2("advanced_menu_add_to_prompt_button");
    const buttonTexts = cfg?.button_text?.length
      ? cfg.button_text
      : ["Th\xEAm v\xE0o c\xE2u l\u1EC7nh", "Add To Prompt", "Add to prompt"];
    const deadline = Date.now() + 3e3;
    while (Date.now() < deadline) {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        for (const target of buttonTexts) {
          if (text === target || text.startsWith(target)) {
            if (btn.disabled) continue;
            const rect = btn.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            console.log(
              `[FlowVoice] Clicking "Add To Prompt" button: text="${text}"`,
            );
            btn.click();
            return true;
          }
        }
      }
      await sleep2(150);
    }
    console.warn(
      "[FlowVoice] _clickAddToPromptButton timeout \u2014 no matching button found",
    );
    return false;
  }
  async function _walkFlowV2ComponentOptions(kind, onOption) {
    const root = _v2QueryConfigured2("add_component_root");
    const listbox = root && _v2QueryConfigured2("add_component_listbox", root);
    const optionCfg = _getDynamicSelector2("add_component_option");
    if (!listbox || !optionCfg?.selectors?.length) return { ok: false };
    const seen = new Set();
    let stable = 0;
    for (let step = 0; step < 60 && stable < 5; step++) {
      const before = seen.size;
      for (const selector of optionCfg.selectors) {
        let options = [];
        try {
          options = listbox.querySelectorAll(selector);
        } catch (_) {}
        for (const option of options) {
          const info = _flowV2ComponentInfo2(option, kind);
          if (!info || seen.has(info.name)) continue;
          seen.add(info.name);
          const result = await onOption(option, info);
          if (result) return { ok: true, result, seen };
        }
      }
      stable = seen.size === before ? stable + 1 : 0;
      const previousTop = listbox.scrollTop;
      listbox.scrollTop = Math.min(
        listbox.scrollHeight,
        previousTop + Math.max(240, listbox.clientHeight * 0.8),
      );
      await sleep2(180);
      if (listbox.scrollTop === previousTop && stable >= 2) break;
    }
    return { ok: true, result: null, seen };
  }
  async function _scrapeFlowV2Components(kind) {
    if (
      !(await _openFlowV2ComponentPicker()) ||
      !(await _switchFlowV2ComponentTab(kind, {
        allowEmptyList: kind === "character",
      }))
    ) {
      console.warn(
        `[FlowV2 component sync] ${kind} category could not be verified; refusing stale asset list`,
      );
      return { success: false, error: "v2_component_picker_unavailable" };
    }
    const root = _v2QueryVisibleConfigured2("add_component_root");
    if (
      kind === "character" &&
      root &&
      !_v2QueryConfigured2("add_component_listbox", root)
    ) {
      _closeFlowAdvancedMenu2();
      console.log("[FlowV2 component sync] verified empty character category");
      return { success: true, characters: [] };
    }
    const items = [];
    const walked = await _walkFlowV2ComponentOptions(kind, (_option, info) => {
      items.push(info);
      return null;
    });
    _closeFlowAdvancedMenu2();
    if (!walked.ok)
      return { success: false, error: "v2_component_list_unavailable" };
    console.log(
      `[FlowV2 component sync] verified ${kind} category; scraped ${items.length} item(s)`,
    );
    return kind === "voice"
      ? { success: true, voices: items }
      : { success: true, characters: items };
  }
  async function _selectFlowV2Component(kind, targetName, opts) {
    if (!opts?.skipClear) {
      if (kind === "voice") await _removeAllSelectedFlowVoices();
      else await _removeAllSelectedFlowCharacters();
    }
    const chipKey =
      kind === "voice" ? "ingredient_voice_chip" : "ingredient_character_chip";
    const bar = _v2QueryConfigured2("ingredient_bar");
    const chipCfg = _getDynamicSelector2(chipKey);
    const countChips = (owner, cfg) => {
      let count = 0;
      if (!owner || !cfg?.selectors?.length) return count;
      for (const selector of cfg.selectors) {
        try {
          count += owner.querySelectorAll(selector).length;
        } catch (_) {}
      }
      return count;
    };
    const before = countChips(bar, chipCfg);
    const inlineCount = () =>
      (_flowV2InlineState2().parts || []).filter(
        (part) =>
          (kind === "voice" ? part.voice : part.char) === targetName && part.id,
      ).length;
    const inlineBefore = opts?.requireInline ? inlineCount() : 0;
    const confirmed = () =>
      opts?.requireInline
        ? inlineCount() === inlineBefore + 1
        : countChips(
            _v2QueryConfigured2("ingredient_bar"),
            _getDynamicSelector2(chipKey),
          ) > before;
    const reconcileLateApply = async (strategy) => {
      const deadline = Date.now() + 3e3;
      while (Date.now() < deadline) {
        if (confirmed()) {
          console.log(
            `[FlowV2 component select] ${kind} reconciled after delayed ${strategy}`,
          );
          return {
            success: true,
            selected: targetName,
            selectionVerified: true,
            strategy,
          };
        }
        await sleep2(80);
      }
      return confirmed()
        ? {
            success: true,
            selected: targetName,
            selectionVerified: true,
            strategy,
          }
        : null;
    };
    if (
      (opts?.requireInline
        ? !_v2QueryVisibleConfigured2("add_component_root")
        : !(await _openFlowV2ComponentPicker())) ||
      !(await _switchFlowV2ComponentTab(kind))
    ) {
      _closeFlowAdvancedMenu2();
      return { success: false, error: "v2_component_picker_unavailable" };
    }
    const walked = await _walkFlowV2ComponentOptions(kind, (option, info) => {
      if (info.name !== targetName) return null;
      option.scrollIntoView({ block: "center" });
      option.click();
      return info;
    });
    if (!walked.ok || !walked.result) {
      _closeFlowAdvancedMenu2();
      return { success: false, error: kind + "_not_found", name: targetName };
    }
    const directDeadline = Date.now() + 700;
    while (Date.now() < directDeadline) {
      const directBar = _v2QueryConfigured2("ingredient_bar");
      if (confirmed()) {
        console.log(
          `[FlowV2 component select] ${kind} applied directly from mobile asset list`,
        );
        return {
          success: true,
          selected: targetName,
          selectionVerified: true,
          strategy: "v2_mobile_direct_apply",
        };
      }
      await sleep2(80);
    }
    const detailDeadline = Date.now() + 2500;
    let apply = null;
    while (Date.now() < detailDeadline && !apply) {
      if (confirmed()) {
        return {
          success: true,
          selected: targetName,
          selectionVerified: true,
          strategy: "v2_mobile_direct_apply",
        };
      }
      const root = _v2QueryConfigured2("add_component_root");
      const detail = root && _v2QueryConfigured2("add_component_detail", root);
      apply =
        detail && _v2QueryConfigured2("add_component_apply_button", detail);
      if (!apply) await sleep2(80);
    }
    if (
      !apply ||
      apply.disabled ||
      apply.getAttribute("aria-disabled") === "true"
    ) {
      const reconciled2 = await reconcileLateApply(
        "v2_mobile_late_direct_apply",
      );
      if (reconciled2) return reconciled2;
      _closeFlowAdvancedMenu2();
      return { success: false, error: "v2_component_apply_unavailable" };
    }
    apply.click();
    const verifyDeadline = Date.now() + 3e3;
    while (Date.now() < verifyDeadline) {
      const currentBar = _v2QueryConfigured2("ingredient_bar");
      const cfg = _getDynamicSelector2(chipKey);
      const count = countChips(currentBar, cfg);
      if (confirmed())
        return {
          success: true,
          selected: targetName,
          selectionVerified: true,
          strategy: "v2_detail_apply",
        };
      await sleep2(80);
    }
    const reconciled = await reconcileLateApply("v2_detail_late_apply");
    if (reconciled) return reconciled;
    return {
      success: false,
      error: "v2_component_chip_not_observed",
      name: targetName,
    };
  }
  async function _switchToCharactersTab() {
    if (_flowPageContext?.driverKey === "flow_v2")
      return _switchFlowV2ComponentTab("character");
    const iconText =
      _getDynamicSelector2("advanced_menu_characters_tab")?.icon_text ||
      "accessibility_new";
    const tab = _findTabByIconText2(iconText);
    if (!tab) {
      console.warn("[FlowCharacter] advanced_menu_characters_tab not found");
      return false;
    }
    tab.click();
    await sleep2(200);
    const deadline = Date.now() + 2e3;
    while (Date.now() < deadline) {
      if (document.querySelector('[role="option"]')) return true;
      await sleep2(80);
    }
    return false;
  }
  async function scrapeFlowCharacters() {
    if (_flowPageContext?.driverKey !== "flow_v2")
      return { success: false, error: "FLOW_LEGACY_GENERATION_DISABLED" };
    return _scrapeFlowV2Components("character");
  }
  async function _removeAllSelectedFlowCharacters() {
    if (_flowPageContext?.driverKey !== "flow_v2") return 0;
    return _removeFlowV2IngredientKind("ingredient_character_chip");
  }
  async function _removeFlowV2IngredientKind(chipKey) {
    const bar = _v2QueryConfigured2("ingredient_bar");
    const chipCfg = _getDynamicSelector2(chipKey);
    const removeCfg = _getDynamicSelector2("ingredient_remove_button");
    if (
      !bar ||
      !chipCfg?.selectors?.length ||
      !removeCfg?.selectors?.length ||
      !removeCfg.icon_text
    )
      return 0;
    let removed = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      let chip = null;
      for (const selector of chipCfg.selectors) {
        try {
          chip = bar.querySelector(selector);
        } catch (_) {}
        if (chip) break;
      }
      if (!chip) break;
      let button = null;
      for (const selector of removeCfg.selectors) {
        let candidates = [];
        try {
          candidates = chip.querySelectorAll(selector);
        } catch (_) {}
        button = Array.from(candidates).find(
          (candidate) =>
            _findIconInElement2(candidate)?.textContent?.trim() ===
            removeCfg.icon_text,
        );
        if (button) break;
      }
      if (!button) break;
      button.click();
      const deadline = Date.now() + 1200;
      while (document.contains(chip) && Date.now() < deadline) await sleep2(60);
      if (document.contains(chip)) break;
      removed++;
    }
    return removed;
  }
  async function selectFlowCharacter(characterPayload, opts = {}) {
    if (!characterPayload?.search_value)
      return { success: true, skipped: true };
    if (_flowPageContext?.driverKey !== "flow_v2")
      return { success: false, error: "FLOW_LEGACY_GENERATION_DISABLED" };
    if (!Array.isArray(characterPayload.selections)) {
      return _selectFlowV2Component(
        "character",
        characterPayload.search_value,
        opts,
      );
    }
    const selectedCharacters = [];
    const seen = new Set();
    let error = null;
    for (const character of characterPayload.selections) {
      if (!character?.search_value || seen.has(character.search_value))
        continue;
      seen.add(character.search_value);
      const result = await _selectFlowV2Component(
        "character",
        character.search_value,
        { ...opts, skipClear: opts.skipClear === true || seen.size > 1 },
      );
      if (result?.success === true) selectedCharacters.push(character);
      else error = result?.error || "character_not_found";
    }
    return {
      success: selectedCharacters.length === seen.size && seen.size > 0,
      selected: selectedCharacters
        .map((character) => character.search_value)
        .join(", "),
      selectedCharacters,
      selectedCount: selectedCharacters.length,
      error,
    };
  }
  var _COMPONENT_MENTION_REGEX = /@(voice|char):(\[[^\]]+\]|[^\s]+)/g;
  async function _addComponentInline(type, name) {
    if (!name) return { success: false, error: "empty_name" };
    try {
      if (_flowPageContext?.driverKey === "flow_v2") {
        const editor = getEditor2();
        if (!editor) return { success: false, error: "editor_not_found" };
        const beforeText = getEditorUserText2(editor).replace(/\n$/, "");
        let applied = false;
        try {
          editor.focus();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          const keyOptions = {
            key: "@",
            code: "Digit2",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
            composed: true,
          };
          editor.dispatchEvent(new KeyboardEvent("keydown", keyOptions));
          document.execCommand("insertText", false, "@");
          editor.dispatchEvent(new KeyboardEvent("keyup", keyOptions));
          const deadline = Date.now() + 3e3;
          while (
            Date.now() < deadline &&
            !_v2QueryVisibleConfigured2("add_component_root")
          )
            await sleep2(80);
          if (!_v2QueryVisibleConfigured2("add_component_root"))
            return {
              success: false,
              error: "v2_inline_mention_picker_unavailable",
            };
          const selected =
            type === "voice"
              ? await selectFlowVoice(
                  { search_value: name },
                  { skipClear: true, requireInline: true },
                )
              : await selectFlowCharacter(
                  { search_value: name },
                  { skipClear: true, requireInline: true },
                );
          applied = selected?.success === true;
          return {
            success: applied,
            name,
            strategy: "v2_inline_component",
            error: selected?.error,
          };
        } finally {
          const closeResult = await _ensureFlowV2AddMenuClosed({
            ignoreStop: true,
          });
          if (!closeResult.success) {
            console.warn(
              "[FlowMention] component picker did not close before releasing editor",
              { type, name, error: closeResult.error },
            );
          }
          if (!applied) {
            if (
              getEditor2() === editor &&
              getEditorUserText2(editor).replace(/\n$/, "") === beforeText + "@"
            ) {
              editor.focus();
              const tail = document.createRange();
              tail.selectNodeContents(editor);
              tail.collapse(false);
              const currentSelection = window.getSelection();
              currentSelection.removeAllRanges();
              currentSelection.addRange(tail);
              document.execCommand("delete", false, null);
            }
          }
        }
      }
      return { success: false, error: "FLOW_LEGACY_GENERATION_DISABLED" };
    } catch (err) {
      console.error(
        `[FlowMention] _addComponentInline(${type}, "${name}") error:`,
        err,
      );
      try {
        await _ensureFlowV2AddMenuClosed({ ignoreStop: true });
      } catch (_) {}
      return { success: false, error: err.message, name };
    }
  }
  async function _addVoiceInline(name) {
    return _addComponentInline("voice", name);
  }
  async function _addCharacterInline(name) {
    return _addComponentInline("char", name);
  }
  var _statQueue = Promise.resolve();
  var _flowCompactNoticeDismissed = false;
  var _flowCompactNoticeShown = false;
  var _flowCompactNoticeLoading = false;
  var _flowCompactNoticeMessage = null;
  var _flowCompactNoticeObserver = null;
  async function _loadFlowCompactNoticeMessage() {
    if (_flowCompactNoticeMessage) return _flowCompactNoticeMessage;
    try {
      const stored = await ConfigSnapshotAccess.read([
        "af_locale",
        "af_settings",
      ]);
      const locale = stored.af_locale || stored.af_settings?.language || null;
      if (!locale) return null;
      const cacheKey = `toby_i18n_${locale}`;
      const cached = await ConfigSnapshotAccess.read([cacheKey]);
      const value = cached[cacheKey]?.data?.["flow.expandWindowHint"];
      if (typeof value === "string" && value.trim())
        _flowCompactNoticeMessage = value.trim();
    } catch (_) {}
    return _flowCompactNoticeMessage;
  }
  async function _syncFlowCompactViewportNotice() {
    const noticeId = "tobyflow-compact-viewport-notice";
    const existing = document.getElementById(noticeId);
    const compactMarker = _q2("compact_layout_marker");
    const compact = _isFlowCompactLayout2();
    const eligible =
      _flowPageContext?.driverKey === "flow_v2" && !_isLabsFlowLoginLanding2();
    if (!compact || !eligible || _flowCompactNoticeDismissed) {
      existing?.remove();
      return;
    }
    if (existing || _flowCompactNoticeShown || _flowCompactNoticeLoading)
      return;
    _flowCompactNoticeLoading = true;
    let message;
    try {
      message = await _loadFlowCompactNoticeMessage();
    } finally {
      _flowCompactNoticeLoading = false;
    }
    const stillCompact = _isFlowCompactLayout2();
    if (
      !message ||
      !stillCompact ||
      _flowPageContext?.driverKey !== "flow_v2" ||
      _isLabsFlowLoginLanding2() ||
      !document.body ||
      document.getElementById(noticeId) ||
      _flowCompactNoticeDismissed ||
      _flowCompactNoticeShown
    )
      return;
    const notice = document.createElement("div");
    notice.id = noticeId;
    notice.setAttribute("role", "status");
    notice.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483499;max-width:calc(100vw - 24px);box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(251,146,60,.55);border-radius:12px;background:rgba(35,22,12,.96);color:#fff7ed;box-shadow:0 10px 30px rgba(0,0,0,.38);font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    const icon = document.createElement("span");
    icon.textContent = "\u2194";
    icon.setAttribute("aria-hidden", "true");
    icon.style.cssText =
      "color:#fb923c;font-size:19px;line-height:1;flex:none;";
    const copy = document.createElement("span");
    copy.textContent = message;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "\xD7";
    close.setAttribute("aria-label", "Close");
    close.style.cssText =
      "border:0;background:transparent;color:#fed7aa;font:700 20px/1 sans-serif;cursor:pointer;padding:0 2px;flex:none;";
    close.addEventListener("click", () => {
      _flowCompactNoticeDismissed = true;
      notice.remove();
    });
    notice.append(icon, copy, close);
    document.body.appendChild(notice);
    _flowCompactNoticeShown = true;
    console.log(
      "[FlowCompactNotice] shown",
      JSON.stringify({
        oncePerDocument: true,
        width: window.innerWidth,
        compactMarker: !!_q2("compact_layout_marker"),
      }),
    );
    _flowCompactNoticeObserver?.disconnect();
  }
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(_setupFlowCompactViewportNotice2, 2500);
  } else {
    window.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(_setupFlowCompactViewportNotice2, 2500),
      { once: true },
    );
  }
  async function _shouldRemoveWatermark(mediaType) {
    if (mediaType !== "image" && mediaType !== "video") {
      console.warn(
        "[TobyFlow] _shouldRemoveWatermark: mediaType kh\xF4ng h\u1EE3p l\u1EC7 \u2192",
        mediaType,
      );
      return false;
    }
    const kind = mediaType;
    try {
      const st = await new Promise((r) =>
        ConfigSnapshotAccess.read(
          ["af_system_settings", "af_entitlements", "af_settings"],
          r,
        ),
      );
      const sysV = st.af_system_settings?.remove_watermark_enabled;
      if (!(sysV === true || sysV === "1" || sysV === 1)) {
        sendLog2(
          "[WM] T\u1EAET \u1EDF t\u1EA7ng 1 \u2014 c\xF4ng t\u1EAFc admin",
          "warn",
        );
        return false;
      }
      const entKey = `${kind}_remove_watermark_enabled`;
      const entV = st.af_entitlements?.entitlements?.[entKey]?.value;
      if (!(entV === "1" || entV === 1 || entV === true)) {
        sendLog2(
          `[WM] T\u1EAET \u1EDF t\u1EA7ng 2 \u2014 g\xF3i kh\xF4ng c\xF3 ${entKey}`,
          "warn",
        );
        return false;
      }
      const setKey =
        kind === "video" ? "autoRemoveWatermarkVideo" : "autoRemoveWatermark";
      const setV = st.af_settings?.[setKey];
      if (!(setV === true || setV === "1" || setV === 1)) {
        sendLog2(
          `[WM] T\u1EAET \u1EDF t\u1EA7ng 3 \u2014 ch\u01B0a b\u1EADt ${setKey}`,
          "warn",
        );
        return false;
      }
      return true;
    } catch (e) {
      console.warn(
        "[TobyFlow] _shouldRemoveWatermark: l\u1ED7i \u0111\u1ECDc storage \u2192",
        e?.message,
      );
      return false;
    }
  }
  async function downloadTileMedia(
    tileId,
    promptText,
    taskName,
    fileName,
    resolution,
    flowFileId,
    index,
    videoResolution,
    watermarkMode,
    plannedFilename = null,
    mountedScanOwner = false,
    abortFn = null,
    onOperationId = null,
  ) {
    const assertDownloadActive = () => {
      if (abortFn?.()) throw new Error("DOWNLOAD_STOPPED");
    };
    assertDownloadActive();
    if (typeof _flowNativeMediaSnapshotReady !== "undefined") {
      await _flowNativeMediaSnapshotReady;
      assertDownloadActive();
    }
    const nativeIdentity =
      _getObservedFlowMediaMetadata2(tileId) ||
      _getObservedFlowMediaMetadata2(fileName) ||
      _getObservedFlowMediaMetadata2(flowFileId);
    if (nativeIdentity)
      fileName =
        nativeIdentity.type === "image"
          ? nativeIdentity.media_uuid
          : nativeIdentity.persistent_media_id;
    if (!plannedFilename) {
      const saved = await ConfigSnapshotAccess.read("flow_web_recovery_v1");
      const projectId = getCurrentProjectId2();
      for (const record of saved.flow_web_recovery_v1 || []) {
        if (record.projectId !== projectId) continue;
        const output = record.outputs?.find(
          (entry) =>
            entry.mediaId &&
            [tileId, fileName, flowFileId].includes(entry.mediaId),
        );
        if (output?.filename) {
          plannedFilename = output.filename;
          break;
        }
      }
    }
    let identityResolvedOwner = false;
    let res = resolution;
    if (!res) {
      const settings = await getDownloadSettings2();
      res = settings.resolution;
    }
    if (!res || res === "original") res = "1k";
    if (flowFileId) {
      const tile = findTileByFileId2(flowFileId);
      if (tile) tileId = _getTileRuntimeId2(tile);
    }
    const currentTile = tileId ? _getTileById2(tileId) : null;
    const currentOwnsFileName =
      !fileName || _tileOwnsDownloadIdentity2(currentTile, fileName);
    if (!tileId || !currentTile || !currentOwnsFileName) {
      const byName = _resolveDownloadTileByFileName2(fileName || tileId);
      if (_getTileRuntimeId2(byName)) {
        console.log(
          `[TobyFlow] downloadTileMedia: resolved ${String(tileId || "(null)").substring(0, 20)}... \u2192 ${String(_getTileRuntimeId2(byName)).substring(0, 20)}... via file_name`,
        );
        tileId = _getTileRuntimeId2(byName);
        identityResolvedOwner = true;
      } else if (fileName) {
        if (mountedScanOwner) throw new Error("FLOW_DOWNLOAD_TARGET_UNMOUNTED");
        if (Date.now() < _tileSweepFailUntil) {
          console.warn(
            `[TobyFlow] downloadTileMedia: b\u1ECF qua tile-sweep (cooldown ${Math.ceil((_tileSweepFailUntil - Date.now()) / 1e3)}s sau l\u1EA7n qu\xE9t tr\u01B0\u1EE3t)`,
          );
          throw new Error("FLOW_DOWNLOAD_TARGET_SCAN_COOLDOWN");
        } else {
          let scanDownloadAttempted = false;
          let scanDownloadOutcome = false;
          let scanDownloadError = null;
          try {
            const observedTarget = _getObservedFlowMediaMetadata2(fileName);
            console.info(
              "[FlowDomScan] download target",
              JSON.stringify({
                identityKind: _isFlowV2AsbIdentity2(fileName)
                  ? "asb"
                  : "uuid_or_name",
                catalogAlias: !!observedTarget,
                mediaType: observedTarget?.type || null,
                targetPrefix: String(fileName).slice(0, 8),
              }),
            );
            const _found = await ensureFlowTilesLoaded(true, [fileName], {
              reason: "web_download_target_missing",
              allowAfterStop: true,
              shouldAbort: abortFn,
              onTargetsMounted: async (_foundTargets, scanContext = {}) => {
                assertDownloadActive();
                _invalidateTileCache2();
                const owner = _resolveDownloadTileByFileName2(fileName);
                if (
                  !owner?.isConnected ||
                  !_tileOwnsDownloadIdentity2(owner, fileName)
                )
                  return;
                scanDownloadAttempted = true;
                sendLog2(
                  scanContext.zoomApplied
                    ? "[WorkflowDownloadIdentity] target mounted; downloading before zoom restore"
                    : "[WorkflowDownloadIdentity] target mounted at current zoom; downloading",
                  "info",
                );
                try {
                  scanDownloadOutcome = await downloadTileMedia(
                    _getTileRuntimeId2(owner),
                    promptText,
                    taskName,
                    fileName,
                    res,
                    flowFileId,
                    index,
                    videoResolution,
                    watermarkMode,
                    plannedFilename,
                    true,
                    abortFn,
                    onOperationId,
                  );
                } catch (error) {
                  scanDownloadError = error;
                }
              },
            });
            assertDownloadActive();
            if (scanDownloadAttempted) {
              if (scanDownloadError) throw scanDownloadError;
              return scanDownloadOutcome;
            }
            const _tid = _found?.[fileName];
            const recoveredTile = _tid ? _getTileById2(_tid) : null;
            if (_tid && _tileOwnsDownloadIdentity2(recoveredTile, fileName)) {
              console.log(
                `[TobyFlow] downloadTileMedia: tile b\u1ECB virtual-scroll g\u1EE1 \u2192 ensureFlowTilesLoaded t\xECm l\u1EA1i OK: ${String(_tid).substring(0, 20)}...`,
              );
              tileId = _tid;
              identityResolvedOwner = true;
              _tileSweepFailUntil = 0;
            } else {
              _tileSweepFailUntil = Date.now() + 6e4;
              console.warn(
                `[TobyFlow] downloadTileMedia: ensureFlowTilesLoaded KH\xD4NG t\xECm \u0111\u01B0\u1EE3c file_name=${String(fileName).substring(0, 12)}... \u2192 cooldown 60s`,
              );
              throw new Error("FLOW_DOWNLOAD_TARGET_NOT_FOUND");
            }
          } catch (e) {
            if (scanDownloadAttempted) throw e;
            if (abortFn?.()) throw e;
            _tileSweepFailUntil = Date.now() + 6e4;
            console.warn(
              "[TobyFlow] downloadTileMedia: ensureFlowTilesLoaded l\u1ED7i:",
              e?.message || e,
            );
            throw e;
          }
        }
      }
    }
    if (_flowPageContext?.driverKey === "flow_v2" && fileName) {
      const loadErrorTile = _getTileById2(tileId);
      if (
        loadErrorTile?.isConnected &&
        _tileOwnsDownloadIdentity2(loadErrorTile, fileName) &&
        _isFlowImageLoadError2(loadErrorTile)
      ) {
        const recoveredTileId = await _refreshOwnedImageLoadError(
          _getTileRuntimeId2(loadErrorTile),
          fileName,
        );
        if (!recoveredTileId) {
          console.warn(
            "[FlowImageLoad] owned tile did not recover; download withheld",
            String(fileName).slice(0, 12),
          );
          return false;
        }
        tileId = recoveredTileId;
        identityResolvedOwner = true;
      }
    }
    const _IMAGE_ONLY_RES = ["1k", "2k", "original"];
    let _vRes = videoResolution;
    if (!_vRes && _IMAGE_ONLY_RES.includes(String(res || "").toLowerCase())) {
      try {
        _vRes = (await getDownloadSettings2()).videoResolution;
      } catch (_) {
        _vRes = null;
      }
    }
    if (_vRes) {
      const tileEl = _getTileById2(tileId);
      if (videoResolution || (tileEl && detectMediaType2(tileEl) === "video")) {
        if (_vRes !== res)
          console.log(
            `[TobyFlow] downloadTileMedia: tile VIDEO \u2192 res ${res} \u2192 ${_vRes}${videoResolution ? " (caller)" : " (settings)"}`,
          );
        res = _vRes;
      }
    }
    const _tileElForType = _getTileById2(tileId);
    const _mediaType =
      videoResolution ||
      nativeIdentity?.type === "video" ||
      (_tileElForType && detectMediaType2(_tileElForType) === "video")
        ? "video"
        : "image";
    const _wmOn =
      watermarkMode === "original"
        ? false
        : watermarkMode === "clean"
          ? true
          : await _shouldRemoveWatermark(_mediaType);
    sendLog2(
      `[WM] \u0111i\u1EC3m r\u1EBD: media=${_mediaType} \xE9p=${watermarkMode || "inherit"} \u2192 ${_wmOn ? "XO\xC1" : "GI\u1EEE G\u1ED0C"}`,
      "info",
    );
    if (watermarkMode === "clean" || watermarkMode === "original") {
      try {
        window.postMessage(
          { channel: "TOBY_WM_ORIGIN_TICKET", mode: watermarkMode },
          "*",
        );
      } catch (_) {}
    }
    const _nativeVideoFirst =
      _mediaType === "video" &&
      _flowPageContext?.driverKey === "flow_v2" &&
      (window.__tobyInterceptActive === true ||
        (_tileElForType && !_q2("tile_video", _tileElForType)));
    console.log("[FlowDownloadPlan]", {
      index,
      identityPrefix: String(tileId).slice(0, 12),
      mediaType: _mediaType,
      resolution: res,
      watermark: _wmOn ? "clean" : "original",
      first: _wmOn && !_nativeVideoFirst ? "legacy" : "native",
      interceptorActive: window.__tobyInterceptActive === true,
    });
    if (_wmOn && !_nativeVideoFirst) {
      const cleanOk = await _downloadTileMediaLegacy(
        tileId,
        promptText,
        taskName,
        fileName,
        res,
        index,
        false,
        watermarkMode || null,
        identityResolvedOwner,
        plannedFilename,
      );
      assertDownloadActive();
      if (cleanOk) return true;
      console.warn(
        "[TobyFlow] downloadTileMedia: legacy ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c \u2192 th\u1EED Flow menu; tr\u1EA1ng th\xE1i watermark s\u1EBD x\xE1c nh\u1EADn khi t\u1EA3i",
      );
    }
    console.log(
      `[TobyFlow] downloadTileMedia: attempting Flow menu for ${tileId.substring(0, 20)}, res=${res}`,
    );
    assertDownloadActive();
    const menuSuccess = await downloadViaFlowMenu(
      tileId,
      res,
      fileName,
      promptText,
      taskName,
      index,
      identityResolvedOwner,
      plannedFilename,
      abortFn,
      onOperationId,
    );
    assertDownloadActive();
    if (menuSuccess) {
      console.log(
        `[TobyFlow] downloadTileMedia: Flow menu SUCCESS for ${tileId.substring(0, 20)}`,
      );
      return true;
    }
    console.log(
      `[TobyFlow] downloadTileMedia: Flow menu FAILED for ${tileId.substring(0, 20)}, trying legacy fallback`,
    );
    const skipLegacyClean = _wmOn && !_nativeVideoFirst;
    const legacySuccess = await _downloadTileMediaLegacy(
      tileId,
      promptText,
      taskName,
      fileName,
      res,
      index,
      skipLegacyClean,
      watermarkMode || null,
      identityResolvedOwner,
      plannedFilename,
    );
    assertDownloadActive();
    if (legacySuccess) {
      console.log(
        `[TobyFlow] downloadTileMedia: Legacy fallback SUCCESS for ${tileId.substring(0, 20)}`,
      );
      return true;
    }
    if (_wmOn && _nativeVideoFirst) {
      const originalSuccess = await _downloadTileMediaLegacy(
        tileId,
        promptText,
        taskName,
        fileName,
        res,
        index,
        true,
        watermarkMode || null,
        identityResolvedOwner,
        plannedFilename,
      );
      assertDownloadActive();
      if (originalSuccess) return true;
    }
    console.warn(
      `[TobyFlow] downloadTileMedia: BOTH methods FAILED for ${tileId.substring(0, 20)}`,
    );
    return false;
  }
  async function _fetchVerifiedFlowImageBlob(url) {
    let response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch (_) {
      response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
    }
    if (!response.ok) throw new Error(`FLOW_IMAGE_HTTP_${response.status}`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const png =
      bytes.length >= 8 &&
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71 &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10;
    const jpeg =
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;
    const webp =
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const mime = png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : webp
          ? "image/webp"
          : null;
    if (!mime || blob.size === 0)
      throw new Error("FLOW_IMAGE_DOWNLOAD_BAD_MIME");
    return { blob, mime };
  }
  async function _downloadTileMediaLegacy(
    tileId,
    promptText,
    taskName,
    fileName,
    resolution,
    index,
    skipWm = false,
    _wmForce = null,
    identityResolvedOwner = false,
    plannedFilename = null,
  ) {
    const MAX_RETRIES = 3;
    const RETRY_INTERVAL = 800;
    let tile = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      tile = _getTileById2(tileId);
      if (tile) break;
      if (attempt < MAX_RETRIES - 1) {
        console.log(
          `[TobyFlow] _downloadTileMediaLegacy: tile not found, retry ${attempt + 1}/${MAX_RETRIES}...`,
        );
        await sleep2(RETRY_INTERVAL);
      }
    }
    if (!tile) {
      console.warn(
        `[TobyFlow] _downloadTileMediaLegacy: tile not found after ${MAX_RETRIES} retries: ${tileId.substring(0, 30)}`,
      );
      return false;
    }
    if (fileName) {
      const currentFn = _getPersistentMediaId2(tile) || extractFileName2(tile);
      const ownerIdentities = extractAllFileNames2(tile);
      if (
        currentFn &&
        !identityResolvedOwner &&
        currentFn !== fileName &&
        !ownerIdentities.includes(fileName)
      ) {
        console.warn(
          `[TobyFlow] _downloadTileMediaLegacy: cross-project collision`,
        );
        sendLog2(
          `Tile ${tileId.substring(0, 15)}... thu\u1ED9c project kh\xE1c, b\u1ECF qua.`,
          "warn",
        );
        return false;
      }
    }
    const resLower = (resolution || "").toLowerCase();
    const isVideoRes =
      ["360p", "720p", "1080p"].includes(resLower) ||
      detectMediaType2(tile) === "video" ||
      _getObservedFlowMediaMetadata2(tileId)?.type === "video" ||
      _getObservedFlowMediaMetadata2(fileName)?.type === "video" ||
      /\.mp4$/i.test(plannedFilename || "");
    const mediaTimeout = isVideoRes ? 15e3 : 1e4;
    const mediaEl = await _waitForTileMediaReady2(
      tile,
      mediaTimeout,
      isVideoRes,
      false,
    );
    if (!mediaEl) {
      console.warn(
        `[TobyFlow] _downloadTileMediaLegacy: tile media not ready after ${mediaTimeout / 1e3}s, tileId=${tileId.substring(0, 30)}`,
      );
      return false;
    }
    try {
      const settings = await getDownloadSettings2();
      if (isVideoRes && mediaEl.tagName !== "VIDEO")
        throw new Error("FLOW_VIDEO_STREAM_MISSING");
      const isVideo = mediaEl.tagName === "VIDEO";
      let mediaSrc = isVideo
        ? mediaEl.currentSrc || mediaEl.src
        : applyResolutionToUrl2(mediaEl.src, resolution || "1k");
      if (
        !mediaSrc ||
        !_isAllowedFlowMediaUrl2(mediaSrc) ||
        mediaSrc.includes("media.html") ||
        mediaSrc.endsWith(".html") ||
        (!mediaSrc.startsWith("http://") &&
          !mediaSrc.startsWith("https://") &&
          !mediaSrc.startsWith("blob:"))
      ) {
        console.warn(
          `[TobyFlow] _downloadTileMediaLegacy: invalid/placeholder URL rejected: ${mediaSrc?.substring(0, 80)}`,
        );
        return false;
      }
      const ext = isVideo ? "mp4" : "png";
      let verifiedVideoBlob = null;
      if (isVideo) {
        const response2 = await fetch(mediaSrc, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response2.ok)
          throw new Error(`FLOW_VIDEO_HTTP_${response2.status}`);
        verifiedVideoBlob = await response2.blob();
        if (
          String(verifiedVideoBlob.type).split(";")[0].toLowerCase() !==
            "video/mp4" ||
          verifiedVideoBlob.size === 0
        )
          throw new Error("FLOW_VIDEO_DOWNLOAD_BAD_MIME");
        mediaSrc = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("FLOW_VIDEO_BYTES_READ_FAILED"));
          reader.readAsDataURL(verifiedVideoBlob);
        });
      }
      const filename =
        plannedFilename ||
        _buildFilename2({
          template: settings.template,
          project: settings.project,
          prompt: promptText,
          index,
          taskName,
          folder: settings.folder,
          ext,
        });
      console.log(
        `[TobyFlow] _downloadTileMediaLegacy: downloading via chrome.downloads: ${mediaSrc.substring(0, 100)}...`,
      );
      if (
        !skipWm &&
        (_wmForce === "clean" ||
          (_wmForce !== "original" &&
            (await _shouldRemoveWatermark(isVideo ? "video" : "image"))))
      ) {
        let _interceptOn = window.__tobyInterceptActive === true;
        let _why = _interceptOn ? "" : "bridge b\xE1o T\u1EAET";
        if (window.__tobyInterceptActive === void 0) {
          for (
            let i = 0;
            i < 10 && window.__tobyInterceptActive === void 0;
            i++
          )
            await sleep2(200);
          _interceptOn = window.__tobyInterceptActive === true;
          _why = _interceptOn
            ? ""
            : "bridge b\xE1o T\u1EAET (sau khi ch\u1EDD)";
          if (window.__tobyInterceptActive === void 0) {
            try {
              const _ic = await chrome.runtime.sendMessage({
                action: "wm:getInterceptConfig",
              });
              _interceptOn = !!(
                _ic?.success &&
                _ic.enabled &&
                _ic.patterns?.length
              );
              _why = _interceptOn
                ? ""
                : "c\u1EDD ch\u01B0a c\xF3 + m\xE1y ch\u1EE7 ch\u01B0a c\xF3 m\u1EABu URL";
              sendLog2(
                `[WM] c\u1EDD l\u1EDBp ch\u1EB7n ch\u01B0a s\u1EB5n s\xE0ng \u2192 h\u1ECFi m\xE1y ch\u1EE7: ${_interceptOn ? "B\u1EACT" : "T\u1EAET"}`,
                "info",
              );
            } catch (_) {
              _why =
                "c\u1EDD ch\u01B0a c\xF3 + kh\xF4ng h\u1ECFi \u0111\u01B0\u1EE3c m\xE1y ch\u1EE7";
            }
          }
        }
        if (!_interceptOn) {
          const _hint = /bridge báo TẮT/.test(_why)
            ? " \u2014 n\u1EBFu v\u1EEBa n\u1EA1p l\u1EA1i extension, h\xE3y T\u1EA2I L\u1EA0I TRANG"
            : "";
          sendLog2(
            `[WM] l\u1EDBp ch\u1EB7n t\u1EA7ng m\u1EA1ng kh\xF4ng d\xF9ng \u0111\u01B0\u1EE3c (${_why}) \u2192 gi\u1EEF \u0111\u01B0\u1EDDng c\u0169${_hint}`,
            "warn",
          );
        }
        if (_interceptOn) {
          sendLog2(
            "[WM] nh\u01B0\u1EDDng Flow menu \u2014 l\u1EDBp ch\u1EB7n t\u1EA7ng m\u1EA1ng s\u1EBD xo\xE1 watermark \u0111\xFAng c\u1EE1 \u0111\xE3 ch\u1ECDn",
            "info",
          );
          return false;
        }
        let _wmB64 = null,
          _wmMime = null;
        if (isVideo) {
          sendLog2(
            "[WM] video: \u0111ang xo\xE1 watermark (c\xF3 th\u1EC3 m\u1EA5t v\xE0i ch\u1EE5c gi\xE2y)\u2026",
            "info",
          );
          try {
            const _vb = verifiedVideoBlob;
            const _vb64 = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result).split(",")[1]);
              fr.onerror = () =>
                rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
              fr.readAsDataURL(_vb);
            });
            const _vr = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  action: "wm:cleanVideo",
                  base64: _vb64,
                  mime: _vb.type || "video/mp4",
                },
                (resp) => resolve(chrome.runtime.lastError ? null : resp),
              );
            });
            if (_vr?.ok && _vr.base64) {
              _wmB64 = _vr.base64;
              _wmMime = _vr.mime || "video/mp4";
              sendLog2(
                `[WM] video \u0111\xE3 xo\xE1 \u2014 ${_vr.stats?.frames || "?"} frame`,
                "success",
              );
            } else {
              sendLog2(
                `[WM] video KH\xD4NG xo\xE1 \u0111\u01B0\u1EE3c: ${_vr?.error || "kh\xF4ng ph\u1EA3n h\u1ED3i"} \u2192 t\u1EA3i b\u1EA3n g\u1ED1c`,
                "warn",
              );
            }
          } catch (e) {
            sendLog2(
              `[WM] video: l\u1ED7i ${e?.message} \u2192 t\u1EA3i b\u1EA3n g\u1ED1c`,
              "warn",
            );
          }
        } else
          try {
            const _tryFetch = async (u) => {
              try {
                return await fetch(u, { cache: "no-store" });
              } catch (_) {
                return await fetch(u, {
                  credentials: "include",
                  cache: "no-store",
                });
              }
            };
            const _srcRaw = mediaEl.src || mediaSrc;
            const _srcFull = _stripCdnSizeSuffix2(_srcRaw);
            if (_srcFull !== _srcRaw)
              sendLog2(
                "[WM] b\u1ECF h\u1EADu t\u1ED1 c\u1EE1 CDN \u2192 d\xF2 watermark tr\xEAn b\u1EA3n g\u1ED1c",
                "info",
              );
            let _r = await _tryFetch(_srcFull);
            if (!_r.ok && _srcFull !== _srcRaw) {
              sendLog2(
                `[WM] URL b\u1EA3n g\u1ED1c tr\u1EA3 HTTP ${_r.status} \u2192 lui v\u1EC1 URL hi\u1EC3n th\u1ECB`,
                "warn",
              );
              _r = await _tryFetch(_srcRaw);
            }
            if (!_r.ok) throw new Error(`HTTP ${_r.status}`);
            const _b = await _r.blob();
            _wmMime = _b.type || "image/png";
            _wmB64 = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result).split(",")[1]);
              fr.onerror = () =>
                rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
              fr.readAsDataURL(_b);
            });
            sendLog2(
              `[WM] l\u1EA5y bytes OK \u2014 ${Math.round(_b.size / 1024)}KB ${_wmMime} (b\u1EA3n g\u1ED1c)`,
              "info",
            );
          } catch (e) {
            sendLog2(
              `[WM] KH\xD4NG l\u1EA5y \u0111\u01B0\u1EE3c bytes trong tab: ${e?.message}`,
              "warn",
            );
          }
        const wm = _wmB64
          ? await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                {
                  action: "removeWatermarkAndDownload",
                  base64: _wmB64,
                  mime: _wmMime,
                  filename,
                  mediaType: isVideo ? "video" : "image",
                  alreadyClean: isVideo,
                },
                (resp) => resolve(chrome.runtime.lastError ? null : resp),
              );
            })
          : null;
        if (_wmB64)
          sendLog2(
            `[WM] \u0111\xE3 g\u1EEDi SW xo\xE1 (${isVideo ? "video" : "image"})\u2026`,
            "info",
          );
        if (wm?.success) {
          incrementDownloadCounter2();
          sendLog2(
            wm.original
              ? `[WM] \u2705 kh\xF4ng ph\xE1t hi\u1EC7n watermark \u2014 t\u1EA3i B\u1EA2N G\u1ED0C: ${filename}`
              : `[WM] \u2705 t\u1EA3i B\u1EA2N S\u1EA0CH: ${filename}`,
            "success",
          );
          return true;
        }
        console.warn(
          `[TobyFlow] _downloadTileMediaLegacy: kh\xF4ng xo\xE1 \u0111\u01B0\u1EE3c (${wm?.reason || "no-response"}) \u2192 nh\u01B0\u1EDDng Flow menu`,
        );
        return false;
      }
      if (!isVideo && !skipWm) {
        const verified = await _fetchVerifiedFlowImageBlob(mediaSrc);
        mediaSrc = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(
              String(reader.result).replace(
                /^data:[^,]*,/,
                `data:${verified.mime};base64,`,
              ),
            );
          reader.onerror = () =>
            reject(new Error("FLOW_IMAGE_BYTES_READ_FAILED"));
          reader.readAsDataURL(verified.blob);
        });
      }
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "chromeDownload",
            url: mediaSrc,
            filename,
            avoidFilenameListenerConflict: true,
            waitForComplete: true,
            waitTimeoutMs: isVideo ? 6e5 : 12e4,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
              });
            } else {
              resolve(resp || { success: false, error: "No response" });
            }
          },
        );
      });
      if (response.success) {
        incrementDownloadCounter2();
        const resLabel = resolution ? ` [${resolution.toUpperCase()}]` : "";
        sendLog2(`\u0110\xE3 t\u1EA3i${resLabel}: ${filename}`, "success");
        return true;
      } else {
        console.warn(
          `[TobyFlow] _downloadTileMediaLegacy: chrome.downloads failed: ${response.error}`,
        );
        return false;
      }
    } catch (e) {
      console.warn(
        `[TobyFlow] _downloadTileMediaLegacy: exception: ${e.message}`,
      );
      sendLog2(
        `Kh\xF4ng th\u1EC3 t\u1EA3i file ${tileId}: ${e.message}`,
        "warn",
      );
      return false;
    }
  }
  const _INTERCEPT_DONE_TIMEOUT_MS = 9e4;
  try {
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.channel !== "TOBY_MEDIA_INTERCEPT_STATE") return;
      try {
        chrome.runtime
          .sendMessage({ action: "wm:downloadPhase", phase: d.phase })
          .catch(() => {});
      } catch (_) {}
    });
  } catch (_) {}
  async function downloadViaFlowMenu(
    tileId,
    resolution,
    fileName,
    promptText,
    taskName,
    index,
    identityResolvedOwner = false,
    plannedFilename = null,
    abortFn = null,
    onOperationId = null,
  ) {
    const MAX_TILE_RETRIES = 5;
    const TILE_RETRY_INTERVAL = 1e3;
    let tile = null;
    let _downloadOperationId = null;
    let _ownedContextMenu = null;
    let _ownedSubMenu = null;
    const assertDownloadActive = () => {
      if (abortFn?.()) throw new Error("DOWNLOAD_STOPPED");
    };
    assertDownloadActive();
    for (let attempt = 0; attempt < MAX_TILE_RETRIES; attempt++) {
      tile = _getTileById2(tileId);
      if (tile) break;
      if (attempt < MAX_TILE_RETRIES - 1) {
        console.log(
          `[TobyFlow] downloadViaFlowMenu: tile not found, retry ${attempt + 1}/${MAX_TILE_RETRIES} in ${TILE_RETRY_INTERVAL}ms...`,
        );
        await sleep2(TILE_RETRY_INTERVAL);
      }
    }
    if (!tile) {
      console.warn(
        `[TobyFlow] downloadViaFlowMenu: tile not found after ${MAX_TILE_RETRIES} retries: ${tileId.substring(0, 20)}`,
      );
      return false;
    }
    if (fileName) {
      const currentFn = _getPersistentMediaId2(tile) || extractFileName2(tile);
      const ownerIdentities = extractAllFileNames2(tile);
      const identityMatchesOwner =
        identityResolvedOwner ||
        currentFn === fileName ||
        ownerIdentities.includes(fileName);
      if (currentFn && !identityMatchesOwner) {
        console.warn(
          `[TobyFlow] downloadViaFlowMenu: cross-project collision`,
          {
            requestedIdentityKind: _isFlowV2AsbIdentity2(fileName)
              ? "flow_v2_asb"
              : "media_uuid",
            ownerIdentityCount: ownerIdentities.length,
          },
        );
        sendLog2(
          `Tile ${tileId.substring(0, 15)}... thu\u1ED9c project kh\xE1c, b\u1ECF qua.`,
          "warn",
        );
        return false;
      }
      console.log("[WorkflowDownloadIdentity] owner validation passed", {
        requestedIdentityKind: _isFlowV2AsbIdentity2(fileName)
          ? "flow_v2_asb"
          : "media_uuid",
        matchedBy: identityResolvedOwner
          ? "targeted_lookup"
          : currentFn === fileName
            ? "preferred_identity"
            : "owner_media_identity",
      });
    }
    const resLower = (resolution || "").toLowerCase();
    const videoEl = _q2("tile_video", tile);
    const videoPoster = _q2("tile_video_poster", tile);
    const isVideo =
      !!videoEl ||
      !!videoPoster ||
      !!_q2("tile_video_owner", tile) ||
      resLower === "720p" ||
      resLower === "1080p";
    let resLabel = _getDownloadMenuLabel2(resolution, isVideo);
    if (!resLabel) {
      console.warn(
        "[TobyFlow] downloadViaFlowMenu: resolution config missing or unsupported",
      );
      return false;
    }
    if (document.visibilityState === "hidden") {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "ensureFlowTabActive" }, () =>
          resolve(),
        );
      });
      await sleep2(300);
    }
    const mediaTimeout = isVideo ? 15e3 : 1e4;
    tile.scrollIntoView({ behavior: "instant", block: "center" });
    if (isVideo && !videoEl && _flowPageContext?.driverKey === "flow_v2") {
      _activateFlowV2VideoTile2(tile);
      console.log(
        "[WorkflowDownloadIdentity] activated V2 video owner before native download",
        {
          requestedIdentityKind: _isFlowV2AsbIdentity2(fileName)
            ? "flow_v2_asb"
            : "media_uuid_or_runtime",
          hasPoster: !!videoPoster,
        },
      );
    }
    const isV2Image = _flowPageContext?.driverKey === "flow_v2" && !isVideo;
    const v2Poster =
      isVideo && _flowPageContext?.driverKey === "flow_v2"
        ? _q2("tile_video_poster", tile)
        : null;
    const posterSrc = v2Poster?.currentSrc || v2Poster?.src || "";
    const readyMedia =
      v2Poster?.isConnected && _isAllowedFlowMediaUrl2(posterSrc)
        ? v2Poster
        : await _waitForTileMediaReady2(
            tile,
            mediaTimeout,
            isVideo,
            true,
            isV2Image,
          );
    if (!readyMedia) {
      console.warn(
        `[TobyFlow] downloadViaFlowMenu: tile media not ready after ${mediaTimeout / 1e3}s, tileId=${tileId.substring(0, 20)}`,
      );
      return false;
    }
    await _acquireCtxMenuLock();
    try {
      const liveTile = _getTileById2(tileId);
      if (
        !liveTile?.isConnected ||
        (fileName && !_tileOwnsDownloadIdentity2(liveTile, fileName))
      ) {
        console.warn(
          "[WorkflowDownloadIdentity] owner changed before native menu",
        );
        return false;
      }
      tile = liveTile;
      tile.scrollIntoView({ behavior: "instant", block: "center" });
      if (_flowPageContext?.driverKey === "flow_v2") await Promise.resolve();
      else await sleep2(100);
      let targetEl =
        _flowPageContext?.driverKey === "flow_v2"
          ? isVideo
            ? _q2("tile_video", tile) ||
              (tile.contains(readyMedia) ? readyMedia : null)
            : _q2("tile_image", tile)
          : readyMedia;
      if (
        isVideo &&
        _flowPageContext?.driverKey === "flow_v2" &&
        (!targetEl?.isConnected ||
          targetEl.getBoundingClientRect().width <= 0 ||
          targetEl.getBoundingClientRect().height <= 0)
      ) {
        const poster = _q2("tile_video_poster", tile);
        const posterRect = poster?.getBoundingClientRect();
        if (
          poster?.isConnected &&
          posterRect?.width > 0 &&
          posterRect?.height > 0
        ) {
          console.info(
            "[WorkflowDownloadIdentity] hidden video; opening owned video menu on visible poster",
          );
          targetEl = poster;
        }
      }
      if (
        !targetEl?.isConnected ||
        (fileName && !_tileOwnsDownloadIdentity2(tile, fileName)) ||
        (isV2Image &&
          !_isAllowedFlowMediaUrl2(targetEl.currentSrc || targetEl.src || ""))
      ) {
        console.warn(
          "[WorkflowDownloadIdentity] media owner changed before native menu",
        );
        return false;
      }
      const rect = targetEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        console.warn(
          "[WorkflowDownloadIdentity] media target has no visible bounds",
          {
            mediaType: isVideo ? "video" : "image",
            targetTag: targetEl.tagName,
            hasPoster: !!_q2("tile_video_poster", tile),
          },
        );
        return false;
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      console.log(
        `[TobyFlow] downloadViaFlowMenu: right-click on ${targetEl.tagName} at (${Math.round(cx)}, ${Math.round(cy)}), rect: ${Math.round(rect.width)}x${Math.round(rect.height)}`,
      );
      targetEl.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          button: 2,
        }),
      );
      const _ctxSel = _selStr2("context_menu");
      if (!_ctxSel) {
        console.debug("[Tier3] downloadViaFlowMenu: context_menu config miss");
        return false;
      }
      const contextMenu = await _waitForElement2(_ctxSel, 3e3);
      if (!contextMenu) {
        console.warn("[TobyFlow] downloadViaFlowMenu: context menu not found");
        return false;
      }
      _ownedContextMenu = contextMenu;
      if (_flowPageContext?.driverKey === "flow_v2") await Promise.resolve();
      else await sleep2(50);
      const triggerConfig = _getDynamicSelector2("download_menu_trigger");
      let triggerIconText = triggerConfig?.icon_text;
      let triggerButtonText = triggerConfig?.button_text?.length
        ? triggerConfig.button_text
        : [];
      if (!triggerIconText) {
        console.debug(
          "[Tier3] downloadViaFlowMenu: download_menu_trigger.icon_text cache miss",
        );
        triggerIconText = "";
      }
      if (!triggerButtonText.length) {
        console.debug(
          "[Tier3] downloadViaFlowMenu: download_menu_trigger.button_text cache miss",
        );
      }
      const _miSel = _selStr2("menu_item");
      if (!_miSel) {
        console.debug("[Tier3] menu_item config miss");
        return false;
      }
      const menuItems = contextMenu.querySelectorAll(_miSel);
      let downloadItem = null;
      for (const item of menuItems) {
        const icon = _findIconInElement2(item);
        if (
          icon?.textContent?.trim() === triggerIconText &&
          item.getAttribute("aria-haspopup") === "menu"
        ) {
          downloadItem = item;
          break;
        }
      }
      if (!downloadItem) {
        for (const item of menuItems) {
          const text = item.textContent?.trim() || "";
          if (
            _textIncludesAny2(text, triggerButtonText) &&
            item.getAttribute("aria-haspopup") === "menu"
          ) {
            downloadItem = item;
            break;
          }
        }
      }
      if (!downloadItem) {
        for (const item of menuItems) {
          if (
            _findIconInElement2(item)?.textContent?.trim() === triggerIconText
          ) {
            downloadItem = item;
            break;
          }
        }
      }
      if (!downloadItem) {
        console.warn(
          "[TobyFlow] downloadViaFlowMenu: download menu item not found",
        );
        _closeOwnedContextMenus2(_ownedContextMenu);
        return false;
      }
      const hasResolutionSubmenu =
        downloadItem.getAttribute("aria-haspopup") === "menu";
      let targetItem = hasResolutionSubmenu ? null : downloadItem;
      let actualResLabel = resLabel;
      if (!hasResolutionSubmenu) {
        console.log(
          "[TobyFlow] downloadViaFlowMenu: direct download item detected; Flow chooses resolution",
        );
      } else {
        const dlRect = downloadItem.getBoundingClientRect();
        const dlCx = dlRect.left + dlRect.width / 2;
        const dlCy = dlRect.top + dlRect.height / 2;
        const pointerOpts = {
          bubbles: true,
          cancelable: true,
          clientX: dlCx,
          clientY: dlCy,
          pointerId: 1,
          pointerType: "mouse",
          relatedTarget: contextMenu,
        };
        const mouseOpts = {
          bubbles: true,
          cancelable: true,
          clientX: dlCx,
          clientY: dlCy,
          relatedTarget: contextMenu,
        };
        const submenuConfig = _getDynamicSelector2("download_submenu");
        const submenuAttribute = submenuConfig?.attribute || null;
        const submenuSelectors = submenuConfig?.selectors?.length
          ? submenuConfig.selectors
          : [];
        if (!submenuSelectors.length)
          console.debug(
            "[Tier3] downloadViaFlowMenu: download_submenu config miss",
          );
        const menusBeforeHover = new Set();
        for (const sel of submenuSelectors) {
          try {
            document
              .querySelectorAll(sel)
              .forEach((menu) => menusBeforeHover.add(menu));
          } catch (_) {}
        }
        const findSubMenu = () => {
          const subMenuId = submenuAttribute
            ? downloadItem.getAttribute(submenuAttribute)
            : null;
          if (subMenuId) {
            const menu = document.getElementById(subMenuId);
            if (menu) return menu;
          }
          for (const sel of submenuSelectors) {
            try {
              const candidates = document.querySelectorAll(sel);
              for (const m of candidates) {
                if (m !== contextMenu && !menusBeforeHover.has(m)) return m;
              }
            } catch (e) {}
          }
          return null;
        };
        downloadItem.dispatchEvent(
          new PointerEvent("pointerover", pointerOpts),
        );
        downloadItem.dispatchEvent(
          new PointerEvent("pointerenter", pointerOpts),
        );
        downloadItem.dispatchEvent(
          new PointerEvent("pointermove", pointerOpts),
        );
        downloadItem.dispatchEvent(
          new PointerEvent("pointerdown", { ...pointerOpts, button: 0 }),
        );
        downloadItem.dispatchEvent(
          new PointerEvent("pointerup", { ...pointerOpts, button: 0 }),
        );
        downloadItem.dispatchEvent(new MouseEvent("mouseover", mouseOpts));
        downloadItem.dispatchEvent(new MouseEvent("mouseenter", mouseOpts));
        downloadItem.dispatchEvent(new MouseEvent("mousemove", mouseOpts));
        downloadItem.focus();
        let subMenu = null;
        for (let attempt = 0; attempt < 5 && !subMenu; attempt++) {
          await sleep2(150);
          subMenu = findSubMenu();
          if (!subMenu && attempt === 1) {
            downloadItem.dispatchEvent(
              new PointerEvent("pointerenter", pointerOpts),
            );
            downloadItem.dispatchEvent(new MouseEvent("mouseenter", mouseOpts));
          }
          if (!subMenu && attempt === 3) {
            downloadItem.focus();
            downloadItem.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "ArrowRight",
                bubbles: true,
              }),
            );
            await sleep2(100);
            subMenu = findSubMenu();
          }
        }
        if (!subMenu) {
          downloadItem.dispatchEvent(
            new MouseEvent("mouseenter", {
              bubbles: true,
              clientX: dlCx,
              clientY: dlCy,
            }),
          );
          downloadItem.dispatchEvent(
            new MouseEvent("mousemove", {
              bubbles: true,
              clientX: dlCx,
              clientY: dlCy,
            }),
          );
          await sleep2(300);
          subMenu = findSubMenu();
        }
        _ownedSubMenu = subMenu;
        if (!subMenu) {
          console.warn(
            "[TobyFlow] downloadViaFlowMenu: sub-menu not found after 5 attempts",
          );
          _closeOwnedContextMenus2(_ownedContextMenu);
          return false;
        }
        const subItemConfig = _getDynamicSelector2("download_submenu_item");
        const subItemSelectors = subItemConfig?.selectors?.length
          ? subItemConfig.selectors
          : [];
        if (!subItemSelectors.length)
          console.debug("[Tier3] download_submenu_item config miss");
        let subItems = [];
        for (const sel of subItemSelectors) {
          try {
            const found = subMenu.querySelectorAll(sel);
            if (found && found.length > 0) {
              subItems = found;
              break;
            }
          } catch (e) {}
        }
        const fallbackChain = _getDownloadFallbackChain2(isVideo);
        const disabledAttrs = Array.isArray(subItemConfig?.disabled_attributes)
          ? subItemConfig.disabled_attributes
          : [];
        const disabledClass = subItemConfig?.class_disabled || null;
        const isDisabled = (item) =>
          disabledAttrs.some(
            (attr) =>
              item.hasAttribute(attr) && item.getAttribute(attr) !== "false",
          ) ||
          (!!disabledClass && item.classList.contains(disabledClass));
        let startIdx = fallbackChain.indexOf(resLabel);
        if (startIdx < 0) startIdx = 0;
        for (
          let fi = startIdx;
          fi < fallbackChain.length && !targetItem;
          fi++
        ) {
          const tryLabel = fallbackChain[fi];
          for (const item of subItems) {
            const text = item.textContent?.trim() || "";
            if (text.startsWith(tryLabel)) {
              if (isDisabled(item)) {
                console.log(
                  `[TobyFlow] downloadViaFlowMenu: ${tryLabel} is disabled, trying lower resolution`,
                );
                break;
              }
              targetItem = item;
              actualResLabel = tryLabel;
              break;
            }
          }
        }
        if (targetItem && actualResLabel !== resLabel) {
          sendLog2(
            `${resLabel} kh\xF4ng kh\u1EA3 d\u1EE5ng, t\u1EA3i ${actualResLabel} thay th\u1EBF`,
            "warn",
          );
        }
        if (!targetItem) {
          const availableItems = [...subItems]
            .map((i) => i.textContent?.trim())
            .join(", ");
          console.warn(
            `[TobyFlow] downloadViaFlowMenu: ${resLabel} not found in sub-menu. Available: [${availableItems}]`,
          );
          console.warn(
            "[TobyFlow] downloadViaFlowMenu: no configured downloadable option found",
          );
          _closeOwnedContextMenus2(_ownedSubMenu, _ownedContextMenu);
          return false;
        }
      }
      const mediaForValidation = isVideo
        ? _q2("tile_video", tile)
        : _q2("tile_video", tile) || _q2("tile_image", tile);
      if (mediaForValidation) {
        const currentSrc = mediaForValidation.src || "";
        const rawSrc = mediaForValidation.getAttribute("src") || "";
        const isPlaceholder =
          currentSrc.includes("media.html") ||
          currentSrc.endsWith(".html") ||
          rawSrc === "media.html" ||
          rawSrc.endsWith(".html") ||
          (_flowPageContext?.driverKey === "flow_v2"
            ? !_isAllowedFlowMediaUrl2(currentSrc)
            : !currentSrc.startsWith("http") &&
              !currentSrc.startsWith("blob:") &&
              !rawSrc.startsWith("/fx/"));
        if (isPlaceholder) {
          console.warn(
            "[TobyFlow] downloadViaFlowMenu: media URL is placeholder after menu opened, aborting download",
          );
          _closeOwnedContextMenus2(_ownedSubMenu, _ownedContextMenu);
          return false;
        }
      }
      const settings = await getDownloadSettings2();
      const downloadFilename =
        plannedFilename ||
        _buildFilename2({
          template: settings.template,
          project: settings.project,
          prompt: promptText,
          index,
          taskName,
          folder: settings.folder,
          ext: isVideo ? "mp4" : "png",
        });
      const lastSlash = downloadFilename.lastIndexOf("/");
      const downloadFolder =
        lastSlash >= 0
          ? downloadFilename.substring(0, lastSlash)
          : settings.folder;
      const baseName =
        lastSlash >= 0
          ? downloadFilename.substring(lastSlash + 1).replace(/\.[^.]+$/, "")
          : downloadFilename.replace(/\.[^.]+$/, "");
      const identifier = fileName || baseName || tileId;
      assertDownloadActive();
      _downloadOperationId = `dl_${Date.now().toString(36)}_${crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      onOperationId?.(_downloadOperationId);
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "prepareDownloadRename",
            folder: downloadFolder,
            filename: baseName,
            identifier,
            requestId: _downloadOperationId,
          },
          () => resolve(),
        );
      });
      const _ctxAck =
        await _activateInterceptDownloadContext2(_downloadOperationId);
      const _dlSignal = _waitInterceptDone2(
        _INTERCEPT_DONE_TIMEOUT_MS,
        _downloadOperationId,
        _ctxAck,
      );
      const _nativeSignal = _awaitPreparedDownloadCompletion2(
        _downloadOperationId,
        isVideo ? 6e5 : 12e4,
      );
      const _downloadClickAt = Date.now();
      assertDownloadActive();
      targetItem.click();
      const _firstCompletion = await Promise.race([
        _dlSignal.then((value) => ({ source: "intercept", value })),
        _nativeSignal.then((value) => ({ source: "native", value })),
      ]);
      let _got =
        _firstCompletion.source === "intercept" &&
        _firstCompletion.value === true;
      const _nativeDone =
        _firstCompletion.source === "native" &&
        _firstCompletion.value?.success === true
          ? _firstCompletion.value
          : await _nativeSignal;
      if (
        !_got &&
        _firstCompletion.source === "native" &&
        _firstCompletion.value?.success !== true
      ) {
        _got = await _dlSignal;
      }
      const _settledAt = Date.now();
      console.log("[TobyFlow] download completion timing", {
        settled_ms: _settledAt - _downloadClickAt,
        total_ms: _settledAt - _downloadClickAt,
        intercept_confirmed: _got === true,
        success: _nativeDone.success === true,
      });
      if (!_nativeDone.success) {
        console.warn(
          `[TobyFlow] downloadViaFlowMenu: native download not completed: ${_nativeDone.error || "unknown"}`,
        );
        return false;
      }
      incrementDownloadCounter2();
      if (hasResolutionSubmenu) {
        const actualRes =
          targetItem.textContent?.trim().split(" ")[0] || actualResLabel;
        sendLog2(
          `\u0110\xE3 t\u1EA3i [${actualRes}]: ${downloadFolder}/${baseName}`,
          "success",
        );
      } else {
        sendLog2(
          `\u0110\xE3 t\u1EA3i [Flow ch\u1ECDn \u0111\u1ED9 ph\xE2n gi\u1EA3i]: ${downloadFolder}/${baseName}`,
          "success",
        );
      }
      return true;
    } catch (e) {
      console.error("[TobyFlow] downloadViaFlowMenu error:", e);
      if (_flowPageContext?.driverKey !== "flow_v2") _closeContextMenu2();
      return false;
    } finally {
      if (_downloadOperationId)
        _clearInterceptDownloadContext2(_downloadOperationId);
      if (_downloadOperationId) {
        await new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage(
              {
                action: "cancelDownloadRename",
                requestId: _downloadOperationId,
              },
              () => resolve(),
            );
          } catch (_) {
            resolve();
          }
        });
      }
      if (_flowPageContext?.driverKey === "flow_v2") {
        _closeOwnedContextMenus2(_ownedSubMenu, _ownedContextMenu);
      }
      _releaseCtxMenuLock2();
    }
  }
  var _ctxMenuLockQueue = _ctxMenuLockQueue || [];
  var _ctxMenuLocked = _ctxMenuLocked || false;
  async function _acquireCtxMenuLock(isStopped = null) {
    const startedAt = Date.now();
    const wasLocked = _ctxMenuLocked;
    if (wasLocked) {
      let wake;
      let acquired = false;
      const ready = new Promise((resolve) => {
        wake = () => {
          acquired = true;
          resolve();
        };
        _ctxMenuLockQueue.push(wake);
      });
      while (!acquired) {
        if (isStopped?.() === true) {
          const index = _ctxMenuLockQueue.indexOf(wake);
          if (index >= 0) _ctxMenuLockQueue.splice(index, 1);
          return false;
        }
        await Promise.race([ready, sleep2(100)]);
      }
      if (isStopped?.() === true) {
        _releaseCtxMenuLock2();
        return false;
      }
    }
    const queueWaitMs = Date.now() - startedAt;
    _ctxMenuLocked = true;
    if (!ExecutionBlocker._blocking) {
      document.body.classList.add("tobyflow-execution-blocking");
    }
    _closeContextMenu2();
    await Promise.resolve();
    let staleMenuVisible = false;
    try {
      const selector = _selStr2("context_menu");
      staleMenuVisible =
        !!selector &&
        [...document.querySelectorAll(selector)].some(
          (menu) => menu.getClientRects().length > 0,
        );
    } catch (_) {}
    const settleStartedAt = Date.now();
    if (staleMenuVisible) await sleep2(50);
    console.info(
      "[FlowContextMenuLock] acquired",
      JSON.stringify({
        queued: wasLocked,
        queueWaitMs,
        staleMenuVisible,
        settleWaitMs: Date.now() - settleStartedAt,
        totalMs: Date.now() - startedAt,
      }),
    );
    return true;
  }
  if (typeof window !== "undefined") {
    window._getPersistentMediaId = _getPersistentMediaId2;
    window._getObservedFlowMediaMetadata = _getObservedFlowMediaMetadata2;
    window._getTileById = _getTileById2;
    window.extractAllFileNames = extractAllFileNames2;
    window.extractThumbnailUrl = extractThumbnailUrl2;
    window.extractVideoUrl = extractVideoUrl2;
  }
  async function _waitExitMediaViewer(maxMs = 3e3) {
    const projectId = getCurrentProjectId2();
    const origin = location.origin;
    const editorPath = location.pathname
      .replace(/\/edit\/.*$/, "")
      .replace(/\/$/, "");
    for (let i = 0; i < Math.ceil(maxMs / 200); i++) {
      await sleep2(200);
      if (
        location.origin === origin &&
        location.pathname.replace(/\/$/, "") === editorPath &&
        getCurrentProjectId2() === projectId
      )
        return true;
    }
    return false;
  }
  async function _exitFlowMediaViewer() {
    if (!_isFlowMediaViewerOpen2()) return true;
    const projectId = getCurrentProjectId2();
    const origin = location.origin;
    const cleanPath = location.pathname.replace(
      /(\/project\/[^/]+)\/edit\/[^/]+.*$/,
      "$1",
    );
    let backBtn = null;
    for (const icon of _qa2("icon_element")) {
      const btn = icon.closest("button");
      if (btn && icon.textContent.trim() === "arrow_back") {
        backBtn = btn;
        break;
      }
    }
    if (backBtn) {
      const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
      try {
        backBtn.dispatchEvent(new PointerEvent("pointerdown", opts));
      } catch (_) {}
      try {
        backBtn.dispatchEvent(new MouseEvent("mousedown", opts));
      } catch (_) {}
      try {
        backBtn.dispatchEvent(new PointerEvent("pointerup", opts));
      } catch (_) {}
      try {
        backBtn.dispatchEvent(new MouseEvent("mouseup", opts));
      } catch (_) {}
      try {
        backBtn.click();
      } catch (_) {}
      if (await _waitExitMediaViewer()) return true;
      console.warn(
        "[exitMediaViewer] Tier 1 (n\xFAt back) fail \u2192 th\u1EED history.back()",
      );
    }
    try {
      history.back();
      await _waitExitMediaViewer();
      if (
        !_isFlowMediaViewerOpen2() &&
        getCurrentProjectId2() === projectId &&
        location.pathname.includes("/project/")
      ) {
        return true;
      }
    } catch (_) {}
    if (cleanPath !== location.pathname) {
      console.warn(
        "[exitMediaViewer] Tier 1+2 fail \u2192 reload URL project s\u1EA1ch:",
        cleanPath,
      );
      location.href = origin + cleanPath;
    }
    return (
      !_isFlowMediaViewerOpen2() &&
      getCurrentProjectId2() === projectId &&
      location.pathname.replace(/\/$/, "") === cleanPath.replace(/\/$/, "")
    );
  }
  let _autoScrollInFlight = false;
  let _autoScrolledThisLoad = false;
  async function _autoScrollLoadProjects(force = false) {
    if (_autoScrollInFlight) return;
    if (_autoScrolledThisLoad && !force) return;
    _autoScrollInFlight = true;
    try {
      if ((await _autoScrollLoadProjectsInner()) !== false)
        _autoScrolledThisLoad = true;
    } finally {
      _autoScrollInFlight = false;
    }
  }
  async function _autoScrollLoadProjectsInner() {
    const sleep3 = (ms) => new Promise((r) => setTimeout(r, ms));
    const pageUrl = location.href;
    let scroller = null;
    const firstLink = _qa2("project_link")[0];
    if (firstLink) {
      let p = firstLink.parentElement;
      for (let i = 0; i < 12 && p && p !== document.body; i++) {
        const oy = getComputedStyle(p).overflowY;
        if (
          (oy === "auto" || oy === "scroll") &&
          p.scrollHeight > p.clientHeight + 4
        ) {
          scroller = p;
          break;
        }
        p = p.parentElement;
      }
    }
    const useWindow = !scroller;
    const se = document.scrollingElement || document.documentElement;
    const getTop = () =>
      useWindow ? window.scrollY || se.scrollTop || 0 : scroller.scrollTop;
    const getMax = () =>
      useWindow
        ? se.scrollHeight - window.innerHeight
        : scroller.scrollHeight - scroller.clientHeight;
    const scrollTo = (y) =>
      useWindow ? window.scrollTo(0, y) : (scroller.scrollTop = y);
    const originalTop = getTop();
    const MAX_STEPS = 20;
    let lastCount = _qa2("project_link").length;
    let stable = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (location.href !== pageUrl) return false;
      const beforeTop = getTop();
      scrollTo(getMax() + 1e3);
      await sleep3(400);
      if (location.href !== pageUrl) return false;
      const count = _qa2("project_link").length;
      const grew = count > lastCount;
      const moved = getTop() > beforeTop + 2;
      lastCount = count;
      if (!grew && !moved) {
        if (++stable >= 2) break;
      } else {
        stable = 0;
      }
    }
    scrollTo(originalTop);
    await sleep3(120);
  }
  var _retryingTiles = new Set();
  var _clickedRetryTileIds = new Set();
  var _retryMutex = Promise.resolve();
  async function _acquireRetryMutex() {
    const previous = _retryMutex;
    let release;
    const ticket = new Promise((r) => {
      release = r;
    });
    _retryMutex = ticket;
    await previous.catch(() => {});
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();
    };
  }
  async function _waitForV2RetryOwnerAck(
    tileId,
    preTileIds,
    expectedType,
    timeoutMs,
  ) {
    const baseline = new Set(preTileIds || []);
    const startedAt = Date.now();
    const ackWindowMs = Math.min(
      timeoutMs,
      Math.max(getInputTimeoutMs2(), 1) * 5,
    );
    while (Date.now() - startedAt < ackWindowMs) {
      const original = _getTileById2(tileId);
      if (original && detectTileStatus2(original) === "processing") {
        return {
          accepted: true,
          ownerId: tileId,
          signal: "original_processing",
        };
      }
      const candidates = getUniqueTileIds2(true)
        .filter((id) => !baseline.has(id))
        .filter((id) => {
          const tile = _getTileById2(id);
          if (!tile) return false;
          const actualType = detectMediaType2(tile);
          return (
            (!expectedType || !actualType || actualType === expectedType) &&
            detectTileStatus2(tile) !== "success"
          );
        });
      if (candidates.length === 1) {
        return {
          accepted: true,
          ownerId: candidates[0],
          signal: "unique_new_non_success_owner",
        };
      }
      if (candidates.length > 1) {
        return {
          accepted: false,
          ownerId: null,
          signal: "ambiguous_new_owners",
        };
      }
      await sleep2(Math.max(100, Math.floor(getInputTimeoutMs2() / 5)));
    }
    return { accepted: false, ownerId: null, signal: "ack_timeout" };
  }
  async function retryFailedTilesViaButton(
    failedTileIds,
    timeoutMs = 12e4,
    excludeTileIds = null,
    ackOnly = false,
  ) {
    const succeeded = [];
    const stillFailed = [];
    let clickedCount = 0;
    let skippedAlreadyClicked = 0;
    const toRetry = failedTileIds.filter(
      (tid) => !_retryingTiles.has(tid) && !_clickedRetryTileIds.has(tid),
    );
    const alreadyClicked = failedTileIds.filter((tid) =>
      _clickedRetryTileIds.has(tid),
    );
    skippedAlreadyClicked = alreadyClicked.length;
    if (alreadyClicked.length > 0) {
      console.log(
        `[TobyFlow] ${alreadyClicked.length} tile \u0111\xE3 click retry tr\u01B0\u1EDBc \u0111\xF3 (skip \u0111\u1EC3 tr\xE1nh t\u1EA1o d\u01B0):`,
        alreadyClicked.map((t) => t.substring(0, 12)),
      );
    }
    if (toRetry.length === 0) {
      console.log(
        "[TobyFlow] T\u1EA5t c\u1EA3 tiles \u0111\xE3 \u0111ang \u0111\u01B0\u1EE3c retry ho\u1EB7c \u0111\xE3 click retry, skip",
      );
      return {
        succeeded: [],
        stillFailed: failedTileIds.filter(
          (tid) => !_clickedRetryTileIds.has(tid),
        ),
        clickedCount: 0,
        skippedAlreadyClicked,
      };
    }
    toRetry.forEach((tid) => _retryingTiles.add(tid));
    const excludeSet =
      excludeTileIds?.length > 0 ? new Set(excludeTileIds) : null;
    const releaseMutex = await _acquireRetryMutex();
    try {
      if (_flowPageContext?.driverKey === "flow_v2" && ackOnly === true) {
        const tileId = toRetry[0];
        const currentTile = _getTileById2(tileId);
        if (!currentTile || detectTileStatus2(currentTile) === "success") {
          return {
            succeeded: [],
            stillFailed: [tileId],
            newTileIds: [],
            clickedCount: 0,
            skippedAlreadyClicked,
          };
        }
        const expectedType = detectMediaType2(currentTile);
        const clickBaseline = getUniqueTileIds2(true);
        await _acquireCtxMenuLock();
        let clicked = false;
        try {
          clicked = clickTileRetryButton2(tileId);
        } finally {
          _releaseCtxMenuLock2();
        }
        if (!clicked) {
          return {
            succeeded: [],
            stillFailed: [tileId],
            newTileIds: [],
            clickedCount: 0,
            skippedAlreadyClicked,
          };
        }
        const ack = await _waitForV2RetryOwnerAck(
          tileId,
          clickBaseline,
          expectedType,
          timeoutMs,
        );
        if (!ack.accepted || !ack.ownerId || excludeSet?.has(ack.ownerId)) {
          return {
            succeeded: [],
            stillFailed: [tileId],
            newTileIds: [],
            clickedCount: 0,
            skippedAlreadyClicked,
            ackSignal: ack.signal,
          };
        }
        _clickedRetryTileIds.add(tileId);
        sendLog2(
          `[Retry L1] Click ACK 1/1 \u2014 owner ${String(ack.ownerId).slice(0, 20)} (${ack.signal})`,
          "info",
        );
        return {
          succeeded: [],
          stillFailed: [],
          newTileIds: [ack.ownerId],
          clickedCount: 1,
          skippedAlreadyClicked,
          ackSignal: ack.signal,
        };
      }
      if (_flowPageContext?.driverKey === "flow_v2" && toRetry.length > 1) {
        const expectedType = detectMediaType2(_getTileById2(toRetry[0]));
        const retryOwnerIds = [];
        for (let retryIndex = 0; retryIndex < toRetry.length; retryIndex++) {
          const tileId = toRetry[retryIndex];
          const currentTile = _getTileById2(tileId);
          const currentStatus = detectTileStatus2(currentTile);
          console.log("[FlowRetryAudit] batch target resolved", {
            output: retryIndex + 1,
            total: toRetry.length,
            tileId: String(tileId || "").slice(0, 20),
            connected: currentTile?.isConnected === true,
            status: currentStatus,
          });
          if (!currentTile || currentStatus === "success") {
            if (currentStatus === "success") succeeded.push(tileId);
            else stillFailed.push(tileId);
            continue;
          }
          const clickBaseline = getUniqueTileIds2(true);
          await _acquireCtxMenuLock();
          let clicked = false;
          try {
            clicked = clickTileRetryButton2(tileId);
          } finally {
            _releaseCtxMenuLock2();
          }
          if (!clicked) {
            stillFailed.push(tileId);
            continue;
          }
          const ack = await _waitForV2RetryOwnerAck(
            tileId,
            clickBaseline,
            expectedType,
            timeoutMs,
          );
          if (!ack.accepted || !ack.ownerId || excludeSet?.has(ack.ownerId)) {
            stillFailed.push(tileId);
            console.warn(
              "[FlowRetryAudit] click not acknowledged; keep original failed",
              {
                output: retryIndex + 1,
                total: toRetry.length,
                tileId: String(tileId || "").slice(0, 20),
                signal: ack.signal,
              },
            );
            continue;
          }
          _clickedRetryTileIds.add(tileId);
          clickedCount++;
          retryOwnerIds.push(ack.ownerId);
          sendLog2(
            `[Retry L1] Click ACK output ${retryIndex + 1}/${toRetry.length} \u2014 owner ${String(ack.ownerId).slice(0, 20)} (${ack.signal})`,
            "info",
          );
        }
        return {
          succeeded: [...new Set(succeeded)],
          stillFailed: [...new Set(stillFailed)],
          newTileIds: [...new Set(retryOwnerIds)],
          clickedCount,
          skippedAlreadyClicked,
        };
      }
      for (let retryIndex = 0; retryIndex < toRetry.length; retryIndex++) {
        const tileId = toRetry[retryIndex];
        if (shouldStop) {
          stillFailed.push(tileId);
          continue;
        }
        const currentTile = _getTileById2(tileId);
        const currentStatus = detectTileStatus2(currentTile);
        console.log("[FlowRetryAudit] target resolved", {
          output: retryIndex + 1,
          total: toRetry.length,
          tileId: String(tileId || "").slice(0, 20),
          connected: currentTile?.isConnected === true,
          status: currentStatus,
        });
        if (currentStatus === "success") {
          console.log(
            `[TobyFlow] Retry skipped: tile ${tileId.substring(0, 12)}... \u0111\xE3 success (transient 'failed' state)`,
          );
          succeeded.push(tileId);
          continue;
        }
        if (currentStatus === "processing") {
          console.log(
            `[TobyFlow] Retry skipped: tile ${tileId.substring(0, 12)}... \u0111ang processing`,
          );
          continue;
        }
        const preTileIds = getUniqueTileIds2(true);
        const preFileNames = getExistingFileNames2();
        await _acquireCtxMenuLock();
        let clicked;
        try {
          clicked = clickTileRetryButton2(tileId);
          await sleep2(getInputTimeoutMs2());
        } finally {
          _releaseCtxMenuLock2();
        }
        if (!clicked) {
          console.warn("[TobyFlow] Retry button not found for tile:", tileId);
          stillFailed.push(tileId);
          continue;
        }
        _clickedRetryTileIds.add(tileId);
        clickedCount++;
        sendLog2(
          `[Retry L1] Click retry output ${retryIndex + 1}/${toRetry.length} \u2014 tile ${String(tileId || "").slice(0, 20)}`,
          "info",
        );
        console.log("[FlowRetryAudit] click dispatched", {
          output: retryIndex + 1,
          total: toRetry.length,
          tileId: String(tileId || "").slice(0, 20),
          clickedCount,
        });
        const retryTimeout = Math.max(timeoutMs, 18e4);
        const result = await waitForNewTiles(
          preTileIds,
          retryTimeout,
          preFileNames,
          0,
          null,
          detectMediaType2(currentTile),
        );
        let newTiles = result?.tiles || [];
        if (excludeSet && newTiles.length > 0) {
          newTiles = newTiles.filter((tid) => !excludeSet.has(tid));
        }
        if (newTiles.length > 1) {
          console.log(
            `[TobyFlow] Retry single tile got ${newTiles.length} tiles, taking oldest`,
          );
          newTiles = newTiles.slice(-1);
        }
        if (newTiles.length > 0) {
          const newTileId = newTiles[0];
          const tile = _getTileById2(newTileId);
          const status = detectTileStatus2(tile);
          if (status === "failed") {
            stillFailed.push(newTileId);
            console.log(
              `[TobyFlow] Retry tile ${tileId.substring(0, 12)}... \u2192 new tile ${newTileId.substring(0, 12)}... FAILED`,
            );
          } else if (status === "success") {
            succeeded.push(newTileId);
            console.log(
              `[TobyFlow] Retry tile ${tileId.substring(0, 12)}... \u2192 new tile ${newTileId.substring(0, 12)}... SUCCESS`,
            );
          } else {
            stillFailed.push(newTileId);
            console.log(
              `[TobyFlow] Retry tile ${tileId.substring(0, 12)}... \u2192 new tile ${newTileId.substring(0, 12)}... unexpected PROCESSING status, treat as failed`,
            );
          }
        } else {
          console.log(
            `[TobyFlow] Retry tile ${tileId.substring(0, 12)}... \u2192 c\u1EA3 2 phase timeout (~120s), skip \u0111\u1EC3 tr\xE1nh t\u1EA1o d\u01B0`,
          );
        }
        if (retryIndex < toRetry.length - 1) {
          await sleep2(300);
        }
      }
      const uniqueSucceeded = [...new Set(succeeded)];
      const uniqueFailed = [...new Set(stillFailed)];
      return {
        succeeded: uniqueSucceeded,
        stillFailed: uniqueFailed,
        clickedCount,
        skippedAlreadyClicked,
      };
    } finally {
      toRetry.forEach((tid) => _retryingTiles.delete(tid));
      releaseMutex();
    }
  }
  const _imageLoadRefreshAttempted = new Set();
  const _autoImageLoadRefreshTiles = new WeakSet();
  let _autoImageLoadRefreshBusy = false;
  let _autoImageLoadRefreshCount = 0;
  async function _autoRefreshVisibleImageLoadErrors() {
    if (
      _autoImageLoadRefreshBusy ||
      _autoImageLoadRefreshCount >= 50 ||
      _flowPageContext?.driverKey !== "flow_v2" ||
      !_tfContextValid2()
    )
      return;
    const tileSelector = _getTileSelectorString2();
    if (!tileSelector) return;
    _autoImageLoadRefreshBusy = true;
    try {
      for (const tile of document.querySelectorAll(tileSelector)) {
        if (_autoImageLoadRefreshCount >= 50) break;
        if (
          !tile.isConnected ||
          _autoImageLoadRefreshTiles.has(tile) ||
          !_isFlowImageLoadError2(tile) ||
          detectMediaType2(tile) !== "image"
        )
          continue;
        const tileId = _getTileRuntimeId2(tile);
        if (!tileId || _getTileById2(tileId) !== tile) continue;
        _autoImageLoadRefreshTiles.add(tile);
        _autoImageLoadRefreshCount++;
        await _acquireCtxMenuLock();
        let clicked = false;
        try {
          clicked = clickTileRetryButton2(tileId);
        } finally {
          _releaseCtxMenuLock2();
        }
        console.info(
          "[FlowImageLoad] auto refresh exact failed image tile",
          JSON.stringify({
            clicked,
            runtimeId: String(tileId).slice(0, 20),
            attempt: _autoImageLoadRefreshCount,
          }),
        );
      }
    } finally {
      _autoImageLoadRefreshBusy = false;
    }
  }
  async function _refreshOwnedImageLoadError(tileId, mediaId) {
    const key = `${getCurrentProjectId2() || ""}:${mediaId}`;
    if (_imageLoadRefreshAttempted.has(key)) return false;
    const tile = _getTileById2(tileId);
    if (
      !tile?.isConnected ||
      _getTileRuntimeId2(tile) !== tileId ||
      !_tileOwnsDownloadIdentity2(tile, mediaId) ||
      !_isFlowImageLoadError2(tile)
    )
      return false;
    _imageLoadRefreshAttempted.add(key);
    await _acquireCtxMenuLock();
    let clicked = false;
    try {
      clicked = clickTileRetryButton2(tileId);
    } finally {
      _releaseCtxMenuLock2();
    }
    if (!clicked) {
      _imageLoadRefreshAttempted.delete(key);
      return null;
    }
    console.info(
      "[FlowImageLoad] clicked owned preview refresh",
      String(mediaId).slice(0, 12),
    );
    const deadline = Date.now() + 3e4;
    while (Date.now() < deadline) {
      await sleep2(500);
      for (const current of [
        _getTileById2(tileId),
        _resolveDownloadTileByFileName2(mediaId),
      ]) {
        if (
          !current?.isConnected ||
          !_tileOwnsDownloadIdentity2(current, mediaId)
        )
          continue;
        const image = _q2("tile_image", current);
        if (
          !_q2("tile_error_owner", current) &&
          image?.complete === true &&
          image.naturalWidth > 0 &&
          _isAllowedFlowMediaUrl2(image.currentSrc || image.src || "")
        ) {
          console.info(
            "[FlowImageLoad] owned preview recovered",
            String(mediaId).slice(0, 12),
          );
          return _getTileRuntimeId2(current);
        }
      }
    }
    return null;
  }
  async function waitForNewTiles(
    preTileIds,
    timeoutMs = 12e4,
    preFileNames = null,
    maxQuantity = 0,
    operationId = null,
    expectedMediaType = null,
  ) {
    const startTime = Date.now();
    const minQuantity = Math.max(0, Number(preTileIds?._minQuantity) || 0);
    const MIN_FAIL_DETECT_MS = 15e3;
    const LAZY_LOAD_GRACE_MS = 15e3;
    const preTileSet = new Set(preTileIds);
    const knownFileNames = preFileNames || new Set();
    const urlPattern = await _getMediaUrlPatternAsync(5e3);
    if (!urlPattern) {
      console.error(
        "[waitForNewTiles] \u274C image_url_pattern config not loaded after 5s \u2014 cannot extract file_name, monitor will fail",
      );
      sendLog2(
        "\u26A0\uFE0F Config ch\u01B0a s\u1EB5n s\xE0ng, vui l\xF2ng th\u1EED l\u1EA1i",
        "warn",
      );
    } else {
      console.log(
        "[waitForNewTiles] \u2705 image_url_pattern ready: " + urlPattern,
      );
    }
    let confirmedNewTiles = null;
    let firstNewDetectedAt = 0;
    let pendingCheck = false;
    const tileContainer =
      document.querySelector(_getTileSelectorString2())?.parentElement ||
      document.body;
    const observer = new MutationObserver(() => {
      pendingCheck = true;
    });
    observer.observe(tileContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: Array.from(
        new Set(
          [
            "class",
            "src",
            _getConfiguredAttribute2("tile_container"),
            _getConfiguredAttribute2("tile_image", "persistent_id_attribute"),
          ].filter(Boolean),
        ),
      ),
    });
    const cleanup = () => {
      observer.disconnect();
    };
    try {
      while (Date.now() - startTime < timeoutMs) {
        if (shouldStop) {
          cleanup();
          return { tiles: [], failed: false };
        }
        if (pendingCheck) {
          pendingCheck = false;
          await sleep2(200);
        } else {
          await sleep2(5e3);
        }
        const currentTiles = getUniqueTileIds2(true);
        let newTiles = currentTiles.filter((id) => !preTileSet.has(id));
        const normalizedExpectedType = String(
          expectedMediaType || "",
        ).toLowerCase();
        if (
          normalizedExpectedType === "image" ||
          normalizedExpectedType === "video"
        ) {
          const rejected = [];
          newTiles = newTiles.filter((id) => {
            const tile = _getTileById2(id);
            const actual = tile ? detectMediaType2(tile) : null;
            const keep = !actual || actual === normalizedExpectedType;
            if (!keep) rejected.push({ id, media_type: actual });
            return keep;
          });
          if (rejected.length > 0) {
            console.warn(
              "[FlowV2ResultIdentity] waitForNewTiles rejected cross-media tiles",
              JSON.stringify({
                expected_media_type: normalizedExpectedType,
                operation_id: operationId || null,
                rejected,
              }),
            );
          }
        }
        if (newTiles.length > 0) {
          if (knownFileNames.size > 0) {
            newTiles = newTiles.filter((tid) => {
              const tile = _getTileById2(tid);
              const fn = _getPersistentMediaId2(tile) || extractFileName2(tile);
              return !fn || !knownFileNames.has(fn);
            });
            if (newTiles.length === 0) continue;
          }
          if (confirmedNewTiles === null) {
            if (!firstNewDetectedAt) firstNewDetectedAt = Date.now();
            const processingTiles = newTiles.filter((tid) => {
              const tile = _getTileById2(tid);
              return detectTileStatus2(tile) !== "success";
            });
            const fastCompletedTiles = newTiles.filter((tid) => {
              if (processingTiles.includes(tid)) return false;
              const tile = _getTileById2(tid);
              const fn = _getPersistentMediaId2(tile) || extractFileName2(tile);
              return fn && knownFileNames.size > 0 && !knownFileNames.has(fn);
            });
            if (processingTiles.length > 0 || fastCompletedTiles.length > 0) {
              confirmedNewTiles = new Set([
                ...processingTiles,
                ...fastCompletedTiles,
              ]);
            } else if (Date.now() - firstNewDetectedAt > LAZY_LOAD_GRACE_MS) {
              const safeFastTiles = newTiles.filter((tid) => {
                const tile = _getTileById2(tid);
                return !!_getPersistentMediaId2(tile);
              });
              if (safeFastTiles.length > 0)
                confirmedNewTiles = new Set(safeFastTiles);
              else continue;
            } else {
              continue;
            }
          } else {
            for (const tid of newTiles) {
              if (confirmedNewTiles.has(tid)) continue;
              const tile = _getTileById2(tid);
              if (detectTileStatus2(tile) !== "success") {
                confirmedNewTiles.add(tid);
              } else {
                const fn =
                  _getPersistentMediaId2(tile) || extractFileName2(tile);
                if (fn && knownFileNames.size > 0 && !knownFileNames.has(fn)) {
                  confirmedNewTiles.add(tid);
                }
              }
            }
          }
          newTiles = newTiles
            .filter((id) => confirmedNewTiles.has(id))
            .filter((id) => _claimFlowTile2(id, operationId));
          if (newTiles.length === 0) continue;
          if (maxQuantity > 0 && newTiles.length > maxQuantity) {
            newTiles = newTiles.slice(-maxQuantity);
          }
          const elapsed = Date.now() - startTime;
          if (minQuantity > 0 && newTiles.length < minQuantity) continue;
          let allDone = true;
          let anyFailed = false;
          for (const tid of newTiles) {
            const tile = _getTileById2(tid);
            const status = detectTileStatus2(tile);
            if (status === "failed" && elapsed >= MIN_FAIL_DETECT_MS) {
              anyFailed = true;
              continue;
            }
            if (
              status === "processing" ||
              (status === "failed" && elapsed < MIN_FAIL_DETECT_MS)
            ) {
              allDone = false;
              break;
            }
            const fileName =
              _getPersistentMediaId2(tile) || extractFileName2(tile);
            const typed = _extractTypedTileRecord2(tile, null);
            const v2VideoReady =
              _flowPageContext?.driverKey === "flow_v2" &&
              typed?.mediaType === "video" &&
              status === "success";
            if (!fileName && status === "success" && !v2VideoReady) {
              allDone = false;
              break;
            }
          }
          if (anyFailed && allDone) {
            cleanup();
            return { tiles: newTiles, failed: true };
          }
          if (!anyFailed && allDone) {
            const thumbnails = {};
            const persistableTiles = [];
            const tileRecords = [];
            for (const tid of newTiles) {
              const tile = _getTileById2(tid);
              if (!tile) continue;
              const resultId = _getPersistableResultId2(tile, tid);
              const typedRecord = _extractTypedTileRecord2(tile, operationId);
              const typedProjection = _typedMediaProjection2(typedRecord);
              persistableTiles.push(resultId);
              tileRecords.push({ ...typedRecord, resultId });
              const img = tile.querySelector("img");
              let video = _q2("tile_video", tile);
              const isVideoTileHint = img?.alt?.toLowerCase().includes("video");
              if (!video && isVideoTileHint) {
                const pollVideoStart = Date.now();
                const POLL_VIDEO_TIMEOUT = 1e4;
                const POLL_VIDEO_INTERVAL = 500;
                while (
                  !video &&
                  Date.now() - pollVideoStart < POLL_VIDEO_TIMEOUT
                ) {
                  await sleep2(POLL_VIDEO_INTERVAL);
                  video = _q2("tile_video", tile);
                }
                if (video) {
                  sendLog2(
                    "[waitForNewTiles] \u0110\xE3 ph\xE1t hi\u1EC7n <video> sau " +
                      (Date.now() - pollVideoStart) +
                      "ms delay",
                    "info",
                  );
                } else {
                  sendLog2(
                    "[waitForNewTiles] Video element kh\xF4ng xu\u1EA5t hi\u1EC7n sau " +
                      POLL_VIDEO_TIMEOUT +
                      "ms, fallback img-based video detection",
                    "warn",
                  );
                }
              }
              const fileName =
                _getPersistentMediaId2(tile) || extractFileName2(tile);
              const flowInfo = extractFlowFileInfo2(tile);
              if (video) {
                let videoUrl = video.src || video.currentSrc || "";
                if (!videoUrl || videoUrl.length < 10) {
                  const pollSrcStart = Date.now();
                  const POLL_SRC_TIMEOUT = 3e3;
                  const POLL_SRC_INTERVAL = 200;
                  while (
                    (!videoUrl || videoUrl.length < 10) &&
                    Date.now() - pollSrcStart < POLL_SRC_TIMEOUT
                  ) {
                    await sleep2(POLL_SRC_INTERVAL);
                    videoUrl = video.src || video.currentSrc || "";
                  }
                  if (videoUrl && videoUrl.length > 10) {
                    sendLog2(
                      "[waitForNewTiles] Video src loaded sau " +
                        (Date.now() - pollSrcStart) +
                        "ms: " +
                        _safeFlowUrlForLog2(videoUrl),
                      "info",
                    );
                  }
                }
                if (videoUrl && !videoUrl.startsWith("http")) {
                  try {
                    videoUrl = new URL(videoUrl, window.location.origin).href;
                  } catch (e) {
                    console.warn(
                      "[waitForNewTiles] Cannot resolve video URL:",
                      videoUrl,
                    );
                  }
                }
                let vThumb = video.poster || "";
                if (
                  !vThumb &&
                  img?.src &&
                  !img.src.includes("chrome-extension")
                )
                  vThumb = img.src;
                if (!vThumb)
                  vThumb = _deriveFlowV2PosterUrlFromVideo2(videoUrl);
                thumbnails[resultId] = {
                  thumbnail: vThumb,
                  ...(vThumb &&
                    /^https?:\/\//i.test(vThumb) && {
                      source_thumbnail: vThumb,
                    }),
                  type: "video",
                  ...(fileName && { file_name: fileName }),
                  ...(flowInfo && {
                    file_id: flowInfo.file_id,
                    project_id: flowInfo.project_id,
                  }),
                  ...typedProjection,
                  video_url: videoUrl,
                  playback_url_source: "dom_stream",
                };
                _rememberFlowVideoStreamUrl2(videoUrl);
              } else if (img?.src && !img.src.includes("chrome-extension")) {
                const isVideoByAlt = img.alt?.toLowerCase().includes("video");
                if (isVideoByAlt) {
                  const poster = _q2("tile_video_poster", tile);
                  const posterUrl =
                    poster?.currentSrc ||
                    poster?.src ||
                    poster?.getAttribute?.("src") ||
                    img.src;
                  const derivedVideoUrl =
                    _deriveFlowV2VideoUrlFromPoster2(posterUrl);
                  thumbnails[resultId] = {
                    thumbnail: posterUrl,
                    source_thumbnail: posterUrl,
                    type: "video",
                    ...(derivedVideoUrl && { video_url: derivedVideoUrl }),
                    ...(fileName && { file_name: fileName }),
                    ...(flowInfo && {
                      file_id: flowInfo.file_id,
                      project_id: flowInfo.project_id,
                    }),
                    ...typedProjection,
                  };
                  sendLog2(
                    derivedVideoUrl
                      ? "[waitForNewTiles] Video playback URL derived from configured V2 poster"
                      : "[waitForNewTiles] Video tile detected, but configured poster transform did not resolve playback",
                    derivedVideoUrl ? "info" : "warn",
                  );
                } else {
                  thumbnails[resultId] = {
                    thumbnail: img.src,
                    type: "image",
                    ...(fileName && { file_name: fileName }),
                    ...(flowInfo && {
                      file_id: flowInfo.file_id,
                      project_id: flowInfo.project_id,
                    }),
                    ...typedProjection,
                  };
                }
              }
            }
            cleanup();
            return {
              tiles: persistableTiles,
              failed: false,
              thumbnails,
              tileRecords,
            };
          }
        }
      }
      cleanup();
      return { tiles: [], failed: false };
    } catch (err) {
      cleanup();
      throw err;
    }
  }
  async function waitAndDownloadNewTiles(
    preTileIds,
    promptText,
    timeoutMs = 12e4,
  ) {
    const startTime = Date.now();
    const MIN_FAIL_DETECT_MS = 15e3;
    while (Date.now() - startTime < timeoutMs) {
      await sleep2(2e3);
      const currentTiles = getUniqueTileIds2(true);
      const newTiles = currentTiles.filter((id) => !preTileIds.includes(id));
      if (newTiles.length > 0) {
        const elapsed = Date.now() - startTime;
        let allDone = true;
        let anyFailed = false;
        for (const tid of newTiles) {
          const tile = _getTileById2(tid);
          const status = detectTileStatus2(tile);
          if (status === "failed" && elapsed >= MIN_FAIL_DETECT_MS) {
            anyFailed = true;
          }
          if (
            status === "processing" ||
            (status === "failed" && elapsed < MIN_FAIL_DETECT_MS)
          ) {
            allDone = false;
            break;
          }
        }
        if (anyFailed) {
          sendLog2(
            "\u274C Google Flow b\xE1o l\u1ED7i - t\u1EA1o \u1EA3nh th\u1EA5t b\u1EA1i",
            "error",
          );
          return [];
        }
        if (allDone) {
          const downloadedTiles = [];
          for (const tid of newTiles) {
            const ok = await downloadTileMedia(tid, promptText);
            if (ok) downloadedTiles.push(tid);
            else
              sendLog2(
                `\u26A0\uFE0F Download th\u1EA5t b\u1EA1i: ${String(tid).slice(0, 16)}`,
                "warn",
              );
            await sleep2(150);
          }
          return downloadedTiles;
        }
      }
    }
    sendLog2(
      "\u26A0\uFE0F Timeout ch\u1EDD k\u1EBFt qu\u1EA3 \u0111\u1EC3 t\u1EA3i",
      "warn",
    );
    return [];
  }
  async function notifyCompletion(title, body) {
    const settings = await new Promise((resolve) => {
      ConfigSnapshotAccess.read(["af_settings"], (res) =>
        resolve(res.af_settings || {}),
      );
    });
    if (settings.notifyOnComplete !== false) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification(title, { body });
        }
      }
    }
    if (settings.notifySound) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(900, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}
    }
  }
  window._afSettings = {
    humanizedMode: false,
    humanizedSpeed: 0.5,
    inputTimeout: 1200,
    randomDelayMin: 3,
    randomDelayMax: 10,
  };
  window._afExecConfig = { workflow: {}, timing: {}, flow_recovery: {} };
  (function loadAfSettings() {
    ConfigSnapshotAccess.read(
      ["af_settings", "af_execution_config"],
      (result) => {
        const s = result.af_settings || {};
        window._afSettings = {
          ...window._afSettings,
          humanizedMode: s.humanizedMode || false,
          humanizedSpeed: parseFloat(s.humanizedSpeed) || 0.5,
          inputTimeout: parseInt(s.inputTimeout) || 1200,
          randomDelayMin: parseInt(s.randomDelayMin) || 3,
          randomDelayMax: parseInt(s.randomDelayMax) || 10,
        };
        const ec = result.af_execution_config;
        if (ec) {
          window._afExecConfig = {
            workflow: ec.workflow || window._afExecConfig.workflow,
            timing: ec.timing || window._afExecConfig.timing,
            flow_recovery:
              ec.flow_recovery || window._afExecConfig.flow_recovery,
          };
        }
      },
    );
  })();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.af_settings) {
      const s = changes.af_settings.newValue || {};
      window._afSettings = {
        ...window._afSettings,
        humanizedMode: s.humanizedMode || false,
        humanizedSpeed: parseFloat(s.humanizedSpeed) || 0.5,
        inputTimeout: parseInt(s.inputTimeout) || 1200,
        randomDelayMin: parseInt(s.randomDelayMin) || 3,
        randomDelayMax: parseInt(s.randomDelayMax) || 10,
      };
    }
    if (changes.af_execution_config) {
      ConfigSnapshotAccess.read("af_execution_config", (stored) => {
        const ec = stored.af_execution_config;
        if (ec) {
          window._afExecConfig = {
            workflow: ec.workflow || window._afExecConfig.workflow,
            timing: ec.timing || window._afExecConfig.timing,
            flow_recovery:
              ec.flow_recovery || window._afExecConfig.flow_recovery,
          };
        } else
          window._afExecConfig = {
            workflow: {},
            timing: {},
            flow_recovery: {},
          };
      });
    }
  });
  async function clearEditor(editor) {
    if (editor?.classList?.contains("ProseMirror")) {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      let ok = document.execCommand("delete", false);
      selection.removeAllRanges();
      await sleep2(100);
      if (getEditorUserText2(editor).trim() || _countInlineChips2() > 0) {
        editor.focus();
        const selected = document.execCommand("selectAll", false);
        const deleted = document.execCommand("delete", false);
        ok = ok || (selected && deleted);
        await sleep2(100);
      }
      return !getEditorUserText2(editor).trim() && _countInlineChips2() === 0;
    }
    return false;
  }
  async function insertText(editor, text, opts = {}) {
    editor = getEditor2() || editor;
    if (editor?.classList?.contains("ProseMirror")) {
      const normalize = (value) =>
        String(value)
          .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const inserted = String(text || "");
      if (!inserted || (!opts.segmentMode && !normalize(inserted)))
        return false;
      const before = getEditorUserText2(editor).replace(/\n$/, "");
      const expected = normalize((opts.segmentMode ? before : "") + inserted);
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      const insertStarted = Date.now();
      let execResult = false,
        method = "execCommand";
      if (
        typeof ClipboardEvent === "function" &&
        typeof DataTransfer === "function"
      ) {
        const clipboard = new DataTransfer();
        clipboard.setData("text/plain", inserted);
        const paste = new ClipboardEvent("paste", {
          clipboardData: clipboard,
          bubbles: true,
          cancelable: true,
        });
        editor.dispatchEvent(paste);
        const afterPaste = getEditorUserText2(getEditor2() || editor).replace(
          /\n$/,
          "",
        );
        if (paste.defaultPrevented || afterPaste !== before) {
          method = "paste";
          execResult = true;
        }
      }
      if (method !== "paste")
        execResult = document.execCommand("insertText", false, String(text));
      console.info("[FlowV2Editor] text insertion dispatched", {
        method,
        length: inserted.length,
        dispatchMs: Date.now() - insertStarted,
        visibility: document.visibilityState,
        focused: document.hasFocus?.() === true,
      });
      selection.removeAllRanges();
      let currentEditor = getEditor2() || editor;
      let actualRaw = getEditorUserText2(currentEditor);
      let actual = normalize(actualRaw);
      if (actual === expected) return true;
      await sleep2(150);
      currentEditor = getEditor2() || editor;
      actualRaw = getEditorUserText2(currentEditor);
      actual = normalize(actualRaw);
      const confirmed = actual === expected;
      if (!confirmed) {
        console.warn("[FlowV2Editor] ProseMirror insert not confirmed", {
          execResult,
          expectedLength: expected.length,
          actualLength: actual.length,
          rawLength: actualRaw.length,
          paragraphCount: currentEditor.querySelectorAll("p").length,
          childCount: currentEditor.childNodes.length,
          connected: currentEditor.isConnected,
        });
      }
      return confirmed;
    }
    return false;
  }
  async function _insertTextSingle(text, opts = {}) {
    let editor = getEditor2();
    if (editor?.classList?.contains("ProseMirror")) {
      editor.focus();
      const ok = document.execCommand("insertText", false, text);
      await sleep2(100);
      const domText = (editor.textContent || "").replace(/\s+/g, " ").trim();
      const target = String(text || "")
        .replace(/\s+/g, " ")
        .trim();
      return (
        !!ok &&
        !!domText &&
        (opts.segmentMode ||
          domText.includes(target) ||
          target.includes(domText))
      );
    }
    return false;
  }
  async function removeExistingRefImages() {
    console.log(
      "[removeExistingRefImages] called \u2014 clear ALL chips (ref + character + voice)",
    );
    const editor = getEditor2();
    if (!editor) {
      console.warn(
        "[removeExistingRefImages] no editor found \u2014 cannot verify ingredient clear",
      );
      throw new Error("FLOW_INGREDIENT_CLEAR_EDITOR_MISSING");
    }
    if (_flowPageContext?.driverKey === "flow_v2") {
      const removeCfg = _getDynamicSelector2("ingredient_remove_button");
      const removeSelector = removeCfg?.selectors?.length
        ? removeCfg.selectors.join(", ")
        : null;
      if (
        !removeSelector ||
        !removeCfg?.icon_text ||
        !_selStr2("ingredient_bar")
      ) {
        console.warn(
          "[removeExistingRefImages] ingredient remove config missing",
        );
        throw new Error("FLOW_INGREDIENT_CLEAR_CONFIG_MISSING");
      }
      const collectOwners = () => {
        return [
          ...new Set(
            [
              "ingredient_image_chip",
              "ingredient_video_chip",
              "ingredient_voice_chip",
              "ingredient_character_chip",
            ]
              .flatMap((key) => _flowV2IngredientChips2(key))
              .filter((chip) => chip?.isConnected),
          ),
        ];
      };
      const initialCount = collectOwners().length;
      const oldTextPresent =
        !!getEditorUserText2(editor).trim() || _countInlineChips2() > 0;
      const clearCfg = _getDynamicSelector2("prompt_clear_button");
      const clearButton = _q2("prompt_clear_button");
      if ((initialCount > 0 || oldTextPresent) && clearButton) {
        const expectedIcon = String(clearCfg?.icon_text || "").trim();
        const iconMatches =
          !expectedIcon ||
          _findIconsInElement2(clearButton).some(
            (icon) => icon?.textContent?.trim() === expectedIcon,
          );
        if (iconMatches && !_isFlowControlDisabled2(clearButton)) {
          simulateClick2(clearButton);
          for (let wait = 0; wait < 15; wait++) {
            await sleep2(80);
            if (
              collectOwners().length === 0 &&
              !getEditorUserText2(getEditor2() || editor).trim() &&
              _countInlineChips2() === 0
            ) {
              console.info("[FlowIngredientClearAudit]", {
                initial: initialCount,
                removed: initialCount,
                remaining: 0,
                method: "prompt_clear_button",
              });
              return initialCount;
            }
          }
          console.warn(
            "[removeExistingRefImages] Clear prompt was not fully acknowledged; falling back to owned chip removal",
          );
        }
      }
      let removed = 0;
      while (collectOwners().length > 0 && removed < initialCount) {
        const before = collectOwners();
        const chip = before[0];
        let removeTarget = null;
        for (const candidate of Array.from(
          chip.querySelectorAll(removeSelector),
        )) {
          const icon = _findIconsInElement2(candidate).find(
            (entry) => entry?.textContent?.trim() === removeCfg.icon_text,
          );
          if (icon) {
            removeTarget = icon;
            break;
          }
        }
        if (!removeTarget) {
          console.warn(
            "[removeExistingRefImages] remove control not found in live ingredient chip",
          );
          break;
        }
        simulateClick2(removeTarget);
        let remaining2 = before.length;
        for (let wait = 0; wait < 10 && remaining2 >= before.length; wait++) {
          await sleep2(80);
          remaining2 = collectOwners().length;
        }
        if (remaining2 >= before.length) {
          console.warn(
            "[removeExistingRefImages] chip removal not acknowledged",
            { before: before.length, remaining: remaining2 },
          );
          break;
        }
        removed += before.length - remaining2;
      }
      const remaining = collectOwners().length;
      console.info("[FlowIngredientClearAudit]", {
        initial: initialCount,
        removed,
        remaining,
      });
      if (remaining > 0)
        throw new Error(
          `FLOW_INGREDIENT_CLEAR_INCOMPLETE:${removed}/${initialCount}`,
        );
      return removed;
    }
    throw new Error("FLOW_INGREDIENT_CLEAR_DRIVER_UNAVAILABLE");
  }
  async function clickFlowSubmitControl(element) {
    if (
      !element ||
      !(element instanceof HTMLButtonElement) ||
      !element.isConnected
    ) {
      console.warn("[FlowV2SubmitControl] invalid or detached submit button");
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      _isFlowControlDisabled2(element)
    ) {
      console.warn("[FlowV2SubmitControl] submit button hidden or disabled");
      return false;
    }
    let clickDelivered = false;
    let controlAccepted = false;
    let mainActivation = null;
    const markDelivered = () => {
      clickDelivered = true;
    };
    element.addEventListener("click", markDelivered, {
      capture: true,
      once: true,
    });
    const observeRoot = element.parentElement || element;
    const acceptanceObserver = new MutationObserver(() => {
      if (_isFlowControlDisabled2(element)) {
        controlAccepted = true;
      } else if (!element.isConnected) {
        const live = getSubmitButton2();
        if (live && _isFlowControlDisabled2(live)) controlAccepted = true;
      }
    });
    acceptanceObserver.observe(observeRoot, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["disabled", "aria-disabled", "class"],
    });
    try {
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: "mouse",
        view: window,
      };
      element.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
      element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      element.focus({ preventScroll: true });
      await Promise.all([
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
        new Promise((resolve) => setTimeout(resolve, 120)),
      ]);
      if (!element.isConnected || _isFlowControlDisabled2(element)) {
        acceptanceObserver.disconnect();
        element.removeEventListener("click", markDelivered, { capture: true });
        return false;
      }
      element.dispatchEvent(new PointerEvent("pointerup", eventOptions));
      element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
      const submitToken = crypto.randomUUID();
      element.setAttribute("data-tobyflow-submit-token", submitToken);
      try {
        mainActivation = await _slateBridgeCall2("activateV2Submit", {
          submitToken,
        });
      } finally {
        element.removeAttribute("data-tobyflow-submit-token");
      }
      const mainListenerInvoked2 =
        mainActivation?.success === true && Number(mainActivation?.invoked) > 0;
      const mainActivationAmbiguous2 =
        mainActivation?.error === "Bridge timeout";
      if (!mainListenerInvoked2 && !mainActivationAmbiguous2) {
        element.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
    } catch (error) {
      acceptanceObserver.disconnect();
      element.removeEventListener("click", markDelivered, { capture: true });
      console.warn(
        "[FlowV2SubmitControl] native activation failed:",
        error?.message || error,
      );
      return false;
    }
    acceptanceObserver.disconnect();
    element.removeEventListener("click", markDelivered, { capture: true });
    console.info(
      "[FlowV2SubmitControl] submit activation",
      JSON.stringify({
        delivered: clickDelivered,
        type: element.type || null,
        ariaLabel: element.getAttribute("aria-label") || null,
        stagedFocusCommit: true,
        strategy:
          mainActivation?.success === true &&
          Number(mainActivation?.invoked) > 0
            ? "angular_main"
            : mainActivation?.error === "Bridge timeout"
              ? "angular_ambiguous"
              : "native_fallback",
        controlAccepted,
        mainActivation,
      }),
    );
    const mainListenerInvoked =
      mainActivation?.success === true && Number(mainActivation?.invoked) > 0;
    const mainActivationAmbiguous = mainActivation?.error === "Bridge timeout";
    return {
      delivered:
        clickDelivered || mainListenerInvoked || mainActivationAmbiguous,
      controlAccepted,
      mainListenerInvoked: mainListenerInvoked || mainActivationAmbiguous,
      mainActivationAmbiguous,
    };
  }
  async function simulateLongPressContextMenu(element, holdMs) {
    if (!element || !(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointerId = 9173;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      pointerId,
      pointerType: "touch",
      isPrimary: true,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", eventInit));
    await sleep2(holdMs);
    element.dispatchEvent(
      new PointerEvent("pointerup", { ...eventInit, buttons: 0 }),
    );
    return true;
  }
  async function _applyFlowV2Settings(
    genType,
    aspectRatio,
    modelName,
    isFrames,
    quantity,
    flowVideoDuration,
    modelAliases,
    flowVideoResolution,
    flowVideoResolutionDomValue,
    skipFlowDurationControl = false,
  ) {
    const agentReady = await _ensureFlowV2AgentReady();
    if (!agentReady.success)
      throw new Error(agentReady.error || "V2_AGENT_BLOCKED");
    const waitForSettingsPanel = async (timeoutMs = 2500) => {
      const startedAt = Date.now();
      let panel = _getActiveSettingsPanel2();
      while (
        (!panel || panel === document) &&
        Date.now() - startedAt < timeoutMs
      ) {
        await sleep2(100);
        panel = _getActiveSettingsPanel2();
      }
      return panel;
    };
    const selectRadio = async (key, match, options = {}) => {
      const cfg = _getDynamicSelector2(key);
      const root = await waitForSettingsPanel();
      const selector = cfg?.selectors?.length ? cfg.selectors.join(", ") : null;
      if (!selector || !root || root === document)
        throw new Error(`V2_SETTING_MISSING:${key}`);
      const findTarget = () =>
        Array.from(root.querySelectorAll(selector)).find((el) =>
          match(el, cfg),
        ) || null;
      const isSelected = (el) => {
        if (!el) return false;
        const configuredAttribute = cfg.attribute_selected;
        return (
          (configuredAttribute &&
            el.getAttribute(configuredAttribute) === "true") ||
          el.getAttribute("aria-checked") === "true" ||
          el.getAttribute("aria-selected") === "true" ||
          el.getAttribute("data-state") === "active"
        );
      };
      let target = null;
      const startedAt = Date.now();
      do {
        target = findTarget();
        if (!target) await sleep2(100);
      } while (!target && Date.now() - startedAt < 2e3);
      if (!target) {
        const candidates = Array.from(root.querySelectorAll(selector));
        const groupCandidates =
          typeof options.isGroupCandidate === "function"
            ? candidates.filter((el) => options.isGroupCandidate(el, cfg))
            : candidates;
        if (options.allowAbsentGroup === true && groupCandidates.length === 0) {
          console.log(
            `[applySettings:v2] ${key} group absent \u2014 keeping Flow's model-fixed value`,
          );
          return false;
        }
        console.warn("[applySettings:v2] requested option missing", {
          key,
          candidateCount: candidates.length,
          groupCandidateCount: groupCandidates.length,
          groupValues: groupCandidates
            .slice(0, 12)
            .map((el) => String(el.textContent || "").trim()),
        });
        if (options.bypassMissingOption !== false) {
          console.warn(
            `[applySettings:v2] bypass missing ${key} \u2014 keeping current Flow value`,
          );
          return false;
        }
        const liveTrigger = getSettingsButton2(getSubmitButton2());
        if (liveTrigger) {
          simulateClick2(liveTrigger);
          await sleep2(getSettingsStepDelay2());
        }
        throw new Error(
          `${key.startsWith("mode_tab_") || key.startsWith("video_mode_") ? "V2_MODE" : "V2_SETTING"}_OPTION_NOT_FOUND:${key}`,
        );
      }
      console.log("[applySettings:v2] option resolved", {
        key,
        requestedValue: String(target.textContent || "").trim(),
        role: target.getAttribute("role"),
        selectedBefore: isSelected(target),
      });
      if (!isSelected(target)) {
        simulateClick2(target);
        const verifyStartedAt = Date.now();
        do {
          await sleep2(100);
          target = findTarget();
        } while (
          !isSelected(target) &&
          Date.now() - verifyStartedAt < Math.max(1200, getSettingsStepDelay2())
        );
      }
      if (!isSelected(target)) {
        throw new Error(
          `${key.startsWith("mode_tab_") || key.startsWith("video_mode_") ? "V2_MODE" : "V2_SETTING"}_NOT_APPLIED:${key}`,
        );
      }
      console.log("[applySettings:v2] option applied", {
        key,
        value: String(target.textContent || "").trim(),
        role: target.getAttribute("role"),
      });
    };
    const settings = getSettingsButton2(getSubmitButton2());
    if (!settings) throw new Error("V2_SETTINGS_TRIGGER_NOT_FOUND");
    let settingsPanel = _getActiveSettingsPanel2();
    for (
      let attempt = 1;
      (!settingsPanel || settingsPanel === document) && attempt <= 3;
      attempt++
    ) {
      const liveSettings = getSettingsButton2(getSubmitButton2()) || settings;
      console.log(
        `[applySettings:v2] opening settings panel attempt ${attempt}/3`,
      );
      simulateClick2(liveSettings);
      settingsPanel = await waitForSettingsPanel(2500);
      if (!settingsPanel || settingsPanel === document) await sleep2(250);
    }
    if (!settingsPanel || settingsPanel === document)
      throw new Error("V2_SETTINGS_PANEL_NOT_FOUND");
    const isVideo = String(genType).toLowerCase() === "video";
    await selectRadio(
      isVideo ? "mode_tab_video" : "mode_tab_image",
      (el, cfg) =>
        _findIconInElement2(el)?.textContent?.trim() === cfg.icon_text,
      { bypassMissingOption: false },
    );
    if (isVideo) {
      await selectRadio(
        isFrames ? "video_mode_frames" : "video_mode_ingredients",
        (el, cfg) =>
          _findIconInElement2(el)?.textContent?.trim() === cfg.icon_text,
        { bypassMissingOption: false },
      );
    }
    await selectRadio(
      "ratio_button",
      (el, cfg) =>
        !!cfg.ratio_icons?.[aspectRatio] &&
        _findIconInElement2(el)?.textContent?.trim() ===
          cfg.ratio_icons[aspectRatio],
      {
        allowAbsentGroup: true,
        isGroupCandidate: (el, cfg) =>
          Object.values(cfg.ratio_icons || {}).includes(
            _findIconInElement2(el)?.textContent?.trim(),
          ),
      },
    );
    await selectRadio(
      "quantity_button",
      (el, cfg) =>
        (el.textContent || "").trim() ===
        String(cfg.text_format || "").replace("{value}", quantity),
      {
        allowAbsentGroup: true,
        isGroupCandidate: (el, cfg) => {
          const format = String(cfg.text_format || "");
          if (!format.includes("{value}")) return false;
          const escaped = format
            .split("{value}")
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          return new RegExp(`^${escaped[0]}\\d+${escaped[1]}$`).test(
            String(el.textContent || "").trim(),
          );
        },
      },
    );
    if (modelName) {
      const button = _q2("model_picker_button", _getActiveSettingsPanel2());
      if (!button) {
        console.warn(
          `[applySettings:v2] model picker missing for requested model: ${modelName}`,
        );
        throw new Error(`MODEL_OPTION_NOT_FOUND: ${modelName}`);
      } else {
        const normalizeModelLabel = (value) =>
          String(value || "")
            .normalize("NFKC")
            .trim()
            .toLowerCase()
            .replace(/^[^\p{L}\p{N}]+/u, "")
            .replace(/\s+/g, " ");
        const readModelLabel = (element) => {
          if (!element) return "";
          let text = String(element.textContent || "");
          const iconText = _findIconInElement2(element)?.textContent?.trim();
          if (iconText) text = text.replace(iconText, " ");
          return normalizeModelLabel(text);
        };
        const names = [modelName, ...(modelAliases || [])]
          .map(normalizeModelLabel)
          .filter(Boolean);
        const currentModelText = readModelLabel(button);
        const alreadyApplied = names.includes(currentModelText);
        if (!alreadyApplied) {
          simulateClick2(button);
          await sleep2(getSettingsStepDelay2());
          const panel = _q2("model_picker_panel");
          const itemSelector = _selStr2("model_picker_item");
          if (!panel || !itemSelector) {
            console.warn(
              `[applySettings:v2] model panel/items missing for requested model: ${modelName}`,
            );
            throw new Error(`MODEL_OPTION_NOT_FOUND: ${modelName}`);
          } else {
            const item = Array.from(panel.querySelectorAll(itemSelector)).find(
              (el) => names.includes(readModelLabel(el)),
            );
            if (
              !item ||
              item.disabled ||
              item.getAttribute("aria-disabled") === "true"
            ) {
              console.warn(
                `[applySettings:v2] requested model unavailable: ${modelName}`,
              );
              throw new Error(`MODEL_OPTION_NOT_FOUND: ${modelName}`);
            } else {
              simulateClick2(item);
              await sleep2(getSettingsStepDelay2());
              const itemCfg = _getDynamicSelector2("model_picker_item");
              const selectedOwner = itemCfg?.selected_owner
                ? item.closest(itemCfg.selected_owner)
                : item;
              let modelApplied =
                selectedOwner?.classList.contains(
                  itemCfg?.class_selected || "",
                ) || false;
              for (
                let waited = 0;
                !modelApplied && waited < 2e3;
                waited += 100
              ) {
                await sleep2(100);
                const liveButton =
                  _q2("model_picker_button", _getActiveSettingsPanel2()) ||
                  button;
                const triggerText = readModelLabel(liveButton);
                modelApplied = names.includes(triggerText);
              }
              if (!modelApplied) {
                throw new Error(`MODEL_OPTION_NOT_APPLIED:${modelName}`);
              }
            }
          }
        }
      }
    }
    if (isVideo && flowVideoResolution) {
      const wantedResolution = [
        flowVideoResolution,
        flowVideoResolutionDomValue,
      ]
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      const readResolution = (el, cfg) => {
        const label = cfg.label_selector
          ? el.querySelector(cfg.label_selector)
          : el;
        return String(label?.textContent || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
      };
      await selectRadio(
        "video_resolution_tab",
        (el, cfg) => wantedResolution.includes(readResolution(el, cfg)),
        {
          allowAbsentGroup: true,
          isGroupCandidate: (el, cfg) =>
            /^\d{3,4}p$/i.test(readResolution(el, cfg)),
        },
      );
    }
    if (isVideo && flowVideoDuration && !skipFlowDurationControl) {
      const seconds = parseInt(flowVideoDuration, 10);
      const readDurationSeconds = (el, cfg) => {
        const label =
          (cfg?.label_selector
            ? el?.querySelector(cfg.label_selector)
            : null) || el;
        const text = String(label?.textContent || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        const match = text.match(/^(\d{1,2})[\p{L}\p{M}.]*$/u);
        return match ? Number(match[1]) : null;
      };
      await selectRadio(
        "video_duration_tab",
        (el, cfg) => readDurationSeconds(el, cfg) === seconds,
        {
          allowAbsentGroup: true,
          isGroupCandidate: (el, cfg) => readDurationSeconds(el, cfg) !== null,
        },
      );
    }
    const closeSettingsPanel = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const panel = _getActiveSettingsPanel2();
        if (!panel || panel === document) return true;
        const esc = () =>
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true,
          });
        try {
          panel.dispatchEvent(esc());
        } catch (_) {}
        try {
          document.dispatchEvent(esc());
        } catch (_) {}
        try {
          document.body.dispatchEvent(esc());
        } catch (_) {}
        await sleep2(120);
        if (_getActiveSettingsPanel2() === document) return true;
      }
      const liveTrigger = getSettingsButton2(getSubmitButton2());
      if (liveTrigger) {
        simulateClick2(liveTrigger);
        await sleep2(getSettingsStepDelay2());
      }
      return _getActiveSettingsPanel2() === document;
    };
    if (!(await closeSettingsPanel()))
      throw new Error("V2_SETTINGS_PANEL_CLOSE_FAILED");
    console.log("[applySettings:v2] settings panel closed and verified");
    return { success: true };
  }
  async function applySettings(
    genType,
    aspectRatio,
    modelName,
    isFrames = false,
    quantity = 1,
    flowVideoDuration = null,
    modelAliases = [],
    flowVideoResolution = null,
    flowVideoResolutionDomValue = null,
    skipFlowDurationControl = false,
  ) {
    if (_flowPageContext?.driverKey === "flow_v2") {
      try {
        return await _applyFlowV2Settings(
          genType,
          aspectRatio,
          modelName,
          isFrames,
          quantity,
          flowVideoDuration,
          modelAliases,
          flowVideoResolution,
          flowVideoResolutionDomValue,
          skipFlowDurationControl,
        );
      } catch (error) {
        const code = String(error?.message || "");
        const isModelContractError = /^(?:V2_MODEL_|MODEL_OPTION_)/.test(code);
        const isModeContractError = /^V2_MODE_/.test(code);
        if (
          !isModelContractError &&
          !isModeContractError &&
          !/^(?:V2_SETTINGS_|V2_SETTING_(?:OPTION_NOT_FOUND|NOT_APPLIED):)/.test(
            code,
          )
        )
          throw error;
        console.warn(
          "[applySettings:v2] settings DOM incompatible \u2014 bypassing settings for this prompt:",
          code,
        );
        for (let attempt = 0; attempt < 3; attempt++) {
          const panel = _getActiveSettingsPanel2();
          if (!panel || panel === document) break;
          const esc = new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true,
          });
          try {
            panel.dispatchEvent(esc);
          } catch (_) {}
          try {
            document.dispatchEvent(esc);
          } catch (_) {}
          await sleep2(120);
        }
        const remainingPanel = _getActiveSettingsPanel2();
        if (remainingPanel && remainingPanel !== document) {
          const trigger = getSettingsButton2(getSubmitButton2());
          if (trigger) {
            simulateClick2(trigger);
            await sleep2(getSettingsStepDelay2());
          }
        }
        if (isModelContractError || isModeContractError) {
          console.warn(
            "[applySettings:v2] requested model/mode not verified \u2014 failing prompt before submit",
            {
              requestedModel: modelName || null,
              reason: code,
              panelClosed: _getActiveSettingsPanel2() === document,
            },
          );
          throw error;
        }
        console.warn(
          "[applySettings:v2] continuing with current Flow settings",
          {
            requestedGenType: genType || null,
            requestedModel: modelName || null,
            requestedRatio: aspectRatio || null,
            requestedQuantity: quantity || 1,
            requestedDuration: flowVideoDuration || null,
            requestedResolution: flowVideoResolution || null,
            panelClosed: _getActiveSettingsPanel2() === document,
          },
        );
        return { success: true, bypassed: true, reason: code };
      }
    }
    console.log(
      `[applySettings] CALLED with: genType="${genType}", aspectRatio="${aspectRatio}", modelName="${modelName}", isFrames=${isFrames} (typeof ${typeof isFrames}), quantity=${quantity}, flowVideoDuration=${flowVideoDuration}`,
    );
    sendLog2(
      `\u2699\uFE0F \u0110ang thi\u1EBFt l\u1EADp c\u1EA5u h\xECnh: ${genType}, ${aspectRatio}, ${modelName}, isFrames=${isFrames}, x${quantity}${flowVideoDuration ? ", " + flowVideoDuration : ""}`,
    );
    const PRESUBMIT_COOLDOWN_MS = 5e3;
    const _presubmitLastRun = window._tobyAgentChainLastRunAt || 0;
    const _presubmitSince = Date.now() - _presubmitLastRun;
    const _skipPresubmitGuard = _presubmitSince < PRESUBMIT_COOLDOWN_MS;
    let _anyAgentActioned = false;
    if (_skipPresubmitGuard) {
      console.log(
        `[applySettings] Pre-submit guard SKIPPED (chain ran ${Math.round(_presubmitSince / 1e3)}s ago)`,
      );
    } else {
      try {
        const d = _isFlowAgentInstructionDialogOpen2();
        const p = _isFlowChatAgentPanelOpen2();
        const a = _isFlowAgentModeOn2();
        console.log("[applySettings] Pre-submit guard state:", {
          instructionDialog: d.open
            ? "OPEN"
            : d.found
              ? "closed"
              : "NO-BUTTON-ON-DOM",
          chatPanel: p.open ? "OPEN" : p.found ? "closed" : "NO-BUTTON-ON-DOM",
          agentToggle: a.on ? "ON" : a.found ? "OFF" : "NO-BUTTON-ON-DOM",
        });
      } catch (e) {
        console.warn("[applySettings] State probe failed:", e.message);
      }
      try {
        const dialogState = _isFlowAgentInstructionDialogOpen2();
        if (dialogState.found && dialogState.open) {
          const openMsg =
            window.I18n?.t?.("flow.agentInstructionDialogOpenTitle") ||
            '"Instructions for agent" dialog is open \u2014 auto-clicking "Done" before gen';
          sendLog2("\u26A0 " + openMsg, "warn");
          const r = await _ensureFlowAgentInstructionDone();
          if (r.success) {
            const okMsg =
              window.I18n?.t?.("flow.agentInstructionAutoDone") ||
              "Agent instruction dialog closed";
            sendLog2("\u2713 " + okMsg, "info");
            if (r.wasOpen) _anyAgentActioned = true;
          } else {
            const failMsg =
              window.I18n?.t?.("flow.agentInstructionDoneFailed") ||
              'Could not close instruction dialog \u2014 please click the "Done" button manually';
            sendLog2("\u2717 " + failMsg, "error");
          }
        }
      } catch (e) {
        console.warn(
          "[applySettings] _ensureFlowAgentInstructionDone failed:",
          e.message,
        );
      }
      let _chatPanelActioned = false;
      try {
        const panelState = _isFlowChatAgentPanelOpen2();
        if (panelState.found && panelState.open) {
          const openMsg =
            window.I18n?.t?.("flow.chatAgentPanelOpenTitle") ||
            "Chat agent panel is open \u2014 auto-closing before gen";
          sendLog2("\u26A0 " + openMsg, "warn");
          const r = await _ensureFlowChatAgentClosed();
          if (r.success) {
            const okMsg =
              window.I18n?.t?.("flow.chatAgentAutoClosed") ||
              "Chat agent panel closed";
            sendLog2("\u2713 " + okMsg, "info");
            if (r.wasOpen) {
              _anyAgentActioned = true;
              _chatPanelActioned = true;
            }
          } else {
            const failMsg =
              window.I18n?.t?.("flow.chatAgentCloseFailed") ||
              'Could not close chat agent panel \u2014 please click the "Close" button manually';
            sendLog2("\u2717 " + failMsg, "error");
          }
        }
      } catch (e) {
        console.warn(
          "[applySettings] _ensureFlowChatAgentClosed failed:",
          e.message,
        );
      }
      if (_chatPanelActioned) {
        await sleep2(800);
        try {
          const reVerify = _isFlowChatAgentPanelOpen2();
          if (reVerify.found && reVerify.open) {
            sendLog2(
              "\u26A0 Panel re-render sau close \u2014 \u0111\xF3ng l\u1EA1i tr\u01B0\u1EDBc khi t\u1EAFt Agent",
              "warn",
            );
            await _ensureFlowChatAgentClosed();
            await sleep2(500);
          }
        } catch (_) {}
      }
      try {
        const agentState = _isFlowAgentModeOn2();
        if (agentState.found && agentState.on) {
          const onMsg =
            window.I18n?.t?.("flow.agentModeOnTitle") || "Agent mode is ON";
          sendLog2("\u26A0 " + onMsg, "warn");
          const r = await _ensureFlowAgentModeOff();
          if (r.success) {
            const okMsg =
              window.I18n?.t?.("flow.agentModeAutoDisabled") ||
              "Agent mode auto-disabled (Flow update enables it by default for new users)";
            sendLog2("\u2713 " + okMsg, "info");
            if (r.wasOn) _anyAgentActioned = true;
          } else {
            const failMsg =
              window.I18n?.t?.("flow.agentModeDisableFailed") ||
              'Could not disable Agent mode \u2014 please click the "Agent" button manually';
            sendLog2("\u2717 " + failMsg, "error");
          }
        }
      } catch (e) {
        console.warn(
          "[applySettings] _ensureFlowAgentModeOff failed:",
          e.message,
        );
      }
      if (_anyAgentActioned) {
        sendLog2(
          "\u23F3 \u0110\u1EE3i editor Flow re-render sau khi \u0111\xF3ng agent UI...",
          "info",
        );
        const editorReady = await _waitForFlowEditorReady(5e3);
        if (editorReady) {
          sendLog2(
            "\u2713 Editor Flow ready (sau " + editorReady + "ms)",
            "info",
          );
        } else {
          sendLog2(
            "\u26A0 Editor Flow ch\u01B0a ready sau 5s \u2014 v\u1EABn ti\u1EBFp t\u1EE5c (c\xF3 th\u1EC3 fail)",
            "warn",
          );
        }
      }
      window._tobyAgentChainLastRunAt = Date.now();
    }
    const current = readCurrentSettings2();
    let needModel = true;
    let needRatio = true;
    let needQuantity = true;
    const isVideoMode = genType.toLowerCase() === "video";
    if (!isVideoMode && !modelName) {
      needModel = false;
    }
    if (current) {
      let targetModel = modelName;
      const targetModelNames = [
        targetModel,
        ...(Array.isArray(modelAliases) ? modelAliases : []),
      ].filter(
        (v, i, arr) =>
          typeof v === "string" &&
          v.trim() &&
          arr.findIndex(
            (x) =>
              typeof x === "string" &&
              x.trim().toLowerCase() === v.trim().toLowerCase(),
          ) === i,
      );
      console.log(
        `[applySettings] current.model="${current.model}", targetModel="${targetModel}"`,
      );
      let modelMatches = false;
      if (isVideoMode) {
        if (current.model && targetModel) {
          const currentLower = current.model.toLowerCase();
          modelMatches = targetModelNames.some((name) => {
            const targetLower = name.toLowerCase();
            return (
              currentLower.includes(targetLower) ||
              targetLower.includes(currentLower)
            );
          });
          console.log(
            `[applySettings] Video mode: comparing "${currentLower}" with aliases [${targetModelNames.join(", ")}] \u2192 match=${modelMatches}`,
          );
        }
      } else if (current.model && targetModel) {
        const _strip = (s) =>
          s.replace(/^[\u{1F000}-\u{1FFFF}]\s*/u, "").trim();
        const currentNormalized = _strip(current.model.toLowerCase());
        modelMatches = targetModelNames.some(
          (name) => currentNormalized === _strip(name.toLowerCase()),
        );
      }
      if (modelMatches && !isVideoMode) {
        needModel = false;
        console.log(
          `[applySettings] Skipping model change - already ${targetModel}`,
        );
      }
      const targetRatioIcon = ratioToIconName2(aspectRatio);
      if (targetRatioIcon && current.ratioIcon === targetRatioIcon) {
        needRatio = false;
      }
      if (current.quantity === quantity) {
        needQuantity = false;
      }
      if (!needModel && !needRatio && !needQuantity) {
        sendLog2(
          "\u2699\uFE0F Model/Ratio/Quantity \u0111\xE3 \u0111\xFAng, ch\u1EC9 verify genType",
          "info",
        );
      }
      const changes = [];
      if (needModel) changes.push("model");
      if (needRatio) changes.push("ratio");
      if (needQuantity) changes.push("quantity");
      sendLog2(
        `\u2699\uFE0F C\u1EA7n thay \u0111\u1ED5i: ${changes.join(", ")}`,
        "info",
      );
    }
    const submitBtn = getSubmitButton2();
    if (!submitBtn) {
      sendLog2(
        "\u274C Kh\xF4ng t\xECm th\u1EA5y n\xFAt Submit \u0111\u1EC3 m\u1EDF Settings.",
        "error",
      );
      return;
    }
    const settingsBtn = getSettingsButton2(submitBtn);
    if (!settingsBtn) {
      sendLog2("\u274C Kh\xF4ng t\xECm th\u1EA5y n\xFAt Settings.", "error");
      return;
    }
    const _existingPanel = _getActiveSettingsPanel2();
    const _spmSel = _selStr2("settings_panel_marker");
    const _panelAlreadyOpen =
      _existingPanel !== document &&
      !!_spmSel &&
      !!_existingPanel.querySelector(_spmSel);
    if (_panelAlreadyOpen) {
      console.log(
        "[applySettings] Settings panel \u0111\xE3 m\u1EDF \u2014 skip click settings button",
      );
      sendLog2(
        "\u2699\uFE0F Settings panel \u0111\xE3 m\u1EDF s\u1EB5n \u2014 skip toggle",
        "info",
      );
    } else {
      simulateClick2(settingsBtn);
      await sleep2(getSettingsStepDelay2());
    }
    const _findByIdSuffix = (scope, suffix) => {
      const selector = _buildRadixTriggerSelector2(suffix);
      return selector ? scope.querySelector(selector) : null;
    };
    const settingsPanel = _getActiveSettingsPanel2();
    console.log(
      `[applySettings] settings panel: ${settingsPanel === document ? "document (no popup yet)" : "popup"}`,
    );
    let typeClicked = false;
    const typeSuffix = genType.toLowerCase() === "video" ? "VIDEO" : "IMAGE";
    const typeKey =
      genType.toLowerCase() === "video" ? "mode_tab_video" : "mode_tab_image";
    let typeBtn = null;
    const _typeDynCfg = _getDynamicSelector2(typeKey);
    const _typeIsDynamic = _typeDynCfg?.selectors?.length > 0;
    const _typeTrySelectors = _typeIsDynamic ? _typeDynCfg.selectors : [];
    if (!_typeIsDynamic) {
      console.debug(
        `[Tier3] applySettings type: ${typeKey} config miss, fallback _findByIdSuffix`,
      );
    }
    const _findConfiguredTypeButton = () => {
      const livePanel = _getActiveSettingsPanel2();
      const scopes =
        livePanel !== document ? [livePanel, document] : [document];
      for (const scope of scopes) {
        for (const sel of _typeTrySelectors) {
          try {
            const candidates = Array.from(scope.querySelectorAll(sel));
            const semantic = _typeDynCfg?.icon_text
              ? candidates.find(
                  (candidate) =>
                    _findIconInElement2(candidate)?.textContent?.trim() ===
                    _typeDynCfg.icon_text,
                )
              : candidates[0];
            if (semantic) return { button: semantic, selector: sel };
          } catch (_) {}
        }
      }
      return null;
    };
    const _typeDeadline = Date.now() + 2500;
    do {
      const match = _findConfiguredTypeButton();
      if (match) {
        typeBtn = match.button;
        console.log(
          `[applySettings] Found type button via \u{1F310} DYNAMIC selector: ${match.selector}`,
        );
        break;
      }
      await sleep2(100);
    } while (Date.now() < _typeDeadline);
    if (!typeBtn) {
      typeBtn = _findByIdSuffix(settingsPanel, typeSuffix);
      if (!typeBtn && settingsPanel !== document)
        typeBtn = _findByIdSuffix(document, typeSuffix);
    }
    if (typeBtn) {
      console.log(
        `[applySettings] Found type button via ID suffix: -trigger-${typeSuffix}, aria-selected=${typeBtn.getAttribute("aria-selected")}`,
      );
      simulateClick2(typeBtn);
      await sleep2(getSettingsStepDelay2());
      typeClicked = true;
      sendLog2(
        `\u2713 Type clicked via ID suffix: -trigger-${typeSuffix}`,
        "info",
      );
    } else {
      console.log(
        `[applySettings] Type button NOT found via ID suffix: -trigger-${typeSuffix}`,
      );
    }
    if (!typeClicked) {
      console.log(
        `[applySettings] Trying Strategy 2: text matching for genType="${genType}"`,
      );
      const tabSelector = _selStr2("tab_button_generic");
      if (!tabSelector) console.debug("[Tier3] tab_button_generic config miss");
      let allTabs = tabSelector
        ? settingsPanel.querySelectorAll(tabSelector)
        : [];
      if (allTabs.length === 0 && settingsPanel !== document && tabSelector) {
        allTabs = document.querySelectorAll(tabSelector);
      }
      console.log(`[applySettings] Found ${allTabs.length} tabs to search`);
      for (let t of allTabs) {
        let textLower = t.textContent.trim().toLowerCase();
        let targetLower = genType.toLowerCase();
        if (
          textLower === targetLower ||
          (targetLower === "video" && textLower.includes("video")) ||
          (targetLower === "image" &&
            (textLower.includes("\u1EA3nh") ||
              textLower.includes("image") ||
              textLower.includes("h\xECnh")))
        ) {
          console.log(
            `[applySettings] Found type tab by text: "${textLower}", aria-selected=${t.getAttribute("aria-selected")}`,
          );
          simulateClick2(t);
          await sleep2(getSettingsStepDelay2());
          typeClicked = true;
          sendLog2(`\u2713 Type clicked via text: ${textLower}`, "info");
          break;
        }
      }
      if (!typeClicked) {
        console.log(
          `[applySettings] WARNING: Could not find type tab for genType="${genType}"`,
        );
        sendLog2(
          `\u274C Kh\xF4ng t\xECm th\u1EA5y tab ${genType} trong menu Settings`,
          "error",
        );
        throw new Error(`MODE_TAB_NOT_FOUND:${genType}`);
      }
    }
    if (needRatio) {
      const targetRatioIcon = ratioToIconName2(aspectRatio);
      const _ratioToIdSuffix = (ratio) => {
        const r = String(ratio).trim().toLowerCase();
        if (r === "d\u1ECDc" || r === "9:16" || r === "story")
          return "PORTRAIT";
        if (r === "ngang" || r === "16:9" || r === "widescreen")
          return "LANDSCAPE";
        if (r === "vu\xF4ng" || r === "1:1" || r === "square") return "SQUARE";
        if (r === "4:3" || r === "landscape") return "LANDSCAPE_4_3";
        if (r === "3:4" || r === "portrait") return "PORTRAIT_3_4";
        return null;
      };
      const activeMenu = _getActiveSettingsPanel2();
      let ratioClicked = false;
      const ratioSuffix = _ratioToIdSuffix(aspectRatio);
      if (ratioSuffix) {
        const ratioBtn = _findByIdSuffix(activeMenu, ratioSuffix);
        if (ratioBtn) {
          simulateClick2(ratioBtn);
          await sleep2(getSettingsStepDelay2());
          ratioClicked = true;
          sendLog2(
            `\u2713 Ratio clicked via ID suffix: -trigger-${ratioSuffix}`,
            "info",
          );
        }
      }
      if (!ratioClicked && targetRatioIcon) {
        const iconButtons = activeMenu.querySelectorAll("button");
        for (const btn of iconButtons) {
          const icon = _findIconInElement2(btn);
          if (icon && icon.textContent.trim() === targetRatioIcon) {
            simulateClick2(btn);
            await sleep2(getSettingsStepDelay2());
            ratioClicked = true;
            sendLog2(
              `\u2713 Ratio clicked via icon: ${targetRatioIcon}`,
              "info",
            );
            break;
          }
        }
      }
      if (!ratioClicked && targetRatioIcon) {
        const allButtons = activeMenu.querySelectorAll("button");
        for (const btn of allButtons) {
          const btnText = btn.textContent.trim().toLowerCase();
          if (btnText.includes(targetRatioIcon)) {
            simulateClick2(btn);
            await sleep2(getSettingsStepDelay2());
            ratioClicked = true;
            sendLog2(
              `\u2713 Ratio clicked via text: ${targetRatioIcon}`,
              "info",
            );
            break;
          }
        }
      }
      if (!ratioClicked) {
        const tabSelector = _selStr2("tab_button_generic");
        if (!tabSelector)
          console.debug("[Tier3] tab_button_generic config miss");
        const updatedTabs = tabSelector
          ? activeMenu.querySelectorAll(tabSelector)
          : [];
        for (let t of updatedTabs) {
          let textLower = t.textContent.trim().toLowerCase();
          let ratioLower = String(aspectRatio).trim().toLowerCase();
          if (
            textLower.includes(ratioLower) ||
            (targetRatioIcon && textLower.includes(targetRatioIcon)) ||
            (ratioLower === "ngang" &&
              (textLower.includes("landscape") ||
                textLower.includes("16_9") ||
                textLower.includes("16:9"))) ||
            (ratioLower === "d\u1ECDc" &&
              (textLower.includes("portrait") ||
                textLower.includes("9_16") ||
                textLower.includes("9:16")))
          ) {
            simulateClick2(t);
            await sleep2(getSettingsStepDelay2());
            sendLog2(`\u2713 Ratio clicked via tab: ${textLower}`, "info");
            break;
          }
        }
      }
    }
    if (needQuantity && quantity >= 1 && quantity <= 4) {
      let quantityClicked = false;
      const quantityBtn = _findByIdSuffix(document, String(quantity));
      if (quantityBtn) {
        simulateClick2(quantityBtn);
        await sleep2(getSettingsStepDelay2());
        quantityClicked = true;
        sendLog2(
          `\u2713 Quantity clicked via ID suffix: -trigger-${quantity}`,
          "info",
        );
      }
      if (!quantityClicked) {
        const tabSelector = _selStr2("tab_button_generic");
        if (!tabSelector)
          console.debug("[Tier3] tab_button_generic config miss");
        const quantityTabs = tabSelector
          ? document.querySelectorAll(tabSelector)
          : [];
        for (let t of quantityTabs) {
          let text = t.textContent.trim();
          if (text === `x${quantity}`) {
            simulateClick2(t);
            await sleep2(getSettingsStepDelay2());
            break;
          }
        }
      }
    }
    let targetModelName = modelName;
    const videoInputType = isVideoMode
      ? isFrames
        ? "Frames"
        : "Ingredients"
      : null;
    const actualVideoModel = isVideoMode ? modelName : null;
    if (isVideoMode) {
      targetModelName = videoInputType;
      console.log(
        `[applySettings] Video mode: inputType=${videoInputType}, actualModel=${actualVideoModel}`,
      );
    }
    console.log(
      `[applySettings] needModel=${needModel}, isVideoMode=${isVideoMode}, isFrames=${isFrames}, targetModelName="${targetModelName}", actualVideoModel="${actualVideoModel}"`,
    );
    if (isVideoMode && needModel) {
      const activeMenu = _getActiveSettingsPanel2();
      let videoModeClicked = false;
      const _framesConfig = _getDynamicSelector2("video_mode_frames");
      const _ingredientsConfig = _getDynamicSelector2("video_mode_ingredients");
      const _framesTextMatch = _cfgList2(_framesConfig?.text_match);
      const _ingredientsTextMatch = _cfgList2(_ingredientsConfig?.text_match);
      const _targetLower = targetModelName.toLowerCase();
      const isFramesTarget = _framesTextMatch.some((t) =>
        _targetLower.includes(t.toLowerCase()),
      );
      const searchTerms = isFramesTarget
        ? _framesTextMatch
        : _ingredientsTextMatch;
      const ariaControlsMatch = isFramesTarget
        ? "VIDEO_FRAMES"
        : "VIDEO_REFERENCES";
      const videoModeSuffix = isFramesTarget
        ? "VIDEO_FRAMES"
        : "VIDEO_REFERENCES";
      console.log(
        `[applySettings] Video mode: looking for ${targetModelName} with ID suffix: -trigger-${videoModeSuffix}`,
      );
      const _vmKey = isFramesTarget
        ? "video_mode_frames"
        : "video_mode_ingredients";
      const _vmDefaults = [_buildRadixTriggerSelector2(videoModeSuffix)].filter(
        Boolean,
      );
      const _vmDynCfg = _getDynamicSelector2(_vmKey);
      const _vmIsDynamic = _vmDynCfg?.selectors?.length > 0;
      const _vmTrySelectors = _vmIsDynamic ? _vmDynCfg.selectors : _vmDefaults;
      let videoModeBtn = null;
      for (const sel of _vmTrySelectors) {
        try {
          videoModeBtn = activeMenu.querySelector(sel);
          if (videoModeBtn) {
            console.log(
              `[applySettings] Video mode: found via ${_vmIsDynamic ? "\u{1F310} DYNAMIC" : "\u{1F4E6} DEFAULT"} selector: ${sel}`,
            );
            break;
          }
        } catch (_) {}
      }
      if (!videoModeBtn) {
        videoModeBtn = _findByIdSuffix(activeMenu, videoModeSuffix);
      }
      if (videoModeBtn) {
        console.log(
          `[applySettings] Video mode: clicking via ID suffix -trigger-${videoModeSuffix}`,
        );
        simulateClick2(videoModeBtn);
        await sleep2(getSettingsStepDelay2());
        videoModeClicked = true;
        sendLog2(
          `\u2713 Video mode: ch\u1ECDn ${targetModelName} (${_vmIsDynamic ? "dynamic" : "default"})`,
          "info",
        );
      }
      const tabSelector = _selStr2("tab_button_generic");
      if (!tabSelector) console.debug("[Tier3] tab_button_generic config miss");
      if (!videoModeClicked) {
        const tabs = tabSelector
          ? activeMenu.querySelectorAll(tabSelector)
          : [];
        for (const tab of tabs) {
          const ariaControls = tab.getAttribute("aria-controls") || "";
          if (ariaControls.includes(ariaControlsMatch)) {
            console.log(
              `[applySettings] Video mode: clicking tab via aria-controls="${ariaControls}"`,
            );
            simulateClick2(tab);
            await sleep2(getSettingsStepDelay2());
            videoModeClicked = true;
            sendLog2(
              `\u2713 Video mode: ch\u1ECDn ${targetModelName} (aria)`,
              "info",
            );
            break;
          }
        }
      }
      if (!videoModeClicked) {
        const tabs = activeMenu.querySelectorAll(tabSelector);
        console.log(
          `[applySettings] Video mode Strategy 3: searching ${tabs.length} tabs by text`,
        );
        for (const tab of tabs) {
          const tabText = tab.textContent.trim().toLowerCase();
          for (const term of searchTerms) {
            if (tabText === term || tabText.includes(term)) {
              console.log(
                `[applySettings] Video mode: clicking tab "${tabText}" for ${targetModelName}`,
              );
              simulateClick2(tab);
              await sleep2(getSettingsStepDelay2());
              videoModeClicked = true;
              sendLog2(
                `\u2713 Video mode: ch\u1ECDn ${targetModelName} (tab)`,
                "info",
              );
              break;
            }
          }
          if (videoModeClicked) break;
        }
      }
      if (!videoModeClicked) {
        const allButtons = activeMenu.querySelectorAll("button");
        console.log(
          `[applySettings] Video mode Strategy 4: searching ${allButtons.length} buttons`,
        );
        for (const btn of allButtons) {
          const btnText = btn.textContent.trim().toLowerCase();
          for (const term of searchTerms) {
            if (btnText === term || btnText.includes(term)) {
              console.log(
                `[applySettings] Video mode: clicking button "${btnText}" for ${targetModelName}`,
              );
              simulateClick2(btn);
              await sleep2(getSettingsStepDelay2());
              videoModeClicked = true;
              sendLog2(
                `\u2713 Video mode: ch\u1ECDn ${targetModelName} (button)`,
                "info",
              );
              break;
            }
          }
          if (videoModeClicked) break;
        }
      }
      if (videoModeClicked) {
        if (actualVideoModel) {
          await sleep2(getSettingsStepDelay2());
          targetModelName = actualVideoModel;
          needModel = true;
          console.log(
            `[applySettings] Video input type selected, now selecting video model: ${actualVideoModel}`,
          );
        } else {
          needModel = false;
        }
      } else {
        console.error(
          `[applySettings] Video mode: "${targetModelName}" input type not found`,
        );
        sendLog2(
          `\u274C Kh\xF4ng t\xECm th\u1EA5y ch\u1EBF \u0111\u1ED9 video ${targetModelName} trong menu Settings`,
          "error",
        );
        throw new Error(`VIDEO_MODE_OPTION_NOT_FOUND:${targetModelName}`);
      }
    }
    if (needModel) {
      const menuSelector = '[role="menu"]';
      const _mpc = _getDynamicSelector2("model_picker_button");
      const modelBtnSelector = _mpc?.selectors?.[0];
      if (!modelBtnSelector) console.debug("[Tier3] model_picker_button miss");
      const modelItemsSelector =
        'button, [role="menuitem"], [role="menuitemradio"]';
      const activeSettingsPanel = _getActiveSettingsPanel2();
      let modelBtn = null;
      let modelSelectionSucceeded = false;
      if (modelBtnSelector) {
        modelBtn = activeSettingsPanel.querySelector(modelBtnSelector);
        if (modelBtn) {
          console.log(
            `[applySettings] Found model button in settings panel scope`,
          );
        } else {
          const menus = document.querySelectorAll(menuSelector);
          console.log(
            `[applySettings] Found ${menus.length} menus for model button fallback`,
          );
          if (menus.length > 0) {
            const activeMenu = menus[menus.length - 1];
            modelBtn = activeMenu.querySelector(modelBtnSelector);
            if (modelBtn) {
              console.log(`[applySettings] Found model button in menu scope`);
            }
          }
        }
      }
      if (modelBtn) {
        console.log(`[applySettings] Clicking model button to open dropdown`);
        simulateClick2(modelBtn);
        await sleep2(getSettingsStepDelay2());
        const allMenus2 = document.querySelectorAll(menuSelector);
        console.log(
          `[applySettings] After click, found ${allMenus2.length} menus`,
        );
        if (allMenus2.length > 0) {
          const dropdown = allMenus2[allMenus2.length - 1];
          const items = dropdown.querySelectorAll(modelItemsSelector);
          const availableItems = Array.from(items).map((i) =>
            i.textContent.trim().toLowerCase(),
          );
          console.log(
            `[applySettings] Model dropdown items: [${availableItems.join(", ")}], looking for: "${targetModelName}" (targetText="${String(targetModelName).toLowerCase().trim()}")`,
          );
          console.log(
            `[applySettings] isFrames parameter received: ${isFrames}, typeof: ${typeof isFrames}`,
          );
          const _framesMatch = _cfgList2(
            _getDynamicSelector2("video_mode_frames")?.text_match,
          );
          const _ingredientsMatch = _cfgList2(
            _getDynamicSelector2("video_mode_ingredients")?.text_match,
          );
          const _exactMatchNames = [..._framesMatch, ..._ingredientsMatch].map(
            (t) => t.toLowerCase(),
          );
          const _stripLeadEmoji = (s) =>
            s.replace(/^[\u{1F000}-\u{1FFFF}]\s*/u, "").trim();
          const targetTexts = [
            targetModelName,
            ...(Array.isArray(modelAliases) ? modelAliases : []),
          ]
            .filter((v) => typeof v === "string" && v.trim())
            .map((v) => _stripLeadEmoji(v.toLowerCase().trim()))
            .filter((v, i, arr) => arr.indexOf(v) === i);
          const targetText = targetTexts[0] || "";
          const _needsExactMatch = targetTexts.some((name) =>
            _exactMatchNames.includes(name),
          );
          let _clickedModel = false;
          for (let item of items) {
            const matchedName = targetTexts.find(
              (name) =>
                _stripLeadEmoji(item.textContent.toLowerCase().trim()) === name,
            );
            if (matchedName) {
              console.log(
                `[applySettings] Clicking model item (exact): "${matchedName}"`,
              );
              simulateClick2(item);
              await sleep2(getSettingsStepDelay2());
              _clickedModel = true;
              modelSelectionSucceeded = true;
              break;
            }
          }
          if (!_clickedModel && !_needsExactMatch) {
            for (let item of items) {
              const domText = item.textContent.toLowerCase().trim();
              const matchedName = targetTexts.find((name) =>
                domText.includes(name),
              );
              if (!matchedName) continue;
              if (
                matchedName.includes("veo") &&
                domText.includes("veo") &&
                ((matchedName.includes("fast") && !domText.includes("fast")) ||
                  (matchedName.includes("quality") &&
                    !domText.includes("quality")))
              ) {
                continue;
              }
              console.log(
                `[applySettings] Clicking model item (partial): domText="${domText}", targetText="${matchedName}"`,
              );
              simulateClick2(item);
              await sleep2(getSettingsStepDelay2());
              _clickedModel = true;
              modelSelectionSucceeded = true;
              break;
            }
          }
        }
      } else {
        console.warn(
          `[applySettings] Model button not found for "${targetModelName}"`,
        );
      }
      if (!modelSelectionSucceeded) {
        throw new Error(`MODEL_OPTION_NOT_FOUND: ${targetModelName}`);
      }
    }
    console.log(
      `[applySettings] Video duration check: isVideoMode=${isVideoMode}, flowVideoDuration="${flowVideoDuration}" (type: ${typeof flowVideoDuration})`,
    );
    if (isVideoMode && flowVideoDuration && !skipFlowDurationControl) {
      const _durCfg = _getDynamicSelector2("video_duration_tab");
      const _durSelectors = _durCfg?.selectors || [];
      const _durTextMatch = _cfgList2(_durCfg?.text_match);
      if (!_durTextMatch.length) _durTextMatch.push("4s", "6s", "8s", "10s");
      const durationNum = parseInt(flowVideoDuration);
      const tryClickDuration = () => {
        const activeMenu = _getActiveSettingsPanel2();
        if (!activeMenu) return false;
        if (
          _durSelectors.length > 0 &&
          _durTextMatch.includes(flowVideoDuration)
        ) {
          for (const sel of _durSelectors) {
            try {
              for (const tab of activeMenu.querySelectorAll(sel)) {
                if ((tab.textContent || "").trim() !== flowVideoDuration)
                  continue;
                if (
                  tab.getAttribute("aria-selected") === "true" ||
                  tab.getAttribute("data-state") === "active"
                )
                  return true;
                simulateClick2(tab);
                sendLog2(`\u2713 Duration: ${flowVideoDuration}`, "info");
                return true;
              }
            } catch (_) {}
          }
        }
        if (!isNaN(durationNum)) {
          const btn = activeMenu.querySelector(
            `button[id$="-trigger-${durationNum}"]`,
          );
          if (btn) {
            if (
              btn.getAttribute("aria-selected") !== "true" &&
              btn.getAttribute("data-state") !== "active"
            ) {
              simulateClick2(btn);
              sendLog2(
                `\u2713 Duration: ${flowVideoDuration} (ID suffix)`,
                "info",
              );
            }
            return true;
          }
        }
        return false;
      };
      let durationClicked = false;
      for (let attempt = 0; attempt < 4 && !durationClicked; attempt++) {
        if (attempt > 0) await sleep2(400);
        durationClicked = tryClickDuration();
      }
      if (durationClicked) await sleep2(getSettingsStepDelay2());
      if (!durationClicked) {
        const menu = _getActiveSettingsPanel2() || document;
        const avail = [];
        menu
          .querySelectorAll('button[role="tab"], button[id*="-trigger-"]')
          .forEach((b) => {
            const t = (b.textContent || "").trim();
            if (/^\d+\s*s$/.test(t) || /-trigger-\d+$/.test(b.id || ""))
              avail.push(t || b.id);
          });
        console.log(
          `[applySettings] Duration ${flowVideoDuration} not found. Available: [${avail.join(", ")}]`,
        );
        sendLog2(
          `\u26A0\uFE0F Duration ${flowVideoDuration} kh\xF4ng c\xF3 trong panel (Flow h\u1ED7 tr\u1EE3: ${avail.filter(Boolean).join(", ") || "N/A"})`,
          "warn",
        );
      }
    }
    if (isVideoMode && flowVideoResolution) {
      const resCfg = _getDynamicSelector2("video_resolution_tab");
      const selectors = resCfg?.selectors || [];
      if (!selectors.length)
        throw new Error("VIDEO_RESOLUTION_SELECTOR_MISSING");
      const panel = _getActiveSettingsPanel2();
      const wantedText = String(flowVideoResolution).trim().toLowerCase();
      const wantedDom = String(flowVideoResolutionDomValue || "").trim();
      let selected = false;
      for (const selector of selectors) {
        let tabs = [];
        try {
          tabs = Array.from(panel?.querySelectorAll(selector) || []);
        } catch (_) {
          continue;
        }
        const tab = tabs.find((el) => {
          const text = (el.textContent || "").trim().toLowerCase();
          const id = el.id || "";
          const controls = el.getAttribute("aria-controls") || "";
          return (
            text === wantedText ||
            (wantedDom &&
              (id.includes(wantedDom) || controls.includes(wantedDom)))
          );
        });
        if (!tab) continue;
        if (
          tab.getAttribute("aria-selected") !== "true" &&
          tab.getAttribute("data-state") !== "active"
        ) {
          simulateClick2(tab);
          await sleep2(getSettingsStepDelay2());
        }
        selected = true;
        sendLog2(
          `\u2713 Generation resolution: ${flowVideoResolution}`,
          "info",
        );
        break;
      }
      if (!selected)
        throw new Error(
          `VIDEO_RESOLUTION_OPTION_NOT_FOUND: ${flowVideoResolution}`,
        );
    }
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    simulateClick2(document.body);
  }
  async function addFileToPrompt(
    fileId,
    fileName,
    flowFileId,
    expectedMediaType = null,
    shouldAbort = null,
    scanOptions = {},
  ) {
    const _addRefStartedAt = Date.now();
    const _addRefLog = (stage, extra = "") => {
      const s = window._tobyFlowZoomSession;
      console.log(
        `[ADD_REF_AUDIT] ${stage} id=${String(fileId).substring(0, 18)} file_name=${fileName || "-"} elapsed=${Date.now() - _addRefStartedAt}ms zoomSession=${s?.active ? `active@${s.factor}` : s?.armed ? `armed@${s.factor}` : "none"}${extra ? ` ${extra}` : ""}`,
      );
    };
    const abortRequested = () =>
      typeof shouldAbort === "function" && shouldAbort();
    if (abortRequested()) return false;
    const nativeRef =
      _flowPageContext?.driverKey === "flow_v2" &&
      typeof _getObservedFlowMediaMetadata2 === "function"
        ? [fileName, flowFileId, fileId]
            .map((id) => _getObservedFlowMediaMetadata2(id))
            .find(Boolean)
        : null;
    const requestedUuid = [
      fileName,
      flowFileId,
      fileId,
      nativeRef?.media_uuid,
    ].find(
      (value) =>
        typeof value === "string" &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value),
    );
    const expectsVideo =
      String(expectedMediaType || "").toLowerCase() === "video";
    const isV2 = _flowPageContext?.driverKey === "flow_v2";
    const requestedVideoAsb =
      isV2 && expectsVideo
        ? [fileName, flowFileId, fileId, nativeRef?.persistent_media_id].find(
            (value) =>
              typeof value === "string" && _isFlowV2AsbIdentity2(value),
          )
        : null;
    const strictVideoIdentity =
      isV2 && expectsVideo && !!(requestedVideoAsb || requestedUuid);
    const matchesRequestedVideo = (tile) =>
      tile?.isConnected === true &&
      (!!requestedVideoAsb
        ? _flowV2OutputIdentityAliases2(tile).includes(requestedVideoAsb)
        : !!requestedUuid &&
          _flowV2OutputIdentityAliases2(tile).includes(requestedUuid));
    const strictImageIdentity = isV2 && !expectsVideo && !!requestedUuid;
    const matchesRequestedImage = (tile) => {
      if (tile?.isConnected !== true) return false;
      const own = _getPersistentMediaId2(tile);
      if (own === requestedUuid) return true;
      const native =
        typeof _getObservedFlowMediaMetadata2 === "function"
          ? _getObservedFlowMediaMetadata2(own)
          : null;
      return native?.type === "image" && native.media_uuid === requestedUuid;
    };
    _addRefLog(
      "start",
      `requested_uuid=${requestedUuid || "-"} video_asb=${requestedVideoAsb || "-"} strict_image=${strictImageIdentity}`,
    );
    if (
      isV2 &&
      String(expectedMediaType || "").toLowerCase() === "image" &&
      !requestedUuid
    ) {
      _addRefLog("failed", "reason=image_uuid_missing");
      return false;
    }
    if (document.visibilityState === "hidden") {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "ensureFlowTabActive" }, () =>
          resolve(),
        );
      });
      await sleep2(300);
    }
    if (flowFileId) {
      const tile = findTileByFileId2(flowFileId);
      if (tile) {
        fileId = _getTileRuntimeId2(tile);
      }
    }
    const resolveElements = () => {
      if (!isV2)
        return document.querySelectorAll(`div[data-tile-id="${fileId}"]`);
      if (strictImageIdentity) {
        const hinted = _getTileById2(requestedUuid);
        if (matchesRequestedImage(hinted)) return [hinted];
        const selector = _getTileSelectorString2();
        return selector
          ? Array.from(document.querySelectorAll(selector)).filter(
              matchesRequestedImage,
            )
          : [];
      }
      if (strictVideoIdentity) {
        const hinted = _getTileById2(
          requestedVideoAsb || requestedUuid || fileName || fileId,
        );
        if (matchesRequestedVideo(hinted)) return [hinted];
        const selector = _getTileSelectorString2();
        return selector
          ? Array.from(document.querySelectorAll(selector)).filter(
              matchesRequestedVideo,
            )
          : [];
      }
      const tile = _getTileById2(fileName || fileId) || _getTileById2(fileId);
      return tile ? [tile] : [];
    };
    let els = resolveElements();
    if (
      els.length > 0 &&
      fileName &&
      !strictImageIdentity &&
      !strictVideoIdentity
    ) {
      const tile = els[els.length - 1];
      const currentFn = _getPersistentMediaId2(tile) || extractFileName2(tile);
      if (currentFn && currentFn !== fileName) {
        console.log(
          `[TobyFlow] addFileToPrompt: tile_id ${fileId.substring(0, 20)}... exists but file_name mismatch (${currentFn.substring(0, 15)}... vs ${fileName.substring(0, 15)}...) \u2192 cross-project collision, finding by file_name`,
        );
        els = [];
      }
    }
    if (els.length === 0 && fileName) {
      const byName = resolveTileByFileName2(fileName);
      if (_getTileRuntimeId2(byName)) {
        const newId = _getTileRuntimeId2(byName);
        console.log(
          `[TobyFlow] addFileToPrompt: resolved ${fileId.substring(0, 20)}... \u2192 ${newId.substring(0, 20)}... via file_name`,
        );
        fileId = newId;
        els = resolveElements();
        _addRefLog(
          "filename_resolved",
          `resolved_id=${newId.substring(0, 18)}`,
        );
      }
    }
    if (els.length === 0 && typeof ensureFlowTilesLoaded === "function") {
      console.log(
        `[TobyFlow] addFileToPrompt: tile ch\u01B0a th\u1EA5y (id=${fileId.substring(0, 20)}...) \u2192 ensureFlowTilesLoaded + retry`,
      );
      const scanTarget =
        requestedVideoAsb || requestedUuid || fileName || flowFileId || fileId;
      try {
        await ensureFlowTilesLoaded(false, scanTarget ? [scanTarget] : [], {
          ...scanOptions,
          reason: "web_add_ref_target_missing",
          shouldAbort: abortRequested,
        });
      } catch (error) {
        if (
          error?.code === "FLOW_REF_SCAN_TIMEOUT" ||
          error?.name === "AbortError"
        )
          throw error;
      }
      if (abortRequested()) {
        _addRefLog("cancelled", "stage=target_scan");
        return false;
      }
      _addRefLog(
        "target_scan_done",
        `target=${scanTarget || "-"} elapsed_scan_ms=${Date.now() - _addRefStartedAt}`,
      );
      els = resolveElements();
      if (els.length === 0 && fileName) {
        const byNameRetry = resolveTileByFileName2(fileName);
        if (_getTileRuntimeId2(byNameRetry)) {
          const newId = _getTileRuntimeId2(byNameRetry);
          console.log(
            `[TobyFlow] addFileToPrompt: post-load resolved ${fileId.substring(0, 20)}... \u2192 ${newId.substring(0, 20)}... via file_name`,
          );
          fileId = newId;
          els = resolveElements();
          _addRefLog(
            "target_scan_resolved",
            `resolved_id=${newId.substring(0, 18)}`,
          );
        }
      }
    }
    if (els.length === 0) {
      _addRefLog("failed", "reason=tile_not_found");
      sendLog2(
        `\u26A0\uFE0F Kh\xF4ng t\xECm th\u1EA5y file c\xF3 ID: ${fileId} tr\xEAn m\xE0n h\xECnh.`,
        "warn",
      );
      return false;
    }
    let el = els[els.length - 1];
    if (abortRequested()) {
      _addRefLog("cancelled", "stage=before_context_lock");
      return false;
    }
    const _refLockQueuedAt = Date.now();
    _addRefLog(
      "context_lock_queued",
      `locked=${_ctxMenuLocked} queue_len=${_ctxMenuLockQueue.length}`,
    );
    if (!(await _acquireCtxMenuLock(abortRequested))) return false;
    _addRefLog(
      "context_lock_acquired",
      `wait_ms=${Date.now() - _refLockQueuedAt}`,
    );
    try {
      for (let refAttempt = 0; refAttempt < 3; refAttempt++) {
        if (abortRequested()) {
          _addRefLog("cancelled", "stage=context_menu");
          return false;
        }
        if (strictImageIdentity || strictVideoIdentity) {
          const live = resolveElements();
          el = live[live.length - 1];
          if (!el) {
            _addRefLog("failed", "reason=requested_media_not_mounted");
            return false;
          }
        }
        el.scrollIntoView({
          behavior: isV2 ? "instant" : "smooth",
          block: "center",
        });
        _addRefLog("scroll_into_view", `attempt=${refAttempt + 1}`);
        if (isV2) await Promise.resolve();
        else await sleep2(getInputTimeoutMs2());
        _addRefLog("scroll_settled", `attempt=${refAttempt + 1}`);
        if (strictImageIdentity && !matchesRequestedImage(el)) {
          _addRefLog(
            "identity_retry",
            `stage=after_scroll requested_uuid=${requestedUuid} attempt=${refAttempt + 1}`,
          );
          continue;
        }
        if (strictVideoIdentity && !matchesRequestedVideo(el)) {
          _addRefLog(
            "identity_retry",
            `stage=after_scroll requested_asb=${requestedVideoAsb || "-"} attempt=${refAttempt + 1}`,
          );
          continue;
        }
        _addRefLog(
          "before_context_menu",
          `requested_uuid=${requestedUuid || "-"} actual_identity=${_getPersistentMediaId2(el) || "-"}`,
        );
        const targetEl = isV2
          ? expectsVideo
            ? _q2("tile_video", el) ||
              _q2("tile_video_poster", el) ||
              _q2("tile_image", el) ||
              el
            : _q2("tile_image", el) || _q2("tile_video", el) || el
          : el.querySelector("img") || el.querySelector("a") || el;
        const contextSelector = _selStr2("context_menu");
        const visibleContextMenus = () =>
          contextSelector
            ? Array.from(document.querySelectorAll(contextSelector)).filter(
                (menu) => {
                  if (!menu?.isConnected) return false;
                  const rect = menu.getBoundingClientRect?.();
                  return !!rect && rect.width > 0 && rect.height > 0;
                },
              )
            : [];
        const contextMenusBefore = new Set(visibleContextMenus());
        const waitForNewContextMenus = async (timeoutMs) => {
          const readNewMenus = () =>
            visibleContextMenus().filter(
              (menu) => !contextMenusBefore.has(menu),
            );
          const alreadyOpen = readNewMenus();
          if (alreadyOpen.length) return alreadyOpen;
          return new Promise((resolve) => {
            let settled = false;
            let observer = null;
            const finish = (menus2) => {
              if (settled) return;
              settled = true;
              observer?.disconnect();
              clearTimeout(timer);
              resolve(menus2);
            };
            observer = new MutationObserver(() => {
              const menus2 = readNewMenus();
              if (menus2.length) finish(menus2);
            });
            observer.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ["class", "style", "hidden", "aria-hidden"],
            });
            const timer = setTimeout(() => finish(readNewMenus()), timeoutMs);
            const menus = readNewMenus();
            if (menus.length) finish(menus);
          });
        };
        simulateContextMenu2(targetEl);
        let newMenus = isV2
          ? await waitForNewContextMenus(getInputTimeoutMs2())
          : [];
        if (isV2)
          _addRefLog(
            "context_menu_wait_done",
            `menus=${newMenus.length} attempt=${refAttempt + 1}`,
          );
        if (isV2 && newMenus.length === 0) {
          _addRefLog("mobile_long_press_fallback", `attempt=${refAttempt + 1}`);
          await simulateLongPressContextMenu(targetEl, getInputTimeoutMs2());
          _addRefLog("mobile_long_press_done", `attempt=${refAttempt + 1}`);
          newMenus = await waitForNewContextMenus(getInputTimeoutMs2());
          _addRefLog(
            "mobile_menu_wait_done",
            `menus=${newMenus.length} attempt=${refAttempt + 1}`,
          );
        } else if (!isV2) {
          await sleep2(getInputTimeoutMs2());
        }
        const _cmSel = contextSelector;
        if (isV2 && newMenus.length > 1) {
          for (const menu of newMenus) _closeOwnedContextMenus2(menu);
          _addRefLog("failed", "reason=ambiguous_context_menu");
          return false;
        }
        const ctxMenu = _cmSel
          ? isV2
            ? newMenus[0] || null
            : document.querySelector(_cmSel)
          : null;
        if (!_cmSel) console.debug("[Tier3] context_menu config miss");
        if (!ctxMenu) {
          _addRefLog("context_menu_retry", `attempt=${refAttempt + 1}`);
          if (!isV2) _closeContextMenu2();
          if (refAttempt < 2) continue;
          _addRefLog("failed", "reason=context_menu_not_open");
          sendLog2(
            `\u26A0\uFE0F L\u1ED7i: Context menu kh\xF4ng m\u1EDF \u0111\u01B0\u1EE3c cho file ${fileId}`,
            "warn",
          );
          return false;
        }
        if (strictImageIdentity && !matchesRequestedImage(el)) {
          _closeOwnedContextMenus2(ctxMenu);
          _addRefLog(
            "identity_retry",
            `stage=menu_open requested_uuid=${requestedUuid} attempt=${refAttempt + 1}`,
          );
          continue;
        }
        const menuItems = _qa2("menu_item", ctxMenu);
        let clicked = false;
        const detectedRefType = detectMediaType2(el);
        const expectedChipKey =
          isV2 && (expectsVideo || detectedRefType === "video")
            ? "ingredient_video_chip"
            : "ingredient_image_chip";
        _addRefLog(
          "media_contract",
          `expected=${expectedMediaType || "-"} detected=${detectedRefType} chip=${expectedChipKey}`,
        );
        const preChips = new Set(
          isV2
            ? _flowV2IngredientChips2(expectedChipKey)
            : _qa2(expectedChipKey),
        );
        const preChipCount = preChips.size;
        const clickVerifiedRefItem = (item) => {
          if (abortRequested()) return false;
          if (strictImageIdentity && !matchesRequestedImage(el)) return false;
          _addRefLog(
            "before_add_click",
            `requested_uuid=${requestedUuid || "-"} actual_identity=${_getPersistentMediaId2(el) || "-"}`,
          );
          simulateClick2(item);
          return true;
        };
        const addCfg = _getDynamicSelector2("add_to_prompt_menu_item");
        const addToPromptLabels = _cfgList2(addCfg?.text_match);
        for (const item of menuItems) {
          const text = item.textContent?.trim() || "";
          if (_textIncludesAny2(text, addToPromptLabels)) {
            clicked = clickVerifiedRefItem(item);
            break;
          }
        }
        if (!clicked) {
          for (const item of menuItems) {
            const icon = _findIconInElement2(item);
            if (
              icon &&
              addCfg?.icon_text &&
              icon.textContent?.trim() === addCfg.icon_text
            ) {
              clicked = clickVerifiedRefItem(item);
              break;
            }
          }
        }
        const waitForV2Chip = () =>
          new Promise((resolve) => {
            let settled = false;
            let observer = null;
            let timer = null;
            const read = () => _flowV2IngredientChips2(expectedChipKey);
            const finish = (chips3) => {
              if (settled) return;
              settled = true;
              observer?.disconnect();
              clearTimeout(timer);
              resolve(chips3);
            };
            observer = new MutationObserver(() => {
              const chips3 = read();
              if (chips3.length > preChipCount) finish(chips3);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            timer = setTimeout(() => finish(read()), getInputTimeoutMs2());
            const chips2 = read();
            if (chips2.length > preChipCount) finish(chips2);
          });
        const chips = clicked && isV2 ? await waitForV2Chip() : null;
        if (clicked) {
          if (isV2) _closeOwnedContextMenus2(ctxMenu);
          else {
            await sleep2(100);
            _closeContextMenu2();
          }
        }
        if (!clicked) {
          _addRefLog("failed", "reason=add_menu_item_not_found");
          if (isV2) _closeOwnedContextMenus2(ctxMenu);
          else _closeContextMenu2();
          sendLog2(
            `\u26A0\uFE0F L\u1ED7i: Kh\xF4ng t\xECm th\u1EA5y menu "Add to prompt" \u1EDF file ${fileId}`,
            "warn",
          );
        }
        if (!isV2) await sleep2(getInputTimeoutMs2());
        if (clicked && isV2) {
          let verified = chips.length === preChipCount + 1;
          if (strictImageIdentity) {
            const attribute = _getConfiguredAttribute2(
              "tile_image",
              "persistent_id_attribute",
            );
            const addedChips = chips.filter((chip) => !preChips.has(chip));
            const chipIds = attribute
              ? addedChips
                  .map(
                    (chip) =>
                      chip.getAttribute(attribute) ||
                      chip
                        .querySelector(`[${attribute}]`)
                        ?.getAttribute(attribute),
                  )
                  .filter(Boolean)
              : [];
            if (chipIds.some((id) => id !== requestedUuid)) verified = false;
            _addRefLog(
              "chip_ack",
              `requested_uuid=${requestedUuid} chip_ids=${JSON.stringify(chipIds)} identity_exposed=${chipIds.length > 0} verified=${verified}`,
            );
          }
          if (!verified) {
            _addRefLog("failed", "reason=v2_chip_not_confirmed");
            return false;
          }
        }
        if (clicked) _addRefLog("success");
        return clicked;
      }
      _addRefLog(
        "failed",
        `reason=unstable_ref_identity requested_uuid=${requestedUuid || "-"}`,
      );
      return false;
    } finally {
      _releaseCtxMenuLock2();
    }
  }
  var _cachedInputTimeoutMs = 1200;
  var _cachedDelayBetweenMs = 5e3;
  async function runAutoPrompt(payload) {
    let {
      prompts,
      delayBetweenMs,
      inputTimeoutMs,
      fileIds,
      fileNameMap,
      genType,
      aspectRatio,
      modelName,
      modelAliases,
      frameFileIds,
      refPerPrompt,
      refFileIdsPerPrompt,
      noTileWait,
      quantity,
      autoDownload,
      downloadResolution,
      videoDownloadResolution,
      flowVideoDuration,
      flowVideoResolution,
      flowVideoResolutionDomValue,
      skipFlowDurationControl,
      refImageMode,
      mentionData,
      taskName,
    } = payload;
    fileNameMap = fileNameMap || {};
    quantity = quantity || 1;
    refPerPrompt = refPerPrompt || false;
    noTileWait = noTileWait || false;
    autoDownload = autoDownload ?? false;
    const downloadGeneratedTile = async (tileId, promptText) => {
      try {
        return await downloadTileMedia(
          tileId,
          promptText,
          taskName || null,
          null,
          downloadResolution,
          null,
          null,
          videoDownloadResolution,
        );
      } catch (error) {
        sendLog2(
          `Auto-download th\u1EA5t b\u1EA1i: ${error?.message || error}`,
          "warn",
        );
        return false;
      }
    };
    downloadResolution = downloadResolution || "1k";
    videoDownloadResolution = videoDownloadResolution || "720p";
    refImageMode = refImageMode || "all";
    mentionData = mentionData || null;
    const isFramesMode = payload.isFrames === true || !!frameFileIds;
    _cachedInputTimeoutMs = inputTimeoutMs || 1200;
    _cachedDelayBetweenMs = delayBetweenMs || 5e3;
    if (!isFramesMode) {
      let _firstVoiceMention = null;
      let _firstCharMention = null;
      let _hadComponentMentions = false;
      for (let pi = 0; pi < (prompts || []).length; pi++) {
        const comps = _parseComponentMentions2(prompts[pi]);
        if (comps.length === 0) continue;
        _hadComponentMentions = true;
        if (!_firstVoiceMention)
          _firstVoiceMention =
            comps.find((c) => c.type === "voice")?.name || null;
        if (!_firstCharMention)
          _firstCharMention =
            comps.find((c) => c.type === "char")?.name || null;
        prompts[pi] = _stripComponentMentions2(prompts[pi]);
      }
      if (_hadComponentMentions) {
        console.warn(
          "[runAutoPrompt] Prompt c\xF3 @voice:/@char: mention \u2014 direct path v1 fallback single (strip kh\u1ECFi text)",
        );
        sendLog2(
          "\u26A0\uFE0F Mention @voice:/@char: \u2014 \u0111\u01B0\u1EDDng direct ch\u01B0a h\u1ED7 tr\u1EE3 inline: \xE1p gi\u1ECDng/nh\xE2n v\u1EADt \u0111\u1EA7u ti\xEAn nh\u01B0 single",
          "warning",
        );
        const _isVidGen = /video/i.test(genType || "");
        if (_firstVoiceMention && _isVidGen && !payload.voice?.search_value) {
          payload.voice = { search_value: _firstVoiceMention };
        }
        if (_firstCharMention && !payload.character?.search_value) {
          payload.character = { search_value: _firstCharMention };
        }
      }
    }
    if (isRunning) {
      console.warn(
        "[runAutoPrompt] Blocked: isRunning=true, ExecutionBlocker.isVisible=" +
          ExecutionBlocker.isVisible(),
      );
      return { blocked: true, reason: "already_running" };
    }
    isRunning = true;
    shouldStop = false;
    isPaused = false;
    failedPrompts = [];
    _clickedRetryTileIds.clear();
    _retryingTiles.clear();
    const DELAY_BEFORE_SUBMIT = getSubmitDelay2();
    const _startedAt = Date.now();
    FloatingTracker.updateLegacy({
      owner: payload._owner || "prompts",
      label: payload._label || "Auto Gen",
      status:
        _flowPageContext?.driverKey === "flow_v2" ? "preparing" : "running",
      current: 0,
      total: prompts.length,
      failed: 0,
      startedAt: _startedAt,
    });
    ExecutionBlocker.show({
      title: "Preparing...",
      subtitle: "Extension is working, please wait",
      current: 0,
      total: prompts.length,
      promptText: "Chu\u1EA9n b\u1ECB upload \u1EA3nh tham chi\u1EBFu...",
      owner: payload._owner || "prompts",
      indeterminate: true,
    });
    if (fileIds && fileIds.some((id) => id.startsWith("upload_"))) {
      const idsStr = fileIds.join(", ");
      if (typeof window.uploadPendingFiles === "function") {
        const uploaded = await window.uploadPendingFiles(idsStr);
        fileIds = uploaded
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const fileIdsInput = document.getElementById("fileIdsInput");
        if (fileIdsInput) {
          fileIdsInput.value = fileIds.join(", ");
          if (typeof window.renderFileIdThumbnails === "function")
            window.renderFileIdThumbnails();
        }
      }
    }
    if (frameFileIds) {
      if (Array.isArray(frameFileIds)) {
        for (let fi = 0; fi < frameFileIds.length; fi++) {
          const fp = frameFileIds[fi];
          if (!fp) continue;
          if (
            fp.frame1?.startsWith("upload_") &&
            typeof window.uploadPendingFiles === "function"
          ) {
            fp.frame1 = (await window.uploadPendingFiles(fp.frame1)).trim();
          }
          if (
            fp.frame2?.startsWith("upload_") &&
            typeof window.uploadPendingFiles === "function"
          ) {
            fp.frame2 = (await window.uploadPendingFiles(fp.frame2)).trim();
          }
        }
      } else {
        if (
          frameFileIds.frame1?.startsWith("upload_") &&
          typeof window.uploadPendingFiles === "function"
        ) {
          frameFileIds.frame1 = (
            await window.uploadPendingFiles(frameFileIds.frame1)
          ).trim();
        }
        if (
          frameFileIds.frame2?.startsWith("upload_") &&
          typeof window.uploadPendingFiles === "function"
        ) {
          frameFileIds.frame2 = (
            await window.uploadPendingFiles(frameFileIds.frame2)
          ).trim();
        }
      }
    }
    if (
      fileIds &&
      fileIds.length > 0 &&
      typeof window.reuploadMissingFiles === "function"
    ) {
      const idsStr = fileIds.join(", ");
      const thumbCache = window.GenTab?.thumbnailCache || {};
      const fnCache = window.GenTab?.fileNameCache || {};
      const updated = await window.reuploadMissingFiles(
        idsStr,
        thumbCache,
        null,
        fnCache,
      );
      if (updated !== idsStr) {
        fileIds = updated
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const fileIdsInput = document.getElementById("fileIdsInput");
        if (fileIdsInput) {
          fileIdsInput.value = fileIds.join(", ");
          if (typeof window.renderFileIdThumbnails === "function")
            window.renderFileIdThumbnails();
        }
      }
    }
    const wfCfg = window._afExecConfig?.workflow || {};
    const farCfg = window._afExecConfig?.flow_recovery || {};
    let retrySettings = {
      maxRetries: parseInt(wfCfg.max_retries ?? 2, 10),
      tileTimeout: parseInt(wfCfg.timeout_sec ?? 180, 10) * 1e3,
      flowBackoffBaseSec: parseInt(farCfg.backoff_base_sec ?? 30, 10),
      flowBackoffMaxSec: parseInt(farCfg.backoff_max_sec ?? 300, 10),
      flowBackoffJitterPercent: parseInt(
        farCfg.backoff_jitter_percent ?? 20,
        10,
      ),
      flowAutoRecoveryEnabled: farCfg.auto_recovery_enabled !== false,
      flowConsecutiveFailThreshold: parseInt(
        farCfg.consecutive_fail_threshold ?? 2,
        10,
      ),
    };
    try {
      const stored = await new Promise((r) =>
        ConfigSnapshotAccess.read(["af_entitlements"], r),
      );
      const entitlements = stored.af_entitlements?.entitlements || {};
      const retryFeature = entitlements.retry_on_fail;
      const canUseRetry =
        retryFeature?.value === "1" || retryFeature?.value === 1;
      if (!canUseRetry) {
        retrySettings.maxRetries = 0;
      }
    } catch (e) {}
    const humanized = isHumanizedEnabled2();
    if (humanized) {
      sendLog2(
        "Humanized mode: b\u1EADt - g\xF5 k\xFD t\u1EF1 v\xE0 delay ng\u1EABu nhi\xEAn",
        "info",
      );
    }
    sendLog2(
      `\u{1F680} B\u1EAFt \u0111\u1EA7u ch\u1EA1y ${prompts.length} prompt(s)...`,
    );
    if (refPerPrompt) {
      sendLog2(
        `Ch\u1EBF \u0111\u1ED9 m\u1ED7i prompt 1 \u1EA3nh: ${fileIds.length} \u1EA3nh cho ${prompts.length} prompt`,
        "info",
      );
    }
    if (_flowPageContext?.driverKey === "flow_v2") {
      if (_isFlowMediaViewerOpen2() && !(await _exitFlowMediaViewer())) {
        throw new Error("FLOW_VIEWER_NAVIGATING");
      }
      const agentReady = await _ensureFlowV2AgentReady();
      if (!agentReady.success)
        throw new Error(agentReady.error || "V2_AGENT_BLOCKED");
    } else
      try {
        let actioned = false;
        const r1 = await _ensureFlowAgentInstructionDone();
        if (r1.wasOpen && r1.success) {
          sendLog2(
            "\u2713 \u0110\xE3 \u0111\xF3ng dialog h\u01B0\u1EDBng d\u1EABn agent",
            "info",
          );
          actioned = true;
        }
        const r2 = await _ensureFlowChatAgentClosed();
        if (r2.wasOpen && r2.success) {
          sendLog2("\u2713 \u0110\xE3 \u0111\xF3ng panel chat agent", "info");
          actioned = true;
          await sleep2(1500);
        }
        const r3 = await _ensureFlowAgentModeOff();
        if (r3.wasOn && r3.success) {
          sendLog2("\u2713 \u0110\xE3 t\u1EAFt Agent mode", "info");
          actioned = true;
        }
        if (actioned) {
          const editorReadyMs = await _waitForFlowEditorReady(5e3);
          sendLog2(
            editorReadyMs
              ? `\u2713 Editor Flow ready (${editorReadyMs}ms)`
              : "\u26A0 Editor ch\u01B0a ready sau 5s",
            editorReadyMs ? "info" : "warn",
          );
          window._tobyAgentChainLastRunAt = Date.now();
        }
      } catch (e) {
        console.warn(
          "[runAutoPrompt] prepareFlowForGen guard failed (non-blocking):",
          e.message,
        );
      }
    let completedCount = 0;
    let failedCount = 0;
    const allResultTileIds = [];
    let lastPreTileIds = [];
    let lastPreFileNames = null;
    const _attachRequiredRefs = async (ids) => {
      const requiredIds = (ids || []).filter(Boolean);
      for (const fid of requiredIds) {
        if (shouldStop) return false;
        const attached = await addFileToPrompt(fid, fileNameMap[fid]);
        if (!attached) {
          console.warn("[runAutoPrompt] Required ref attachment failed:", fid);
          return false;
        }
      }
      return true;
    };
    if (noTileWait) await _stabilizeFlowResultViewport();
    const initialPreTileIds = noTileWait ? getUniqueTileIds2(true) : [];
    const initialPreFileNames = noTileWait ? getExistingFileNames2() : null;
    for (let i = 0; i < prompts.length; i++) {
      if (shouldStop) {
        sendLog2(
          "\u26A0\uFE0F \u0110\xE3 nh\u1EADn l\u1EC7nh d\u1EEBng qu\xE1 tr\xECnh.",
          "warn",
        );
        break;
      }
      if (isPaused) {
        sendLog2(
          "\u23F8 \u0110\xE3 t\u1EA1m d\u1EEBng. Nh\u1EA5n Resume \u0111\u1EC3 ti\u1EBFp t\u1EE5c.",
          "warn",
        );
        while (isPaused && !shouldStop) {
          await sleep2(500);
        }
        if (shouldStop) {
          sendLog2(
            "\u26A0\uFE0F \u0110\xE3 nh\u1EADn l\u1EC7nh d\u1EEBng qu\xE1 tr\xECnh.",
            "warn",
          );
          break;
        }
        sendLog2("\u25B6 Ti\u1EBFp t\u1EE5c ch\u1EA1y...", "info");
      }
      const prompt = prompts[i];
      const currentPrompt = prompt;
      sendLog2(
        `[${i + 1}/${prompts.length}] "${prompt.substring(0, 50)}..."`,
        "info",
      );
      ExecutionBlocker.update({
        title: "Generating images...",
        subtitle: `Processing prompt ${i + 1}/${prompts.length}`,
        current: i,
        total: prompts.length,
        promptText:
          currentPrompt.length > 100
            ? currentPrompt.substring(0, 100) + "..."
            : currentPrompt,
        indeterminate: false,
      });
      let promptSuccess = false;
      _clickedRetryTileIds.clear();
      const totalAttempts = 1 + retrySettings.maxRetries;
      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        if (shouldStop) break;
        if (attempt > 1) {
          const retryIdx = attempt - 2;
          const backoffMs = getExponentialBackoffMs2(retryIdx, retrySettings);
          sendLog2(
            `[Backoff] \u0110\u1EE3i ${Math.round(backoffMs / 1e3)}s tr\u01B0\u1EDBc th\u1EED l\u1EA1i l\u1EA7n ${attempt - 1}/${retrySettings.maxRetries}`,
            "info",
          );
          await sleep2(backoffMs);
          if (shouldStop) break;
          sendLog2(
            `Th\u1EED l\u1EA1i l\u1EA7n ${attempt - 1}/${retrySettings.maxRetries}...`,
            "warn",
          );
          ExecutionBlocker.update({
            title: "Retrying...",
            subtitle: `Attempt ${attempt - 1}/${retrySettings.maxRetries} - Prompt ${i + 1}/${prompts.length}`,
            current: i,
            total: prompts.length,
            promptText:
              currentPrompt.length > 100
                ? currentPrompt.substring(0, 100) + "..."
                : currentPrompt,
            indeterminate: false,
          });
        }
        let editor = getEditor2();
        if (!editor) {
          sendLog2(
            "\u274C Kh\xF4ng t\xECm th\u1EA5y \xF4 nh\u1EADp li\u1EC7u (Slate editor)!",
            "error",
          );
          break;
        }
        if (shouldStop) break;
        await removeExistingRefImages();
        if (shouldStop) break;
        await clearEditor(editor);
        if (shouldStop) break;
        await sleep2(
          humanized
            ? getHumanizedDelay2(getClearEditorDelay2())
            : getClearEditorDelay2(),
        );
        if (shouldStop) break;
        try {
          if (genType && aspectRatio && modelName) {
            await applySettings(
              genType,
              aspectRatio,
              modelName,
              isFramesMode,
              quantity,
              flowVideoDuration,
              modelAliases,
              flowVideoResolution,
              flowVideoResolutionDomValue,
              skipFlowDurationControl === true,
            );
          }
        } catch (e) {
          sendLog2(
            `L\u1ED7i thi\u1EBFt l\u1EADp c\u1EA5u h\xECnh AI (iter ${i + 1}): ${e.message}`,
            "error",
          );
          const isModelContractError = /^(?:V2_MODEL_|MODEL_OPTION_)/.test(
            String(e?.message || ""),
          );
          const isModeContractError = /^V2_MODE_/.test(
            String(e?.message || ""),
          );
          if (isModelContractError || isModeContractError) {
            failedCount++;
            _incrementDailyStat2("flow_fail");
            failedPrompts.push({
              index: i,
              prompt,
              error: e.message,
              timestamp: Date.now(),
            });
            const modelUnavailableMsg = isModelContractError
              ? `Model "${modelName}" is unavailable for this Google Flow account. Prompt #${i + 1} was skipped.`
              : `Google Flow did not switch to the requested mode. Prompt #${i + 1} was skipped.`;
            if (typeof window.showNotification === "function") {
              window.showNotification(modelUnavailableMsg, "error", 6e3);
            }
          }
          break;
        }
        if (shouldStop) break;
        if (!isFramesMode && payload.voice?.search_value) {
          try {
            const result = await selectFlowVoice(payload.voice);
            if (result?.success && result.selected)
              sendLog2(
                `\u0110\xE3 ch\u1ECDn voice: ${result.selected}`,
                "info",
              );
            else if (result?.error === "voice_not_found")
              sendLog2(
                `Voice "${payload.voice.search_value}" kh\xF4ng c\xF3 trong menu Flow \u2014 submit kh\xF4ng voice`,
                "warning",
              );
          } catch (error) {
            sendLog2(
              `L\u1ED7i ch\u1ECDn voice (non-blocking): ${error.message}`,
              "warning",
            );
          }
        }
        if (!isFramesMode && payload.character?.search_value) {
          try {
            const result = await selectFlowCharacter(payload.character);
            if (result?.success && result.selected)
              sendLog2(
                `\u0110\xE3 ch\u1ECDn nh\xE2n v\u1EADt: ${result.selected}`,
                "info",
              );
            else if (result?.error === "character_not_found")
              sendLog2(
                `Nh\xE2n v\u1EADt "${payload.character.search_value}" kh\xF4ng c\xF3 trong menu Flow \u2014 submit kh\xF4ng nh\xE2n v\u1EADt`,
                "warning",
              );
          } catch (error) {
            sendLog2(
              `L\u1ED7i ch\u1ECDn nh\xE2n v\u1EADt (non-blocking): ${error.message}`,
              "warning",
            );
          }
        }
        let currentFileIds = fileIds;
        if (refImageMode === "mention" && mentionData && mentionData[i]) {
          const promptMentionData = mentionData[i];
          if (
            promptMentionData.refImages &&
            promptMentionData.refImages.length > 0
          ) {
            currentFileIds = promptMentionData.refImages
              .filter((ref) => ref.file_id)
              .map((ref) => ref.file_id);
          } else {
            currentFileIds = [];
          }
        } else if (refImageMode === "none") {
          currentFileIds = [];
        } else if (refImageMode === "sequential" || refPerPrompt) {
          currentFileIds = Array.isArray(refFileIdsPerPrompt)
            ? refFileIdsPerPrompt[i] || []
            : fileIds[i]
              ? [fileIds[i]]
              : [];
        }
        if (shouldStop) break;
        let refsAttached = true;
        if (frameFileIds) {
          const currentFrames = Array.isArray(frameFileIds)
            ? frameFileIds[i] || null
            : frameFileIds;
          if (currentFrames) {
            if (currentFrames.frame1 && !shouldStop) {
              sendLog2(
                Array.isArray(frameFileIds)
                  ? `\u0110ang g\xE0i Frame Start (Prompt ${i + 1})...`
                  : "\u0110ang g\xE0i Frame 1...",
                "info",
              );
              refsAttached = await _attachRequiredRefs([currentFrames.frame1]);
            }
            if (refsAttached && currentFrames.frame2 && !shouldStop) {
              sendLog2(
                Array.isArray(frameFileIds)
                  ? `\u0110ang g\xE0i Frame End (Prompt ${i + 1})...`
                  : "\u0110ang g\xE0i Frame 2...",
                "info",
              );
              refsAttached = await _attachRequiredRefs([currentFrames.frame2]);
            }
          }
        } else if (currentFileIds && currentFileIds.length > 0 && !shouldStop) {
          const logMsg =
            refImageMode === "sequential" || refPerPrompt
              ? `\u0110ang g\xE0i \u1EA3nh tham chi\u1EBFu #${i + 1}...`
              : `\u0110ang g\xE0i ${currentFileIds.length} \u1EA3nh tham chi\u1EBFu...`;
          sendLog2(logMsg, "info");
          refsAttached = await _attachRequiredRefs(currentFileIds);
        }
        if (!refsAttached && !shouldStop) {
          sendLog2(
            `\u274C Kh\xF4ng th\u1EC3 g\xE0i \u0111\u1EE7 \u1EA3nh/video tham chi\u1EBFu cho prompt #${i + 1}; kh\xF4ng submit thi\u1EBFu ref`,
            "error",
          );
          if (attempt < totalAttempts) continue;
          failedCount++;
          _incrementDailyStat2("flow_fail");
          failedPrompts.push({
            index: i,
            prompt,
            error: "Reference attachment failed",
            timestamp: Date.now(),
          });
          break;
        }
        if (shouldStop) break;
        editor = getEditor2();
        if (!editor) {
          sendLog2(
            "\u274C Kh\xF4ng t\xECm th\u1EA5y \xF4 nh\u1EADp li\u1EC7u sau khi g\xE0i \u1EA3nh!",
            "error",
          );
          break;
        }
        await insertText(editor, prompt);
        if (shouldStop) break;
        const delayBeforeSubmit = humanized
          ? getHumanizedDelay2(DELAY_BEFORE_SUBMIT)
          : DELAY_BEFORE_SUBMIT;
        await sleep2(delayBeforeSubmit);
        if (shouldStop) break;
        editor = getEditor2() || editor;
        const hasPlaceholder = () => {
          const ed = getEditor2();
          return ed && ed.querySelector("[data-slate-placeholder]") !== null;
        };
        if (hasPlaceholder()) {
          sendLog2(
            "\u26A0\uFE0F Slate placeholder v\u1EABn c\xF2n \u2192 model r\u1ED7ng, ch\u1EDD...",
            "warn",
          );
          let waitSlate = 0;
          while (hasPlaceholder() && waitSlate < 2e3) {
            await sleep2(200);
            waitSlate += 200;
          }
          if (hasPlaceholder()) {
            sendLog2("\u26A0\uFE0F Retry insert text...", "warn");
            await _insertTextSingle(prompt);
            await sleep2(500);
          }
        }
        if (_checkFlowCreditLimit2()) {
          const msg =
            typeof window.I18n?.t === "function"
              ? window.I18n.t("flow.creditLimitHit")
              : null;
          const finalMsg =
            msg ||
            "Your Google Flow account is out of credits \u2014 cannot submit. Wait for reset or upgrade your Flow plan.";
          sendLog2("\u274C " + finalMsg, "error");
          if (typeof window.showNotification === "function") {
            window.showNotification(finalMsg, "error", 1e4);
          }
          try {
            chrome.runtime
              .sendMessage({
                action: "reportFlowError",
                errorCode: "FLOW_CREDIT_LIMIT",
                message: finalMsg,
              })
              .catch(() => {});
          } catch (_) {}
          break;
        }
        let submitBtn = getSubmitButton2();
        if (!submitBtn) {
          sendLog2(
            "\u274C Kh\xF4ng t\xECm th\u1EA5y n\xFAt Submit (arrow_forward)!",
            "error",
          );
          break;
        }
        let waitSubmit = 0;
        while (submitBtn.disabled && waitSubmit < 15e3) {
          await sleep2(300);
          waitSubmit += 300;
          submitBtn = getSubmitButton2() || submitBtn;
        }
        if (submitBtn.disabled) {
          sendLog2(
            "\u26A0\uFE0F N\xFAt Submit v\u1EABn disabled sau 15s, th\u1EED click...",
            "warn",
          );
        }
        await _stabilizeFlowResultViewport();
        const allPreTileIds = getUniqueTileIds2(true);
        const allPreFileNames = getExistingFileNames2();
        lastPreTileIds = allPreTileIds;
        lastPreFileNames = allPreFileNames;
        const afterSubmitDelay = getAfterSubmitDelay2();
        sendLog2(`\u0110ang click Submit...`, "info");
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        const submitResult = await resolved?.driver?.invoke("submit", {
          timeoutMs: 3e4,
        });
        if (!submitResult?.success) {
          throw new Error(submitResult?.error || "V2_SUBMIT_NOT_CONFIRMED");
        }
        _incrementDailyStat2("flow_prompt_total");
        await sleep2(afterSubmitDelay);
        sendLog2(`\u2705 \u0110\xE3 submit prompt #${i + 1}`, "success");
        FloatingTracker.updateLegacy({
          owner: payload._owner || "prompts",
          label: payload._label || "Auto Gen",
          status: isPaused ? "paused" : "running",
          current: i + 1,
          total: prompts.length,
          failed: failedCount,
          startedAt: _startedAt,
        });
        ExecutionBlocker.update({
          title: isPaused
            ? "\u0110\xE3 t\u1EA1m d\u1EEBng"
            : "\u0110ang t\u1EA1o \u1EA3nh...",
          subtitle: isPaused
            ? "Nh\u1EA5n Ti\u1EBFp t\u1EE5c \u0111\u1EC3 ch\u1EA1y ti\u1EBFp"
            : "Ch\u1EDD k\u1EBFt qu\u1EA3 t\u1EEB Flow...",
          current: i + 1,
          total: prompts.length,
          promptText:
            currentPrompt.length > 100
              ? currentPrompt.substring(0, 100) + "..."
              : currentPrompt,
          indeterminate: false,
        });
        try {
          chrome.runtime.sendMessage({
            action: "promptProgress",
            current: i + 1,
            total: prompts.length,
          });
        } catch (e) {}
        if (noTileWait) {
          sendLog2(
            "Song song: b\u1ECF qua ch\u1EDD tiles, ti\u1EBFp t\u1EE5c...",
            "info",
          );
          completedCount++;
          promptSuccess = true;
        } else if (!shouldStop) {
          sendLog2("Ch\u1EDD k\u1EBFt qu\u1EA3...", "info");
          ExecutionBlocker.update({
            title: "Waiting for results...",
            subtitle: `Flow is processing prompt ${i + 1}/${prompts.length}`,
            current: i,
            total: prompts.length,
            promptText:
              currentPrompt.length > 100
                ? currentPrompt.substring(0, 100) + "..."
                : currentPrompt,
            indeterminate: true,
          });
          const result = await waitForNewTiles(
            allPreTileIds,
            retrySettings.tileTimeout,
            allPreFileNames,
            0,
            null,
            genType,
          );
          if (result.failed) {
            sendLog2(
              "\u274C Google Flow b\xE1o l\u1ED7i - t\u1EA1o \u1EA3nh th\u1EA5t b\u1EA1i",
              "error",
            );
            const failedTids = result.tiles.filter((tid) => {
              const tile = _getTileById2(tid);
              return detectTileStatus2(tile) === "failed";
            });
            const successTids = result.tiles.filter(
              (tid) => !failedTids.includes(tid),
            );
            const allTilesFailed = successTids.length === 0;
            if (successTids.length > 0) {
              allResultTileIds.push(...successTids);
              if (autoDownload) {
                for (const tid of successTids) {
                  await downloadGeneratedTile(tid, prompt);
                  await sleep2(200);
                }
              }
            }
            if (failedTids.length > 0 && retrySettings.maxRetries > 0) {
              let remainingFailed = failedTids;
              let promptSuccessCount = successTids.length;
              for (
                let btnRetry = 1;
                btnRetry <= retrySettings.maxRetries &&
                remainingFailed.length > 0 &&
                !shouldStop;
                btnRetry++
              ) {
                sendLog2(
                  `[Retry L1] Click "Th\u1EED l\u1EA1i" l\u1EA7n ${btnRetry}/${retrySettings.maxRetries} cho ${remainingFailed.length} tile fail...`,
                  "warn",
                );
                sendRetryStatus2(
                  `Click Retry (${btnRetry}/${retrySettings.maxRetries})`,
                );
                const retryResult = await retryFailedTilesViaButton(
                  remainingFailed,
                  retrySettings.tileTimeout,
                );
                if (retryResult.succeeded.length > 0) {
                  allResultTileIds.push(...retryResult.succeeded);
                  promptSuccessCount += retryResult.succeeded.length;
                  sendLog2(
                    `[Retry L1] Th\xE0nh c\xF4ng: ${retryResult.succeeded.length} \u1EA3nh`,
                    "success",
                  );
                  if (autoDownload) {
                    for (const tid of retryResult.succeeded) {
                      await downloadGeneratedTile(tid, prompt);
                      await sleep2(200);
                    }
                  }
                }
                remainingFailed = retryResult.stillFailed;
              }
              if (remainingFailed.length === 0 && promptSuccessCount > 0) {
                completedCount++;
                promptSuccess = true;
              }
              if (promptSuccessCount === 0 && !shouldStop) {
                sendLog2(
                  `[Retry L2] T\u1EA5t c\u1EA3 ${failedTids.length} tile fail - \u0110ang g\u1EEDi l\u1EA1i prompt...`,
                  "warn",
                );
                sendRetryStatus2("G\u1EEDi l\u1EA1i Prompt");
                await sleep2(getDelayBetweenPromptsMs2());
                let fbEditor = getEditor2();
                if (fbEditor) {
                  await removeExistingRefImages();
                  await clearEditor(fbEditor);
                  await sleep2(getClearEditorDelay2());
                  let fallbackRefsAttached = true;
                  if (frameFileIds) {
                    const retryFrames = Array.isArray(frameFileIds)
                      ? frameFileIds[i] || null
                      : frameFileIds;
                    if (retryFrames) {
                      fallbackRefsAttached = await _attachRequiredRefs([
                        retryFrames.frame1,
                        retryFrames.frame2,
                      ]);
                    }
                  } else if (currentFileIds && currentFileIds.length > 0) {
                    fallbackRefsAttached =
                      await _attachRequiredRefs(currentFileIds);
                  }
                  if (!fallbackRefsAttached) {
                    sendLog2(
                      "[Retry L2] Kh\xF4ng th\u1EC3 g\xE0i \u0111\u1EE7 ref \u2014 h\u1EE7y submit fallback",
                      "error",
                    );
                    fbEditor = null;
                  } else {
                    fbEditor = getEditor2();
                  }
                  if (fbEditor) {
                    await insertText(fbEditor, prompt);
                    await sleep2(getSubmitDelay2());
                    await _stabilizeFlowResultViewport();
                    const fbPreTileIds = getUniqueTileIds2(true);
                    const fbPreFileNames = getExistingFileNames2();
                    const fbSubmitResult =
                      await FlowDriverRegistry.resolveForUrl(
                        location.href,
                      )?.driver?.invoke("submit", { timeoutMs: 3e4 });
                    if (!fbSubmitResult?.success) {
                      sendLog2(
                        `[Retry L2] V2 submit ch\u01B0a x\xE1c nh\u1EADn: ${fbSubmitResult?.error || "FLOW_V2_DRIVER_UNAVAILABLE"}`,
                        "error",
                      );
                      failedCount++;
                      _incrementDailyStat2("flow_fail");
                      failedPrompts.push({
                        index: i,
                        prompt,
                        error: fbSubmitResult?.error || "V2 submit failed",
                        timestamp: Date.now(),
                      });
                      break;
                    }
                    await sleep2(getAfterSubmitDelay2());
                    const fbResult = await waitForNewTiles(
                      fbPreTileIds,
                      retrySettings.tileTimeout,
                      fbPreFileNames,
                      0,
                      null,
                      genType,
                    );
                    if (fbResult.tiles.length > 0 && !fbResult.failed) {
                      allResultTileIds.push(...fbResult.tiles);
                      sendLog2(
                        `[Retry L2] G\u1EEDi l\u1EA1i th\xE0nh c\xF4ng: ${fbResult.tiles.length} \u1EA3nh`,
                        "success",
                      );
                      if (autoDownload) {
                        for (const tid of fbResult.tiles) {
                          await downloadGeneratedTile(tid, prompt);
                          await sleep2(200);
                        }
                      }
                      completedCount++;
                      promptSuccess = true;
                    } else {
                      sendLog2(
                        `[Retry L2] G\u1EEDi l\u1EA1i c\u0169ng th\u1EA5t b\u1EA1i`,
                        "error",
                      );
                    }
                  }
                }
              }
              if (
                !promptSuccess &&
                remainingFailed.length > 0 &&
                !allStillFailed
              ) {
                sendLog2(
                  `[Retry L1] ${remainingFailed.length}/${failedTids.length} tile v\u1EABn fail sau click "Th\u1EED l\u1EA1i"`,
                  "warn",
                );
              }
            }
            const hasAnySuccess =
              successTids.length > 0 || allResultTileIds.length > 0;
            if (!promptSuccess && hasAnySuccess) {
              completedCount++;
              promptSuccess = true;
            }
            if (!promptSuccess) {
              failedCount++;
              _incrementDailyStat2("flow_fail");
              failedPrompts.push({
                index: i,
                prompt,
                error: "Google Flow error",
                timestamp: Date.now(),
              });
            }
          } else if (result.tiles.length > 0) {
            sendLog2(
              `\u2705 C\xF3 ${result.tiles.length} k\u1EBFt qu\u1EA3 m\u1EDBi`,
              "success",
            );
            allResultTileIds.push(...result.tiles);
            if (autoDownload) {
              sendLog2(
                `\u0110ang t\u1EA3i ${result.tiles.length} file [${downloadResolution.toUpperCase()}]...`,
                "info",
              );
              for (const tid of result.tiles) {
                await downloadGeneratedTile(tid, prompt);
                await sleep2(200);
              }
            }
            completedCount++;
            promptSuccess = true;
          } else {
            sendLog2(
              "\u26A0\uFE0F Timeout - kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3 m\u1EDBi",
              "warn",
            );
            failedCount++;
            _incrementDailyStat2("flow_fail");
            failedPrompts.push({
              index: i,
              prompt,
              error: "Timeout - no results",
              timestamp: Date.now(),
            });
          }
        }
        break;
      }
      if (i < prompts.length - 1 && !shouldStop) {
        const actualDelay = humanized
          ? getHumanizedDelay2(getRandomDelay2())
          : _cachedDelayBetweenMs;
        sendLog2(
          `Ch\u1EDD ${(actualDelay / 1e3).toFixed(1)}s cho l\u01B0\u1EE3t t\u1EA1o ti\u1EBFp theo...`,
        );
        await sleep2(actualDelay);
      }
    }
    if (noTileWait && !shouldStop && completedCount > 0) {
      sendLog2(
        "Ch\u1EDD t\u1EA5t c\u1EA3 k\u1EBFt qu\u1EA3 ho\xE0n th\xE0nh...",
        "info",
      );
      try {
        const allTilesResult = await waitForNewTiles(
          initialPreTileIds,
          retrySettings.tileTimeout,
          initialPreFileNames,
          0,
          null,
          genType,
        );
        if (allTilesResult.tiles.length > 0) {
          const refIdSet = new Set(fileIds || []);
          const pureNewTiles = allTilesResult.tiles.filter(
            (id) => !refIdSet.has(id),
          );
          await sleep2(800);
          const successTiles = [];
          const failedTileIds = [];
          const skippedTiles = [];
          for (const tid of pureNewTiles) {
            const tile = _getTileById2(tid);
            const status = detectTileStatus2(tile);
            if (status === "failed") {
              failedTileIds.push(tid);
            } else if (status === "success" && tile) {
              successTiles.push(tid);
            } else {
              skippedTiles.push(tid);
            }
          }
          if (skippedTiles.length > 0) {
            sendLog2(
              `\u26A0\uFE0F ${skippedTiles.length} tile ch\u01B0a ready (processing/missing) \u2014 b\u1ECF qua download`,
              "warn",
            );
          }
          allResultTileIds.push(...successTiles);
          if (successTiles.length > 0 && autoDownload) {
            sendLog2(
              `\u0110ang t\u1EA3i ${successTiles.length} file [${downloadResolution.toUpperCase()}]...`,
              "info",
            );
            const successSet = new Set(successTiles);
            let downloadedCount = 0;
            for (let ti = 0; ti < pureNewTiles.length; ti++) {
              const tid = pureNewTiles[ti];
              if (!successSet.has(tid)) continue;
              const promptIdx = Math.floor(ti / quantity);
              const promptForTile =
                prompts[promptIdx] || prompts[0] || "parallel-batch";
              const ok = await downloadGeneratedTile(tid, promptForTile);
              if (ok) downloadedCount++;
              else
                sendLog2(
                  `\u26A0\uFE0F T\u1EA3i th\u1EA5t b\u1EA1i cho prompt #${promptIdx + 1}`,
                  "warn",
                );
              await sleep2(200);
            }
            sendLog2(
              `\u0110\xE3 t\u1EA3i ${downloadedCount}/${successTiles.length} file`,
              downloadedCount === successTiles.length ? "success" : "warn",
            );
          }
          _clickedRetryTileIds.clear();
          if (failedTileIds.length > 0 && retrySettings.maxRetries > 0) {
            const failedPromptIndices = [];
            for (let ti = 0; ti < pureNewTiles.length; ti++) {
              if (failedTileIds.includes(pureNewTiles[ti])) {
                const promptIdx = Math.floor(ti / quantity);
                if (
                  promptIdx < prompts.length &&
                  !failedPromptIndices.includes(promptIdx)
                ) {
                  failedPromptIndices.push(promptIdx);
                }
              }
            }
            sendLog2(
              `${failedTileIds.length} \u1EA3nh th\u1EA5t b\u1EA1i (${failedPromptIndices.length} prompt), click "Th\u1EED l\u1EA1i"...`,
              "warn",
            );
            let remainingFailed = [...failedTileIds];
            for (
              let btnRetry = 1;
              btnRetry <= retrySettings.maxRetries &&
              remainingFailed.length > 0 &&
              !shouldStop;
              btnRetry++
            ) {
              sendLog2(
                `Click "Th\u1EED l\u1EA1i" l\u1EA7n ${btnRetry} cho ${remainingFailed.length} tile...`,
                "warn",
              );
              sendRetryStatus2(
                `Click Retry (${btnRetry}/${retrySettings.maxRetries})`,
              );
              const btnResult = await retryFailedTilesViaButton(
                remainingFailed,
                retrySettings.tileTimeout,
              );
              if (btnResult.succeeded.length > 0) {
                allResultTileIds.push(...btnResult.succeeded);
                sendLog2(
                  `Retry button th\xE0nh c\xF4ng: ${btnResult.succeeded.length} \u1EA3nh`,
                  "success",
                );
                for (const tid of btnResult.succeeded) {
                  await downloadGeneratedTile(
                    tid,
                    prompts[0] || "parallel-batch",
                  );
                  await sleep2(200);
                }
              }
              remainingFailed = btnResult.stillFailed;
            }
            if (remainingFailed.length > 0 && !shouldStop) {
              const allFailedPromptIndices = [];
              for (let ti = 0; ti < pureNewTiles.length; ti++) {
                if (remainingFailed.includes(pureNewTiles[ti])) {
                  const promptIdx = Math.floor(ti / quantity);
                  if (
                    promptIdx < prompts.length &&
                    !allFailedPromptIndices.includes(promptIdx)
                  ) {
                    allFailedPromptIndices.push(promptIdx);
                  }
                }
              }
              const fullyFailedPromptIndices = allFailedPromptIndices.filter(
                (promptIdx) => {
                  const startTile = promptIdx * quantity;
                  const endTile = Math.min(
                    startTile + quantity,
                    pureNewTiles.length,
                  );
                  for (let ti = startTile; ti < endTile; ti++) {
                    if (!remainingFailed.includes(pureNewTiles[ti]))
                      return false;
                  }
                  return true;
                },
              );
              if (fullyFailedPromptIndices.length > 0) {
                sendLog2(
                  `[Retry L2] ${fullyFailedPromptIndices.length} prompt t\u1EA5t c\u1EA3 tiles fail - \u0110ang g\u1EEDi l\u1EA1i...`,
                  "warn",
                );
                sendRetryStatus2("G\u1EEDi l\u1EA1i Prompt");
                for (
                  let ri = 0;
                  ri < fullyFailedPromptIndices.length && !shouldStop;
                  ri++
                ) {
                  const promptIdx = fullyFailedPromptIndices[ri];
                  const retryPrompt = prompts[promptIdx];
                  sendLog2(
                    `[Retry L2] G\u1EEDi l\u1EA1i prompt ${ri + 1}/${fullyFailedPromptIndices.length}: "${retryPrompt.substring(0, 40)}..."`,
                    "warn",
                  );
                  let editor = getEditor2();
                  if (!editor) break;
                  await clearEditor(editor);
                  await sleep2(getClearEditorDelay2());
                  let retryFileIds = [];
                  if (
                    refImageMode === "mention" &&
                    mentionData &&
                    mentionData[promptIdx]
                  ) {
                    const promptMentionData = mentionData[promptIdx];
                    if (
                      promptMentionData.refImages &&
                      promptMentionData.refImages.length > 0
                    ) {
                      retryFileIds = promptMentionData.refImages
                        .filter((ref) => ref.file_id)
                        .map((ref) => ref.file_id);
                    }
                  } else if (refImageMode === "none") {
                    retryFileIds = [];
                  } else if (refImageMode === "sequential" || refPerPrompt) {
                    retryFileIds = Array.isArray(refFileIdsPerPrompt)
                      ? refFileIdsPerPrompt[promptIdx] || []
                      : fileIds[promptIdx]
                        ? [fileIds[promptIdx]]
                        : [];
                  } else {
                    retryFileIds = fileIds || [];
                  }
                  if (
                    retryFileIds.length > 0 &&
                    !(await _attachRequiredRefs(retryFileIds))
                  ) {
                    sendLog2(
                      `[Retry L2] Kh\xF4ng th\u1EC3 g\xE0i \u0111\u1EE7 ref cho prompt #${promptIdx + 1} \u2014 b\u1ECF submit`,
                      "error",
                    );
                    failedCount++;
                    _incrementDailyStat2("flow_fail");
                    failedPrompts.push({
                      index: promptIdx,
                      prompt: retryPrompt,
                      error: "Reference attachment failed",
                      timestamp: Date.now(),
                    });
                    continue;
                  }
                  editor = getEditor2();
                  if (!editor) break;
                  await insertText(editor, retryPrompt);
                  await sleep2(getSubmitDelay2());
                  const retryPreTileIds = getUniqueTileIds2(true);
                  const retryPreFileNames = getExistingFileNames2();
                  const submitResult = await FlowDriverRegistry.resolveForUrl(
                    location.href,
                  )?.driver?.invoke("submit", { timeoutMs: 3e4 });
                  if (!submitResult?.success) {
                    sendLog2(
                      `[Retry L2] V2 submit ch\u01B0a x\xE1c nh\u1EADn: ${submitResult?.error || "FLOW_V2_DRIVER_UNAVAILABLE"}`,
                      "error",
                    );
                    failedCount++;
                    _incrementDailyStat2("flow_fail");
                    failedPrompts.push({
                      index: promptIdx,
                      prompt: retryPrompt,
                      error: submitResult?.error || "V2 submit failed",
                      timestamp: Date.now(),
                    });
                    continue;
                  }
                  await sleep2(getAfterSubmitDelay2());
                  const retryResult = await waitForNewTiles(
                    retryPreTileIds,
                    retrySettings.tileTimeout,
                    retryPreFileNames,
                    0,
                    null,
                    genType,
                  );
                  if (retryResult.tiles.length > 0) {
                    const retryNewTiles = retryResult.tiles.filter(
                      (id) => !refIdSet.has(id),
                    );
                    const retrySuccessTiles = retryNewTiles.filter((tid) => {
                      const tile = _getTileById2(tid);
                      return detectTileStatus2(tile) !== "failed";
                    });
                    if (retrySuccessTiles.length > 0) {
                      allResultTileIds.push(...retrySuccessTiles);
                      if (autoDownload) {
                        for (const tid of retrySuccessTiles) {
                          await downloadGeneratedTile(tid, retryPrompt);
                          await sleep2(200);
                        }
                      }
                      sendLog2(
                        `[Retry L2] G\u1EEDi l\u1EA1i th\xE0nh c\xF4ng: ${retrySuccessTiles.length}/${retryNewTiles.length} \u1EA3nh`,
                        "success",
                      );
                    }
                    if (retrySuccessTiles.length < retryNewTiles.length) {
                      const fbFailCount =
                        retryNewTiles.length - retrySuccessTiles.length;
                      sendLog2(
                        `[Retry L2] ${fbFailCount} tile v\u1EABn fail sau g\u1EEDi l\u1EA1i`,
                        "warn",
                      );
                      if (retrySuccessTiles.length === 0) {
                        failedCount++;
                        _incrementDailyStat2("flow_fail");
                        failedPrompts.push({
                          index: promptIdx,
                          prompt: retryPrompt,
                          error: "Retry failed",
                          timestamp: Date.now(),
                        });
                      }
                    }
                  } else {
                    sendLog2(
                      `[Retry L2] G\u1EEDi l\u1EA1i th\u1EA5t b\u1EA1i: "${retryPrompt.substring(0, 40)}..."`,
                      "error",
                    );
                    failedCount++;
                    _incrementDailyStat2("flow_fail");
                    failedPrompts.push({
                      index: promptIdx,
                      prompt: retryPrompt,
                      error: "Retry failed",
                      timestamp: Date.now(),
                    });
                  }
                  if (ri < fullyFailedPromptIndices.length - 1)
                    await sleep2(getDelayBetweenPromptsMs2());
                }
              }
              const partialFailPromptIndices = allFailedPromptIndices.filter(
                (idx) => !fullyFailedPromptIndices.includes(idx),
              );
              if (partialFailPromptIndices.length > 0) {
                const partialFailCount = remainingFailed.filter((tid) => {
                  const ti = pureNewTiles.indexOf(tid);
                  const promptIdx = Math.floor(ti / quantity);
                  return partialFailPromptIndices.includes(promptIdx);
                }).length;
                sendLog2(
                  `${partialFailCount} tile fail (partial) \u2014 \u0111\xE3 t\u1EA3i ${successTiles.length} tile th\xE0nh c\xF4ng`,
                  "warn",
                );
              }
            }
          } else if (failedTileIds.length > 0) {
            const failedPromptSet = new Set();
            for (let ti = 0; ti < pureNewTiles.length; ti++) {
              if (failedTileIds.includes(pureNewTiles[ti])) {
                const promptIdx = Math.floor(ti / quantity);
                if (
                  promptIdx < prompts.length &&
                  !failedPromptSet.has(promptIdx)
                ) {
                  failedPromptSet.add(promptIdx);
                  failedCount++;
                  _incrementDailyStat2("flow_fail");
                  failedPrompts.push({
                    index: promptIdx,
                    prompt: prompts[promptIdx],
                    error: "Google Flow error",
                    timestamp: Date.now(),
                  });
                }
              }
            }
            sendLog2(
              `${failedTileIds.length} \u1EA3nh th\u1EA5t b\u1EA1i (${failedPromptSet.size} prompt) - Retry b\u1ECB kh\xF3a`,
              "warn",
            );
          }
        } else {
          sendLog2(
            "\u26A0\uFE0F Kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3 m\u1EDBi \u0111\u1EC3 t\u1EA3i",
            "warn",
          );
        }
      } catch (e) {
        sendLog2(
          "L\u1ED7i khi ch\u1EDD/t\u1EA3i k\u1EBFt qu\u1EA3: " + e.message,
          "error",
        );
      }
    }
    if (!shouldStop) {
      if (prompts.length > 0 && completedCount === 0 && failedCount === 0) {
        failedCount = 1;
        failedPrompts.push({
          index: 0,
          prompt: prompts[0],
          error: "No prompt completed",
          timestamp: Date.now(),
        });
      }
      if (failedCount > 0) {
        sendLog2(
          `\u26A0\uFE0F Ho\xE0n t\u1EA5t: ${completedCount} th\xE0nh c\xF4ng, ${failedCount} th\u1EA5t b\u1EA1i`,
          "warn",
        );
      } else {
        sendLog2(
          "\u{1F389} Ho\xE0n t\u1EA5t t\u1EA5t c\u1EA3 prompts!",
          "success",
        );
      }
      notifyCompletion(
        "Toby Flow",
        `Ho\xE0n t\u1EA5t: ${completedCount}/${prompts.length} prompts`,
      );
    }
    isRunning = false;
    isPaused = false;
    ExecutionBlocker.hide();
    try {
      FloatingTracker.updateLegacy({
        owner: payload._owner || "prompts",
        label: payload._label || "Auto Gen",
        status: shouldStop ? "stopped" : "completed",
        current: completedCount,
        total: prompts.length,
        failed: failedCount,
        startedAt: _startedAt,
      });
    } catch (e) {
      console.warn(
        "[runAutoPrompt] FloatingTracker.updateLegacy error:",
        e.message,
      );
    }
    try {
      chrome.runtime
        .sendMessage({
          action: "promptExecutionComplete",
          completedCount,
          failedCount,
          totalCount: prompts.length,
          failedPrompts: failedPrompts.length > 0 ? failedPrompts : [],
        })
        .catch(() => {});
    } catch (e) {}
    const resultMedia = allResultTileIds
      .map((id) => _extractTypedTileRecord2(_getTileById2(id), null))
      .filter(Boolean);
    return {
      success: true,
      completedCount,
      failedCount,
      totalCount: prompts.length,
      uploadedFileIds: fileIds,
      resultTileIds: allResultTileIds,
      resultMedia,
      preTileIds: lastPreTileIds,
      preFileNames: lastPreFileNames ? Array.from(lastPreFileNames) : null,
    };
  }
  var _FLOW_SETTINGS_KEY = "tobyflow_settings_applied_v2";
  var _flowSettingsApplied =
    sessionStorage.getItem(_FLOW_SETTINGS_KEY) === "true";
  try {
    sessionStorage.removeItem("tobyflow_settings_applied");
  } catch (_) {}
  var _flowV2PageSettingsInFlight = null;
  var _flowV2PageSettingsAppliedKey = null;
  var _flowV2PageSettingsFailedKey = null;
  async function _ensureFlowV2PageSettingsApplied(options = {}) {
    const projectReady = await _ensureFlowV2ProjectMediaReady();
    if (!projectReady.success) return false;
    const path = location.pathname;
    const key = JSON.stringify([
      path,
      options.viewMode || "grid",
      options.gridSize || "small",
      options.showDetails ?? true,
    ]);
    const active = _flowV2PageSettingsInFlight;
    if (active) {
      if (active.key === key) return active.promise;
      await active.promise;
      if (location.pathname !== path) return false;
      return _ensureFlowV2PageSettingsApplied(options);
    }
    if (_flowV2PageSettingsAppliedKey === key) return true;
    if (_flowV2PageSettingsFailedKey === key) return false;
    _flowV2PageSettingsFailedKey = null;
    _flowV2PageSettingsAppliedKey = null;
    const operation = { key, promise: null };
    operation.promise = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (location.pathname !== path) return false;
        if (await _applyFlowV2PageSettingsOnce(options, path)) {
          if (location.pathname !== path) return false;
          _flowV2PageSettingsAppliedKey = key;
          console.log(
            "[FlowPageSettings] setup verified",
            JSON.stringify({ path, attempt: attempt + 1 }),
          );
          return true;
        }
        if (attempt === 0) await sleep2(250);
      }
      if (location.pathname === path) _flowV2PageSettingsFailedKey = key;
      console.info(
        "[TobyFlow] Flow V2 page settings or menu close failed after 2 attempts",
      );
      return false;
    })();
    _flowV2PageSettingsInFlight = operation;
    try {
      return await operation.promise;
    } finally {
      if (_flowV2PageSettingsInFlight === operation)
        _flowV2PageSettingsInFlight = null;
    }
  }
  async function _applyFlowV2PageSettingsOnce(
    { viewMode = "grid", gridSize = "small", showDetails = true } = {},
    expectedPath = location.pathname,
  ) {
    const samePage = () => location.pathname === expectedPath;
    if (!samePage()) return false;
    const triggerCfg = _getDynamicSelector2("page_settings_trigger");
    const rootSelector = _selStr2("page_settings_root");
    const triggerSelector = triggerCfg?.selectors?.length
      ? triggerCfg.selectors.join(", ")
      : null;
    if (!triggerSelector || !rootSelector || !triggerCfg?.icon_text)
      return false;
    const trigger = Array.from(document.querySelectorAll(triggerSelector)).find(
      (button) =>
        _findIconInElement2(button)?.textContent?.trim() ===
        triggerCfg.icon_text,
    );
    if (!trigger) return false;
    let root = _flowV2VisiblePageSettingsRoot2(rootSelector);
    if (!root) {
      simulateClick2(trigger);
      const deadline = Date.now() + 3e3;
      while (!root && Date.now() < deadline) {
        await sleep2(80);
        if (!samePage()) return false;
        root = _flowV2VisiblePageSettingsRoot2(rootSelector);
      }
    }
    if (!root) return false;
    const gridCfg = _getDynamicSelector2("page_settings_grid_view");
    const sizeCfg = _getDynamicSelector2("page_settings_grid_size");
    const radioSelector = gridCfg?.selectors?.length
      ? gridCfg.selectors.join(", ")
      : null;
    const sizeSelector = sizeCfg?.selectors?.length
      ? sizeCfg.selectors.join(", ")
      : null;
    const sizeLabels = Array.isArray(sizeCfg?.values?.[gridSize])
      ? sizeCfg.values[gridSize]
      : [];
    const getGrid = () => {
      const current = _flowV2VisiblePageSettingsRoot2(rootSelector);
      return viewMode === "grid" && current && radioSelector
        ? Array.from(current.querySelectorAll(radioSelector)).find(
            (button) =>
              _findIconInElement2(button)?.textContent?.trim() ===
              gridCfg.icon_text,
          )
        : null;
    };
    const getSize = () => {
      const current = _flowV2VisiblePageSettingsRoot2(rootSelector);
      if (!current || !sizeSelector) return null;
      const matched = Array.from(current.querySelectorAll(sizeSelector)).find(
        (button) => sizeLabels.includes((button.textContent || "").trim()),
      );
      if (matched) return matched;
      const fallback = sizeCfg?.first_item_fallback;
      if (
        fallback?.enabled !== true ||
        fallback.value !== gridSize ||
        !Array.isArray(fallback.group_selectors) ||
        !fallback.group_selectors.length
      )
        return null;
      const groups = Array.from(
        current.querySelectorAll(fallback.group_selectors.join(", ")),
      );
      if (groups.length !== 1) return null;
      const first = groups[0].querySelector(sizeSelector);
      if (
        !first ||
        first.disabled ||
        first.getAttribute("aria-disabled") === "true"
      )
        return null;
      return first;
    };
    const getDetails = () => {
      const current = _flowV2VisiblePageSettingsRoot2(rootSelector);
      return current ? _q2("show_tile_details_setting", current) : null;
    };
    const expectedDetails = showDetails ? "true" : "false";
    for (const [resolve, attribute, expected] of [
      [getGrid, gridCfg?.attribute_selected || "aria-checked", "true"],
      [getSize, sizeCfg?.attribute_selected || "aria-checked", "true"],
      [getDetails, "aria-checked", expectedDetails],
    ]) {
      if (!samePage()) return false;
      const control = resolve();
      if (control && control.getAttribute(attribute) !== expected) {
        simulateClick2(control);
        await sleep2(250);
      }
    }
    if (!samePage()) return false;
    const verified =
      getGrid()?.getAttribute(gridCfg?.attribute_selected || "aria-checked") ===
        "true" &&
      getSize()?.getAttribute(sizeCfg?.attribute_selected || "aria-checked") ===
        "true" &&
      getDetails()?.getAttribute("aria-checked") === expectedDetails;
    let closed = false;
    const closeDeadline = Date.now() + 1200;
    const liveTrigger = Array.from(
      document.querySelectorAll(triggerSelector),
    ).find(
      (button) =>
        _findIconInElement2(button)?.textContent?.trim() ===
        triggerCfg.icon_text,
    );
    if (liveTrigger && _flowV2VisiblePageSettingsRoot2(rootSelector))
      simulateClick2(liveTrigger);
    while (Date.now() < closeDeadline) {
      if (!samePage()) return false;
      if (!_flowV2VisiblePageSettingsRoot2(rootSelector)) {
        closed = true;
        break;
      }
      await sleep2(80);
    }
    if (!samePage()) return false;
    if (!closed) {
      const liveRoot = _flowV2VisiblePageSettingsRoot2(rootSelector);
      const escapeTarget = liveRoot?.contains(document.activeElement)
        ? document.activeElement
        : liveRoot;
      escapeTarget?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      escapeTarget?.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      const escapeDeadline = Date.now() + 800;
      while (Date.now() < escapeDeadline) {
        if (!samePage()) return false;
        if (!_flowV2VisiblePageSettingsRoot2(rootSelector)) {
          closed = true;
          break;
        }
        await sleep2(80);
      }
    }
    if (verified && closed) {
      _flowSettingsApplied = true;
      try {
        sessionStorage.setItem(_FLOW_SETTINGS_KEY, "true");
      } catch (_) {}
      console.log("[TobyFlow] Flow V2 page settings applied and menu closed");
    } else if (verified) {
      console.warn(
        "[TobyFlow] Flow V2 page settings applied but menu is still visible",
      );
    }
    console.log(
      "[FlowPageSettings] verification",
      JSON.stringify({
        path: expectedPath,
        verified,
        closed,
        grid:
          getGrid()?.getAttribute(
            gridCfg?.attribute_selected || "aria-checked",
          ) || null,
        size:
          getSize()?.getAttribute(
            sizeCfg?.attribute_selected || "aria-checked",
          ) || null,
        details: getDetails()?.getAttribute("aria-checked") || null,
      }),
    );
    return verified && closed;
  }
  async function _ensureFlowAgentModeOff() {
    if (_flowPageContext?.driverKey === "flow_v2") {
      const wasOn2 = _isFlowAgentModeOn2().on;
      const result = await _ensureFlowV2AgentReady({
        steps: ["mode"],
        waitForEditor: false,
      });
      return { ...result, found: wasOn2, wasOn: wasOn2 };
    }
    const btn = _findFlowAgentButton2();
    if (!btn) {
      console.log(
        "[FlowAgent] Button not found (Flow ch\u01B0a c\xF3 t\xEDnh n\u0103ng ho\u1EB7c config missing) \u2014 skip",
      );
      return { found: false, wasOn: false, success: true };
    }
    const cfg = _getDynamicSelector2("flow_agent_toggle_button");
    const onValue = cfg?.aria_pressed_on || "true";
    const wasOn = (btn.getAttribute("aria-pressed") || "").trim() === onValue;
    if (!wasOn) {
      console.log("[FlowAgent] \u2713 Already OFF");
      return { found: true, wasOn: false, success: true };
    }
    console.log(
      "[FlowAgent] \u{1F504} Agent mode ON \u2192 clicking toggle OFF...",
    );
    try {
      simulateClick2(btn);
    } catch (e) {
      console.warn("[FlowAgent] Click failed:", e.message);
      return { found: true, wasOn: true, success: false };
    }
    await sleep2(400);
    const verifyBtn = _findFlowAgentButton2();
    const stillOn = verifyBtn
      ? (verifyBtn.getAttribute("aria-pressed") || "").trim() === onValue
      : false;
    if (stillOn) {
      console.warn(
        "[FlowAgent] \u26A0 Click KH\xD4NG turn off \u2014 button v\u1EABn aria-pressed=" +
          onValue,
      );
      return { found: true, wasOn: true, success: false };
    }
    console.log("[FlowAgent] \u2713 Agent mode turned OFF successfully");
    return { found: true, wasOn: true, success: true };
  }
  async function _waitForFlowEditorReady(
    maxWaitMs = 5e3,
    pollIntervalMs = 200,
  ) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const editor = typeof getEditor2 === "function" ? getEditor2() : null;
        if (editor) {
          return Date.now() - startTime;
        }
      } catch (_) {}
      await sleep2(pollIntervalMs);
    }
    return null;
  }
  async function _ensureFlowAgentInstructionDone() {
    if (_flowPageContext?.driverKey === "flow_v2") {
      const wasOpen = _isFlowAgentInstructionDialogOpen2().open;
      const result = await _ensureFlowV2AgentReady({
        steps: ["instruction"],
        waitForEditor: false,
      });
      return { ...result, found: wasOpen, wasOpen };
    }
    const btn = _findFlowAgentInstructionDoneButton2();
    if (!btn) {
      return { found: false, wasOpen: false, success: true };
    }
    console.log(
      '[FlowAgentInstruction] \u{1F504} Instruction dialog detected \u2192 clicking "Xong"...',
    );
    try {
      simulateClick2(btn);
    } catch (e) {
      console.warn("[FlowAgentInstruction] simulateClick failed:", e.message);
    }
    await sleep2(400);
    let verifyBtn = _findFlowAgentInstructionDoneButton2();
    if (!verifyBtn) {
      console.log(
        "[FlowAgentInstruction] \u2713 Instruction dialog closed (simulateClick)",
      );
      return { found: true, wasOpen: true, success: true };
    }
    console.log(
      "[FlowAgentInstruction] simulateClick ch\u01B0a work \u2192 fallback native click()",
    );
    try {
      verifyBtn.click();
    } catch (e) {
      console.warn("[FlowAgentInstruction] native click failed:", e.message);
    }
    await sleep2(400);
    verifyBtn = _findFlowAgentInstructionDoneButton2();
    if (!verifyBtn) {
      console.log(
        "[FlowAgentInstruction] \u2713 Instruction dialog closed (native click)",
      );
      return { found: true, wasOpen: true, success: true };
    }
    console.warn(
      "[FlowAgentInstruction] \u26A0 C\u1EA3 simulateClick + native click KH\xD4NG \u0111\xF3ng dialog",
    );
    return { found: true, wasOpen: true, success: false };
  }
  async function _ensureFlowChatAgentClosed() {
    if (_flowPageContext?.driverKey === "flow_v2") {
      const wasOpen = _isFlowChatAgentPanelOpen2().open;
      const result = await _ensureFlowV2AgentReady({
        steps: ["panel"],
        waitForEditor: false,
      });
      return { ...result, found: wasOpen, wasOpen };
    }
    const btn = _findFlowChatAgentCloseButton2();
    if (!btn) {
      return { found: false, wasOpen: false, success: true };
    }
    console.log(
      "[FlowChatAgent] \u{1F504} Chat panel detected \u2192 clicking close...",
    );
    console.log(
      "[FlowChatAgent] Button matched (full outerHTML):",
      btn.outerHTML,
    );
    console.log(
      "[FlowChatAgent] Button parent class:",
      btn.parentElement?.className,
      "| grandparent:",
      btn.parentElement?.parentElement?.className,
    );
    console.log(
      "[FlowChatAgent] Button state: disabled=",
      btn.disabled,
      "| aria-disabled=",
      btn.getAttribute("aria-disabled"),
      "| pointer-events=",
      getComputedStyle(btn).pointerEvents,
    );
    const verifyClosed = () => !_findFlowChatAgentCloseButton2();
    try {
      btn.focus();
      btn.click();
    } catch (e) {
      console.warn("[FlowChatAgent] focus+click failed:", e.message);
    }
    await sleep2(400);
    if (verifyClosed()) {
      console.log("[FlowChatAgent] \u2713 Chat panel closed (focus+click)");
      return { found: true, wasOpen: true, success: true };
    }
    let curBtn = _findFlowChatAgentCloseButton2();
    if (!curBtn) return { found: true, wasOpen: true, success: true };
    console.log(
      "[FlowChatAgent] focus+click ch\u01B0a work \u2192 try simulateClick",
    );
    try {
      simulateClick2(curBtn);
    } catch (e) {
      console.warn("[FlowChatAgent] simulateClick failed:", e.message);
    }
    await sleep2(400);
    if (verifyClosed()) {
      console.log("[FlowChatAgent] \u2713 Chat panel closed (simulateClick)");
      return { found: true, wasOpen: true, success: true };
    }
    curBtn = _findFlowChatAgentCloseButton2();
    if (!curBtn) return { found: true, wasOpen: true, success: true };
    const iconEl = _findIconInElement2(curBtn);
    if (iconEl) {
      console.log(
        "[FlowChatAgent] simulateClick ch\u01B0a work \u2192 try click on child icon",
      );
      try {
        iconEl.click();
        simulateClick2(iconEl);
      } catch (e) {
        console.warn("[FlowChatAgent] icon click failed:", e.message);
      }
      await sleep2(400);
      if (verifyClosed()) {
        console.log("[FlowChatAgent] \u2713 Chat panel closed (icon click)");
        return { found: true, wasOpen: true, success: true };
      }
    }
    curBtn = _findFlowChatAgentCloseButton2();
    if (!curBtn) return { found: true, wasOpen: true, success: true };
    console.log(
      "[FlowChatAgent] icon click ch\u01B0a work \u2192 try MouseEvent with view+composed",
    );
    try {
      const rect = curBtn.getBoundingClientRect();
      const evtInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      curBtn.dispatchEvent(new MouseEvent("mousedown", evtInit));
      curBtn.dispatchEvent(new MouseEvent("mouseup", evtInit));
      curBtn.dispatchEvent(new MouseEvent("click", evtInit));
    } catch (e) {
      console.warn("[FlowChatAgent] MouseEvent dispatch failed:", e.message);
    }
    await sleep2(400);
    if (verifyClosed()) {
      console.log("[FlowChatAgent] \u2713 Chat panel closed (MouseEvent+view)");
      return { found: true, wasOpen: true, success: true };
    }
    curBtn = _findFlowChatAgentCloseButton2();
    if (!curBtn) return { found: true, wasOpen: true, success: true };
    console.log(
      "[FlowChatAgent] MouseEvent ch\u01B0a work \u2192 try Escape key",
    );
    try {
      const escEvt = () =>
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
      curBtn.dispatchEvent(escEvt());
      document.dispatchEvent(escEvt());
      document.body.dispatchEvent(escEvt());
    } catch (e) {
      console.warn("[FlowChatAgent] Escape dispatch failed:", e.message);
    }
    await sleep2(400);
    if (verifyClosed()) {
      console.log("[FlowChatAgent] \u2713 Chat panel closed (Escape key)");
      return { found: true, wasOpen: true, success: true };
    }
    curBtn = _findFlowChatAgentCloseButton2();
    if (!curBtn) return { found: true, wasOpen: true, success: true };
    const parent = curBtn.parentElement;
    if (parent) {
      console.log(
        "[FlowChatAgent] Escape ch\u01B0a work \u2192 try click on parent wrapper",
      );
      try {
        parent.click();
        simulateClick2(parent);
      } catch (e) {
        console.warn("[FlowChatAgent] parent click failed:", e.message);
      }
      await sleep2(400);
      if (verifyClosed()) {
        console.log("[FlowChatAgent] \u2713 Chat panel closed (parent click)");
        return { found: true, wasOpen: true, success: true };
      }
    }
    console.warn(
      "[FlowChatAgent] \u26A0 T\u1EA5t c\u1EA3 6 click strategies KH\xD4NG \u0111\xF3ng panel \u2014 b\xE1o c\xE1o bug DOM",
    );
    return { found: true, wasOpen: true, success: false };
  }
  async function ensureFlowSettingsApplied() {
    if (_flowPageContext?.driverKey === "flow_v2") {
      return _ensureFlowV2PageSettingsApplied();
    }
    try {
      const instructionResult = await _ensureFlowAgentInstructionDone();
      if (instructionResult.wasOpen && instructionResult.success) {
        console.log(
          "[TobyFlow] \u2713 Agent instruction dialog closed (was open, now closed)",
        );
      } else if (instructionResult.wasOpen && !instructionResult.success) {
        console.warn(
          "[TobyFlow] \u26A0 Agent instruction Done click FAILED \u2014 dialog v\u1EABn m\u1EDF",
        );
      } else if (instructionResult.found) {
        console.log(
          "[TobyFlow] \u2713 Agent instruction dialog already closed",
        );
      }
    } catch (e) {
      console.warn(
        "[TobyFlow] _ensureFlowAgentInstructionDone failed (non-blocking):",
        e.message,
      );
    }
    let _panelActioned = false;
    try {
      const panelResult = await _ensureFlowChatAgentClosed();
      if (panelResult.wasOpen && panelResult.success) {
        console.log("[TobyFlow] \u2713 Chat agent panel auto-closed");
        _panelActioned = true;
      } else if (panelResult.wasOpen && !panelResult.success) {
        console.warn(
          "[TobyFlow] \u26A0 Chat agent panel close FAILED \u2014 panel v\u1EABn m\u1EDF",
        );
      } else if (panelResult.found) {
        console.log("[TobyFlow] \u2713 Chat agent panel already closed");
      }
    } catch (e) {
      console.warn(
        "[TobyFlow] _ensureFlowChatAgentClosed failed (non-blocking):",
        e.message,
      );
    }
    if (_panelActioned) {
      await sleep2(1500);
    }
    try {
      const agentResult = await _ensureFlowAgentModeOff();
      if (agentResult.wasOn && agentResult.success) {
        console.log(
          "[TobyFlow] \u2713 Agent mode auto-disabled (was ON, now OFF)",
        );
      } else if (agentResult.wasOn && !agentResult.success) {
        console.warn(
          "[TobyFlow] \u26A0 Agent mode click toggle FAILED \u2014 v\u1EABn ON",
        );
      } else if (agentResult.found) {
        console.log("[TobyFlow] \u2713 Agent mode already OFF");
      } else {
        console.log(
          "[TobyFlow] Agent button not found (Flow ch\u01B0a rollout t\xEDnh n\u0103ng ho\u1EB7c page ch\u01B0a ready)",
        );
      }
    } catch (e) {
      console.warn(
        "[TobyFlow] _ensureFlowAgentModeOff failed (non-blocking):",
        e.message,
      );
    }
    window._tobyAgentChainLastRunAt = Date.now();
    if (_flowSettingsApplied) {
      console.log(
        "[TobyFlow] ensureFlowSettingsApplied: settings menu SKIPPED (already applied in this session)",
      );
      return;
    }
    let flowSettingsBtn = null;
    const allIcons = _findIconsInElement2(document);
    for (const icon of allIcons) {
      if (icon.textContent.trim() === "settings_2") {
        flowSettingsBtn = icon.closest("button");
        break;
      }
    }
    if (!flowSettingsBtn) {
      console.log(
        "[TobyFlow] ensureFlowSettingsApplied: settings_2 icon ch\u01B0a c\xF3 \u2014 Flow page ch\u01B0a ready, retry next call",
      );
      return;
    }
    const _fsNow = Date.now();
    if (
      window._flowSettingsLastAttempt &&
      _fsNow - window._flowSettingsLastAttempt < 2e4
    ) {
      return;
    }
    window._flowSettingsLastAttempt = _fsNow;
    console.log(
      "[TobyFlow] ensureFlowSettingsApplied: applying Grid view + show tile details + grid size SMALL (1-time)...",
    );
    simulateClick2(flowSettingsBtn);
    await sleep2(500);
    if (_qa2("flow_tab_slider_trigger").length === 0) {
      console.log(
        "[TobyFlow] ensureFlowSettingsApplied: settings menu ch\u01B0a render (Flow \u0111ang bootstrap) \u2014 retry next call",
      );
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return;
    }
    const tabTriggers = _qa2("flow_tab_slider_trigger");
    const gridLabels = _getFlowLocaleStrings2("grid_view_tab", "aria_labels");
    let gridClicked = false;
    for (const trigger of tabTriggers) {
      const label =
        trigger.getAttribute("aria-label") || trigger.textContent.trim();
      if (
        _ariaLabelMatches2(label, gridLabels) &&
        trigger.getAttribute("data-state") !== "active"
      ) {
        simulateClick2(trigger);
        await sleep2(300);
        gridClicked = true;
        break;
      }
    }
    let detailsClicked = false;
    const showDetailsLabels = _getFlowLocaleStrings2(
      "show_tile_details_setting",
      "text_match",
    );
    const toggleOnLabels = _getFlowLocaleStrings2(
      "toggle_state_button",
      "aria_labels_on",
    );
    const settingRows = _qa2("show_tile_details_setting");
    for (const row of settingRows) {
      if (_textIncludesAny2(row.textContent, showDetailsLabels)) {
        const toggleBtns = _qa2("flow_tab_slider_trigger", row);
        for (const btn of toggleBtns) {
          const label =
            btn.getAttribute("aria-label") || btn.textContent.trim();
          if (
            _ariaLabelMatches2(label, toggleOnLabels) &&
            btn.getAttribute("data-state") !== "active"
          ) {
            simulateClick2(btn);
            await sleep2(300);
            detailsClicked = true;
            break;
          }
        }
        break;
      }
    }
    let gridSizeClicked = false;
    for (const btn of _qa2("grid_size_small_button")) {
      if (btn.getAttribute("data-state") !== "active") {
        simulateClick2(btn);
        await sleep2(300);
        gridSizeClicked = true;
        break;
      }
    }
    const verifyGridActive = () => {
      const triggers = _qa2("flow_tab_slider_trigger");
      for (const t of triggers) {
        const label = t.getAttribute("aria-label") || t.textContent.trim();
        if (
          _ariaLabelMatches2(label, gridLabels) &&
          t.getAttribute("data-state") === "active"
        ) {
          return true;
        }
      }
      return false;
    };
    const verifyDetailsOn = () => {
      const rows = _qa2("show_tile_details_setting");
      for (const row of rows) {
        if (_textIncludesAny2(row.textContent, showDetailsLabels)) {
          const toggleBtns = _qa2("flow_tab_slider_trigger", row);
          for (const btn of toggleBtns) {
            const label =
              btn.getAttribute("aria-label") || btn.textContent.trim();
            if (
              _ariaLabelMatches2(label, toggleOnLabels) &&
              btn.getAttribute("data-state") === "active"
            ) {
              return true;
            }
          }
          return false;
        }
      }
      return false;
    };
    const verifyGridSizeSmall = () => {
      const smalls = _qa2("grid_size_small_button");
      if (!smalls.length) return true;
      for (const t of smalls) {
        if (t.getAttribute("data-state") === "active") return true;
      }
      return false;
    };
    const gridActive = verifyGridActive();
    const detailsOn = verifyDetailsOn();
    const gridSizeSmall = verifyGridSizeSmall();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    simulateClick2(document.body);
    await sleep2(300);
    if (gridActive && detailsOn && gridSizeSmall) {
      _flowSettingsApplied = true;
      sessionStorage.setItem(_FLOW_SETTINGS_KEY, "true");
      console.log(
        `[TobyFlow] ensureFlowSettingsApplied: DONE \u2713 (gridClicked=${gridClicked}, detailsClicked=${detailsClicked}, gridSizeClicked=${gridSizeClicked}, verify gridActive=${gridActive}, detailsOn=${detailsOn}, gridSizeSmall=${gridSizeSmall})`,
      );
    } else {
      console.warn(
        `[TobyFlow] ensureFlowSettingsApplied: INCOMPLETE \u2014 gridActive=${gridActive}, detailsOn=${detailsOn}, gridSizeSmall=${gridSizeSmall} (gridClicked=${gridClicked}, detailsClicked=${detailsClicked}, gridSizeClicked=${gridSizeClicked}). Flag NOT set, s\u1EBD retry l\u1EA7n call sau. C\xF3 th\u1EC3 do server config 'grid_view_tab.aria_labels' / 'toggle_state_button.aria_labels_on' thi\u1EBFu locale hi\u1EC7n t\u1EA1i, ho\u1EB7c Flow React state ch\u01B0a settle sau 300ms.`,
      );
    }
  }
  async function _getBrowserZoom() {
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getBrowserZoom" }, (r) => {
          resolve(
            chrome.runtime.lastError || typeof r?.zoom !== "number"
              ? null
              : r.zoom,
          );
        });
      });
    } catch (_) {
      return null;
    }
  }
  async function _setBrowserZoom(factor) {
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "setBrowserZoom", factor },
          (r) => {
            resolve(chrome.runtime.lastError ? false : !!r?.ok);
          },
        );
      });
    } catch (_) {
      return false;
    }
  }
  var _ZOOM_NOTICE_SVG =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  window._tobyFlowZoomScaleInv = 1;
  var _zoomGuardHeartbeatTimer = null;
  var _zoomGuardRefs = 0;
  _zoomGuardRecoverOnLoad2();
  async function _ensureZoomSessionActive() {
    const s = window._tobyFlowZoomSession;
    if (!s) return;
    _armZoomSessionDeadline2();
    if (!s.armed || s.active) return;
    const _detached = () => window._tobyFlowZoomSession !== s;
    s.restored = false;
    const o = await _getBrowserZoom();
    if (_detached()) return;
    if (o != null) {
      s.mode = "browser";
      s.original = o;
      await _setBrowserZoom(s.factor);
      s.guarded = (s.guarded || 0) + 1;
      _zoomGuardSet2(s.factor, s.original);
      if (_detached()) {
        await _restoreZoomOf(s);
        return;
      }
      await _waitZoomPaint2();
      if (_detached()) {
        await _restoreZoomOf(s);
        return;
      }
    } else {
      s.originalCss = document.body.style.zoom || "1";
      document.body.style.zoom = String(s.factor);
      s.mode = "css";
      if (_detached()) {
        await _restoreZoomOf(s);
        return;
      }
    }
    s.active = true;
    _applyZoomUx2(s.factor);
    _armZoomSessionDeadline2();
    console.log(
      `[TobyFlow] zoom session: zoom xu\u1ED1ng ${s.factor} (mode=${s.mode}) \u2014 gi\u1EEF su\u1ED1t batch`,
    );
  }
  async function _restoreZoomOf(s) {
    if (!s) return;
    while (s.guarded > 0) {
      s.guarded--;
      _zoomGuardClear2();
    }
    if (s.restored) return;
    if (!s.active && !s.mode) return;
    s.restored = true;
    try {
      if (s.mode === "browser") {
        const target =
          typeof s.original === "number" &&
          s.original > 0 &&
          s.original !== s.factor
            ? s.original
            : 1;
        await _setBrowserZoom(target);
        console.log(
          `[TobyFlow] zoom session: restore browser zoom \u2192 ${target}`,
        );
      } else if (s.mode === "css") {
        document.body.style.zoom =
          s.originalCss && s.originalCss !== String(s.factor)
            ? s.originalCss
            : "1";
        console.log(
          `[TobyFlow] zoom session: restore CSS zoom \u2192 ${document.body.style.zoom}`,
        );
      }
    } finally {
    }
  }
  async function _suspendZoomForManual() {
    const s = window._tobyFlowZoomSession;
    if (!s || !s.active) return false;
    try {
      if (s.mode === "browser") {
        const target =
          typeof s.original === "number" &&
          s.original > 0 &&
          s.original !== s.factor
            ? s.original
            : 1;
        await _setBrowserZoom(target);
      } else {
        document.body.style.zoom =
          s.originalCss && s.originalCss !== String(s.factor)
            ? s.originalCss
            : "1";
      }
      s.active = false;
      _clearZoomUx2();
      while (s.guarded > 0) {
        s.guarded--;
        _zoomGuardClear2();
      }
      console.log(
        "[TobyFlow] zoom session: SUSPEND cho manual submit (page v\u1EC1 normal, armed gi\u1EEF nguy\xEAn)",
      );
      return true;
    } catch (_) {
      return false;
    }
  }
  var _ZOOM_SESSION_DEADLINE_MS = 24e4;
  var _zoomSessionDeadlineTimer = null;
  async function _endZoomSession() {
    const s = window._tobyFlowZoomSession;
    if (_zoomSessionDeadlineTimer) {
      clearTimeout(_zoomSessionDeadlineTimer);
      _zoomSessionDeadlineTimer = null;
    }
    if (!s) return;
    window._tobyFlowZoomSession = null;
    _clearZoomUx2();
    await _restoreZoomOf(s);
  }
  async function _stabilizeFlowResultViewport() {
    const startedAt = Date.now();
    const scroller = _findTilesScroller2()?.el || null;
    if (!scroller)
      return { success: true, moved: false, reason: "no_scroll_container" };
    const before = Number(scroller.scrollTop || 0);
    let settleReason = "already_at_top";
    if (before > 1) {
      await new Promise((resolve) => {
        let settled = false;
        let observer = null;
        const finish = (reason) => {
          if (settled) return;
          settled = true;
          settleReason = reason;
          observer?.disconnect();
          clearTimeout(fallback);
          resolve();
        };
        const fallback = setTimeout(() => finish("timeout"), 1e3);
        if (typeof MutationObserver === "function") {
          observer = new MutationObserver(() => finish("dom_mutation"));
          observer.observe(scroller, { childList: true, subtree: true });
        }
        scroller.scrollTop = 0;
        if (Number(scroller.scrollTop || 0) > 1) finish("scroll_not_reset");
      });
    }
    _invalidateTileCache2();
    const after = Number(scroller.scrollTop || 0);
    console.log(
      "[FlowV2ResultIdentity] stabilized result viewport before baseline",
      JSON.stringify({
        before,
        after,
        moved: before > 1,
        elapsedMs: Date.now() - startedAt,
        settleReason,
        mounted: _getCachedTiles2().length,
        ..._flowCommandMemorySnapshot2(),
      }),
    );
    return { success: true, moved: before > 1, before, after };
  }
  var _flowScanRequests = new Map();
  async function _awaitFlowScanWork(promise, control) {
    if (!control) return promise;
    const observed = Promise.resolve(promise);
    observed.catch(() => {});
    control.assertActive();
    let onAbort;
    try {
      return await Promise.race([
        observed,
        new Promise((_, reject) => {
          onAbort = () => reject(control.signal.reason);
          control.signal.addEventListener("abort", onAbort, { once: true });
          if (control.signal.aborted) onAbort();
        }),
      ]);
    } finally {
      control.signal.removeEventListener("abort", onAbort);
    }
  }
  var _flowTileScanTail = Promise.resolve();
  var _flowTileScanActiveDepth = 0;
  async function ensureFlowTilesLoaded(
    force = false,
    targetFileNames = [],
    options = {},
  ) {
    const scanStopEpoch = _flowStopEpoch;
    let releaseTurn;
    const myTurn = new Promise((resolve) => {
      releaseTurn = resolve;
    });
    const previousTurn = _flowTileScanTail;
    _flowTileScanTail = previousTurn.catch(() => {}).then(() => myTurn);
    const queuedAt = Date.now();
    console.log("[WorkflowRescan] scan queued", {
      targets: targetFileNames.length,
      reason: options.reason || "targeted_or_explicit_dom_request",
    });
    try {
      await _awaitFlowScanWork(
        previousTurn.catch(() => {}),
        options.scanControl,
      );
    } catch (error) {
      releaseTurn();
      throw error;
    }
    console.log("[WorkflowRescan] scan acquired", {
      waitMs: Date.now() - queuedAt,
    });
    try {
      if (options?.shouldAbort?.())
        throw new DOMException("FLOW_SCAN_STOPPED", "AbortError");
      if (
        (_flowStopEpoch !== scanStopEpoch || shouldStop) &&
        options?.allowAfterStop !== true
      ) {
        console.log(
          "[WorkflowRescan] scan cancelled before start (execution stopped)",
        );
        return {};
      }
      _flowTileScanActiveDepth++;
      try {
        return await _ensureFlowTilesLoadedUnlocked(force, targetFileNames, {
          ...options,
          _scanStopEpoch: scanStopEpoch,
        });
      } finally {
        _flowTileScanActiveDepth = Math.max(0, _flowTileScanActiveDepth - 1);
      }
    } catch (error) {
      if (
        error?.name === "AbortError" &&
        error?.message === "FLOW_SCAN_STOPPED"
      ) {
        console.log(
          "[WorkflowRescan] scan cancelled during traversal (execution stopped)",
        );
        return {};
      }
      throw error;
    } finally {
      console.log("[WorkflowRescan] scan released", {
        elapsedMs: Date.now() - queuedAt,
      });
      _invalidateTileCache2();
      _pruneDetachedFlowV2ResultOwners2();
      releaseTurn();
    }
  }
  async function _ensureFlowTilesLoadedUnlocked(
    force = false,
    targetFileNames = [],
    options = {},
  ) {
    const assertScanActive = () => {
      options.scanControl?.assertActive();
      if (options.deadline && Date.now() >= options.deadline)
        throw Object.assign(new Error("FLOW_REF_SCAN_TIMEOUT"), {
          code: "FLOW_REF_SCAN_TIMEOUT",
          noRetry: true,
        });
      if (options?.shouldAbort?.())
        throw new DOMException("FLOW_SCAN_STOPPED", "AbortError");
      if (
        options?.allowAfterStop !== true &&
        ((Number.isInteger(options?._scanStopEpoch) &&
          _flowStopEpoch !== options._scanStopEpoch) ||
          shouldStop)
      ) {
        throw new DOMException("FLOW_SCAN_STOPPED", "AbortError");
      }
    };
    assertScanActive();
    if (!(await _ensureSelectorConfigReadyForAction(3e3))) {
      console.warn(
        "[TobyFlow] ensureFlowTilesLoaded: timeout waiting for config",
      );
      return;
    }
    _tileSelectorCache = null;
    let selector = _getTileSelectorString2();
    const rawTiles = selector ? document.querySelectorAll(selector) : [];
    console.log(
      `[TobyFlow] ensureFlowTilesLoaded DEBUG: force=${force}, selector="${selector}", configuredTiles=${rawTiles.length}, URL=${location.href.substring(0, 80)}`,
    );
    const tilesBeforeCount = selector
      ? document.querySelectorAll(selector).length
      : 0;
    const targets = Array.isArray(targetFileNames)
      ? targetFileNames.filter(Boolean)
      : [];
    const hasTargets = targets.length > 0;
    const excludedPersistentMediaIds = new Set(
      (Array.isArray(options?.excludedPersistentMediaIds)
        ? options.excludedPersistentMediaIds
        : []
      ).filter((identity) => _isFlowV2AsbIdentity2(identity)),
    );
    const candidateCollector = Array.isArray(options?.candidateCollector)
      ? options.candidateCollector
      : null;
    const candidateMediaType = String(
      options?.candidateMediaType || "",
    ).toLowerCase();
    const scanToExhaustion = options?.scanToExhaustion === true;
    const scanDeadline = Math.max(0, Number(options?.deadline) || 0);
    const positionCache =
      _ensureFlowTilesLoadedUnlocked._positionCache ||
      (_ensureFlowTilesLoadedUnlocked._positionCache = new Map());
    const positionKey = (target) =>
      `${_flowPageContext?.projectId || location.href}|${target}`;
    const currentZoom = () =>
      window._tobyFlowZoomSession?.active
        ? Number(window._tobyFlowZoomSession.factor)
        : null;
    const collectedCandidateIds = new Set(
      candidateCollector
        ?.map((entry) => entry?.persistentMediaId)
        .filter(Boolean) || [],
    );
    const foundTiles = {};
    let lastFoundEl = null;
    const _scan = () => {
      if (!hasTargets) return 0;
      _pruneDetachedFlowV2ResultOwners2();
      const want = new Set(targets.filter((t) => !(t in foundTiles)));
      if (want.size === 0 && !scanToExhaustion) return targets.length;
      const observedScroller = _findTilesScroller2()?.el;
      const observedPosition =
        observedScroller &&
        Number(observedScroller.scrollHeight || 0) > 0 &&
        typeof observedScroller.getBoundingClientRect === "function"
          ? {
              top: Number(observedScroller.scrollTop || 0),
              scrollHeight: Number(observedScroller.scrollHeight || 0),
              clientHeight: Number(observedScroller.clientHeight || 0),
              zoom: currentZoom(),
            }
          : null;
      const scrollerRect = observedPosition
        ? observedScroller.getBoundingClientRect()
        : null;
      for (const tile of document.querySelectorAll(_getTileSelectorString2())) {
        const persistentMediaId = _getPersistentMediaId2(tile);
        if (excludedPersistentMediaIds.has(persistentMediaId)) continue;
        const mediaType = detectMediaType2(tile);
        if (typeof options.onTileSeen === "function") options.onTileSeen(tile);
        if (
          candidateCollector &&
          _isFlowV2AsbIdentity2(persistentMediaId) &&
          (!candidateMediaType || mediaType === candidateMediaType) &&
          !collectedCandidateIds.has(persistentMediaId)
        ) {
          const typed = _extractTypedTileRecord2(tile, null);
          const thumbnail =
            typed?.thumbnail || extractThumbnailUrl2(tile) || "";
          const videoUrl =
            mediaType === "video"
              ? typed?.resultUrl ||
                extractVideoUrl2(tile) ||
                _deriveFlowV2VideoUrlFromPoster2(thumbnail) ||
                ""
              : "";
          candidateCollector.push({
            persistentMediaId,
            runtimeId: _getTileRuntimeId2(tile),
            mediaType,
            displayName: _getTileDisplayName2(tile) || "",
            thumbnail,
            videoUrl,
            encounterOrder: candidateCollector.length,
          });
          collectedCandidateIds.add(persistentMediaId);
        }
        const runtimeId = _getTileRuntimeId2(tile);
        const identities = [...extractAllFileNames2(tile), runtimeId].filter(
          Boolean,
        );
        if (
          _flowPageContext?.driverKey === "flow_v2" &&
          persistentMediaId &&
          typeof _getObservedFlowMediaMetadata2 === "function"
        ) {
          const observed = _getObservedFlowMediaMetadata2(persistentMediaId);
          if (observed?.type === "video" || observed?.type === "image") {
            if (observed.media_uuid) identities.push(observed.media_uuid);
            if (observed.persistent_media_id)
              identities.push(observed.persistent_media_id);
          }
        }
        const tileRect = scrollerRect && tile.getBoundingClientRect?.();
        if (
          tileRect &&
          tileRect.bottom > scrollerRect.top &&
          tileRect.top < scrollerRect.bottom
        ) {
          for (const identity of identities) {
            if (!(
              _isFlowV2AsbIdentity2(identity) ||
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                identity,
              )
            ))
              continue;
            const key = positionKey(identity);
            positionCache.delete(key);
            positionCache.set(key, observedPosition);
          }
          while (positionCache.size > 4096)
            positionCache.delete(positionCache.keys().next().value);
        }
        const displayName = _getTileDisplayName2(tile);
        const displayTarget = displayName
          ? [...want].find((target) =>
              _flowDisplayNamesCorrelate2(target, displayName),
            )
          : null;
        const matched =
          identities.find((identity) => want.has(identity)) || displayTarget;
        if (matched && want.has(matched)) {
          foundTiles[matched] = runtimeId;
          lastFoundEl = tile;
          want.delete(matched);
          if (want.size === 0 && !scanToExhaustion) break;
        }
      }
      return Object.keys(foundTiles).length;
    };
    if (hasTargets && !scanToExhaustion && _scan() === targets.length) {
      console.log(
        `[TobyFlow] ensureFlowTilesLoaded: t\u1EA5t c\u1EA3 ${targets.length} target \u0111\xE3 c\xF3 tr\xEAn DOM, skip`,
      );
      return foundTiles;
    }
    if (!force && !hasTargets && tilesBeforeCount >= 50) {
      console.log(
        `[TobyFlow] ensureFlowTilesLoaded: skipping zoom (${tilesBeforeCount} tiles already loaded)`,
      );
      return foundTiles;
    }
    console.info(
      "[FlowDomScan] traversal required",
      JSON.stringify({
        reason: options.reason || "targeted_or_explicit_dom_request",
        targets: targets.length,
        force,
        mounted: tilesBeforeCount,
        catalogAvailable:
          typeof _flowObservedVideoIdentities !== "undefined" &&
          _flowObservedVideoIdentities.size > 0,
        identityLookupOnly: false,
        absenceIsDeletion: false,
        ..._flowCommandMemorySnapshot2(),
      }),
    );
    assertScanActive();
    if (document.visibilityState !== "visible") {
      const activation = await _awaitFlowScanWork(
        chrome.runtime.sendMessage({
          action: "activateFlowTabForExecution",
          forMediaScan: true,
          focusWindow: false,
        }),
        options.scanControl,
      );
      console.log("[WorkflowRescan] scan activation", {
        ok: activation?.ok === true,
        tabId: activation?.tabId,
        targets: targets.length,
        visibility: document.visibilityState,
      });
      if (!activation?.ok)
        throw new Error(activation?.error || "Flow scan activation failed");
    } else {
      console.log(
        "[WorkflowRescan] scan activation skipped: Flow tab already visible",
      );
    }
    assertScanActive();
    const _inSession = !!(
      window._tobyFlowZoomSession && window._tobyFlowZoomSession.armed
    );
    const _bzOrig = _inSession
      ? null
      : await _awaitFlowScanWork(_getBrowserZoom(), options.scanControl);
    assertScanActive();
    const _useBz = !_inSession && _bzOrig != null;
    const originalCssZoom = document.body.style.zoom || "1";
    let _perCallGuarded = false;
    let _perCallZoomApplied = false;
    const _applyZoom = async (f) => {
      assertScanActive();
      if (_inSession) {
        await _ensureZoomSessionActive();
        return;
      }
      if (_useBz) {
        await _setBrowserZoom(f);
        _perCallZoomApplied = true;
        if (!_perCallGuarded) {
          _perCallGuarded = true;
          _zoomGuardSet2(f, _bzOrig);
        }
        await _waitZoomPaint2();
      } else document.body.style.zoom = String(f);
      _perCallZoomApplied = true;
      if (hasTargets) _showZoomNotice2("scanningRefImages", f);
      _setCounterScale2(f);
    };
    const _restoreZoom = async () => {
      if (_inSession) return;
      if (!_perCallZoomApplied) return;
      if (_useBz) {
        await _setBrowserZoom(_bzOrig);
        if (_perCallGuarded) {
          _perCallGuarded = false;
          _zoomGuardClear2();
        }
      } else document.body.style.zoom = originalCssZoom;
      _clearCounterScale2();
      if (hasTargets) _hideZoomNotice2();
    };
    const _scCfg = _getDynamicSelector2("flow_scroll_container");
    const _scClosestAttr = _scCfg?.closest_attribute || null;
    let _scWarned = false;
    const _getScroll = () => {
      const f = _findTilesScroller2();
      if (f.verified) return f.el;
      const legacy = _scClosestAttr
        ? _q2("flow_scroll_container")?.closest(_scClosestAttr)
        : null;
      if (legacy && legacy.scrollHeight - legacy.clientHeight >= 50)
        return legacy;
      if (!_scWarned) {
        _scWarned = true;
        console.info(
          "[TobyFlow] ensureFlowTilesLoaded: kh\xF4ng c\xF3 v\xF9ng cu\u1ED9n \u2014 ti\u1EBFp t\u1EE5c b\u1EB1ng viewport hi\u1EC7n t\u1EA1i",
        );
      }
      return f.el;
    };
    const _seenNames = new Set();
    const _noteSeen = () => {
      try {
        for (const t of document.querySelectorAll(_getTileSelectorString2())) {
          for (const identity of extractAllFileNames2(t))
            _seenNames.add(identity);
        }
      } catch (_) {}
      return _seenNames.size;
    };
    const _scanAfterScroll = async () => {
      assertScanActive();
      if (_scan() === targets.length && !scanToExhaustion) return true;
      const scroller = _getScroll();
      const mountedTile = document.querySelector(_getTileSelectorString2());
      const rowWrapper =
        mountedTile?.parentElement?.parentElement?.parentElement;
      const observedRoot =
        rowWrapper && scroller?.contains?.(rowWrapper) ? rowWrapper : scroller;
      if (
        typeof window.requestAnimationFrame === "function" ||
        typeof MutationObserver === "function"
      ) {
        await new Promise((resolve) => {
          let settled = false;
          let observer = null;
          let frameId = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            if (frameId != null) window.cancelAnimationFrame?.(frameId);
            clearTimeout(fallback);
            options.scanControl?.signal.removeEventListener("abort", finish);
            resolve();
          };
          const fallback = setTimeout(finish, 500);
          options.scanControl?.signal.addEventListener("abort", finish, {
            once: true,
          });
          if (options.scanControl?.signal.aborted) {
            finish();
            return;
          }
          if (
            typeof MutationObserver === "function" &&
            observedRoot?.nodeType === 1
          ) {
            observer = new MutationObserver(() => queueMicrotask(finish));
            observer.observe(observedRoot, { childList: true, subtree: true });
          }
          if (typeof window.requestAnimationFrame === "function") {
            frameId = window.requestAnimationFrame(() => {
              if (!settled) frameId = window.requestAnimationFrame(finish);
            });
          }
        });
      } else await _awaitFlowScanWork(sleep2(250), options.scanControl);
      assertScanActive();
      return _scan() === targets.length && !scanToExhaustion;
    };
    try {
      if (hasTargets) {
        if (options?.recentOnly === true) {
          const sc = _getScroll();
          const origin = Number(sc.scrollTop || 0);
          if (origin > 1) {
            sc.scrollTop = 0;
            await _awaitFlowScanWork(sleep2(400), options.scanControl);
            _scan();
            if (Object.keys(foundTiles).length < targets.length)
              sc.scrollTop = origin;
          }
          return foundTiles;
        }
        const sessionFactor = window._tobyFlowZoomSession?.factor || 0.3;
        const zoomSteps = [_inSession ? sessionFactor : 0.25];
        let done = false;
        const directScroller = _getScroll();
        if (
          directScroller &&
          directScroller.scrollHeight - directScroller.clientHeight >= 50
        ) {
          const startedAt = Date.now();
          const origin = Number(directScroller.scrollTop || 0);
          const initialMaxScroll = Math.max(
            0,
            Number(directScroller.scrollHeight || 0) -
              Number(directScroller.clientHeight || 0),
          );
          const step = Math.max(
            Math.floor(
              Number(directScroller.clientHeight || window.innerHeight || 800) *
                0.85,
            ),
            500,
          );
          let steps = 0;
          let wrappedToTop = false;
          if (targets.length === 1 && !scanToExhaustion) {
            const cached = positionCache.get(positionKey(targets[0]));
            const sameScale = cached?.zoom === currentZoom();
            const sizeDelta = cached?.scrollHeight
              ? Math.abs(directScroller.scrollHeight - cached.scrollHeight) /
                cached.scrollHeight
              : Infinity;
            if (
              sameScale &&
              sizeDelta <= 0.15 &&
              Math.abs(cached.top - origin) > 1
            ) {
              directScroller.scrollTop = cached.top;
              done = await _scanAfterScroll();
              console.info(
                "[FlowDomScan] observed position probe",
                JSON.stringify({
                  hit: done,
                  cachedTop: cached.top,
                  actualTop: Number(directScroller.scrollTop || 0),
                  sizeDelta: Math.round(sizeDelta * 1e3) / 1e3,
                  elapsedMs: Date.now() - startedAt,
                }),
              );
              if (!done) {
                positionCache.delete(positionKey(targets[0]));
                directScroller.scrollTop = origin;
              }
            }
          }
          const walk = async (stopAt) => {
            for (let phaseSteps = 0; phaseSteps < 120 && !done; phaseSteps++) {
              assertScanActive();
              if (scanDeadline && Date.now() >= scanDeadline) return false;
              const before = Number(directScroller.scrollTop || 0);
              if (phaseSteps > 0 && phaseSteps % 8 === 0) {
                console.info(
                  "[FlowDomScan] traversal progress",
                  JSON.stringify({
                    reason:
                      options.reason || "targeted_or_explicit_dom_request",
                    steps,
                    scrollTop: before,
                    maxScroll: Math.max(
                      0,
                      Number(directScroller.scrollHeight || 0) -
                        Number(directScroller.clientHeight || 0),
                    ),
                    found: Object.keys(foundTiles).length,
                    elapsedMs: Date.now() - startedAt,
                    mounted: _getCachedTiles2().length,
                    ..._flowCommandMemorySnapshot2(),
                  }),
                );
              }
              if (Number.isFinite(stopAt) && before >= stopAt - 1) return true;
              const beforeHeight = Number(directScroller.scrollHeight || 0);
              directScroller.scrollTop = Number.isFinite(stopAt)
                ? Math.min(before + step, stopAt)
                : before + step;
              steps++;
              if (await _scanAfterScroll()) {
                done = true;
                break;
              }
              const after = Number(directScroller.scrollTop || 0);
              const atEnd =
                after + Number(directScroller.clientHeight || 0) >=
                Number(directScroller.scrollHeight || 0) - 2;
              if (after <= before + 1) return true;
              if (atEnd) {
                await _awaitFlowScanWork(sleep2(500), options.scanControl);
                assertScanActive();
                if (_scan() === targets.length && !scanToExhaustion) {
                  done = true;
                  break;
                }
                if (
                  Number(directScroller.scrollHeight || 0) <=
                    beforeHeight + 2 &&
                  Number(directScroller.scrollTop || 0) +
                    Number(directScroller.clientHeight || 0) >=
                    Number(directScroller.scrollHeight || 0) - 2
                )
                  return true;
              }
            }
            return false;
          };
          done = await _scanAfterScroll();
          if (
            !done &&
            origin <= initialMaxScroll * 0.2 &&
            options.reason === "web_download_target_missing" &&
            targets.length === 1 &&
            !scanToExhaustion
          ) {
            const probeStart = Date.now();
            directScroller.scrollTop = directScroller.scrollHeight;
            done = await _scanAfterScroll();
            console.info(
              "[FlowDomScan] download bottom probe",
              JSON.stringify({
                hit: done,
                origin,
                actualTop: Number(directScroller.scrollTop || 0),
                elapsedMs: Date.now() - probeStart,
              }),
            );
            if (!done) {
              directScroller.scrollTop = origin;
              done = await _scanAfterScroll();
            }
          }
          if (!done) {
            const maxScroll = Math.max(
              0,
              Number(directScroller.scrollHeight || 0) -
                Number(directScroller.clientHeight || 0),
            );
            const startAtTop = origin > 1 && origin > maxScroll / 2;
            console.info(
              "[FlowDomScan] traversal start",
              JSON.stringify({
                reason: options.reason || "targeted_or_explicit_dom_request",
                origin,
                maxScroll,
                startAtTop,
              }),
            );
            if (startAtTop) {
              wrappedToTop = true;
              directScroller.scrollTop = 0;
              done = await _scanAfterScroll();
            }
            const reachedEnd = done ? false : await walk(null);
            if (
              !done &&
              reachedEnd &&
              origin > 1 &&
              !startAtTop &&
              (!scanDeadline || Date.now() < scanDeadline)
            ) {
              wrappedToTop = true;
              directScroller.scrollTop = 0;
              done = await _scanAfterScroll();
              if (!done) await walk(origin);
            }
          }
          console.info(
            "[FlowDomScan] current-scale traversal",
            JSON.stringify({
              steps,
              found: Object.keys(foundTiles).length,
              targetCount: targets.length,
              elapsedMs: Date.now() - startedAt,
              startTop: origin,
              wrappedToTop,
              mounted: _getCachedTiles2().length,
              ..._flowCommandMemorySnapshot2(),
            }),
          );
        }
        for (let s = 0; s < zoomSteps.length && !done; s++) {
          assertScanActive();
          await _applyZoom(zoomSteps[s]);
          await _awaitFlowScanWork(
            sleep2(s === 0 ? 1200 : 800),
            options.scanControl,
          );
          assertScanActive();
          const sc = _getScroll();
          if (s === 0) {
            sc.scrollTop = 0;
            await _awaitFlowScanWork(sleep2(250), options.scanControl);
            if (_scan() === targets.length && !scanToExhaustion) {
              done = true;
              break;
            }
          }
          const step = Math.max(
            Math.floor((window.innerHeight || 800) * 0.8),
            500,
          );
          const MAX_STEPS = 400;
          let stepCount = 0;
          let stale = 0;
          let lastSeen = _noteSeen();
          for (; stepCount < MAX_STEPS; stepCount++) {
            assertScanActive();
            if (scanDeadline && Date.now() >= scanDeadline) {
              console.warn("[WorkflowRescan] scan deadline reached", {
                stepCount,
                targets: targets.length,
              });
              break;
            }
            const before = sc.scrollTop;
            const beforeHeight = sc.scrollHeight;
            sc.scrollTop = before + step;
            await _awaitFlowScanWork(sleep2(300), options.scanControl);
            assertScanActive();
            if (_scan() === targets.length && !scanToExhaustion) {
              done = true;
              break;
            }
            const moved = sc.scrollTop > before + 1;
            const seen = _noteSeen();
            stale = seen > lastSeen ? 0 : stale + 1;
            lastSeen = seen;
            if (!moved) {
              const atEnd2 =
                sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
              if (!atEnd2)
                console.info(
                  `[TobyFlow] ensureFlowTilesLoaded: scrollTop kh\xF4ng \u0111\u1ED5i (${before}) \u2192 d\u1EEBng nh\xE1nh cu\u1ED9n n\xE0y`,
                );
              break;
            }
            const atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
            if (atEnd) {
              await _awaitFlowScanWork(sleep2(800), options.scanControl);
              assertScanActive();
              if (_scan() === targets.length && !scanToExhaustion) {
                done = true;
                break;
              }
              const settledSeen = _noteSeen();
              const grew =
                sc.scrollHeight > beforeHeight + 2 || settledSeen > lastSeen;
              stale = settledSeen > lastSeen ? 0 : stale;
              lastSeen = settledSeen;
              if (
                !grew &&
                sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2
              )
                break;
            }
          }
          console.log(
            `[TobyFlow] ensureFlowTilesLoaded: zoom=${zoomSteps[s]} cu\u1ED9n ${stepCount} b\u01B0\u1EDBc, \u0111\xE3 th\u1EA5y ${_seenNames.size} \u1EA3nh kh\xE1c nhau`,
          );
          if (done) {
            const _zlbl = _inSession
              ? (window._tobyFlowZoomSession?.factor ?? "session")
              : zoomSteps[s];
            console.log(
              `[TobyFlow] ensureFlowTilesLoaded: capture \u0111\u1EE7 ${targets.length} target \u1EDF zoom=${_zlbl}`,
            );
            break;
          }
        }
        if (!done && Object.keys(foundTiles).length < targets.length) {
          console.info(
            `[TobyFlow] ensureFlowTilesLoaded: capture ${Object.keys(foundTiles).length}/${targets.length} target sau single-pass`,
          );
        }
      } else {
        await _applyZoom(0.5);
        await _awaitFlowScanWork(sleep2(1500), options.scanControl);
        const sc = _getScroll();
        sc.scrollTop = sc.scrollHeight;
        await _awaitFlowScanWork(sleep2(800), options.scanControl);
        sc.scrollTop = 0;
        await _awaitFlowScanWork(sleep2(500), options.scanControl);
      }
      if (
        hasTargets &&
        targets.every((target) =>
          Object.prototype.hasOwnProperty.call(foundTiles, target),
        ) &&
        typeof options.onTargetsMounted === "function"
      ) {
        assertScanActive();
        await options.onTargetsMounted(foundTiles, {
          zoomApplied: _perCallZoomApplied,
        });
      }
    } finally {
      await _restoreZoom();
      if (_perCallZoomApplied) await sleep2(300);
      if (hasTargets && lastFoundEl && lastFoundEl.isConnected) {
        try {
          lastFoundEl.scrollIntoView({ block: "center" });
        } catch (_) {}
      }
    }
    const tilesAfterLoad = document.querySelectorAll(
      _getTileSelectorString2(),
    ).length;
    const scanMode = _perCallZoomApplied ? "after zoom" : "current-scale scan";
    console.log(
      `[TobyFlow] ensureFlowTilesLoaded: ${tilesBeforeCount} \u2192 ${tilesAfterLoad} tiles (${scanMode}${hasTargets ? `, captured=${Object.keys(foundTiles).length}/${targets.length}` : ""})`,
    );
    return foundTiles;
  }
  var _manualUserSkip = false;
  var _manualWaitAbort = false;
  const _FLOW_V2_GATE_SAFE_ACTIONS = new Set([
    "ping",
    "getFlowDriverContext",
    "enumerateFlowTiles",
    "getEditor",
    "getCurrentTileIds",
    "getRunningState",
    "getFailedPrompts",
    "getThumbnailsByIds",
    "findTileByFileName",
    "resolveVideoPlaybackUrl",
    "scanFlowImages",
    "extractTileIdentifiers",
    "scanGalleryTiles",
    "scanFlowTiles",
    "getDownloadCounter",
    "checkTilesExist",
    "checkFilesExist",
    "lookupFlowMediaCatalog",
    "correctStaleFileIds",
    "getProjectContext",
    "getFlowErrorState",
    "scanFlowProjects",
    "countInlineChips",
    "checkFlowAgentMode",
    "checkFlowChatAgentPanel",
    "checkFlowAgentInstructionDialog",
    "checkContentScriptAlive",
    "getPendingTileCount",
    "getTileStatuses",
    "scanNewTiles",
    "providerConfigUpdated",
    "providerApiConfigUpdated",
    "stopExecution",
    "cancelFlowScanRequest",
    "cancelFlowScans",
    "resetStop",
    "cancelFlowUpload",
    "pauseExecution",
    "resumeExecution",
    "cancelWaitUserSubmit",
    "pq:clearRetryTracking",
    "pq:chunkStatus",
    "pq:pauseExecution",
    "pq:apiAuthStatus",
    "pq:recoveryTrace",
    "pq:trackerUpdate",
    "pq:trackerHide",
    "pq:hideBlocker",
    "legacyTrackerUpdate",
    "hideCaptchaOverlay",
    "endFlowZoomSession",
    "zoomGuard:revoked",
    "cancelCropSelection",
    "flowCorrelationArm",
    "flowCorrelationWait",
    "flowCorrelationSnapshot",
    "flowCorrelationDisarm",
    "workflowEditorVisibility",
  ]);
  const _flowCorrelationNonce = crypto.randomUUID();
  const _flowCorrelationAttempts = new Map();
  const _FLOW_CORRELATION_MAX_RECEIPTS = 64;
  const _flowCorrelationUuidList = (values) =>
    Array.isArray(values)
      ? values
          .filter(
            (value) =>
              typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
          )
          .slice(0, 32)
      : [];
  window.addEventListener("TOBY_FLOW_V2_CORRELATION_RECEIPT", (event) => {
    const receipt = event.detail;
    if (
      !receipt ||
      receipt.schemaVersion !== 1 ||
      receipt.nonce !== _flowCorrelationNonce
    )
      return;
    const entry = _flowCorrelationAttempts.get(receipt.attemptId);
    if (
      !entry ||
      _expireFlowCorrelationAttempt2(receipt.attemptId, entry) ||
      receipt.projectId !== entry.projectId ||
      receipt.mediaType !== entry.mediaType
    )
      return;
    const allowedStages = new Set([
      "armed",
      "input_seen",
      "request_seen",
      "response_seen",
      "poll_seen",
      "result_seen",
      "acceptance_unknown",
    ]);
    if (
      !allowedStages.has(receipt.stage) ||
      !Number.isFinite(receipt.observedAt)
    )
      return;
    if (entry.receipts.length >= _FLOW_CORRELATION_MAX_RECEIPTS) return;
    const storedReceipt = Object.freeze({
      schemaVersion: 1,
      attemptId: receipt.attemptId,
      projectId: entry.projectId,
      mediaType: entry.mediaType,
      expectedQuantity: Math.max(
        1,
        Math.min(16, Number(receipt.expectedQuantity) || 1),
      ),
      stage: receipt.stage,
      matchKind: [
        "normalized_voice_text",
        "structured_ids",
        "plain_text",
      ].includes(receipt.matchKind)
        ? receipt.matchKind
        : null,
      structuredPromptVersion: receipt.structuredPromptVersion === 2 ? 2 : null,
      observerRevision: Number.isInteger(receipt.observerRevision)
        ? receipt.observerRevision
        : null,
      xhrHookActive: receipt.xhrHookActive === true,
      fetchHookActive: receipt.fetchHookActive === true,
      promptExact: receipt.promptExact === true,
      promptAnchorMatched: receipt.promptAnchorMatched === true,
      modelMatched: receipt.modelMatched === true,
      ratioMatched: receipt.ratioMatched === true,
      quantityMatched: receipt.quantityMatched === true,
      referencesMatched: receipt.referencesMatched === true,
      actualPromptLength: Math.max(
        0,
        Math.min(1e6, Number(receipt.actualPromptLength) || 0),
      ),
      actualReferenceCount: Math.max(
        0,
        Math.min(32, Number(receipt.actualReferenceCount) || 0),
      ),
      expectedReferenceCount: Math.max(
        0,
        Math.min(32, Number(receipt.expectedReferenceCount) || 0),
      ),
      observedAt: receipt.observedAt,
      sequence: ++entry.sequence,
      rpcId:
        typeof receipt.rpcId === "string" ? receipt.rpcId.slice(0, 32) : null,
      requestOrdinal: Number.isInteger(receipt.requestOrdinal)
        ? receipt.requestOrdinal
        : null,
      requestCardinality: Number.isInteger(receipt.requestCardinality)
        ? receipt.requestCardinality
        : null,
      requestIdentityCount: Number.isInteger(receipt.requestIdentityCount)
        ? Math.max(0, Math.min(64, receipt.requestIdentityCount))
        : 0,
      requestIdentityFingerprint:
        typeof receipt.requestIdentityFingerprint === "string" &&
        /^id-[0-9a-f]{8}$/.test(receipt.requestIdentityFingerprint)
          ? receipt.requestIdentityFingerprint
          : null,
      requestIdentityTokens: Array.isArray(receipt.requestIdentityTokens)
        ? receipt.requestIdentityTokens
            .filter(
              (value) =>
                typeof value === "string" && /^id-[0-9a-f]{8}$/.test(value),
            )
            .slice(0, 16)
        : [],
      transport: ["load", "error", "abort", "timeout"].includes(
        receipt.transport,
      )
        ? receipt.transport
        : null,
      reason: [
        "manual_interaction_during_dispatch",
        "generation_response_missing_ownership",
        "ambiguous_retired_request",
      ].includes(receipt.reason)
        ? receipt.reason
        : null,
      httpStatus: Number.isFinite(receipt.httpStatus) ? receipt.httpStatus : 0,
      rpcResponseMatched: receipt.rpcResponseMatched === true,
      identityCandidates: _flowCorrelationUuidList(receipt.identityCandidates),
      responseIdentityCount: Number.isInteger(receipt.responseIdentityCount)
        ? Math.max(0, Math.min(64, receipt.responseIdentityCount))
        : 0,
      responseCharacters: Math.max(
        0,
        Math.min(8 * 1024 * 1024, Number(receipt.responseCharacters) || 0),
      ),
      responseRootCount: Math.max(
        0,
        Math.min(4096, Number(receipt.responseRootCount) || 0),
      ),
      responseDecodedCount: Math.max(
        0,
        Math.min(4096, Number(receipt.responseDecodedCount) || 0),
      ),
      operationIds: _flowCorrelationUuidList(receipt.operationIds),
      mediaIds: _flowCorrelationUuidList(receipt.mediaIds),
      children: Array.isArray(receipt.children)
        ? receipt.children
            .filter(
              (child) =>
                child &&
                /^[0-9a-f-]{36}$/i.test(child.operationId || "") &&
                ["accepted", "processing", "completed", "failed"].includes(
                  child.status || (child.mediaId ? "completed" : ""),
                ) &&
                (child.mediaId == null ||
                  /^[0-9a-f-]{36}$/i.test(child.mediaId)) &&
                ((child.status || (child.mediaId ? "completed" : "")) !==
                  "completed" ||
                  /^[0-9a-f-]{36}$/i.test(child.mediaId || "")) &&
                (!["accepted", "processing"].includes(child.status) ||
                  /^[0-9a-f-]{36}$/i.test(child.mediaId || "")),
            )
            .slice(0, 16)
            .map((child) =>
              Object.freeze({
                operationId: String(child.operationId).toLowerCase(),
                mediaId: child.mediaId
                  ? String(child.mediaId).toLowerCase()
                  : null,
                status:
                  child.status || (child.mediaId ? "completed" : "failed"),
                ...Object.fromEntries(
                  ["thumbnail", "video_url"].flatMap((key) => {
                    try {
                      const value = child[key];
                      if (typeof value !== "string" || value.length > 8192)
                        return [];
                      const url = new URL(value);
                      const kind = key === "thumbnail" ? "image" : "video";
                      return url.protocol === "https:" &&
                        url.hostname === "flow-content.google" &&
                        url.pathname.toLowerCase() ===
                          `/${kind}/${String(child.mediaId).toLowerCase()}`
                        ? [[key, value]]
                        : [];
                    } catch (_) {
                      return [];
                    }
                  }),
                ),
                errorCodes: Array.isArray(child.errorCodes)
                  ? child.errorCodes
                      .filter(
                        (value) =>
                          typeof value === "string" &&
                          /^[A-Z][A-Z0-9_]{0,95}$/.test(value),
                      )
                      .slice(0, 12)
                  : [],
              }),
            )
        : [],
      errorCodes: Array.isArray(receipt.errorCodes)
        ? receipt.errorCodes
            .filter(
              (value) =>
                typeof value === "string" &&
                /^[A-Z][A-Z0-9_]{0,95}$/.test(value),
            )
            .slice(0, 12)
        : [],
      terminalErrorCodes: Array.isArray(receipt.terminalErrorCodes)
        ? receipt.terminalErrorCodes
            .filter(
              (value) =>
                typeof value === "string" &&
                /^[A-Z][A-Z0-9_]{0,95}$/.test(value),
            )
            .slice(0, 12)
        : [],
    });
    entry.receipts.push(storedReceipt);
    for (const waiter of [...entry.waiters]) {
      if (
        !waiter.stages.has(storedReceipt.stage) ||
        storedReceipt.sequence <= waiter.afterSequence
      )
        continue;
      entry.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(storedReceipt);
    }
  });
  try {
    injectSlateBridge2();
  } catch (e) {
    console.log("[TobyFlow] Bridge inject deferred:", e.message);
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "ping") {
      _flowPageContext =
        globalThis.FlowDriverRegistry?.describeUrl(location.href) || null;
      sendResponse({
        pong: true,
        contentRevision: _TOBYFLOW_CONTENT_REVISION,
        loadedAt: self.__tobyflowContentJsLoaded__,
        ..._flowPageContext,
      });
      return false;
    }
    const perfTrace = message._flowPerfTrace;
    const perfReceivedAt = perfTrace ? Date.now() : 0;
    if (perfTrace)
      console.info(
        "[FlowCommandTiming] received",
        JSON.stringify({
          action: message.action,
          id: perfTrace.id,
          deliveryMs: Math.max(
            0,
            perfReceivedAt - Number(perfTrace.sentAt || 0),
          ),
          visibility: document.visibilityState,
          ..._flowCommandMemorySnapshot2(),
        }),
      );
    const pageActions = new Set([
      "getFlowDriverContext",
      "getProjectContext",
      "scanFlowProjects",
      "openFlowProject",
      "getRunningState",
      "checkContentScriptAlive",
      "providerConfigUpdated",
      "providerApiConfigUpdated",
      "stopExecution",
      "cancelFlowScanRequest",
      "cancelFlowScans",
      "pq:hideBlocker",
      "pq:apiAuthStatus",
      "pq:recoveryTrace",
      "pq:trackerUpdate",
      "pq:trackerHide",
      "flowCorrelationDisarm",
      "endFlowZoomSession",
      "zoomGuard:revoked",
      "cancelWaitUserSubmit",
      "cancelCropSelection",
      "hideCaptchaOverlay",
      "workflowEditorVisibility",
    ]);
    const preparingProject =
      !!FlowDriverRegistry.projectIdForUrl(location.href) &&
      (["prepareFlowForGen", "runAutoPrompt"].includes(message.action) ||
        (message.action === "applyFlowPageSettings" &&
          !_isFlowMediaViewerOpen2()));
    if (
      !FlowDriverRegistry.isProjectEditor(location.href) &&
      !pageActions.has(message.action) &&
      !preparingProject
    ) {
      sendResponse({ success: false, error: "FLOW_PROJECT_REQUIRED" });
      return false;
    }
    const targetError = _verifyFlowTarget2(message);
    if (targetError) {
      sendResponse(targetError);
      return false;
    }
    if (_isFlowV2GateProtectedAction2(message)) {
      const gateState = _getFlowV2DriverGateState2();
      if (!gateState.enabled && gateState.error !== "FLOW_V2_CONFIG_MISSING") {
        sendResponse({
          success: false,
          error: gateState.error,
          driverKey: "flow_v2",
        });
        return false;
      }
    }
    const handlers = {
      workflowEditorVisibility: () => {
        if (typeof FloatingTracker === "undefined")
          return { success: true, tracker: false };
        FloatingTracker._workflowEditorVisible = message.open === true;
        if (FloatingTracker._workflowEditorVisible)
          FloatingTracker._closeGrid?.(true);
        return {
          success: true,
          tracker: true,
          open: FloatingTracker._workflowEditorVisible,
        };
      },
      cancelFlowUpload: () => {
        const requestId = String(message.uploadRequestId || "");
        if (!/^[0-9a-f-]{36}$/i.test(requestId))
          return { success: false, error: "UPLOAD_REQUEST_ID_INVALID" };
        _flowCancelledUploadRequests.add(requestId);
        const active = _flowActiveUploadRequests.get(requestId) || null;
        if (active) active.cancelled = true;
        setTimeout(
          () => {
            _flowCancelledUploadRequests.delete(requestId);
            if (_flowActiveUploadRequests.get(requestId) === active)
              _flowActiveUploadRequests.delete(requestId);
          },
          5 * 60 * 1e3,
        );
        console.log(
          "[FlowUploadCancel] requested",
          requestId,
          "matchedActive=",
          !!active,
        );
        return { success: true, matchedActive: !!active };
      },
      flowCorrelationArm: () => _armFlowCorrelation2(message),
      flowCorrelationWait: () => _waitFlowCorrelation2(message),
      flowCorrelationSnapshot: () => {
        const entry = _flowCorrelationAttempts.get(
          String(message.attemptId || ""),
        );
        return entry
          ? {
              success: true,
              receipts: entry.receipts.map((receipt) => ({ ...receipt })),
            }
          : { success: false, error: "CORRELATION_ATTEMPT_NOT_ARMED" };
      },
      flowCorrelationDisarm: () => _disarmFlowCorrelation2(message),
      getFlowDriverContext: () => ({
        success: true,
        ..._flowPageContext,
        compactLayout:
          _flowPageContext?.driverKey === "flow_v2" && _isFlowCompactLayout2(),
      }),
      enumerateFlowTiles: async () => {
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        if (!resolved?.driver)
          return { success: false, error: "FLOW_DRIVER_UNAVAILABLE" };
        return resolved.driver.invoke("enumerateTiles", {
          operationId: message.operationId || null,
        });
      },
      flowPreflight: async () => {
        const gateState = _getFlowV2DriverGateState2();
        if (!gateState.enabled)
          return {
            success: false,
            error: gateState.error,
            driverKey: "flow_v2",
          };
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        if (!resolved?.driver)
          return { success: false, error: "FLOW_DRIVER_UNAVAILABLE" };
        return resolved.driver.invoke("preflight", message);
      },
      runAutoPrompt: async () => {
        try {
          const result = await runAutoPrompt(message.payload);
          return result;
        } catch (err) {
          console.error("[runAutoPrompt] Unhandled error:", err);
          ExecutionBlocker.hide();
          isRunning = false;
          isPaused = false;
          const totalCount = message.payload?.prompts?.length || 1;
          try {
            FloatingTracker.updateLegacy({
              owner: message.payload?._owner || "prompts",
              label: message.payload?._label || "Auto Gen",
              status: "completed",
              current: 0,
              total: totalCount,
              failed: 1,
            });
          } catch (_) {}
          return {
            success: false,
            error: err.message,
            completedCount: 0,
            failedCount: 1,
            totalCount,
          };
        }
      },
      applySettings: async () => {
        console.log(
          `[content.js] applySettings message received:`,
          JSON.stringify({
            genType: message.genType,
            ratio: message.ratio,
            model: message.model,
            isFrames: message.isFrames,
            quantity: message.quantity,
            flowVideoDuration: message.flowVideoDuration,
          }),
        );
        const result = await applySettings(
          message.genType,
          message.ratio,
          message.model,
          message.isFrames,
          message.quantity,
          message.flowVideoDuration,
          message.modelAliases,
          message.flowVideoResolution,
          message.flowVideoResolutionDomValue,
          message.skipFlowDurationControl === true,
        );
        return result;
      },
      prepareFlowForGen: async () => {
        console.log(
          "[content.js] prepareFlowForGen: ensuring Flow editor ready (close panel + Agent OFF)...",
        );
        if (_flowPageContext?.driverKey === "flow_v2") {
          if (_isFlowMediaViewerOpen2() && !(await _exitFlowMediaViewer())) {
            return { success: false, error: "FLOW_VIEWER_NAVIGATING" };
          }
          const targetError2 = _verifyFlowTarget2(message);
          if (targetError2) return targetError2;
          const projectReady = await _ensureFlowV2ProjectMediaReady();
          if (!projectReady.success) return projectReady;
          const menuClosed = await _ensureFlowV2AddMenuClosed();
          if (!menuClosed.success) return menuClosed;
          const afterMenuTargetError = _verifyFlowTarget2(message);
          if (afterMenuTargetError) return afterMenuTargetError;
          const agentReady = await _ensureFlowV2AgentReady({
            projectActioned: projectReady.actioned === true,
          });
          if (!agentReady.success) return agentReady;
          const resolved = FlowDriverRegistry.resolveForUrl(location.href);
          const state = await resolved?.driver?.invoke("preflight", message);
          return state?.state === "ready"
            ? {
                ...agentReady,
                actioned:
                  projectReady.actioned ||
                  agentReady.actioned ||
                  menuClosed.actioned,
                success: true,
                driverKey: "flow_v2",
                preflight: state.state,
              }
            : {
                success: false,
                error: state?.error || "V2_PREFLIGHT_BLOCKED",
                preflight: state?.state || "unknown",
              };
        }
        let actioned = false;
        let exitedMediaViewer = false;
        try {
          if (_isFlowMediaViewerOpen2()) {
            console.log(
              "[prepareFlowForGen] Step 0: \u0111ang \u1EDF media viewer \u2192 quay l\u1EA1i editor project",
            );
            exitedMediaViewer = await _exitFlowMediaViewer();
            actioned = true;
          }
        } catch (e) {
          console.warn(
            "[prepareFlowForGen] Step 0 (media viewer) failed:",
            e.message,
          );
        }
        try {
          const r = await _ensureFlowAgentInstructionDone();
          if (r.wasOpen && r.success) {
            console.log("[prepareFlowForGen] \u2713 Instruction dialog closed");
            actioned = true;
          }
        } catch (e) {
          console.warn("[prepareFlowForGen] Step 1 failed:", e.message);
        }
        try {
          const r = await _ensureFlowChatAgentClosed();
          if (r.wasOpen && r.success) {
            console.log("[prepareFlowForGen] \u2713 Chat panel closed");
            actioned = true;
            await sleep2(1500);
          }
        } catch (e) {
          console.warn("[prepareFlowForGen] Step 2 failed:", e.message);
        }
        try {
          const r = await _ensureFlowAgentModeOff();
          if (r.wasOn && r.success) {
            console.log("[prepareFlowForGen] \u2713 Agent OFF");
            actioned = true;
          }
        } catch (e) {
          console.warn("[prepareFlowForGen] Step 3 failed:", e.message);
        }
        let editorReadyMs = 0;
        if (actioned) {
          editorReadyMs = (await _waitForFlowEditorReady(5e3)) || 0;
          if (editorReadyMs) {
            console.log(
              `[prepareFlowForGen] \u2713 Editor ready (${editorReadyMs}ms wait)`,
            );
          } else {
            console.warn(
              "[prepareFlowForGen] \u26A0 Editor not ready after 5s \u2014 gen may fail",
            );
          }
        }
        window._tobyAgentChainLastRunAt = Date.now();
        return { success: true, actioned, editorReadyMs, exitedMediaViewer };
      },
      stabilizeFlowResultViewport: async () => {
        return _stabilizeFlowResultViewport();
      },
      getEditor: async () => {
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        const editorResult = (await resolved?.driver?.invoke("getEditor")) || {
          success: false,
        };
        return {
          exists: editorResult.success === true,
          hasSlateState: editorResult.success === true,
        };
      },
      acceptUploadConsent: () => {
        const accepted = _clickUploadConsentModal2();
        return { accepted, success: true };
      },
      insertText: async () => {
        if (shouldStop) {
          console.log(
            "[insertText] \u23F9 Aborted before start (shouldStop=true)",
          );
          return {
            success: false,
            error: "ABORTED",
            message: "User stopped before insert",
          };
        }
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        return (
          (await resolved?.driver?.invoke("insertText", {
            text: message.text,
            options: { segmentMode: !!message.segmentMode },
          })) || { success: false, error: "FLOW_V2_DRIVER_UNAVAILABLE" }
        );
      },
      clearEditor: async () => {
        const startedAt = Date.now();
        console.info(
          "[FlowEditorClear] received",
          JSON.stringify({ visibility: document.visibilityState }),
        );
        if (shouldStop) {
          console.log(
            "[clearEditor] \u23F9 Aborted before start (shouldStop=true)",
          );
          return {
            success: false,
            error: "ABORTED",
            message: "User stopped before clear",
          };
        }
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        const result = (await resolved?.driver?.invoke("clearEditor")) || {
          success: false,
          error: "FLOW_V2_DRIVER_UNAVAILABLE",
        };
        console.info(
          "[FlowEditorClear] completed",
          JSON.stringify({
            success: result.success === true,
            alreadyEmpty: result.alreadyEmpty === true,
            elapsedMs: Date.now() - startedAt,
          }),
        );
        return result;
      },
      clickSubmit: async () => {
        if (shouldStop) {
          console.log(
            "[clickSubmit] \u23F9 Aborted before start (shouldStop=true)",
          );
          return {
            success: false,
            error: "ABORTED",
            notDispatched: true,
            message: "User stopped before submit",
          };
        }
        if (_checkFlowCreditLimit2()) {
          return {
            success: false,
            error: "PUBLIC_ERROR_USER_QUOTA_REACHED",
            notDispatched: true,
          };
        }
        const resolved = FlowDriverRegistry.resolveForUrl(location.href);
        const result = await resolved?.driver?.invoke("submit", {
          timeoutMs: message.timeoutMs || 3e4,
          requestEvidenceOnly: message.requestEvidenceOnly === true,
          beforeClick:
            message.correlationGuard || message.referenceGuard
              ? () => {
                  const guard = message.correlationGuard;
                  const entry = guard
                    ? _flowCorrelationAttempts.get(guard.attemptId)
                    : null;
                  const correlationValid =
                    !guard ||
                    (!!entry &&
                      Date.now() < guard.validUntil &&
                      Date.now() < entry.expiresAt &&
                      FlowDriverRegistry.resolveForUrl(location.href)
                        ?.projectId === entry.projectId &&
                      entry.editorDocument ===
                        JSON.stringify(_flowV2InlineState2()) &&
                      !entry.receipts.some(
                        (receipt) => receipt.stage === "acceptance_unknown",
                      ));
                  const referenceValid = _flowReferenceGuardMatches2(
                    message.referenceGuard,
                  );
                  return !shouldStop && correlationValid && referenceValid;
                }
              : null,
        });
        return (
          result || { success: false, error: "FLOW_V2_DRIVER_UNAVAILABLE" }
        );
      },
      addFileToPrompt: async () => {
        const success = await addFileToPrompt(
          message.fileId,
          message.fileName,
          message.flowFileId,
        );
        return {
          success: success === true,
          ...(success === true ? {} : { error: "ADD_REF_NOT_CONFIRMED" }),
        };
      },
      getCurrentTileIds: () => {
        _invalidateTileCache2();
        return {
          tileIds: getUniqueTileIds2(true),
          fileNames: [...getExistingFileNames2()],
        };
      },
      waitForNewTiles: async () => {
        shouldStop = false;
        const preFileNames = message.preFileNames
          ? new Set(message.preFileNames)
          : message.captureFileNames
            ? getExistingFileNames2()
            : null;
        console.log(
          `[content.js] waitForNewTiles received \u2014 preTileIds=${(message.preTileIds || []).length}, timeout=${message.timeout}, maxQty=${message.maxQuantity}`,
        );
        const result = await waitForNewTiles(
          message.preTileIds || [],
          message.timeout || 12e4,
          preFileNames,
          message.maxQuantity || 0,
          message.operationId || null,
          message.expectedMediaType || null,
        );
        console.log(
          `[content.js] waitForNewTiles done \u2014 result has ${result?.tiles?.length || 0} new tiles, failed=${result?.failed}`,
        );
        return result;
      },
      cancelFlowScanRequest: () => {
        _flowScanRequests.get(message.requestId)?.cancel();
        return { success: true };
      },
      cancelFlowScans: () => {
        _flowStopEpoch++;
        for (const control of _flowScanRequests.values()) control.cancel();
        console.info("[WorkflowStop] Flow scan cancellation received", {
          stopEpoch: _flowStopEpoch,
          activeScans: _flowTileScanActiveDepth,
          visibility: document.visibilityState,
        });
        return { success: true, stopEpoch: _flowStopEpoch };
      },
      stopExecution: () => {
        console.warn(
          "[FlowBatchControlAudit]",
          JSON.stringify({
            event: "content_stop_received",
            visibility: document.visibilityState,
            stopEpoch: _flowStopEpoch,
            wasStopped: shouldStop === true,
            pipelineOwned: ExecutionBlocker._pipelineOwned === true,
            blockerRunId: ExecutionBlocker._activeBlockerRunId || null,
          }),
        );
        for (const control of _flowScanRequests.values()) control.cancel();
        shouldStop = true;
        _flowStopEpoch++;
        isPaused = false;
        _clickedRetryTileIds.clear();
        ExecutionBlocker._stopReleased = true;
        ExecutionBlocker._activeBlockerRunId = null;
        ExecutionBlocker._trackerBlockerRunId = null;
        ExecutionBlocker._pausedWhileBlocking = false;
        ExecutionBlocker._pausedPipelineOwned = false;
        if (ExecutionBlocker._pendingHideTimer) {
          clearTimeout(ExecutionBlocker._pendingHideTimer);
          ExecutionBlocker._pendingHideTimer = null;
        }
        if (FloatingTracker._legacyData) {
          FloatingTracker._legacyData.status = "stopped";
          FloatingTracker.updateLegacy(FloatingTracker._legacyData);
        }
        ExecutionBlocker.hide();
        return {
          success: true,
          released:
            !ExecutionBlocker._blocking && !ExecutionBlocker.isVisible(),
        };
      },
      resetStop: () => {
        shouldStop = false;
        ExecutionBlocker._stopReleased = false;
        return { success: true };
      },
      pauseExecution: () => {
        isPaused = true;
        ExecutionBlocker._pausedWhileBlocking = ExecutionBlocker._blocking;
        ExecutionBlocker._pausedPipelineOwned = ExecutionBlocker._pipelineOwned;
        try {
          ExecutionBlocker.hide();
        } catch (_) {}
        if (FloatingTracker._legacyData) {
          FloatingTracker._legacyData.status = "paused";
          FloatingTracker.updateLegacy(FloatingTracker._legacyData);
        }
        return { isPaused: true };
      },
      resumeExecution: () => {
        isPaused = false;
        if (ExecutionBlocker._pausedWhileBlocking) {
          ExecutionBlocker._pausedWhileBlocking = false;
          ExecutionBlocker._pipelineOwned =
            ExecutionBlocker._pausedPipelineOwned;
          ExecutionBlocker._pausedPipelineOwned = false;
          try {
            ExecutionBlocker.show();
          } catch (_) {}
        }
        if (FloatingTracker._legacyData) {
          FloatingTracker._legacyData.status = "running";
          FloatingTracker.updateLegacy(FloatingTracker._legacyData);
        }
        return { isPaused: false };
      },
      "pq:clearRetryTracking": () => {
        _clickedRetryTileIds.clear();
        _retryingTiles.clear();
        return { success: true };
      },
      getRunningState: () => {
        return { isRunning, shouldStop, isPaused };
      },
      getFailedPrompts: () => {
        return { failedPrompts };
      },
      clearFailedPrompts: () => {
        failedPrompts = [];
        return { success: true };
      },
      resolveVideoPlaybackUrl: async () => {
        const scanControl = message._flowScanControl;
        scanControl?.assertActive();
        const fileId = message.fileId || "";
        const fileName = message.fileName || "";
        const projectId = getCurrentProjectId2()?.toLowerCase();
        const requestedUuids = new Set(
          [fileId, fileName]
            .map((value) => String(value || "").toLowerCase())
            .filter((value) =>
              /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value),
            ),
        );
        if (requestedUuids.size) {
          const liveVideo = Array.from(_qa2("tile_video")).find((video2) => {
            const source =
              video2?.currentSrc ||
              video2?.src ||
              video2?.getAttribute?.("src") ||
              "";
            return requestedUuids.has(_getFlowContentVideoUuid2(source));
          });
          const liveUrl =
            liveVideo?.currentSrc ||
            liveVideo?.src ||
            liveVideo?.getAttribute?.("src") ||
            "";
          if (liveUrl) _rememberFlowVideoStreamUrl2(liveUrl);
        }
        const observedUuidStream = [fileId, fileName]
          .map((value) =>
            _flowObservedUuidVideoStreams.get(
              String(value || "").toLowerCase(),
            ),
          )
          .find(
            (entry) =>
              entry?.projectId === projectId &&
              typeof entry.url === "string" &&
              entry.url,
          );
        if (observedUuidStream) {
          console.info(
            "[FlowVideoPlaybackRecovery] observed UUID stream reused",
            JSON.stringify({ domScan: false }),
          );
          return {
            success: true,
            video_url: observedUuidStream.url,
            thumbnail: message.sourceUrl || "",
            playback_url_source: "dom_stream",
          };
        }
        const native =
          _getObservedFlowVideoMetadata2(fileId) ||
          _getObservedFlowVideoMetadata2(fileName);
        const rejectedUrls = new Set(
          (Array.isArray(message.rejectedVideoUrls)
            ? message.rejectedVideoUrls
            : []
          )
            .filter((value) => typeof value === "string")
            .slice(0, 8),
        );
        const usableUrl = (url) => !!url && !rejectedUrls.has(url);
        const mountedTile =
          _getTileById2(fileId) ||
          (fileName && resolveTileByFileName2(fileName)) ||
          (native?.persistent_media_id &&
            resolveTileByFileName2(native.persistent_media_id));
        const mountedVideo = mountedTile && _q2("tile_video", mountedTile);
        const mountedUrl =
          mountedVideo &&
          [mountedVideo.currentSrc, mountedVideo.src].find(usableUrl);
        const mountedAsb = mountedUrl && _getFlowV2AsbMediaId2(mountedUrl);
        const mountedNative =
          mountedAsb && _getObservedFlowVideoMetadata2(mountedAsb);
        if (
          mountedUrl &&
          (!native ||
            mountedAsb === native.persistent_media_id ||
            mountedNative?.media_uuid === native.media_uuid)
        ) {
          _rememberFlowVideoStreamUrl2(mountedUrl);
          console.info(
            "[FlowVideoPlaybackRecovery] mounted stream preferred",
            JSON.stringify({
              mediaUuid:
                native?.media_uuid || mountedNative?.media_uuid || null,
              domScan: false,
            }),
          );
          return {
            success: true,
            ...(native || {}),
            video_url: mountedUrl,
            playback_url_source: "dom_stream",
            thumbnail:
              mountedVideo.poster ||
              native?.thumbnail ||
              message.sourceUrl ||
              "",
            ...(mountedAsb && { persistent_media_id: mountedAsb }),
          };
        }
        console.info(
          "[FlowVideoPlaybackRecovery]",
          JSON.stringify({
            forceDom: message.forceDomResolve === true,
            rejected: rejectedUrls.size,
            nativeAvailable: !!native,
            nativeRejected: rejectedUrls.has(native?.video_url),
            virtualScanAllowed: message.allowVirtualScan !== false,
          }),
        );
        if (!message.forceDomResolve && usableUrl(native?.video_url))
          return { success: true, ...native };
        const sourceUrl = message.sourceUrl || "";
        await _ensureSelectorConfigReadyForAction(3e3);
        scanControl?.assertActive();
        const persistedAsbId =
          _getFlowV2AsbMediaId2(sourceUrl) ||
          (_buildFlowV2AsbMediaUrl2(fileId) ? fileId : null);
        const persistedAsbVideo = _buildFlowV2AsbMediaUrl2(persistedAsbId, {
          playback: true,
        });
        if (!message.forceDomResolve && usableUrl(persistedAsbVideo)) {
          const persistedAsbPoster = _buildFlowV2AsbMediaUrl2(persistedAsbId);
          console.log(
            "[FlowV2Identity] playback URL rebuilt from ASB media id",
            JSON.stringify({
              requested_identity: _safeFlowIdentityForLog2(fileId),
              media_id_length: persistedAsbId.length,
            }),
          );
          return {
            success: true,
            video_url: persistedAsbVideo,
            thumbnail: sourceUrl || persistedAsbPoster,
            persistent_media_id: persistedAsbId,
            rebuilt_from_media_id: true,
          };
        }
        if (!message.forceDomResolve) {
          const derivedUrl = _deriveFlowV2VideoUrlFromPoster2(sourceUrl);
          if (usableUrl(derivedUrl)) {
            console.log(
              "[FlowV2Identity] playback URL derived from poster",
              JSON.stringify({
                requested_identity: _safeFlowIdentityForLog2(fileId),
              }),
            );
            return {
              success: true,
              video_url: derivedUrl,
              thumbnail: sourceUrl,
              derived_from_poster: true,
            };
          }
        }
        const isVideoTile = (candidate) =>
          !!candidate &&
          !!(
            _q2("tile_video", candidate) || _q2("tile_video_owner", candidate)
          );
        let tile = fileId ? _getTileById2(fileId) : null;
        if (tile && !isVideoTile(tile)) tile = null;
        if (!tile && fileName) tile = resolveTileByFileName2(fileName);
        if (tile && !isVideoTile(tile)) tile = null;
        if (!tile && sourceUrl) {
          const sameMediaResource = (left, right) => {
            if (!left || !right) return false;
            if (left === right) return true;
            try {
              const a = new URL(left, location.href);
              const b = new URL(right, location.href);
              const normalizePath = (url) => {
                if (
                  url.hostname === "flow.google.com" &&
                  url.pathname.startsWith("/asb/")
                ) {
                  return url.pathname.replace(/=[^/=]+$/, "");
                }
                return url.pathname;
              };
              return (
                a.origin === b.origin && normalizePath(a) === normalizePath(b)
              );
            } catch (_) {
              return false;
            }
          };
          for (const candidate of _qa2("tile_container")) {
            const candidateVideo = _q2("tile_video", candidate);
            const candidateSrc =
              candidateVideo?.currentSrc || candidateVideo?.src || "";
            const candidateTyped = _extractTypedTileRecord2(candidate, null);
            const candidatePoster =
              candidateVideo?.poster ||
              candidateTyped?.thumbnail ||
              extractThumbnailUrl2(candidate) ||
              "";
            if (
              isVideoTile(candidate) &&
              (sameMediaResource(candidateSrc, sourceUrl) ||
                sameMediaResource(candidatePoster, sourceUrl))
            ) {
              tile = candidate;
              break;
            }
          }
        }
        if (!tile && fileName && message.allowVirtualScan !== false) {
          const found = await ensureFlowTilesLoaded(false, [fileName], {
            reason: "web_video_playback_target_missing",
            allowAfterStop: true,
            scanControl,
            deadline: scanControl?.deadline,
          });
          scanControl?.assertActive();
          const restoredId = found?.[fileName] || "";
          tile = restoredId
            ? _getTileById2(restoredId)
            : resolveTileByFileName2(fileName);
          if (tile && !isVideoTile(tile)) tile = null;
          console.log(
            "[FlowV2Identity] playback targeted restore",
            JSON.stringify({
              requested_identity: _safeFlowIdentityForLog2(fileId),
              has_file_name: true,
              restored: !!tile,
            }),
          );
        }
        if (!tile) return { success: false, error: "VIDEO_TILE_NOT_FOUND" };
        let video = _q2("tile_video", tile);
        const videoOwner = _q2("tile_video_owner", tile);
        if (!video && !videoOwner)
          return { success: false, error: "VIDEO_ELEMENT_NOT_FOUND" };
        const readUrl = () => {
          const liveVideo = _q2("tile_video", tile);
          if (liveVideo) video = liveVideo;
          return (
            [video?.currentSrc, video?.src, extractVideoUrl2(tile)].find(
              usableUrl,
            ) || ""
          );
        };
        let videoUrl = readUrl();
        const activationTimeoutMs = Object.prototype.hasOwnProperty.call(
          message,
          "activationTimeoutMs",
        )
          ? Math.max(0, Number(message.activationTimeoutMs) || 0)
          : 8e3;
        let bestMountedFallback = null;
        if (videoUrl) {
          const persistentMediaId =
            _getFlowV2AsbMediaId2(videoUrl) || _getPersistentMediaId2(tile);
          const posterUrl =
            video?.poster ||
            extractThumbnailUrl2(tile) ||
            _deriveFlowV2PosterUrlFromVideo2(videoUrl) ||
            sourceUrl ||
            "";
          console.log(
            "[FlowV2Identity] playback resolved",
            JSON.stringify({
              requested_identity: _safeFlowIdentityForLog2(fileId),
              persistent_identity_kind: _isFlowV2AsbIdentity2(persistentMediaId)
                ? "flow_v2_asb"
                : "other_or_missing",
              persistent_identity_length: String(persistentMediaId || "")
                .length,
              has_video_url: !!videoUrl,
              has_distinct_poster: !!posterUrl && posterUrl !== videoUrl,
            }),
          );
          bestMountedFallback = {
            success: true,
            video_url: videoUrl,
            thumbnail: posterUrl,
            persistent_media_id: persistentMediaId || null,
          };
          const temporaryServingUrl =
            _classifyFlowMediaUrl2(videoUrl) !== "asb" &&
            _classifyFlowMediaUrl2(posterUrl) !== "asb";
          if (
            _flowPageContext?.driverKey === "flow_v2" &&
            !_isFlowV2AsbIdentity2(persistentMediaId) &&
            temporaryServingUrl
          ) {
            console.log(
              "[FlowV2Identity] completion uses temporary UUID serving URL; defer ASB promotion to list DOM",
              JSON.stringify({
                requested_identity: _safeFlowIdentityForLog2(fileId),
                video_url_kind: _classifyFlowMediaUrl2(videoUrl),
                poster_kind: _classifyFlowMediaUrl2(posterUrl),
              }),
            );
            return { ...bestMountedFallback, identity_pending_asb: true };
          }
          if (
            _flowPageContext?.driverKey !== "flow_v2" ||
            _isFlowV2AsbIdentity2(persistentMediaId) ||
            activationTimeoutMs === 0
          ) {
            return bestMountedFallback;
          }
        }
        if (activationTimeoutMs === 0) {
          return (
            bestMountedFallback || {
              success: false,
              error: "VIDEO_URL_NOT_MOUNTED",
            }
          );
        }
        const originalMuted = video?.muted;
        let activatedMountedVideo = false;
        console.log(
          "[FlowV2Identity] playback activation start",
          JSON.stringify({
            requested_identity: _safeFlowIdentityForLog2(fileId),
            has_owner: !!videoOwner,
            has_video_before: !!video,
            poster_kind: _classifyFlowMediaUrl2(sourceUrl),
            activation_timeout_ms: Object.prototype.hasOwnProperty.call(
              message,
              "activationTimeoutMs",
            )
              ? Math.max(0, Number(message.activationTimeoutMs) || 0)
              : 8e3,
          }),
        );
        const activate = async (targetVideo = null) => {
          _activateFlowV2VideoTile2(tile, targetVideo);
        };
        try {
          await activate(video);
          activatedMountedVideo = !!video;
        } catch (error) {
          console.warn(
            "[FlowV2Identity] playback hover activation failed",
            error?.message || error,
          );
        }
        const deadline = Date.now() + activationTimeoutMs;
        while (Date.now() < deadline) {
          await sleep2(200);
          if (scanControl?.signal.aborted) {
            try {
              video?.pause();
            } catch (_) {}
            if (video && typeof originalMuted === "boolean")
              video.muted = originalMuted;
            scanControl.assertActive();
          }
          const liveTile = fileId ? _getTileById2(fileId) : null;
          if (liveTile) tile = liveTile;
          videoUrl = readUrl();
          if (video && !activatedMountedVideo) {
            try {
              await activate(video);
            } catch (_) {}
            activatedMountedVideo = true;
            videoUrl = readUrl();
          }
          if (videoUrl) {
            const persistentMediaId =
              _getFlowV2AsbMediaId2(videoUrl) || _getPersistentMediaId2(tile);
            const posterUrl =
              video?.poster ||
              extractThumbnailUrl2(tile) ||
              _deriveFlowV2PosterUrlFromVideo2(videoUrl) ||
              sourceUrl ||
              "";
            console.log(
              "[FlowV2Identity] playback resolved after activation",
              JSON.stringify({
                requested_identity: _safeFlowIdentityForLog2(fileId),
                persistent_identity_kind: _isFlowV2AsbIdentity2(
                  persistentMediaId,
                )
                  ? "flow_v2_asb"
                  : "other_or_missing",
                persistent_identity_length: String(persistentMediaId || "")
                  .length,
                has_video_url: !!videoUrl,
                has_distinct_poster: !!posterUrl && posterUrl !== videoUrl,
              }),
            );
            bestMountedFallback = {
              success: true,
              video_url: videoUrl,
              thumbnail: posterUrl,
              persistent_media_id: persistentMediaId || null,
            };
            if (_isFlowV2AsbIdentity2(persistentMediaId)) {
              try {
                video?.pause();
              } catch (_) {}
              if (typeof originalMuted === "boolean") {
                try {
                  video.muted = originalMuted;
                } catch (_) {}
              }
              return bestMountedFallback;
            }
          }
        }
        if (video && typeof originalMuted === "boolean") {
          try {
            video.muted = originalMuted;
          } catch (_) {}
        }
        if (bestMountedFallback) {
          console.warn(
            "[FlowV2Identity] ASB identity not exposed within activation window; preserving playback fallback",
            JSON.stringify({
              requested_identity: _safeFlowIdentityForLog2(fileId),
              persistent_identity_kind: _isFlowV2AsbIdentity2(
                bestMountedFallback.persistent_media_id,
              )
                ? "flow_v2_asb"
                : "other_or_missing",
            }),
          );
          return bestMountedFallback;
        }
        console.warn(
          "[FlowV2Identity] playback activation exhausted",
          JSON.stringify({
            requested_identity: _safeFlowIdentityForLog2(fileId),
            has_video_after: !!video,
            poster_kind: _classifyFlowMediaUrl2(sourceUrl),
          }),
        );
        return { success: false, error: "VIDEO_PLAYBACK_URL_NOT_READY" };
      },
      getThumbnailsByIds: async () => {
        if (typeof _flowNativeMediaSnapshotReady !== "undefined")
          await _flowNativeMediaSnapshotReady;
        if (message.metadataRequestId) {
          console.log(
            "[FlowMetadataLookup] received",
            JSON.stringify({
              requestId: message.metadataRequestId,
              visibility: document.visibilityState,
              focused: document.hasFocus(),
              expired: Date.now() >= message.metadataDeadline,
            }),
          );
          if (Date.now() >= message.metadataDeadline)
            return { error: "METADATA_SCAN_TIMEOUT" };
        }
        const fileIds = [...new Set((message.fileIds || []).filter(Boolean))];
        if (
          message.nativeVideoIdentitiesOnly === true ||
          message.nativeMediaIdentitiesOnly === true
        ) {
          const lookupNative = message.nativeMediaIdentitiesOnly
            ? _getObservedFlowMediaMetadata2
            : _getObservedFlowVideoMetadata2;
          const results2 = {},
            statuses2 = {};
          for (const id of fileIds) {
            const owners = (message.ownerRecords || []).filter(
              (owner) => String(owner?.resultId || "") === String(id),
            );
            const uuids = new Set(
              owners
                .map((owner) => owner.mediaUuid?.toLowerCase())
                .filter(Boolean),
            );
            if (uuids.size > 1) {
              statuses2[id] = "ambiguous";
              continue;
            }
            const ownerUuid = [...uuids][0];
            const ownerInfo = ownerUuid && lookupNative(ownerUuid);
            const idInfo = lookupNative(id);
            if (
              ownerInfo &&
              idInfo &&
              ownerInfo.media_uuid !== idInfo.media_uuid
            ) {
              statuses2[id] = "ambiguous";
              continue;
            }
            const info =
              ownerInfo || idInfo || lookupNative(message.fileNamesById?.[id]);
            if (
              info &&
              ownerUuid &&
              info.media_uuid.toLowerCase() !== ownerUuid.toLowerCase()
            ) {
              statuses2[id] = "ambiguous";
              continue;
            }
            if (
              info &&
              owners.some(
                (owner) => owner.mediaType && owner.mediaType !== info.type,
              )
            ) {
              statuses2[id] = "ambiguous";
              continue;
            }
            if (info) {
              results2[id] = info;
              statuses2[id] = "resolved";
            } else statuses2[id] = "missing";
          }
          console.info(
            "[FlowNativeMediaIdentity] native-only lookup",
            JSON.stringify({
              projectId: getCurrentProjectId2(),
              requested: fileIds.length,
              resolved: Object.keys(results2).length,
              images: Object.values(results2).filter(
                (info) => info.type === "image",
              ).length,
              videos: Object.values(results2).filter(
                (info) => info.type === "video",
              ).length,
              missing: fileIds.filter((id) => statuses2[id] === "missing")
                .length,
              ambiguous: fileIds.filter((id) => statuses2[id] === "ambiguous")
                .length,
              domScan: false,
              tabActivation: false,
            }),
          );
          return {
            results: results2,
            statuses: statuses2,
            projectId: getCurrentProjectId2(),
          };
        }
        const fileNamesById =
          message.fileNamesById &&
          typeof message.fileNamesById === "object" &&
          !Array.isArray(message.fileNamesById)
            ? message.fileNamesById
            : {};
        const displayNamesById =
          message.displayNamesById &&
          typeof message.displayNamesById === "object" &&
          !Array.isArray(message.displayNamesById)
            ? message.displayNamesById
            : {};
        const ownerRecords = Array.isArray(message.ownerRecords)
          ? message.ownerRecords
          : [];
        const excludedPersistentMediaIds = new Set(
          (Array.isArray(message.excludedPersistentMediaIds)
            ? message.excludedPersistentMediaIds
            : []
          ).filter((identity) => _isFlowV2AsbIdentity2(identity)),
        );
        const exactIdentityOnly = message.exactIdentityOnly === true;
        const allowOwnerIdentityPromotion = false;
        const ownerByResultId = new Map(
          ownerRecords.map((record) => [
            String(record?.resultId || ""),
            record,
          ]),
        );
        const displayNameRequestCounts = Object.values(displayNamesById).reduce(
          (counts, value) => {
            const name = String(value || "");
            if (name) counts[name] = (counts[name] || 0) + 1;
            return counts;
          },
          {},
        );
        const canPromoteOwnedUploadByDisplayName = (fileId) => {
          const name = String(displayNamesById[fileId] || "");
          return (
            ownerByResultId.has(String(fileId)) &&
            _isDeterministicTobyUploadName2(name) &&
            displayNameRequestCounts[name] === 1
          );
        };
        const results = {};
        const statuses = {};
        const resolvedTiles = new Map();
        const claimedTiles = new Set();
        const batchProjectedResults = new Map();
        for (const id of fileIds) {
          const owner = ownerByResultId.get(String(id));
          const info =
            _getObservedFlowMediaMetadata2(owner?.mediaUuid || id) ||
            _getObservedFlowMediaMetadata2(fileNamesById[id]);
          if (!info) continue;
          if (
            (owner?.mediaUuid &&
              owner.mediaUuid.toLowerCase() !== info.media_uuid) ||
            (owner?.mediaType && owner.mediaType !== info.type)
          ) {
            statuses[id] = "ambiguous";
            continue;
          }
          results[id] = info;
          statuses[id] = "resolved";
          resolvedTiles.set(id, null);
        }
        if (Object.keys(results).length === fileIds.length)
          return { results, statuses };
        console.log(
          "[FlowV2IdentityRefresh] DOM lookup start",
          JSON.stringify({
            requested: fileIds.map((id) => ({
              identity: _safeFlowIdentityForLog2(id),
              identityKind: _isFlowV2AsbIdentity2(id)
                ? "flow_v2_asb"
                : "uuid_or_other",
              hasFileName: !!fileNamesById[id],
              hasDisplayName: !!displayNamesById[id],
            })),
            deep: message.deep === true,
            exactIdentityOnly,
            allowOwnerIdentityPromotion,
            waitMountedMs: Math.max(0, Number(message.waitMountedMs) || 0),
          }),
        );
        const requestedImageIds = new Set(
          fileIds.filter(
            (id) => ownerByResultId.get(String(id))?.mediaType !== "video",
          ),
        );
        const captureImage = (tile) => {
          const captured = _captureExactUuidImagePreview2(
            tile,
            requestedImageIds,
          );
          if (!captured) return;
          if (results[captured.id]) return;
          results[captured.id] = captured.info;
          statuses[captured.id] = "resolved";
          resolvedTiles.set(captured.id, tile);
          claimedTiles.add(tile);
        };
        const findMounted = () => {
          for (const tile of _qa2("tile_container")) captureImage(tile);
          for (const fileId of fileIds) {
            if (resolvedTiles.has(fileId)) continue;
            if (exactIdentityOnly) {
              const exactTile = _getTileById2(fileId);
              if (exactTile && !claimedTiles.has(exactTile)) {
                resolvedTiles.set(fileId, exactTile);
                claimedTiles.add(exactTile);
              }
              continue;
            }
            const stableFileName = fileNamesById[fileId];
            const exactAliasTile = _isFlowV2AsbIdentity2(stableFileName)
              ? resolveTileByFileName2(stableFileName)
              : null;
            if (exactAliasTile && !claimedTiles.has(exactAliasTile)) {
              const expectedType =
                ownerByResultId.get(String(fileId))?.mediaType || null;
              const actualType = detectMediaType2(exactAliasTile);
              if (expectedType && actualType && expectedType !== actualType) {
                statuses[fileId] = "type_mismatch";
              } else {
                resolvedTiles.set(fileId, exactAliasTile);
                claimedTiles.add(exactAliasTile);
              }
              continue;
            }
            const expectedDisplayName = displayNamesById[fileId] || "";
            let displayTile = null;
            if (
              expectedDisplayName &&
              (!ownerByResultId.has(String(fileId)) ||
                allowOwnerIdentityPromotion ||
                canPromoteOwnedUploadByDisplayName(fileId))
            ) {
              const expectedType =
                ownerByResultId.get(String(fileId))?.mediaType || null;
              const matches = Array.from(_qa2("tile_container")).filter(
                (candidate) =>
                  _flowDisplayNamesCorrelate2(
                    _getTileDisplayName2(candidate),
                    expectedDisplayName,
                  ) &&
                  (!expectedType ||
                    detectMediaType2(candidate) === expectedType) &&
                  !claimedTiles.has(candidate),
              );
              const asbMatches = matches.filter(
                (candidate) =>
                  _isFlowV2AsbIdentity2(_getPersistentMediaId2(candidate)) &&
                  !excludedPersistentMediaIds.has(
                    _getPersistentMediaId2(candidate),
                  ),
              );
              console.log(
                "[FlowV2IdentityRefresh] display-name candidates",
                JSON.stringify({
                  requestedIdentity: _safeFlowIdentityForLog2(fileId),
                  matches: matches.length,
                  asbMatches: asbMatches.length,
                  excludedBaselineAsb: matches.filter((candidate) =>
                    excludedPersistentMediaIds.has(
                      _getPersistentMediaId2(candidate),
                    ),
                  ).length,
                  mediaTypes: [
                    ...new Set(
                      matches
                        .map((candidate) => detectMediaType2(candidate))
                        .filter(Boolean),
                    ),
                  ],
                  decision:
                    asbMatches.length === 1
                      ? "unique_asb"
                      : matches.length === 1
                        ? "unique_display_name"
                        : matches.length > 1
                          ? "ambiguous"
                          : "missing",
                }),
              );
              if (
                ownerByResultId.has(String(fileId)) &&
                (displayNameRequestCounts[expectedDisplayName] > 1 ||
                  asbMatches.length > 1 ||
                  (asbMatches.length === 0 && matches.length > 1))
              ) {
                statuses[fileId] = "ambiguous";
                console.info("[WorkflowVideoPersistence] ambiguous skipped", {
                  identity: _safeFlowIdentityForLog2(fileId),
                  requestedNameDuplicate:
                    displayNameRequestCounts[expectedDisplayName] > 1,
                  candidateCount: matches.length,
                  asbCandidateCount: asbMatches.length,
                });
                continue;
              }
              if (asbMatches.length === 1) displayTile = asbMatches[0];
              else if (
                !ownerByResultId.has(String(fileId)) &&
                matches.length === 1
              )
                displayTile = matches[0];
            }
            if (statuses[fileId] === "ambiguous") continue;
            const tile =
              displayTile ||
              _getTileById2(fileId) ||
              (stableFileName
                ? resolveTileByFileName2(stableFileName)
                : null) ||
              resolveTileByFileName2(fileId);
            if (tile && !claimedTiles.has(tile)) {
              const expectedType =
                ownerByResultId.get(String(fileId))?.mediaType || null;
              const actualType = detectMediaType2(tile);
              if (expectedType && actualType && expectedType !== actualType) {
                statuses[fileId] = "type_mismatch";
              } else {
                resolvedTiles.set(fileId, tile);
                claimedTiles.add(tile);
              }
            }
          }
        };
        findMounted();
        console.log(
          "[FlowV2IdentityRefresh] DOM lookup mounted pass",
          JSON.stringify({
            requested: fileIds.length,
            mounted: resolvedTiles.size,
            unresolved: fileIds
              .filter((id) => !resolvedTiles.has(id))
              .map(_safeFlowIdentityForLog2),
          }),
        );
        const waitMountedMs = Math.max(0, Number(message.waitMountedMs) || 0);
        if (resolvedTiles.size < fileIds.length && waitMountedMs > 0) {
          const deadline = Date.now() + Math.min(waitMountedMs, 1e4);
          while (Date.now() < deadline && resolvedTiles.size < fileIds.length) {
            await sleep2(250);
            findMounted();
          }
        }
        const missing = fileIds.filter((id) => !resolvedTiles.has(id));
        if (missing.length > 0 && message.deep === true && !exactIdentityOnly) {
          try {
            const targets = missing.map((id) => {
              const displayName = displayNamesById[id] || "";
              if (requestedImageIds.has(id)) return fileNamesById[id] || id;
              return displayName &&
                displayNameRequestCounts[displayName] === 1 &&
                (!ownerByResultId.has(String(id)) ||
                  allowOwnerIdentityPromotion ||
                  canPromoteOwnedUploadByDisplayName(id))
                ? displayName
                : fileNamesById[id] || id;
            });
            const found = await ensureFlowTilesLoaded(false, targets, {
              excludedPersistentMediaIds: [...excludedPersistentMediaIds],
              onTileSeen: captureImage,
              scanToExhaustion: false,
              deadline: Number(message.metadataDeadline) || 0,
              scanControl: message._flowScanControl,
            });
            for (const fileId of missing) {
              if (batchProjectedResults.has(fileId)) continue;
              if (statuses[fileId] === "ambiguous") continue;
              const stableFileName = fileNamesById[fileId];
              const expectedDisplayName = displayNamesById[fileId] || "";
              const resolvedTileId = found?.[stableFileName || fileId];
              const displayResolvedId =
                expectedDisplayName &&
                displayNameRequestCounts[expectedDisplayName] === 1 &&
                (!ownerByResultId.has(String(fileId)) ||
                  allowOwnerIdentityPromotion ||
                  canPromoteOwnedUploadByDisplayName(fileId))
                  ? found?.[expectedDisplayName]
                  : null;
              const tile =
                ((resolvedTileId || displayResolvedId) &&
                  _getTileById2(resolvedTileId || displayResolvedId)) ||
                (stableFileName
                  ? resolveTileByFileName2(stableFileName)
                  : null) ||
                resolveTileByFileName2(fileId) ||
                _getTileById2(fileId);
              const tilePersistentId = tile
                ? _getPersistentMediaId2(tile)
                : null;
              if (
                tile &&
                !claimedTiles.has(tile) &&
                !excludedPersistentMediaIds.has(tilePersistentId)
              ) {
                const expectedType =
                  ownerByResultId.get(String(fileId))?.mediaType || null;
                const actualType = detectMediaType2(tile);
                if (expectedType && actualType && expectedType !== actualType)
                  statuses[fileId] = "type_mismatch";
                else {
                  resolvedTiles.set(fileId, tile);
                  claimedTiles.add(tile);
                }
              }
            }
          } catch (_) {}
        }
        for (const fileId of fileIds) {
          if (results[fileId]) continue;
          const lateNativeInfo = _getObservedFlowMediaMetadata2(fileId);
          const owner = ownerByResultId.get(String(fileId));
          const nativeVideoInfo =
            lateNativeInfo &&
            (!owner?.mediaUuid ||
              owner.mediaUuid.toLowerCase() === lateNativeInfo.media_uuid) &&
            (!owner?.mediaType || owner.mediaType === lateNativeInfo.type)
              ? lateNativeInfo
              : null;
          if (
            nativeVideoInfo &&
            (nativeVideoInfo.thumbnail || nativeVideoInfo.video_url)
          ) {
            results[fileId] = nativeVideoInfo;
            statuses[fileId] = "resolved";
            continue;
          }
          if (batchProjectedResults.has(fileId)) {
            results[fileId] = batchProjectedResults.get(fileId);
            statuses[fileId] = "resolved";
            continue;
          }
          const tile = resolvedTiles.get(fileId);
          if (!tile) {
            if (message.activateForMetadata === true) {
              const expectedType =
                ownerByResultId.get(String(fileId))?.mediaType || null;
              const candidates = Array.from(_qa2("tile_container")).filter(
                (candidate) =>
                  !expectedType || detectMediaType2(candidate) === expectedType,
              );
              console.info(
                "[FlowMetadataLookup] unresolved identity",
                JSON.stringify({
                  requestId: message.metadataRequestId,
                  identity: _safeFlowIdentityForLog2(fileId),
                  expectedType,
                  hasDisplayName: !!displayNamesById[fileId],
                  hasFileName: !!fileNamesById[fileId],
                  mountedCandidates: candidates.length,
                  mountedAsbCandidates: candidates.filter((candidate) =>
                    _isFlowV2AsbIdentity2(_getPersistentMediaId2(candidate)),
                  ).length,
                  reason:
                    !displayNamesById[fileId] && !fileNamesById[fileId]
                      ? "uuid_not_mounted_no_saved_alias"
                      : "saved_identity_not_mounted",
                }),
              );
            }
            if (!statuses[fileId]) {
              const name = displayNamesById[fileId] || "";
              statuses[fileId] =
                name && displayNameRequestCounts[name] > 1
                  ? "ambiguous"
                  : "missing";
            }
            continue;
          }
          let stableFileName = fileNamesById[fileId] || null;
          const tileFileNames = extractAllFileNames2(tile);
          const expectedDisplayName = displayNamesById[fileId] || "";
          const displayNameMatches =
            expectedDisplayName &&
            _flowDisplayNamesCorrelate2(
              _getTileDisplayName2(tile),
              expectedDisplayName,
            );
          const tilePersistentId = _getPersistentMediaId2(tile);
          if (
            ownerByResultId.has(String(fileId)) &&
            !_isFlowV2AsbIdentity2(tilePersistentId)
          ) {
            if (!statuses[fileId]) statuses[fileId] = "missing";
            continue;
          }
          if (tilePersistentId && !tileFileNames.includes(tilePersistentId))
            tileFileNames.push(tilePersistentId);
          if (
            !exactIdentityOnly &&
            stableFileName &&
            !tileFileNames.includes(stableFileName) &&
            !displayNameMatches
          ) {
            console.warn(
              "[TobyFlow] getThumbnailsByIds identity mismatch \u2014 reject tile",
              {
                requestedIdentity: _safeFlowIdentityForLog2(fileId),
                expectedFileNameKind: _safeFlowIdentityForLog2(stableFileName),
                tileIdentityKind: _safeFlowIdentityForLog2(
                  tile.dataset?.tileId || null,
                ),
                tileFileNameCount: tileFileNames.length,
              },
            );
            continue;
          }
          let img = null;
          if (stableFileName) {
            for (const candidate of tile.querySelectorAll("img[src]")) {
              if (extractFileNameFromUrl2(candidate.src) === stableFileName) {
                img = candidate;
                break;
              }
            }
          }
          img = img || _q2("tile_image", tile);
          const video = _q2("tile_video", tile);
          const fileName =
            _getPersistentMediaId2(tile) || extractFileName2(tile);
          const flowInfo = extractFlowFileInfo2(tile);
          const typedRecord = _extractTypedTileRecord2(
            tile,
            message.operationId || null,
          );
          const typedProjection = _typedMediaProjection2(typedRecord);
          stableFileName =
            fileName ||
            typedRecord?.persistentMediaId ||
            stableFileName ||
            null;
          console.log(
            "[FlowV2IdentityRefresh] DOM tile matched",
            JSON.stringify({
              requestedIdentity: _safeFlowIdentityForLog2(fileId),
              matchMethod: exactIdentityOnly
                ? "exact_claimed_owner"
                : _getTileById2(fileId) === tile
                  ? "tile_id"
                  : displayNameMatches
                    ? "display_name"
                    : "file_name_or_alias",
              tileIdentityKind: _isFlowV2AsbIdentity2(tilePersistentId)
                ? "flow_v2_asb"
                : tilePersistentId
                  ? "other"
                  : "missing",
              typedPersistentIdentityKind: _isFlowV2AsbIdentity2(
                typedRecord?.persistentMediaId,
              )
                ? "flow_v2_asb"
                : typedRecord?.persistentMediaId
                  ? "other"
                  : "missing",
              mediaType: typedRecord?.mediaType || null,
              hasExpectedDisplayName: !!expectedDisplayName,
              displayNameMatches: !!displayNameMatches,
              tileFileNameCount: tileFileNames.length,
            }),
          );
          const isVideoByAlt = img?.alt?.toLowerCase().includes("video");
          if (video) {
            const videoUrl = extractVideoUrl2(tile);
            const videoPoster =
              video.poster ||
              extractThumbnailUrl2(tile) ||
              _deriveFlowV2PosterUrlFromVideo2(videoUrl || video.src) ||
              "";
            results[fileId] = {
              thumbnail: videoPoster,
              ...(videoPoster && { source_thumbnail: videoPoster }),
              type: "video",
              thumb_is_poster: !!video.poster,
              ...(stableFileName && { file_name: stableFileName }),
              ...(flowInfo && { file_id: flowInfo.file_id }),
              ...typedProjection,
              ...(videoUrl && {
                video_url: videoUrl,
                playback_url_source: "dom_stream",
              }),
            };
          } else if (
            _flowPageContext?.driverKey === "flow_v2" &&
            typedRecord?.mediaType === "video"
          ) {
            const videoPoster =
              typedRecord.thumbnail || extractThumbnailUrl2(tile) || "";
            const videoUrl =
              typedRecord.resultUrl ||
              _deriveFlowV2VideoUrlFromPoster2(videoPoster) ||
              "";
            results[fileId] = {
              thumbnail: videoPoster,
              ...(videoPoster && { source_thumbnail: videoPoster }),
              type: "video",
              thumb_is_poster: !!videoPoster,
              ...(stableFileName && { file_name: stableFileName }),
              ...(videoUrl && { video_url: videoUrl }),
              ...typedProjection,
            };
          } else if (
            isVideoByAlt &&
            img?.src &&
            !img.src.includes("chrome-extension")
          ) {
            const _videoSrcFromThumb = _stripMediaUrlType2(img.src);
            results[fileId] = {
              thumbnail: img.src,
              source_thumbnail: img.src,
              type: "video",
              thumb_is_poster: true,
              ...(_videoSrcFromThumb && { video_url: _videoSrcFromThumb }),
              ...(stableFileName && { file_name: stableFileName }),
              ...(flowInfo && { file_id: flowInfo.file_id }),
              ...typedProjection,
            };
          } else if (img?.src && !img.src.includes("chrome-extension")) {
            results[fileId] = {
              thumbnail: img.src,
              type: "image",
              ...(stableFileName && { file_name: stableFileName }),
              ...(flowInfo && { file_id: flowInfo.file_id }),
              ...typedProjection,
            };
          }
        }
        console.log(
          "[TobyFlow] getThumbnailsByIds result",
          JSON.stringify({
            requested: fileIds.map((id) => ({
              identity: _safeFlowIdentityForLog2(id),
              has_file_name: !!fileNamesById[id],
            })),
            resolved: Object.entries(results).map(([id, info]) => ({
              identity: _safeFlowIdentityForLog2(id),
              has_file_name: !!info.file_name,
              type: info.type || null,
              persistent_identity_kind: _isFlowV2AsbIdentity2(
                info.persistent_media_id,
              )
                ? "flow_v2_asb"
                : info.persistent_media_id
                  ? "other"
                  : "missing",
              identity_durability: info.identity_durability || null,
              has_thumbnail: !!info.thumbnail,
              has_video_url: !!info.video_url,
            })),
            unresolved: fileIds
              .filter((id) => !results[id])
              .map(_safeFlowIdentityForLog2),
          }),
        );
        for (const fileId of fileIds) {
          if (
            results[fileId] &&
            (!ownerByResultId.has(String(fileId)) ||
              _isFlowV2AsbIdentity2(results[fileId]?.persistent_media_id))
          ) {
            statuses[fileId] = "resolved";
          } else if (!statuses[fileId]) statuses[fileId] = "missing";
        }
        const ambiguousCount = Object.values(statuses).filter(
          (status) => status === "ambiguous",
        ).length;
        if (ambiguousCount > 0) {
          console.info("[WorkflowVideoPersistence] ambiguous skipped", {
            requested: fileIds.length,
            ambiguous: ambiguousCount,
          });
        }
        if (message.metadataRequestId)
          console.log(
            "[FlowMetadataLookup] completed",
            JSON.stringify({
              requestId: message.metadataRequestId,
              returned: Object.keys(results).length,
              statuses,
            }),
          );
        return { results, statuses };
      },
      correctStaleFileIds: async () => {
        const startedAt = Date.now();
        const resolvedIds = new Set();
        let targetedScan = null;
        const idToUrlMap = message.idToUrlMap || {};
        const fileNameMap = message.fileNameMap || {};
        const fileIdMap = message.fileIdMap || {};
        const trustedFileNameIds = new Set(message.trustedFileNameIds || []);
        const oldIds = Object.keys(idToUrlMap);
        const fileNameOnlyIds = Object.keys(fileNameMap).filter(
          (id) => !idToUrlMap[id],
        );
        const allIds = [
          ...new Set([
            ...oldIds,
            ...fileNameOnlyIds,
            ...Object.keys(fileIdMap),
          ]),
        ];
        if (allIds.length === 0) return { corrections: {} };
        const nativeMetadata = {},
          nativeCorrections = {};
        for (const id of allIds) {
          const info =
            _getObservedFlowMediaMetadata2(fileIdMap[id] || id) ||
            _getObservedFlowMediaMetadata2(fileNameMap[id]);
          if (!info) continue;
          const expectedUuid =
            fileIdMap[id] ||
            (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) ? id : null);
          if (
            expectedUuid &&
            /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(expectedUuid) &&
            expectedUuid.toLowerCase() !== info.media_uuid
          )
            continue;
          nativeMetadata[id] = info;
          resolvedIds.add(id);
          if (id !== info.media_uuid && id !== info.persistent_media_id)
            nativeCorrections[id] = info.media_uuid;
        }
        console.info(
          "[FlowRefIdentityAudit]",
          JSON.stringify({
            stage: "content:native-before-dom",
            projectId:
              typeof getCurrentProjectId2 === "function"
                ? getCurrentProjectId2()
                : null,
            requested: allIds.length,
            resolved: resolvedIds.size,
            missing: allIds.length - resolvedIds.size,
            domScan: false,
            items: Object.entries(nativeMetadata)
              .slice(0, 32)
              .map(([id, info]) => ({
                requestedKind: _isFlowV2AsbIdentity2(id)
                  ? "asb"
                  : "uuid_or_other",
                mediaUuid: info.media_uuid,
                type: info.type,
                hasAsb: _isFlowV2AsbIdentity2(info.persistent_media_id),
              })),
          }),
        );
        if (resolvedIds.size === allIds.length)
          return {
            corrections: nativeCorrections,
            mediaMetadata: nativeMetadata,
            diagnostics: {
              resolvedIds: [...resolvedIds],
              missingIds: [],
              targetedScan: null,
              elapsedMs: Date.now() - startedAt,
            },
          };
        function getCorrectionId(tile) {
          const typed = _extractTypedTileRecord2(tile, null);
          if (_flowPageContext?.driverKey === "flow_v2") {
            return typed?.durability === "durable"
              ? typed.persistentMediaId
              : null;
          }
          return typed?.runtimeId || null;
        }
        function scanByFileName(idsToCheck) {
          const corrections2 = {};
          const fnMap = {};
          for (const id of idsToCheck) {
            if (fileNameMap[id]) fnMap[id] = fileNameMap[id];
          }
          if (Object.keys(fnMap).length === 0) return corrections2;
          const fnToTileId = new Map();
          const allTiles = document.querySelectorAll(_getTileSelectorString2());
          allTiles.forEach((tile) => {
            const tileId = getCorrectionId(tile);
            if (!tileId) return;
            const names =
              _flowPageContext?.driverKey === "flow_v2"
                ? _flowV2OutputIdentityAliases2(tile)
                : [_getPersistentMediaId2(tile) || extractFileName2(tile)];
            for (const fn of names) {
              if (fn)
                fnToTileId.set(
                  fn,
                  fnToTileId.has(fn) && fnToTileId.get(fn) !== tileId
                    ? null
                    : tileId,
                );
            }
          });
          for (const oldId of idsToCheck) {
            const savedFn = fnMap[oldId];
            if (!savedFn) continue;
            const newId = fnToTileId.get(savedFn);
            if (newId) resolvedIds.add(oldId);
            if (newId && newId !== oldId) {
              corrections2[oldId] = newId;
            }
          }
          return corrections2;
        }
        function normalizeMediaUrl(url) {
          if (!url || typeof url !== "string") return "";
          const urlPat = _getMediaUrlPattern2();
          if (urlPat && url.includes(urlPat)) {
            try {
              const urlObj = new URL(url, window.location.origin);
              const name = urlObj.searchParams.get("name");
              const input = urlObj.searchParams.get("input");
              if (name) return urlObj.pathname + "?name=" + name;
              if (input) {
                try {
                  const parsed = JSON.parse(decodeURIComponent(input));
                  const json = parsed?.json || parsed?.["0"]?.json || parsed;
                  if (json?.name) return urlObj.pathname + "?name=" + json.name;
                } catch (e) {}
              }
            } catch (e) {}
          }
          return url.split("=")[0];
        }
        function scanByThumbnailUrl(idsToCheck) {
          const corrections2 = {};
          const crossProjectIds = [];
          const urlToTileData = new Map();
          const allTiles = document.querySelectorAll(_getTileSelectorString2());
          allTiles.forEach((tile) => {
            const tileId = getCorrectionId(tile);
            if (!tileId) return;
            const img = _q2("tile_image", tile);
            const video = _q2("tile_video", tile);
            if (detectTileStatus2(tile) !== "success") return;
            const typed =
              _flowPageContext?.driverKey === "flow_v2"
                ? _extractTypedTileRecord2(tile, null)
                : null;
            const src = typed
              ? typed.thumbnailUrl || typed.resultUrl || ""
              : img?.src || video?.poster || video?.src || "";
            if (
              src &&
              !src.includes("chrome-extension") &&
              !src.startsWith("data:")
            ) {
              const normalized = normalizeMediaUrl(src);
              const tileFn =
                _getPersistentMediaId2(tile) || extractFileName2(tile);
              urlToTileData.set(
                normalized,
                urlToTileData.has(normalized)
                  ? null
                  : { tileId, file_name: tileFn },
              );
            }
          });
          for (const oldId of idsToCheck) {
            const savedUrl = idToUrlMap[oldId];
            if (!savedUrl) continue;
            const normalizedSaved = normalizeMediaUrl(savedUrl);
            const tileData = urlToTileData.get(normalizedSaved);
            if (!tileData || tileData.tileId === oldId) continue;
            const newId = tileData.tileId;
            const savedFn = fileNameMap[oldId];
            const tileFn = tileData.file_name;
            if (savedFn && tileFn && savedFn !== tileFn) {
              console.warn(
                `[TobyFlow] [T\u1EA7ng 2] Cross-project collision detected: oldId=${oldId.substring(0, 20)}... savedFn=${savedFn.substring(0, 20)}... vs tileFn=${tileFn.substring(0, 20)}...`,
              );
              crossProjectIds.push(oldId);
              continue;
            }
            if (savedFn && !tileFn) {
              console.warn(
                `[TobyFlow] [T\u1EA7ng 2] Skipping correction: savedFn=${savedFn.substring(0, 20)}... but tile has no file_name yet`,
              );
              continue;
            }
            corrections2[oldId] = newId;
          }
          return { corrections: corrections2, crossProjectIds };
        }
        function validateTileIdWithFileName(tileId, savedFileName) {
          if (!savedFileName) return true;
          const tile = _getTileById2(tileId);
          if (!tile) return false;
          if (_flowPageContext?.driverKey === "flow_v2")
            return _flowV2OutputIdentityAliases2(tile).includes(savedFileName);
          const currentFileName =
            _getPersistentMediaId2(tile) || extractFileName2(tile);
          if (!currentFileName) return true;
          return (
            currentFileName === savedFileName ||
            (_flowPageContext?.driverKey === "flow_v2" &&
              extractAllFileNames2(tile).includes(savedFileName))
          );
        }
        if (!(await _ensureSelectorConfigReadyForAction(3e3))) {
          console.warn(
            "[TobyFlow] correctStaleFileIds: timeout waiting for config",
          );
        }
        _tileSelectorCache = null;
        let _selector = _getTileSelectorString2();
        const _rawTiles = _selector ? document.querySelectorAll(_selector) : [];
        console.log(
          `[TobyFlow] correctStaleFileIds DEBUG: selector="${_selector}", rawTiles=${_rawTiles.length}, URL=${location.href.substring(0, 60)}`,
        );
        const totalTiles = _selector
          ? document.querySelectorAll(_selector).length
          : 0;
        const validIds = [];
        const needsCorrectionIds = [];
        for (const id of allIds) {
          if (resolvedIds.has(id)) {
            validIds.push(id);
            continue;
          }
          const tile = _getTileById2(id);
          if (tile) {
            const savedFn = fileNameMap[id];
            if (validateTileIdWithFileName(id, savedFn)) {
              validIds.push(id);
              resolvedIds.add(id);
            } else {
              console.log(
                `[TobyFlow] Cross-project detected: tile_id ${id.substring(0, 20)}... exists but file_name mismatch`,
              );
              needsCorrectionIds.push(id);
            }
          } else {
            needsCorrectionIds.push(id);
          }
        }
        console.log(
          `[TobyFlow] correctStaleFileIds: ${allIds.length} IDs check | ${validIds.length} valid | ${needsCorrectionIds.length} need correction | ${totalTiles} tiles tr\xEAn DOM`,
        );
        if (needsCorrectionIds.length === 0)
          return {
            corrections: nativeCorrections,
            mediaMetadata: nativeMetadata,
            diagnostics: {
              elapsedMs: Date.now() - startedAt,
              resolvedIds: [...resolvedIds],
              missingIds: [],
              targetedScan,
            },
          };
        let corrections = { ...nativeCorrections };
        for (const oldId of needsCorrectionIds) {
          const savedFileId = fileIdMap[oldId];
          if (!savedFileId) continue;
          const tile = findTileByFileId2(savedFileId);
          if (tile) {
            const newTileId = getCorrectionId(tile);
            if (newTileId) resolvedIds.add(oldId);
            if (newTileId && newTileId !== oldId) {
              corrections[oldId] = newTileId;
            }
          }
        }
        const tier0Count = Object.keys(corrections).length;
        if (tier0Count > 0) {
          console.log(
            `[TobyFlow] [T\u1EA7ng 0 file_id]: ${tier0Count}/${needsCorrectionIds.length} corrected`,
          );
        }
        const afterTier0 = needsCorrectionIds.filter(
          (id) => !corrections[id] && !resolvedIds.has(id),
        );
        const fnCorrections = scanByFileName(afterTier0);
        const fnCount = Object.keys(fnCorrections).length;
        if (fnCount > 0) {
          Object.assign(corrections, fnCorrections);
          console.log(
            `[TobyFlow] [T\u1EA7ng 1 file_name]: ${fnCount}/${afterTier0.length} corrected`,
          );
        }
        let uncorrected = needsCorrectionIds.filter(
          (id) => !corrections[id] && !resolvedIds.has(id),
        );
        let allCrossProjectIds = [];
        if (uncorrected.length > 0) {
          const urlResult = scanByThumbnailUrl(uncorrected);
          const urlCorrections = urlResult.corrections;
          const urlCrossProject = urlResult.crossProjectIds || [];
          const deferredTrusted = urlCrossProject.filter((id) =>
            trustedFileNameIds.has(id),
          );
          const confirmedCrossProject = urlCrossProject.filter(
            (id) => !trustedFileNameIds.has(id),
          );
          const urlCount = Object.keys(urlCorrections).length;
          if (urlCount > 0) {
            Object.assign(corrections, urlCorrections);
            console.log(
              `[TobyFlow] [T\u1EA7ng 2 thumbnail_url]: ${urlCount}/${uncorrected.length} corrected`,
            );
          }
          if (confirmedCrossProject.length > 0) {
            allCrossProjectIds.push(...confirmedCrossProject);
            console.log(
              `[TobyFlow] [T\u1EA7ng 2 cross-project]: ${confirmedCrossProject.length} detected`,
            );
          }
          if (deferredTrusted.length > 0) {
            console.log(
              `[TobyFlow] [T\u1EA7ng 2 API stale]: ${deferredTrusted.length} defer sang file_name target scan`,
            );
          }
          uncorrected = uncorrected.filter(
            (id) =>
              !corrections[id] &&
              !resolvedIds.has(id) &&
              !confirmedCrossProject.includes(id),
          );
        }
        allCrossProjectIds = [...new Set(allCrossProjectIds)];
        console.log(
          `[TobyFlow] correctStaleFileIds K\u1EBET QU\u1EA2: ${Object.keys(corrections).length}/${needsCorrectionIds.length} corrected, ${allCrossProjectIds.length} cross-project`,
        );
        for (const [oldId, newId] of Object.entries(corrections)) {
          console.log(
            "[TobyFlow] identity corrected",
            JSON.stringify({
              from: _flowAuditIdentitySummary2(oldId),
              to: _flowAuditIdentitySummary2(newId),
            }),
          );
        }
        if (allCrossProjectIds.length > 0) {
          console.log(
            "[TobyFlow] Cross-project identities",
            JSON.stringify(allCrossProjectIds.map(_flowAuditIdentitySummary2)),
          );
        }
        for (const id of Object.keys(corrections)) resolvedIds.add(id);
        const diagnostics = {
          elapsedMs: Date.now() - startedAt,
          resolvedIds: [...resolvedIds],
          missingIds: allIds.filter((id) => !resolvedIds.has(id)),
          correctedCount: Object.keys(corrections).length,
          targetedScan,
        };
        console.log(
          "[RefCorrectionAudit] complete",
          JSON.stringify({
            elapsedMs: diagnostics.elapsedMs,
            resolvedCount: diagnostics.resolvedIds.length,
            missingCount: diagnostics.missingIds.length,
            correctedCount: diagnostics.correctedCount,
            targetedScan: diagnostics.targetedScan,
          }),
        );
        return {
          corrections,
          mediaMetadata: nativeMetadata,
          crossProjectIds: allCrossProjectIds,
          diagnostics,
        };
      },
      findTileByFileName: () => {
        const fileName = message.fileName;
        if (!fileName) return { tileId: null };
        const tile = resolveTileByFileName2(fileName);
        return { tileId: tile ? _getTileRuntimeId2(tile) : null };
      },
      prepareFlowForScan: async () => {
        await ensureFlowTilesLoaded();
        const tileCount = document.querySelectorAll(
          _getTileSelectorString2(),
        ).length;
        return { success: true, tileCount };
      },
      applyFlowPageSettings: async () => {
        const result = await ensureFlowSettingsApplied();
        const applied =
          _flowPageContext?.driverKey === "flow_v2"
            ? result === true
            : _flowSettingsApplied;
        return { success: applied, applied };
      },
      scanFlowImages: async () => {
        if (!(await _ensureSelectorConfigReadyForAction(3e3))) {
          console.warn("[TobyFlow] scanFlowImages: timeout waiting for config");
          return { images: [], error: "selector_config_timeout" };
        }
        _tileSelectorCache = null;
        const images = [];
        const seenIds = new Set();
        let deepScanComplete = message.deep !== true;
        const tileSelector = _getTileSelectorString2();
        if (!tileSelector) {
          console.warn(
            "[TobyFlow] scanFlowImages: tile_container selector missing from active profile",
          );
          return { images: [], error: "tile_selector_missing" };
        }
        console.log(
          `[TobyFlow] scanFlowImages: selector="${tileSelector}", deep=${message.deep === true}`,
        );
        const _scanCurrent = () => {
          const tiles = document.querySelectorAll(tileSelector);
          tiles.forEach((tile) => {
            const runtimeId = _getTileRuntimeId2(tile);
            if (!runtimeId) return;
            const img = _q2("tile_image", tile);
            const video = _q2("tile_video", tile);
            if (detectTileStatus2(tile) !== "success") return;
            const fileName =
              _getPersistentMediaId2(tile) || extractFileName2(tile);
            const displayName = _getTileDisplayName2(tile);
            const typed = _extractTypedTileRecord2(tile, null);
            const stableFileName = fileName || typed?.persistentMediaId || null;
            const tileId = _getPersistableResultId2(tile, runtimeId);
            if (!tileId || seenIds.has(tileId)) return;
            if (video) {
              seenIds.add(tileId);
              const flowInfoV = extractFlowFileInfo2(tile);
              const videoSrc =
                video.src || video.querySelector("source")?.src || "";
              let vThumb = video.poster || "";
              if (
                !vThumb &&
                img &&
                img.src &&
                !img.src.includes("chrome-extension")
              )
                vThumb = img.src;
              if (!vThumb) vThumb = _deriveFlowV2PosterUrlFromVideo2(videoSrc);
              images.push({
                fileId: tileId,
                thumbnail: vThumb,
                ...(vThumb && { source_thumbnail: vThumb }),
                source: "flow",
                type: "video",
                ...(videoSrc && { video_url: videoSrc }),
                ...(stableFileName && { file_name: stableFileName }),
                persistent_media_id: typed?.persistentMediaId || null,
                ...(displayName && { display_name: displayName }),
                ...(flowInfoV && {
                  file_id: flowInfoV.file_id,
                  project_id: flowInfoV.project_id,
                }),
              });
            } else if (
              _flowPageContext?.driverKey === "flow_v2" &&
              typed?.mediaType === "video"
            ) {
              seenIds.add(tileId);
              const flowInfoV = extractFlowFileInfo2(tile);
              const videoSrc = typed.resultUrl || "";
              const vThumb =
                typed.thumbnail || extractThumbnailUrl2(tile) || videoSrc;
              images.push({
                fileId: tileId,
                thumbnail: vThumb,
                ...(vThumb && { source_thumbnail: vThumb }),
                source: "flow",
                type: "video",
                ...(videoSrc && { video_url: videoSrc }),
                ...(stableFileName && { file_name: stableFileName }),
                persistent_media_id: typed?.persistentMediaId || null,
                ...(displayName && { display_name: displayName }),
                identity_durability: typed.durability || "element-local",
                ...(flowInfoV && {
                  file_id: flowInfoV.file_id,
                  project_id: flowInfoV.project_id,
                }),
              });
            } else if (
              img &&
              img.src &&
              !img.src.includes("chrome-extension")
            ) {
              seenIds.add(tileId);
              const flowInfo = extractFlowFileInfo2(tile);
              images.push({
                fileId: tileId,
                thumbnail: img.src,
                source: "flow",
                type: "image",
                ...(fileName && { file_name: fileName }),
                ...(displayName && { display_name: displayName }),
                ...(flowInfo && {
                  file_id: flowInfo.file_id,
                  project_id: flowInfo.project_id,
                }),
              });
            }
          });
        };
        _scanCurrent();
        if (
          _flowPageContext?.driverKey === "flow_v2" &&
          typeof _flowObservedVideoIdentities !== "undefined"
        ) {
          const nativeRecords = [..._flowObservedVideoIdentities.keys()]
            .map((id) => _getObservedFlowMediaMetadata2(id))
            .filter(Boolean);
          const mountedUuids = new Set(
            images
              .map(
                (media) =>
                  media.media_uuid ||
                  _getObservedFlowMediaMetadata2(media.fileId)?.media_uuid,
              )
              .filter(Boolean),
          );
          for (const info of nativeRecords) {
            if (mountedUuids.has(info.media_uuid)) continue;
            mountedUuids.add(info.media_uuid);
            images.push({
              ...info,
              fileId: info.media_uuid,
              display_name: info.media_uuid,
              source: "flow",
            });
          }
          console.info(
            "[FlowMediaCatalog] picker",
            JSON.stringify({
              native: nativeRecords.length,
              available: images.length,
              complete: false,
              deepRequested: message.deep === true,
            }),
          );
        }
        if (message.deep === true) {
          console.info("[FlowDomScan] picker deep requested", {
            reason: "picker_scan_more",
            available: images.length,
          });
          const _inSession = !!(
            window._tobyFlowZoomSession && window._tobyFlowZoomSession.armed
          );
          const _bzOrig = _inSession ? null : await _getBrowserZoom();
          const _useBz = !_inSession && _bzOrig != null;
          const originalCssZoom = document.body.style.zoom || "1";
          const scrollerInfo = _findTilesScroller2();
          const sc =
            scrollerInfo?.el ||
            document.scrollingElement ||
            document.documentElement;
          try {
            if (_inSession) await _ensureZoomSessionActive();
            else if (_useBz) {
              await _setBrowserZoom(0.3);
              _zoomGuardSet2(0.3, _bzOrig);
              _setCounterScale2(0.3);
            } else document.body.style.zoom = "0.5";
            await sleep2(800);
            sc.scrollTop = 0;
            await sleep2(250);
            _scanCurrent();
            const step = Math.max(
              Math.floor((window.innerHeight || 800) * 0.8),
              500,
            );
            const MAX_STEPS = 400;
            let n = 0;
            for (; n < MAX_STEPS; n++) {
              const before = Number(sc.scrollTop || 0);
              const atEndBefore =
                before + sc.clientHeight >= sc.scrollHeight - 2;
              if (atEndBefore) {
                deepScanComplete = true;
                break;
              }
              sc.scrollTop = before + step;
              await sleep2(250);
              _scanCurrent();
              const after = Number(sc.scrollTop || 0);
              const atEndAfter = after + sc.clientHeight >= sc.scrollHeight - 2;
              if (atEndAfter) {
                deepScanComplete = true;
                break;
              }
              if (after <= before + 1) break;
            }
            sc.scrollTop = 0;
            console.log(
              "[FlowMediaLibrary] explicit deep scan",
              JSON.stringify({
                complete: deepScanComplete,
                scrollerVerified: scrollerInfo?.verified === true,
                steps: n,
                mediaObserved: images.length,
                durableAsbObserved: images.filter((media) =>
                  _isFlowV2AsbIdentity2(
                    media?.persistent_media_id ||
                      media?.file_name ||
                      media?.fileId,
                  ),
                ).length,
              }),
            );
          } finally {
            if (!_inSession) {
              if (_useBz) {
                await _setBrowserZoom(_bzOrig);
                _zoomGuardClear2();
              } else document.body.style.zoom = originalCssZoom;
              _clearCounterScale2();
            }
            await sleep2(200);
          }
          console.log(
            `[TobyFlow] scanFlowImages deep: t\xEDch lu\u1EF9 ${images.length} \u1EA3nh`,
          );
        }
        if (images.length === 0) {
          console.log("[TobyFlow] scanFlowImages: fallback to tile_image scan");
          const allImgs = _qa2("tile_image");
          allImgs.forEach((img, i) => {
            const src = img.src;
            if (
              !src ||
              src.includes("chrome-extension") ||
              img.naturalWidth < 50
            )
              return;
            const parentTile = img.closest(tileSelector);
            const runtimeId = _getTileRuntimeId2(parentTile);
            const fileId = parentTile
              ? _getPersistableResultId2(parentTile, runtimeId)
              : null;
            if (!fileId) {
              console.warn(
                "[TobyFlow] scanFlowImages: skipping img without tile ID",
              );
              return;
            }
            if (seenIds.has(fileId)) return;
            seenIds.add(fileId);
            const fileName =
              _getPersistentMediaId2(parentTile) ||
              extractFileName2(parentTile);
            const displayName = _getTileDisplayName2(parentTile);
            const flowInfo = extractFlowFileInfo2(parentTile);
            images.push({
              fileId,
              thumbnail: src,
              source: "flow",
              type: "image",
              ...(fileName && { file_name: fileName }),
              ...(displayName && { display_name: displayName }),
              ...(flowInfo && {
                file_id: flowInfo.file_id,
                project_id: flowInfo.project_id,
              }),
            });
          });
        }
        return {
          images: images.map((media) => {
            const native =
              _getObservedFlowMediaMetadata2(
                media.media_uuid || media.fileId,
              ) ||
              _getObservedFlowMediaMetadata2(
                media.persistent_media_id || media.file_name,
              );
            return native?.type === media.type
              ? { ...media, ...native }
              : media;
          }),
          deepScanComplete,
        };
      },
      uploadFilesToFlow: async () => {
        const filesData = message.filesData || [];
        console.log(
          "[uploadFilesToFlow] handler called with",
          filesData.length,
          "file(s), url:",
          window.location.href.substring(0, 80),
        );
        if (filesData.length === 0) return { tileIds: [], orderedTileIds: [] };
        try {
          self.FloatingTracker?._closeGrid?.(true);
        } catch (_) {}
        const uploadStopEpoch = _flowStopEpoch;
        const uploadRequestId = String(message.uploadRequestId || "");
        const uploadCancellation = {
          cancelled: _flowCancelledUploadRequests.has(uploadRequestId),
        };
        if (/^[0-9a-f-]{36}$/i.test(uploadRequestId)) {
          _flowActiveUploadRequests.set(uploadRequestId, uploadCancellation);
          setTimeout(
            () => {
              if (
                _flowActiveUploadRequests.get(uploadRequestId) ===
                uploadCancellation
              ) {
                _flowActiveUploadRequests.delete(uploadRequestId);
              }
            },
            5 * 60 * 1e3,
          );
        }
        const uploadTarget = FlowDriverRegistry.describeUrl(location.href);
        const uploadStopReason = () => {
          const live = FlowDriverRegistry.describeUrl(location.href);
          if (
            uploadCancellation.cancelled ||
            _flowCancelledUploadRequests.has(uploadRequestId)
          )
            return "request_cancelled";
          if (!FlowDriverRegistry.isProjectEditor(location.href))
            return "not_project_editor";
          if (!live) return "flow_context_missing";
          if (live.origin !== uploadTarget?.origin) return "origin_changed";
          if (live.projectId !== uploadTarget?.projectId)
            return "project_changed";
          if ((live.routePrefix || "") !== (uploadTarget?.routePrefix || ""))
            return "route_changed";
          if (
            message.manualUpload === true
              ? _flowStopEpoch !== uploadStopEpoch
              : shouldStop
          ) {
            return message.manualUpload === true
              ? "stop_epoch_changed"
              : "execution_stopped";
          }
          return null;
        };
        const uploadStopped = () => uploadStopReason() !== null;
        const beforeUploadStopReason = uploadStopReason();
        console.log(
          "[FlowUploadStopScope]",
          JSON.stringify({
            manual: message.manualUpload === true,
            previousStop: shouldStop,
            epoch: uploadStopEpoch,
            reason: beforeUploadStopReason,
          }),
        );
        if (beforeUploadStopReason)
          return {
            success: false,
            error: "UPLOAD_ABORTED",
            stage: "before_upload",
            diagnostics: {
              reason: beforeUploadStopReason,
              previousStop: shouldStop,
              manualUpload: message.manualUpload === true,
              stopEpoch: uploadStopEpoch,
            },
          };
        const isFlowV2 = _flowPageContext?.driverKey === "flow_v2";
        let flowInputs = isFlowV2
          ? []
          : Array.from(document.querySelectorAll('input[type="file"]'));
        if (!isFlowV2 && flowInputs.length === 0) {
          const maxWaitMs = 8e3;
          const pollInterval = 200;
          let waited = 0;
          while (waited < maxWaitMs && flowInputs.length === 0) {
            await sleep2(pollInterval);
            waited += pollInterval;
            flowInputs = Array.from(
              document.querySelectorAll('input[type="file"]'),
            );
          }
          if (flowInputs.length === 0) {
            console.warn(
              "[uploadFilesToFlow] No file input found after " +
                maxWaitMs +
                "ms wait (Flow React app ch\u01B0a bootstrap)",
            );
            return {
              tileIds: [],
              orderedTileIds: [],
              warning: "No file input found after wait",
              errorCode: "NO_FLOW_INPUT_AFTER_WAIT",
            };
          }
          console.log(
            "[uploadFilesToFlow] Found " +
              flowInputs.length +
              " file input(s) after " +
              waited +
              "ms wait",
          );
        }
        const orderedTileIds = [];
        const tileDetails = [];
        let consentConfirmed = false;
        for (let fileIdx = 0; fileIdx < filesData.length; fileIdx++) {
          if (uploadStopped())
            return {
              success: false,
              error: "UPLOAD_ABORTED",
              tileIds: orderedTileIds,
              orderedTileIds,
              tileDetails,
              stage: "before_file",
            };
          const fd = { ...filesData[fileIdx] };
          const originalName = fd.name;
          const isMuseVideoFlowBridge = fd.bridge_source === "muse_video_flow";
          const fileUploadStartedAt = performance.now();
          if (isFlowV2) {
            const viewport = await _stabilizeFlowResultViewport();
            console.log(
              "[FlowV2Upload] viewport ready before Plus menu",
              JSON.stringify({
                fileIndex: fileIdx + 1,
                moved: viewport?.moved === true,
                before: viewport?.before ?? null,
                after: viewport?.after ?? null,
              }),
            );
            if (uploadStopped())
              return {
                success: false,
                error: "UPLOAD_ABORTED",
                tileIds: orderedTileIds,
                orderedTileIds,
                tileDetails,
                stage: "scroll_top_before_upload",
              };
          }
          let existingTiles = getUniqueTileIds2(true);
          const contentPrepareStartedAt = performance.now();
          let bytes = _decodeFlowUploadBase642(fd.base64);
          const decodedAt = performance.now();
          fd.name = await _buildFlowUploadFilename(fd, bytes);
          console.info(
            "[FlowUploadPerf] content payload prepared",
            JSON.stringify({
              bytes: bytes.byteLength,
              decodeMs: Math.round(decodedAt - contentPrepareStartedAt),
              hashMs: Math.round(performance.now() - decodedAt),
              nativeBase64: typeof Uint8Array.fromBase64 === "function",
            }),
          );
          console.log(
            "[FlowUploadName]",
            JSON.stringify({
              originalKey: fd.key || null,
              originalName,
              uploadName: fd.name,
              size: bytes.length,
            }),
          );
          let file = new File([bytes], fd.name, { type: fd.type });
          fd.base64 = "";
          if (filesData[fileIdx] && typeof filesData[fileIdx] === "object") {
            filesData[fileIdx].base64 = "";
          }
          bytes = null;
          let dataTransfer = null;
          if (!isFlowV2) {
            dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
          }
          const isVideoFile =
            (fd.type || "").startsWith("video/") ||
            /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(fd.name || "");
          const uploadAttemptKey = JSON.stringify([
            getCurrentProjectId2(),
            fd.name,
          ]);
          const pendingUpload = isFlowV2
            ? _flowV2PendingUploads.get(uploadAttemptKey)
            : null;
          const reusableUpload = isFlowV2
            ? _findReusableFlowUploadTile2(existingTiles, fd.name)
            : null;
          if (pendingUpload) {
            existingTiles = pendingUpload.baseline;
            console.log(
              "[FlowV2Upload] reconcile previously dispatched upload; no redispatch",
              JSON.stringify({
                uploadName: fd.name,
                ownerId: pendingUpload.ownerId || null,
              }),
            );
          }
          if (reusableUpload) {
            existingTiles = existingTiles.filter(
              (id) => id !== reusableUpload.id,
            );
            console.log(
              "[FlowV2Upload] resume existing upload without dispatch",
              JSON.stringify({
                uploadName: fd.name,
                ownerId: reusableUpload.id,
                status: reusableUpload.status,
              }),
            );
          }
          let v2MenuCleanupError = null;
          try {
            if (reusableUpload || pendingUpload) {
            } else if (isFlowV2) {
              const resolved = globalThis.FlowDriverRegistry?.resolveForUrl?.(
                location.href,
              );
              const uploadResult = await resolved?.driver?.invoke("upload", {
                file,
                isStopped: uploadStopped,
              });
              if (!uploadResult?.success) {
                console.error(
                  "[FlowV2Upload] initiation failed",
                  JSON.stringify({
                    error: uploadResult?.error || "V2_UPLOAD_INIT_FAILED",
                    stage: uploadResult?.stage || "unknown",
                    diagnostics: uploadResult?.diagnostics || {},
                    file: { name: fd.name, type: fd.type, size: file.size },
                    url: location.href,
                  }),
                );
                return {
                  success: false,
                  tileIds: orderedTileIds,
                  orderedTileIds,
                  error: uploadResult?.error || "V2_UPLOAD_INIT_FAILED",
                  stage: uploadResult?.stage || "unknown",
                  diagnostics: uploadResult?.diagnostics || {},
                  blockedFile: fd.name,
                };
              }
              console.info(
                "[FlowUploadPerf] native picker dispatched",
                JSON.stringify({
                  bytes: file.size,
                  fileIndex: fileIdx + 1,
                  elapsedMs: Math.round(
                    performance.now() - fileUploadStartedAt,
                  ),
                }),
              );
              _flowV2PendingUploads.set(uploadAttemptKey, {
                baseline: [...existingTiles],
                ownerId: null,
              });
            } else if (isVideoFile) {
              const _acceptsOf = flowInputs.map(
                (i) => i.getAttribute("accept") || "(none)",
              );
              console.log(
                "[uploadFilesToFlow] video: file inputs accept =",
                JSON.stringify(_acceptsOf),
              );
              const videoInputs = flowInputs.filter((input) => {
                const accept = (
                  input.getAttribute("accept") || ""
                ).toLowerCase();
                return (
                  accept === "" ||
                  accept.includes("video") ||
                  accept.includes("*/*") ||
                  /(mp4|mov|webm|avi|mkv|m4v)/.test(accept)
                );
              });
              if (videoInputs.length > 0) {
                console.log(
                  `[uploadFilesToFlow] video \u2192 dispatch v\xE0o ${videoInputs.length} input nh\u1EADn video (native setter)`,
                );
                for (const input of videoInputs) {
                  try {
                    try {
                      const nativeFilesSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype,
                        "files",
                      )?.set;
                      if (nativeFilesSetter)
                        nativeFilesSetter.call(input, dataTransfer.files);
                      else input.files = dataTransfer.files;
                    } catch (_) {
                      input.files = dataTransfer.files;
                    }
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                  } catch (e) {}
                }
                document.body.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "Escape",
                    bubbles: true,
                  }),
                );
                await _waitVideoConfirmModal();
              } else {
                const buttonUpload = await _uploadFileViaUploadButton(file);
                if (buttonUpload === true || buttonUpload?.success === true) {
                  console.log(
                    '[uploadFilesToFlow] video upload qua n\xFAt "T\u1EA3i n\u1ED9i dung nghe nh\xECn l\xEAn" OK',
                  );
                } else {
                  await _dropVideoToFlow(file);
                }
              }
            } else {
              const targetInputs = flowInputs.filter((input) => {
                const accept = (
                  input.getAttribute("accept") || ""
                ).toLowerCase();
                if (!accept) return true;
                const acceptsVideo =
                  accept.includes("video") ||
                  /(mp4|mov|webm|avi|mkv|m4v)/.test(accept);
                const acceptsImage =
                  accept.includes("image") ||
                  /(png|jpe?g|webp|gif|heic|heif|avif)/.test(accept);
                return acceptsImage || !acceptsVideo;
              });
              const dispatchInputs =
                targetInputs.length > 0 ? targetInputs : flowInputs;
              for (const input of dispatchInputs) {
                try {
                  try {
                    const nativeFilesSetter = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype,
                      "files",
                    )?.set;
                    if (nativeFilesSetter) {
                      nativeFilesSetter.call(input, dataTransfer.files);
                    } else {
                      input.files = dataTransfer.files;
                    }
                  } catch (_) {
                    input.files = dataTransfer.files;
                  }
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                } catch (e) {}
              }
              document.body.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
              );
            }
            file = null;
            dataTransfer = null;
            let newTileId = null;
            let processingTileId = null;
            let v2UploadPendingObserved = false;
            let v2UploadOwnerId =
              reusableUpload?.id || pendingUpload?.ownerId || null;
            let processingSeenAt = 0;
            let activationAttempted = false;
            let waitTime = 0;
            const processingAcceptDelay = 15e3;
            const maxWait = 45e3 + (isVideoFile ? processingAcceptDelay : 0);
            const uploadWaitStartedAt = Date.now();
            let waitDeadline = uploadWaitStartedAt + maxWait;
            let uploadHardDeadline = uploadWaitStartedAt + maxWait * 3;
            let v2VideoLateDeadlineExtended = false;
            let lastDeadlineLogAt = 0;
            const checkInterval = 500;
            await sleep2(200);
            waitTime += 200;
            let lastUploadProgressAt = 0;
            let lastFullUploadScanAt = 0;
            let cachedMountedTileIds = existingTiles;
            let lateSettlementLogged = false;
            while (
              Date.now() < (isFlowV2 ? uploadHardDeadline : waitDeadline)
            ) {
              if (uploadStopped())
                return {
                  success: false,
                  tileIds: orderedTileIds,
                  orderedTileIds,
                  error: "UPLOAD_ABORTED",
                  stage: "wait_upload_result",
                };
              const pollNow = Date.now();
              if (
                isFlowV2 &&
                pollNow >= waitDeadline &&
                !lateSettlementLogged
              ) {
                lateSettlementLogged = true;
                console.warn(
                  "[FlowV2Upload] normal wait elapsed; continuing bounded late settlement",
                  JSON.stringify({
                    uploadName: fd.name,
                    elapsedMs: pollNow - uploadWaitStartedAt,
                    ownerLatched: !!v2UploadOwnerId,
                    pendingObserved: v2UploadPendingObserved,
                    hardRemainingMs: Math.max(0, uploadHardDeadline - pollNow),
                  }),
                );
              }
              const uploadErr = _detectFlowUploadError2();
              if (uploadErr) {
                console.warn(
                  "[uploadFilesToFlow] Flow blocked upload:",
                  uploadErr,
                );
                _flowV2PendingUploads.delete(uploadAttemptKey);
                return {
                  tileIds: orderedTileIds,
                  orderedTileIds,
                  error: "UPLOAD_BLOCKED",
                  errorMessage: uploadErr,
                  blockedFile: fd.name,
                };
              }
              if (!consentConfirmed) {
                consentConfirmed =
                  _clickUploadConsentModal2() ||
                  (isVideoFile &&
                    _clickUploadConsentModal2("video_upload_confirm"));
              }
              const ownedUploadTile =
                isFlowV2 && v2UploadOwnerId
                  ? _getTileById2(v2UploadOwnerId)
                  : null;
              if (isFlowV2 && !isVideoFile && ownedUploadTile) {
                const owned = ownedUploadTile;
                if (_isCompletedOwnedFlowImageUpload2(owned, fd.name)) {
                  newTileId = v2UploadOwnerId;
                  console.log(
                    "[FlowV2Upload] exact image receipt ready",
                    JSON.stringify({
                      elapsedMs: Date.now() - uploadWaitStartedAt,
                      ownerId: newTileId,
                    }),
                  );
                  break;
                }
              }
              const fullScanInterval =
                ownedUploadTile || lateSettlementLogged
                  ? checkInterval * 10
                  : checkInterval * 2;
              if (pollNow - lastFullUploadScanAt >= fullScanInterval) {
                cachedMountedTileIds = getUniqueTileIds2(true);
                lastFullUploadScanAt = pollNow;
              }
              const currentTiles = cachedMountedTileIds;
              let newTiles = currentTiles.filter(
                (id) =>
                  !existingTiles.includes(id) && !orderedTileIds.includes(id),
              );
              if (ownedUploadTile && !newTiles.includes(v2UploadOwnerId)) {
                newTiles.unshift(v2UploadOwnerId);
              }
              if (isFlowV2 && Date.now() - lastUploadProgressAt >= 1e4) {
                lastUploadProgressAt = Date.now();
                console.log(
                  "[FlowV2Upload] waiting for owned result",
                  JSON.stringify({
                    elapsedMs: Date.now() - uploadWaitStartedAt,
                    remainingMs: Math.max(
                      0,
                      (isFlowV2 ? uploadHardDeadline : waitDeadline) -
                        Date.now(),
                    ),
                    baselineCount: existingTiles.length,
                    mountedCount: currentTiles.length,
                    deltaCount: newTiles.length,
                    ownerLatched: !!v2UploadOwnerId,
                    pendingObserved: v2UploadPendingObserved,
                    sameNameExistingCount: currentTiles.filter(
                      (id) =>
                        existingTiles.includes(id) &&
                        _matchesFlowUploadName2(_getTileById2(id), fd.name),
                    ).length,
                  }),
                );
              }
              if (isFlowV2 && fd.name) {
                const exactNamedTiles = newTiles.filter((id) => {
                  const t = _getTileById2(id);
                  return _matchesFlowUploadName2(t, fd.name);
                });
                if (exactNamedTiles.length === 1) {
                  v2UploadOwnerId = exactNamedTiles[0];
                  if (_flowV2PendingUploads.has(uploadAttemptKey))
                    _flowV2PendingUploads.get(uploadAttemptKey).ownerId =
                      v2UploadOwnerId;
                  newTiles = exactNamedTiles;
                } else if (exactNamedTiles.length > 1) {
                  const completedId = !isVideoFile
                    ? _uniqueCompletedFlowImageUpload2(exactNamedTiles, fd.name)
                    : null;
                  if (completedId) {
                    v2UploadOwnerId = completedId;
                    if (_flowV2PendingUploads.has(uploadAttemptKey))
                      _flowV2PendingUploads.get(uploadAttemptKey).ownerId =
                        completedId;
                    newTiles = [completedId];
                    console.log(
                      "[FlowV2Upload] unique completed image among exact-name attempts",
                      completedId,
                    );
                  } else {
                    newTiles = [];
                  }
                } else if (
                  v2UploadOwnerId &&
                  newTiles.includes(v2UploadOwnerId)
                ) {
                  newTiles = [v2UploadOwnerId];
                } else {
                  const pendingTiles = newTiles.filter((id) => {
                    const t = _getTileById2(id);
                    return (
                      t &&
                      !!_q2("tile_pending", t) &&
                      !_q2("tile_error_owner", t)
                    );
                  });
                  if (pendingTiles.length === 1) {
                    v2UploadOwnerId = pendingTiles[0];
                    if (_flowV2PendingUploads.has(uploadAttemptKey))
                      _flowV2PendingUploads.get(uploadAttemptKey).ownerId =
                        v2UploadOwnerId;
                    newTiles = pendingTiles;
                    console.log(
                      "[uploadFilesToFlow] V2 latched unique pending upload owner:",
                      fd.name,
                      v2UploadOwnerId,
                    );
                  } else {
                    newTiles = [];
                  }
                }
              } else if (newTiles.length > 1 && fd.name) {
                const namedIdx = newTiles.findIndex((id) => {
                  const t = _getTileById2(id);
                  return (
                    t &&
                    (_getTileDisplayName2(t) === fd.name ||
                      (t.textContent || "").includes(fd.name))
                  );
                });
                if (namedIdx > 0) {
                  const [matched] = newTiles.splice(namedIdx, 1);
                  newTiles.unshift(matched);
                }
              }
              if (newTiles.length > 0) {
                const tile = _getTileById2(newTiles[0]);
                if (tile) {
                  let status = detectTileStatus2(tile);
                  if (isFlowV2) {
                    const hasPendingOwner = !!_q2("tile_pending", tile);
                    const completedOwnedImage =
                      !isVideoFile &&
                      _isCompletedOwnedFlowImageUpload2(tile, fd.name);
                    if (completedOwnedImage) status = "success";
                    if (hasPendingOwner && !completedOwnedImage) {
                      v2UploadPendingObserved = true;
                      status = "processing";
                    }
                    if (
                      isMuseVideoFlowBridge &&
                      isVideoFile &&
                      v2UploadOwnerId === newTiles[0] &&
                      v2UploadPendingObserved &&
                      !v2VideoLateDeadlineExtended
                    ) {
                      uploadHardDeadline = uploadWaitStartedAt + maxWait * 8;
                      v2VideoLateDeadlineExtended = true;
                      console.info(
                        "[FlowV2Upload] extend accepted video settlement window",
                        JSON.stringify({
                          uploadName: fd.name,
                          ownerId: v2UploadOwnerId,
                          hardDeadlineMs:
                            uploadHardDeadline - uploadWaitStartedAt,
                        }),
                      );
                    }
                    if (hasPendingOwner && v2UploadOwnerId === newTiles[0]) {
                      const now = Date.now();
                      const renewed = Math.min(
                        uploadHardDeadline,
                        now + processingAcceptDelay,
                      );
                      if (renewed > waitDeadline) {
                        waitDeadline = renewed;
                        if (now - lastDeadlineLogAt >= 1e4) {
                          lastDeadlineLogAt = now;
                          console.log(
                            "[FlowV2Upload] extend owned processing wait",
                            JSON.stringify({
                              uploadName: fd.name,
                              ownerId: v2UploadOwnerId,
                              elapsedMs: now - uploadWaitStartedAt,
                              remainingMs: waitDeadline - now,
                              hardRemainingMs: uploadHardDeadline - now,
                            }),
                          );
                        }
                      }
                    }
                  }
                  if (status === "success") {
                    newTileId = newTiles[0];
                    break;
                  }
                  if (status === "failed") {
                    console.log(
                      "[uploadFilesToFlow] Tile failed, attempting auto-retry:",
                      newTiles[0],
                    );
                    _flowV2PendingUploads.delete(uploadAttemptKey);
                    console.log(
                      "[FixUpload-LOCK] upload retry: acquiring ctx menu lock (serialize v\u1EDBi download right-click)...",
                    );
                    if (!(await _acquireCtxMenuLock(uploadStopped)))
                      return {
                        success: false,
                        error: "UPLOAD_ABORTED",
                        tileIds: orderedTileIds,
                        orderedTileIds,
                        tileDetails,
                        stage: "wait_retry_lock",
                      };
                    let retryClicked;
                    try {
                      retryClicked = clickUploadRetryButton2(newTiles[0]);
                    } finally {
                      _releaseCtxMenuLock2();
                    }
                    console.log(
                      "[FixUpload-LOCK] upload retry: released lock, clicked=" +
                        retryClicked,
                    );
                    if (retryClicked) {
                      console.log(
                        "[uploadFilesToFlow] Retry button clicked, waiting for recovery...",
                      );
                      await sleep2(2e3);
                      const retryTile = _getTileById2(newTiles[0]);
                      const retryStatus = detectTileStatus2(retryTile);
                      if (retryStatus === "success") {
                        console.log(
                          "[uploadFilesToFlow] Tile recovered after retry:",
                          newTiles[0],
                        );
                        newTileId = newTiles[0];
                        break;
                      }
                      console.log(
                        "[uploadFilesToFlow] Tile still failed after retry, skipping:",
                        newTiles[0],
                      );
                    }
                    break;
                  }
                  if (!processingTileId) {
                    processingTileId = newTiles[0];
                    processingSeenAt = Date.now();
                  }
                  if (
                    processingTileId &&
                    !activationAttempted &&
                    Date.now() - processingSeenAt >= processingAcceptDelay
                  ) {
                    activationAttempted = true;
                    console.log(
                      "[uploadFilesToFlow] Tab inactive: tile stuck processing, trying to activate tab...",
                    );
                    try {
                      await new Promise((resolve) => {
                        chrome.runtime.sendMessage(
                          { action: "ensureFlowTabActive" },
                          () => resolve(),
                        );
                      });
                      await sleep2(2e3);
                      const reCheckTile = _getTileById2(processingTileId);
                      const reCheckStatus = detectTileStatus2(reCheckTile);
                      if (reCheckStatus === "success") {
                        console.log(
                          "[uploadFilesToFlow] Tab activated, tile now success:",
                          processingTileId,
                        );
                        newTileId = processingTileId;
                        break;
                      } else if (reCheckStatus === "failed") {
                        console.log(
                          "[uploadFilesToFlow] Tab activated but tile failed, attempting auto-retry:",
                          processingTileId,
                        );
                        if (!(await _acquireCtxMenuLock(uploadStopped)))
                          return {
                            success: false,
                            error: "UPLOAD_ABORTED",
                            tileIds: orderedTileIds,
                            orderedTileIds,
                            tileDetails,
                            stage: "wait_retry_lock",
                          };
                        let retryClicked;
                        try {
                          retryClicked =
                            clickUploadRetryButton2(processingTileId);
                        } finally {
                          _releaseCtxMenuLock2();
                        }
                        if (retryClicked) {
                          await sleep2(2e3);
                          const retryTile = _getTileById2(processingTileId);
                          const retryStatus = detectTileStatus2(retryTile);
                          if (retryStatus === "success") {
                            console.log(
                              "[uploadFilesToFlow] Tile recovered after retry:",
                              processingTileId,
                            );
                            newTileId = processingTileId;
                            break;
                          }
                        }
                        break;
                      }
                      console.log(
                        "[uploadFilesToFlow] Tab activated but tile still processing, waiting 5s more...",
                      );
                      await sleep2(5e3);
                      const finalTile = _getTileById2(processingTileId);
                      const finalStatus = detectTileStatus2(finalTile);
                      if (finalStatus === "success") {
                        newTileId = processingTileId;
                        break;
                      }
                      console.warn(
                        "[uploadFilesToFlow] Tile still processing after tab activate + 5s wait; continuing bounded poll",
                      );
                    } catch (e) {
                      console.warn(
                        "[uploadFilesToFlow] ensureFlowTabActive failed:",
                        e.message,
                      );
                    }
                  }
                }
              }
              await sleep2(checkInterval);
              waitTime += checkInterval;
            }
            if (!newTileId && processingTileId) {
              console.warn(
                "[uploadFilesToFlow] Timeout: tile still processing, NOT accepting:",
                processingTileId,
              );
            }
            if (!newTileId && isFlowV2) {
              const mountedIds = getUniqueTileIds2(true);
              const deltaIds = mountedIds.filter(
                (id) =>
                  !existingTiles.includes(id) && !orderedTileIds.includes(id),
              );
              const exactNamedIds = deltaIds.filter((id) =>
                _matchesFlowUploadName2(_getTileById2(id), fd.name),
              );
              const completedId = !isVideoFile
                ? _uniqueCompletedFlowImageUpload2(exactNamedIds, fd.name)
                : null;
              if (completedId) {
                newTileId = completedId;
                console.log(
                  "[FlowV2Upload] exact image receipt found on final scan",
                  newTileId,
                );
              }
              if (!newTileId) {
                const diagnostics = {
                  elapsedMs: Date.now() - uploadWaitStartedAt,
                  hardLimitReached: Date.now() >= uploadHardDeadline,
                  pendingObserved: v2UploadPendingObserved,
                  ownerLatched: !!v2UploadOwnerId,
                  processingObserved: !!processingTileId,
                  baselineCount: existingTiles.length,
                  mountedCount: mountedIds.length,
                  deltaCount: deltaIds.length,
                  exactNameCount: exactNamedIds.length,
                  completedExactCount: exactNamedIds.filter((id) =>
                    _isCompletedOwnedFlowImageUpload2(
                      _getTileById2(id),
                      fd.name,
                    ),
                  ).length,
                  visibility: document.visibilityState,
                };
                console.warn(
                  "[FlowV2Upload] result unverified",
                  JSON.stringify(diagnostics),
                );
                return {
                  success: false,
                  tileIds: orderedTileIds,
                  orderedTileIds,
                  tileDetails,
                  keyMapping: Object.fromEntries(
                    tileDetails
                      .filter((detail) => detail.originalKey && detail.id)
                      .map((detail) => [detail.originalKey, detail.id]),
                  ),
                  error: "V2_UPLOAD_RESULT_UNVERIFIED",
                  stage: "wait_upload_result",
                  diagnostics,
                };
              }
            }
            if (newTileId) {
              let tile = _getTileById2(newTileId);
              const uploadRuntimeId = newTileId;
              const media = tile
                ? _q2("tile_video", tile) || _q2("tile_image", tile)
                : null;
              let fileName =
                _getPersistentMediaId2(tile) ||
                extractFileName2(tile) ||
                (typeof extractAllFileNames2 === "function"
                  ? extractAllFileNames2(tile)[0]
                  : null);
              let thumbnailUrl = media?.src || "";
              const isValidThumbUrl = (url) =>
                url && !url.startsWith("blob:") && !url.includes("placeholder");
              const uploadMetadataStartedAt = Date.now();
              const settledVideoOwner =
                isFlowV2 &&
                isVideoFile &&
                !!tile &&
                detectTileStatus2(tile) === "success";
              const hasDurableUploadIdentity = () =>
                typeof fileName === "string" &&
                (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  fileName,
                ) ||
                  _isFlowV2AsbIdentity2(fileName));
              const needsUploadMetadata = () =>
                !fileName ||
                (!(settledVideoOwner && hasDurableUploadIdentity()) &&
                  !isValidThumbUrl(thumbnailUrl));
              if (needsUploadMetadata() && tile) {
                const metadataWaitMs = isVideoFile
                  ? processingAcceptDelay
                  : 5e3;
                for (
                  let fnWait = 0;
                  fnWait < metadataWaitMs && needsUploadMetadata();
                  fnWait += 500
                ) {
                  if (uploadStopped())
                    return {
                      success: false,
                      error: "UPLOAD_ABORTED",
                      tileIds: orderedTileIds,
                      orderedTileIds,
                      tileDetails,
                      stage: "wait_upload_metadata",
                    };
                  await sleep2(500);
                  tile = _getTileById2(newTileId) || tile;
                  const tileId = tile.dataset?.tileId;
                  if (tileId) _fileNameCache.delete(tileId);
                  fileName =
                    _getPersistentMediaId2(tile) ||
                    extractFileName2(tile) ||
                    (typeof extractAllFileNames2 === "function"
                      ? extractAllFileNames2(tile)[0]
                      : null);
                  const freshMedia =
                    _q2("tile_video", tile) || _q2("tile_image", tile);
                  if (freshMedia?.src) thumbnailUrl = freshMedia.src;
                }
                if (fileName) {
                  console.log(
                    "[uploadFilesToFlow] Got file_name after waiting:",
                    fileName,
                  );
                } else {
                  console.warn(
                    "[uploadFilesToFlow] Could not get file_name for tile:",
                    newTileId,
                  );
                }
                if (isValidThumbUrl(thumbnailUrl)) {
                  console.log(
                    "[uploadFilesToFlow] Got valid thumbnailUrl after waiting",
                  );
                } else {
                  console.warn(
                    "[uploadFilesToFlow] Could not get valid thumbnailUrl for tile:",
                    newTileId,
                  );
                }
              }
              console.log(
                "[FlowV2Upload] metadata phase finished",
                JSON.stringify({
                  mediaType: isVideoFile ? "video" : "image",
                  elapsedMs: Date.now() - uploadMetadataStartedAt,
                  settledVideoOwner,
                  durableIdentity: hasDurableUploadIdentity(),
                  previewPending: isVideoFile && !isValidThumbUrl(thumbnailUrl),
                }),
              );
              if (isFlowV2 && !fileName) {
                const diagnostics = {
                  ownerId: uploadRuntimeId,
                  pendingObserved: v2UploadPendingObserved,
                  hasMediaUrl: !!isValidThumbUrl(thumbnailUrl),
                  uploadName: fd.name,
                };
                console.warn(
                  "[FlowV2Upload] owned tile awaiting durable metadata; retain attempt",
                  JSON.stringify(diagnostics),
                );
                return {
                  success: false,
                  error: "V2_UPLOAD_RESULT_UNVERIFIED",
                  stage: "wait_upload_metadata",
                  tileIds: orderedTileIds,
                  orderedTileIds,
                  tileDetails,
                  diagnostics,
                };
              }
              let uploadVideoUrl = "";
              if (isFlowV2 && isVideoFile && tile) {
                uploadVideoUrl = extractVideoUrl2(tile) || "";
                if (!uploadVideoUrl) {
                  _activateFlowV2VideoTile2(tile);
                  const playbackDeadline =
                    Date.now() + Math.min(processingAcceptDelay, 8e3);
                  let lastActivatedTile = tile;
                  while (
                    !uploadVideoUrl &&
                    Date.now() < playbackDeadline &&
                    !uploadStopped()
                  ) {
                    await sleep2(250);
                    tile =
                      _getTileById2(uploadRuntimeId) ||
                      _getTileById2(newTileId) ||
                      tile;
                    if (tile !== lastActivatedTile) {
                      _activateFlowV2VideoTile2(tile);
                      lastActivatedTile = tile;
                    }
                    uploadVideoUrl = extractVideoUrl2(tile) || "";
                    const liveVideo = _q2("tile_video", tile);
                    const livePoster =
                      liveVideo?.poster ||
                      _q2("tile_video_poster", tile)?.src ||
                      "";
                    if (
                      !isValidThumbUrl(thumbnailUrl) &&
                      isValidThumbUrl(livePoster)
                    )
                      thumbnailUrl = livePoster;
                  }
                  console.log(
                    "[FlowV2Upload] playback capture after settled receipt",
                    JSON.stringify({
                      captured: !!uploadVideoUrl,
                      elapsedMs: Math.max(
                        0,
                        Math.min(processingAcceptDelay, 8e3) -
                          Math.max(0, playbackDeadline - Date.now()),
                      ),
                    }),
                  );
                }
              }
              const flowInfo = extractFlowFileInfo2(tile);
              const detectedMediaType = detectMediaType2(tile);
              const mediaType = isVideoFile ? "video" : detectedMediaType;
              const videoUrl =
                mediaType === "video"
                  ? uploadVideoUrl ||
                    extractVideoUrl2(tile) ||
                    _deriveFlowV2VideoUrlFromPoster2(thumbnailUrl) ||
                    ""
                  : "";
              const observedUploadInfo =
                _getObservedFlowMediaMetadata2(newTileId) ||
                _getObservedFlowMediaMetadata2(fileName);
              const nativeUploadInfo =
                observedUploadInfo?.type === mediaType
                  ? observedUploadInfo
                  : null;
              const mediaUuid =
                [
                  nativeUploadInfo?.media_uuid,
                  flowInfo?.file_id,
                  fileName,
                  newTileId,
                ]
                  .map((value) => String(value || "").trim())
                  .find((value) =>
                    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value),
                  ) || "";
              if (isFlowV2 && tile) {
                const persistableId = _getPersistentMediaId2(tile) || fileName;
                newTileId =
                  persistableId ||
                  _getPersistableResultId2(tile, uploadRuntimeId);
                if (persistableId) {
                  _flowV2ResultOwners.set(persistableId, {
                    tile,
                    runtimeId: uploadRuntimeId,
                    projectId: getCurrentProjectId2(),
                  });
                }
              }
              orderedTileIds.push(newTileId);
              _flowV2PendingUploads.delete(uploadAttemptKey);
              console.log(
                "[FlowV2Upload] settled media contract",
                JSON.stringify({
                  originalKey: fd.key || null,
                  requestedType: isVideoFile ? "video" : "image",
                  detectedMediaType,
                  returnedType: mediaType,
                  hasPersistentId: !!fileName,
                  returnedIdentityKind: String(newTileId || "").startsWith(
                    "flow-v2-result:",
                  )
                    ? "element_local"
                    : _isFlowV2AsbIdentity2(newTileId)
                      ? "flow_v2_asb"
                      : "media_uuid",
                  hasVideoUrl: !!videoUrl,
                  totalMs: Math.round(performance.now() - fileUploadStartedAt),
                }),
              );
              tileDetails.push({
                id: newTileId,
                thumbnailUrl,
                type: mediaType,
                ...(videoUrl &&
                  !videoUrl.startsWith("blob:") && { video_url: videoUrl }),
                ...(fileName && { file_name: fileName }),
                ...(mediaUuid && { media_uuid: mediaUuid }),
                ...(flowInfo && {
                  file_id: flowInfo.file_id,
                  project_id: flowInfo.project_id,
                }),
                originalName,
                uploadName: fd.name,
                display_name: _getTileDisplayName2(tile) || fd.name,
                originalKey: fd.key,
                ...(nativeUploadInfo || {}),
                ...(nativeUploadInfo?.thumbnail && {
                  thumbnailUrl: nativeUploadInfo.thumbnail,
                }),
                ...(settledVideoOwner &&
                  hasDurableUploadIdentity() && {
                    preview_pending:
                      !isValidThumbUrl(thumbnailUrl) || !videoUrl,
                  }),
              });
            }
          } finally {
            if (isFlowV2) {
              const pickerCleanupStartedAt = Date.now();
              console.log(
                "[FlowV2Upload] picker cleanup started",
                JSON.stringify({
                  mediaType: isVideoFile ? "video" : "image",
                  verifiedReceipts: tileDetails.length,
                }),
              );
              const menuCleanup = await _ensureFlowV2AddMenuClosed({
                ignoreStop: true,
                requireEditor: true,
              });
              if (!menuCleanup.success) {
                v2MenuCleanupError =
                  menuCleanup.error || "V2_UPLOAD_MENU_CLEANUP_FAILED";
                console.warn(
                  "[FlowV2Upload] picker cleanup incomplete:",
                  menuCleanup.error,
                );
              } else {
                console.log(
                  "[FlowV2Upload] picker closed; prompt editor ready",
                  {
                    mediaType: isVideoFile ? "video" : "image",
                    actioned: menuCleanup.actioned,
                    elapsedMs: Date.now() - pickerCleanupStartedAt,
                  },
                );
              }
            }
          }
          if (v2MenuCleanupError) {
            const verifiedUpload = tileDetails.some(
              (detail) => detail.id && detail.file_name,
            );
            return {
              success: verifiedUpload,
              tileIds: orderedTileIds,
              orderedTileIds,
              tileDetails,
              keyMapping: Object.fromEntries(
                tileDetails
                  .filter((detail) => detail.originalKey && detail.id)
                  .map((detail) => [detail.originalKey, detail.id]),
              ),
              ...(verifiedUpload
                ? { warning: v2MenuCleanupError, editorReady: false }
                : { error: v2MenuCleanupError }),
              stage: "close_upload_menu",
            };
          }
          if (fileIdx < filesData.length - 1) {
            await sleep2(200);
          }
        }
        const keyMapping = {};
        for (const detail of tileDetails) {
          if (detail.originalKey && detail.id) {
            keyMapping[detail.originalKey] = detail.id;
          }
        }
        return {
          tileIds: orderedTileIds,
          tileDetails,
          orderedTileIds,
          keyMapping,
        };
      },
      cancelTileMediaDownload: async () => {
        const state = _manualDownloadRequests.get(message.requestId);
        if (!state) return { success: false, error: "DOWNLOAD_NOT_ACTIVE" };
        state.cancelled = true;
        if (state.nativeOperationId) {
          try {
            await chrome.runtime.sendMessage({
              action: "cancelPreparedDownload",
              requestId: state.nativeOperationId,
            });
          } catch (_) {}
        }
        return { success: true };
      },
      downloadTileMedia: async () => {
        const tileId = message.tileId;
        const promptText = message.promptText || "flow";
        const taskName = message.taskName || null;
        const fileName = message.fileName || null;
        const resolution = message.resolution || null;
        const flowFileId = message.flowFileId || null;
        const index = message.index || null;
        const videoResolution = message.videoResolution || null;
        const watermarkMode = message.watermarkMode || null;
        if (!tileId && !flowFileId)
          return { success: false, error: "No tileId or flowFileId" };
        const state = { cancelled: false, nativeOperationId: null };
        if (message.requestId)
          _manualDownloadRequests.set(message.requestId, state);
        try {
          const result = await downloadTileMedia(
            tileId,
            promptText,
            taskName,
            fileName,
            resolution,
            flowFileId,
            index,
            videoResolution,
            watermarkMode,
            message.plannedFilename || null,
            false,
            () => state.cancelled,
            (operationId) => {
              state.nativeOperationId = operationId;
            },
          );
          if (state.cancelled)
            return { success: false, error: "DOWNLOAD_STOPPED" };
          return result !== false
            ? { success: true }
            : { success: false, error: "DOWNLOAD_NOT_COMPLETED" };
        } catch (e) {
          return { success: false, error: e.message };
        } finally {
          if (message.requestId)
            _manualDownloadRequests.delete(message.requestId);
        }
      },
      extractTileIdentifiers: () => {
        const tileId = message.tileId;
        if (!tileId) return { fileName: null, thumbnailUrl: null };
        const tile = _getTileById2(tileId);
        if (!tile) return { fileName: null, thumbnailUrl: null };
        const fileName = _getPersistentMediaId2(tile) || extractFileName2(tile);
        const src = extractThumbnailUrl2(tile) || "";
        const thumbnailUrl =
          src &&
          (src.startsWith("http://") || src.startsWith("https://")) &&
          !src.startsWith("data:") &&
          !src.startsWith("chrome-extension:")
            ? src
            : null;
        const videoUrl = extractVideoUrl2(tile);
        return {
          fileName,
          thumbnailUrl,
          ...(videoUrl && { video_url: videoUrl }),
        };
      },
      scanGalleryTiles: () => {
        const tiles = scanGalleryTiles2();
        return { tiles };
      },
      scanFlowTiles: () => {
        const rawTiles = scanGalleryTiles2();
        const tiles = rawTiles
          .filter((t) => t.status === "success" && t.thumbnail)
          .map((t) => ({
            id: t.tileId,
            thumbnail: t.thumbnail,
            src: t.mediaSrc,
            type: t.mediaType,
            ...(t.mediaType === "video" &&
              t.mediaSrc && { video_url: t.mediaSrc }),
            ...(t.file_name && { file_name: t.file_name }),
            ...(t.persistent_media_id && {
              persistent_media_id: t.persistent_media_id,
            }),
            ...(t.identity_durability && {
              identity_durability: t.identity_durability,
            }),
            ...(t.file_id && { file_id: t.file_id }),
            ...(t.project_id && { project_id: t.project_id }),
          }));
        return { tiles };
      },
      downloadImage: async () => {
        const url = message.url;
        const filename = message.filename || `flow_${Date.now()}.png`;
        if (!_isAllowedFlowMediaUrl2(url, { allowBlob: false })) {
          return { success: false, error: "FLOW_MEDIA_URL_NOT_ALLOWED" };
        }
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          return { success: true };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
      getDownloadCounter: () => {
        return { count: getDownloadCounter2() };
      },
      lookupFlowMediaCatalog: async () => {
        if (typeof _flowNativeMediaSnapshotReady !== "undefined")
          await _flowNativeMediaSnapshotReady;
        return _lookupFlowMediaCatalog2(message.identities);
      },
      checkTilesExist: () => {
        const tileIds = message.tileIds || [];
        const existing = [];
        const missing = [];
        for (const id of tileIds) {
          if (_getTileById2(id)?.isConnected) {
            existing.push(id);
          } else {
            missing.push(id);
          }
        }
        return { existing, missing };
      },
      checkFilesExist: () => {
        const fileNames = message.fileNames || [];
        const requestedFileNames = new Set(fileNames);
        const found = {};
        const tiles = document.querySelectorAll(_getTileSelectorString2());
        const domFileNames = [];
        for (const tile of tiles) {
          const identities = extractAllFileNames2(tile);
          const runtimeId =
            _flowPageContext?.driverKey === "flow_v2"
              ? _getPersistentMediaId2(tile) || _getTileRuntimeId2(tile)
              : _getTileRuntimeId2(tile);
          for (const identity of identities) {
            domFileNames.push(identity);
            if (requestedFileNames.has(identity) && runtimeId)
              found[identity] = runtimeId;
          }
        }
        const existing = fileNames.filter((fn) => found[fn]);
        const missing = fileNames.filter((fn) => !found[fn]);
        console.log(
          "[REUPLOAD_AUDIT] checkFilesExist",
          JSON.stringify({
            input: fileNames.map(_flowAuditIdentitySummary2),
            tiles: tiles.length,
            domIdentityCount: domFileNames.length,
            existingCount: existing.length,
            missingCount: missing.length,
          }),
        );
        if (missing.length > 0 && domFileNames.length > 0) {
          console.log(
            "[REUPLOAD_AUDIT] checkFilesExist DOM sample",
            JSON.stringify(
              domFileNames.slice(0, 5).map(_flowAuditIdentitySummary2),
            ),
          );
        }
        return { existing, missing, found };
      },
      ensureFlowTilesLoaded: async () => {
        if (
          message.purpose === "identity" &&
          _flowPageContext?.driverKey === "flow_v2"
        ) {
          if (typeof _flowNativeMediaSnapshotReady !== "undefined")
            await _flowNativeMediaSnapshotReady;
          const lookup = _lookupFlowMediaCatalog2(
            message.targetFileNames || [],
          );
          return {
            success: true,
            found: Object.fromEntries(
              Object.entries(lookup.known).map(([id, info]) => [
                id,
                info.persistent_media_id,
              ]),
            ),
            catalog: lookup,
            unknown: lookup.unknown,
            domScan: false,
          };
        }
        if (typeof ensureFlowTilesLoaded !== "function") {
          return { success: false, error: "ensureFlowTilesLoaded not defined" };
        }
        try {
          const force = message.force === true;
          const targetFileNames = Array.isArray(message.targetFileNames)
            ? message.targetFileNames
            : [];
          const found = await ensureFlowTilesLoaded(force, targetFileNames, {
            recentOnly: message.recentOnly === true,
            reason: message.reason || null,
            deadline: message.flowScanDeadline,
            scanControl: message._flowScanControl,
          });
          const tilesCount = document.querySelectorAll(
            _getTileSelectorString2(),
          ).length;
          return {
            success: true,
            tilesCount,
            forced: force,
            found: found || {},
          };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
      beginFlowZoomSession: async () => {
        const factor =
          typeof message.factor === "number" ? message.factor : 0.3;
        const hold = message.hold === true;
        const _cur = window._tobyFlowZoomSession;
        if (_cur?.armed && _cur.factor === factor) {
          if (hold) _cur.refs = (_cur.refs || 0) + 1;
          return { ok: true, kept: true, refs: _cur.refs };
        }
        if (_cur?.active) {
          try {
            await _endZoomSession();
          } catch (_) {}
        }
        window._tobyFlowZoomSession = {
          armed: true,
          active: false,
          factor,
          refs: hold ? 1 : 0,
          mode: null,
          original: null,
          originalCss: null,
        };
        _armZoomSessionDeadline2();
        console.log(
          `[TobyFlow] zoom session: armed (factor=${factor}, hold=${hold})`,
        );
        return { ok: true };
      },
      "zoomGuard:revoked": async () => {
        const s = window._tobyFlowZoomSession;
        _clearZoomUx2();
        if (s) {
          while (s.guarded > 0) {
            s.guarded--;
            _zoomGuardClear2();
          }
          s.active = false;
          s.mode = null;
          s.restored = false;
        }
        console.info(
          "[TobyFlow] zoom guard: zoom b\u1ECB thu h\u1ED3i t\u1EEB background \u2192 session s\u1EBD t\u1EF1 zoom l\u1EA1i khi c\u1EA7n",
        );
        return { ok: true };
      },
      endFlowZoomSession: async () => {
        const s = window._tobyFlowZoomSession;
        if (!s)
          return {
            ok: true,
            restored: false,
            noSession: true,
            zoom: await _getBrowserZoom(),
          };
        if (message.force) {
          s.refs = 0;
          try {
            await _endZoomSession();
            return { ok: true, restored: true };
          } catch (error) {
            return {
              ok: false,
              restored: false,
              error: error?.message || "Failed to restore Flow zoom",
            };
          }
        }
        if (message.release) {
          s.refs = Math.max(0, (s.refs || 0) - 1);
        }
        if ((s.refs || 0) > 0) return { ok: true, kept: true, refs: s.refs };
        try {
          await _endZoomSession();
          return { ok: true, restored: true };
        } catch (error) {
          return {
            ok: false,
            restored: false,
            error: error?.message || "Failed to restore Flow zoom",
          };
        }
      },
      fetchImageAsBase64: async () => {
        const url = message.url;
        if (!_isAllowedFlowMediaUrl2(url))
          return { success: false, error: "FLOW_MEDIA_URL_NOT_ALLOWED" };
        try {
          const resp = await fetch(url);
          if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
          const contentType = resp.headers.get("content-type") || "";
          if (!contentType.startsWith("image/"))
            return { success: false, error: `Not image: ${contentType}` };
          const buffer = await resp.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++)
            binary += String.fromCharCode(bytes[i]);
          return { success: true, base64: btoa(binary), contentType };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
      getProjectContext: () => {
        return {
          ..._flowPageContext,
          projectId: getCurrentProjectId2(),
          projectName: extractProjectName2(),
          documentTitle: document.title || null,
          projectError: _isFlowProjectErrorState2(),
          mediaViewer: _isFlowMediaViewerOpen2(),
          signedOut: _isFlowSignedOut2(),
        };
      },
      showCaptchaOverlay: () => {
        _showCaptchaOverlay2({
          text: message.text,
          canResume: message.canResume,
        });
        return { ok: true };
      },
      hideCaptchaOverlay: () => {
        _hideCaptchaOverlay2();
        return { ok: true };
      },
      getFlowErrorState: () => {
        const state = _getFlowErrorState2();
        let tileReason = null,
          tileCategory = null;
        const tid = message.tileId;
        if (tid) {
          try {
            const tileEl = _getTileById2(tid);
            if (tileEl) {
              const reason = _extractTileFailReason2(tileEl);
              if (reason) {
                tileReason = reason;
                tileCategory = _classifyFlowErrorText2(reason);
              }
            }
          } catch (_) {}
        }
        return { state, tileReason, tileCategory };
      },
      scanFlowProjects: async () => {
        const scanUrl = location.href;
        const isHomePage = !getCurrentProjectId2();
        if (isHomePage) {
          try {
            await _autoScrollLoadProjects(message.force === true);
          } catch (_) {}
        }
        if (location.href !== scanUrl)
          return { error: "FLOW_EXECUTION_TARGET_CHANGED" };
        return { projects: _collectFlowProjects2(), isHomePage };
      },
      openFlowProject: async () => {
        const projectId = String(message.projectId || "");
        if (!FlowDriverRegistry.PROJECT_ID_RE.test(projectId)) {
          return { success: false, error: "INVALID_PROJECT_ID" };
        }
        if (getCurrentProjectId2())
          return { success: false, error: "FLOW_HOMEPAGE_REQUIRED" };
        const homepageUrl = location.href;
        try {
          await _autoScrollLoadProjects(message.force === true);
        } catch (_) {}
        if (location.href !== homepageUrl || getCurrentProjectId2()) {
          return { success: false, error: "FLOW_EXECUTION_TARGET_CHANGED" };
        }
        const link = Array.from(_qa2("project_link")).find(
          (candidate) =>
            FlowDriverRegistry.projectIdForUrl(candidate.href) === projectId,
        );
        if (!link)
          return { success: false, error: "FLOW_PROJECT_CARD_NOT_FOUND" };
        const projectUrl = link.href;
        const homepageSnapshot = location.href;
        link.click();
        setTimeout(() => {
          if (location.href === homepageSnapshot && !getCurrentProjectId2()) {
            try {
              location.assign(projectUrl);
            } catch (_) {}
          }
        }, 350);
        return {
          success: true,
          clicked: true,
          projectId,
          navigationPending: true,
        };
      },
      command: () => {
        if (message.command === "generate") {
          const startBtn = document.getElementById("startBtn");
          if (startBtn && !startBtn.classList.contains("hidden"))
            startBtn.click();
        }
        return { ok: true };
      },
      startCropSelection: () => {
        return new Promise((resolve) => {
          const existing = document.getElementById("tobyflow-crop-overlay");
          if (existing) existing.remove();
          const overlay = document.createElement("div");
          overlay.id = "tobyflow-crop-overlay";
          overlay.className = "tobyflow-crop-overlay";
          overlay.innerHTML = `
          <div class="tobyflow-crop-selection" id="tobyflow-crop-selection">
            <div class="tobyflow-crop-controls" id="tobyflow-crop-controls">
              <button class="tobyflow-crop-btn tobyflow-crop-btn-capture" id="tobyflow-crop-capture-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                Ch\u1EE5p
              </button>
              <button class="tobyflow-crop-btn tobyflow-crop-btn-cancel" id="tobyflow-crop-cancel-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                H\u1EE7y
              </button>
            </div>
          </div>
        `;
          if (!document.getElementById("tobyflow-crop-styles")) {
            const style = document.createElement("style");
            style.id = "tobyflow-crop-styles";
            style.textContent = `
            .tobyflow-crop-overlay {
              position: fixed;
              inset: 0;
              background: rgba(0,0,0,0.5);
              z-index: 999999;
              cursor: crosshair;
            }
            .tobyflow-crop-selection {
              position: absolute;
              border: 2px dashed #fff;
              background: transparent;
              display: none;
              box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);
            }
            .tobyflow-crop-controls {
              position: absolute;
              bottom: -52px;
              left: 50%;
              transform: translateX(-50%);
              display: none;
              gap: 8px;
              z-index: 1000000;
              white-space: nowrap;
            }
            .tobyflow-crop-controls.visible {
              display: flex;
            }
            .tobyflow-crop-btn {
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 10px 20px;
              border: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s ease;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .tobyflow-crop-btn svg {
              flex-shrink: 0;
            }
            .tobyflow-crop-btn-capture {
              background: #cdff01;
              color: #1c1c1f;
            }
            .tobyflow-crop-btn-capture:hover {
              background: #d4ff33;
              transform: scale(1.02);
            }
            .tobyflow-crop-btn-cancel {
              background: rgba(40,40,45,0.95);
              color: #fff;
              border: 1px solid rgba(255,255,255,0.15);
            }
            .tobyflow-crop-btn-cancel:hover {
              background: rgba(60,60,65,0.95);
            }
          `;
            document.head.appendChild(style);
          }
          document.body.appendChild(overlay);
          let startX = 0,
            startY = 0;
          let isDrawing = false;
          let hasSelection = false;
          const selection = document.getElementById("tobyflow-crop-selection");
          const controls = document.getElementById("tobyflow-crop-controls");
          overlay.addEventListener("mousedown", (e) => {
            if (e.target.closest(".tobyflow-crop-controls")) return;
            isDrawing = true;
            hasSelection = false;
            controls.classList.remove("visible");
            startX = e.clientX;
            startY = e.clientY;
            selection.style.left = startX + "px";
            selection.style.top = startY + "px";
            selection.style.width = "0px";
            selection.style.height = "0px";
            selection.style.display = "block";
          });
          overlay.addEventListener("mousemove", (e) => {
            if (!isDrawing) return;
            const w = e.clientX - startX;
            const h = e.clientY - startY;
            if (w < 0) {
              selection.style.left = e.clientX + "px";
              selection.style.width = -w + "px";
            } else {
              selection.style.left = startX + "px";
              selection.style.width = w + "px";
            }
            if (h < 0) {
              selection.style.top = e.clientY + "px";
              selection.style.height = -h + "px";
            } else {
              selection.style.top = startY + "px";
              selection.style.height = h + "px";
            }
          });
          overlay.addEventListener("mouseup", () => {
            if (!isDrawing) return;
            isDrawing = false;
            const rect = selection.getBoundingClientRect();
            if (rect.width >= 20 && rect.height >= 20) {
              hasSelection = true;
              controls.classList.add("visible");
            }
          });
          document
            .getElementById("tobyflow-crop-capture-btn")
            .addEventListener("click", () => {
              const rect = selection.getBoundingClientRect();
              const cropRect = {
                x: Math.round(rect.left * window.devicePixelRatio),
                y: Math.round(rect.top * window.devicePixelRatio),
                width: Math.round(rect.width * window.devicePixelRatio),
                height: Math.round(rect.height * window.devicePixelRatio),
              };
              overlay.remove();
              if (cropRect.width < 10 || cropRect.height < 10) {
                resolve({
                  success: false,
                  error: "V\xF9ng ch\u1ECDn qu\xE1 nh\u1ECF",
                });
              } else {
                resolve({ success: true, cropRect });
              }
            });
          document
            .getElementById("tobyflow-crop-cancel-btn")
            .addEventListener("click", () => {
              overlay.remove();
              resolve({ success: false, cancelled: true });
            });
          const escHandler = (e) => {
            if (e.key === "Escape") {
              overlay.remove();
              document.removeEventListener("keydown", escHandler);
              resolve({ success: false, cancelled: true });
            }
          };
          document.addEventListener("keydown", escHandler);
        });
      },
      cancelCropSelection: () => {
        const overlay = document.getElementById("tobyflow-crop-overlay");
        if (overlay) overlay.remove();
        return { success: true };
      },
      "pq:getPreTileSnapshot": async () => {
        const snapshotStartedAt = Date.now();
        _invalidateTileCache2();
        const tilesById = new Map();
        for (const tile of _getCachedTiles2()) {
          const id = _getTileRuntimeId2(tile);
          if (id && !tilesById.has(id)) tilesById.set(id, tile);
        }
        const ids = [...tilesById.keys()];
        const names = [...getExistingFileNames2()];
        const tileMediaById = {};
        const tilePersistentById = {};
        const tileFileNameById = {};
        const tileStatusById = {};
        let processed = 0;
        for (const [id, tile] of tilesById) {
          const persistentId = _getPersistentMediaId2(tile);
          const fileName = persistentId || extractFileName2(tile) || null;
          tileMediaById[id] = detectMediaType2(tile);
          tilePersistentById[id] = !!persistentId;
          tileFileNameById[id] = fileName;
          tileStatusById[id] = detectTileStatus2(tile);
          processed++;
          if (processed % 256 === 0 && processed < tilesById.size)
            await sleep2(0);
        }
        console.log(
          `[content.js] pq:getPreTileSnapshot \u2014 captured ${ids.length} tile IDs + ${names.length} file names (baseline TR\u01AF\u1EDAC submit)`,
        );
        console.info("[FlowPresubmitSnapshot]", {
          tiles: ids.length,
          elapsedMs: Date.now() - snapshotStartedAt,
          strategy: "single_pass",
          yieldedBatches: Math.max(0, Math.floor((processed - 1) / 256)),
        });
        return {
          success: true,
          preTileIds: ids,
          documentEpoch: _TOBYFLOW_DOCUMENT_EPOCH,
          preFileNames: names,
          tileMediaById,
          tilePersistentById,
          tileFileNameById,
          tileStatusById,
        };
      },
      "pq:addRefImages": async () => {
        const { fileIds, fileNameMap, mediaTypeMap, identityMap } = message;
        console.log(
          "[DEBUG_REF] pq:addRefImages called with fileIds:",
          fileIds,
          "fileNameMap keys:",
          Object.keys(fileNameMap || {}),
          "mediaTypeMap:",
          mediaTypeMap || {},
        );
        const requestedFileIds = (fileIds || []).filter(Boolean);
        const commandEpoch = _flowStopEpoch;
        const abortRequested = () =>
          shouldStop ||
          _flowStopEpoch !== commandEpoch ||
          (message._flowScanControl?.signal.aborted &&
            message._flowScanControl.signal.reason?.name === "AbortError");
        const scanControl = message._flowScanControl;
        const timedOutIds = [];
        try {
          let addedCount = 0;
          let failedIds = [];
          const prefetchTargets = [
            ...new Set(
              requestedFileIds
                .map((fid) => identityMap?.[fid] || fileNameMap?.[fid] || fid)
                .filter(Boolean),
            ),
          ];
          if (
            _flowPageContext?.driverKey === "flow_v2" &&
            prefetchTargets.length > 1
          ) {
            try {
              const prefetched = await ensureFlowTilesLoaded(
                false,
                prefetchTargets,
                {
                  reason: "web_add_ref_batch_prefetch",
                  shouldAbort: abortRequested,
                  deadline: scanControl?.deadline,
                  scanControl,
                },
              );
              console.info("[FlowRefBatchPrefetch]", {
                requested: prefetchTargets.length,
                captured: Object.keys(prefetched || {}).length,
              });
            } catch (error) {
              console.warn(
                "[FlowRefBatchPrefetch] skipped:",
                error?.message || error,
              );
            }
            if (abortRequested()) {
              return {
                success: false,
                aborted: true,
                addedCount,
                failedIds,
                totalRequested: requestedFileIds.length,
              };
            }
          }
          for (const fid of requestedFileIds) {
            if (abortRequested()) {
              return {
                success: false,
                aborted: true,
                addedCount,
                failedIds,
                totalRequested: requestedFileIds.length,
              };
            }
            let result;
            try {
              if (
                scanControl?.signal.aborted &&
                scanControl.signal.reason?.name === "AbortError"
              )
                throw scanControl.signal.reason;
              result = await addFileToPrompt(
                fid,
                fileNameMap?.[fid],
                identityMap?.[fid] || null,
                mediaTypeMap?.[fid],
                () =>
                  abortRequested() ||
                  (scanControl?.signal.aborted &&
                    scanControl.signal.reason?.name === "AbortError"),
                { deadline: scanControl?.deadline, scanControl },
              );
            } catch (error) {
              if (error?.code === "FLOW_REF_SCAN_TIMEOUT") {
                timedOutIds.push(fid);
                failedIds.push(fid);
                continue;
              }
              if (error?.name === "AbortError")
                return {
                  success: false,
                  aborted: true,
                  addedCount,
                  failedIds,
                  totalRequested: requestedFileIds.length,
                };
              throw error;
            }
            if (abortRequested()) {
              return {
                success: false,
                aborted: true,
                addedCount,
                failedIds,
                totalRequested: requestedFileIds.length,
              };
            }
            if (result === false) {
              failedIds.push(fid);
            } else {
              addedCount++;
            }
          }
          const allSuccess = failedIds.length === 0;
          console.log("[DEBUG_REF] pq:addRefImages result:", {
            addedCount,
            failedIds,
            totalRequested: requestedFileIds.length,
          });
          if (!allSuccess) {
            console.warn(
              "[pq:addRefImages] Failed to add:",
              failedIds.length,
              "of",
              requestedFileIds.length,
              "ref images",
            );
          }
          return {
            success: allSuccess,
            addedCount,
            failedIds,
            timedOutIds,
            totalRequested: requestedFileIds.length,
          };
        } finally {
          const mountedBeforeCleanup = _tileCache?.length || 0;
          const cachedTiles = _tileCache ? Array.from(_tileCache) : [];
          const detachedCachedTiles = cachedTiles.filter(
            (tile) => !tile.isConnected,
          ).length;
          _invalidateTileCache2();
          _pruneDetachedFlowV2ResultOwners2();
          console.info(
            "[FlowRefCacheRelease]",
            JSON.stringify({
              mountedBeforeCleanup,
              cachedTiles: cachedTiles.length,
              detachedCachedTiles,
              ..._flowCommandMemorySnapshot2(),
            }),
          );
        }
      },
      "pq:verifyRefAttachments": () => {
        const barConfigured =
          (_getDynamicSelector2("ingredient_bar")?.selectors || []).length > 0;
        const imageConfigured =
          (_getDynamicSelector2("ingredient_image_chip")?.selectors || [])
            .length > 0;
        const videoConfigured =
          (_getDynamicSelector2("ingredient_video_chip")?.selectors || [])
            .length > 0;
        return {
          success: barConfigured && imageConfigured && videoConfigured,
          barConfigured,
          imageConfigured,
          videoConfigured,
          imageCount:
            barConfigured && imageConfigured
              ? _flowV2IngredientChips2("ingredient_image_chip").length
              : null,
          videoCount:
            barConfigured && videoConfigured
              ? _flowV2IngredientChips2("ingredient_video_chip").length
              : null,
        };
      },
      "pq:removeExistingRefImages": async () => {
        console.log("[content.js] pq:removeExistingRefImages received");
        const removed = await removeExistingRefImages();
        console.log(
          `[content.js] pq:removeExistingRefImages done \u2014 removed ${removed} ingredient chip(s)`,
        );
        return { success: true, removed };
      },
      "pq:verifySlateModel": () => {
        const editor = getEditor2();
        if (!editor) return { success: true, hasContent: false };
        if (editor.classList?.contains("ProseMirror")) {
          const placeholder = editor.querySelector(".prosemirror-placeholder");
          return {
            success: true,
            hasContent:
              !placeholder && (editor.textContent || "").trim().length > 0,
          };
        }
        const noPlaceholder =
          editor.querySelector("[data-slate-placeholder]") === null;
        const hasText = editor.textContent?.trim().length > 0;
        const hasContent = noPlaceholder || hasText;
        return { success: true, hasContent };
      },
      detectTileStatus: () => {
        const tile = _getTileById2(message.tileId);
        return { status: detectTileStatus2(tile) };
      },
      retryFailedTilesViaButton: async () => {
        shouldStop = false;
        const result = await retryFailedTilesViaButton(
          message.failedTileIds || [],
          message.timeout || 12e4,
          message.excludeTileIds || null,
          message.ackOnly === true,
        );
        return result;
      },
      legacyTrackerUpdate: () => {
        FloatingTracker.updateLegacy(message.data);
        return { success: true };
      },
      "ft:historyProtection": () => {
        const projectId =
          typeof self.getCurrentProjectId === "function"
            ? self.getCurrentProjectId()
            : null;
        return {
          success: true,
          projectId,
          jobIds: self.FloatingTracker?._ttlProtectedJobIds?.() || [],
        };
      },
      "pq:trackerUpdate": async () => {
        if (typeof self.FloatingTracker === "undefined")
          return { success: false, error: "tracker_not_loaded" };
        self.FloatingTracker.update(message.data);
        let trackerPersisted = null;
        if (
          message.persistBeforeReply === true &&
          self.FloatingTracker._lastCacheWritePromise
        ) {
          const cacheResult = await self.FloatingTracker._lastCacheWritePromise;
          trackerPersisted = cacheResult?.ok === true;
        }
        if (
          typeof message.data?.blockerRunId === "string" &&
          message.data.blockerRunId
        ) {
          ExecutionBlocker._trackerBlockerRunId = message.data.blockerRunId;
        }
        try {
          if (ExecutionBlocker._el) ExecutionBlocker._applyMode();
        } catch (_) {}
        return { success: true, trackerPersisted };
      },
      "pq:recoveryTrace": () => {
        console.info(
          "[PromptQueue/RecoveryTrace]",
          JSON.stringify(message.data || {}),
        );
        return { success: true };
      },
      "pq:trackerHide": () => {
        if (typeof self.FloatingTracker === "undefined")
          return { success: false, error: "tracker_not_loaded" };
        FloatingTracker.hide();
        ApiGenNotice.hide();
        return { success: true };
      },
      "pq:chunkStatus": () => {
        if (typeof self.FloatingTracker === "undefined")
          return { success: false, error: "tracker_not_loaded" };
        FloatingTracker.setChunkStatus(message.data);
        return { success: true };
      },
      "pq:pauseExecution": () => {
        if (message.paused) {
          window._pqPaused = true;
          if (ExecutionBlocker._pendingHideTimer) {
            clearTimeout(ExecutionBlocker._pendingHideTimer);
            ExecutionBlocker._pendingHideTimer = null;
          }
          ExecutionBlocker._pausedWhileBlocking = ExecutionBlocker._blocking;
          ExecutionBlocker._pausedPipelineOwned =
            ExecutionBlocker._pipelineOwned;
          try {
            ExecutionBlocker.hide();
          } catch (_) {}
        } else {
          window._pqPaused = false;
          if (ExecutionBlocker._pausedWhileBlocking) {
            ExecutionBlocker._pausedWhileBlocking = false;
            ExecutionBlocker._pipelineOwned =
              ExecutionBlocker._pausedPipelineOwned;
            ExecutionBlocker._pausedPipelineOwned = false;
            try {
              ExecutionBlocker.show();
            } catch (_) {}
          }
        }
        return { success: true };
      },
      "pq:apiAuthStatus": () => {
        if (typeof self.ApiGenNotice === "undefined")
          return { success: false, error: "tracker_not_loaded" };
        self.ApiGenNotice.showAuthRecovery(message.state);
        return { success: true };
      },
      "pq:showBlocker": () => {
        const blockerRunId =
          typeof message.blockerRunId === "string" && message.blockerRunId
            ? message.blockerRunId
            : null;
        if (ExecutionBlocker._stopReleased) {
          ExecutionBlocker.hide();
          return { success: true, suppressed: true };
        }
        if (
          blockerRunId &&
          ExecutionBlocker._releasedBlockerRunIds.has(blockerRunId)
        ) {
          if (
            !ExecutionBlocker._activeBlockerRunId ||
            ExecutionBlocker._activeBlockerRunId === blockerRunId
          )
            ExecutionBlocker.hide();
          return { success: true, suppressed: true, stale: true };
        }
        if (ExecutionBlocker._pendingHideTimer) {
          clearTimeout(ExecutionBlocker._pendingHideTimer);
          ExecutionBlocker._pendingHideTimer = null;
        }
        if (blockerRunId) ExecutionBlocker._activeBlockerRunId = blockerRunId;
        ExecutionBlocker._pipelineOwned = true;
        ExecutionBlocker.show();
        return { success: true };
      },
      "pq:hideBlocker": () => {
        if (ExecutionBlocker._pendingHideTimer)
          clearTimeout(ExecutionBlocker._pendingHideTimer);
        if (message.immediate === true) {
          const blockerRunId =
            typeof message.blockerRunId === "string" && message.blockerRunId
              ? message.blockerRunId
              : null;
          if (
            message.stopRelease !== true &&
            blockerRunId &&
            ExecutionBlocker._activeBlockerRunId &&
            ExecutionBlocker._activeBlockerRunId !== blockerRunId
          ) {
            return {
              success: true,
              immediate: true,
              released: false,
              stale: true,
              blockerRunId,
              activeBlockerRunId: ExecutionBlocker._activeBlockerRunId,
            };
          }
          ExecutionBlocker._pendingHideTimer = null;
          if (message.stopRelease === true)
            ExecutionBlocker._stopReleased = true;
          if (blockerRunId) {
            ExecutionBlocker._releasedBlockerRunIds.add(blockerRunId);
            while (ExecutionBlocker._releasedBlockerRunIds.size > 32) {
              ExecutionBlocker._releasedBlockerRunIds.delete(
                ExecutionBlocker._releasedBlockerRunIds.values().next().value,
              );
            }
          }
          ExecutionBlocker._activeBlockerRunId = null;
          if (
            !blockerRunId ||
            ExecutionBlocker._trackerBlockerRunId === blockerRunId
          ) {
            ExecutionBlocker._trackerBlockerRunId = null;
          }
          ExecutionBlocker._pipelineOwned = false;
          ExecutionBlocker._pausedWhileBlocking = false;
          ExecutionBlocker._pausedPipelineOwned = false;
          ExecutionBlocker.hide();
          console.log(
            "[ExecutionBlocker] terminal release",
            JSON.stringify({
              blockerRunId,
              stopRelease: message.stopRelease === true,
              mounted: _getCachedTiles2().length,
              ..._flowCommandMemorySnapshot2(),
            }),
          );
          return {
            success: true,
            immediate: true,
            released:
              !ExecutionBlocker._blocking && !ExecutionBlocker.isVisible(),
            blockerRunId,
            activeBlockerRunId: ExecutionBlocker._activeBlockerRunId,
          };
        }
        ExecutionBlocker._pendingHideTimer = setTimeout(function () {
          ExecutionBlocker._pendingHideTimer = null;
          ExecutionBlocker._pipelineOwned = false;
          ExecutionBlocker.hide();
        }, 300);
        return { success: true };
      },
      autoReloadFlow: async () => {
        if (message.expectedFlowTarget) {
          const mismatch = _verifyFlowTarget2({
            _flowTarget: message.expectedFlowTarget,
          });
          if (mismatch) return mismatch;
        }
        console.log("[content.js] Auto-reloading Flow page...");
        if (_flowPageContext?.driverKey === "flow_v2") {
          const pendingSelector = _selStr2("tile_pending");
          if (!pendingSelector)
            return { success: false, error: "V2_PENDING_SELECTOR_MISSING" };
          const pendingCount =
            document.querySelectorAll(pendingSelector).length;
          if (pendingCount > 0 && message.settledIdentityRefresh !== true) {
            return {
              success: false,
              error: "V2_PENDING_TILES_ACTIVE",
              blocked: true,
            };
          }
          if (pendingCount > 0) {
            console.warn(
              "[autoReloadFlow] Ignoring stale V2 pending marker after terminal identity reconciliation:",
              { pendingCount },
            );
          }
        }
        try {
          const editor = getEditor2();
          if (editor) {
            await clearEditor(editor);
            await sleep2(100);
          }
        } catch (e) {
          console.warn(
            "[autoReloadFlow] Clear editor before reload failed:",
            e.message,
          );
        }
        setTimeout(() => {
          if (
            message.expectedFlowTarget &&
            _verifyFlowTarget2({ _flowTarget: message.expectedFlowTarget })
          )
            return;
          location.reload();
        }, 100);
        return { success: true };
      },
      getFlowReloadPendingCount: () => {
        if (_flowPageContext?.driverKey !== "flow_v2") return { count: 0 };
        const pendingSelector = _selStr2("tile_pending");
        if (!pendingSelector)
          return { success: false, error: "V2_PENDING_SELECTOR_MISSING" };
        return { count: document.querySelectorAll(pendingSelector).length };
      },
      getPendingTileCount: () => {
        try {
          const { excludeClaimedTileIds = [] } = message;
          const excludeSet = new Set(excludeClaimedTileIds);
          const tiles = document.querySelectorAll(_getTileSelectorString2());
          let pending = 0;
          const pendingSelector = _selStr2("tile_pending");
          for (const tile of tiles) {
            const tid = _getTileRuntimeId2(tile);
            if (tid && excludeSet.has(tid)) continue;
            if (pendingSelector && tile.querySelector(pendingSelector)) {
              pending++;
              continue;
            }
            if (_flowPageContext?.driverKey === "flow_v2") {
              if (detectTileStatus2(tile) === "processing") pending++;
              continue;
            }
            if (tile.querySelector('video[src^="http"], video[src^="blob:"]'))
              continue;
            if (
              Array.from(tile.querySelectorAll("i")).some(
                (el) => el.textContent.trim() === "play_circle",
              )
            ) {
              pending++;
              continue;
            }
            const imgDone = tile.querySelector(
              'img[src^="http"], img[src^="blob:"]',
            );
            if (imgDone) {
              const src = imgDone.src || "";
              if (!src.includes("media.html") && !src.endsWith(".html")) {
                continue;
              }
            }
            const status = detectTileStatus2(tile);
            if (status === "processing") pending++;
          }
          return { count: pending };
        } catch (e) {
          return { count: 0, error: e.message };
        }
      },
      checkContentScriptAlive: () => {
        return {
          alive: true,
          hasEditor: !!getEditor2(),
          documentEpoch: _TOBYFLOW_DOCUMENT_EPOCH,
        };
      },
      getTileStatuses: () => {
        const { tileIds } = message;
        const statuses = {};
        for (const tileId of tileIds) {
          const tile = _getTileById2(tileId);
          if (!tile) {
            statuses[tileId] = { status: "not_found" };
            continue;
          }
          const initialStatus = detectTileStatus2(tile);
          const fileName =
            initialStatus === "success"
              ? _getPersistentMediaId2(tile) || extractFileName2(tile)
              : null;
          const mediaType = detectMediaType2(tile);
          const persistentMediaId = _getPersistentMediaId2(tile);
          const missingStableCompletion =
            location.origin === "https://flow.google.com"
              ? mediaType === "image" && !persistentMediaId
              : !fileName;
          let status =
            initialStatus === "success" && missingStableCompletion
              ? "processing"
              : initialStatus;
          if (
            _flowPageContext?.driverKey === "flow_v2" &&
            mediaType === "image" &&
            status === "processing" &&
            persistentMediaId &&
            Array.isArray(message.completedMediaIds) &&
            message.completedMediaIds.length > 0
          ) {
            const native = _getObservedFlowMediaMetadata2(persistentMediaId);
            const identity =
              native?.type === "image" ? native.media_uuid : persistentMediaId;
            const completed = new Set(
              message.completedMediaIds.map((id) => String(id).toLowerCase()),
            );
            if (
              identity &&
              completed.has(String(identity).toLowerCase()) &&
              extractThumbnailUrl2(tile)
            ) {
              status = "success";
            }
          }
          const videoUrl =
            mediaType === "video" && status === "success"
              ? extractVideoUrl2(tile)
              : null;
          let thumbnail =
            status === "success" ? extractThumbnailUrl2(tile) : null;
          if (
            mediaType === "video" &&
            videoUrl &&
            (!thumbnail || thumbnail === videoUrl)
          ) {
            thumbnail = _deriveFlowV2PosterUrlFromVideo2(videoUrl) || thumbnail;
          }
          const thumbIsPoster =
            mediaType === "video" &&
            !!thumbnail &&
            (!videoUrl || thumbnail !== videoUrl);
          const typedRecord = _extractTypedTileRecord2(
            tile,
            message.operationId,
          );
          statuses[tileId] = {
            status,
            failure_category:
              status === "failed" && _flowPageContext?.driverKey === "flow_v2"
                ? _isFlowImageLoadError2(tile)
                  ? "load_failed"
                  : "generation_failed"
                : null,
            failure_reason:
              status === "failed" ? extractTileFailureReason2(tile) : null,
            result_id:
              status === "success"
                ? _getPersistableResultId2(tile, tileId)
                : null,
            file_name: fileName || persistentMediaId,
            persistent_media_id: persistentMediaId,
            thumbnail,
            ...(mediaType === "video" &&
              thumbnail && { source_thumbnail: thumbnail }),
            ...(thumbIsPoster && { thumb_is_poster: true }),
            type: mediaType,
            tile: typedRecord,
            ..._typedMediaProjection2(typedRecord),
            ...(videoUrl && { video_url: videoUrl }),
          };
          if (
            _flowPageContext?.driverKey === "flow_v2" &&
            mediaType === "video" &&
            status === "success"
          ) {
            const auditKey = `${persistentMediaId || "missing"}:${videoUrl ? 1 : 0}`;
            if (_flowV2IdentityAuditSeen.get(tileId) !== auditKey) {
              _flowV2IdentityAuditSeen.set(tileId, auditKey);
              console.log(
                "[FlowV2ResultIdentity] completion projection",
                JSON.stringify({
                  runtime_id: tileId,
                  identity_kind: _isFlowV2AsbIdentity2(persistentMediaId)
                    ? "flow_v2_asb"
                    : "missing_or_other",
                  identity_length: String(persistentMediaId || "").length,
                  has_poster: !!thumbnail,
                  poster_kind: _classifyFlowMediaUrl2(thumbnail),
                  has_video_url: !!videoUrl,
                  video_url_kind: _classifyFlowMediaUrl2(videoUrl),
                  result_id_promoted:
                    _getPersistableResultId2(tile, tileId) ===
                    persistentMediaId,
                }),
              );
            }
          }
        }
        return {
          success: true,
          statuses,
          documentEpoch: _TOBYFLOW_DOCUMENT_EPOCH,
        };
      },
      scanNewTiles: () =>
        _scanNewTilesInline2(
          message.excludeTileIds || [],
          message.excludeFileNames || [],
        ),
      waitUserSubmit: async () => {
        const { excludeTileIds, promptIndex, total, refCount, timeoutMs } =
          message;
        _manualUserSkip = false;
        _manualWaitAbort = false;
        ExecutionBlocker.suspendForManual();
        try {
          await _suspendZoomForManual();
        } catch (_) {}
        _showManualEnterBanner2(
          promptIndex || 1,
          total || 1,
          refCount || 0,
          "ready",
        );
        const _manualClickFocus = function (ev) {
          const t = ev.target;
          if (!t || !t.closest) return;
          if (t.closest(".tf-meb-skip") || t.closest('[data-action="skip"]')) {
            _manualUserSkip = true;
            return;
          }
          if (
            t.closest("#tobyflow-manual-enter-banner") ||
            t.closest("#tobyflow-flow-tracker")
          )
            return;
          const ed = getEditor2();
          if (ed && ed.contains(t)) return;
          injectSlateBridge2();
          _slateBridgeCall2("focus", {}).catch(() => {});
        };
        document.addEventListener("pointerdown", _manualClickFocus, true);
        const start = Date.now();
        let sawEditorFilled = false;
        let focusTries = 0;
        let lastBannerState = "ready";
        let clickStateSince = 0;
        const MIN_CLICK_HOLD_MS = 2500;
        let didSubmit = false;
        try {
          while (!shouldStop && !_manualWaitAbort) {
            ExecutionBlocker._manualSuspended = true;
            if (
              ExecutionBlocker._el &&
              ExecutionBlocker._el.style.display !== "none"
            ) {
              ExecutionBlocker._el.style.display = "none";
              ExecutionBlocker._blocking = false;
            }
            if (window._tobyFlowZoomSession?.active) {
              try {
                await _suspendZoomForManual();
              } catch (_) {}
            }
            if (timeoutMs > 0 && Date.now() - start > timeoutMs) {
              _hideManualEnterBanner2();
              return { submitted: false, reason: "TIMEOUT" };
            }
            if (_manualUserSkip) {
              _manualUserSkip = false;
              _hideManualEnterBanner2();
              return { submitted: false, reason: "SKIP" };
            }
            const el = getEditor2();
            const hasPlaceholder = !!(
              el && el.querySelector("[data-slate-placeholder]")
            );
            const domText = el && el.textContent ? el.textContent.trim() : "";
            const editorEmpty = !el || hasPlaceholder || domText.length === 0;
            if (!editorEmpty) {
              sawEditorFilled = true;
              const isFocused =
                el &&
                (document.activeElement === el ||
                  el.contains(document.activeElement));
              if (!isFocused && el) {
                if (focusTries < 20) {
                  focusTries++;
                  injectSlateBridge2();
                  _slateBridgeCall2("focus", {}).catch(() => {});
                }
                try {
                  el.focus();
                } catch (_) {}
              }
              let wantState = isFocused ? "ready" : "click";
              if (
                lastBannerState === "click" &&
                wantState === "ready" &&
                Date.now() - clickStateSince < MIN_CLICK_HOLD_MS
              ) {
                wantState = "click";
              }
              if (wantState !== lastBannerState) {
                lastBannerState = wantState;
                if (wantState === "click") clickStateSince = Date.now();
                _showManualEnterBanner2(
                  promptIndex || 1,
                  total || 1,
                  refCount || 0,
                  wantState,
                );
              }
            }
            if (sawEditorFilled && editorEmpty) {
              const scan = _scanNewTilesInline2(excludeTileIds || [], []);
              if (scan && scan.tiles && scan.tiles.length > 0) {
                _showManualEnterBanner2(
                  promptIndex || 1,
                  total || 1,
                  refCount || 0,
                  "submitted",
                );
                setTimeout(_hideManualEnterBanner2, 2e3);
                didSubmit = true;
                return { submitted: true };
              }
            }
            await sleep2(400);
          }
          _hideManualEnterBanner2();
          return { submitted: false, reason: "ABORTED" };
        } finally {
          document.removeEventListener("pointerdown", _manualClickFocus, true);
          ExecutionBlocker.resumeAfterManual(didSubmit);
        }
      },
      cancelWaitUserSubmit: () => {
        _manualWaitAbort = true;
        return { success: true };
      },
      providerConfigUpdated: async () => {
        return new Promise((resolve) => {
          ConfigSnapshotAccess.read(["toby_provider_configs"], (res) => {
            if (res.toby_provider_configs?.data) {
              _selectorConfig = res.toby_provider_configs.data;
              _selectorConfigTime = Date.now();
              _tileSelectorCache = null;
              const activeSelectors = _getFlowProfileSelectors2();
              const gate =
                _flowPageContext?.driverKey === "flow_v2"
                  ? _getApiConfigValue2("flow", "flow_v2_driver")
                  : { enabled: true };
              _selectorConfigReady =
                !!activeSelectors && gate?.enabled === true;
              const keyCount = Object.keys(activeSelectors || {}).length;
              console.log(
                `[TobyFlow] Provider config updated via SSE \u2014 active profile reloaded ${keyCount} selectors`,
              );
            } else {
              _selectorConfig = null;
              _selectorConfigTime = 0;
              console.warn(
                "[TobyFlow] Provider config updated via SSE \u2014 storage empty, cache cleared",
              );
            }
            resolve({ success: true });
          });
        });
      },
      providerApiConfigUpdated: async () => {
        return new Promise((resolve) => {
          ConfigSnapshotAccess.read(["toby_provider_api_configs"], (res) => {
            if (res.toby_provider_api_configs?.data) {
              _apiConfigsCacheLocal = res.toby_provider_api_configs;
              _apiConfigsCacheLocalTime = Date.now();
              const providers = Object.keys(
                res.toby_provider_api_configs.data || {},
              );
              console.log(
                `[TobyFlow] Provider api_config updated via SSE \u2014 reloaded for: ${providers.join(", ")}`,
              );
            } else {
              _apiConfigsCacheLocal = null;
              _apiConfigsCacheLocalTime = 0;
              console.warn(
                "[TobyFlow] Provider api_config updated via SSE \u2014 storage empty, cache cleared",
              );
            }
            void _autoRefreshVisibleImageLoadErrors();
            resolve({ success: true });
          });
        });
      },
      scrapeFlowVoices: async () => {
        return await scrapeFlowVoices();
      },
      selectFlowVoice: async () => {
        return await selectFlowVoice(message.voice);
      },
      scrapeFlowCharacters: async () => {
        return await scrapeFlowCharacters();
      },
      selectFlowCharacter: async () => {
        return await selectFlowCharacter(message.character);
      },
      addVoiceInline: async () => {
        return await _addVoiceInline(message.name);
      },
      addCharacterInline: async () => {
        return await _addCharacterInline(message.name);
      },
      countInlineChips: () => {
        if (_flowPageContext?.driverKey === "flow_v2")
          return {
            ..._flowV2InlineState2(message.segments),
            visibility: document.visibilityState,
            focused: document.hasFocus(),
          };
        return { success: true, count: _countInlineChips2() };
      },
      checkFlowAgentMode: async () => {
        const state = _isFlowAgentModeOn2();
        return { success: true, ...state };
      },
      disableFlowAgentMode: async () => {
        return await _ensureFlowAgentModeOff();
      },
      checkFlowChatAgentPanel: async () => {
        const state = _isFlowChatAgentPanelOpen2();
        return { success: true, ...state };
      },
      closeFlowChatAgentPanel: async () => {
        return await _ensureFlowChatAgentClosed();
      },
      checkFlowAgentInstructionDialog: async () => {
        const state = _isFlowAgentInstructionDialogOpen2();
        return { success: true, ...state };
      },
      doneFlowAgentInstructionDialog: async () => {
        return await _ensureFlowAgentInstructionDone();
      },
    };
    if (handlers[message.action]) {
      const scanRequestId =
        message.flowScanRequestId || message.metadataRequestId;
      if (scanRequestId) {
        try {
          message._flowScanControl = _createFlowScanRequest2(
            scanRequestId,
            message.flowScanDeadline || message.metadataDeadline,
          );
        } catch (error) {
          sendResponse({ error: error.message });
          return false;
        }
      }
      Promise.resolve()
        .then(async () => {
          if (_isFlowV2GateProtectedAction2(message)) {
            const gateState = await _getReadyFlowV2DriverGateState(message);
            if (!gateState.enabled) {
              return {
                success: false,
                error: gateState.error,
                driverKey: "flow_v2",
                ...(gateState.gateDiagnostic
                  ? {
                      flowGateDiagnostic: {
                        ...gateState.gateDiagnostic,
                        action: message.action,
                      },
                    }
                  : {}),
              };
            }
          }
          return handlers[message.action]();
        })
        .then((result) => {
          if (perfTrace)
            console.info(
              "[FlowCommandTiming] handled",
              JSON.stringify({
                action: message.action,
                id: perfTrace.id,
                handlerMs: Date.now() - perfReceivedAt,
                success: result?.success !== false,
                ..._flowCommandMemorySnapshot2(),
              }),
            );
          sendResponse(result || { success: true });
        })
        .catch((err) => {
          if (perfTrace)
            console.warn(
              "[FlowCommandTiming] handler failed",
              JSON.stringify({
                action: message.action,
                id: perfTrace.id,
                handlerMs: Date.now() - perfReceivedAt,
                error: err?.message || String(err),
                ..._flowCommandMemorySnapshot2(),
              }),
            );
          console.error("[FlowAuto] Handler error:", message.action, err);
          sendResponse({ error: err.message, code: err.code || null });
        })
        .finally(() => message._flowScanControl?.release());
      return true;
    }
  });
  var _tobyflowTilePlusEpoch = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  if (!window.__tobyflowTilePlusCaptureInstalled) {
    window.__tobyflowTilePlusCaptureInstalled = true;
    ["pointerdown", "mousedown", "touchstart", "click"].forEach((eventName) => {
      window.addEventListener(
        eventName,
        (event) => {
          const path =
            typeof event.composedPath === "function"
              ? event.composedPath()
              : [];
          const btn =
            path.find((node) =>
              node?.classList?.contains?.("flow-auto-overlay-btn"),
            ) || event.target?.closest?.(".flow-auto-overlay-btn");
          if (!btn) return;
          if (eventName === "click") event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          if (eventName === "click") btn.__tobyflowActivate?.(event);
        },
        { capture: true, passive: false },
      );
    });
  }
  var _tileObserver = null;
  var _tileObserverRetryCount = 0;
  _setupTileObserver2();
  var _flowLifecycleProbe = setInterval(() => {
    if (_tfContextValid2()) return;
    try {
      clearInterval(_tfInjectInterval);
    } catch (_) {}
    try {
      _tfNavObserver?.disconnect();
    } catch (_) {}
    try {
      _tileObserver?.disconnect();
    } catch (_) {}
    try {
      _flowHomepageObserver?.disconnect();
    } catch (_) {}
    try {
      clearInterval(_flowHomepageRetryInterval);
    } catch (_) {}
    try {
      clearInterval(_zoomGuardHeartbeatTimer);
    } catch (_) {}
    clearInterval(_flowLifecycleProbe);
  }, 5e3);
  window.addEventListener("pagehide", () => {
    try {
      clearInterval(_tfInjectInterval);
    } catch (_) {}
    try {
      _tfNavObserver?.disconnect();
    } catch (_) {}
    try {
      _tileObserver?.disconnect();
    } catch (_) {}
    try {
      clearInterval(_zoomGuardHeartbeatTimer);
    } catch (_) {}
    try {
      _flowHomepageObserver?.disconnect();
    } catch (_) {}
    try {
      clearInterval(_flowHomepageRetryInterval);
    } catch (_) {}
    try {
      clearInterval(_flowLifecycleProbe);
    } catch (_) {}
  });
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(setupFlowSpaNavigateHookDeferred2, 2e3);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(setupFlowSpaNavigateHookDeferred2, 2e3);
    });
  }
  var _flowHomepageObserver = null;
  var _flowHomepageRetryInterval = null;
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(setupFlowHomepageObserver2, 2500);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(setupFlowHomepageObserver2, 2500);
    });
  }
  try {
    self.ExecutionBlocker = ExecutionBlocker;
    self._buildFilename = _buildFilename2;
    self.getDownloadSettings = getDownloadSettings2;
    self._endZoomSession = _endZoomSession;
    self._injectTrackerHoverStyles = _injectTrackerHoverStyles2;
    self.getCurrentProjectId = getCurrentProjectId2;
    self.downloadTileMedia = downloadTileMedia;
    self.addFileToPrompt = addFileToPrompt;
    self.getEditor = getEditor2;
    self.getEditorUserText = getEditorUserText2;
    self.clearEditor = clearEditor;
    self.insertText = insertText;
    self.getSubmitButton = getSubmitButton2;
    self._checkFlowCreditLimit = _checkFlowCreditLimit2;
    self._isFlowControlDisabled = _isFlowControlDisabled2;
    self.simulateClick = simulateClick2;
    self.clickFlowSubmitControl = clickFlowSubmitControl;
    self.pressFlowEditorSubmit = pressFlowEditorSubmit2;
    self._getTileSelectorString = _getTileSelectorString2;
    self._extractTypedTileRecord = _extractTypedTileRecord2;
    self._applyFlowV2Settings = _applyFlowV2Settings;
    self._ensureFlowV2PageSettingsApplied = _ensureFlowV2PageSettingsApplied;
    self._scrapeFlowV2Components = _scrapeFlowV2Components;
    self._selectFlowV2Component = _selectFlowV2Component;
    self._removeFlowV2IngredientKind = _removeFlowV2IngredientKind;
    self._v2QueryConfigured = _v2QueryConfigured2;
    self._ensureFlowV2AgentReady = _ensureFlowV2AgentReady;
    self._uploadFileViaUploadButton = _uploadFileViaUploadButton;
    self._shouldRemoveWatermark = _shouldRemoveWatermark;
    self._getDownloadResolutions = function (isVideo) {
      var cfg = _getApiConfigValue2("flow", "download_resolutions");
      if (!cfg) return [];
      var list = cfg[isVideo ? "video" : "image"];
      return Array.isArray(list) ? list : [];
    };
    self._isFlowApiUpscaleResolution = function (isVideo, resolution) {
      if (!resolution) return false;
      var cfg = _getApiConfigValue2("flow", "download_resolutions");
      var list = cfg && cfg[isVideo ? "video" : "image"];
      if (!Array.isArray(list) || !list.length) return null;
      var selected = list.find(function (entry) {
        return entry && entry.value === resolution;
      });
      if (!selected) return null;
      if (selected.route === "native") return false;
      if (selected.route === "upscale") return true;
      console.warn(
        "[TobyFlow] download resolution route missing:",
        isVideo ? "video" : "image",
        resolution,
      );
      return null;
    };
    self.resolveTileByFileName = resolveTileByFileName2;
    self.getUniqueTileIds = getUniqueTileIds2;
    self.__ftMarkManualSkip = function () {
      _manualUserSkip = true;
    };
  } catch (_) {}
}
