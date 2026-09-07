// 로마자 한국 지명 → 한글.
//
// 왜 필요한가: travel_places.city 가 유튜브 설명·자막에서 오다 보니 로마자로 들어온다
// (국내 pending 4,306곳 중 3,062곳이 "Seoul", "Seogwipo" 꼴). 그런데 네이버 지역검색은
// `${city} ${name}` 로 질의해서 "Seogwipo 천리식당" 을 묻고 있었다 — 당연히 0건이다.
// 실측 2026-09-07: naverCalls 9 / found 0. 국내 여행지가 통째로 pending 에 갇힌 원인이다.
//
// ⚠️ 못 찾으면 null 을 준다. 그때는 도시를 **붙이지 말고** 상호만으로 물어야 한다 —
//    로마자를 그대로 붙이면 질의가 오염돼 오히려 0건이 된다.
export const KR_CITY: Record<string, string> = {
  "Seoul": "서울", "Jeju": "제주", "Busan": "부산", "Seogwipo": "서귀포",
  "Gangneung": "강릉", "Jeongseon": "정선", "Namhae": "남해", "Hadong": "하동",
  "Ulleung": "울릉", "Yangyang": "양양", "Pyeongchang": "평창", "Yeosu": "여수",
  "Tongyeong": "통영", "Sokcho": "속초", "Pohang": "포항", "Jecheon": "제천",
  "Sancheong": "산청", "Incheon": "인천", "Samcheok": "삼척", "Geoje": "거제",
  "Yeongdeok": "영덕", "Taean": "태안", "Donghae": "동해", "Goseong": "고성",
  "Danyang": "단양", "Inje": "인제", "Gangjin": "강진", "Gwangju": "광주",
  "Haenam": "해남", "Ulsan": "울산", "Gyeongju": "경주", "Cheorwon": "철원",
  "Cheongdo": "청도", "Mokpo": "목포", "Sunchang": "순창", "Geochang": "거창",
  "Miryang": "밀양", "Bonghwa": "봉화", "Wanju": "완주", "Seosan": "서산",
  "Hwaseong": "화성", "Taebaek": "태백", "Sacheon": "사천", "Boseong": "보성",
  "Yeongwol": "영월", "Changnyeong": "창녕", "Muju": "무주", "Yangpyeong": "양평",
  "Cheongsong": "청송", "Boryeong": "보령", "Namyangju": "남양주", "Chuncheon": "춘천",
  "Jinan": "진안", "Okcheon": "옥천", "Gochang": "고창", "Cheonan": "천안",
  "Ganghwa": "강화", "Wando": "완도", "Mungyeong": "문경", "Gwangyang": "광양",
  "Goesan": "괴산", "Gurye": "구례", "Cheongju": "청주", "Suwon": "수원",
  "Yesan": "예산", "Yeoncheon": "연천", "Sangju": "상주", "Hwasun": "화순",
  "Yangsan": "양산", "Buyeo": "부여", "Jindo": "진도", "Jincheon": "진천",
  "Damyang": "담양", "Sinan": "신안", "Shinan": "신안", "Sin-an": "신안",
  "Pyeongtaek": "평택", "Hoengseong": "횡성", "Gimhae": "김해", "Yanggu": "양구",
  "Yeongdong": "영동", "Hongcheon": "홍천", "Andong": "안동", "Jinju": "진주",
  "Yeongju": "영주", "Paju": "파주", "Goheung": "고흥", "Daegu": "대구",
  "Naju": "나주", "Muan": "무안", "Yecheon": "예천", "Gokseong": "곡성",
  "Hapcheon": "합천", "Siheung": "시흥", "Asan": "아산", "Gunsan": "군산",
  "Sejong": "세종", "Wonju": "원주", "Yeongcheon": "영천", "Uiseong": "의성",
  "Gumi": "구미", "Chungju": "충주", "Suncheon": "순천", "Geumsan": "금산",
  "Hamyang": "함양", "Gapyeong": "가평", "Jeongeup": "정읍", "Imsil": "임실",
  "Bucheon": "부천", "Yongin": "용인", "Yangju": "양주", "Jinhae": "진해",
  "Iksan": "익산", "Ansan": "안산", "Pocheon": "포천", "Ongjin": "옹진",
  "Changwon": "창원", "Namwon": "남원", "Gongju": "공주", "Eumseong": "음성",
  "Jangheung": "장흥", "Icheon": "이천", "Seongju": "성주", "Gimcheon": "김천",
  "Dangjin": "당진", "Goyang": "고양", "Yeonggwang": "영광", "Yeongyang": "영양",
  "Uljin": "울진", "Jangsu": "장수", "Gunwi": "군위", "Chilgok": "칠곡",
  "Jeonju": "전주", "Dongducheon": "동두천", "Masan": "마산", "Boeun": "보은",
  "Cheongyang": "청양", "Yeongam": "영암", "Gyeongsan": "경산", "Seongnam": "성남",
  "Hwacheon": "화천", "Seocheon": "서천", "Anseong": "안성", "Nonsan": "논산",
  "Daejeon": "대전", "Buan": "부안", "Hanam": "하남", "Hampyeong": "함평",
  "Dalseong": "달성", "Gimje": "김제", "Uijeongbu": "의정부", "Gwacheon": "과천",
  "Anyang": "안양", "Gunpo": "군포", "Gijang": "기장", "Uiwang": "의왕",
  "Ulju": "울주", "Aewol": "애월", "Hallim": "한림", "Jocheon": "조천",
  "Chuja": "추자", "Daebudo": "대부도", "Daeijakdo": "대이작도", "Anmyeon-do": "안면도",
  "Gageodo": "가거도", "Jukdo": "죽도", "Sido": "시도", "Seonjae-do": "선재도",
  "Deokjeok-myeon": "덕적면", "Jaeun-myeon": "자은면", "Chuja-myeon": "추자면", "Jeju City": "제주",
};

export function krCity(c: string | null | undefined): string | null {
  if (!c) return null;
  let s = String(c).trim();
  for (const suf of ["-si", "-gun", "-gu", "-do"]) {
    if (s.toLowerCase().endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  if (/[가-힣]/.test(s)) return s;              // 이미 한글이면 그대로 쓴다
  return KR_CITY[s] ?? KR_CITY[s.replace(/\b\w/g, (m) => m.toUpperCase())] ?? null;
}
