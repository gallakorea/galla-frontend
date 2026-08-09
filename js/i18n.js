/* 🌍 국제화 기반 — 문구를 '넣을 자리'를 만든다 (2026-08-09)
 *
 *  왜 이렇게 만들었나
 *   · 화면 문구가 208개 파일에 5.8만 단어 흩어져 있다. 키를 새로 발명해서 전부 갈아엎는 방식은
 *     현실적으로 끝나지 않는다 → **한국어 원문을 그대로 키로 쓴다**(gettext의 source-as-key).
 *     그래서 GALLA_t("로그인")은 번역이 없으면 "로그인"을 그대로 돌려준다.
 *     즉 **한 줄씩 점진적으로 감싸도 화면이 깨지지 않는다.** 큰 개편 없이 굴러간다.
 *   · 나라별로 다른 '값'(상담번호·통화·시간대)은 여기가 아니라 서버의 app_settings.locales에 있다.
 *     클라이언트가 따로 하드코딩하면 서버와 갈린다.
 *
 *  ⚠️ 지금은 사전이 비어 있다. 그게 정상이다 — 해외 오픈을 정하면 그때 채운다.
 *     이 파일의 목적은 '번역'이 아니라 '번역할 수 있는 상태'를 만드는 것이다.
 */
(function () {
  "use strict";
  var FALLBACK = "ko";

  /* 사전 — 한국어 원문 → 각 언어. 파일이 커지면 언어별로 쪼개고 여기선 로더만 남긴다. */
  var DICT = {
      "en": {
          "홈": "Home",
          "광장": "Plaza",
          "뉴스": "News",
          "예측": "Predict",
          "검색": "Search",
          "설정": "Settings",
          "알림": "Notifications",
          "메시지": "Messages",
          "로그인": "Log in",
          "회원가입": "Sign up",
          "뒤로": "Back",
          "뒤로 가기": "Go back",
          "닫기": "Close",
          "취소": "Cancel",
          "저장": "Save",
          "공유": "Share",
          "더보기": "More",
          "전체": "All",
          "기타": "Other",
          "선택": "Select",
          "동의": "Agree",
          "허용": "Allow",
          "켜기": "Turn on",
          "표시": "Show",
          "지우기": "Clear",
          "등록하기": "Post",
          "글쓰기": "Write",
          "제목": "Title",
          "내용": "Content",
          "카테고리": "Category",
          "카테고리 선택": "Choose a category",
          "필수": "Required",
          "(필수)": "(required)",
          "[필수]": "[required]",
          "불러오는 중…": "Loading…",
          "검사 중…": "Checking…",
          "이메일": "Email",
          "비밀번호": "Password",
          "비밀번호 변경": "Change password",
          "전화번호": "Phone",
          "로그인 기록": "Login history",
          "문의하기": "Contact us",
          "버그 신고": "Report a bug",
          "이용약관": "Terms",
          "서비스 이용약관": "Terms of Service",
          "개인정보 처리방침": "Privacy Policy",
          "찬성": "For",
          "반대": "Against",
          "👍 찬성이오": "👍 I'm for it",
          "👎 난 반댈세": "👎 I'm against",
          "👍 진영": "👍 Side",
          "👎 진영": "👎 Side",
          "나의 입장": "My stance",
          "이슈 설명": "About this issue",
          "한줄 요약": "One-line summary",
          "개 의견": "opinions",
          "좋아요": "Like",
          "팔로워": "Followers",
          "핫트렌드": "Hot Trends",
          "핫튜브": "HotTube",
          "숏판": "Shorts",
          "롱판": "Long",
          "갈비스와 얘기": "Talk to Galvis",
          "정치": "Politics",
          "사회": "Society",
          "경제": "Economy",
          "투자": "Investing",
          "직장": "Work",
          "연애": "Dating",
          "결혼": "Marriage",
          "일상": "Daily life",
          "엔터": "Entertainment",
          "스포츠": "Sports",
          "여행": "Travel",
          "맛집": "Food",
          "인간관계": "Relationships",
          "가치·논쟁": "Values & debate",
          "불만·푸념": "Venting",
          "커리어·이직": "Career",
          "결혼·육아": "Marriage & parenting",
          "정치·사회": "Politics & society",
          "경제·투자": "Economy & investing",
          "엔터·스포츠": "Entertainment & sports",
          "연애·결혼": "Dating & marriage",
          "생활·일상": "Life & daily",
          "패션·뷰티": "Fashion & beauty",
          "직장·경력": "Work & career",
          "세계·여행": "World & travel",
          "음식·맛집": "Food & dining",
          "19금": "18+",
          "📷 사진": "📷 Photo",
          "🎬 동영상": "🎬 Video",
          "사진·영상 올리기": "Add photo or video",
          "미디어": "Media",
          "마이크": "Microphone",
          "카메라": "Camera",
          "👁 미리보기": "👁 Preview",
          "여기에 놓아 업로드": "Drop here to upload",
          "굵게": "Bold",
          "기울임": "Italic",
          "취소선": "Strikethrough",
          "인용": "Quote",
          "목록": "List",
          "링크": "Link",
          "✨ AI에게 글 다듬기": "✨ Polish with AI",
          "AI 실행": "Run AI",
          "AI 적용하기": "Apply",
          "내가 쓴 글": "My draft",
          "어조 강도": "Tone",
          "매우 공격적": "Very aggressive",
          "공격적": "Aggressive",
          "중간": "Neutral",
          "온화한": "Gentle",
          "매우 온화한": "Very gentle",
          "크리에이터 센터": "Creator Center",
          "정산 내역": "Payouts",
          "출금 요청": "Withdraw",
          "출금 요청하기": "Request withdrawal",
          "출금 가능 금액": "Available to withdraw",
          "은행 선택": "Select bank",
          "후원 전용": "Support only",
          "기부처를 선택하세요": "Choose a cause",
          "사회복지": "Social welfare",
          "장애인 지원": "Disability support",
          "환경 보호": "Environment",
          "재난·긴급구호": "Disaster relief",
          "동물 보호": "Animal welfare",
          "아동·청소년 지원": "Children & youth",
          "교육 및 문화": "Education & culture",
          "헌혈·재능기부": "Blood & skills donation",
          "데일리 퀘스트": "Daily quests",
          "획득": "Earned",
          "미획득": "Not earned",
          "나의 갈라 성향": "My GALLA type",
          "관제센터": "Admin",
          "탭 순서 편집": "Edit tab order",
          "홈 화면에 추가": "Add to Home Screen",
          "여론이 에너지가 되는 곳": "Where opinion becomes energy",
          "갈라 광장은 찬반 없는 자유 토론 공간입니다.": "Plaza is a free-talk space — no sides here.",
          "갈라 광장에 글쓰기": "Post to Plaza",
          "입장 없이 쟁점만 정리": "Just lay out the issue",
          "찬성 입장에서 주장 강화": "Strengthen the 'for' case",
          "반대 입장에서 주장 강화": "Strengthen the 'against' case",
          "찬성·반대 양쪽 논리 모두 제시": "Show both sides",
          "독자가 판단하게 질문형 구성": "Let readers decide",
          "발행 전 적합성 검사": "Pre-publish check",
          "최종 발행": "Publish",
          "알려주세요": "Let us know",
          "그래도 안 되면": "Still not working?",
          "통합검색": "Search all",
          "갈라뉴스": "GALLA News",
          "최근 검색어": "Recent searches",
          "실시간 검색어": "Trending now",
          "전체삭제": "Clear all",
          "접어두기": "Collapse",
          "더 이상 안 보기": "Don't show again",
          "후끈": "Hot",
          "최신": "Newest",
          "조회": "Most viewed",
          "추천": "Upvote",
          "비추천": "Downvote",
          "커뮤 HOT": "Community HOT",
          "광장에서 검색": "Search Plaza",
          "갈라뉴스에서 검색": "Search News",
          "기사 링크나 글을 붙여넣어": "Paste a link or text",
          "친구한테 아무 말이나 해봐": "Say anything to your friend",
          "리얼보이스 켜기/끄기": "Toggle real voice",
          "참여": "Join",
          "참전": "Join the fight",
          "리믹스": "Remix",
          "댓글": "Comments",
          "답글": "Reply",
          "신고": "Report",
          "삭제": "Delete",
          "수정": "Edit",
          "확인": "OK",
          "다음": "Next",
          "이전": "Previous",
          "완료": "Done",
          "프로필": "Profile",
          "마이페이지": "My page",
          "팔로잉": "Following",
          "북마크": "Bookmarks",
          "상점": "Shop",
          "충전": "Top up",
          "후원": "Support",
          "오늘": "Today",
          "어제": "Yesterday",
          "방금": "just now",
          "분 전": "m ago",
          "시간 전": "h ago",
          "일 전": "d ago",
          "결과가 없어요": "No results",
          "아직 없어요": "Nothing here yet",
          "다시 시도": "Try again",
          "새로고침": "Refresh",
          "로그아웃": "Log out",
          "계정": "Account",
          "언어": "Language",
          "표시 언어": "Display language",
          "트렌드 이렇게 놀아요": "How to use Trends",
          "이슈·예측·뉴스·유튜브·광장까지 한 방에 검색.": "Search issues, predictions, news, videos and Plaza — all at once.",
          "지금 뜨는 실시간 키워드. 트민남·트민녀 필수 코스.": "Live trending keywords — a must for trend-chasers.",
          "여러 기사를 AI가 3줄로 씹어서 떠먹여줘요.": "AI chews several articles into three lines for you.",
          "지금 터지는 유튜브 인기 영상 몰아보기.": "Binge what's blowing up on YouTube right now.",
          "글·짤·밈으로 노는 갈라 커뮤니티. 글도 바로 써요.": "The GALLA community — posts, pics and memes. Write one now.",
          "사진·동영상·링크와 함께 자유롭게 이야기를 나눠요.": "Share freely — photos, videos and links welcome.",
          "로그인이 필요합니다.": "Please log in.",
          "로그인이 필요해요.": "Please log in.",
          "로그인 후 투표할 수 있습니다.": "Log in to vote.",
          "잘못된 접근입니다.": "Invalid access.",
          "링크가 복사되었습니다.": "Link copied.",
          "링크를 복사했어요": "Link copied",
          "갈라 공유 링크를 복사했어요": "GALLA link copied",
          "🔗 댓글 링크 복사됨": "🔗 Comment link copied",
          "링크 복사에 실패했습니다.": "Couldn't copy the link.",
          "링크 복사 실패": "Copy failed",
          "오류가 발생했습니다.": "Something went wrong.",
          "처리 실패": "Failed",
          "잠시 후 다시 시도해주세요.": "Please try again in a moment.",
          "등록 실패": "Couldn't post",
          "삭제 실패": "Couldn't delete",
          "삭제됨": "Deleted",
          "댓글 등록 실패": "Couldn't post the comment",
          "투표 처리 실패": "Couldn't record your vote",
          "설정을 저장하지 못했어요": "Couldn't save settings",
          "재생하지 못했어요": "Couldn't play",
          "전환에 실패했어요": "Couldn't switch",
          "충전 준비에 실패했어요.": "Couldn't start top-up.",
          "육성 난장 개설에 실패했어요.": "Couldn't open the voice room.",
          "의견을 입력하세요.": "Write something first.",
          "제목을 입력해주세요": "Enter a title",
          "이슈 설명을 입력해주세요": "Describe the issue",
          "기부처를 선택해주세요": "Choose a cause",
          "영상 파일을 선택해주세요.": "Choose a video file.",
          "가로 영상을 올려주세요.": "Please upload a landscape video.",
          "사진이나 영상을 1개 이상 올려주세요.": "Add at least one photo or video.",
          "이 이슈에 대한 나의 입장을 선택해주세요": "Pick your side on this issue",
          "성별을 선택해주세요. (여론 통계에 필요해요)": "Select your gender (needed for opinion stats).",
          "사는 지역을 선택해주세요. (여론 통계에 필요해요)": "Select your region (needed for opinion stats).",
          "먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요.": "Vote first to pick a side before joining.",
          "이 브라우저에선 통화를 지원하지 않아요": "Calls aren't supported in this browser",
          "카메라를 켤 수 없어요": "Can't turn on the camera",
          "📹 면상톡으로 전환했어요": "📹 Switched to video",
          "📞 음성 통화로 전환했어요": "📞 Switched to voice",
          "비밀대화에선 텍스트만 보낼 수 있어요 (암호화 보장)": "Secret chat is text-only (end-to-end encrypted)",
          "🚫 방장이 내보냈어요": "🚫 The host removed you",
          "이 브라우저는 패스키를 지원하지 않아요.": "This browser doesn't support passkeys.",
          "수정 실패:": "Edit failed:",
          "정산 실패:": "Payout failed:",
          "업로드 실패:": "Upload failed:"
      },
      "ja": {
          "홈": "ホーム",
          "광장": "広場",
          "뉴스": "ニュース",
          "예측": "予測",
          "검색": "検索",
          "설정": "設定",
          "알림": "お知らせ",
          "메시지": "メッセージ",
          "로그인": "ログイン",
          "회원가입": "新規登録",
          "뒤로": "戻る",
          "뒤로 가기": "戻る",
          "닫기": "閉じる",
          "취소": "キャンセル",
          "저장": "保存",
          "공유": "シェア",
          "더보기": "もっと見る",
          "전체": "すべて",
          "기타": "その他",
          "선택": "選択",
          "동의": "同意",
          "허용": "許可",
          "켜기": "オン",
          "표시": "表示",
          "지우기": "消去",
          "등록하기": "投稿する",
          "글쓰기": "投稿",
          "제목": "タイトル",
          "내용": "本文",
          "카테고리": "カテゴリー",
          "카테고리 선택": "カテゴリーを選択",
          "필수": "必須",
          "(필수)": "(必須)",
          "[필수]": "[必須]",
          "불러오는 중…": "読み込み中…",
          "검사 중…": "確認中…",
          "이메일": "メール",
          "비밀번호": "パスワード",
          "비밀번호 변경": "パスワード変更",
          "전화번호": "電話番号",
          "로그인 기록": "ログイン履歴",
          "문의하기": "お問い合わせ",
          "버그 신고": "バグ報告",
          "이용약관": "利用規約",
          "서비스 이용약관": "サービス利用規約",
          "개인정보 처리방침": "プライバシーポリシー",
          "찬성": "賛成",
          "반대": "反対",
          "👍 찬성이오": "👍 賛成だ",
          "👎 난 반댈세": "👎 反対だね",
          "👍 진영": "👍 賛成陣営",
          "👎 진영": "👎 反対陣営",
          "나의 입장": "私の立場",
          "이슈 설명": "イシューの説明",
          "한줄 요약": "ひとこと要約",
          "개 의견": "件の意見",
          "좋아요": "いいね",
          "팔로워": "フォロワー",
          "핫트렌드": "ホットトレンド",
          "핫튜브": "ホットチューブ",
          "숏판": "ショート",
          "롱판": "ロング",
          "갈비스와 얘기": "ガルビスと話す",
          "정치": "政治",
          "사회": "社会",
          "경제": "経済",
          "투자": "投資",
          "직장": "仕事",
          "연애": "恋愛",
          "결혼": "結婚",
          "일상": "日常",
          "엔터": "エンタメ",
          "스포츠": "スポーツ",
          "여행": "旅行",
          "맛집": "グルメ",
          "인간관계": "人間関係",
          "가치·논쟁": "価値観・論争",
          "불만·푸념": "愚痴",
          "커리어·이직": "キャリア・転職",
          "결혼·육아": "結婚・育児",
          "정치·사회": "政治・社会",
          "경제·투자": "経済・投資",
          "엔터·스포츠": "エンタメ・スポーツ",
          "연애·결혼": "恋愛・結婚",
          "생활·일상": "生活・日常",
          "패션·뷰티": "ファッション・美容",
          "직장·경력": "仕事・キャリア",
          "세계·여행": "世界・旅行",
          "음식·맛집": "グルメ",
          "19금": "R18",
          "📷 사진": "📷 写真",
          "🎬 동영상": "🎬 動画",
          "사진·영상 올리기": "写真・動画を追加",
          "미디어": "メディア",
          "마이크": "マイク",
          "카메라": "カメラ",
          "👁 미리보기": "👁 プレビュー",
          "여기에 놓아 업로드": "ここにドロップ",
          "굵게": "太字",
          "기울임": "斜体",
          "취소선": "取り消し線",
          "인용": "引用",
          "목록": "リスト",
          "링크": "リンク",
          "✨ AI에게 글 다듬기": "✨ AIで整える",
          "AI 실행": "AI実行",
          "AI 적용하기": "適用する",
          "내가 쓴 글": "自分の文章",
          "어조 강도": "トーンの強さ",
          "매우 공격적": "とても攻撃的",
          "공격적": "攻撃的",
          "중간": "ふつう",
          "온화한": "穏やか",
          "매우 온화한": "とても穏やか",
          "크리에이터 센터": "クリエイターセンター",
          "정산 내역": "精算履歴",
          "출금 요청": "出金申請",
          "출금 요청하기": "出金を申請",
          "출금 가능 금액": "出金可能額",
          "은행 선택": "銀行を選択",
          "후원 전용": "支援専用",
          "기부처를 선택하세요": "寄付先を選んでください",
          "사회복지": "社会福祉",
          "장애인 지원": "障がい者支援",
          "환경 보호": "環境保護",
          "재난·긴급구호": "災害・緊急支援",
          "동물 보호": "動物保護",
          "아동·청소년 지원": "子ども・青少年支援",
          "교육 및 문화": "教育・文化",
          "헌혈·재능기부": "献血・才能寄付",
          "데일리 퀘스트": "デイリークエスト",
          "획득": "獲得",
          "미획득": "未獲得",
          "나의 갈라 성향": "私のGALLAタイプ",
          "관제센터": "管理センター",
          "탭 순서 편집": "タブ順を編集",
          "홈 화면에 추가": "ホーム画面に追加",
          "여론이 에너지가 되는 곳": "世論がエネルギーになる場所",
          "갈라 광장은 찬반 없는 자유 토론 공간입니다.": "広場は賛否のない自由な話し場です。",
          "갈라 광장에 글쓰기": "広場に投稿",
          "입장 없이 쟁점만 정리": "争点だけ整理",
          "찬성 입장에서 주장 강화": "賛成側を強化",
          "반대 입장에서 주장 강화": "反対側を強化",
          "찬성·반대 양쪽 논리 모두 제시": "両方の論理を提示",
          "독자가 판단하게 질문형 구성": "読者に委ねる問い形式",
          "발행 전 적합성 검사": "公開前チェック",
          "최종 발행": "公開する",
          "알려주세요": "教えてください",
          "그래도 안 되면": "それでもダメなら",
          "통합검색": "まとめて検索",
          "갈라뉴스": "GALLAニュース",
          "최근 검색어": "最近の検索",
          "실시간 검색어": "リアルタイム検索",
          "전체삭제": "すべて削除",
          "접어두기": "たたむ",
          "더 이상 안 보기": "今後表示しない",
          "후끈": "話題",
          "최신": "新着",
          "조회": "閲覧数",
          "추천": "おすすめ",
          "비추천": "そうでもない",
          "커뮤 HOT": "コミュHOT",
          "광장에서 검색": "広場で検索",
          "갈라뉴스에서 검색": "ニュースを検索",
          "기사 링크나 글을 붙여넣어": "記事リンクや文章を貼り付け",
          "친구한테 아무 말이나 해봐": "友達に何でも話してみて",
          "리얼보이스 켜기/끄기": "リアルボイス切替",
          "참여": "参加",
          "참전": "参戦",
          "리믹스": "リミックス",
          "댓글": "コメント",
          "답글": "返信",
          "신고": "通報",
          "삭제": "削除",
          "수정": "編集",
          "확인": "確認",
          "다음": "次へ",
          "이전": "前へ",
          "완료": "完了",
          "프로필": "プロフィール",
          "마이페이지": "マイページ",
          "팔로잉": "フォロー中",
          "북마크": "ブックマーク",
          "상점": "ショップ",
          "충전": "チャージ",
          "후원": "支援",
          "오늘": "今日",
          "어제": "昨日",
          "방금": "たった今",
          "분 전": "分前",
          "시간 전": "時間前",
          "일 전": "日前",
          "결과가 없어요": "結果がありません",
          "아직 없어요": "まだありません",
          "다시 시도": "再試行",
          "새로고침": "更新",
          "로그아웃": "ログアウト",
          "계정": "アカウント",
          "언어": "言語",
          "표시 언어": "表示言語",
          "트렌드 이렇게 놀아요": "トレンドの遊び方",
          "이슈·예측·뉴스·유튜브·광장까지 한 방에 검색.": "イシュー・予測・ニュース・動画・広場をまとめて検索。",
          "지금 뜨는 실시간 키워드. 트민남·트민녀 필수 코스.": "今アツいリアルタイムキーワード。トレンド好き必見。",
          "여러 기사를 AI가 3줄로 씹어서 떠먹여줘요.": "複数の記事をAIが3行にまとめます。",
          "지금 터지는 유튜브 인기 영상 몰아보기.": "今バズってるYouTube人気動画をまとめ見。",
          "글·짤·밈으로 노는 갈라 커뮤니티. 글도 바로 써요.": "文・画像・ミームで遊ぶGALLAコミュニティ。すぐ投稿も。",
          "사진·동영상·링크와 함께 자유롭게 이야기를 나눠요.": "写真・動画・リンクと一緒に自由に話そう。",
          "로그인이 필요합니다.": "ログインが必要です。",
          "로그인이 필요해요.": "ログインが必要です。",
          "로그인 후 투표할 수 있습니다.": "ログインすると投票できます。",
          "잘못된 접근입니다.": "不正なアクセスです。",
          "링크가 복사되었습니다.": "リンクをコピーしました。",
          "링크를 복사했어요": "リンクをコピーしました",
          "갈라 공유 링크를 복사했어요": "GALLAのリンクをコピーしました",
          "🔗 댓글 링크 복사됨": "🔗 コメントのリンクをコピー",
          "링크 복사에 실패했습니다.": "リンクをコピーできませんでした。",
          "링크 복사 실패": "コピー失敗",
          "오류가 발생했습니다.": "エラーが発生しました。",
          "처리 실패": "処理に失敗",
          "잠시 후 다시 시도해주세요.": "しばらくしてからもう一度お試しください。",
          "등록 실패": "投稿できませんでした",
          "삭제 실패": "削除できませんでした",
          "삭제됨": "削除しました",
          "댓글 등록 실패": "コメントを投稿できませんでした",
          "투표 처리 실패": "投票できませんでした",
          "설정을 저장하지 못했어요": "設定を保存できませんでした",
          "재생하지 못했어요": "再生できませんでした",
          "전환에 실패했어요": "切り替えに失敗しました",
          "충전 준비에 실패했어요.": "チャージの準備に失敗しました。",
          "육성 난장 개설에 실패했어요.": "ボイスルームを作成できませんでした。",
          "의견을 입력하세요.": "意見を入力してください。",
          "제목을 입력해주세요": "タイトルを入力してください",
          "이슈 설명을 입력해주세요": "イシューの説明を入力してください",
          "기부처를 선택해주세요": "寄付先を選んでください",
          "영상 파일을 선택해주세요.": "動画ファイルを選んでください。",
          "가로 영상을 올려주세요.": "横向きの動画をアップしてください。",
          "사진이나 영상을 1개 이상 올려주세요.": "写真か動画を1つ以上追加してください。",
          "이 이슈에 대한 나의 입장을 선택해주세요": "このイシューでの立場を選んでください",
          "성별을 선택해주세요. (여론 통계에 필요해요)": "性別を選んでください（世論統計に必要です）。",
          "사는 지역을 선택해주세요. (여론 통계에 필요해요)": "お住まいの地域を選んでください（世論統計に必要です）。",
          "먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요.": "まず投票して陣営を決めると参戦できます。",
          "이 브라우저에선 통화를 지원하지 않아요": "このブラウザでは通話に対応していません",
          "카메라를 켤 수 없어요": "カメラを起動できません",
          "📹 면상톡으로 전환했어요": "📹 ビデオ通話に切り替えました",
          "📞 음성 통화로 전환했어요": "📞 音声通話に切り替えました",
          "비밀대화에선 텍스트만 보낼 수 있어요 (암호화 보장)": "シークレットチャットはテキストのみです（暗号化）",
          "🚫 방장이 내보냈어요": "🚫 ホストに退出させられました",
          "이 브라우저는 패스키를 지원하지 않아요.": "このブラウザはパスキーに対応していません。",
          "수정 실패:": "編集に失敗:",
          "정산 실패:": "精算に失敗:",
          "업로드 실패:": "アップロード失敗:"
      },
      "zh-TW": {
          "홈": "首頁",
          "광장": "廣場",
          "뉴스": "新聞",
          "예측": "預測",
          "검색": "搜尋",
          "설정": "設定",
          "알림": "通知",
          "메시지": "訊息",
          "로그인": "登入",
          "회원가입": "註冊",
          "뒤로": "返回",
          "뒤로 가기": "返回",
          "닫기": "關閉",
          "취소": "取消",
          "저장": "儲存",
          "공유": "分享",
          "더보기": "更多",
          "전체": "全部",
          "기타": "其他",
          "선택": "選擇",
          "동의": "同意",
          "허용": "允許",
          "켜기": "開啟",
          "표시": "顯示",
          "지우기": "清除",
          "등록하기": "發布",
          "글쓰기": "發文",
          "제목": "標題",
          "내용": "內容",
          "카테고리": "分類",
          "카테고리 선택": "選擇分類",
          "필수": "必填",
          "(필수)": "(必填)",
          "[필수]": "[必填]",
          "불러오는 중…": "載入中…",
          "검사 중…": "檢查中…",
          "이메일": "電子郵件",
          "비밀번호": "密碼",
          "비밀번호 변경": "變更密碼",
          "전화번호": "電話號碼",
          "로그인 기록": "登入紀錄",
          "문의하기": "聯絡我們",
          "버그 신고": "回報問題",
          "이용약관": "服務條款",
          "서비스 이용약관": "服務條款",
          "개인정보 처리방침": "隱私權政策",
          "찬성": "贊成",
          "반대": "反對",
          "👍 찬성이오": "👍 我贊成",
          "👎 난 반댈세": "👎 我反對",
          "👍 진영": "👍 贊成陣營",
          "👎 진영": "👎 反對陣營",
          "나의 입장": "我的立場",
          "이슈 설명": "議題說明",
          "한줄 요약": "一句話摘要",
          "개 의견": "則意見",
          "좋아요": "讚",
          "팔로워": "粉絲",
          "핫트렌드": "熱門趨勢",
          "핫튜브": "熱門影片",
          "숏판": "短版",
          "롱판": "長版",
          "갈비스와 얘기": "跟 Galvis 聊聊",
          "정치": "政治",
          "사회": "社會",
          "경제": "經濟",
          "투자": "投資",
          "직장": "職場",
          "연애": "戀愛",
          "결혼": "結婚",
          "일상": "日常",
          "엔터": "娛樂",
          "스포츠": "運動",
          "여행": "旅遊",
          "맛집": "美食",
          "인간관계": "人際關係",
          "가치·논쟁": "價值與辯論",
          "불만·푸념": "抱怨",
          "커리어·이직": "職涯",
          "결혼·육아": "婚姻與育兒",
          "정치·사회": "政治與社會",
          "경제·투자": "經濟與投資",
          "엔터·스포츠": "娛樂與運動",
          "연애·결혼": "戀愛與婚姻",
          "생활·일상": "生活日常",
          "패션·뷰티": "時尚美妝",
          "직장·경력": "職場與職涯",
          "세계·여행": "世界與旅遊",
          "음식·맛집": "美食餐廳",
          "19금": "限制級",
          "📷 사진": "📷 照片",
          "🎬 동영상": "🎬 影片",
          "사진·영상 올리기": "上傳照片影片",
          "미디어": "媒體",
          "마이크": "麥克風",
          "카메라": "相機",
          "👁 미리보기": "👁 預覽",
          "여기에 놓아 업로드": "拖曳到這裡上傳",
          "굵게": "粗體",
          "기울임": "斜體",
          "취소선": "刪除線",
          "인용": "引用",
          "목록": "清單",
          "링크": "連結",
          "✨ AI에게 글 다듬기": "✨ 用 AI 潤稿",
          "AI 실행": "執行 AI",
          "AI 적용하기": "套用",
          "내가 쓴 글": "我寫的",
          "어조 강도": "語氣強度",
          "매우 공격적": "非常尖銳",
          "공격적": "尖銳",
          "중간": "中等",
          "온화한": "溫和",
          "매우 온화한": "非常溫和",
          "크리에이터 센터": "創作者中心",
          "정산 내역": "結算紀錄",
          "출금 요청": "提領",
          "출금 요청하기": "申請提領",
          "출금 가능 금액": "可提領金額",
          "은행 선택": "選擇銀行",
          "후원 전용": "僅限贊助",
          "기부처를 선택하세요": "選擇捐款對象",
          "사회복지": "社會福利",
          "장애인 지원": "身心障礙支援",
          "환경 보호": "環境保護",
          "재난·긴급구호": "災害緊急救助",
          "동물 보호": "動物保護",
          "아동·청소년 지원": "兒少支援",
          "교육 및 문화": "教育文化",
          "헌혈·재능기부": "捐血與技能捐贈",
          "데일리 퀘스트": "每日任務",
          "획득": "已獲得",
          "미획득": "未獲得",
          "나의 갈라 성향": "我的 GALLA 傾向",
          "관제센터": "管理中心",
          "탭 순서 편집": "編輯分頁順序",
          "홈 화면에 추가": "加到主畫面",
          "여론이 에너지가 되는 곳": "讓輿論成為能量的地方",
          "갈라 광장은 찬반 없는 자유 토론 공간입니다.": "廣場是沒有正反方的自由討論空間。",
          "갈라 광장에 글쓰기": "發文到廣場",
          "입장 없이 쟁점만 정리": "只整理爭點",
          "찬성 입장에서 주장 강화": "強化贊成方",
          "반대 입장에서 주장 강화": "強化反對方",
          "찬성·반대 양쪽 논리 모두 제시": "呈現正反雙方",
          "독자가 판단하게 질문형 구성": "讓讀者自己判斷",
          "발행 전 적합성 검사": "發布前檢查",
          "최종 발행": "正式發布",
          "알려주세요": "告訴我們",
          "그래도 안 되면": "還是不行的話",
          "통합검색": "整合搜尋",
          "갈라뉴스": "GALLA 新聞",
          "최근 검색어": "最近搜尋",
          "실시간 검색어": "即時熱搜",
          "전체삭제": "全部清除",
          "접어두기": "收合",
          "더 이상 안 보기": "不再顯示",
          "후끈": "熱門",
          "최신": "最新",
          "조회": "最多瀏覽",
          "추천": "推薦",
          "비추천": "不推",
          "커뮤 HOT": "社群熱門",
          "광장에서 검색": "在廣場搜尋",
          "갈라뉴스에서 검색": "搜尋新聞",
          "기사 링크나 글을 붙여넣어": "貼上連結或文字",
          "친구한테 아무 말이나 해봐": "跟朋友說說話",
          "리얼보이스 켜기/끄기": "切換真實語音",
          "참여": "參與",
          "참전": "參戰",
          "리믹스": "混編",
          "댓글": "留言",
          "답글": "回覆",
          "신고": "檢舉",
          "삭제": "刪除",
          "수정": "編輯",
          "확인": "確認",
          "다음": "下一步",
          "이전": "上一步",
          "완료": "完成",
          "프로필": "個人檔案",
          "마이페이지": "我的頁面",
          "팔로잉": "追蹤中",
          "북마크": "收藏",
          "상점": "商店",
          "충전": "儲值",
          "후원": "贊助",
          "오늘": "今天",
          "어제": "昨天",
          "방금": "剛剛",
          "분 전": "分鐘前",
          "시간 전": "小時前",
          "일 전": "天前",
          "결과가 없어요": "沒有結果",
          "아직 없어요": "目前還沒有",
          "다시 시도": "重試",
          "새로고침": "重新整理",
          "로그아웃": "登出",
          "계정": "帳號",
          "언어": "語言",
          "표시 언어": "顯示語言",
          "트렌드 이렇게 놀아요": "趨勢這樣玩",
          "이슈·예측·뉴스·유튜브·광장까지 한 방에 검색.": "議題、預測、新聞、影片、廣場一次搜尋。",
          "지금 뜨는 실시간 키워드. 트민남·트민녀 필수 코스.": "即時熱門關鍵字，追趨勢必看。",
          "여러 기사를 AI가 3줄로 씹어서 떠먹여줘요.": "AI 把多篇報導濃縮成三行。",
          "지금 터지는 유튜브 인기 영상 몰아보기.": "一次看完現在爆紅的 YouTube 影片。",
          "글·짤·밈으로 노는 갈라 커뮤니티. 글도 바로 써요.": "用文字、圖片、迷因玩的 GALLA 社群，也能馬上發文。",
          "사진·동영상·링크와 함께 자유롭게 이야기를 나눠요.": "可以自由分享照片、影片和連結。",
          "로그인이 필요합니다.": "請先登入。",
          "로그인이 필요해요.": "請先登入。",
          "로그인 후 투표할 수 있습니다.": "登入後才能投票。",
          "잘못된 접근입니다.": "無效的存取。",
          "링크가 복사되었습니다.": "已複製連結。",
          "링크를 복사했어요": "已複製連結",
          "갈라 공유 링크를 복사했어요": "已複製 GALLA 連結",
          "🔗 댓글 링크 복사됨": "🔗 已複製留言連結",
          "링크 복사에 실패했습니다.": "無法複製連結。",
          "링크 복사 실패": "複製失敗",
          "오류가 발생했습니다.": "發生錯誤。",
          "처리 실패": "處理失敗",
          "잠시 후 다시 시도해주세요.": "請稍後再試。",
          "등록 실패": "發布失敗",
          "삭제 실패": "刪除失敗",
          "삭제됨": "已刪除",
          "댓글 등록 실패": "留言發布失敗",
          "투표 처리 실패": "投票失敗",
          "설정을 저장하지 못했어요": "無法儲存設定",
          "재생하지 못했어요": "無法播放",
          "전환에 실패했어요": "切換失敗",
          "충전 준비에 실패했어요.": "儲值準備失敗。",
          "육성 난장 개설에 실패했어요.": "無法開啟語音房。",
          "의견을 입력하세요.": "請先輸入內容。",
          "제목을 입력해주세요": "請輸入標題",
          "이슈 설명을 입력해주세요": "請填寫議題說明",
          "기부처를 선택해주세요": "請選擇捐款對象",
          "영상 파일을 선택해주세요.": "請選擇影片檔案。",
          "가로 영상을 올려주세요.": "請上傳橫向影片。",
          "사진이나 영상을 1개 이상 올려주세요.": "請至少上傳一張照片或影片。",
          "이 이슈에 대한 나의 입장을 선택해주세요": "請選擇你在這個議題的立場",
          "성별을 선택해주세요. (여론 통계에 필요해요)": "請選擇性別（輿論統計需要）。",
          "사는 지역을 선택해주세요. (여론 통계에 필요해요)": "請選擇居住地區（輿論統計需要）。",
          "먼저 이 이슈에 투표해 진영을 정해야 참전할 수 있어요.": "要先投票選邊才能參戰。",
          "이 브라우저에선 통화를 지원하지 않아요": "這個瀏覽器不支援通話",
          "카메라를 켤 수 없어요": "無法開啟相機",
          "📹 면상톡으로 전환했어요": "📹 已切換為視訊",
          "📞 음성 통화로 전환했어요": "📞 已切換為語音",
          "비밀대화에선 텍스트만 보낼 수 있어요 (암호화 보장)": "密聊只能傳文字（端對端加密）",
          "🚫 방장이 내보냈어요": "🚫 房主已將你移除",
          "이 브라우저는 패스키를 지원하지 않아요.": "這個瀏覽器不支援密碼金鑰。",
          "수정 실패:": "編輯失敗：",
          "정산 실패:": "結算失敗：",
          "업로드 실패:": "上傳失敗："
      }
  };

  /* 현재 언어 — 우선순위: 유저가 고른 값 > 브라우저 > 기본
     ⚠️ 서버의 users.locale이 최종 진실이다. 로그인 후 GALLA_setLocale로 맞춰준다. */
  function detect() {
    try {
      var saved = localStorage.getItem("galla_locale");
      if (saved) return saved;
    } catch (e) {}
    var nav = (navigator.language || "ko").toLowerCase();
    if (nav.indexOf("ko") === 0) return "ko";
    if (nav.indexOf("ja") === 0) return "ja";
    /* ⚠️ 중국어는 지역이 문자를 결정한다 — 대만·홍콩은 번체(Hant), 본토는 간체(Hans).
       'zh'로 뭉뚱그리면 대만 유저에게 간체가 나간다. */
    if (nav.indexOf("zh") === 0) {
      if (nav.indexOf("tw") >= 0 || nav.indexOf("hant") >= 0) return "zh-TW";
      if (nav.indexOf("hk") >= 0 || nav.indexOf("mo") >= 0) return "zh-HK";
      return "zh-CN";
    }
    if (nav.indexOf("en") === 0) return "en";
    return FALLBACK;
  }

  var current = detect();

  /* 번역 — 없으면 한국어 원문 그대로. 절대 빈 문자열을 돌려주지 않는다(화면이 사라지는 게 최악). */
  /* 이모지·기호가 앞에 붙은 라벨(🔥 후끈, 👍 진영, 📷 사진)은 이 코드베이스에 흔하다.
     사전에 통째로 넣으면 이모지가 바뀔 때마다 깨지므로, 앞머리를 떼고 한 번 더 찾는다.
     ⚠️ 이모지는 그대로 두고 뒤 글자만 바꾼다 — 아이콘은 언어와 무관하다. */
  var LEAD = /^([\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}·]+)(.+)$/u;
  function t(ko, vars) {
    var out = ko;
    var d = DICT[current];
    if (d && Object.prototype.hasOwnProperty.call(d, ko)) out = d[ko];
    else if (d) {
      var mm = String(ko).match(LEAD);
      if (mm && Object.prototype.hasOwnProperty.call(d, mm[2].trim())) out = mm[1] + d[mm[2].trim()];
      else {
        /* "수정 실패: TypeError…" 처럼 뒤에 상세가 붙는 메시지 — 앞머리만 옮기고 상세는 그대로 둔다.
           ⚠️ ':'로 끝나는 키에만 적용한다. 아무 접두나 허용하면 엉뚱한 문장이 잘린다. */
        var src = String(ko);
        for (var k in d) {
          if (k.slice(-1) !== ":" || k.length < 4) continue;
          if (src.indexOf(k) === 0) { out = d[k] + src.slice(k.length); break; }
        }
      }
    }
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        out = out.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return out;
  }

  /* 서버 설정(상담번호·통화·시간대) — 클라이언트가 따로 정의하지 않는다.
     실패해도 화면이 죽지 않게 항상 객체를 돌려준다. */
  var _cfg = null;
  function config() {
    if (_cfg) return Promise.resolve(_cfg);
    try {
      var SB = window.GALLA_SUPABASE_URL || (window.__GALLA__ && window.__GALLA__.url);
      var KEY = window.GALLA_ANON_KEY || (window.__GALLA__ && window.__GALLA__.anon);
      if (!SB || !KEY) return Promise.resolve({});
      return fetch(SB + "/rest/v1/rpc/locale_config", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY },
        body: JSON.stringify({ p_locale: current })
      }).then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) { _cfg = j || {}; return _cfg; })
        .catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }

  function setLocale(loc) {
    if (!loc || loc === current) return;
    current = loc; _cfg = null;
    try { localStorage.setItem("galla_locale", loc); } catch (e) {}
    document.documentElement.setAttribute("lang", loc);
    try { window.dispatchEvent(new CustomEvent("galla:locale", { detail: loc })); } catch (e) {}
  }

  /* 숫자·통화·날짜 — 나라마다 표기가 다르다. 여기 한 곳에서만 만든다. */
  function money(amount) {
    var DEFAULT_CUR = { ko: "KRW", ja: "JPY", "zh-TW": "TWD", "zh-HK": "HKD", "zh-CN": "CNY", en: "USD" };
    var cur = (_cfg && _cfg.currency) || DEFAULT_CUR[current] || "USD";
    try {
      return new Intl.NumberFormat(current, { style: "currency", currency: cur,
        maximumFractionDigits: cur === "KRW" || cur === "JPY" ? 0 : 2 }).format(amount);
    } catch (e) { return String(amount); }
  }
  function when(iso, opts) {
    try {
      return new Intl.DateTimeFormat(current, Object.assign(
        { dateStyle: "medium", timeStyle: "short",
          timeZone: (_cfg && _cfg.tz) || "Asia/Seoul" }, opts || {})).format(new Date(iso));
    } catch (e) { return String(iso || ""); }
  }

  /* data-i18n 속성이 붙은 요소를 일괄 번역 — 새로 만드는 화면은 이걸 쓰면 코드가 안 지저분해진다.
     <span data-i18n>로그인</span>  ← 원문을 그대로 두고 감싸기만 한다 */
  /* 🖥 화면 문구 일괄 치환 — 208개 파일을 고치지 않고 적용한다.
   *
   *  ⚠️ 안전 규칙(이거 없으면 유저 글까지 번역해버린다):
   *   1) **사전에 있는 문구와 정확히 일치할 때만** 바꾼다. 부분 일치·유사 매칭 금지.
   *   2) 유저가 쓴 내용이 들어가는 곳은 건드리지 않는다(글 본문·댓글·채팅 말풍선·입력창).
   *   3) 한 번 바꾼 노드는 원문을 남겨둔다(언어를 다시 바꿔도 복구된다).
   *  ⚠️ 피드는 나중에 그려지므로 MutationObserver로 새로 붙는 노드도 훑는다.
   */
  var SKIP_TAG = /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/;
  var SKIP_SEL = "[data-no-i18n],[contenteditable],.post-body,.plaza-body,.issue-body," +
                 ".comment,.comment-body,.msg,.bubble,.chat,.fr-msg,.dm-msg,.user-content";
  function inSkipZone(el) {
    try { return !!(el && el.closest && el.closest(SKIP_SEL)); } catch (e) { return false; }
  }
  function apply(root) {
    if (current === FALLBACK) return;                     // 한국어면 할 일이 없다
    var scope = root || document.body;
    if (!scope) return;
    try {
      /* ① data-i18n 명시 요소(새로 만드는 화면용) */
      (scope.querySelectorAll ? scope.querySelectorAll("[data-i18n]") : []).forEach(function (el) {
        var src = el.getAttribute("data-i18n-src") || el.textContent.trim();
        if (!el.getAttribute("data-i18n-src")) el.setAttribute("data-i18n-src", src);
        el.textContent = t(src);
      });
      /* ② 텍스트 노드 — 사전에 정확히 일치하는 것만 */
      var w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var v = n.nodeValue && n.nodeValue.trim();
          if (!v || v.length > 40) return NodeFilter.FILTER_REJECT;
          var pe = n.parentElement;
          if (!pe || SKIP_TAG.test(pe.tagName) || inSkipZone(pe)) return NodeFilter.FILTER_REJECT;
          return (t(v) !== v) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var hits = [], n;
      while ((n = w.nextNode())) hits.push(n);
      hits.forEach(function (node) {
        var v = node.nodeValue.trim();
        var pe = node.parentElement;
        if (pe && !pe.getAttribute("data-i18n-src")) pe.setAttribute("data-i18n-src", v);
        node.nodeValue = node.nodeValue.replace(v, t(v));
      });
      /* ③ 인라인 태그(<b>·<span>)로 쪼개진 문장 — 텍스트 노드 단위로는 절대 못 잡는다.
         예: "이슈·예측…까지 <b>한 방에 검색</b>" → 조각 두 개로 보인다.
         자식이 인라인뿐인 요소에 한해 **전체 문장**으로 사전을 찾고, 맞으면 통째로 바꾼다.
         ⚠️ 블록 요소(div·li)까지 하면 유저 콘텐츠를 삼킬 수 있어 인라인만 허용한다. */
      var INLINE_ONLY = /^(B|STRONG|EM|I|SPAN|SMALL|U|MARK|BR)$/;
      (scope.querySelectorAll ? scope.querySelectorAll("p,h1,h2,h3,h4,h5,dt,dd,label,figcaption,span") : []).forEach(function (el) {
        if (inSkipZone(el) || el.hasAttribute("data-i18n-done")) return;
        var kids = [].slice.call(el.children);
        if (!kids.length || !kids.every(function (c) { return INLINE_ONLY.test(c.tagName); })) return;
        var full = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!full || full.length > 60) return;
        /* ⚠️ span은 화면 어디에나 있다 → 여기선 이모지 완화 없이 **사전 정확 일치**만 허용한다.
           그래야 유저가 쓴 짧은 글이 우연히 바뀌는 일이 없다. */
        var dd = DICT[current];
        if (!dd || !Object.prototype.hasOwnProperty.call(dd, full)) return;
        var tr = dd[full];
        if (tr === full) return;
        el.setAttribute("data-i18n-src", full);
        el.setAttribute("data-i18n-done", "1");
        el.textContent = tr;      // 인라인 강조는 잃지만, 읽히는 게 우선이다
      });

      /* ④ 속성(placeholder·title·aria-label) */
      ["placeholder", "title", "aria-label"].forEach(function (attr) {
        (scope.querySelectorAll ? scope.querySelectorAll("[" + attr + "]") : []).forEach(function (el) {
          if (inSkipZone(el)) return;
          var v = (el.getAttribute(attr) || "").trim();
          if (v && t(v) !== v) el.setAttribute(attr, t(v));
        });
      });
    } catch (e) {}
  }
  /* 피드·모달은 나중에 그려진다 → 새로 붙는 노드만 훑는다(전체 재스캔은 비싸다) */
  var _pending = null;
  function watch() {
    if (current === FALLBACK || !window.MutationObserver) return;
    try {
      new MutationObserver(function (muts) {
        if (_pending) return;
        var any = muts.some(function (m) { return m.addedNodes && m.addedNodes.length; });
        if (!any) return;
        _pending = setTimeout(function () { _pending = null; apply(); }, 120);
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* 🔎 읽기 필터 — 탐색 화면(검색·피드·추천)이 '내 언어 콘텐츠'만 보게 한다.
   *
   *  ⚠️ 지원 언어가 하나뿐이면 **아무것도 하지 않는다.** 지금(ko 전용)은 완전한 no-op이라
   *     넣어도 위험이 없고, 두 번째 언어를 여는 순간 자동으로 작동한다.
   *  ⚠️ 어디에 걸지가 중요하다:
   *      · 걸어야 할 곳 = 탐색(검색 결과·인기 피드·온보딩 추천) — 남의 콘텐츠를 발견하는 자리
   *      · 걸면 안 되는 곳 = 내 글 목록(mypage), 링크로 연 개별 글/영상(watch)
   *        → 내가 쓴 글이 안 보이거나, 공유받은 링크가 안 열리는 버그가 된다.
   */
  var _enabled = null;
  /* ⚠️ i18n.js는 nav.js가 주입하므로 supabase 설정보다 먼저 뜰 수 있다.
   *    처음엔 window.GALLA_SUPABASE_URL을 봤는데 그 시점엔 없어서 목록을 영영 못 읽었다(브라우저 실측: null).
   *    → 공용 클라이언트가 준비될 때까지 짧게 기다렸다 RPC로 읽는다. */
  (function loadEnabled(tries) {
    tries = tries || 0;
    try {
      var c = window.supabaseClient || window.GALLA_SB;
      if (c && typeof c.rpc === "function") {
        c.rpc("enabled_locales").then(function (r) {
          var j = r && r.data;
          if (j && Array.isArray(j.enabled)) _enabled = j.enabled;
        }).catch(function () {});
        return;
      }
    } catch (e) {}
    if (tries < 40) setTimeout(function () { loadEnabled(tries + 1); }, 250);   // 최대 10초
  })();

  function lfilter(q) {
    try {
      if (!q || typeof q.in !== "function") return q;      // PostgREST 빌더가 아니면 그대로
      if (!_enabled || _enabled.length < 2) return q;       // 언어가 하나뿐 → 아무것도 하지 않는다
      return q.in("locale", [current]);
    } catch (e) { return q; }
  }

  /* 🔔 alert·confirm·토스트를 감싼다 — 호출부 380여 곳을 고치지 않는다.
     ⚠️ 원본을 보관했다가 그대로 호출한다(동작은 1도 안 바뀌고 문구만 통과시킨다). */
  (function wrapDialogs() {
    if (current === FALLBACK) return;                 // 한국어면 감쌀 이유가 없다
    try {
      var _alert = window.alert.bind(window);
      window.alert = function (m) { return _alert(typeof m === "string" ? t(m) : m); };
      var _confirm = window.confirm.bind(window);
      window.confirm = function (m) { return _confirm(typeof m === "string" ? t(m) : m); };
    } catch (e) {}
    /* GALLA_toast는 나중에(supabase.js) 정의되므로 준비되면 감싼다 */
    var tries = 0;
    (function wrapToast() {
      if (window.GALLA_toast && !window.GALLA_toast.__i18n) {
        var _t = window.GALLA_toast;
        window.GALLA_toast = function (m, ms) { return _t(typeof m === "string" ? t(m) : m, ms); };
        window.GALLA_toast.__i18n = true;
        return;
      }
      if (tries++ < 40) setTimeout(wrapToast, 250);
    })();
  })();

  window.GALLA_t = t;
  window.GALLA_lfilter = lfilter;
  window.GALLA_enabledLocales = function () { return _enabled ? _enabled.slice() : null; };
  window.GALLA_locale = function () { return current; };
  window.GALLA_setLocale = setLocale;
  window.GALLA_localeConfig = config;
  window.GALLA_money = money;
  window.GALLA_when = when;
  window.GALLA_applyI18n = apply;

  try { document.documentElement.setAttribute("lang", current); } catch (e) {}
  if (current !== FALLBACK) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { apply(); watch(); });
    } else { apply(); watch(); }
  }
})();
