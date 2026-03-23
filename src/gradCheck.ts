/**
 * 卒業要件計算ロジック（工学システム学類）
 * backend/grad_check.py からの TypeScript 移植
 */
import Papa from 'papaparse'

// ============================================================
// 型定義
// ============================================================

export interface Course {
  code: string
  name: string
  credits: number
  grade: string
  year: number
  passed: boolean
}

interface CodeEntry {
  name: string
  credits: number
}

interface JikkenGroup {
  name: string
  credits: number
  codes: string[]
}

interface SentakuSub {
  name: string
  prefixes: string[]
  min: number
}

interface MajorDef {
  name: string
  jikken: JikkenGroup[]
  sentaku_sub: SentakuSub[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnalysisResult = Record<string, any>

// ============================================================
// 卒業要件定義
// ============================================================

const SENMON_KISO_CODES: Record<string, CodeEntry> = {
  'FA011C1': { name: '数学リテラシー1', credits: 1 },
  'FA012D1': { name: '数学リテラシー2', credits: 1 },
  'FA016D1': { name: '線形代数1', credits: 1 },
  'FA017D1': { name: '線形代数2', credits: 1 },
  'FA018D1': { name: '線形代数3', credits: 1 },
  'FA013D1': { name: '微積分1', credits: 1 },
  'FA014D1': { name: '微積分2', credits: 1 },
  'FA015C1': { name: '微積分3', credits: 1 },
  'FCB1201': { name: '力学1', credits: 1 },
  'FCB1261': { name: '力学2', credits: 1 },
  'FCB1281': { name: '力学3', credits: 1 },
  'FCB1301': { name: '電磁気学1', credits: 1 },
  'FCB1341': { name: '電磁気学2', credits: 1 },
  'FCB1391': { name: '電磁気学3', credits: 1 },
  'FG16051': { name: '工学システム概論', credits: 1 },
  'FG10651': { name: '工学システム原論', credits: 1 },
  'FG10704': { name: '線形代数総論A', credits: 1 },
  'FG10724': { name: '線形代数総論B', credits: 2 },
  'FG10744': { name: '解析学総論', credits: 1 },
  'FG10764': { name: '常微分方程式', credits: 2 },
  'FG10814': { name: '力学総論', credits: 1 },
  'FG10834': { name: '電磁気学総論', credits: 1 },
  'FG10864': { name: '材料力学基礎', credits: 1 },
  'FG10911': { name: '熱力学基礎', credits: 1 },
  'FG10851': { name: '流体力学基礎', credits: 1 },
  'FG10784': { name: '複素解析', credits: 2 },
  'FG10874': { name: 'プログラミング序論A', credits: 2 },
  'FG10904': { name: 'プログラミング序論B', credits: 1 },
}

const COMMON_SENMON_HISSHU: Record<string, CodeEntry> = {
  'FG19103': { name: '工学システム基礎実験A', credits: 2 },
  'FG19113': { name: '工学システム基礎実験B', credits: 2 },
  'FG18112': { name: '専門英語A', credits: 1 },
  'FG20222': { name: '専門英語B', credits: 1 },
  'FG20232': { name: '専門英語演習', credits: 1 },
  'FG20204': { name: 'プログラミング序論C', credits: 2 },
  'FG20214': { name: 'プログラミング序論D', credits: 1 },
}

const SOTSUKEN: [string, number][] = [['卒業研究A', 4], ['卒業研究B', 4]]
const RINRI: [string, number] = ['工学者のための倫理', 1]

export const MAJORS: Record<string, MajorDef> = {
  '知機': {
    name: '知的・機能工学システム主専攻',
    jikken: [
      { name: '知的・機能工学システム実験', credits: 6, codes: ['FG29213', 'FG39213'] },
    ],
    sentaku_sub: [
      { name: '設計・システム系 (FG11/FG21)', prefixes: ['FG11', 'FG21'], min: 6 },
      { name: '材料・バイオ系 (FG12/FG22)', prefixes: ['FG12', 'FG22'], min: 1 },
      { name: '実務系 (FG13/FG23)', prefixes: ['FG13', 'FG23'], min: 1 },
      { name: '情報・数理系 (FG17/FG24/FG25)', prefixes: ['FG17', 'FG24', 'FG25'], min: 16 },
    ],
  },
  'エネメカ': {
    name: 'エネルギー・メカニクス主専攻',
    jikken: [
      { name: 'エネルギー・メカニクス専門実験', credits: 3, codes: ['FG49873', 'FG59873'] },
      { name: 'エネルギー・メカニクス応用実験', credits: 3, codes: ['FG49883', 'FG59883'] },
    ],
    sentaku_sub: [
      { name: '設計・システム系 (FG11/FG21)', prefixes: ['FG11', 'FG21'], min: 1 },
      { name: '材料・バイオ系 (FG12/FG22)', prefixes: ['FG12', 'FG22'], min: 6 },
      { name: '実務系 (FG13/FG23)', prefixes: ['FG13', 'FG23'], min: 1 },
      { name: '情報・数理系 (FG17/FG24/FG25)', prefixes: ['FG17', 'FG24', 'FG25'], min: 16 },
    ],
  },
}

const TOTAL_REQUIRED = 126
const SENMON_HISSHU_TOTAL = 25
const SENMON_KISO_TOTAL = 32
const KISO_KYOTSU_TOTAL = 13

const TAIIKU_KEYWORDS = [
  '体育', 'アスレティック', 'ハンドボール', 'シューティング',
  'バレーボール', 'バスケ', 'サッカー', 'テニス', 'バドミントン',
  'ダンス', '水泳', '柔道', '剣道', 'ゴルフ', 'スキー',
  'ラグビー', 'フットサル', '卓球', 'ソフトボール', 'アーチェリー',
]

// ============================================================
// CSV解析
// ============================================================

function fuzzyGet(row: Record<string, string>, key: string): string {
  for (const [k, v] of Object.entries(row)) {
    if (k.trim().includes(key)) return (v ?? '').trim()
  }
  return ''
}

function parseCSV(content: string): { courses: Record<string, Course>; studentName: string | null } {
  if (content.startsWith('\ufeff')) content = content.slice(1)

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })

