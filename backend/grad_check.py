"""
卒業要件計算スクリプト（工学システム学類）

対応主専攻:
  - 知機: 知的・機能工学システム主専攻
  - エネメカ: エネルギー・メカニクス主専攻

使い方:
  python grad_check.py <成績CSV>                    # 主専攻を自動検出
  python grad_check.py <成績CSV> --major 知機        # 主専攻を指定
  python grad_check.py <成績CSV> --major エネメカ
  python grad_check.py <成績CSV> --json              # JSON出力（Web連携用）
  python grad_check.py                               # 同フォルダ内のCSV自動検出

CSVファイル:
  TWINSからダウンロードした成績CSVファイル（SIRS*.csv等）を使用。
  ヘッダーに「科目番号, 科目名, 単位数, 総合評価, 開講年度」を含むこと。
"""

import argparse
import csv
import glob
import io
import json
import os
import sys

# ============================================================
# 卒業要件定義
# ============================================================

# 専門基礎科目 必修（両主専攻共通・32単位）
SENMON_KISO_CODES = {
    'FA011C1': ('数学リテラシー1', 1), 'FA012D1': ('数学リテラシー2', 1),
    'FA016D1': ('線形代数1', 1), 'FA017D1': ('線形代数2', 1), 'FA018D1': ('線形代数3', 1),
    'FA013D1': ('微積分1', 1), 'FA014D1': ('微積分2', 1), 'FA015C1': ('微積分3', 1),
    'FCB1201': ('力学1', 1), 'FCB1261': ('力学2', 1), 'FCB1281': ('力学3', 1),
    'FCB1301': ('電磁気学1', 1), 'FCB1341': ('電磁気学2', 1), 'FCB1391': ('電磁気学3', 1),
    'FG16051': ('工学システム概論', 1), 'FG10651': ('工学システム原論', 1),
    'FG10704': ('線形代数総論A', 1), 'FG10724': ('線形代数総論B', 2),
    'FG10744': ('解析学総論', 1), 'FG10764': ('常微分方程式', 2),
    'FG10814': ('力学総論', 1), 'FG10834': ('電磁気学総論', 1),
    'FG10864': ('材料力学基礎', 1), 'FG10911': ('熱力学基礎', 1),
    'FG10851': ('流体力学基礎', 1), 'FG10784': ('複素解析', 2),
    'FG10874': ('プログラミング序論A', 2), 'FG10904': ('プログラミング序論B', 1),
}

# 専門科目 必修（両主専攻共通部分・専門実験は主専攻ごと）
COMMON_SENMON_HISSHU = {
    'FG19103': ('工学システム基礎実験A', 2),
    'FG19113': ('工学システム基礎実験B', 2),
    'FG18112': ('専門英語A', 1),
    'FG20222': ('専門英語B', 1),
    'FG20232': ('専門英語演習', 1),
    'FG20204': ('プログラミング序論C', 2),
    'FG20214': ('プログラミング序論D', 1),
}

# 卒業研究・倫理（両主専攻共通）
SOTSUKEN = [('卒業研究A', 4), ('卒業研究B', 4)]
RINRI = ('工学者のための倫理', 1)

