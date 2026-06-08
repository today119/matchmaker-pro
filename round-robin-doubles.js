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

  // ── 공개 API ─────────────────────────────────────────────────
  //  names: 학생 이름 배열.
  //  options: {
  //    seed,                               결정적 시드
  //    mode: 'full' | 'fixed',             'full'=모든 파트너 1회, 'fixed'=인당 고정 게임수
  //    gamesPerPlayer,                     mode='fixed'일 때 인당 목표 게임수
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
        rounds: [], coverage: { totalPairs: k * (k - 1) / 2, coveredPairs: 0, missingPairs: [], fullyCovered: false },
        perPlayer: clean.map(n => ({ name: n, games: 0, byes: 0, partners: [], opponents: [] })),
        warnings: ['복식 경기를 만들려면 최소 4명이 필요합니다 (현재 ' + k + '명).'],
        k,
      };
    }

    // mode: 'full'(모든 파트너 1회) | 'fixed'(인당 고정 게임수)
    const mode = options.mode === 'fixed' ? 'fixed' : 'full';
    const totalPairs = k * (k - 1) / 2;
    let games, targetGames = null;
    if (mode === 'fixed') {
      const t = Math.max(1, Math.min(options.gamesPerPlayer || 5, k - 1));
      targetGames = t;
      games = buildFixedGames(k, t, options.seed).games;
    } else {
      games = buildGames(k, options.seed).games;
    }
    let ordered = orderRounds(games, k);

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

    if (mode === 'fixed') {
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
      perPlayer,
      warnings,
      k,
    };
  }

  const api = { generateGroupSchedule, buildGames, buildFixedGames, orderRounds, pairKey, mulberry32 };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RoundRobinDoubles = api;
})(typeof window !== 'undefined' ? window : globalThis);
