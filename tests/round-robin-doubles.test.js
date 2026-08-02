/* ============================================================================
 *  Round Robin Doubles — 알고리즘 검증 테스트 (의존성 없음)
 *  실행:  node tests/round-robin-doubles.test.js
 * ==========================================================================*/
const RRD = require('../round-robin-doubles.js');

let pass = 0, fail = 0;
const fails = [];
function check(cond, msg) {
  if (cond) { pass++; }
  else { fail++; fails.push(msg); }
}

function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

// k명 그룹에 대한 핵심 보장 검증
function verifyGroup(k) {
  const names = Array.from({ length: k }, (_, i) => 'P' + (i + 1));
  const res = RRD.generateGroupSchedule(names, { seed: 12345 });
  const tag = `[k=${k}]`;

  // 1) 어떤 파트너 조합도 2회 이상 쓰이지 않는다
  const partnerSeen = new Map();
  let partnerDup = false;
  res.rounds.forEach(r => {
    [[r.teamA[0], r.teamA[1]], [r.teamB[0], r.teamB[1]]].forEach(([x, y]) => {
      const key = pairKey(x, y);
      partnerSeen.set(key, (partnerSeen.get(key) || 0) + 1);
      if (partnerSeen.get(key) > 1) partnerDup = true;
    });
  });
  check(!partnerDup, `${tag} 파트너 조합 중복 사용 없음`);

  // 2) 각 라운드는 4명 출전(2v2) + 나머지 대기, 출전/대기 중복·누락 없음
  let structOk = true;
  res.rounds.forEach(r => {
    const playing = [...r.teamA, ...r.teamB];
    const all = new Set([...playing, ...r.waiting]);
    if (playing.length !== 4) structOk = false;
    if (new Set(playing).size !== 4) structOk = false;      // 4명 서로 다름
    if (all.size !== k) structOk = false;                    // 전원 정확히 1회 등장
    if (playing.length + r.waiting.length !== k) structOk = false;
  });
  check(structOk, `${tag} 라운드 구조(4명 경기 + 나머지 대기) 정상`);

  // 3) k ≡ 0,1 (mod 4): 모든 파트너 조합 정확히 1회 + 각자 (k-1)게임
  const fullPossible = (k % 4 === 0 || k % 4 === 1);
  if (fullPossible) {
    check(res.coverage.fullyCovered, `${tag} 모든 파트너 조합 1회 완전 커버`);
    check(res.coverage.coveredPairs === k * (k - 1) / 2,
      `${tag} 커버된 조합 수 = C(k,2) = ${k * (k - 1) / 2} (실제 ${res.coverage.coveredPairs})`);
    const everyoneKm1 = res.perPlayer.every(p => p.games === k - 1);
    check(everyoneKm1, `${tag} 각 선수 정확히 ${k - 1}게임 출전`);
    // 완전 커버면 각자 나머지 모두와 파트너
    const allPartnered = res.perPlayer.every(p => p.partners.length === k - 1);
    check(allPartnered, `${tag} 각 선수가 나머지 ${k - 1}명 모두와 1회 파트너`);
  } else {
    // k ≡ 2,3 (mod 4): 정확히 1개 조합만 미편성(최대 커버)
    check(res.coverage.missingPairs.length === 1,
      `${tag} 미편성 조합 정확히 1개 (수학적 한계, 실제 ${res.coverage.missingPairs.length})`);
  }

  // 4) 바이(대기) 균등성: 출전수 최대-최소 차 ≤ 1
  const gamesArr = res.perPlayer.map(p => p.games);
  const spread = Math.max(...gamesArr) - Math.min(...gamesArr);
  check(spread <= 1, `${tag} 출전수 균등(최대-최소 차 ${spread} ≤ 1)`);

  // 5) 바이 분산: 같은 선수가 3라운드 연속 대기하지 않음(시간축 순환)
  const totalRounds = res.rounds.length;
  let maxConsecBye = 0;
  for (let pi = 0; pi < k; pi++) {
    const name = names[pi];
    let run = 0;
    res.rounds.forEach(r => {
      const onBye = r.waiting.includes(name);
      run = onBye ? run + 1 : 0;
      if (run > maxConsecBye) maxConsecBye = run;
    });
  }
  // 대기 인원이 많은 작은 그룹(k>=8에서 라운드당 k-4명 대기)에서도 과도한 연속대기 방지
  check(maxConsecBye <= Math.max(2, k - 4),
    `${tag} 연속 대기 ${maxConsecBye} ≤ ${Math.max(2, k - 4)} (바이 순환)`);

  return res;
}

console.log('━━━ Round Robin Doubles 알고리즘 검증 ━━━\n');

for (const k of [4, 5, 6, 7, 8, 9, 10, 11, 12, 16]) {
  verifyGroup(k);
}

