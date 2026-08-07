const childProcess = require("child_process");
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { isDocxBuffer } = require("../lib/docx-validator");

const DEFAULT_MAX_FILE_BYTES = 24 * 1024 * 1024;
const ABSOLUTE_MAX_FILE_BYTES = 40 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENCY = 1;
const ABSOLUTE_MAX_CONCURRENCY = 8;
const DEFAULT_KILL_GRACE_MS = 750;
const DEFAULT_BODY_TIMEOUT_MS = 120 * 1000;
const CONVERT_ADMISSION = Symbol("convertAdmission");

const isConvertJsonRequest = (req) =>
  String(req?.method || "").toUpperCase() === "POST" &&
  String(req?.path || req?.url || "").split("?")[0] === "/api/tools/convert";

const sanitizeBaseName = (name) => {
  const raw = String(name || "converted")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (raw || "converted").slice(0, 80);
};

const findSofficeBin = () => {
  const envBin = String(process.env.SOFFICE_BIN || process.env.LIBREOFFICE_BIN || "").trim();
  const candidates = envBin ? [envBin] : ["soffice", "libreoffice"];
  for (const bin of candidates) {
    try {
      const res = childProcess.spawnSync(bin, ["--version"], {
        encoding: "utf8",
        timeout: 2500,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (res.status === 0) return bin;
    } catch {}
  }
  return "";
};

let capabilitiesCache = null;
let capabilitiesCacheAt = 0;

const getCapabilities = () => {
  const now = Date.now();
  if (capabilitiesCache && now - capabilitiesCacheAt < 30 * 1000) return capabilitiesCache;
  const officeBin = findSofficeBin();
  const officeDisabled = String(process.env.CONVERT_OFFICE_TO_PDF_DISABLED || "").trim() === "1";
  const configuredMax =
    Number.parseInt(process.env.CONVERT_MAX_FILE_BYTES || "", 10) || DEFAULT_MAX_FILE_BYTES;
  capabilitiesCache = {
    officeBin,
    officeToPdf: !!officeBin && !officeDisabled,
    pdfToDocx: false,
    maxFileBytes: Math.max(1, Math.min(ABSOLUTE_MAX_FILE_BYTES, configuredMax)),
  };
  capabilitiesCacheAt = now;
  return capabilitiesCache;
};

const createConvertError = (code, status) =>
  Object.assign(new Error(code), {
    code,
    ...(status ? { status } : {}),
  });

const createConcurrencyGate = (maxActive = DEFAULT_MAX_CONCURRENCY) => {
  const limit = Math.max(
    1,
    Math.min(ABSOLUTE_MAX_CONCURRENCY, Number.parseInt(String(maxActive), 10) || 1),
  );
  let active = 0;
  return {
    tryAcquire() {
      if (active >= limit) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      };
    },
    stats() {
      return { active, limit };
    },
  };
};

const signalProcessTree = (child, signal, opts = {}) => {
  const platform = opts.platform || process.platform;
  const pid = Number(child?.pid || 0);
  const fallback = () => {
    try {
      return child?.kill?.(signal) !== false;
    } catch {
      return false;
    }
  };

  if (platform === "win32") {
    if (!Number.isInteger(pid) || pid <= 0) return fallback();
    try {
      const spawnTreeKill = opts.spawnTreeKill || childProcess.spawn;
      const args = ["/pid", String(pid), "/T"];
      if (signal === "SIGKILL") args.push("/F");
      const killer = spawnTreeKill(
        "taskkill",
        args,
        { stdio: "ignore", windowsHide: true },
      );
      killer?.once?.("error", fallback);
      killer?.once?.("close", (code) => {
        if (code !== 0) fallback();
      });
      killer?.unref?.();
      return true;
    } catch {
      return fallback();
    }
  }

  if (Number.isInteger(pid) && pid > 0) {
    try {
      const killProcess = opts.killProcess || process.kill;
      killProcess(-pid, signal);
      return true;
    } catch {}
  }
  return fallback();
};

const runCommand = (cmd, args, opts = {}) => {
  if (opts.signal?.aborted) {
    return Promise.reject(createConvertError("CONVERT_CANCELLED", 499));
  }

  return new Promise((resolve, reject) => {
    const spawnCommand = opts.spawn || childProcess.spawn;
    let child;
    try {
      child = spawnCommand(cmd, args, {
        cwd: opts.cwd,
        env: opts.env || process.env,
        stdio: ["ignore", "pipe", "pipe"],
        // A separate POSIX process group lets cancellation terminate any
        // LibreOffice worker processes rather than only the launcher.
        detached:
          typeof opts.detached === "boolean"
            ? opts.detached
            : (opts.platform || process.platform) !== "win32",
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let stoppingError = null;
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs || 60000));
    const killGraceMs = Math.max(
      10,
      Math.min(5000, Number(opts.killGraceMs || DEFAULT_KILL_GRACE_MS)),
    );
    const postKillWaitMs = Math.max(100, Math.min(5000, Number(opts.postKillWaitMs || 1000)));
    let forceKillTimer = null;
    let forceSettleTimer = null;
    let timeoutTimer = null;

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (forceSettleTimer) clearTimeout(forceSettleTimer);
      opts.signal?.removeEventListener("abort", onAbort);
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const requestStop = (error) => {
      if (settled || stoppingError) return;
      stoppingError = error;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      signalProcessTree(child, "SIGTERM", opts);
      forceKillTimer = setTimeout(() => {
        signalProcessTree(child, "SIGKILL", opts);
      }, killGraceMs);
      // A broken child-process implementation must not hold the HTTP request
      // forever. SIGKILL has already been issued before this fallback settles.
      forceSettleTimer = setTimeout(() => {
        settle(reject, stoppingError);
      }, killGraceMs + postKillWaitMs);
    };
    const onAbort = () => requestStop(createConvertError("CONVERT_CANCELLED", 499));

    child.stdout?.on?.("data", (chunk) => {
      stdout = `${stdout}${Buffer.from(chunk).toString("utf8")}`.slice(-4000);
    });
    child.stderr?.on?.("data", (chunk) => {
      stderr = `${stderr}${Buffer.from(chunk).toString("utf8")}`.slice(-4000);
    });
    child.on("error", (err) => {
      settle(reject, stoppingError || err);
    });
    child.on("close", (code) => {
      if (stoppingError) {
        settle(reject, stoppingError);
        return;
      }
      if (code === 0) {
        settle(resolve, { stdout, stderr });
        return;
      }
      const err = Object.assign(new Error("CONVERT_FAILED"), {
        code: "CONVERT_FAILED",
        exitCode: code,
        stdout,
        stderr,
      });
      settle(reject, err);
    });

    opts.signal?.addEventListener("abort", onAbort, { once: true });
    if (opts.signal?.aborted) {
      onAbort();
      return;
    }
    timeoutTimer = setTimeout(() => {
      requestStop(createConvertError("CONVERT_TIMEOUT", 504));
    }, timeoutMs);
  });
};

const createRequestAbortController = (req, res) => {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(createConvertError("CONVERT_CANCELLED", 499));
    }
  };
  const onResponseClose = () => {
    if (!res.writableFinished) abort();
  };
  const dispose = () => {
    req.removeListener("aborted", abort);
    res.removeListener("close", onResponseClose);
    res.removeListener("finish", dispose);
  };
  req.once("aborted", abort);
  res.once("close", onResponseClose);
  res.once("finish", dispose);
  if (req.aborted || (res.destroyed && !res.writableFinished)) abort();
  return { controller, signal: controller.signal, dispose };
};

