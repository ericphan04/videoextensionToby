class ScreenCapture {
  static async startCapture() {
    try {
      console.log(
        "[ScreenCapture] Hi\u1EC3n th\u1ECB overlay ch\u1ECDn v\xF9ng tr\xEAn tab hi\u1EC7n t\u1EA1i...",
      );
      const cropResult = await this._startCropOnActiveTab();
      if (cropResult.action === "openFlow") {
        const shouldOpen = await this._showOpenFlowDialog(cropResult.error);
        if (shouldOpen) {
          chrome.runtime.sendMessage({ action: "openFlowTab" });
        }
        return { success: false, cancelled: true };
      }
      if (!cropResult.success) {
        if (cropResult.cancelled) {
          console.log(
            "[ScreenCapture] \u0110\xE3 h\u1EE7y ch\u1EE5p m\xE0n h\xECnh",
          );
          return { success: false, cancelled: true };
        }
        throw new Error(
          cropResult.error ||
            window.I18n?.t("capture.errorCropFailed") ||
            "Failed to select area",
        );
      }
      console.log("[ScreenCapture] Ch\u1EE5p m\xE0n h\xECnh tab...");
      const captureResult = await this._captureScreen();
      if (!captureResult.success) {
        throw new Error(
          captureResult.error ||
            window.I18n?.t("capture.errorCaptureFailed") ||
            "Failed to capture screenshot",
        );
      }
      const captureName =
        cropResult.captureName || "capture_" + Date.now().toString(36);
      console.log(
        "[ScreenCapture] \u0110ang c\u1EAFt \u1EA3nh...",
        cropResult.cropRect,
        "T\xEAn:",
        captureName,
      );
      const croppedFile = await this._cropImage(
        captureResult.dataUrl,
        cropResult.cropRect,
        captureName,
      );
      const uploadId =
        "upload_capture_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substr(2, 6);
      const thumbnail = await this._fileToDataUrl(croppedFile);
      if (!window.pendingUploadFiles) window.pendingUploadFiles = new Map();
      window.pendingUploadFiles.set(uploadId, {
        file: croppedFile,
        thumbnail,
        name: captureName,
        timestamp: Date.now(),
      });
      if (window.ImmediateUploader) {
        ImmediateUploader.upload(croppedFile, thumbnail, {
          key: uploadId,
          name: captureName,
        });
      } else if (window.PendingUploadStore) {
        await PendingUploadStore.saveLightweight(uploadId, {
          thumbnail,
          fileName: croppedFile.name,
          fileSize: croppedFile.size,
          fileType: croppedFile.type,
          name: captureName,
        });
      }
      if (window.imageNameRegistry) {
        window.imageNameRegistry.register(captureName, {
          type: "capture",
          source: "capture",
          uploadId,
          thumbnail,
          blob_url: thumbnail,
        });
        console.log(
          "[ScreenCapture] \u0110\xE3 \u0111\u0103ng k\xFD @" +
            captureName +
            " v\xE0o registry",
        );
      }
      console.log(
        "[ScreenCapture] \u0110\xE3 th\xEAm \u1EA3nh capture:",
        uploadId,
        "T\xEAn:",
        captureName,
      );
      return { success: true, uploadId, captureName };
    } catch (err) {
      console.error("[ScreenCapture] L\u1ED7i:", err.message);
      return { success: false, error: err.message };
    }
  }
  static async _captureScreen() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "captureScreen" },
        async (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          if (response?.action === "openFlow") {
            const shouldOpen = await this._showOpenFlowDialog(response.error);
            if (shouldOpen) {
              chrome.runtime.sendMessage({ action: "openFlowTab" });
            }
            resolve({ success: false, cancelled: true });
            return;
          }
          if (response?.action === "requestCapturePermission") {
            const shouldGrant = await this._showPermissionDialog();
            if (shouldGrant) {
              try {
                const granted = await chrome.permissions.request({
                  origins: ["<all_urls>"],
                });
                console.log(
                  "[ScreenCapture] Permission request result:",
                  granted,
                );
                if (granted) {
                  console.log(
                    "[ScreenCapture] Permission granted, retrying capture...",
                  );
                  chrome.runtime.sendMessage(
                    { action: "captureScreen" },
                    (retryResponse) => {
                      resolve(
                        retryResponse || {
                          success: false,
                          error: "Retry failed",
                        },
                      );
                    },
                  );
                  return;
                }
              } catch (permErr) {
                console.error(
                  "[ScreenCapture] Permission request error:",
                  permErr,
                );
              }
            }
            resolve({
              success: false,
              cancelled: true,
              error:
                window.I18n?.t("capture.errorNeedPermission") ||
                "Screen capture permission required",
            });
            return;
          }
          resolve(
            response || {
              success: false,
              error: window.I18n?.t("capture.errorNoResponse") || "No response",
            },
          );
        },
      );
    });
  }
  static async _showPermissionDialog() {
    if (!window.customDialog) return false;
    return await window.customDialog.confirm(
      window.I18n?.t("capture.permissionMsg") ||
        "To capture this page, you need to grant access permission. This permission is only used for screenshots and will be saved for future use.",
      {
        title:
          window.I18n?.t("capture.permissionTitle") ||
          "Grant Screenshot Permission",
        type: "info",
        confirmText:
          window.I18n?.t("capture.grantPermission") || "Grant Permission",
        cancelText: window.I18n?.t("common.cancel") || "Cancel",
      },
    );
  }
  static async _showOpenFlowDialog(message) {
    if (!window.customDialog) return false;
    return await window.customDialog.confirm(
      message ||
        window.I18n?.t("capture.openFlowMsg") ||
        "No Google Flow project is open. Open a project on flow.google.com to upload the screenshot.",
      {
        title: window.I18n?.t("capture.openFlowTitle") || "Open Google Flow",
        type: "info",
        confirmText: window.I18n?.t("capture.openFlowConfirm") || "Open Flow",
        cancelText: window.I18n?.t("common.cancel") || "Cancel",
      },
    );
  }
  static async _startCropOnActiveTab() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "startCropOnActiveTab" },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          resolve(
            response || {
              success: false,
              error: window.I18n?.t("capture.errorNoResponse") || "No response",
            },
          );
        },
      );
    });
  }
  static async _cropImage(dataUrl, cropRect, captureName) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = cropRect.width;
        canvas.height = cropRect.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          cropRect.x,
          cropRect.y,
          cropRect.width,
          cropRect.height,
          0,
          0,
          cropRect.width,
          cropRect.height,
        );
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(
              new Error(
                window.I18n?.t("capture.errorBlobFailed") ||
                  "Failed to create blob from canvas",
              ),
            );
            return;
          }
          const fileName = captureName
            ? `${captureName}.png`
            : `capture_${Date.now()}.png`;
          const file = new File([blob], fileName, { type: "image/png" });
          resolve(file);
        }, "image/png");
      };
      img.onerror = () => {
        reject(
          new Error(
            window.I18n?.t("capture.errorLoadFailed") ||
              "Failed to load screenshot image",
          ),
        );
      };
      img.src = dataUrl;
    });
  }
  static async _fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }
}
window.ScreenCapture = ScreenCapture;
