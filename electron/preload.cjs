const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("usatDesktop", {
  updateCampus: (credentials) => ipcRenderer.invoke("usat:updateCampus", credentials),
  closeApp: () => ipcRenderer.invoke("usat:closeApp"),
  exportSummary: (payload) => ipcRenderer.invoke("usat:exportSummary", payload)
});