  const courses: Record<string, Course> = {}
  let studentName: string | null = null

  for (const row of parsed.data) {
    const code = fuzzyGet(row, '科目番号')
    const name = fuzzyGet(row, '科目名')
    const credits = parseFloat(fuzzyGet(row, '単位数')) || 0
    const grade = fuzzyGet(row, '総合評価')
    const year = parseInt(fuzzyGet(row, '開講年度')) || 0
    const passed = grade !== 'D'

    if (!code) continue

    if (studentName === null) {
      const sn = fuzzyGet(row, '学生氏名')
      if (sn) studentName = sn
    }

    const entry: Course = { code, name, credits, grade, year, passed }

    if (code in courses) {
      const prev = courses[code]
      if (prev.passed && !passed) continue
      if (!prev.passed && passed) { courses[code] = entry; continue }
      if (year > prev.year) { courses[code] = entry; continue }
    } else {
      courses[code] = entry
    }
  }

  return { courses, studentName }
}

// ============================================================
// ヘルパー
// ============================================================

function getAllJikkenCodes(majorDef: MajorDef): Record<string, CodeEntry> {
  const codes: Record<string, CodeEntry> = {}
  for (const group of majorDef.jikken) {
    for (const code of group.codes) {
      codes[code] = { name: group.name, credits: group.credits }
    }
  }
  return codes
}

function getJikkenRequiredCredits(majorDef: MajorDef): number {
  return majorDef.jikken.reduce((sum, g) => sum + g.credits, 0)
}

function getJikkenMissing(majorDef: MajorDef, passedCodes: Record<string, unknown>) {
  const missing: { name: string; credits: number }[] = []
  for (const group of majorDef.jikken) {
    if (!group.codes.some(code => code in passedCodes)) {
      missing.push({ name: group.name, credits: group.credits })
    }
  }
  return missing
}

function detectMajor(courses: Record<string, Course>): string | null {
  for (const [majorKey, majorDef] of Object.entries(MAJORS)) {
    const jikkenCodes = getAllJikkenCodes(majorDef)
    for (const code of Object.keys(jikkenCodes)) {
      if (code in courses) return majorKey
    }
  }
  return null
}

function sumCredits(items: Record<string, Course>): number {
  return Object.values(items).reduce((s, c) => s + c.credits, 0)
}

function startsWithAny(str: string, prefixes: string[]): boolean {
  return prefixes.some(p => str.startsWith(p))
}

function buildNameSet(codes: Record<string, CodeEntry>): Set<string> {
  return new Set(Object.values(codes).map(e => e.name))
}

// ============================================================
// 科目分類
// ============================================================

