/* ============================================================================
 *  Round Robin Doubles — 복식 라운드 로빈 스케줄링 알고리즘
 * ----------------------------------------------------------------------------
 *  피클볼 수업용: 한 그룹(7~8명 등) 안에서 매 라운드 4명이 복식(2 vs 2),
 *  나머지는 대기. 모든 학생이 서로 다른 파트너/상대와 경기하도록 보장.
 *
 *  핵심 모델
 *  ─────────
 *  완전그래프 K_k 의 간선 = "파트너쌍". 한 게임 = 서로소인 간선 2개(=4명).
 *  → 모든 파트너쌍을 1회씩 쓰도록 게임으로 짝지으면 "모두가 서로 1회씩 파트너".
 *
 *  수학적 사실
 *  ───────────
 *  파트너쌍 수 = C(k,2) = k(k-1)/2. 한 게임이 쌍 2개를 소비하므로
 *  "모든 파트너 정확히 1회"가 완전히 가능하려면 C(k,2) 가 짝수,
 *  즉 k ≡ 0 또는 1 (mod 4) 여야 한다.
 *    - k=4,5,8,9,12,13 ...  → 완전 커버 가능
 *    - k=6,7,10,11 ...       → 쌍 1개는 수학적으로 게임화 불가(경고)
 *  완전 커버 시 각 선수는 정확히 (k-1) 게임을 뛰므로 출전수·바이수가 자동 균등.
 *
 *  구현
 *  ────
 *  1) 모든 파트너쌍을 "서로소인 간선 2개 = 한 게임"으로 짝짓는 최대 매칭을
 *     백트래킹으로 탐색(작은 k에서 충분히 빠름) → 게임 목록.
 *  2) 바이가 시간축에서 골고루 순환되도록 게임을 라운드 순서로 정렬.
 *
 *  브라우저(window) 와 Node(module.exports) 양쪽에서 사용 가능.
 * ==========================================================================*/