const canWriteResponse = (res) =>
  !res.destroyed && !res.writableEnded && !res.writableFinished;

const createConvertAdmissionMiddleware = (concurrencyGate, logger, options = {}) =>
  (req, res, next) => {
    const releaseSlot = concurrencyGate.tryAcquire();
    if (!releaseSlot) {
      logger.warn?.("[ToolsConvert]", { event: "busy", code: "CONVERTER_BUSY" });
      res.setHeader?.("Connection", "close");
      return res.status(503).json({
        ok: false,
        error: "CONVERTER_BUSY",
        retryable: true,
      });
    }

    let released = false;
    let handlerStarted = false;
    const parsedTimeout = Number(options.bodyTimeoutMs);
    const bodyTimeoutMs = Math.max(
      10,
      Math.min(
        5 * 60 * 1000,
        Number.isFinite(parsedTimeout) ? parsedTimeout : DEFAULT_BODY_TIMEOUT_MS,
      ),
    );
    let bodyTimer = null;
    const release = () => {
      if (released) return;
      released = true;
      if (bodyTimer) clearTimeout(bodyTimer);
      req.removeListener("aborted", releaseBeforeHandler);
      res.removeListener("close", releaseBeforeHandler);
      res.removeListener("finish", release);
      releaseSlot();
    };
    const releaseBeforeHandler = () => {
      if (!handlerStarted) release();
    };
    req.once("aborted", releaseBeforeHandler);
    res.once("close", releaseBeforeHandler);
    res.once("finish", release);
    req[CONVERT_ADMISSION] = {
      markHandlerStarted() {
        handlerStarted = true;
        if (bodyTimer) clearTimeout(bodyTimer);
      },
      release,
    };
    bodyTimer = setTimeout(() => {
      if (released || handlerStarted) return;
      logger.warn?.("[ToolsConvert]", {
        event: "upload_timeout",
        code: "CONVERT_UPLOAD_TIMEOUT",
      });
      res.setHeader?.("Connection", "close");
      const destroyRequest = () => {
        try {
          req.destroy?.();
        } catch {}
      };
      if (!canWriteResponse(res)) {
        release();
        destroyRequest();
        return;
      }
      res.once?.("finish", destroyRequest);
      try {
        res.status(408).json({
          ok: false,
          error: "CONVERT_UPLOAD_TIMEOUT",
          retryable: true,
        });
      } catch {
        release();
        destroyRequest();
      }
    }, bodyTimeoutMs);
    bodyTimer.unref?.();
    return next();
  };

