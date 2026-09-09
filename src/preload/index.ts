import { contextBridge, ipcRenderer } from 'electron';

/** API mínima y segura expuesta a la interfaz: un único método invoke por canal. */
const api = {
  invoke: (canal: string, payload?: unknown) => ipcRenderer.invoke(canal, payload),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
