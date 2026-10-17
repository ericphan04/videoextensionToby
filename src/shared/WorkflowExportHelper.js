class WorkflowExportHelper {
  static convertNodesToExport(nodes) {
    return (nodes || []).map((node) => {
      const exportNode = {
        node_id: node.node_id,
        node_type: node.node_type,
        node_name: node.node_name,
        pos_x: node.pos_x,
        pos_y: node.pos_y,
        enabled: node.enabled !== false,
      };
      const t = node.node_type;
      const isGenLike = t === "generate" || t === "gemini";
      const hasRatio = isGenLike || t === "chatgpt" || t === "grok";
      const hasQuantity = isGenLike || t === "grok";
      const hasAutoDownload =
        isGenLike || t === "chatgpt" || t === "grok" || t === "download";
      const isMentionable = [
        "image",
        "text",
        "text_extract",
        "generate",
        "chatgpt",
        "grok",
        "gemini",
        "prompt",
      ].includes(t);
      if (isMentionable && node.slug) exportNode.slug = node.slug;
      if (isMentionable && node.slug_auto !== void 0)
        exportNode.slug_auto = node.slug_auto;
      const canUseMentions = [
        "generate",
        "chatgpt",
        "grok",
        "gemini",
        "prompt",
      ].includes(t);
      if (canUseMentions && node.prompt_mode)
        exportNode.prompt_mode = node.prompt_mode;
      if (canUseMentions && node.ref_mode) exportNode.ref_mode = node.ref_mode;
      if (node.prompt) exportNode.prompt = node.prompt;
      if (node.prompts) exportNode.prompts = node.prompts;
      if (isGenLike && node.gen_type) exportNode.gen_type = node.gen_type;
      if (isGenLike && node.media_type) exportNode.media_type = node.media_type;
      if (isGenLike && node.video_input_type)
        exportNode.video_input_type = node.video_input_type;
      if (isGenLike && node.video_duration)
        exportNode.video_duration = node.video_duration;
      if (isGenLike && node.video_resolution)
        exportNode.video_resolution = node.video_resolution;
      if (isGenLike && node.model) exportNode.model = node.model;
      if (isGenLike && node.voice_slug) exportNode.voice_slug = node.voice_slug;
      if (isGenLike && node.voice_search_value)
        exportNode.voice_search_value = node.voice_search_value;
      if (isGenLike && Array.isArray(node.character_selections))
        exportNode.character_selections = node.character_selections;
      if (isGenLike && node.character_slug)
        exportNode.character_slug = node.character_slug;
      if (isGenLike && node.character_search_value)
        exportNode.character_search_value = node.character_search_value;
      if (hasQuantity && node.quantity) exportNode.quantity = node.quantity;
      if (hasRatio && node.ratio) exportNode.ratio = node.ratio;
      if (isGenLike && node.style_prompt)
        exportNode.style_prompt = node.style_prompt;
      if (isGenLike && node.ref_mode) exportNode.ref_mode = node.ref_mode;
      if (hasAutoDownload && node.auto_download)
        exportNode.auto_download = node.auto_download;
      if (hasAutoDownload && node.download_resolution)
        exportNode.download_resolution = node.download_resolution;
      if (hasAutoDownload && node.video_download_resolution)
        exportNode.video_download_resolution = node.video_download_resolution;
      if (t === "download" && node.download_folder)
        exportNode.download_folder = node.download_folder;
      if (t === "download" && node.download_file_template)
        exportNode.download_file_template = node.download_file_template;
      if (t === "download" && node.download_collect_all !== void 0)
        exportNode.download_collect_all = node.download_collect_all;
      if (t === "delay" && node.delay_seconds)
        exportNode.delay_seconds = node.delay_seconds;
      if (t === "text_extract") {
        if (node.extract_mode) exportNode.extract_mode = node.extract_mode;
        if (node.extract_marker)
          exportNode.extract_marker = node.extract_marker;
        if (node.extract_regex) exportNode.extract_regex = node.extract_regex;
        if (node.extract_strict !== void 0)
          exportNode.extract_strict = !!node.extract_strict;
        if (node.extract_multi_match)
          exportNode.extract_multi_match = node.extract_multi_match;
        if (node.extract_on_fail)
          exportNode.extract_on_fail = node.extract_on_fail;
      }
      if (node.node_type === "telegram") {
        if (node.telegram_chat_id)
          exportNode.telegram_chat_id = node.telegram_chat_id;
        if (node.telegram_send_mode)
          exportNode.telegram_send_mode = node.telegram_send_mode;
        if (node.telegram_message)
          exportNode.telegram_message = node.telegram_message;
      }
      if (node.frame_1_source) exportNode.frame_1_source = node.frame_1_source;
      if (node.frame_2_source) exportNode.frame_2_source = node.frame_2_source;
      if (node.frame_1_file_name)
        exportNode.frame_1_file_name = node.frame_1_file_name;
      if (node.frame_2_file_name)
        exportNode.frame_2_file_name = node.frame_2_file_name;
      if (node.frame_1_thumbnail)
        exportNode.frame_1_thumbnail = node.frame_1_thumbnail;
      if (node.frame_2_thumbnail)
        exportNode.frame_2_thumbnail = node.frame_2_thumbnail;
      if (node.note_text) exportNode.note_text = node.note_text;
      if (t === "note") {
        if (node.note_width) exportNode.note_width = node.note_width;
        if (node.note_height) exportNode.note_height = node.note_height;
        if (node.note_color) exportNode.note_color = node.note_color;
        if (node.note_font_size)
          exportNode.note_font_size = node.note_font_size;
      }
      const isAIProvider =
        t === "chatgpt" || t === "grok" || t === "gemini" || t === "prompt";
      if (isAIProvider && node.provider) exportNode.provider = node.provider;
      if (
        (t === "generate" ||
          t === "chatgpt" ||
          t === "grok" ||
          t === "gemini") &&
        node.prompt_source
      ) {
        exportNode.prompt_source = node.prompt_source;
      }
      if (isGenLike && node.multi_prompt !== void 0)
        exportNode.multi_prompt = node.multi_prompt === true;
      if (t === "prompt" && node.use_ai !== void 0)
        exportNode.use_ai = node.use_ai;
      if (t === "prompt" && node.ai_fallback !== void 0)
        exportNode.ai_fallback = node.ai_fallback;
      if (t === "prompt" && node.ai_delete_after_run !== void 0)
        exportNode.ai_delete_after_run = node.ai_delete_after_run;
      if (t === "prompt" && node.timeout_sec)
        exportNode.timeout_sec = node.timeout_sec;
      if (t === "chatgpt" && node.use_fallback_prefix)
        exportNode.use_fallback_prefix = node.use_fallback_prefix;
      if (
        (t === "chatgpt" || t === "grok" || t === "gemini") &&
        node.timeout_ms != null
      )
        exportNode.timeout_ms = node.timeout_ms;
      if (
        (t === "chatgpt" || t === "grok" || t === "gemini") &&
        node.max_ref_images != null
      )
        exportNode.max_ref_images = node.max_ref_images;
      if (t === "gemini")
        exportNode.gemini_delete_after_gen =
          node.gemini_delete_after_gen === true;
      if (t === "grok" && node.grok_mode) exportNode.grok_mode = node.grok_mode;
      if (t === "grok" && node.grok_duration)
        exportNode.grok_duration = node.grok_duration;
      if (t === "grok" && node.grok_resolution)
        exportNode.grok_resolution = node.grok_resolution;
      if (t === "grok" && node.grok_image_quality)
        exportNode.grok_image_quality = node.grok_image_quality;
      const refThumbnails = node.ref_thumbnails || {};
      const refFileNames = node.ref_file_names || {};
      const idsFromString = (node.ref_file_ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const idsFromMaps = [
        ...new Set([
          ...Object.keys(refThumbnails),
          ...Object.keys(refFileNames),
        ]),
      ];
      const refIds = idsFromString.length > 0 ? idsFromString : idsFromMaps;
      if (refIds.length > 0) {
        exportNode.ref_images = refIds
          .map((id) => {
            const thumb = refThumbnails[id];
            const fileName = refFileNames[id];
            const result = {};
            if (thumb && typeof thumb === "object") {
              result.thumbnail = thumb.thumbnail || "";
              if (thumb.type === "video" || thumb.video_url) {
                result.type = "video";
                if (thumb.video_url) result.video_url = thumb.video_url;
              }
              if (thumb.source_thumbnail)
                result.source_thumbnail = thumb.source_thumbnail;
              if (thumb.persistent_media_id)
                result.persistent_media_id = thumb.persistent_media_id;
            } else if (thumb) {
              result.thumbnail = thumb;
            }
            if (fileName) {
              result.file_name = fileName;
            }
            return result;
          })
          .filter((img) => img.thumbnail || img.file_name || img.video_url);
      }
      return exportNode;
    });
  }
  static convertEdgesToExport(edges, nodes = null) {
    const nodesById = {};
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        if (n?.node_id) nodesById[n.node_id] = n;
      }
    }
    const inferDataType = (edge) => {
      const src = nodesById[edge.source_node_id];
      const srcType = src?.node_type;
      if (["text", "text_extract", "prompt"].includes(srcType)) return "text";
      if (srcType === "gemini" || srcType === "generate") {
        return String(src?.media_type).toLowerCase() === "video"
          ? "video"
          : "image";
      }
      if (srcType === "image")
        return String(src?.media_type).toLowerCase() === "video"
          ? "video"
          : "image";
      if (["chatgpt", "grok"].includes(srcType)) return "image";
      return edge.data_type || "image";
    };
    return (edges || []).map((e) => ({
      edge_id: e.edge_id,
      source_node_id: e.source_node_id,
      source_handle: e.source_handle,
      source_port: e.source_port || null,
      target_node_id: e.target_node_id,
      target_handle: e.target_handle,
      target_port: e.target_port || null,
      data_type: inferDataType(e),
    }));
  }
  static buildSettings(workflow) {
    const stored = workflow?.settings_json || workflow?.settings || {};
    return {
      parallel:
        stored.parallel_execution ?? workflow?.parallel_execution ?? true,
      quantity: stored.quantity ?? workflow?.quantity ?? 1,
      delay_between_nodes:
        stored.delay_between_nodes ?? workflow?.delay_between_nodes ?? 3,
      timeout_per_node:
        stored.timeout ??
        stored.timeout_per_node ??
        workflow?.timeout_per_node ??
        120,
      retry_on_error:
        stored.max_retries ??
        stored.retry_on_error ??
        workflow?.retry_on_error ??
        0,
      stop_on_error:
        (stored.stop_on_error ?? workflow?.stop_on_error) !== false,
    };
  }
  static buildExportData(workflowName, description, workflow, nodes, edges) {
    return {
      version: "1.0",
      type: "workflow",
      exported_at: new Date().toISOString(),
      workflow: {
        name:
          workflowName ||
          window.I18n?.t?.("workflow.untitled") ||
          "Untitled workflow",
        description: description || "",
        settings: this.buildSettings(workflow),
        nodes: this.convertNodesToExport(nodes),
        edges: this.convertEdgesToExport(edges, nodes),
      },
    };
  }
  static buildExportFilename(name) {
    const safeName =
      (name || "workflow")
        .substring(0, 30)
        .replace(/[^a-zA-Z0-9À-ɏḀ-ỿ_\- ]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .trim() || "workflow";
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "_",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    return `workflow_${safeName}_${timestamp}.json`;
  }
  static downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
window.WorkflowExportHelper = WorkflowExportHelper;