# 主専攻ごとの定義
MAJORS = {
    "知機": {
        "name": "知的・機能工学システム主専攻",
        # jikken: 実験科目グループのリスト。各グループ内のcodesはいずれか1つ取ればOK。
        "jikken": [
            {"name": "知的・機能工学システム実験", "credits": 6, "codes": ["FG29213", "FG39213"]},
        ],
        "sentaku_sub": [
            {"name": "設計・システム系 (FG11/FG21)", "prefixes": ("FG11", "FG21"), "min": 6},
            {"name": "材料・バイオ系 (FG12/FG22)", "prefixes": ("FG12", "FG22"), "min": 1},
            {"name": "実務系 (FG13/FG23)", "prefixes": ("FG13", "FG23"), "min": 1},
            {"name": "情報・数理系 (FG17/FG24/FG25)", "prefixes": ("FG17", "FG24", "FG25"), "min": 16},
        ],
    },
    "エネメカ": {
        "name": "エネルギー・メカニクス主専攻",
        # 専門実験(3単位) + 応用実験(3単位) の2科目が必要
        # FG49xxx系とFG59xxx系は同一科目の別コード（年度・開講区分の違い）
        "jikken": [
            {"name": "エネルギー・メカニクス専門実験", "credits": 3, "codes": ["FG49873", "FG59873"]},
            {"name": "エネルギー・メカニクス応用実験", "credits": 3, "codes": ["FG49883", "FG59883"]},
        ],
        "sentaku_sub": [
            {"name": "設計・システム系 (FG11/FG21)", "prefixes": ("FG11", "FG21"), "min": 1},
            {"name": "材料・バイオ系 (FG12/FG22)", "prefixes": ("FG12", "FG22"), "min": 6},
            {"name": "実務系 (FG13/FG23)", "prefixes": ("FG13", "FG23"), "min": 1},
            {"name": "情報・数理系 (FG17/FG24/FG25)", "prefixes": ("FG17", "FG24", "FG25"), "min": 16},
        ],
    },
}

# 卒業要件単位数（両主専攻共通）
TOTAL_REQUIRED = 126
SENMON_HISSHU_TOTAL = 25
SENMON_KISO_TOTAL = 32
KISO_KYOTSU_TOTAL = 13

# 体育科目の判定キーワード
TAIIKU_KEYWORDS = ['体育', 'アスレティック', 'ハンドボール', 'シューティング',
                   'バレーボール', 'バスケ', 'サッカー', 'テニス', 'バドミントン',
                   'ダンス', '水泳', '柔道', '剣道', 'ゴルフ', 'スキー',
                   'ラグビー', 'フットサル', '卓球', 'ソフトボール', 'アーチェリー']


# ============================================================
# CSV解析
# ============================================================

def parse_csv(content):
    """成績CSVを解析して科目リストを返す。同一科目の重複は合格優先・新しい年度優先で解決。"""
    if content.startswith('\ufeff'):
        content = content[1:]

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)

    def get(r, key):
        for k, v in r.items():
            if key in k.strip():
                return v.strip() if v else ""
        return ""

    courses = {}
    student_name = None

    for r in rows:
        code = get(r, '科目番号')
        name = get(r, '科目名')
        credits = float(get(r, '単位数'))
        grade = get(r, '総合評価')
        year = int(get(r, '開講年度'))
        passed = grade != 'D'

        if student_name is None:
            student_name = get(r, '学生氏名')

        if code in courses:
            prev = courses[code]
            if prev['passed'] and not passed:
                continue
            if not prev['passed'] and passed:
                courses[code] = {'code': code, 'name': name, 'credits': credits,
                                 'grade': grade, 'year': year, 'passed': passed}
                continue
            if year > prev['year']:
                courses[code] = {'code': code, 'name': name, 'credits': credits,
                                 'grade': grade, 'year': year, 'passed': passed}
        else:
            courses[code] = {'code': code, 'name': name, 'credits': credits,
                             'grade': grade, 'year': year, 'passed': passed}

    return courses, student_name


def get_all_jikken_codes(major_def):
    """jikken定義から全コードの平坦な {code: (name, credits)} dictを返す。"""
    codes = {}
    for group in major_def['jikken']:
        for code in group['codes']:
            codes[code] = (group['name'], group['credits'])
    return codes


def get_jikken_required_credits(major_def):
    """実験科目の必要合計単位数を返す（グループ単位で計算）。"""
    return sum(g['credits'] for g in major_def['jikken'])


def get_jikken_missing(major_def, passed_codes):
    """未修得の実験科目グループを返す。"""
    missing = []
    for group in major_def['jikken']:
        if not any(code in passed_codes for code in group['codes']):
            missing.append({'name': group['name'], 'credits': group['credits']})
    return missing


