import { contextBridge, ipcRenderer } from "electron";

type ExportPayload = {
  folderPath: string;
  fileName: string;
  content: string;
};

type ExportResult =
  | { ok: true; savedPath: string; finalFileName: string }
  | { ok: false; error: string };

type SftpUploadPayload = {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteDirectory: string;
  fileName: string;
  content: string;
};

type SftpUploadResult =
  | { ok: true; remotePath: string }
  | { ok: false; error: string };

type AppSettings = {
  version: number;
  outputFolderPath: string;
  headers: string[];
  ui: {
    showIntroMessage: boolean;
    isOutputPanelOpen: boolean;
    isReferencePanelOpen: boolean;
  };
  sftp: {
    host: string;
    port: string;
    username: string;
    password: string;
    remoteDirectory: string;
    savePassword: boolean;
  };
  windowBounds: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
};

type SettingsPayload = {
  outputFolderPath?: string;
  headers?: string[];
  ui?: Partial<AppSettings["ui"]>;
  sftp?: Partial<AppSettings["sftp"]>;
};

contextBridge.exposeInMainWorld("feedApi", {
  chooseOutputFolder: (): Promise<string | null> =>
    ipcRenderer.invoke("choose-output-folder"),
  exportFile: (payload: ExportPayload): Promise<ExportResult> =>
    ipcRenderer.invoke("export-file", payload),
  uploadViaSftp: (payload: SftpUploadPayload): Promise<SftpUploadResult> =>
    ipcRenderer.invoke("upload-via-sftp", payload),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open-external", url),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("get-settings"),
  saveSettings: (payload: SettingsPayload): Promise<AppSettings> =>
    ipcRenderer.invoke("save-settings", payload)
});