(function (root) {
  'use strict';

  // ── 결정적 PRNG (테스트 재현성) ──────────────────────────────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pairKey(i, j) { return i < j ? i + '-' + j : j + '-' + i; }

  // arr 에서 kk개 조합 모두 (작은 입력 전용)
  function kCombinations(arr, kk) {
    const res = [];
    if (kk > arr.length || kk < 0) return res;
    if (kk === 0) return [[]];
    const idx = Array.from({ length: kk }, (_, i) => i);
    while (true) {
      res.push(idx.map(i => arr[i]));
      let i = kk - 1;
      while (i >= 0 && idx[i] === arr.length - kk + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < kk; j++) idx[j] = idx[j - 1] + 1;
    }
    return res;
  }

  // ── 1) 파트너쌍 → 게임(서로소 쌍 2개) 최대 매칭 백트래킹 ──────
  //  players: 인덱스 0..k-1. 반환: [{ a:[i,j], b:[p,q] }, ...]  (a,b = 두 팀의 인덱스쌍)
  function buildGames(k, seed) {
    const rand = mulberry32(seed || 0x9e3779b9);

    // 모든 파트너쌍 (간선) 생성
    const edges = [];
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) edges.push([i, j]);
    const E = edges.length;                 // = C(k,2)
    const targetGames = Math.floor(E / 2);  // 이론상 최대 게임 수

    // 두 간선이 서로소(공유 선수 없음)인지
    function disjoint(e1, e2) {
      return e1[0] !== e2[0] && e1[0] !== e2[1] && e1[1] !== e2[0] && e1[1] !== e2[1];
    }

    const used = new Array(E).fill(false);
    let best = null;          // 최선(가장 많이 커버) 게임 목록
    let bestCount = -1;
    let nodes = 0;
    const NODE_CAP = 2_000_000;

    function firstFree() {
      for (let i = 0; i < E; i++) if (!used[i]) return i;
      return -1;
    }

    function search(gamesSoFar, coveredEdges) {
      nodes++;
      if (nodes > NODE_CAP) return;          // 안전장치
      // 완전 커버 달성 시 즉시 종료
      if (gamesSoFar.length === targetGames) { best = gamesSoFar.slice(); bestCount = gamesSoFar.length; return; }
      if (best && bestCount === targetGames) return;

      const i = firstFree();
      if (i === -1) {                         // 더 못 채움
        if (gamesSoFar.length > bestCount) { best = gamesSoFar.slice(); bestCount = gamesSoFar.length; }
        return;
      }

      // 남은 간선으로 채울 수 있는 상한으로 가지치기
      let remaining = 0;
      for (let x = 0; x < E; x++) if (!used[x]) remaining++;
      if (gamesSoFar.length + Math.floor(remaining / 2) <= bestCount) {
        if (gamesSoFar.length > bestCount && best === null) { best = gamesSoFar.slice(); bestCount = gamesSoFar.length; }
        return;
      }

      // i 와 짝지을 후보(서로소 & 미사용) 수집 후 셔플 → 다양한 상대 분포
      const partners = [];
      for (let j = i + 1; j < E; j++) {
        if (used[j]) continue;
        if (disjoint(edges[i], edges[j])) partners.push(j);
      }
      for (let s = partners.length - 1; s > 0; s--) {
        const t = Math.floor(rand() * (s + 1));
        const tmp = partners[s]; partners[s] = partners[t]; partners[t] = tmp;
      }

      used[i] = true;
      for (const j of partners) {
        used[j] = true;
        gamesSoFar.push({ a: edges[i], b: edges[j] });
        search(gamesSoFar, coveredEdges + 2);
        gamesSoFar.pop();
        used[j] = false;
        if (best && bestCount === targetGames) { used[i] = false; return; }
      }
      // i 를 짝 없이 남기는 분기(커버 불가한 쌍 처리: k≡2,3 mod4)
      used[i] = false;
      // i 를 영구히 미커버로 두고 나머지 탐색
      used[i] = true;            // 임시로 "소비됨" 표시(커버 못 한 채 건너뜀)
      search(gamesSoFar, coveredEdges);
      used[i] = false;
    }

    search([], 0);
    return { games: best || [], targetGames, totalPairs: E };
  }

  // ── 2) 바이가 골고루 순환되도록 게임을 라운드로 정렬 ──────────
  //  게임이 포함하는 4명을 출전, 나머지 대기. 직전 라운드에 쉬었던 선수를
  //  우선 출전시키도록 그리디 정렬.
  function orderRounds(games, k) {
    const remaining = games.map((g, idx) => ({
      idx,
      players: [g.a[0], g.a[1], g.b[0], g.b[1]],
      teamA: [g.a[0], g.a[1]],
      teamB: [g.b[0], g.b[1]],
    }));
    const ordered = [];
    let prevWaiting = new Set();   // 직전 라운드 대기자
    const playCount = new Array(k).fill(0);

    while (remaining.length) {
      let bestPos = 0, bestScore = -Infinity;
      for (let p = 0; p < remaining.length; p++) {
        const g = remaining[p];
        // 직전 대기자를 많이 출전시킬수록 +, 출전 누적이 적은 선수 포함 시 +
        let score = 0;
        for (const pl of g.players) {
          if (prevWaiting.has(pl)) score += 10;
          score += (-playCount[pl]);     // 적게 뛴 선수 우대
        }
        if (score > bestScore) { bestScore = score; bestPos = p; }
      }
      const chosen = remaining.splice(bestPos, 1)[0];
      chosen.players.forEach(pl => playCount[pl]++);
      const playing = new Set(chosen.players);
      const waiting = [];
      for (let pl = 0; pl < k; pl++) if (!playing.has(pl)) waiting.push(pl);
      ordered.push({ teamA: chosen.teamA, teamB: chosen.teamB, waiting });
      prevWaiting = new Set(waiting);
    }
    return ordered;
  }

  // ── 3) KDK 고정 게임수 모드 ──────────────────────────────────
  //  각 선수가 정확히(또는 ±1) target 게임만 뛰도록 그리디 생성.
  //  매 라운드 "가장 적게 뛴 4명"을 출전 → 출전수 자동 균등(차이 ≤1),
  //  팀 편성은 파트너 중복 최소 → 상대 중복 최소 순으로 선택.
  //  시간 제약 시 전체 풀리그(k-1게임) 대신 짧게 끊어 쓰는 KDK 관행에 대응.
  function countPartnerRepeats(games) {
    const m = {}; let rep = 0;
    for (const g of games) for (const e of [g.a, g.b]) {
      const key = pairKey(e[0], e[1]);
      m[key] = (m[key] || 0) + 1;
      if (m[key] === 2) rep++;
    }
    return rep;
  }

  // 무작위 재시작으로 파트너 중복이 가장 적은 스케줄 선택(중복 0이면 즉시 종료)
  function buildFixedGames(k, target, seed) {
    let best = null, bestRep = Infinity;
    for (let t = 0; t < 80; t++) {
      const r = buildFixedGamesOnce(k, target, (seed || 0) + t * 7919);
      const rep = countPartnerRepeats(r.games);
      if (rep < bestRep) { bestRep = rep; best = r; if (rep === 0) break; }
    }
    return best;
  }

  function buildFixedGamesOnce(k, target, seed) {
    const rand = mulberry32((seed || 0) ^ 0x5bd1e995);
    target = Math.max(1, Math.min(target, k - 1));

    const plays = new Array(k).fill(0);
    const partner = Array.from({ length: k }, () => new Array(k).fill(0));
    const opp = Array.from({ length: k }, () => new Array(k).fill(0));
    const byeStreak = new Array(k).fill(0);
    const games = [];

    // 4명을 2팀으로 나누는 3분할 중 파트너중복(↑가중)→상대중복 최소 선택
    function bestSplit(four) {
      const [w, x, y, z] = four;
      const splits = [
        { A: [w, x], B: [y, z] },
        { A: [w, y], B: [x, z] },
        { A: [w, z], B: [x, y] },
      ];
      let best = splits[0], score = Infinity;
      for (const s of splits) {
        const pr = partner[s.A[0]][s.A[1]] + partner[s.B[0]][s.B[1]];
        const op = opp[s.A[0]][s.B[0]] + opp[s.A[0]][s.B[1]] + opp[s.A[1]][s.B[0]] + opp[s.A[1]][s.B[1]];
        const sc = pr * 1000 + op;
        if (sc < score) { score = sc; best = s; }
      }
      return { split: best, score };
    }

    let guard = 0;
    const GUARD_CAP = k * target * 4 + 50;
    while (guard++ < GUARD_CAP) {
      // 아직 target 미달인 선수들
      const need = [];
      for (let i = 0; i < k; i++) if (plays[i] < target) need.push(i);
      if (need.length < 4) break;   // 4명을 못 채우면 종료(잔여는 target-1)

      // 출전수 균등 유지: plays asc → byeStreak desc → 무작위
      need.sort((a, b) => {
        if (plays[a] !== plays[b]) return plays[a] - plays[b];
        if (byeStreak[a] !== byeStreak[b]) return byeStreak[b] - byeStreak[a];
        return rand() - 0.5;
      });
      // 4번째로 적게 뛴 값이 임계. 그보다 적게 뛴 선수는 반드시 포함(균등 보장),
      // 임계 동률 선수들 중에서 파트너 중복이 가장 적은 조합을 선택.
      const threshold = plays[need[3]];
      const below = need.filter(p => plays[p] < threshold);     // ≤3명
      const atTh = need.filter(p => plays[p] === threshold);
      const slots = 4 - below.length;

      let bestFour = null, bestSp = null, bestScore = Infinity;
      const combos = kCombinations(atTh, slots);
      for (const combo of combos) {
        const four = below.concat(combo);
        const { split, score } = bestSplit(four);
        const jit = score + rand() * 0.01;
        if (jit < bestScore) { bestScore = jit; bestFour = four; bestSp = split; }
      }
      if (!bestFour) { bestFour = need.slice(0, 4); bestSp = bestSplit(bestFour).split; }

      games.push({ a: bestSp.A, b: bestSp.B });
      const playing = [...bestSp.A, ...bestSp.B];
      playing.forEach(p => plays[p]++);
      partner[bestSp.A[0]][bestSp.A[1]]++; partner[bestSp.A[1]][bestSp.A[0]]++;
      partner[bestSp.B[0]][bestSp.B[1]]++; partner[bestSp.B[1]][bestSp.B[0]]++;
      bestSp.A.forEach(p => bestSp.B.forEach(q => { opp[p][q]++; opp[q][p]++; }));
      const playingSet = new Set(playing);
      for (let i = 0; i < k; i++) byeStreak[i] = playingSet.has(i) ? 0 : byeStreak[i] + 1;
    }
    return { games, target };
  }

  // ── 4) 시드 균형 모드 ────────────────────────────────────────
  //  대회용. 명단 순서를 시드 순(1번이 최강)으로 보고, 아무도 유리하지 않은 대진을 만든다.
  //  동시에 맞추는 5가지:
  //    ① 출전수 완전 동일   ② 파트너 중복 0
  //    ③ 경기별 팀 전력 균형 — 1·2시드가 한 팀이 되어 상대를 짓밟는 경기를 막는다
  //    ④ 기대마진 균등 — (내 팀 전력 − 상대 팀 전력)의 누적을 전원 비슷하게
  //    ⑤ 상대 만남 횟수 균등 (같은 사람만 계속 만나지 않게)
  //  N명 전원이 같은 게임수를 뛰려면 (N × 게임수)가 4로 나누어떨어져야 한다.
  //    N≡0(mod4) → 아무 게임수나 / N≡2(mod4) → 짝수만 / N 홀수 → 4의 배수만
  //
  //  ⚠️ 왜 "파트너 전력 합 균등"을 기준에서 뺐나 (v2에서 바뀐 부분)
  //  6명 편성 2055가지를 전수 확인한 결과, 파트너 전력 합을 완벽히 균등(편차 0)하게
  //  맞추면 137가지가 나오는데 그 137가지 전부 경기 내 전력차가 최소 5였다.
  //  = 1·2시드가 한 팀이 되는 경기가 반드시 생긴다. 파트너만 보면 "상대가 얼마나 센지"를
  //  놓치기 때문이다. 그래서 파트너와 상대를 함께 보는 기대마진으로 기준을 바꿨다.

  // 요청한 게임수 이하에서 "전원 동일 출전"이 가능한 가장 큰 값
  function feasibleTarget(k, want) {
    const cap = Math.min(Math.max(1, want || (k - 1)), k - 1);
    for (let t = cap; t >= 1; t--) if ((k * t) % 4 === 0) return t;
    return 0;
  }

  function seedStrength(k, i) { return k - 1 - i; }   // 1번 시드가 가장 큼

  // 4명을 2팀으로 가르는 3가지 + 후보 게임 전체 (C(k,4) × 3)
  function candidateGames(k) {
    const out = [];
    const idx = Array.from({ length: k }, (_, i) => i);
    for (const f of kCombinations(idx, 4)) {
      out.push({ A: [f[0], f[1]], B: [f[2], f[3]] });
      out.push({ A: [f[0], f[2]], B: [f[1], f[3]] });
      out.push({ A: [f[0], f[3]], B: [f[1], f[2]] });
    }
    return out;
  }

  //  한 경기의 팀 전력차 (0이면 완벽히 팽팽한 경기)
  function teamGap(k, g) {
    return Math.abs((seedStrength(k, g.A[0]) + seedStrength(k, g.A[1]))
                  - (seedStrength(k, g.B[0]) + seedStrength(k, g.B[1])));
  }

  //  전통적인 KDK 오프닝: 1시드+막내 vs 2시드+끝에서 둘째 (강-약끼리 묶어 첫 경기를 팽팽하게)
  function classicOpener(k) {
    if (k < 4) return null;
    return { A: [0, k - 1], B: [1, k - 2] };
  }
  function isClassicOpener(k, g) {
    const o = classicOpener(k);
    if (!o) return false;
    const key = t => pairKey(t[0], t[1]);
    const a = [key(g.A), key(g.B)].sort().join('|');
    const b = [key(o.A), key(o.B)].sort().join('|');
    return a === b;
  }

  //  scoreSchedule 은 탐색 중 수십만 번 불린다. 매번 배열·객체를 새로 만들면 그 할당 비용이
  //  계산 자체보다 커서, 인원이 많을 때 탐색이 몇 바퀴 돌지도 못하고 예산을 다 쓴다.
  //  그래서 인원수별로 작업용 버퍼를 만들어 두고 0으로 되돌려 재사용한다.
  let scratch = null;
  function getScratch(k) {
    if (!scratch || scratch.k !== k) {
      scratch = {
        k,
        plays: new Int32Array(k),
        pStr: new Int32Array(k),
        oStr: new Int32Array(k),
        pairUse: new Int32Array(k * k),
        oppCount: new Int32Array(k * k),
        str: Int32Array.from({ length: k }, (_, i) => seedStrength(k, i)),
      };
    }
    const s = scratch;
    s.plays.fill(0); s.pStr.fill(0); s.oStr.fill(0);
    s.pairUse.fill(0); s.oppCount.fill(0);
    return s;
  }

  function scoreSchedule(games, k, target) {
    const S = getScratch(k);
    const plays = S.plays, pStr = S.pStr, oStr = S.oStr;
    const pairUse = S.pairUse, oppCount = S.oppCount, str = S.str;
    let gapSum = 0, gapMax = 0, hasOpener = false, topTogether = 0, repeats = 0;
    for (const g of games) {
      const a0 = g.A[0], a1 = g.A[1], b0 = g.B[0], b1 = g.B[1];
      //  1시드와 2시드가 한 팀이 되는 경기는 상대가 누구든 일방적이 된다. 따로 세서 강하게 막는다.
      if ((a0 === 0 && a1 === 1) || (a0 === 1 && a1 === 0)) topTogether++;
      if ((b0 === 0 && b1 === 1) || (b0 === 1 && b1 === 0)) topTogether++;

      //  파트너쌍은 (작은쪽, 큰쪽) 한 칸에만 센다. 2회째부터가 중복.
      if (++pairUse[a0 < a1 ? a0 * k + a1 : a1 * k + a0] > 1) repeats++;
      if (++pairUse[b0 < b1 ? b0 * k + b1 : b1 * k + b0] > 1) repeats++;
      pStr[a0] += str[a1]; pStr[a1] += str[a0];
      pStr[b0] += str[b1]; pStr[b1] += str[b0];

      for (const p of g.A) for (const q of g.B) {
        oStr[p] += str[q]; oStr[q] += str[p];
        oppCount[p * k + q]++; oppCount[q * k + p]++;
      }
      plays[a0]++; plays[a1]++; plays[b0]++; plays[b1]++;

      const gap = Math.abs((str[a0] + str[a1]) - (str[b0] + str[b1]));
      gapSum += gap;
      if (gap > gapMax) gapMax = gap;
      if (!hasOpener && isClassicOpener(k, g)) hasOpener = true;
    }

    let playErr = 0;
    for (let i = 0; i < k; i++) playErr += Math.abs(plays[i] - target);

    const spread = a => {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
      return mx - mn;
    };
    let maxMeet = 0, oppMin = Infinity, oppSum = 0, oppSq = 0, oppN = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const v = oppCount[i * k + j];
      oppN++; oppSum += v; oppSq += v * v;
      if (v > maxMeet) maxMeet = v;
      if (v < oppMin) oppMin = v;
    }
    const oppMean = oppSum / oppN;
    const oppVar = oppSq - 2 * oppMean * oppSum + oppN * oppMean * oppMean;
    const oppSpread = maxMeet - oppMin;

    //  기대마진 = 내가 뛴 경기에서 (우리 팀 전력 − 상대 팀 전력)의 누적.
    const margin = new Array(k);
    for (let i = 0; i < k; i++) margin[i] = plays[i] * str[i] + pStr[i] - oStr[i];
    const marginSpread = spread(margin);

    //  ⚠️ 마진을 그냥 균등하게 맞추면 안 된다.
    //  강한 선수는 어떤 편성에서든 마진이 높게 나오는 게 정상이다(실력이 좋으니까).
    //  그걸 0으로 눌러버리면 강자에게만 약한 파트너·강한 상대를 몰아주는 핸디캡이 되어버린다.
    //  그래서 "아무 편견 없이 뽑았을 때의 기대 마진"을 기준선으로 두고, 거기서 얼마나
    //  벗어났는지(=편성 때문에 생긴 유불리)만 균등하게 맞춘다.
    //    기준선 = 출전수 × (내 점수 − 나머지 선수 평균)
    //    편성유불리(edge) = 실제 마진 − 기준선   → 0이면 편성이 나에게 유리하지도 불리하지도 않음
    let sumStr = 0;
    for (let i = 0; i < k; i++) sumStr += str[i];
    const edge = new Array(k);
    for (let i = 0; i < k; i++) {
      const si = str[i];
      const others = k > 1 ? (sumStr - si) / (k - 1) : 0;
      edge[i] = margin[i] - plays[i] * (si - others);
    }
    const edgeSpread = spread(edge);

    //  출전수 동일과 파트너 중복 0은 이 모드의 전제 조건이라 다른 항목이 절대 살 수 없는
    //  값으로 매긴다. (예전엔 중복 벌점이 4000이라, 균형을 조금 얻으려고 중복을 사버렸다)
    const cost = playErr * 1000000
      + repeats * 50000
      + topTogether * 20000     // 1·2시드 한 팀 금지 (다른 이득으로는 절대 살 수 없는 값)
      + gapMax * 900            // 일방적인 경기를 하나도 만들지 않기
      + gapSum * 300            // 전체적으로 팽팽하게
      + oppSpread * 500         // 상대 만남 균등
      //  경기를 팽팽하게만 맞추면 1시드는 4경기 내내 2시드만 상대하게 된다(전력이 비슷하니까).
      //  그건 팽팽하긴 해도 로테이션이 아니므로, 같은 상대를 4번 이상 만나는 것도 금지 수준으로 막는다.
      + Math.max(0, maxMeet - 3) * 20000
      //  편성 유불리는 "경기를 팽팽하게"와 정면으로 충돌한다.
      //  모든 경기를 팽팽하게 만들면 강자는 약한 파트너를 받게 되어 기대 마진이 눌리기 때문이다.
      //  실력차가 있는 이상 둘 다 0으로 만드는 편성은 존재하지 않으므로, 여기서는
      //  "팽팽한 경기"를 우선하고 편성 유불리는 동점 상황을 가르는 용도로만 쓴다.
      + edgeSpread * 40
      + oppVar * 40
      //  전통 KDK 1경기 = 1시드+막내 vs 2시드+차하위. 이 경기가 편성 안에 있으면 첫 경기로 올린다.
      //  경기 하나 정도 더 기울어지는 걸 감수하고서라도 확보할 만큼 중요하게 본다.
      + (hasOpener ? 0 : 2500);
    //  ⚠️ plays/pStr/oStr/oppCount 는 재사용 버퍼다. 다음 호출 때 덮어써지므로 반드시 복사해서 낸다.
    const oppMatrix = [];
    for (let i = 0; i < k; i++) oppMatrix.push(Array.from(oppCount.subarray(i * k, i * k + k)));
    return { cost, plays: Array.from(plays), pStr: Array.from(pStr), oStr: Array.from(oStr),
             oppCount: oppMatrix, repeats, playErr, oppSpread,
             pStrSpread: spread(pStr), oStrSpread: spread(oStr),
             margin, marginSpread, edge, edgeSpread, gapSum, gapMax, maxMeet, hasOpener,
             topTogether };
  }

  //  파트너 조합은 그대로 둔 채 "어느 조 vs 어느 조"만 바꿔가며 경기 균형을 개선한다.
  //  두 경기에서 조를 하나씩 골라 맞바꾸는 수만 쓰므로 파트너 커버리지는 절대 깨지지 않는다.
  function rematchPairs(games, k, target, seed) {
    const cur = games.map(g => ({ A: g.A.slice(), B: g.B.slice() }));
    const n = cur.length;
    if (n < 2) return cur;
    const disjoint = (p, q) => p[0] !== q[0] && p[0] !== q[1] && p[1] !== q[0] && p[1] !== q[1];

    //  전통 KDK 오프닝(1시드+막내 vs 2시드+차하위)을 먼저 손으로 성사시킨다.
    //  풀커버 편성에는 두 조합이 반드시 각각 한 번씩 들어 있으므로, 서로 다른 경기에 흩어져
    //  있으면 조를 맞바꿔 같은 경기에 모아준다. 언덕오르기만으로는 잘 안 걸려서 명시적으로 한다.
    const op = classicOpener(k);
    if (op) {
      const want = [pairKey(op.A[0], op.A[1]), pairKey(op.B[0], op.B[1])];
      const at = t => {
        for (let i = 0; i < n; i++) for (const s of ['A', 'B']) {
          if (pairKey(cur[i][s][0], cur[i][s][1]) === t) return { i, s };
        }
        return null;
      };
      const a = at(want[0]), b = at(want[1]);
      if (a && b && a.i !== b.i) {
        //  a가 있는 경기의 반대편 조를 b가 있는 경기로 보내고, b를 a 쪽으로 데려온다.
        const oa = a.s === 'A' ? 'B' : 'A';
        if (disjoint(cur[a.i][a.s], cur[b.i][b.s]) && disjoint(cur[b.i][b.s === 'A' ? 'B' : 'A'], cur[a.i][oa])) {
          const t = cur[a.i][oa]; cur[a.i][oa] = cur[b.i][b.s]; cur[b.i][b.s] = t;
        }
      }
    }

    let sc = scoreSchedule(cur, k, target);
    for (let pass = 0; pass < 40; pass++) {
      let improved = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (const si of ['A', 'B']) {
            for (const sj of ['A', 'B']) {
              const oi = si === 'A' ? 'B' : 'A', oj = sj === 'A' ? 'B' : 'A';
              if (!disjoint(cur[i][oi], cur[j][sj]) || !disjoint(cur[j][oj], cur[i][si])) continue;
              const t = cur[i][si]; cur[i][si] = cur[j][sj]; cur[j][sj] = t;
              const ns = scoreSchedule(cur, k, target);
              if (ns.cost < sc.cost) { sc = ns; improved = true; }
              else { const u = cur[i][si]; cur[i][si] = cur[j][sj]; cur[j][sj] = u; }
            }
          }
        }
      }
      if (!improved) break;
    }
    return cur;
  }

  //  후보 게임 풀 위에서 무작위 재시작 + 언덕오르기.
  //  수(move): ⓐ 게임 통째 교체  ⓑ 같은 4명을 다른 팀조합으로  ⓒ 선수 1명 교체
  function buildBalancedGames(k, want, seed) {
    const target = feasibleTarget(k, want);
    if (!target) return { games: [], target: 0, stats: null };

    //  인당 (k-1)게임 = 모든 파트너 1회. 파트너 조합은 정확해가 있으므로 백트래킹으로 잡고,
    //  그 다음 "어느 조가 어느 조와 붙을지"만 다시 짜서 경기별 전력차를 줄인다.
    //  (파트너 조합 자체는 건드리지 않으므로 전원 1회씩 파트너는 그대로 유지된다)
    if (target === k - 1 && (k % 4 === 0 || k % 4 === 1)) {
      const exact = buildGames(k, seed).games;
      let asAB = exact.map(g => ({ A: g.a, B: g.b }));
      asAB = rematchPairs(asAB, k, target, seed);
      return {
        games: asAB.map(g => ({ a: g.A, b: g.B })),
        target,
        stats: scoreSchedule(asAB, k, target),
        fullCover: true,
      };
    }

    const G = (k * target) / 4;
    const rand = mulberry32((seed || 2025) ^ 0x2545f491);

    //  탐색 예산. 브라우저에서 돌리는 코드라 인원이 많아져도 몇 초 안에 끝나야 한다.
    //  평가 1회 비용이 대략 O(경기수 + 인원²)이므로 그걸 감안해 횟수를 정한다.
    //  경기수가 늘면 평가 1회도 비싸지고 훑을 조합도 제곱으로 늘어난다. 둘 다 감안해 예산을 줄인다.
    //  (KDK 한 조는 보통 12명 이하라 그 구간에 예산을 몰아준다)
    const floorBudget = G <= 24 ? 200000 : (G <= 60 ? 70000 : 30000);
    const EVAL_BUDGET = Math.max(floorBudget, Math.floor(12000000 / (G + k * k)));
    let evals = 0;
    const score = list => { evals++; return scoreSchedule(list, k, target); };
    const outOfBudget = () => evals > EVAL_BUDGET;

    //  ⚠️ 여기가 v2에서 가장 크게 바뀐 부분.
    //  예전엔 "게임 하나를 후보 풀의 아무 게임으로 교체"하는 수를 썼는데, 그러면 출전수가
    //  깨져서(playErr) 벌점이 폭발하고 거의 모든 이동이 거부된다. 그 결과 10명 이상에서는
    //  시작 편성 그대로 굳어버려 한쪽으로 크게 기운 경기가 그냥 남았다.
    //  그래서 출전수를 절대 건드리지 않는 두 가지 수만 쓴다:
    //    ⓐ 재분할 — 같은 4명을 다른 팀조합으로 (출전수 그대로)
    //    ⓑ 맞교환 — 서로 다른 두 경기에서 선수를 하나씩 골라 맞바꿈 (출전수 그대로)
    function resplit(g, which) {
      const f = [g.A[0], g.A[1], g.B[0], g.B[1]];
      if (which === 0) return { A: [f[0], f[2]], B: [f[1], f[3]] };
      if (which === 1) return { A: [f[0], f[3]], B: [f[1], f[2]] };
      return { A: [f[0], f[1]], B: [f[2], f[3]] };
    }
    //  두 경기 사이에서 선수 맞교환. 교환 후에도 각 경기가 서로 다른 4명이어야 유효.
    function trySwap(list, gi, gj, si, sj) {
      const gA = list[gi], gB = list[gj];
      const fa = [gA.A[0], gA.A[1], gA.B[0], gA.B[1]];
      const fb = [gB.A[0], gB.A[1], gB.B[0], gB.B[1]];
      const pa = fa[si], pb = fb[sj];
      if (pa === pb) return null;
      if (fa.indexOf(pb) !== -1 || fb.indexOf(pa) !== -1) return null;   // 같은 사람이 두 번
      const na = fa.slice(); na[si] = pb;
      const nb = fb.slice(); nb[sj] = pa;
      return [{ A: [na[0], na[1]], B: [na[2], na[3]] },
              { A: [nb[0], nb[1]], B: [nb[2], nb[3]] }];
    }

    //  시작점은 항상 "인당 고정 게임수" 편성 — 출전수 균등이 이미 보장된 편성이다.
    //  시드를 바꿔가며 여러 시작점에서 출발한다.
    function startFrom(r) {
      const g = buildFixedGames(k, target, ((seed || 2025) + r * 7919) >>> 0).games;
      if (g.length === G) return g.map(x => ({ A: x.a.slice(), B: x.b.slice() }));
      const pool = candidateGames(k);
      return Array.from({ length: G }, () => pool[Math.floor(rand() * pool.length)]);
    }

    let best = null, bestScore = null;
    const RESTARTS = 14, ITERS = Math.min(9000, 600 * G);

    //  무작위 탐색이 예산을 다 먹어버리면 마무리(polish)가 한 바퀴도 못 돈다.
    //  거친 탐색은 예산의 절반까지만 쓰고, 나머지는 다듬는 데 남겨둔다.
    const ROUGH_BUDGET = Math.floor(EVAL_BUDGET * 0.5);
    for (let r = 0; r < RESTARTS && evals < ROUGH_BUDGET; r++) {
      const cur = startFrom(r);
      let sc = score(cur);
      for (let it = 0; it < ITERS && sc.cost > 0 && evals < ROUGH_BUDGET; it++) {
        if (rand() < 0.35) {
          const gi = Math.floor(rand() * G);
          const old = cur[gi];
          cur[gi] = resplit(old, Math.floor(rand() * 3));
          const ns = score(cur);
          if (ns.cost <= sc.cost) sc = ns; else cur[gi] = old;
        } else {
          if (G < 2) continue;
          const gi = Math.floor(rand() * G);
          let gj = Math.floor(rand() * (G - 1));
          if (gj >= gi) gj++;
          const sw = trySwap(cur, gi, gj, Math.floor(rand() * 4), Math.floor(rand() * 4));
          if (!sw) continue;
          const oi = cur[gi], oj = cur[gj];
          cur[gi] = sw[0]; cur[gj] = sw[1];
          const ns = score(cur);
          if (ns.cost <= sc.cost) sc = ns; else { cur[gi] = oi; cur[gj] = oj; }
        }
      }
      if (!bestScore || sc.cost < bestScore.cost) { bestScore = sc; best = cur.slice(); }
      if (bestScore.cost === 0) break;
    }

    //  가장 기울어진 경기부터 집중적으로 고친다.
    //  전체를 다 훑는 polish 는 경기수의 제곱으로 비싸져서 인원이 많으면 몇 바퀴 못 돈다.
    //  반면 "제일 기운 경기 하나"를 상대로 한 바퀴 도는 건 경기수에 비례할 뿐이라 훨씬 싸고,
    //  gapMax 를 내리는 데는 이게 제일 효과가 크다.
    function repairWorst(list, sc) {
      for (let round = 0; round < 40 && sc.cost > 0 && !outOfBudget(); round++) {
        let worst = 0, worstGap = -1;
        for (let gi = 0; gi < G; gi++) {
          const gap = teamGap(k, list[gi]);
          if (gap > worstGap) { worstGap = gap; worst = gi; }
        }
        if (worstGap <= 0) break;
        let improved = false;
        for (let gj = 0; gj < G && !improved; gj++) {
          if (gj === worst) continue;
          for (let si = 0; si < 4 && !improved; si++) for (let sj = 0; sj < 4; sj++) {
            const sw = trySwap(list, worst, gj, si, sj);
            if (!sw) continue;
            const oi = list[worst], oj = list[gj];
            list[worst] = sw[0]; list[gj] = sw[1];
            const ns = score(list);
            if (ns.cost < sc.cost) { sc = ns; improved = true; break; }
            list[worst] = oi; list[gj] = oj;
          }
        }
        //  재분할(같은 4명을 다른 팀조합으로)로도 한 번 시도해 본다
        if (!improved) {
          for (let w = 0; w < 3; w++) {
            const old = list[worst];
            list[worst] = resplit(old, w);
            const ns = score(list);
            if (ns.cost < sc.cost) { sc = ns; improved = true; break; }
            list[worst] = old;
          }
        }
        if (!improved) break;
      }
      return sc;
    }

    //  마무리: 같은 두 수를 빠짐없이 훑어 더 못 내려갈 때까지 내린다(진짜 국소최적까지).
    function polish(list) {
      let sc = repairWorst(list, score(list));
      for (let pass = 0; pass < 12 && sc.cost > 0 && !outOfBudget(); pass++) {
        let improved = false;
        for (let gi = 0; gi < G; gi++) {
          for (let w = 0; w < 3; w++) {
            const old = list[gi];
            list[gi] = resplit(old, w);
            const ns = score(list);
            if (ns.cost < sc.cost) { sc = ns; improved = true; } else list[gi] = old;
          }
        }
        for (let gi = 0; gi < G; gi++) for (let gj = gi + 1; gj < G; gj++) {
          for (let si = 0; si < 4; si++) for (let sj = 0; sj < 4; sj++) {
            const sw = trySwap(list, gi, gj, si, sj);
            if (!sw) continue;
            const oi = list[gi], oj = list[gj];
            list[gi] = sw[0]; list[gj] = sw[1];
            const ns = score(list);
            if (ns.cost < sc.cost) { sc = ns; improved = true; }
            else { list[gi] = oi; list[gj] = oj; }
          }
        }
        if (!improved) break;
      }
      return sc;
    }

    bestScore = polish(best);

    //  국소최적 탈출(iterated local search): 지금 답을 살짝 흔든 뒤 다시 끝까지 내려보고,
    //  더 좋아졌을 때만 채택한다. 흔드는 수도 출전수를 건드리지 않는 맞교환만 쓴다.
    //  이게 없으면 "전체 전력차 합은 같은데 한 경기만 유독 기울어진" 편성에 갇힌다.
    const KICKS = G <= 12 ? 60 : 25;
    for (let kick = 0; kick < KICKS && bestScore.cost > 0 && !outOfBudget(); kick++) {
      const trial = best.map(g => ({ A: g.A.slice(), B: g.B.slice() }));
      for (let m = 0; m < 3; m++) {
        if (G < 2) break;
        const gi = Math.floor(rand() * G);
        let gj = Math.floor(rand() * (G - 1));
        if (gj >= gi) gj++;
        const sw = trySwap(trial, gi, gj, Math.floor(rand() * 4), Math.floor(rand() * 4));
        if (sw) { trial[gi] = sw[0]; trial[gj] = sw[1]; }
      }
      const sc = polish(trial);
      if (sc.cost < bestScore.cost) { bestScore = sc; best = trial; }
    }

    return {
      games: best.map(g => ({ a: g.A, b: g.B })),
      target,
      stats: bestScore,
    };
  }

  //  대기(바이)가 몰리지 않도록 라운드 순서를 다듬는다.
  //  연속 대기를 최우선으로 없애고, 그다음 대기 간격을 고르게.
  //  fixedHead 를 주면 앞의 그 개수만큼은 자리를 고정한다(예: 전통 KDK 1경기를 1경기로 못박을 때).
  function polishOrder(ordered, k, fixedHead) {
    const n = ordered.length;
    const head = fixedHead || 0;
    if (n < 3) return ordered;
    function cost(list) {
      const restAt = Array.from({ length: k }, () => []);
      list.forEach((r, i) => r.waiting.forEach(p => restAt[p].push(i)));
      let c = 0;
      for (const rl of restAt) {
        for (let i = 1; i < rl.length; i++) {
          const gap = rl[i] - rl[i - 1];
          if (gap === 1) c += 100;
          c += Math.abs(gap - (n / Math.max(1, rl.length)));
        }
      }
      return c;
    }
    let cur = ordered.slice(), best = cost(cur);
    for (let pass = 0; pass < 400; pass++) {
      let improved = false;
      for (let i = head; i < n && !improved; i++) {
        for (let j = i + 1; j < n; j++) {
          const t = cur.slice();
          const tmp = t[i]; t[i] = t[j]; t[j] = tmp;
          const c = cost(t);
          if (c < best) { best = c; cur = t; improved = true; break; }
        }
      }
      if (!improved) break;
    }
    return cur;
  }

  // ── 공개 API ─────────────────────────────────────────────────
  //  names: 학생 이름 배열. (mode='balanced' 일 때는 시드 순서 = 강한 순서)
  //  options: {
  //    seed,                               결정적 시드
  //    mode: 'full' | 'fixed' | 'balanced',
  //                                        'full'=모든 파트너 1회
  //                                        'fixed'=인당 고정 게임수
  //                                        'balanced'=시드 균형(대회용)
  //    gamesPerPlayer,                     'fixed'/'balanced'일 때 인당 목표 게임수
  //  }
  //  반환: {
  //    rounds: [{ round, teamA:[n,n], teamB:[n,n], waiting:[n...] }],
  //    mode, targetGames,
  //    coverage: { totalPairs, coveredPairs, missingPairs:[[n,n]...], fullyCovered, repeatedPartners },
  //    perPlayer: [{ name, games, byes, partners:[...], opponents:[...] }],
  //    warnings: [..]
  //  }
  function generateGroupSchedule(names, options) {
    options = options || {};
    const clean = (names || []).map(s => (s == null ? '' : String(s).trim())).filter(s => s.length);
    const k = clean.length;
    const warnings = [];

    if (k < 4) {
      return {
        rounds: [],
        mode: options.mode || 'full',
        targetGames: null,
        seedBalance: null,
        coverage: { totalPairs: k * (k - 1) / 2, coveredPairs: 0, missingPairs: [], fullyCovered: false, repeatedPartners: 0 },
        perPlayer: clean.map(n => ({ name: n, games: 0, byes: 0, partners: [], opponents: [] })),
        warnings: ['복식 경기를 만들려면 최소 4명이 필요합니다 (현재 ' + k + '명).'],
        k,
      };
    }

    // mode: 'full'(모든 파트너 1회) | 'fixed'(인당 고정 게임수) | 'balanced'(시드 균형)
    const mode = (options.mode === 'fixed' || options.mode === 'balanced') ? options.mode : 'full';
    const totalPairs = k * (k - 1) / 2;
    let games, targetGames = null, balance = null;
    if (mode === 'fixed') {
      const t = Math.max(1, Math.min(options.gamesPerPlayer || 5, k - 1));
      targetGames = t;
      games = buildFixedGames(k, t, options.seed).games;
    } else if (mode === 'balanced') {
      const want = Math.max(1, Math.min(options.gamesPerPlayer || (k - 1), k - 1));
      const r = buildBalancedGames(k, want, options.seed);
      targetGames = r.target;
      games = r.games;
      balance = r.stats;
      if (!targetGames) {
        warnings.push(k + '명으로는 전원이 같은 게임수를 뛰는 편성을 만들 수 없습니다.');
      } else if (targetGames < want) {
        warnings.push(
          '인당 ' + want + '게임은 ' + k + '명 구성에서 출전수를 똑같이 맞출 수 없어 ' +
          targetGames + '게임으로 조정했습니다 (N×게임수가 4의 배수여야 전원 동일 출전).'
        );
      }
    } else {
      games = buildGames(k, options.seed).games;
    }
    let ordered = orderRounds(games, k);
    if (mode === 'balanced') {
      //  1시드+막내 vs 2시드+차하위 경기가 있으면 첫 경기로 올린다(전통적인 KDK 오프닝).
      //  자리를 옮긴 뒤에 대기 순서를 다듬어야 한다. 순서를 다듬고 나서 옮기면 애써 없앤
      //  연속 대기가 되살아난다.
      const oi = ordered.findIndex(r => isClassicOpener(k, { A: r.teamA, B: r.teamB }));
      if (oi > 0) ordered = [ordered[oi]].concat(ordered.filter((_, i) => i !== oi));
      ordered = polishOrder(ordered, k, oi >= 0 ? 1 : 0);
    }

    // 커버리지/통계 계산
    const coveredSet = new Set();
    const partnerPairCount = {};      // 파트너쌍별 사용 횟수(고정 모드 중복 점검)
    const partnersOf = Array.from({ length: k }, () => new Set());
    const opponentsOf = Array.from({ length: k }, () => new Set());
    const gamesOf = new Array(k).fill(0);

    ordered.forEach(r => {
      const [a1, a2] = r.teamA, [b1, b2] = r.teamB;
      [[a1, a2], [b1, b2]].forEach(([x, y]) => {
        const key = pairKey(x, y);
        coveredSet.add(key);
        partnerPairCount[key] = (partnerPairCount[key] || 0) + 1;
      });
      partnersOf[a1].add(a2); partnersOf[a2].add(a1);
      partnersOf[b1].add(b2); partnersOf[b2].add(b1);
      [a1, a2].forEach(x => [b1, b2].forEach(y => { opponentsOf[x].add(y); opponentsOf[y].add(x); }));
      [a1, a2, b1, b2].forEach(x => gamesOf[x]++);
    });

    const missingPairs = [];
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++)
        if (!coveredSet.has(pairKey(i, j))) missingPairs.push([clean[i], clean[j]]);

    const fullyCovered = missingPairs.length === 0;
    const repeatedPartners = Object.values(partnerPairCount).filter(c => c > 1).length;

    if (mode === 'balanced' && balance) {
      const minG = Math.min(...gamesOf), maxG = Math.max(...gamesOf);
      if (minG !== maxG) warnings.push('출전수가 ' + minG + '~' + maxG + '게임으로 갈렸습니다.');
      if (repeatedPartners > 0) warnings.push(repeatedPartners + '개 파트너 조합이 중복됩니다.');
      //  완전커버 편성은 모든 파트너 조합을 한 번씩 쓰므로 1·2시드가 한 팀이 되는 경기를
      //  뺄 수가 없다. 이건 알고리즘의 한계가 아니라 수학적 필연이라 그렇게 알려준다.
      if (fullyCovered && balance.topTogether > 0) {
        warnings.push(
          '모든 파트너 조합을 1회씩 쓰는 편성이라 1·2시드가 한 팀이 되는 경기가 ' +
          balance.topTogether + '경기 있습니다 (이 조건에서는 뺄 수 없습니다). ' +
          '이걸 피하려면 인당 게임수를 줄여 주세요.'
        );
      } else if (!fullyCovered && balance.topTogether > 0) {
        warnings.push('1·2시드가 한 팀이 되는 경기가 ' + balance.topTogether + '경기 남았습니다. 🎲 다시 뽑아 보세요.');
      }
      if (balance.gapMax > 0) {
        warnings.push('가장 기울어진 경기의 팀 전력차는 ' + balance.gapMax + '점입니다.');
      }
    } else if (mode === 'fixed') {
      const minG = Math.min(...gamesOf), maxG = Math.max(...gamesOf);
      if (minG < targetGames) {
        const shortCount = gamesOf.filter(g => g < targetGames).length;
        warnings.push(
          '인당 ' + targetGames + '게임 목표 중 ' + shortCount + '명은 인원 구성상 ' + minG +
          '게임으로 배정되었습니다(나머지는 ' + maxG + '게임). 출전수 차이는 1게임 이내로 균등합니다.'
        );
      }
      if (repeatedPartners > 0) {
        warnings.push('고정 게임수 모드라 ' + repeatedPartners + '개 파트너 조합이 중복됩니다(같은 파트너를 다시 만남). 게임수를 줄이면 중복이 사라집니다.');
      }
    } else if (!fullyCovered) {
      warnings.push(
        missingPairs.length + '개 파트너 조합은 ' + k +
        '명 구성상 한 게임으로 편성할 수 없습니다 (수학적으로 ' +
        (k % 4 === 2 || k % 4 === 3 ? 'N≡2·3(mod4)일 때 불가피' : '제약') + '). 나머지 모든 조합은 1회씩 편성되었습니다.'
      );
    }

    const rounds = ordered.map((r, i) => ({
      round: i + 1,
      teamA: [clean[r.teamA[0]], clean[r.teamA[1]]],
      teamB: [clean[r.teamB[0]], clean[r.teamB[1]]],
      waiting: r.waiting.map(x => clean[x]),
    }));

    const totalRounds = ordered.length;
    const perPlayer = clean.map((n, i) => ({
      name: n,
      games: gamesOf[i],
      byes: totalRounds - gamesOf[i],
      partners: Array.from(partnersOf[i]).map(x => clean[x]),
      opponents: Array.from(opponentsOf[i]).map(x => clean[x]),
    }));

    return {
      rounds,
      mode,
      targetGames,
      coverage: { totalPairs, coveredPairs: coveredSet.size, missingPairs, fullyCovered, repeatedPartners },
      seedBalance: balance ? {
        partnerStrength: balance.pStr.slice(),
        opponentStrength: balance.oStr.slice(),
        partnerStrengthSpread: balance.pStrSpread,
        opponentStrengthSpread: balance.oStrSpread,
        opponentMeetSpread: balance.oppSpread,
        margin: balance.margin.slice(),        // 선수별 기대마진 (내 팀 − 상대 팀의 누적)
        marginSpread: balance.marginSpread,
        edge: balance.edge.map(v => Math.round(v * 10) / 10),  // 편성 때문에 생긴 유불리 (0이면 없음)
        edgeSpread: Math.round(balance.edgeSpread * 10) / 10,  // 대표 공정성 지표
        matchGapMax: balance.gapMax,           // 가장 기울어진 경기의 팀 전력차
        matchGapSum: balance.gapSum,
        maxSameOpponent: balance.maxMeet,      // 같은 상대를 최대 몇 번 만나는지
        topSeedsTogether: balance.topTogether, // 1·2시드가 한 팀이 된 경기 수 (0이어야 정상)
        classicOpener: balance.hasOpener,      // 1시드+막내 vs 2시드+차하위 경기가 있는지
        fullCover: fullyCovered,
        //  "완벽"의 기준: 출전수 동일 + 파트너 중복 0 + 1·2시드 한 팀 없음.
        //  (실력차가 있는 이상 "모두의 기대 성적이 같은" 편성은 존재하지 않는다. 대신
        //   한쪽으로 몰아주는 편성을 구조적으로 막는 이 세 가지를 만족하면 완성으로 본다)
        //  단, 전원이 서로 1회씩 파트너가 되는 완전커버 편성은 1·2시드가 한 번 한 팀이 되는 게
        //  수학적으로 불가피하므로(모든 조합을 쓰니까) 그 자체로 가장 공정한 편성으로 본다.
        perfect: repeatedPartners === 0 && balance.playErr === 0
                 && (fullyCovered || balance.topTogether === 0),
      } : null,
      perPlayer,
      warnings,
      k,
    };
  }

  const api = { generateGroupSchedule, buildGames, buildFixedGames, buildBalancedGames,
                orderRounds, polishOrder, feasibleTarget, pairKey, mulberry32 };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RoundRobinDoubles = api;
})(typeof window !== 'undefined' ? window : globalThis);