function classifyCourses(courses: Record<string, Course>, majorKey: string) {
  const majorDef = MAJORS[majorKey]
  const jikkenCodes = getAllJikkenCodes(majorDef)
  const senmonHisshuCodes: Record<string, CodeEntry> = { ...COMMON_SENMON_HISSHU, ...jikkenCodes }
  const senmonHisshuNames = buildNameSet(senmonHisshuCodes)
  const senmonKisoNames = buildNameSet(SENMON_KISO_CODES)

  const result: Record<string, Record<string, Course>> = {
    senmon_hisshu: {},
    senmon_sentaku: {},
    senmon_kiso: {},
    kiso_kyotsu: {},
    kiso_sentaku: {},
    kanren: {},
    other: {},
    failed: {},
  }

  for (const [code, c] of Object.entries(courses)) {
    if (!c.passed) {
      result.failed[code] = c
      continue
    }

    if (code in senmonHisshuCodes || senmonHisshuNames.has(c.name)) {
      result.senmon_hisshu[code] = c
    } else if (code in SENMON_KISO_CODES || senmonKisoNames.has(c.name)) {
      result.senmon_kiso[code] = c
    } else if (code.startsWith('FG')) {
      result.senmon_sentaku[code] = c
    } else if (startsWithAny(code, ['1130', '1228'])) {
      result.kiso_kyotsu[code] = c
    } else if (TAIIKU_KEYWORDS.some(kw => c.name.includes(kw))) {
      result.kiso_kyotsu[code] = c
    } else if (code.startsWith('31')) {
      result.kiso_kyotsu[code] = c
    } else if (startsWithAny(code, ['61', '64', '65'])) {
      result.kiso_kyotsu[code] = c
    } else if (startsWithAny(code, ['FBA', 'FCB14'])) {
      result.kiso_sentaku[code] = c
    } else if (startsWithAny(code, ['BB', 'BC', 'GA', 'FE', 'FF'])) {
      result.kanren[code] = c
    } else if (code.startsWith('14')) {
      result.kiso_sentaku[code] = c
    } else {
      result.other[code] = c
    }
  }

  return result
}

// ============================================================
// 分析
// ============================================================

