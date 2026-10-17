if (self.__tobyflowFTLoaded__) {
} else {
  let _getTrackerT2 = function (key, params) {
      var t = _trackerTranslations[_trackerLocale] || _trackerTranslations.vi;
      var text = t[key] || _trackerTranslations.vi[key] || key;
      if (params) {
        for (var k in params) {
          text = text.replace("{" + k + "}", params[k]);
        }
      }
      return text;
    },
    _ftUsableResolvedTransport2 = function (url) {
      if (
        typeof url !== "string" ||
        !/^https?:\/\//i.test(url) ||
        url.indexOf("/asb/") >= 0
      )
        return false;
      try {
        var expires = Number(
          new URL(url, location.href).searchParams.get("Expires"),
        );
        return !(
          Number.isFinite(expires) &&
          expires > 0 &&
          expires <= Math.floor(Date.now() / 1e3) + 30
        );
      } catch (_) {
        return false;
      }
    },
    _enrichTrackerNativeVideoIdentities2 = function (data) {
      if (
        !data ||
        !Array.isArray(data.jobs) ||
        typeof _getObservedFlowMediaMetadata !== "function"
      )
        return data;
      return {
        ...data,
        jobs: data.jobs.map((job) => ({
          ...job,
          items: (job.items || []).map((item) => {
            const results = (item.results || []).map((result) => {
              const info =
                _getObservedFlowMediaMetadata(
                  result.mediaUuid || result.tileId || result.mediaId,
                ) || _getObservedFlowMediaMetadata(result.mediaId);
              if (
                !info ||
                (result.mediaUuid &&
                  result.mediaUuid.toLowerCase() !== info.media_uuid)
              )
                return result;
              if ((info.type === "video") !== !!result.video) return result;
              const identity = {
                mediaUuid: info.media_uuid,
                mediaId: info.persistent_media_id,
                fileName: info.file_name,
                nativeCatalogVerified: true,
              };
              if (!result.video) {
                const resolvedImage = _ftUsableResolvedTransport2(
                  result.thumbnail,
                )
                  ? result.thumbnail
                  : _ftUsableResolvedTransport2(result.url)
                    ? result.url
                    : null;
                return {
                  ...result,
                  ...identity,
                  ...((resolvedImage || info.thumbnail) && {
                    thumbnail: resolvedImage || info.thumbnail,
                    sourceThumbnail: resolvedImage || info.thumbnail,
                  }),
                };
              }
              const resolvedVideo = _ftUsableResolvedTransport2(result.playUrl)
                ? result.playUrl
                : _ftUsableResolvedTransport2(result.url) &&
                    /\/video\//i.test(result.url)
                  ? result.url
                  : null;
              const resolvedPoster =
                _ftUsableResolvedTransport2(result.thumbnail) &&
                result.thumbnail !== resolvedVideo
                  ? result.thumbnail
                  : null;
              const catalogVideo = _ftUsableResolvedTransport2(info.video_url)
                ? info.video_url
                : null;
              const poster =
                resolvedPoster || info.thumbnail || result.thumbnail || null;
              return {
                ...result,
                ...identity,
                ...(poster && {
                  thumbnail: poster,
                  sourceThumbnail: poster,
                  poster: true,
                }),
                ...(resolvedVideo || catalogVideo
                  ? { playUrl: resolvedVideo || catalogVideo }
                  : { playUrl: null }),
              };
            });
            const first = results[0],
              firstChanged = first && first !== item.results?.[0];
            return {
              ...item,
              results,
              ...(firstChanged && {
                thumb: first.thumbnail || first.url,
                thumbVideo: first.video === true,
                thumbPoster: first.poster === true,
                thumbPlayUrl: first.playUrl || null,
                thumbSourceThumbnail: first.sourceThumbnail || null,
              }),
            };
          }),
        })),
      };
    },
    _ftMountedVideoPreview2 = function (result) {
      if (!result?.video) return null;
      var identities = [
        ...new Set(
          [
            result.mediaUuid,
            result.media_uuid,
            result.mediaId,
            result.media_id,
            result.fileName,
            result.file_name,
            result.tileId,
          ]
            .filter(Boolean)
            .map(String),
        ),
      ];
      try {
        var tile = null;
        for (var i = 0; i < identities.length && !tile; i++) {
          if (typeof _getTileById === "function")
            tile = _getTileById(identities[i]);
          if (!tile && typeof resolveTileByFileName === "function")
            tile = resolveTileByFileName(identities[i]);
        }
        if (!tile) return null;
        var mediaType =
          typeof detectMediaType === "function" ? detectMediaType(tile) : null;
        if (mediaType && String(mediaType).toLowerCase() !== "video")
          return null;
        var playUrl =
          typeof extractVideoUrl === "function" ? extractVideoUrl(tile) : null;
        var posterOwner =
          typeof _q === "function" ? _q("tile_video_poster", tile) : null;
        var poster =
          posterOwner?.currentSrc ||
          posterOwner?.src ||
          (typeof extractThumbnailUrl === "function"
            ? extractThumbnailUrl(tile)
            : null);
        poster = _ftPosterSrcFromVideo2(poster) || poster;
        var playbackSuffix =
          typeof _getDynamicSelector === "function"
            ? _getDynamicSelector("tile_video")?.playback_url_suffix
            : "";
        try {
          if (
            typeof playbackSuffix === "string" &&
            playbackSuffix &&
            poster &&
            new URL(poster, location.href).pathname.endsWith(playbackSuffix)
          )
            poster = null;
        } catch (_) {
          poster = null;
        }
        if (!poster && !playUrl) return null;
        return {
          ...(poster && {
            thumbnail: poster,
            sourceThumbnail: poster,
            poster: true,
            _mountedPoster: true,
          }),
          ...(playUrl && { playUrl }),
        };
      } catch (_) {
        return null;
      }
    },
    _ftDerivedVideoSrc2 = function (posterUrl) {
      var cfg =
        typeof _getDynamicSelector === "function"
          ? _getDynamicSelector("tile_video")
          : null;
      var suffix =
        typeof cfg?.playback_url_suffix === "string"
          ? cfg.playback_url_suffix
          : "";
      var pattern =
        typeof cfg?.poster_transform_pattern === "string"
          ? cfg.poster_transform_pattern
          : "";
      if (!posterUrl || !suffix || !pattern || pattern.length > 120) return "";
      try {
        var url = new URL(posterUrl, location.href);
        if (
          url.origin !== location.origin ||
          url.pathname.indexOf("/asb/") !== 0
        )
          return "";
        if (url.pathname.endsWith(suffix)) return url.href;
        url.pathname =
          url.pathname.replace(new RegExp(pattern, "i"), "") + suffix;
        return url.href;
      } catch (_) {
        return "";
      }
    },
    _ftPosterSrcFromVideo2 = function (videoUrl) {
      var cfg =
        typeof _getDynamicSelector === "function"
          ? _getDynamicSelector("tile_video")
          : null;
      var suffix =
        typeof cfg?.playback_url_suffix === "string"
          ? cfg.playback_url_suffix
          : "";
      var posterSuffix =
        typeof cfg?.poster_url_suffix === "string" ? cfg.poster_url_suffix : "";
      var pattern =
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
        var url = new URL(videoUrl, location.href);
        if (
          url.origin !== location.origin ||
          url.pathname.indexOf("/asb/") !== 0
        )
          return "";
        var before = url.pathname;
        var identityPath =
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
    _ftAttachMediaErrorLog2 = function (container, label) {
      if (!container || container._ftErrLogged) return;
      container._ftErrLogged = true;
      container.addEventListener(
        "error",
        function (e) {
          var t = e.target;
          if (!t || (t.tagName !== "IMG" && t.tagName !== "VIDEO")) return;
          var err =
            t.tagName === "VIDEO" && t.error
              ? " code=" +
                t.error.code +
                " msg=" +
                (t.error.message || "(r\u1ED7ng)")
              : "";
          console.warn(
            "[FloatingTracker/" +
              (label || "?") +
              "] Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c " +
              t.tagName +
              ":" +
              err +
              " src=" +
              (t.currentSrc || t.src || "(r\u1ED7ng)"),
          );
        },
        true,
      );
    },
    _ftVideoSrc2 = function (r) {
      if (!r) return null;
      if (r.playUrl) return _ftRebindLegacyFlowUrl2(r.playUrl, true);
      var derived = _ftDerivedVideoSrc2(
        _ftSourceThumbnail2(r) || r.thumbnail || r.source_thumbnail || null,
      );
      if (derived) return derived;
      var u = r.url;
      if (!u) return null;
      var rebound = _ftRebindLegacyFlowUrl2(u, true);
      if (rebound !== u) return rebound;
      try {
        var parsed = new URL(u, location.origin);
        if (parsed.searchParams.has("mediaUrlType")) {
          parsed.searchParams.delete("mediaUrlType");
          return parsed.href;
        }
      } catch (_) {}
      return u;
    },
    _ftSourceThumbnail2 = function (r) {
      if (!r) return null;
      var source = r.sourceThumbnail || r.source_thumbnail || null;
      return source ? _ftRebindLegacyFlowUrl2(source, false) : null;
    },
    _ftRebindLegacyFlowUrl2 = function (url, wantVideo) {
      if (
        location.origin !== "https://flow.google.com" ||
        typeof url !== "string" ||
        !url.startsWith("https://labs.google/")
      )
        return url;
      var name = null;
      try {
        name = new URL(url).searchParams.get("name");
      } catch (_) {}
      if (!name) return null;
      try {
        var tiles = typeof _qa === "function" ? _qa("tile_container") : [];
        for (var i = 0; i < tiles.length; i++) {
          var ids =
            typeof extractAllFileNames === "function"
              ? extractAllFileNames(tiles[i])
              : [];
          if (ids.indexOf(name) === -1) continue;
          var thumbnail =
            typeof extractThumbnailUrl === "function"
              ? extractThumbnailUrl(tiles[i])
              : null;
          if (!wantVideo) return thumbnail;
          var videoUrl =
            typeof extractVideoUrl === "function"
              ? extractVideoUrl(tiles[i])
              : null;
          return videoUrl || _ftDerivedVideoSrc2(thumbnail) || null;
        }
      } catch (_) {}
      return null;
    },
    _ftThumbSrc2 = function (r) {
      function isVideoResourceUrl(url) {
        if (typeof url !== "string" || !url) return false;
        try {
          var parsed2 = new URL(url, location.href);
          var cfg =
            typeof _getDynamicSelector === "function"
              ? _getDynamicSelector("tile_video")
              : null;
          var playbackSuffix =
            typeof cfg?.playback_url_suffix === "string"
              ? cfg.playback_url_suffix
              : "";
          return (
            (parsed2.hostname === "flow-content.google" &&
              /^\/video\//i.test(parsed2.pathname)) ||
            /\.(?:mp4|webm|mov|m4v)$/i.test(parsed2.pathname) ||
            (parsed2.origin === location.origin &&
              parsed2.pathname.indexOf("/asb/") === 0 &&
              playbackSuffix &&
              parsed2.pathname.endsWith(playbackSuffix))
          );
        } catch (_) {
          return false;
        }
      }
      if (!r) return null;
      if (!r.video)
        return _ftRebindLegacyFlowUrl2(r.thumbnail || r.url || null, false);
      if (typeof r.poster === "string" && !isVideoResourceUrl(r.poster))
        return _ftRebindLegacyFlowUrl2(r.poster, false);
      if (r.poster === true && r.url && !isVideoResourceUrl(r.url))
        return _ftRebindLegacyFlowUrl2(r.url, false);
      if (
        r.thumbnail &&
        r.thumbnail !== r.url &&
        r.thumbnail !== r.playUrl &&
        !isVideoResourceUrl(r.thumbnail)
      )
        return _ftRebindLegacyFlowUrl2(r.thumbnail, false);
      if (!r.url) {
        var sourceThumbnail = _ftSourceThumbnail2(r);
        return isVideoResourceUrl(sourceThumbnail)
          ? _ftPosterSrcFromVideo2(sourceThumbnail) || null
          : sourceThumbnail;
      }
      var rebound = _ftRebindLegacyFlowUrl2(r.url, false);
      if (rebound !== r.url)
        return isVideoResourceUrl(rebound) ? null : rebound;
      var v2Poster = _ftPosterSrcFromVideo2(r.playUrl || r.url);
      if (v2Poster) return v2Poster;
      try {
        var parsed = new URL(r.url, location.origin);
        if (isVideoResourceUrl(parsed.href)) return null;
        if (parsed.pathname.indexOf("getMediaUrlRedirect") === -1) return null;
        parsed.searchParams.set("mediaUrlType", "MEDIA_URL_TYPE_THUMBNAIL");
        return parsed.href;
      } catch (_) {
        return r.url;
      }
    },
    _ftThumbImg2 = function (url, style, lazy, videoPlaceholder, deferred) {
      if (!url) {
        try {
          FloatingTracker._ensureSkeletonStyle();
        } catch (_) {}
        var placeholder =
          arguments[3] === true
            ? FloatingTracker._SKEL_VIDEO_ICON || FloatingTracker._SKEL_ICON
            : FloatingTracker._SKEL_ICON;
        return (
          '<div class="tf-skel tf-skel--idle"' +
          (style ? ' style="' + style + '"' : "") +
          '><span class="tf-skel-ph">' +
          placeholder +
          "</span></div>"
        );
      }
      var esc = FloatingTracker._escHtml(url || "");
      var st = style ? ' style="' + style + '"' : "";
      if (deferred && typeof IntersectionObserver === "function") {
        return (
          '<img data-ft-preview-src="' + esc + '" decoding="async"' + st + ">"
        );
      }
      return (
        '<img src="' +
        esc +
        '"' +
        (lazy === false ? "" : ' loading="lazy"') +
        st +
        ">"
      );
    },
    _ftDirectGridVideoSrc2 = function (r) {
      if (
        !r?.video ||
        typeof r.playUrl !== "string" ||
        !/^https?:\/\//i.test(r.playUrl)
      )
        return null;
      try {
        var parsed = new URL(r.playUrl, location.href);
        if (parsed.pathname.indexOf("/asb/") === 0) return null;
        var expires = Number(parsed.searchParams.get("Expires"));
        if (
          Number.isFinite(expires) &&
          expires > 0 &&
          expires <= Math.floor(Date.now() / 1e3) + 30
        )
          return null;
        return parsed.href;
      } catch (_) {
        return null;
      }
    },
    _ftGridMedia2 = function (r, style) {
      const poster = _ftThumbSrc2(r);
      const asbPoster =
        typeof poster === "string" && poster.indexOf("/asb/") >= 0;
      if (
        poster &&
        (!r?.video ||
          !asbPoster ||
          r?._mountedPoster === true ||
          r?.nativeCatalogVerified === true)
      ) {
        return _ftThumbImg2(
          poster,
          "min-height:0;" + (style || ""),
          false,
          false,
          true,
        );
      }
      return _ftThumbImg2(
        null,
        "min-height:0;" + (style || ""),
        false,
        !!r?.video,
      );
    };
  var _getTrackerT = _getTrackerT2,
    _ftUsableResolvedTransport = _ftUsableResolvedTransport2,
    _enrichTrackerNativeVideoIdentities = _enrichTrackerNativeVideoIdentities2,
    _ftMountedVideoPreview = _ftMountedVideoPreview2,
    _ftDerivedVideoSrc = _ftDerivedVideoSrc2,
    _ftPosterSrcFromVideo = _ftPosterSrcFromVideo2,
    _ftAttachMediaErrorLog = _ftAttachMediaErrorLog2,
    _ftVideoSrc = _ftVideoSrc2,
    _ftSourceThumbnail = _ftSourceThumbnail2,
    _ftRebindLegacyFlowUrl = _ftRebindLegacyFlowUrl2,
    _ftThumbSrc = _ftThumbSrc2,
    _ftThumbImg = _ftThumbImg2,
    _ftDirectGridVideoSrc = _ftDirectGridVideoSrc2,
    _ftGridMedia = _ftGridMedia2;
  self.__tobyflowFTLoaded__ = true;
  var _trackerLocale = "vi";
  var _trackerTranslations = {
    vi: {
      regenDailyQuotaNotice:
        "Model {models} \u0111\xE3 b\xE1o h\u1EBFt h\u1EA1n m\u1EE9c trong ng\xE0y. Ch\u1ECDn model kh\xE1c \u0111\u1EC3 t\u1EA1o l\u1EA1i c\xE1c prompt l\u1ED7i/ch\u01B0a g\u1EEDi. K\u1EBFt qu\u1EA3 \u0111\xE3 c\xF3 s\u1EBD \u0111\u01B0\u1EE3c gi\u1EEF.",
      regenKeepMode: "Gi\u1EEF ch\u1EBF \u0111\u1ED9 hi\u1EC7n t\u1EA1i",
      regenQuotaCancelled: "Ch\u01B0a g\u1EEDi do quota",
      regenKeepModel: "Gi\u1EEF model t\u1EEBng prompt",
      regenModel: "Model",
      regenMode: "Ch\u1EBF \u0111\u1ED9 ch\u1EA1y",
      regenAuto: "Auto",
      regenWeb: "Web",
      regenApi: "API",
      regenConfigUnavailable:
        "Ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh model",
      stopAll: "D\u1EEBng t\u1EA5t c\u1EA3",
      stopNotConfirmed:
        "Ch\u01B0a x\xE1c nh\u1EADn \u0111\u01B0\u1EE3c l\u1EC7nh d\u1EEBng. M\u1EDF l\u1EA1i TobyFlow v\xE0 th\u1EED l\u1EA1i.",
      zoomedForFarRef:
        "\u0110\xE3 thu nh\u1ECF trang Flow v\xEC \u1EA3nh tham chi\u1EBFu n\u1EB1m \u1EDF xa",
      scanningRefImages:
        "\u0110ang qu\xE9t \u1EA3nh tham chi\u1EBFu tr\xEAn Flow...",
      done: "xong",
      retrying: "Ch\u1EDD t\u1EA1o l\u1EA1i",
      paused: "T\u1EA1m d\u1EEBng",
      completed: "Xong",
      stopped: "\u0110\xE3 d\u1EEBng",
      errors: "l\u1ED7i",
      resume: "Ti\u1EBFp t\u1EE5c",
      resumeChecking:
        "\u0110ang ki\u1EC3m tra k\u1EBFt n\u1ED1i Flow API\u2026",
      resumeAccepted:
        "\u0110\xE3 ti\u1EBFp t\u1EE5c \u2014 prompt \u0111ang \u0111\u01B0\u1EE3c \u0111\u01B0a l\u1EA1i v\xE0o h\xE0ng ch\u1EDD.",
      resumeFailed: "Ch\u01B0a th\u1EC3 ti\u1EBFp t\u1EE5c",
      resumeOwnerGoneCancelled:
        "Phi\xEAn ch\u1EA1y kh\xF4ng c\xF2n k\u1EBFt n\u1ED1i v\u1EDBi TobyFlow \u2014 batch t\u1EA1m d\u1EEBng \u0111\xE3 \u0111\u01B0\u1EE3c t\u1EF1 \u0111\u1ED9ng h\u1EE7y.",
      captchaPausedTitle: "\u0110\xE3 t\u1EA1m d\u1EEBng",
      captchaPausedDesc:
        "Google t\u1EA1m ch\u1EB7n do ho\u1EA1t \u0111\u1ED9ng b\u1EA5t th\u01B0\u1EDDng. Ch\u1EDD ~1\u20132 ph\xFAt r\u1ED3i b\u1EA5m Ti\u1EBFp t\u1EE5c \u0111\u1EC3 ch\u1EA1y ti\u1EBFp (kh\xF4ng ph\u1EA3i l\u1ED7i extension).",
      botCookieHint:
        "Th\u1EED x\xF3a cookie c\u1EE7a Flow r\u1ED3i th\u1EED l\u1EA1i.",
      pause: "T\u1EA1m d\u1EEBng",
      stop: "D\u1EEBng",
      running: "\u0111ang",
      idle: "ngh\u1EC9",
      sent: "\u0111\xE3 g\u1EEDi",
      failed: "l\u1ED7i",
      total: "t\u1ED5ng",
      genActive: "\u0111ang gen",
      flowWaiting: "ch\u1EDD Flow",
      flowSlow: "Flow ch\u1EADm \u2014 \u0111ang ch\u1EDD ph\u1EA3n h\u1ED3i",
      dlPending: "ch\u1EDD t\u1EA3i",
      dlActive: "\u0111ang t\u1EA3i",
      dlDone: "\u0111\xE3 t\u1EA3i",
      apiToastGenning:
        "\u0110ang t\u1EA1o qua API \u2014 {count} \u0111ang ch\u1EA1y...",
      apiOverlayHint:
        "Theo d\xF5i ti\u1EBFn tr\xECnh & k\u1EBFt qu\u1EA3 \u1EDF khung TobyFlow (g\xF3c ph\u1EA3i d\u01B0\u1EDBi)",
      apiToastDone:
        "Xong \u2014 {completed}/{total} k\u1EBFt qu\u1EA3. Trang s\u1EBD t\u1EA3i l\u1EA1i \u0111\u1EC3 hi\u1EC7n \u1EA3nh.",
      apiAuthPaused:
        "Flow API m\u1EA5t k\u1EBFt n\u1ED1i \u2014 \u0111\xE3 t\u1EA1m d\u1EEBng batch v\xE0 \u0111ang ch\u1EDD \u0111\u0103ng nh\u1EADp l\u1EA1i",
      apiAuthResumed:
        "Flow API \u0111\xE3 ho\u1EA1t \u0111\u1ED9ng \u2014 ti\u1EBFp t\u1EE5c t\u1EA1o c\xE1c prompt c\xF2n l\u1EA1i",
      stateQueuedApi: "Ch\u1EDD l\u01B0\u1EE3t",
      closeTracker: "\u0110\xF3ng",
      openTracker: "M\u1EDF TobyFlow tracker",
      dlThumbTitle: "T\u1EA3i xu\u1ED1ng",
      viewThumbTitle: "Xem",
      downloadAll: "T\u1EA3i t\u1EA5t c\u1EA3",
      collapseAllItems: "Thu g\u1ECDn t\u1EA5t c\u1EA3 prompt",
      expandAllItems: "Bung t\u1EA5t c\u1EA3 prompt",
      wmClean: "\u0110\xE3 xo\xE1 watermark",
      wmOriginal: "B\u1EA3n g\u1ED1c",
      wmAskTitle: "T\u1EA3i b\u1EA3n n\xE0o?",
      wmAskTitleAll: "T\u1EA3i {n} t\u1EC7p \u2014 b\u1EA3n n\xE0o?",
      downloadOptionsTitle: "T\xF9y ch\u1ECDn t\u1EA3i xu\u1ED1ng",
      downloadOptionsTitleAll: "T\u1EA3i {n} t\u1EC7p",
      wmCleaning: "\u0110ang xo\xE1 watermark\u2026",
      wmDownloading: "\u0110ang t\u1EA3i\u2026",
      wmSaved: "\u0110\xE3 t\u1EA3i xong",
      wmSavedOriginal:
        "\u0110\xE3 t\u1EA3i b\u1EA3n g\u1ED1c (kh\xF4ng xo\xE1 watermark)",
      wmSavedNoWm:
        "\u0110\xE3 t\u1EA3i xong (kh\xF4ng t\xECm th\u1EA5y watermark)",
      wmSizeNote:
        "B\u1EA3n \u0111\xE3 xo\xE1 \u0111\u01B0\u1EE3c x\u1EED l\xFD ngay tr\xEAn m\xE1y b\u1EA1n \u2014 m\u1EA5t th\xEAm v\xE0i gi\xE2y.",
      wmResLabel: "K\xEDch th\u01B0\u1EDBc",
      wmGo: "T\u1EA3i xu\u1ED1ng",
      dlItemTitle: "T\u1EA3i k\u1EBFt qu\u1EA3",
      regenTitle: "T\u1EA1o l\u1EA1i",
      regenBusyTitle:
        "Ch\u1EDD ch\u1EA1y xong m\u1EDBi t\u1EA1o l\u1EA1i \u0111\u01B0\u1EE3c",
      regenSendingTitle:
        "\u0110ang g\u1EEDi y\xEAu c\u1EA7u t\u1EA1o l\u1EA1i...",
      regenFailedTitle:
        "Kh\xF4ng th\u1EC3 g\u1EEDi y\xEAu c\u1EA7u t\u1EA1o l\u1EA1i",
      gridTitle: "K\u1EBFt qu\u1EA3 gen",
      gridNoResult: "Ch\u01B0a c\xF3 k\u1EBFt qu\u1EA3",
      batchSelectAll: "Ch\u1ECDn t\u1EA5t c\u1EA3 trong batch",
      batchDeselectAll: "B\u1ECF ch\u1ECDn t\u1EA5t c\u1EA3 trong batch",
      importedSession: "Phi\xEAn \u0111\xE3 kh\xF4i ph\u1EE5c",
      addBatchRefs: "Th\xEAm k\u1EBFt qu\u1EA3 v\xE0o reference",
      batchRefsAdded: "\u0110\xE3 th\xEAm v\xE0o reference",
      batchRefsUnavailable:
        "M\u1EDF Gen tab v\xE0 ch\u1ECDn Google Flow tr\u01B0\u1EDBc khi th\xEAm reference.",
      downloadBatch: "T\u1EA3i batch",
      regenBatchFailed: "T\u1EA1o l\u1EA1i prompt l\u1ED7i/ch\u01B0a g\u1EEDi",
      removeHistory: "X\xF3a kh\u1ECFi l\u1ECBch s\u1EED",
      removeBatchConfirm:
        "X\xF3a batch n\xE0y kh\u1ECFi l\u1ECBch s\u1EED tracker?",
      collapseBatch: "Thu g\u1ECDn batch",
      expandBatch: "M\u1EDF batch",
      collapseAllBatches: "Thu g\u1ECDn t\u1EA5t c\u1EA3 batch",
      expandAllBatches: "M\u1EDF t\u1EA5t c\u1EA3 batch",
      chainBadge: "Chu\u1ED7i",
      generationFailed: "T\u1EA1o th\u1EA5t b\u1EA1i",
      gridExpand: "M\u1EDF r\u1ED9ng l\u01B0\u1EDBi",
      closeGrid: "\u0110\xF3ng l\u01B0\u1EDBi k\u1EBFt qu\u1EA3",
      downloadAllScope:
        "T\u1EA3i t\u1EA5t c\u1EA3 k\u1EBFt qu\u1EA3 \u0111ang kh\u1EDBp b\u1ED9 l\u1ECDc",
      clearAllGrid: "X\xF3a t\u1EA5t c\u1EA3",
      clearAllGridConfirm:
        "X\xF3a t\u1EA5t c\u1EA3 batch trong l\u1ECBch s\u1EED tracker c\u1EE7a project n\xE0y? Thao t\xE1c n\xE0y kh\xF4ng th\u1EC3 ho\xE0n t\xE1c.",
      removeItem: "X\xF3a m\u1EE5c",
      removeItemConfirm:
        "X\xF3a prompt n\xE0y kh\u1ECFi l\u1ECBch s\u1EED tracker?",
      removeQueuedConfirm:
        "X\xF3a prompt n\xE0y kh\u1ECFi batch? Prompt s\u1EBD kh\xF4ng \u0111\u01B0\u1EE3c g\u1EEDi t\u1EDBi Flow.",
      recoveryRequired: "Kh\xF4ng th\u1EC3 ti\u1EBFp t\u1EE5c",
      projectMismatch: "T\xE1c v\u1EE5 thu\u1ED9c d\u1EF1 \xE1n Flow kh\xE1c",
      serverUnavailable:
        "Flow API t\u1EA1m th\u1EDDi kh\xF4ng kh\u1EA3 d\u1EE5ng",
      perModelDailyLimit:
        "GI\u1EDAI H\u1EA0N L\u01AF\u1EE2T T\u1EA0O H\u1EB0NG NG\xC0Y THEO MODEL",
      successCount: "th\xE0nh c\xF4ng",
      partial: "M\u1ED9t ph\u1EA7n",
      failedAll: "Th\u1EA5t b\u1EA1i",
      filterAll: "T\u1EA5t c\u1EA3",
      filterSuccess: "Th\xE0nh c\xF4ng",
      filterFailed: "L\u1ED7i",
      filterRegen: "\u0110\xE3 regen",
      searchPrompt: "T\xECm prompt...",
      sortOriginal: "Th\u1EE9 t\u1EF1 g\u1ED1c",
      sortNewest: "M\u1EDBi nh\u1EA5t",
      regenAllFailed: "T\u1EA1o l\u1EA1i t\u1EA5t c\u1EA3 l\u1ED7i",
      editPrompt: "S\u1EEDa prompt",
      closeEditor: "\u0110\xF3ng tr\xECnh s\u1EEDa",
      flowApiActive: "Flow API s\u1EB5n s\xE0ng",
      flowApiInactive: "Flow API m\u1EA5t k\u1EBFt n\u1ED1i",
      flowApiChecking: "\u0110ang ki\u1EC3m tra Flow API",
      flowApiGenerating: "\u0110ang t\u1EA1o qua Flow API",
      flowApiDisabled: "Flow API \u0111\xE3 t\u1EAFt",
      flowApiSyncing: "\u0110ang \u0111\u1ED3ng b\u1ED9 Flow API",
      flowApiReadyShort: "S\u1EB5n s\xE0ng",
      flowApiCheckingShort: "Ki\u1EC3m tra",
      flowApiGeneratingShort: "\u0110ang t\u1EA1o",
      flowApiDisabledShort: "\u0110\xE3 t\u1EAFt",
      flowApiDisconnectedShort: "M\u1EA5t k\u1EBFt n\u1ED1i",
      flowApiSyncingShort: "\u0110\u1ED3ng b\u1ED9",
      edited: "\u0110\xE3 s\u1EEDa",
      resetPrompt: "Kh\xF4i ph\u1EE5c prompt",
      savePrompt: "L\u01B0u prompt",
      regenQueued:
        "\u0110\xE3 x\u1EBFp prompt v\xE0o h\xE0ng ch\u1EDD t\u1EA1o l\u1EA1i",
      regenBulkTitle: "X\xE1c nh\u1EADn t\u1EA1o l\u1EA1i",
      regenBulkMessage:
        "Ch\u1ECDn model v\xE0 ch\u1EBF \u0111\u1ED9 ch\u1EA1y b\xEAn d\u01B0\u1EDBi, r\u1ED3i b\u1EA5m T\u1EA1o l\u1EA1i \u0111\u1EC3 ch\u1EA1y l\u1EA1i {count} prompt.",
      regenSingleTitle: "X\xE1c nh\u1EADn t\u1EA1o l\u1EA1i",
      regenSingleMessage:
        "B\u1EA1n c\xF3 th\u1EC3 \u0111\u1ED5i model v\xE0 ch\u1EBF \u0111\u1ED9 ch\u1EA1y b\xEAn d\u01B0\u1EDBi, r\u1ED3i b\u1EA5m T\u1EA1o l\u1EA1i.",
      regenBulkRefNote:
        "{count} prompt c\xF3 \u1EA3nh tham chi\u1EBFu; t\u1EEBng prompt s\u1EBD gi\u1EEF \u0111\xFAng \u1EA3nh \u0111\xE3 g\xE1n ho\u1EB7c @mention.",
      regenConfirm: "T\u1EA1o l\u1EA1i",
      cancel: "H\u1EE7y",
      regenMentionUnresolved:
        "Kh\xF4ng t\xECm th\u1EA5y \u1EA3nh cho @mention: {names}. Prompt n\xE0y ch\u01B0a \u0111\u01B0\u1EE3c t\u1EA1o l\u1EA1i.",
      unsavedDraftConfirm:
        "C\xF3 prompt \u0111\xE3 s\u1EEDa nh\u01B0ng ch\u01B0a l\u01B0u ho\u1EB7c t\u1EA1o l\u1EA1i. V\u1EABn \u0111\xF3ng?",
      downloadSummary:
        "\u0110\xE3 t\u1EA3i {success}/{total} \u2014 l\u1ED7i {failed}",
      chunkDraining: "\u0110\u1EE3i xong chunk, s\u1EAFp reload Flow...",
      chunkReloading: "\u0110ang reload Flow page...",
      chunkResumed: "Chunk xong, ti\u1EBFp t\u1EE5c batch...",
      andMore: "v\xE0 {count} m\u1EE5c kh\xE1c",
      generating: "\u0110ang t\u1EA1o \u1EA3nh...",
      statePending: "Ch\u1EDD",
      stateSubmitting: "\u0110ang g\u1EEDi",
      stateSubmitted: "\u0110\xE3 g\u1EEDi",
      stateMonitoring: "\u0110ang x\u1EED l\xFD",
      stateRetry: "Ch\u1EDD t\u1EA1o l\u1EA1i",
      stateCompleted: "Xong",
      statePartialFail: "M\u1ED9t ph\u1EA7n l\u1ED7i",
      stateFailed: "L\u1ED7i",
      stateCancelled: "H\u1EE7y",
      stateWaitingUser: "Ch\u1EDD submit",
      flowRecoveryRequired: "C\u1EA7n kh\xF4i ph\u1EE5c",
      manualReady:
        "Nh\u1EA5n Enter / b\u1EA5m G\u1EEDi \u0111\u1EC3 gen{pos}{ref}",
      manualClickFirst:
        "Click \xF4 prompt r\u1ED3i Enter/b\u1EA5m G\u1EEDi{pos}{ref}",
      manualSubmitted: "\u0110\xE3 nh\u1EADn \u2014 \u0111ang gen...",
      manualPaused:
        "\u0110\xE3 t\u1EA1m d\u1EEBng \u2014 b\u1EA5m Ti\u1EBFp t\u1EE5c \u0111\u1EC3 ch\u1EA1y",
      manualSkip: "B\u1ECF qua",
      skipInteractionBlock:
        "B\u1ECF ch\u1EB7n t\u01B0\u01A1ng t\xE1c (qu\xE1 tr\xECnh t\u1EA1o v\u1EABn ti\u1EBFp t\u1EE5c)",
      modeAuto: "Auto",
      modeManual: "Manual",
    },
    en: {
      regenDailyQuotaNotice:
        "Model {models} reported a daily quota limit. Choose another model to regenerate failed/unsubmitted prompts. Existing results will be kept.",
      regenKeepMode: "Keep current mode",
      regenQuotaCancelled: "Not submitted: quota",
      regenKeepModel: "Keep each prompt\u2019s model",
      regenModel: "Model",
      regenMode: "Execution mode",
      regenAuto: "Auto",
      regenWeb: "Web",
      regenApi: "API",
      regenConfigUnavailable: "Model configuration unavailable",
      stopAll: "Stop all",
      stopNotConfirmed: "Stop was not confirmed. Open TobyFlow and try again.",
      zoomedForFarRef: "Zoomed out Flow page to load far-away reference images",
      scanningRefImages: "Scanning reference images on Flow...",
      done: "done",
      retrying: "Waiting to regenerate",
      paused: "Paused",
      completed: "Done",
      stopped: "Stopped",
      errors: "errors",
      resume: "Resume",
      resumeChecking: "Checking the Flow API connection\u2026",
      resumeAccepted: "Resumed \u2014 the prompt is being requeued.",
      resumeFailed: "Unable to resume",
      resumeOwnerGoneCancelled:
        "The run is no longer connected to TobyFlow \u2014 the paused batch was cancelled automatically.",
      captchaPausedTitle: "Paused",
      captchaPausedDesc:
        "Google temporarily blocked this due to unusual activity. Wait ~1\u20132 min, then click Resume to continue (not an extension error).",
      botCookieHint: "Try clearing Flow cookies, then try again.",
      pause: "Pause",
      stop: "Stop",
      running: "running",
      idle: "idle",
      sent: "sent",
      failed: "failed",
      total: "total",
      genActive: "generating",
      flowWaiting: "waiting Flow",
      flowSlow: "Flow slow \u2014 waiting response",
      dlPending: "pending",
      dlActive: "downloading",
      dlDone: "downloaded",
      apiToastGenning: "Generating via API \u2014 {count} running...",
      apiOverlayHint:
        "Track progress & results in the TobyFlow panel (bottom right)",
      apiToastDone:
        "Done \u2014 {completed}/{total} results. Page will reload to show them.",
      apiAuthPaused:
        "Flow API disconnected \u2014 batch paused while waiting to reconnect",
      apiAuthResumed:
        "Flow API is active \u2014 continuing the remaining prompts",
      stateQueuedApi: "Queued",
      closeTracker: "Close",
      openTracker: "Open TobyFlow tracker",
      dlThumbTitle: "Download",
      viewThumbTitle: "View",
      downloadAll: "Download all",
      collapseAllItems: "Collapse all prompts",
      expandAllItems: "Expand all prompts",
      wmClean: "Watermark removed",
      wmOriginal: "Original",
      wmAskTitle: "Which version?",
      wmAskTitleAll: "Download {n} files \u2014 which version?",
      downloadOptionsTitle: "Download options",
      downloadOptionsTitleAll: "Download {n} files",
      wmCleaning: "Removing watermark\u2026",
      wmDownloading: "Downloading\u2026",
      wmSaved: "Download complete",
      wmSavedOriginal: "Saved original (watermark not removed)",
      wmSavedNoWm: "Download complete (no watermark found)",
      wmSizeNote:
        "The clean copy is processed on your machine \u2014 takes a few extra seconds.",
      wmResLabel: "Size",
      wmGo: "Download",
      dlItemTitle: "Download result",
      regenTitle: "Regenerate",
      regenBusyTitle: "Finish the queue before regenerating",
      regenSendingTitle: "Sending regenerate request...",
      regenFailedTitle: "Could not send regenerate request",
      gridTitle: "Generated results",
      gridNoResult: "No result yet",
      batchSelectAll: "Select all in batch",
      batchDeselectAll: "Deselect all in batch",
      importedSession: "Imported session",
      addBatchRefs: "Add results to references",
      batchRefsAdded: "Added to references",
      batchRefsUnavailable:
        "Open the Gen tab and select Google Flow before adding references.",
      downloadBatch: "Download batch",
      regenBatchFailed: "Regenerate failed/unsubmitted prompts",
      removeHistory: "Remove from history",
      removeBatchConfirm: "Remove this batch from tracker history?",
      collapseBatch: "Collapse batch",
      expandBatch: "Expand batch",
      collapseAllBatches: "Collapse all batches",
      expandAllBatches: "Expand all batches",
      chainBadge: "Chain",
      generationFailed: "Generation failed",
      gridExpand: "Expand grid",
      closeGrid: "Close results grid",
      downloadAllScope: "Download all results matching the current filter",
      clearAllGrid: "Clear all",
      clearAllGridConfirm:
        "Clear every tracker batch for this project? This cannot be undone.",
      removeItem: "Remove item",
      removeItemConfirm: "Remove this prompt from tracker history?",
      removeQueuedConfirm:
        "Remove this prompt from the batch? It will not be sent to Flow.",
      recoveryRequired: "Unable to continue",
      projectMismatch: "Operation belongs to another Flow project",
      serverUnavailable: "Flow API is temporarily unavailable",
      perModelDailyLimit: "DAILY GENERATION LIMIT FOR THIS MODEL",
      successCount: "successful",
      partial: "Partial",
      failedAll: "Failed",
      filterAll: "All",
      filterSuccess: "Successful",
      filterFailed: "Failed",
      filterRegen: "Regenerated",
      searchPrompt: "Search prompts...",
      sortOriginal: "Original order",
      sortNewest: "Newest",
      regenAllFailed: "Regenerate all failed",
      editPrompt: "Edit prompt",
      closeEditor: "Close editor",
      flowApiActive: "Flow API ready",
      flowApiInactive: "Flow API disconnected",
      flowApiChecking: "Checking Flow API",
      flowApiGenerating: "Generating via Flow API",
      flowApiDisabled: "Flow API disabled",
      flowApiSyncing: "Syncing Flow API",
      flowApiReadyShort: "Ready",
      flowApiCheckingShort: "Checking",
      flowApiGeneratingShort: "Generating",
      flowApiDisabledShort: "Off",
      flowApiDisconnectedShort: "Disconnected",
      flowApiSyncingShort: "Syncing",
      edited: "Edited",
      resetPrompt: "Reset prompt",
      savePrompt: "Save prompt",
      regenQueued: "Prompt queued for regeneration",
      regenBulkTitle: "Confirm regeneration",
      regenBulkMessage:
        "Choose a model and execution mode below, then click Regenerate to rerun {count} prompts.",
      regenSingleTitle: "Confirm regeneration",
      regenSingleMessage:
        "You can change the model and execution mode below, then click Regenerate.",
      regenBulkRefNote:
        "{count} prompts have references; each prompt keeps its mapped or @mentioned images.",
      regenConfirm: "Regenerate",
      cancel: "Cancel",
      regenMentionUnresolved:
        "No image was found for @mention: {names}. This prompt was not regenerated.",
      unsavedDraftConfirm:
        "Some edited prompts have not been saved or regenerated. Close anyway?",
      downloadSummary: "Downloaded {success}/{total} \u2014 {failed} failed",
      chunkDraining: "Finishing chunk, will reload Flow soon...",
      chunkReloading: "Reloading Flow page...",
      chunkResumed: "Chunk done, continuing batch...",
      andMore: "and {count} more",
      generating: "Generating...",
      statePending: "Pending",
      stateSubmitting: "Submitting",
      stateSubmitted: "Submitted",
      stateMonitoring: "Processing",
      stateRetry: "Waiting to regenerate",
      stateCompleted: "Done",
      statePartialFail: "Partial fail",
      stateFailed: "Failed",
      stateCancelled: "Cancelled",
      stateWaitingUser: "Awaiting Submit",
      flowRecoveryRequired: "Recovery required",
      manualReady: "Press Enter / click Submit{pos}{ref}",
      manualClickFirst: "Click prompt box, then Enter/Submit{pos}{ref}",
      manualSubmitted: "Received \u2014 generating...",
      manualPaused: "Paused \u2014 click Resume to continue",
      manualSkip: "Skip",
      skipInteractionBlock: "Allow interaction (generation continues)",
      modeAuto: "Auto",
      modeManual: "Manual",
    },
    th: {
      regenDailyQuotaNotice:
        "\u0E42\u0E21\u0E40\u0E14\u0E25 {models} \u0E41\u0E08\u0E49\u0E07\u0E27\u0E48\u0E32\u0E42\u0E04\u0E27\u0E15\u0E32\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E2B\u0E21\u0E14\u0E41\u0E25\u0E49\u0E27 \u0E40\u0E25\u0E37\u0E2D\u0E01\u0E42\u0E21\u0E40\u0E14\u0E25\u0E2D\u0E37\u0E48\u0E19\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E2B\u0E23\u0E37\u0E2D\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E2A\u0E48\u0E07\u0E43\u0E2B\u0E21\u0E48 \u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E40\u0E14\u0E34\u0E21\u0E08\u0E30\u0E16\u0E39\u0E01\u0E40\u0E01\u0E47\u0E1A\u0E44\u0E27\u0E49",
      regenKeepMode:
        "\u0E43\u0E0A\u0E49\u0E42\u0E2B\u0E21\u0E14\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19",
      regenQuotaCancelled:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E2A\u0E48\u0E07: \u0E42\u0E04\u0E27\u0E15\u0E32",
      regenKeepModel:
        "\u0E43\u0E0A\u0E49\u0E42\u0E21\u0E40\u0E14\u0E25\u0E40\u0E14\u0E34\u0E21\u0E02\u0E2D\u0E07\u0E41\u0E15\u0E48\u0E25\u0E30\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      regenModel: "\u0E42\u0E21\u0E40\u0E14\u0E25",
      regenMode:
        "\u0E42\u0E2B\u0E21\u0E14\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19",
      regenAuto: "Auto",
      regenWeb: "Web",
      regenApi: "API",
      regenConfigUnavailable:
        "\u0E42\u0E2B\u0E25\u0E14\u0E01\u0E32\u0E23\u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E42\u0E21\u0E40\u0E14\u0E25\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49",
      stopAll:
        "\u0E2B\u0E22\u0E38\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      stopNotConfirmed:
        "\u0E22\u0E31\u0E07\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E2B\u0E22\u0E38\u0E14\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 \u0E40\u0E1B\u0E34\u0E14 TobyFlow \u0E41\u0E25\u0E49\u0E27\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
      zoomedForFarRef:
        "\u0E22\u0E48\u0E2D\u0E2B\u0E19\u0E49\u0E32 Flow \u0E40\u0E1E\u0E23\u0E32\u0E30\u0E23\u0E39\u0E1B\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E44\u0E01\u0E25",
      scanningRefImages:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E41\u0E01\u0E19\u0E23\u0E39\u0E1B\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E1A\u0E19 Flow...",
      done: "\u0E40\u0E2A\u0E23\u0E47\u0E08",
      retrying:
        "\u0E23\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      paused:
        "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27",
      completed: "\u0E40\u0E2A\u0E23\u0E47\u0E08",
      stopped: "\u0E2B\u0E22\u0E38\u0E14\u0E41\u0E25\u0E49\u0E27",
      errors: "\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14",
      resume:
        "\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D",
      resumeChecking:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D Flow API\u2026",
      resumeAccepted:
        "\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E41\u0E25\u0E49\u0E27 \u2014 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E19\u0E33\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E15\u0E4C\u0E01\u0E25\u0E31\u0E1A\u0E40\u0E02\u0E49\u0E32\u0E04\u0E34\u0E27",
      resumeFailed:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E44\u0E14\u0E49",
      resumeOwnerGoneCancelled:
        "\u0E40\u0E0B\u0E2A\u0E0A\u0E31\u0E19\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E01\u0E31\u0E1A TobyFlow \u0E41\u0E25\u0E49\u0E27 \u2014 \u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E41\u0E1A\u0E15\u0E0A\u0E4C\u0E17\u0E35\u0E48\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27\u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27",
      captchaPausedTitle:
        "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27",
      captchaPausedDesc:
        "Google \u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27\u0E40\u0E19\u0E37\u0E48\u0E2D\u0E07\u0E08\u0E32\u0E01\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21\u0E1C\u0E34\u0E14\u0E1B\u0E01\u0E15\u0E34 \u0E23\u0E2D ~1\u20132 \u0E19\u0E32\u0E17\u0E35 \u0E41\u0E25\u0E49\u0E27\u0E01\u0E14\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D (\u0E44\u0E21\u0E48\u0E43\u0E0A\u0E48\u0E02\u0E49\u0E2D\u0E1C\u0E34\u0E14\u0E1E\u0E25\u0E32\u0E14\u0E02\u0E2D\u0E07\u0E2A\u0E48\u0E27\u0E19\u0E02\u0E22\u0E32\u0E22)",
      botCookieHint:
        "\u0E25\u0E2D\u0E07\u0E25\u0E49\u0E32\u0E07\u0E04\u0E38\u0E01\u0E01\u0E35\u0E49\u0E02\u0E2D\u0E07 Flow \u0E41\u0E25\u0E49\u0E27\u0E25\u0E2D\u0E07\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
      pause:
        "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27",
      stop: "\u0E2B\u0E22\u0E38\u0E14",
      running: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E17\u0E33",
      idle: "\u0E27\u0E48\u0E32\u0E07",
      sent: "\u0E2A\u0E48\u0E07\u0E41\u0E25\u0E49\u0E27",
      failed: "\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27",
      total: "\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      genActive: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07",
      flowWaiting: "\u0E23\u0E2D Flow",
      flowSlow:
        "Flow \u0E0A\u0E49\u0E32 \u2014 \u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E2D\u0E1A\u0E2A\u0E19\u0E2D\u0E07",
      dlPending:
        "\u0E23\u0E2D\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
      dlActive:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
      dlDone:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E41\u0E25\u0E49\u0E27",
      apiToastGenning:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1C\u0E48\u0E32\u0E19 API \u2014 {count} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23...",
      apiOverlayHint:
        "\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E04\u0E27\u0E32\u0E21\u0E04\u0E37\u0E1A\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E25\u0E30\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E17\u0E35\u0E48\u0E41\u0E1C\u0E07 TobyFlow (\u0E21\u0E38\u0E21\u0E02\u0E27\u0E32\u0E25\u0E48\u0E32\u0E07)",
      apiToastDone:
        "\u0E40\u0E2A\u0E23\u0E47\u0E08 \u2014 {completed}/{total} \u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C \u0E2B\u0E19\u0E49\u0E32\u0E08\u0E30\u0E42\u0E2B\u0E25\u0E14\u0E43\u0E2B\u0E21\u0E48\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E41\u0E2A\u0E14\u0E07",
      apiAuthPaused:
        "Flow API \u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D \u2014 \u0E2B\u0E22\u0E38\u0E14\u0E41\u0E1A\u0E15\u0E0A\u0E4C\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E2D\u0E40\u0E02\u0E49\u0E32\u0E2A\u0E39\u0E48\u0E23\u0E30\u0E1A\u0E1A\u0E43\u0E2B\u0E21\u0E48",
      apiAuthResumed:
        "Flow API \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E41\u0E25\u0E49\u0E27 \u2014 \u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E15\u0E48\u0E2D",
      stateQueuedApi: "\u0E23\u0E2D\u0E04\u0E34\u0E27",
      closeTracker: "\u0E1B\u0E34\u0E14",
      openTracker: "\u0E40\u0E1B\u0E34\u0E14 TobyFlow tracker",
      dlThumbTitle: "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
      viewThumbTitle: "\u0E14\u0E39",
      downloadAll:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      collapseAllItems:
        "\u0E22\u0E38\u0E1A\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      expandAllItems:
        "\u0E02\u0E22\u0E32\u0E22\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      wmClean:
        "\u0E25\u0E1A\u0E25\u0E32\u0E22\u0E19\u0E49\u0E33\u0E41\u0E25\u0E49\u0E27",
      wmOriginal: "\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A",
      wmAskTitle:
        "\u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E44\u0E2B\u0E19?",
      wmAskTitleAll:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 {n} \u0E44\u0E1F\u0E25\u0E4C \u2014 \u0E40\u0E27\u0E2D\u0E23\u0E4C\u0E0A\u0E31\u0E19\u0E44\u0E2B\u0E19?",
      downloadOptionsTitle:
        "\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E01\u0E32\u0E23\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
      downloadOptionsTitleAll:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 {n} \u0E44\u0E1F\u0E25\u0E4C",
      wmCleaning:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E25\u0E1A\u0E25\u0E32\u0E22\u0E19\u0E49\u0E33\u2026",
      wmDownloading:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u2026",
      wmSaved:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27",
      wmSavedOriginal:
        "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E1F\u0E25\u0E4C\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A (\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E25\u0E1A\u0E25\u0E32\u0E22\u0E19\u0E49\u0E33)",
      wmSavedNoWm:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 (\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E25\u0E32\u0E22\u0E19\u0E49\u0E33)",
      wmSizeNote:
        "\u0E44\u0E1F\u0E25\u0E4C\u0E17\u0E35\u0E48\u0E25\u0E1A\u0E25\u0E32\u0E22\u0E19\u0E49\u0E33\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25\u0E1A\u0E19\u0E40\u0E04\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13 \u2014 \u0E43\u0E0A\u0E49\u0E40\u0E27\u0E25\u0E32\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E25\u0E47\u0E01\u0E19\u0E49\u0E2D\u0E22",
      wmResLabel: "\u0E02\u0E19\u0E32\u0E14",
      wmGo: "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14",
      dlItemTitle:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C",
      regenTitle: "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      regenBusyTitle:
        "\u0E23\u0E2D\u0E04\u0E34\u0E27\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E01\u0E48\u0E2D\u0E19\u0E08\u0E36\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E44\u0E14\u0E49",
      regenSendingTitle:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48...",
      regenFailedTitle:
        "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E44\u0E14\u0E49",
      gridTitle:
        "\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E17\u0E35\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07",
      gridNoResult:
        "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C",
      batchSelectAll:
        "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E43\u0E19\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      batchDeselectAll:
        "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E01\u0E32\u0E23\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E43\u0E19\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      importedSession:
        "\u0E40\u0E0B\u0E2A\u0E0A\u0E31\u0E19\u0E17\u0E35\u0E48\u0E01\u0E39\u0E49\u0E04\u0E37\u0E19",
      addBatchRefs:
        "\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E40\u0E1B\u0E47\u0E19\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07",
      batchRefsAdded:
        "\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E41\u0E25\u0E49\u0E27",
      batchRefsUnavailable:
        "\u0E40\u0E1B\u0E34\u0E14\u0E41\u0E17\u0E47\u0E1A Gen \u0E41\u0E25\u0E30\u0E40\u0E25\u0E37\u0E2D\u0E01 Google Flow \u0E01\u0E48\u0E2D\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07",
      downloadBatch:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      regenBatchFailed:
        "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27/\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E2A\u0E48\u0E07\u0E43\u0E2B\u0E21\u0E48",
      removeHistory:
        "\u0E25\u0E1A\u0E08\u0E32\u0E01\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34",
      removeBatchConfirm:
        "\u0E25\u0E1A\u0E41\u0E1A\u0E15\u0E0A\u0E4C\u0E19\u0E35\u0E49\u0E08\u0E32\u0E01\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E15\u0E31\u0E27\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48?",
      collapseBatch: "\u0E22\u0E38\u0E1A\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      expandBatch: "\u0E02\u0E22\u0E32\u0E22\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      collapseAllBatches:
        "\u0E22\u0E38\u0E1A\u0E17\u0E38\u0E01\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      expandAllBatches:
        "\u0E02\u0E22\u0E32\u0E22\u0E17\u0E38\u0E01\u0E41\u0E1A\u0E15\u0E0A\u0E4C",
      chainBadge: "\u0E40\u0E0A\u0E19",
      generationFailed:
        "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E44\u0E21\u0E48\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08",
      gridExpand: "\u0E02\u0E22\u0E32\u0E22\u0E01\u0E23\u0E34\u0E14",
      closeGrid:
        "\u0E1B\u0E34\u0E14\u0E01\u0E23\u0E34\u0E14\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C",
      downloadAllScope:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E15\u0E31\u0E27\u0E01\u0E23\u0E2D\u0E07",
      clearAllGrid:
        "\u0E25\u0E49\u0E32\u0E07\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      clearAllGridConfirm:
        "\u0E25\u0E49\u0E32\u0E07\u0E41\u0E1A\u0E15\u0E0A\u0E4C\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E43\u0E19\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E02\u0E2D\u0E07\u0E42\u0E1B\u0E23\u0E40\u0E08\u0E01\u0E15\u0E4C\u0E19\u0E35\u0E49\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48? \u0E01\u0E32\u0E23\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E19\u0E35\u0E49\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49",
      removeItem: "\u0E25\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23",
      removeItemConfirm:
        "\u0E25\u0E1A\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E19\u0E35\u0E49\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E15\u0E31\u0E27\u0E15\u0E34\u0E14\u0E15\u0E32\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48?",
      removeQueuedConfirm:
        "\u0E25\u0E1A\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E19\u0E35\u0E49\u0E2D\u0E2D\u0E01\u0E08\u0E32\u0E01\u0E0A\u0E38\u0E14\u0E07\u0E32\u0E19\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48? \u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E08\u0E30\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E44\u0E1B\u0E22\u0E31\u0E07 Flow",
      recoveryRequired:
        "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E44\u0E14\u0E49",
      projectMismatch:
        "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E42\u0E1B\u0E23\u0E40\u0E08\u0E01\u0E15\u0E4C Flow \u0E2D\u0E37\u0E48\u0E19",
      serverUnavailable:
        "Flow API \u0E44\u0E21\u0E48\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27",
      perModelDailyLimit:
        "\u0E02\u0E35\u0E14\u0E08\u0E33\u0E01\u0E31\u0E14\u0E01\u0E32\u0E23\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E23\u0E32\u0E22\u0E27\u0E31\u0E19\u0E02\u0E2D\u0E07\u0E42\u0E21\u0E40\u0E14\u0E25",
      successCount: "\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08",
      partial:
        "\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E1A\u0E32\u0E07\u0E2A\u0E48\u0E27\u0E19",
      failedAll: "\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27",
      filterAll: "\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14",
      filterSuccess: "\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08",
      filterFailed: "\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27",
      filterRegen:
        "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E41\u0E25\u0E49\u0E27",
      searchPrompt:
        "\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C...",
      sortOriginal: "\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E40\u0E14\u0E34\u0E21",
      sortNewest:
        "\u0E43\u0E2B\u0E21\u0E48\u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14",
      regenAllFailed:
        "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E21\u0E14\u0E43\u0E2B\u0E21\u0E48",
      editPrompt:
        "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      closeEditor:
        "\u0E1B\u0E34\u0E14\u0E15\u0E31\u0E27\u0E41\u0E01\u0E49\u0E44\u0E02",
      flowApiActive:
        "Flow API \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19",
      flowApiInactive:
        "Flow API \u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D",
      flowApiChecking:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A Flow API",
      flowApiGenerating:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E1C\u0E48\u0E32\u0E19 Flow API",
      flowApiDisabled: "\u0E1B\u0E34\u0E14 Flow API \u0E41\u0E25\u0E49\u0E27",
      flowApiSyncing:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E0B\u0E34\u0E07\u0E04\u0E4C Flow API",
      flowApiReadyShort: "\u0E1E\u0E23\u0E49\u0E2D\u0E21",
      flowApiCheckingShort: "\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A",
      flowApiGeneratingShort:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07",
      flowApiDisabledShort: "\u0E1B\u0E34\u0E14",
      flowApiDisconnectedShort:
        "\u0E02\u0E32\u0E14\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D",
      flowApiSyncingShort: "\u0E0B\u0E34\u0E07\u0E04\u0E4C",
      edited: "\u0E41\u0E01\u0E49\u0E44\u0E02\u0E41\u0E25\u0E49\u0E27",
      resetPrompt:
        "\u0E04\u0E37\u0E19\u0E04\u0E48\u0E32\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      savePrompt:
        "\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C",
      regenQueued:
        "\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E04\u0E34\u0E27\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E41\u0E25\u0E49\u0E27",
      regenBulkTitle:
        "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      regenBulkMessage:
        "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E42\u0E21\u0E40\u0E14\u0E25\u0E41\u0E25\u0E30\u0E42\u0E2B\u0E21\u0E14\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07 \u0E41\u0E25\u0E49\u0E27\u0E01\u0E14\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E40\u0E23\u0E35\u0E22\u0E01\u0E43\u0E0A\u0E49 {count} \u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E2D\u0E35\u0E01\u0E04\u0E23\u0E31\u0E49\u0E07",
      regenSingleTitle:
        "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      regenSingleMessage:
        "\u0E04\u0E38\u0E13\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E42\u0E21\u0E40\u0E14\u0E25\u0E41\u0E25\u0E30\u0E42\u0E2B\u0E21\u0E14\u0E01\u0E32\u0E23\u0E17\u0E33\u0E07\u0E32\u0E19\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07 \u0E41\u0E25\u0E49\u0E27\u0E01\u0E14\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      regenBulkRefNote:
        "\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C {count} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E21\u0E35\u0E20\u0E32\u0E1E\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07 \u0E41\u0E25\u0E30\u0E08\u0E30\u0E04\u0E07\u0E20\u0E32\u0E1E\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E2B\u0E23\u0E37\u0E2D @mention \u0E44\u0E27\u0E49",
      regenConfirm: "\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      cancel: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01",
      regenMentionUnresolved:
        "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E20\u0E32\u0E1E\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A @mention: {names} \u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E19\u0E35\u0E49\u0E08\u0E36\u0E07\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      unsavedDraftConfirm:
        "\u0E21\u0E35\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E41\u0E15\u0E48\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E2B\u0E23\u0E37\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48 \u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E1B\u0E34\u0E14\u0E2B\u0E23\u0E37\u0E2D\u0E44\u0E21\u0E48?",
      downloadSummary:
        "\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14 {success}/{total} \u2014 \u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27 {failed}",
      chunkDraining:
        "\u0E23\u0E2D\u0E40\u0E2A\u0E23\u0E47\u0E08 chunk, \u0E08\u0E30\u0E23\u0E35\u0E42\u0E2B\u0E25\u0E14 Flow \u0E40\u0E23\u0E47\u0E27\u0E46 \u0E19\u0E35\u0E49...",
      chunkReloading:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E23\u0E35\u0E42\u0E2B\u0E25\u0E14\u0E2B\u0E19\u0E49\u0E32 Flow...",
      chunkResumed:
        "Chunk \u0E40\u0E2A\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27 \u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D...",
      andMore:
        "\u0E41\u0E25\u0E30 {count} \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21",
      generating:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07...",
      statePending: "\u0E23\u0E2D",
      stateSubmitting: "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E48\u0E07",
      stateSubmitted: "\u0E2A\u0E48\u0E07\u0E41\u0E25\u0E49\u0E27",
      stateMonitoring:
        "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E1B\u0E23\u0E30\u0E21\u0E27\u0E25\u0E1C\u0E25",
      stateRetry:
        "\u0E23\u0E2D\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E43\u0E2B\u0E21\u0E48",
      stateCompleted: "\u0E40\u0E2A\u0E23\u0E47\u0E08",
      statePartialFail:
        "\u0E40\u0E2A\u0E23\u0E47\u0E08\u0E1A\u0E32\u0E07\u0E2A\u0E48\u0E27\u0E19",
      stateFailed: "\u0E25\u0E49\u0E21\u0E40\u0E2B\u0E25\u0E27",
      stateCancelled: "\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01",
      stateWaitingUser: "\u0E23\u0E2D Submit",
      flowRecoveryRequired:
        "\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E39\u0E49\u0E04\u0E37\u0E19",
      manualReady:
        "\u0E01\u0E14 Enter / \u0E04\u0E25\u0E34\u0E01 Submit{pos}{ref}",
      manualClickFirst:
        "\u0E04\u0E25\u0E34\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E1E\u0E23\u0E2D\u0E21\u0E15\u0E4C \u0E41\u0E25\u0E49\u0E27 Enter/Submit{pos}{ref}",
      manualSubmitted:
        "\u0E23\u0E31\u0E1A\u0E41\u0E25\u0E49\u0E27 \u2014 \u0E01\u0E33\u0E25\u0E31\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07...",
      manualPaused:
        "\u0E2B\u0E22\u0E38\u0E14\u0E0A\u0E31\u0E48\u0E27\u0E04\u0E23\u0E32\u0E27 \u2014 \u0E01\u0E14\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E23\u0E31\u0E19",
      manualSkip: "\u0E02\u0E49\u0E32\u0E21",
      skipInteractionBlock:
        "\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E01\u0E32\u0E23\u0E42\u0E15\u0E49\u0E15\u0E2D\u0E1A (\u0E01\u0E32\u0E23\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E22\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E15\u0E48\u0E2D)",
      modeAuto: "Auto",
      modeManual: "Manual",
    },
    ja: {
      regenDailyQuotaNotice:
        "\u30E2\u30C7\u30EB {models} \u304C\u65E5\u6B21\u30AF\u30A9\u30FC\u30BF\u4E0A\u9650\u3092\u5831\u544A\u3057\u307E\u3057\u305F\u3002\u5225\u306E\u30E2\u30C7\u30EB\u3067\u5931\u6557\u30FB\u672A\u9001\u4FE1\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u518D\u751F\u6210\u3067\u304D\u307E\u3059\u3002\u65E2\u5B58\u306E\u7D50\u679C\u306F\u7DAD\u6301\u3055\u308C\u307E\u3059\u3002",
      regenKeepMode: "\u73FE\u5728\u306E\u30E2\u30FC\u30C9\u3092\u7DAD\u6301",
      regenQuotaCancelled:
        "\u30AF\u30A9\u30FC\u30BF\u306B\u3088\u308A\u672A\u9001\u4FE1",
      regenKeepModel:
        "\u5404\u30D7\u30ED\u30F3\u30D7\u30C8\u306E\u30E2\u30C7\u30EB\u3092\u7DAD\u6301",
      regenModel: "\u30E2\u30C7\u30EB",
      regenMode: "\u5B9F\u884C\u30E2\u30FC\u30C9",
      regenAuto: "Auto",
      regenWeb: "Web",
      regenApi: "API",
      regenConfigUnavailable:
        "\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093",
      stopAll: "\u3059\u3079\u3066\u505C\u6B62",
      stopNotConfirmed:
        "\u505C\u6B62\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002TobyFlow\u3092\u958B\u3044\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      zoomedForFarRef:
        "\u53C2\u7167\u753B\u50CF\u304C\u9060\u3044\u305F\u3081 Flow \u30DA\u30FC\u30B8\u3092\u7E2E\u5C0F\u3057\u307E\u3057\u305F",
      scanningRefImages:
        "Flow \u3067\u53C2\u7167\u753B\u50CF\u3092\u30B9\u30AD\u30E3\u30F3\u4E2D...",
      done: "\u5B8C\u4E86",
      retrying: "\u518D\u751F\u6210\u5F85\u3061",
      paused: "\u4E00\u6642\u505C\u6B62",
      completed: "\u5B8C\u4E86",
      stopped: "\u505C\u6B62",
      errors: "\u30A8\u30E9\u30FC",
      resume: "\u518D\u958B",
      resumeChecking:
        "Flow API \u306E\u63A5\u7D9A\u3092\u78BA\u8A8D\u4E2D\u2026",
      resumeAccepted:
        "\u518D\u958B\u3057\u307E\u3057\u305F \u2014 \u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u30AD\u30E5\u30FC\u306B\u623B\u3057\u3066\u3044\u307E\u3059\u3002",
      resumeFailed: "\u518D\u958B\u3067\u304D\u307E\u305B\u3093",
      resumeOwnerGoneCancelled:
        "\u5B9F\u884C\u30BB\u30C3\u30B7\u30E7\u30F3\u304C TobyFlow \u304B\u3089\u5207\u65AD\u3055\u308C\u305F\u305F\u3081\u3001\u4E00\u6642\u505C\u6B62\u4E2D\u306E\u30D0\u30C3\u30C1\u3092\u81EA\u52D5\u7684\u306B\u30AD\u30E3\u30F3\u30BB\u30EB\u3057\u307E\u3057\u305F\u3002",
      captchaPausedTitle: "\u4E00\u6642\u505C\u6B62\u4E2D",
      captchaPausedDesc:
        "\u7570\u5E38\u306A\u30A2\u30AF\u30C6\u30A3\u30D3\u30C6\u30A3\u306E\u305F\u3081 Google \u304C\u4E00\u6642\u7684\u306B\u30D6\u30ED\u30C3\u30AF\u3057\u307E\u3057\u305F\u3002\u7D041\u301C2\u5206\u5F85\u3063\u3066\u304B\u3089\u300C\u518D\u958B\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u62E1\u5F35\u6A5F\u80FD\u306E\u30A8\u30E9\u30FC\u3067\u306F\u3042\u308A\u307E\u305B\u3093\uFF09\u3002",
      botCookieHint:
        "Flow\u306ECookie\u3092\u524A\u9664\u3057\u3066\u3001\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
      pause: "\u4E00\u6642\u505C\u6B62",
      stop: "\u505C\u6B62",
      running: "\u5B9F\u884C\u4E2D",
      idle: "\u5F85\u6A5F",
      sent: "\u9001\u4FE1",
      failed: "\u5931\u6557",
      total: "\u5408\u8A08",
      genActive: "\u751F\u6210\u4E2D",
      flowWaiting: "Flow\u5F85\u6A5F",
      flowSlow: "Flow\u304C\u9045\u3044 \u2014 \u5FDC\u7B54\u5F85\u3061",
      dlPending: "DL\u5F85\u3061",
      dlActive: "DL\u4E2D",
      dlDone: "DL\u6E08\u307F",
      apiToastGenning:
        "API\u7D4C\u7531\u3067\u751F\u6210\u4E2D \u2014 {count}\u4EF6\u5B9F\u884C\u4E2D...",
      apiOverlayHint:
        "\u9032\u6357\u3068\u7D50\u679C\u306FTobyFlow\u30D1\u30CD\u30EB\uFF08\u53F3\u4E0B\uFF09\u3067\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044",
      apiToastDone:
        "\u5B8C\u4E86 \u2014 {completed}/{total}\u4EF6\u3002\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u8868\u793A\u3057\u307E\u3059\u3002",
      apiAuthPaused:
        "Flow API \u306E\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F \u2014 \u518D\u30ED\u30B0\u30A4\u30F3\u3092\u5F85\u3064\u305F\u3081\u30D0\u30C3\u30C1\u3092\u4E00\u6642\u505C\u6B62\u3057\u307E\u3057\u305F",
      apiAuthResumed:
        "Flow API \u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3057\u305F \u2014 \u6B8B\u308A\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u7D9A\u884C\u3057\u307E\u3059",
      stateQueuedApi: "\u9806\u756A\u5F85\u3061",
      closeTracker: "\u9589\u3058\u308B",
      openTracker: "TobyFlow tracker \u3092\u958B\u304F",
      dlThumbTitle: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      viewThumbTitle: "\u8868\u793A",
      downloadAll: "\u3059\u3079\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      collapseAllItems:
        "\u3059\u3079\u3066\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u6298\u308A\u305F\u305F\u3080",
      expandAllItems:
        "\u3059\u3079\u3066\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u5C55\u958B",
      wmClean: "\u30A6\u30A9\u30FC\u30BF\u30FC\u30DE\u30FC\u30AF\u9664\u53BB",
      wmOriginal: "\u30AA\u30EA\u30B8\u30CA\u30EB",
      wmAskTitle: "\u3069\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\uFF1F",
      wmAskTitleAll:
        "{n} \u4EF6\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9 \u2014 \u3069\u306E\u30D0\u30FC\u30B8\u30E7\u30F3\uFF1F",
      downloadOptionsTitle: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u8A2D\u5B9A",
      downloadOptionsTitleAll:
        "{n} \u4EF6\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      wmCleaning:
        "\u30A6\u30A9\u30FC\u30BF\u30FC\u30DE\u30FC\u30AF\u9664\u53BB\u4E2D\u2026",
      wmDownloading: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u4E2D\u2026",
      wmSaved: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5B8C\u4E86",
      wmSavedOriginal:
        "\u5143\u306E\u30D5\u30A1\u30A4\u30EB\u3092\u4FDD\u5B58\uFF08\u900F\u304B\u3057\u306F\u672A\u9664\u53BB\uFF09",
      wmSavedNoWm:
        "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5B8C\u4E86\uFF08\u900F\u304B\u3057\u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\uFF09",
      wmSizeNote:
        "\u9664\u53BB\u7248\u306F\u304A\u4F7F\u3044\u306E\u7AEF\u672B\u3067\u51E6\u7406\u3055\u308C\u307E\u3059 \u2014 \u6570\u79D2\u307B\u3069\u4F59\u5206\u306B\u304B\u304B\u308A\u307E\u3059\u3002",
      wmResLabel: "\u30B5\u30A4\u30BA",
      wmGo: "\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      dlItemTitle: "\u7D50\u679C\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      regenTitle: "\u518D\u751F\u6210",
      regenBusyTitle:
        "\u30AD\u30E5\u30FC\u5B8C\u4E86\u5F8C\u306B\u518D\u751F\u6210\u3067\u304D\u307E\u3059",
      regenSendingTitle:
        "\u518D\u751F\u6210\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u9001\u4FE1\u4E2D...",
      regenFailedTitle:
        "\u518D\u751F\u6210\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u9001\u4FE1\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
      gridTitle: "\u751F\u6210\u7D50\u679C",
      gridNoResult: "\u7D50\u679C\u306A\u3057",
      batchSelectAll:
        "\u30D0\u30C3\u30C1\u5185\u3092\u3059\u3079\u3066\u9078\u629E",
      batchDeselectAll:
        "\u30D0\u30C3\u30C1\u5185\u306E\u9078\u629E\u3092\u3059\u3079\u3066\u89E3\u9664",
      importedSession: "\u5FA9\u5143\u6E08\u307F\u30BB\u30C3\u30B7\u30E7\u30F3",
      addBatchRefs: "\u7D50\u679C\u3092\u53C2\u7167\u306B\u8FFD\u52A0",
      batchRefsAdded: "\u53C2\u7167\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F",
      batchRefsUnavailable:
        "Gen \u30BF\u30D6\u3092\u958B\u304D Google Flow \u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      downloadBatch:
        "\u30D0\u30C3\u30C1\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      regenBatchFailed:
        "\u5931\u6557\u30FB\u672A\u9001\u4FE1\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u518D\u751F\u6210",
      removeHistory: "\u5C65\u6B74\u304B\u3089\u524A\u9664",
      removeBatchConfirm:
        "\u3053\u306E\u30D0\u30C3\u30C1\u3092\u30C8\u30E9\u30C3\u30AB\u30FC\u5C65\u6B74\u304B\u3089\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F",
      collapseBatch: "\u30D0\u30C3\u30C1\u3092\u6298\u308A\u305F\u305F\u3080",
      expandBatch: "\u30D0\u30C3\u30C1\u3092\u5C55\u958B",
      collapseAllBatches:
        "\u3059\u3079\u3066\u306E\u30D0\u30C3\u30C1\u3092\u6298\u308A\u305F\u305F\u3080",
      expandAllBatches:
        "\u3059\u3079\u3066\u306E\u30D0\u30C3\u30C1\u3092\u5C55\u958B",
      chainBadge: "\u30C1\u30A7\u30FC\u30F3",
      generationFailed:
        "\u751F\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
      gridExpand: "\u30B0\u30EA\u30C3\u30C9\u8868\u793A",
      closeGrid: "\u7D50\u679C\u30B0\u30EA\u30C3\u30C9\u3092\u9589\u3058\u308B",
      downloadAllScope:
        "\u73FE\u5728\u306E\u30D5\u30A3\u30EB\u30BF\u30FC\u306B\u4E00\u81F4\u3059\u308B\u7D50\u679C\u3092\u3059\u3079\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9",
      clearAllGrid: "\u3059\u3079\u3066\u524A\u9664",
      clearAllGridConfirm:
        "\u3053\u306E\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u30C8\u30E9\u30C3\u30AB\u30FC\u5C65\u6B74\u3092\u3059\u3079\u3066\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\u3053\u306E\u64CD\u4F5C\u306F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002",
      removeItem: "\u9805\u76EE\u3092\u524A\u9664",
      removeItemConfirm:
        "\u3053\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u30C8\u30E9\u30C3\u30AB\u30FC\u5C65\u6B74\u304B\u3089\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F",
      removeQueuedConfirm:
        "\u3053\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u30D0\u30C3\u30C1\u304B\u3089\u524A\u9664\u3057\u307E\u3059\u304B\uFF1FFlow \u306B\u306F\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093\u3002",
      recoveryRequired: "\u7D9A\u884C\u3067\u304D\u307E\u305B\u3093",
      projectMismatch:
        "\u5225\u306E Flow \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u51E6\u7406\u3067\u3059",
      serverUnavailable:
        "Flow API \u306F\u4E00\u6642\u7684\u306B\u5229\u7528\u3067\u304D\u307E\u305B\u3093",
      perModelDailyLimit:
        "\u30E2\u30C7\u30EB\u3054\u3068\u306E1\u65E5\u306E\u751F\u6210\u4E0A\u9650",
      successCount: "\u6210\u529F",
      partial: "\u4E00\u90E8\u6210\u529F",
      failedAll: "\u5931\u6557",
      filterAll: "\u3059\u3079\u3066",
      filterSuccess: "\u6210\u529F",
      filterFailed: "\u5931\u6557",
      filterRegen: "\u518D\u751F\u6210\u6E08\u307F",
      searchPrompt: "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u691C\u7D22...",
      sortOriginal: "\u5143\u306E\u9806\u5E8F",
      sortNewest: "\u65B0\u3057\u3044\u9806",
      regenAllFailed:
        "\u5931\u6557\u3057\u305F\u9805\u76EE\u3092\u3059\u3079\u3066\u518D\u751F\u6210",
      editPrompt: "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u7DE8\u96C6",
      closeEditor: "\u30A8\u30C7\u30A3\u30BF\u30FC\u3092\u9589\u3058\u308B",
      flowApiActive: "Flow API \u6E96\u5099\u5B8C\u4E86",
      flowApiInactive: "Flow API \u63A5\u7D9A\u5207\u308C",
      flowApiChecking: "Flow API \u3092\u78BA\u8A8D\u4E2D",
      flowApiGenerating: "Flow API \u3067\u751F\u6210\u4E2D",
      flowApiDisabled: "Flow API \u7121\u52B9",
      flowApiSyncing: "Flow API \u3092\u540C\u671F\u4E2D",
      flowApiReadyShort: "\u6E96\u5099\u5B8C\u4E86",
      flowApiCheckingShort: "\u78BA\u8A8D\u4E2D",
      flowApiGeneratingShort: "\u751F\u6210\u4E2D",
      flowApiDisabledShort: "\u7121\u52B9",
      flowApiDisconnectedShort: "\u63A5\u7D9A\u5207\u308C",
      flowApiSyncingShort: "\u540C\u671F\u4E2D",
      edited: "\u7DE8\u96C6\u6E08\u307F",
      resetPrompt: "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u623B\u3059",
      savePrompt: "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u4FDD\u5B58",
      regenQueued:
        "\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u518D\u751F\u6210\u30AD\u30E5\u30FC\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F",
      regenBulkTitle: "\u518D\u751F\u6210\u306E\u78BA\u8A8D",
      regenBulkMessage:
        "\u4E0B\u3067\u30E2\u30C7\u30EB\u3068\u5B9F\u884C\u30E2\u30FC\u30C9\u3092\u9078\u3073\u3001\u300C\u518D\u751F\u6210\u300D\u3092\u62BC\u3059\u3068 {count} \u4EF6\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u3092\u518D\u5B9F\u884C\u3067\u304D\u307E\u3059\u3002",
      regenSingleTitle: "\u518D\u751F\u6210\u306E\u78BA\u8A8D",
      regenSingleMessage:
        "\u4E0B\u3067\u30E2\u30C7\u30EB\u3068\u5B9F\u884C\u30E2\u30FC\u30C9\u3092\u5909\u66F4\u3057\u3001\u300C\u518D\u751F\u6210\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      regenBulkRefNote:
        "{count} \u4EF6\u306B\u53C2\u7167\u753B\u50CF\u304C\u3042\u308A\u307E\u3059\u3002\u5272\u308A\u5F53\u3066\u307E\u305F\u306F @mention \u306E\u753B\u50CF\u3092\u7DAD\u6301\u3057\u307E\u3059\u3002",
      regenConfirm: "\u518D\u751F\u6210",
      cancel: "\u30AD\u30E3\u30F3\u30BB\u30EB",
      regenMentionUnresolved:
        "@mention \u306E\u753B\u50CF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093: {names}\u3002\u3053\u306E\u30D7\u30ED\u30F3\u30D7\u30C8\u306F\u518D\u751F\u6210\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
      unsavedDraftConfirm:
        "\u4FDD\u5B58\u307E\u305F\u306F\u518D\u751F\u6210\u3057\u3066\u3044\u306A\u3044\u7DE8\u96C6\u6E08\u307F\u30D7\u30ED\u30F3\u30D7\u30C8\u304C\u3042\u308A\u307E\u3059\u3002\u9589\u3058\u307E\u3059\u304B\uFF1F",
      downloadSummary:
        "{success}/{total} \u4EF6\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9 \u2014 \u5931\u6557 {failed}",
      chunkDraining:
        "\u30C1\u30E3\u30F3\u30AF\u5B8C\u4E86\u5F85\u3061\u3001Flow\u518D\u8AAD\u307F\u8FBC\u307F...",
      chunkReloading:
        "Flow\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u4E2D...",
      chunkResumed:
        "\u30C1\u30E3\u30F3\u30AF\u5B8C\u4E86\u3001\u7D9A\u884C\u4E2D...",
      andMore: "\u3042\u3068{count}\u4EF6",
      generating: "\u751F\u6210\u4E2D...",
      statePending: "\u5F85\u6A5F",
      stateSubmitting: "\u9001\u4FE1\u4E2D",
      stateSubmitted: "\u9001\u4FE1\u6E08\u307F",
      stateMonitoring: "\u51E6\u7406\u4E2D",
      stateRetry: "\u518D\u751F\u6210\u5F85\u3061",
      stateCompleted: "\u5B8C\u4E86",
      statePartialFail: "\u4E00\u90E8\u5931\u6557",
      stateFailed: "\u5931\u6557",
      stateCancelled: "\u30AD\u30E3\u30F3\u30BB\u30EB",
      stateWaitingUser: "\u9001\u4FE1\u5F85\u3061",
      flowRecoveryRequired: "\u5FA9\u65E7\u304C\u5FC5\u8981",
      manualReady:
        "Enter / \u9001\u4FE1\u30DC\u30BF\u30F3\u3067\u751F\u6210{pos}{ref}",
      manualClickFirst:
        "\u30D7\u30ED\u30F3\u30D7\u30C8\u6B04\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066Enter/\u9001\u4FE1{pos}{ref}",
      manualSubmitted: "\u53D7\u4FE1 \u2014 \u751F\u6210\u4E2D...",
      manualPaused:
        "\u4E00\u6642\u505C\u6B62\u4E2D \u2014 \u518D\u958B\u3092\u62BC\u3057\u3066\u7D9A\u884C",
      manualSkip: "\u30B9\u30AD\u30C3\u30D7",
      skipInteractionBlock:
        "\u64CD\u4F5C\u30ED\u30C3\u30AF\u3092\u89E3\u9664\uFF08\u751F\u6210\u306F\u7D9A\u884C\uFF09",
      modeAuto: "Auto",
      modeManual: "Manual",
    },
  };
  (function () {
    try {
      chrome.storage.local.get(["af_locale", "af_settings"], function (result) {
        _trackerLocale =
          result.af_locale ||
          (result.af_settings && result.af_settings.language) ||
          "vi";
        FloatingTracker?._refreshGridLocale?.();
      });
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || (!changes.af_locale && !changes.af_settings))
          return;
        chrome.storage.local.get(["af_locale", "af_settings"], function (r) {
          _trackerLocale =
            r.af_locale || (r.af_settings && r.af_settings.language) || "vi";
          if (FloatingTracker._el && FloatingTracker._lastData) {
            FloatingTracker.update(FloatingTracker._lastData);
          }
          FloatingTracker._refreshGridLocale?.();
        });
      });
    } catch (e) {}
  })();
  try {
    window.addEventListener("message", function (ev) {
      if (ev.source !== window) return;
      var d = ev.data;
      if (!d || d.channel !== "TOBY_MEDIA_INTERCEPT_STATE") return;
      if (typeof ApiGenNotice === "undefined") return;
      if (d.phase === "downloading")
        ApiGenNotice.showWm(_getTrackerT2("wmDownloading"), false);
      else if (d.phase === "cleaning")
        ApiGenNotice.showWm(_getTrackerT2("wmCleaning"), false);
      else if (d.phase === "done")
        ApiGenNotice.showWm(_getTrackerT2("wmSaved"), true);
      else if (d.phase === "no_watermark")
        ApiGenNotice.showWm(_getTrackerT2("wmSavedNoWm"), true);
      else if (d.phase === "original")
        ApiGenNotice.showWm(_getTrackerT2("wmSavedOriginal"), true);
    });
  } catch (_) {}
  var ApiGenNotice = {
    _el: null,
    _hideTimer: null,
    _wasActive: false,
    _overlayEl: null,
    _overlaySkipped: false,
    _ensureOverlay: function () {
      if (!document.getElementById("tobyflow-agn-style")) {
        var st = document.createElement("style");
        st.id = "tobyflow-agn-style";
        st.textContent =
          "@keyframes tobyflow-spin{to{transform:rotate(360deg)}}";
        document.head.appendChild(st);
      }
      if (this._overlayEl && document.body.contains(this._overlayEl)) return;
      var existing = document.getElementById("tobyflow-api-gen-overlay");
      if (existing) existing.remove();
      var ov = document.createElement("div");
      ov.id = "tobyflow-api-gen-overlay";
      ov.style.cssText =
        'position:fixed;inset:0;z-index:2147483645;display:none;align-items:center;justify-content:center;background:rgba(6,9,15,0.32);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;';
      ov.innerHTML =
        '<div class="tobyflow-ago-inner" style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:0 24px;"><span style="width:28px;height:28px;border:3px solid rgba(147,197,253,0.25);border-top-color:#60a5fa;border-radius:50%;animation:tobyflow-spin 0.9s linear infinite;display:block;"></span><div class="tobyflow-ago-title" style="font-size:15px;font-weight:700;letter-spacing:0.2px;text-shadow:0 2px 10px rgba(0,0,0,0.5);"></div><div class="tobyflow-ago-hint" style="font-size:12px;opacity:0.65;text-shadow:0 1px 6px rgba(0,0,0,0.5);"></div></div>';
      document.body.appendChild(ov);
      this._overlayEl = ov;
    },
    _assertZoomScale: function () {
      try {
        var inner =
          this._overlayEl &&
          this._overlayEl.querySelector(".tobyflow-ago-inner");
        if (!inner) return;
        var inv = window._tobyFlowZoomScaleInv || 1;
        var want = inv === 1 ? "" : String(inv);
        if (inner.style.zoom !== want) inner.style.zoom = want;
      } catch (_) {}
    },
    hideOverlay: function () {
      if (this._overlayEl) this._overlayEl.style.display = "none";
    },
    skipOverlay: function () {
      this._overlaySkipped = true;
      this.hideOverlay();
    },
    _ensure: function () {
      if (!document.getElementById("tobyflow-agn-style")) {
        var st = document.createElement("style");
        st.id = "tobyflow-agn-style";
        st.textContent =
          "@keyframes tobyflow-spin{to{transform:rotate(360deg)}}";
        document.head.appendChild(st);
      }
      if (this._el && document.body.contains(this._el)) return;
      var existing = document.getElementById("tobyflow-api-gen-notice");
      if (existing) existing.remove();
      var el = document.createElement("div");
      el.id = "tobyflow-api-gen-notice";
      el.style.cssText =
        'position:fixed;top:74px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:9px;padding:10px 18px;border-radius:24px;background:linear-gradient(180deg, rgba(18,22,30,0.55), rgba(4,7,12,0.62)), linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04));border:1px solid rgba(96,165,250,0.45);box-shadow:0 14px 38px rgba(0,0,0,0.32), 0 0 18px rgba(59,130,246,0.22), inset 0 1px 0 rgba(255,255,255,0.28);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);z-index:2147483647;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12.5px;font-weight:600;color:#fff;white-space:normal;line-height:1.5;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;overflow-wrap:anywhere;';
      el.innerHTML =
        '<span class="tobyflow-agn-icon" style="flex-shrink:0;display:flex;"></span><span class="tobyflow-agn-text"></span>';
      try {
        var _inv = window._tobyFlowZoomScaleInv || 1;
        if (_inv !== 1) el.style.zoom = String(_inv);
      } catch (_) {}
      document.body.appendChild(el);
      this._el = el;
    },
    _spinnerHtml:
      '<span style="width:14px;height:14px;border:2.5px solid rgba(147,197,253,0.3);border-top-color:#60a5fa;border-radius:50%;animation:tobyflow-spin 0.9s linear infinite;display:block;"></span>',
    _checkHtml:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    showWm: function (text, done) {
      try {
        if (text === null) {
          clearTimeout(this._wmTimer);
          if (!this._wasActive && this._el) this._el.style.display = "none";
          return;
        }
        this._ensure();
        if (!this._el) return;
        clearTimeout(this._wmTimer);
        this._el.querySelector(".tobyflow-agn-icon").innerHTML = done
          ? this._checkHtml
          : this._spinnerHtml;
        this._el.querySelector(".tobyflow-agn-text").textContent = text;
        this._el.style.display = "flex";
        this._assertZoomScale && this._assertZoomScale();
        var self2 = this;
        if (done) {
          this._wmTimer = setTimeout(function () {
            self2.showWm(null);
          }, 4e3);
        } else {
          this._wmTimer = setTimeout(function () {
            console.warn(
              "[Tracker] toast xo\xE1 watermark qu\xE1 h\u1EA1n \u2014 t\u1EF1 t\u1EAFt (kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c t\xEDn hi\u1EC7u xong)",
            );
            self2.showWm(null);
          }, 15e4);
        }
      } catch (e) {
        console.warn("[Tracker] showWm:", e && e.message);
      }
    },
    _wmTimer: null,
    showAuthRecovery: function (state) {
      try {
        this._ensure();
        if (!this._el) return;
        clearTimeout(this._authTimer);
        var resumed = state === "resumed";
        this._authState = resumed ? "resumed" : "paused";
        this._el.querySelector(".tobyflow-agn-icon").innerHTML = resumed
          ? this._checkHtml
          : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
        this._el.querySelector(".tobyflow-agn-text").textContent =
          _getTrackerT2(resumed ? "apiAuthResumed" : "apiAuthPaused");
        this._el.style.borderColor = resumed
          ? "rgba(74,222,128,.55)"
          : "rgba(251,191,36,.58)";
        this._el.style.display = "flex";
        this._assertZoomScale();
        if (resumed) {
          var self2 = this;
          this._authTimer = setTimeout(function () {
            self2._authState = null;
            if (self2._el) self2._el.style.display = "none";
          }, 5e3);
        }
      } catch (e) {
        console.warn("[Tracker] auth recovery toast:", e && e.message);
      }
    },
    _authTimer: null,
    _authState: null,
    update: function (data) {
      var jobs = (data && data.jobs) || [];
      var apiActive = 0,
        anyApi = false,
        anyStopped = false;
      for (var i = 0; i < jobs.length; i++) {
        var jb = jobs[i];
        var items = jb.items || [];
        var jobDead = jb.status === "stopped";
        for (var k = 0; k < items.length; k++) {
          var it = items[k];
          if (it.genMode !== "api") continue;
          anyApi = true;
          if (jobDead) {
            anyStopped = true;
            continue;
          }
          if (
            ["SUBMITTING", "SUBMITTED", "MONITORING"].includes(it.state) &&
            !it.apiWaiting
          )
            apiActive++;
        }
      }
      var webActive =
        data &&
        data.isRunning &&
        jobs.some(function (job) {
          return (
            job.status === "running" &&
            !job.settings?.manualSubmitMode &&
            (job.items || []).some(function (item) {
              return (
                (item.genMode || job.modeType || "web") === "web" &&
                [
                  "SUBMITTING",
                  "SUBMITTED",
                  "MONITORING",
                  "RETRY_SUBMIT",
                  "RECOVERY_REQUIRED",
                ].includes(item.state)
              );
            })
          );
        });
      if (webActive && data.webProcessNotice) {
        clearTimeout(this._hideTimer);
        this._webWasActive = true;
        this._ensure();
        this._el.style.borderColor = "rgba(251,191,36,0.45)";
        this._el.querySelector(".tobyflow-agn-icon").innerHTML =
          this._spinnerHtml;
        this._el.querySelector(".tobyflow-agn-text").textContent =
          data.webProcessNotice;
        this._el.style.display = "flex";
        return;
      }
      if (this._webWasActive) {
        this._webWasActive = false;
        this.hide();
      }
      if (anyStopped && apiActive === 0) {
        this.hide();
        return;
      }
      if (this._authState === "paused" || this._authState === "resumed") return;
      if (apiActive > 0) {
        clearTimeout(this._hideTimer);
        this._wasActive = true;
        var _gridOpen = !!(
          typeof FloatingTracker !== "undefined" &&
          FloatingTracker._hasLiveGrid?.()
        );
        this.hideOverlay();
        if (_gridOpen) {
          if (this._el) this._el.style.display = "none";
        } else {
          this._ensure();
          this._el.style.borderColor = "rgba(96,165,250,0.45)";
          this._el.querySelector(".tobyflow-agn-icon").innerHTML =
            this._spinnerHtml;
          this._el.querySelector(".tobyflow-agn-text").textContent =
            _getTrackerT2("apiToastGenning", { count: apiActive });
          this._el.style.display = "flex";
        }
        return;
      }
      this.hideOverlay();
      this._overlaySkipped = false;
      if (this._wasActive && anyApi && data && !data.isRunning) {
        this._wasActive = false;
        this._ensure();
        this._el.style.borderColor = "rgba(74,222,128,0.45)";
        this._el.querySelector(".tobyflow-agn-icon").innerHTML =
          this._checkHtml;
        this._el.querySelector(".tobyflow-agn-text").textContent =
          _getTrackerT2("apiToastDone", {
            completed: data.completed || 0,
            total: data.total || 0,
          });
        this._el.style.display = "flex";
        var self2 = this;
        clearTimeout(this._hideTimer);
        this._hideTimer = setTimeout(function () {
          self2.hide();
        }, 5e3);
        return;
      }
      if (!anyApi) this.hide();
    },
    hide: function () {
      clearTimeout(this._hideTimer);
      clearTimeout(this._authTimer);
      this._hideTimer = null;
      this._authTimer = null;
      this._authState = null;
      if (this._el) this._el.style.display = "none";
      this.hideOverlay();
      this._overlaySkipped = false;
    },
  };
  var FloatingTracker = {
    _el: null,
    _launcherEl: null,
    _surfaceClosed: false,
    _dragPos: null,
    _hideTimer: null,
    _expandedJobs: new Set(),
    _manuallyCollapsed: new Set(),
    _manuallyExpanded: new Set(),
    _allJobsCollapsed: false,
    _allJobsUserTouched: false,
    _allJobsSessionId: null,
    _autoCollapsedDone: new Set(),
    _tileProgressCache: {},
    _lastDataHash: null,
    _lastJobsRenderSig: null,
    _autoRefreshInterval: null,
    _compactElapsedTimer: null,
    _AUTO_REFRESH_MS: 2e3,
    _chunkStatus: null,
    _chunkResumedTimer: null,
    _gridSessionId: null,
    _gridFilter: "all",
    _gridSearch: "",
    _gridSort: "newest",
    _gridHistoryLoadTimer: null,
    _gridElapsedTimer: null,
    _gridHistoryLoadId: 0,
    _gridOpenRequested: false,
    _gridOpenWasUserInitiated: false,
    _manualGridOpenWebRunKey: null,
    _regenPendingIds: new Set(),
    _regenHistorySnapshot: null,
    _manualDlStates: {},
    _cacheWriteChain: Promise.resolve(),
    _isCurrentProjectItem: function (item) {
      try {
        var current =
          (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
        var ownerProject =
          (item && item.projectId) ||
          (this._lastData && this._lastData.projectId) ||
          null;
        if (!current) return false;
        return !ownerProject || current === ownerProject;
      } catch (_) {
        return false;
      }
    },
    _handleProjectNavigation: function (projectId) {
      var previous = (this._lastData && this._lastData.projectId) || null;
      if (previous === (projectId || null)) return;
      this._closeGrid(true);
      this.hide();
      this._gridHistoryReady = false;
      this._gridHistoryLoading = false;
      this._gridOpenData = null;
      this._apiLiveGridHandledSession = null;
      this._webSurfaceHandledJobs = new Set();
      if (!projectId) return;
      var self2 = this;
      this._loadTrackerCache(function (data) {
        var current =
          (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
        if (
          current !== projectId ||
          !data ||
          data.projectId !== projectId ||
          self2._lastData
        )
          return;
        self2.update(data);
      });
    },
    _isApiSession: function (data) {
      data = data || this._lastData;
      if (!data || !Array.isArray(data.jobs)) return false;
      var terminal = [
        "COMPLETED",
        "PARTIAL_FAIL",
        "FAILED",
        "CANCELLED",
        "BLOCKED",
        "RECOVERY_REQUIRED",
        "SKIPPED",
      ];
      var active = [];
      data.jobs.forEach(function (job) {
        (job.items || []).forEach(function (item) {
          if (terminal.indexOf(item.state) < 0) active.push({ item, job });
        });
      });
      if (!active.length) return false;
      return active.every(function (entry) {
        return (
          entry.item.genMode === "api" ||
          (!entry.item.genMode && entry.job.modeType === "api")
        );
      });
    },
    _ownerColors: {
      prompts: "#3b82f6",
      task: "#f97316",
      workflow: "#a855f7",
      angles: "#ec4899",
      telegram: "#06b6d4",
    },
    _getStateConfig: function () {
      return {
        PENDING: {
          label: _getTrackerT2("statePending"),
          bg: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.5)",
        },
        SUBMITTING: {
          label: _getTrackerT2("stateSubmitting"),
          bg: "rgba(59,130,246,0.2)",
          color: "#60a5fa",
        },
        WAITING_USER: {
          label: _getTrackerT2("stateWaitingUser"),
          bg: "rgba(234,179,8,0.2)",
          color: "#eab308",
        },
        WAITING_PROVIDER: {
          label: _getTrackerT2("paused"),
          bg: "rgba(255,255,255,0.08)",
          color: "#9ca3af",
        },
        RECOVERY_REQUIRED: {
          label: _getTrackerT2("flowRecoveryRequired"),
          bg: "rgba(245,158,11,0.2)",
          color: "#f59e0b",
        },
        SUBMITTED: {
          label: _getTrackerT2("stateSubmitted"),
          bg: "rgba(59,130,246,0.15)",
          color: "#93c5fd",
        },
        MONITORING: {
          label: _getTrackerT2("stateMonitoring"),
          bg: "rgba(168,85,247,0.2)",
          color: "#c084fc",
        },
        RETRY_SUBMIT: {
          label: _getTrackerT2("stateRetry"),
          bg: "rgba(249,115,22,0.2)",
          color: "#fb923c",
        },
        COMPLETED: {
          label: _getTrackerT2("stateCompleted"),
          bg: "rgba(34,197,94,0.2)",
          color: "#4ade80",
        },
        PARTIAL_FAIL: {
          label: _getTrackerT2("statePartialFail"),
          bg: "rgba(234,179,8,0.2)",
          color: "#facc15",
        },
        FAILED: {
          label: _getTrackerT2("stateFailed"),
          bg: "rgba(239,68,68,0.2)",
          color: "#f87171",
        },
        BLOCKED: {
          label: _getTrackerT2("stateFailed"),
          bg: "rgba(239,68,68,0.2)",
          color: "#f87171",
        },
        CANCELLED: {
          label: _getTrackerT2("stateCancelled"),
          bg: "rgba(107,114,128,0.2)",
          color: "#9ca3af",
        },
      };
    },
    _formatTime(ms) {
      if (!ms || ms < 0) return "00:00";
      var s = Math.floor(ms / 1e3);
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
    },
    _jobCounts: function (job) {
      var items = (job && job.items) || [];
      var cancelled = 0,
        partial = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].state === "CANCELLED") cancelled++;
        if (items[i].state === "PARTIAL_FAIL") partial++;
      }
      var success = Number(job && job.completed) || 0;
      var failed = Number(job && job.failed) || 0;
      return {
        success,
        failed,
        cancelled,
        partial,
        terminal: success + failed + cancelled,
      };
    },
    _allCounts: function (jobs) {
      var out = {
        success: 0,
        failed: 0,
        cancelled: 0,
        partial: 0,
        terminal: 0,
        items: 0,
      };
      (jobs || []).forEach(function (job) {
        var c = FloatingTracker._jobCounts(job);
        out.success += c.success;
        out.failed += c.failed;
        out.cancelled += c.cancelled;
        out.partial += c.partial;
        out.terminal += c.terminal;
        out.items += (job.items || []).length;
      });
      return out;
    },
    _escHtml(str) {
      if (str === null || str === void 0) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
    _create() {
      if (this._el && document.body.contains(this._el)) return;
      var existing = document.getElementById("tobyflow-flow-tracker");
      if (existing) existing.remove();
      this._el = null;
      var dlAttentionStyle = document.getElementById(
        "tobyflow-ft-download-attention-style",
      );
      if (!dlAttentionStyle) {
        dlAttentionStyle = document.createElement("style");
        dlAttentionStyle.id = "tobyflow-ft-download-attention-style";
        (document.head || document.documentElement).appendChild(
          dlAttentionStyle,
        );
      }
      dlAttentionStyle.textContent =
        "@keyframes tfDlArrow{0%,100%{transform:translateY(0)}45%{transform:translateY(2px)}}#tobyflow-flow-tracker button,#tobyflow-flow-tracker input,#tobyflow-flow-tracker select,#tobyflow-flow-tracker textarea{font-family:inherit;}.tobyflow-ft-dl-all.is-attention svg,.tobyflow-ft-dl-all.is-downloading svg{animation:tfDlArrow .82s ease-in-out infinite;}@media(prefers-reduced-motion:reduce){.tobyflow-ft-dl-all.is-attention svg,.tobyflow-ft-dl-all.is-downloading svg{animation:none!important;}}";
      var el = document.createElement("div");
      el.id = "tobyflow-flow-tracker";
      _ftAttachMediaErrorLog2(el, "tracker");
      el.style.cssText =
        'position:fixed;bottom:16px;right:16px;width:420px;background:linear-gradient(180deg, rgba(18,22,30,0.38), rgba(4,7,12,0.47)), linear-gradient(180deg, rgba(255,255,255,0.136), rgba(255,255,255,0.036));border:1px solid rgba(239,246,255,0.38);border-radius:18px;box-shadow:0 26px 62px rgba(0,0,0,0.21), 0 11px 26px rgba(0,0,0,0.13), inset 0 1px 0 rgba(255,255,255,0.43), inset 0 -1px 0 rgba(255,255,255,0.07);backdrop-filter:blur(22px) saturate(1.2) contrast(1.04);-webkit-backdrop-filter:blur(22px) saturate(1.2) contrast(1.04);z-index:2147483647;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:13px;color:#fff;display:none;overflow:hidden;';
      var header = document.createElement("div");
      header.style.cssText =
        "display:flex;align-items:center;gap:7px;padding:11px 14px 8px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.08);cursor:grab;user-select:none;";
      header.innerHTML =
        '<span class="tobyflow-ft-logo" style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:23px;height:23px;border-radius:7px;overflow:hidden;background:rgba(204,255,0,0.14);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccff00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span><span class="tobyflow-ft-title" style="font-weight:700;font-size:13px;letter-spacing:0.2px;">Pipeline</span><button class="tobyflow-ft-expand" type="button" data-ft-tip="' +
        _getTrackerT2("gridExpand") +
        '" aria-label="' +
        _getTrackerT2("gridExpand") +
        '" aria-busy="false" style="display:flex;width:24px;height:24px;background:rgba(255,255,255,0.08);border:none;border-radius:7px;color:rgba(255,255,255,0.6);cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button><span class="tobyflow-ft-mode" style="display:none;flex-shrink:0;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 7px;border-radius:20px;"></span><span style="flex:1;"></span><button class="tobyflow-ft-skip-blocker" type="button" data-ft-tip="' +
        _getTrackerT2("skipInteractionBlock") +
        '" aria-label="' +
        _getTrackerT2("skipInteractionBlock") +
        '" style="display:flex;width:24px;height:24px;background:rgba(204,255,0,0.14);border:none;border-radius:7px;color:#ccff00;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect x="3" y="11" width="18" height="10" rx="2"/></svg></button><button class="tobyflow-ft-toggle-all" type="button" data-ft-tip="' +
        _getTrackerT2("expandAllItems") +
        '" aria-label="' +
        _getTrackerT2("expandAllItems") +
        '" aria-pressed="false" disabled style="display:flex;width:24px;height:24px;background:rgba(255,255,255,0.08);border:none;border-radius:7px;color:rgba(255,255,255,0.72);cursor:default;align-items:center;justify-content:center;flex-shrink:0;opacity:.45;"><img src="' +
        chrome.runtime.getURL("icons/minimize.svg") +
        '" alt="" aria-hidden="true" style="width:14px;height:14px;display:block;filter:brightness(0) invert(1);opacity:.72;"></button><button class="tobyflow-ft-clear-all" type="button" data-ft-tip="' +
        _getTrackerT2("clearAllGrid") +
        '" aria-label="' +
        _getTrackerT2("clearAllGrid") +
        '" style="display:none;width:24px;height:24px;background:rgba(239,68,68,0.12);border:1px solid rgba(248,113,113,.22);border-radius:7px;color:#fca5a5;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg></button><button class="tobyflow-ft-dl-all" data-ft-tip="' +
        _getTrackerT2("downloadAll") +
        '" style="display:none;width:24px;height:24px;background:rgba(204,255,0,0.14);border:none;border-radius:7px;color:#ccff00;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button><button class="tobyflow-ft-pause-resume" type="button" style="display:none;width:24px;height:24px;background:rgba(255,255,255,0.08);border:none;border-radius:7px;color:rgba(255,255,255,0.72);cursor:pointer;align-items:center;justify-content:center;flex-shrink:0;"><svg class="tobyflow-ft-pr-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg><svg class="tobyflow-ft-pr-resume" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display:none;"><polygon points="8,5 19,12 8,19"/></svg></button><button class="tobyflow-ft-stop-all" title="' +
        _getTrackerT2("stopAll") +
        '" style="width:24px;height:24px;background:rgba(239,68,68,0.16);border:none;border-radius:7px;color:#f87171;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg></button><button class="tobyflow-ft-close" title="' +
        _getTrackerT2("closeTracker") +
        '" style="width:24px;height:24px;background:rgba(255,255,255,0.08);border:none;border-radius:7px;color:rgba(255,255,255,0.6);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      var headerMeta = document.createElement("div");
      headerMeta.className = "tobyflow-ft-header-meta";
      headerMeta.style.cssText =
        "display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0px;background:rgba(255,255,255,0.03);cursor:grab;user-select:none;min-height:16px;";
      headerMeta.innerHTML =
        '<span class="tobyflow-ft-counter" style="font-size:11px;opacity:0.75;font-variant-numeric:tabular-nums;white-space:nowrap;"></span><span class="tobyflow-ft-elapsed" style="font-size:10px;opacity:0.5;font-variant-numeric:tabular-nums;white-space:nowrap;padding-right:15px;"></span>';
      el.appendChild(header);
      el.appendChild(headerMeta);
      try {
        chrome.storage.local.get(["af_system_settings"], function (res) {
          var s = (res && res.af_system_settings) || {};
          var name = s.app_name,
            logo = s.app_logo_url;
          var titleEl = header.querySelector(".tobyflow-ft-title");
          if (name && titleEl) titleEl.textContent = name;
          var logoEl = header.querySelector(".tobyflow-ft-logo");
          if (logo && logoEl) {
            logoEl.style.background = "transparent";
            logoEl.innerHTML =
              '<img src="' +
              logo +
              '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
          }
        });
      } catch (_) {}
      var self2 = this;
      var _pauseResumeBtn = header.querySelector(".tobyflow-ft-pause-resume");
      if (_pauseResumeBtn)
        _pauseResumeBtn.addEventListener("click", function () {
          var jobId = _pauseResumeBtn.dataset.jobId;
          if (!jobId) return;
          self2._sendAction(
            _pauseResumeBtn.dataset.paused === "1"
              ? "pq:resumeJob"
              : "pq:pauseJob",
            { jobId },
          );
        });
      header
        .querySelector(".tobyflow-ft-stop-all")
        .addEventListener("click", function () {
          self2._sendAction("pq:stopAll", {
            stopSource: "FLOW_FLOATING_TRACKER_STOP_ALL",
          });
        });
      var _expandBtn = header.querySelector(".tobyflow-ft-expand");
      if (_expandBtn)
        _expandBtn.addEventListener("click", function (event) {
          event.stopPropagation();
          self2._openGrid({ userInitiated: true });
        });
      var _toggleAllBtn = header.querySelector(".tobyflow-ft-toggle-all");
      if (_toggleAllBtn)
        _toggleAllBtn.addEventListener("click", function () {
          self2._toggleAllJobs();
        });
      var _dlAllBtn = header.querySelector(".tobyflow-ft-dl-all");
      if (_dlAllBtn)
        _dlAllBtn.addEventListener("click", function () {
          if (_dlAllBtn.disabled) return;
          _dlAllBtn.dataset.attentionSeen =
            _dlAllBtn.dataset.attentionSig || "1";
          _dlAllBtn.classList.remove("is-attention");
          _dlAllBtn.classList.add("is-downloading");
          _dlAllBtn.disabled = true;
          _dlAllBtn.style.opacity = "0.5";
          Promise.resolve(self2._downloadAll())
            .catch(function () {})
            .then(function () {
              _dlAllBtn.classList.remove("is-downloading");
              _dlAllBtn.disabled = false;
              _dlAllBtn.style.opacity = "";
            });
        });
      var _clearAllBtn = header.querySelector(".tobyflow-ft-clear-all");
      if (_clearAllBtn)
        _clearAllBtn.addEventListener("click", function () {
          self2._clearAllGridHistory(_clearAllBtn);
        });
      header
        .querySelector(".tobyflow-ft-close")
        .addEventListener("click", function () {
          self2._stopAutoRefresh();
          self2._stopCompactElapsedTimer();
          self2._releaseCompactRows();
          self2._surfaceClosed = true;
          if (self2._el) self2._el.style.display = "none";
          self2._syncLauncherVisibility();
        });
      var _skipBtn = header.querySelector(".tobyflow-ft-skip-blocker");
      if (_skipBtn)
        _skipBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          var _manualRunId =
            ExecutionBlocker._activeBlockerRunId ||
            ExecutionBlocker._trackerBlockerRunId ||
            self2._lastData?.blockerRunId ||
            null;
          if (_manualRunId) {
            ExecutionBlocker._releasedBlockerRunIds.add(_manualRunId);
            while (ExecutionBlocker._releasedBlockerRunIds.size > 32) {
              ExecutionBlocker._releasedBlockerRunIds.delete(
                ExecutionBlocker._releasedBlockerRunIds.values().next().value,
              );
            }
            if (ExecutionBlocker._activeBlockerRunId === _manualRunId) {
              ExecutionBlocker._activeBlockerRunId = null;
            }
            if (ExecutionBlocker._trackerBlockerRunId === _manualRunId) {
              ExecutionBlocker._trackerBlockerRunId = null;
            }
          } else {
            ExecutionBlocker._stopReleased = true;
          }
          try {
            ExecutionBlocker.hide();
          } catch (_) {}
          try {
            if (typeof _endZoomSession === "function") _endZoomSession();
          } catch (_) {}
          try {
            ApiGenNotice.skipOverlay();
          } catch (_) {}
        });
      var progress = document.createElement("div");
      progress.style.cssText =
        "height:3px;background:rgba(255,255,255,0.06);overflow:hidden;";
      progress.innerHTML =
        '<div class="tobyflow-ft-progress-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#a3e635,#ccff00,#e2ff66);transform:scaleX(0);transform-origin:left;transition:transform 0.3s ease-out;will-change:transform;"></div>';
      el.appendChild(progress);
      if (!document.getElementById("tobyflow-ft-animations")) {
        var style = document.createElement("style");
        style.id = "tobyflow-ft-animations";
        style.textContent =
          "@keyframes tobyflow-pulse{0%,100%{opacity:1}50%{opacity:0.6}}@keyframes tobyflow-progress-glow{0%,100%{opacity:0.5}50%{opacity:1}}@keyframes tobyflow-spin{to{transform:rotate(360deg)}}.tobyflow-ft-progress-fill.active{animation:tobyflow-progress-glow 1.5s ease-in-out infinite}.tobyflow-ft-dot-pulse{animation:tobyflow-pulse 1.5s ease-in-out infinite}.tobyflow-ft-jobs::-webkit-scrollbar{width:4px}.tobyflow-ft-jobs::-webkit-scrollbar-track{background:transparent}.tobyflow-ft-jobs::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.18);border-radius:4px}.tobyflow-ft-jobs::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.32)}.tobyflow-ft-thumb{position:relative;width:42px;height:42px;border-radius:6px;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,0.06);}.tobyflow-ft-thumb img,.tobyflow-ft-thumb video{width:100%;height:100%;object-fit:cover;display:block;background:#0c1320;}.tobyflow-ft-thumb>.tf-skel{width:100%;height:100%;min-height:0;display:flex;align-items:center;justify-content:center;}.tobyflow-ft-thumb>.tf-skel>.tf-skel-ph{width:100%;height:100%;min-height:0;align-self:auto;display:flex;align-items:center;justify-content:center;}.tobyflow-ft-thumb-dl,.tobyflow-ft-thumb-view{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.48);opacity:0;transition:opacity 0.15s;cursor:pointer;}.tobyflow-ft-thumb:hover .tobyflow-ft-thumb-dl,.tobyflow-ft-thumb:hover .tobyflow-ft-thumb-view{opacity:1}.tobyflow-ft-item-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;border-radius:4px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.75);cursor:pointer;flex-shrink:0;transition:background 0.15s;}.tobyflow-ft-item-btn:hover{background:rgba(255,255,255,0.18);color:#fff}.tobyflow-ft-job-header button.tobyflow-ft-add-batch-ref{transition:filter .14s ease,transform .1s ease,box-shadow .14s ease;}.tobyflow-ft-job-header button.tobyflow-ft-add-batch-ref:not(:disabled):hover{background:linear-gradient(90deg,#ccff00,#eaff98)!important;color:#000!important;filter:brightness(1.08);box-shadow:0 3px 10px rgba(204,255,0,.25);transform:translateY(-1px);}.tobyflow-ft-job-header button.tobyflow-ft-add-batch-ref:not(:disabled):active{background:linear-gradient(90deg,#ccff00,#eaff98)!important;color:#000!important;filter:brightness(.95);transform:translateY(0) scale(.95);box-shadow:none;}.tobyflow-ft-job-header button.tobyflow-ft-add-batch-ref:focus-visible{outline:2px solid #ccff00;outline-offset:2px;}.tobyflow-ft-job-header button.tobyflow-ft-add-batch-ref:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none;}.tobyflow-ft-item-btn[disabled]{opacity:0.35;cursor:not-allowed}";
        document.head.appendChild(style);
      }
      var pipelineRow = document.createElement("div");
      pipelineRow.className = "tobyflow-ft-pipeline";
      pipelineRow.style.cssText =
        "display:none;padding:6px 12px;font-size:11px;color:rgba(255,255,255,0.7);border-bottom:1px solid rgba(255,255,255,0.06);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      el.appendChild(pipelineRow);
      var jobsWrap = document.createElement("div");
      jobsWrap.className = "tobyflow-ft-jobs";
      jobsWrap.style.cssText =
        "max-height:calc(100vh - 170px);overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.22) transparent;";
      el.appendChild(jobsWrap);
      var pauseNotice = document.createElement("div");
      pauseNotice.className = "tobyflow-ft-pause-notice";
      pauseNotice.style.cssText =
        "display:none;position:sticky;bottom:0;z-index:4;align-items:center;gap:9px;padding:10px 12px;background:linear-gradient(180deg,rgba(245,158,11,0.24),rgba(146,64,14,0.22)),rgba(10,13,19,0.96);border-top:1px solid rgba(253,224,71,0.42);box-shadow:0 -8px 22px rgba(0,0,0,0.24),inset 0 1px 0 rgba(255,255,255,0.16);backdrop-filter:blur(16px) saturate(1.25);-webkit-backdrop-filter:blur(16px) saturate(1.25);";
      pauseNotice.addEventListener("click", function (event) {
        var stop = event.target.closest("[data-ft-captcha-stop]");
        if (stop && stop.dataset.jobId) {
          if (stop.getAttribute("aria-busy") === "true") return;
          stop.setAttribute("aria-busy", "true");
          stop.disabled = true;
          var resumePeer = pauseNotice.querySelector(
            "[data-ft-captcha-resume]",
          );
          if (resumePeer) resumePeer.disabled = true;
          self2
            ._sendAction("pq:stopJob", {
              jobId: stop.dataset.jobId,
              stopSource: "FLOW_FLOATING_TRACKER_CAPTCHA_STOP",
            })
            .then(function (response) {
              if (response?.ok === true) {
                pauseNotice.style.display = "none";
                pauseNotice.innerHTML = "";
              }
            })
            .finally(function () {
              if (!stop.isConnected) return;
              stop.removeAttribute("aria-busy");
              stop.disabled = false;
              if (resumePeer?.isConnected) resumePeer.disabled = false;
            });
          return;
        }
        var resume = event.target.closest("[data-ft-captcha-resume]");
        if (!resume || !resume.dataset.jobId) return;
        self2._sendAction("pq:resumeJob", { jobId: resume.dataset.jobId });
      });
      el.appendChild(pauseNotice);
      document.body.appendChild(el);
      this._el = el;
      this._ensureLauncher();
      try {
        _injectTrackerHoverStyles();
      } catch (_) {}
      this._makeDraggable(el, header);
      this._makeDraggable(el, headerMeta);
      if (this._dragPos) {
        el.style.left = this._dragPos.left + "px";
        el.style.top = this._dragPos.top + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
      }
      this._setupJobsDelegation(jobsWrap);
    },
    _ensureLauncher: function () {
      if (this._launcherEl && document.body.contains(this._launcherEl))
        return this._launcherEl;
      document.getElementById("tobyflow-ft-launcher")?.remove();
      var button = document.createElement("button");
      button.id = "tobyflow-ft-launcher";
      button.type = "button";
      button.title = _getTrackerT2("openTracker");
      button.setAttribute("aria-label", _getTrackerT2("openTracker"));
      button.style.cssText =
        "position:fixed;right:16px;bottom:16px;width:42px;height:42px;display:none;align-items:center;justify-content:center;border:0;border-radius:13px;background:linear-gradient(90deg,rgb(204,255,0) 0%,rgb(234 255 152) 100%);color:#292929;cursor:pointer;z-index:2147483647;box-shadow:0 8px 22px rgba(0,0,0,.24);transition:transform .15s ease,box-shadow .15s ease;";
      var fallbackLogo = "";
      try {
        fallbackLogo = chrome.runtime.getURL("icons/icon-48.png");
      } catch (_) {}
      var logo = document.createElement("img");
      logo.className = "tobyflow-ft-launcher-logo";
      logo.alt = "";
      logo.setAttribute("aria-hidden", "true");
      logo.style.cssText =
        "width:24px;height:24px;border-radius:7px;object-fit:cover;display:block;";
      logo.dataset.fallbackSrc = fallbackLogo;
      if (fallbackLogo) logo.src = fallbackLogo;
      logo.addEventListener("error", function () {
        if (logo.dataset.fallbackSrc && logo.src !== logo.dataset.fallbackSrc)
          logo.src = logo.dataset.fallbackSrc;
      });
      button.appendChild(logo);
      button.addEventListener("mouseenter", function () {
        button.style.transform = "translateY(-2px)";
        button.style.boxShadow = "0 12px 28px rgba(0,0,0,.3)";
      });
      button.addEventListener("mouseleave", function () {
        button.style.transform = "";
        button.style.boxShadow = "0 8px 22px rgba(0,0,0,.24)";
      });
      var self2 = this;
      button.addEventListener("click", function () {
        try {
          chrome.runtime.sendMessage(
            { action: "flow:openSidebar" },
            function () {
              void chrome.runtime.lastError;
            },
          );
        } catch (_) {}
        self2._surfaceClosed = false;
        button.style.display = "none";
        if (self2._lastData) {
          _origUpdate.call(self2, self2._lastData);
          if (self2._lastData.isRunning) self2._startAutoRefresh();
        } else {
          self2._create();
          self2._el.style.display = "block";
        }
      });
      document.body.appendChild(button);
      this._launcherEl = button;
      try {
        var self3 = this;
        chrome.storage.local.get(["af_system_settings"], function (res) {
          self3._applyLauncherBrand(res && res.af_system_settings);
        });
      } catch (_) {}
      return button;
    },
    _applyLauncherBrand: function (settings) {
      var logo = this._launcherEl?.querySelector?.(
        ".tobyflow-ft-launcher-logo",
      );
      var logoUrl = settings && settings.app_logo_url;
      if (!logo) return;
      logo.src = logoUrl || logo.dataset.fallbackSrc || "";
    },
    _syncLauncherVisibility: function () {
      var launcher = this._ensureLauncher();
      var trackerVisible = !!(
        this._el &&
        this._el.isConnected &&
        this._el.style.display !== "none"
      );
      launcher.style.display = trackerVisible ? "none" : "flex";
    },
    _makeDraggable: function (el, handle) {
      var self2 = this;
      handle.addEventListener("mousedown", function (e) {
        if (e.target.closest("button") || e.target.closest("[data-action]"))
          return;
        var r = el.getBoundingClientRect();
        el.style.left = r.left + "px";
        el.style.top = r.top + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
        var sx = e.clientX,
          sy = e.clientY,
          ox = r.left,
          oy = r.top;
        e.preventDefault();
        function move(ev) {
          var nx = Math.max(
            0,
            Math.min(
              ox + (ev.clientX - sx),
              window.innerWidth - el.offsetWidth,
            ),
          );
          var ny = Math.max(
            0,
            Math.min(
              oy + (ev.clientY - sy),
              window.innerHeight - el.offsetHeight,
            ),
          );
          el.style.left = nx + "px";
          el.style.top = ny + "px";
          self2._dragPos = { left: nx, top: ny };
        }
        function up() {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
        }
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    },
    _setupJobsDelegation(container) {
      var self2 = this;
      container.addEventListener("click", function (e) {
        var thumbViewEl = e.target.closest("[data-thumb-view]");
        if (thumbViewEl) {
          e.stopPropagation();
          var vItem = self2._findItem(
            thumbViewEl.getAttribute("data-job-id"),
            thumbViewEl.getAttribute("data-item-id"),
          );
          if (vItem)
            self2._openViewOverlay(self2._itemResultsOf(vItem), 0, vItem);
          return;
        }
        var itemDlEl = e.target.closest("[data-item-dl]");
        if (itemDlEl) {
          e.stopPropagation();
          if (itemDlEl.disabled) return;
          var dItem = self2._findItem(
            itemDlEl.getAttribute("data-job-id"),
            itemDlEl.getAttribute("data-item-id"),
          );
          if (dItem) {
            itemDlEl.disabled = true;
            Promise.resolve(self2._downloadItem(dItem))
              .catch(function (error) {
                console.error(
                  "[FloatingTracker/download] compact item click failed:",
                  (error && error.message) || error,
                );
                self2._showTrackerNotice(
                  "Download: " +
                    ((error && error.message) || "DOWNLOAD_FAILED"),
                  true,
                );
              })
              .then(function () {
                itemDlEl.disabled = false;
              });
          }
          return;
        }
        var itemRemoveEl = e.target.closest("[data-item-remove]");
        if (itemRemoveEl) {
          e.stopPropagation();
          if (itemRemoveEl.disabled) return;
          self2._removeCompactItem(itemRemoveEl).catch(function (error) {
            self2._showTrackerNotice(
              error?.message || "REMOVE_ITEM_FAILED",
              true,
            );
          });
          return;
        }
        var itemResumeEl = e.target.closest("[data-item-resume]");
        if (itemResumeEl) {
          e.stopPropagation();
          if (
            itemResumeEl.disabled ||
            itemResumeEl.getAttribute("aria-busy") === "true"
          )
            return;
          var resumeDisplayJob = (self2._lastData?.jobs || []).find(
            function (job) {
              return job.id === itemResumeEl.getAttribute("data-job-id");
            },
          );
          var resumeItem = resumeDisplayJob?.items?.find(function (item) {
            return item.id === itemResumeEl.getAttribute("data-item-id");
          });
          var itemJobId = self2._resumeJobIdForItem(
            resumeItem,
            resumeDisplayJob,
          );
          if (!itemJobId) return;
          itemResumeEl.setAttribute("aria-busy", "true");
          itemResumeEl.disabled = true;
          self2
            ._sendAction("pq:resumeJob", { jobId: itemJobId })
            .finally(function () {
              if (!itemResumeEl.isConnected) return;
              itemResumeEl.removeAttribute("aria-busy");
              itemResumeEl.disabled = false;
            });
          return;
        }
        var clearBatchEl = e.target.closest("[data-job-clear]");
        if (clearBatchEl) {
          e.stopPropagation();
          if (clearBatchEl.disabled) return;
          var clearId = clearBatchEl.getAttribute("data-job-clear");
          var clearVm = self2._compactBatchRemovalTarget(clearId);
          if (!clearVm) {
            self2._showTrackerNotice("BATCH_NOT_FOUND", true);
            return;
          }
          self2
            ._removeBatchHistory(clearVm, null, clearBatchEl)
            .catch(function (error) {
              self2._showTrackerNotice(
                error?.message || "BATCH_REMOVE_FAILED",
                true,
              );
            });
          return;
        }
        var batchRefEl = e.target.closest("[data-job-add-ref]");
        if (batchRefEl) {
          e.stopPropagation();
          var refView = self2._gridViewModel(self2._lastData || {});
          var refVm = (refView.sessions || [])
            .flatMap((session) => session.jobs || [])
            .find(
              (job) =>
                String(job.id) === batchRefEl.getAttribute("data-job-add-ref"),
            );
          self2._addBatchReferences(refVm, batchRefEl);
          return;
        }
        var batchDlEl = e.target.closest("[data-job-download]");
        if (batchDlEl) {
          e.stopPropagation();
          if (batchDlEl.disabled) return;
          var batchJobId = batchDlEl.getAttribute("data-job-download");
          var view = self2._gridViewModel(self2._lastData || {});
          var batchVm = null;
          (view.sessions || []).some(function (session) {
            batchVm =
              (session.jobs || []).find(function (job) {
                return String(job.id) === String(batchJobId);
              }) || null;
            return !!batchVm;
          });
          if (batchVm) self2._downloadBatch(batchVm, batchDlEl);
          return;
        }
        var batchRegenEl = e.target.closest("[data-job-regen-retryable]");
        if (batchRegenEl) {
          e.stopPropagation();
          if (batchRegenEl.disabled || !self2._isPipelineIdle()) return;
          var regenJobId = batchRegenEl.getAttribute(
            "data-job-regen-retryable",
          );
          var regenView = self2._gridViewModel(self2._lastData || {});
          var regenVm = null;
          (regenView.sessions || []).some(function (session) {
            regenVm =
              (session.jobs || []).find(function (job) {
                return String(job.id) === String(regenJobId);
              }) || null;
            return !!regenVm;
          });
          if (regenVm) void self2._regenBatchFailed(regenVm, batchRegenEl);
          return;
        }
        var regenEl = e.target.closest("[data-item-regen]");
        if (regenEl) {
          e.stopPropagation();
          if (regenEl.disabled) return;
          var _rJob = regenEl.getAttribute("data-job-id"),
            _rItem = regenEl.getAttribute("data-item-id");
          if (
            !self2._canRegenPromptItem(
              self2._findItem(_rJob, _rItem),
              (self2._lastData?.jobs || []).find(function (job) {
                return job.id === _rJob;
              }),
            )
          )
            return;
          self2._requestRegen(
            regenEl,
            _rJob,
            _rItem,
            self2._findItem(_rJob, _rItem),
            null,
          );
          return;
        }
        var actionEl = e.target.closest("[data-action]");
        if (actionEl) {
          e.stopPropagation();
          var action = actionEl.getAttribute("data-action");
          var jobId = actionEl.getAttribute("data-job-id");
          var displayJob = (self2._lastData?.jobs || []).find(function (job) {
            return job.id === jobId;
          });
          if (
            (action === "resume" || action === "pause") &&
            displayJob?.manualRegenActive
          )
            jobId = displayJob.manualRegenJobId;
          else if (displayJob?.executionJobId)
            jobId = displayJob.executionJobId;
          if (action === "stop")
            self2._sendAction("pq:stopJob", {
              jobId,
              stopSource: "FLOW_FLOATING_TRACKER_JOB_STOP",
            });
          else if (action === "pause")
            self2._sendAction("pq:pauseJob", { jobId });
          else if (action === "resume") {
            if (actionEl.getAttribute("aria-busy") === "true") return;
            var resumeOriginalHtml = actionEl.innerHTML;
            actionEl.setAttribute("aria-busy", "true");
            actionEl.disabled = true;
            actionEl.style.opacity = "0.7";
            actionEl.innerHTML =
              '<span style="width:11px;height:11px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:tobyflow-spin .8s linear infinite;display:block;flex-shrink:0;"></span>' +
              _getTrackerT2("resume");
            self2._showTrackerNotice(_getTrackerT2("resumeChecking"), false);
            self2._sendAction("pq:resumeJob", { jobId }).finally(function () {
              if (!actionEl.isConnected) return;
              actionEl.removeAttribute("aria-busy");
              actionEl.disabled = false;
              actionEl.style.opacity = "";
              actionEl.innerHTML = resumeOriginalHtml;
            });
          } else if (action === "skip") {
            if (window.__ftMarkManualSkip) window.__ftMarkManualSkip();
          }
          return;
        }
        var headerEl = e.target.closest("[data-job-toggle]");
        if (headerEl) {
          var toggleJobId = headerEl.getAttribute("data-job-toggle");
          if (self2._expandedJobs.has(toggleJobId)) {
            self2._expandedJobs.delete(toggleJobId);
            self2._manuallyCollapsed.add(toggleJobId);
            self2._manuallyExpanded.delete(toggleJobId);
          } else {
            self2._expandedJobs.add(toggleJobId);
            self2._manuallyCollapsed.delete(toggleJobId);
            self2._manuallyExpanded.add(toggleJobId);
          }
          if (self2._lastData) self2._renderJobs(self2._lastData.jobs || []);
        }
      });
    },
    _toggleAllJobs(userInitiated = true) {
      var jobs = (this._lastData && this._lastData.jobs) || [];
      if (!jobs.length) return;
      var shouldCollapse = !this._allJobsCollapsed;
      this._allJobsCollapsed = shouldCollapse;
      if (userInitiated) this._allJobsUserTouched = true;
      for (var i = 0; i < jobs.length; i++) {
        var id = jobs[i].id;
        if (shouldCollapse) {
          this._expandedJobs.delete(id);
          this._manuallyCollapsed.add(id);
          this._manuallyExpanded.delete(id);
        } else {
          this._expandedJobs.add(id);
          this._manuallyCollapsed.delete(id);
          this._manuallyExpanded.add(id);
          this._autoCollapsedDone.add(id);
        }
      }
      this._lastJobsRenderSig = null;
      this._renderJobs(jobs);
    },
    _syncToggleAllButton(jobs) {
      if (!this._el) return;
      var btn = this._el.querySelector(".tobyflow-ft-toggle-all");
      if (!btn) return;
      var hasJobs = Array.isArray(jobs) && jobs.length > 0;
      btn.style.display = "flex";
      btn.disabled = !hasJobs;
      btn.setAttribute("aria-disabled", hasJobs ? "false" : "true");
      btn.style.opacity = hasJobs ? "" : ".45";
      btn.style.cursor = hasJobs ? "pointer" : "default";
      var anyExpanded = hasJobs && !this._allJobsCollapsed;
      var key = anyExpanded ? "collapseAllItems" : "expandAllItems";
      var label = _getTrackerT2(key);
      btn.setAttribute("data-ft-tip", label);
      btn.setAttribute("aria-label", label);
      btn.setAttribute("aria-pressed", anyExpanded ? "true" : "false");
      btn.innerHTML = anyExpanded
        ? '<img src="' +
          chrome.runtime.getURL("icons/minimize.svg") +
          '" alt="" aria-hidden="true" style="width:14px;height:14px;display:block;filter:brightness(0) invert(1);opacity:.72;">'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform 0.2s;transform:rotate(180deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    },
    _syncHeaderPauseResume: function (jobs) {
      if (!this._el) return;
      var button = this._el.querySelector(".tobyflow-ft-pause-resume");
      if (!button) return;
      var self2 = this;
      var job = (jobs || []).find(function (candidate) {
        return (
          candidate.owner === "prompts" &&
          !candidate.recoveryRequired &&
          (!candidate.manualRegenBatchPending || candidate.manualRegenActive) &&
          self2._hasJobExecutionWork(candidate)
        );
      });
      if (!job) {
        button.style.display = "none";
        delete button.dataset.jobId;
        delete button.dataset.paused;
        return;
      }
      var paused = job.manualRegenActive
        ? job.manualRegenStatus === "paused"
        : job.status === "paused";
      var label = _getTrackerT2(paused ? "resume" : "pause");
      button.dataset.jobId = job.manualRegenActive
        ? job.manualRegenJobId
        : job.executionJobId || job.id;
      button.dataset.paused = paused ? "1" : "0";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("data-ft-tip", label);
      button.style.display = "flex";
      button.style.background = paused
        ? "rgba(34,197,94,0.2)"
        : "rgba(255,255,255,0.08)";
      button.style.color = paused ? "#4ade80" : "rgba(255,255,255,0.72)";
      button.querySelector(".tobyflow-ft-pr-pause").style.display = paused
        ? "none"
        : "";
      button.querySelector(".tobyflow-ft-pr-resume").style.display = paused
        ? ""
        : "none";
    },
    _syncPauseNotice: function (jobs) {
      if (!this._el) return;
      var notice = this._el.querySelector(".tobyflow-ft-pause-notice");
      if (!notice) return;
      var self2 = this;
      var captchaJob = (jobs || []).find(function (job) {
        return (
          job.owner === "prompts" &&
          job.status === "paused" &&
          ["captcha", "api_unusual_activity"].indexOf(job.pauseReason) >= 0 &&
          self2._hasJobExecutionWork(job)
        );
      });
      if (!captchaJob) {
        notice.style.display = "none";
        notice.innerHTML = "";
        return;
      }
      var jobId = captchaJob.executionJobId || captchaJob.id;
      var resumeJobId = captchaJob.manualRegenActive
        ? captchaJob.manualRegenJobId
        : jobId;
      notice.style.display = "flex";
      notice.innerHTML =
        '<svg viewBox="0 0 24 24" fill="#fbbf24" aria-hidden="true" style="width:18px;height:18px;flex-shrink:0;"><path d="M12 3 2.7 20h18.6L12 3Zm1 13h-2v-2h2v2Zm0-4h-2V8h2v4Z"/></svg><div style="flex:1;min-width:0;font-size:10.5px;line-height:1.4;color:#fde68a;"><strong style="display:block;color:#fcd34d;margin-bottom:1px;">' +
        self2._escHtml(_getTrackerT2("captchaPausedTitle")) +
        "</strong>" +
        self2._escHtml(_getTrackerT2("captchaPausedDesc")) +
        '<div style="margin-top:4px;">' +
        self2._escHtml(_getTrackerT2("botCookieHint")) +
        '</div></div><div style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><button type="button" data-ft-captcha-stop="1" data-job-id="' +
        self2._escHtml(jobId) +
        '" aria-label="' +
        self2._escHtml(_getTrackerT2("stop")) +
        '" data-ft-tip="' +
        self2._escHtml(_getTrackerT2("stop")) +
        '" style="flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 9px;background:rgba(239,68,68,0.18);border:1px solid rgba(248,113,113,0.48);border-radius:8px;color:#fecaca;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:12px;height:12px;"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>' +
        self2._escHtml(_getTrackerT2("stop")) +
        '</button><button type="button" data-ft-captcha-resume="1" data-job-id="' +
        self2._escHtml(resumeJobId) +
        '" aria-label="' +
        self2._escHtml(_getTrackerT2("resume")) +
        '" data-ft-tip="' +
        self2._escHtml(_getTrackerT2("resume")) +
        '" style="flex-shrink:0;display:flex;align-items:center;gap:5px;padding:7px 10px;background:linear-gradient(135deg,#2ee06c,#16a34a);border:1px solid rgba(255,255,255,0.22);border-radius:8px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 3px 12px rgba(22,163,74,0.38);"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:13px;height:13px;"><polygon points="8,5 19,12 8,19"/></svg>' +
        self2._escHtml(_getTrackerT2("resume")) +
        "</button></div>";
    },
    _updateModeBadge: function (jobs) {
      var badge = this._el && this._el.querySelector(".tobyflow-ft-mode");
      if (!badge) return;
      var job =
        (jobs || []).find(function (j) {
          return j.status === "running" || j.status === "paused";
        }) || (jobs || [])[0];
      if (!job) {
        badge.style.display = "none";
        return;
      }
      var isManual = !!(job.settings && job.settings.manualSubmitMode);
      var waiting =
        isManual &&
        (job.items || []).some(function (it) {
          return it.state === "WAITING_USER";
        });
      badge.style.display = "inline-flex";
      if (isManual) {
        badge.style.background = "rgba(234,179,8,0.2)";
        badge.style.color = "#eab308";
        badge.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h6a3 3 0 0 1 3 3v1"/><polyline points="12 7 9 10 12 13"/></svg><span>' +
          _getTrackerT2("modeManual") +
          "</span>";
        badge.classList.toggle("tobyflow-ft-dot-pulse", waiting);
      } else {
        badge.style.background = "rgba(59,130,246,0.2)";
        badge.style.color = "#60a5fa";
        badge.innerHTML =
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>' +
          _getTrackerT2("modeAuto") +
          "</span>";
        badge.classList.remove("tobyflow-ft-dot-pulse");
      }
    },
    update(data) {
      if (this._surfaceClosed) {
        this._stopAutoRefresh();
        this._stopCompactElapsedTimer();
        this._releaseCompactRows();
        return;
      }
      this._create();
      if (!data) return;
      clearTimeout(this._hideTimer);
      var el = this._el;
      var completed = data.completed || 0;
      var total = data.total || 0;
      var isRunning2 = data.isRunning;
      var jobs = data.jobs || [];
      this._syncHeaderPauseResume(jobs);
      this._syncPauseNotice(jobs);
      if (!isRunning2 || total === 0) {
        this._stopAutoRefresh();
        var terminalCounts = this._allCounts(jobs);
        if (terminalCounts.items > 0) {
          el.style.display = "block";
          var terminalTotal = total || terminalCounts.items;
          var doneText =
            terminalCounts.success + " " + _getTrackerT2("successCount");
          if (terminalCounts.failed > 0)
            doneText +=
              " \u2022 " +
              terminalCounts.failed +
              " " +
              _getTrackerT2("failed");
          el.querySelector(".tobyflow-ft-counter").textContent = doneText;
          var progressFill = el.querySelector(".tobyflow-ft-progress-fill");
          progressFill.style.transform =
            "scaleX(" +
            Math.min(1, terminalCounts.terminal / Math.max(1, terminalTotal)) +
            ")";
          progressFill.classList.remove("active");
          el.querySelector(".tobyflow-ft-elapsed").textContent = "";
          var stopBtn = el.querySelector(".tobyflow-ft-stop-all");
          if (stopBtn) stopBtn.style.display = "none";
          var modeBadge = el.querySelector(".tobyflow-ft-mode");
          if (modeBadge) modeBadge.style.display = "none";
          var pRow = el.querySelector(".tobyflow-ft-pipeline");
          if (pRow) pRow.style.display = "none";
          for (var di = 0; di < jobs.length; di++) {
            var terminalJob = jobs[di];
            if (!this._manuallyCollapsed.has(terminalJob.id)) {
              this._expandedJobs.add(terminalJob.id);
            }
            this._autoCollapsedDone.add(terminalJob.id);
          }
          this._renderJobs(jobs);
        } else {
          var _active = [
            "PENDING",
            "SUBMITTING",
            "SUBMITTED",
            "MONITORING",
            "RETRY_SUBMIT",
            "WAITING_USER",
            "WAITING_PROVIDER",
            "RECOVERY_REQUIRED",
          ];
          var _hasActive = jobs.some(function (j) {
            return (j.items || []).some(function (it) {
              return _active.indexOf(it.state) >= 0;
            });
          });
          if (_hasActive) {
            el.style.display = "block";
            this._renderJobs(jobs);
          } else this.hide();
        }
        return;
      }
      el.style.display = "block";
      var stopBtn = el.querySelector(".tobyflow-ft-stop-all");
      if (stopBtn) stopBtn.style.display = "";
      this._updateModeBadge(jobs);
      var runningCounts = this._allCounts(jobs);
      var pct =
        total > 0 ? Math.round((runningCounts.terminal / total) * 100) : 0;
      var submitted =
        (data.pipeline &&
          data.pipeline.editor &&
          data.pipeline.editor.processedCount) ||
        0;
      if (submitted < completed) submitted = completed;
      var counterText;
      if (submitted > 0 && submitted < total) {
        counterText =
          completed +
          "/" +
          submitted +
          " \u2713 \u2022 " +
          total +
          " " +
          _getTrackerT2("total");
      } else {
        counterText = completed + "/" + total;
      }
      if (runningCounts.failed > 0)
        counterText +=
          " \u2022 " + runningCounts.failed + " " + _getTrackerT2("failed");
      el.querySelector(".tobyflow-ft-counter").textContent = counterText;
      var progressFill = el.querySelector(".tobyflow-ft-progress-fill");
      progressFill.style.transform = "scaleX(" + pct / 100 + ")";
      progressFill.classList.add("active");
      el.querySelector(".tobyflow-ft-elapsed").textContent = this._formatTime(
        data.elapsed,
      );
      this._renderPipelineRow(data.pipeline, jobs);
      this._scanTileProgress(jobs);
      this._renderJobs(jobs);
      this._startAutoRefresh();
    },
    _startAutoRefresh() {
      if (
        this._surfaceClosed ||
        !this._needsTileProgressRefresh(this._lastData?.jobs || [])
      ) {
        this._stopAutoRefresh();
        return;
      }
      if (this._autoRefreshInterval) return;
      var self2 = this;
      this._autoRefreshInterval = setInterval(function () {
        if (
          self2._surfaceClosed ||
          !self2._lastData ||
          !self2._lastData.isRunning ||
          !self2._needsTileProgressRefresh(self2._lastData.jobs || [])
        ) {
          self2._stopAutoRefresh();
          return;
        }
        var jobs = self2._lastData.jobs || [];
        self2._scanTileProgress(jobs);
        self2._renderJobs(jobs);
      }, this._AUTO_REFRESH_MS);
    },
    _needsTileProgressRefresh(jobs) {
      if (!Array.isArray(jobs)) return false;
      for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        if (typeof job?.id === "string" && job.id.startsWith("_legacy_"))
          return true;
        for (var k = 0; k < (job?.items || []).length; k++) {
          var item = job.items[k];
          if (
            item.genMode !== "api" &&
            item.state === "MONITORING" &&
            Array.isArray(item.preTileIds)
          )
            return true;
        }
      }
      return false;
    },
    _stopAutoRefresh() {
      if (this._autoRefreshInterval) {
        clearInterval(this._autoRefreshInterval);
        this._autoRefreshInterval = null;
      }
    },
    _scanTileProgress(jobs) {
      var cache = {};
      if (!jobs) {
        this._tileProgressCache = cache;
        return;
      }
      try {
        var monitoringItems = [];
        var activeWebItems = [];
        var isLegacyMode = false;
        for (var i = 0; i < jobs.length; i++) {
          var j = jobs[i];
          if (j.id && typeof j.id === "string" && j.id.startsWith("_legacy_")) {
            isLegacyMode = true;
          }
          if (!j.items) continue;
          for (var k = 0; k < j.items.length; k++) {
            var it = j.items[k];
            if (
              it.genMode !== "api" &&
              ["SUBMITTING", "SUBMITTED", "MONITORING", "RETRY_SUBMIT"].indexOf(
                it.state,
              ) >= 0
            ) {
              activeWebItems.push(it);
            }
            if (
              it.genMode === "api" ||
              it.state !== "MONITORING" ||
              !it.preTileIds
            )
              continue;
            monitoringItems.push(it);
          }
        }
        if (monitoringItems.length === 0 && !isLegacyMode) {
          this._tileProgressCache = cache;
          return;
        }
        var allTiles = _getCachedTiles();
        if (monitoringItems.length === 0 && isLegacyMode) {
          var maxProgress = null;
          for (var lt = 0; lt < allTiles.length; lt++) {
            var ltEl = allTiles[lt];
            var ltStatus =
              typeof detectTileStatus === "function"
                ? detectTileStatus(ltEl)
                : null;
            if (ltStatus !== "processing") continue;
            var ltPct =
              typeof extractTileProgress === "function"
                ? extractTileProgress(ltEl)
                : null;
            if (
              ltPct !== null &&
              (maxProgress === null || ltPct > maxProgress)
            ) {
              maxProgress = ltPct;
            }
          }
          if (maxProgress !== null) {
            cache._legacy = maxProgress;
          }
          this._tileProgressCache = cache;
          return;
        }
        var tilesWithProgress = [];
        for (var t = 0; t < allTiles.length; t++) {
          var tileEl = allTiles[t];
          var tid =
            typeof _getTileRuntimeId === "function"
              ? _getTileRuntimeId(tileEl)
              : tileEl.getAttribute("data-tile-id") ||
                tileEl.getAttribute("data-media-id") ||
                tileEl
                  .querySelector("[data-media-id]")
                  ?.getAttribute("data-media-id");
          if (
            !tid ||
            monitoringItems.every(function (item) {
              return item.preTileIds.indexOf(tid) >= 0;
            })
          )
            continue;
          var pct =
            typeof extractTileProgress === "function"
              ? extractTileProgress(tileEl)
              : null;
          if (pct !== null) {
            tilesWithProgress.push({
              tileId: tid,
              progress: pct,
              identities: [tid].concat(
                typeof extractAllFileNames === "function"
                  ? extractAllFileNames(tileEl)
                  : [],
              ),
            });
          }
        }
        if (tilesWithProgress.length === 0) {
          this._tileProgressCache = cache;
          return;
        }
        var parallelProgress = activeWebItems.length > 1;
        var isDurableProgressIdentity = function (value) {
          var id = String(value || "");
          return (
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id,
            ) || /^AB-[A-Za-z0-9_-]{37,}$/.test(id)
          );
        };
        for (var p = 0; p < tilesWithProgress.length; p++) {
          var pt = tilesWithProgress[p];
          var owners = monitoringItems.filter(function (item) {
            return (item.progressTileIds || []).some(function (id) {
              return (
                pt.identities.includes(id) &&
                (!parallelProgress || isDurableProgressIdentity(id))
              );
            });
          });
          if (!owners.length && !parallelProgress)
            owners = monitoringItems.filter(function (item) {
              return (
                !(item.progressTileIds || []).length &&
                item.preTileIds.indexOf(pt.tileId) < 0
              );
            });
          if (owners.length !== 1) continue;
          var owner = owners[0];
          if (Object.prototype.hasOwnProperty.call(cache, owner.id))
            cache[owner.id] = null;
          else cache[owner.id] = pt.progress;
        }
      } catch (e) {}
      this._tileProgressCache = cache;
    },
    setChunkStatus(data) {
      if (!data || !data.phase) return;
      try {
        var activeProject =
          (self2.getCurrentProjectId && self2.getCurrentProjectId()) || null;
        if (activeProject && data.projectId && activeProject !== data.projectId)
          return;
      } catch (_) {}
      if (this._chunkResumedTimer) {
        clearTimeout(this._chunkResumedTimer);
        this._chunkResumedTimer = null;
      }
      if (data.phase === "cancelled") {
        this._chunkStatus = null;
      } else {
        this._chunkStatus = data;
      }
      if (data.phase === "resumed") {
        var self2 = this;
        this._chunkResumedTimer = setTimeout(function () {
          self2._chunkStatus = null;
          if (self2._el && self2._lastData) self2.update(self2._lastData);
        }, 3e3);
      }
      if (this._el && this._lastData) {
        this.update(this._lastData);
      }
    },
    _renderPipelineRow(pipeline, jobs) {
      var row = this._el.querySelector(".tobyflow-ft-pipeline");
      if (!pipeline) {
        row.style.display = "none";
        return;
      }
      var sent = (pipeline.editor && pipeline.editor.processedCount) || 0;
      var tm = pipeline.tileMonitor || {};
      var active = tm.activeCount || 0;
      var claiming = tm.claimingCount;
      if (typeof claiming !== "number") claiming = active;
      var waiting = tm.waitingCount;
      if (typeof waiting !== "number") waiting = 0;
      var done = tm.completedCount || 0;
      var failed = tm.failedCount || 0;
      var stagnant = !!tm.stagnant;
      var apiActive = 0,
        apiWaiting = 0,
        apiDone = 0,
        apiFailed = 0;
      (jobs || []).forEach(function (job) {
        (job.items || []).forEach(function (item) {
          if (item.genMode !== "api") return;
          if (item.apiWaiting) apiWaiting++;
          else if (
            [
              "SUBMITTING",
              "SUBMITTED",
              "MONITORING",
              "RETRY_SUBMIT",
              "WAITING_PROVIDER",
              "RECOVERY_REQUIRED",
            ].indexOf(item.state) >= 0
          )
            apiActive++;
          else if (item.state === "COMPLETED" || item.state === "PARTIAL_FAIL")
            apiDone++;
          else if (item.state === "FAILED") apiFailed++;
        });
      });
      claiming += apiActive;
      waiting += apiWaiting;
      done += apiDone;
      failed += apiFailed;
      var dl = pipeline.download || {};
      var dlQueue = dl.queueLength || 0;
      var dlDone = dl.completedCount || 0;
      var dlState = dl.state || "idle";
      var hasDlActivity =
        dlQueue > 0 || dlDone > 0 || dlState === "downloading";
      var hasChunkStatus = !!(this._chunkStatus && this._chunkStatus.phase);
      if (
        sent === 0 &&
        active === 0 &&
        done === 0 &&
        failed === 0 &&
        !hasDlActivity &&
        !hasChunkStatus
      ) {
        row.style.display = "none";
        row.style.background = "";
        row.style.borderLeft = "";
        return;
      }
      var sep = '<span style="opacity:0.3;margin:0 5px;">\u2022</span>';
      var failedColor = failed > 0 ? "#f87171" : "rgba(255,255,255,0.35)";
      var waitColor = waiting > 0 ? "#fbbf24" : "rgba(255,255,255,0.35)";
      var claimColor = claiming > 0 ? "#c084fc" : "rgba(255,255,255,0.35)";
      var stagnantPrefix = stagnant
        ? '<span style="color:#fb923c;font-weight:600;margin-right:6px;" title="' +
          this._escHtml(_getTrackerT2("flowSlow")) +
          '">\u26A0\uFE0F</span>'
        : "";
      var chunkBanner = "";
      if (this._chunkStatus && this._chunkStatus.phase) {
        var cs = this._chunkStatus;
        var chunkIcon, chunkLabel, chunkColor;
        if (cs.phase === "draining") {
          chunkIcon = "\u23F3";
          chunkLabel = _getTrackerT2("chunkDraining");
          if (typeof cs.remaining === "number" && cs.remaining > 0) {
            chunkLabel = chunkLabel + " (" + cs.remaining + ")";
          }
          chunkColor = "#60a5fa";
        } else if (cs.phase === "reloading") {
          chunkIcon = "\u{1F504}";
          chunkLabel = _getTrackerT2("chunkReloading");
          chunkColor = "#a78bfa";
        } else if (cs.phase === "resumed") {
          chunkIcon = "\u2713";
          chunkLabel = _getTrackerT2("chunkResumed");
          if (
            typeof cs.completedChunks === "number" &&
            cs.completedChunks > 0
          ) {
            chunkLabel = "#" + cs.completedChunks + " \u2014 " + chunkLabel;
          }
          chunkColor = "#4ade80";
        } else {
          chunkIcon = "";
          chunkLabel = "";
          chunkColor = "rgba(255,255,255,0.5)";
        }
        if (chunkLabel) {
          chunkBanner =
            '<div style="color:' +
            chunkColor +
            ';font-size:11px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:4px;">' +
            chunkIcon +
            " " +
            this._escHtml(chunkLabel) +
            "</div>";
        }
      }
      var genLine =
        stagnantPrefix +
        '<span style="color:#93c5fd;">\u25B6 ' +
        sent +
        " " +
        this._escHtml(_getTrackerT2("sent")) +
        "</span>" +
        sep +
        '<span style="color:' +
        claimColor +
        ';">\u26A1 ' +
        claiming +
        " " +
        this._escHtml(_getTrackerT2("genActive")) +
        "</span>" +
        sep +
        '<span style="color:' +
        waitColor +
        ';">\u23F8 ' +
        waiting +
        " " +
        this._escHtml(_getTrackerT2("flowWaiting")) +
        "</span>" +
        sep +
        '<span style="color:#4ade80;">\u2713 ' +
        done +
        " " +
        this._escHtml(_getTrackerT2("done")) +
        "</span>" +
        sep +
        '<span style="color:' +
        failedColor +
        ';">\u2715 ' +
        failed +
        " " +
        this._escHtml(_getTrackerT2("failed")) +
        "</span>";
      var html = chunkBanner + "<div>" + genLine + "</div>";
      if (hasDlActivity) {
        var dlIcon =
          dlState === "downloading"
            ? "\u{1F4E5}"
            : dlQueue > 0
              ? "\u{1F4CB}"
              : "\u2713";
        var dlLabel =
          dlState === "downloading"
            ? _getTrackerT2("dlActive")
            : dlQueue > 0
              ? _getTrackerT2("dlPending")
              : _getTrackerT2("done");
        var dlPendingColor = dlQueue > 0 ? "#60a5fa" : "rgba(255,255,255,0.35)";
        var dlDoneColor = dlDone > 0 ? "#4ade80" : "rgba(255,255,255,0.35)";
        var dlLine =
          '<span style="color:' +
          dlPendingColor +
          ';">' +
          dlIcon +
          " " +
          dlQueue +
          " " +
          this._escHtml(dlLabel) +
          "</span>" +
          sep +
          '<span style="color:' +
          dlDoneColor +
          ';">\u2713 ' +
          dlDone +
          " " +
          this._escHtml(_getTrackerT2("done")) +
          "</span>";
        html +=
          '<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.05);">' +
          dlLine +
          "</div>";
      }
      row.style.display = "block";
      if (stagnant) {
        row.style.background = "rgba(251,146,60,0.08)";
        row.style.borderLeft = "3px solid #fb923c";
      } else {
        row.style.background = "";
        row.style.borderLeft = "";
      }
      row.innerHTML = html;
    },
    _renderJobs(jobs) {
      if (this._surfaceClosed) {
        this._stopCompactElapsedTimer();
        this._releaseCompactRows();
        return;
      }
      var jobsEl = this._el.querySelector(".tobyflow-ft-jobs");
      if (this._compactRenderRoot !== jobsEl) {
        this._compactRenderRoot = jobsEl;
        this._lastJobsRenderSig = null;
      }
      if (this._hasLiveGrid?.()) {
        jobsEl.replaceChildren();
        this._prunePreviewMedia();
        this._lastJobsRenderSig = null;
        this._stopCompactElapsedTimer();
        this._releaseCompactRows?.();
        return;
      }
      if (!jobs || jobs.length === 0) {
        jobsEl.innerHTML = "";
        this._releaseCompactRows?.();
        this._prunePreviewMedia();
        this._lastJobsRenderSig = null;
        this._syncToggleAllButton([]);
        this._stopCompactElapsedTimer();
        return;
      }
      var displayJobs = this._compactJobsNewestFirst(
        this._currentTrackerJobs(jobs),
      );
      this._syncCompactSession(jobs);
      this._syncToggleAllButton(jobs);
      jobsEl.style.display = this._allJobsCollapsed ? "none" : "block";
      var renderSig =
        _trackerLocale +
        "|" +
        String(this._lastData?.isRunning) +
        "|" +
        displayJobs
          .map(function (j2) {
            return [
              j2.id,
              j2.startedAt,
              j2.completedAt,
              j2.status,
              j2.pauseReason,
              j2.recoveryRequired,
              j2.recoveryLabel,
              j2.recoveryHint,
              j2.completed,
              j2.failed,
              j2.total,
              j2.modeType,
              j2.modeReason,
              j2.manualRegenActive,
              j2.manualRegenJobId,
              j2.manualRegenStatus,
              j2.manualRegenBatchPending,
              FloatingTracker._expandedJobs.has(j2.id) ? 1 : 0,
              ((FloatingTracker._expandedJobs.has(j2.id) ||
                FloatingTracker._currentTrackerBatchIds?.has(j2.id)) &&
              !FloatingTracker._manuallyCollapsed.has(j2.id)
                ? j2.items || []
                : []
              )
                .map(function (it2) {
                  var resultMediaSig = (it2.results || [])
                    .map(function (result) {
                      return [
                        result.url,
                        result.thumbnail,
                        result.playUrl,
                        result.sourceThumbnail,
                      ]
                        .filter(Boolean)
                        .join(">");
                    })
                    .join(",");
                  return [
                    it2.id,
                    it2.submittedAt,
                    it2.completedAt,
                    it2.providerCompletedAt,
                    it2.state,
                    it2.providerGenerationState,
                    it2.recoveryLabel,
                    it2.retryCount,
                    it2.thumb,
                    it2.thumbVideo,
                    it2.apiWaiting,
                    it2.promptText,
                    it2.genType,
                    it2.error,
                    it2.errorType,
                    it2.errorDisplay,
                    it2.retryErrorDisplay,
                    it2.statusKind,
                    it2.statusLabel,
                    it2.statusReason,
                    it2.statusHint,
                    it2.dl && it2.dl.state,
                    it2.dl && it2.dl.res,
                    it2.dl && it2.dl.errorDisplay,
                    it2.dl && it2.dl.error,
                    (it2.results || []).length,
                    (it2.outputs || [])
                      .map(function (output) {
                        return [output.status, output.downloadStatus].join(":");
                      })
                      .join(","),
                    resultMediaSig,
                    FloatingTracker._tileProgressCache[it2.id],
                  ].join("~");
                })
                .join("^"),
            ].join("|");
          })
          .join("||");
      if (renderSig === this._lastJobsRenderSig) {
        this._refreshRenderedTimes(displayJobs);
        this._syncCompactElapsedTimer(displayJobs);
        return;
      }
      this._lastJobsRenderSig = renderSig;
      var self2 = this;
      var now = Date.now();
      var html = "";
      var virtualCompact = typeof IntersectionObserver === "function";
      var compactData = new Map(),
        compactVisible = new Set();
      if (virtualCompact)
        jobsEl
          .querySelectorAll("[data-ft-compact-row]")
          .forEach(function (row) {
            if (row._ftCompactVisible)
              compactVisible.add(row.getAttribute("data-ft-key"));
          });
      for (var i = 0; i < displayJobs.length; i++) {
        var j = displayJobs[i];
        var color = self2._ownerColors[j.owner] || "#6b7280";
        var isDone = j.status === "completed" || j.status === "stopped";
        var isPaused2 = j.status === "paused";
        var controlPaused = j.manualRegenActive
          ? j.manualRegenStatus === "paused"
          : isPaused2;
        var isActive = self2._hasJobExecutionWork(j);
        var hasDownloadWork = self2._hasJobDownloadWork(j);
        var jobCounts = self2._jobCounts(j);
        var jobPct =
          j.total > 0 ? Math.round((jobCounts.terminal / j.total) * 100) : 0;
        var jobElapsed = self2._formatBatchElapsed(j, now);
        var regenLoading = (j.items || []).find(function (item) {
          return (
            item._regenSlotRoot &&
            [
              "PENDING",
              "SUBMITTING",
              "SUBMITTED",
              "MONITORING",
              "RETRY_SUBMIT",
            ].indexOf(item.state) >= 0
          );
        });
        if (regenLoading && self2._expandedRegenItem !== regenLoading.id) {
          self2._expandedRegenItem = regenLoading.id;
          self2._expandedJobs.add(j.id);
        } else if (
          self2._currentTrackerBatchIds?.has(j.id) &&
          !self2._manuallyCollapsed.has(j.id)
        ) {
          self2._expandedJobs.add(j.id);
        } else if (
          !self2._currentTrackerBatchIds?.has(j.id) &&
          !self2._manuallyExpanded.has(j.id)
        ) {
          self2._autoCollapsedDone.add(j.id);
          self2._expandedJobs.delete(j.id);
          self2._manuallyCollapsed.delete(j.id);
        }
        var isExpanded = self2._expandedJobs.has(j.id);
        var hasRetrying =
          isActive &&
          j.items &&
          j.items.some(function (it2) {
            return it2.state === "RETRY_SUBMIT";
          });
        var statusBadge = "";
        if (isPaused2) {
          statusBadge =
            '<span style="font-size:9px;line-height:20px;padding:1px 5px;border-radius:3px;background:rgba(245,158,11,0.2);color:#fbbf24;">' +
            self2._escHtml(j.recoveryLabel || _getTrackerT2("paused")) +
            "</span>";
        } else if (hasRetrying) {
          statusBadge =
            '<span style="font-size:9px;line-height:20px;padding:1px 5px;border-radius:3px;background:rgba(249,115,22,0.2);color:#fb923c;">' +
            _getTrackerT2("retrying") +
            "</span>";
        } else if (isDone) {
          var isStopped = j.status === "stopped";
          var isAllFailed =
            !isStopped && jobCounts.success === 0 && jobCounts.failed > 0;
          var isPartial =
            !isStopped &&
            (jobCounts.partial > 0 ||
              (jobCounts.success > 0 && jobCounts.failed > 0));
          var doneColor =
            isStopped || isAllFailed
              ? "#f87171"
              : isPartial
                ? "#facc15"
                : "#4ade80";
          var doneBg =
            isStopped || isAllFailed
              ? "rgba(239,68,68,0.2)"
              : isPartial
                ? "rgba(234,179,8,0.2)"
                : "rgba(34,197,94,0.2)";
          var doneLabel = isStopped
            ? j.owner === "workflow" && j.recoveryRequired
              ? _getTrackerT2("stateFailed")
              : j.recoveryLabel || _getTrackerT2("stopped")
            : isAllFailed
              ? _getTrackerT2("failedAll")
              : isPartial
                ? _getTrackerT2("partial")
                : _getTrackerT2("completed");
          statusBadge =
            '<span style="font-size:9px;line-height:20px;padding:1px 5px;border-radius:3px;background:' +
            doneBg +
            ";color:" +
            doneColor +
            ';">' +
            doneLabel +
            "</span>";
        }
        if (j.recoveryRequired && statusBadge) {
          var recoveryTip = self2._escHtml(
            [j.recoveryRequired, j.recoveryLabel, j.recoveryHint]
              .filter(Boolean)
              .join(" \u2014 "),
          );
          statusBadge =
            '<span title="' +
            recoveryTip +
            '" data-ft-tip="' +
            recoveryTip +
            '">' +
            statusBadge +
            "</span>";
        }
        var failBadge = "";
        if (j.failed > 0) {
          failBadge =
            '<span style="font-size:9px;line-height:20px;padding:1px 4px;border-radius:3px;background:rgba(239,68,68,0.2);color:#f87171;margin-left:2px;">' +
            j.failed +
            " " +
            _getTrackerT2("errors") +
            "</span>";
        }
        var actions = "";
        if (isActive) {
          if (
            j.owner === "prompts" &&
            !j.recoveryRequired &&
            (!j.manualRegenBatchPending || j.manualRegenActive)
          ) {
            if (controlPaused) {
              actions +=
                '<button data-action="resume" data-job-id="' +
                j.id +
                '" title="' +
                _getTrackerT2("resume") +
                '" aria-label="' +
                _getTrackerT2("resume") +
                '" style="width:24px;height:24px;background:rgba(34,197,94,0.2);border:none;border-radius:6px;color:#4ade80;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="8,5 19,12 8,19"/></svg></button>';
            } else {
              actions +=
                '<button data-action="pause" data-job-id="' +
                j.id +
                '" title="' +
                _getTrackerT2("pause") +
                '" aria-label="' +
                _getTrackerT2("pause") +
                '" style="width:24px;height:24px;background:rgba(255,255,255,0.08);border:none;border-radius:6px;color:rgba(255,255,255,0.72);cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>';
            }
          }
          actions +=
            '<button data-action="stop" data-job-id="' +
            j.id +
            '" title="' +
            _getTrackerT2("stop") +
            '" aria-label="' +
            _getTrackerT2("stop") +
            '" style="width:24px;height:24px;background:rgba(239,68,68,0.15);border:none;border-radius:6px;color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></button>';
        }
        var hasDownloadableResult = (j.items || []).some(function (item) {
          return self2._itemResultsOf(item).length > 0;
        });
        actions +=
          '<button type="button" data-job-download="' +
          self2._escHtml(j.id) +
          '" title="' +
          self2._escHtml(_getTrackerT2("downloadBatch")) +
          '" aria-label="' +
          self2._escHtml(_getTrackerT2("downloadBatch")) +
          '" data-ft-tip="' +
          self2._escHtml(_getTrackerT2("downloadBatch")) +
          '" ' +
          (hasDownloadableResult ? "" : "disabled ") +
          'style="width:24px;height:24px;padding:0;background:rgba(255,255,255,0.08);border:none;border-radius:6px;color:rgba(255,255,255,0.75);cursor:' +
          (hasDownloadableResult ? "pointer" : "not-allowed") +
          ";opacity:" +
          (hasDownloadableResult ? "1" : ".35") +
          ';display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg></button>';
        var retryableCount = (j.items || []).filter(function (item) {
          return self2._isRegenRetryCandidate(item);
        }).length;
        if (retryableCount) {
          var regenEnabled =
            self2._isPipelineIdle() &&
            self2._bulkRegenRunning !== true &&
            !j.manualRegenActive &&
            !j.manualRegenBatchPending;
          var regenLabel =
            _getTrackerT2("regenBatchFailed") + " (" + retryableCount + ")";
          actions +=
            '<button type="button" class="tobyflow-ft-item-btn" data-job-regen-retryable="' +
            self2._escHtml(j.id) +
            '" aria-label="' +
            self2._escHtml(regenLabel) +
            '" data-ft-tip="' +
            self2._escHtml(regenLabel) +
            '" ' +
            (regenEnabled ? "" : "disabled ") +
            'style="width:24px;height:24px;padding:0;border-radius:6px;color:#fbbf24;' +
            (regenEnabled ? "" : "opacity:.35;cursor:not-allowed;") +
            '">' +
            self2._regenIcon(14) +
            "</button>";
        }
        actions +=
          '<button type="button" class="tobyflow-ft-item-btn" data-job-clear="' +
          self2._escHtml(j.id) +
          '" data-ft-tip="' +
          self2._escHtml(_getTrackerT2("removeHistory")) +
          '" aria-label="' +
          self2._escHtml(_getTrackerT2("removeHistory")) +
          '" ' +
          (isActive ? "disabled " : "") +
          'style="width:24px;height:24px;border-radius:6px;' +
          (isActive ? "opacity:.35;cursor:not-allowed;" : "") +
          '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button>';
        if (!isActive && hasDownloadableResult) {
          var refLabel = self2._escHtml(_getTrackerT2("addBatchRefs"));
          actions +=
            '<button type="button" class="tobyflow-ft-add-batch-ref" data-job-add-ref="' +
            self2._escHtml(j.id) +
            '" title="' +
            refLabel +
            '" aria-label="' +
            refLabel +
            '" data-ft-tip="' +
            refLabel +
            '" style="flex:0 0 24px;box-sizing:border-box;width:24px;height:24px;padding:0;border:none;border-radius:6px;background:linear-gradient(90deg, rgb(204, 255, 0) 0%, rgb(234, 255, 152) 100%);color:#000;display:flex;align-items:center;justify-content:center;cursor:pointer;">' +
            self2._batchRefIcon() +
            "</button>";
        }
        var jobOpacity = "";
        html +=
          '<div data-ft-key="job:' +
          self2._escHtml(j.id) +
          '" style="padding:4px 12px;border-bottom:1px solid rgba(255,255,255,0.05);' +
          jobOpacity +
          '">';
        html +=
          '<div class="tobyflow-ft-job-header" data-job-toggle="' +
          j.id +
          '" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:3px 0;">';
        html +=
          '<span class="' +
          (isActive && !isPaused2 ? "tobyflow-ft-dot-pulse" : "") +
          '" style="width:8px;height:8px;border-radius:50%;background:' +
          color +
          ';flex-shrink:0;"></span>';
        html +=
          '<span style="display:flex;align-items:center;gap:5px;flex:1;min-width:0;">';
        html +=
          '<span style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">' +
          self2._escHtml(j.label || j.owner) +
          "</span>";
        html +=
          '<span data-ft-job-elapsed="' +
          self2._escHtml(j.id) +
          '" style="font-size:10px;color:rgba(255,255,255,0.5);font-variant-numeric:tabular-nums;flex-shrink:0;">' +
          jobElapsed +
          "</span>";
        html +=
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;transition:transform 0.2s;' +
          (isExpanded ? "transform:rotate(180deg);" : "") +
          '"><polyline points="6 9 12 15 18 9"/></svg>';
        html += "</span>";
        var modeReasonTitle = j.modeReason
          ? " \xB7 " + self2._escHtml(j.modeReason)
          : "";
        html +=
          j.modeType === "api"
            ? '<span title="Flow API' +
              modeReasonTitle +
              '" style="font-size:8px;line-height:20px;padding:1px 5px;border-radius:3px;background:rgba(34,211,238,0.18);color:#22d3ee;flex-shrink:0;font-weight:600;letter-spacing:0.3px;">API</span>'
            : j.modeType === "mixed"
              ? '<span title="Flow API + Web' +
                modeReasonTitle +
                '" style="font-size:8px;line-height:20px;padding:1px 5px;border-radius:3px;background:rgba(168,85,247,0.18);color:#c084fc;flex-shrink:0;font-weight:600;letter-spacing:0.3px;">MIXED</span>'
              : '<span title="Flow Web (DOM)' +
                modeReasonTitle +
                '" style="font-size:8px;line-height:20px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);flex-shrink:0;font-weight:600;letter-spacing:0.3px;">WEB</span>';
        html += statusBadge + failBadge;
        html +=
          '<div style="display:flex;gap:2px;flex-shrink:0;">' +
          actions +
          "</div>";
        html += "</div>";
        html +=
          '<div style="display:flex;align-items:center;gap:7px;margin:-6px 0 5px;">';
        html +=
          '<div style="flex:1;min-width:0;height:3px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;">';
        html +=
          '<div style="height:100%;width:100%;background:' +
          color +
          ";border-radius:999px;transform:scaleX(" +
          jobPct / 100 +
          ');transform-origin:left;transition:transform 0.3s ease-out;will-change:transform;"></div>';
        html += "</div>";
        html +=
          '<span style="font-size:10px;color:rgba(255,255,255,0.6);min-width:28px;text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0;">' +
          jobPct +
          "%</span>";
        html += "</div>";
        if (isExpanded && j.items && j.items.length > 0) {
          var hasHeldCard = j.items.some(function (item) {
            return !!self2._resumeJobIdForItem(item, j);
          });
          var itemsDimStyle =
            isPaused2 && !j.manualRegenActive && !hasHeldCard
              ? "opacity:0.4;transition:opacity 0.25s;"
              : "";
          html +=
            '<div data-ft-key="items" style="padding:0px;margin-left:4px;' +
            itemsDimStyle +
            '">';
          var displayItems = self2
            ._currentTrackerItems(j)
            .slice()
            .sort(self2._compareTrackerItems);
          for (var k = 0; k < displayItems.length; k++) {
            var it = displayItems[k];
            var rowKey = "item:" + it.id;
            if (virtualCompact) compactData.set(rowKey, { item: it, job: j });
            if (!virtualCompact || compactVisible.has(rowKey)) {
              html += self2._compactItemHtml(it, j, now);
            } else {
              html +=
                '<div data-ft-compact-row="" data-ft-key="' +
                self2._escHtml(rowKey) +
                '" style="display:flex;align-items:center;gap:5px;padding:4px 4px;font-size:11px;min-height:50px;"></div>';
            }
          }
          html += "</div>";
        } else if (
          isExpanded &&
          j.id &&
          typeof j.id === "string" &&
          j.id.startsWith("_legacy_") &&
          isActive
        ) {
          var legacyProgress = self2._tileProgressCache._legacy;
          if (legacyProgress !== null && typeof legacyProgress === "number") {
            html += '<div style="padding:6px 4px;margin-left:4px;">';
            html +=
              '<div style="display:flex;align-items:center;gap:8px;font-size:11px;background:rgba(255,255,255,0.03);border-radius:4px;padding:6px 8px;">';
            html +=
              '<span style="color:rgba(255,255,255,0.5);">' +
              _getTrackerT2("generating") +
              "</span>";
            html +=
              '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(168,85,247,0.25);color:#c084fc;font-variant-numeric:tabular-nums;font-weight:500;">' +
              legacyProgress +
              "%</span>";
            html += "</div>";
            html += "</div>";
          }
        }
        html += "</div>";
      }
      var template = document.createElement("template");
      template.innerHTML = html;
      if (virtualCompact) this._compactRowData = compactData;
      this._patchCompactDom(jobsEl, template.content);
      this._observeCompactRows?.(jobsEl);
      this._observePreviewMedia(jobsEl);
      this._syncCompactElapsedTimer(displayJobs);
    },
    _refreshRenderedTimes: function (jobs) {
      if (!this._el) return;
      var now = Date.now(),
        self2 = this,
        jobsById = new Map(),
        itemsById = new Map();
      (jobs || []).forEach(function (job) {
        jobsById.set(String(job.id || ""), job);
        (job.items || []).forEach(function (item) {
          itemsById.set(String(item.id || ""), item);
        });
      });
      this._el
        .querySelectorAll("[data-ft-job-elapsed]")
        .forEach(function (label) {
          var job = jobsById.get(
            label.getAttribute("data-ft-job-elapsed") || "",
          );
          if (job) label.textContent = self2._formatBatchElapsed(job, now);
        });
      this._el
        .querySelectorAll("[data-ft-item-time]")
        .forEach(function (label) {
          var item = itemsById.get(
            label.getAttribute("data-ft-item-time") || "",
          );
          if (item?.submittedAt)
            label.textContent = self2._elapsedLabel(item, now, false);
        });
    },
    _stopCompactElapsedTimer: function () {
      if (this._compactElapsedTimer) clearInterval(this._compactElapsedTimer);
      this._compactElapsedTimer = null;
    },
    _syncCompactElapsedTimer: function (jobs) {
      var activeStates = [
        "PENDING",
        "SUBMITTING",
        "SUBMITTED",
        "MONITORING",
        "RETRY_SUBMIT",
        "WAITING_USER",
        "WAITING_PROVIDER",
        "RECOVERY_REQUIRED",
      ];
      var hasLiveClock = (jobs || []).some(function (job) {
        return (
          ["running", "paused"].indexOf(job.status) >= 0 ||
          (job.items || []).some(function (item) {
            return activeStates.indexOf(item.state) >= 0;
          })
        );
      });
      if (
        !this._el?.isConnected ||
        this._el.style.display === "none" ||
        !hasLiveClock
      ) {
        this._stopCompactElapsedTimer();
        return;
      }
      if (this._compactElapsedTimer) return;
      var self2 = this;
      this._compactElapsedTimer = setInterval(function () {
        if (
          !self2._el?.isConnected ||
          self2._el.style.display === "none" ||
          !self2._lastData
        ) {
          self2._stopCompactElapsedTimer();
          return;
        }
        var currentJobs = self2._compactJobsNewestFirst(
          self2._lastData.jobs || [],
        );
        var stillLive = currentJobs.some(function (job) {
          return (
            ["running", "paused"].indexOf(job.status) >= 0 ||
            (job.items || []).some(function (item) {
              return activeStates.indexOf(item.state) >= 0;
            })
          );
        });
        if (!stillLive) {
          self2._stopCompactElapsedTimer();
          return;
        }
        self2._refreshRenderedTimes(currentJobs);
      }, 1e3);
    },
    updateLegacy(data) {
      if (!data || data.owner === "workflow") return;
      this._legacyData = data;
      var isActive = data.status === "running" || data.status === "paused";
      this.update({
        isRunning: isActive,
        completed: data.current || 0,
        total: data.total || 0,
        elapsed: data.startedAt ? Date.now() - data.startedAt : 0,
        pipeline: null,
        jobs: [
          {
            id: "_legacy_" + (data.owner || "prompts"),
            owner: data.owner || "prompts",
            modeType: "web",
            label: data.label || data.owner || "Auto Gen",
            status: data.status || "running",
            completed: data.current || 0,
            failed: data.failed || 0,
            total: data.total || 0,
            startedAt: data.startedAt,
            items: data.items || [],
          },
        ],
      });
    },
    _sendAction(action, data) {
      if (
        data &&
        data.jobId &&
        typeof data.jobId === "string" &&
        data.jobId.startsWith("_legacy_")
      ) {
        if (action === "pq:stopJob" || action === "pq:stopAll") {
          shouldStop = true;
          isPaused = false;
          if (this._legacyData) {
            this._legacyData.status = "stopped";
            this.updateLegacy(this._legacyData);
          }
          return;
        }
        if (action === "pq:pauseJob") {
          isPaused = true;
          if (this._legacyData) {
            this._legacyData.status = "paused";
            this.updateLegacy(this._legacyData);
          }
          return;
        }
        if (action === "pq:resumeJob") {
          isPaused = false;
          if (this._legacyData) {
            this._legacyData.status = "running";
            this.updateLegacy(this._legacyData);
          }
          return;
        }
      }
      if (action === "pq:stopAll" && isRunning) {
        shouldStop = true;
        isPaused = false;
      }
      var self2 = this;
      var views = [
        this._lastData,
        this._gridOpenData,
        this._regenHistorySnapshot,
        this._nativeIdentitySourceData,
        this._gridApiLiveData,
      ].filter(Boolean);
      var currentProject =
        (self.getCurrentProjectId && self.getCurrentProjectId()) ||
        this._lastData?.projectId ||
        null;
      var visibleJobs = views
        .flatMap(function (view) {
          return view.jobs || [];
        })
        .filter(function (job) {
          var jobProject =
            job.projectId ||
            (job.items || []).find(function (item) {
              return item.projectId;
            })?.projectId;
          return !jobProject || jobProject === currentProject;
        });
      var stopStates = [
        "PENDING",
        "WAITING_DEPENDENCY",
        "SUBMITTING",
        "SUBMITTED",
        "MONITORING",
        "RETRY_SUBMIT",
        "WAITING_USER",
        "WAITING_PROVIDER",
        "RECOVERY_REQUIRED",
      ];
      var markStopped = function (jobIds, reason) {
        var targets = new Set(jobIds.filter(Boolean));
        views.forEach(function (view) {
          (view.jobs || []).forEach(function (job) {
            if (!targets.has(job.id) && !targets.has(job.executionJobId))
              return;
            job.status = "stopped";
            job.pauseReason = null;
            job.recoveryLabel = null;
            job.recoveryRequired = null;
            job.recoveryHint = null;
            (job.items || []).forEach(function (item) {
              if (
                !stopStates.includes(item.state) &&
                item.state !== "CANCELLED"
              )
                return;
              item.state = "CANCELLED";
              item.providerGenerationState = "CANCELLED";
              item.errorType = "cancelled";
              item.error = reason;
              item.completedAt = Date.now();
              item.recoveryLabel = null;
              item.recoveryPhase = null;
              item.recoveryCode = null;
              item.recoveryAttempt = 0;
              item.recoveryMaxAttempts = 0;
              item.statusLabel = null;
              item.statusKind = null;
              item.statusReason = null;
              item.apiWaiting = false;
              item.apiWaitingLabel = null;
            });
          });
        });
        self2._lastJobsRenderSig = null;
        if (self2._lastData) self2.update(self2._lastData);
      };
      return chrome.runtime
        .sendMessage(Object.assign({ action }, data || {}))
        .catch(function (error) {
          return {
            ok: false,
            error: error?.message || "RUNTIME_MESSAGE_FAILED",
          };
        })
        .then(function (response) {
          var stopError = String(response?.error || "");
          var stopOwnerGone =
            response?.ok !== true &&
            ([
              "STOP_JOB_NO_SIDEBAR_ACK",
              "STOP_JOB_RELAY_FAILED",
              "STOP_ALL_NO_SIDEBAR_ACK",
              "STOP_ALL_RELAY_FAILED",
              "JOB_NOT_FOUND",
              "PROMPT_QUEUE_NOT_READY",
            ].includes(stopError) ||
              /Receiving end does not exist|message port closed/i.test(
                stopError,
              ));
          if (
            action === "pq:stopAll" &&
            (stopOwnerGone ||
              self2._lastData?._ftRestoredCache ||
              visibleJobs.some(function (job) {
                return job._ftCachedJob === true;
              }))
          ) {
            var pending = visibleJobs
              .filter(function (job) {
                return (
                  (stopOwnerGone || job._ftCachedJob === true) &&
                  (["running", "paused", "pending", "queued"].includes(
                    job.status,
                  ) ||
                    (job.items || []).some(function (item) {
                      return stopStates.includes(item.state);
                    }))
                );
              })
              .filter(function (job, index, jobs) {
                return (
                  jobs.findIndex(function (other) {
                    return (
                      (other.executionJobId || other.id) ===
                      (job.executionJobId || job.id)
                    );
                  }) === index
                );
              });
            if (!pending.length) return response;
            var stopAllProjectId =
              (self.getCurrentProjectId && self.getCurrentProjectId()) ||
              self2._lastData?.projectId ||
              null;
            return Promise.all(
              pending.map(function (job) {
                return chrome.runtime
                  .sendMessage({
                    action: "ft:stopCachedJob",
                    key: self2._FT_CACHE_KEY,
                    projectId: stopAllProjectId,
                    jobId: job.executionJobId || job.id,
                    allowMissingCache: true,
                  })
                  .catch(function (error) {
                    return {
                      ok: false,
                      error: error?.message || "CACHE_STOP_FAILED",
                    };
                  });
              }),
            ).then(function (results) {
              if (
                !results.every(function (result) {
                  return result?.ok === true;
                })
              ) {
                return { ok: false, error: "CACHE_STOP_FAILED" };
              }
              markStopped(
                pending.flatMap(function (job) {
                  return [job.id, job.executionJobId];
                }),
                "STOPPED_AFTER_PAGE_RELOAD",
              );
              return { ok: true, cached: true };
            });
          }
          var resumeError = String(response?.error || "");
          var resumeOwnerGone =
            action === "pq:resumeJob" &&
            response?.ok !== true &&
            (resumeError === "RESUME_JOB_NO_SIDEBAR_ACK" ||
              resumeError === "RESUME_JOB_RELAY_FAILED" ||
              /Receiving end does not exist|message port closed/i.test(
                resumeError,
              ));
          if (resumeOwnerGone && data?.jobId) {
            var resumeProjectId =
              (self.getCurrentProjectId && self.getCurrentProjectId()) ||
              self2._lastData?.projectId ||
              null;
            return chrome.runtime
              .sendMessage({
                action: "ft:stopCachedJob",
                key: self2._FT_CACHE_KEY,
                projectId: resumeProjectId,
                jobId: data.jobId,
                allowMissingCache: true,
              })
              .then(function (cancelResponse) {
                if (cancelResponse?.ok !== true) return response;
                markStopped([data.jobId], "RESUME_OWNER_GONE_AUTO_CANCELLED");
                return {
                  ok: false,
                  error: "RESUME_OWNER_GONE_AUTO_CANCELLED",
                  autoCancelled: true,
                };
              })
              .catch(function () {
                return response;
              });
          }
          var cachedJob = visibleJobs.find(function (job) {
            return job.id === data?.jobId || job.executionJobId === data?.jobId;
          });
          if (
            action !== "pq:stopJob" ||
            !cachedJob ||
            !(
              self2._lastData?._ftRestoredCache ||
              cachedJob?._ftCachedJob === true ||
              (stopOwnerGone && cachedJob)
            )
          )
            return response;
          var projectId =
            (self.getCurrentProjectId && self.getCurrentProjectId()) ||
            self2._lastData?.projectId ||
            null;
          return chrome.runtime
            .sendMessage({
              action: "ft:stopCachedJob",
              key: self2._FT_CACHE_KEY,
              projectId,
              jobId: data && data.jobId,
              allowMissingCache: true,
            })
            .then(function (cacheResponse) {
              if (cacheResponse?.ok !== true) return cacheResponse;
              markStopped([data.jobId], "STOPPED_AFTER_PAGE_RELOAD");
              return { ok: true, cached: true };
            });
        })
        .then(function (response) {
          if (
            (action === "pq:stopJob" || action === "pq:stopAll") &&
            response?.ok !== true
          ) {
            console.warn(
              "[FloatingTracker] Stop not confirmed:",
              response?.error || "STOP_NOT_CONFIRMED",
            );
            self2._showTrackerNotice(_getTrackerT2("stopNotConfirmed"), true);
          }
          if (action === "pq:resumeJob") {
            if (response?.autoCancelled === true)
              self2._showTrackerNotice(
                _getTrackerT2("resumeOwnerGoneCancelled"),
                false,
              );
            else if (response?.ok === true)
              self2._showTrackerNotice(_getTrackerT2("resumeAccepted"), false);
            else
              self2._showTrackerNotice(
                `${_getTrackerT2("resumeFailed")}: ${response?.error || "RESUME_NOT_ACCEPTED"}`,
                true,
              );
          }
          return response;
        })
        .catch(function (err) {
          console.warn("[FloatingTracker] Action failed:", action, err.message);
          if (action === "pq:stopJob" || action === "pq:stopAll")
            self2._showTrackerNotice(_getTrackerT2("stopNotConfirmed"), true);
          if (action === "pq:resumeJob")
            self2._showTrackerNotice(
              `${_getTrackerT2("resumeFailed")}: ${err.message || "RUNTIME_MESSAGE_FAILED"}`,
              true,
            );
          return { ok: false, error: err.message || "RUNTIME_MESSAGE_FAILED" };
        });
    },
    _requestRegen: function (
      button,
      jobId,
      itemId,
      item,
      prompt,
      payloadOverride,
      confirmed,
    ) {
      var self2 = this;
      itemId = item?.id || itemId;
      if (!this._isCurrentProjectItem(item)) {
        this._showTrackerNotice(_getTrackerT2("projectMismatch"), true);
        return Promise.resolve({ ok: false, error: "PROJECT_MISMATCH" });
      }
      var displayJob = (this._lastData?.jobs || []).find(function (job) {
        return job.id === jobId;
      });
      if (
        !item ||
        !itemId ||
        this._regenPendingIds.has(itemId) ||
        !this._canRegenPromptItem(item, displayJob)
      ) {
        return Promise.resolve({ ok: false, error: "REGEN_BUSY_OR_MISSING" });
      }
      if (confirmed !== true && !confirmed?.settingsOverrides) {
        return this._confirmAction({
          title: _getTrackerT2("regenSingleTitle"),
          message: _getTrackerT2("regenSingleMessage"),
          promptCount: 1,
          regenGroups: [{ item }],
          note: item.statusKind === "unverified" ? item.statusHint : "",
          confirmLabel: _getTrackerT2("regenConfirm"),
          statusCheck: this._createRegenStatusCheck([{ item }]),
        }).then(function (ok) {
          return ok
            ? self2._requestRegen(
                button,
                jobId,
                itemId,
                item,
                prompt,
                payloadOverride,
                ok,
              )
            : { ok: false, error: "USER_CANCELLED" };
        });
      }
      this._regenPendingIds.add(itemId);
      var joiningPausedManualLane =
        displayJob?.status === "paused" &&
        displayJob.manualRegenActive === true;
      if (
        !joiningPausedManualLane &&
        this._lastData &&
        this._lastData.jobs &&
        this._lastData.jobs.length
      ) {
        this._regenHistorySnapshot = this._lastData;
      }
      var beforeRegenDisplay = this._lastData;
      var beforeManualDl = this._manualDlStates[itemId];
      if (!joiningPausedManualLane) delete this._manualDlStates[itemId];
      if (beforeRegenDisplay && !joiningPausedManualLane) {
        var sending = Object.assign({}, item, {
          state: "SUBMITTING",
          results: [],
          thumb: null,
          providerGenerationState: null,
          dl: null,
          outputs: [],
          error: null,
          preTileIds: null,
          progressTileIds: [],
          apiWaiting: false,
          genMode: this._confirmedRegenRoute || item.genMode || null,
          _regenSlotRoot: item._regenSlotRoot || item.regenOf || itemId,
          isRegen: true,
          prompt: typeof prompt === "string" ? prompt : item.prompt,
          promptText: typeof prompt === "string" ? prompt : item.promptText,
        });
        this.update(
          Object.assign({}, beforeRegenDisplay, {
            isRunning: true,
            jobs: beforeRegenDisplay.jobs.map(function (job) {
              return Object.assign({}, job, {
                items: (job.items || []).map(function (current) {
                  return current.id === itemId ? sending : current;
                }),
              });
            }),
          }),
        );
      }
      if (button) {
        button.disabled = true;
        button.style.opacity = "0.55";
        button.setAttribute("data-ft-tip", _getTrackerT2("regenSendingTitle"));
      }
      return Promise.resolve(
        this._sendAction("pq:regenItem", {
          jobId,
          itemId,
          prompt,
          payload: payloadOverride || this._regenPayloadOf(item, jobId),
          settingsOverride: this._regenSettingsOverrideOf(item, confirmed),
        }),
      )
        .then(function (res) {
          if (!res || res.ok !== true) {
            self2._regenPendingIds.delete(itemId);
            if (beforeManualDl) self2._manualDlStates[itemId] = beforeManualDl;
            if (beforeRegenDisplay && !joiningPausedManualLane) {
              self2._regenHistorySnapshot = beforeRegenDisplay;
              self2.update(beforeRegenDisplay);
            }
            if (button) {
              button.disabled = false;
              button.style.opacity = "";
              button.setAttribute(
                "data-ft-tip",
                _getTrackerT2("regenFailedTitle"),
              );
            }
            if (String(res?.error || "").indexOf("MENTION_UNRESOLVED:") === 0) {
              self2._showTrackerNotice(
                String(_getTrackerT2("regenMentionUnresolved")).replace(
                  "{names}",
                  String(res.error).split(":").slice(1).join(":"),
                ),
                true,
              );
            }
            console.warn(
              "[FloatingTracker] Regen rejected:",
              (res && res.error) || "NO_ACK",
            );
            return res || { ok: false, error: "NO_ACK" };
          }
          if (res.queued === true) {
            self2._regenPendingIds.delete(itemId);
            if (button) {
              button.disabled = true;
              button.style.opacity = "0.55";
              button.setAttribute("data-ft-tip", _getTrackerT2("regenQueued"));
            }
            self2._showTrackerNotice(_getTrackerT2("regenQueued"), false);
            return res;
          }
          if (
            res.itemId &&
            !(self2._lastData?.jobs || []).some(function (job) {
              return (job.items || []).some(function (current) {
                return current.id === res.itemId;
              });
            })
          ) {
            var optimistic = Object.assign({}, item, {
              id: res.itemId,
              prompt:
                typeof prompt === "string" && prompt.trim()
                  ? prompt.trim()
                  : item.prompt || item.promptText || "",
              promptText:
                typeof prompt === "string" && prompt.trim()
                  ? prompt.trim()
                  : item.promptText || item.prompt || "",
              state: "PENDING",
              results: [],
              thumb: null,
              error: null,
              genMode: self2._confirmedRegenRoute || item.genMode || null,
              createdAt: Number(item.createdAt || 0) + 1,
              isRegen: true,
              regenOf: item._regenSlotRoot || item.regenOf || itemId,
              _regenSlotRoot: item._regenSlotRoot || item.regenOf || itemId,
              _regenOptimistic: true,
              providerGenerationState: null,
              dl: null,
              outputs: [],
              resultThumbnails: {},
              resultTileIds: [],
              resultProviderUrls: {},
              operationId: null,
              flowOperationId: null,
              flowApiLineage: [],
              flowApiAccepted: false,
              hasFlowOperationId: false,
              recoveryExhausted: false,
              recoveryLabel: null,
              statusLabel: null,
              statusKind: null,
            });
            var display = self2._lastData;
            if (display) {
              var replaced = Object.assign({}, display, {
                jobs: (display.jobs || []).map(function (job) {
                  return Object.assign({}, job, {
                    items: (job.items || []).map(function (current) {
                      return current.id === itemId ? optimistic : current;
                    }),
                  });
                }),
              });
              self2._regenHistorySnapshot = replaced;
              self2.update(replaced);
              setTimeout(function () {
                var current = self2._lastData;
                if (!current) return;
                var missingLive = false;
                var jobs = current.jobs.map(function (job) {
                  var jobMissingLive = false;
                  var items = (job.items || []).map(function (entry) {
                    if (
                      entry.id !== res.itemId ||
                      entry._regenOptimistic !== true
                    )
                      return entry;
                    missingLive = true;
                    jobMissingLive = true;
                    return Object.assign({}, entry, {
                      state: "FAILED",
                      _regenOptimistic: false,
                      recoveryExhausted: true,
                      statusKind: "unverified",
                      error: "REGEN_LIVE_SNAPSHOT_MISSING",
                    });
                  });
                  return Object.assign(
                    {},
                    job,
                    { items },
                    jobMissingLive
                      ? { status: "completed", executionJobId: null }
                      : {},
                  );
                });
                if (missingLive)
                  self2.update(
                    Object.assign({}, current, {
                      jobs,
                      isRunning: jobs.some(function (job) {
                        return job.status === "running";
                      }),
                    }),
                  );
              }, 3e4);
            }
          }
          setTimeout(function () {
            self2._regenPendingIds.delete(itemId);
            if (!button || !button.isConnected || !self2._isPipelineIdle())
              return;
            button.disabled = false;
            button.style.opacity = "";
            button.setAttribute("data-ft-tip", _getTrackerT2("regenTitle"));
          }, 5e3);
          return res;
        })
        .catch(function (error) {
          self2._regenPendingIds.delete(itemId);
          if (beforeManualDl) self2._manualDlStates[itemId] = beforeManualDl;
          if (beforeRegenDisplay && !joiningPausedManualLane) {
            self2._regenHistorySnapshot = beforeRegenDisplay;
            self2.update(beforeRegenDisplay);
          }
          if (button) {
            button.disabled = false;
            button.style.opacity = "";
          }
          return {
            ok: false,
            error: (error && error.message) || "REGEN_FAILED",
          };
        });
    },
    hide() {
      this._stopAutoRefresh();
      this._stopCompactElapsedTimer();
      this._surfaceClosed = false;
      if (this._el) {
        this._el.style.display = "none";
      }
      this._syncLauncherVisibility();
      this._lastData = null;
      this._nativeIdentitySourceData = null;
      this._regenHistorySnapshot = null;
      this._legacyData = null;
      this._gridApiLiveData = null;
      this._pruneTrackerItemState?.(null);
      this._releaseCompactRows?.();
      this._expandedJobs.clear();
      this._manuallyCollapsed.clear();
      this._manuallyExpanded.clear();
      this._tileProgressCache = {};
      this._lastJobsRenderSig = null;
      this._chunkStatus = null;
      if (this._chunkResumedTimer) {
        clearTimeout(this._chunkResumedTimer);
        this._chunkResumedTimer = null;
      }
    },
  };
  var _origUpdate = FloatingTracker.update;
  FloatingTracker._compactJobsNewestFirst = function (jobs) {
    return (Array.isArray(jobs) ? jobs : [])
      .map(function (job, index) {
        var raw = job && (job.startedAt ?? job.createdAt);
        var time = Number(raw);
        if (!Number.isFinite(time) && typeof raw === "string")
          time = Date.parse(raw);
        return { job, index, time: Number.isFinite(time) ? time : 0 };
      })
      .sort(function (a, b) {
        return b.time - a.time || a.index - b.index;
      })
      .map(function (entry) {
        return entry.job;
      });
  };
  FloatingTracker._hasPendingRegenProjection = function (data) {
    return !!(data?.jobs || []).some(function (job) {
      return (job.items || []).some(function (item) {
        return (
          (item.isRegen === true || !!item.regenOf || !!item._regenSlotRoot) &&
          [
            "PENDING",
            "SUBMITTING",
            "SUBMITTED",
            "MONITORING",
            "RETRY_SUBMIT",
            "WAITING_USER",
            "WAITING_PROVIDER",
            "WAITING_DEPENDENCY",
          ].indexOf(item.state) >= 0
        );
      });
    });
  };
  FloatingTracker._excludeWorkflowTrackerJobs = function (data) {
    if (!data?.jobs) return data;
    var jobs = data.jobs.filter(function (job) {
      return job.owner !== "workflow";
    });
    if (jobs.length === data.jobs.length) return data;
    var result = Object.assign({}, data, {
      jobs,
      trackerWorkflowExcluded: jobs.length === 0,
      total: jobs.reduce(function (n, job) {
        return n + (job.items || []).length;
      }, 0),
      completed: jobs.reduce(function (n, job) {
        return n + Number(job.completed || 0);
      }, 0),
      failed: jobs.reduce(function (n, job) {
        return n + Number(job.failed || 0);
      }, 0),
      isRunning:
        data.isRunning === true &&
        jobs.some(function (job) {
          return [
            "running",
            "paused",
            "pending",
            "queued",
            "preparing",
          ].includes(job.status);
        }),
    });
    ["_ftRestoredCache", "_ftHistoryMerged"].forEach(function (key) {
      if (data[key]) Object.defineProperty(result, key, { value: true });
    });
    return result;
  };
  FloatingTracker._excludeExpiredTrackerJobs = function (data) {
    if (!data?.jobs || !this._expiredTrackerJobIds?.size) return data;
    var self2 = this;
    var jobs = data.jobs.filter(function (job) {
      return !self2._expiredTrackerJobIds.has(job.id);
    });
    if (jobs.length === data.jobs.length) return data;
    var kept = Object.assign({}, data, {
      jobs,
      trackerHistoryExpired: jobs.length === 0,
      total: jobs.reduce(function (n, j) {
        return n + (j.items || []).length;
      }, 0),
      completed: jobs.reduce(function (n, j) {
        return n + Number(j.completed || 0);
      }, 0),
    });
    ["_ftRestoredCache", "_ftHistoryMerged"].forEach(function (marker) {
      if (data[marker]) Object.defineProperty(kept, marker, { value: true });
    });
    return kept;
  };
  FloatingTracker.update = function (data, options = {}) {
    data = this._excludeWorkflowTrackerJobs?.(data) || data;
    data = this._excludeExpiredTrackerJobs?.(data) || data;
    if (
      data?.trackerWorkflowExcluded === true ||
      data?.trackerHistoryExpired === true
    )
      return;
    var nativeMetadataOnly = options.nativeMetadataOnly === true;
    var nativeTrackerDisplay = this._el?.style.display;
    var nativeLauncherDisplay = this._launcherEl?.style.display;
    data = _enrichTrackerNativeVideoIdentities2(data);
    if (nativeMetadataOnly) {
      this._gridOpenData = _enrichTrackerNativeVideoIdentities2(
        this._gridOpenData,
      );
      this._regenHistorySnapshot = _enrichTrackerNativeVideoIdentities2(
        this._regenHistorySnapshot,
      );
    }
    var cacheSourceData = data;
    var restoredCacheInput = data?._ftRestoredCache === true;
    try {
      var activeProject =
        (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
      if (
        activeProject &&
        data &&
        data.projectId &&
        data.projectId !== activeProject
      )
        return;
      if (activeProject && data && Array.isArray(data.jobs)) {
        var scopedJobs = data.jobs.filter(function (job) {
          var jobProject =
            job.projectId ||
            (job.items || []).find(function (item) {
              return item.projectId;
            })?.projectId ||
            null;
          return !jobProject || jobProject === activeProject;
        });
        var hasForeignScopedJob = data.jobs.some(function (job) {
          return !!(
            job.projectId ||
            (job.items || []).find(function (item) {
              return item.projectId;
            })?.projectId
          );
        });
        if (hasForeignScopedJob && scopedJobs.length === 0) return;
        if (scopedJobs.length !== data.jobs.length) {
          data = Object.assign({}, data, { jobs: scopedJobs });
          data.completed = scopedJobs.reduce(function (sum, job) {
            return sum + (job.completed || 0);
          }, 0);
          data.total = scopedJobs.reduce(function (sum, job) {
            return sum + (job.total || 0);
          }, 0);
        }
      }
    } catch (_) {}
    var noticeData = restoredCacheInput ? null : data;
    data = this._hydrateCachedMediaUrls(data);
    if (restoredCacheInput && data && data._ftRestoredCache !== true) {
      Object.defineProperty(data, "_ftRestoredCache", {
        value: true,
        enumerable: false,
      });
    }
    try {
      this._cleanupOrphanGridDom?.();
    } catch (_) {}
    try {
      var previousDisplay = this._lastData;
      var hasRestoredHistory =
        previousDisplay &&
        (previousDisplay._ftRestoredCache === true ||
          previousDisplay._ftHistoryMerged === true);
      if (
        hasRestoredHistory &&
        data &&
        data !== previousDisplay &&
        Array.isArray(data.jobs)
      ) {
        data = this._mergeGridHistory(previousDisplay, data) || data;
        Object.defineProperty(data, "_ftHistoryMerged", {
          value: true,
          enumerable: false,
        });
      }
    } catch (_) {}
    try {
      var liveJobs = (data && data.jobs) || [];
      var hasRegenJob = ((cacheSourceData && cacheSourceData.jobs) || []).some(
        function (job) {
          return (
            job.label === "Regen" ||
            (job.items || []).some(function (item) {
              return item.isRegen === true;
            })
          );
        },
      );
      if (
        hasRegenJob &&
        this._regenHistorySnapshot &&
        this._regenHistorySnapshot.jobs
      ) {
        var liveIds = new Set(
          liveJobs.map(function (job) {
            return job.id;
          }),
        );
        var oldJobs = this._regenHistorySnapshot.jobs.filter(function (job) {
          return !liveIds.has(job.id);
        });
        var mergedJobs = oldJobs.concat(liveJobs);
        data = Object.assign({}, data, {
          sessionId: this._regenHistorySnapshot.sessionId || data.sessionId,
          jobs: mergedJobs,
          completed: mergedJobs.reduce(function (sum, job) {
            return sum + (Number(job.completed) || 0);
          }, 0),
          total: mergedJobs.reduce(function (sum, job) {
            return sum + (Number(job.total) || 0);
          }, 0),
        });
        this._regenHistorySnapshot = data;
      } else if (
        liveJobs.length &&
        !hasRegenJob &&
        !this._hasPendingRegenProjection(this._regenHistorySnapshot)
      ) {
        this._regenHistorySnapshot = null;
      }
    } catch (_) {}
    try {
      (data.jobs || []).forEach(function (job) {
        (job.items || []).forEach(function (item) {
          var bucket = FloatingTracker._manualDlStates[item.id];
          if (!bucket) return;
          var vals = Object.keys(bucket).map(function (k) {
            return bucket[k];
          });
          var active = vals.some(function (v) {
            return v.state === "downloading";
          });
          var failed = vals.filter(function (v) {
            return v.state === "failed";
          }).length;
          var done = vals.filter(function (v) {
            return v.state === "done";
          }).length;
          var total = Math.max(
            FloatingTracker._itemResultsOf(item).length,
            vals.length,
          );
          item.dl = {
            state: active
              ? "downloading"
              : failed
                ? "failed"
                : done === total
                  ? "done"
                  : done
                    ? "partial"
                    : "failed",
            completed: done,
            failed,
            total,
            manual: true,
          };
        });
      });
    } catch (_) {}
    var retainRestoredCache =
      restoredCacheInput || data._ftRestoredCache === true;
    var retainHistoryMerged = data._ftHistoryMerged === true;
    data = Object.assign({}, data, {
      jobs: window.TrackerRegenProjection.jobs(data.jobs || []),
    });
    if (retainRestoredCache)
      Object.defineProperty(data, "_ftRestoredCache", {
        value: true,
        enumerable: false,
      });
    if (retainHistoryMerged)
      Object.defineProperty(data, "_ftHistoryMerged", {
        value: true,
        enumerable: false,
      });
    data.total = data.jobs.reduce(function (sum, job) {
      return sum + job.items.length;
    }, 0);
    data.completed = data.jobs.reduce(function (sum, job) {
      return sum + Number(job.completed || 0);
    }, 0);
    data = this._excludeWorkflowTrackerJobs?.(data) || data;
    data = this._retainTrackerHistory?.(data) || data;
    this._lastData = data;
    this._pruneTrackerItemState?.(data);
    ["_gridOpenData", "_regenHistorySnapshot"].forEach(function (key) {
      if (FloatingTracker[key])
        FloatingTracker[key] = FloatingTracker._retainTrackerHistory(
          FloatingTracker[key],
        );
    });
    if (!nativeMetadataOnly && noticeData)
      this._gridApiLiveData =
        this._retainTrackerHistory?.(noticeData) || noticeData;
    this._nativeIdentitySourceData =
      this._retainTrackerHistory?.(cacheSourceData) || cacheSourceData;
    try {
      var regenCacheData = hasRegenJob
        ? Object.assign({}, cacheSourceData, { jobs: data.jobs })
        : cacheSourceData;
      this._saveTrackerCache(regenCacheData);
    } catch (_) {}
    try {
      if (!nativeMetadataOnly && noticeData)
        this._closeGridForActiveWeb(noticeData);
    } catch (_) {}
    if (!nativeMetadataOnly) this._expandForNewWebJob(data);
    if (!nativeMetadataOnly || this._el) _origUpdate.call(this, data);
    if (this._surfaceClosed) {
      if (this._el) this._el.style.display = "none";
      this._syncLauncherVisibility();
    } else if (this._launcherEl) {
      this._launcherEl.style.display = "none";
    }
    try {
      if (!nativeMetadataOnly && noticeData)
        this._maybeAutoOpenGridForActiveApi(noticeData);
    } catch (_) {}
    if (
      !nativeMetadataOnly &&
      noticeData &&
      typeof ApiGenNotice !== "undefined"
    )
      ApiGenNotice.update(noticeData);
    try {
      if (!nativeMetadataOnly) this._maybeAutoOpenGridAfterApiReload(data);
    } catch (_) {}
    if (nativeMetadataOnly) {
      if (this._el && nativeTrackerDisplay !== void 0)
        this._el.style.display = nativeTrackerDisplay;
      if (this._launcherEl && nativeLauncherDisplay !== void 0)
        this._launcherEl.style.display = nativeLauncherDisplay;
    }
    try {
      if (this._el) {
        var _idle = this._isPipelineIdle();
        var _exp = this._el.querySelector(".tobyflow-ft-expand");
        if (_exp) _exp.style.display = "flex";
        var _dlAll = this._el.querySelector(".tobyflow-ft-dl-all");
        if (_dlAll) {
          _dlAll.style.display = _idle ? "flex" : "none";
          var _dlSig =
            String((data && data.sessionId) || "") +
            ":" +
            String((data && data.completed) || 0) +
            "/" +
            String((data && data.total) || 0);
          var _hasDownloadable = _idle && Number(data && data.completed) > 0;
          if (_hasDownloadable && _dlAll.dataset.attentionSig !== _dlSig) {
            _dlAll.dataset.attentionSig = _dlSig;
            _dlAll.classList.remove("is-attention");
            void _dlAll.offsetWidth;
          }
          _dlAll.classList.toggle(
            "is-attention",
            _hasDownloadable &&
              _dlAll.dataset.attentionSeen !== _dlSig &&
              !_dlAll.disabled,
          );
        }
        var _clearAll = this._el.querySelector(".tobyflow-ft-clear-all");
        if (_clearAll) {
          var _hasHistory = !!(
            data &&
            Array.isArray(data.jobs) &&
            data.jobs.length
          );
          _clearAll.style.display = _hasHistory ? "flex" : "none";
          _clearAll.disabled = false;
          _clearAll.setAttribute("aria-disabled", "false");
          _clearAll.setAttribute(
            "aria-busy",
            this._clearHistoryRunning === true ? "true" : "false",
          );
          _clearAll.style.opacity = "";
          _clearAll.style.cursor = "pointer";
        }
        var _skip = this._el.querySelector(".tobyflow-ft-skip-blocker");
        if (_skip) _skip.style.display = "flex";
      }
      if (this._hasLiveGrid?.()) {
        this._refreshGrid();
        this._refreshGridApiStatus(false);
      }
    } catch (_) {}
    try {
      if (this._el) {
        const inv = window._tobyFlowZoomScaleInv || 1;
        const want = inv === 1 ? "" : String(inv);
        if (this._el.style.zoom !== want) this._el.style.zoom = want;
      }
    } catch (_) {}
  };
  FloatingTracker._expandForNewWebJob = function (data) {
    var jobs = (data && data.jobs) || [];
    if (!this._webSurfaceHandledJobs) this._webSurfaceHandledJobs = new Set();
    var self2 = this;
    var activeWebJobs = jobs.filter(function (job) {
      if (!job.id || ["running", "paused"].indexOf(job.status) < 0)
        return false;
      return (job.items || []).some(function (item) {
        var mode = item.genMode || job.modeType || "web";
        return (
          mode !== "api" &&
          [
            "PENDING",
            "SUBMITTING",
            "SUBMITTED",
            "MONITORING",
            "RETRY_SUBMIT",
            "WAITING_USER",
            "WAITING_PROVIDER",
            "RECOVERY_REQUIRED",
          ].indexOf(item.state) >= 0
        );
      });
    });
    var present = new Set(
      jobs.map(function (job) {
        return job.id;
      }),
    );
    this._webSurfaceHandledJobs.forEach(function (id) {
      if (!present.has(id)) self2._webSurfaceHandledJobs.delete(id);
    });
    var fresh = activeWebJobs.filter(function (job) {
      return !self2._webSurfaceHandledJobs.has(job.id);
    });
    if (!fresh.length) return;
    this._surfaceClosed = false;
    this._allJobsCollapsed = false;
    this._allJobsSessionId =
      data.sessionId || jobs[0]?.sessionId || jobs[0]?.id || null;
    this._lastJobsRenderSig = null;
    fresh.forEach(function (job) {
      self2._webSurfaceHandledJobs.add(job.id);
      self2._manuallyCollapsed.delete(job.id);
      self2._expandedJobs.add(job.id);
    });
  };
  FloatingTracker._maybeAutoOpenGridForActiveApi = function (data) {
    if (!data || !(data.jobs || []).length) return;
    var hasActiveWeb = data.jobs.some(function (job) {
      if (
        !["running", "paused", "preparing", "pending", "queued"].includes(
          job.status,
        )
      )
        return false;
      return (job.items || []).some(function (item) {
        var mode = item.genMode || job.modeType || "web";
        return (
          mode !== "api" &&
          ![
            "COMPLETED",
            "PARTIAL_FAIL",
            "FAILED",
            "CANCELLED",
            "BLOCKED",
            "SKIPPED",
          ].includes(item.state)
        );
      });
    });
    if (hasActiveWeb) return;
    var apiJob = data.jobs.find(function (job) {
      if (job.status !== "running") return false;
      return (job.items || []).some(function (item) {
        return (
          (item.genMode || job.modeType) === "api" &&
          [
            "PENDING",
            "SUBMITTING",
            "SUBMITTED",
            "MONITORING",
            "RETRY_SUBMIT",
            "RECOVERY_REQUIRED",
          ].includes(item.state)
        );
      });
    });
    if (!apiJob) return;
    if (this._workflowEditorVisible === true && apiJob.owner !== "workflow")
      return;
    var runKey = [apiJob.sessionId || "", apiJob.id].join(":");
    if (this._apiLiveGridHandledSession === runKey) return;
    try {
      if (!this._hasLiveGrid?.()) this._openGrid();
      if (!this._hasLiveGrid?.()) return;
      this._apiLiveGridHandledSession = runKey;
      ApiGenNotice.hideOverlay();
      if (ApiGenNotice._el) ApiGenNotice._el.style.display = "none";
    } catch (error) {
      console.warn(
        "[FloatingTracker] Cannot open API progress grid:",
        error?.message || error,
      );
    }
  };
  FloatingTracker._activeWebRunKey = function (data) {
    if (!data || !(data.jobs || []).length) return null;
    var activeWebJob = data.jobs.find(function (job) {
      if (
        !["running", "paused", "preparing", "pending", "queued"].includes(
          job.status,
        )
      )
        return false;
      var items = job.items || [];
      if (!items.length) return job.modeType === "web";
      return items.some(function (item) {
        var mode = item.genMode || job.modeType || "web";
        return (
          mode !== "api" &&
          ![
            "COMPLETED",
            "PARTIAL_FAIL",
            "FAILED",
            "CANCELLED",
            "BLOCKED",
            "SKIPPED",
          ].includes(item.state)
        );
      });
    });
    return activeWebJob
      ? [
          activeWebJob.sessionId || data.sessionId || "",
          activeWebJob.id || "",
        ].join(":")
      : null;
  };
  FloatingTracker._closeGridForActiveWeb = function (data) {
    if (!this._hasLiveGrid?.() || !data || !(data.jobs || []).length)
      return false;
    var activeRunKey = this._activeWebRunKey(data);
    if (!activeRunKey) return false;
    if (this._manualGridOpenWebRunKey === activeRunKey) return false;
    this._closeGrid(true);
    return true;
  };
  FloatingTracker._maybeAutoOpenGridAfterApiReload = async function (data) {
    if (this._autoOpenGridChecking || !data || !(data.jobs || []).length)
      return;
    this._autoOpenGridChecking = true;
    var markerKey = "af_flow_api_auto_open_tracker_grid";
    try {
      var stored = await chrome.storage.local.get(["af_settings", markerKey]);
      var settings = (stored && stored.af_settings) || {};
      var marker = stored && stored[markerKey];
      if (!marker) return;
      if (
        !["api-results-refresh", "workflow-api-results-refresh"].includes(
          marker.reason,
        ) ||
        !marker.previousDocumentEpoch
      )
        return;
      if (marker.projectId && marker.projectId !== data.projectId) return;
      const documentEpoch =
        typeof _TOBYFLOW_DOCUMENT_EPOCH !== "undefined"
          ? _TOBYFLOW_DOCUMENT_EPOCH
          : null;
      if (!documentEpoch || documentEpoch === marker.previousDocumentEpoch)
        return;
      var age = Date.now() - (Number(marker.createdAt) || 0);
      var settingDisabled =
        settings.flowApiAutoOpenTrackerGrid === false ||
        settings.flowApiAutoOpenTrackerGrid === 0 ||
        settings.flowApiAutoOpenTrackerGrid === "0";
      if (settingDisabled || age < 0 || age > 3e5) {
        await chrome.storage.local.remove(markerKey);
        return;
      }
      var sessionId = data.sessionId || (data.jobs[0] || {}).sessionId;
      var markerJobIds = Array.isArray(marker.jobIds) ? marker.jobIds : [];
      var matchesMarkerJob = function (job, snapshot) {
        if (!job) return false;
        if (markerJobIds.length === 0)
          return (job.sessionId || snapshot.sessionId) === marker.sessionId;
        if (
          markerJobIds.indexOf(job.id) !== -1 ||
          markerJobIds.indexOf(job.executionJobId) !== -1
        )
          return true;
        return (job.items || []).some(function (item) {
          return markerJobIds.indexOf(item._regenExecutionJobId) !== -1;
        });
      };
      var workflowResult = (data.jobs || []).some(function (job) {
        return job.owner === "workflow" && matchesMarkerJob(job, data);
      });
      if (this._workflowEditorVisible === true && !workflowResult) return;
      var hasMatchingJob = (data.jobs || []).some(function (job) {
        return matchesMarkerJob(job, data);
      });
      if (!hasMatchingJob && (!sessionId || marker.sessionId !== sessionId))
        return;
      var hasApiResult = (data.jobs || []).some(function (job) {
        var matchesRun = matchesMarkerJob(job, data);
        return (
          matchesRun &&
          (job.items || []).some(function (item) {
            return (
              (item.genMode || job.modeType) === "api" &&
              (item.thumb ||
                (item.results && item.results.length) ||
                ["COMPLETED", "FAILED", "PARTIAL_FAIL"].includes(item.state))
            );
          })
        );
      });
      if (!hasApiResult) return;
      var self2 = this;
      setTimeout(function () {
        try {
          if (self2._workflowEditorVisible === true && !workflowResult) return;
          const latest = self2._lastData;
          if (!latest || latest.projectId !== data.projectId) return;
          if (
            !(latest.jobs || []).some(function (job) {
              return matchesMarkerJob(job, latest);
            })
          )
            return;
          if (
            (latest.jobs || []).some(
              (job) =>
                job.status === "running" &&
                (job.items || []).some(
                  (item) => (item.genMode || job.modeType) !== "api",
                ),
            )
          )
            return;
          if (!self2._hasLiveGrid?.()) self2._openGrid();
          var consumeAttempts = 0;
          var consumeWhenOpen = function () {
            if (self2._hasLiveGrid?.()) {
              console.info("[FloatingTracker] API reload grid opened", {
                reason: marker.reason,
                matchedJobs: markerJobIds.length,
              });
              chrome.storage.local.remove(markerKey).catch(function () {});
              return;
            }
            consumeAttempts++;
            if (consumeAttempts < 30) setTimeout(consumeWhenOpen, 100);
          };
          consumeWhenOpen();
        } catch (_) {}
      }, 250);
    } catch (e) {
      console.warn(
        "[FloatingTracker] Auto-open API results grid failed:",
        (e && e.message) || e,
      );
    } finally {
      this._autoOpenGridChecking = false;
    }
  };
  FloatingTracker._FT_CACHE_KEY = "toby_flow_tracker_snapshots";
  FloatingTracker._ftCacheSaveAt = 0;
  FloatingTracker._trackerHistoryPolicy = null;
  FloatingTracker._retainTrackerHistory = function (data) {
    var policy = this._trackerHistoryPolicy;
    if (!policy || !data?.jobs) return data;
    var self2 = this,
      sessions = new Map();
    var busy = new Set([
      "PENDING",
      "WAITING_DEPENDENCY",
      "SUBMITTING",
      "SUBMITTED",
      "MONITORING",
      "RETRY_SUBMIT",
      "WAITING_USER",
      "WAITING_PROVIDER",
      "RECOVERY_REQUIRED",
    ]);
    var protectedJobs = new Set();
    Array.from(
      this._gridBody?.querySelectorAll(".tobyflow-ft-batch") || [],
    ).forEach(function (section) {
      if (
        section.querySelector('[data-draft-dirty="1"],[data-selected="1"]') ||
        (self2._gridHoverPlayback &&
          section.contains(self2._gridHoverPlayback.thumb))
      ) {
        (section._vm?.items || []).forEach(function (group) {
          protectedJobs.add(group.jobId);
        });
      }
    });
    data.jobs.forEach(function (job, index) {
      var sid = job.sessionId || data.sessionId || "imported-session";
      if (!sessions.has(sid)) sessions.set(sid, []);
      var active2 =
        protectedJobs.has(job.id) ||
        (job.items || []).some(function (item) {
          return (
            busy.has(String(item.state || "").toUpperCase()) ||
            item.dl === "downloading" ||
            ["queued", "downloading"].includes(item.dl?.state) ||
            Object.values(self2._manualDlStates?.[item.id] || {}).some(
              function (dl) {
                return dl.state === "downloading";
              },
            )
          );
        });
      sessions
        .get(sid)
        .push({
          job,
          active: active2,
          time: Number(job.completedAt || job.startedAt) || index,
        });
    });
    var groups = Array.from(sessions.values()).map(function (entries) {
      return {
        entries,
        active: entries.some(function (e) {
          return e.active;
        }),
        time: Math.max.apply(
          Math,
          entries.map(function (e) {
            return e.time;
          }),
        ),
      };
    });
    var active = groups.filter(function (g) {
      return g.active;
    });
    var terminal = groups
      .filter(function (g) {
        return !g.active;
      })
      .sort(function (a, b) {
        return b.time - a.time;
      });
    var retained = new Set(
      active.concat(
        terminal.slice(0, Math.max(0, policy.maxSessions - active.length)),
      ),
    );
    var jobs = new Set();
    groups.forEach(function (group) {
      if (!retained.has(group)) return;
      var kept = group.entries.filter(function (e) {
        return e.active;
      });
      var used = kept.reduce(function (n, e) {
        return n + (e.job.items || []).length;
      }, 0);
      group.entries
        .filter(function (e) {
          return !e.active;
        })
        .sort(function (a, b) {
          return b.time - a.time;
        })
        .forEach(function (entry) {
          var count = (entry.job.items || []).length;
          if (!kept.length || used + count <= policy.maxItems) {
            kept.push(entry);
            used += count;
          }
        });
      kept.forEach(function (e) {
        jobs.add(e.job);
      });
    });
    if (jobs.size === data.jobs.length) return data;
    var keptJobs = data.jobs.filter(function (job) {
      return jobs.has(job);
    });
    var result = Object.assign({}, data, {
      jobs: keptJobs,
      total: keptJobs.reduce(function (n, j) {
        return n + (j.items || []).length;
      }, 0),
      completed: keptJobs.reduce(function (n, j) {
        return n + Number(j.completed || 0);
      }, 0),
      failed: keptJobs.reduce(function (n, j) {
        return n + Number(j.failed || 0);
      }, 0),
    });
    ["_ftRestoredCache", "_ftHistoryMerged"].forEach(function (key) {
      if (data[key]) Object.defineProperty(result, key, { value: true });
    });
    return result;
  };
  FloatingTracker._pruneTrackerItemState = function (data) {
    var items = new Set(),
      jobs = new Set();
    (data?.jobs || []).forEach(function (job) {
      jobs.add(job.id);
      (job.items || []).forEach(function (item) {
        items.add(String(item.id));
      });
    });
    Object.keys(this._manualDlStates || {}).forEach(function (id) {
      if (
        !items.has(id) &&
        !Object.values(this._manualDlStates[id]).some(function (dl) {
          return dl.state === "downloading";
        })
      ) {
        delete this._manualDlStates[id];
      }
    }, this);
    [
      "_autoCollapsedDone",
      "_expandedJobs",
      "_manuallyCollapsed",
      "_manuallyExpanded",
    ].forEach(function (key) {
      var set = this[key];
      if (set instanceof Set)
        Array.from(set).forEach(function (id) {
          if (!jobs.has(id)) set.delete(id);
        });
    }, this);
  };
  FloatingTracker._readTrackerHistoryPolicy = function (raw) {
    try {
      var cfg =
        raw &&
        raw.data &&
        raw.data.flow &&
        raw.data.flow.configs &&
        raw.data.flow.configs.chain_config;
      if (!cfg) return null;
      var sessions = Number(cfg.history_max_sessions),
        items = Number(cfg.history_max_items_per_session),
        projects = Number(cfg.history_max_projects);
      if (!(sessions > 0) || !(items > 0) || !(projects > 0)) return null;
      return {
        maxSessions: Math.min(50, Math.floor(sessions)),
        maxItems: Math.min(1e3, Math.floor(items)),
        maxProjects: Math.min(50, Math.floor(projects)),
        batchSections: cfg.batch_sections_enabled === true,
      };
    } catch (_) {
      return null;
    }
  };
  FloatingTracker._applyTrackerHistoryPolicy = function (raw) {
    this._trackerHistoryPolicy = this._readTrackerHistoryPolicy(raw);
    [
      "_lastData",
      "_gridOpenData",
      "_regenHistorySnapshot",
      "_nativeIdentitySourceData",
      "_gridApiLiveData",
    ].forEach((key) => {
      if (this[key]) this[key] = this._retainTrackerHistory(this[key]);
    });
    this._pruneTrackerItemState(this._lastData);
    this._trimGridHistory?.();
    this._refreshGrid?.();
    this._lastJobsRenderSig = null;
    if (!this._surfaceClosed && this._el?.isConnected && this._lastData)
      this._renderJobs(this._lastData.jobs || []);
  };
  (function _initTrackerHistoryPolicy() {
    try {
      chrome.storage.local.get(["toby_provider_api_configs"], function (res) {
        FloatingTracker._applyTrackerHistoryPolicy(
          res && res.toby_provider_api_configs,
        );
      });
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes.toby_provider_api_configs) return;
        FloatingTracker._applyTrackerHistoryPolicy(
          changes.toby_provider_api_configs.newValue,
        );
      });
    } catch (_) {}
  })();
  FloatingTracker._historyToSnapshot = function (record, projectId) {
    if (!record || typeof record !== "object") return null;
    if (!Array.isArray(record.sessions)) {
      var legacy = record.data && record.data.jobs ? record.data : record;
      if (!legacy || !Array.isArray(legacy.jobs)) return null;
      legacy.schemaVersion = 1;
      legacy.projectId = legacy.projectId || projectId || null;
      legacy.sessionId = legacy.sessionId || "imported-session";
      legacy.jobs.forEach(function (job) {
        job._ftCachedJob = true;
        job.sessionId = job.sessionId || legacy.sessionId;
        job.label = job.label || _getTrackerT2("importedSession");
      });
      legacy.jobs = window.TrackerRegenProjection.jobs(legacy.jobs);
      legacy.isRunning = false;
      return legacy;
    }
    var sessions = record.sessions.slice().sort(function (a, b) {
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });
    var newestSessionByJob = {};
    for (var si = sessions.length - 1; si >= 0; si--) {
      (sessions[si].jobs || []).forEach(function (job) {
        if (job && job.id && newestSessionByJob[job.id] === void 0)
          newestSessionByJob[job.id] = sessions[si].id;
      });
    }
    var jobs = [];
    var cacheMediaAudit = {
      results: 0,
      withMediaId: 0,
      durableAsb: 0,
      uuidOnly: 0,
      videoInferred: 0,
    };
    sessions.forEach(function (session) {
      (session.jobs || []).forEach(function (job) {
        if (job && job.id && newestSessionByJob[job.id] !== session.id) return;
        (job.items || []).forEach(function (item) {
          (item.results || []).forEach(function (result) {
            if (!result || typeof result !== "object") return;
            cacheMediaAudit.results++;
            var videoEvidence =
              result.video === true ||
              [
                result.playUrl,
                result.url,
                result.thumbnail,
                result.sourceThumbnail,
              ].some(function (url) {
                return (
                  typeof url === "string" &&
                  (/\/video\//i.test(url) || /=mm,\d+,\d+(?:$|[?#])/i.test(url))
                );
              });
            var candidates = [
              result.mediaId,
              result.mediaUuid,
              result.media_uuid,
              result.fileName,
              result.file_name,
              result.playUrl,
              result.sourceThumbnail,
              result.source_thumbnail,
              result.thumbnail,
              result.url,
            ];
            var asbId = null;
            if (typeof _getFlowV2AsbMediaId === "function") {
              for (var ci = 0; ci < candidates.length && !asbId; ci++) {
                asbId = _getFlowV2AsbMediaId(candidates[ci]);
              }
            }
            if (asbId && videoEvidence) {
              result.mediaId = asbId;
              result.fileName = asbId;
            } else if (!videoEvidence) {
              var imageUuid = [
                result.mediaUuid,
                result.media_uuid,
                result.tileId,
                result.fileName,
              ].find(function (value) {
                return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(
                  String(value || ""),
                );
              });
              if (imageUuid) {
                result.mediaUuid = imageUuid;
                result.mediaId = imageUuid;
                result.fileName = imageUuid;
              }
            }
            if (result.mediaId) cacheMediaAudit.withMediaId++;
            if (
              /^[A-Za-z0-9_-]{32,1024}$/.test(
                String(result.mediaId || result.fileName || ""),
              )
            )
              cacheMediaAudit.durableAsb++;
            else if (
              /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(
                String(result.fileName || result.tileId || ""),
              )
            )
              cacheMediaAudit.uuidOnly++;
            var wasVideo = result.video === true;
            if (!wasVideo && videoEvidence) {
              result.video = true;
              cacheMediaAudit.videoInferred++;
            }
            if (
              result.video === true &&
              !result.playUrl &&
              typeof result.url === "string" &&
              /\/video\//i.test(result.url)
            ) {
              result.playUrl = result.url;
            }
          });
          if (item.thumbVideo !== true) {
            var thumbEvidence = [item.thumbPlayUrl, item.thumb].some(
              function (url) {
                return (
                  typeof url === "string" &&
                  (/\/video\//i.test(url) || /=mm,\d+,\d+(?:$|[?#])/i.test(url))
                );
              },
            );
            if (thumbEvidence) item.thumbVideo = true;
          }
          if (
            item.genMode !== "api" &&
            [
              "PENDING",
              "SUBMITTING",
              "SUBMITTED",
              "MONITORING",
              "RETRY_SUBMIT",
              "WAITING_USER",
            ].indexOf(item.state) >= 0
          ) {
            item.state = "RECOVERY_REQUIRED";
            item.errorType = "page_reloaded";
            item.error = "FLOW_WEB_PAGE_RELOADED";
          }
          if (
            item.genMode === "api" &&
            ["SUBMITTED", "MONITORING"].indexOf(item.state) >= 0 &&
            !item.operationId
          ) {
            item.state = "RECOVERY_REQUIRED";
            item.errorType = "unknown";
            item.error = "FLOW_API_IMAGE_RECOVERY_REQUIRED";
          }
        });
        jobs.push(
          Object.assign({}, job, {
            _ftCachedJob: true,
            sessionId: session.id,
            projectId: record.projectId || projectId || null,
          }),
        );
      });
    });
    var latest = sessions[sessions.length - 1] || {};
    console.log(
      "[FloatingTracker/cache] media identity audit",
      cacheMediaAudit,
    );
    var snapshot = {
      schemaVersion: 1,
      projectId: record.projectId || projectId || null,
      sessionId: latest.id || null,
      isRunning: false,
      jobs,
    };
    Object.defineProperty(snapshot, "_ftRestoredCache", {
      value: true,
      enumerable: false,
    });
    snapshot.jobs = window.TrackerRegenProjection.jobs(snapshot.jobs);
    return snapshot;
  };
  FloatingTracker._FT_CACHE_TTL_MS = null;
  FloatingTracker._applyTrackerTtl = function (sys) {
    try {
      var h = Number(sys && sys.tracker_cache_ttl_hours);
      if (!(h > 0)) return;
      var ms = h * 60 * 60 * 1e3;
      if (ms === this._FT_CACHE_TTL_MS) return;
      this._FT_CACHE_TTL_MS = ms;
    } catch (_) {}
  };
  (function _initTrackerTtl() {
    try {
      chrome.storage.local.get(["af_system_settings"], function (res) {
        FloatingTracker._applyTrackerTtl(res && res.af_system_settings);
      });
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "local" || !changes.af_system_settings) return;
        FloatingTracker._applyTrackerTtl(changes.af_system_settings.newValue);
        FloatingTracker._applyLauncherBrand(
          changes.af_system_settings.newValue,
        );
      });
    } catch (_) {}
  })();
  FloatingTracker._saveTrackerCache = function (data) {
    try {
      var now = Date.now();
      var downloadSig = JSON.stringify(
        (data?.jobs || []).map(function (job) {
          return [
            job.id,
            (job.items || []).map(function (item) {
              return [
                item.id,
                item.state,
                (item.results || []).length,
                item.dl || null,
                (item.outputs || []).map(function (output) {
                  return [output.outputIndex, output.downloadStatus];
                }),
              ];
            }),
          ];
        }),
      );
      if (
        now - (this._ftCacheSaveAt || 0) < 1e3 &&
        downloadSig === this._ftCacheDownloadSig
      )
        return;
      var pid =
        (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
      if (!pid) return;
      if (
        !data ||
        data._ftRestoredCache === true ||
        !data.jobs ||
        !data.jobs.length
      )
        return;
      if (!this._trackerHistoryPolicy || !(this._FT_CACHE_TTL_MS > 0)) return;
      this._ftCacheSaveAt = now;
      this._ftCacheDownloadSig = downloadSig;
      var write = chrome.runtime
        .sendMessage({
          action: "ft:cacheSnapshot",
          key: this._FT_CACHE_KEY,
          projectId: pid,
          at: now,
          ttl: this._FT_CACHE_TTL_MS,
          max: this._trackerHistoryPolicy.maxProjects,
          maxSessions: this._trackerHistoryPolicy.maxSessions,
          maxItems: this._trackerHistoryPolicy.maxItems,
          data,
        })
        .catch(function () {
          return { ok: false };
        });
      this._lastCacheWritePromise = write;
      return write;
    } catch (_) {
      return null;
    }
  };
  FloatingTracker._trackerProjectCacheKey = function (pid) {
    return this._FT_CACHE_KEY + ":project:" + encodeURIComponent(pid);
  };
  FloatingTracker._ttlProtectedJobIds = function () {
    return [];
  };
  FloatingTracker._dropExpiredTrackerJobs = function (jobIds) {
    var remove = new Set(jobIds);
    if (!remove.size) return;
    if (!this._expiredTrackerJobIds) this._expiredTrackerJobIds = new Set();
    remove.forEach((id) => this._expiredTrackerJobIds.add(id));
    var self2 = this,
      changed = false,
      expiredItemIds = new Set();
    [
      "_lastData",
      "_gridOpenData",
      "_regenHistorySnapshot",
      "_nativeIdentitySourceData",
      "_gridApiLiveData",
    ].forEach(function (key) {
      var data = self2[key];
      if (!data?.jobs) return;
      data.jobs.forEach(function (job) {
        if (remove.has(job.id))
          (job.items || []).forEach(function (item) {
            if (item.id) expiredItemIds.add(item.id);
          });
      });
      var jobs = data.jobs.filter(function (job) {
        return !remove.has(job.id);
      });
      if (jobs.length === data.jobs.length) return;
      changed = true;
      var kept = Object.assign({}, data, {
        jobs,
        total: jobs.reduce(function (n, j) {
          return n + (j.items || []).length;
        }, 0),
        completed: jobs.reduce(function (n, j) {
          return n + Number(j.completed || 0);
        }, 0),
        failed: jobs.reduce(function (n, j) {
          return n + Number(j.failed || 0);
        }, 0),
      });
      ["_ftRestoredCache", "_ftHistoryMerged"].forEach(function (marker) {
        if (data[marker]) Object.defineProperty(kept, marker, { value: true });
      });
      self2[key] = kept;
    });
    if (typeof document !== "undefined") {
      Array.from(
        document.querySelectorAll(".tobyflow-ft-view-overlay"),
      ).forEach(function (view) {
        if (
          (view._ftItemIds || []).some(function (id) {
            return expiredItemIds.has(id);
          })
        ) {
          if (typeof view._ftCloseView === "function") view._ftCloseView();
          else view.remove();
        }
      });
    }
    Array.from(
      this._gridBody?.querySelectorAll(".tobyflow-ft-batch") || [],
    ).forEach(function (section) {
      var groups = section._vm?.items || [];
      if (
        groups.length &&
        groups.every(function (group) {
          return remove.has(group.jobId) || remove.has(section._vm.id);
        })
      )
        self2._releaseGridSection(section);
    });
    if (!changed) return;
    this._pruneTrackerItemState?.(this._lastData);
    this._lastJobsRenderSig = null;
    var hasRemainingJobs = [
      "_lastData",
      "_gridOpenData",
      "_regenHistorySnapshot",
      "_nativeIdentitySourceData",
      "_gridApiLiveData",
    ].some(function (key) {
      return self2[key]?.jobs?.length > 0;
    });
    if (!hasRemainingJobs) {
      this._closeGrid(true);
      this.hide();
      return;
    }
    if (this._hasLiveGrid?.()) {
      this._refreshGrid();
      this._refreshGridApiStatus(false);
    }
    if (this._el?.isConnected) {
      if (this._lastData?.jobs?.length) _origUpdate.call(this, this._lastData);
      else {
        this._releaseCompactRows?.();
        this._stopCompactElapsedTimer();
        this._stopAutoRefresh();
        this._el.style.display = "none";
        this._syncLauncherVisibility();
      }
      if (this._surfaceClosed) this._el.style.display = "none";
    }
  };
  FloatingTracker._loadTrackerCache = function (cb) {
    try {
      var self2 = this;
      var pid =
        (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
      if (!pid) {
        cb(null);
        return;
      }
      Promise.all([
        chrome.storage.local.get(["af_system_settings"]),
        chrome.runtime.sendMessage({
          action: "ft:getProjectHistory",
          key: this._FT_CACHE_KEY,
          projectId: pid,
        }),
      ])
        .then(function (values) {
          var res = values[0],
            reply = values[1];
          self2._applyTrackerTtl(res?.af_system_settings);
          if (
            !reply?.ok ||
            reply.projectId !== pid ||
            self.getCurrentProjectId?.() !== pid
          ) {
            cb(null);
            return;
          }
          self2._dropExpiredTrackerJobs?.(reply.expiredJobIds || []);
          var entry = reply.record;
          if (!entry) {
            cb(null);
            return;
          }
          var snapshot = self2._historyToSnapshot(entry.data || entry, pid);
          if (self2._FT_CACHE_TTL_MS > 0) {
            var jobs = (snapshot?.jobs || []).filter(function (job) {
              var historyAt =
                Math.max(
                  Number(job.completedAt) || 0,
                  ...(job.items || []).map(function (item) {
                    return Number(item.completedAt) || 0;
                  }),
                ) ||
                Number(job.startedAt) ||
                Number(entry.at) ||
                0;
              return Date.now() - historyAt < self2._FT_CACHE_TTL_MS;
            });
            if (!jobs.length) {
              cb(null);
              return;
            }
            var kept = Object.assign({}, snapshot, { jobs });
            if (snapshot._ftRestoredCache)
              Object.defineProperty(kept, "_ftRestoredCache", { value: true });
            snapshot = kept;
          }
          cb(self2._retainTrackerHistory?.(snapshot) || snapshot);
        })
        .catch(function () {
          cb(null);
        });
    } catch (_) {
      cb(null);
    }
  };
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      var pid =
        (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
      if (!pid) return;
      var change = changes[FloatingTracker._trackerProjectCacheKey(pid)];
      if (!change) return;
      var jobsOf = function (entry2) {
        var data = entry2?.data || entry2;
        return data?.sessions
          ? data.sessions.flatMap(function (session) {
              return session.jobs || [];
            })
          : data?.jobs || [];
      };
      var keptIds = new Set(
        jobsOf(change.newValue).map(function (job) {
          return job.id;
        }),
      );
      var removedIds = jobsOf(change.oldValue)
        .filter(function (job) {
          return !keptIds.has(job.id);
        })
        .flatMap(function (job) {
          return [job.id].concat(
            (job.items || [])
              .map(function (item) {
                return item._regenExecutionJobId;
              })
              .filter(Boolean),
          );
        });
      FloatingTracker._dropExpiredTrackerJobs?.(removedIds);
      var entry = change.newValue;
      if (!entry || FloatingTracker._lastData?._ftRestoredCache !== true)
        return;
      var snapshot = FloatingTracker._historyToSnapshot(
        entry.data || entry,
        pid,
      );
      if (snapshot) FloatingTracker.update(snapshot);
    });
  } catch (_) {}
  FloatingTracker._hydrateCachedMediaUrls = function (snapshot) {
    try {
      let patch2 = function (value, fields) {
        return Object.keys(fields).some((key) => value[key] !== fields[key])
          ? Object.assign({}, value, fields)
          : value;
      };
      var patch = patch2;
      var here = location.origin;
      var isCrossDomain = function (url) {
        if (typeof url !== "string" || !/^https?:/i.test(url)) return false;
        var origin;
        try {
          origin = new URL(url).origin;
        } catch (_) {
          return false;
        }
        return (
          (here === "https://flow.google.com" &&
            origin === "https://labs.google") ||
          (here === "https://labs.google" &&
            origin === "https://flow.google.com")
        );
      };
      var needsHydration = (snapshot?.jobs || []).some(function (job) {
        return (job.items || []).some(function (item) {
          return (
            isCrossDomain(item.thumb) ||
            (item.results || []).some(function (result) {
              return (
                isCrossDomain(result.url) ||
                isCrossDomain(result.thumbnail) ||
                isCrossDomain(result.playUrl)
              );
            }) ||
            (item.mentionData?.refImages || []).some(function (ref) {
              return isCrossDomain(ref.thumbnail_url);
            })
          );
        });
      });
      if (!needsHydration) return snapshot;
      var hydrated = snapshot;
      var live = {};
      var tiles = typeof _qa === "function" ? _qa("tile_container") : [];
      Array.from(tiles || []).forEach(function (tile) {
        var ids =
          typeof extractAllFileNames === "function"
            ? extractAllFileNames(tile)
            : [];
        var persistentId =
          typeof _getPersistentMediaId === "function"
            ? _getPersistentMediaId(tile)
            : null;
        var tileId =
          typeof _getTileRuntimeId === "function"
            ? _getTileRuntimeId(tile)
            : null;
        if (persistentId && ids.indexOf(persistentId) === -1)
          ids.push(persistentId);
        if (tileId && ids.indexOf(tileId) === -1) ids.push(tileId);
        if (ids.length === 0) return;
        var mediaType =
          typeof detectMediaType === "function" ? detectMediaType(tile) : null;
        var videoUrl =
          typeof extractVideoUrl === "function" ? extractVideoUrl(tile) : null;
        var thumbnailUrl =
          typeof extractThumbnailUrl === "function"
            ? extractThumbnailUrl(tile)
            : null;
        if (mediaType === "video")
          thumbnailUrl = _ftPosterSrcFromVideo2(thumbnailUrl) || thumbnailUrl;
        if (
          mediaType === "video" &&
          !videoUrl &&
          typeof _deriveFlowV2VideoUrlFromPoster === "function"
        ) {
          videoUrl = _deriveFlowV2VideoUrlFromPoster(thumbnailUrl);
        }
        var media = {
          url: mediaType === "video" ? videoUrl : thumbnailUrl,
          thumbnail: thumbnailUrl,
          video: mediaType === "video",
        };
        ids.forEach(function (id) {
          live[id] = Object.prototype.hasOwnProperty.call(live, id)
            ? null
            : media;
        });
      });
      var jobs = snapshot.jobs.map(function (job) {
        var items = (job.items || []).map(function (item) {
          var next = item;
          if (isCrossDomain(item.thumb)) {
            var thumbName = null;
            try {
              thumbName = new URL(item.thumb).searchParams.get("name");
            } catch (_) {}
            var thumbMedia = thumbName ? live[thumbName] : null;
            next = patch2(next, {
              thumb: thumbMedia
                ? thumbMedia.thumbnail || thumbMedia.url || null
                : null,
              ...(thumbMedia?.video ? { thumbVideo: true } : {}),
            });
          }
          var results = (item.results || []).map(function (result) {
            var ids = [
              result.fileName,
              result.file_name,
              result.mediaId,
              result.media_id,
              result.mediaUuid,
              result.media_uuid,
              result.tileId,
            ].filter(Boolean);
            var current = ids
              .map(function (id) {
                return live[id];
              })
              .find(Boolean);
            if (!current) return result;
            return patch2(result, {
              ...(current.url && !result.apiProvider && !result.downloadUrl
                ? { url: current.url }
                : {}),
              ...(current.thumbnail ? { thumbnail: current.thumbnail } : {}),
              ...(current.video ? { video: true, playUrl: current.url } : {}),
            });
          });
          if (results.some((result, index) => result !== item.results[index]))
            next = patch2(next, { results });
          var refs = (item.mentionData?.refImages || []).map(function (ref) {
            var ids = [
              ref.file_name,
              ref.fileName,
              ref.file_id,
              ref.fileId,
            ].filter(Boolean);
            var current = ids
              .map(function (id) {
                return live[id];
              })
              .find(Boolean);
            return current?.thumbnail
              ? patch2(ref, { thumbnail_url: current.thumbnail })
              : ref;
          });
          if (
            refs.some((ref, index) => ref !== item.mentionData.refImages[index])
          ) {
            next = patch2(next, {
              mentionData: Object.assign({}, item.mentionData, {
                refImages: refs,
              }),
            });
          }
          return next;
        });
        return items.some((item, index) => item !== job.items[index])
          ? Object.assign({}, job, { items })
          : job;
      });
      if (jobs.some((job, index) => job !== snapshot.jobs[index])) {
        hydrated = Object.assign({}, snapshot, { jobs });
        ["_ftRestoredCache", "_ftHistoryMerged"].forEach(function (key) {
          if (snapshot[key])
            Object.defineProperty(hydrated, key, { value: true });
        });
      }
    } catch (_) {}
    return typeof hydrated === "undefined" ? snapshot : hydrated;
  };
  (function _restoreTrackerFromCache() {
    try {
      FloatingTracker._loadTrackerCache(function (data) {
        if (!data) return;
        data =
          FloatingTracker._mergeGridHistory(data, FloatingTracker._lastData) ||
          data;
        if (data._ftRestoredCache !== true)
          Object.defineProperty(data, "_ftRestoredCache", {
            value: true,
            enumerable: false,
            configurable: true,
          });
        try {
          FloatingTracker.update(data);
        } catch (_) {}
      });
    } catch (_) {}
  })();
  FloatingTracker._findItem = function (jobId, itemId) {
    var data = this._lastData;
    if (!data || !data.jobs) return null;
    for (var ji = 0; ji < data.jobs.length; ji++) {
      var j = data.jobs[ji];
      if (jobId && j.id !== jobId) continue;
      var items = j.items || [];
      for (var ii = 0; ii < items.length; ii++) {
        if (items[ii].id === itemId) return items[ii];
      }
    }
    return null;
  };
  FloatingTracker._itemResultsOf = function (item) {
    if (item && item.results && item.results.length)
      return item.results.map(function (result) {
        var mountedVideo =
          result.video === true ? _ftMountedVideoPreview2(result) : null;
        var mediaId =
          result.mediaUuid ||
          result.media_uuid ||
          result.tileId ||
          result.mediaId ||
          null;
        var lineage = (item.flowApiLineage || []).find(function (entry) {
          return (
            entry.mediaId &&
            mediaId &&
            String(entry.mediaId).toLowerCase() ===
              String(mediaId).toLowerCase()
          );
        });
        var driver =
          result.apiDriver ||
          result.api_driver ||
          (item.flowApiAccepted === true ? item.flowApiDriver : null);
        return Object.assign({}, result, mountedVideo || {}, {
          apiDriver: driver || null,
          identityKind: result.identityKind || result.identity_kind || null,
          projectId:
            result.projectId || result.project_id || item.projectId || null,
          operationId:
            result.operationId ||
            result.operation_uuid ||
            lineage?.operationId ||
            (mediaId &&
            item.mediaId &&
            String(mediaId).toLowerCase() === String(item.mediaId).toLowerCase()
              ? item.operationId
              : null) ||
            null,
          protocolRevision:
            result.protocolRevision ||
            result.protocol_revision ||
            item.flowApiProtocolRevision ||
            null,
          protocolFingerprint:
            result.protocolFingerprint ||
            result.protocol_fingerprint ||
            item.flowApiProtocolFingerprint ||
            null,
        });
      });
    if (item && item.thumb)
      return this._itemResultsOf(
        Object.assign({}, item, {
          results: [
            {
              url: item.thumb,
              video: item.thumbVideo === true,
              poster: item.thumbPoster === true,
              playUrl: item.thumbPlayUrl || null,
              sourceThumbnail: item.thumbSourceThumbnail || null,
              mediaId: item.mediaId || null,
              tileId: null,
              fileName: null,
            },
          ],
        }),
      );
    return [];
  };
  FloatingTracker._videoPreviewResolveInflight = new Map();
  FloatingTracker._resolveVideoPreviewUrl = function (result) {
    var uuid =
      result && (result.mediaUuid || result.media_uuid || result.tileId);
    var projectId = result && (result.projectId || result.project_id);
    if (
      !result?.video ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(uuid || ""),
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(projectId || ""),
      )
    ) {
      return Promise.resolve(null);
    }
    var key =
      String(projectId).toLowerCase() + ":" + String(uuid).toLowerCase();
    function playbackOf(media) {
      if (media?.posterUrl) result.poster = media.posterUrl;
      return media?.url || null;
    }
    if (this._videoPreviewResolveInflight.has(key))
      return this._videoPreviewResolveInflight.get(key).then(playbackOf);
    var pending = new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          {
            action: "flowApiResolveMediaForDownload",
            payload: {
              mediaId: uuid,
              mediaType: "video",
              apiDriver: "v2",
              projectId,
              existingWebMedia: true,
            },
          },
          function (response) {
            if (
              chrome.runtime.lastError ||
              !response?.ok ||
              typeof response.url !== "string" ||
              !/^https:\/\//i.test(response.url) ||
              response.mediaId?.toLowerCase() !== String(uuid).toLowerCase()
            ) {
              console.warn(
                "[FloatingTracker/video] UUID preview resolve failed",
                JSON.stringify({
                  mediaUuid: String(uuid).slice(0, 8),
                  error:
                    chrome.runtime.lastError?.message ||
                    response?.error ||
                    "INVALID_RESOLVE_RESPONSE",
                }),
              );
              resolve(null);
              return;
            }
            console.info(
              "[FloatingTracker/video] UUID preview resolve success",
              JSON.stringify({
                mediaUuid: String(uuid).slice(0, 8),
                source: "flow_v2_resolve_media",
              }),
            );
            resolve({
              url: response.url,
              posterUrl: response.posterUrl || null,
            });
          },
        );
      } catch (_) {
        resolve(null);
      }
    }).finally(function () {
      FloatingTracker._videoPreviewResolveInflight.delete(key);
    });
    this._videoPreviewResolveInflight.set(key, pending);
    return pending.then(playbackOf);
  };
  FloatingTracker._enqueueGridPoster = function (cell, run) {
    if (!this._gridPosterQueue) this._gridPosterQueue = new Map();
    this._gridPosterQueue.set(cell, run);
    if (this._gridPosterFlight) return;
    var self2 = this;
    this._gridPosterFlight = Promise.resolve()
      .then(async function () {
        while (self2._gridPosterQueue.size) {
          var entry = self2._gridPosterQueue.entries().next().value;
          self2._gridPosterQueue.delete(entry[0]);
          if (!entry[0].isConnected || entry[0]._ftPreviewVisible === false)
            continue;
          try {
            await entry[1]();
          } catch (error) {
            console.warn(
              "[FloatingTracker/poster] static preview failed:",
              error?.name || "PREVIEW_FAILED",
            );
          }
          entry = null;
        }
      })
      .finally(function () {
        self2._gridPosterFlight = null;
        if (self2._gridPosterQueue.size) {
          var next = self2._gridPosterQueue.entries().next().value;
          self2._enqueueGridPoster(next[0], next[1]);
        }
      });
  };
  FloatingTracker._cancelGridPosterTask = function (cell) {
    if (!cell) return;
    this._gridPosterQueue?.delete(cell);
    cell._ftCancelPoster?.();
  };
  FloatingTracker._hydrateGridVideoPreviews = function (thumb, item) {
    var self2 = this;
    var results = this._itemResultsOf(item);
    var cells =
      results.length > 1
        ? Array.from(thumb.querySelectorAll("[data-view-idx]"))
        : [thumb];
    results.forEach(function (result, index) {
      var cell = cells[index];
      if (!cell || !result.video || cell.querySelector("img")) return;
      var token = {};
      cell._ftPosterToken = token;
      cell._ftPosterInterrupted = false;
      var hydrate = function () {
        var current = function () {
          return (
            cell.isConnected &&
            cell._ftPosterToken === token &&
            cell._ftPreviewVisible !== false
          );
        };
        self2._enqueueGridPoster(cell, async function () {
          try {
            if (!current()) return;
            var url = _ftDirectGridVideoSrc2(result);
            if (
              !result.poster &&
              (result.mediaUuid || result.media_uuid || result.tileId)
            ) {
              var resolved = await self2._resolveVideoPreviewUrl(result);
              if (!current()) return;
              url = resolved || url;
            }
            var poster = _ftThumbSrc2(result);
            if (
              poster &&
              (poster.indexOf("/asb/") < 0 ||
                result._mountedPoster ||
                result.nativeCatalogVerified)
            ) {
              if (current()) {
                cell.querySelector(".tf-skel")?.remove();
                cell.insertAdjacentHTML(
                  "afterbegin",
                  _ftThumbImg2(
                    poster,
                    "width:100%;height:100%;object-fit:contain;display:block;",
                    false,
                    false,
                    true,
                  ),
                );
                self2._observePreviewMedia(cell);
              }
              return;
            }
            if (!url || !current()) return;
            var settings = await new Promise(function (resolve) {
              chrome.storage.local.get(["af_system_settings"], function (data) {
                resolve(data?.af_system_settings);
              });
            });
            var timeout = Number(settings?.workflow_image_preview_timeout_ms);
            if (!(timeout > 0) || !current()) return;
            await self2._captureGridVideoPoster(cell, url, current, timeout);
          } finally {
            if (
              cell.isConnected &&
              cell._ftPosterToken === token &&
              cell._ftPosterInterrupted &&
              !cell.querySelector("img")
            ) {
              cell._ftPosterInterrupted = false;
              cell._ftPreviewHydrate = hydrate;
              if (cell._ftPreviewVisible === true) {
                cell._ftPreviewHydrate = null;
                hydrate();
              }
            }
          }
        });
      };
      cell._ftPosterHydrate = hydrate;
      cell._ftPreviewHydrate = hydrate;
      cell.setAttribute("data-ft-poster-owner", "");
      cell.setAttribute("data-ft-preview-hydrate", "");
      self2._observePreviewMedia(cell);
    });
  };
  FloatingTracker._captureGridVideoPoster = function (
    cell,
    url,
    current,
    timeout,
  ) {
    var self2 = this;
    return new Promise(function (resolve) {
      var video = document.createElement("video");
      var timer = null,
        finished = false;
      function done() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        video.removeEventListener("loadeddata", frame);
        video.removeEventListener("error", done);
        video.pause();
        video.removeAttribute("src");
        video.load();
        if (cell._ftCancelPoster === done) cell._ftCancelPoster = null;
        resolve();
      }
      function frame() {
        try {
          if (!current() || !video.videoWidth || !video.videoHeight) return;
          var canvas = document.createElement("canvas");
          canvas.width = Math.max(
            1,
            Math.min(video.videoWidth, Math.ceil(cell.clientWidth || 1)),
          );
          canvas.height = Math.max(
            1,
            Math.round((canvas.width * video.videoHeight) / video.videoWidth),
          );
          canvas
            .getContext("2d")
            .drawImage(video, 0, 0, canvas.width, canvas.height);
          var img = document.createElement("img");
          img.src = canvas.toDataURL("image/png");
          img.setAttribute("data-ft-preview-src", img.src);
          img.style.cssText =
            "width:100%;height:100%;object-fit:contain;display:block;";
          if (current()) {
            var placeholder = cell.querySelector(".tf-skel");
            if (placeholder) placeholder.replaceWith(img);
            else cell.insertBefore(img, cell.firstChild);
            self2._observePreviewMedia?.(cell);
          }
          canvas.width = canvas.height = 0;
        } catch (error) {
          console.warn(
            "[FloatingTracker/poster] frame unavailable:",
            error?.name || "PREVIEW_FAILED",
          );
        } finally {
          done();
        }
      }
      cell._ftCancelPoster = done;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.addEventListener("loadeddata", frame);
      video.addEventListener("error", done);
      timer = setTimeout(done, timeout);
      try {
        video.src = url;
        video.load();
      } catch (_) {
        done();
      }
    });
  };
  FloatingTracker._manualDlKey = function (result, index) {
    return String(
      (result &&
        (result.mediaUuid ||
          result.media_uuid ||
          result.mediaId ||
          result.fileName ||
          result.tileId ||
          result.url)) ||
        "result-" + (index || 0),
    );
  };
  FloatingTracker._setManualDownloadState = function (
    item,
    result,
    index,
    state,
    error,
    selection,
  ) {
    if (!item || !item.id) return;
    var bucket =
      this._manualDlStates[item.id] || (this._manualDlStates[item.id] = {});
    var resolution = String(selection?.resolution || "native").toLowerCase();
    var mode = selection?.mode || "inherit";
    var resultKey = this._manualDlKey(result, index);
    var aliases = [
      resultKey,
      result?.mediaUuid,
      result?.media_uuid,
      result?.mediaId,
      result?.fileName,
      result?.tileId,
      result?.url,
    ]
      .filter(Boolean)
      .map(String);
    Object.keys(bucket).forEach(function (k) {
      if (
        (index != null && bucket[k].resultIndex === index) ||
        aliases.some(function (alias) {
          return k === alias || k.indexOf(alias + "|download:") === 0;
        })
      )
        delete bucket[k];
    });
    var key = resultKey + "|download:" + resolution + ":" + mode;
    bucket[key] = {
      state,
      error: state === "failed" ? error || null : null,
      resultIndex: index,
      resolution,
      mode,
      updatedAt: Date.now(),
    };
    var vals = Object.keys(bucket).map(function (k) {
      return bucket[k];
    });
    var active = vals.some(function (v) {
      return v.state === "downloading";
    });
    var failed = vals.filter(function (v) {
      return v.state === "failed";
    }).length;
    var done = vals.filter(function (v) {
      return v.state === "done";
    }).length;
    var total = Math.max(this._itemResultsOf(item).length, vals.length);
    item.dl = {
      state: active
        ? "downloading"
        : failed
          ? "failed"
          : done === total
            ? "done"
            : done
              ? "partial"
              : "failed",
      completed: done,
      failed,
      total,
      manual: true,
    };
    this._lastJobsRenderSig = null;
    if (this._hasLiveGrid?.()) this._refreshGrid();
    try {
      if (this._lastData) _origUpdate.call(this, this._lastData);
    } catch (_) {}
  };
  FloatingTracker._manualDownloadStateOf = function (item, result, index) {
    var bucket = item && item.id ? this._manualDlStates[item.id] : null;
    if (!bucket) return null;
    var key = this._manualDlKey(result, index);
    var entries = Object.keys(bucket)
      .filter(function (k) {
        return (
          k === key ||
          k.indexOf(key + "|download:") === 0 ||
          (index != null && bucket[k].resultIndex === index)
        );
      })
      .map(function (k) {
        return bucket[k];
      });
    if (!entries.length) return null;
    var active = entries.some(function (v) {
      return v.state === "downloading";
    });
    var failed = entries.some(function (v) {
      return v.state === "failed";
    });
    var done = entries.some(function (v) {
      return v.state === "done";
    });
    return {
      state: active ? "downloading" : failed ? "failed" : "done",
      entries,
    };
  };
  FloatingTracker._manualDownloadLabel = function (status) {
    return (status.entries || [status])
      .map(function (v) {
        var label =
          v.state === "done"
            ? "\u2713 " + _getTrackerT2("dlDone")
            : v.state === "failed"
              ? _getTrackerT2("stateFailed")
              : _getTrackerT2("dlActive");
        return (
          (v.resolution ? v.resolution.toUpperCase() + " " : "") +
          label +
          (v.error ? " (" + v.error + ")" : "")
        );
      })
      .join(" \xB7 ");
  };
  FloatingTracker._showTrackerNotice = function (message, isError) {
    try {
      var old = document.getElementById("tobyflow-ft-notice");
      if (old) old.remove();
      var notice = document.createElement("div");
      notice.id = "tobyflow-ft-notice";
      notice.setAttribute("role", "status");
      notice.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:min(420px,calc(100vw - 36px));padding:10px 14px;border-radius:9px;background:#18181b;color:" +
        (isError ? "#fecaca" : "#fff") +
        ";border:1px solid " +
        (isError ? "rgba(239,68,68,.45)" : "rgba(255,255,255,.14)") +
        ';box-shadow:0 8px 28px rgba(0,0,0,.4);font:12px/1.45 "Inter","Segoe UI",system-ui,-apple-system,sans-serif;';
      notice.textContent = message;
      document.body.appendChild(notice);
      setTimeout(function () {
        try {
          notice.remove();
        } catch (_) {}
      }, 6e3);
    } catch (_) {}
  };
  FloatingTracker._isPipelineIdle = function () {
    var data = this._lastData;
    if (!data) return true;
    var active = [
      "PENDING",
      "SUBMITTING",
      "SUBMITTED",
      "MONITORING",
      "RETRY_SUBMIT",
      "WAITING_USER",
      "WAITING_PROVIDER",
      "RECOVERY_REQUIRED",
    ];
    var busy = false;
    var anyLive = false;
    var hasHeldJob = false;
    (data.jobs || []).forEach(function (j) {
      if (j.status === "stopped" || j.status === "paused") {
        hasHeldJob = true;
        return;
      }
      if (j.status === "completed") return;
      anyLive = true;
      (j.items || []).forEach(function (it) {
        if (active.indexOf(it.state) >= 0) busy = true;
      });
    });
    if (busy) return false;
    if (data.isRunning && (anyLive || !hasHeldJob)) return false;
    return true;
  };
  FloatingTracker._canClearTrackerHistory = function () {
    var data = this._lastData;
    return !!data && data.isRunning !== true && this._isPipelineIdle();
  };
  FloatingTracker._regenPayloadOf = function (it, jobId) {
    if (!it) return null;
    var candidates = [];
    var sourceJob =
      (this._lastData?.jobs || []).find(function (job) {
        return (job.items || []).some(function (item) {
          return item.id === it.id;
        });
      }) ||
      (this._lastData?.jobs || []).find(function (job) {
        return job.id === jobId;
      });
    (sourceJob?.items || [it]).forEach(function (sourceItem) {
      (sourceItem?.mentionData?.refImages || []).forEach(function (ref) {
        if (
          ref?.name &&
          ref?.file_id &&
          !candidates.some(function (existing) {
            return existing.name.toLowerCase() === ref.name.toLowerCase();
          })
        ) {
          candidates.push({
            name: ref.name,
            type: ref.type || "flow",
            source: ref.source || "tracker_history",
            file_id: ref.file_id,
            file_name: ref.file_name || null,
            thumbnail_url: /^https?:\/\//i.test(ref.thumbnail_url || "")
              ? ref.thumbnail_url
              : null,
          });
        }
      });
    });
    return {
      regenOf: it._regenSlotRoot || it.regenOf || null,
      regenDisplay: sourceJob
        ? {
            jobId: sourceJob.id,
            sessionId: sourceJob.sessionId || this._lastData?.sessionId || "",
            label: sourceJob.label || "",
            owner: sourceJob.owner || "",
            startedAt: sourceJob.startedAt || null,
          }
        : null,
      prompt: it.prompt || it.promptText || "",
      state: it.state || null,
      settings: {
        ...(sourceJob?.settings || {}),
        ...(it.settings || {}),
        genType:
          it.genType ||
          it.settings?.genType ||
          sourceJob?.settings?.genType ||
          null,
        ratio:
          it.ratio || it.settings?.ratio || sourceJob?.settings?.ratio || null,
        model:
          it.model || it.settings?.model || sourceJob?.settings?.model || null,
        quantity:
          it.quantity ||
          it.settings?.quantity ||
          sourceJob?.settings?.quantity ||
          null,
      },
      projectId: it.projectId || sourceJob?.projectId || null,
      refFileIds: Array.isArray(it.refFileIds) ? it.refFileIds : [],
      refFileNames: it.refFileNames || {},
      refThumbnails: it.refThumbnails || {},
      refImageMode: it.refImageMode || "none",
      mentionData: it.mentionData || null,
      mentionCandidates: candidates,
      autoDownload: it.autoDownload === true,
      downloadResolution: it.downloadResolution || null,
      videoDownloadResolution: it.videoDownloadResolution || null,
      taskName: it.taskName || null,
      sequentialMode:
        sourceJob?.sequentialMode === true ||
        sourceJob?.effectiveRunMode === "sequential",
      promptIndex: Number.isFinite(it.promptIndex) ? it.promptIndex : 0,
    };
  };
  FloatingTracker._wmAsk = async function (count, isVideo) {
    var st = await new Promise(function (r) {
      chrome.storage.local.get(
        ["af_system_settings", "af_entitlements", "af_settings"],
        r,
      );
    });
    var sysV =
      st && st.af_system_settings
        ? st.af_system_settings.remove_watermark_enabled
        : void 0;
    var wmEnabled = sysV === true || sysV === "1" || sysV === 1;
    var ent =
      st && st.af_entitlements && st.af_entitlements.entitlements
        ? (st.af_entitlements.entitlements.image_remove_watermark_enabled || {})
            .value
        : void 0;
    var can = wmEnabled && (ent === "1" || ent === 1 || ent === true);
    var setV =
      st && st.af_settings ? st.af_settings.autoRemoveWatermark : void 0;
    var prefer =
      setV === true || setV === "1" || setV === 1 ? "clean" : "original";
    var savedDownloadSettings = null;
    try {
      savedDownloadSettings = self.getDownloadSettings
        ? await self.getDownloadSettings()
        : null;
    } catch (_) {}
    return new Promise(function (resolve) {
      var ov = document.createElement("div");
      ov.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);";
      var CROWN =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="#eab308" style="vertical-align:-2px;margin-left:5px"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"></path></svg>';
      var title = wmEnabled
        ? count > 1
          ? (_getTrackerT2("wmAskTitleAll") || "").replace("{n}", count)
          : _getTrackerT2("wmAskTitle")
        : count > 1
          ? (_getTrackerT2("downloadOptionsTitleAll") || "").replace(
              "{n}",
              count,
            )
          : _getTrackerT2("downloadOptionsTitle");
      var PILL_WRAP =
        "display:flex;align-items:center;gap:5px;padding:4px;background:#181818;border:1px solid rgba(255,255,255,0.08);border-radius:8px;";
      var PILL_ITEM =
        "flex:1 1 0;min-width:0;white-space:nowrap;appearance:none;border:none;background:transparent;color:#8b8b92;padding:7px 10px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:background .15s ease,color .15s ease;";
      var ICO_ORIGINAL =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
      var ICO_CLEAN =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><g fill="currentColor"><path d="M2 14.25c.41 0 .75.34.75.75v2.5c0 2.07 1.68 3.75 3.75 3.75H9c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.89 0-5.25-2.35-5.25-5.25V15c0-.41.34-.75.75-.75m20 1c.41 0 .75.34.75.75v1.5c0 2.9-2.36 5.25-5.25 5.25H16c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.5c2.07 0 3.75-1.68 3.75-3.75V16c0-.41.34-.75.75-.75"></path><path fill-rule="evenodd" d="M14 5.75c2.42 0 3.75 1.33 3.75 3.75v1.75H19c.41 0 .75.34.75.75s-.34.75-.75.75h-1.25v1.75c0 2.42-1.33 3.75-3.75 3.75h-4c-2.42 0-3.75-1.33-3.75-3.75v-1.75H5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75h1.25V9.5c0-2.42 1.33-3.75 3.75-3.75zm-6.25 7v1.75c0 1.58.67 2.25 2.25 2.25h4c1.58 0 2.25-.67 2.25-2.25v-1.75zM10 7.25c-1.58 0-2.25.67-2.25 2.25v1.75h8.5V9.5c0-1.58-.67-2.25-2.25-2.25z" clip-rule="evenodd"></path><path d="M9 1.25c.41 0 .75.34.75.75s-.34.75-.75.75H6.5c-2.07 0-3.75 1.68-3.75 3.75V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.9 2.36-5.25 5.25-5.25zm8.5 0c2.89 0 5.25 2.35 5.25 5.25V9c0 .41-.34.75-.75.75s-.75-.34-.75-.75V6.5c0-2.07-1.68-3.75-3.75-3.75H15c-.41 0-.75-.34-.75-.75s.34-.75.75-.75z"></path></g></svg>';
      var ICO_DL =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      var resList = [];
      try {
        resList =
          (self._getDownloadResolutions &&
            self._getDownloadResolutions(!!isVideo)) ||
          [];
      } catch (_) {}
      var pickedRes = resList.length ? resList[0].value : null;
      try {
        var savedRes = savedDownloadSettings
          ? isVideo
            ? savedDownloadSettings.videoResolution
            : savedDownloadSettings.resolution
          : null;
        if (
          savedRes &&
          resList.some(function (x) {
            return x.value === savedRes;
          })
        )
          pickedRes = savedRes;
      } catch (_) {}
      var ROW =
        "display:flex;align-items:center;gap:5px;padding:4px;background:#181818;border:1px solid rgba(255,255,255,0.08);border-radius:8px;";
      var RES_ITEM =
        "flex:1 1 0;min-width:0;white-space:nowrap;appearance:none;border:none;background:transparent;color:#8b8b92;padding:6px 8px;font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;transition:background .15s ease,color .15s ease;";
      var resHtml = "";
      if (resList.length > 1) {
        resHtml =
          '<div style="margin-top:12px;font-size:11px;color:#8b8b92;margin-bottom:6px;">' +
          _getTrackerT2("wmResLabel") +
          '</div><div id="tobyWmRes" style="' +
          ROW +
          '">';
        for (var ri = 0; ri < resList.length; ri++) {
          resHtml +=
            '<button data-res="' +
            resList[ri].value +
            '" style="' +
            RES_ITEM +
            '">' +
            (resList[ri].menu_label || resList[ri].value) +
            "</button>";
        }
        resHtml += "</div>";
      }
      var wmHtml = wmEnabled
        ? '<div id="tobyWmPill" style="' +
          PILL_WRAP +
          '"><button data-wm="original" style="' +
          PILL_ITEM +
          '">' +
          ICO_ORIGINAL +
          "<span>" +
          _getTrackerT2("wmOriginal") +
          '</span></button><button data-wm="clean" style="' +
          PILL_ITEM +
          '">' +
          ICO_CLEAN +
          "<span>" +
          _getTrackerT2("wmClean") +
          (can ? "" : CROWN) +
          "</span></button></div>"
        : "";
      var wmNoteHtml = wmEnabled
        ? '<div style="margin-top:10px;font-size:11px;color:#8b8b92;line-height:1.45">' +
          _getTrackerT2("wmSizeNote") +
          "</div>"
        : "";
      ov.innerHTML =
        '<div style="min-width:420px;max-width:calc(100vw - 32px);background:#1c1c1f;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;color:#e8e8ea;font-family:&quot;Inter&quot;,&quot;Segoe UI&quot;,system-ui,-apple-system,sans-serif;position:relative;"><button id="tobyWmClose" aria-label="' +
        _getTrackerT2("closeTracker") +
        '" style="position:absolute;top:10px;right:10px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:6px;color:#8b8b92;cursor:pointer;padding:0;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></button><div style="font-size:13px;font-weight:600;margin-bottom:12px;padding-right:28px;">' +
        title +
        "</div>" +
        wmHtml +
        resHtml +
        wmNoteHtml +
        '<button id="tobyWmGo" style="margin-top:14px;width:100%;padding:10px 12px;border:none;border-radius:8px;background:#ffffff;color:#111111;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;">' +
        ICO_DL +
        "<span>" +
        _getTrackerT2("wmGo") +
        "</span></button></div>";
      var done = false;
      var finish = function (mode) {
        if (done) return;
        done = true;
        try {
          ov.remove();
        } catch (_) {}
        resolve(
          mode === null
            ? { mode: null, resolution: null, resolutionMedia: null }
            : {
                mode,
                resolution: pickedRes,
                resolutionMedia: isVideo ? "video" : "image",
              },
        );
      };
      var picked = wmEnabled
        ? prefer === "clean" && can
          ? "clean"
          : "original"
        : "inherit";
      var paint = function () {
        var items = ov.querySelectorAll("button[data-wm]");
        for (var i = 0; i < items.length; i++) {
          var on = items[i].dataset.wm === picked;
          items[i].style.background = on
            ? picked === "clean" && !can
              ? "rgba(234,179,8,0.16)"
              : "#ccff00"
            : "transparent";
          items[i].style.color = on
            ? picked === "clean" && !can
              ? "#eab308"
              : "#1e1e1e"
            : "#8b8b92";
          items[i].style.fontWeight = on ? "600" : "500";
        }
        var rs = ov.querySelectorAll("button[data-res]");
        for (var k = 0; k < rs.length; k++) {
          var onR = rs[k].dataset.res === pickedRes;
          rs[k].style.background = onR ? "#ccff00" : "transparent";
          rs[k].style.color = onR ? "#1e1e1e" : "#8b8b92";
          rs[k].style.fontWeight = onR ? "600" : "500";
        }
      };
      ov.addEventListener("click", function (e) {
        if (e.target === ov) {
          finish(null);
          return;
        }
        if (e.target.closest && e.target.closest("#tobyWmClose")) {
          finish(null);
          return;
        }
        var go = e.target.closest ? e.target.closest("#tobyWmGo") : null;
        if (go) {
          if (picked === "clean" && !can) {
            try {
              chrome.runtime.sendMessage({ action: "showUpgradeModal" });
            } catch (_) {}
            return;
          }
          finish(picked);
          return;
        }
        var rbtn = e.target.closest
          ? e.target.closest("button[data-res]")
          : null;
        if (rbtn) {
          pickedRes = rbtn.dataset.res;
          paint();
          return;
        }
        var btn = e.target.closest ? e.target.closest("button[data-wm]") : null;
        if (!btn) return;
        picked = btn.dataset.wm;
        paint();
        if (picked === "clean" && !can) {
          try {
            chrome.runtime.sendMessage({ action: "showUpgradeModal" });
          } catch (_) {}
        }
      });
      document.body.appendChild(ov);
      paint();
    });
  };
  FloatingTracker._wmMeansOriginalIsClean = function (result) {
    var reason = result && (result.reason || result.error);
    return (
      reason === "not_found" ||
      reason === "below_threshold" ||
      reason === "already_clean_output"
    );
  };
  FloatingTracker._dlUrl = async function (
    url,
    filename,
    mediaType,
    wmMode,
    requestId,
  ) {
    var on = false;
    if (wmMode === "clean") on = true;
    else if (wmMode === "original") on = false;
    else {
      try {
        on = await self._shouldRemoveWatermark(mediaType);
      } catch (_) {}
    }
    if (on && !filename) {
      console.warn(
        "[Tracker] b\u1ECF qua xo\xE1 watermark: kh\xF4ng c\xF3 t\xEAn file, data: URL s\u1EBD m\u1EA5t t\xEAn",
      );
      on = false;
    }
    if (on) {
      var b64 = null,
        mime = null;
      try {
        var r0;
        try {
          r0 = await fetch(url, { cache: "no-store" });
        } catch (e1) {
          r0 = await fetch(url, { credentials: "include", cache: "no-store" });
        }
        if (!r0.ok) throw new Error("HTTP " + r0.status);
        var bl = await r0.blob();
        mime = bl.type || (mediaType === "video" ? "video/mp4" : "image/png");
        b64 = await new Promise(function (res, rej) {
          var fr = new FileReader();
          fr.onload = function () {
            res(String(fr.result).split(",")[1]);
          };
          fr.onerror = function () {
            rej(new Error("\u0111\u1ECDc blob th\u1EA5t b\u1EA1i"));
          };
          fr.readAsDataURL(bl);
        });
      } catch (e) {
        console.warn(
          "[Tracker] watermark: kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c bytes \u2192",
          e && e.message,
        );
      }
      var wm = null;
      if (b64 && mediaType === "video") {
        var videoClean = await new Promise(function (resolve) {
          chrome.runtime.sendMessage(
            { action: "wm:cleanVideo", base64: b64, mime: mime || "video/mp4" },
            function (resp) {
              resolve(chrome.runtime.lastError ? null : resp);
            },
          );
        });
        if (videoClean && videoClean.ok && videoClean.base64) {
          wm = await chrome.runtime.sendMessage({
            action: "removeWatermarkAndDownload",
            base64: videoClean.base64,
            mime: videoClean.mime || mime || "video/mp4",
            filename,
            mediaType: "video",
            alreadyClean: true,
            waitForComplete: true,
            flowApiDownloadRetry: true,
            waitTimeoutMs: 6e5,
            requestId,
          });
        }
      } else if (b64) {
        wm = await new Promise(function (resolve) {
          chrome.runtime.sendMessage(
            {
              action: "removeWatermarkAndDownload",
              base64: b64,
              mime,
              filename,
              mediaType,
              waitForComplete: true,
              flowApiDownloadRetry: true,
              waitTimeoutMs: 6e5,
              requestId,
            },
            function (resp) {
              resolve(chrome.runtime.lastError ? null : resp);
            },
          );
        });
      }
      if (wm && wm.success && wm.applied !== false) return true;
      if (wm && wm.downloadId != null) return false;
      if (
        FloatingTracker._wmMeansOriginalIsClean(wm) ||
        FloatingTracker._wmMeansOriginalIsClean(videoClean)
      ) {
        console.info(
          "[FloatingTracker/download] watermark not detected; downloading original:",
          (wm && (wm.reason || wm.error)) ||
            (videoClean && (videoClean.reason || videoClean.error)),
        );
      } else {
        if (wmMode === "clean" && wm && wm.success && wm.applied === false) {
          console.warn(
            "[FloatingTracker/download] watermark clean skipped:",
            wm.reason || "NOT_DETECTED",
          );
          return false;
        }
        if (wmMode === "clean" && wm && wm.success === false) {
          console.warn(
            "[FloatingTracker/download] watermark clean failed:",
            wm.reason || wm.error || "CLEAN_FAILED",
          );
          return false;
        }
        if (wmMode === "clean") {
          console.warn(
            "[FloatingTracker/download] watermark clean unavailable; original download suppressed",
          );
          return false;
        }
      }
    }
    try {
      var dl = await chrome.runtime.sendMessage({
        action: "chromeDownload",
        url,
        filename,
        waitForComplete: true,
        flowApiDownloadRetry: true,
        waitTimeoutMs: 10 * 60 * 1e3,
        requestId,
      });
      return !!(dl && dl.success);
    } catch (_) {
      return false;
    }
  };
  FloatingTracker._dlBase64 = async function (
    base64,
    mime,
    filename,
    mediaType,
    wmMode,
    requestId,
  ) {
    if (!base64 || !filename) return false;
    var clean = wmMode === "clean";
    if (wmMode !== "clean" && wmMode !== "original") {
      try {
        clean = await self._shouldRemoveWatermark(mediaType);
      } catch (_) {
        clean = false;
      }
    }
    if (clean) {
      try {
        var cleaned;
        if (mediaType === "video") {
          var videoClean = await chrome.runtime.sendMessage({
            action: "wm:cleanVideo",
            base64,
            mime: mime || "video/mp4",
          });
          cleaned =
            videoClean && videoClean.ok && videoClean.base64
              ? await chrome.runtime.sendMessage({
                  action: "removeWatermarkAndDownload",
                  base64: videoClean.base64,
                  mime: videoClean.mime || mime || "video/mp4",
                  filename,
                  mediaType: "video",
                  alreadyClean: true,
                  waitForComplete: true,
                  flowApiDownloadRetry: true,
                  waitTimeoutMs: 6e5,
                  requestId,
                })
              : null;
        } else {
          cleaned = await chrome.runtime.sendMessage({
            action: "removeWatermarkAndDownload",
            base64,
            mime,
            filename,
            mediaType,
            waitForComplete: true,
            flowApiDownloadRetry: true,
            waitTimeoutMs: 6e5,
            requestId,
          });
        }
        if (cleaned && cleaned.success && cleaned.applied !== false)
          return true;
        if (cleaned && cleaned.downloadId != null) return false;
        if (
          FloatingTracker._wmMeansOriginalIsClean(cleaned) ||
          FloatingTracker._wmMeansOriginalIsClean(videoClean)
        ) {
          console.info(
            "[FloatingTracker/download] watermark not detected; downloading original:",
            (cleaned && (cleaned.reason || cleaned.error)) ||
              (videoClean && (videoClean.reason || videoClean.error)),
          );
          clean = false;
        } else if (
          wmMode === "clean" &&
          cleaned &&
          cleaned.success &&
          cleaned.applied === false
        ) {
          console.warn(
            "[FloatingTracker/download] watermark clean skipped:",
            cleaned.reason || "NOT_DETECTED",
          );
          return false;
        }
      } catch (_) {}
      if (clean && wmMode === "clean") {
        console.warn(
          "[FloatingTracker/download] watermark clean failed; original download suppressed",
        );
        return false;
      }
    }
    try {
      var result = await chrome.runtime.sendMessage({
        action: "removeWatermarkAndDownload",
        base64,
        mime: mime || (mediaType === "video" ? "video/mp4" : "image/png"),
        filename,
        mediaType,
        alreadyClean: true,
        waitForComplete: true,
        flowApiDownloadRetry: true,
        waitTimeoutMs: 6e5,
        requestId,
      });
      return !!(result && result.success);
    } catch (_) {
      return false;
    }
  };
  FloatingTracker._apiWebDownloadIdentity = function (item, result) {
    var uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var ids = [
      result.mediaUuid,
      result.media_uuid,
      result.mediaId,
      result.fileName,
      result.tileId,
      result.video ? item.id : null,
    ].filter(function (id2) {
      return (
        typeof id2 === "string" &&
        (uuidPattern.test(id2) || (result.video && id2.indexOf("AB-") === 0))
      );
    });
    if (!ids.length) return { ok: false, error: "FLOW_WEB_MEDIA_ID_MISSING" };
    var projectId = result.projectId || item.projectId || null;
    var currentProject =
      typeof getCurrentProjectId === "function" ? getCurrentProjectId() : null;
    if (
      projectId &&
      String(projectId).toLowerCase() !==
        String(currentProject || "").toLowerCase()
    ) {
      return { ok: false, error: "PROJECT_MISMATCH" };
    }
    var catalog = null;
    try {
      catalog =
        typeof _lookupFlowMediaCatalog === "function"
          ? _lookupFlowMediaCatalog(ids)
          : null;
    } catch (error) {
      console.warn(
        "[FloatingTracker/download] catalog unavailable; checking exact mounted owner",
        error.message || error,
      );
    }
    if (
      projectId &&
      catalog?.projectId &&
      String(catalog.projectId).toLowerCase() !==
        String(projectId).toLowerCase()
    )
      return { ok: false, error: "PROJECT_MISMATCH" };
    var known = ids
      .map(function (id2) {
        return catalog?.known?.[id2];
      })
      .find(function (media2) {
        return media2?.type === (result.video ? "video" : "image");
      });
    var ownerUuid = ids.find(function (id2) {
      return uuidPattern.test(id2);
    });
    if (
      ownerUuid &&
      known?.media_uuid &&
      String(known.media_uuid).toLowerCase() !== ownerUuid.toLowerCase()
    )
      return { ok: false, error: "FLOW_WEB_MEDIA_IDENTITY_MISMATCH" };
    var catalogIdentity = result.video
      ? known?.persistent_media_id
      : known?.media_uuid;
    if (
      catalogIdentity &&
      (result.video
        ? String(catalogIdentity).indexOf("AB-") === 0
        : uuidPattern.test(catalogIdentity))
    ) {
      return { ok: true, fileName: catalogIdentity, tileId: catalogIdentity };
    }
    if (
      (result.apiDriver ||
        result.api_driver ||
        (item.flowApiAccepted === true ? item.flowApiDriver : null)) === "v2"
    ) {
      var mounted =
        typeof _getTileById === "function" &&
        ids.find(function (id2) {
          return (
            (!ownerUuid ||
              !uuidPattern.test(id2) ||
              id2.toLowerCase() === ownerUuid.toLowerCase()) &&
            _getTileById(id2)?.isConnected
          );
        });
      if (!mounted) {
        return {
          ok: false,
          error: "FLOW_WEB_RESULT_NOT_SYNCED",
          reason: "Retry API or refresh Flow after generation finishes",
        };
      }
      if (result.video) return { ok: true, fileName: mounted, tileId: mounted };
    }
    if (!result.video) return { ok: true, fileName: ids[0], tileId: ids[0] };
    if (typeof _getTileById === "function") {
      var mountedUuid = ids.find(function (id2) {
        return uuidPattern.test(id2) && _getTileById(id2)?.isConnected;
      });
      if (mountedUuid)
        return { ok: true, fileName: mountedUuid, tileId: mountedUuid };
    }
    for (var id of ids) {
      var media = catalog && catalog.known && catalog.known[id];
      if (
        media &&
        media.type === "video" &&
        /^[A-Za-z0-9_-]{32,1024}$/.test(String(media.persistent_media_id || ""))
      ) {
        return {
          ok: true,
          fileName: media.persistent_media_id,
          tileId: media.persistent_media_id,
        };
      }
    }
    return { ok: false, error: "FLOW_WEB_MEDIA_CATALOG_PENDING" };
  };
  FloatingTracker._downloadResultCore = async function (
    item,
    result,
    index,
    wmMode,
    operationKey,
    operationToken,
  ) {
    var self2 = this;
    var cancelled = function () {
      return (
        operationKey &&
        self2._manualDlOpTokens?.[operationKey] !== operationToken
      );
    };
    var downloadSelection =
      wmMode && typeof wmMode === "object" ? wmMode : { mode: wmMode };
    this._setManualDownloadState(
      item,
      result,
      index,
      "downloading",
      null,
      downloadSelection,
    );
    function finish(outcome) {
      if (
        operationKey &&
        self2._manualDlOpTokens?.[operationKey] !== operationToken
      )
        return outcome;
      if (operationKey && self2._manualDlOpTokens)
        delete self2._manualDlOpTokens[operationKey];
      var ok = !!(outcome && outcome.ok);
      self2._setManualDownloadState(
        item,
        result,
        index,
        ok ? "done" : "failed",
        ok ? null : outcome && outcome.error,
        downloadSelection,
      );
      return outcome;
    }
    try {
      var _wm =
        wmMode && typeof wmMode === "object"
          ? wmMode
          : { mode: wmMode, resolution: null };
      var wmPick =
        _wm.mode === "clean" || _wm.mode === "original" ? _wm.mode : null;
      var _mediaKind = result.video ? "video" : "image";
      var wmRes =
        !_wm.resolutionMedia || _wm.resolutionMedia === _mediaKind
          ? _wm.resolution || null
          : null;
      if (_wm.resolutionMedia && _wm.resolutionMedia !== _mediaKind) {
        try {
          var mixedSettings = self.getDownloadSettings
            ? await self.getDownloadSettings()
            : null;
          wmRes = mixedSettings
            ? result.video
              ? mixedSettings.videoResolution
              : mixedSettings.resolution
            : null;
        } catch (_) {
          wmRes = null;
        }
      }
      var durableDownloadUrl =
        result.downloadUrl ||
        (String(result.url || "").includes("media.getMediaUrlRedirect")
          ? result.url
          : null);
      var explicitWebResult = item.genMode === "web";
      var isApiResult =
        !explicitWebResult &&
        (item.genMode === "api" ||
          result.apiProvider === true ||
          !!durableDownloadUrl);
      if (!isApiResult && !result.video && !result.tileId) {
        var bareImageId = String(result.url || "").match(
          /^https:\/\/flow-content\.google\/image\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i,
        )?.[1];
        if (bareImageId)
          result = Object.assign({}, result, {
            tileId: bareImageId,
            mediaUuid: result.mediaUuid || bareImageId,
          });
      }
      var apiWebIdentity = null;
      {
        var storedDownloadSettings = await chrome.storage.local.get([
          "af_settings",
        ]);
        var apiFlag =
          storedDownloadSettings &&
          storedDownloadSettings.af_settings &&
          storedDownloadSettings.af_settings.apiModeEnabled;
        var apiEnabledForDownload =
          apiFlag === true || apiFlag === "true" || apiFlag === 1;
        if (explicitWebResult) {
          apiWebIdentity = this._apiWebDownloadIdentity(item, result);
          if (!apiWebIdentity.ok) return finish(apiWebIdentity);
        } else if (apiEnabledForDownload && !isApiResult) {
          var webCatalogIds = [
            result.mediaUuid,
            result.media_uuid,
            result.mediaId,
            result.fileName,
            result.tileId,
          ].filter(Boolean);
          var webCatalog =
            typeof _lookupFlowMediaCatalog === "function"
              ? _lookupFlowMediaCatalog(webCatalogIds)
              : null;
          var webApiMedia = webCatalogIds
            .map(function (id) {
              return webCatalog && webCatalog.known && webCatalog.known[id];
            })
            .find(function (media) {
              return (
                media &&
                media.driver_key === "flow_v2" &&
                media.type === _mediaKind
              );
            });
          if (webApiMedia) {
            result = Object.assign({}, result, {
              mediaUuid: webApiMedia.media_uuid,
              apiDriver: "v2",
              projectId:
                result.projectId || item.projectId || webCatalog.projectId,
              existingWebMedia: true,
            });
          } else if (
            !result.video &&
            typeof _flowPageContext !== "undefined" &&
            _flowPageContext?.driverKey === "flow_v2"
          ) {
            var existingImageUuid = webCatalogIds.find(function (id) {
              return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                String(id),
              );
            });
            if (existingImageUuid)
              result = Object.assign({}, result, {
                mediaUuid: existingImageUuid,
                apiDriver: "v2",
                projectId:
                  result.projectId ||
                  item.projectId ||
                  (typeof getCurrentProjectId === "function"
                    ? getCurrentProjectId()
                    : null),
                existingWebMedia: true,
              });
          }
          isApiResult = true;
        }
        if (
          isApiResult &&
          (apiFlag === false || apiFlag === "false" || apiFlag === 0)
        ) {
          apiWebIdentity = this._apiWebDownloadIdentity(item, result);
          if (!apiWebIdentity.ok) return finish(apiWebIdentity);
        }
      }
      if (isApiResult && !apiWebIdentity) {
        var apiAttemptMutating = false;
        async function attemptApiDownload() {
          var needsUpscale = false;
          try {
            var upscaleClass = self._isFlowApiUpscaleResolution
              ? self._isFlowApiUpscaleResolution(!!result.video, wmRes)
              : null;
            if (wmRes && upscaleClass === null) {
              console.warn(
                "[FloatingTracker] download resolution config missing:",
                wmRes,
              );
              return { ok: false, error: "FLOW_DOWNLOAD_CONFIG_MISSING" };
            }
            needsUpscale = upscaleClass === true;
          } catch (_) {
            return { ok: false, error: "FLOW_DOWNLOAD_CONFIG_MISSING" };
          }
          var preflight = await chrome.runtime.sendMessage({
            action: "flowApiDownloadPreflight",
            payload: {
              mediaType: result.video ? "video" : "image",
              requireUpscale: needsUpscale,
              apiDriver: result.apiDriver || null,
              mediaId:
                result.mediaUuid || result.media_uuid || result.mediaId || null,
              projectId: result.projectId || item.projectId || null,
              operationId: result.operationId || null,
              protocolRevision: result.protocolRevision || null,
              protocolFingerprint: result.protocolFingerprint || null,
              legacyV1Provenance:
                !result.apiDriver &&
                result.apiProvider === true &&
                result.identityKind === "flow-api-uuid",
              existingWebMedia: result.existingWebMedia === true,
            },
          });
          if (cancelled()) return { ok: false, error: "DOWNLOAD_STOPPED" };
          if (!preflight || !preflight.ok) {
            var apiFailure =
              (preflight && preflight.error) || "FLOW_API_PREFLIGHT_FAILED";
            var preflightDetails = JSON.stringify({
              error: preflight && preflight.error,
              hasMediaId: !!(result.mediaId || result.fileName),
              mediaType: result.video ? "video" : "image",
              requireUpscale: needsUpscale,
            });
            console.info(
              "[FloatingTracker] Flow API download unavailable:",
              preflightDetails,
            );
            return {
              ...preflight,
              ok: false,
              error: apiFailure,
              stage: preflight?.stage || "preflight",
              dispatchStarted: false,
              noWebFallback: false,
            };
          }
          var s = await self.getDownloadSettings();
          var fn = self
            ._buildFilename({
              template: s.template,
              project: s.project,
              prompt: item.promptText || "flow",
              index,
              taskName: item.taskName,
              folder: s.folder,
              ext: result.video ? "mp4" : "png",
            })
            .replace(/\.(png|mp4)$/i, "");
          var upscaleMediaId =
            result.mediaUuid ||
            result.media_uuid ||
            result.mediaId ||
            result.fileName ||
            result.tileId ||
            null;
          if (needsUpscale && upscaleMediaId) {
            if (cancelled()) return { ok: false, error: "DOWNLOAD_STOPPED" };
            apiAttemptMutating = true;
            var upscale = await chrome.runtime.sendMessage({
              action: "flowApiUpscaleForDownload",
              payload: {
                mediaId: upscaleMediaId,
                mediaType: result.video ? "video" : "image",
                resolution: wmRes,
                ratio: item.ratio || null,
                apiDriver: result.apiDriver || null,
                projectId: result.projectId || item.projectId || null,
                operationId: result.operationId || null,
                protocolRevision: result.protocolRevision || null,
                protocolFingerprint: result.protocolFingerprint || null,
                legacyV1Provenance:
                  !result.apiDriver &&
                  result.apiProvider === true &&
                  result.identityKind === "flow-api-uuid",
                existingWebMedia: result.existingWebMedia === true,
              },
            });
            if (cancelled())
              return {
                ok: false,
                error: "DOWNLOAD_STOPPED",
                noWebFallback: true,
              };
            if (upscale && upscale.ok) {
              var upOk = false;
              if (upscale.base64) {
                var upExt = result.video
                  ? "mp4"
                  : upscale.mime === "image/webp"
                    ? "webp"
                    : String(upscale.mime || "").includes("jpeg")
                      ? "jpg"
                      : "png";
                upOk = await FloatingTracker._dlBase64(
                  upscale.base64,
                  upscale.mime,
                  fn + "_" + wmRes + "." + upExt,
                  result.video ? "video" : "image",
                  wmPick,
                  operationToken,
                );
              } else if (upscale.videoUrl) {
                upOk = await FloatingTracker._dlUrl(
                  upscale.videoUrl,
                  fn + "_" + wmRes + ".mp4",
                  "video",
                  wmPick,
                  operationToken,
                );
              }
              if (upOk) {
                console.log(
                  "[FloatingTracker] API upscale download:",
                  upscale.route,
                  wmRes,
                );
                return { ok: true };
              }
              console.warn(
                "[FloatingTracker] API upscale bytes resolved but download failed",
              );
            } else {
              console.warn(
                "[FloatingTracker] API upscale failed:",
                JSON.stringify({
                  error: upscale?.error || null,
                  commandLayer: upscale?.commandLayer || null,
                  commandRejectReason: upscale?.commandRejectReason || null,
                  stage: upscale?.stage || null,
                  ambiguous: upscale?.ambiguous === true,
                }),
              );
            }
            return {
              ...upscale,
              ok: false,
              error:
                upscale?.grpcReason ||
                upscale?.providerErrorCodes?.[0] ||
                upscale?.error ||
                "FLOW_API_UPSCALE_FAILED",
              noWebFallback:
                upscale?.ok === true ||
                upscale?.ambiguous === true ||
                !(
                  upscale?.dispatchStarted === false ||
                  ["pre_dispatch", "preflight"].indexOf(upscale?.stage) !== -1
                ),
            };
          }
          if (needsUpscale)
            return { ok: false, error: "FLOW_API_UPSCALE_MEDIA_ID_MISSING" };
          var nativeResolved = null;
          var resolveNative = async function () {
            if (!upscaleMediaId)
              return { ok: false, error: "API_MEDIA_ID_MISSING" };
            return await chrome.runtime.sendMessage({
              action: "flowApiResolveMediaForDownload",
              payload: {
                mediaId: upscaleMediaId,
                mediaType: result.video ? "video" : "image",
                apiDriver: result.apiDriver || null,
                projectId: result.projectId || item.projectId || null,
                operationId: result.operationId || null,
                protocolRevision: result.protocolRevision || null,
                protocolFingerprint: result.protocolFingerprint || null,
                legacyV1Provenance:
                  !result.apiDriver &&
                  result.apiProvider === true &&
                  result.identityKind === "flow-api-uuid",
                existingWebMedia: result.existingWebMedia === true,
              },
            });
          };
          var hasApiUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              String(upscaleMediaId || ""),
            );
          var nativeNeedsResolve =
            hasApiUuid ||
            !durableDownloadUrl ||
            durableDownloadUrl.includes("media.getMediaUrlRedirect");
          if (nativeNeedsResolve) {
            nativeResolved = await resolveNative();
            if (cancelled()) return { ok: false, error: "DOWNLOAD_STOPPED" };
            if (
              !nativeResolved?.ok ||
              (!nativeResolved.base64 && !nativeResolved.url)
            ) {
              console.warn(
                "[FloatingTracker] API native media resolve failed:",
                nativeResolved?.error || "NO_MEDIA",
              );
              return {
                ...nativeResolved,
                ok: false,
                error: nativeResolved?.error || "FLOW_API_MEDIA_RESOLVE_FAILED",
                noWebFallback: false,
              };
            }
          }
          console.log("[FloatingTracker] API direct download:", {
            media: result.video ? "video" : "image",
            resolution: wmRes || "native",
            source: nativeResolved ? "uuid-resolve" : "durable",
            upscaleFallback: false,
          });
          var apiOk = false;
          if (nativeResolved) {
            var nativeExt = result.video
              ? "mp4"
              : String(nativeResolved.mime || "").includes("jpeg")
                ? "jpg"
                : String(nativeResolved.mime || "").includes("webp")
                  ? "webp"
                  : "png";
            apiOk = nativeResolved.base64
              ? await FloatingTracker._dlBase64(
                  nativeResolved.base64,
                  nativeResolved.mime,
                  fn + "." + nativeExt,
                  result.video ? "video" : "image",
                  wmPick,
                  operationToken,
                )
              : await FloatingTracker._dlUrl(
                  nativeResolved.url,
                  fn + "." + nativeExt,
                  result.video ? "video" : "image",
                  wmPick,
                  operationToken,
                );
          } else {
            apiOk = await FloatingTracker._dlUrl(
              durableDownloadUrl,
              fn,
              result.video ? "video" : "image",
              wmPick,
              operationToken,
            );
            if (!apiOk && upscaleMediaId) {
              nativeResolved = await resolveNative();
              if (
                nativeResolved?.ok &&
                (nativeResolved.base64 || nativeResolved.url)
              ) {
                var refreshedExt = result.video
                  ? "mp4"
                  : String(nativeResolved.mime || "").includes("jpeg")
                    ? "jpg"
                    : String(nativeResolved.mime || "").includes("webp")
                      ? "webp"
                      : "png";
                apiOk = nativeResolved.base64
                  ? await FloatingTracker._dlBase64(
                      nativeResolved.base64,
                      nativeResolved.mime,
                      fn + "." + refreshedExt,
                      result.video ? "video" : "image",
                      wmPick,
                      operationToken,
                    )
                  : await FloatingTracker._dlUrl(
                      nativeResolved.url,
                      fn + "." + refreshedExt,
                      result.video ? "video" : "image",
                      wmPick,
                      operationToken,
                    );
              }
            }
          }
          return apiOk
            ? { ok: true }
            : { ok: false, error: "DOWNLOAD_FAILED", noWebFallback: true };
        }
        var apiOutcome;
        try {
          apiOutcome = await attemptApiDownload();
        } catch (apiError) {
          apiOutcome = {
            ok: false,
            error: apiError.message || "FLOW_API_DOWNLOAD_FAILED",
            ambiguous: apiAttemptMutating,
          };
        }
        if (cancelled()) return { ok: false, error: "DOWNLOAD_STOPPED" };
        if (apiOutcome.ok) return finish(apiOutcome);
        if (apiOutcome.noWebFallback === false) {
          apiWebIdentity = this._apiWebDownloadIdentity(item, result);
          if (apiWebIdentity.ok) {
            console.warn(
              "[FloatingTracker/download] API unavailable before dispatch; route=web",
              JSON.stringify({
                error: apiOutcome.error || null,
                stage: apiOutcome.stage || null,
                media: result.video ? "video" : "image",
              }),
            );
          } else {
            FloatingTracker._showTrackerNotice(
              String(wmRes || "").toUpperCase() +
                ": " +
                (apiOutcome.error ||
                  apiWebIdentity.error ||
                  "FLOW_API_DOWNLOAD_FAILED"),
              true,
            );
            return finish({
              ...apiOutcome,
              noWebFallback: true,
              webFallbackError:
                apiWebIdentity.error || "FLOW_WEB_MEDIA_ID_MISSING",
            });
          }
        } else {
          FloatingTracker._showTrackerNotice(
            String(wmRes || "").toUpperCase() +
              ": " +
              (apiOutcome.error || "FLOW_API_DOWNLOAD_FAILED"),
            true,
          );
          return finish({ ...apiOutcome, noWebFallback: true });
        }
      }
      if (apiWebIdentity && !self.downloadTileMedia)
        return finish({ ok: false, error: "FLOW_WEB_DOWNLOAD_UNAVAILABLE" });
      if ((apiWebIdentity || result.tileId) && self.downloadTileMedia) {
        if (
          operationKey &&
          self2._manualDlOpTokens?.[operationKey] !== operationToken
        )
          return { ok: false, error: "DOWNLOAD_OPERATION_STALE" };
        var webFileName = result.video
          ? result.mediaId || result.fileName
          : result.mediaUuid ||
            result.media_uuid ||
            (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(result.tileId || ""))
              ? result.tileId
              : null) ||
            result.fileName ||
            result.mediaId;
        if (apiWebIdentity) webFileName = apiWebIdentity.fileName;
        if (
          !apiWebIdentity &&
          result.video &&
          !/^[A-Za-z0-9_-]{32,1024}$/.test(String(webFileName || "")) &&
          typeof _getFlowV2AsbMediaId === "function"
        ) {
          webFileName =
            _getFlowV2AsbMediaId(_ftVideoSrc2(result)) ||
            _getFlowV2AsbMediaId(_ftSourceThumbnail2(result)) ||
            webFileName;
        }
        var uuidOnlyVideo =
          result.video &&
          /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(
            String(webFileName || result.mediaUuid || ""),
          ) &&
          !/^[A-Za-z0-9_-]{32,1024}$/.test(String(webFileName || ""));
        var mountedUuidOwner = false;
        if (uuidOnlyVideo && typeof _getTileById === "function") {
          mountedUuidOwner = !!_getTileById(
            apiWebIdentity ? apiWebIdentity.tileId : webFileName,
          );
        }
        if (uuidOnlyVideo && !mountedUuidOwner) {
          console.warn(
            "[FloatingTracker/download] UUID-only video unavailable; DOM scan suppressed",
          );
          var expiredMessage =
            self.I18n?.t?.("gen.flowErr_media_expired") || "Media expired";
          FloatingTracker._showTrackerNotice(expiredMessage, true);
          return finish({ ok: false, error: "FLOW_WEB_VIDEO_EXPIRED" });
        }
        console.log("[FloatingTracker/download] cached identity", {
          media: result.video ? "video" : "image",
          hasMediaId: !!result.mediaId,
          identityKind: /^[A-Za-z0-9_-]{32,1024}$/.test(
            String(webFileName || ""),
          )
            ? "flow_v2_asb"
            : /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(webFileName || ""))
              ? "uuid_preview"
              : "other_or_missing",
          hasRuntimeTileId: !!result.tileId,
          hasPlaybackUrl: !!_ftVideoSrc2(result),
        });
        var webOk = await self.downloadTileMedia(
          apiWebIdentity ? apiWebIdentity.tileId : result.tileId,
          item.promptText,
          item.taskName,
          webFileName,
          result.video ? null : wmRes || null,
          null,
          index,
          result.video ? wmRes || null : null,
          wmPick,
          result.plannedFilename || null,
          false,
          function () {
            return self2._manualDlOpTokens?.[operationKey] !== operationToken;
          },
          function (nativeId) {
            self2._manualDlNativeIds = self2._manualDlNativeIds || {};
            self2._manualDlNativeIds[operationToken] = nativeId;
          },
        );
        return finish(
          webOk ? { ok: true } : { ok: false, error: "TILE_DOWNLOAD_FAILED" },
        );
      } else if (result.url) {
        if (result.video) {
          return finish({
            ok: false,
            error: "VIDEO_TILE_REQUIRED_FOR_RESOLUTION_DOWNLOAD",
          });
        }
        if (
          /\/asb\//i.test(String(result.url)) &&
          /=s\d+(?:-[a-z]+)*(?:$|[?#])/i.test(String(result.url))
        ) {
          return finish({
            ok: false,
            error: "IMAGE_TILE_REQUIRED_FOR_ORIGINAL_DOWNLOAD",
          });
        }
        var urlOk = await FloatingTracker._dlUrl(
          result.url,
          null,
          "image",
          wmPick,
          operationToken,
        );
        return finish(
          urlOk ? { ok: true } : { ok: false, error: "URL_DOWNLOAD_FAILED" },
        );
      }
      return finish({ ok: false, error: "NO_DOWNLOAD_SOURCE" });
    } catch (error) {
      return finish({
        ok: false,
        error: (error && error.message) || "DOWNLOAD_FAILED",
      });
    }
  };
  FloatingTracker._downloadResult = async function (
    item,
    result,
    index,
    wmMode,
  ) {
    this._manualDlOpTokens = this._manualDlOpTokens || {};
    var operationKey =
      String(item?.id || "item") +
      ":" +
      (index != null
        ? "result-slot:" + index
        : this._manualDlKey(result, index));
    var operationToken =
      String(Date.now()) + ":" + Math.random().toString(36).slice(2);
    this._manualDlOpTokens[operationKey] = operationToken;
    var self2 = this;
    var cancelDownload;
    var cancelPromise = new Promise(function (resolve) {
      cancelDownload = function () {
        resolve({ ok: false, error: "DOWNLOAD_STOPPED" });
      };
    });
    var modal = document.createElement("div");
    modal.className = "tobyflow-ft-download-progress";
    modal.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:12px 14px;border-radius:9px;background:#18181b;color:#fff;border:1px solid rgba(255,255,255,.2);box-shadow:0 8px 28px rgba(0,0,0,.4);font:12px system-ui;display:flex;align-items:center;gap:12px";
    var label = document.createElement("span");
    label.textContent = _getTrackerT2("wmGo") + "\u2026";
    var cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = _getTrackerT2("cancel");
    cancelButton.style.cssText =
      "border:1px solid rgba(255,255,255,.3);border-radius:6px;background:transparent;color:#fff;padding:6px 10px;cursor:pointer";
    cancelButton.addEventListener("click", function () {
      self2._manualDownloadCancelled = true;
      delete self2._manualDlOpTokens[operationKey];
      self2._setManualDownloadState(
        item,
        result,
        index,
        "failed",
        "DOWNLOAD_STOPPED",
        wmMode,
      );
      var nativeId = self2._manualDlNativeIds?.[operationToken];
      if (nativeId)
        chrome.runtime
          .sendMessage({
            action: "cancelPreparedDownload",
            requestId: nativeId,
          })
          .catch(() => {});
      chrome.runtime
        .sendMessage({
          action: "cancelPreparedDownload",
          requestId: operationToken,
        })
        .catch(() => {});
      cancelDownload();
    });
    modal.append(label, cancelButton);
    document.body.appendChild(modal);
    var timeoutMs = result?.video ? 6e5 : 12e4;
    var timer = null;
    var timeoutPromise = new Promise(function (resolve) {
      timer = setTimeout(function () {
        if (self2._manualDlOpTokens?.[operationKey] === operationToken) {
          delete self2._manualDlOpTokens[operationKey];
          self2._setManualDownloadState(
            item,
            result,
            index,
            "failed",
            "MANUAL_DOWNLOAD_TIMEOUT",
            wmMode && typeof wmMode === "object" ? wmMode : { mode: wmMode },
          );
          console.warn("[FloatingTracker/download] watchdog timeout", {
            media: result?.video ? "video" : "image",
            timeoutMs,
          });
        }
        resolve({ ok: false, error: "MANUAL_DOWNLOAD_TIMEOUT" });
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        this._downloadResultCore(
          item,
          result,
          index,
          wmMode,
          operationKey,
          operationToken,
        ),
        timeoutPromise,
        cancelPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      modal.remove();
      if (this._manualDlNativeIds)
        delete this._manualDlNativeIds[operationToken];
    }
  };
  FloatingTracker._showDownloadSummary = function (stats) {
    if (!stats || !stats.total) return;
    try {
      var old = document.getElementById("tobyflow-ft-download-summary");
      if (old) old.remove();
      var el = document.createElement("div");
      el.id = "tobyflow-ft-download-summary";
      el.style.cssText =
        'position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:10px 14px;border-radius:9px;background:#18181b;color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 28px rgba(0,0,0,.4);font:12px/1.4 "Inter","Segoe UI",system-ui,-apple-system,sans-serif;';
      el.textContent = String(_getTrackerT2("downloadSummary"))
        .replace("{success}", stats.success)
        .replace("{total}", stats.total)
        .replace("{failed}", stats.failed);
      document.body.appendChild(el);
      setTimeout(function () {
        try {
          el.remove();
        } catch (_) {}
      }, 5e3);
    } catch (_) {}
  };
  FloatingTracker._stableDownloadIndex = function (
    item,
    resultOffset,
    resultCount,
  ) {
    var promptIndex = Number(item && item.promptIndex);
    var baseNumber =
      Number.isFinite(promptIndex) && promptIndex >= 0 ? promptIndex + 1 : 1;
    var base = String(baseNumber).padStart(3, "0");
    return Number(resultCount) > 1
      ? base + "_" + (Number(resultOffset) + 1)
      : base;
  };
  FloatingTracker._downloadItem = async function (item, startIndex, wmMode) {
    if (!this._isCurrentProjectItem(item)) {
      this._showTrackerNotice(_getTrackerT2("projectMismatch"), true);
      return { total: 0, success: 0, failed: 0, error: "PROJECT_MISMATCH" };
    }
    var ownsSingleLock = !wmMode;
    if (
      ownsSingleLock &&
      (this._bulkDownloadRunning || this._singleDownloadRunning)
    ) {
      return { total: 0, success: 0, failed: 0, busy: true };
    }
    if (ownsSingleLock) this._singleDownloadRunning = true;
    if (ownsSingleLock) this._manualDownloadCancelled = false;
    try {
      var results = this._itemResultsOf(item);
      var pick = wmMode;
      if (!pick) {
        var _isVid = results.length ? !!results[0].video : false;
        pick = await FloatingTracker._wmAsk(results.length, _isVid);
        if (!pick || pick.mode === null) return;
      }
      var stats = { total: results.length, success: 0, failed: 0, errors: [] };
      for (var i = 0; i < results.length; i++) {
        if (this._manualDownloadCancelled) break;
        var resultIndex =
          startIndex == null
            ? this._stableDownloadIndex(item, i, results.length)
            : results.length > 1
              ? String(startIndex) + "_" + (i + 1)
              : startIndex;
        var outcome = await this._downloadResult(
          item,
          results[i],
          resultIndex,
          pick,
        );
        if (outcome && outcome.ok) stats.success++;
        else {
          stats.failed++;
          stats.errors.push((outcome && outcome.error) || "DOWNLOAD_FAILED");
        }
        if (i < results.length - 1)
          await new Promise(function (r) {
            setTimeout(r, 300);
          });
      }
      if (!wmMode) this._showDownloadSummary(stats);
      return stats;
    } finally {
      if (ownsSingleLock) this._singleDownloadRunning = false;
    }
  };
  FloatingTracker._downloadAll = async function () {
    if (this._bulkDownloadRunning || this._singleDownloadRunning)
      return { total: 0, success: 0, failed: 0, busy: true };
    this._bulkDownloadRunning = true;
    this._manualDownloadCancelled = false;
    try {
      var data = this._lastData;
      if (!data || !data.jobs) return;
      var activeProject =
        (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
      if (activeProject && data.projectId && data.projectId !== activeProject) {
        this._showTrackerNotice(_getTrackerT2("projectMismatch"), true);
        return { total: 0, success: 0, failed: 0, error: "PROJECT_MISMATCH" };
      }
      if (this._gridBody) {
        var seen = new Set(),
          matchingItems = [],
          tracker = this;
        this._gridBody
          .querySelectorAll(".tobyflow-ft-batch")
          .forEach(function (section) {
            (section._vm?.items || []).forEach(function (group) {
              if (
                seen.has(group.cardKey) ||
                !tracker._matchesGridItem(group.item)
              )
                return;
              seen.add(group.cardKey);
              matchingItems.push(group.item);
            });
          });
        data = { jobs: [{ items: matchingItems }] };
      }
      var total = 0;
      for (var ci = 0; ci < data.jobs.length; ci++) {
        var cItems = data.jobs[ci].items || [];
        for (var cj = 0; cj < cItems.length; cj++)
          total += this._itemResultsOf(cItems[cj]).length;
      }
      if (!total) return;
      var hasImage = false,
        hasVideo = false;
      for (var ti = 0; ti < data.jobs.length; ti++) {
        var typeItems = data.jobs[ti].items || [];
        for (var tj = 0; tj < typeItems.length; tj++) {
          var typeResults = this._itemResultsOf(typeItems[tj]);
          for (var tr = 0; tr < typeResults.length; tr++) {
            if (typeResults[tr].video) hasVideo = true;
            else hasImage = true;
          }
        }
      }
      var allMode = await this._wmAsk(total, hasVideo && !hasImage);
      if (!allMode || allMode.mode === null) return;
      FloatingTracker._wmLastMode = allMode.mode;
      FloatingTracker._wmProgress = { done: 0, total, success: 0, failed: 0 };
      var done = 0;
      for (var ji = 0; ji < data.jobs.length; ji++) {
        var items = data.jobs[ji].items || [];
        for (var ii = 0; ii < items.length; ii++) {
          var results = this._itemResultsOf(items[ii]);
          for (var ri = 0; ri < results.length; ri++) {
            if (this._manualDownloadCancelled) break;
            var stableIndex = this._stableDownloadIndex(
              items[ii],
              ri,
              results.length,
            );
            var outcome = await this._downloadResult(
              items[ii],
              results[ri],
              stableIndex,
              allMode,
            );
            if (outcome && outcome.ok) FloatingTracker._wmProgress.success++;
            else FloatingTracker._wmProgress.failed++;
            FloatingTracker._wmProgress.done = ++done;
            await new Promise(function (r) {
              setTimeout(r, 300);
            });
          }
          if (this._manualDownloadCancelled) break;
        }
        if (this._manualDownloadCancelled) break;
      }
      var finalStats = {
        total,
        success: FloatingTracker._wmProgress.success,
        failed: FloatingTracker._wmProgress.failed,
      };
      this._showDownloadSummary(finalStats);
      return finalStats;
    } catch (error) {
      return { total: 0, success: 0, failed: 1, error: error && error.message };
    } finally {
      this._bulkDownloadRunning = false;
    }
  };
  FloatingTracker._resolveViewVideo = async function (
    result,
    forceHover,
    isCurrent,
    forceProxy,
  ) {
    if (!result || !result.video || (isCurrent && !isCurrent()))
      return { src: null, revoke: false };
    var videoUrl = _ftVideoSrc2(result);
    var directVideo = _ftDirectGridVideoSrc2(result);
    if (!directVideo && !forceHover) {
      var refreshedVideo = await this._resolveVideoPreviewUrl(result);
      if (isCurrent && !isCurrent()) return { src: null, revoke: false };
      if (refreshedVideo) {
        result.playUrl = refreshedVideo;
        videoUrl = refreshedVideo;
        directVideo = refreshedVideo;
        console.log(
          "[FloatingTracker/video] playback URL refreshed from media UUID",
        );
      }
    }
    var derived =
      !directVideo && !forceHover
        ? _ftDerivedVideoSrc2(
            _ftSourceThumbnail2(result) || _ftThumbSrc2(result),
          )
        : "";
    if (derived) {
      videoUrl = derived;
      console.log("[FloatingTracker/video] playback URL derived from poster");
    }
    if (!videoUrl || (videoUrl.indexOf("/asb/") >= 0 && !derived)) {
      try {
        var tile =
          result.tileId && typeof _getTileById === "function"
            ? _getTileById(result.tileId)
            : null;
        var mediaIdentity = result.mediaId || result.fileName || null;
        if (
          !tile &&
          mediaIdentity &&
          typeof resolveTileByFileName === "function"
        )
          tile = resolveTileByFileName(mediaIdentity);
        if (tile) {
          var owner =
            typeof _q === "function"
              ? _q("tile_video_owner", tile) || tile
              : tile;
          var opts = {
            bubbles: true,
            cancelable: true,
            view: window,
            pointerType: "mouse",
          };
          try {
            owner.dispatchEvent(new PointerEvent("pointerenter", opts));
          } catch (_) {}
          try {
            owner.dispatchEvent(new MouseEvent("mouseenter", opts));
          } catch (_) {}
          try {
            owner.dispatchEvent(new MouseEvent("mouseover", opts));
          } catch (_) {}
          var deadline = Date.now() + 8e3;
          while (Date.now() < deadline && (!isCurrent || isCurrent())) {
            await new Promise(function (resolve) {
              setTimeout(resolve, 200);
            });
            var video =
              typeof _q === "function" ? _q("tile_video", tile) : null;
            var candidate = video && (video.currentSrc || video.src || "");
            if (candidate) {
              videoUrl = candidate;
              result.playUrl = candidate;
              if (!result.url && video.poster) result.url = video.poster;
              console.log(
                "[FloatingTracker/video] hover playback URL resolved",
                JSON.stringify({
                  has_tile_id: !!result.tileId,
                  has_media_identity: !!mediaIdentity,
                }),
              );
              break;
            }
          }
        }
      } catch (error) {
        console.warn(
          "[FloatingTracker/video] hover resolve failed:",
          error?.message || error,
        );
      }
    }
    if (!videoUrl || (isCurrent && !isCurrent()))
      return { src: null, revoke: false };
    if (directVideo && !forceProxy)
      return { src: directVideo, revoke: false, direct: true };
    try {
      while (this._videoPreviewByteFlight) {
        await this._videoPreviewByteFlight.catch(function () {});
        if (isCurrent && !isCurrent()) return { src: null, revoke: false };
      }
      var byteFlight = new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage(
          { action: "fetchBlob", url: videoUrl, expectImage: false },
          function (r) {
            if (chrome.runtime.lastError)
              return reject(new Error(chrome.runtime.lastError.message));
            resolve(r);
          },
        );
      });
      this._videoPreviewByteFlight = byteFlight;
      var response;
      try {
        response = await byteFlight;
      } finally {
        if (this._videoPreviewByteFlight === byteFlight)
          this._videoPreviewByteFlight = null;
      }
      if (isCurrent && !isCurrent()) return { src: null, revoke: false };
      if (
        !response?.success ||
        !response.base64 ||
        !(response.contentType || "").startsWith("video/")
      ) {
        throw new Error(
          response?.error ||
            "VIDEO_PROXY_INVALID_TYPE:" + (response?.contentType || "unknown"),
        );
      }
      var binary = atob(response.base64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return {
        src: URL.createObjectURL(
          new Blob([bytes], { type: response.contentType }),
        ),
        revoke: true,
      };
    } catch (error) {
      if (isCurrent && !isCurrent()) return { src: null, revoke: false };
      if (derived && !forceHover) {
        console.warn(
          "[FloatingTracker/video] derived URL rejected; falling back to hover:",
          error?.message || error,
        );
        return this._resolveViewVideo(result, true, isCurrent);
      }
      console.warn(
        "[FloatingTracker/video] proxy failed; using canonical URL:",
        error?.message || error,
      );
      return { src: videoUrl, revoke: false };
    }
  };
  FloatingTracker._openViewOverlay = async function (results, startIdx, item) {
    try {
      let releaseViewMedia2 = function (keepIndex) {
          Array.from(media.querySelectorAll("video")).forEach(function (video) {
            video.pause();
            video.removeAttribute("src");
            video.load();
          });
          Object.keys(playbackByIndex).forEach(function (key) {
            if (Number(key) === keepIndex) return;
            var playback = playbackByIndex[key];
            if (playback.revoke && playback.src)
              URL.revokeObjectURL(playback.src);
            delete playbackByIndex[key];
          });
        },
        close2 = function () {
          if (closed) return;
          closed = true;
          renderGeneration++;
          document.removeEventListener("keydown", onKey2);
          if (self2._viewKeyHandler === onKey2) self2._viewKeyHandler = null;
          releaseViewMedia2(null);
          ov.remove();
        },
        onKey2 = function (e) {
          if (e.key === "Escape") close2();
          else if (e.key === "ArrowLeft" && idx > 0) {
            idx--;
            void render();
          } else if (e.key === "ArrowRight" && idx < results.length - 1) {
            idx++;
            void render();
          }
        };
      var releaseViewMedia = releaseViewMedia2,
        close = close2,
        onKey = onKey2;
      if (!results || !results.length) return;
      var self2 = this;
      try {
        if (self2._viewKeyHandler) {
          document.removeEventListener("keydown", self2._viewKeyHandler);
          self2._viewKeyHandler = null;
        }
      } catch (_) {}
      try {
        var _old = document.querySelectorAll(".tobyflow-ft-view-overlay");
        for (var _i = 0; _i < _old.length; _i++) {
          if (typeof _old[_i]._ftCloseView === "function")
            _old[_i]._ftCloseView();
          else _old[_i].remove();
        }
      } catch (_) {}
      var idx = Math.max(0, Math.min(startIdx || 0, results.length - 1));
      var playbackByIndex = {};
      var renderGeneration = 0;
      var ov = document.createElement("div");
      ov.className = "tobyflow-ft-view-overlay";
      ov._ftItemIds = results
        .map(function (result) {
          return result._ftOwnerItem?.id;
        })
        .concat(item?.id)
        .filter(Boolean);
      ov.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.86);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
      var wrap = document.createElement("div");
      wrap.style.cssText =
        "display:flex;flex-direction:column;align-items:center;gap:14px;max-width:92vw;max-height:92vh;";
      var media = document.createElement("div");
      media.style.cssText =
        "max-width:92vw;max-height:82vh;display:flex;align-items:center;justify-content:center;";
      var dlBtn = document.createElement("button");
      dlBtn.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:none;border-radius:8px;background:rgba(255,255,255,0.14);color:#fff;cursor:pointer;font-size:12px;font-weight:600;flex-shrink:0;";
      dlBtn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>' +
        self2._escHtml(_getTrackerT2("dlItemTitle")) +
        "</span>";
      dlBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!item || self2._bulkDownloadRunning || self2._singleDownloadRunning)
          return;
        self2._singleDownloadRunning = true;
        dlBtn.disabled = true;
        var _lbl = dlBtn.querySelector("span");
        var _orig = _lbl ? _lbl.textContent : "";
        var _say = function (k) {
          if (_lbl) _lbl.textContent = _getTrackerT2(k);
        };
        Promise.resolve(
          (async function () {
            var activeItem = results[idx]?._ftOwnerItem || item;
            var activeResult = results[idx]?._ftResult || results[idx];
            var pick = await FloatingTracker._wmAsk(1, !!activeResult.video);
            if (!pick || pick.mode === null) return;
            if (pick.mode === "clean") _say("wmCleaning");
            else _say("wmDownloading");
            var activeResultIndex =
              Number(results[idx]?._ftOwnerResultIndex) || 0;
            var ownerResultCount = self2._itemResultsOf(
              activeItem || {},
            ).length;
            return self2._downloadResult(
              activeItem,
              activeResult,
              self2._stableDownloadIndex(
                activeItem,
                activeResultIndex,
                ownerResultCount,
              ),
              pick,
            );
          })(),
        )
          .catch(function (error) {
            console.error(
              "[FloatingTracker/download] viewer click failed:",
              (error && error.message) || error,
            );
            self2._showTrackerNotice(
              "Download: " + ((error && error.message) || "DOWNLOAD_FAILED"),
              true,
            );
          })
          .then(function () {
            self2._singleDownloadRunning = false;
            dlBtn.disabled = false;
            if (_lbl) _lbl.textContent = _orig;
          });
      });
      wrap.appendChild(media);
      wrap.appendChild(dlBtn);
      var closeBtn = document.createElement("button");
      closeBtn.style.cssText =
        "position:fixed;top:16px;right:20px;width:38px;height:38px;border:none;border-radius:10px;background:rgba(255,255,255,0.14);color:#fff;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;";
      closeBtn.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      ov.appendChild(wrap);
      ov.appendChild(closeBtn);
      var prevBtn, nextBtn;
      async function render() {
        var entry = results[idx];
        var r = entry?._ftResult || entry;
        var requestedIdx = idx;
        releaseViewMedia2(requestedIdx);
        var generation = ++renderGeneration;
        var resolvedPlayback = playbackByIndex[requestedIdx] || {
          src: null,
          revoke: false,
        };
        if (r.video && !resolvedPlayback.src) {
          media.innerHTML = _ftThumbImg2(
            _ftThumbSrc2(r),
            "max-width:92vw;max-height:92vh;border-radius:10px;object-fit:contain;",
            false,
          );
          resolvedPlayback = await self2._resolveViewVideo(
            r,
            false,
            function () {
              return (
                ov.isConnected &&
                generation === renderGeneration &&
                requestedIdx === idx
              );
            },
          );
          if (
            !ov.isConnected ||
            generation !== renderGeneration ||
            requestedIdx !== idx
          ) {
            if (resolvedPlayback.revoke && resolvedPlayback.src)
              URL.revokeObjectURL(resolvedPlayback.src);
            return;
          }
          playbackByIndex[requestedIdx] = resolvedPlayback;
        }
        var _rPlay = resolvedPlayback.src || _ftVideoSrc2(r);
        media.innerHTML =
          r.video && _rPlay
            ? '<video src="' +
              self2._escHtml(_rPlay) +
              '" controls autoplay playsinline preload="auto" style="max-width:92vw;max-height:92vh;border-radius:10px;background:#000;"></video>'
            : _ftThumbImg2(
                _ftThumbSrc2(r),
                "max-width:92vw;max-height:92vh;border-radius:10px;object-fit:contain;",
                false,
              );
        var player = r.video ? media.querySelector("video") : null;
        if (player && resolvedPlayback.direct) {
          player.addEventListener(
            "error",
            async function () {
              if (player._ftProxyTried) return;
              player._ftProxyTried = true;
              var current = function () {
                return (
                  ov.isConnected &&
                  generation === renderGeneration &&
                  requestedIdx === idx
                );
              };
              var replacement = await self2._resolveViewVideo(
                r,
                false,
                current,
                true,
              );
              if (!current()) {
                if (replacement.revoke && replacement.src)
                  URL.revokeObjectURL(replacement.src);
                return;
              }
              playbackByIndex[requestedIdx] = replacement;
              if (replacement.src) {
                player.src = replacement.src;
                player.play().catch(function () {});
              }
            },
            { once: true },
          );
        }
        if (prevBtn) prevBtn.style.visibility = idx > 0 ? "visible" : "hidden";
        if (nextBtn)
          nextBtn.style.visibility =
            idx < results.length - 1 ? "visible" : "hidden";
      }
      if (results.length > 1) {
        var navCss =
          "position:fixed;top:50%;transform:translateY(-50%);width:44px;height:44px;border:none;border-radius:50%;background:rgba(255,255,255,0.14);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;";
        prevBtn = document.createElement("button");
        prevBtn.style.cssText = navCss + "left:20px;";
        prevBtn.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
        nextBtn = document.createElement("button");
        nextBtn.style.cssText = navCss + "right:20px;";
        nextBtn.innerHTML =
          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        prevBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (idx > 0) {
            idx--;
            void render();
          }
        });
        nextBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (idx < results.length - 1) {
            idx++;
            void render();
          }
        });
        ov.appendChild(prevBtn);
        ov.appendChild(nextBtn);
      }
      var closed = false;
      ov._ftCloseView = close2;
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        close2();
      });
      ov.addEventListener("click", function (e) {
        if (e.target === ov) close2();
      });
      self2._viewKeyHandler = onKey2;
      document.addEventListener("keydown", onKey2);
      document.body.appendChild(ov);
      void render();
    } catch (error) {
      console.warn(
        "[FloatingTracker/video] open overlay failed:",
        error?.message || error,
      );
    }
  };
  FloatingTracker._openBatchViewOverlay = function (card, startWithinItem) {
    if (!card) return;
    var section = card.closest?.(".tobyflow-ft-batch");
    var cards = section
      ? Array.prototype.slice
          .call(section.querySelectorAll(".tobyflow-ft-grid-card"))
          .filter(function (batchCard) {
            return batchCard.style.display !== "none";
          })
      : [card];
    var entries = [];
    var selectedIndex = 0;
    cards.forEach(function (batchCard) {
      var owner = batchCard._displayItem;
      var ownerResults = FloatingTracker._itemResultsOf(owner || {});
      ownerResults.forEach(function (result, resultIndex) {
        if (batchCard === card && resultIndex === (startWithinItem || 0))
          selectedIndex = entries.length;
        entries.push({
          _ftResult: result,
          _ftOwnerItem: owner,
          _ftOwnerOrdinal: entries.length,
          _ftOwnerResultIndex: resultIndex,
        });
      });
    });
    if (entries.length)
      this._openViewOverlay(entries, selectedIndex, card._displayItem);
  };
  FloatingTracker._hasLiveGrid = function () {
    try {
      return !!(
        this._gridEl &&
        this._gridEl.isConnected &&
        this._gridBody &&
        this._gridBody.isConnected &&
        this._gridEl.contains(this._gridBody)
      );
    } catch (_) {
      return false;
    }
  };
  FloatingTracker._stopGridElapsedTimer = function () {
    if (this._gridElapsedTimer) clearInterval(this._gridElapsedTimer);
    this._gridElapsedTimer = null;
  };
  FloatingTracker._refreshGridElapsedTimes = function () {
    if (!this._hasLiveGrid()) {
      this._stopGridElapsedTimer();
      return;
    }
    var labels = this._gridBody.querySelectorAll(
      "[data-ft-grid-item-elapsed],[data-ft-grid-batch-elapsed]",
    );
    if (!labels.length) {
      this._stopGridElapsedTimer();
      return;
    }
    var now = Date.now(),
      self2 = this;
    labels.forEach(function (label) {
      var card = label.closest(".tobyflow-ft-grid-card");
      var section = label.closest(".tobyflow-ft-batch");
      var item = card && card._displayItem;
      var job = (card && card._displayJob) || (section && section._vm);
      var batchClock = label.hasAttribute("data-ft-grid-batch-elapsed");
      var record = batchClock ? job : item;
      label.textContent = record
        ? batchClock
          ? self2._formatBatchElapsed(record, now)
          : self2._elapsedLabel(record, now, false) || "00:00"
        : batchClock
          ? "00:00:00"
          : "00:00";
    });
  };
  FloatingTracker._syncGridElapsedTimer = function () {
    if (
      !this._hasLiveGrid() ||
      !this._gridBody.querySelector(
        "[data-ft-grid-item-elapsed],[data-ft-grid-batch-elapsed]",
      )
    ) {
      this._stopGridElapsedTimer();
      return;
    }
    this._refreshGridElapsedTimes();
    if (this._gridElapsedTimer) return;
    var self2 = this;
    this._gridElapsedTimer = setInterval(function () {
      self2._refreshGridElapsedTimes();
    }, 1e3);
  };
  FloatingTracker._cleanupOrphanGridDom = function () {
    try {
      if (this._hasLiveGrid()) return false;
      this._gridCardObserver?.disconnect();
      this._gridCardObserver = null;
      this._gridPosterQueue?.clear();
      if (this._gridHoverPlayback) this._gridHoverPlayback.close();
      var overlays = document.querySelectorAll(".tobyflow-ft-grid-overlay");
      var hadVisibleOrphan = overlays.length > 0;
      if (hadVisibleOrphan) {
        console.info(
          "[FloatingTracker] Orphan grid detected \u2014 rebuilding with current tracker instance",
        );
      }
      if (this._gridAspectObserver) {
        this._gridAspectObserver.disconnect();
        this._gridAspectObserver = null;
      }
      if (this._gridMasonryObserver) {
        this._gridMasonryObserver.disconnect();
        this._gridMasonryObserver = null;
      }
      if (this._gridApiStatusTimer) {
        clearInterval(this._gridApiStatusTimer);
        this._gridApiStatusTimer = null;
      }
      this._stopGridElapsedTimer();
      if (this._gridKeyHandler) {
        document.removeEventListener("keydown", this._gridKeyHandler);
        this._gridKeyHandler = null;
      }
      for (var i = 0; i < overlays.length; i++) overlays[i].remove();
      this._prunePreviewMedia();
      this._gridEl = null;
      this._gridBody = null;
      this._gridClearAllBtn = null;
      this._gridSessionId = null;
      this._gridOpenData = null;
      return hadVisibleOrphan;
    } catch (e) {
      console.warn(
        "[FloatingTracker] Cleanup orphan grid failed:",
        (e && e.message) || e,
      );
      return false;
    }
  };
  FloatingTracker._closeGrid = function (force) {
    try {
      if (!force && this._gridBody) {
        var dirty = this._gridBody.querySelector('[data-draft-dirty="1"]');
        if (dirty && !window.confirm(_getTrackerT2("unsavedDraftConfirm")))
          return false;
      }
      if (this._gridHoverPlayback) this._gridHoverPlayback.close();
      this._gridCardObserver?.disconnect();
      this._gridCardObserver = null;
      this._gridPosterQueue?.clear();
      if (this._gridKeyHandler) {
        document.removeEventListener("keydown", this._gridKeyHandler);
        this._gridKeyHandler = null;
      }
      if (this._gridAspectObserver) {
        this._gridAspectObserver.disconnect();
        this._gridAspectObserver = null;
      }
      if (this._gridMasonryObserver) {
        this._gridMasonryObserver.disconnect();
        this._gridMasonryObserver = null;
      }
      if (this._gridApiStatusTimer) {
        clearInterval(this._gridApiStatusTimer);
        this._gridApiStatusTimer = null;
      }
      this._stopGridElapsedTimer();
      if (this._gridHistoryLoadTimer) {
        clearTimeout(this._gridHistoryLoadTimer);
        this._gridHistoryLoadTimer = null;
      }
      this._gridHistoryLoadId++;
      this._gridHistoryLoading = false;
      this._gridOpenRequested = false;
      this._gridOpenWasUserInitiated = false;
      this._manualGridOpenWebRunKey = null;
      this._setGridExpandBusy?.(false);
      if (this._gridEl) {
        this._gridEl.remove();
        this._gridEl = null;
      }
      var orphans = document.querySelectorAll(".tobyflow-ft-grid-overlay");
      for (var i = 0; i < orphans.length; i++) orphans[i].remove();
      this._prunePreviewMedia();
      this._gridBody = null;
      this._gridClearAllBtn = null;
      this._gridSessionId = null;
      this._gridHistoryReady = false;
      this._gridOpenData = null;
      this._lastJobsRenderSig = null;
      if (this._el?.isConnected && this._lastData)
        this._renderJobs(this._lastData.jobs || []);
      return true;
    } catch (_) {}
  };
  FloatingTracker._initTooltip = function () {
    if (this._tipInit) return;
    this._tipInit = true;
    var self2 = this;
    document.addEventListener(
      "mouseenter",
      function (e) {
        var el = e.target;
        if (!el || !el.matches) return;
        var t = el.matches("[data-ft-tip]")
          ? el
          : el.closest
            ? el.closest("[data-ft-tip]")
            : null;
        if (t) self2._showTip(t);
      },
      true,
    );
    document.addEventListener(
      "mouseleave",
      function (e) {
        var el = e.target;
        if (el && el.matches && el.matches("[data-ft-tip]")) self2._hideTip();
      },
      true,
    );
    document.addEventListener(
      "click",
      function () {
        self2._hideTip();
      },
      true,
    );
  };
  FloatingTracker._showTip = function (el) {
    var txt = el.getAttribute("data-ft-tip");
    if (!txt) return;
    if (!this._tipEl) {
      var tip = document.createElement("div");
      tip.style.cssText =
        'position:fixed;z-index:2147483647;padding:5px 9px;background:#0c0c0e;color:#fff;font-size:11px;font-weight:500;border-radius:6px;max-width:220px;pointer-events:none;opacity:0;transition:opacity .12s;line-height:1.35;box-shadow:0 4px 16px rgba(0,0,0,.45);white-space:normal;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
      document.body.appendChild(tip);
      this._tipEl = tip;
    }
    var tip = this._tipEl;
    if (tip.parentNode === document.body) document.body.appendChild(tip);
    tip.textContent = txt;
    tip.style.display = "block";
    tip.style.opacity = "0";
    var r = el.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    var top = r.top - tr.height - 8;
    if (top < 4) top = r.bottom + 8;
    var left = Math.max(
      4,
      Math.min(
        r.left + r.width / 2 - tr.width / 2,
        window.innerWidth - tr.width - 4,
      ),
    );
    tip.style.top = top + "px";
    tip.style.left = left + "px";
    tip.style.opacity = "1";
  };
  FloatingTracker._hideTip = function () {
    if (this._tipEl) this._tipEl.style.opacity = "0";
  };
  FloatingTracker._isQuotaCancelledItem = function (item) {
    return (
      item?.state === "CANCELLED" &&
      ["quota_exceeded", "per_model_daily", "tier_restricted"].includes(
        item.errorType,
      )
    );
  };
  FloatingTracker._isRegenRetryCandidate = function (item) {
    return ["FAILED", "PARTIAL_FAIL", "CANCELLED"].includes(item?.state);
  };
  FloatingTracker._currentTrackerJobs = function (jobs = []) {
    var newest = this._compactJobsNewestFirst(jobs)[0];
    this._currentTrackerBatchIds = newest ? new Set([newest.id]) : null;
    return jobs;
  };
  FloatingTracker._currentTrackerItems = function (
    job,
    items = job?.items || [],
  ) {
    return items;
  };
  FloatingTracker._gridGroups = function (data) {
    var map = {};
    if (!data || !data.jobs) return map;
    var self2 = this;
    data.jobs.forEach(function (j) {
      var ordinaryLiveBatch =
        ["running", "paused"].includes(j.status) &&
        !(j.items || []).some(function (item) {
          return item.isRegen || item.regenOf || item._regenSlotRoot;
        });
      (j.items || []).forEach(function (it) {
        var key = it._regenSlotRoot || it.regenOf || it.id;
        if (!key) return;
        var cur = map[key];
        var hasResult = !!(it.results?.length || it.thumb);
        var hasFailure =
          ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
            it.state,
          ) >= 0 || self2._isRegenRetryCandidate(it);
        if (!cur) {
          map[key] = {
            item: it,
            jobId: it._regenExecutionJobId || j.id,
            cardKey: key,
            hasResult,
            hasFailure,
            isApi: it.genMode === "api" || j.modeType === "api",
            isLiveBatch: ordinaryLiveBatch,
          };
        } else {
          if (ordinaryLiveBatch) cur.isLiveBatch = true;
          if (hasResult) cur.hasResult = true;
          if (hasFailure) cur.hasFailure = true;
          if ((it.createdAt || 0) >= (cur.item.createdAt || 0)) {
            cur.item = it;
            cur.jobId = it._regenExecutionJobId || j.id;
          }
        }
      });
    });
    Object.keys(map).forEach(function (key) {
      var g = map[key],
        isRegen = g.item && (g.item.isRegen || g.item.regenOf);
      if (
        !g.hasResult &&
        !g.hasFailure &&
        !isRegen &&
        !g.isApi &&
        !g.isLiveBatch
      )
        delete map[key];
    });
    return map;
  };
  FloatingTracker._compactBatchRemovalTarget = function (jobId) {
    var data = this._lastData || {};
    var job = (data.jobs || []).find(function (entry) {
      return String(entry.id) === String(jobId);
    });
    if (!job) return null;
    return {
      id: job.id,
      sessionId: job.sessionId || data.sessionId || "imported-session",
      status: job.status,
      items: (job.items || []).map(function (item) {
        return { item };
      }),
    };
  };
  FloatingTracker._syncCompactSession = function (jobs) {
    var sessionId =
      this._lastData?.sessionId || jobs[0]?.sessionId || jobs[0]?.id || null;
    var ids = new Set(
      jobs.map(function (job) {
        return job.id;
      }),
    );
    var sameJobs = [...(this._compactSeenJobIds || [])].some(function (id) {
      return ids.has(id);
    });
    if (sessionId && this._allJobsSessionId !== sessionId) {
      this._allJobsSessionId = sessionId;
      if (!sameJobs) {
        this._allJobsUserTouched = false;
        this._allJobsCollapsed = false;
      }
    }
    this._compactSeenJobIds = ids;
  };
  FloatingTracker._compareTrackerItems = function (a, b) {
    var ar = !!(a && !a._regenSlotRoot && (a.isRegen || a.regenOf)),
      br = !!(b && !b._regenSlotRoot && (b.isRegen || b.regenOf));
    if (ar !== br) return ar ? -1 : 1;
    if (ar && br)
      return (
        Number(b.createdAt || b.submittedAt || 0) -
        Number(a.createdAt || a.submittedAt || 0)
      );
    var ai = Number.isFinite(Number(a && a.promptIndex))
      ? Number(a.promptIndex)
      : 0;
    var bi = Number.isFinite(Number(b && b.promptIndex))
      ? Number(b.promptIndex)
      : 0;
    return ai - bi;
  };
  FloatingTracker._gridViewModel = function (data) {
    var jobs = this._currentTrackerJobs(data?.jobs || []);
    var newestId = this._compactJobsNewestFirst(jobs)[0]?.id;
    var groups = this._gridGroups({ jobs }),
      sessions = [],
      sessionMap = {},
      claimedCardKeys = new Set();
    jobs.forEach(function (job) {
      var sid = job.sessionId || data.sessionId || "imported-session";
      var session = sessionMap[sid];
      if (!session) {
        session = sessionMap[sid] = {
          id: sid,
          createdAt: Number(job.startedAt || 0),
          jobs: [],
        };
        sessions.push(session);
      }
      var items = (job.items || [])
        .map(function (item) {
          return groups[item._regenSlotRoot || item.regenOf || item.id];
        })
        .filter(function (group) {
          if (!group || claimedCardKeys.has(group.cardKey)) return false;
          claimedCardKeys.add(group.cardKey);
          return true;
        })
        .sort(function (a, b) {
          return FloatingTracker._compareTrackerItems(a.item, b.item);
        });
      if (!items.length) return;
      var completed = items.filter(function (g) {
        return !!(g.item.results?.length || g.item.thumb);
      }).length;
      var failed = items.filter(function (g) {
        return (
          ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
            g.item.state,
          ) >= 0
        );
      }).length;
      var declaredMode =
        ["api", "web", "mixed"].indexOf(job.modeType) >= 0
          ? job.modeType
          : null;
      var modes = new Set(
        (job.items || [])
          .map(function (item) {
            return item.genMode;
          })
          .filter(function (mode) {
            return mode === "api" || mode === "web";
          }),
      );
      var modeType =
        declaredMode === "api" ||
        declaredMode === "web" ||
        declaredMode === "mixed"
          ? declaredMode
          : modes.size > 1
            ? "mixed"
            : modes.size === 1
              ? Array.from(modes)[0]
              : "web";
      session.jobs.push({
        key: sid + "::" + job.id,
        sessionId: sid,
        id: job.executionJobId || job.id,
        owner: job.owner || "prompts",
        label: job.label || _getTrackerT2("importedSession"),
        status: job.status || "completed",
        manualRegenActive: job.manualRegenActive === true,
        manualRegenItemId: job.manualRegenItemId || null,
        manualRegenBatchPending: job.manualRegenBatchPending || 0,
        manualRegenQueuedIds: Array.isArray(job.manualRegenQueuedIds)
          ? job.manualRegenQueuedIds
          : [],
        manualRegenJobId: job.manualRegenJobId || null,
        manualRegenStatus: job.manualRegenStatus || null,
        pauseReason: job.pauseReason || null,
        recoveryLabel: job.recoveryLabel || null,
        recoveryRequired: job.recoveryRequired || null,
        recoveryHint: job.recoveryHint || null,
        startedAt: Number(job.startedAt || 0),
        completedAt: Number(job.completedAt || 0),
        completed,
        failed,
        total: items.length,
        chain: job.chain || null,
        items,
        modeType,
        defaultCollapsed: job.id !== newestId,
        modeReason: job.modeReason || null,
      });
    });
    return { sessions };
  };
  FloatingTracker._batchStatusTone = function (vm) {
    if (
      vm.status === "stopped" &&
      vm.owner === "workflow" &&
      vm.recoveryRequired
    )
      return { color: "#f87171", background: "rgba(239,68,68,.14)" };
    if (vm.status === "paused")
      return { color: "#fbbf24", background: "rgba(245,158,11,.14)" };
    if (vm.status === "running")
      return { color: "#c084fc", background: "rgba(168,85,247,.14)" };
    if (vm.status === "stopped")
      return { color: "#9ca3af", background: "rgba(255,255,255,.06)" };
    if (vm.failed && vm.completed)
      return { color: "#fbbf24", background: "rgba(245,158,11,.14)" };
    if (vm.failed || vm.status === "failed")
      return { color: "#f87171", background: "rgba(239,68,68,.14)" };
    return { color: "#4ade80", background: "rgba(34,197,94,.12)" };
  };
  FloatingTracker._batchStatusLabel = function (vm) {
    if (
      vm.status === "stopped" &&
      vm.owner === "workflow" &&
      vm.recoveryRequired
    )
      return _getTrackerT2("stateFailed");
    if (vm.status === "stopped")
      return vm.recoveryLabel || _getTrackerT2("stopped");
    if (vm.status === "running" || vm.status === "paused")
      return _getTrackerT2(vm.status === "paused" ? "paused" : "running");
    if (vm.failed && vm.completed) return _getTrackerT2("partial");
    if (vm.failed) return _getTrackerT2("failedAll");
    return _getTrackerT2("completed");
  };
  FloatingTracker._batchPauseMessage = function (vm) {
    if (!vm || vm.status !== "paused") return "";
    if (["captcha", "api_unusual_activity"].indexOf(vm.pauseReason) >= 0) {
      return (
        _getTrackerT2("captchaPausedDesc") +
        " " +
        _getTrackerT2("botCookieHint")
      );
    }
    if (vm.pauseReason === "provider_auth")
      return _getTrackerT2("apiAuthPaused");
    if (vm.pauseReason === "manual") return _getTrackerT2("manualPaused");
    return vm.recoveryLabel || vm.recoveryHint || "";
  };
  FloatingTracker._persistBatchCollapsed = function (section, collapsed) {
    try {
      var key = section.dataset.batchKey;
      chrome.storage.local.get(
        ["toby_flow_tracker_collapsed_jobs"],
        function (res) {
          var map = res.toby_flow_tracker_collapsed_jobs || {};
          if (collapsed) map[key] = Date.now();
          else delete map[key];
          var entries = Object.entries(map)
            .sort(function (a, b) {
              return Number(b[1]) - Number(a[1]);
            })
            .slice(0, 100);
          chrome.storage.local.set({
            toby_flow_tracker_collapsed_jobs: Object.fromEntries(entries),
          });
        },
      );
    } catch (_) {}
  };
  FloatingTracker._setBatchCollapsed = function (section, collapsed, persist) {
    if (!section) return;
    var wasCollapsed = section.dataset.collapsed === "1";
    section.dataset.collapsed = collapsed ? "1" : "0";
    if (section._cardsBody) {
      section._cardsBody.hidden = collapsed;
      section._cardsBody.style.setProperty(
        "display",
        collapsed ? "none" : "grid",
        "important",
      );
    }
    if (section._actions) {
      section._actions.hidden = collapsed;
      section._actions.style.setProperty(
        "display",
        collapsed ? "none" : "flex",
        "important",
      );
    }
    if (section._collapseBtn) {
      section._collapseBtn.setAttribute(
        "aria-expanded",
        collapsed ? "false" : "true",
      );
      section._collapseBtn.setAttribute(
        "aria-label",
        _getTrackerT2(collapsed ? "expandBatch" : "collapseBatch"),
      );
      section._collapseBtn.setAttribute(
        "data-ft-tip",
        _getTrackerT2(collapsed ? "expandBatch" : "collapseBatch"),
      );
      section._collapseBtn.innerHTML = collapsed
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>';
    }
    if (section._header) {
      section._header.setAttribute(
        "aria-expanded",
        collapsed ? "false" : "true",
      );
      section._header.setAttribute(
        "aria-label",
        _getTrackerT2(collapsed ? "expandBatch" : "collapseBatch"),
      );
    }
    if (collapsed && section._cardsBody) {
      Array.from(section._cardsBody.children).forEach((card) => {
        if (
          card.dataset.draftDirty === "1" ||
          card.dataset.editorOpen === "1" ||
          card.dataset.selected === "1"
        )
          return;
        this._releaseGridCard(card);
      });
      this._prunePreviewMedia?.();
    } else if (wasCollapsed && section._vm) {
      this._updateBatchSection(section, section._vm);
      this._observePreviewMedia?.(section._cardsBody);
      this._applyGridFilters?.();
    }
    if (persist) this._persistBatchCollapsed(section, collapsed);
    this._syncBatchSelectionAction?.(section);
    this._scheduleGridMasonryLayout?.();
  };
  FloatingTracker._batchRefIcon = function () {
    return '<svg width="16" height="16" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.25 1.5H3.9C3.05992 1.5 2.63988 1.5 2.31901 1.66349C2.03677 1.8073 1.8073 2.03677 1.66349 2.31901C1.5 2.63988 1.5 3.05992 1.5 3.9V8.1C1.5 8.94008 1.5 9.36012 1.66349 9.68099C1.8073 9.96323 2.03677 10.1927 2.31901 10.3365C2.63988 10.5 3.05992 10.5 3.9 10.5H8.5C8.96499 10.5 9.19748 10.5 9.38823 10.4489C9.90587 10.3102 10.3102 9.90587 10.4489 9.38823C10.5 9.19748 10.5 8.96499 10.5 8.5M9.5 4V1M8 2.5H11M5.25 4.25C5.25 4.80228 4.80228 5.25 4.25 5.25C3.69772 5.25 3.25 4.80228 3.25 4.25C3.25 3.69772 3.69772 3.25 4.25 3.25C4.80228 3.25 5.25 3.69772 5.25 4.25ZM7.49502 5.95907L3.26557 9.80402C3.02768 10.0203 2.90873 10.1284 2.89821 10.2221C2.88909 10.3033 2.92023 10.3838 2.98159 10.4378C3.05239 10.5 3.21314 10.5 3.53464 10.5H8.22799C8.94757 10.5 9.30736 10.5 9.58996 10.3791C9.94472 10.2274 10.2274 9.94472 10.3791 9.58996C10.5 9.30736 10.5 8.94757 10.5 8.22799C10.5 7.98587 10.5 7.86482 10.4735 7.75208C10.4403 7.61039 10.3765 7.47768 10.2866 7.3632C10.2151 7.2721 10.1206 7.19647 9.93154 7.04523L8.53291 5.92633C8.34369 5.77495 8.24908 5.69927 8.1449 5.67256C8.05307 5.64901 7.95643 5.65206 7.86627 5.68135C7.76397 5.71457 7.67432 5.79607 7.49502 5.95907Z"></path></svg>';
  };
  FloatingTracker._addBatchReferences = async function (vm, button) {
    if (
      !vm ||
      button?.disabled ||
      this._addingBatchRefs ||
      ["running", "paused", "pending", "queued"].includes(vm.status)
    )
      return;
    if (
      !vm.items?.length ||
      vm.items.some((group2) => !this._isCurrentProjectItem(group2.item))
    ) {
      this._showTrackerNotice(_getTrackerT2("projectMismatch"), true);
      return;
    }
    this._addingBatchRefs = true;
    if (button) button.disabled = true;
    try {
      var references = [],
        seen = new Set();
      for (var group of vm.items) {
        for (var result of this._itemResultsOf(group.item)) {
          var id =
            result.tileId ||
            result.fileName ||
            result.mediaUuid ||
            result.mediaId;
          if (!id || seen.has(String(id))) continue;
          seen.add(String(id));
          references.push({
            fileId: String(id),
            file_name: result.fileName || null,
            media_uuid: result.mediaUuid || result.media_uuid || null,
            thumbnail: _ftThumbSrc2(result) || _ftSourceThumbnail2(result),
            type: result.video ? "video" : "image",
            video_url: result.video ? result.playUrl || result.url : null,
          });
        }
      }
      if (!references.length) throw new Error("NO_REFERENCE_MEDIA_ID");
      var response = await chrome.runtime.sendMessage({
        action: "pq:addBatchReferences",
        projectId: self.getCurrentProjectId(),
        references,
      });
      if (!response?.ok)
        throw new Error(response?.error || "REFERENCE_NO_SIDEBAR_ACK");
      this._showTrackerNotice(
        _getTrackerT2("batchRefsAdded") + ": " + response.added,
        false,
      );
    } catch (error) {
      this._showTrackerNotice(
        _getTrackerT2("batchRefsUnavailable") + " (" + error.message + ")",
        true,
      );
    } finally {
      this._addingBatchRefs = false;
      if (button) button.disabled = false;
    }
  };
  FloatingTracker._downloadBatch = async function (vm, button) {
    if (
      !vm ||
      button?.disabled ||
      this._bulkDownloadRunning ||
      this._singleDownloadRunning
    )
      return;
    if (
      vm.items.some(function (group) {
        return !FloatingTracker._isCurrentProjectItem(group.item);
      })
    ) {
      this._showTrackerNotice(_getTrackerT2("projectMismatch"), true);
      return { total: 0, success: 0, failed: 0, error: "PROJECT_MISMATCH" };
    }
    this._bulkDownloadRunning = true;
    this._manualDownloadCancelled = false;
    if (button) button.disabled = true;
    try {
      var total = 0,
        hasImage = false,
        hasVideo = false;
      for (var ci = 0; ci < vm.items.length; ci++) {
        var countResults = this._itemResultsOf(vm.items[ci].item);
        total += countResults.length;
        for (var cr = 0; cr < countResults.length; cr++) {
          if (countResults[cr].video) hasVideo = true;
          else hasImage = true;
        }
      }
      if (!total) return { total: 0, success: 0, failed: 0 };
      var batchMode = await this._wmAsk(total, hasVideo && !hasImage);
      if (!batchMode || batchMode.mode === null)
        return { total, success: 0, failed: 0, cancelled: true };
      var stats = { total, success: 0, failed: 0 };
      for (var i = 0; i < vm.items.length; i++) {
        if (this._manualDownloadCancelled) break;
        var results = this._itemResultsOf(vm.items[i].item);
        if (!results.length) continue;
        var itemStats = await this._downloadItem(
          vm.items[i].item,
          null,
          batchMode,
        );
        stats.success += Number(itemStats?.success) || 0;
        stats.failed += Number(itemStats?.failed) || 0;
      }
      this._showDownloadSummary(stats);
      return stats;
    } finally {
      this._bulkDownloadRunning = false;
      if (button) button.disabled = false;
    }
  };
  FloatingTracker._regenMediaTypeOf = function (item) {
    return String(
      item?.genType || item?.settings?.genType || item?.settings?.type || "",
    )
      .toLowerCase()
      .includes("video")
      ? "video"
      : "image";
  };
  FloatingTracker._regenSettingsOverrideOf = function (item, confirmation) {
    if (!confirmation?.settingsOverrides) return void 0;
    var mode =
      confirmation.effectiveExecutionMode || confirmation.executionMode;
    return Object.assign(
      {},
      confirmation.settingsOverrides[this._regenMediaTypeOf(item)] || {},
      mode ? { flowExecutionMode: mode } : {},
    );
  };
  FloatingTracker._dailyQuotaModelsOf = function (groups) {
    return [
      ...new Set(
        (groups || [])
          .map(function (group) {
            return group.item || group;
          })
          .filter(function (item) {
            return item.errorType === "per_model_daily";
          })
          .map(function (item) {
            return item.settings?.model || item.model || "";
          })
          .filter(Boolean),
      ),
    ];
  };
  FloatingTracker._mountRegenSettings = function (body, groups, changed) {
    var self2 = this,
      alive = true,
      revision = 0,
      ready = false,
      loading = false,
      mode = null,
      selects = {},
      available = {};
    var types = [
      ...new Set(
        groups.map(function (group) {
          return self2._regenMediaTypeOf(group.item || group);
        }),
      ),
    ];
    var wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    var quotaModels = this._dailyQuotaModelsOf(groups);
    if (
      groups.some(function (group) {
        return (group.item || group).errorType === "per_model_daily";
      })
    ) {
      var quotaNotice = document.createElement("div");
      quotaNotice.dataset.regenDailyQuota = "true";
      quotaNotice.setAttribute("role", "note");
      quotaNotice.style.cssText =
        "display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid rgba(245,158,11,.25);border-radius:8px;background:rgba(245,158,11,.1);color:#fde68a;";
      quotaNotice.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="flex:none;margin-top:1px;color:#fbbf24;"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/></svg>';
      var quotaText = document.createElement("span");
      quotaText.textContent = String(
        _getTrackerT2("regenDailyQuotaNotice"),
      ).replace("{models}", quotaModels.join(", "));
      quotaNotice.appendChild(quotaText);
      wrap.appendChild(quotaNotice);
    }
    function makeSelect(label, key) {
      var row = document.createElement("label");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0;border:0;background:transparent;";
      var text = document.createElement("span");
      text.style.cssText =
        "display:flex;align-items:center;gap:7px;min-width:0;flex:1;color:#8b8b92;font-weight:500;";
      var icon = document.createElement("span");
      var isMode = key === "executionMode";
      icon.style.cssText =
        "display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;flex:none;color:" +
        (isMode ? "#c4b5fd" : "#7dd3fc") +
        ";background:" +
        (isMode ? "rgba(167,139,250,.12)" : "rgba(56,189,248,.12)") +
        ";";
      icon.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (isMode
          ? '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="#25222e"/><circle cx="16" cy="17" r="3" fill="#25222e"/>'
          : '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>') +
        "</svg>";
      var labelText = document.createElement("span");
      labelText.textContent = label;
      text.append(icon, labelText);
      var select = document.createElement("select");
      select.dataset.regenSetting = key;
      select.style.cssText =
        "min-width:0;flex:0 1 240px;width:240px;max-width:68%;box-sizing:border-box;padding:7px 34px 7px 12px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background-color:#181818;color:#dedede;outline-color:#ccff00;color-scheme:dark;font:inherit;appearance:none;-webkit-appearance:none;background-repeat:no-repeat;background-position:right 12px center;background-size:13px 13px;";
      select.style.backgroundImage =
        'url("data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dedede" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
        ) +
        '")';
      row.append(text, select);
      wrap.appendChild(row);
      select.addEventListener("change", changed);
      return select;
    }
    types.forEach(function (type) {
      selects[type] = makeSelect(
        _getTrackerT2("regenModel") +
          (types.length > 1 ? " (" + type + ")" : ""),
        type,
      );
    });
    mode = makeSelect(_getTrackerT2("regenMode"), "executionMode");
    var keepMode = document.createElement("option");
    keepMode.value = "";
    keepMode.textContent = _getTrackerT2("regenKeepMode");
    mode.appendChild(keepMode);
    ["auto", "web", "api"].forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = _getTrackerT2(
        "regen" + value[0].toUpperCase() + value.slice(1),
      );
      mode.appendChild(option);
    });
    mode.value = "auto";
    var error = document.createElement("span");
    error.style.color = "#f59e0b";
    wrap.appendChild(error);
    body.appendChild(wrap);
    async function load() {
      var requestRevision = ++revision;
      ready = false;
      loading = true;
      changed();
      try {
        var response = await self2._sendAction("pq:regenOptions", {
          mediaTypes: types,
        });
        if (!alive || requestRevision !== revision) return;
        if (!response?.ok) throw new Error("REGEN_CONFIG_UNAVAILABLE");
        ready = true;
        types.forEach(function (type) {
          var select = selects[type],
            previous = select.value,
            models = response.models?.[type] || [];
          available[type] = models;
          select.replaceChildren();
          var keep = document.createElement("option");
          keep.value = "";
          keep.textContent = _getTrackerT2("regenKeepModel");
          select.appendChild(keep);
          models.forEach(function (model) {
            var option = document.createElement("option");
            option.value = model.value;
            option.textContent = model.name;
            select.appendChild(option);
          });
          if (!models.length) ready = false;
          if (
            previous &&
            models.some(function (model) {
              return model.value === previous;
            })
          )
            select.value = previous;
          else if (previous) {
            var removed = document.createElement("option");
            removed.value = previous;
            removed.textContent = previous;
            removed.disabled = true;
            select.appendChild(removed);
            select.value = previous;
          }
        });
        error.textContent = ready
          ? ""
          : _getTrackerT2("regenConfigUnavailable");
        changed();
      } catch (_) {
        if (alive && requestRevision === revision) {
          ready = false;
          error.textContent = _getTrackerT2("regenConfigUnavailable");
          changed();
        }
      } finally {
        if (requestRevision === revision) loading = false;
      }
    }
    function storageChanged(changes, area) {
      if (
        area === "local" &&
        (changes.toby_provider_models || changes.toby_provider_api_configs)
      )
        void load();
    }
    try {
      chrome.storage.onChanged.addListener(storageChanged);
    } catch (_) {}
    void load();
    return {
      read: function () {
        var overrides = {};
        types.forEach(function (type) {
          overrides[type] = selects[type].value
            ? { model: selects[type].value }
            : {};
        });
        return {
          settingsOverrides: overrides,
          executionMode: mode.value || null,
        };
      },
      retryMissing: function () {
        if (alive && !ready && !loading) void load();
      },
      ready: function () {
        return (
          ready &&
          types.every(function (type) {
            return (
              !selects[type].value ||
              (available[type] || []).some(function (model) {
                return model.value === selects[type].value;
              })
            );
          })
        );
      },
      destroy: function () {
        alive = false;
        try {
          chrome.storage.onChanged.removeListener(storageChanged);
        } catch (_) {}
      },
    };
  };
  FloatingTracker._confirmAction = function (options) {
    options = options || {};
    return new Promise(function (resolve) {
      var existing = document.querySelector(".tobyflow-ft-confirm-overlay");
      if (existing) {
        resolve(false);
        return;
      }
      var overlay = document.createElement("div");
      overlay.className = "tobyflow-ft-confirm-overlay";
      overlay.setAttribute("data-tobyflow-owned-ui", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);";
      var dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "tobyflow-ft-confirm-title");
      dialog.style.cssText =
        'width:min(390px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;padding:0;border:1px solid #3f3f3f;border-radius:12px;background:#1e1e1e;color:#e8e8ea;box-shadow:0 8px 32px rgba(0,0,0,.4);font:12px/1.5 "Inter","Segoe UI",system-ui,-apple-system,sans-serif;overflow:hidden;';
      var isRegen = !!options.regenGroups;
      var header = document.createElement("div");
      header.style.cssText =
        "padding:14px 16px 10px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);background:#1e1e1e;";
      var title = document.createElement("h2");
      title.id = "tobyflow-ft-confirm-title";
      title.textContent = options.title || "";
      title.style.cssText =
        "margin:0;font-size:13px;font-weight:600;color:#e8e8ea;";
      var close = document.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", _getTrackerT2("cancel"));
      close.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      close.style.cssText =
        "display:flex;align-items:center;padding:2px;border:0;border-radius:4px;background:none;color:#999;cursor:pointer;";
      if (isRegen) {
        var titleGroup = document.createElement("div");
        titleGroup.style.cssText = "display:flex;align-items:center;gap:9px;";
        var regenIcon = document.createElement("span");
        regenIcon.style.cssText =
          "width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:#fff;";
        var regenSvg =
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11.8525 4.21651L11.7221 3.2387C11.6906 3.00226 11.4889 2.82568 11.2504 2.82568C11.0118 2.82568 10.8102 3.00226 10.7786 3.23869L10.6483 4.21651C10.2658 7.0847 8.00939 9.34115 5.14119 9.72358L4.16338 9.85396C3.92694 9.88549 3.75037 10.0872 3.75037 10.3257C3.75037 10.5642 3.92694 10.7659 4.16338 10.7974L5.14119 10.9278C8.00938 11.3102 10.2658 13.5667 10.6483 16.4349L10.7786 17.4127C10.8102 17.6491 11.0118 17.8257 11.2504 17.8257C11.4889 17.8257 11.6906 17.6491 11.7221 17.4127L11.8525 16.4349C12.2349 13.5667 14.4913 11.3102 17.3595 10.9278L18.3374 10.7974C18.5738 10.7659 18.7504 10.5642 18.7504 10.3257C18.7504 10.0872 18.5738 9.88549 18.3374 9.85396L17.3595 9.72358C14.4913 9.34115 12.2349 7.0847 11.8525 4.21651Z"></path><path d="M4.6519 14.7568L4.82063 14.2084C4.84491 14.1295 4.91781 14.0757 5.00037 14.0757C5.08292 14.0757 5.15582 14.1295 5.1801 14.2084L5.34883 14.7568C5.56525 15.4602 6.11587 16.0108 6.81925 16.2272L7.36762 16.3959C7.44652 16.4202 7.50037 16.4931 7.50037 16.5757C7.50037 16.6582 7.44652 16.7311 7.36762 16.7554L6.81926 16.9241C6.11587 17.1406 5.56525 17.6912 5.34883 18.3946L5.1801 18.9429C5.15582 19.0218 5.08292 19.0757 5.00037 19.0757C4.91781 19.0757 4.84491 19.0218 4.82063 18.9429L4.65191 18.3946C4.43548 17.6912 3.88486 17.1406 3.18147 16.9241L2.63311 16.7554C2.55421 16.7311 2.50037 16.6582 2.50037 16.5757C2.50037 16.4931 2.55421 16.4202 2.63311 16.3959L3.18148 16.2272C3.88486 16.0108 4.43548 15.4602 4.6519 14.7568Z"></path></svg>';
        regenIcon.innerHTML = regenSvg;
        titleGroup.append(regenIcon, title);
        header.append(titleGroup, close);
      } else header.append(title, close);
      dialog.appendChild(header);
      var body = document.createElement("div");
      body.style.cssText =
        "padding:12px 16px;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;";
      if (Number.isFinite(Number(options.promptCount))) {
        var stat = document.createElement("div");
        stat.style.cssText =
          "display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border:1px solid rgba(204,255,0,.14);border-radius:9px;background:rgba(204,255,0,.045);color:#bfc7ab;";
        var statLabel = document.createElement("span");
        statLabel.style.cssText = "display:flex;align-items:center;gap:7px;";
        statLabel.innerHTML =
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:#ccff00;"><path d="M4 6h16M4 12h10M4 18h13"/></svg>';
        var statText = document.createElement("span");
        statText.textContent = "Prompts";
        statLabel.appendChild(statText);
        var statValue = document.createElement("span");
        statValue.textContent = String(
          Math.max(0, Number(options.promptCount)),
        );
        statValue.style.cssText =
          "min-width:30px;padding:1px 7px;border-radius:6px;background:rgba(204,255,0,.1);color:#ccff00;font-size:18px;font-weight:700;line-height:1.4;text-align:center;font-variant-numeric:tabular-nums;";
        stat.append(statLabel, statValue);
        body.appendChild(stat);
      }
      var message = document.createElement("p");
      message.textContent = options.message || "";
      message.style.cssText = "margin:0;color:#d4d4d8;white-space:pre-wrap;";
      body.appendChild(message);
      if (options.note) {
        var note = document.createElement("p");
        note.textContent = options.note;
        note.style.cssText =
          "margin:0;padding:9px;border-radius:8px;background:rgba(59,130,246,.12);color:#bfdbfe;";
        body.appendChild(note);
      }
      var statusRow = null,
        statusPoll = null,
        statusBusy = false,
        statusRevision = 0,
        effectiveExecutionMode = null;
      var regenSettings = null;
      if (options.regenGroups)
        regenSettings = FloatingTracker._mountRegenSettings(
          body,
          options.regenGroups,
          function () {
            statusRevision++;
            if (confirmBtn) {
              confirmBtn.disabled = true;
              confirmBtn.style.opacity = ".48";
            }
            if (refreshStatus) void refreshStatus();
          },
        );
      if (typeof options.statusCheck === "function") {
        statusRow = document.createElement("div");
        statusRow.setAttribute("role", "status");
        statusRow.setAttribute("aria-live", "polite");
        statusRow.style.cssText =
          "padding:9px 12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;gap:10px;";
        statusRow.innerHTML =
          '<span style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.08);flex:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#3186FF"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/></svg></span><strong data-provider-label style="font-weight:600;white-space:nowrap;">Flow API</strong></span><span data-provider-badge style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.05);color:#888;font-size:11px;font-weight:500;white-space:nowrap;"><svg style="animation:tobyflow-ft-spin 1s linear infinite" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>' +
          _getTrackerT2("flowApiCheckingShort") +
          "</span></span>";
        statusRow.setAttribute("aria-busy", "true");
        body.appendChild(statusRow);
      }
      dialog.appendChild(body);
      var actions = document.createElement("div");
      actions.style.cssText =
        "display:flex;flex-shrink:0;justify-content:space-between;gap:8px;padding:10px 16px 14px;border-top:1px solid #2a2a2e;";
      function button(label, primary) {
        var el = document.createElement("button");
        el.type = "button";
        el.style.cssText =
          "display:inline-flex;align-items:center;justify-content:center;gap:7px;flex:1;padding:8px 12px;border-radius:8px;border:0;cursor:pointer;font-size:12px;font-weight:600;background:" +
          (primary
            ? options.danger
              ? "#ef4444"
              : isRegen
                ? "#ccff00"
                : "#fff"
            : "#2a2a2e") +
          ";color:" +
          (primary ? (options.danger ? "#fff" : "#1a1a1e") : "#e8e8ea") +
          ";";
        el.innerHTML =
          (primary
            ? isRegen
              ? regenSvg.replace(
                  'width="20" height="20"',
                  'width="14" height="14"',
                )
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
            : "") + "<span></span>";
        el.querySelector("span").textContent = label;
        return el;
      }
      var cancel = button(_getTrackerT2("cancel"), false),
        confirmBtn = button(
          options.confirmLabel || _getTrackerT2("regenConfirm"),
          true,
        );
      if (statusRow) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = ".48";
        confirmBtn.style.cursor = "not-allowed";
      }
      actions.append(cancel, confirmBtn);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        if (statusPoll) clearInterval(statusPoll);
        document.removeEventListener("keydown", onKey);
        regenSettings?.destroy();
        overlay.remove();
        resolve(value);
      }
      function onKey(event) {
        if (event.key === "Escape") finish(false);
        if (event.key === "Tab") {
          var focusable = Array.from(
              dialog.querySelectorAll(
                "button:not(:disabled), select:not(:disabled)",
              ),
            ),
            first = focusable[0],
            last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      cancel.addEventListener("click", function () {
        finish(false);
      });
      close.addEventListener("click", function () {
        finish(false);
      });
      confirmBtn.addEventListener("click", function () {
        if (!confirmBtn.disabled)
          finish(
            regenSettings
              ? Object.assign(regenSettings.read(), { effectiveExecutionMode })
              : true,
          );
      });
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) finish(false);
      });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);
      (statusRow ? cancel : confirmBtn).focus();
      if (statusRow) {
        var refreshStatus = async function () {
          if (done || statusBusy) return;
          var checkRevision = statusRevision;
          statusBusy = true;
          statusRow.setAttribute("aria-busy", "true");
          try {
            var result = await options.statusCheck(regenSettings?.read());
            if (done || checkRevision !== statusRevision) return;
            var ready = result?.ready === true;
            var admitted =
              (ready || result?.admit === true) &&
              (!regenSettings || regenSettings.ready());
            effectiveExecutionMode =
              admitted && result?.route === "web" ? "web" : null;
            var routeName =
              result?.route === "api"
                ? "Flow API" +
                  (result.driver === "v2"
                    ? " V2"
                    : result.driver === "v1"
                      ? " V1"
                      : "")
                : "Google Flow";
            var label = ready
              ? _getTrackerT2("flowApiReadyShort")
              : _getTrackerT2("flowApiDisconnectedShort");
            statusRow.querySelector("[data-provider-label]").textContent =
              routeName;
            var badge = statusRow.querySelector("[data-provider-badge]");
            badge.innerHTML =
              (ready
                ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>') +
              "<span></span>";
            badge.querySelector("span").textContent = label;
            badge.style.color = ready ? "#22c55e" : "#f59e0b";
            badge.style.background = ready
              ? "rgba(34,197,94,.15)"
              : "rgba(245,158,11,.15)";
            confirmBtn.disabled = !admitted;
            confirmBtn.style.opacity = admitted ? "1" : ".48";
            confirmBtn.style.cursor = admitted ? "pointer" : "not-allowed";
          } catch (_) {
            if (!done) {
              var catchBadge = statusRow.querySelector("[data-provider-badge]");
              catchBadge.textContent = _getTrackerT2(
                "flowApiDisconnectedShort",
              );
              catchBadge.style.color = "#f59e0b";
              catchBadge.style.background = "rgba(245,158,11,.15)";
              confirmBtn.disabled = true;
            }
          } finally {
            statusBusy = false;
            if (!done) {
              statusRow.setAttribute("aria-busy", "false");
              if (checkRevision !== statusRevision) void refreshStatus();
            }
          }
        };
        refreshStatus();
        statusPoll = setInterval(function () {
          regenSettings?.retryMissing();
          void refreshStatus();
        }, 3e3);
      }
    });
  };
  FloatingTracker._regenStatusCheck = function (groups, reconnect, selection) {
    var mediaTypes = [
      ...new Set(
        (groups || []).map(function (group) {
          var item = group?.item || group || {};
          var type =
            item.genType || item.settings?.genType || item.settings?.type || "";
          return String(type).toLowerCase().indexOf("video") >= 0
            ? "video"
            : "image";
        }),
      ),
    ];
    return this._sendAction("pq:regenPreflight", {
      mediaTypes: mediaTypes.length ? mediaTypes : ["image"],
      reconnect: reconnect === true,
      executionMode: selection?.executionMode || null,
    });
  };
  FloatingTracker._createRegenStatusCheck = function (groups) {
    this._confirmedRegenRoute = null;
    var reconnectAttempted = false;
    return function (selection) {
      var reconnect = !reconnectAttempted;
      reconnectAttempted = true;
      return FloatingTracker._regenStatusCheck(
        groups,
        reconnect,
        selection,
      ).then(function (result) {
        if (result?.ready === true || result?.admit === true) {
          FloatingTracker._confirmedRegenRoute =
            result.route === "api" ? "api" : "web";
        }
        return result;
      });
    };
  };
  FloatingTracker._confirmBulkRegen = function (groups) {
    var count = groups?.length || 0;
    if (!count) return Promise.resolve(false);
    var refCount = groups.filter(function (group) {
      return (group.item?.refFileIds || []).length > 0;
    }).length;
    return this._confirmAction({
      title: _getTrackerT2("regenBulkTitle"),
      message: String(_getTrackerT2("regenBulkMessage")).replace(
        "{count}",
        count,
      ),
      promptCount: count,
      regenGroups: groups,
      note: [
        refCount
          ? String(_getTrackerT2("regenBulkRefNote")).replace(
              "{count}",
              refCount,
            )
          : "",
        groups.find(function (group) {
          return (
            group.item?.statusKind === "unverified" && group.item.statusHint
          );
        })?.item.statusHint,
      ]
        .filter(Boolean)
        .join("\n"),
      confirmLabel: _getTrackerT2("regenConfirm"),
      statusCheck: this._createRegenStatusCheck(groups),
    });
  };
  FloatingTracker._selectedGridGroups = function (section) {
    if (!section?._vm || !section._cardsBody) return [];
    var selected = new Set(
      Array.prototype.map.call(
        section._cardsBody.querySelectorAll(
          '.tobyflow-ft-grid-card[data-selected="1"]',
        ),
        function (card) {
          return String(card.dataset.itemId || "");
        },
      ),
    );
    return section._vm.items.filter(function (group) {
      return selected.has(String(group.cardKey));
    });
  };
  FloatingTracker._syncBatchSelectionAction = function (section) {
    if (!section) return;
    var selected = this._selectedGridGroups(section),
      count = selected.length;
    section.dataset.hasSelection = count ? "1" : "0";
    var allSelected =
      section._vm?.items?.length > 0 && count === section._vm.items.length;
    var selectAllButton = section._selectAllBtn;
    if (selectAllButton) {
      var selectLabel = _getTrackerT2(
        allSelected ? "batchDeselectAll" : "batchSelectAll",
      );
      selectAllButton.disabled = !section._vm?.items?.length;
      selectAllButton.dataset.allSelected = allSelected ? "1" : "0";
      selectAllButton.setAttribute(
        "aria-pressed",
        allSelected ? "true" : "false",
      );
      selectAllButton.setAttribute("aria-label", selectLabel);
      selectAllButton.setAttribute("data-ft-tip", selectLabel);
      selectAllButton.title = selectLabel;
      selectAllButton.innerHTML = allSelected
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 2.5 2.5L16 9"/></svg>';
    }
    var sync = function (button, labelText, disabled) {
      if (!button) return;
      button.style.display = count ? "inline-flex" : "none";
      button.disabled = !count || disabled;
      var text = labelText + " (" + count + ")",
        label = button.querySelector("span");
      if (label) label.textContent = text;
      button.setAttribute("aria-label", text);
      button.title = text;
      button.setAttribute("data-ft-tip", text);
    };
    sync(
      section._regenSelectedBtn,
      _getTrackerT2("regenConfirm"),
      !this._isPipelineIdle() ||
        this._bulkRegenRunning === true ||
        section._vm?.manualRegenActive ||
        section._vm?.manualRegenBatchPending > 0,
    );
    sync(
      section._downloadSelectedBtn,
      _getTrackerT2("downloadBatch"),
      this._bulkDownloadRunning === true ||
        this._singleDownloadRunning === true ||
        !selected.some(function (group) {
          return FloatingTracker._itemResultsOf(group.item).length > 0;
        }),
    );
    sync(
      section._removeSelectedBtn,
      _getTrackerT2("removeItem"),
      selected.some(function (group) {
        return !FloatingTracker._canRemovePromptItem(group.item, section._vm);
      }),
    );
  };
  FloatingTracker._downloadBatchSelected = function (section, button) {
    var selected = this._selectedGridGroups(section);
    if (!selected.length) return;
    return this._downloadBatch({ items: selected }, button);
  };
  FloatingTracker._regenBatchSelected = async function (section, button) {
    if (
      !section ||
      !this._isPipelineIdle() ||
      this._bulkRegenRunning ||
      this._bulkRegenConfirmOpen ||
      section._vm?.manualRegenActive ||
      section._vm?.manualRegenBatchPending
    )
      return;
    var selected = this._selectedGridGroups(section);
    if (!selected.length) return;
    this._bulkRegenConfirmOpen = true;
    var confirmed = await this._confirmBulkRegen(selected);
    this._bulkRegenConfirmOpen = false;
    if (
      !confirmed ||
      !this._isPipelineIdle() ||
      section._vm?.manualRegenActive ||
      section._vm?.manualRegenBatchPending
    )
      return;
    var frozen = selected.map(function (group) {
      var escaped =
        window.CSS && CSS.escape ? CSS.escape(group.cardKey) : group.cardKey;
      var card = section._cardsBody.querySelector(
        '[data-item-id="' + escaped + '"]',
      );
      var payload = FloatingTracker._regenPayloadOf(group.item, group.jobId);
      payload.regenDisplay = {
        jobId: section._vm.id,
        sessionId: section._vm.sessionId,
        label: section._vm.label,
        owner: section._vm.owner,
        startedAt: section._vm.startedAt,
      };
      return {
        jobId: group.jobId,
        itemId: group.item.id,
        prompt:
          card?._promptEl?.value ||
          group.item.prompt ||
          group.item.promptText ||
          "",
        payload,
        settingsOverride: FloatingTracker._regenSettingsOverrideOf(
          group.item,
          confirmed,
        ),
      };
    });
    this._bulkRegenRunning = true;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      var response = await this._sendAction("pq:regenBatch", { items: frozen });
      if (!response?.ok) {
        var error = response?.error || "REGEN_BATCH_NOT_ACCEPTED";
        this._showTrackerNotice(
          String(error).indexOf("MENTION_UNRESOLVED:") === 0
            ? String(_getTrackerT2("regenMentionUnresolved")).replace(
                "{names}",
                String(error).split(":").slice(1).join(":"),
              )
            : error,
          true,
        );
        return;
      }
      section._cardsBody
        .querySelectorAll('.tobyflow-ft-grid-card[data-selected="1"]')
        .forEach(function (card) {
          card.dataset.selected = "0";
          var checkbox = card.querySelector(".tobyflow-ft-grid-select input");
          if (checkbox) checkbox.checked = false;
        });
    } finally {
      this._bulkRegenRunning = false;
      if (button) {
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
      }
      this._syncBatchSelectionAction(section);
    }
  };
  FloatingTracker._regenBatchFailed = async function (vm, button) {
    if (
      !this._isPipelineIdle() ||
      !vm ||
      this._bulkRegenRunning ||
      this._bulkRegenConfirmOpen ||
      vm.manualRegenActive ||
      vm.manualRegenBatchPending
    )
      return;
    var failed = vm.items.filter(function (g) {
      return FloatingTracker._isRegenRetryCandidate(g.item);
    });
    if (!failed.length) return;
    this._bulkRegenConfirmOpen = true;
    var confirmed = await this._confirmBulkRegen(failed);
    this._bulkRegenConfirmOpen = false;
    if (
      !confirmed ||
      !this._isPipelineIdle() ||
      vm.manualRegenActive ||
      vm.manualRegenBatchPending
    )
      return;
    this._bulkRegenRunning = true;
    var frozen = failed.map(function (g) {
      var card = FloatingTracker._gridBody?.querySelector(
        '[data-item-id="' +
          (window.CSS && CSS.escape ? CSS.escape(g.cardKey) : g.cardKey) +
          '"]',
      );
      var payload = FloatingTracker._regenPayloadOf(g.item, g.jobId);
      payload.regenDisplay = {
        jobId: vm.id,
        sessionId: vm.sessionId,
        label: vm.label,
        owner: vm.owner,
        startedAt: vm.startedAt,
      };
      return {
        jobId: g.jobId,
        itemId: g.item.id,
        prompt:
          card?._promptEl?.value || g.item.prompt || g.item.promptText || "",
        payload,
        settingsOverride: FloatingTracker._regenSettingsOverrideOf(
          g.item,
          confirmed,
        ),
      };
    });
    if (button) button.disabled = true;
    try {
      var response = await this._sendAction("pq:regenBatch", { items: frozen });
      if (!response?.ok) {
        var error = response?.error || "REGEN_BATCH_NOT_ACCEPTED";
        this._showTrackerNotice(
          String(error).indexOf("MENTION_UNRESOLVED:") === 0
            ? String(_getTrackerT2("regenMentionUnresolved")).replace(
                "{names}",
                String(error).split(":").slice(1).join(":"),
              )
            : error,
          true,
        );
      }
    } finally {
      this._bulkRegenRunning = false;
      if (button) button.disabled = false;
    }
  };
  FloatingTracker._removeBatchHistory = async function (vm, section, button) {
    if (
      !vm ||
      button?.disabled ||
      ["running", "paused"].indexOf(vm.status) >= 0
    )
      return;
    if (
      !(await this._confirmAction({
        title: _getTrackerT2("removeHistory"),
        message: _getTrackerT2("removeBatchConfirm"),
        confirmLabel: _getTrackerT2("removeHistory"),
        danger: true,
      }))
    )
      return;
    if (button) button.disabled = true;
    var response = null;
    try {
      var projectId =
        (self.getCurrentProjectId && self.getCurrentProjectId()) ||
        this._lastData?.projectId ||
        "";
      for (var qi = 0; qi < vm.items.length; qi++) {
        var runtimeItemId =
          vm.items[qi]?.item?.id || vm.items[qi]?.cardKey || null;
        if (!runtimeItemId) continue;
        var queueAck = await this._sendAction("pq:removeTrackerItem", {
          projectId,
          jobId: vm.items[qi].jobId || vm.id,
          itemId: runtimeItemId,
        });
        if (!queueAck?.ok)
          throw new Error(queueAck?.error || "QUEUE_REMOVE_FAILED");
      }
      response = await chrome.runtime.sendMessage({
        action: "ft:removeHistoryJob",
        key: this._FT_CACHE_KEY,
        projectId,
        sessionId: vm.sessionId,
        jobId: vm.id,
        queueRemovalConfirmed: true,
      });
    } catch (e) {
      response = { ok: false, error: e?.message || "CACHE_REMOVE_FAILED" };
    }
    if (!response?.ok) {
      this._showTrackerNotice(response?.error || "CACHE_REMOVE_FAILED", true);
      if (button) button.disabled = false;
      return;
    }
    var targets = [
      this._lastData,
      this._gridOpenData,
      this._regenHistorySnapshot,
      this._nativeIdentitySourceData,
      this._gridApiLiveData,
    ];
    var seen = new Set(),
      lastDataChanged = false;
    targets.forEach(function (data) {
      if (!data || seen.has(data)) return;
      seen.add(data);
      if (FloatingTracker._pruneTrackerJobData(data, vm.sessionId, vm.id)) {
        if (data === FloatingTracker._lastData) lastDataChanged = true;
      }
    });
    vm.items.forEach(function (group) {
      var id = group?.item?.id || group?.cardKey;
      if (id) delete FloatingTracker._manualDlStates[id];
    });
    if (!section && this._gridBody) {
      section = Array.from(
        this._gridBody.querySelectorAll(".tobyflow-ft-batch"),
      ).find(function (candidate) {
        return (
          candidate._vm?.id === vm.id &&
          candidate._vm?.sessionId === vm.sessionId
        );
      });
    }
    if (section) this._releaseGridSection(section);
    this._pruneTrackerItemState?.(this._lastData);
    if (lastDataChanged && this._lastData)
      _origUpdate.call(this, this._lastData);
    if (!this._gridBody) {
      if (!(this._lastData?.jobs || []).length) this.hide();
      return;
    }
    if (!this._gridBody.querySelector(".tobyflow-ft-grid-card")) {
      this._closeGrid(true);
      if (!(this._lastData?.jobs || []).length) this.hide();
      return;
    }
    this._applyGridFilters();
  };
  FloatingTracker._pruneTrackerJobData = function (data, sessionId, jobId) {
    if (!data || !Array.isArray(data.jobs)) return false;
    var before = data.jobs.length;
    data.jobs = data.jobs.filter(function (job) {
      return !(
        job.id === jobId && (job.sessionId || data.sessionId) === sessionId
      );
    });
    if (data.jobs.length === before) return false;
    data.total = data.jobs.reduce(function (sum, job) {
      return sum + (job.items || []).length;
    }, 0);
    data.completed = data.jobs.reduce(function (sum, job) {
      return (
        sum +
        (job.items || []).filter(function (item) {
          return FloatingTracker._itemResultsOf(item).length > 0;
        }).length
      );
    }, 0);
    data.failed = data.jobs.reduce(function (sum, job) {
      return (
        sum +
        (job.items || []).filter(function (item) {
          return (
            ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
              item.state,
            ) >= 0
          );
        }).length
      );
    }, 0);
    return true;
  };
  FloatingTracker._pruneTrackerItemData = function (
    data,
    sessionId,
    jobId,
    itemId,
  ) {
    if (!data || !Array.isArray(data.jobs)) return false;
    var changed = false;
    data.jobs.forEach(function (job) {
      if (
        job.id !== jobId ||
        (job.sessionId || data.sessionId) !== sessionId ||
        !Array.isArray(job.items)
      )
        return;
      var before = job.items.length;
      job.items = job.items.filter(function (item) {
        return item.id !== itemId;
      });
      if (job.items.length === before) return;
      changed = true;
      job.totalExpected = job.items.length;
      job.completedCount = job.items.filter(function (item) {
        return FloatingTracker._itemResultsOf(item).length > 0;
      }).length;
      job.failedCount = job.items.filter(function (item) {
        return (
          ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
            item.state,
          ) >= 0
        );
      }).length;
    });
    if (!changed) return false;
    data.jobs = data.jobs.filter(function (job) {
      return Array.isArray(job.items) && job.items.length > 0;
    });
    data.total = data.jobs.reduce(function (sum, job) {
      return sum + (job.items || []).length;
    }, 0);
    data.completed = data.jobs.reduce(function (sum, job) {
      return (
        sum +
        (job.items || []).filter(function (item) {
          return FloatingTracker._itemResultsOf(item).length > 0;
        }).length
      );
    }, 0);
    data.failed = data.jobs.reduce(function (sum, job) {
      return (
        sum +
        (job.items || []).filter(function (item) {
          return (
            ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
              item.state,
            ) >= 0
          );
        }).length
      );
    }, 0);
    return true;
  };
  FloatingTracker._replaceTrackerPromptData = function (
    data,
    sessionId,
    itemId,
    prompt,
  ) {
    if (!data || !Array.isArray(data.jobs)) return false;
    var changed = false;
    data.jobs.forEach(function (job) {
      if ((job.sessionId || data.sessionId) !== sessionId) return;
      (job.items || []).forEach(function (item) {
        if (item.id !== itemId) return;
        item.prompt = prompt;
        item.promptText = prompt.substring(0, 80);
        changed = true;
      });
    });
    return changed;
  };
  FloatingTracker._saveGridPrompt = async function (card, button) {
    if (!card?._promptEl || button?.disabled) return;
    var prompt = card._promptEl.value.trim();
    if (!prompt || prompt === card._promptEl._originalValue) return;
    var projectId =
      (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
    var sessionId = card._sessionId;
    var itemId = card._displayItem?.id;
    var jobId = card._jobId;
    if (
      !projectId ||
      !sessionId ||
      !jobId ||
      !itemId ||
      !this._isCurrentProjectItem(card._displayItem)
    ) {
      this._showTrackerNotice("PROJECT_CONTEXT_MISMATCH", true);
      return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      var queueAck = await this._sendAction("pq:updateTrackerPrompt", {
        projectId,
        jobId,
        itemId,
        prompt,
      });
      if (!queueAck?.ok)
        throw new Error(queueAck?.error || "PROMPT_SAVE_FAILED");
      var cacheAck = await chrome.runtime.sendMessage({
        action: "ft:updateHistoryPrompt",
        key: this._FT_CACHE_KEY,
        projectId,
        sessionId,
        itemId,
        prompt,
      });
      if (!cacheAck?.ok)
        throw new Error(cacheAck?.error || "CACHE_SAVE_FAILED");
      var targets = [
        this._lastData,
        this._gridOpenData,
        this._regenHistorySnapshot,
        this._nativeIdentitySourceData,
        this._gridApiLiveData,
      ];
      var seen = new Set();
      targets.forEach(function (data) {
        if (!data || seen.has(data)) return;
        seen.add(data);
        FloatingTracker._replaceTrackerPromptData(
          data,
          sessionId,
          itemId,
          prompt,
        );
      });
      if (card._displayItem) {
        card._displayItem.prompt = prompt;
        card._displayItem.promptText = prompt.substring(0, 80);
      }
      card._promptEl._originalValue = prompt;
      if (card._promptEl.value.trim() === prompt) card._promptEl.value = prompt;
      card._syncDraft?.();
      if (this._hasLiveGrid?.()) this._refreshGrid();
    } catch (error) {
      this._showTrackerNotice(error?.message || "PROMPT_SAVE_FAILED", true);
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = false;
      card._syncDraft?.();
    }
  };
  FloatingTracker._canRemovePromptItem = function (item, job) {
    if (!item) return false;
    if (
      [
        "SUBMITTING",
        "SUBMITTED",
        "MONITORING",
        "RETRY_SUBMIT",
        "WAITING_USER",
        "WAITING_PROVIDER",
        "RECOVERY_REQUIRED",
      ].includes(item.state)
    )
      return false;
    if (item.trackerRemovable === true) return true;
    if (["running", "paused"].includes(job?.status)) return false;
    return (
      this._isPipelineIdle() &&
      ["COMPLETED", "FAILED", "PARTIAL_FAIL", "BLOCKED", "CANCELLED"].includes(
        item.state,
      )
    );
  };
  FloatingTracker._canRegenPromptItem = function (item, job) {
    var manualLane = job?.status === "paused" && job.manualRegenActive === true;
    if (!item || (!this._isPipelineIdle() && !manualLane)) return false;
    if (this._isQueuedRegenItem(item, job)) return false;
    if (
      job?.status === "paused" &&
      (job.items || []).some(function (entry) {
        return (
          [
            "SUBMITTING",
            "SUBMITTED",
            "MONITORING",
            "RETRY_SUBMIT",
            "WAITING_USER",
            "WAITING_PROVIDER",
            "RECOVERY_REQUIRED",
            "WAITING_DEPENDENCY",
          ].includes(entry.state) &&
          (!manualLane || entry.id !== job.manualRegenItemId)
        );
      })
    )
      return false;
    if (item.state === "PENDING") {
      return (
        job?.status === "paused" &&
        job._ftCachedJob !== true &&
        item.trackerRemovable === true
      );
    }
    return item.state === "COMPLETED" || this._isRegenRetryCandidate(item);
  };
  FloatingTracker._isQueuedRegenItem = function (item, job) {
    return (
      !!item &&
      (job?.manualRegenQueuedIds || []).includes(
        item._regenSlotRoot || item.regenOf || item.id,
      )
    );
  };
  FloatingTracker._resumeJobIdForItem = function (item, job) {
    if (!item || item.state !== "WAITING_PROVIDER" || !job || job._ftCachedJob)
      return null;
    if (
      job.manualRegenActive &&
      job.manualRegenStatus === "paused" &&
      job.manualRegenJobId &&
      job.manualRegenItemId === item.id
    )
      return job.manualRegenJobId;
    if (
      job.items?.length === 1 &&
      job.status === "paused" &&
      ["captcha", "api_unusual_activity", "provider_auth"].includes(
        job.pauseReason,
      )
    ) {
      return job.executionJobId || job.id;
    }
    return null;
  };
  FloatingTracker._removeCompactItem = async function (button) {
    var jobId = button?.getAttribute("data-job-id");
    var itemId = button?.getAttribute("data-item-id");
    var job = (this._lastData?.jobs || []).find(function (entry) {
      return entry.id === jobId;
    });
    var item = job?.items?.find(function (entry) {
      return entry.id === itemId;
    });
    if (!job || !item || !this._canRemovePromptItem(item, job)) return;
    var gridCard = Array.from(
      this._gridBody?.querySelectorAll(".tobyflow-ft-grid-card") || [],
    ).find(function (card) {
      return card._jobId === jobId && card._displayItem?.id === itemId;
    });
    if (gridCard) return this._removeGridItem(gridCard, gridCard._removeBtn);
    if (
      !(await this._confirmAction({
        title: _getTrackerT2("removeItem"),
        message: _getTrackerT2(
          item.state === "PENDING"
            ? "removeQueuedConfirm"
            : "removeItemConfirm",
        ),
        confirmLabel: _getTrackerT2("removeItem"),
        danger: true,
      }))
    )
      return;
    var projectId =
      (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
    var sessionId = job.sessionId || this._lastData?.sessionId;
    if (!projectId || !sessionId || !this._isCurrentProjectItem(item)) {
      this._showTrackerNotice("PROJECT_CONTEXT_MISMATCH", true);
      return;
    }
    button.disabled = true;
    try {
      var queueAck = await this._sendAction("pq:removeTrackerItem", {
        projectId,
        jobId,
        itemId,
      });
      if (!queueAck?.ok)
        throw new Error(queueAck?.error || "QUEUE_REMOVE_FAILED");
      var cacheAck = await chrome.runtime.sendMessage({
        action: "ft:removeHistoryItem",
        key: this._FT_CACHE_KEY,
        projectId,
        sessionId,
        jobId,
        itemId,
        queueRemovalConfirmed: true,
      });
      if (!cacheAck?.ok)
        throw new Error(cacheAck?.error || "CACHE_REMOVE_FAILED");
      var targets = [
        this._lastData,
        this._gridOpenData,
        this._regenHistorySnapshot,
        this._nativeIdentitySourceData,
        this._gridApiLiveData,
      ];
      var seen = new Set();
      targets.forEach(function (data) {
        if (!data || seen.has(data)) return;
        seen.add(data);
        FloatingTracker._pruneTrackerItemData(data, sessionId, jobId, itemId);
      });
      delete this._manualDlStates[itemId];
      if (this._lastData) _origUpdate.call(this, this._lastData);
      if (this._hasLiveGrid?.()) this._refreshGrid();
    } catch (error) {
      button.disabled = false;
      this._showTrackerNotice(error?.message || "REMOVE_ITEM_FAILED", true);
    }
  };
  FloatingTracker._removeGridItem = async function (card, button, confirmed) {
    if (
      !card ||
      button?.disabled ||
      !this._canRemovePromptItem(card._displayItem, card._displayJob)
    )
      return;
    if (
      confirmed !== true &&
      !(await this._confirmAction({
        title: _getTrackerT2("removeItem"),
        message: _getTrackerT2(
          card._displayItem?.state === "PENDING"
            ? "removeQueuedConfirm"
            : "removeItemConfirm",
        ),
        confirmLabel: _getTrackerT2("removeItem"),
        danger: true,
      }))
    )
      return;
    var projectId =
      (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
    var sessionId = card._sessionId,
      runtimeJobId = card._jobId;
    var jobId = card.closest(".tobyflow-ft-batch")?._vm?.id || runtimeJobId;
    var itemId = card._displayItem?.id || card._cardKey;
    if (
      !projectId ||
      !sessionId ||
      !jobId ||
      !itemId ||
      !this._isCurrentProjectItem(card._displayItem)
    ) {
      this._showTrackerNotice("PROJECT_CONTEXT_MISMATCH", true);
      return;
    }
    if (button) button.disabled = true;
    try {
      var queueAck = await this._sendAction("pq:removeTrackerItem", {
        projectId,
        jobId: runtimeJobId,
        itemId,
      });
      if (!queueAck?.ok)
        throw new Error(queueAck?.error || "QUEUE_REMOVE_FAILED");
      var cacheAck = await chrome.runtime.sendMessage({
        action: "ft:removeHistoryItem",
        key: this._FT_CACHE_KEY,
        projectId,
        sessionId,
        jobId,
        itemId,
        queueRemovalConfirmed: true,
      });
      if (!cacheAck?.ok)
        throw new Error(cacheAck?.error || "CACHE_REMOVE_FAILED");
      var targets = [
        this._lastData,
        this._gridOpenData,
        this._regenHistorySnapshot,
        this._nativeIdentitySourceData,
        this._gridApiLiveData,
      ];
      var seen = new Set();
      var lastDataChanged = false;
      targets.forEach(function (data) {
        if (!data || seen.has(data)) return;
        seen.add(data);
        var changed = FloatingTracker._pruneTrackerItemData(
          data,
          sessionId,
          jobId,
          itemId,
        );
        if (data === FloatingTracker._lastData && changed)
          lastDataChanged = true;
      });
      delete this._manualDlStates[itemId];
      var section = card.closest(".tobyflow-ft-batch");
      this._releaseGridCard(card);
      if (section && !section.querySelector(".tobyflow-ft-grid-card"))
        this._releaseGridSection(section);
      if (!this._gridBody?.querySelector(".tobyflow-ft-grid-card")) {
        this._closeGrid(true);
        this.hide();
        return;
      }
      if (lastDataChanged) _origUpdate.call(this, this._lastData);
      this._applyGridFilters();
    } catch (error) {
      if (button) button.disabled = false;
      this._showTrackerNotice(error?.message || "REMOVE_ITEM_FAILED", true);
    }
  };
  FloatingTracker._removeSelectedGridItems = async function (section, button) {
    if (!section || button?.disabled) return;
    var selected = this._selectedGridGroups(section);
    if (
      !selected.length ||
      selected.some(function (group) {
        return !FloatingTracker._canRemovePromptItem(group.item, section._vm);
      })
    )
      return;
    var allQueued = selected.every(function (group) {
      return group.item?.state === "PENDING";
    });
    if (
      !(await this._confirmAction({
        title: _getTrackerT2("removeItem"),
        message:
          _getTrackerT2(
            allQueued ? "removeQueuedConfirm" : "removeItemConfirm",
          ) +
          " (" +
          selected.length +
          ")",
        confirmLabel: _getTrackerT2("removeItem"),
        danger: true,
      }))
    )
      return;
    var cards = selected
      .map(function (group) {
        var escaped =
          window.CSS && CSS.escape ? CSS.escape(group.cardKey) : group.cardKey;
        return section._cardsBody.querySelector(
          '[data-item-id="' + escaped + '"]',
        );
      })
      .filter(Boolean);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      for (var i = 0; i < cards.length; i++) {
        await this._removeGridItem(cards[i], cards[i]._removeBtn, true);
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
      }
      if (section.isConnected) this._syncBatchSelectionAction(section);
    }
  };
  FloatingTracker._regenIcon = function (size) {
    var px = Number(size) || 20;
    return (
      '<svg width="' +
      px +
      '" height="' +
      px +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3V8M3 8H8M3 8L6 5.29168C7.59227 3.86656 9.69494 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.71683 21 4.13247 18.008 3.22302 14"/></svg>'
    );
  };
  FloatingTracker._clearAllGridHistory = async function (button) {
    if (this._clearHistoryRunning) return;
    if (
      !(await this._confirmAction({
        title: _getTrackerT2("clearAllGrid"),
        message: _getTrackerT2("clearAllGridConfirm"),
        confirmLabel: _getTrackerT2("clearAllGrid"),
        danger: true,
      }))
    )
      return;
    var projectId =
      (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
    if (!projectId) {
      this._showTrackerNotice("PROJECT_CONTEXT_MISMATCH", true);
      return;
    }
    this._clearHistoryRunning = true;
    if (button) button.setAttribute("aria-busy", "true");
    try {
      var queueAck = await this._sendAction("pq:clearTrackerHistory", {
        projectId,
        force: true,
      });
      if (!queueAck?.ok)
        throw new Error(queueAck?.error || "QUEUE_CLEAR_FAILED");
      var cacheAck = await chrome.runtime.sendMessage({
        action: "ft:clearProjectHistory",
        key: this._FT_CACHE_KEY,
        projectId,
      });
      if (!cacheAck?.ok)
        throw new Error(cacheAck?.error || "CACHE_CLEAR_FAILED");
      this._lastData = null;
      this._gridOpenData = null;
      this._gridHistoryReady = false;
      this._closeGrid(true);
      this.hide();
    } catch (error) {
      this._showTrackerNotice(error?.message || "CLEAR_HISTORY_FAILED", true);
    } finally {
      this._clearHistoryRunning = false;
      if (button) button.setAttribute("aria-busy", "false");
    }
  };
  FloatingTracker._buildBatchSection = function (vm) {
    var self2 = this,
      section = document.createElement("section");
    section.className = "tobyflow-ft-batch";
    section.dataset.batchKey = vm.key;
    section._vm = vm;
    section.style.cssText =
      "margin-bottom:14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.025);overflow:hidden;";
    var header = document.createElement("div");
    header.className = "tobyflow-ft-batch-header";
    header.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,.04);cursor:pointer;user-select:none;";
    header.setAttribute("role", "button");
    header.tabIndex = 0;
    var title = document.createElement("strong");
    title.className = "tobyflow-ft-batch-title";
    title.style.cssText =
      "font-size:12px;color:#fff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    var meta = document.createElement("span");
    meta.className = "tobyflow-ft-batch-meta";
    meta.style.cssText =
      "font-size:10px;color:rgba(255,255,255,.48);white-space:nowrap;";
    var batchElapsed = document.createElement("span");
    batchElapsed.className = "tobyflow-ft-batch-elapsed";
    batchElapsed.style.cssText =
      "display:inline-flex;align-items:center;gap:3px;flex:none;color:rgba(255,255,255,.58);font-size:9px;font-variant-numeric:tabular-nums;letter-spacing:.25px;white-space:nowrap;";
    batchElapsed.innerHTML =
      '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span data-ft-grid-batch-elapsed>00:00:00</span>';
    var modeBadge = document.createElement("span");
    modeBadge.className = "tobyflow-ft-batch-mode";
    var badge = document.createElement("span");
    badge.className = "tobyflow-ft-batch-status";
    badge.style.cssText =
      "font-size:10px;font-weight:700;height:20px;line-height:16px;box-sizing:border-box;display:inline-flex;align-items:center;padding:2px 6px;border-radius:5px;white-space:nowrap;";
    var selectAllToggle = document.createElement("button");
    selectAllToggle.type = "button";
    selectAllToggle.className = "tobyflow-ft-batch-select-all";
    selectAllToggle.style.cssText =
      "width:27px;height:27px;padding:0;flex:none;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:rgba(255,255,255,.055);color:#ddd;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;";
    selectAllToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      var shouldSelect = selectAllToggle.dataset.allSelected !== "1";
      if (section.dataset.collapsed === "1") {
        section._collapseUserTouched = true;
        self2._setBatchCollapsed(section, false, true);
      }
      if (!section._cardsBody) return;
      section._cardsBody
        .querySelectorAll(".tobyflow-ft-grid-card")
        .forEach(function (card) {
          var checkbox = card.querySelector(".tobyflow-ft-grid-select input");
          if (checkbox) checkbox.checked = shouldSelect;
          card.dataset.selected = shouldSelect ? "1" : "0";
        });
      self2._syncBatchSelectionAction(section);
    });
    section._selectAllBtn = selectAllToggle;
    var headerActions = document.createElement("div");
    headerActions.className = "tobyflow-ft-batch-actions";
    headerActions.style.cssText =
      "margin-left:auto;display:flex;align-items:center;gap:8px;min-width:0;";
    var selectedActions = document.createElement("div");
    selectedActions.className = "tobyflow-ft-batch-selected-actions";
    selectedActions.style.cssText =
      "display:flex;align-items:center;gap:4px;min-width:0;";
    var iconActions = document.createElement("div");
    iconActions.className = "tobyflow-ft-batch-icon-actions";
    iconActions.style.cssText =
      "display:flex;align-items:center;gap:4px;flex:none;";
    headerActions.append(selectedActions, iconActions);
    function action(i18nKey, className, icon, handler, target) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = className;
      b.title = _getTrackerT2(i18nKey);
      b.setAttribute("aria-label", _getTrackerT2(i18nKey));
      b.setAttribute("data-ft-tip", _getTrackerT2(i18nKey));
      b.style.cssText =
        "width:27px;height:27px;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:rgba(255,255,255,.055);color:#ddd;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;";
      b.innerHTML = icon;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        handler(e);
      });
      (target || iconActions).appendChild(b);
      return b;
    }
    var downloadIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>';
    var regenIcon = self2._regenIcon(14);
    var removeIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>';
    var regenSelected = action(
      "regenConfirm",
      "tobyflow-ft-regen-selected",
      regenIcon + "<span></span>",
      function (e) {
        self2._regenBatchSelected(section, e.currentTarget);
      },
      selectedActions,
    );
    regenSelected.style.width = "auto";
    regenSelected.style.padding = "0 8px";
    regenSelected.style.gap = "5px";
    regenSelected.style.display = "none";
    section._regenSelectedBtn = regenSelected;
    var downloadSelected = action(
      "downloadBatch",
      "tobyflow-ft-download-selected",
      downloadIcon + "<span></span>",
      function (e) {
        self2._downloadBatchSelected(section, e.currentTarget);
      },
      selectedActions,
    );
    downloadSelected.style.width = "auto";
    downloadSelected.style.padding = "0 8px";
    downloadSelected.style.gap = "5px";
    downloadSelected.style.display = "none";
    section._downloadSelectedBtn = downloadSelected;
    var removeSelected = action(
      "removeItem",
      "tobyflow-ft-remove-selected",
      removeIcon + "<span></span>",
      function (e) {
        self2._removeSelectedGridItems(section, e.currentTarget);
      },
      selectedActions,
    );
    removeSelected.style.width = "auto";
    removeSelected.style.padding = "0 8px";
    removeSelected.style.gap = "5px";
    removeSelected.style.display = "none";
    removeSelected.style.color = "#fca5a5";
    section._removeSelectedBtn = removeSelected;
    iconActions.appendChild(selectAllToggle);
    var download = action(
      "downloadBatch",
      "tobyflow-ft-download-batch",
      downloadIcon,
      function (e) {
        self2._downloadBatch(section._vm, e.currentTarget);
      },
    );
    action(
      "regenBatchFailed",
      "tobyflow-ft-regen-batch-failed",
      regenIcon,
      function (e) {
        self2._regenBatchFailed(section._vm, e.currentTarget);
      },
    );
    var remove = action(
      "removeHistory",
      "tobyflow-ft-remove-history",
      removeIcon,
      function (e) {
        self2._removeBatchHistory(section._vm, section, e.currentTarget);
      },
    );
    var collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "tobyflow-ft-batch-toggle";
    collapse.style.cssText =
      "width:27px;height:27px;border:0;border-radius:7px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;";
    function toggleBatch() {
      section._collapseUserTouched = true;
      var currentlyCollapsed =
        section.dataset.collapsed === "1" ||
        section._cardsBody?.hidden === true;
      self2._setBatchCollapsed(section, !currentlyCollapsed, true);
    }
    collapse.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleBatch();
    });
    header.addEventListener("click", function (e) {
      if (!e.target.closest("button")) toggleBatch();
    });
    header.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target === header) {
        e.preventDefault();
        toggleBatch();
      }
    });
    iconActions.appendChild(collapse);
    var addRef = action(
      "addBatchRefs",
      "tobyflow-ft-add-batch-ref",
      self2._batchRefIcon(),
      function (e) {
        self2._addBatchReferences(section._vm, e.currentTarget);
      },
    );
    addRef.style.color = "#000";
    addRef.style.background =
      "linear-gradient(90deg, rgb(204, 255, 0) 0%, rgb(234, 255, 152) 100%)";
    addRef.style.flexShrink = "0";
    var headerInfo = document.createElement("div");
    headerInfo.className = "tobyflow-ft-batch-info";
    headerInfo.append(title, meta, batchElapsed, modeBadge, badge);
    header.append(headerInfo, headerActions);
    section.appendChild(header);
    var pauseNotice = document.createElement("div");
    pauseNotice.className = "tobyflow-ft-batch-pause-notice";
    pauseNotice.style.cssText =
      "display:none;align-items:flex-start;gap:7px;padding:8px 12px;border-top:1px solid rgba(245,158,11,.16);background:rgba(245,158,11,.08);color:#fde68a;font-size:10.5px;line-height:1.4;";
    pauseNotice.innerHTML =
      '<svg viewBox="0 0 24 24" fill="#fbbf24" aria-hidden="true" style="width:16px;height:16px;flex:none;margin-top:1px;"><path d="M12 3 2.7 20h18.6L12 3Zm1 13h-2v-2h2v2Zm0-4h-2V8h2v4Z"/></svg><span></span>';
    pauseNotice.querySelector("span").style.cssText =
      "flex:1;min-width:0;align-self:center;";
    var resumeBatch = document.createElement("button");
    resumeBatch.type = "button";
    resumeBatch.className = "tobyflow-ft-batch-resume";
    resumeBatch.style.cssText =
      "display:inline-flex;align-items:center;align-self:center;gap:5px;flex:none;margin-left:auto;padding:5px 9px;border:1px solid rgba(74,222,128,.4);border-radius:6px;background:rgba(74,222,128,.14);color:#4ade80;font:inherit;font-weight:600;cursor:pointer;transition:filter .15s,box-shadow .15s;";
    resumeBatch.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>' +
      self2._escHtml(_getTrackerT2("resume"));
    resumeBatch.addEventListener("click", async function (e) {
      e.stopPropagation();
      var current = section._vm;
      if (
        resumeBatch.disabled ||
        !current?.id ||
        current.status !== "paused" ||
        current.manualRegenActive ||
        current.manualRegenBatchPending
      )
        return;
      resumeBatch.disabled = true;
      resumeBatch.setAttribute("aria-busy", "true");
      try {
        await self2._sendAction("pq:resumeJob", {
          jobId: current.manualRegenActive
            ? current.manualRegenJobId
            : current.id,
        });
      } finally {
        resumeBatch.removeAttribute("aria-busy");
        resumeBatch.disabled =
          section._vm?.status !== "paused" ||
          section._vm?.manualRegenActive === true ||
          section._vm?.manualRegenBatchPending > 0;
      }
    });
    pauseNotice.appendChild(resumeBatch);
    section.appendChild(pauseNotice);
    section._actions = null;
    var cards = document.createElement("div");
    cards.className = "tobyflow-ft-batch-cards";
    cards.style.cssText =
      "padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(154px,100%),1fr));grid-auto-rows:8px;gap:12px;align-items:start;";
    section._cardsBody = cards;
    section.appendChild(cards);
    section._collapseBtn = collapse;
    section._header = header;
    section.dataset.collapsed = vm.defaultCollapsed ? "1" : "0";
    this._setBatchCollapsed(section, !!vm.defaultCollapsed, false);
    this._updateBatchSection(section, vm);
    return section;
  };
  FloatingTracker._releaseGridCard = function (card) {
    if (!card) return;
    this._gridCardObserver?.unobserve(card);
    if (this._gridAspectObserver && card._thumbWrap)
      this._gridAspectObserver.unobserve(card._thumbWrap);
    this._gridMasonryObserver?.unobserve(card);
    if (
      this._gridHoverPlayback &&
      card.contains?.(this._gridHoverPlayback.thumb)
    )
      this._gridHoverPlayback.close();
    var self2 = this;
    var media = card.querySelectorAll
      ? Array.from(
          card.querySelectorAll(
            "[data-ft-preview-src],[data-ft-preview-hydrate],[data-ft-poster-owner]",
          ),
        )
      : Array.from(this._previewTargets || []).filter(function (node) {
          return card.contains?.(node);
        });
    media.push(card, card._thumbEl, card._thumbWrap);
    media.forEach(function (node) {
      if (!node) return;
      node._ftPosterToken = null;
      self2._cancelGridPosterTask?.(node);
      if (!self2._previewTargets?.has(node)) return;
      if (node.tagName === "VIDEO") self2._resetPreviewVideo(node);
      else node.removeAttribute("src");
      self2._previewObserver?.unobserve(node);
      self2._previewTargets.delete(node);
    });
    card.remove();
  };
  FloatingTracker._releaseGridSection = function (section) {
    var self2 = this;
    Array.from(section.querySelectorAll(".tobyflow-ft-grid-card")).forEach(
      function (card) {
        self2._releaseGridCard(card);
      },
    );
    section.remove();
  };
  FloatingTracker._trimGridHistory = function () {
    var policy = this._trackerHistoryPolicy;
    if (!policy || !this._gridBody) return;
    var sections = Array.from(
      this._gridBody.querySelectorAll(".tobyflow-ft-batch"),
    );
    var sessions = new Map(),
      self2 = this;
    var busy = new Set([
      "PENDING",
      "WAITING_DEPENDENCY",
      "SUBMITTING",
      "SUBMITTED",
      "MONITORING",
      "RETRY_SUBMIT",
      "WAITING_USER",
      "WAITING_PROVIDER",
      "RECOVERY_REQUIRED",
    ]);
    sections.forEach(function (section, index) {
      var job = section._vm;
      if (!job) return;
      var sid =
        job.sessionId || String(section.dataset.batchKey).split("::")[0];
      if (!sessions.has(sid)) sessions.set(sid, []);
      var protectedSection =
        !!section.querySelector('[data-draft-dirty="1"],[data-selected="1"]') ||
        !!(
          self2._gridHoverPlayback &&
          section.contains?.(self2._gridHoverPlayback.thumb)
        ) ||
        (job.items || []).some(function (group) {
          var item = group.item || group;
          return (
            busy.has(String(item.state || "").toUpperCase()) ||
            item.dl === "downloading" ||
            ["queued", "downloading"].includes(item.dl?.state) ||
            Object.values(self2._manualDlStates?.[item.id] || {}).some(
              function (dl) {
                return dl.state === "downloading";
              },
            )
          );
        });
      sessions
        .get(sid)
        .push({
          section,
          protectedSection,
          count: (job.items || []).length,
          time: Number(job.completedAt || job.startedAt) || index,
        });
    });
    var groups = Array.from(sessions.values()).map(function (entries) {
      return {
        entries,
        protectedGroup: entries.some(function (entry) {
          return entry.protectedSection;
        }),
        time: Math.max.apply(
          Math,
          entries.map(function (entry) {
            return entry.time;
          }),
        ),
      };
    });
    var active = groups.filter(function (group) {
      return group.protectedGroup;
    });
    var terminal = groups
      .filter(function (group) {
        return !group.protectedGroup;
      })
      .sort(function (a, b) {
        return b.time - a.time;
      });
    var retainedGroups = new Set(
      active.concat(
        terminal.slice(0, Math.max(0, policy.maxSessions - active.length)),
      ),
    );
    var removedKeys = new Set();
    groups.forEach(function (group) {
      var kept = group.entries.filter(function (entry) {
        return entry.protectedSection;
      });
      var used = kept.reduce(function (sum, entry) {
        return sum + entry.count;
      }, 0);
      group.entries
        .filter(function (entry) {
          return !entry.protectedSection;
        })
        .sort(function (a, b) {
          return b.time - a.time;
        })
        .forEach(function (entry) {
          if (
            retainedGroups.has(group) &&
            (!kept.length || used + entry.count <= policy.maxItems)
          ) {
            kept.push(entry);
            used += entry.count;
            return;
          }
          removedKeys.add(entry.section.dataset.batchKey);
          self2._releaseGridSection(entry.section);
        });
    });
    if (!removedKeys.size) return;
    this._prunePreviewMedia?.();
    ["_lastData", "_gridOpenData", "_regenHistorySnapshot"].forEach(
      function (key) {
        var data = self2[key];
        if (!data?.jobs) return;
        self2[key] = Object.assign({}, data, {
          jobs: data.jobs.filter(function (job) {
            return !removedKeys.has(
              (job.sessionId || data.sessionId || "imported-session") +
                "::" +
                job.id,
            );
          }),
        });
        if (data._ftRestoredCache)
          Object.defineProperty(self2[key], "_ftRestoredCache", {
            value: true,
          });
        if (data._ftHistoryMerged)
          Object.defineProperty(self2[key], "_ftHistoryMerged", {
            value: true,
          });
      },
    );
  };
  FloatingTracker._updateBatchSection = function (section, vm) {
    section._vm = vm;
    var regenLoading = vm.items.find(function (group) {
      return (
        group.item._regenSlotRoot &&
        [
          "PENDING",
          "SUBMITTING",
          "SUBMITTED",
          "MONITORING",
          "RETRY_SUBMIT",
        ].indexOf(group.item.state) >= 0
      );
    });
    if (regenLoading && section._expandedRegenItem !== regenLoading.item.id) {
      section._expandedRegenItem = regenLoading.item.id;
      this._setBatchCollapsed(section, false, false);
    }
    section.querySelector(".tobyflow-ft-batch-title").textContent = vm.label;
    section.querySelector(".tobyflow-ft-batch-meta").textContent =
      vm.owner +
      " \xB7 " +
      (vm.startedAt
        ? new Date(vm.startedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "") +
      (vm.chain ? " \xB7 " + _getTrackerT2("chainBadge") : "");
    var batchElapsed = section.querySelector("[data-ft-grid-batch-elapsed]");
    if (batchElapsed)
      batchElapsed.textContent = this._formatBatchElapsed(vm, Date.now());
    var modeBadge = section.querySelector(".tobyflow-ft-batch-mode");
    if (modeBadge) {
      var mode =
        ["api", "mixed"].indexOf(vm.modeType) >= 0 ? vm.modeType : "web";
      modeBadge.textContent = mode.toUpperCase();
      modeBadge.title =
        (mode === "api"
          ? "Flow API"
          : mode === "mixed"
            ? "Flow API + Web"
            : "Flow Web") + (vm.modeReason ? " \xB7 " + vm.modeReason : "");
      modeBadge.style.cssText =
        "height:20px;line-height:16px;box-sizing:border-box;display:inline-flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:.3px;padding:2px 6px;border-radius:5px;white-space:nowrap;flex-shrink:0;" +
        (mode === "api"
          ? "background:rgba(34,211,238,.16);color:#22d3ee;"
          : mode === "mixed"
            ? "background:rgba(168,85,247,.18);color:#c084fc;"
            : "background:rgba(255,255,255,.08);color:rgba(255,255,255,.58);");
    }
    section.querySelector(".tobyflow-ft-batch-status").textContent =
      this._batchStatusLabel(vm) +
      " \xB7 " +
      vm.completed +
      "/" +
      vm.total +
      (vm.failed ? " \xB7 " + vm.failed + " " + _getTrackerT2("failed") : "");
    var recoveryTip = vm.recoveryRequired
      ? [vm.recoveryRequired, vm.recoveryLabel, vm.recoveryHint]
          .filter(Boolean)
          .join(" \u2014 ")
      : "";
    var statusEl = section.querySelector(".tobyflow-ft-batch-status");
    var statusTone = this._batchStatusTone(vm);
    statusEl.style.background = statusTone.background;
    statusEl.style.color = statusTone.color;
    statusEl.title = recoveryTip;
    if (recoveryTip) statusEl.setAttribute("data-ft-tip", recoveryTip);
    else statusEl.removeAttribute("data-ft-tip");
    var pauseMessage = this._batchPauseMessage(vm);
    var pauseNotice = section.querySelector(".tobyflow-ft-batch-pause-notice");
    if (pauseNotice) {
      pauseNotice.style.display = pauseMessage ? "flex" : "none";
      var pauseText = pauseNotice.querySelector("span");
      if (pauseText) pauseText.textContent = pauseMessage;
      var resumeBatch = pauseNotice.querySelector(".tobyflow-ft-batch-resume");
      if (resumeBatch)
        resumeBatch.disabled =
          !vm.id ||
          vm.status !== "paused" ||
          vm.manualRegenActive ||
          vm.manualRegenBatchPending > 0 ||
          resumeBatch.getAttribute("aria-busy") === "true";
    }
    if (pauseMessage) {
      statusEl.title = pauseMessage;
      statusEl.setAttribute("data-ft-tip", pauseMessage);
    }
    var addRef = section.querySelector(".tobyflow-ft-add-batch-ref");
    if (addRef)
      addRef.style.display =
        !["running", "paused", "pending", "queued"].includes(vm.status) &&
        vm.items.some((group) => this._itemResultsOf(group.item).length)
          ? "inline-flex"
          : "none";
    var download = section.querySelector(".tobyflow-ft-download-batch");
    if (download)
      download.disabled = !vm.items.some(function (group) {
        return FloatingTracker._itemResultsOf(group.item).length > 0;
      });
    var retryable = vm.items.filter(function (group) {
      return FloatingTracker._isRegenRetryCandidate(group.item);
    });
    var regenFailed = section.querySelector(".tobyflow-ft-regen-batch-failed");
    if (regenFailed) {
      regenFailed.disabled =
        !retryable.length ||
        !this._isPipelineIdle() ||
        this._bulkRegenRunning === true ||
        vm.manualRegenActive ||
        vm.manualRegenBatchPending > 0;
      regenFailed.style.display = retryable.length ? "inline-flex" : "none";
      regenFailed.style.color = "#fbbf24";
      var regenLabel =
        _getTrackerT2("regenBatchFailed") + " (" + retryable.length + ")";
      regenFailed.setAttribute("aria-label", regenLabel);
      regenFailed.setAttribute("data-ft-tip", regenLabel);
      regenFailed.title = regenLabel;
      regenFailed.style.opacity = regenFailed.disabled ? ".35" : "1";
    }
    var remove = section.querySelector(".tobyflow-ft-remove-history");
    if (remove) remove.disabled = ["running", "paused"].indexOf(vm.status) >= 0;
    if (section.dataset.collapsed === "1") {
      this._syncBatchSelectionAction(section);
      return;
    }
    var displayItems = this._currentTrackerItems(vm, vm.items);
    var protectedKeys = new Set(
      Array.from(section._cardsBody.children)
        .filter(function (card) {
          return (
            card.dataset.draftDirty === "1" ||
            card.dataset.editorOpen === "1" ||
            card.dataset.selected === "1" ||
            (FloatingTracker._gridHoverPlayback &&
              card.contains(FloatingTracker._gridHoverPlayback.thumb))
          );
        })
        .map(function (card) {
          return card.dataset.itemId;
        }),
    );
    var displayKeys = new Set(
      displayItems.map(function (group) {
        return String(group.cardKey);
      }),
    );
    displayItems = vm.items.filter(function (group) {
      return (
        displayKeys.has(String(group.cardKey)) ||
        protectedKeys.has(String(group.cardKey))
      );
    });
    var ordinals = new Map(
      vm.items.map(function (group, index) {
        return [String(group.cardKey), index + 1];
      }),
    );
    var live = new Set(
        displayItems.map(function (g) {
          return String(g.cardKey);
        }),
      ),
      self2 = this;
    var cardsById = new Map();
    Array.from(section._cardsBody.children).forEach(function (card) {
      if (!live.has(card.dataset.itemId) && card.dataset.optimistic !== "1") {
        self2._releaseGridCard(card);
        return;
      }
      if (!cardsById.has(card.dataset.itemId))
        cardsById.set(card.dataset.itemId, card);
    });
    displayItems.forEach(function (g) {
      var ordinal = ordinals.get(String(g.cardKey));
      var card = cardsById.get(String(g.cardKey));
      if (card) self2._updateGridCard(card, g.item, g.jobId, vm);
      else {
        card = self2._buildGridCard(g.item, g.cardKey, g.jobId, ordinal, vm);
        section._cardsBody.appendChild(card);
        self2._observeGridCard(card);
      }
      card._ordinal = ordinal;
      card.dataset.ordinal = String(ordinal);
      var ordinalBadge = card.querySelector(".tobyflow-ft-grid-ordinal");
      if (ordinalBadge) ordinalBadge.textContent = "#" + ordinal;
      card._sessionId = vm.sessionId;
    });
    this._syncBatchSelectionAction(section);
    this._syncGridElapsedTimer();
  };
  FloatingTracker._matchesGridItem = function (item) {
    var q = String(this._gridSearch || "")
      .trim()
      .toLowerCase();
    var filter = this._gridFilter || "all";
    var matches =
      filter === "all" ||
      (filter === "success" && this._itemResultsOf(item).length > 0) ||
      (filter === "failed" &&
        (["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].includes(
          item.state,
        ) ||
          this._isRegenRetryCandidate(item))) ||
      (filter === "regen" && (item.isRegen || item.regenOf));
    return (
      !!matches &&
      (!q ||
        String(item.prompt || item.promptText || "")
          .toLowerCase()
          .includes(q))
    );
  };
  FloatingTracker._applyGridFilters = function () {
    if (!this._hasLiveGrid()) return;
    var cards = Array.prototype.slice.call(
      this._gridBody.querySelectorAll(".tobyflow-ft-grid-card"),
    );
    var q = String(this._gridSearch || "")
      .trim()
      .toLowerCase();
    var filter = this._gridFilter || "all";
    cards.forEach(function (card) {
      var matchesFilter =
        filter === "all" ||
        (filter === "success" && card.dataset.hasResult === "1") ||
        (filter === "failed" && card.dataset.failed === "1") ||
        (filter === "regen" && card.dataset.regen === "1");
      var matchesSearch =
        !q || String(card.dataset.prompt || "").indexOf(q) >= 0;
      card.style.display = matchesFilter && matchesSearch ? "flex" : "none";
    });
    var sections = Array.prototype.slice.call(
      this._gridBody.querySelectorAll(".tobyflow-ft-batch"),
    );
    var matchedCount = 0,
      totalCount = 0,
      tracker = this;
    sections.forEach(function (section) {
      var groups = section._vm?.items || [];
      var matched = groups.filter(function (group) {
        return tracker._matchesGridItem(group.item);
      }).length;
      totalCount += groups.length;
      matchedCount += matched;
      var own = Array.prototype.slice.call(
        section.querySelectorAll(".tobyflow-ft-grid-card"),
      );
      own.sort(function (a, b) {
        return Number(a.dataset.ordinal || 0) - Number(b.dataset.ordinal || 0);
      });
      var cursor = section._cardsBody.firstElementChild;
      own.forEach(function (card) {
        if (card !== cursor) section._cardsBody.insertBefore(card, cursor);
        cursor = card.nextElementSibling;
      });
      section.style.display = matched ? "block" : "none";
    });
    sections.sort(function (a, b) {
      var av = Number(a._vm?.startedAt || 0),
        bv = Number(b._vm?.startedAt || 0);
      return FloatingTracker._gridSort === "newest" ? bv - av : av - bv;
    });
    var batchCursor = this._gridBody.firstElementChild;
    sections.forEach(function (section) {
      if (section !== batchCursor)
        FloatingTracker._gridBody.insertBefore(section, batchCursor);
      batchCursor = section.nextElementSibling;
    });
    this._scheduleGridMasonryLayout();
    if (this._hasLiveGrid()) {
      var filterButtons = this._gridEl.querySelectorAll("[data-grid-filter]");
      for (var bi = 0; bi < filterButtons.length; bi++) {
        var active =
          filterButtons[bi].getAttribute("data-grid-filter") === filter;
        filterButtons[bi].style.background = active
          ? "rgba(204,255,0,.16)"
          : "rgba(255,255,255,.06)";
        filterButtons[bi].style.color = active ? "#ccff00" : "#ddd";
        filterButtons[bi].style.borderColor = active
          ? "rgba(204,255,0,.35)"
          : "rgba(255,255,255,.12)";
      }
    }
    var visible = matchedCount;
    var countEl = this._hasLiveGrid()
      ? this._gridEl.querySelector(".tobyflow-ft-grid-count")
      : null;
    var empty = this._gridBody.querySelector(".tobyflow-ft-grid-empty");
    if (!visible && !empty) {
      empty = document.createElement("div");
      empty.className = "tobyflow-ft-grid-empty";
      empty.setAttribute("data-ft-i18n", "gridNoResult");
      empty.setAttribute("role", "status");
      empty.style.cssText =
        "padding:28px 12px;text-align:center;color:rgba(255,255,255,.55);font-size:12px;";
      empty.textContent = _getTrackerT2("gridNoResult");
      this._gridBody.appendChild(empty);
    } else if (visible && empty) empty.remove();
    if (countEl) {
      var countLabel =
        visible === totalCount
          ? String(totalCount)
          : visible + "/" + totalCount;
      countEl.textContent = countLabel;
      countEl.setAttribute("aria-label", countLabel);
    }
  };
  FloatingTracker._refreshGridLocale = function () {
    if (!this._hasLiveGrid()) return;
    var nodes = this._gridEl.querySelectorAll("[data-ft-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-ft-i18n");
      if (nodes[i].tagName === "INPUT")
        nodes[i].placeholder = _getTrackerT2(key);
      else nodes[i].textContent = _getTrackerT2(key);
    }
    this._syncGridExecutionControls();
    this._lastJobsRenderSig = null;
  };
  FloatingTracker._waitForIdle = function (timeoutMs) {
    var self2 = this,
      started = Date.now();
    return new Promise(function (resolve) {
      function poll() {
        if (self2._isPipelineIdle()) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(poll, 1e3);
      }
      poll();
    });
  };
  FloatingTracker._patchCompactDom = function (current, incoming) {
    var self2 = this;
    function key(node) {
      return node.nodeType === 1 ? node.getAttribute("data-ft-key") : null;
    }
    function patch(node, next) {
      if (node.nodeType !== next.nodeType || node.nodeName !== next.nodeName) {
        var replacement = next.cloneNode(true);
        node.replaceWith(replacement);
        return replacement;
      }
      if (node.nodeType !== 1) {
        if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
        return node;
      }
      if (node.isEqualNode(next)) return node;
      var preview = next.hasAttribute("data-ft-preview-src");
      var samePreview =
        preview &&
        node.getAttribute("data-ft-preview-src") ===
          next.getAttribute("data-ft-preview-src");
      if (preview && !samePreview && node.nodeName === "VIDEO") {
        self2._resetPreviewVideo(node);
      }
      Array.from(node.attributes).forEach(function (attr) {
        if (samePreview && (attr.name === "src" || attr.name === "preload"))
          return;
        if (!next.hasAttribute(attr.name)) node.removeAttribute(attr.name);
      });
      Array.from(next.attributes).forEach(function (attr) {
        if (samePreview && attr.name === "preload") return;
        if (node.getAttribute(attr.name) !== attr.value)
          node.setAttribute(attr.name, attr.value);
      });
      children(node, next);
      return node;
    }
    function children(parent, nextParent) {
      var keyed = new Map();
      Array.from(parent.childNodes).forEach(function (node) {
        if (key(node)) keyed.set(key(node), node);
      });
      var cursor = parent.firstChild;
      Array.from(nextParent.childNodes).forEach(function (next) {
        var nextKey = key(next);
        var node = nextKey
          ? keyed.get(nextKey)
          : cursor && !key(cursor)
            ? cursor
            : null;
        if (!node) {
          node = next.cloneNode(true);
          parent.insertBefore(node, cursor);
        } else {
          if (node !== cursor) parent.insertBefore(node, cursor);
          node = patch(node, next);
        }
        cursor = node.nextSibling;
      });
      while (cursor) {
        var removed = cursor;
        cursor = cursor.nextSibling;
        removed.remove();
      }
    }
    children(current, incoming);
  };
  FloatingTracker._compactItemHtml = function (it, j, now) {
    var self2 = this,
      html = "";
    var promptShort = it.promptText
      ? it.promptText.length > 50
        ? it.promptText.substring(0, 50) + "..."
        : it.promptText
      : "";
    var timeInfo = self2._elapsedLabel(it, now, false);
    var retryBadge = "";
    if (it.retryCount > 0) {
      retryBadge =
        '<span style="font-size:8px;padding:0 3px;border-radius:2px;background:rgba(249,115,22,0.2);color:#fb923c;">x' +
        it.retryCount +
        "</span>";
    }
    var itemBg =
      it.state === "SUBMITTING" || it.state === "MONITORING"
        ? "background:rgba(255,255,255,0.03);border-radius:4px;"
        : "";
    var isGenActive =
      (it.state === "SUBMITTING" ||
        it.state === "SUBMITTED" ||
        it.state === "MONITORING" ||
        it.state === "RETRY_SUBMIT" ||
        it.state === "WAITING_PROVIDER" ||
        it.state === "RECOVERY_REQUIRED") &&
      !it.apiWaiting;
    var thumbHtml;
    var compactResults = self2._itemResultsOf(it);
    var compactFirst = compactResults[0] || null;
    if (compactFirst) {
      var mediaHtml = _ftGridMedia2(
        compactFirst,
        "width:100%;height:100%;object-fit:cover;display:block;",
      );
      thumbHtml =
        '<span class="tobyflow-ft-thumb">' +
        mediaHtml +
        '<span class="tobyflow-ft-thumb-view" data-thumb-view="1" data-item-id="' +
        self2._escHtml(it.id || "") +
        '" data-job-id="' +
        self2._escHtml(j.id || "") +
        '" title="' +
        _getTrackerT2("viewThumbTitle") +
        '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></span></span>';
    } else if (isGenActive) {
      self2._ensureSkeletonStyle();
      thumbHtml =
        '<span class="tobyflow-ft-thumb"><span class="tf-skel"><span class="tf-skel-ph">' +
        self2._loadingThumbnailContent(it) +
        "</span></span></span>";
    } else {
      thumbHtml =
        '<span class="tobyflow-ft-thumb" style="display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.4);">' +
        self2._mediaPlaceholderIcon(it) +
        "</span>";
    }
    html +=
      '<div data-ft-compact-row="" data-ft-key="item:' +
      self2._escHtml(it.id) +
      '" style="display:flex;align-items:center;gap:5px;padding:4px 4px;font-size:11px;min-height:50px;' +
      itemBg +
      '">';
    html += thumbHtml;
    html +=
      '<span style="color:rgba(255,255,255,0.4);font-size:10px;width:18px;flex-shrink:0;font-variant-numeric:tabular-nums;">#' +
      ((it.promptIndex || 0) + 1) +
      "</span>";
    html +=
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,0.7);" title="' +
      self2._escHtml(it.promptText || "") +
      '">' +
      self2._escHtml(promptShort) +
      "</span>";
    html += retryBadge;
    if (timeInfo) {
      html +=
        '<span data-ft-item-time="' +
        self2._escHtml(it.id || "") +
        '" style="font-size:9px;opacity:0.4;font-variant-numeric:tabular-nums;flex-shrink:0;">' +
        timeInfo +
        "</span>";
    }
    html += self2._itemStatusBadgeHtml(it);
    if (self2._resumeJobIdForItem(it, j)) {
      html +=
        '<button type="button" class="tobyflow-ft-item-btn" data-item-resume="1" data-item-id="' +
        self2._escHtml(it.id || "") +
        '" data-job-id="' +
        self2._escHtml(j.id || "") +
        '" data-ft-tip="' +
        self2._escHtml(_getTrackerT2("resume")) +
        '" aria-label="' +
        self2._escHtml(_getTrackerT2("resume")) +
        '" style="margin-left:2px;color:#4ade80;"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg></button>';
    }
    if (it.state === "WAITING_USER") {
      html +=
        '<button data-action="skip" title="' +
        _getTrackerT2("manualSkip") +
        '" style="margin-left:2px;padding:1px 5px;border:none;border-radius:3px;background:rgba(255,255,255,0.12);color:#fff;font-size:9px;cursor:pointer;flex-shrink:0;">' +
        _getTrackerT2("manualSkip") +
        "</button>";
    }
    var _itemResults = compactResults;
    var _canRegen =
      it.state === "COMPLETED" ||
      self2._isRegenRetryCandidate(it) ||
      (j.status === "paused" &&
        it.state === "PENDING" &&
        it.trackerRemovable === true);
    if (_canRegen) {
      var _idle = self2._canRegenPromptItem(it, j);
      var _regenTip = self2._isQueuedRegenItem(it, j)
        ? "regenQueued"
        : _idle
          ? "regenTitle"
          : "regenBusyTitle";
      html +=
        '<button class="tobyflow-ft-item-btn" data-item-regen="1" data-item-id="' +
        self2._escHtml(it.id || "") +
        '" data-job-id="' +
        self2._escHtml(j.id || "") +
        '"' +
        (_idle ? "" : " disabled") +
        ' data-ft-tip="' +
        _getTrackerT2(_regenTip) +
        '" style="margin-left:2px;">' +
        self2._regenIcon(13) +
        "</button>";
      if (_itemResults.length) {
        html +=
          '<button class="tobyflow-ft-item-btn" data-item-dl="1" data-item-id="' +
          self2._escHtml(it.id || "") +
          '" data-job-id="' +
          self2._escHtml(j.id || "") +
          '" data-ft-tip="' +
          _getTrackerT2("dlItemTitle") +
          '" style="margin-left:2px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>';
      }
    }
    if (self2._canRemovePromptItem(it, j)) {
      html +=
        '<button type="button" class="tobyflow-ft-item-btn" data-item-remove="1" data-item-id="' +
        self2._escHtml(it.id || "") +
        '" data-job-id="' +
        self2._escHtml(j.id || "") +
        '" data-ft-tip="' +
        self2._escHtml(_getTrackerT2("removeItem")) +
        '" aria-label="' +
        self2._escHtml(_getTrackerT2("removeItem")) +
        '" style="margin-left:2px;color:#fca5a5;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg></button>';
    }
    html += "</div>";
    return html;
  };
  FloatingTracker._observeCompactRows = function (root) {
    if (typeof IntersectionObserver !== "function") return;
    var self2 = this;
    if (this._compactRowsRoot !== root) {
      this._compactRowObserver?.disconnect();
      this._compactRowObserver = null;
      this._compactRowTargets?.clear();
      this._compactRowsRoot = root;
    }
    if (!this._compactRowTargets) this._compactRowTargets = new Set();
    this._compactRowTargets.forEach(function (row) {
      if (!row.isConnected) {
        self2._compactRowObserver?.unobserve(row);
        self2._compactRowTargets.delete(row);
      }
    });
    if (!this._compactRowObserver) {
      this._compactRowObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            var row = entry.target;
            if (
              self2._compactRowsRoot !== root ||
              !row.isConnected ||
              !root.contains(row)
            )
              return;
            row._ftCompactVisible = entry.isIntersecting;
            if (entry.isIntersecting) {
              if (!row.childNodes.length) {
                var data = self2._compactRowData?.get(
                  row.getAttribute("data-ft-key"),
                );
                if (data) {
                  var template = document.createElement("template");
                  template.innerHTML = self2._compactItemHtml(
                    data.item,
                    data.job,
                    Date.now(),
                  );
                  row.style.cssText =
                    template.content.firstElementChild.style.cssText;
                  row.replaceChildren(
                    ...template.content.firstElementChild.childNodes,
                  );
                }
              }
              self2._observePreviewMedia(row);
            } else {
              row.replaceChildren();
              self2._prunePreviewMedia();
            }
          });
        },
        { root, rootMargin: "100% 0px", threshold: 0 },
      );
    }
    root.querySelectorAll("[data-ft-compact-row]").forEach(function (row) {
      if (self2._compactRowTargets.has(row)) return;
      self2._compactRowTargets.add(row);
      self2._compactRowObserver.observe(row);
    });
  };
  FloatingTracker._releaseCompactRows = function () {
    this._compactRowObserver?.disconnect();
    this._compactRowObserver = null;
    this._compactRowsRoot = null;
    this._compactRenderRoot = null;
    this._compactRowTargets?.clear();
    this._compactRowData?.clear();
    this._el?.querySelector(".tobyflow-ft-jobs")?.replaceChildren();
    this._lastJobsRenderSig = null;
    this._prunePreviewMedia?.();
  };
  FloatingTracker._resetPreviewVideo = function (node) {
    if (
      node._ftPreviewFrameId != null &&
      typeof node.cancelVideoFrameCallback === "function"
    ) {
      node.cancelVideoFrameCallback(node._ftPreviewFrameId);
    }
    if (node._ftPreviewPauseFrame)
      node.removeEventListener("loadeddata", node._ftPreviewPauseFrame);
    node._ftPreviewFrameId = null;
    node._ftPreviewPauseFrame = null;
    node._ftPreviewStarted = false;
    node.pause();
    node.removeAttribute("src");
    node.load();
  };
  FloatingTracker._prunePreviewMedia = function () {
    if (!this._previewTargets) return;
    var self2 = this;
    this._previewTargets.forEach(function (node) {
      if (node.isConnected) return;
      node._ftPosterToken = null;
      self2._cancelGridPosterTask?.(node);
      if (node.tagName === "VIDEO") self2._resetPreviewVideo(node);
      self2._previewObserver?.unobserve(node);
      self2._previewTargets.delete(node);
    });
    if (!this._previewTargets.size && this._previewObserver) {
      this._previewObserver.disconnect();
      this._previewObserver = null;
    }
  };
  FloatingTracker._observePreviewMedia = function (root) {
    if (!root || root.isConnected === false) return;
    this._prunePreviewMedia();
    var self2 = this;
    function show(node, visible) {
      node._ftPreviewVisible = visible;
      if (!visible && node.hasAttribute("data-ft-poster-owner")) {
        node._ftPosterInterrupted = true;
        self2._cancelGridPosterTask?.(node);
        if (!node.querySelector("img") && node._ftPosterHydrate)
          node._ftPreviewHydrate = node._ftPosterHydrate;
      }
      if (node._ftPreviewHydrate) {
        if (visible) {
          var hydrate = node._ftPreviewHydrate;
          node._ftPreviewHydrate = null;
          node.removeAttribute("data-ft-preview-hydrate");
          hydrate();
        }
        return;
      }
      var src = node.getAttribute("data-ft-preview-src");
      if (!src) return;
      if (node.tagName === "VIDEO") {
        self2._resetPreviewVideo(node);
        return;
      }
      if (!visible) {
        if (node.naturalWidth > 0 && node.naturalHeight > 0) {
          node.setAttribute("width", node.naturalWidth);
          node.setAttribute("height", node.naturalHeight);
        }
        node.removeAttribute("src");
        return;
      }
      if (node.getAttribute("src") !== src) node.setAttribute("src", src);
    }
    var nodes = Array.from(
      root.querySelectorAll(
        "[data-ft-preview-src],[data-ft-preview-hydrate],[data-ft-poster-owner]",
      ),
    );
    if (root._ftPreviewHydrate) nodes.push(root);
    if (typeof IntersectionObserver !== "function") {
      nodes.forEach(function (node) {
        show(node, true);
      });
      return;
    }
    if (!this._previewTargets) this._previewTargets = new Set();
    if (!this._previewObserver)
      this._previewObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target.isConnected)
            show(entry.target, entry.isIntersecting);
        });
      });
    nodes.forEach(function (node) {
      if (self2._previewTargets.has(node)) {
        if (node._ftPreviewVisible) show(node, true);
        return;
      }
      self2._previewTargets.add(node);
      self2._previewObserver.observe(node);
    });
  };
  FloatingTracker._ensureSkeletonStyle = function () {
    if (document.getElementById("tobyflow-skeleton-style")) return;
    var st = document.createElement("style");
    st.id = "tobyflow-skeleton-style";
    st.textContent =
      "@keyframes tfShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes tfSkelPulse{0%,100%{opacity:.45}50%{opacity:1}}@keyframes tfSkelSpin{to{transform:rotate(360deg)}}.tf-skel{position:relative;width:100%;min-height:120px;border-radius:6px;overflow:hidden;background:linear-gradient(110deg,var(--surface-elevated,#2e2e33) 30%,var(--surface,#353539) 50%,var(--surface-elevated,#2e2e33) 70%);background-size:200% 100%;animation:tfShimmer 1.5s ease-in-out infinite;display:flex;align-items:center;justify-content:center;}.tf-skel--idle{background:linear-gradient(100deg,rgba(255,255,255,0.03) 30%,rgba(255,255,255,0.08) 50%,rgba(255,255,255,0.03) 70%);background-size:100% 100%;animation:none;}.tf-skel-dots{display:flex;gap:5px;}.tf-skel-dots i{width:5px;height:5px;border-radius:50%;background:#ccff00;display:block;animation:tfSkelPulse 1.1s ease-in-out infinite;}.tf-skel-dots i:nth-child(2){animation-delay:.18s}.tf-skel-dots i:nth-child(3){animation-delay:.36s}.tf-skel-label{font-size:10.5px;color:rgba(255,255,255,0.32);letter-spacing:.2px;}.tf-skel-elapsed{font-size:10px;line-height:1;color:rgba(255,255,255,.62);font-variant-numeric:tabular-nums;letter-spacing:.35px;text-shadow:0 1px 4px rgba(0,0,0,.45);}.tf-skel-retry-error{max-width:88%;font-size:10px;line-height:1.35;color:#fca5a5;text-align:center;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:anywhere;text-shadow:0 1px 4px rgba(0,0,0,.55);}.tf-skel-ph{display:flex;flex:1 1 auto;align-self:stretch;min-width:0;min-height:0;flex-direction:column;align-items:center;justify-content:center;gap:6px;}.tf-skel-ph svg{width:26px;height:26px;color:rgba(255,255,255,0.22);display:block;}.tf-skel .tf-skel-ph svg{color:rgba(255,255,255,0.32);}.tf-skel-loading{position:relative;display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;}.tf-skel-loading .tobyflow-media-loader{display:block;width:24px;height:24px;box-sizing:border-box;border:3px solid rgba(255,255,255,.2);border-top-color:#ccff00;border-radius:50%;animation:tfSkelSpin .9s linear infinite;flex:0 0 auto;}.tobyflow-ft-thumb .tf-skel-loading{width:18px;height:18px;}.tobyflow-ft-thumb .tf-skel-loading .tobyflow-media-loader{width:16px;height:16px;border-width:2px;}@media (prefers-reduced-motion:reduce){.tf-skel,.tf-skel--idle,.tobyflow-media-loader{animation:none}.tf-skel-dots i{animation:none}}";
    (document.head || document.documentElement).appendChild(st);
  };
  FloatingTracker._SKEL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
  FloatingTracker._SKEL_VIDEO_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"></rect><path d="m16 9 5-3v12l-5-3z"></path></svg>';
  FloatingTracker._bindGridVideoHover = function (thumb, results) {
    var self2 = this;
    var cells =
      results.length > 1 ? thumb.querySelectorAll("[data-view-idx]") : [thumb];
    Array.prototype.forEach.call(cells, function (cell, index) {
      var result = results[index];
      if (!result || !result.video) return;
      var pending = false;
      cell.onpointerenter = async function (event) {
        if (event.pointerType === "touch" || pending) return;
        if (self2._gridHoverPlayback) self2._gridHoverPlayback.close();
        self2._ensureSkeletonStyle();
        var layer = document.createElement("div");
        layer.className = "tobyflow-ft-grid-hover-video";
        layer.style.cssText =
          "position:absolute;inset:0;z-index:3;pointer-events:none;background:rgba(0,0,0,.18);";
        var loading = document.createElement("span");
        loading.className = "tf-skel-loading";
        loading.style.cssText =
          "position:absolute;left:50%;top:calc(50% + 31px);z-index:1;width:30px;height:30px;transform:translate(-50%,-50%);border-radius:50%;background:rgba(0,0,0,.6);";
        loading.innerHTML =
          '<i class="tobyflow-media-loader" aria-hidden="true"></i>';
        layer.setAttribute("aria-busy", "true");
        layer.appendChild(loading);
        cell.appendChild(layer);
        var video = null,
          playback = null,
          timer = null;
        var active = {
          thumb,
          close: function () {
            if (timer) clearTimeout(timer);
            if (video) {
              video.pause();
              video.removeAttribute("src");
              video.load();
            }
            layer.remove();
            if (playback && playback.revoke && playback.src)
              URL.revokeObjectURL(playback.src);
            playback = null;
            if (self2._gridHoverPlayback === active)
              self2._gridHoverPlayback = null;
          },
        };
        self2._gridHoverPlayback = active;
        function current() {
          return self2._gridHoverPlayback === active && cell.isConnected;
        }
        function busy(value) {
          if (!current()) return;
          loading.style.display = value ? "flex" : "none";
          layer.setAttribute("aria-busy", value ? "true" : "false");
          if (value && !timer)
            timer = setTimeout(function () {
              active.close();
            }, 3e4);
        }
        timer = setTimeout(function () {
          active.close();
        }, 3e4);
        pending = true;
        try {
          var resolved = await self2._resolveViewVideo(result, false, current);
          if (!current()) {
            if (resolved.revoke && resolved.src)
              URL.revokeObjectURL(resolved.src);
            return;
          }
          playback = resolved;
          if (!resolved.src) {
            active.close();
            return;
          }
          video = document.createElement("video");
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = "auto";
          video.style.cssText =
            "width:100%;height:100%;object-fit:contain;display:block;";
          video.addEventListener("playing", function () {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            busy(false);
          });
          video.addEventListener("waiting", function () {
            busy(true);
          });
          video.addEventListener("stalled", function () {
            busy(true);
          });
          video.addEventListener("error", function () {
            void fallback();
          });
          layer.insertBefore(video, loading);
          video.src = resolved.src;
          await video.play();
        } catch (_) {
          await fallback();
        } finally {
          pending = false;
        }
        async function fallback() {
          if (!current()) return;
          if (!playback?.direct || active._proxyTried) {
            if (!active._proxyPending) active.close();
            return;
          }
          active._proxyTried = true;
          active._proxyPending = true;
          busy(true);
          try {
            var replacement = await self2._resolveViewVideo(
              result,
              false,
              current,
              true,
            );
            if (!current()) {
              if (replacement.revoke && replacement.src)
                URL.revokeObjectURL(replacement.src);
              return;
            }
            playback = replacement;
            if (!replacement.src || !video) {
              active.close();
              return;
            }
            video.src = replacement.src;
            await video.play();
          } catch (_) {
            active.close();
          } finally {
            active._proxyPending = false;
          }
        }
      };
      cell.onpointerleave = function () {
        if (
          self2._gridHoverPlayback &&
          self2._gridHoverPlayback.thumb === thumb
        )
          self2._gridHoverPlayback.close();
      };
    });
  };
  FloatingTracker._renderGridThumb = function (thumb, item, job) {
    thumb._ftPosterToken = null;
    this._cancelGridPosterTask?.(thumb);
    Array.from(thumb.querySelectorAll("[data-view-idx]")).forEach((cell) => {
      cell._ftPosterToken = null;
      this._cancelGridPosterTask?.(cell);
    });
    if (this._gridHoverPlayback && this._gridHoverPlayback.thumb === thumb)
      this._gridHoverPlayback.close();
    thumb.onpointerenter = null;
    thumb.onpointerleave = null;
    thumb._ftVideoResolveItem = item.id;
    var results = this._itemResultsOf(item);
    var constrained = thumb._ftRatioConstrained === true;
    var mediaStyle = constrained
      ? "width:100%;height:100%;object-fit:contain;display:block;"
      : "width:100%;height:auto;object-fit:contain;display:block;";
    var clockNow = Date.now();
    var itemElapsed = this._elapsedLabel(item, clockNow, false) || "00:00";
    var elapsedClocksHtml =
      '<span class="tf-skel-elapsed" data-ft-grid-item-elapsed aria-hidden="true">' +
      this._escHtml(itemElapsed) +
      "</span>";
    if (results.length > 1) {
      var cols = results.length <= 4 ? 2 : 3;
      var rows = Math.ceil(results.length / cols);
      var html =
        '<div style="width:100%;display:grid;grid-template-columns:repeat(' +
        cols +
        ",minmax(0,1fr));gap:2px;" +
        (constrained
          ? "height:100%;grid-template-rows:repeat(" + rows + ",minmax(0,1fr));"
          : "") +
        '">';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var media = _ftGridMedia2(r, mediaStyle);
        html +=
          '<div data-view-idx="' +
          i +
          '" style="position:relative;overflow:hidden;cursor:pointer;min-width:0;min-height:0;">' +
          media +
          "</div>";
      }
      thumb.innerHTML = html + "</div>";
      thumb.style.cursor = "pointer";
      this._observePreviewMedia?.(thumb);
      this._bindGridVideoHover(thumb, results);
      this._hydrateGridVideoPreviews(thumb, item);
      return;
    }
    var first = results[0];
    if (first) {
      thumb.innerHTML = _ftGridMedia2(first, mediaStyle);
      thumb.style.cursor = "pointer";
      this._observePreviewMedia?.(thumb);
      this._bindGridVideoHover(thumb, results);
      this._hydrateGridVideoPreviews(thumb, item);
    } else if (item.state === "PENDING" || item.apiWaiting === true) {
      this._ensureSkeletonStyle();
      thumb.innerHTML =
        '<div class="tf-skel tf-skel--idle" style="height:100%;min-height:0;"><span class="tf-skel-ph">' +
        this._mediaPlaceholderIcon(item) +
        "</span></div>";
      thumb.style.cursor = "default";
    } else if (item.state === "WAITING_PROVIDER") {
      this._ensureSkeletonStyle();
      var pausedStyle = constrained
        ? "height:100%;min-height:0;"
        : "min-height:120px;";
      var pausedError = item.errorDisplay || item.retryErrorDisplay || "";
      var pausedErrorHtml = pausedError
        ? '<span class="tf-skel-retry-error" title="' +
          this._escHtml(pausedError) +
          '">' +
          this._escHtml(pausedError) +
          "</span>"
        : "";
      thumb.innerHTML =
        '<div class="tf-skel tf-skel--idle" style="' +
        pausedStyle +
        '"><span class="tf-skel-ph"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>' +
        elapsedClocksHtml +
        pausedErrorHtml +
        "</span></div>";
      thumb.style.cursor = "default";
    } else if (
      ["SUBMITTING", "SUBMITTED", "MONITORING", "RETRY_SUBMIT"].indexOf(
        item.state,
      ) >= 0
    ) {
      this._ensureSkeletonStyle();
      var loadingStyle = constrained
        ? "height:100%;min-height:0;"
        : "min-height:120px;";
      var loadingIcon = this._loadingThumbnailContent(item);
      var retryError =
        item.state === "RETRY_SUBMIT"
          ? item.retryErrorDisplay || item.errorDisplay || ""
          : "";
      var retryErrorHtml = retryError
        ? '<span class="tf-skel-retry-error" title="' +
          this._escHtml(retryError) +
          '">' +
          this._escHtml(retryError) +
          "</span>"
        : "";
      thumb.innerHTML =
        '<div class="tf-skel" style="' +
        loadingStyle +
        '"><span class="tf-skel-ph">' +
        loadingIcon +
        elapsedClocksHtml +
        retryErrorHtml +
        "</span></div>";
      thumb.style.cursor = "default";
    } else if (
      ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
        item.state,
      ) >= 0
    ) {
      this._ensureSkeletonStyle();
      var errorText =
        item.statusReason ||
        item.errorDisplay ||
        (item.errorType === "per_model_daily"
          ? _getTrackerT2("perModelDailyLimit")
          : item.errorType === "project_mismatch"
            ? _getTrackerT2("projectMismatch")
            : item.errorType === "server_unavailable"
              ? _getTrackerT2("serverUnavailable")
              : item.state === "RECOVERY_REQUIRED"
                ? _getTrackerT2("flowRecoveryRequired")
                : item.error || _getTrackerT2("generationFailed"));
      thumb.innerHTML =
        '<div class="tf-skel tf-skel--idle"' +
        (constrained
          ? ' style="height:100%;min-height:0;background:transparent;animation:none;"'
          : ' style="background:transparent;animation:none;"') +
        '><span class="tf-skel-ph" title="' +
        this._escHtml(this._providerFailureTooltip(item) || errorText) +
        '">' +
        this._mediaPlaceholderIcon(item) +
        '<span class="tf-skel-label" style="color:#fca5a5;max-width:90%;text-align:center;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow-wrap:anywhere;">' +
        this._escHtml(errorText) +
        "</span></span></div>";
      thumb.style.cursor = "default";
    } else {
      this._ensureSkeletonStyle();
      thumb.innerHTML =
        '<div class="tf-skel tf-skel--idle" style="height:100%;min-height:0;"><span class="tf-skel-ph">' +
        this._mediaPlaceholderIcon(item) +
        '<span class="tf-skel-label">' +
        this._escHtml(_getTrackerT2("gridNoResult")) +
        "</span></span></div>";
      thumb.style.cursor = "default";
    }
  };
  FloatingTracker._hasJobExecutionWork = function (job) {
    if (!job || ["running", "paused"].indexOf(job.status) < 0) return false;
    var items = job.items || [];
    if (job._ftCachedJob) {
      return items.some(function (item) {
        var acceptedOperation =
          item.genMode === "api" &&
          (item.flowApiAccepted === true ||
            !!item.operationId ||
            !!item.flowOperationId ||
            item.hasFlowOperationId === true);
        return (
          acceptedOperation &&
          item.recoveryExhausted !== true &&
          [
            "SUBMITTING",
            "SUBMITTED",
            "MONITORING",
            "WAITING_PROVIDER",
            "RECOVERY_REQUIRED",
          ].indexOf(item.state) >= 0
        );
      });
    }
    var pending = items.some(function (item) {
      return (
        [
          "PENDING",
          "SUBMITTING",
          "SUBMITTED",
          "MONITORING",
          "RETRY_SUBMIT",
          "WAITING_USER",
          "WAITING_PROVIDER",
        ].indexOf(item.state) >= 0
      );
    });
    var downloads =
      this._lastData?.isRunning === true &&
      items.some(function (item) {
        return ["queued", "downloading"].indexOf(item.dl?.state) >= 0;
      });
    if (!pending) return downloads;
    if (job.status === "paused" || this._lastData?.isRunning === true)
      return true;
    return items.some(function (item) {
      return (
        ["SUBMITTING", "SUBMITTED", "MONITORING", "RETRY_SUBMIT"].indexOf(
          item.state,
        ) >= 0
      );
    });
  };
  FloatingTracker._hasJobDownloadWork = function (job) {
    if (!job) return false;
    return (job.items || []).some(function (item) {
      if (["queued", "downloading", "retrying"].indexOf(item?.dl?.state) >= 0)
        return true;
      if (item?.autoDownload !== true) return false;
      return (item.outputs || []).some(function (output) {
        if (output?.status !== "completed") return false;
        return (
          [
            "not_requested",
            "queued",
            "downloading",
            "retrying",
            "partial",
            null,
            void 0,
          ].indexOf(output.downloadStatus) >= 0
        );
      });
    });
  };
  FloatingTracker._gridExecutionState = function () {
    var jobs = this._lastData?.jobs || [];
    var active = jobs.filter(function (job2) {
      return FloatingTracker._hasJobExecutionWork(job2);
    });
    var job = active.find(function (job2) {
      return (
        job2.owner === "prompts" &&
        (!job2.manualRegenBatchPending || job2.manualRegenActive)
      );
    });
    return { job, canStop: active.length > 0 };
  };
  FloatingTracker._syncGridExecutionControls = function () {
    var controls = this._gridEl?.querySelector(".tobyflow-ft-grid-execution");
    if (!controls) return;
    var state = this._gridExecutionState();
    controls.style.display = state.canStop ? "flex" : "none";
    ["resume", "pause", "stop"].forEach(function (action) {
      var button = controls.querySelector(
        '[data-execution-action="' + action + '"]',
      );
      if (!button) return;
      var controlStatus = state.job?.manualRegenActive
        ? state.job.manualRegenStatus
        : state.job?.status;
      button.disabled =
        action === "stop"
          ? !state.canStop
          : !state.job ||
            controlStatus !== (action === "resume" ? "paused" : "running");
      button.style.display = button.disabled ? "none" : "inline-flex";
      var label = _getTrackerT2(action);
      var text = button.querySelector("[data-ft-i18n]");
      if (text) text.textContent = label;
      button.title = label;
      button.setAttribute("aria-label", label);
    });
  };
  FloatingTracker._refreshGrid = function () {
    try {
      if (!this._hasLiveGrid()) return;
      this._syncGridExecutionControls();
      var self2 = this,
        keepExistingHistory = false;
      var incomingSession =
        (self2._lastData && self2._lastData.sessionId) || null;
      if (
        self2._gridSessionId &&
        incomingSession &&
        self2._gridSessionId !== incomingSession
      ) {
        var incomingApiPrompts = (self2._lastData.jobs || []).some(
          function (job) {
            return (
              ["prompts", "mcp"].indexOf(job.owner) >= 0 &&
              (job.modeType === "api" ||
                (job.items || []).some(function (item) {
                  return item.genMode === "api";
                }))
            );
          },
        );
        if (incomingApiPrompts) {
          keepExistingHistory = true;
          Array.prototype.forEach.call(
            self2._gridBody.querySelectorAll(".tobyflow-ft-batch"),
            function (section) {
              section.dataset.gridHistory = "1";
            },
          );
        } else {
          if (self2._gridAspectObserver) {
            self2._gridAspectObserver.disconnect();
            self2._gridAspectObserver = null;
          }
          if (self2._gridMasonryObserver) {
            self2._gridMasonryObserver.disconnect();
            self2._gridMasonryObserver = null;
          }
          self2._gridBody.innerHTML = "";
        }
        self2._gridSessionId = incomingSession;
      }
      var vm = self2._gridViewModel(self2._lastData);
      var jobs = vm.sessions.flatMap(function (session) {
        return session.jobs;
      });
      var liveSections = new Set(
        jobs.map(function (job) {
          return job.key;
        }),
      );
      var liveCardKeys = new Set(
        jobs.flatMap(function (job) {
          return (job.items || []).map(function (group) {
            return String(group.cardKey);
          });
        }),
      );
      Array.from(
        self2._gridBody.querySelectorAll(".tobyflow-ft-batch"),
      ).forEach(function (section) {
        if (liveSections.has(section.dataset.batchKey)) return;
        var staleItems = section._vm?.items || [];
        var projectedElsewhere =
          staleItems.length > 0 &&
          staleItems.every(function (group) {
            return liveCardKeys.has(String(group.cardKey));
          });
        if (
          projectedElsewhere ||
          (section.dataset.gridHistory !== "1" && !keepExistingHistory)
        )
          self2._releaseGridSection(section);
      });
      jobs.forEach(function (job) {
        var sel = window.CSS && CSS.escape ? CSS.escape(job.key) : job.key;
        var section = self2._gridBody.querySelector(
          '[data-batch-key="' + sel + '"]',
        );
        if (section) {
          if (
            !section._collapseUserTouched &&
            section._vm?.defaultCollapsed !== job.defaultCollapsed
          ) {
            section._vm = job;
            self2._setBatchCollapsed(section, !!job.defaultCollapsed, false);
          }
          self2._updateBatchSection(section, job);
        } else {
          section = self2._buildBatchSection(job);
          self2._gridBody.appendChild(section);
        }
      });
      Array.from(
        self2._gridBody.querySelectorAll(
          '.tobyflow-ft-grid-card[data-optimistic="1"]',
        ),
      ).forEach(function (placeholder) {
        var itemId = placeholder.dataset.itemId;
        if (!itemId) return;
        var escaped = window.CSS && CSS.escape ? CSS.escape(itemId) : itemId;
        var copies = self2._gridBody.querySelectorAll(
          '.tobyflow-ft-grid-card[data-item-id="' + escaped + '"]',
        );
        var hasLiveOwner = Array.from(copies).some(function (card) {
          return card !== placeholder && card.dataset.optimistic !== "1";
        });
        if (!hasLiveOwner) return;
        self2._releaseGridCard(placeholder);
      });
      if (self2._gridClearAllBtn) {
        self2._gridClearAllBtn.disabled = false;
        self2._gridClearAllBtn.setAttribute("aria-disabled", "false");
        self2._gridClearAllBtn.setAttribute(
          "aria-busy",
          self2._clearHistoryRunning === true ? "true" : "false",
        );
        self2._gridClearAllBtn.style.opacity = "";
        self2._gridClearAllBtn.style.cursor = "pointer";
      }
      self2._trimGridHistory();
      self2._applyGridFilters();
      self2._observePreviewMedia(self2._gridBody);
    } catch (e) {
      console.warn(
        "[FloatingTracker] Live grid refresh failed:",
        (e && e.message) || e,
      );
    }
  };
  FloatingTracker._thumbSigOf = function (item) {
    var results = this._itemResultsOf(item);
    var sig =
      item.state +
      "|" +
      results.length +
      "|" +
      (!results.length
        ? [
            item.errorDisplay || item.error,
            item.errorType,
            item.retryErrorDisplay,
            item.statusKind,
            item.statusLabel,
            item.statusReason,
            item.statusHint,
          ].join("|")
        : "") +
      "|";
    for (var i = 0; i < results.length; i++) {
      sig +=
        (results[i].url || "") +
        ">" +
        (results[i].playUrl || "") +
        ">" +
        (results[i].thumbnail || "") +
        ">" +
        (results[i].sourceThumbnail || results[i].source_thumbnail || "") +
        (results[i].video ? "v" : "i") +
        ">" +
        (results[i].poster || "") +
        ",";
    }
    return sig + (item.apiWaiting ? "|w" : "") + "|r:" + (item.ratio || "");
  };
  FloatingTracker._gridAspectOf = function (item) {
    var raw = String((item && item.ratio) || "").trim();
    var m = raw.match(/(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    var w = Number(m[1]),
      h = Number(m[2]);
    if (!(w > 0 && h > 0)) return null;
    var count = this._itemResultsOf(item).length;
    if (count > 1) {
      var cols = count <= 4 ? 2 : 3;
      var rows = Math.ceil(count / cols);
      w *= cols;
      h *= rows;
    }
    return { width: w, height: h, css: w + " / " + h };
  };
  FloatingTracker._gridColumnSpanOf = function (item) {
    var raw = String((item && item.ratio) || "").trim();
    var m = raw.match(/(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/);
    if (!m) return 1;
    var w = Number(m[1]),
      h = Number(m[2]);
    if (!(w > 0 && h > 0)) return 1;
    var value = w / h;
    var expanded = [16 / 9, 4 / 3].some(function (target) {
      return Math.abs(value - target) < 0.001;
    });
    return expanded ? 2 : 1;
  };
  FloatingTracker._applyGridCardWidth = function (card, item) {
    if (!card) return;
    var span = this._gridColumnSpanOf(item);
    card.dataset.columnSpan = String(span);
    card.style.gridColumnEnd = "span " + span;
    card.style.width = "";
  };
  FloatingTracker._ensureGridAspectObserver = function () {
    if (this._gridAspectObserver || typeof ResizeObserver === "undefined")
      return;
    this._gridAspectObserver = new ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target,
          aspect = el && el._ftAspect;
        if (!aspect || !entry.contentRect.width) return;
        var wanted = Math.round(
          (entry.contentRect.width * aspect.height) / aspect.width,
        );
        if (
          wanted > 0 &&
          Math.abs((parseFloat(el.style.height) || 0) - wanted) > 1
        ) {
          el.style.height = wanted + "px";
        }
      });
    });
  };
  FloatingTracker._ensureGridMasonryObserver = function () {
    if (this._gridMasonryObserver || typeof ResizeObserver === "undefined")
      return;
    this._gridMasonryObserver = new ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        FloatingTracker._layoutGridCard(entry.target);
      });
    });
  };
  FloatingTracker._layoutGridCard = function (card) {
    if (!card || !this._gridBody || card.style.display === "none") return;
    var grid = card.parentElement;
    if (!grid) return;
    var css = getComputedStyle(grid);
    var row = parseFloat(css.gridAutoRows) || 8;
    var gap = parseFloat(css.rowGap) || 0;
    if (card._ftShell && card._ftShellAspect) {
      var width = card.getBoundingClientRect().width;
      var aspect = card._ftShellAspect;
      var shellHeight =
        Math.round((Math.max(0, width - 2) * aspect.height) / aspect.width) + 2;
      if (width > 0 && card.style.height !== shellHeight + "px")
        card.style.height = shellHeight + "px";
    }
    var height = card.getBoundingClientRect().height;
    if (!(height > 0)) return;
    var span = Math.max(1, Math.ceil((height + gap) / (row + gap)));
    var wanted = "span " + span;
    if (card.style.gridRowEnd !== wanted) card.style.gridRowEnd = wanted;
  };
  FloatingTracker._observeGridCard = function (card) {
    this._observeGridCardVisibility?.(card);
    this._ensureGridMasonryObserver();
    if (this._gridMasonryObserver && card)
      this._gridMasonryObserver.observe(card);
    this._layoutGridCard(card);
  };
  FloatingTracker._scheduleGridMasonryLayout = function () {
    if (!this._gridBody || this._gridMasonryLayoutPending) return;
    this._gridMasonryLayoutPending = true;
    var self2 = this;
    requestAnimationFrame(function () {
      self2._gridMasonryLayoutPending = false;
      if (!self2._gridBody) return;
      Array.prototype.forEach.call(
        self2._gridBody.querySelectorAll(".tobyflow-ft-grid-card"),
        function (card) {
          self2._observeGridCard(card);
        },
      );
    });
  };
  FloatingTracker._applyGridAspect = function (card, item) {
    if (!card) return;
    this._applyGridCardWidth(card, item);
    if (!card._thumbWrap || !card._thumbEl) return;
    var aspect = this._gridAspectOf(item);
    this._ensureGridAspectObserver();
    card._thumbEl._ftRatioConstrained = !!aspect;
    if (aspect) {
      card._thumbWrap._ftAspect = aspect;
      card._thumbWrap.style.aspectRatio = aspect.css;
      card._thumbWrap.style.width = "100%";
      card._thumbWrap.style.flex = "0 0 auto";
      card._thumbWrap.style.minHeight = "0";
      var currentWidth = card._thumbWrap.getBoundingClientRect().width;
      if (currentWidth > 0)
        card._thumbWrap.style.height =
          Math.round((currentWidth * aspect.height) / aspect.width) + "px";
      if (this._gridAspectObserver)
        this._gridAspectObserver.observe(card._thumbWrap);
      card._thumbEl.style.cssText =
        "position:absolute;inset:0;display:block;overflow:hidden;";
    } else {
      if (this._gridAspectObserver)
        this._gridAspectObserver.unobserve(card._thumbWrap);
      card._thumbWrap._ftAspect = null;
      card._thumbWrap.style.aspectRatio = "";
      card._thumbWrap.style.height = "";
      card._thumbWrap.style.width = "";
      card._thumbWrap.style.flex = "";
      card._thumbWrap.style.minHeight = "120px";
      card._thumbEl.style.cssText =
        "display:block;height:100%;min-height:120px;";
    }
  };
  FloatingTracker._elapsedLabel = function (record, now, batch) {
    var start = Number(
      batch
        ? record.startedAt
        : record.genMode === "api"
          ? record.flowApiDispatchedAt || record.submittedAt
          : record.submittedAt,
    );
    if (!Number.isFinite(start) || start <= 0) return "";
    var end = Number(
      batch
        ? record.completedAt
        : record.providerCompletedAt ||
            record.providerPausedAt ||
            record.completedAt,
    );
    if (
      batch &&
      !(end > 0) &&
      ["completed", "stopped", "cancelled", "failed"].indexOf(record.status) >=
        0
    ) {
      end = Math.max.apply(
        Math,
        [0].concat(
          (record.items || []).map(function (item) {
            return Number(item.completedAt || item.providerCompletedAt) || 0;
          }),
        ),
      );
      if (!(end > 0)) return "";
    }
    if (!batch && !(end >= start) && Number(record.completedAt) >= start)
      end = Number(record.completedAt);
    if (!(end >= start)) end = now;
    return this._formatTime(Math.max(0, end - start));
  };
  FloatingTracker._formatBatchElapsed = function (record, now) {
    var compact = this._elapsedLabel(record, now, true);
    if (!compact) return "00:00:00";
    var parts = compact.split(":");
    var totalSeconds = Math.max(
      0,
      (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0),
    );
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
      .map(function (value) {
        return (value < 10 ? "0" : "") + value;
      })
      .join(":");
  };
  FloatingTracker._providerFailureTooltip = function (item) {
    var policy = item.errorPolicy || item.flowApiFailureDetail || {};
    var translatedError =
      typeof item.errorDisplay === "string" && item.errorDisplay;
    var displayError =
      translatedError || (typeof item.error === "string" ? item.error : "");
    if (translatedError) return displayError;
    var resourceDetails =
      Number.isInteger(policy.grpcCode) ||
      policy.grpcReason ||
      policy.providerErrorCodes?.length
        ? [
            displayError,
            Number.isInteger(policy.grpcCode) ? "gRPC " + policy.grpcCode : "",
            ...[
              ...(Array.isArray(policy.providerErrorCodes)
                ? policy.providerErrorCodes
                : []),
              policy.grpcReason,
            ].filter(function (value) {
              return (
                typeof value === "string" &&
                /^[A-Z][A-Z0-9_]{2,119}$/.test(value)
              );
            }),
          ]
        : [];
    return [
      ...new Set(
        [
          ...resourceDetails,
          ...(Array.isArray(policy.failureDetails) ? policy.failureDetails : [])
            .slice(0, 32)
            .map(function (value) {
              return [
                typeof value?.message === "string" ? value.message : "",
                Number.isInteger(value?.statusCode)
                  ? "Google status " + value.statusCode
                  : "",
              ]
                .filter(Boolean)
                .join(" \xB7 ");
            })
            .filter(Boolean),
        ].filter(Boolean),
      ),
    ].join("\n");
  };
  FloatingTracker._loadingThumbnailContent = function (item) {
    var delay = -(Date.now() % 900);
    return (
      '<span class="tf-skel-loading" aria-hidden="true"><span class="tobyflow-media-loader" style="animation-delay:' +
      delay +
      'ms"></span></span>'
    );
  };
  FloatingTracker._mediaPlaceholderIcon = function (item) {
    var video =
      String(item.genType || item.mediaType || "")
        .toLowerCase()
        .indexOf("video") >= 0 || item.thumbVideo === true;
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (video
        ? '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>'
        : '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>') +
      "</svg>"
    );
  };
  FloatingTracker._gridStatusBackground = function () {
    return "rgba(0,0,0,0.58)";
  };
  FloatingTracker._itemStatusBadgeHtml = function (it) {
    var self2 = this,
      html = "";
    var stateConfig = self2._getStateConfig();
    var sc = self2._isQuotaCancelledItem(it)
      ? {
          label: _getTrackerT2("regenQuotaCancelled"),
          bg: "rgba(245,158,11,.14)",
          color: "#fbbf24",
        }
      : stateConfig[it.providerGenerationState || it.state] ||
        stateConfig.PENDING;
    var attention =
      !!it.statusLabel ||
      (!!it.recoveryLabel &&
        ![
          "COMPLETED",
          "PARTIAL_FAIL",
          "FAILED",
          "BLOCKED",
          "CANCELLED",
        ].includes(it.providerGenerationState || it.state));
    if (attention)
      sc = Object.assign({}, sc, {
        label: it.statusLabel || it.recoveryLabel,
        color: it.statusKind === "blocked" ? "#f87171" : "#fbbf24",
        bg: "rgba(245,158,11,.14)",
      });
    var tileProgress =
      it.state === "MONITORING" && self2._tileProgressCache[it.id] != null
        ? self2._tileProgressCache[it.id]
        : null;
    var expected = Math.max(1, parseInt(it.quantity, 10) || 1);
    var completed = (it.outputs || []).filter(function (output) {
      return output.status === "completed";
    }).length;
    var outputProgress =
      expected > 1 && completed > 0 && completed < expected
        ? completed + "/" + expected
        : null;
    var dlBadge = null;
    var downloadFailed =
      it.dl &&
      (it.dl.state === "failed" || Number(it.dl.failed) > 0) &&
      ["downloading", "queued"].indexOf(it.dl.state) === -1;
    if (it.dl && (it.state === "COMPLETED" || it.state === "PARTIAL_FAIL")) {
      var dlRes = it.dl.res
        ? " " + self2._escHtml(String(it.dl.res).toUpperCase())
        : "";
      var genDone = "\u2713 " + self2._escHtml(sc.label) + " \xB7 ";
      if (downloadFailed) {
        var failedEntries = Object.values(
          self2._manualDlStates[it.id] || {},
        ).filter(function (entry) {
          return entry.state === "failed";
        });
        var downloadError = failedEntries.length
          ? self2._manualDownloadLabel({ entries: failedEntries })
          : it.dl.errorDisplay ||
            it.dl.error ||
            it.dl.lastError ||
            _getTrackerT2("stateFailed");
        var downloadTip = self2._escHtml(String(downloadError));
        dlBadge =
          '<span title="' +
          downloadTip +
          '" data-ft-tip="' +
          downloadTip +
          '" style="font-size:9px;color:#f87171;flex-shrink:0;white-space:nowrap;">' +
          genDone +
          "\u2715 " +
          self2._escHtml(_getTrackerT2("dlThumbTitle")) +
          " \xB7 " +
          self2._escHtml(_getTrackerT2("stateFailed")) +
          "</span>";
      } else if (it.dl.state === "downloading") {
        dlBadge =
          '<span class="tobyflow-ft-dot-pulse" style="font-size:9px;color:#fbbf24;flex-shrink:0;white-space:nowrap;">' +
          genDone +
          _getTrackerT2("dlActive") +
          dlRes +
          "</span>";
      } else if (it.dl.state === "queued") {
        dlBadge =
          '<span style="font-size:9px;color:rgba(255,255,255,0.65);flex-shrink:0;white-space:nowrap;">' +
          genDone +
          _getTrackerT2("dlPending") +
          dlRes +
          "</span>";
      } else if (it.dl.state === "done") {
        dlBadge =
          '<span style="font-size:9px;color:#4ade80;flex-shrink:0;white-space:nowrap;">' +
          genDone +
          _getTrackerT2("dlDone") +
          "</span>";
      } else if (it.dl.state === "partial") {
        dlBadge =
          '<span style="font-size:9px;color:#fbbf24;flex-shrink:0;white-space:nowrap;">' +
          (it.dl.completed || 0) +
          "/" +
          (it.dl.total || 0) +
          " " +
          _getTrackerT2("dlDone") +
          "</span>";
      } else if (it.dl.state === "failed") {
        dlBadge =
          '<span style="font-size:9px;color:#f87171;flex-shrink:0;white-space:nowrap;">' +
          genDone +
          self2._escHtml(_getTrackerT2("dlThumbTitle")) +
          " \xB7 \u2715 " +
          _getTrackerT2("stateFailed") +
          "</span>";
      }
    }
    if (downloadFailed && dlBadge) {
      html += dlBadge;
    } else if (tileProgress !== null && !attention) {
      html +=
        '<span style="font-size:9px;color:#c084fc;flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums;">' +
        tileProgress +
        "%</span>";
    } else if (outputProgress && !attention) {
      html +=
        '<span style="font-size:9px;color:#c084fc;flex-shrink:0;white-space:nowrap;font-variant-numeric:tabular-nums;">' +
        outputProgress +
        "</span>";
    } else if (dlBadge) {
      html += dlBadge;
    } else if (it.apiWaiting && it.state !== "WAITING_PROVIDER" && !attention) {
      html +=
        '<span style="font-size:9px;color:rgba(255,255,255,0.55);flex-shrink:0;white-space:nowrap;">' +
        _getTrackerT2("stateQueuedApi") +
        "</span>";
    } else {
      var stateName = it.providerGenerationState || it.state;
      var pauseIcon =
        stateName === "WAITING_PROVIDER"
          ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="width:9px;height:9px;flex:none;"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
          : "";
      html +=
        '<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:' +
        sc.color +
        ';flex-shrink:0;white-space:nowrap;">' +
        pauseIcon +
        self2._escHtml(sc.label) +
        "</span>";
    }
    if (
      it.statusKind ||
      [
        "FAILED",
        "PARTIAL_FAIL",
        "BLOCKED",
        "RECOVERY_REQUIRED",
        "RETRY_SUBMIT",
        "WAITING_PROVIDER",
      ].indexOf(it.providerGenerationState || it.state) >= 0
    ) {
      var reason =
        [it.statusReason, it.statusHint].filter(Boolean).join("\n") ||
        self2._providerFailureTooltip(it) ||
        it.retryErrorDisplay ||
        it.errorDisplay ||
        (typeof it.error === "string" ? it.error : it.error?.message || "");
      if (!reason)
        reason = [
          ...new Set(
            (it.outputs || [])
              .filter(function (output) {
                return output.status === "failed";
              })
              .map(function (output) {
                return output.error;
              })
              .filter(function (error) {
                return typeof error === "string" && error;
              }),
          ),
        ].join(" \xB7 ");
      if (!reason && typeof it.errorType === "string") reason = it.errorType;
      if (reason) {
        var tooltip = self2._escHtml(String(reason));
        html =
          '<span title="' +
          tooltip +
          '" data-ft-tip="' +
          tooltip +
          '" style="display:inline-flex;flex-shrink:0;">' +
          html +
          "</span>";
      }
    }
    return html;
  };
  FloatingTracker._updateGridStatusReason = function (card, item) {
    var target = card._statusReason;
    if (!target) return;
    var state = item.providerGenerationState || item.state;
    var downloadFailed =
      item.dl &&
      (item.dl.state === "failed" || Number(item.dl.failed) > 0) &&
      !["downloading", "queued"].includes(item.dl.state);
    var relevant =
      item.statusKind ||
      [
        "FAILED",
        "PARTIAL_FAIL",
        "BLOCKED",
        "RECOVERY_REQUIRED",
        "RETRY_SUBMIT",
        "WAITING_PROVIDER",
      ].includes(state) ||
      (item.apiWaiting && item.retryErrorDisplay);
    var terminalFailure = ["FAILED", "PARTIAL_FAIL", "BLOCKED"].includes(state);
    var reason = relevant
      ? item.statusReason ||
        (terminalFailure ? item.errorDisplay : item.retryErrorDisplay) ||
        this._providerFailureTooltip(item) ||
        item.errorDisplay ||
        item.error ||
        ""
      : "";
    if (downloadFailed)
      reason =
        item.dl.errorDisplay || item.dl.error || item.dl.lastError || reason;
    var text = [relevant ? item.statusLabel : "", reason]
      .filter(Boolean)
      .join(" \u2014 ");
    var tip = [text, item.statusHint].filter(Boolean).join("\n");
    if (target.textContent !== text) target.textContent = text;
    target.title = tip;
    target.setAttribute("data-ft-tip", tip);
    var centeredReason =
      !this._itemResultsOf(item).length &&
      item.state !== "PENDING" &&
      item.apiWaiting !== true &&
      (["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].includes(
        item.state,
      ) ||
        (["WAITING_PROVIDER", "RETRY_SUBMIT"].includes(item.state) &&
          !!(item.errorDisplay || item.retryErrorDisplay)));
    target.style.display =
      text && (!centeredReason || downloadFailed) ? "-webkit-box" : "none";
    target.style.color =
      (["FAILED", "BLOCKED"].includes(state) &&
        item.statusKind !== "unverified") ||
      downloadFailed
        ? "#fca5a5"
        : "#fbbf24";
  };
  FloatingTracker._updateGridSettings = function (card, item) {
    var self2 = this,
      thumb = card._thumbWrap;
    if (!thumb) return;
    var signature = [item.genType, item.model, item.ratio, item.quantity].join(
      "|",
    );
    if (card._settingsSignature === signature) return;
    card._settingsSignature = signature;
    if (card._settingsOverlay) card._settingsOverlay.remove();
    card._settingsOverlay = null;
    var tags = [];
    if (item.genType) {
      var isVideoMode =
        String(item.genType).toLowerCase().indexOf("video") >= 0;
      tags.push({
        value: item.genType,
        icon: isVideoMode
          ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
          : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
        iconOnly: true,
      });
    }
    if (item.model) tags.push({ value: item.model });
    if (item.ratio) tags.push({ value: item.ratio });
    if (item.quantity && Number(item.quantity) > 1)
      tags.push({ value: "x" + item.quantity });
    if (tags.length) {
      var _tagStyle =
        "height:18px;font-size:8.5px;font-weight:600;padding:0 5px;background:rgba(0,0,0,0.58);color:#e5e7eb;border-radius:4px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;";
      var settingsOverlay = document.createElement("div");
      settingsOverlay.style.cssText =
        "position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:3px;padding:11px 6px 5px;background:linear-gradient(transparent, rgba(0,0,0,0.74));pointer-events:none;overflow:hidden;";
      settingsOverlay.innerHTML = tags
        .map(function (tag) {
          return (
            '<span title="' +
            self2._escHtml(String(tag.value)) +
            '" style="' +
            _tagStyle +
            (tag.iconOnly
              ? "width:18px;padding:0;"
              : "max-width:72px;overflow:hidden;text-overflow:ellipsis;") +
            '">' +
            (tag.icon || self2._escHtml(String(tag.value))) +
            "</span>"
          );
        })
        .join("");
      thumb.appendChild(settingsOverlay);
      card._settingsOverlay = settingsOverlay;
    }
  };
  FloatingTracker._updateGridCard = function (card, item, jobId, job) {
    card._displayItem = item;
    card._jobId = jobId;
    card._displayJob = job || card._displayJob || null;
    if (card._ftShell) {
      card.dataset.hasResult = this._itemResultsOf(item).length ? "1" : "0";
      card.dataset.failed =
        ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].includes(
          item.state,
        ) || this._isRegenRetryCandidate(item)
          ? "1"
          : "0";
      delete card.dataset.optimistic;
      delete card.dataset.optimisticAt;
      card.dataset.regen = item.isRegen || item.regenOf ? "1" : "0";
      card.dataset.prompt = String(
        item.prompt || item.promptText || "",
      ).toLowerCase();
      card.dataset.createdAt = String(item.createdAt || 0);
      var aspect = this._gridAspectOf(item);
      card._ftShellAspect = aspect;
      card.style.minHeight = aspect ? "0" : "120px";
      if (!aspect)
        card.style.height = card._ftReservedHeight
          ? card._ftReservedHeight + "px"
          : "";
      this._applyGridCardWidth(card, item);
      return;
    }
    this._updateGridSettings(card, item);
    if (card._promptEl) {
      var prompt = item.prompt || item.promptText || "";
      var cleanDraft = card._promptEl.value === card._promptEl._originalValue;
      card._promptEl._originalValue = prompt;
      if (cleanDraft) card._promptEl.value = prompt;
      card._syncDraft?.();
    }
    if (card._statusBadge) {
      card._statusBadge.innerHTML = this._itemStatusBadgeHtml(item);
      card._statusBadge.style.background = this._gridStatusBackground(item);
    }
    this._updateGridStatusReason?.(card, item);
    delete card.dataset.optimistic;
    delete card.dataset.optimisticAt;
    card.dataset.hasResult = this._itemResultsOf(item).length ? "1" : "0";
    card.dataset.failed =
      ["FAILED", "PARTIAL_FAIL", "BLOCKED", "RECOVERY_REQUIRED"].indexOf(
        item.state,
      ) >= 0 || this._isRegenRetryCandidate(item)
        ? "1"
        : "0";
    card.dataset.regen = item.isRegen || item.regenOf ? "1" : "0";
    card.dataset.prompt = String(
      item.prompt || item.promptText || "",
    ).toLowerCase();
    card.dataset.createdAt = String(item.createdAt || 0);
    var sig = this._thumbSigOf(item);
    if (card._thumbEl && card._thumbSig !== sig) {
      this._applyGridAspect(card, item);
      this._renderGridThumb(card._thumbEl, item, card._displayJob);
      card._thumbSig = sig;
    }
    var results = this._itemResultsOf(item);
    var idle = this._canRegenPromptItem(item, job);
    var itemBusy =
      [
        "PENDING",
        "SUBMITTING",
        "SUBMITTED",
        "MONITORING",
        "RETRY_SUBMIT",
        "WAITING_USER",
        "WAITING_PROVIDER",
        "RECOVERY_REQUIRED",
      ].indexOf(item.state) >= 0;
    if (
      item.state === "PENDING" &&
      job?.status === "paused" &&
      item.trackerRemovable === true
    )
      itemBusy = false;
    if (card._vBtn) card._vBtn.disabled = !results.length;
    if (card._dBtn) card._dBtn.disabled = !results.length;
    if (card._removeBtn)
      card._removeBtn.disabled = !this._canRemovePromptItem(
        item,
        card._displayJob,
      );
    if (card._rBtn) {
      card._rBtn.disabled = !idle || itemBusy;
      card._rBtn.setAttribute(
        "data-ft-tip",
        _getTrackerT2(
          this._isQueuedRegenItem(item, job)
            ? "regenQueued"
            : idle && !itemBusy
              ? "regenTitle"
              : "regenBusyTitle",
        ),
      );
      if (card._draftGenBtn) {
        card._draftGenBtn.disabled = card._rBtn.disabled;
        card._draftGenBtn.setAttribute(
          "data-ft-tip",
          card._rBtn.getAttribute("data-ft-tip") || _getTrackerT2("regenTitle"),
        );
      }
    }
    if (card._resumeBtn) {
      var heldResume = !!this._resumeJobIdForItem(item, card._displayJob);
      card.dataset.resumeHeld = heldResume ? "1" : "0";
      card._resumeBtn.style.display = heldResume ? "inline-flex" : "none";
      card._resumeBtn.disabled =
        card._resumeBtn.getAttribute("aria-busy") === "true";
    }
  };
  FloatingTracker._ensureGridResponsiveStyle = function () {
    if (document.getElementById("tobyflow-ft-grid-responsive-style")) return;
    var style = document.createElement("style");
    style.id = "tobyflow-ft-grid-responsive-style";
    style.textContent =
      '@keyframes tfApiStatusSpin{to{transform:rotate(360deg);}}@keyframes tfGridShimmer{0%{transform:translate3d(-46%,0,0)}100%{transform:translate3d(46%,0,0)}}.tobyflow-ft-grid-api-status [data-api-spinner]{display:inline-block;flex:0 0 auto;box-sizing:border-box;transform-origin:50% 50%;margin-right:8px;vertical-align:middle;}.tobyflow-ft-grid-api-status[aria-busy="true"] [data-api-spinner]{animation:tfApiStatusSpin .8s linear infinite!important;will-change:transform;}@media(prefers-reduced-motion:reduce){.tobyflow-ft-grid-api-status[aria-busy="true"] [data-api-spinner]{animation:none!important;}}.tobyflow-ft-grid-overlay,.tobyflow-ft-grid-overlay *{box-sizing:border-box;}.tobyflow-ft-grid-overlay button,.tobyflow-ft-grid-overlay input,.tobyflow-ft-grid-overlay select,.tobyflow-ft-grid-overlay textarea{font-family:inherit;}.tobyflow-ft-grid-body{min-width:0;overflow:auto!important;padding:10px 5px 10px 10px!important;display:block!important;}.tobyflow-ft-batch-actions button{transition:background .14s ease,border-color .14s ease,color .14s ease,transform .1s ease,box-shadow .14s ease;}.tobyflow-ft-grid-overlay{container-type:inline-size;}.tobyflow-ft-grid-header,.tobyflow-ft-batch-header{flex-wrap:nowrap;min-width:0;overflow-x:auto;}.tobyflow-ft-grid-header-info,.tobyflow-ft-batch-info{display:flex;align-items:center;gap:8px;flex:1 1 0;min-width:0;overflow:hidden;}.tobyflow-ft-grid-header-info>span,.tobyflow-ft-batch-info>*{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 auto;}.tobyflow-ft-grid-header-info>.tobyflow-ft-grid-api-status,.tobyflow-ft-batch-info>.tobyflow-ft-batch-status{display:block!important;}.tobyflow-ft-grid-header button{width:auto!important;min-width:34px;height:34px!important;padding:0 10px!important;flex:0 0 auto!important;justify-content:center;white-space:nowrap;}.tobyflow-ft-grid-header button{cursor:pointer;transition:filter .15s ease,box-shadow .15s ease,opacity .15s ease;}.tobyflow-ft-grid-header button:not(:disabled):hover{filter:brightness(1.2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),inset 0 0 0 40px rgba(255,255,255,.06);}.tobyflow-ft-grid-header button:not(:disabled):active{filter:brightness(.95);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25);}.tobyflow-ft-grid-header button:focus-visible{outline:2px solid #ccff00;outline-offset:-2px;}.tobyflow-ft-grid-header button:disabled{cursor:not-allowed!important;opacity:.45;filter:none;box-shadow:none;}.tobyflow-ft-grid-header button>span,.tobyflow-ft-batch-selected-actions>button>span{display:inline-block;max-width:clamp(30px,8cqw,110px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.tobyflow-ft-grid-execution,.tobyflow-ft-batch-actions,.tobyflow-ft-batch-selected-actions,.tobyflow-ft-batch-icon-actions{flex-wrap:nowrap!important;flex-shrink:0;}.tobyflow-ft-batch-actions button{box-sizing:border-box!important;flex:0 0 27px;width:27px!important;min-width:27px;max-width:27px;height:27px!important;min-height:27px;max-height:27px;padding:0!important;justify-content:center;}.tobyflow-ft-batch-selected-actions>button{width:auto!important;max-width:none;flex:0 0 auto;gap:5px;padding:0 8px!important;}@container(max-width:520px){.tobyflow-ft-grid-header{padding:8px 10px!important;gap:4px!important;}.tobyflow-ft-grid-header button{width:27px!important;min-width:27px;height:27px!important;padding:0!important;flex-basis:27px!important;}.tobyflow-ft-grid-header-info{gap:4px;}.tobyflow-ft-grid-header button>span,.tobyflow-ft-batch-selected-actions>button>span{display:none;}.tobyflow-ft-batch-selected-actions>button{width:27px!important;max-width:27px;flex-basis:27px;padding:0!important;}}.tobyflow-ft-batch-selected-actions>button>svg{flex:none;}.tobyflow-ft-batch-selected-actions>button>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.tobyflow-ft-batch-actions button:not(:disabled):hover{background:rgba(255,255,255,.15)!important;border-color:rgba(255,255,255,.28)!important;color:#fff!important;box-shadow:0 3px 10px rgba(0,0,0,.22);transform:translateY(-1px);}.tobyflow-ft-batch-actions button:not(:disabled):active{background:rgba(255,255,255,.2)!important;transform:translateY(0) scale(.95);box-shadow:inset 0 1px 3px rgba(0,0,0,.28);}.tobyflow-ft-batch-actions button:focus-visible{outline:2px solid #ccff00;outline-offset:2px;}.tobyflow-ft-batch-actions button:disabled{cursor:not-allowed!important;opacity:.35!important;transform:none!important;box-shadow:none!important;}.tobyflow-ft-batch-select-all{transition:background .14s ease,border-color .14s ease,color .14s ease,transform .1s ease,box-shadow .14s ease;}.tobyflow-ft-batch-select-all:not(:disabled):hover{background:rgba(255,255,255,.15)!important;border-color:rgba(255,255,255,.28)!important;color:#fff!important;box-shadow:0 3px 10px rgba(0,0,0,.22);transform:translateY(-1px);}.tobyflow-ft-batch-select-all[data-all-selected="1"]{background:rgba(204,255,0,.16)!important;border-color:rgba(204,255,0,.5)!important;color:#ccff00!important;}.tobyflow-ft-batch-select-all:focus-visible{outline:2px solid #ccff00;outline-offset:2px;}.tobyflow-ft-batch-select-all:disabled{cursor:not-allowed!important;opacity:.35!important;}.tobyflow-ft-remove-selected:not(:disabled):hover,.tobyflow-ft-remove-history:not(:disabled):hover{background:rgba(239,68,68,.18)!important;border-color:rgba(248,113,113,.42)!important;color:#fecaca!important;}.tobyflow-ft-batch-actions button.tobyflow-ft-add-batch-ref{transition:filter .14s ease,transform .1s ease,box-shadow .14s ease;}.tobyflow-ft-batch-actions button.tobyflow-ft-add-batch-ref:not(:disabled):hover{background:linear-gradient(90deg,#ccff00,#eaff98)!important;color:#000!important;filter:brightness(1.08);box-shadow:0 3px 10px rgba(204,255,0,.25);transform:translateY(-1px);}.tobyflow-ft-batch-resume:not(:disabled):hover{filter:brightness(1.2);box-shadow:0 0 0 2px rgba(74,222,128,.18);}.tobyflow-ft-batch-resume:focus-visible{outline:2px solid #4ade80;outline-offset:2px;}.tobyflow-ft-batch-resume:disabled{opacity:.5;cursor:default;}.tobyflow-ft-batch-actions button.tobyflow-ft-add-batch-ref:not(:disabled):active{background:linear-gradient(90deg,#ccff00,#eaff98)!important;color:#000!important;filter:brightness(.95);transform:translateY(0) scale(.95);box-shadow:none;}.tobyflow-ft-batch-actions button.tobyflow-ft-add-batch-ref:focus-visible{outline:2px solid #ccff00;outline-offset:2px;}.tobyflow-ft-batch-actions button.tobyflow-ft-add-batch-ref:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none;}.tobyflow-ft-batch-cards{grid-template-columns:repeat(auto-fill,minmax(min(154px,100%),1fr))!important;grid-auto-rows:8px!important;align-items:start!important;}.tobyflow-ft-grid-card{min-width:0;height:auto;align-self:start;}.tobyflow-ft-grid-card[data-selected="1"]{border-color:rgba(204,255,0,.62)!important;box-shadow:0 0 0 1px rgba(204,255,0,.3),0 8px 24px rgba(0,0,0,.2);}.tobyflow-ft-grid-corner-meta{position:absolute;top:6px;left:6px;z-index:7;display:flex;align-items:center;gap:6px;max-width:calc(100% - 54px);}.tobyflow-ft-grid-select{position:relative;flex:none;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(8,12,18,.28);border:1px solid rgba(255,255,255,.22);cursor:pointer;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);transition:background .14s ease,border-color .14s ease,box-shadow .14s ease;}.tobyflow-ft-grid-select:hover,.tobyflow-ft-grid-select:focus-within{background:rgba(8,12,18,.58);border-color:rgba(255,255,255,.42);}.tobyflow-ft-grid-select:has(input:checked){background:rgba(204,255,0,.2);border-color:rgba(204,255,0,.72);box-shadow:0 0 0 1px rgba(204,255,0,.14);}.tobyflow-ft-grid-select input{width:13px;height:13px;margin:0;accent-color:#ccff00;cursor:pointer;}.tobyflow-ft-grid-ordinal{flex:none;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:16px;}.tobyflow-ft-grid-prompt-editor{min-width:0;}.tobyflow-ft-grid-media{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;}.tobyflow-ft-grid-media>.tf-skel{height:100%!important;min-height:0!important;}.tobyflow-ft-grid-media>.tf-skel:not(.tf-skel--idle){isolation:isolate;contain:paint;animation:none!important;background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url("' +
      chrome.runtime.getURL("icons/loading-bg.png") +
      '") center/cover no-repeat #080b10!important;}.tobyflow-ft-grid-media>.tf-skel:not(.tf-skel--idle)::before{content:"";position:absolute;z-index:0;inset:-8% -45%;background:linear-gradient(112deg,transparent 34%,rgba(96,165,250,.07) 43%,rgba(204,255,0,.13) 50%,rgba(255,255,255,.18) 55%,rgba(96,165,250,.07) 63%,transparent 72%);animation:tfGridShimmer 2.2s linear infinite;will-change:transform;pointer-events:none;}.tobyflow-ft-grid-media>.tf-skel>.tf-skel-ph{position:absolute;z-index:1;inset:0;width:100%;height:100%;}.tobyflow-ft-batch[data-has-selection="1"] .tobyflow-ft-grid-card[data-selected="0"] .tobyflow-ft-grid-media::after{content:"";position:absolute;z-index:3;inset:0;background:rgba(2,6,12,.48);pointer-events:none;}.tobyflow-ft-grid-card textarea{min-width:0;max-width:100%;resize:none!important;scrollbar-width:thin;}.tobyflow-ft-grid-item-remove{opacity:0;pointer-events:none;transform:scale(.88);transition:opacity .14s ease,transform .14s ease,background .14s ease;}.tobyflow-ft-grid-card:hover .tobyflow-ft-grid-item-remove,.tobyflow-ft-grid-card:focus-within .tobyflow-ft-grid-item-remove{opacity:1;pointer-events:auto;transform:scale(1);}.tobyflow-ft-grid-item-remove:focus-visible{opacity:1;pointer-events:auto;transform:scale(1);outline:2px solid rgba(248,113,113,.8);outline-offset:2px;}.tobyflow-ft-grid-item-remove:disabled{opacity:0!important;pointer-events:none;}.tobyflow-ft-grid-thumb-actions{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;gap:7px;background:rgba(2,6,12,.48);opacity:0;pointer-events:none;transition:opacity .16s ease;}.tobyflow-ft-grid-card:hover .tobyflow-ft-grid-thumb-actions,.tobyflow-ft-grid-card:focus-within .tobyflow-ft-grid-thumb-actions{opacity:1;}.tobyflow-ft-grid-card[data-resume-held="1"] .tobyflow-ft-grid-thumb-actions{opacity:1;pointer-events:auto;}.tobyflow-ft-grid-card[data-resume-held="1"] .tobyflow-ft-grid-thumb-actions>button:not(.tobyflow-ft-grid-item-resume){display:none!important;}.tobyflow-ft-grid-card:has(.tobyflow-ft-grid-hover-video) .tobyflow-ft-grid-thumb-actions{background:transparent;}.tobyflow-ft-grid-thumb-actions>button{pointer-events:auto;}.tobyflow-ft-grid-thumb-action{width:30px!important;height:30px!important;flex:none!important;border-radius:8px!important;background:rgba(17,24,39,.82)!important;backdrop-filter:blur(5px);}.tobyflow-ft-grid-edit-prompt{opacity:0;pointer-events:none;transform:translateY(3px) scale(.92);transition:opacity .14s ease,transform .14s ease,background .14s ease;}.tobyflow-ft-grid-card:hover .tobyflow-ft-grid-edit-prompt,.tobyflow-ft-grid-card:focus-within .tobyflow-ft-grid-edit-prompt,.tobyflow-ft-grid-edit-prompt:focus-visible{opacity:1;pointer-events:auto;transform:translateY(0) scale(1);}.tobyflow-ft-grid-prompt-editor[hidden]{display:none!important;}.tobyflow-ft-grid-prompt-editor{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;box-sizing:border-box!important;z-index:9!important;display:flex!important;flex-direction:column!important;margin:0!important;padding:9px!important;gap:6px!important;border:0!important;border-radius:0!important;background-color:#080c12!important;background-image:linear-gradient(180deg,#080c12,#0c121c)!important;color:#f3f4f6!important;color-scheme:dark;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}.tobyflow-ft-grid-card[data-editor-open="1"] .tobyflow-ft-grid-media{visibility:hidden!important;}.tobyflow-ft-grid-prompt-editor textarea{flex:1 1 auto!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:7px 8px 42px!important;border:1px solid rgba(255,255,255,.16)!important;background:#111720!important;color:#f3f4f6!important;-webkit-text-fill-color:#f3f4f6!important;color-scheme:dark!important;}@media(prefers-reduced-motion:reduce){.tobyflow-ft-grid-media>.tf-skel:not(.tf-skel--idle)::before{animation:none!important;display:none;}}@media(max-width:520px){.tobyflow-ft-grid-header{padding:8px 10px!important;gap:7px!important;}.tobyflow-ft-grid-header [data-ft-i18n="gridTitle"]{display:none;}.tobyflow-ft-grid-header .tobyflow-ft-grid-brand{font-size:13px!important;}.tobyflow-ft-grid-tools{padding:8px 10px!important;gap:6px!important;}.tobyflow-ft-grid-tools input{min-width:0!important;flex-basis:100%;order:20;}.tobyflow-ft-batch-cards{padding:8px!important;gap:10px!important;grid-template-columns:minmax(0,1fr)!important;}.tobyflow-ft-grid-card{grid-column:1/-1!important;width:auto!important;display:grid!important;grid-template-columns:minmax(96px,40%) minmax(0,1fr);align-items:start;}.tobyflow-ft-grid-prompt-editor{padding:8px!important;gap:6px!important;}}@media(max-width:330px){.tobyflow-ft-grid-card{grid-template-columns:minmax(82px,36%) minmax(0,1fr);}.tobyflow-ft-grid-header .tobyflow-ft-grid-count{display:none;}}';
    (document.head || document.documentElement).appendChild(style);
  };
  FloatingTracker._mergeGridHistory = function (history, live) {
    if (!history?.jobs?.length) return live;
    if (!live) return history;
    if (
      history.projectId &&
      live.projectId &&
      history.projectId !== live.projectId
    )
      return live;
    if (!live.jobs?.length)
      return Object.assign({}, live, { jobs: history.jobs });
    var liveJobIds = new Set(
      live.jobs
        .map(function (job) {
          return job.id;
        })
        .filter(Boolean),
    );
    var older = history.jobs.filter(function (job) {
      return !job.id || !liveJobIds.has(job.id);
    });
    var mergedLive = live.jobs.map(function (job) {
      job = Object.assign({}, job);
      delete job._ftCachedJob;
      var previous = history.jobs.find(function (old) {
        return old.id === job.id;
      });
      if (!previous) return job;
      if (
        (job.items || []).some(function (item) {
          return item.isRegen || item.regenOf || item._regenSlotRoot;
        })
      ) {
        var slotKey = function (item) {
          return item._regenSlotRoot || item.regenOf || item.id;
        };
        var changed = new Map(
          (job.items || []).map(function (item) {
            return [slotKey(item), item];
          }),
        );
        var seen = new Set();
        var slots = (previous.items || []).map(function (item) {
          var key = slotKey(item);
          seen.add(key);
          var replacement = changed.get(key);
          return replacement
            ? Object.assign({}, replacement, {
                promptIndex: item.promptIndex ?? replacement.promptIndex,
              })
            : item;
        });
        slots.push.apply(
          slots,
          (job.items || []).filter(function (item) {
            return !seen.has(slotKey(item));
          }),
        );
        return Object.assign({}, job, { items: slots });
      }
      var liveItemIds = new Set(
        (job.items || []).map(function (item) {
          return item.id;
        }),
      );
      var replacements = (previous.items || []).filter(function (item) {
        return item._regenSlotRoot && !liveItemIds.has(item.id);
      });
      return Object.assign({}, job, {
        items: (job.items || []).concat(replacements),
      });
    });
    return Object.assign({}, live, {
      jobs: window.TrackerRegenProjection.jobs(older.concat(mergedLive)),
    });
  };
  FloatingTracker._refreshGridApiStatus = function (force) {
    var badge = this._gridEl?.querySelector?.(".tobyflow-ft-grid-api-status");
    if (!badge || badge.dataset.loading === "1") return;
    badge.dataset.loading = "1";
    var live = this._gridApiLiveData;
    var active =
      live?._ftRestoredCache !== true &&
      (live?.jobs || [])
        .flatMap(function (job) {
          return ["running", "paused"].includes(job.status) &&
            job._ftCachedJob !== true
            ? job.items || []
            : [];
        })
        .find(function (item) {
          return (
            item.genMode === "api" &&
            item.apiWaiting !== true &&
            ["SUBMITTING", "SUBMITTED", "MONITORING"].includes(item.state)
          );
        });
    var finish = function (state, driver, fallbackFrom) {
      if (!badge.isConnected) return;
      badge.dataset.loading = "0";
      badge.dataset.state = state;
      badge.dataset.ready =
        state === "ready" || state === "generating" ? "1" : "0";
      badge.dataset.apiVersion = driver || "unknown";
      var name =
        "Flow API" +
        (driver === "v2" ? " V2" : driver === "v1" ? " V1" : "") +
        (fallbackFrom === "v2" && driver === "v1" ? " \u21A9" : "");
      var labels = {
        ready: ["flowApiActive", "flowApiReadyShort"],
        generating: ["flowApiGenerating", "flowApiGeneratingShort"],
        checking: ["flowApiChecking", "flowApiCheckingShort"],
        syncing: ["flowApiSyncing", "flowApiSyncingShort"],
        disabled: ["flowApiDisabled", "flowApiDisabledShort"],
        disconnected: ["flowApiInactive", "flowApiDisconnectedShort"],
      };
      var pair = labels[state] || labels.checking;
      var label = name + " \xB7 " + _getTrackerT2(pair[1]);
      var text = badge.lastChild;
      if (text?.nodeType === 3) text.textContent = label;
      badge.title = name + " \u2014 " + _getTrackerT2(pair[0]);
      badge.setAttribute("data-ft-tip", badge.title);
      badge.setAttribute("aria-label", badge.title);
      var busy =
        state === "generating" || state === "checking" || state === "syncing";
      var color =
        state === "ready" || state === "generating"
          ? "#4ade80"
          : busy
            ? "#fbbf24"
            : state === "disconnected"
              ? "#f87171"
              : "rgba(255,255,255,.48)";
      badge.style.color = color;
      badge.style.background =
        state === "ready" || state === "generating"
          ? "rgba(34,197,94,.12)"
          : busy
            ? "rgba(245,158,11,.12)"
            : state === "disconnected"
              ? "rgba(239,68,68,.12)"
              : "rgba(255,255,255,.06)";
      badge.setAttribute("aria-busy", busy ? "true" : "false");
      var dot = badge.querySelector("[data-api-spinner]");
      if (dot) {
        dot.style.background = busy ? "transparent" : color;
        dot.style.width = dot.style.height = busy ? "10px" : "6px";
        dot.style.border = busy ? "2px solid currentColor" : "none";
        dot.style.borderRightColor = busy ? "transparent" : "";
        dot.style.animation = busy ? "" : "none";
      }
    };
    try {
      chrome.storage.local.get(
        [
          "af_settings",
          "toby_flow_api_health_gen_image",
          "toby_flow_api_health_gen_video",
        ],
        function (stored) {
          if (active) {
            var attempted = active.flowApiAttemptedDrivers || [];
            var driver =
              active.flowApiDriver ||
              attempted[attempted.length - 1] ||
              stored?.[
                "toby_flow_api_health_gen_" +
                  (/video/i.test(active.genType || "") ? "video" : "image")
              ]?.driver;
            finish("generating", driver);
            return;
          }
          var settings = stored?.af_settings || {};
          var enabled =
            settings.apiModeEnabled === true ||
            settings.apiModeEnabled === "true" ||
            settings.apiModeEnabled === 1;
          var mode = settings.defaultGenMode || settings.gen_mode;
          if (!enabled || (mode !== "api" && mode !== "auto")) {
            finish("disabled");
            return;
          }
          var candidates = [
            "toby_flow_api_health_gen_image",
            "toby_flow_api_health_gen_video",
          ]
            .map(function (key) {
              return stored?.[key];
            })
            .filter(function (value) {
              return (
                value && Date.now() >= value.at && Date.now() - value.at < 2e4
              );
            })
            .sort(function (a, b) {
              return b.at - a.at;
            });
          var health = candidates[0];
          var state =
            FloatingTracker._ftApiReloading === true
              ? "syncing"
              : !health || health.connecting === true
                ? "checking"
                : health.ready === true
                  ? "ready"
                  : "disconnected";
          finish(state, health?.driver, health?.fallbackFrom);
        },
      );
    } catch (_) {
      finish("checking");
    }
  };
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "session" && changes.flowReloadUiState) {
        FloatingTracker._ftApiReloading =
          changes.flowReloadUiState.newValue?.active === true;
        FloatingTracker._refreshGridApiStatus(false);
      }
      if (
        area === "local" &&
        (changes.af_settings ||
          changes.af_system_settings ||
          Object.keys(changes).some(function (key) {
            return key.indexOf("toby_flow_api_health_") === 0;
          }))
      ) {
        FloatingTracker._refreshGridApiStatus(false);
      }
    });
  } catch (_) {}
  FloatingTracker._setGridExpandBusy = function (busy) {
    try {
      var button = this._el?.querySelector?.(".tobyflow-ft-expand");
      if (!button) return;
      button.setAttribute("aria-busy", busy ? "true" : "false");
      button.style.opacity = busy ? "0.55" : "";
      button.style.cursor = busy ? "progress" : "pointer";
    } catch (_) {}
  };
  FloatingTracker._openGrid = function (options) {
    try {
      let onKey2 = function (e) {
        if (e.key === "Escape") self2._closeGrid();
      };
      var onKey = onKey2;
      options = options || {};
      if (this._hasLiveGrid()) {
        if (options.resumePending === true) return true;
        this._closeGrid();
        return false;
      }
      this._gridOpenRequested = true;
      if (options.userInitiated === true) this._gridOpenWasUserInitiated = true;
      this._cleanupOrphanGridDom();
      var self2 = this;
      if (!this._gridHistoryReady) {
        if (this._gridHistoryLoading) {
          this._setGridExpandBusy(true);
          return false;
        }
        this._gridHistoryLoading = true;
        this._setGridExpandBusy(true);
        var loadId = ++this._gridHistoryLoadId;
        var settled = false;
        var finishHistoryLoad = function (history) {
          if (settled || loadId !== self2._gridHistoryLoadId) return;
          settled = true;
          if (self2._gridHistoryLoadTimer) {
            clearTimeout(self2._gridHistoryLoadTimer);
            self2._gridHistoryLoadTimer = null;
          }
          self2._gridHistoryLoading = false;
          self2._gridHistoryReady = true;
          self2._gridOpenData = self2._retainTrackerHistory(
            self2._mergeGridHistory(history, self2._lastData),
          );
          if (self2._gridOpenData && history?.jobs?.length) {
            if (self2._gridOpenData._ftHistoryMerged !== true)
              Object.defineProperty(self2._gridOpenData, "_ftHistoryMerged", {
                value: true,
                enumerable: false,
                configurable: true,
              });
            self2._lastData = self2._gridOpenData;
          }
          if (self2._gridOpenRequested)
            self2._openGrid({ resumePending: true });
          else self2._setGridExpandBusy(false);
        };
        this._gridHistoryLoadTimer = setTimeout(function () {
          finishHistoryLoad(null);
        }, 2e3);
        this._loadTrackerCache(finishHistoryLoad);
        return false;
      }
      this._ensureGridResponsiveStyle();
      var data = this._gridOpenData || this._lastData;
      if (!data || !data.jobs) {
        this._gridOpenRequested = false;
        this._gridOpenWasUserInitiated = false;
        this._setGridExpandBusy(false);
        this._showTrackerNotice?.(_getTrackerT2("gridNoResult"), true);
        return false;
      }
      var currentProject =
        (self.getCurrentProjectId && self.getCurrentProjectId()) || null;
      if (
        currentProject &&
        data.projectId &&
        data.projectId !== currentProject
      ) {
        this._closeGrid(true);
        return false;
      }
      this._gridSessionId = data.sessionId || null;
      var viewModel = self2._gridViewModel(data);
      var batchJobs = viewModel.sessions.flatMap(function (session) {
        return session.jobs;
      });
      if (!batchJobs.length) {
        this._gridOpenRequested = false;
        this._gridOpenWasUserInitiated = false;
        this._setGridExpandBusy(false);
        this._showTrackerNotice?.(_getTrackerT2("gridNoResult"), true);
        return false;
      }
      var cards = batchJobs.flatMap(function (job) {
        return job.items;
      });
      var ov = document.createElement("div");
      ov.id = "tobyflow-ft-grid-overlay";
      ov.setAttribute("data-tobyflow-owned-ui", "true");
      ov.dataset.build = "compact-grid-v6-hover-actions";
      ov.className = "tobyflow-ft-grid-overlay";
      ov.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:rgba(8,12,18,0.95);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;flex-direction:column;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:13px;color:#fff;';
      var gh = document.createElement("div");
      gh.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;";
      gh.className = "tobyflow-ft-grid-header";
      gh.innerHTML =
        '<div class="tobyflow-ft-grid-header-info"><span class="tobyflow-ft-grid-logo" style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;overflow:hidden;background:rgba(204,255,0,0.14);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccff00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span><span class="tobyflow-ft-grid-brand" style="font-size:15px;font-weight:700;color:#fff;">TobyFlow</span><span data-ft-i18n="gridTitle" style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.55);">' +
        self2._escHtml(_getTrackerT2("gridTitle")) +
        '</span><span class="tobyflow-ft-grid-count" aria-label="' +
        cards.length +
        '" style="min-width:24px;height:22px;padding:0 8px;border:1px solid rgba(204,255,0,.2);border-radius:999px;background:rgba(204,255,0,.09);color:#dfff63;font-size:11px;font-weight:700;line-height:1;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;">' +
        cards.length +
        '</span><span class="tobyflow-ft-grid-api-status" data-ft-tip="' +
        self2._escHtml(_getTrackerT2("flowApiChecking")) +
        '" aria-busy="true" style="height:24px;padding:0 8px;border-radius:7px;background:rgba(245,158,11,.12);color:#fbbf24;font-size:10px;font-weight:700;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;"><span data-api-spinner aria-hidden="true" style="width:6px;height:6px;border-radius:50%;background:#fbbf24;"></span>Flow API \xB7 ' +
        self2._escHtml(_getTrackerT2("flowApiCheckingShort")) +
        "</span></div>";
      try {
        chrome.storage.local.get(["af_system_settings"], function (res) {
          var s = (res && res.af_system_settings) || {};
          var brandEl = gh.querySelector(".tobyflow-ft-grid-brand");
          var logoEl = gh.querySelector(".tobyflow-ft-grid-logo");
          if (brandEl && s.app_name) brandEl.textContent = s.app_name;
          if (logoEl && s.app_logo_url) {
            logoEl.style.background = "transparent";
            logoEl.innerHTML =
              '<img src="' +
              self2._escHtml(s.app_logo_url) +
              '" alt="" style="width:100%;height:100%;border-radius:8px;object-fit:cover;display:block;">';
          }
        });
      } catch (_) {}
      var toolsToggle = document.createElement("button");
      toolsToggle.type = "button";
      toolsToggle.title = _getTrackerT2("searchPrompt");
      toolsToggle.setAttribute("data-ft-tip", _getTrackerT2("searchPrompt"));
      toolsToggle.setAttribute("aria-label", _getTrackerT2("searchPrompt"));
      toolsToggle.setAttribute("aria-expanded", "false");
      toolsToggle.style.cssText =
        "margin-left:auto;width:34px;height:34px;border:none;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      toolsToggle.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';
      toolsToggle.addEventListener("click", function () {
        var open = toolsToggle.getAttribute("aria-expanded") !== "true";
        toolsToggle.setAttribute("aria-expanded", open ? "true" : "false");
        toolsToggle.style.background = open
          ? "rgba(204,255,0,.16)"
          : "rgba(255,255,255,.1)";
        toolsToggle.style.color = open ? "#ccff00" : "#fff";
        if (tools) tools.style.display = open ? "flex" : "none";
      });
      var toggleAll = document.createElement("button");
      toggleAll.type = "button";
      toggleAll.style.cssText =
        "width:34px;height:34px;border:none;border-radius:8px;background:rgba(255,255,255,.1);cursor:pointer;display:flex;align-items:center;justify-content:center;";
      toggleAll.setAttribute("aria-label", _getTrackerT2("collapseAllBatches"));
      toggleAll.setAttribute(
        "data-ft-tip",
        _getTrackerT2("collapseAllBatches"),
      );
      toggleAll.setAttribute("aria-pressed", "false");
      toggleAll.innerHTML =
        '<img src="' +
        chrome.runtime.getURL("icons/minimize.svg") +
        '" alt="" style="width:17px;height:17px;filter:brightness(0) invert(1);">';
      toggleAll.addEventListener("click", function () {
        var collapse = toggleAll.getAttribute("aria-pressed") !== "true";
        toggleAll.setAttribute("aria-pressed", collapse ? "true" : "false");
        toggleAll.setAttribute(
          "aria-label",
          _getTrackerT2(collapse ? "expandAllBatches" : "collapseAllBatches"),
        );
        toggleAll.setAttribute(
          "data-ft-tip",
          _getTrackerT2(collapse ? "expandAllBatches" : "collapseAllBatches"),
        );
        toggleAll.innerHTML =
          '<img src="' +
          chrome.runtime.getURL(
            collapse ? "icons/ratio.svg" : "icons/minimize.svg",
          ) +
          '" alt="" style="width:17px;height:17px;filter:brightness(0) invert(1);">';
        self2._gridBody
          ?.querySelectorAll(".tobyflow-ft-batch")
          .forEach(function (section) {
            self2._setBatchCollapsed(section, collapse, true);
          });
      });
      var clearAllBtn = document.createElement("button");
      clearAllBtn.type = "button";
      clearAllBtn.setAttribute("aria-label", _getTrackerT2("clearAllGrid"));
      clearAllBtn.setAttribute("data-ft-tip", _getTrackerT2("clearAllGrid"));
      clearAllBtn.title = _getTrackerT2("clearAllGrid");
      clearAllBtn.style.cssText =
        "width:34px;height:34px;border:1px solid rgba(248,113,113,.25);border-radius:8px;background:rgba(239,68,68,.1);color:#fca5a5;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      clearAllBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>';
      clearAllBtn.addEventListener("click", function () {
        self2._clearAllGridHistory(clearAllBtn);
      });
      clearAllBtn.disabled = false;
      clearAllBtn.setAttribute("aria-disabled", "false");
      clearAllBtn.setAttribute("aria-busy", "false");
      clearAllBtn.style.opacity = "";
      clearAllBtn.style.cursor = "pointer";
      self2._gridClearAllBtn = clearAllBtn;
      var dlAllBtn = document.createElement("button");
      dlAllBtn.type = "button";
      dlAllBtn.setAttribute("aria-label", _getTrackerT2("downloadAllScope"));
      dlAllBtn.setAttribute("data-ft-tip", _getTrackerT2("downloadAllScope"));
      dlAllBtn.title = _getTrackerT2("downloadAllScope");
      dlAllBtn.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:none;border-radius:8px;background:linear-gradient(90deg, rgb(204, 255, 0) 0%, rgb(234, 255, 152) 100%);color:rgb(41, 41, 41);cursor:pointer;font-size:12px;font-weight:600;";
      dlAllBtn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span data-ft-i18n="downloadAll">' +
        self2._escHtml(_getTrackerT2("downloadAll")) +
        "</span>";
      dlAllBtn.addEventListener("click", function () {
        if (dlAllBtn.disabled) return;
        dlAllBtn.disabled = true;
        dlAllBtn.style.opacity = "0.5";
        var _al = dlAllBtn.querySelector("span");
        var _aOrig = _al ? _al.textContent : "";
        Promise.resolve(self2._downloadAll())
          .catch(function () {})
          .then(function () {
            dlAllBtn.disabled = false;
            dlAllBtn.style.opacity = "";
            FloatingTracker._wmProgress = null;
            if (_al) _al.textContent = _aOrig;
          });
        var _tick = setInterval(function () {
          if (!dlAllBtn.disabled) {
            clearInterval(_tick);
            return;
          }
          if (!_al) return;
          var _p = FloatingTracker._wmProgress;
          var _base =
            FloatingTracker._wmLastMode === "clean"
              ? _getTrackerT2("wmCleaning")
              : _getTrackerT2("wmDownloading");
          _al.textContent =
            _p && _p.total > 1
              ? String(_base).replace(/[….]+$/, "") +
                " " +
                _p.done +
                "/" +
                _p.total
              : _base;
        }, 300);
      });
      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", _getTrackerT2("closeGrid"));
      closeBtn.setAttribute("data-ft-tip", _getTrackerT2("closeGrid"));
      closeBtn.title = _getTrackerT2("closeGrid");
      closeBtn.style.cssText =
        "width:34px;height:34px;border:none;border-radius:8px;background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      closeBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      var executionControls = document.createElement("div");
      executionControls.className = "tobyflow-ft-grid-execution";
      executionControls.style.cssText =
        "display:none;align-items:center;gap:6px;flex-wrap:nowrap;";
      [
        [
          "resume",
          "#4ade80",
          "rgba(74,222,128,.14)",
          '<path d="m8 5 11 7-11 7z"/>',
        ],
        [
          "pause",
          "#fbbf24",
          "rgba(251,191,36,.14)",
          '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
        ],
        [
          "stop",
          "#f87171",
          "rgba(248,113,113,.14)",
          '<rect x="5" y="5" width="14" height="14" rx="2"/>',
        ],
      ].forEach(function (def) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.executionAction = def[0];
        button.style.cssText =
          "height:34px;padding:0 10px;border:1px solid currentColor;border-radius:8px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:" +
          def[1] +
          ";background:" +
          def[2] +
          ";";
        button.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          def[3] +
          '</svg><span data-ft-i18n="' +
          def[0] +
          '">' +
          self2._escHtml(_getTrackerT2(def[0])) +
          "</span>";
        button.addEventListener("click", function () {
          var state = self2._gridExecutionState();
          if (button.disabled) return;
          if (def[0] === "stop" && state.canStop)
            self2._sendAction("pq:stopAll", {
              stopSource: "FLOW_FT_GRID_STOP_ALL",
            });
          else if (state.job)
            self2._sendAction(
              def[0] === "resume" ? "pq:resumeJob" : "pq:pauseJob",
              {
                jobId: state.job.manualRegenActive
                  ? state.job.manualRegenJobId
                  : state.job.executionJobId || state.job.id,
              },
            );
        });
        executionControls.appendChild(button);
      });
      gh.appendChild(executionControls);
      gh.appendChild(toolsToggle);
      gh.appendChild(toggleAll);
      gh.appendChild(clearAllBtn);
      gh.appendChild(dlAllBtn);
      gh.appendChild(closeBtn);
      var tools = document.createElement("div");
      tools.className = "tobyflow-ft-grid-tools";
      tools.style.cssText =
        "display:none;align-items:center;gap:8px;padding:8px 20px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap;";
      var filterDefs = [
        ["all", "filterAll"],
        ["success", "filterSuccess"],
        ["failed", "filterFailed"],
        ["regen", "filterRegen"],
      ];
      filterDefs.forEach(function (def) {
        var btn = document.createElement("button");
        btn.textContent = _getTrackerT2(def[1]);
        btn.dataset.gridFilter = def[0];
        btn.dataset.ftI18n = def[1];
        btn.setAttribute("data-ft-tip", _getTrackerT2(def[1]));
        btn.style.cssText =
          "height:30px;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.06);color:#ddd;cursor:pointer;font-size:11px;";
        btn.addEventListener("click", function () {
          self2._gridFilter = def[0];
          self2._applyGridFilters();
        });
        tools.appendChild(btn);
      });
      var search = document.createElement("input");
      search.type = "search";
      search.placeholder = _getTrackerT2("searchPrompt");
      search.dataset.ftI18n = "searchPrompt";
      search.style.cssText =
        "height:30px;min-width:180px;flex:1;padding:0 10px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(0,0,0,.2);color:#fff;";
      search.addEventListener("input", function () {
        self2._gridSearch = search.value;
        self2._applyGridFilters();
      });
      tools.appendChild(search);
      var sort = document.createElement("select");
      sort.title = _getTrackerT2("sortNewest");
      sort.style.cssText =
        "height:30px;padding:0 8px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#202024;color:#fff;font-size:11px;";
      sort.innerHTML =
        '<option data-ft-i18n="sortOriginal" value="original">' +
        self2._escHtml(_getTrackerT2("sortOriginal")) +
        '</option><option data-ft-i18n="sortNewest" value="newest">' +
        self2._escHtml(_getTrackerT2("sortNewest")) +
        "</option>";
      sort.value = self2._gridSort || "newest";
      sort.addEventListener("change", function () {
        self2._gridSort = sort.value;
        self2._applyGridFilters();
      });
      tools.appendChild(sort);
      var body = document.createElement("div");
      body.className = "tobyflow-ft-grid-body";
      body.style.cssText =
        "flex:1;min-height:0;overflow:auto;padding:10px 5px 10px 10px;display:block;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.22) transparent;";
      batchJobs.forEach(function (vm) {
        body.appendChild(self2._buildBatchSection(vm));
      });
      ov.appendChild(gh);
      ov.appendChild(tools);
      ov.appendChild(body);
      this._gridBody = body;
      closeBtn.addEventListener("click", function () {
        self2._closeGrid();
      });
      document.addEventListener("keydown", onKey2);
      self2._gridKeyHandler = onKey2;
      _ftAttachMediaErrorLog2(ov, "grid");
      document.body.appendChild(ov);
      this._gridEl = ov;
      this._releaseCompactRows?.();
      this._stopCompactElapsedTimer();
      if (this._gridOpenWasUserInitiated) {
        this._manualGridOpenWebRunKey =
          this._activeWebRunKey(this._gridApiLiveData) ||
          this._activeWebRunKey(this._lastData);
      }
      this._gridOpenRequested = false;
      this._gridOpenWasUserInitiated = false;
      this._setGridExpandBusy(false);
      this._syncGridExecutionControls();
      this._refreshGridApiStatus(true);
      this._gridApiStatusTimer = setInterval(function () {
        self2._refreshGridApiStatus(false);
      }, 5e3);
      this._syncGridElapsedTimer();
      try {
        ApiGenNotice.hideOverlay();
        if (ApiGenNotice._el) ApiGenNotice._el.style.display = "none";
      } catch (_) {}
      this._applyGridFilters();
      var liveData = this._lastData || {};
      this._observePreviewMedia(body);
      var liveKeys = new Set(
        (liveData.jobs || []).map(function (job) {
          return (job.sessionId || liveData.sessionId || "") + "::" + job.id;
        }),
      );
      body.querySelectorAll(".tobyflow-ft-batch").forEach(function (section) {
        if (!liveKeys.has(section.dataset.batchKey))
          section.dataset.gridHistory = "1";
      });
      this._gridOpenData = null;
      try {
        chrome.storage.local.get(
          ["toby_flow_tracker_collapsed_jobs"],
          function (res) {
            var collapsed = res.toby_flow_tracker_collapsed_jobs || {};
            body
              .querySelectorAll(".tobyflow-ft-batch")
              .forEach(function (section) {
                if (section._collapseUserTouched) return;
                var shouldCollapse =
                  !!collapsed[section.dataset.batchKey] ||
                  section._vm.defaultCollapsed;
                self2._setBatchCollapsed(section, shouldCollapse, false);
              });
          },
        );
      } catch (_) {}
      this._scheduleGridMasonryLayout();
      return true;
    } catch (e) {
      this._gridOpenRequested = false;
      this._gridOpenWasUserInitiated = false;
      this._setGridExpandBusy(false);
      console.warn(
        "[FloatingTracker] Open grid failed:",
        (e && e.message) || e,
      );
      this._showTrackerNotice?.(_getTrackerT2("gridNoResult"), true);
      return false;
    }
  };
  FloatingTracker._buildGridCard = function (
    item,
    cardKey,
    jobId,
    ordinal,
    job,
  ) {
    if (!this._gridBody || typeof IntersectionObserver !== "function") {
      return this._buildGridCardContent(item, cardKey, jobId, ordinal, job);
    }
    return this._buildGridCardShell(item, cardKey, jobId, ordinal, job);
  };
  FloatingTracker._buildGridCardShell = function (
    item,
    cardKey,
    jobId,
    ordinal,
    job,
  ) {
    var card = document.createElement("div");
    card.className = "tobyflow-ft-grid-card";
    card.dataset.itemId = String(cardKey);
    card.dataset.ordinal = String(ordinal || 1);
    card.dataset.selected = "0";
    card._cardKey = cardKey;
    card._ordinal = ordinal || 1;
    card._ftShell = true;
    card.style.cssText =
      "background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;display:flex;min-height:120px;";
    this._updateGridCard(card, item, jobId, job);
    return card;
  };
  FloatingTracker._setGridCardVisible = function (card, visible) {
    if (!card.isConnected || !this._gridBody?.contains(card)) return;
    if (visible === !card._ftShell) return;
    if (
      !visible &&
      (card.dataset.draftDirty === "1" ||
        card.dataset.editorOpen === "1" ||
        (this._gridHoverPlayback &&
          card.contains(this._gridHoverPlayback.thumb)))
    )
      return;
    var replacement = visible
      ? this._buildGridCardContent(
          card._displayItem,
          card._cardKey,
          card._jobId,
          card._ordinal,
          card._displayJob,
        )
      : this._buildGridCardShell(
          card._displayItem,
          card._cardKey,
          card._jobId,
          card._ordinal,
          card._displayJob,
        );
    if (!visible && !replacement._ftShellAspect) {
      replacement._ftReservedHeight = Math.ceil(
        card.getBoundingClientRect().height,
      );
      if (replacement._ftReservedHeight > 0)
        replacement.style.height = replacement._ftReservedHeight + "px";
    }
    replacement._sessionId = card._sessionId;
    replacement.dataset.selected = card.dataset.selected;
    ["optimistic", "optimisticAt"].forEach(function (key) {
      if (card.dataset[key]) replacement.dataset[key] = card.dataset[key];
    });
    replacement.style.display = card.style.display;
    var checkbox = replacement.querySelector(".tobyflow-ft-grid-select input");
    if (checkbox) checkbox.checked = card.dataset.selected === "1";
    card.replaceWith(replacement);
    this._releaseGridCard(card);
    this._observeGridCard(replacement);
    this._observePreviewMedia(replacement);
  };
  FloatingTracker._observeGridCardVisibility = function (card) {
    if (!this._gridBody || typeof IntersectionObserver !== "function") return;
    if (!this._gridCardObserver) {
      var self2 = this;
      this._gridCardObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            self2._setGridCardVisible(entry.target, entry.isIntersecting);
          });
        },
        { root: this._gridBody, rootMargin: "100% 0px", threshold: 0 },
      );
    }
    this._gridCardObserver.observe(card);
  };
  FloatingTracker._buildGridCardContent = function (
    item,
    cardKey,
    jobId,
    ordinal,
    job,
  ) {
    var self2 = this;
    var card = document.createElement("div");
    card.className = "tobyflow-ft-grid-card";
    card.setAttribute("data-item-id", cardKey);
    card._cardKey = cardKey;
    card._displayItem = item;
    card._jobId = jobId;
    card._displayJob = job || null;
    card._ordinal = ordinal || 1;
    card.dataset.ordinal = String(ordinal || 1);
    card.dataset.hasResult = self2._itemResultsOf(item).length ? "1" : "0";
    card.dataset.failed = self2._isRegenRetryCandidate(item) ? "1" : "0";
    card.dataset.regen = item.isRegen || item.regenOf ? "1" : "0";
    card.dataset.selected = "0";
    card.dataset.prompt = String(
      item.prompt || item.promptText || "",
    ).toLowerCase();
    card.dataset.createdAt = String(item.createdAt || 0);
    card.style.cssText =
      "background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;";
    var thumb = document.createElement("div");
    thumb.style.cssText =
      "position:relative;isolation:isolate;background:#0c1320;overflow:hidden;min-height:120px;";
    var mediaEl = document.createElement("div");
    mediaEl.className = "tobyflow-ft-grid-media";
    card._thumbWrap = thumb;
    card._thumbEl = mediaEl;
    self2._applyGridAspect(card, item);
    self2._renderGridThumb(mediaEl, item, card._displayJob);
    card._thumbSig = self2._thumbSigOf(item);
    thumb.appendChild(mediaEl);
    var cornerMeta = document.createElement("div");
    cornerMeta.className = "tobyflow-ft-grid-corner-meta";
    var selectWrap = document.createElement("label");
    selectWrap.className = "tobyflow-ft-grid-select";
    selectWrap.setAttribute("data-ft-tip", _getTrackerT2("regenConfirm"));
    var selectInput = document.createElement("input");
    selectInput.type = "checkbox";
    selectInput.setAttribute("aria-label", _getTrackerT2("regenConfirm"));
    selectInput.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    selectInput.addEventListener("change", function () {
      card.dataset.selected = selectInput.checked ? "1" : "0";
      self2._syncBatchSelectionAction(card.closest(".tobyflow-ft-batch"));
    });
    mediaEl.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      selectInput.checked = !selectInput.checked;
      selectInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    selectWrap.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    selectWrap.appendChild(selectInput);
    cornerMeta.appendChild(selectWrap);
    var ordBadge = document.createElement("span");
    ordBadge.className = "tobyflow-ft-grid-ordinal";
    ordBadge.style.cssText =
      "font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(0,0,0,0.6);color:#fff;pointer-events:none;";
    ordBadge.textContent = "#" + (ordinal || 1);
    cornerMeta.appendChild(ordBadge);
    thumb.appendChild(cornerMeta);
    var statusBadge = document.createElement("div");
    statusBadge.className = "tobyflow-ft-grid-status";
    statusBadge.setAttribute("role", "status");
    statusBadge.style.cssText =
      "position:absolute;top:6px;right:6px;z-index:4;max-width:calc(100% - 48px);height:18px;line-height:14px;box-sizing:border-box;display:flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border-radius:5px;font-weight:700;backdrop-filter:blur(6px);pointer-events:none;";
    statusBadge.style.background = self2._gridStatusBackground(item);
    statusBadge.innerHTML = self2._itemStatusBadgeHtml(item);
    card._statusBadge = statusBadge;
    thumb.appendChild(statusBadge);
    var statusReason = document.createElement("div");
    statusReason.className = "tobyflow-ft-grid-status-reason";
    statusReason.setAttribute("role", "status");
    statusReason.style.cssText =
      "position:absolute;top:29px;left:6px;right:6px;z-index:4;font-size:10px;line-height:14px;padding:4px 6px;border-radius:5px;background:transparent;color:#fbbf24;overflow:hidden;display:none;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:3;";
    card._statusReason = statusReason;
    thumb.appendChild(statusReason);
    self2._updateGridStatusReason?.(card, item);
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tobyflow-ft-grid-item-remove";
    removeBtn.setAttribute("aria-label", _getTrackerT2("removeItem"));
    removeBtn.setAttribute("data-ft-tip", _getTrackerT2("removeItem"));
    removeBtn.title = _getTrackerT2("removeItem");
    removeBtn.style.cssText =
      "position:absolute;top:6px;right:6px;z-index:5;width:27px;height:27px;padding:0;border:1px solid rgba(248,113,113,.3);border-radius:7px;background:rgba(17,17,19,.82);color:#fca5a5;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);";
    removeBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>';
    removeBtn.disabled = !self2._canRemovePromptItem(item, job);
    removeBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      self2._removeGridItem(card, removeBtn);
    });
    thumb.appendChild(removeBtn);
    self2._updateGridSettings(card, item);
    card.appendChild(thumb);
    var b = document.createElement("div");
    b.className = "tobyflow-ft-grid-prompt-editor";
    b.hidden = true;
    b.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;z-index:9;padding:9px;display:flex;flex-direction:column;gap:6px;margin:0;background:rgba(8,12,18,.96);";
    var editorHead = document.createElement("div");
    editorHead.style.cssText =
      "display:flex;align-items:center;gap:6px;color:#fff;font-size:10px;font-weight:700;";
    var editorTitle = document.createElement("span");
    editorTitle.textContent = _getTrackerT2("editPrompt");
    editorTitle.style.cssText =
      "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "tobyflow-ft-item-btn";
    resetBtn.setAttribute("data-ft-tip", _getTrackerT2("resetPrompt"));
    resetBtn.setAttribute("aria-label", _getTrackerT2("resetPrompt"));
    resetBtn.style.cssText =
      "display:none;width:24px;height:24px;padding:0;border-radius:7px;color:#93c5fd;align-items:center;justify-content:center;";
    resetBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>';
    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "tobyflow-ft-item-btn tobyflow-ft-grid-prompt-save";
    saveBtn.setAttribute("data-ft-tip", _getTrackerT2("savePrompt"));
    saveBtn.setAttribute("aria-label", _getTrackerT2("savePrompt"));
    saveBtn.style.cssText =
      "display:none;width:24px;height:24px;padding:0;border-radius:7px;color:#4ade80;align-items:center;justify-content:center;";
    saveBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>';
    var editorClose = document.createElement("button");
    editorClose.type = "button";
    editorClose.className = "tobyflow-ft-item-btn";
    editorClose.setAttribute("data-ft-tip", _getTrackerT2("closeEditor"));
    editorClose.setAttribute("aria-label", _getTrackerT2("closeEditor"));
    editorClose.style.cssText = "width:24px;height:24px;border-radius:7px;";
    editorClose.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    editorHead.append(editorTitle, resetBtn, saveBtn, editorClose);
    b.appendChild(editorHead);
    var ta = document.createElement("textarea");
    ta.value = item.prompt || item.promptText || "";
    ta._originalValue = ta.value;
    card._promptEl = ta;
    ta.setAttribute("data-ft-grid-prompt", "1");
    ta.style.cssText =
      "width:100%;height:100%;min-height:0;box-sizing:border-box;resize:none;overflow-y:auto;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.13);border-radius:8px;color:#f3f4f6;font-size:10.5px;line-height:1.4;padding:7px 8px 42px;font-family:inherit;outline:none;";
    b.appendChild(ta);
    var draftGenBtn = document.createElement("button");
    draftGenBtn.type = "button";
    draftGenBtn.className = "tobyflow-ft-item-btn";
    draftGenBtn.setAttribute("data-ft-tip", _getTrackerT2("regenTitle"));
    draftGenBtn.setAttribute("aria-label", _getTrackerT2("regenTitle"));
    draftGenBtn.style.cssText =
      "display:none;position:absolute;right:16px;bottom:16px;z-index:11;width:28px;height:28px;padding:0;border-radius:50%;color:#111827;background:#fff;border:1px solid rgba(255,255,255,.88);box-shadow:0 2px 8px rgba(0,0,0,.28);align-items:center;justify-content:center;";
    draftGenBtn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>';
    b.appendChild(draftGenBtn);
    function syncDraft() {
      var dirty = ta.value !== ta._originalValue;
      card.dataset.draftDirty = dirty ? "1" : "0";
      draftGenBtn.style.display = dirty ? "inline-flex" : "none";
      resetBtn.style.display = dirty ? "inline-flex" : "none";
      saveBtn.style.display = dirty ? "inline-flex" : "none";
      saveBtn.disabled =
        !dirty ||
        !ta.value.trim() ||
        saveBtn.getAttribute("aria-busy") === "true";
    }
    card._syncDraft = syncDraft;
    ta.addEventListener("input", syncDraft);
    resetBtn.addEventListener("click", function () {
      ta.value = ta._originalValue;
      syncDraft();
      ta.focus();
    });
    saveBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      self2._saveGridPrompt(card, saveBtn);
    });
    var results0 = self2._itemResultsOf(item);
    var idle = self2._canRegenPromptItem(item, job);
    var itemBusy =
      [
        "PENDING",
        "SUBMITTING",
        "SUBMITTED",
        "MONITORING",
        "RETRY_SUBMIT",
        "WAITING_USER",
        "WAITING_PROVIDER",
        "RECOVERY_REQUIRED",
      ].indexOf(item.state) >= 0;
    if (
      item.state === "PENDING" &&
      job?.status === "paused" &&
      item.trackerRemovable === true
    )
      itemBusy = false;
    var act = document.createElement("div");
    act.className = "tobyflow-ft-grid-thumb-actions";
    var vBtn = document.createElement("button");
    vBtn.className = "tobyflow-ft-item-btn tobyflow-ft-grid-thumb-action";
    vBtn.title = _getTrackerT2("viewThumbTitle");
    vBtn.setAttribute("data-ft-tip", _getTrackerT2("viewThumbTitle"));
    vBtn.disabled = !results0.length;
    vBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    vBtn.addEventListener("click", function () {
      var d = card._displayItem;
      var r = self2._itemResultsOf(d || {});
      if (r.length) self2._openBatchViewOverlay(card, 0);
    });
    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className =
      "tobyflow-ft-item-btn tobyflow-ft-grid-thumb-action tobyflow-ft-grid-edit-prompt";
    editBtn.title = _getTrackerT2("editPrompt");
    editBtn.setAttribute("data-ft-tip", _getTrackerT2("editPrompt"));
    editBtn.setAttribute("aria-label", _getTrackerT2("editPrompt"));
    editBtn.setAttribute("aria-expanded", "false");
    editBtn.style.cssText = "position:absolute;right:6px;bottom:6px;z-index:6;";
    editBtn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    function setEditorOpen(open) {
      b.hidden = !open;
      card.dataset.editorOpen = open ? "1" : "0";
      editBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) ta.focus();
    }
    editBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setEditorOpen(b.hidden);
    });
    editorClose.addEventListener("click", function (e) {
      e.stopPropagation();
      setEditorOpen(false);
    });
    var rBtn = document.createElement("button");
    rBtn.className = "tobyflow-ft-item-btn tobyflow-ft-grid-thumb-action";
    rBtn.setAttribute(
      "data-ft-tip",
      _getTrackerT2(
        self2._isQueuedRegenItem(item, job)
          ? "regenQueued"
          : idle && !itemBusy
            ? "regenTitle"
            : "regenBusyTitle",
      ),
    );
    rBtn.disabled = !idle || itemBusy;
    rBtn.innerHTML = self2._regenIcon(16);
    rBtn.addEventListener("click", function () {
      if (
        rBtn.disabled ||
        !self2._canRegenPromptItem(card._displayItem, card._displayJob)
      )
        return;
      self2
        ._requestRegen(
          rBtn,
          card._jobId,
          card._displayItem.id,
          card._displayItem,
          ta.value,
        )
        .then(function (res) {
          if (res && res.ok) {
            ta._originalValue = ta.value;
            syncDraft();
          }
        });
    });
    var resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.className =
      "tobyflow-ft-item-btn tobyflow-ft-grid-thumb-action tobyflow-ft-grid-item-resume";
    resumeBtn.setAttribute("data-ft-tip", _getTrackerT2("resume"));
    resumeBtn.setAttribute("aria-label", _getTrackerT2("resume"));
    resumeBtn.style.color = "#4ade80";
    resumeBtn.style.display = self2._resumeJobIdForItem(item, job)
      ? "inline-flex"
      : "none";
    card.dataset.resumeHeld =
      resumeBtn.style.display === "inline-flex" ? "1" : "0";
    resumeBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';
    resumeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (resumeBtn.disabled) return;
      var targetJobId = self2._resumeJobIdForItem(
        card._displayItem,
        card._displayJob,
      );
      if (!targetJobId) return;
      resumeBtn.disabled = true;
      resumeBtn.setAttribute("aria-busy", "true");
      self2
        ._sendAction("pq:resumeJob", { jobId: targetJobId })
        .finally(function () {
          if (!resumeBtn.isConnected) return;
          resumeBtn.removeAttribute("aria-busy");
          resumeBtn.disabled = false;
        });
    });
    draftGenBtn.disabled = rBtn.disabled;
    draftGenBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (rBtn.disabled) return;
      rBtn.click();
    });
    ta.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!rBtn.disabled) rBtn.click();
      }
    });
    var dBtn = document.createElement("button");
    dBtn.className = "tobyflow-ft-item-btn tobyflow-ft-grid-thumb-action";
    dBtn.setAttribute("data-ft-tip", _getTrackerT2("dlItemTitle"));
    dBtn.disabled = !results0.length;
    dBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    dBtn.addEventListener("click", function () {
      var d = card._displayItem;
      var downloadable = self2._itemResultsOf(d || {});
      console.log("[FloatingTracker/download] grid item click", {
        itemId: (d && d.id) || null,
        results: downloadable.length,
        genMode: (d && d.genMode) || null,
        restored: !!(
          self2._gridOpenData && self2._gridOpenData._ftRestoredCache
        ),
      });
      if (!downloadable.length) return;
      dBtn.disabled = true;
      Promise.resolve(self2._downloadItem(d))
        .catch(function (error) {
          console.error(
            "[FloatingTracker/download] grid item click failed:",
            (error && error.message) || error,
          );
          self2._showTrackerNotice(
            "Download: " + ((error && error.message) || "DOWNLOAD_FAILED"),
            true,
          );
        })
        .then(function () {
          dBtn.disabled = false;
        });
    });
    card._vBtn = vBtn;
    card._rBtn = rBtn;
    card._resumeBtn = resumeBtn;
    card._draftGenBtn = draftGenBtn;
    card._dBtn = dBtn;
    card._removeBtn = removeBtn;
    act.appendChild(vBtn);
    act.appendChild(rBtn);
    act.appendChild(resumeBtn);
    act.appendChild(dBtn);
    thumb.appendChild(act);
    thumb.appendChild(editBtn);
    thumb.appendChild(b);
    return card;
  };
  try {
    self.FloatingTracker = FloatingTracker;
    try {
      FloatingTracker._initTooltip();
    } catch (_) {}
    try {
      FloatingTracker._ensureLauncher();
      FloatingTracker._syncLauncherVisibility();
    } catch (_) {}
    self.ApiGenNotice = ApiGenNotice;
    self._getTrackerT = _getTrackerT2;
  } catch (_) {}
}