def detect_major(courses):
    """履修科目から主専攻を自動検出する。"""
    for major_key, major_def in MAJORS.items():
        jikken_codes = get_all_jikken_codes(major_def)
        for code in jikken_codes:
            if code in courses:
                return major_key
    return None


# ============================================================
# 科目分類
# ============================================================

def classify_courses(courses, major_key):
    """合格済み科目を卒業要件のカテゴリに分類する。"""
    major_def = MAJORS[major_key]
    jikken_codes = get_all_jikken_codes(major_def)
    senmon_hisshu_codes = {**COMMON_SENMON_HISSHU, **jikken_codes}

    result = {
        'senmon_hisshu': {},
        'senmon_sentaku': {},
        'senmon_kiso': {},
        'kiso_kyotsu': {},
        'kiso_sentaku': {},
        'kanren': {},
        'other': {},
        'failed': {},
    }

    for code, c in courses.items():
        if not c['passed']:
            result['failed'][code] = c
            continue

        if code in senmon_hisshu_codes:
            result['senmon_hisshu'][code] = c
        elif code in SENMON_KISO_CODES:
            result['senmon_kiso'][code] = c
        elif code.startswith('FG'):
            result['senmon_sentaku'][code] = c
        elif code.startswith(('1130', '1228')):
            result['kiso_kyotsu'][code] = c
        elif any(kw in c['name'] for kw in TAIIKU_KEYWORDS):
            result['kiso_kyotsu'][code] = c
        elif code.startswith('31'):
            result['kiso_kyotsu'][code] = c
        elif code.startswith(('61', '64', '65')):
            result['kiso_kyotsu'][code] = c
        elif code.startswith(('FBA', 'FCB14')):
            result['kiso_sentaku'][code] = c
        elif code.startswith(('BB', 'BC', 'GA', 'FE', 'FF')):
            result['kanren'][code] = c
        elif code.startswith('14'):
            result['kiso_sentaku'][code] = c
        else:
            result['other'][code] = c

    return result


# ============================================================
# 分析
# ============================================================

