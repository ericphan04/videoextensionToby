class ImageNameRegistry {
  constructor() {
    this._registry = new Map();
  }
  register(name, imageData) {
    if (!name || typeof name !== "string" || !name.trim()) {
      console.warn("[ImageNameRegistry] T\xEAn r\u1ED7ng:", name);
      return false;
    }
    const displayName = name.trim();
    this._registry.set(displayName.toLowerCase(), {
      name: displayName,
      ...imageData,
      registeredAt: Date.now(),
    });
    return true;
  }
  unregister(name) {
    return this._registry.delete(name.toLowerCase());
  }
  lookup(name) {
    return this._registry.get(name.toLowerCase()) || null;
  }
  getAvailableNames() {
    return Array.from(this._registry.keys());
  }
  getAll() {
    return Array.from(this._registry.values());
  }
  clear() {
    this._registry.clear();
  }
  async refreshFromSources() {
    this._registry.clear();
    if (window.ImageStore) {
      try {
        const allImages = await window.ImageStore.getAllImages();
        for (const img of allImages) {
          if (img.name) {
            this.register(img.name, {
              type: img.type,
              source: "album",
              albumId: img.album_id,
              file_id: img.file_id,
              file_name: img.file_name,
              thumbnail_url: img.thumbnail_url,
              blob_key: img.blob_key,
            });
          }
        }
      } catch (e) {
        console.error("[ImageNameRegistry] L\u1ED7i load t\u1EEB albums:", e);
      }
    }
    console.log(
      "[ImageNameRegistry] \u0110\xE3 refresh, c\xF3",
      this._registry.size,
      "t\xEAn",
    );
  }
  registerFromRefImages(refImages) {
    if (!refImages || !Array.isArray(refImages)) return;
    for (const img of refImages) {
      if (img.name) {
        this.register(img.name, {
          type: img.type || "flow",
          source: "ref_list",
          file_id: img.file_id,
          file_name: img.file_name,
          thumbnail_url: img.thumbnail_url,
          blob_url: img.blob_url,
        });
      }
    }
  }
  generateUniqueName(baseName) {
    if (!baseName || typeof baseName !== "string") {
      baseName = "image";
    }
    let name = baseName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 40);
    if (!name) name = "image";
    if (!this._registry.has(name)) return name;
    let counter = 1;
    while (this._registry.has(`${name}_${counter}`)) {
      counter++;
    }
    return `${name}_${counter}`;
  }
  has(name) {
    if (!name || typeof name !== "string") return false;
    return this._registry.has(name.toLowerCase());
  }
  get size() {
    return this._registry.size;
  }
}
window.imageNameRegistry = new ImageNameRegistry();
