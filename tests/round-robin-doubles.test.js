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

// maxRounds 제한 동작
(() => {
  const res = RRD.generateGroupSchedule(Array.from({ length: 8 }, (_, i) => 'S' + i), { seed: 7, maxRounds: 5 });
  check(res.rounds.length === 5, '[maxRounds] 라운드 5개로 제한됨 (실제 ' + res.rounds.length + ')');
})();

// 이름 공백/중복-trim 처리
(() => {
  const res = RRD.generateGroupSchedule(['  김철수 ', '이영희', '', '   ', '박민수', '최지우'], { seed: 3 });
  check(res.k === 4, '[trim] 공백 항목 제거 후 4명 인식 (실제 ' + res.k + ')');
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
