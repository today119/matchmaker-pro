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

  // ── 공개 API ─────────────────────────────────────────────────
  //  names: 학생 이름 배열. options: { seed, maxRounds }
  //  반환: {
  //    rounds: [{ round, teamA:[n,n], teamB:[n,n], waiting:[n...] }],
  //    coverage: { totalPairs, coveredPairs, missingPairs:[[n,n]...], fullyCovered },
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

    const { games, totalPairs } = buildGames(k, options.seed);
    let ordered = orderRounds(games, k);

    // 라운드 수 제한 옵션
    if (options.maxRounds && ordered.length > options.maxRounds) {
      warnings.push('라운드를 ' + options.maxRounds + '개로 제한했습니다 (전체 ' + ordered.length + '라운드 중). 일부 파트너 조합이 빠질 수 있습니다.');
      ordered = ordered.slice(0, options.maxRounds);
    }

    // 커버리지/통계 계산
    const coveredSet = new Set();
    const partnersOf = Array.from({ length: k }, () => new Set());
    const opponentsOf = Array.from({ length: k }, () => new Set());
    const gamesOf = new Array(k).fill(0);

    ordered.forEach(r => {
      const [a1, a2] = r.teamA, [b1, b2] = r.teamB;
      coveredSet.add(pairKey(a1, a2));
      coveredSet.add(pairKey(b1, b2));
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
    if (!fullyCovered && !options.maxRounds) {
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
      coverage: { totalPairs, coveredPairs: coveredSet.size, missingPairs, fullyCovered },
      perPlayer,
      warnings,
      k,
    };
  }

  const api = { generateGroupSchedule, buildGames, orderRounds, pairKey, mulberry32 };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RoundRobinDoubles = api;
})(typeof window !== 'undefined' ? window : globalThis);
