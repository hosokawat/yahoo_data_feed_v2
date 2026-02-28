import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import SftpClient from "ssh2-sftp-client";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const SETTINGS_FILE_NAME = "settings.json";
const WINDOW_TITLE = "Yahoo Feed Editor v1（全件更新専用）";

type WindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

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
  windowBounds: WindowBounds;
};

type RendererSettingsPayload = {
  outputFolderPath?: string;
  headers?: string[];
  ui?: Partial<AppSettings["ui"]>;
  sftp?: Partial<AppSettings["sftp"]>;
};

type SftpUploadPayload = {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteDirectory: string;
  fileName: string;
  content: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  outputFolderPath: "",
  headers: [],
  ui: {
    showIntroMessage: true,
    isOutputPanelOpen: true,
    isReferencePanelOpen: true
  },
  sftp: {
    host: "",
    port: "22",
    username: "",
    password: "",
    remoteDirectory: "",
    savePassword: false
  },
  windowBounds: { width: 1440, height: 900 }
};

let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };

const settingsPath = (): string =>
  join(app.getPath("userData"), SETTINGS_FILE_NAME);

const sanitizeSettings = (raw: unknown): AppSettings => {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const record = raw as Record<string, unknown>;
  const outputFolderPath =
    typeof record.outputFolderPath === "string" ? record.outputFolderPath : "";
  const headers = Array.isArray(record.headers)
    ? record.headers.filter((v): v is string => typeof v === "string")
    : [];
  const rawUi =
    typeof record.ui === "object" && record.ui !== null
      ? (record.ui as Record<string, unknown>)
      : {};
  const ui = {
    showIntroMessage:
      typeof rawUi.showIntroMessage === "boolean" ? rawUi.showIntroMessage : true,
    isOutputPanelOpen:
      typeof rawUi.isOutputPanelOpen === "boolean"
        ? rawUi.isOutputPanelOpen
        : true,
    isReferencePanelOpen:
      typeof rawUi.isReferencePanelOpen === "boolean"
        ? rawUi.isReferencePanelOpen
        : true
  };
  const rawSftp =
    typeof record.sftp === "object" && record.sftp !== null
      ? (record.sftp as Record<string, unknown>)
      : {};
  const sftp = {
    host: typeof rawSftp.host === "string" ? rawSftp.host : "",
    port:
      typeof rawSftp.port === "string" && rawSftp.port.trim() !== ""
        ? rawSftp.port
        : "22",
    username: typeof rawSftp.username === "string" ? rawSftp.username : "",
    password: typeof rawSftp.password === "string" ? rawSftp.password : "",
    remoteDirectory:
      typeof rawSftp.remoteDirectory === "string" ? rawSftp.remoteDirectory : "",
    savePassword: rawSftp.savePassword === true
  };
  const rawBounds =
    typeof record.windowBounds === "object" && record.windowBounds !== null
      ? (record.windowBounds as Record<string, unknown>)
      : {};
  const width =
    typeof rawBounds.width === "number" && rawBounds.width > 0
      ? rawBounds.width
      : DEFAULT_SETTINGS.windowBounds.width;
  const height =
    typeof rawBounds.height === "number" && rawBounds.height > 0
      ? rawBounds.height
      : DEFAULT_SETTINGS.windowBounds.height;
  const x = typeof rawBounds.x === "number" ? rawBounds.x : undefined;
  const y = typeof rawBounds.y === "number" ? rawBounds.y : undefined;

  return {
    version: 1,
    outputFolderPath,
    headers,
    ui,
    sftp: {
      ...sftp,
      password: sftp.savePassword ? sftp.password : ""
    },
    windowBounds: { x, y, width, height }
  };
};

const loadSettings = async (): Promise<AppSettings> => {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const persistSettings = async (): Promise<void> => {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(settingsCache, null, 2), "utf8");
};

const updateSettings = async (
  payload: Partial<RendererSettingsPayload & Pick<AppSettings, "windowBounds">>
): Promise<AppSettings> => {
  if (typeof payload.outputFolderPath === "string") {
    settingsCache.outputFolderPath = payload.outputFolderPath;
  }
  if (Array.isArray(payload.headers)) {
    settingsCache.headers = payload.headers.filter(
      (value): value is string => typeof value === "string"
    );
  }
  if (payload.ui && typeof payload.ui === "object") {
    settingsCache.ui = {
      ...settingsCache.ui,
      ...payload.ui
    };
  }
  if (payload.sftp && typeof payload.sftp === "object") {
    settingsCache.sftp = {
      ...settingsCache.sftp,
      ...payload.sftp
    };
    if (!settingsCache.sftp.savePassword) {
      settingsCache.sftp.password = "";
    }
  }
  if (payload.windowBounds) {
    settingsCache.windowBounds = {
      ...settingsCache.windowBounds,
      ...payload.windowBounds
    };
  }
  await persistSettings();
  return settingsCache;
};

const createWindow = async (): Promise<BrowserWindow> => {
  const { width, height, x, y } = settingsCache.windowBounds;
  const win = new BrowserWindow({
    title: WINDOW_TITLE,
    width,
    height,
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(__dirname, "../dist/index.html"));
  }

  win.on("close", () => {
    const bounds = win.getBounds();
    void updateSettings({
      windowBounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      }
    });
  });

  return win;
};

const resolveUniquePath = (targetPath: string): { path: string; name: string } => {
  if (!existsSync(targetPath)) {
    return { path: targetPath, name: parse(targetPath).base };
  }

  const parsed = parse(targetPath);
  let version = 2;
  while (true) {
    const candidateName = `${parsed.name}_v${version}${parsed.ext}`;
    const candidatePath = join(parsed.dir, candidateName);
    if (!existsSync(candidatePath)) {
      return { path: candidatePath, name: candidateName };
    }
    version += 1;
  }
};

app.whenReady().then(async () => {
  settingsCache = await loadSettings();

  ipcMain.handle("choose-output-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(
    "export-file",
    async (
      _event,
      payload: { folderPath: string; fileName: string; content: string }
    ) => {
      try {
        await mkdir(payload.folderPath, { recursive: true });
        const firstPath = join(payload.folderPath, payload.fileName);
        const unique = resolveUniquePath(firstPath);
        await writeFile(unique.path, payload.content, { encoding: "utf8" });
        return {
          ok: true as const,
          savedPath: unique.path,
          finalFileName: unique.name
        };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "ファイル保存に失敗しました。"
        };
      }
    }
  );

  ipcMain.handle("open-external", async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("upload-via-sftp", async (_event, payload: SftpUploadPayload) => {
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password: payload.password
      });

      const normalizedDir = payload.remoteDirectory.trim().replace(/\\/g, "/");
      if (normalizedDir) {
        const exists = await sftp.exists(normalizedDir);
        if (!exists) {
          await sftp.mkdir(normalizedDir, true);
        }
      }

      const remotePath = normalizedDir
        ? `${normalizedDir.replace(/\/+$/, "")}/${payload.fileName}`
        : payload.fileName;
      await sftp.put(Buffer.from(payload.content, "utf8"), remotePath);

      return {
        ok: true as const,
        remotePath
      };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "SFTPアップロードに失敗しました。"
      };
    } finally {
      try {
        await sftp.end();
      } catch {
        // noop
      }
    }
  });

  ipcMain.handle("get-settings", async () => settingsCache);

  ipcMain.handle("save-settings", async (_event, payload: RendererSettingsPayload) =>
    updateSettings(payload)
  );

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
