import { useCallback, useState } from 'react'
import { parseAndAnalyze } from './gradCheck'
import './App.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = Record<string, any>

function App() {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [major, setMajor] = useState('')
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(async (file: File) => {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const content = await file.text()
      const data = parseAndAnalyze(content, major || undefined)
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [major])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  return (
    <div className="app">
      <h1>工学システム学類 卒業要件チェッカー</h1>
      <p className="subtitle">TWINSからダウンロードした成績CSVをアップロードしてください</p>

      <details className="guide">
        <summary>CSVファイルの取得方法</summary>
        <ol>
          <li><a href="https://twins.tsukuba.ac.jp/campusweb/" target="_blank" rel="noopener noreferrer">TWINS</a> にログイン</li>
          <li>「成績」→「成績照会」を開く</li>
          <li>ページ最下部までスクロールし「ダウンロード」をクリック</li>
          <li>
            出力形式選択画面で以下を設定:
            <ul>
              <li>ファイル形式: <strong>CSV</strong></li>
              <li>文字コード: <strong>Unicode (UTF-8)</strong></li>
              <li>BOM有無: <strong>BOMなし</strong></li>
            </ul>
          </li>
          <li>「出力」をクリックしてCSVファイルを保存</li>
        </ol>
      </details>

      <div className="controls">
        <label>
          主専攻:
          <select value={major} onChange={e => setMajor(e.target.value)}>
            <option value="">自動検出</option>
            <option value="知機">知的・機能工学システム</option>
            <option value="エネメカ">エネルギー・メカニクス</option>
          </select>
        </label>
      </div>

      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>ここにCSVをドラッグ&ドロップ</p>
        <p>または</p>
        <label className="file-btn">
          ファイルを選択
          <input type="file" accept=".csv" onChange={onFileChange} hidden />
        </label>
      </div>

      {loading && <p className="loading">解析中...</p>}
      {error && <p className="error">{error}</p>}
      {result && <ResultView data={result} />}
    </div>
  )
}

function StatusBadge({ ok }: { ok: boolean }) {
  return <span className={`badge ${ok ? 'ok' : 'ng'}`}>{ok ? 'OK' : 'NG'}</span>
}

function ProgressBar({ current, required }: { current: number; required: number }) {
  const pct = Math.min(100, (current / required) * 100)
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
      <span>{current} / {required}</span>
    </div>
  )
}

