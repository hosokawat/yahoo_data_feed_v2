import { useEffect, useMemo, useRef, useState } from "react";
import {
  ARRAY_FIELDS,
  FULL_UPDATE_FIELDS,
  REQUIRED_FIELDS,
  URL_FIELDS,
  YAHOO_FIELDS
} from "./yahooFields";

type IssueType = "error" | "warning";

type ValidationIssue = {
  type: IssueType;
  code: string;
  message: string;
  row?: number;
  col?: number;
};

type OutputTab = "local" | "sftp";

type SftpFormState = {
  host: string;
  port: string;
  username: string;
  password: string;
  remoteDirectory: string;
  savePassword: boolean;
};

const INITIAL_COL_COUNT = REQUIRED_FIELDS.length;
const INITIAL_ROW_COUNT = 30;
const FILE_SIZE_WARN_BYTES = 150 * 1024 * 1024;
const ROW_LIMIT = 300_000;
const YAHOO_REFERENCE_LINKS = [
  {
    title: "動的ディスプレイ－データフィード（商品リスト）",
    url: "https://ads-help.yahoo-net.jp/s/article/H000045740?language=ja"
  },
  {
    title: "動的ディスプレイ（入稿規定）",
    url: "https://ads-help.yahoo-net.jp/s/article/H000045743?language=ja"
  },
  {
    title: "動的ディスプレイ広告について",
    url: "https://ads-help.yahoo-net.jp/s/article/H000044698?language=ja"
  },
  {
    title: "商品リストファイルのアップロードと商品リストの更新",
    url: "https://ads-help.yahoo-net.jp/s/article/H000044346?language=ja"
  },
  {
    title: "商品リストファイルの作成（動的ディスプレイ広告）",
    url: "https://ads-help.yahoo-net.jp/s/article/H000044683?language=ja"
  }
] as const;

const createEmptyRow = (colCount: number): string[] =>
  Array.from({ length: colCount }, () => "");

const parseClipboardTable = (raw: string): string[][] => {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.length > 0);
  return lines.map((line) => line.split("\t"));
};

const normalizeCellForTsv = (value: string): string =>
  value.replace(/\r\n/g, " ").replace(/\n/g, " ").replace(/\t/g, " ");

const buildTimestampParts = (date: Date): { yyyymmdd: string; hhmmss: string } => {
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const yyyymmdd = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(
    date.getDate()
  )}`;
  const hhmmss = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(
    date.getSeconds()
  )}`;
  return { yyyymmdd, hhmmss };
};

const isSimpleValidUrl = (value: string): boolean => {
  if (value.startsWith(".")) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  if (/\s/.test(value)) return false;
  return true;
};

