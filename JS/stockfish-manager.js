(() => {
  "use strict";

  class StockfishManager {
    constructor(options = {}) {
      this.workerPath = options.workerPath || "Engine/stockfish-18-lite-single.js";
      this.depth = Number.isInteger(options.depth) ? options.depth : 16;
      this.multiPv = Number.isInteger(options.multiPv) ? options.multiPv : 3;
      this.hashMb = Number.isInteger(options.hashMb) ? options.hashMb : 32;
      this.worker = null;
      this.ready = false;
      this.initializing = null;
      this.activeRequest = null;
      this.requestCounter = 0;
      this.cache = new Map();
      this.onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
    }

    async init() {
      if (this.ready) return;
      if (this.initializing) return this.initializing;

      this.initializing = new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error("Stockfish did not become ready in time."));
          }
        }, 20000);

        try {
          this.worker = new Worker(this.workerPath);
        } catch (error) {
          window.clearTimeout(timeout);
          settled = true;
          reject(error);
          return;
        }

        this.worker.onerror = event => {
          const error = new Error(event.message || "Stockfish worker failed to load.");
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(error);
          }
          this.onStateChange({ state: "error", error });
        };

        this.worker.onmessage = event => {
          const line = typeof event.data === "string" ? event.data : String(event.data ?? "");
          if (line === "uciok") {
            this.send(`setoption name Hash value ${this.hashMb}`);
            this.send(`setoption name MultiPV value ${this.multiPv}`);
            this.send("isready");
            return;
          }

          if (line === "readyok" && !this.ready) {
            this.ready = true;
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              resolve();
            }
            this.onStateChange({ state: "ready" });
            return;
          }

          this.handleEngineLine(line);
        };

        this.send("uci");
      }).catch(error => {
        this.initializing = null;
        throw error;
      });

      return this.initializing;
    }

    send(command) {
      if (!this.worker) throw new Error("Stockfish worker has not been created.");
      this.worker.postMessage(command);
    }

    cacheKey(fen, depth = this.depth, multiPv = this.multiPv) {
      return `${fen}|d${depth}|m${multiPv}`;
    }

    getCached(fen, options = {}) {
      const depth = options.depth || this.depth;
      const multiPv = options.multiPv || this.multiPv;
      return this.cache.get(this.cacheKey(fen, depth, multiPv)) || null;
    }

    async analyze(fen, options = {}) {
      const depth = options.depth || this.depth;
      const multiPv = options.multiPv || this.multiPv;
      const force = Boolean(options.force);
      const nodeId = options.nodeId || null;
      const cached = !force ? this.getCached(fen, { depth, multiPv }) : null;

      if (cached) {
        return { ...cached, cached: true, nodeId };
      }

      await this.init();
      await this.cancelActiveAnalysis();

      const requestId = ++this.requestCounter;
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);

      return new Promise((resolve, reject) => {
        this.activeRequest = {
          id: requestId,
          fen,
          nodeId,
          depth,
          multiPv,
          lines: new Map(),
          resolve,
          reject,
          startedAt: performance.now(),
          lastDepth: 0
        };

        this.onStateChange({ state: "analyzing", requestId, fen, nodeId, depth, multiPv });
        this.send(`go depth ${depth}`);
      });
    }

    async cancelActiveAnalysis() {
      if (!this.worker || !this.activeRequest) return;
      const request = this.activeRequest;
      if (request.cancelled) return request.cancelPromise;

      request.cancelled = true;
      request.reject(new DOMException("Analysis was stopped.", "AbortError"));
      request.cancelPromise = new Promise(resolve => { request.resolveCancellation = resolve; });
      this.send("stop");
      return request.cancelPromise;
    }

    stop() {
      return this.cancelActiveAnalysis();
    }

    destroy() {
      if (this.activeRequest) this.stop();
      if (this.worker) this.worker.terminate();
      this.worker = null;
      this.ready = false;
      this.initializing = null;
    }

    handleEngineLine(line) {
      const request = this.activeRequest;
      if (!request) return;

      if (line.startsWith("info ")) {
        if (request.cancelled) return;
        const parsed = this.parseInfoLine(line);
        if (!parsed || !parsed.pv.length || parsed.multiPv > request.multiPv) return;
        request.lines.set(parsed.multiPv, parsed);
        request.lastDepth = Math.max(request.lastDepth, parsed.depth || 0);
        this.onStateChange({
          state: "progress",
          requestId: request.id,
          fen: request.fen,
          nodeId: request.nodeId,
          depth: request.lastDepth,
          lines: this.sortedLines(request.lines)
        });
        return;
      }

      if (line.startsWith("bestmove")) {
        if (request.cancelled) {
          this.activeRequest = null;
          request.resolveCancellation?.();
          this.onStateChange({ state: "stopped", requestId: request.id, fen: request.fen, nodeId: request.nodeId });
          return;
        }

        const parts = line.trim().split(/\s+/);
        const bestMove = parts[1] && parts[1] !== "(none)" ? parts[1] : null;
        const result = {
          requestId: request.id,
          fen: request.fen,
          nodeId: request.nodeId,
          targetDepth: request.depth,
          reachedDepth: request.lastDepth,
          multiPv: request.multiPv,
          bestMove,
          ponder: parts[3] || null,
          lines: this.sortedLines(request.lines),
          elapsedMs: Math.round(performance.now() - request.startedAt),
          cached: false
        };

        this.activeRequest = null;
        this.cache.set(this.cacheKey(request.fen, request.depth, request.multiPv), result);
        request.resolve(result);
        this.onStateChange({ state: "complete", ...result });
      }
    }

    sortedLines(linesMap) {
      return [...linesMap.values()].sort((a, b) => a.multiPv - b.multiPv);
    }

    parseInfoLine(line) {
      const tokens = line.trim().split(/\s+/);
      const readNumberAfter = key => {
        const index = tokens.indexOf(key);
        if (index === -1 || index + 1 >= tokens.length) return null;
        const value = Number(tokens[index + 1]);
        return Number.isFinite(value) ? value : null;
      };

      const pvIndex = tokens.indexOf("pv");
      if (pvIndex === -1) return null;

      const scoreIndex = tokens.indexOf("score");
      let score = null;
      if (scoreIndex !== -1 && scoreIndex + 2 < tokens.length) {
        const type = tokens[scoreIndex + 1];
        const value = Number(tokens[scoreIndex + 2]);
        if ((type === "cp" || type === "mate") && Number.isFinite(value)) {
          score = {
            type,
            value,
            lowerbound: tokens.includes("lowerbound"),
            upperbound: tokens.includes("upperbound")
          };
        }
      }

      return {
        depth: readNumberAfter("depth") || 0,
        selectiveDepth: readNumberAfter("seldepth") || 0,
        multiPv: readNumberAfter("multipv") || 1,
        score,
        nodes: readNumberAfter("nodes") || 0,
        nps: readNumberAfter("nps") || 0,
        timeMs: readNumberAfter("time") || 0,
        pv: tokens.slice(pvIndex + 1)
      };
    }
  }

  window.StockfishManager = StockfishManager;
})();