def analyze(courses, major_key):
    """卒業要件の充足状況を分析する。"""
    major_def = MAJORS[major_key]
    classified = classify_courses(courses, major_key)

    jikken_codes = get_all_jikken_codes(major_def)
    senmon_hisshu_codes = {**COMMON_SENMON_HISSHU, **jikken_codes}

    # 各カテゴリの単位合計
    sh_credits = sum(c['credits'] for c in classified['senmon_hisshu'].values())
    ss_credits = sum(c['credits'] for c in classified['senmon_sentaku'].values())
    sk_credits = sum(c['credits'] for c in classified['senmon_kiso'].values())
    kk_credits = sum(c['credits'] for c in classified['kiso_kyotsu'].values())
    ks_credits = sum(c['credits'] for c in classified['kiso_sentaku'].values())
    kr_credits = sum(c['credits'] for c in classified['kanren'].values())
    total_credits = sum(c['credits'] for c in courses.values() if c['passed'])

    # 専門必修: 未修得科目（共通科目）
    missing_hisshu = []
    for code, (name, cr) in COMMON_SENMON_HISSHU.items():
        if code not in classified['senmon_hisshu']:
            missing_hisshu.append({'code': code, 'name': name, 'credits': cr})
    # 専門必修: 未修得科目（実験科目 - グループ単位で判定）
    missing_jikken = get_jikken_missing(major_def, classified['senmon_hisshu'])
    # 卒研・倫理は常に未修得リストに入れるか、修得済みかチェック
    # (CSVに卒研が入ることは通常ないが一応対応)
    sotsuken_missing = []
    for name, cr in SOTSUKEN:
        sotsuken_missing.append({'name': name, 'credits': cr})
    rinri_missing = {'name': RINRI[0], 'credits': RINRI[1]}

    # 専門基礎: 未修得科目
    missing_kiso = []
    for code, (name, cr) in SENMON_KISO_CODES.items():
        if code not in classified['senmon_kiso']:
            missing_kiso.append({'code': code, 'name': name, 'credits': cr})

    # 専門選択: サブカテゴリ別
    sentaku_subs = []
    for sub in major_def['sentaku_sub']:
        sub_courses = {k: v for k, v in classified['senmon_sentaku'].items()
                       if v['code'].startswith(tuple(sub['prefixes']))}
        sub_credits = sum(c['credits'] for c in sub_courses.values())
        sentaku_subs.append({
            'name': sub['name'],
            'min': sub['min'],
            'credits': sub_credits,
            'ok': sub_credits >= sub['min'],
            'courses': list(sub_courses.values()),
        })
    # その他FG系
    categorized_codes = set()
    for sub in sentaku_subs:
        for c in sub['courses']:
            categorized_codes.add(c['code'])
    fg_other = {k: v for k, v in classified['senmon_sentaku'].items()
                if k not in categorized_codes}
    fg_other_credits = sum(c['credits'] for c in fg_other.values())

    # 基礎科目 共通必修サブカテゴリ
    sogo = {k: v for k, v in classified['kiso_kyotsu'].items()
            if v['code'].startswith(('1130', '1228'))}
    taiiku = {k: v for k, v in classified['kiso_kyotsu'].items()
              if any(kw in v['name'] for kw in TAIIKU_KEYWORDS)}
    eigo = {k: v for k, v in classified['kiso_kyotsu'].items()
            if v['code'].startswith('31')}
    joho = {k: v for k, v in classified['kiso_kyotsu'].items()
            if v['code'].startswith(('61', '64', '65'))}

    sogo_cr = sum(c['credits'] for c in sogo.values())
    taiiku_cr = sum(c['credits'] for c in taiiku.values())
    eigo_cr = sum(c['credits'] for c in eigo.values())
    joho_cr = sum(c['credits'] for c in joho.values())

    # 卒研履修条件チェック（倫理・卒研自体を除く）
    hisshu_no_sotsuken = sh_credits  # 卒研は通常CSVに入らない
    # 必要単位: 共通必修 + 実験科目（グループ単位の合計）
    common_required = sum(cr for _, cr in COMMON_SENMON_HISSHU.values())
    jikken_required = get_jikken_required_credits(major_def)
    hisshu_required_no_sotsuken = common_required + jikken_required
    sotsuken_condition = (
        hisshu_no_sotsuken >= hisshu_required_no_sotsuken
        and sk_credits >= SENMON_KISO_TOTAL
        and eigo_cr >= 4
        and joho_cr >= 4
        and total_credits >= 95
    )

    # 卒研+倫理取得後の見込み
    sotsuken_rinri_credits = sum(cr for _, cr in SOTSUKEN) + RINRI[1]
    future_total = total_credits + sotsuken_rinri_credits
    remaining_after = max(0, TOTAL_REQUIRED - future_total)

    return {
        'major': major_def['name'],
        'major_key': major_key,
        'total_credits': total_credits,
        'total_required': TOTAL_REQUIRED,
        'remaining': max(0, TOTAL_REQUIRED - total_credits),

        'senmon_hisshu': {
            'credits': sh_credits,
            'required': SENMON_HISSHU_TOTAL,
            'courses': list(classified['senmon_hisshu'].values()),
            'missing': missing_hisshu,
            'missing_jikken': missing_jikken,
            'sotsuken_missing': sotsuken_missing,
            'rinri_missing': rinri_missing,
        },
        'senmon_sentaku': {
            'credits': ss_credits,
            'subcategories': sentaku_subs,
            'other': {'credits': fg_other_credits, 'courses': list(fg_other.values())},
        },
        'senmon_kiso': {
            'credits': sk_credits,
            'required': SENMON_KISO_TOTAL,
            'courses': list(classified['senmon_kiso'].values()),
            'missing': missing_kiso,
        },
        'kiso_kyotsu': {
            'credits': kk_credits,
            'required': KISO_KYOTSU_TOTAL,
            'sogo': {'credits': sogo_cr, 'required': 2, 'courses': list(sogo.values())},
            'taiiku': {'credits': taiiku_cr, 'required': 3, 'courses': list(taiiku.values())},
            'eigo': {'credits': eigo_cr, 'required': 4, 'courses': list(eigo.values())},
            'joho': {'credits': joho_cr, 'required': 4, 'courses': list(joho.values())},
        },
        'kiso_sentaku': {
            'credits': ks_credits,
            'min': 1, 'max': 10,
            'courses': list(classified['kiso_sentaku'].values()),
        },
        'kanren': {
            'credits': kr_credits,
            'min': 6, 'max': 15,
            'courses': list(classified['kanren'].values()),
        },
        'other': list(classified['other'].values()),
        'failed': list(classified['failed'].values()),

        'sotsuken_condition': {
            'met': sotsuken_condition,
            'senmon_hisshu': {'credits': hisshu_no_sotsuken,
                              'required': hisshu_required_no_sotsuken,
                              'ok': hisshu_no_sotsuken >= hisshu_required_no_sotsuken},
            'senmon_kiso': {'credits': sk_credits, 'required': SENMON_KISO_TOTAL,
                            'ok': sk_credits >= SENMON_KISO_TOTAL},
            'eigo': {'credits': eigo_cr, 'required': 4, 'ok': eigo_cr >= 4},
            'joho': {'credits': joho_cr, 'required': 4, 'ok': joho_cr >= 4},
            'total_95': {'credits': total_credits, 'required': 95, 'ok': total_credits >= 95},
        },
        'future': {
            'additional_credits': sotsuken_rinri_credits,
            'projected_total': future_total,
            'remaining_after': remaining_after,
        },
    }