const App = () => {
  const [headers, setHeaders] = useState<string[]>([...REQUIRED_FIELDS]);
  const [rows, setRows] = useState<string[][]>(() =>
    Array.from({ length: INITIAL_ROW_COUNT }, () => createEmptyRow(INITIAL_COL_COUNT))
  );
  const [outputFolderPath, setOutputFolderPath] = useState<string>("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isUploadingSftp, setIsUploadingSftp] = useState<boolean>(false);
  const [activeOutputTab, setActiveOutputTab] = useState<OutputTab>("local");
  const [showIntroMessage, setShowIntroMessage] = useState<boolean>(true);
  const [isOutputPanelOpen, setIsOutputPanelOpen] = useState<boolean>(true);
  const [isReferencePanelOpen, setIsReferencePanelOpen] = useState<boolean>(true);
  const [sftp, setSftp] = useState<SftpFormState>({
    host: "",
    port: "22",
    username: "",
    password: "",
    remoteDirectory: "",
    savePassword: false
  });
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const headerSelectRefs = useRef<Map<number, HTMLSelectElement>>(new Map());

  const fieldOptions = useMemo(() => {
    const requiredSet = new Set<string>(REQUIRED_FIELDS);
    const arraySet = new Set<string>(ARRAY_FIELDS);

    return YAHOO_FIELDS.map((field, index) => {
      const requiredSuffix = requiredSet.has(field) ? " *" : "";
      const arraySuffix = arraySet.has(field) ? " []" : "";
      return {
        value: field,
        label: `${index + 1}. ${field}${requiredSuffix}${arraySuffix}`
      };
    });
  }, []);

  const fieldOptionsByColumn = useMemo(() => {
    const arraySet = new Set<string>(ARRAY_FIELDS);
    const selectedCount = new Map<string, number>();

    headers.forEach((header) => {
      const h = header.trim();
      if (!h) return;
      selectedCount.set(h, (selectedCount.get(h) ?? 0) + 1);
    });

    return headers.map((currentHeader) => {
      const options = fieldOptions.filter((option) => {
        if (option.value === currentHeader) return true;
        if (arraySet.has(option.value)) return true;
        return (selectedCount.get(option.value) ?? 0) === 0;
      });
      return [{ value: "", label: "(未設定)" }, ...options];
    });
  }, [fieldOptions, headers]);

  const setCellValue = (rowIndex: number, colIndex: number, value: string): void => {
    setRows((prev) => {
      const next = prev.map((row) => [...row]);
      while (next.length <= rowIndex) {
        next.push(createEmptyRow(headers.length));
      }
      while (next[rowIndex].length < headers.length) {
        next[rowIndex].push("");
      }
      next[rowIndex][colIndex] = value;
      return next;
    });
  };

  const setInputRef = (
    rowIndex: number,
    colIndex: number,
    element: HTMLInputElement | null
  ): void => {
    const key = `${rowIndex}:${colIndex}`;
    if (element) {
      inputRefs.current.set(key, element);
      return;
    }
    inputRefs.current.delete(key);
  };

  const focusCell = (rowIndex: number, colIndex: number): void => {
    const key = `${rowIndex}:${colIndex}`;
    const target = inputRefs.current.get(key);
    if (target) {
      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      target.focus();
      target.select();
    }
  };

  const setHeaderSelectRef = (
    colIndex: number,
    element: HTMLSelectElement | null
  ): void => {
    if (element) {
      headerSelectRefs.current.set(colIndex, element);
      return;
    }
    headerSelectRefs.current.delete(colIndex);
  };

  const focusHeaderCell = (colIndex: number): void => {
    const target = headerSelectRefs.current.get(colIndex);
    if (target) {
      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      target.focus();
    }
  };

  const jumpToIssue = (issue: ValidationIssue): void => {
    if (issue.col === undefined) return;
    const colIndex = issue.col - 1;
    if (colIndex < 0) return;

    if (issue.code === "E-001" || issue.code === "E-002") {
      focusHeaderCell(colIndex);
      return;
    }

    if (issue.row === undefined) return;
    const rowIndex = issue.row - 1;
    if (rowIndex < 0) return;
    focusCell(rowIndex, colIndex);
  };

  const setHeaderValue = (colIndex: number, value: string): void => {
    setHeaders((prev) => {
      const next = [...prev];
      next[colIndex] = value;
      return next;
    });
  };

  useEffect(() => {
    const api = (window as unknown as { feedApi?: Window["feedApi"] }).feedApi;
    if (!api) {
      setSettingsLoaded(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const settings = await api.getSettings();
        if (cancelled) return;

        if (settings.outputFolderPath) {
          setOutputFolderPath(settings.outputFolderPath);
        }

        if (Array.isArray(settings.headers) && settings.headers.length > 0) {
          const validHeaders = settings.headers.filter((header) =>
            YAHOO_FIELDS.includes(header as (typeof YAHOO_FIELDS)[number])
          );
          if (validHeaders.length > 0) {
            setHeaders(validHeaders);
            setRows((prev) =>
              prev.map((row) => {
                const next = [...row];
                while (next.length < validHeaders.length) next.push("");
                return next.slice(0, validHeaders.length);
              })
            );
          }
        }

        if (settings.sftp) {
          setSftp({
            host: settings.sftp.host ?? "",
            port: settings.sftp.port || "22",
            username: settings.sftp.username ?? "",
            password: settings.sftp.password ?? "",
            remoteDirectory: settings.sftp.remoteDirectory ?? "",
            savePassword: settings.sftp.savePassword === true
          });
        }

        if (settings.ui) {
          setShowIntroMessage(settings.ui.showIntroMessage !== false);
          setIsOutputPanelOpen(settings.ui.isOutputPanelOpen !== false);
          setIsReferencePanelOpen(settings.ui.isReferencePanelOpen !== false);
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    const api = (window as unknown as { feedApi?: Window["feedApi"] }).feedApi;
    if (!api) return;

    const timer = setTimeout(() => {
      void api.saveSettings({
        outputFolderPath,
        headers,
        ui: {
          showIntroMessage,
          isOutputPanelOpen,
          isReferencePanelOpen
        },
        sftp: {
          host: sftp.host,
          port: sftp.port,
          username: sftp.username,
          remoteDirectory: sftp.remoteDirectory,
          savePassword: sftp.savePassword,
          password: sftp.savePassword ? sftp.password : ""
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [
    settingsLoaded,
    outputFolderPath,
    headers,
    showIntroMessage,
    isOutputPanelOpen,
    isReferencePanelOpen,
    sftp
  ]);

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startCol: number
  ): void => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const matrix = parseClipboardTable(text);
    if (matrix.length === 0) return;

    const maxIncomingCols = Math.max(...matrix.map((line) => line.length));
    const requiredCols = Math.max(headers.length, startCol + maxIncomingCols);

    if (requiredCols > headers.length) {
      setHeaders((prev) => [
        ...prev,
        ...Array.from({ length: requiredCols - prev.length }, () => "")
      ]);
    }

    setRows((prev) => {
      const next = prev.map((row) => {
        const copied = [...row];
        while (copied.length < requiredCols) copied.push("");
        return copied;
      });

      while (next.length < startRow + matrix.length) {
        next.push(createEmptyRow(requiredCols));
      }

      matrix.forEach((line, rOffset) => {
        line.forEach((value, cOffset) => {
          next[startRow + rOffset][startCol + cOffset] = value;
        });
      });

      return next;
    });
  };

  const chooseOutputFolder = async (): Promise<void> => {
    const api = (window as unknown as { feedApi?: Window["feedApi"] }).feedApi;
    if (!api) {
      setStatusMessage("Electron環境で実行してください。");
      return;
    }

    const folder = await api.chooseOutputFolder();
    if (folder) {
      setOutputFolderPath(folder);
    }
  };

  const openReference = async (url: string): Promise<void> => {
    const api = (window as unknown as { feedApi?: Window["feedApi"] }).feedApi;
    if (!api) {
      setStatusMessage("Electron環境で実行してください。");
      return;
    }
    await api.openExternal(url);
  };

  const setSftpField = <K extends keyof SftpFormState>(
    key: K,
    value: SftpFormState[K]
  ): void => {
    setSftp((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const validateAndBuild = (): {
    issues: ValidationIssue[];
    content: string;
    recordCount: number;
  } => {
    const nextIssues: ValidationIssue[] = [];
    const headerToCol = new Map<string, number>();
    const duplicateHeaderCols: number[] = [];

    headers.forEach((header, colIndex) => {
      const trimmed = header.trim();
      if (!trimmed) return;

      if (!YAHOO_FIELDS.includes(trimmed as (typeof YAHOO_FIELDS)[number])) {
        nextIssues.push({
          type: "error",
          code: "E-002",
          message: `正規ヘッダーではありません: ${trimmed}`,
          row: 1,
          col: colIndex + 1
        });
        return;
      }

      if (headerToCol.has(trimmed)) {
        duplicateHeaderCols.push(colIndex);
      } else {
        headerToCol.set(trimmed, colIndex);
      }
    });

    duplicateHeaderCols.forEach((colIndex) => {
      nextIssues.push({
        type: "error",
        code: "E-002",
        message: `ヘッダーが重複しています: ${headers[colIndex]}`,
        row: 1,
        col: colIndex + 1
      });
    });

    REQUIRED_FIELDS.forEach((requiredField) => {
      if (!headerToCol.has(requiredField)) {
        nextIssues.push({
          type: "error",
          code: "E-001",
          message: `必須ヘッダーがありません: ${requiredField}`,
          row: 1
        });
      }
    });

    if (headerToCol.has("Delete")) {
      nextIssues.push({
        type: "warning",
        code: "W-005",
        message: "Delete列はv1では出力から除外されます。"
      });
    }

    const activeRows = rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => row.some((cell) => cell.trim() !== ""));

    if (activeRows.length > ROW_LIMIT) {
      nextIssues.push({
        type: "error",
        code: "E-007",
        message: `商品件数が上限を超えています（${ROW_LIMIT.toLocaleString()}件）。`
      });
    }

    const itemIdSeen = new Map<string, number>();
    const requiredCols = REQUIRED_FIELDS.map((field) => ({
      field,
      col: headerToCol.get(field)
    }));

    activeRows.forEach(({ row, rowIndex }) => {
      requiredCols.forEach(({ field, col }) => {
        if (col === undefined) return;
        const value = (row[col] ?? "").trim();
        if (!value) {
          nextIssues.push({
            type: "error",
            code: "E-003",
            message: `${field} が空欄です。`,
            row: rowIndex + 1,
            col: col + 1
          });
        }
      });

      const itemIdCol = headerToCol.get("Item ID");
      if (itemIdCol !== undefined) {
        const itemId = (row[itemIdCol] ?? "").trim();
        if (itemId) {
          if (itemIdSeen.has(itemId)) {
            nextIssues.push({
              type: "error",
              code: "E-004",
              message: `Item ID が重複しています: ${itemId}`,
              row: rowIndex + 1,
              col: itemIdCol + 1
            });
          } else {
            itemIdSeen.set(itemId, rowIndex + 1);
          }
        }
      }

      URL_FIELDS.forEach((field) => {
        const col = headerToCol.get(field);
        if (col === undefined) return;
        const value = (row[col] ?? "").trim();
        if (!value) return;

        if (value.length > 1024) {
          nextIssues.push({
            type: "error",
            code: "E-005",
            message: `${field} が1024文字を超えています。`,
            row: rowIndex + 1,
            col: col + 1
          });
          return;
        }

        if (!isSimpleValidUrl(value)) {
          nextIssues.push({
            type: "error",
            code: "E-006",
            message: `${field} は http:// または https:// で始まり、空白を含まないURLを入力してください。`,
            row: rowIndex + 1,
            col: col + 1
          });
        }
      });
    });

    const outputHeaders = FULL_UPDATE_FIELDS;
    const tsvRows: string[] = [];
    tsvRows.push(outputHeaders.join("\t"));

    let hasNumericPrice = false;
    let hasFormattedPrice = false;

    activeRows.forEach(({ row }) => {
      const line = outputHeaders.map((field) => {
        const sourceCol = headerToCol.get(field);
        const rawValue = sourceCol === undefined ? "" : row[sourceCol] ?? "";
        const normalized = normalizeCellForTsv(rawValue);

        if (field === "Price" || field === "Sale Price") {
          if (normalized.trim() !== "") hasNumericPrice = true;
        }
        if (field === "Formatted Price" || field === "Formatted Sale Price") {
          if (normalized.trim() !== "") hasFormattedPrice = true;
        }

        return normalized;
      });
      tsvRows.push(line.join("\t"));
    });

    const content = `${tsvRows.join("\n")}\n`;
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > FILE_SIZE_WARN_BYTES) {
      nextIssues.push({
        type: "warning",
        code: "W-001",
        message:
          "出力ファイルが150MBを超える見込みです。アップロード要件に注意してください。"
      });
    }

    const blankOutputFields = outputHeaders.filter((field) => {
      const sourceCol = headerToCol.get(field);
      if (sourceCol === undefined) return true;
      return activeRows.every(
        ({ row }) => ((row[sourceCol] ?? "") as string).trim().length === 0
      );
    }).length;
    if (blankOutputFields > 0) {
      nextIssues.push({
        type: "warning",
        code: "W-002",
        message: `未使用項目が ${blankOutputFields} 列あります（ヘッダーは保持して出力されます）。`
      });
    }

    if (hasNumericPrice && hasFormattedPrice) {
      nextIssues.push({
        type: "warning",
        code: "W-003",
        message:
          "Price/Sale Price と Formatted 系を同時に設定しています。表示優先順位に注意してください。"
      });
    }

    return {
      issues: nextIssues,
      content,
      recordCount: activeRows.length
    };
  };

  const exportFile = async (): Promise<void> => {
    if (!outputFolderPath) {
      setStatusMessage("出力先フォルダを選択してください。");
      return;
    }

    const api = (window as unknown as { feedApi?: Window["feedApi"] }).feedApi;
    if (!api) {
      setStatusMessage("Electron環境で実行してください。");
      return;
    }

    setIsExporting(true);
    try {
      const result = validateAndBuild();
      setIssues(result.issues);
      const errors = result.issues.filter((issue) => issue.type === "error");
      if (errors.length > 0) {
        setStatusMessage("エラーがあるため出力を中断しました。");
        return;
      }

      const now = buildTimestampParts(new Date());
      const fileName = `yahoo_feed_${now.yyyymmdd}_${now.hhmmss}_${result.recordCount}rows.tsv`;
      const saved = await api.exportFile({
        folderPath: outputFolderPath,
        fileName,
        content: result.content
      });
      if (!saved.ok) {
        setStatusMessage(`保存に失敗しました: ${saved.error}`);
        return;
      }

      setStatusMessage(`保存完了: ${saved.savedPath}`);
    } finally {
      setIsExporting(false);
    }
  };

  const runValidationCheck = (): void => {
    const result = validateAndBuild();
    setIssues(result.issues);
    const errorCount = result.issues.filter((issue) => issue.type === "error").length;
    const warningCount = result.issues.filter((issue) => issue.type === "warning").length;

    if (errorCount > 0) {
      setStatusMessage(
        `入力チェック完了: Errors ${errorCount}件 / Warnings ${warningCount}件`
      );
      return;
    }

    if (warningCount > 0) {
      setStatusMessage(`入力チェック完了: Warnings ${warningCount}件（Errors 0件）`);
      return;
    }

    setStatusMessage("入力チェック完了: 問題はありません。");
  };

  const uploadViaSftp = async (): Promise<void> => {
    const api = (window as unknown as { feedApi?: Window["feedApi"] }).feedApi;
    if (!api) {
      setStatusMessage("Electron環境で実行してください。");
      return;
    }

    const host = sftp.host.trim();
    const username = sftp.username.trim();
    const password = sftp.password;
    const remoteDirectory = sftp.remoteDirectory.trim();
    const port = Number.parseInt(sftp.port, 10);

    if (!host || !username || !password || !Number.isFinite(port) || port <= 0) {
      setStatusMessage("SFTP設定（host/port/username/password）を確認してください。");
      return;
    }

    setIsUploadingSftp(true);
    try {
      const result = validateAndBuild();
      setIssues(result.issues);
      const errors = result.issues.filter((issue) => issue.type === "error");
      if (errors.length > 0) {
        setStatusMessage("エラーがあるためSFTPアップロードを中断しました。");
        return;
      }

      const now = buildTimestampParts(new Date());
      const fileName = `yahoo_feed_${now.yyyymmdd}_${now.hhmmss}_${result.recordCount}rows.tsv`;
      const uploaded = await api.uploadViaSftp({
        host,
        port,
        username,
        password,
        remoteDirectory,
        fileName,
        content: result.content
      });

      if (!uploaded.ok) {
        setStatusMessage(`SFTPアップロード失敗: ${uploaded.error}`);
        return;
      }

      setStatusMessage(`SFTPアップロード完了: ${uploaded.remotePath}`);
    } finally {
      setIsUploadingSftp(false);
    }
  };

  const addRows = (count: number): void => {
    setRows((prev) => [
      ...prev,
      ...Array.from({ length: count }, () => createEmptyRow(headers.length))
    ]);
  };

  const addColumns = (count: number): void => {
    setHeaders((prev) => [...prev, ...Array.from({ length: count }, () => "")]);
    setRows((prev) => prev.map((row) => [...row, ...Array.from({ length: count }, () => "")]));
  };

  const removeColumn = (colIndex: number): void => {
    if (headers.length <= 1) {
      setStatusMessage("列は最低1つ必要です。");
      return;
    }

    setHeaders((prev) => prev.filter((_, index) => index !== colIndex));
    setRows((prev) =>
      prev.map((row) => row.filter((_, index) => index !== colIndex))
    );
  };

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ): void => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Enter") {
      event.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < rows.length) {
        focusCell(nextRow, colIndex);
        return;
      }

      setRows((prev) => [...prev, createEmptyRow(headers.length)]);
      setTimeout(() => {
        focusCell(nextRow, colIndex);
      }, 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const targetRow = rowIndex - 1;
      if (targetRow >= 0) {
        focusCell(targetRow, colIndex);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const targetRow = rowIndex + 1;
      if (targetRow < rows.length) {
        focusCell(targetRow, colIndex);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const targetCol = colIndex - 1;
      if (targetCol >= 0) {
        focusCell(rowIndex, targetCol);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const targetCol = colIndex + 1;
      if (targetCol < headers.length) {
        focusCell(rowIndex, targetCol);
      }
    }
  };

  const issuesByType = useMemo(
    () => ({
      error: issues.filter((issue) => issue.type === "error"),
      warning: issues.filter((issue) => issue.type === "warning")
    }),
    [issues]
  );

  const filledRowCount = useMemo(
    () => rows.filter((row) => row.some((cell) => cell.trim() !== "")).length,
    [rows]
  );

  return (
    <div className="flex h-full flex-col p-4">
      <header className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {showIntroMessage && (
          <div className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm text-slate-600">
              Google Spreadsheetから貼り付けたデータを変換し、TSV（UTF-8/LF）で出力します。
            </p>
            <button
              type="button"
              onClick={() => setShowIntroMessage(false)}
              className="rounded px-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              aria-label="説明メッセージを閉じる"
              title="閉じる"
            >
              ×
            </button>
          </div>
        )}
        <div className="mt-3 space-y-3">
          <section className="rounded-lg border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setIsOutputPanelOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              <span>データ出力機能</span>
              <span className="text-xs text-slate-600">
                {isOutputPanelOpen ? "折りたたむ ▲" : "開く ▼"}
              </span>
            </button>
            {isOutputPanelOpen && (
              <div className="space-y-3 border-t border-slate-200 p-3">
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab("local")}
                    className={`rounded px-3 py-1.5 text-sm ${
                      activeOutputTab === "local"
                        ? "bg-slate-800 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    ローカル出力
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveOutputTab("sftp")}
                    className={`rounded px-3 py-1.5 text-sm ${
                      activeOutputTab === "sftp"
                        ? "bg-slate-800 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    SFTPアップロード
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  {activeOutputTab === "local" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={chooseOutputFolder}
                        className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                      >
                        出力先フォルダを選択
                      </button>
                      <button
                        type="button"
                        onClick={exportFile}
                        disabled={isExporting}
                        className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        {isExporting ? "出力中..." : "TSVを出力"}
                      </button>
                      <div className="min-w-0 flex-1 text-xs text-slate-600">
                        出力先:{" "}
                        <span className="font-mono text-slate-800">
                          {outputFolderPath || "未選択"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        <label className="text-xs text-slate-700">
                          Host
                          <input
                            type="text"
                            value={sftp.host}
                            onChange={(event) => setSftpField("host", event.target.value)}
                            className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                            placeholder="example.com"
                          />
                        </label>
                        <label className="text-xs text-slate-700">
                          Port
                          <input
                            type="text"
                            inputMode="numeric"
                            value={sftp.port}
                            onChange={(event) => setSftpField("port", event.target.value)}
                            className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                            placeholder="22"
                          />
                        </label>
                        <label className="text-xs text-slate-700">
                          Username
                          <input
                            type="text"
                            value={sftp.username}
                            onChange={(event) =>
                              setSftpField("username", event.target.value)
                            }
                            className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                            placeholder="username"
                          />
                        </label>
                        <label className="text-xs text-slate-700">
                          Password
                          <input
                            type="password"
                            value={sftp.password}
                            onChange={(event) => setSftpField("password", event.target.value)}
                            className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                            placeholder="password"
                          />
                        </label>
                        <label className="text-xs text-slate-700 md:col-span-2 xl:col-span-2">
                          Remote Directory（任意）
                          <input
                            type="text"
                            value={sftp.remoteDirectory}
                            onChange={(event) =>
                              setSftpField("remoteDirectory", event.target.value)
                            }
                            className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                            placeholder="/incoming/yahoo"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={sftp.savePassword}
                            onChange={(event) =>
                              setSftpField("savePassword", event.target.checked)
                            }
                            className="h-4 w-4"
                          />
                          パスワードを設定ファイルに保存する
                        </label>
                        <button
                          type="button"
                          onClick={uploadViaSftp}
                          disabled={isUploadingSftp}
                          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        >
                          {isUploadingSftp ? "アップロード中..." : "SFTPアップロード"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addRows(100)}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    行を100追加
                  </button>
                  <button
                    type="button"
                    onClick={() => addColumns(1)}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    列を1追加
                  </button>
                  <button
                    type="button"
                    onClick={runValidationCheck}
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    入力チェック
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
        {statusMessage && (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {statusMessage}
          </div>
        )}
        <section className="mt-3 rounded border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => setIsReferencePanelOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            <span>Yahoo参考資料</span>
            <span className="text-xs text-slate-600">
              {isReferencePanelOpen ? "折りたたむ ▲" : "開く ▼"}
            </span>
          </button>
          {isReferencePanelOpen && (
            <div className="flex flex-wrap gap-2 border-t border-slate-200 p-3">
              {YAHOO_REFERENCE_LINKS.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => {
                    void openReference(item.url);
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  title={item.url}
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </section>
      </header>

      <section className="mb-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <h2 className="mb-1 text-sm font-semibold text-red-800">
            Errors ({issuesByType.error.length})
          </h2>
          <div className="max-h-40 overflow-auto text-xs text-red-900">
            {issuesByType.error.length === 0 ? (
              <p>なし</p>
            ) : (
              <ul className="space-y-1">
                {issuesByType.error.map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => jumpToIssue(issue)}
                      className="w-full rounded px-1 py-0.5 text-left hover:bg-red-100"
                    >
                      [{issue.code}] {issue.message}
                      {issue.row ? ` (R${issue.row}` : ""}
                      {issue.col ? `, C${issue.col}` : ""}
                      {issue.row ? ")" : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h2 className="mb-1 text-sm font-semibold text-amber-800">
            Warnings ({issuesByType.warning.length})
          </h2>
          <div className="max-h-40 overflow-auto text-xs text-amber-900">
            {issuesByType.warning.length === 0 ? (
              <p>なし</p>
            ) : (
              <ul className="space-y-1">
                {issuesByType.warning.map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`}>
                    [{issue.code}] {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="h-full overflow-auto">
          <table className="w-max min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="w-16 border border-slate-200 px-2 py-2">Row</th>
                {headers.map((header, colIndex) => (
                  <th key={`map-${colIndex}`} className="w-52 border border-slate-200 p-1">
                    <div className="relative">
                      <select
                        ref={(element) => {
                          setHeaderSelectRef(colIndex, element);
                        }}
                        value={header}
                        onChange={(event) => setHeaderValue(colIndex, event.target.value)}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 pr-7 text-xs"
                      >
                        {fieldOptionsByColumn[colIndex].map((option) => (
                          <option key={option.value || "blank"} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => removeColumn(colIndex)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        title="この列を削除"
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  <td className="border border-slate-200 bg-slate-50 px-2 py-1 text-center text-slate-600">
                    {rowIndex + 1}
                  </td>
                  {headers.map((_header, colIndex) => (
                    <td key={`cell-${rowIndex}-${colIndex}`} className="border border-slate-200 p-0">
                      <div className="relative">
                        <input
                          ref={(element) => {
                            setInputRef(rowIndex, colIndex, element);
                          }}
                          value={row[colIndex] ?? ""}
                          onChange={(event) =>
                            setCellValue(rowIndex, colIndex, event.target.value)
                          }
                          onKeyDown={(event) => handleCellKeyDown(event, rowIndex, colIndex)}
                          onPaste={(event) => handlePaste(event, rowIndex, colIndex)}
                          className="h-8 w-full min-w-52 border-0 px-2 py-1 pr-6 outline-none focus:bg-blue-50"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setCellValue(rowIndex, colIndex, "")}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[11px] text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                          title="このセルの値をクリア"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-3 rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-sm text-slate-100">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            入力可能行数: <span className="font-mono">{rows.length.toLocaleString()}</span>
          </div>
          <div>
            入力済行数: <span className="font-mono">{filledRowCount.toLocaleString()}</span>
          </div>
          <div>
            Errors件数:{" "}
            <span className="font-mono">{issuesByType.error.length.toLocaleString()}</span>
          </div>
          <div>
            Warnings件数:{" "}
            <span className="font-mono">{issuesByType.warning.length.toLocaleString()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