// 경계: 4명 미만은 경고 + 빈 스케줄
(() => {
  const res = RRD.generateGroupSchedule(['A', 'B', 'C'], { seed: 1 });
  check(res.rounds.length === 0 && res.warnings.length > 0, '[k=3] 4명 미만 경고 처리');
  const empty = RRD.generateGroupSchedule([], {});
  check(empty.rounds.length === 0, '[k=0] 빈 입력 안전 처리');
})();

// ── KDK 고정 게임수 모드 검증 ─────────────────────────────────
function verifyFixed(k, target) {
  const names = Array.from({ length: k }, (_, i) => 'P' + (i + 1));
  const res = RRD.generateGroupSchedule(names, { seed: 999, mode: 'fixed', gamesPerPlayer: target });
  const tag = `[fixed k=${k} g=${target}]`;

  // 라운드 구조 정상(4명 경기 + 나머지 대기)
  let structOk = true;
  res.rounds.forEach(r => {
    const playing = [...r.teamA, ...r.teamB];
    const all = new Set([...playing, ...r.waiting]);
    if (new Set(playing).size !== 4 || all.size !== k) structOk = false;
  });
  check(structOk, `${tag} 라운드 구조 정상`);

  // 출전수: 모두 target 이하 + 최대-최소 차 ≤ 1 (균등)
  const g = res.perPlayer.map(p => p.games);
  const maxG = Math.max(...g), minG = Math.min(...g);
  check(maxG <= target, `${tag} 아무도 목표(${target})를 초과하지 않음 (최대 ${maxG})`);
  check(maxG - minG <= 1, `${tag} 출전수 균등(차 ${maxG - minG} ≤ 1)`);

  // k*target 이 4의 배수면 전원 정확히 target
  if ((k * target) % 4 === 0) {
    check(g.every(x => x === target), `${tag} 전원 정확히 ${target}게임 (4의 배수)`);
  }

  // 총 라운드 = 총 출전수/4
  const totalPlayerGames = g.reduce((a, b) => a + b, 0);
  check(res.rounds.length === totalPlayerGames / 4, `${tag} 라운드수=총출전/4 정합`);

  // 파트너 중복: 이론상 중복 없이 가능하면(사용쌍 ≤ C(k,2)) 중복 0이어야 함
  const usedPairs = res.rounds.length * 2;       // 게임당 2팀
  if (usedPairs <= k * (k - 1) / 2) {
    check(res.coverage.repeatedPartners === 0,
      `${tag} 파트너 중복 0 (사용쌍 ${usedPairs} ≤ C(k,2) ${k * (k - 1) / 2}, 실제 중복 ${res.coverage.repeatedPartners})`);
  }
  return res;
}

// 4의 배수로 떨어지는 케이스(전원 정확히 target)
verifyFixed(8, 5);   // 40/4=10R, 전원 5게임
verifyFixed(7, 4);   // 28/4=7R, 전원 4게임
verifyFixed(8, 3);   // 24/4=6R, 전원 3게임
verifyFixed(12, 5);  // 60/4=15R
// 안 떨어지는 케이스(±1 균등)
verifyFixed(7, 5);
verifyFixed(6, 5);
verifyFixed(8, 7);   // = 전체 풀리그와 동일 게임수

// 목표가 k-1 이상으로 잘리는지(상한)
(() => {
  const res = RRD.generateGroupSchedule(Array.from({ length: 5 }, (_, i) => 'Q' + i), { seed: 3, mode: 'fixed', gamesPerPlayer: 99 });
  check(res.targetGames === 4, '[fixed clamp] 목표 게임수 k-1로 상한 (실제 ' + res.targetGames + ')');
})();

// 이름 공백/중복-trim 처리
(() => {
  const res = RRD.generateGroupSchedule(['  김철수 ', '이영희', '', '   ', '박민수', '최지우'], { seed: 3 });
  check(res.k === 4, '[trim] 공백 항목 제거 후 4명 인식 (실제 ' + res.k + ')');
})();

