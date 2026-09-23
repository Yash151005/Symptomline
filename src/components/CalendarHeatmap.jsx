import { subDays, startOfDay, format } from 'date-fns';

const CELL_SIZE = 14;
const CELL_GAP = 3;

function getHeatColor(count, maxSeverity) {
  if (count === 0) return '#f0f2f7';
  if (maxSeverity >= 5) return 'rgba(255, 107, 107, 0.65)';
  if (maxSeverity >= 4) return 'rgba(225, 112, 85, 0.5)';
  if (maxSeverity >= 3) return 'rgba(108, 92, 231, 0.45)';
  if (maxSeverity >= 2) return 'rgba(108, 92, 231, 0.25)';
  return 'rgba(108, 92, 231, 0.12)';
}

export default function CalendarHeatmap({ entries = [] }) {
  const startDate = startOfDay(subDays(new Date(), 89));

  // Aggregate entries by day
  const aggregated = {};
  entries.forEach((e) => {
    const d = startOfDay(new Date(e.timestamp)).getTime();
    if (d >= startDate.getTime()) {
      if (!aggregated[d]) aggregated[d] = { count: 0, maxSeverity: 0 };
      aggregated[d].count++;
      aggregated[d].maxSeverity = Math.max(aggregated[d].maxSeverity, e.severity);
    }
  });

  const data = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const ts = d.getTime();
    data.push({
      date: format(d, 'MMM d, yyyy'),
      monthLabel: format(d, 'MMM'),
      count: aggregated[ts]?.count || 0,
      maxSeverity: aggregated[ts]?.maxSeverity || 0,
    });
  }


  const weeks = [];
  let currentWeek = [];
  const firstDayOfWeek = new Date(startDate).getDay();

  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push(null);
  }

  data.forEach((day) => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const monthLabels = [];
  let lastMonth = '';
  weeks.forEach((week, i) => {
    const firstDay = week.find((d) => d !== null);
    if (firstDay) {
      const month = firstDay.monthLabel;
      if (month !== lastMonth) {
        monthLabels.push({ label: month, index: i });
        lastMonth = month;
      }
    }
  });

  return (
    <div className="card-static" style={{ padding: '22px 26px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <h3
          style={{
            fontSize: '0.9375rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
          }}
        >
          Activity — Last 90 Days
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.625rem',
            color: 'var(--color-text-muted)',
            fontWeight: 500,
          }}
        >
          <span>Less</span>
          {[0, 2, 3, 4, 5].map((level) => (
            <span
              key={level}
              style={{
                width: 11,
                height: 11,
                borderRadius: 3,
                background: getHeatColor(level > 0 ? 1 : 0, level),
                border: '1px solid rgba(0,0,0,0.04)',
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Month labels */}
      <div
        style={{
          display: 'flex',
          marginLeft: 32,
          marginBottom: 6,
          position: 'relative',
          height: 14,
        }}
      >
        {monthLabels.map((m) => (
          <span
            key={`${m.label}-${m.index}`}
            style={{
              position: 'absolute',
              left: m.index * (CELL_SIZE + CELL_GAP),
              fontSize: '0.625rem',
              color: 'var(--color-text-muted)',
              fontWeight: 600,
            }}
          >
            {m.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Day labels */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: CELL_GAP,
            marginRight: 8,
          }}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
            <span
              key={day}
              style={{
                fontSize: '0.5625rem',
                fontWeight: 500,
                color: 'var(--color-text-muted)',
                height: CELL_SIZE,
                lineHeight: `${CELL_SIZE}px`,
                display: i % 2 === 1 ? 'block' : 'none',
              }}
            >
              {day}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'flex',
            gap: CELL_GAP,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {weeks.map((week, wi) => (
            <div
              key={wi}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: CELL_GAP,
              }}
            >
              {week.map((day, di) => (
                <div
                  key={di}
                  title={
                    day
                      ? `${day.date}: ${day.count} log${day.count !== 1 ? 's' : ''}`
                      : ''
                  }
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    borderRadius: 3,
                    background: day ? getHeatColor(day.count, day.maxSeverity) : 'transparent',
                    border: day ? '1px solid rgba(0,0,0,0.03)' : 'none',
                    cursor: day && day.count > 0 ? 'pointer' : 'default',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (day && day.count > 0) {
                      e.currentTarget.style.transform = 'scale(1.4)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(108,92,231,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
