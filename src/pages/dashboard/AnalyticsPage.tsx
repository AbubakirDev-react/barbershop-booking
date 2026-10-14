import { useMemo, useState } from 'react'
import { addDays, endOfMonth, endOfWeek, endOfYear, startOfMonth, startOfWeek, startOfYear, startOfDay } from 'date-fns'
import { useDb } from '@/data/store'
import { usePageMeta } from '@/shared/seo'
import { dayKey, fromDayKey, shopNow } from '@/domain/tz'
import { computeAnalytics, previousPeriod, type Period } from '@/domain/analytics'
import { formatRub } from '@/domain/format'
import { EmptyState, Field, Input, Select } from '@/shared/ui'
import './analytics.css'

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom'
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'custom', label: 'Свой период' },
]

function presetPeriod(p: Preset, now: Date = shopNow()): Period {
  const day = startOfDay(now)
  if (p === 'day') return { from: day, to: day }
  if (p === 'week') return { from: startOfWeek(day, { weekStartsOn: 1 }), to: endOfWeek(day, { weekStartsOn: 1 }) }
  if (p === 'year') return { from: startOfYear(day), to: endOfYear(day) }
  return { from: startOfMonth(day), to: endOfMonth(day) }
}

export default function AnalyticsPage() {
  usePageMeta('Аналитика', '', { noindex: true })
  const appointments = useDb((s) => s.appointments)
  const masters = useDb((s) => s.masters)
  const timeOff = useDb((s) => s.timeOff)
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState({ from: dayKey(addDays(new Date(), -29)), to: dayKey(new Date()) })
  const [masterId, setMasterId] = useState('all')

  const period: Period = useMemo(
    () => (preset === 'custom' ? { from: fromDayKey(custom.from), to: fromDayKey(custom.to) } : presetPeriod(preset)),
    [preset, custom],
  )
  const valid = !Number.isNaN(period.from.getTime()) && !Number.isNaN(period.to.getTime()) && period.from <= period.to

  const data = useMemo(
    () => (valid ? computeAnalytics(appointments, masters, timeOff, period, masterId === 'all' ? undefined : masterId) : null),
    [valid, appointments, masters, timeOff, period, masterId],
  )
  const prev = useMemo(
    () => (valid ? computeAnalytics(appointments, masters, timeOff, previousPeriod(period), masterId === 'all' ? undefined : masterId) : null),
    [valid, appointments, masters, timeOff, period, masterId],
  )

  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.revenue) ?? [0]))
  const delta = data && prev && prev.revenue > 0 ? Math.round(((data.revenue - prev.revenue) / prev.revenue) * 100) : null

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Аналитика</h1>
          <p>Только завершённые записи. Отмены и неявки в выручку не входят.</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Период">
          {PRESETS.map((p) => (
            <button key={p.id} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <Field label="С">{(p) => <Input {...p} type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />}</Field>
            <Field label="По">{(p) => <Input {...p} type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />}</Field>
          </>
        )}
        <Field label="Мастер">
          {(p) => (
            <Select {...p} value={masterId} onChange={(e) => setMasterId(e.target.value)}>
              <option value="all">Все мастера</option>
              {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {!data ? (
        <div className="alert alert--error">Проверьте период: дата начала должна быть не позже даты конца.</div>
      ) : data.completed === 0 && data.cancelled === 0 && data.noShow === 0 ? (
        <EmptyState title="За этот период данных нет" text="Статистика появится, когда будут завершённые записи. Графики с придуманными значениями мы не показываем." />
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><span className="stat__value">{formatRub(data.revenue)}</span><span className="stat__label">Выручка</span>
              {delta !== null && <span className={`stat__delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{delta}% к прошлому периоду</span>}
            </div>
            <div className="stat"><span className="stat__value">{data.completed}</span><span className="stat__label">Завершённых записей</span></div>
            <div className="stat"><span className="stat__value">{data.completed ? formatRub(data.averageCheck) : '—'}</span><span className="stat__label">Средний чек</span></div>
            <div className="stat"><span className="stat__value">{data.cancelled}</span><span className="stat__label">Отмен</span></div>
            <div className="stat"><span className="stat__value">{data.noShow}</span><span className="stat__label">Неявок</span></div>
          </div>

          <section className="panel" aria-labelledby="dyn">
            <div className="panel__head"><h2 id="dyn">Динамика выручки</h2></div>
            {data.completed === 0 ? (
              <p className="muted">Завершённых записей в периоде нет.</p>
            ) : data.byDay.length > 62 ? (
              <p className="muted">Период слишком длинный для дневного графика — выберите не больше двух месяцев.</p>
            ) : (
              <div className="bars" role="img" aria-label={`Выручка по дням, всего ${formatRub(data.revenue)}`}>
                {data.byDay.map((d) => (
                  <div key={d.day} className="bars__col" title={`${d.day.slice(8, 10) + '.' + d.day.slice(5, 7)}: ${formatRub(d.revenue)}, записей: ${d.count}`}>
                    <div className="bars__bar" style={{ height: `${(d.revenue / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid-2" style={{ gridTemplateColumns: undefined }}>
            <section className="panel panel--flush table-wrap" aria-labelledby="pop">
              <div className="panel__head" style={{ padding: 'var(--sp-4) var(--sp-4) 0' }}><h2 id="pop">Популярные услуги</h2></div>
              {data.services.length === 0 ? <p className="muted" style={{ padding: 'var(--sp-4)' }}>Нет выполненных услуг.</p> : (
                <table className="table">
                  <thead><tr><th>Услуга</th><th className="right">Раз</th><th className="right">Сумма</th></tr></thead>
                  <tbody>
                    {data.services.slice(0, 8).map((s) => (
                      <tr key={s.serviceId}><td>{s.name}</td><td className="right num">{s.count}</td><td className="right num">{formatRub(s.revenue)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel" aria-labelledby="load">
              <div className="panel__head"><h2 id="load">Загруженность мастеров</h2></div>
              <div className="stack">
                {data.masterLoad.map((m) => (
                  <div key={m.masterId}>
                    <div className="spread" style={{ fontSize: 'var(--fs-sm)' }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      <span className="num muted">{m.load === null ? 'нет рабочих часов' : `${Math.round(m.load * 100)}%`}</span>
                    </div>
                    <div className="meter" role="progressbar" aria-valuenow={Math.round((m.load ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Загрузка: ${m.name}`}>
                      <div className="meter__fill" style={{ width: `${(m.load ?? 0) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {data.masterLoad.length === 0 && <p className="muted">Нет мастеров.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}