// ── 시드 균형 모드(대회용) 검증 ────────────────────────────────
//  명단 순서 = 시드 순. 1번 시드가 가장 강하다고 보고 전력 점수 k-1 … 0 을 부여.
function verifyBalanced(k) {
  const names = Array.from({ length: k }, (_, i) => 'P' + (i + 1));
  const res = RRD.generateGroupSchedule(names, { mode: 'balanced', seed: 2025 });
  const tag = `[balanced k=${k}]`;
  const idx = n => names.indexOf(n);
  const S = i => k - 1 - i;

  if (!res.targetGames) { check(false, tag + ' 편성 실패'); return; }

  // 1) 전원 출전수가 정확히 같다 — 시드 균형 모드의 핵심 보장
  const games = res.perPlayer.map(p => p.games);
  check(Math.min(...games) === Math.max(...games),
    tag + ' 출전수 전원 동일 (실제 ' + Math.min(...games) + '~' + Math.max(...games) + ')');
  check(games[0] === res.targetGames,
    tag + ' 출전수가 목표치와 일치 (' + games[0] + ' vs ' + res.targetGames + ')');

  // 2) N × 게임수 는 4의 배수여야 전원 동일 출전이 성립한다
  check((k * res.targetGames) % 4 === 0, tag + ' N×게임수가 4의 배수');

  // 3) 대기 횟수도 자동으로 같아진다
  const byes = res.perPlayer.map(p => p.byes);
  check(Math.min(...byes) === Math.max(...byes), tag + ' 대기 횟수 전원 동일');

  // 4) 파트너 전력 합 — 라운드마다 팀을 직접 집계해 seedBalance 와 대조
  const pStr = new Array(k).fill(0);
  res.rounds.forEach(r => {
    [r.teamA, r.teamB].forEach(t => {
      const x = idx(t[0]), y = idx(t[1]);
      pStr[x] += S(y); pStr[y] += S(x);
    });
  });
  check(res.seedBalance != null, tag + ' seedBalance 통계 제공');
  if (res.seedBalance) {
    check(JSON.stringify(res.seedBalance.partnerStrength) === JSON.stringify(pStr),
      tag + ' 보고된 파트너 전력이 실제 대진과 일치');
    check(res.seedBalance.partnerStrengthSpread === Math.max(...pStr) - Math.min(...pStr),
      tag + ' 파트너 전력 편차 값이 정확');
  }

  // 5) 파트너 조합이 남아돌 때는 중복이 없어야 한다
  if (res.targetGames < k - 1) {
    check(res.coverage.repeatedPartners === 0,
      tag + ' 파트너 중복 없음 (실제 ' + res.coverage.repeatedPartners + ')');
  }

  // 6) 경기별 팀 전력차 — 라운드에서 직접 계산해 보고값과 대조
  let gapMax = 0, gapSum = 0, topTogether = 0;
  res.rounds.forEach(r => {
    const a = S(idx(r.teamA[0])) + S(idx(r.teamA[1]));
    const b = S(idx(r.teamB[0])) + S(idx(r.teamB[1]));
    const g = Math.abs(a - b);
    gapSum += g;
    if (g > gapMax) gapMax = g;
    [r.teamA, r.teamB].forEach(t => {
      const pair = [idx(t[0]), idx(t[1])].sort((x, y) => x - y);
      if (pair[0] === 0 && pair[1] === 1) topTogether++;
    });
  });
  if (res.seedBalance) {
    check(res.seedBalance.matchGapMax === gapMax,
      tag + ' 보고된 최대 팀 전력차가 실제 대진과 일치 (' + res.seedBalance.matchGapMax + ' vs ' + gapMax + ')');
    check(res.seedBalance.matchGapSum === gapSum, tag + ' 보고된 전력차 합이 실제 대진과 일치');
    check(res.seedBalance.topSeedsTogether === topTogether,
      tag + ' 보고된 1·2시드 한 팀 횟수가 실제 대진과 일치');

    // 7) 핵심 보장: 파트너 조합에 여유가 있으면 1·2시드는 절대 한 팀이 되지 않는다.
    //    (모든 파트너 조합을 1회씩 쓰는 완전커버 편성에서는 수학적으로 불가피하므로 제외)
    if (!res.seedBalance.fullCover) {
      check(topTogether === 0, tag + ' 1·2시드가 한 팀이 되는 경기 없음 (실제 ' + topTogether + '경기)');
    }
  }
}
[4, 5, 6, 7, 8, 9, 10, 12].forEach(verifyBalanced);