const decodeBase64File = (value, maxBytes) => {
  const raw = String(value || "").trim();
  if (!raw) throw Object.assign(new Error("MISSING_FILE"), { status: 400 });
  const cleaned = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (cleaned.length > Math.ceil(maxBytes * 1.4)) {
    throw Object.assign(new Error("FILE_TOO_LARGE"), { status: 413 });
  }
  const buf = Buffer.from(cleaned, "base64");
  if (!buf.length) throw Object.assign(new Error("MISSING_FILE"), { status: 400 });
  if (buf.length > maxBytes) throw Object.assign(new Error("FILE_TOO_LARGE"), { status: 413 });
  return buf;
};

const installConvertRoutes = (app, deps = {}) => {
  const rateLimit = deps.rateLimit;
  const capabilitiesProvider = deps.getCapabilities || getCapabilities;
  const commandRunner = deps.runCommand || runCommand;
  const logger = deps.logger || console;
  const configuredConcurrency =
    deps.maxConcurrency ??
    Number.parseInt(process.env.CONVERT_MAX_CONCURRENCY || "", 10) ??
    DEFAULT_MAX_CONCURRENCY;
  const concurrencyGate =
    deps.concurrencyGate || createConcurrencyGate(configuredConcurrency || DEFAULT_MAX_CONCURRENCY);
  const configuredBodyTimeout =
    deps.bodyTimeoutMs ??
    Number.parseInt(process.env.CONVERT_BODY_TIMEOUT_MS || "", 10);
  const convertAdmission = createConvertAdmissionMiddleware(concurrencyGate, logger, {
    bodyTimeoutMs: Number.isFinite(Number(configuredBodyTimeout))
      ? Number(configuredBodyTimeout)
      : DEFAULT_BODY_TIMEOUT_MS,
  });
  const convertLimiter =
    typeof rateLimit === "function"
      ? rateLimit("tools_convert", {
          max: Number.parseInt(process.env.CONVERT_RATE_MAX || "60", 10) || 60,
          windowMs:
            Number.parseInt(process.env.CONVERT_RATE_WINDOW_MS || "", 10) || 60 * 1000,
        })
      : (_req, _res, next) => next();
  const maxFileBytes = capabilitiesProvider().maxFileBytes;
  const convertJsonParser = express.json({
    limit: Math.ceil((maxFileBytes * 4) / 3) + 1024 * 1024,
    type: "application/json",
    inflate: false,
  });
  const parseConvertJson = (req, res, next) => {
    if (!req.is?.("application/json")) {
      return res.status(415).json({ ok: false, error: "JSON_REQUIRED" });
    }
    return convertJsonParser(req, res, (error) => {
      if (!canWriteResponse(res)) return;
      if (!error) return next();
      if (error.type === "entity.too.large") {
        return res.status(413).json({ ok: false, error: "FILE_TOO_LARGE" });
      }
      if (error instanceof SyntaxError || error.type === "entity.parse.failed") {
        return res.status(400).json({ ok: false, error: "INVALID_JSON" });
      }
      if (error.type === "encoding.unsupported") {
        return res.status(415).json({
          ok: false,
          error: "CONTENT_ENCODING_UNSUPPORTED",
        });
      }
      return next(error);
    });
  };

  app.get("/api/tools/convert/capabilities", convertLimiter, (_req, res) => {
    const caps = capabilitiesProvider();
    res.json({
      ok: true,
      capabilities: {
        officeToPdf: !!caps.officeToPdf,
        pdfToDocx: !!caps.pdfToDocx,
        maxFileBytes: caps.maxFileBytes,
      },
    });
  });

  app.post(
    "/api/tools/convert",
    convertLimiter,
    convertAdmission,
    parseConvertJson,
    async (req, res) => {
      const admission = req[CONVERT_ADMISSION];
      admission?.markHandlerStarted();
      let requestAbort = null;
      let tmpDir = "";
      try {
        const caps = capabilitiesProvider();
        const toolId = String(req.body?.toolId || "").trim();
        if (toolId !== "word2pdf") {
          return res.status(400).json({ ok: false, error: "UNSUPPORTED_CONVERSION" });
        }
        if (req.body?.uploadConsent !== true) {
          return res.status(400).json({ ok: false, error: "UPLOAD_CONSENT_REQUIRED" });
        }
        if (!caps.officeToPdf || !caps.officeBin) {
          return res.status(501).json({ ok: false, error: "CONVERTER_UNAVAILABLE" });
        }

        const filename = String(req.body?.filename || "document.docx");
        if (!filename.toLowerCase().endsWith(".docx")) {
          return res.status(400).json({ ok: false, error: "DOCX_ONLY" });
        }

        requestAbort = createRequestAbortController(req, res);
        if (requestAbort.signal.aborted) {
          throw createConvertError("CONVERT_CANCELLED", 499);
        }
        const buf = decodeBase64File(req.body?.dataBase64, caps.maxFileBytes);
        if (!isDocxBuffer(buf)) {
          return res.status(415).json({ ok: false, error: "INVALID_DOCX" });
        }
        const base = sanitizeBaseName(filename);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "artigen-convert-"));
        const inputPath = path.join(tmpDir, `${crypto.randomBytes(6).toString("hex")}.docx`);
        fs.writeFileSync(inputPath, buf);
        const officeProfileUrl = pathToFileURL(path.join(tmpDir, "lo-profile")).href;
        await commandRunner(
          caps.officeBin,
          [
            `-env:UserInstallation=${officeProfileUrl}`,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            tmpDir,
            inputPath,
          ],
          {
            cwd: tmpDir,
            signal: requestAbort.signal,
            timeoutMs:
              Number.parseInt(process.env.CONVERT_TIMEOUT_MS || "", 10) || 90 * 1000,
            killGraceMs:
              Number.parseInt(process.env.CONVERT_KILL_GRACE_MS || "", 10) ||
              DEFAULT_KILL_GRACE_MS,
            spawn: deps.spawn,
            spawnTreeKill: deps.spawnTreeKill,
            killProcess: deps.killProcess,
            platform: deps.platform,
          },
        );
        if (requestAbort.signal.aborted) {
          throw createConvertError("CONVERT_CANCELLED", 499);
        }
        const pdfName = path.basename(inputPath).replace(/\.docx$/i, ".pdf");
        const pdfPath = path.join(tmpDir, pdfName);
        if (!fs.existsSync(pdfPath)) {
          return res.status(500).json({ ok: false, error: "CONVERT_FAILED" });
        }
        const out = fs.readFileSync(pdfPath);
        if (requestAbort.signal.aborted) {
          throw createConvertError("CONVERT_CANCELLED", 499);
        }
        if (out.length < 5 || out.subarray(0, 5).toString("ascii") !== "%PDF-") {
          return res.status(500).json({ ok: false, error: "CONVERT_FAILED" });
        }
        return res.json({
          ok: true,
          filename: `${base}.pdf`,
          mimeType: "application/pdf",
          dataBase64: out.toString("base64"),
        });
      } catch (err) {
        const cancelled =
          requestAbort?.signal.aborted ||
          err?.code === "CONVERT_CANCELLED" ||
          err?.name === "AbortError";
        if (cancelled) {
          logger.info?.("[ToolsConvert]", { event: "cancelled", code: "CONVERT_CANCELLED" });
          if (!canWriteResponse(res)) return;
          return res.status(499).json({
            ok: false,
            error: "CONVERT_CANCELLED",
            retryable: false,
          });
        }
        const status =
          Number(err?.status || 0) || (err?.code === "CONVERT_TIMEOUT" ? 504 : 500);
        const error =
          String(err?.message || "") === "FILE_TOO_LARGE"
            ? "FILE_TOO_LARGE"
            : String(err?.message || "") === "MISSING_FILE"
              ? "MISSING_FILE"
              : err?.code === "CONVERT_TIMEOUT"
                ? "CONVERT_TIMEOUT"
                : "CONVERT_FAILED";
        return res.status(status).json({ ok: false, error });
      } finally {
        requestAbort?.dispose();
        if (tmpDir) {
          await fs.promises.rm(tmpDir, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          }).catch(() => {
            logger.warn?.("[ToolsConvert]", {
              event: "temp_cleanup_failed",
              code: "CONVERT_TEMP_CLEANUP_FAILED",
            });
          });
        }
        admission?.release();
      }
    },
  );
};

module.exports = {
  createConcurrencyGate,
  createConvertAdmissionMiddleware,
  createRequestAbortController,
  decodeBase64File,
  installConvertRoutes,
  isConvertJsonRequest,
  isDocxBuffer,
  runCommand,
  signalProcessTree,
};