function analyze(courses: Record<string, Course>, majorKey: string): AnalysisResult {
  const majorDef = MAJORS[majorKey]
  const classified = classifyCourses(courses, majorKey)

  // 各カテゴリの単位合計
  const shCredits = sumCredits(classified.senmon_hisshu)
  const ssCredits = sumCredits(classified.senmon_sentaku)
  const skCredits = sumCredits(classified.senmon_kiso)
  const kkCredits = sumCredits(classified.kiso_kyotsu)
  const ksCredits = sumCredits(classified.kiso_sentaku)
  const krCredits = sumCredits(classified.kanren)
  const totalCredits = Object.values(courses)
    .filter(c => c.passed)
    .reduce((s, c) => s + c.credits, 0)

  // 専門必修: 未修得科目（共通科目）- コードOR科目名で判定
  const shValues = Object.values(classified.senmon_hisshu)
  const missingHisshu: { code: string; name: string; credits: number }[] = []
  for (const [code, entry] of Object.entries(COMMON_SENMON_HISSHU)) {
    if (!(code in classified.senmon_hisshu) &&
        !shValues.some(c => c.name === entry.name)) {
      missingHisshu.push({ code, name: entry.name, credits: entry.credits })
    }
  }

  // 専門必修: 未修得（実験科目）
  const missingJikken = getJikkenMissing(majorDef, classified.senmon_hisshu)

  // 卒研・倫理
  const sotsukenMissing = SOTSUKEN.map(([name, credits]) => ({ name, credits }))
  const rinriMissing = { name: RINRI[0], credits: RINRI[1] }

  // 専門基礎: 未修得科目 - コードOR科目名で判定
  const skValues = Object.values(classified.senmon_kiso)
  const missingKiso: { code: string; name: string; credits: number }[] = []
  for (const [code, entry] of Object.entries(SENMON_KISO_CODES)) {
    if (!(code in classified.senmon_kiso) &&
        !skValues.some(c => c.name === entry.name)) {
      missingKiso.push({ code, name: entry.name, credits: entry.credits })
    }
  }

  // 専門選択: サブカテゴリ別
  const sentakuSubs = majorDef.sentaku_sub.map(sub => {
    const subCourses: Record<string, Course> = {}
    for (const [k, v] of Object.entries(classified.senmon_sentaku)) {
      if (startsWithAny(v.code, sub.prefixes)) subCourses[k] = v
    }
    const subCredits = sumCredits(subCourses)
    return {
      name: sub.name,
      min: sub.min,
      credits: subCredits,
      ok: subCredits >= sub.min,
      courses: Object.values(subCourses),
    }
  })

  // その他FG系
  const categorizedCodes = new Set<string>()
  for (const sub of sentakuSubs) {
    for (const c of sub.courses) categorizedCodes.add(c.code)
  }
  const fgOther: Record<string, Course> = {}
  for (const [k, v] of Object.entries(classified.senmon_sentaku)) {
    if (!categorizedCodes.has(k)) fgOther[k] = v
  }
  const fgOtherCredits = sumCredits(fgOther)

  // 基礎科目 共通必修サブカテゴリ
  const filterKK = (pred: (c: Course) => boolean) => {
    const r: Record<string, Course> = {}
    for (const [k, v] of Object.entries(classified.kiso_kyotsu)) {
      if (pred(v)) r[k] = v
    }
    return r
  }

  const sogo = filterKK(c => startsWithAny(c.code, ['1130', '1228']))
  const taiiku = filterKK(c => TAIIKU_KEYWORDS.some(kw => c.name.includes(kw)))
  const eigo = filterKK(c => c.code.startsWith('31'))
  const joho = filterKK(c => startsWithAny(c.code, ['61', '64', '65']))

  const sogoCr = sumCredits(sogo)
  const taiikuCr = sumCredits(taiiku)
  const eigoCr = sumCredits(eigo)
  const johoCr = sumCredits(joho)

  // 卒研履修条件チェック
  const hisshuNoSotsuken = shCredits
  const commonRequired = Object.values(COMMON_SENMON_HISSHU).reduce((s, e) => s + e.credits, 0)
  const jikkenRequired = getJikkenRequiredCredits(majorDef)
  const hisshuRequiredNoSotsuken = commonRequired + jikkenRequired
  const sotsukenCondition =
    hisshuNoSotsuken >= hisshuRequiredNoSotsuken &&
    skCredits >= SENMON_KISO_TOTAL &&
    eigoCr >= 4 &&
    johoCr >= 4 &&
    totalCredits >= 95

  // 卒研+倫理取得後の見込み
  const sotsukenRinriCredits = SOTSUKEN.reduce((s, [, cr]) => s + cr, 0) + RINRI[1]
  const futureTotal = totalCredits + sotsukenRinriCredits
  const remainingAfter = Math.max(0, TOTAL_REQUIRED - futureTotal)

  return {
    major: majorDef.name,
    major_key: majorKey,
    total_credits: totalCredits,
    total_required: TOTAL_REQUIRED,
    remaining: Math.max(0, TOTAL_REQUIRED - totalCredits),

    senmon_hisshu: {
      credits: shCredits,
      required: SENMON_HISSHU_TOTAL,
      courses: Object.values(classified.senmon_hisshu),
      missing: missingHisshu,
      missing_jikken: missingJikken,
      sotsuken_missing: sotsukenMissing,
      rinri_missing: rinriMissing,
    },
    senmon_sentaku: {
      credits: ssCredits,
      subcategories: sentakuSubs,
      other: { credits: fgOtherCredits, courses: Object.values(fgOther) },
    },
    senmon_kiso: {
      credits: skCredits,
      required: SENMON_KISO_TOTAL,
      courses: Object.values(classified.senmon_kiso),
      missing: missingKiso,
    },
    kiso_kyotsu: {
      credits: kkCredits,
      required: KISO_KYOTSU_TOTAL,
      sogo: { credits: sogoCr, required: 2, courses: Object.values(sogo) },
      taiiku: { credits: taiikuCr, required: 3, courses: Object.values(taiiku) },
      eigo: { credits: eigoCr, required: 4, courses: Object.values(eigo) },
      joho: { credits: johoCr, required: 4, courses: Object.values(joho) },
    },
    kiso_sentaku: {
      credits: ksCredits,
      min: 1, max: 10,
      courses: Object.values(classified.kiso_sentaku),
    },
    kanren: {
      credits: krCredits,
      min: 6, max: 15,
      courses: Object.values(classified.kanren),
    },
    other: Object.values(classified.other),
    failed: Object.values(classified.failed),

    sotsuken_condition: {
      met: sotsukenCondition,
      senmon_hisshu: {
        credits: hisshuNoSotsuken,
        required: hisshuRequiredNoSotsuken,
        ok: hisshuNoSotsuken >= hisshuRequiredNoSotsuken,
      },
      senmon_kiso: { credits: skCredits, required: SENMON_KISO_TOTAL, ok: skCredits >= SENMON_KISO_TOTAL },
      eigo: { credits: eigoCr, required: 4, ok: eigoCr >= 4 },
      joho: { credits: johoCr, required: 4, ok: johoCr >= 4 },
      total_95: { credits: totalCredits, required: 95, ok: totalCredits >= 95 },
    },
    future: {
      additional_credits: sotsukenRinriCredits,
      projected_total: futureTotal,
      remaining_after: remainingAfter,
    },
  }
}

// ============================================================
// 公開API
// ============================================================

export function parseAndAnalyze(
  csvContent: string,
  majorHint?: string,
): AnalysisResult & { student_name: string | null } {
  const { courses, studentName } = parseCSV(csvContent)

  let majorKey = majorHint ?? null
  if (!majorKey) majorKey = detectMajor(courses)
  if (!majorKey) {
    throw new Error('主専攻を自動検出できませんでした。主専攻を選択してください。')
  }
  if (!(majorKey in MAJORS)) {
    throw new Error(`不明な主専攻: ${majorKey}`)
  }

  const result = analyze(courses, majorKey)
  return { ...result, student_name: studentName }
}