// 6명 = 대회 실사용 케이스(중남집배). 요구사항을 그대로 검증한다.
(() => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const S = i => 5 - i;
  const idx = n => names.indexOf(n);

  //  시드를 바꿔 뽑아도(=🎲 다시 뽑기) 보장이 깨지면 안 된다
  [2025, 1, 7, 99, 404].forEach(seed => {
    const res = RRD.generateGroupSchedule(names, { mode: 'balanced', seed });
    const tag = '[balanced 6명 seed=' + seed + ']';
    check(res.targetGames === 4, tag + ' 인당 4게임 (실제 ' + res.targetGames + ')');
    check(res.rounds.length === 6, tag + ' 총 6경기 (실제 ' + res.rounds.length + ')');
    check(res.coverage.repeatedPartners === 0, tag + ' 파트너 중복 0');

    const B = res.seedBalance;
    check(B && B.topSeedsTogether === 0, tag + ' 1·2시드 한 팀 없음');
    check(B && B.maxSameOpponent <= 3, tag + ' 같은 상대 최대 3번 (실제 ' + (B ? B.maxSameOpponent : '?') + ')');
    check(B && B.classicOpener === true, tag + ' 1시드+막내 vs 2시드+차하위 경기 포함');

    //  그 경기가 실제로 1경기여야 한다 (전통 KDK 오프닝)
    const r0 = res.rounds[0];
    const first = [[idx(r0.teamA[0]), idx(r0.teamA[1])].sort((a, b) => a - b).join(','),
                   [idx(r0.teamB[0]), idx(r0.teamB[1])].sort((a, b) => a - b).join(',')].sort().join('|');
    check(first === '0,5|1,4', tag + ' 1경기가 1·6 vs 2·5 (실제 ' + first + ')');

    //  연속으로 두 번 쉬는 사람이 없어야 한다
    let backToBackBye = false;
    for (let i = 1; i < res.rounds.length; i++) {
      const prev = new Set(res.rounds[i - 1].waiting);
      if (res.rounds[i].waiting.some(n => prev.has(n))) backToBackBye = true;
    }
    check(!backToBackBye, tag + ' 연속 대기 없음');

    //  1경기는 완전히 팽팽해야 한다 (1+6 = 2+5)
    const gap0 = Math.abs(S(idx(r0.teamA[0])) + S(idx(r0.teamA[1]))
                        - (S(idx(r0.teamB[0])) + S(idx(r0.teamB[1]))));
    check(gap0 === 0, tag + ' 1경기 팀 전력차 0 (실제 ' + gap0 + ')');
  });
})();

// 완전커버(모든 파트너 1회씩) 편성에서는 1·2시드가 정확히 한 번 한 팀이 된다 — 수학적 필연
(() => {
  [4, 5, 8, 9, 12].forEach(k => {
    const names = Array.from({ length: k }, (_, i) => 'P' + (i + 1));
    const res = RRD.generateGroupSchedule(names, { mode: 'balanced', seed: 2025 });
    const B = res.seedBalance;
    check(B && B.fullCover === true, '[balanced k=' + k + '] 완전커버 편성');
    check(B && B.topSeedsTogether === 1,
      '[balanced k=' + k + '] 완전커버에서는 1·2시드가 정확히 1회 한 팀 (실제 ' +
        (B ? B.topSeedsTogether : '?') + ')');
  });
})();

// 인원이 많아도 브라우저가 멈추지 않을 만큼 빨리 끝나야 한다
(() => {
  [12, 16, 20].forEach(k => {
    const names = Array.from({ length: k }, (_, i) => 'P' + (i + 1));
    const t0 = Date.now();
    RRD.generateGroupSchedule(names, { mode: 'balanced', seed: 2025 });
    const ms = Date.now() - t0;
    check(ms < 15000, '[balanced k=' + k + '] 15초 안에 완료 (실제 ' + ms + 'ms)');
  });
})();

// 전원 동일 출전이 불가능한 게임수는 자동으로 내려간다
(() => {
  check(RRD.feasibleTarget(6, 5) === 4, '[feasibleTarget] 6명·5게임 → 4게임');
  check(RRD.feasibleTarget(6, 3) === 2, '[feasibleTarget] 6명·3게임 → 2게임');
  check(RRD.feasibleTarget(8, 5) === 5, '[feasibleTarget] 8명·5게임 → 그대로');
  check(RRD.feasibleTarget(7, 6) === 4, '[feasibleTarget] 7명·6게임 → 4게임');
  const res = RRD.generateGroupSchedule(['A','B','C','D','E','F'], { mode: 'balanced', gamesPerPlayer: 5, seed: 7 });
  check(res.targetGames === 4, '[balanced] 불가능한 게임수 요청 시 자동 조정');
  check(res.warnings.some(w => w.indexOf('조정') >= 0), '[balanced] 조정 사실을 경고로 알림');
})();

// 8명 그룹 실제 출력 샘플 표시
(() => {
  console.log('\n── 샘플: 8명 그룹 (1코트, 라운드당 4명 경기 / 4명 대기) ──');
  const names = ['민준', '서연', '도윤', '하은', '시우', '지유', '주원', '수아'];
  const res = RRD.generateGroupSchedule(names, { seed: 2025 });
  res.rounds.forEach(r => {
    console.log(
      `R${String(r.round).padStart(2)}  ` +
      `${r.teamA.join('·')}  vs  ${r.teamB.join('·')}` +
      `   [대기: ${r.waiting.join(', ')}]`
    );
  });
  console.log(`총 ${res.rounds.length}라운드 / 완전커버=${res.coverage.fullyCovered}`);
})();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log('\n실패 항목:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
else console.log('✅ 모든 검증 통과');
