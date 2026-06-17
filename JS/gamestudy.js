(() => {
  "use strict";

  const PIECES = {
    wk: "♚︎", wq: "♛︎", wr: "♜︎", wb: "♝︎", wn: "♞︎", wp: "♟︎",
    bk: "♚︎", bq: "♛︎", br: "♜︎", bb: "♝︎", bn: "♞︎", bp: "♟︎"
  };

  const MODE_LABELS = {
    guided: "Guided Play",
    guess: "Guess the Best Move",
    free: "Free Analysis",
    practice: "Position Practice"
  };

  const START_FEN = "rn1qkbnr/ppp1pppp/3p4/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const STANDARD_START_FEN = new Chess().fen();

  const els = {};
  let game = new Chess();
  let selectedSquare = null;
  let legalMoves = [];
  let flipped = false;
  let pendingPromotion = null;
  let nodeCounter = 0;
  let engine = null;
  let analysisTimer = null;
  let analyzingNodeId = null;
  let guidedEngineBusy = false;
  let guidedRequestToken = 0;
  let pendingUserMove = null;
  let guessPreparing = false;
  let guessAttemptComplete = false;
  let guessStartNodeId = null;
  let guessRequestToken = 0;
  let practicePositions = [];
  let practiceFiltered = [];
  let practiceIndex = 0;
  let practicePreparing = false;
  let practiceAttemptComplete = false;
  let practiceStartNodeId = null;
  let practiceRequestToken = 0;
  let practiceLoaded = false;

  const study = {
    mode: "guided",
    userSide: "w",
    rootId: null,
    activeNodeId: null,
    nodes: new Map(),
    source: "New study",
    title: "Starting Position"
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    engine = new StockfishManager({
      workerPath: "Engine/stockfish-18-lite-single.js",
      depth: 16,
      multiPv: 3,
      hashMb: 32,
      onStateChange: handleEngineStateChange
    });
    bindEvents();
    if (!loadOpeningAcademyHandoff()) {
      createFreshStudy(STANDARD_START_FEN);
    }
    applyModeUI();
    loadPracticePositions();
    queueModeWork();
  }

  function loadOpeningAcademyHandoff() {
    const raw = sessionStorage.getItem("chessKingsStudyHandoff");
    if (!raw) return false;

    try {
      const handoff = JSON.parse(raw);
      if (handoff.userSide === "w" || handoff.userSide === "b") {
        study.userSide = handoff.userSide;
        els.sideSelect.value = handoff.userSide;
      }

      const moves = Array.isArray(handoff.completedMoves) ? handoff.completedMoves : [];
      let loaded = false;

      if (moves.length) {
        loaded = createStudyFromMoveSequence(moves, "academy");
      } else if (handoff.fen) {
        const candidate = new Chess();
        if (candidate.load(handoff.fen)) {
          createFreshStudy(handoff.fen);
          loaded = true;
        }
      }

      if (!loaded) return false;

      study.mode = "guided";
      els.modeSelect.value = "guided";
      study.source = handoff.source || "Opening Academy";
      study.title = [handoff.opening, handoff.variation].filter(Boolean).join(" — ") || "Opening Continuation";
      study.academyMeta = {
        lessonId: handoff.lessonId || null,
        eco: handoff.eco || "",
        opening: handoff.opening || "",
        variation: handoff.variation || ""
      };
      flipped = study.userSide === "b";
      sessionStorage.removeItem("chessKingsStudyHandoff");
      renderAll();
      return true;
    } catch (error) {
      console.warn("Unable to load Opening Academy handoff:", error);
      return false;
    }
  }

  function createStudyFromMoveSequence(uciMoves, source = "import") {
    const replay = new Chess();
    const reconstructed = [];

    for (const uci of uciMoves) {
      if (typeof uci !== "string" || uci.length < 4) return false;
      const move = replay.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4, 5) || "q"
      });
      if (!move) return false;
      reconstructed.push({ move, fen: replay.fen() });
    }

    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = null;
    guessPreparing = false;
    guessAttemptComplete = false;
    guessStartNodeId = null;
    guessRequestToken += 1;
    practicePreparing = false;
    practiceAttemptComplete = false;
    practiceStartNodeId = null;
    practiceRequestToken += 1;
    nodeCounter = 0;
    study.nodes.clear();

    const rootGame = new Chess();
    const root = createNode({ parentId: null, fen: rootGame.fen(), move: null, source: "root" });
    study.rootId = root.id;

    let parent = root;
    for (const entry of reconstructed) {
      const move = entry.move;
      const node = createNode({
        parentId: parent.id,
        fen: entry.fen,
        move: {
          uci: `${move.from}${move.to}${move.promotion || ""}`,
          san: move.san,
          from: move.from,
          to: move.to,
          color: move.color,
          flags: move.flags,
          piece: move.piece,
          captured: move.captured || null,
          promotion: move.promotion || null
        },
        source
      });
      parent.children.push(node.id);
      parent.preferredChildId = node.id;
      parent = node;
    }

    game = replay;
    study.activeNodeId = parent.id;
    study.source = source === "academy" ? "Opening Academy" : "Imported study";
    study.title = "Opening Continuation";
    flipped = study.userSide === "b";
    showToolMessage("", "");
    return true;
  }

  function cacheElements() {
    [
      "modeSelect", "sideSelect", "sideControl", "practiceControl", "practiceCategory",
      "newStudyBtn", "modeBadge", "studyBoard", "rankNums", "fileLetters",
      "statusBar", "topAvatar", "topName", "topRole", "topDot", "bottomAvatar",
      "bottomName", "bottomRole", "bottomDot", "goStartBtn", "previousBtn", "nextBtn",
      "goEndBtn", "flipBtn", "resetBtn", "studySource", "studyTitle", "studySubtitle",
      "turnValue", "moveNumberValue", "positionStatus", "variationCount", "moveTree",
      "historyEmpty", "fenInput", "loadFenBtn", "copyFenBtn", "toolMessage",
      "promotionDialog", "engineCard", "engineState", "engineMeta", "engineEvaluation",
      "engineBestMove", "engineDepth", "candidateList", "analyzeBtn", "stopAnalysisBtn",
      "engineMessage", "moveFeedbackCard", "moveFeedbackEmpty", "moveFeedbackContent",
      "feedbackMove", "feedbackRating", "feedbackLoss", "feedbackBefore", "feedbackAfter",
      "feedbackBestMove", "feedbackBestReply", "feedbackPreferredLine", "feedbackUserLine",
      "feedbackFacts", "practiceCard", "practiceProgress", "practiceDifficulty",
      "practicePrompt", "previousPositionBtn", "retryPracticeBtn", "nextPositionBtn"
    ].forEach(id => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    els.modeSelect.addEventListener("change", () => {
      const nextMode = els.modeSelect.value;
      if (nextMode === "guess") {
        guessAttemptComplete = false;
        guessPreparing = false;
        guessStartNodeId = study.activeNodeId;
        guessRequestToken += 1;
      } else if (study.mode === "guess") {
        guessAttemptComplete = false;
        guessPreparing = false;
        guessStartNodeId = null;
        guessRequestToken += 1;
      }

      if (study.mode === "practice" && nextMode !== "practice") {
        practiceRequestToken += 1;
        practicePreparing = false;
        practiceAttemptComplete = false;
        practiceStartNodeId = null;
      }

      study.mode = nextMode;
      if (nextMode === "practice") {
        startPracticeCategory(els.practiceCategory.value);
        return;
      }
      applyModeUI();
      renderAll();
      queueModeWork();
    });

    els.sideSelect.addEventListener("change", () => {
      study.userSide = els.sideSelect.value;
      flipped = study.userSide === "b";
      renderAll();
      queueModeWork();
    });

    els.newStudyBtn.addEventListener("click", () => {
      if (study.mode === "practice") loadPracticePosition(practiceIndex);
      else createFreshStudy(STANDARD_START_FEN);
    });
    els.practiceCategory.addEventListener("change", () => startPracticeCategory(els.practiceCategory.value));
    els.previousPositionBtn.addEventListener("click", () => changePracticePosition(-1));
    els.retryPracticeBtn.addEventListener("click", retryPracticePosition);
    els.nextPositionBtn.addEventListener("click", () => changePracticePosition(1));
    els.resetBtn.addEventListener("click", () => {
      if (study.mode === "practice") retryPracticePosition();
      else createFreshStudy(STANDARD_START_FEN);
    });
    els.flipBtn.addEventListener("click", () => { flipped = !flipped; renderAll(); });
    els.previousBtn.addEventListener("click", goPrevious);
    els.nextBtn.addEventListener("click", goNext);
    els.goStartBtn.addEventListener("click", goStart);
    els.goEndBtn.addEventListener("click", goEnd);
    els.loadFenBtn.addEventListener("click", loadFenFromInput);
    els.copyFenBtn.addEventListener("click", copyFen);
    els.analyzeBtn.addEventListener("click", () => {
      if (study.mode === "guess") retryGuessPosition();
      else if (study.mode === "practice") retryPracticePosition();
      else requestActiveAnalysis(true);
    });
    els.stopAnalysisBtn.addEventListener("click", () => engine.stop());

    els.promotionDialog.querySelectorAll("[data-piece]").forEach(button => {
      button.addEventListener("click", () => completePromotion(button.dataset.piece));
    });
  }

  function createFreshStudy(fen) {
    const fresh = new Chess();
    if (!fresh.load(fen)) {
      showToolMessage("Unable to create the study from that position.", "error");
      return;
    }

    game = fresh;
    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = null;
    guessPreparing = false;
    guessAttemptComplete = false;
    guessStartNodeId = null;
    guessRequestToken += 1;
    practicePreparing = false;
    practiceAttemptComplete = false;
    practiceStartNodeId = null;
    practiceRequestToken += 1;
    nodeCounter = 0;
    study.nodes.clear();

    const root = createNode({
      parentId: null,
      fen: game.fen(),
      move: null,
      source: "root"
    });

    study.rootId = root.id;
    study.activeNodeId = root.id;
    study.source = "New study";
    study.title = fen === STANDARD_START_FEN ? "Starting Position" : "Custom Position";
    flipped = study.userSide === "b";
    showToolMessage("", "");
    renderAll();
    queueModeWork();
  }

  function createNode({ parentId, fen, move, source }) {
    const node = {
      id: `node-${++nodeCounter}`,
      parentId,
      fen,
      move,
      source,
      children: [],
      preferredChildId: null,
      createdAt: Date.now(),
      analysis: null,
      feedback: null
    };
    study.nodes.set(node.id, node);
    return node;
  }

  function applyModeUI() {
    const mode = study.mode;
    els.modeBadge.textContent = MODE_LABELS[mode];
    els.practiceControl.hidden = mode !== "practice";
    els.practiceCard.hidden = mode !== "practice";
    els.sideControl.hidden = mode === "free" || mode === "practice";
    els.newStudyBtn.textContent = mode === "practice" ? "Reload Position" : "New Study";

    if (mode === "free") {
      els.topRole.textContent = "Manual control";
      els.bottomRole.textContent = "Manual control";
    }

    if (engine?.activeRequest && mode !== "free" && mode !== "guided" && mode !== "guess" && mode !== "practice") {
      guidedRequestToken += 1;
      guessRequestToken += 1;
      guidedEngineBusy = false;
      guessPreparing = false;
      engine.stop();
    }

    if (mode === "guess" && !guessStartNodeId) {
      guessAttemptComplete = false;
      guessStartNodeId = study.activeNodeId;
    }

    const enabled = mode === "free" || mode === "guess" || mode === "practice";
    els.analyzeBtn.disabled = mode === "guess"
      ? !guessAttemptComplete
      : mode === "practice"
        ? !practiceAttemptComplete
        : !enabled;
    els.analyzeBtn.textContent = mode === "guess" || mode === "practice" ? "Retry Position" : "Analyze Position";
    if (!enabled) {
      els.stopAnalysisBtn.disabled = true;
      analyzingNodeId = null;
    }
  }

  function renderAll() {
    renderLabels();
    renderBoard();
    renderPlayerBars();
    renderPositionInfo();
    renderMoveTree();
    renderMoveFeedback();
    updateNavigationButtons();
    els.fenInput.value = game.fen();
    els.studySource.textContent = study.source;
    els.studyTitle.textContent = study.title;
    const sideText = study.mode === "free" ? "Both sides" : (study.userSide === "w" ? "White" : "Black");
    renderPracticeInfo();
    els.studySubtitle.textContent = `${MODE_LABELS[study.mode]} · ${sideText}`;
    renderEnginePanel();
  }

  function renderLabels() {
    const ranks = flipped ? "12345678" : "87654321";
    const files = flipped ? "hgfedcba" : "abcdefgh";
    els.rankNums.innerHTML = [...ranks].map(rank => `<span>${rank}</span>`).join("");
    els.fileLetters.innerHTML = [...files].map(file => `<span>${file}</span>`).join("");
  }

  function renderBoard() {
    els.studyBoard.innerHTML = "";
    const board = game.board();
    const lastMove = getActiveNode().move;
    const checkSquare = getKingSquareInCheck();

    for (let displayRow = 0; displayRow < 8; displayRow++) {
      for (let displayCol = 0; displayCol < 8; displayCol++) {
        const row = flipped ? 7 - displayRow : displayRow;
        const col = flipped ? 7 - displayCol : displayCol;
        const squareName = `${"abcdefgh"[col]}${8 - row}`;
        const square = document.createElement("button");
        square.type = "button";
        square.className = `sq ${(row + col) % 2 === 0 ? "light" : "dark"}`;
        square.dataset.square = squareName;
        square.setAttribute("aria-label", squareName);

        if (selectedSquare === squareName) square.classList.add("selected-square");
        if (lastMove?.from === squareName) square.classList.add("last-from");
        if (lastMove?.to === squareName) square.classList.add("last-to");
        if (checkSquare === squareName) square.classList.add("in-check");

        const legal = legalMoves.find(move => move.to === squareName);
        if (legal) square.classList.add(legal.flags.includes("c") || legal.flags.includes("e") ? "legal-capture" : "legal-target");

        const piece = board[row][col];
        if (piece) {
          const pieceEl = document.createElement("span");
          pieceEl.className = `piece ${piece.color}`;
          pieceEl.textContent = PIECES[piece.color + piece.type];
          square.appendChild(pieceEl);
        }

        square.addEventListener("click", () => handleSquareClick(squareName));
        els.studyBoard.appendChild(square);
      }
    }
  }

  function handleSquareClick(square) {
    if (!canControlCurrentTurn()) {
      els.statusBar.textContent = study.mode === "guess"
        ? (guessPreparing ? "Stockfish is preparing the challenge…" : "This attempt is complete. Retry the position to move again.")
        : study.mode === "practice"
          ? (practicePreparing ? "Stockfish is preparing the position…" : "This attempt is complete. Retry or choose another position.")
          : (guidedEngineBusy ? "Stockfish is calculating its reply…" : "The engine controls this side.");
      return;
    }

    const piece = game.get(square);

    if (!selectedSquare) {
      if (!piece || piece.color !== game.turn()) return;
      selectSquare(square);
      return;
    }

    if (piece && piece.color === game.turn()) {
      selectSquare(square);
      return;
    }

    const matchingMoves = legalMoves.filter(move => move.to === square);
    if (!matchingMoves.length) {
      clearSelection();
      renderBoard();
      return;
    }

    const promotionMove = matchingMoves.find(move => move.flags.includes("p"));
    if (promotionMove) {
      pendingPromotion = { from: selectedSquare, to: square };
      els.promotionDialog.hidden = false;
      return;
    }

    makeMove({ from: selectedSquare, to: square });
  }

  function selectSquare(square) {
    selectedSquare = square;
    legalMoves = game.moves({ square, verbose: true });
    renderBoard();
  }

  function clearSelection() {
    selectedSquare = null;
    legalMoves = [];
  }

  function completePromotion(piece) {
    if (!pendingPromotion) return;
    els.promotionDialog.hidden = true;
    makeMove({ ...pendingPromotion, promotion: piece });
    pendingPromotion = null;
  }

  async function makeMove(moveInput) {
    if (study.mode === "guess") {
      await commitGuessMove(moveInput);
      return;
    }
    if (study.mode === "practice") {
      await commitPracticeMove(moveInput);
      return;
    }
    if (study.mode === "guided" && game.turn() === study.userSide) {
      await commitGuidedUserMove(moveInput);
      return;
    }
    commitMove(moveInput, study.mode === "free" ? "manual" : "user");
  }

  async function commitGuidedUserMove(moveInput) {
    if (guidedEngineBusy) return;
    const parent = getActiveNode();
    if (!parent || game.game_over()) return;

    const previewGame = new Chess();
    if (!previewGame.load(parent.fen)) return;
    const previewMove = previewGame.move(moveInput);
    if (!previewMove) return;

    guidedEngineBusy = true;
    pendingUserMove = moveInput;
    analyzingNodeId = parent.id;
    renderAll();

    try {
      if (!parent.analysis || parent.analysis.targetDepth < 16) {
        const beforeResult = await engine.analyze(parent.fen, {
          nodeId: parent.id,
          depth: 16,
          multiPv: 1
        });
        if (study.activeNodeId !== parent.id || game.fen() !== parent.fen) return;
        parent.analysis = enrichAnalysisResult(beforeResult);
      }

      guidedEngineBusy = false;
      analyzingNodeId = null;
      pendingUserMove = null;
      commitMove(moveInput, "user");
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Pre-move analysis failed:", error);
        showEngineError(error.message || "Stockfish could not evaluate the position before your move.");
      }
    } finally {
      if (study.activeNodeId === parent.id) {
        guidedEngineBusy = false;
        analyzingNodeId = null;
        pendingUserMove = null;
        renderAll();
      }
    }
  }


  async function commitGuessMove(moveInput) {
    if (guessPreparing || guessAttemptComplete || game.game_over()) return;

    const parent = getActiveNode();
    if (!parent || parent.id !== guessStartNodeId) return;

    const preview = new Chess();
    if (!preview.load(parent.fen) || !preview.move(moveInput)) return;

    guessPreparing = true;
    analyzingNodeId = parent.id;
    renderAll();

    try {
      if (!parent.analysis || parent.analysis.targetDepth < 16) {
        const beforeResult = await engine.analyze(parent.fen, {
          nodeId: parent.id,
          depth: 16,
          multiPv: 1
        });
        if (study.mode !== "guess" || study.activeNodeId !== parent.id || game.fen() !== parent.fen) return;
        parent.analysis = enrichAnalysisResult(beforeResult);
      }

      guessPreparing = false;
      analyzingNodeId = null;
      const child = commitMove(moveInput, "user");
      if (!child) return;

      guessPreparing = true;
      analyzingNodeId = child.id;
      renderAll();

      const afterResult = await engine.analyze(child.fen, {
        nodeId: child.id,
        depth: 16,
        multiPv: 1
      });

      if (study.mode !== "guess" || study.activeNodeId !== child.id || game.fen() !== child.fen) return;
      child.analysis = enrichAnalysisResult(afterResult);
      child.feedback = buildMoveFeedback(child);
      guessAttemptComplete = true;
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Guess the Best Move analysis failed:", error);
        showEngineError(error.message || "Stockfish could not grade this attempt.");
      }
    } finally {
      guessPreparing = false;
      analyzingNodeId = null;
      renderAll();
    }
  }

  function retryGuessPosition() {
    if (study.mode !== "guess" || !guessStartNodeId) return;
    guessRequestToken += 1;
    if (engine?.activeRequest) engine.stop();
    loadNodePosition(guessStartNodeId);
    guessAttemptComplete = false;
    guessPreparing = false;
    analyzingNodeId = null;
    renderAll();
    queueModeWork();
  }


  async function loadPracticePositions() {
    try {
      const response = await fetch("Data/study-positions.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const positions = Array.isArray(data) ? data : data.positions;
      if (!Array.isArray(positions) || !positions.length) throw new Error("No practice positions were found.");

      practicePositions = positions.filter(position => {
        const test = new Chess();
        return position?.id && position?.category && position?.fen && test.load(position.fen);
      });
      practiceLoaded = practicePositions.length > 0;
      if (!practiceLoaded) throw new Error("The practice file contains no valid positions.");

      if (study.mode === "practice") startPracticeCategory(els.practiceCategory.value);
    } catch (error) {
      practiceLoaded = false;
      console.error("Unable to load practice positions:", error);
      if (study.mode === "practice") {
        showToolMessage("Position Practice could not load Data/study-positions.json.", "error");
        renderPracticeInfo();
        renderEnginePanel();
      }
    }
  }

  function startPracticeCategory(category) {
    if (study.mode !== "practice") return;
    practiceFiltered = practicePositions.filter(position => position.category === category);
    practiceIndex = 0;

    if (!practiceLoaded || !practiceFiltered.length) {
      practiceStartNodeId = null;
      practiceAttemptComplete = false;
      practicePreparing = false;
      study.source = "Position Practice";
      study.title = "No positions available";
      applyModeUI();
      renderAll();
      showToolMessage("No valid positions are available in this category.", "error");
      return;
    }

    loadPracticePosition(0);
  }

  function loadPracticePosition(index) {
    if (study.mode !== "practice" || !practiceFiltered.length) return;
    practiceRequestToken += 1;
    if (engine?.activeRequest) engine.stop();

    practiceIndex = ((index % practiceFiltered.length) + practiceFiltered.length) % practiceFiltered.length;
    const position = practiceFiltered[practiceIndex];
    const test = new Chess();
    if (!test.load(position.fen)) {
      showToolMessage("This practice position has an invalid FEN.", "error");
      return;
    }

    study.userSide = position.side === "b" ? "b" : "w";
    els.sideSelect.value = study.userSide;
    createFreshStudy(position.fen);
    study.mode = "practice";
    els.modeSelect.value = "practice";
    study.source = position.source || "Curated Position";
    study.title = position.title || "Position Practice";
    practiceStartNodeId = study.rootId;
    practiceAttemptComplete = false;
    practicePreparing = false;
    flipped = study.userSide === "b";
    showToolMessage("", "");
    applyModeUI();
    renderAll();
    queueModeWork();
  }

  function changePracticePosition(direction) {
    if (!practiceFiltered.length) return;
    loadPracticePosition(practiceIndex + direction);
  }

  function retryPracticePosition() {
    if (study.mode !== "practice" || !practiceFiltered.length) return;
    loadPracticePosition(practiceIndex);
  }

  async function preparePracticeChallenge(nodeId) {
    if (study.mode !== "practice" || practiceAttemptComplete || practicePreparing) return;
    const node = study.nodes.get(nodeId);
    if (!node || node.id !== study.activeNodeId || node.id !== practiceStartNodeId || node.fen !== game.fen()) return;

    const token = ++practiceRequestToken;
    practicePreparing = true;
    analyzingNodeId = node.id;
    renderAll();

    try {
      const result = await engine.analyze(node.fen, {
        nodeId: node.id,
        depth: 16,
        multiPv: 1
      });
      if (token !== practiceRequestToken || study.mode !== "practice" || study.activeNodeId !== node.id) return;
      node.analysis = enrichAnalysisResult(result);
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Unable to prepare Position Practice:", error);
        showEngineError(error.message || "Stockfish could not prepare this position.");
      }
    } finally {
      if (token === practiceRequestToken) {
        practicePreparing = false;
        analyzingNodeId = null;
        renderAll();
      }
    }
  }

  async function commitPracticeMove(moveInput) {
    if (practicePreparing || practiceAttemptComplete || game.game_over()) return;
    const parent = getActiveNode();
    if (!parent || parent.id !== practiceStartNodeId || game.turn() !== study.userSide) return;

    const previewGame = new Chess();
    if (!previewGame.load(parent.fen) || !previewGame.move(moveInput)) return;

    const token = ++practiceRequestToken;
    practicePreparing = true;
    analyzingNodeId = parent.id;
    renderAll();

    try {
      if (!parent.analysis || parent.analysis.targetDepth < 16) {
        const beforeResult = await engine.analyze(parent.fen, {
          nodeId: parent.id,
          depth: 16,
          multiPv: 1
        });
        if (token !== practiceRequestToken || study.mode !== "practice" || study.activeNodeId !== parent.id) return;
        parent.analysis = enrichAnalysisResult(beforeResult);
      }

      practicePreparing = false;
      analyzingNodeId = null;
      const child = commitMove(moveInput, "user");
      if (!child) return;

      practicePreparing = true;
      analyzingNodeId = child.id;
      renderAll();

      const afterResult = await engine.analyze(child.fen, {
        nodeId: child.id,
        depth: 16,
        multiPv: 1
      });

      if (token !== practiceRequestToken || study.mode !== "practice" || study.activeNodeId !== child.id) return;
      child.analysis = enrichAnalysisResult(afterResult);
      child.feedback = buildMoveFeedback(child);
      practiceAttemptComplete = true;
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Position Practice grading failed:", error);
        showEngineError(error.message || "Stockfish could not grade this attempt.");
      }
    } finally {
      if (token === practiceRequestToken) {
        practicePreparing = false;
        analyzingNodeId = null;
        renderAll();
      }
    }
  }

  function renderPracticeInfo() {
    if (!els.practiceCard) return;
    els.practiceCard.hidden = study.mode !== "practice";
    if (study.mode !== "practice") return;

    const position = practiceFiltered[practiceIndex];
    if (!position) {
      els.practiceProgress.textContent = "No positions";
      els.practiceDifficulty.textContent = "—";
      els.practicePrompt.textContent = practiceLoaded
        ? "This category does not contain any positions."
        : "Loading practice positions…";
      els.previousPositionBtn.disabled = true;
      els.retryPracticeBtn.disabled = true;
      els.nextPositionBtn.disabled = true;
      return;
    }

    els.practiceProgress.textContent = `Position ${practiceIndex + 1} of ${practiceFiltered.length}`;
    els.practiceDifficulty.textContent = position.difficulty || "Unrated";
    els.practicePrompt.textContent = position.prompt || "Find the strongest move.";
    els.previousPositionBtn.disabled = practiceFiltered.length < 2 || practicePreparing;
    els.nextPositionBtn.disabled = practiceFiltered.length < 2 || practicePreparing;
    els.retryPracticeBtn.disabled = practicePreparing;
  }

  function commitMove(moveInput, source = "user") {
    const parent = getActiveNode();
    const move = game.move(moveInput);
    if (!move) {
      clearSelection();
      renderBoard();
      return null;
    }

    const uci = `${move.from}${move.to}${move.promotion || ""}`;
    let child = parent.children
      .map(id => study.nodes.get(id))
      .find(node => node.move?.uci === uci);

    if (!child) {
      child = createNode({
        parentId: parent.id,
        fen: game.fen(),
        move: {
          uci,
          san: move.san,
          from: move.from,
          to: move.to,
          color: move.color,
          flags: move.flags,
          piece: move.piece,
          captured: move.captured || null,
          promotion: move.promotion || null
        },
        source
      });
      parent.children.push(child.id);
    }

    // The continuation just played or revisited becomes the active study branch.
    parent.preferredChildId = child.id;
    activatePathToNode(child.id);
    study.activeNodeId = child.id;
    loadNodePosition(child.id);
    clearSelection();
    renderAll();
    queueModeWork();
    return child;
  }

  function canControlCurrentTurn() {
    if (guidedEngineBusy) return false;
    if (study.mode === "free") return true;
    if (study.mode === "guess") return !guessPreparing && !guessAttemptComplete && study.activeNodeId === guessStartNodeId;
    if (study.mode === "practice") {
      return practiceLoaded && !practicePreparing && !practiceAttemptComplete &&
        study.activeNodeId === practiceStartNodeId && game.turn() === study.userSide;
    }
    return game.turn() === study.userSide;
  }

  function getActiveNode() {
    return study.nodes.get(study.activeNodeId);
  }

  function activatePathToNode(nodeId) {
    let node = study.nodes.get(nodeId);
    while (node?.parentId) {
      const parent = study.nodes.get(node.parentId);
      if (!parent) break;
      parent.preferredChildId = node.id;
      node = parent;
    }
  }

  function loadNodePosition(nodeId, { activateBranch = true } = {}) {
    if ((study.mode === "guided" || study.mode === "guess" || study.mode === "practice") && engine?.activeRequest) {
      guidedRequestToken += 1;
      guidedEngineBusy = false;
      engine.stop();
    }
    const node = study.nodes.get(nodeId);
    if (!node) return;
    const nextGame = new Chess();
    if (!nextGame.load(node.fen)) return;
    if (activateBranch) activatePathToNode(nodeId);
    game = nextGame;
    study.activeNodeId = nodeId;
    clearSelection();
  }

  function goPrevious() {
    const node = getActiveNode();
    if (!node.parentId) return;
    loadNodePosition(node.parentId);
    renderAll();
    queueModeWork();
  }

  function goNext() {
    const node = getActiveNode();
    const childId = node.preferredChildId || node.children[0];
    if (!childId) return;
    loadNodePosition(childId);
    renderAll();
    queueModeWork();
  }

  function goStart() {
    loadNodePosition(study.rootId);
    renderAll();
    queueModeWork();
  }

  function goEnd() {
    let node = getActiveNode();
    while (node.preferredChildId || node.children[0]) {
      const childId = node.preferredChildId || node.children[0];
      node = study.nodes.get(childId);
    }
    loadNodePosition(node.id);
    renderAll();
    queueModeWork();
  }

  function updateNavigationButtons() {
    const node = getActiveNode();
    const hasNext = Boolean(node.preferredChildId || node.children[0]);
    els.previousBtn.disabled = !node.parentId;
    els.goStartBtn.disabled = !node.parentId;
    els.nextBtn.disabled = !hasNext;
    els.goEndBtn.disabled = !hasNext;
  }

  function renderPlayerBars() {
    const whiteBottom = !flipped;
    const topColor = whiteBottom ? "b" : "w";
    const bottomColor = whiteBottom ? "w" : "b";

    setPlayerBar("top", topColor);
    setPlayerBar("bottom", bottomColor);
  }

  function setPlayerBar(position, color) {
    const isUser = study.mode !== "free" && color === study.userSide;
    const name = color === "w" ? "White" : "Black";
    const active = game.turn() === color;
    const role = study.mode === "free"
      ? "Manual control"
      : study.mode === "guess" || study.mode === "practice"
        ? (isUser ? "Find the best move" : "Waiting side")
        : (isUser ? "Your side" : "Engine side");

    els[position + "Avatar"].textContent = color === "w" ? "♙" : "♟";
    els[position + "Name"].textContent = name;
    els[position + "Role"].textContent = role;
    els[position + "Dot"].classList.toggle("active", active);
  }

  function renderPositionInfo() {
    const turnName = game.turn() === "w" ? "White" : "Black";
    els.turnValue.textContent = turnName;
    els.moveNumberValue.textContent = game.move_number ? game.move_number() : getMoveNumberFromFen(game.fen());
    els.positionStatus.textContent = getPositionStatus();
    els.variationCount.textContent = countBranches();

    if (game.game_over()) {
      els.statusBar.textContent = getPositionStatus();
    } else if (study.mode === "guess" && guessPreparing) {
      els.statusBar.textContent = "Stockfish is preparing the challenge…";
    } else if (study.mode === "guess" && guessAttemptComplete) {
      els.statusBar.textContent = "Attempt complete · review the result or retry";
    } else if (study.mode === "guess") {
      els.statusBar.textContent = `${turnName} to move · find the best move`;
    } else if (study.mode === "practice" && practicePreparing) {
      els.statusBar.textContent = "Stockfish is preparing this practice position…";
    } else if (study.mode === "practice" && practiceAttemptComplete) {
      els.statusBar.textContent = "Practice attempt complete · review, retry, or continue";
    } else if (study.mode === "practice") {
      els.statusBar.textContent = `${turnName} to move · find the strongest move`;
    } else if (study.mode === "guided" && game.turn() !== study.userSide) {
      els.statusBar.textContent = guidedEngineBusy
        ? `${turnName} to move · Stockfish is calculating…`
        : `${turnName} to move · engine side`;
    } else if (!canControlCurrentTurn()) {
      els.statusBar.textContent = `${turnName} to move`;
    } else {
      els.statusBar.textContent = `${turnName} to move`;
    }
  }

  function getPositionStatus() {
    if (game.in_checkmate()) return "Checkmate";
    if (game.in_stalemate()) return "Stalemate";
    if (game.in_threefold_repetition()) return "Threefold repetition";
    if (game.insufficient_material()) return "Insufficient material";
    if (game.in_draw()) return "Draw";
    if (game.in_check()) return "Check";
    return "In progress";
  }

  function getKingSquareInCheck() {
    if (!game.in_check()) return null;
    const board = game.board();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece?.type === "k" && piece.color === game.turn()) {
          return `${"abcdefgh"[col]}${8 - row}`;
        }
      }
    }
    return null;
  }

  function getMoveNumberFromFen(fen) {
    return fen.split(" ")[5] || "1";
  }

  function countBranches() {
    let count = 0;
    study.nodes.forEach(node => {
      if (node.children.length > 1) count += node.children.length - 1;
    });
    return count;
  }

  function renderMoveTree() {
    const root = study.nodes.get(study.rootId);
    const line = [];
    let node = root;

    while (node) {
      line.push(node);
      const childId = node.preferredChildId || node.children[0];
      node = childId ? study.nodes.get(childId) : null;
    }

    const moves = line.slice(1);
    els.historyEmpty.hidden = moves.length > 0;
    els.moveTree.innerHTML = "";

    for (let i = 0; i < moves.length; i += 2) {
      const whiteNode = moves[i];
      const blackNode = moves[i + 1];
      const row = document.createElement("div");
      row.className = "move-row";

      const number = document.createElement("span");
      number.className = "move-number";
      number.textContent = `${Math.floor(i / 2) + 1}.`;
      row.appendChild(number);
      row.appendChild(createMoveButton(whiteNode));
      row.appendChild(blackNode ? createMoveButton(blackNode) : document.createElement("span"));
      els.moveTree.appendChild(row);
    }
  }

  function createMoveButton(node) {
    const parent = study.nodes.get(node.parentId);
    const wrapper = document.createElement("div");
    wrapper.className = "move-node-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "move-node";
    if (node.id === study.activeNodeId) button.classList.add("active");
    if (parent?.children.length > 1) button.classList.add("branch");
    button.textContent = node.move.san;
    button.addEventListener("click", () => {
      loadNodePosition(node.id);
      renderAll();
      queueModeWork();
    });
    wrapper.appendChild(button);

    if (parent?.children.length > 1) {
      const selector = document.createElement("select");
      selector.className = "branch-selector";
      selector.setAttribute("aria-label", `Choose continuation after ${getParentMoveLabel(parent)}`);

      parent.children.forEach(childId => {
        const child = study.nodes.get(childId);
        if (!child?.move) return;
        const option = document.createElement("option");
        option.value = child.id;
        option.textContent = child.move.san;
        option.selected = child.id === node.id;
        selector.appendChild(option);
      });

      selector.addEventListener("change", event => {
        const selectedId = event.target.value;
        parent.preferredChildId = selectedId;
        loadNodePosition(selectedId);
        renderAll();
        queueModeWork();
      });
      wrapper.appendChild(selector);
    }

    return wrapper;
  }

  function getParentMoveLabel(parent) {
    if (!parent?.move) return "the starting position";
    return parent.move.san || "this position";
  }

  function queueModeWork() {
    window.clearTimeout(analysisTimer);
    if (game.game_over()) return;

    if (study.mode === "free") {
      analysisTimer = window.setTimeout(() => requestActiveAnalysis(false), 180);
      return;
    }

    if (study.mode === "guess" && !guessAttemptComplete) {
      if (!guessStartNodeId) guessStartNodeId = study.activeNodeId;
      const node = getActiveNode();
      if (node?.id === guessStartNodeId && !node.analysis) {
        analysisTimer = window.setTimeout(() => prepareGuessChallenge(node.id), 180);
      }
      return;
    }

    if (study.mode === "practice" && !practiceAttemptComplete) {
      const node = getActiveNode();
      if (node?.id === practiceStartNodeId && !node.analysis) {
        analysisTimer = window.setTimeout(() => preparePracticeChallenge(node.id), 180);
      }
      return;
    }

    if (study.mode === "guided" && game.turn() !== study.userSide) {
      const node = getActiveNode();
      if (node && node.children.length === 0) {
        analysisTimer = window.setTimeout(() => requestGuidedReply(node.id), 180);
      }
    }
  }


  async function prepareGuessChallenge(nodeId) {
    if (study.mode !== "guess" || guessAttemptComplete || guessPreparing) return;
    const node = study.nodes.get(nodeId);
    if (!node || node.id !== study.activeNodeId || node.id !== guessStartNodeId || node.fen !== game.fen()) return;

    const token = ++guessRequestToken;
    guessPreparing = true;
    analyzingNodeId = node.id;
    renderAll();

    try {
      const result = await engine.analyze(node.fen, {
        nodeId: node.id,
        depth: 16,
        multiPv: 1
      });
      if (token !== guessRequestToken || study.mode !== "guess" || study.activeNodeId !== node.id) return;
      node.analysis = enrichAnalysisResult(result);
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Unable to prepare Guess the Best Move:", error);
        showEngineError(error.message || "Stockfish could not prepare the challenge.");
      }
    } finally {
      if (token === guessRequestToken) {
        guessPreparing = false;
        analyzingNodeId = null;
        renderAll();
      }
    }
  }

  async function requestGuidedReply(nodeId) {
    if (study.mode !== "guided" || game.game_over() || game.turn() === study.userSide) return;
    const node = study.nodes.get(nodeId);
    if (!node || node.id !== study.activeNodeId || node.fen !== game.fen() || node.children.length) return;

    const requestToken = ++guidedRequestToken;
    guidedEngineBusy = true;
    analyzingNodeId = node.id;
    renderAll();

    try {
      const result = await engine.analyze(node.fen, {
        nodeId: node.id,
        depth: 16,
        multiPv: 1
      });

      if (requestToken !== guidedRequestToken) return;
      if (study.mode !== "guided" || study.activeNodeId !== node.id || game.fen() !== node.fen) return;

      const targetNode = study.nodes.get(node.id);
      if (!targetNode) return;
      targetNode.analysis = enrichAnalysisResult(result);
      if (targetNode.source === "user") {
        targetNode.feedback = buildMoveFeedback(targetNode);
      }

      const bestMove = parseUciMove(result.bestMove);
      if (!bestMove) {
        showEngineError("Stockfish did not return a legal reply for this position.");
        return;
      }

      guidedEngineBusy = false;
      analyzingNodeId = null;
      commitMove(bestMove, "engine");
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Guided Play reply failed:", error);
        showEngineError(error.message || "Stockfish could not calculate a reply.");
      }
    } finally {
      if (requestToken === guidedRequestToken) {
        guidedEngineBusy = false;
        if (analyzingNodeId === node.id) analyzingNodeId = null;
        renderAll();
      }
    }
  }

  async function requestActiveAnalysis(force = false) {
    if (study.mode !== "free") return;
    const node = getActiveNode();
    if (!node || game.game_over()) {
      renderEnginePanel();
      return;
    }

    if (!force && node.analysis?.targetDepth >= 16) {
      renderEnginePanel();
      return;
    }

    analyzingNodeId = node.id;
    try {
      const result = await engine.analyze(node.fen, {
        nodeId: node.id,
        depth: 16,
        multiPv: 3,
        force
      });

      const targetNode = study.nodes.get(result.nodeId);
      if (!targetNode || targetNode.fen !== result.fen) return;
      targetNode.analysis = enrichAnalysisResult(result);
      if (study.activeNodeId === targetNode.id) renderEnginePanel();
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Stockfish analysis failed:", error);
        showEngineError(error.message || "Stockfish analysis failed.");
      }
    } finally {
      if (analyzingNodeId === node.id) analyzingNodeId = null;
    }
  }

  function handleEngineStateChange(event) {
    const activeNode = getActiveNode();
    const belongsToActiveNode = event.nodeId && activeNode && event.nodeId === activeNode.id && event.fen === activeNode.fen;

    if (event.state === "analyzing" && belongsToActiveNode) {
      if (study.mode === "guess" || study.mode === "practice") {
        renderEnginePanel();
        return;
      }
      els.engineCard.classList.add("is-analyzing");
      els.engineCard.classList.remove("is-error");
      els.engineState.textContent = study.mode === "guided" ? "Calculating engine reply" : "Analyzing position";
      els.engineMeta.textContent = study.mode === "guided"
        ? `Target depth ${event.depth}`
        : `Target depth ${event.depth} · ${event.multiPv} candidate moves`;
      els.stopAnalysisBtn.disabled = study.mode !== "free";
      els.analyzeBtn.disabled = true;
      return;
    }

    if (event.state === "progress" && belongsToActiveNode) {
      if (study.mode === "guess" || study.mode === "practice") return;
      renderProgressAnalysis(event.lines, event.depth);
      return;
    }

    if (event.state === "complete" && belongsToActiveNode) {
      if (study.mode === "guess" || study.mode === "practice") {
        renderEnginePanel();
        return;
      }
      els.engineCard.classList.remove("is-analyzing");
      els.stopAnalysisBtn.disabled = true;
      els.analyzeBtn.disabled = false;
      return;
    }

    if (event.state === "stopped") {
      els.engineCard.classList.remove("is-analyzing");
      els.stopAnalysisBtn.disabled = true;
      els.analyzeBtn.disabled = study.mode !== "free";
      if (belongsToActiveNode) {
        els.engineState.textContent = "Analysis stopped";
        els.engineMeta.textContent = "Press Analyze Position to restart.";
      }
    }

    if (event.state === "error") showEngineError(event.error?.message || "Stockfish failed to load.");
  }

  function enrichAnalysisResult(result) {
    const fenTurn = result.fen.split(" ")[1];
    const lines = result.lines.map(line => ({
      ...line,
      normalizedScore: normalizeScore(line.score, fenTurn),
      sanLine: convertPvToSan(result.fen, line.pv)
    }));

    return {
      ...result,
      lines,
      bestMoveSan: lines[0]?.sanLine[0] || result.bestMove || "—"
    };
  }

  function normalizeScore(score, sideToMove) {
    if (!score) return null;
    const multiplier = sideToMove === "w" ? 1 : -1;
    return { ...score, value: score.value * multiplier };
  }

  function convertPvToSan(fen, pv) {
    const lineGame = new Chess();
    if (!lineGame.load(fen)) return pv;
    const san = [];

    for (const uci of pv) {
      const parsed = parseUciMove(uci);
      if (!parsed) break;
      const move = lineGame.move(parsed);
      if (!move) break;
      san.push(move.san);
    }
    return san;
  }

  function parseUciMove(uci) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci || "");
    if (!match) return null;
    const move = { from: match[1], to: match[2] };
    if (match[3]) move.promotion = match[3];
    return move;
  }

  function buildMoveFeedback(node) {
    const parent = study.nodes.get(node.parentId);
    if (!parent?.analysis || !node.analysis || !node.move) return null;

    const beforeLine = parent.analysis.lines[0];
    const afterLine = node.analysis.lines[0];
    const beforeScore = beforeLine?.normalizedScore || null;
    const afterScore = afterLine?.normalizedScore || null;
    const mover = node.move.color;
    const forced = countLegalMoves(parent.fen) === 1;
    const lossCp = calculateEvaluationLoss(beforeScore, afterScore, mover);
    const preferredUci = parent.analysis.bestMove || beforeLine?.pv?.[0] || null;
    const isPreferredMove = preferredUci === node.move.uci;
    const classification = classifyMove({ lossCp, forced, isPreferredMove, beforeScore, afterScore, mover });
    const userLine = [node.move.san, ...(afterLine?.sanLine || [])].slice(0, 9);
    const preferredLine = (beforeLine?.sanLine || []).slice(0, 9);
    const facts = collectVerifiedFacts(node, afterLine);

    return {
      moveSan: node.move.san,
      classification,
      lossCp,
      beforeScore,
      afterScore,
      preferredMove: parent.analysis.bestMoveSan || preferredLine[0] || preferredUci || "—",
      bestReply: afterLine?.sanLine?.[0] || node.analysis.bestMoveSan || "—",
      preferredLine,
      userLine,
      facts
    };
  }

  function countLegalMoves(fen) {
    const position = new Chess();
    return position.load(fen) ? position.moves().length : 0;
  }

  function scoreToUtility(score) {
    if (!score) return null;
    if (score.type === "mate") {
      if (score.value === 0) return 0;
      const distancePenalty = Math.min(Math.abs(score.value), 100) * 10;
      return score.value > 0 ? 100000 - distancePenalty : -100000 + distancePenalty;
    }
    return score.value;
  }

  function calculateEvaluationLoss(beforeScore, afterScore, mover) {
    const before = scoreToUtility(beforeScore);
    const after = scoreToUtility(afterScore);
    if (before === null || after === null) return null;
    const raw = mover === "w" ? before - after : after - before;
    return Math.max(0, Math.round(raw));
  }

  function classifyMove({ lossCp, forced, isPreferredMove, beforeScore, afterScore, mover }) {
    if (forced) return "Forced";
    if (isPreferredMove || lossCp === null || lossCp <= 10) return "Best";

    const beforeMateForMover = beforeScore?.type === "mate" && ((mover === "w" && beforeScore.value > 0) || (mover === "b" && beforeScore.value < 0));
    const afterMateForMover = afterScore?.type === "mate" && ((mover === "w" && afterScore.value > 0) || (mover === "b" && afterScore.value < 0));
    if (beforeMateForMover && !afterMateForMover) return "Blunder";

    if (lossCp <= 30) return "Excellent";
    if (lossCp <= 60) return "Good";
    if (lossCp <= 100) return "Inaccuracy";
    if (lossCp <= 200) return "Mistake";
    return "Blunder";
  }

  function collectVerifiedFacts(node, afterLine) {
    const facts = [];
    const move = node.move;
    if (move.flags.includes("c") || move.flags.includes("e")) {
      facts.push(`The move captured a ${pieceName(move.captured)}.`);
    }
    if (move.flags.includes("k") || move.flags.includes("q")) facts.push("The move castled the king.");
    if (move.promotion) facts.push(`The pawn promoted to a ${pieceName(move.promotion)}.`);
    if (move.san.includes("#")) facts.push("The move delivered checkmate.");
    else if (move.san.includes("+")) facts.push("The move gave check.");
    const reply = afterLine?.sanLine?.[0];
    if (reply) facts.push(`Stockfish's best reply is ${reply}.`);
    return facts;
  }

  function pieceName(piece) {
    return ({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" })[piece] || "piece";
  }

  function renderMoveFeedback() {
    const active = getActiveNode();
    let node = active;
    while (node && !node.feedback) node = node.parentId ? study.nodes.get(node.parentId) : null;
    const feedback = node?.feedback;

    if (!feedback || (study.mode !== "guided" && study.mode !== "guess" && study.mode !== "practice")) {
      els.moveFeedbackEmpty.hidden = false;
      els.moveFeedbackContent.hidden = true;
      els.moveFeedbackEmpty.textContent = study.mode === "guided"
        ? "Make a move in Guided Play to receive an engine-backed rating."
        : study.mode === "guess"
          ? (guessPreparing ? "Stockfish is preparing the challenge…" : "Find the best move. Analysis will be revealed after your attempt.")
          : study.mode === "practice"
            ? (practicePreparing ? "Stockfish is preparing the position…" : "Find the strongest move. Analysis will be revealed after your attempt.")
            : "Move grading is active in Guided Play, Guess the Best Move, and Position Practice.";
      return;
    }

    els.moveFeedbackEmpty.hidden = true;
    els.moveFeedbackContent.hidden = false;
    els.feedbackMove.textContent = `Your move: ${feedback.moveSan}`;
    els.feedbackRating.textContent = feedback.classification;
    els.feedbackRating.className = `feedback-rating ${feedback.classification.toLowerCase()}`;
    els.feedbackLoss.textContent = feedback.lossCp === null ? "Evaluation change unavailable" : `${(feedback.lossCp / 100).toFixed(2)} pawn loss`;
    els.feedbackBefore.textContent = formatScore(feedback.beforeScore);
    els.feedbackAfter.textContent = formatScore(feedback.afterScore);
    els.feedbackBestMove.textContent = feedback.preferredMove;
    els.feedbackBestReply.textContent = feedback.bestReply;
    els.feedbackPreferredLine.textContent = feedback.preferredLine.join(" ") || "—";
    els.feedbackUserLine.textContent = feedback.userLine.join(" ") || "—";
    els.feedbackFacts.innerHTML = feedback.facts.length
      ? feedback.facts.map(fact => `<div class="feedback-fact">${escapeHtml(fact)}</div>`).join("")
      : '<div class="feedback-fact">No additional direct move facts were detected.</div>';
  }

  function renderEnginePanel() {
    const node = getActiveNode();
    els.engineCard.classList.remove("is-error");

    if (study.mode === "guided") {
      els.analyzeBtn.disabled = true;
      els.stopAnalysisBtn.disabled = true;

      if (guidedEngineBusy && analyzingNodeId === node?.id) {
        els.engineCard.classList.add("is-analyzing");
        els.engineState.textContent = "Calculating engine reply";
        els.engineMeta.textContent = "Stockfish is selecting the strongest move.";
        els.engineEvaluation.textContent = "…";
        els.engineBestMove.textContent = "Calculating";
        els.engineDepth.textContent = "—";
        els.candidateList.innerHTML = '<div class="engine-empty">The board will update automatically when the search completes.</div>';
        return;
      }

      els.engineCard.classList.remove("is-analyzing");
      els.engineState.textContent = game.turn() === study.userSide ? "Your turn" : "Engine turn";
      els.engineMeta.textContent = game.turn() === study.userSide
        ? "Make a move. Stockfish will reply automatically."
        : "Stockfish will calculate the strongest legal reply.";
      els.engineEvaluation.textContent = "—";
      els.engineEvaluation.classList.remove("mate");
      els.engineBestMove.textContent = "—";
      els.engineDepth.textContent = "—";
      els.candidateList.innerHTML = '<div class="engine-empty">Your latest completed move rating appears in the Move Feedback panel below.</div>';
      return;
    }

    if (study.mode === "guess") {
      els.stopAnalysisBtn.disabled = true;
      els.analyzeBtn.textContent = "Retry Position";
      els.analyzeBtn.disabled = !guessAttemptComplete;

      if (guessPreparing) {
        els.engineCard.classList.add("is-analyzing");
        els.engineState.textContent = guessAttemptComplete ? "Grading attempt" : "Preparing challenge";
        els.engineMeta.textContent = "Stockfish analysis is hidden until the attempt is complete.";
        els.engineEvaluation.textContent = "…";
        els.engineBestMove.textContent = "Hidden";
        els.engineDepth.textContent = "—";
        els.candidateList.innerHTML = '<div class="engine-empty">Do not move until the board is ready.</div>';
        return;
      }

      els.engineCard.classList.remove("is-analyzing");
      if (!guessAttemptComplete) {
        els.engineState.textContent = "Challenge ready";
        els.engineMeta.textContent = "Choose the strongest move. No hints are shown before the attempt.";
        els.engineEvaluation.textContent = "Hidden";
        els.engineEvaluation.classList.remove("mate");
        els.engineBestMove.textContent = "Hidden";
        els.engineDepth.textContent = "—";
        els.candidateList.innerHTML = '<div class="engine-empty">Make one move to reveal Stockfish’s preferred continuation.</div>';
        return;
      }

      const feedbackNode = getActiveNode();
      const parent = feedbackNode?.parentId ? study.nodes.get(feedbackNode.parentId) : null;
      const analysis = parent?.analysis;
      els.engineState.textContent = "Attempt analyzed";
      els.engineMeta.textContent = "The benchmark is now revealed.";
      els.engineDepth.textContent = String(analysis?.reachedDepth || analysis?.targetDepth || "—");
      els.engineBestMove.textContent = analysis?.bestMoveSan || "—";
      const primary = analysis?.lines?.[0];
      els.engineEvaluation.textContent = formatScore(primary?.normalizedScore);
      els.engineEvaluation.classList.toggle("mate", primary?.normalizedScore?.type === "mate");
      renderAnalysisLines(analysis?.lines || []);
      return;
    }

    if (study.mode === "practice") {
      els.stopAnalysisBtn.disabled = true;
      els.analyzeBtn.textContent = "Retry Position";
      els.analyzeBtn.disabled = !practiceAttemptComplete;

      if (!practiceLoaded || !practiceFiltered.length) {
        els.engineCard.classList.remove("is-analyzing");
        els.engineState.textContent = "Practice unavailable";
        els.engineMeta.textContent = "Data/study-positions.json has not loaded or this category is empty.";
        els.engineEvaluation.textContent = "—";
        els.engineBestMove.textContent = "—";
        els.engineDepth.textContent = "—";
        els.candidateList.innerHTML = '<div class="engine-empty">Serve the site through HTTP/HTTPS and confirm the Data folder path.</div>';
        return;
      }

      if (practicePreparing) {
        els.engineCard.classList.add("is-analyzing");
        els.engineState.textContent = practiceAttemptComplete ? "Grading attempt" : "Preparing position";
        els.engineMeta.textContent = "Stockfish analysis is hidden until the attempt is complete.";
        els.engineEvaluation.textContent = "…";
        els.engineBestMove.textContent = "Hidden";
        els.engineDepth.textContent = "—";
        els.candidateList.innerHTML = '<div class="engine-empty">The board will unlock when the practice position is ready.</div>';
        return;
      }

      els.engineCard.classList.remove("is-analyzing");
      if (!practiceAttemptComplete) {
        els.engineState.textContent = "Position ready";
        els.engineMeta.textContent = "Choose the strongest move. No engine hints are shown before your attempt.";
        els.engineEvaluation.textContent = "Hidden";
        els.engineEvaluation.classList.remove("mate");
        els.engineBestMove.textContent = "Hidden";
        els.engineDepth.textContent = "—";
        els.candidateList.innerHTML = '<div class="engine-empty">Make one move to reveal Stockfish’s preferred continuation.</div>';
        return;
      }

      const feedbackNode = getActiveNode();
      const parent = feedbackNode?.parentId ? study.nodes.get(feedbackNode.parentId) : null;
      const analysis = parent?.analysis;
      els.engineState.textContent = "Practice attempt analyzed";
      els.engineMeta.textContent = "Review the result, retry, or continue to another position.";
      els.engineDepth.textContent = String(analysis?.reachedDepth || analysis?.targetDepth || "—");
      els.engineBestMove.textContent = analysis?.bestMoveSan || "—";
      const primary = analysis?.lines?.[0];
      els.engineEvaluation.textContent = formatScore(primary?.normalizedScore);
      els.engineEvaluation.classList.toggle("mate", primary?.normalizedScore?.type === "mate");
      renderAnalysisLines(analysis?.lines || []);
      return;
    }

    if (study.mode !== "free") {
      els.engineCard.classList.remove("is-analyzing");
      els.engineState.textContent = "Analysis pending";
      els.engineMeta.textContent = "This mode will use Stockfish in a later phase.";
      els.engineEvaluation.textContent = "—";
      els.engineEvaluation.classList.remove("mate");
      els.engineBestMove.textContent = "—";
      els.engineDepth.textContent = "—";
      els.candidateList.innerHTML = '<div class="engine-empty">Engine results are not active in this mode yet.</div>';
      els.analyzeBtn.disabled = true;
      els.stopAnalysisBtn.disabled = true;
      return;
    }

    els.analyzeBtn.disabled = Boolean(engine?.activeRequest);
    els.stopAnalysisBtn.disabled = !engine?.activeRequest;

    if (game.game_over()) {
      els.engineCard.classList.remove("is-analyzing");
      els.engineState.textContent = "Game complete";
      els.engineMeta.textContent = getPositionStatus();
      els.engineEvaluation.textContent = game.in_checkmate() ? (game.turn() === "w" ? "Black wins" : "White wins") : "Draw";
      els.engineEvaluation.classList.toggle("mate", game.in_checkmate());
      els.engineBestMove.textContent = "—";
      els.engineDepth.textContent = "—";
      els.candidateList.innerHTML = '<div class="engine-empty">There is no legal continuation from this position.</div>';
      return;
    }

    if (node?.analysis) {
      renderCompletedAnalysis(node.analysis);
      return;
    }

    if (!engine?.activeRequest || analyzingNodeId !== node?.id) {
      els.engineCard.classList.remove("is-analyzing");
      els.engineState.textContent = "Waiting for analysis";
      els.engineMeta.textContent = "The active position will be analyzed automatically.";
      els.engineEvaluation.textContent = "—";
      els.engineEvaluation.classList.remove("mate");
      els.engineBestMove.textContent = "—";
      els.engineDepth.textContent = "—";
      els.candidateList.innerHTML = '<div class="engine-empty">Stockfish results will appear here.</div>';
    }
  }

  function renderProgressAnalysis(lines, depth) {
    const fen = getActiveNode().fen;
    const fenTurn = fen.split(" ")[1];
    const enriched = lines.map(line => ({
      ...line,
      normalizedScore: normalizeScore(line.score, fenTurn),
      sanLine: convertPvToSan(fen, line.pv)
    }));
    els.engineDepth.textContent = String(depth || "—");
    renderAnalysisLines(enriched);
    if (enriched[0]) {
      els.engineEvaluation.textContent = formatScore(enriched[0].normalizedScore);
      els.engineEvaluation.classList.toggle("mate", enriched[0].normalizedScore?.type === "mate");
      els.engineBestMove.textContent = enriched[0].sanLine[0] || enriched[0].pv[0] || "—";
    }
  }

  function renderCompletedAnalysis(analysis) {
    els.engineCard.classList.remove("is-analyzing");
    els.engineState.textContent = analysis.cached ? "Cached analysis" : "Analysis complete";
    els.engineMeta.textContent = `Stockfish 18 Lite · ${analysis.elapsedMs} ms`;
    els.engineDepth.textContent = String(analysis.reachedDepth || analysis.targetDepth || "—");
    els.engineBestMove.textContent = analysis.bestMoveSan || "—";
    const primary = analysis.lines[0];
    els.engineEvaluation.textContent = formatScore(primary?.normalizedScore);
    els.engineEvaluation.classList.toggle("mate", primary?.normalizedScore?.type === "mate");
    renderAnalysisLines(analysis.lines);
  }

  function renderAnalysisLines(lines) {
    if (!lines.length) {
      els.candidateList.innerHTML = '<div class="engine-empty">No engine line is available for this position.</div>';
      return;
    }

    els.candidateList.innerHTML = lines.map((line, index) => {
      const move = escapeHtml(line.sanLine[0] || line.pv[0] || "—");
      const pv = escapeHtml(line.sanLine.slice(0, 8).join(" ") || line.pv.slice(0, 8).join(" "));
      return `
        <div class="candidate-line">
          <div class="candidate-top">
            <span class="candidate-rank">${index + 1}</span>
            <span class="candidate-move">${move}</span>
            <span class="candidate-depth">Depth ${line.depth || "—"}</span>
            <span class="candidate-score">${escapeHtml(formatScore(line.normalizedScore))}</span>
          </div>
          <div class="candidate-pv">${pv}</div>
        </div>`;
    }).join("");
  }

  function formatScore(score) {
    if (!score) return "—";
    if (score.type === "mate") {
      if (score.value === 0) return "Mate";
      return score.value > 0 ? `M${Math.abs(score.value)}` : `−M${Math.abs(score.value)}`;
    }
    const pawns = score.value / 100;
    if (Math.abs(pawns) < 0.005) return "0.00";
    return `${pawns > 0 ? "+" : "−"}${Math.abs(pawns).toFixed(2)}`;
  }

  function showEngineError(message) {
    els.engineCard.classList.remove("is-analyzing");
    els.engineCard.classList.add("is-error");
    els.engineState.textContent = "Engine unavailable";
    els.engineMeta.textContent = message;
    els.engineEvaluation.textContent = "—";
    els.engineBestMove.textContent = "—";
    els.engineDepth.textContent = "—";
    els.candidateList.innerHTML = '<div class="engine-empty">Serve the project through GitHub Pages or another HTTP server. Web Workers and WASM do not run reliably from file:// URLs.</div>';
    els.analyzeBtn.disabled = false;
    els.stopAnalysisBtn.disabled = true;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadFenFromInput() {
    const fen = els.fenInput.value.trim();
    const candidate = new Chess();
    if (!candidate.load(fen)) {
      showToolMessage("That FEN is not valid.", "error");
      return;
    }
    study.source = "FEN import";
    study.title = "Custom Position";
    createFreshStudy(fen);
    study.source = "FEN import";
    study.title = "Custom Position";
    renderAll();
    queueModeWork();
    showToolMessage("Position loaded.", "success");
  }

  async function copyFen() {
    try {
      await navigator.clipboard.writeText(game.fen());
      showToolMessage("FEN copied.", "success");
    } catch (error) {
      els.fenInput.select();
      document.execCommand("copy");
      showToolMessage("FEN copied.", "success");
    }
  }

  function showToolMessage(message, type) {
    els.toolMessage.textContent = message;
    els.toolMessage.className = `tool-message${type ? ` ${type}` : ""}`;
  }
})();