# ============================================================
# テキスト出力
# ============================================================

def format_text(result):
    """分析結果を読みやすいテキストに整形する。"""
    lines = []
    p = lines.append

    p(f"主専攻: {result['major']}")

    # 不合格科目
    p("\n=== 不合格科目（再履修未済） ===")
    if result['failed']:
        for c in result['failed']:
            p(f"  {c['code']} {c['name']}: {c['credits']}単位 ({c['grade']}, {c['year']})")
    else:
        p("  なし")

    p(f"\n修得済み総単位数: {result['total_credits']}")

    # 専門必修
    sh = result['senmon_hisshu']
    p("\n" + "=" * 60)
    p(f"  専門科目 必修 (必要: {sh['required']}単位)")
    p("=" * 60)
    for c in sorted(sh['courses'], key=lambda x: x['name']):
        p(f"  OK {c['name']}: {c['credits']}単位 ({c['grade']})")
    p(f"  修得: {sh['credits']:.0f}単位")
    for m in sh['missing']:
        p(f"  NG 未修得: {m['name']} ({m['credits']}単位)")
    for m in sh.get('missing_jikken', []):
        p(f"  NG 未修得: {m['name']} ({m['credits']}単位)")
    for m in sh['sotsuken_missing']:
        p(f"  NG 未修得: {m['name']} ({m['credits']}単位)")
    p(f"  NG 未修得: {sh['rinri_missing']['name']} ({sh['rinri_missing']['credits']}単位)")
    p(f"  -> 不足: {sh['required'] - sh['credits']:.0f}単位")

    # 専門選択
    ss = result['senmon_sentaku']
    p("\n" + "=" * 60)
    p("  専門科目 選択")
    p("=" * 60)
    for sub in ss['subcategories']:
        ok = "OK" if sub['ok'] else "NG"
        p(f"\n  [{sub['name']}] 必要:{sub['min']}+ -> {sub['credits']:.0f}単位 {ok}")
        for c in sub['courses']:
            p(f"    {c['name']}: {c['credits']}単位 ({c['grade']})")
    if ss['other']['courses']:
        p(f"\n  [その他FG系]")
        for c in ss['other']['courses']:
            p(f"    {c['name']}: {c['credits']}単位 ({c['grade']})")
        p(f"    小計: {ss['other']['credits']:.0f}単位")
    p(f"\n  専門選択 合計: {ss['credits']:.0f}単位")

    # 専門基礎
    sk = result['senmon_kiso']
    p("\n" + "=" * 60)
    p(f"  専門基礎科目 必修 (必要: {sk['required']}単位)")
    p("=" * 60)
    for c in sorted(sk['courses'], key=lambda x: x['name']):
        p(f"  OK {c['name']}: {c['credits']}単位 ({c['grade']})")
    for m in sk['missing']:
        p(f"  NG {m['name']} ({m['credits']}単位)")
    p(f"  修得: {sk['credits']:.0f}単位 / {sk['required']}単位")
    if not sk['missing']:
        p("  -> 全科目修得済み!")

    # 基礎共通
    kk = result['kiso_kyotsu']
    p("\n" + "=" * 60)
    p(f"  基礎科目 共通必修 (必要: {kk['required']}単位)")
    p("=" * 60)
    for label, sub in [("総合科目", kk['sogo']), ("体育", kk['taiiku']),
                        ("英語", kk['eigo']), ("情報", kk['joho'])]:
        ok = "OK" if sub['credits'] >= sub['required'] else "NG"
        p(f"  [{label}] {sub['credits']:.1f}/{sub['required']}単位 {ok}")
        for c in sub['courses']:
            p(f"    {c['name']}: {c['credits']}単位 ({c['grade']})")
    p(f"  修得: {kk['credits']:.1f}単位 / {kk['required']}単位")

    # 基礎選択
    ks = result['kiso_sentaku']
    p("\n" + "=" * 60)
    p(f"  基礎科目 選択 (必要: {ks['min']}~{ks['max']}単位)")
    p("=" * 60)
    for c in ks['courses']:
        p(f"  {c['name']}: {c['credits']}単位 ({c['grade']})")
    p(f"  修得: {ks['credits']:.1f}単位")

    # 関連科目
    kr = result['kanren']
    p("\n" + "=" * 60)
    p(f"  関連科目 (必要: {kr['min']}~{kr['max']}単位)")
    p("=" * 60)
    for c in kr['courses']:
        p(f"  {c['name']}: {c['credits']}単位 ({c['grade']})")
    p(f"  修得: {kr['credits']:.1f}単位")

    # 分類未確定
    if result['other']:
        p("\n=== 分類未確定 ===")
        for c in result['other']:
            p(f"  ? {c['code']} {c['name']}: {c['credits']}単位 ({c['grade']})")

    # サマリー
    p("\n" + "=" * 60)
    p(f"  卒業要件サマリー (必要: {TOTAL_REQUIRED}単位)")
    p("=" * 60)
    p(f"                    修得    必要    状況")

    def status(got, need): return "OK" if got >= need else f"不足 {need - got:.0f}"
    p(f"専門必修:          {sh['credits']:5.1f}   {sh['required']:.1f}    {status(sh['credits'], sh['required'])}")
    p(f"専門選択:          {ss['credits']:5.1f}   ~40     {'OK' if ss['credits'] >= 40 else f'不足 {40 - ss['credits']:.0f}'}")
    p(f"専門基礎必修:      {sk['credits']:5.1f}   {sk['required']:.1f}    {status(sk['credits'], sk['required'])}")
    p(f"基礎共通必修:      {kk['credits']:5.1f}   {kk['required']:.1f}    {status(kk['credits'], kk['required'])}")
    p(f"基礎選択:          {ks['credits']:5.1f}    {ks['min']}~{ks['max']}   {'OK' if ks['credits'] >= ks['min'] else '不足'}")
    p(f"関連科目:          {kr['credits']:5.1f}    {kr['min']}~{kr['max']}   {'OK' if kr['credits'] >= kr['min'] else f'不足 {kr['min'] - kr['credits']:.0f}'}")
    p("")
    p(f"修得済み合計:      {result['total_credits']:5.1f}  / {TOTAL_REQUIRED:.1f}")
    p(f"卒業まであと:      {result['remaining']:.1f}単位")

    # 卒研+倫理取得後
    ft = result['future']
    p(f"\n--- 卒業研究A+B+倫理 取得後 ---")
    p(f"予想合計:          {ft['projected_total']:.1f}  / {TOTAL_REQUIRED:.1f}")
    if ft['remaining_after'] == 0:
        p("-> 卒業要件: 達成!")
    else:
        p(f"-> まだ {ft['remaining_after']:.1f}単位不足")

    # 卒研履修条件
    sc = result['sotsuken_condition']
    p(f"\n=== 卒業研究の履修条件 ===")
    p("条件: 倫理除く専門+専門基礎の必修全て + 英語 + 情報 含み 95単位以上")
    p("  ※卒研自体は条件から除外して判定")
    for label, item in [("専門必修(倫理・卒研除く)", sc['senmon_hisshu']),
                         ("専門基礎必修", sc['senmon_kiso']),
                         ("英語", sc['eigo']),
                         ("情報", sc['joho']),
                         ("95単位以上", sc['total_95'])]:
        ok = "OK" if item['ok'] else "NG"
        p(f"  {label}: {item['credits']:.0f}/{item['required']} {ok}")
    p(f"  -> 卒業研究履修条件: {'満たしている' if sc['met'] else '未達'}")

    return "\n".join(lines)


