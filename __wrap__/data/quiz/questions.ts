export type MultipleChoiceQuestion = {
  id: string
  type: 'multiple-choice'
  text: string
  options: string[]
  correctIndex: number
  explanation: string
}

export type TrueFalseQuestion = {
  id: string
  type: 'true-false'
  text: string
  /** `true` 代表題目敘述正確（洗牌後 shuffledCorrectIndex = 0），`false` 代表敘述錯誤（shuffledCorrectIndex = 1）。 */
  correct: boolean
  explanation: string
}

export type Question = MultipleChoiceQuestion | TrueFalseQuestion

/**
 * 洗牌後的題目。
 * - `multiple-choice`：選項已 Fisher-Yates 洗牌，`shuffledCorrectIndex` 為洗牌後正確選項的索引。
 * - `true-false`：選項固定為 `["正確", "錯誤"]`（index 0 / 1），`shuffledCorrectIndex` 為 0（答案為正確）或 1（答案為錯誤）。
 */
export type ShuffledQuestion = (
  | Omit<MultipleChoiceQuestion, 'correctIndex'>
  | TrueFalseQuestion
) & { shuffledCorrectIndex: number }

export const QUESTION_BANK: readonly Question[] = [
  // 球場規則（4 題）
  {
    id: 'court-01',
    type: 'multiple-choice',
    text: '標準匹克球場（雙打）的尺寸是？',
    options: [
      '6.1 公尺 × 13.4 公尺',
      '7 公尺 × 14 公尺',
      '5.5 公尺 × 12 公尺',
      '6 公尺 × 14.6 公尺',
    ],
    correctIndex: 0,
    explanation:
      '標準匹克球場為 20 英尺 × 44 英尺，約合 6.1 公尺 × 13.4 公尺，與羽球場尺寸相近。',
  },
  {
    id: 'court-02',
    type: 'multiple-choice',
    text: '非截擊區（Kitchen）從網子往後延伸多少距離？',
    options: [
      '2.13 公尺（7 英尺）',
      '1.83 公尺（6 英尺）',
      '2.5 公尺',
      '3 公尺',
    ],
    correctIndex: 0,
    explanation:
      'Kitchen（非截擊區）從網子向兩側各延伸 7 英尺（約 2.13 公尺），是匹克球場最關鍵的戰略區域。',
  },
  {
    id: 'court-03',
    type: 'true-false',
    text: '匹克球單打與雙打使用相同尺寸的場地。',
    correct: true,
    explanation:
      '匹克球單打和雙打都在同一塊 20×44 英尺的場地進行，與網球不同，沒有另外的單打邊線。',
  },
  {
    id: 'court-04',
    type: 'multiple-choice',
    text: '匹克球網的中心高度是多少？',
    options: [
      '86 公分（34 英吋）',
      '91.44 公分（36 英吋）',
      '80 公分（31.5 英吋）',
      '100 公分（39 英吋）',
    ],
    correctIndex: 0,
    explanation:
      '球網中心高度為 34 英吋（約 86 公分），柱子兩側高度為 36 英吋（91.44 公分），中間稍低。',
  },
  // 發球規則（5 題）
  {
    id: 'serve-01',
    type: 'multiple-choice',
    text: '發球時，球拍擊球點必須在身體哪個部位以下？',
    options: ['腰部', '肩膀', '胸部', '手肘'],
    correctIndex: 0,
    explanation:
      '匹克球規定發球必須為下手式（underhand），擊球點必須在腰部（肚臍）以下。',
  },
  {
    id: 'serve-02',
    type: 'true-false',
    text: '發球時，發球員的雙腳都必須在底線後方，不得踩線。',
    correct: true,
    explanation:
      '發球時雙腳必須在底線後方，且不得踩踏或越過底線及中線延伸線，直到球被擊出為止。',
  },
  {
    id: 'serve-03',
    type: 'multiple-choice',
    text: '發球應落在哪個區域才算有效？',
    options: [
      '斜對角的發球區（非截擊區以外）',
      '對方場地任意位置',
      '非截擊區（Kitchen）內',
      '底線後方',
    ],
    correctIndex: 0,
    explanation:
      '發球必須落在斜對角的發球區內，且不得落在非截擊區（Kitchen）內或其邊線上。',
  },
  {
    id: 'serve-04',
    type: 'true-false',
    text: '依 2021 年後的官方規則，發球時球碰到網頂後落入正確發球區，算有效球，比賽繼續。',
    correct: true,
    explanation:
      'USA Pickleball 自 2021 年 1 月起廢除讓球（Let serve）規則，發球碰網後落入正確區域視為有效球，比賽繼續，不再重新發球。',
  },
  {
    id: 'serve-05',
    type: 'multiple-choice',
    text: '發球時球落在非截擊區邊線（Kitchen line）上，算什麼結果？',
    options: ['失誤，換邊發球', '界內，繼續比賽', '讓球，重新發球', '得分'],
    correctIndex: 0,
    explanation:
      '發球時球落在非截擊區任何邊線上（包括 Kitchen line）皆視為落入 Kitchen，判發球失誤，換邊發球。',
  },
  // 計分規則（4 題）
  {
    id: 'score-01',
    type: 'multiple-choice',
    text: '在傳統計分制（Traditional Scoring）中，哪一方才能得分？',
    options: ['只有發球方', '只有接球方', '任何一方都可以', '由裁判決定'],
    correctIndex: 0,
    explanation:
      '傳統計分制中，只有正在發球的一方才能得分；接球方贏得 rally 只會獲得發球權，不得分。',
  },
  {
    id: 'score-02',
    type: 'multiple-choice',
    text: '匹克球比賽通常需要幾分獲勝（且必須領先 2 分）？',
    options: ['11 分', '15 分', '21 分', '9 分'],
    correctIndex: 0,
    explanation:
      '標準比賽以 11 分為目標，且必須比對手至少領先 2 分才算獲勝；部分賽事採 15 或 21 分制。',
  },
  {
    id: 'score-03',
    type: 'true-false',
    text: '雙打比賽中，報分格式為三個數字，例如「5-3-2」。',
    correct: true,
    explanation:
      '雙打報分格式為「我方分–對方分–發球員編號」，例如「5-3-2」代表我方 5 分、對方 3 分、目前是 2 號球員發球。',
  },
  {
    id: 'score-04',
    type: 'multiple-choice',
    text: '雙打比賽報分中，第三個數字代表什麼？',
    options: [
      '發球員編號（1 或 2）',
      '目前打的局數',
      '讓分優勢',
      '換邊次數',
    ],
    correctIndex: 0,
    explanation:
      '第三個數字是發球員編號：每隊各有 1 號和 2 號發球員，1 號先發，該局失去發球權後換 2 號，再失去才換邊。',
  },
  // 違規與犯規（5 題）
  {
    id: 'foul-01',
    type: 'true-false',
    text: '球落在邊線（sideline）或底線（baseline）上算界內。',
    correct: true,
    explanation:
      '落在任何界線上的球都算界內（除了發球時落在非截擊區邊線上的特例）。',
  },
  {
    id: 'foul-02',
    type: 'multiple-choice',
    text: '下列哪種行為一定是犯規？',
    options: [
      '在非截擊區（Kitchen）內截擊飛行中的球（Volley）',
      '在底線附近截擊飛行中的球',
      '反手截擊飛行中的球',
      '站在非截擊區內打落地球',
    ],
    correctIndex: 0,
    explanation:
      '在非截擊區內截擊（Volley，球未落地就打）是最常見的違規（Kitchen violation）；但進入 Kitchen 打落地球是合法的。',
  },
  {
    id: 'foul-03',
    type: 'true-false',
    text: '比賽中球碰到網頂後落入對方場地界內，算有效球，比賽繼續。',
    correct: true,
    explanation:
      '一般回擊時球碰網後落入對方界內是合法球，比賽繼續進行。',
  },
  {
    id: 'foul-04',
    type: 'multiple-choice',
    text: '雙打中，接球方的隊友（非接球員）在比賽開始前可以站在哪裡？',
    options: [
      '場內任何合法位置',
      '只能站在非截擊區',
      '必須站在底線後方',
      '只能站在自己的發球區',
    ],
    correctIndex: 0,
    explanation:
      '接球方隊友（非接球員）可以站在場內任何合法位置；只有發球員本身的站位有嚴格規定（底線後方）。',
  },
  {
    id: 'foul-05',
    type: 'true-false',
    text: '球員的腳踩進非截擊區，不論是否截擊都算犯規。',
    correct: false,
    explanation:
      '只有在截擊（Volley）時踩入或觸碰非截擊區才犯規；非截擊時進入 Kitchen 完全合法，例如打落地球時可以走進去。',
  },
  // 球拍與器材（4 題）
  {
    id: 'equip-01',
    type: 'multiple-choice',
    text: '與玻璃纖維球拍相比，碳纖維球拍的特性是？',
    options: [
      '更硬、觸感更有控制感',
      '更軟、彈性更好、球速更快',
      '更重、更耐用',
      '更便宜、適合初學者',
    ],
    correctIndex: 0,
    explanation:
      '碳纖維面板較玻纖更硬、更薄，提供更精準的控球感與落點；玻纖較軟，擊球時更有彈力與爆發力。',
  },
  {
    id: 'equip-02',
    type: 'true-false',
    text: '匹克球是中空且帶有孔洞的塑膠球。',
    correct: true,
    explanation:
      '匹克球為中空硬質塑膠球，表面有 26–40 個圓形孔洞，外型類似有孔洞的高爾夫球但尺寸更大。',
  },
  {
    id: 'equip-03',
    type: 'multiple-choice',
    text: '依 USA Pickleball 規定，球拍的長度加上寬度總和上限是？',
    options: [
      '60.96 公分（24 英吋）',
      '55 公分（21.7 英吋）',
      '65 公分（25.6 英吋）',
      '70 公分（27.6 英吋）',
    ],
    correctIndex: 0,
    explanation:
      'USA Pickleball 規定球拍長度加寬度不得超過 24 英吋（60.96 公分），長度上限單獨為 17 英吋（43.18 公分）。',
  },
  {
    id: 'equip-04',
    type: 'true-false',
    text: '室外球的孔洞比室內球更小、數量更多，以增加抗風性。',
    correct: true,
    explanation:
      '室外球孔洞較小且較多，減少空氣阻力與風的影響；室內球孔洞較大、球體較軟，適合在木質地板室內場地使用。',
  },
  // 兩跳規則（3 題）
  {
    id: 'two-bounce-01',
    type: 'true-false',
    text: '發球後，接球方必須讓球先落地再擊球，不可直接截擊。',
    correct: true,
    explanation:
      '兩跳規則（Two-Bounce Rule）規定：發球後接球方必須讓球落地後才能擊球，這是強制規定。',
  },
  {
    id: 'two-bounce-02',
    type: 'true-false',
    text: '兩跳規則只約束接球方，發球方在接到回球時可以直接截擊。',
    correct: false,
    explanation:
      '兩跳規則約束雙方：接球方必須讓發球落地，發球方也必須讓回球落地後才能擊球，之後雙方才可自由截擊。',
  },
  {
    id: 'two-bounce-03',
    type: 'multiple-choice',
    text: '兩跳規則（Two-Bounce Rule）的正確說明是？',
    options: [
      '發球後，接球方與發球方各須讓球落地一次，之後才可截擊',
      '比賽中每一球都必須讓它彈跳兩次才能擊打',
      '只有發球時適用，後續回球不受限制',
      '接球方須讓球彈跳兩次後才能回擊',
    ],
    correctIndex: 0,
    explanation:
      '兩跳規則確保前兩拍必須是落地球：接球方先讓發球落地，發球方再讓回球落地，之後雙方均可截擊。',
  },
]
