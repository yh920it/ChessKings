const UNI = {
  wK: "♚︎",
  wQ: "♛︎",
  wR: "♜︎",
  wB: "♝︎",
  wN: "♞︎",
  wP: "♟︎",
  bK: "♚︎",
  bQ: "♛︎",
  bR: "♜︎",
  bB: "♝︎",
  bN: "♞︎",
  bP: "♟︎"
};
const FILES='abcdefgh';
let LESSONS=[];
let board=[],turn='w',selected=null,legalTargets=[],lesson=null,ply=0,userSide='w',flipped=false,lastMove=null,wrongSquare=null,correctSquare=null,lessonActive=false;
function startBoard(){const b=Array.from({length:8},()=>Array(8).fill(null));const back=['R','N','B','Q','K','B','N','R'];for(let c=0;c<8;c++){b[0][c]={t:back[c],c:'b'};b[1][c]={t:'P',c:'b'};b[6][c]={t:'P',c:'w'};b[7][c]={t:back[c],c:'w'}}return b}
function sqToRC(s){return [8-Number(s[1]),FILES.indexOf(s[0])]};function rcToSq(r,c){return FILES[c]+(8-r)}
function isInside(r,c){return r>=0&&r<8&&c>=0&&c<8}function cloneBoard(b){return b.map(row=>row.map(p=>p?{...p}:null))}
function pseudoMoves(r,c,b=board){const p=b[r][c];if(!p)return[];const out=[],opp=p.c==='w'?'b':'w',empty=(R,C)=>isInside(R,C)&&!b[R][C],enemy=(R,C)=>isInside(R,C)&&b[R][C]?.c===opp,land=(R,C)=>empty(R,C)||enemy(R,C);if(p.t==='P'){const d=p.c==='w'?-1:1,s=p.c==='w'?6:1;if(empty(r+d,c)){out.push([r+d,c]);if(r===s&&empty(r+2*d,c))out.push([r+2*d,c])}for(const dc of[-1,1])if(enemy(r+d,c+dc))out.push([r+d,c+dc])}else if(p.t==='N'){for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])if(land(r+dr,c+dc))out.push([r+dr,c+dc])}else if(p.t==='K'){for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])if(land(r+dr,c+dc))out.push([r+dr,c+dc]);if(p.c==='w'&&r===7&&c===4){if(!b[7][5]&&!b[7][6]&&b[7][7]?.t==='R')out.push([7,6]);if(!b[7][1]&&!b[7][2]&&!b[7][3]&&b[7][0]?.t==='R')out.push([7,2])}if(p.c==='b'&&r===0&&c===4){if(!b[0][5]&&!b[0][6]&&b[0][7]?.t==='R')out.push([0,6]);if(!b[0][1]&&!b[0][2]&&!b[0][3]&&b[0][0]?.t==='R')out.push([0,2])}}else{const slide=dirs=>{for(const[dr,dc]of dirs){let R=r+dr,C=c+dc;while(isInside(R,C)){if(b[R][C]){if(b[R][C].c===opp)out.push([R,C]);break}out.push([R,C]);R+=dr;C+=dc}}};if(p.t==='R'||p.t==='Q')slide([[1,0],[-1,0],[0,1],[0,-1]]);if(p.t==='B'||p.t==='Q')slide([[1,1],[1,-1],[-1,1],[-1,-1]])}return out}
function inCheck(color,b=board){let kr=-1,kc=-1;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]?.t==='K'&&b[r][c].c===color){kr=r;kc=c}const opp=color==='w'?'b':'w';for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]?.c===opp&&pseudoMoves(r,c,b).some(([R,C])=>R===kr&&C===kc))return true;return false}
function legalMoves(r,c){const p=board[r][c];if(!p||p.c!==turn)return[];return pseudoMoves(r,c).filter(([tr,tc])=>{const nb=cloneBoard(board);if(p.t==='K'&&Math.abs(tc-c)===2){if(tc===6){nb[r][5]=nb[r][7];nb[r][7]=null}else{nb[r][3]=nb[r][0];nb[r][0]=null}}nb[tr][tc]=nb[r][c];nb[r][c]=null;return !inCheck(p.c,nb)})}
function executeUci(uci){const[fr,fc]=sqToRC(uci.slice(0,2)),[tr,tc]=sqToRC(uci.slice(2,4));const p=board[fr][fc];if(!p)return false;if(p.t==='K'&&Math.abs(tc-fc)===2){if(tc===6){board[fr][5]=board[fr][7];board[fr][7]=null}else{board[fr][3]=board[fr][0];board[fr][0]=null}}board[tr][tc]=p;board[fr][fc]=null;if(p.t==='P'&&(tr===0||tr===7))board[tr][tc]={t:'Q',c:p.c};lastMove={from:[fr,fc],to:[tr,tc]};turn=turn==='w'?'b':'w';return true}
function populateOpenings(){userSide=document.getElementById('sideSelect').value;const openings=[...new Set(LESSONS.filter(l=>l.side===userSide).map(l=>l.opening))];const os=document.getElementById('openingSelect');os.innerHTML=openings.map(o=>`<option>${o}</option>`).join('');populateVariations()}
function populateVariations(){const opening=document.getElementById('openingSelect').value;const vars=LESSONS.filter(l=>l.side===document.getElementById('sideSelect').value&&l.opening===opening);document.getElementById('variationSelect').innerHTML=vars.map(l=>`<option value="${l.id}">${l.variation}</option>`).join('');previewLesson()}
function previewLesson(){const id=document.getElementById('variationSelect').value;const l=LESSONS.find(x=>x.id===id);if(!l)return;document.getElementById('ecoLabel').textContent=l.eco;document.getElementById('openingName').textContent=l.opening;document.getElementById('variationName').textContent=l.variation;document.getElementById('moveList').innerHTML=l.moves.map(m=>`<span class="move-chip">${m.san}</span>`).join('')}
function startLesson(){lesson=LESSONS.find(l=>l.id===document.getElementById('variationSelect').value);if(!lesson)return;userSide=lesson.side;flipped=userSide==='b';board=startBoard();turn='w';selected=null;legalTargets=[];ply=0;lastMove=null;lessonActive=true;document.getElementById('completeOverlay').classList.remove('show');clearFeedback();renderLabels();updatePlayerBars();render();advanceOpponentIfNeeded()}
function advanceOpponentIfNeeded(){if(!lessonActive||ply>=lesson.moves.length)return finishLesson();const expected=lesson.moves[ply].uci;const[fr,fc]=sqToRC(expected.slice(0,2));const movingColor=board[fr][fc]?.c;if(movingColor&&movingColor!==userSide){document.getElementById('statusBar').textContent='Trainer is playing '+lesson.moves[ply].san+'…';setTimeout(()=>{executeUci(expected);ply++;render();if(ply>=lesson.moves.length)finishLesson();else updateLessonPanel()},650)}else updateLessonPanel()}
function updateLessonPanel(){if(!lesson||ply>=lesson.moves.length)return;const {uci,san,explanation:why}=lesson.moves[ply];document.getElementById('moveDisplay').textContent=san;document.getElementById('explanation').textContent=why;document.getElementById('instruction').textContent='Move from '+uci.slice(0,2)+' to '+uci.slice(2,4)+'. Both squares are highlighted.';document.getElementById('statusBar').textContent='Your move: '+san;updateProgress();renderBoard()}
function updateProgress(){const total=lesson?lesson.moves.length:0;document.getElementById('progressCount').textContent=`${ply} / ${total}`;document.getElementById('progressFill').style.width=(total?ply/total*100:0)+'%';document.getElementById('moveList').innerHTML=(lesson?.moves||[]).map((m,i)=>`<span class="move-chip ${i<ply?'done':i===ply?'current':''}">${m.san}</span>`).join('')}
function onSquareClick(r,c){if(!lessonActive||ply>=lesson.moves.length)return;const expected=lesson.moves[ply].uci,[er,ec]=sqToRC(expected.slice(0,2)),[tr,tc]=sqToRC(expected.slice(2,4));const p=board[r][c];if(selected){const isLegal=legalTargets.some(([R,C])=>R===r&&C===c);if(!isLegal){if(p?.c===userSide&&p.c===turn){selected=[r,c];legalTargets=legalMoves(r,c);renderBoard()}else showWrong([r,c],'That destination is not legal for the selected piece. Try again.');return}const attempted=rcToSq(selected[0],selected[1])+rcToSq(r,c);if(attempted!==expected){showWrong([r,c],`That move is legal, but it is not the lesson move. Look for ${lesson.moves[ply].san} and try again.`);selected=null;legalTargets=[];renderBoard();return}executeUci(expected);ply++;selected=null;legalTargets=[];showGood([tr,tc],lesson.moves[ply-1].san+' is correct.');render();setTimeout(()=>advanceOpponentIfNeeded(),500);return}if(p&&p.c===userSide&&p.c===turn){if(r!==er||c!==ec){showWrong([r,c],`Try the highlighted ${expected.slice(0,2)} square first.`);return}selected=[r,c];legalTargets=legalMoves(r,c);renderBoard()}else showWrong([r,c],'Select the highlighted piece to continue.')}
function showWrong(square,text){wrongSquare=square;showFeedback('Try again',text,'bad');renderBoard();setTimeout(()=>{wrongSquare=null;renderBoard()},600)}function showGood(square,text){correctSquare=square;showFeedback('Correct move',text,'good');renderBoard();setTimeout(()=>{correctSquare=null;renderBoard()},700)}
function showFeedback(title,text,type){const c=document.getElementById('feedbackCard');c.className='feedback-card show '+type;document.getElementById('feedbackTitle').textContent=title;document.getElementById('feedbackText').textContent=text}function clearFeedback(){document.getElementById('feedbackCard').className='feedback-card'}
function finishLesson(){lessonActive=false;updateProgress();document.getElementById('statusBar').textContent='Lesson complete';document.getElementById('completeText').textContent=`You completed ${lesson.opening}: ${lesson.variation}.`;document.getElementById('completeOverlay').classList.add('show')}
function continueInGameStudy(){if(!lesson||ply<lesson.moves.length)return;const completedMoves=lesson.moves.slice(0,ply).map(m=>m.uci);const handoff={version:1,source:'Opening Academy',lessonId:lesson.id||null,opening:lesson.opening||'',variation:lesson.variation||'',eco:lesson.eco||'',userSide,completedMoves,completedSan:lesson.moves.slice(0,ply).map(m=>m.san),createdAt:new Date().toISOString()};try{sessionStorage.setItem('chessKingsStudyHandoff',JSON.stringify(handoff));window.location.href='gamestudy.html'}catch(error){console.error('Unable to continue in Game Study:',error);showFeedback('Unable to continue','The lesson position could not be transferred to Game Study.','bad')}}
function render(){renderBoard();updateProgress();updatePlayerBars()}
function renderBoard(){const el=document.getElementById('board');el.innerHTML='';let hintFrom=null,hintTo=null;if(lessonActive&&lesson&&ply<lesson.moves.length){const expected=lesson.moves[ply].uci,[fr,fc]=sqToRC(expected.slice(0,2));if(board[fr][fc]?.c===userSide){hintFrom=[fr,fc];hintTo=sqToRC(expected.slice(2,4))}}for(let row=0;row<8;row++)for(let col=0;col<8;col++){const r=flipped?7-row:row,c=flipped?7-col:col,sq=document.createElement('div');sq.className='sq '+((r+c)%2===0?'light':'dark');if(lastMove){if(r===lastMove.from[0]&&c===lastMove.from[1])sq.classList.add('last-from');if(r===lastMove.to[0]&&c===lastMove.to[1])sq.classList.add('last-to')}if(hintFrom&&r===hintFrom[0]&&c===hintFrom[1])sq.classList.add('hint-source');if(hintTo&&r===hintTo[0]&&c===hintTo[1])sq.classList.add('hint-target');if(wrongSquare&&r===wrongSquare[0]&&c===wrongSquare[1])sq.classList.add('wrong');if(correctSquare&&r===correctSquare[0]&&c===correctSquare[1])sq.classList.add('correct');const p=board[r][c];if(p){const pe=document.createElement('div');pe.className='piece '+p.c;pe.textContent=UNI[p.c+p.t];sq.appendChild(pe)}sq.addEventListener('click',()=>onSquareClick(r,c));el.appendChild(sq)}}
function renderLabels(){const ranks=flipped?'12345678':'87654321',files=flipped?'hgfedcba':'abcdefgh';document.getElementById('rankNums').innerHTML=[...ranks].map(x=>`<span>${x}</span>`).join('');document.getElementById('fileLetters').innerHTML=[...files].map(x=>`<span>${x}</span>`).join('')}
function updatePlayerBars(){const userWhite=userSide==='w';document.getElementById('bottomName').textContent='You';document.getElementById('bottomRole').textContent=userWhite?'White':'Black';document.getElementById('bottomAvatar').textContent=userWhite?'♙':'♟';document.getElementById('topName').textContent='Trainer';document.getElementById('topRole').textContent=userWhite?'Black follows the lesson line':'White follows the lesson line';document.getElementById('topAvatar').textContent=userWhite?'♟':'♙';document.getElementById('bottomDot').className='p-dot '+(lessonActive&&turn===userSide?'active':'');document.getElementById('topDot').className='p-dot '+(lessonActive&&turn!==userSide?'active':'')}
async function loadLessonData() {
  const files = [
    "./Data/openings.json",
    "./Data/defenses.json"
  ];

  try {
    const responses = await Promise.all(
      files.map(file => fetch(file, { cache: "no-store" }))
    );

    for (const response of responses) {
      if (!response.ok) {
        throw new Error(
          `${response.url} returned HTTP ${response.status}`
        );
      }
    }

    const data = await Promise.all(
      responses.map(response => response.json())
    );

    LESSONS = data.flatMap(group =>
      Array.isArray(group.lessons) ? group.lessons : []
    );

    if (!LESSONS.length) {
      throw new Error("No lessons were found in the JSON files.");
    }

    populateOpenings();
    document.getElementById("startLessonBtn").disabled = false;

    console.log("Lesson data loaded:", LESSONS);
  } catch (error) {
    console.error("Unable to load lesson data:", error);

    document.getElementById("statusBar").textContent =
      "Could not load the opening lesson files.";

    document.getElementById("startLessonBtn").disabled = true;

    showFeedback(
      "Lesson data unavailable",
      error.message,
      "bad"
    );
  }
}
document.getElementById('sideSelect').addEventListener('change',populateOpenings);document.getElementById('openingSelect').addEventListener('change',populateVariations);document.getElementById('variationSelect').addEventListener('change',previewLesson);document.getElementById('startLessonBtn').addEventListener('click',startLesson);document.getElementById('repeatLessonBtn').addEventListener('click',startLesson);document.getElementById('continueStudyBtn').addEventListener('click',continueInGameStudy);
board=startBoard();renderLabels();renderBoard();updateProgress();document.getElementById('startLessonBtn').disabled=true;loadLessonData();