# ============================================================
# メイン
# ============================================================

def resolve_csv_path(args_csv):
    """CSVファイルパスを解決する。"""
    script_dir = os.path.dirname(os.path.abspath(__file__))

    if args_csv:
        csv_path = args_csv
        if not os.path.isabs(csv_path):
            csv_path = os.path.join(os.getcwd(), csv_path)
    else:
        csv_files = glob.glob(os.path.join(script_dir, "*.csv"))
        if len(csv_files) == 1:
            csv_path = csv_files[0]
        elif len(csv_files) > 1:
            print("複数のCSVファイルが見つかりました。引数で指定してください:")
            for f in csv_files:
                print(f'  python grad_check.py "{os.path.basename(f)}"')
            sys.exit(1)
        else:
            print("CSVファイルが見つかりません。")
            print("TWINSの成績CSVをこのフォルダに置くか、引数で指定してください。")
            print("  python grad_check.py <CSVファイルパス>")
            sys.exit(1)

    if not os.path.exists(csv_path):
        print(f"ファイルが見つかりません: {csv_path}")
        sys.exit(1)

    return csv_path


def main():
    if sys.platform == 'win32':
        sys.stdout.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description="卒業要件計算（工学システム学類）")
    parser.add_argument('csv', nargs='?', help='成績CSVファイルパス')
    parser.add_argument('--major', choices=list(MAJORS.keys()),
                        help='主専攻 (省略時は自動検出)')
    parser.add_argument('--json', action='store_true', help='JSON形式で出力')
    parser.add_argument('--list-majors', action='store_true', help='対応主専攻の一覧')
    args = parser.parse_args()

    if args.list_majors:
        print("対応主専攻:")
        for key, m in MAJORS.items():
            print(f"  {key}: {m['name']}")
        sys.exit(0)

    csv_path = resolve_csv_path(args.csv)

    with open(csv_path, encoding="utf-8") as f:
        content = f.read()

    courses, student_name = parse_csv(content)

    # 主専攻の決定
    major_key = args.major
    if major_key is None:
        major_key = detect_major(courses)
    if major_key is None:
        print("主専攻を自動検出できませんでした。--major で指定してください。")
        print("  例: python grad_check.py 成績.csv --major 知機")
        print("  例: python grad_check.py 成績.csv --major エネメカ")
        sys.exit(1)

    if not args.json:
        print(f"読み込み: {os.path.basename(csv_path)}")
        if student_name:
            print(f"学生: {student_name}")

    result = analyze(courses, major_key)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_text(result))


if __name__ == '__main__':
    main()