function ResultView({ data }: { data: Result }) {
  const sh = data.senmon_hisshu
  const ss = data.senmon_sentaku
  const sk = data.senmon_kiso
  const kk = data.kiso_kyotsu
  const ks = data.kiso_sentaku
  const kr = data.kanren
  const sc = data.sotsuken_condition
  const ft = data.future

  return (
    <div className="result">
      <h2>{data.major}{data.student_name && ` - ${data.student_name}`}</h2>

      {/* サマリー */}
      <section className="summary-card">
        <h3>卒業要件サマリー</h3>
        <div className="summary-grid">
          <div className="summary-item main">
            <span className="label">修得済み合計</span>
            <span className="value">{data.total_credits}</span>
            <span className="unit">/ {data.total_required} 単位</span>
            <ProgressBar current={data.total_credits} required={data.total_required} />
            {data.remaining > 0
              ? <span className="remaining">あと {data.remaining} 単位</span>
              : <span className="remaining ok-text">達成!</span>
            }
          </div>
        </div>
        <div className="summary-table">
          <table>
            <thead><tr><th>区分</th><th>修得</th><th>必要</th><th>状況</th></tr></thead>
            <tbody>
              <tr>
                <td>専門必修</td><td>{sh.credits}</td><td>{sh.required}</td>
                <td><StatusBadge ok={sh.credits >= sh.required} /></td>
              </tr>
              <tr>
                <td>専門選択</td><td>{ss.credits}</td><td>~40</td>
                <td><StatusBadge ok={ss.credits >= 40} /></td>
              </tr>
              <tr>
                <td>専門基礎必修</td><td>{sk.credits}</td><td>{sk.required}</td>
                <td><StatusBadge ok={sk.credits >= sk.required} /></td>
              </tr>
              <tr>
                <td>基礎共通必修</td><td>{kk.credits}</td><td>{kk.required}</td>
                <td><StatusBadge ok={kk.credits >= kk.required} /></td>
              </tr>
              <tr>
                <td>基礎選択</td><td>{ks.credits}</td><td>{ks.min}~{ks.max}</td>
                <td><StatusBadge ok={ks.credits >= ks.min} /></td>
              </tr>
              <tr>
                <td>関連科目</td><td>{kr.credits}</td><td>{kr.min}~{kr.max}</td>
                <td><StatusBadge ok={kr.credits >= kr.min} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 卒研+倫理取得後 */}
      <section className="card">
        <h3>卒業研究A+B+倫理 取得後の見込み</h3>
        <p>予想合計: <strong>{ft.projected_total}</strong> / {data.total_required} 単位</p>
        {ft.remaining_after === 0
          ? <p className="ok-text">卒業要件達成!</p>
          : <p className="ng-text">まだ {ft.remaining_after} 単位不足</p>
        }
      </section>

      {/* 卒研履修条件 */}
      <section className="card">
        <h3>卒業研究の履修条件 <StatusBadge ok={sc.met} /></h3>
        <table>
          <tbody>
            {([
              ['専門必修(倫理・卒研除く)', sc.senmon_hisshu],
              ['専門基礎必修', sc.senmon_kiso],
              ['英語', sc.eigo],
              ['情報', sc.joho],
              ['95単位以上', sc.total_95],
            ] as [string, Result][]).map(([label, item]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{item.credits} / {item.required}</td>
                <td><StatusBadge ok={item.ok} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 不合格科目 */}
      {data.failed.length > 0 && (
        <section className="card warning">
          <h3>不合格科目（再履修未済）</h3>
          <ul>
            {data.failed.map((c: Result) => (
              <li key={c.code}>{c.code} {c.name}: {c.credits}単位 ({c.grade}, {c.year})</li>
            ))}
          </ul>
        </section>
      )}

      {/* 専門必修 */}
      <section className="card">
        <h3>専門科目 必修 <ProgressBar current={sh.credits} required={sh.required} /></h3>
        <CourseList courses={sh.courses} />
        {sh.missing.length > 0 && (
          <div className="missing">
            <h4>未修得</h4>
            <ul>{sh.missing.map((m: Result) => <li key={m.code}>{m.name} ({m.credits}単位)</li>)}</ul>
          </div>
        )}
        {sh.missing_jikken?.length > 0 && (
          <div className="missing">
            <h4>未修得（実験）</h4>
            <ul>{sh.missing_jikken.map((m: Result, i: number) => <li key={i}>{m.name} ({m.credits}単位)</li>)}</ul>
          </div>
        )}
      </section>

      {/* 専門選択 */}
      <section className="card">
        <h3>専門科目 選択 ({ss.credits} 単位)</h3>
        {ss.subcategories.map((sub: Result) => (
          <div key={sub.name} className="subcategory">
            <h4>{sub.name} <StatusBadge ok={sub.ok} /> ({sub.credits}/{sub.min}+)</h4>
            <CourseList courses={sub.courses} />
          </div>
        ))}
        {ss.other.courses.length > 0 && (
          <div className="subcategory">
            <h4>その他FG系 ({ss.other.credits} 単位)</h4>
            <CourseList courses={ss.other.courses} />
          </div>
        )}
      </section>

      {/* 専門基礎 */}
      <section className="card">
        <h3>専門基礎科目 必修 <ProgressBar current={sk.credits} required={sk.required} /></h3>
        <CourseList courses={sk.courses} />
        {sk.missing.length > 0 && (
          <div className="missing">
            <h4>未修得</h4>
            <ul>{sk.missing.map((m: Result) => <li key={m.code}>{m.name} ({m.credits}単位)</li>)}</ul>
          </div>
        )}
      </section>

      {/* 基礎共通 */}
      <section className="card">
        <h3>基礎科目 共通必修 <ProgressBar current={kk.credits} required={kk.required} /></h3>
        {['sogo', 'taiiku', 'eigo', 'joho'].map(key => {
          const sub = kk[key]
          const labels: Record<string, string> = { sogo: '総合科目', taiiku: '体育', eigo: '英語', joho: '情報' }
          return (
            <div key={key} className="subcategory">
              <h4>{labels[key]} <StatusBadge ok={sub.credits >= sub.required} /> ({sub.credits}/{sub.required})</h4>
              <CourseList courses={sub.courses} />
            </div>
          )
        })}
      </section>

      {/* 基礎選択 */}
      <section className="card">
        <h3>基礎科目 選択 ({ks.credits} 単位, 必要: {ks.min}~{ks.max})</h3>
        <CourseList courses={ks.courses} />
      </section>

      {/* 関連科目 */}
      <section className="card">
        <h3>関連科目 ({kr.credits} 単位, 必要: {kr.min}~{kr.max})</h3>
        <CourseList courses={kr.courses} />
      </section>

      {/* 分類未確定 */}
      {data.other.length > 0 && (
        <section className="card">
          <h3>分類未確定</h3>
          <CourseList courses={data.other} showCode />
        </section>
      )}
    </div>
  )
}

function CourseList({ courses, showCode }: { courses: Result[]; showCode?: boolean }) {
  if (!courses.length) return <p className="empty">なし</p>
  return (
    <ul className="course-list">
      {courses.map((c: Result) => (
        <li key={c.code}>
          {showCode && <span className="code">{c.code} </span>}
          {c.name}: {c.credits}単位
          <span className="grade">({c.grade})</span>
        </li>
      ))}
    </ul>
  )
}

export default App
