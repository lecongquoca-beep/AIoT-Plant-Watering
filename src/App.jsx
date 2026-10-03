import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

const API = 'https://es-design.onrender.com';
const DEVICE = 'esp32_v1';

const DEFINITIONS = [
  {
    key: 'soilMoisture',
    name: 'Độ ẩm đất',
    unit: '%',
    digits: 1,
    color: '#49e3ac',
    icon: 'drop',
    max: 100,
    hint: 'Ngưỡng chặn tưới: 60%',
  },
  {
    key: 'light',
    name: 'Ánh sáng',
    unit: 'Lux',
    digits: 0,
    color: '#f8c66c',
    icon: 'sun',
    max: 100000,
    hint: 'Cường độ ánh sáng',
  },
  {
    key: 'temperature',
    name: 'Nhiệt độ',
    unit: '°C',
    digits: 1,
    color: '#fa9477',
    icon: 'temp',
    max: 50,
    hint: 'Nhiệt độ môi trường',
  },
  {
    key: 'humidity',
    name: 'Độ ẩm khí',
    unit: '%',
    digits: 1,
    color: '#55cfe9',
    icon: 'waves',
    max: 100,
    hint: 'Độ ẩm tương đối',
  },
  {
    key: 'vpd',
    name: 'VPD',
    unit: 'kPa',
    digits: 2,
    color: '#b2a1ff',
    icon: 'activity',
    max: 4,
    hint: 'Độ thiếu hụt áp suất hơi',
  },
];

const TABS = [
  ['live', 'activity', 'Trực tiếp'],
  ['history', 'clock', 'Lịch sử 24h'],
  ['events', 'list', 'Nhật ký'],
  ['ai', 'spark', 'Dự đoán AI'],
];

const number = (value, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : '—';

function formatTime(value, options) {
  if (!value) return '—';

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';

  return date.toLocaleString('vi-VN', options);
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`API không trả JSON hợp lệ (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(
      typeof result.detail === 'string'
        ? result.detail
        : `Yêu cầu thất bại (${response.status}).`
    );
  }

  return result;
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [apiError, setApiError] = useState('');
  const [samples, setSamples] = useState([]);

  const [apiKey, setApiKey] = useState('');
  const [command, setCommand] = useState(null);
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);

  const [clock, setClock] = useState(Date.now());
  const [tab, setTab] = useState('live');
  const [metric, setMetric] = useState('all');
  const [settings, setSettings] = useState(false);
  const [events, setEvents] = useState([]);

  const [history, setHistory] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [cursor, setCursor] = useState(null);

  const locked = useRef(false);
  const lastDevice = useRef(null);
  const historyLock = useRef(false);

  const logEvent = useCallback((message, status = 'info') => {
    const event = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      message,
      status,
    };

    setEvents(previous => [event, ...previous].slice(0, 100));
  }, []);

  async function loadHistory(older = false) {
    if (historyLock.current) return;

    historyLock.current = true;
    setHistoryBusy(true);
    setHistoryError('');

    try {
      const before =
        older && cursor ? `&before_id=${encodeURIComponent(cursor)}` : '';

      const result = await request(
        `/api/telemetry/history?device_id=${DEVICE}&hours=24&limit=1000${before}`
      );

      if (!Array.isArray(result.data)) {
        throw new Error('Lịch sử chưa có định dạng hợp lệ.');
      }

      setHistory(previous => {
        const merged = older
          ? [...result.data, ...previous]
          : result.data;

        return [
          ...new Map(
            merged.map(item => [item.sample_id, item])
          ).values(),
        ].sort(
          (a, b) =>
            new Date(a.sampled_at || a.time) -
            new Date(b.sampled_at || b.time)
        );
      });

      setCursor(result.hasMore ? result.nextBeforeId : null);
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      historyLock.current = false;
      setHistoryBusy(false);
    }
  }

  useEffect(() => {
    let stopped = false;
    let timer;

    async function poll() {
      try {
        const result = await request(
          `/api/telemetry/latest?device_id=${DEVICE}`
        );

        if (result.status !== 'success') {
          throw new Error('API chưa trả dữ liệu hợp lệ.');
        }

        if (stopped) return;

        setSnapshot({
          ...result,
          fetchedAt: Date.now(),
        });
        setApiError('');

        const item = result.data;

        if (item) {
          const next = [
            item.mode,
            item.pump,
            item.fsm,
            item.waterAvailable,
            item.fault,
          ].join('|');

          if (lastDevice.current !== next) {
            const prefix =
              lastDevice.current === null
                ? 'Nhận trạng thái'
                : 'Thiết bị cập nhật';

            logEvent(
              `${prefix}: ${item.mode} · Bơm ${item.pump} · ${item.fsm}${
                item.fault ? ` · ${item.fault}` : ''
              }`,
              item.fault ? 'error' : 'info'
            );

            lastDevice.current = next;
          }
        }

        if (item?.sample_id) {
          setSamples(previous => {
            if (
              previous.some(
                sample => sample.sample_id === item.sample_id
              )
            ) {
              return previous;
            }

            return [...previous, item].slice(-60);
          });
        }
      } catch (error) {
        if (!stopped) setApiError(error.message);
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    }

    poll();

    const tick = setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [logEvent]);

  // Theo dõi xác nhận, không tự gửi lại lệnh nếu mất mạng.
  useEffect(() => {
    if (!command?.id) return;

    let stopped = false;
    let timer;
    let lastStatus = '';

    const deadline = Date.now() + 45000;

    async function poll() {
      let terminal = false;

      try {
        const result = await request(
          `/api/commands/${command.id}`
        );

        if (stopped) return;

        const record = result.data;

        if (!record?.status) {
          throw new Error('Chưa đọc được trạng thái lệnh.');
        }

        setNotice(
          `Lệnh ${record.status}: ${
            record.message || 'Đang chờ xác nhận.'
          }`
        );

        if (lastStatus !== record.status) {
          const eventStatus = [
            'rejected',
            'failed',
            'timeout',
          ].includes(record.status)
            ? 'error'
            : ['applied', 'completed'].includes(record.status)
              ? 'success'
              : 'info';

          logEvent(
            `${record.status}: ${
              record.message || 'Cập nhật lệnh'
            }`,
            eventStatus
          );

          lastStatus = record.status;
        }

        terminal =
          ['completed', 'rejected', 'timeout', 'failed'].includes(
            record.status
          ) ||
          (command.kind === 'mode' &&
            record.status === 'applied');

        if (record.status === 'timeout') {
          setNotice(
            'Hết thời gian chờ xác nhận. Kiểm tra trạng thái thiết bị trước khi gửi lại.'
          );
        }
      } catch (error) {
        if (!stopped) {
          setNotice(
            `Chưa đọc được xác nhận: ${error.message}`
          );
        }
      }

      if (stopped) return;

      if (terminal || Date.now() >= deadline) {
        if (!terminal) {
          setNotice(
            'Chưa xác nhận được kết quả lệnh. Kiểm tra trạng thái thiết bị trước khi gửi lại.'
          );
        }

        locked.current = false;
        setSending(false);
      } else {
        timer = setTimeout(poll, 1500);
      }
    }

    poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [command, logEvent]);

  const data = snapshot?.data;

  const age = Number.isFinite(data?.dataAgeSeconds)
    ? data.dataAgeSeconds +
      Math.max(0, (clock - snapshot.fetchedAt) / 1000)
    : null;

  const online =
    !apiError &&
    snapshot?.mqttConnected === true &&
    data?.online === true &&
    age !== null &&
    age >= 0 &&
    age <= 20;

  const canControl =
    online && apiKey.trim().length > 0 && !sending;

  const canWater =
    canControl &&
    data?.mode === 'MANUAL' &&
    data?.pump === 'OFF' &&
    data?.fsm === 'IDLE' &&
    data?.waterAvailable === true &&
    !data?.fault &&
    Number.isFinite(data?.soilMoisture) &&
    data.soilMoisture < 60;

  async function send(kind, values) {
    if (locked.current || !canControl) return;
    if (kind === 'pump' && values.state === 'ON' && !canWater) {
      return;
    }

    locked.current = true;
    setSending(true);
    setNotice('Đang gửi lệnh…');

    try {
      const result = await request(`/api/control/${kind}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
        },
        body: JSON.stringify({
          device_id: DEVICE,
          ...values,
        }),
      });

      if (!result.command_id) {
        throw new Error('Phản hồi thiếu mã lệnh.');
      }

      setNotice(
        'Backend đã nhận lệnh. Đang chờ trình điều khiển xác nhận…'
      );

      logEvent(
        `Đã gửi lệnh ${
          kind === 'mode'
            ? `chuyển ${values.mode}`
            : `bơm ${values.state}`
        }. Chờ xác nhận.`,
        'info'
      );

      setCommand({
        id: result.command_id,
        kind,
      });
    } catch (error) {
      logEvent(error.message, 'error');

      setNotice(
        `${error.message} Kiểm tra trạng thái thiết bị trước khi thử lại nếu mất kết nối.`
      );

      locked.current = false;
      setSending(false);
    }
  }

  // Biểu đồ tổng thể hiển thị đồng thời năm thông số.
  const isOverview = metric === 'all';

  const selected =
    DEFINITIONS.find(item => item.key === metric) ??
    DEFINITIONS[0];

  const source = tab === 'history' ? history : samples;

  // Chỉ giảm số điểm vẽ; CSV giữ toàn bộ mẫu đã tải.
  const stride = Math.max(1, Math.ceil(source.length / 500));

  const plotted = source.filter(
    (_, index) =>
      index % stride === 0 || index === source.length - 1
  );

  const visibleMetrics = isOverview
    ? DEFINITIONS
    : [selected];

  // Khoảng tham chiếu được mở rộng nếu dữ liệu vượt giới hạn.
  // Đây là phép quy đổi để so sánh xu hướng, không phải điểm sức khỏe.
  const referenceRanges = Object.fromEntries(
    DEFINITIONS.map(item => {
      let minimum = 0;
      let maximum = item.max;

      for (const sample of source) {
        const value = sample[item.key];

        if (Number.isFinite(value)) {
          minimum = Math.min(minimum, value);
          maximum = Math.max(maximum, value);
        }
      }

      return [item.key, { minimum, maximum }];
    })
  );

  const chartData = {
    labels: plotted.map(sample =>
      formatTime(
        sample.sampled_at || sample.time,
        tab === 'history'
          ? {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }
          : {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }
      )
    ),

    datasets: visibleMetrics.map(item => {
      const { minimum, maximum } =
        referenceRanges[item.key];

      return {
        label: `${item.name} (${item.unit})`,

        data: plotted.map(sample => {
          const value = sample[item.key];

          if (!Number.isFinite(value)) return null;

          return isOverview
            ? ((value - minimum) / (maximum - minimum)) * 100
            : value;
        }),

        borderColor: item.color,
        backgroundColor: item.color,
        borderWidth: 2,
        pointRadius: plotted.length > 60 ? 0 : 2,
        pointHoverRadius: 5,
        tension: 0.2,
        spanGaps: false,
      };
    }),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,

    interaction: {
      intersect: false,
      mode: 'index',
    },

    plugins: {
      legend: {
        display: isOverview,
        position: 'bottom',

        labels: {
          color: '#c3d2df',
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 14,
          font: { size: 11 },
        },
      },

      tooltip: {
        backgroundColor: '#172334',
        titleColor: '#ffffff',
        bodyColor: '#d8e6ef',
        padding: 12,

        callbacks: {
          label(context) {
            const item =
              visibleMetrics[context.datasetIndex];
            const sample = plotted[context.dataIndex];
            const value = sample?.[item.key];

            return `${item.name}: ${number(
              value,
              item.digits
            )} ${item.unit}`;
          },

          afterBody() {
            return isOverview
              ? ['Đường biểu diễn dùng thang tương đối.']
              : [];
          },
        },
      },
    },

    scales: {
      x: {
        ticks: {
          color: '#8d9fb4',
          maxTicksLimit: 7,
          maxRotation: 0,
        },
        grid: { display: false },
        border: { display: false },
      },

      y: {
        min:
          isOverview ||
          ['soilMoisture', 'humidity', 'light', 'vpd'].includes(
            metric
          )
            ? 0
            : undefined,

        max:
          isOverview ||
          ['soilMoisture', 'humidity'].includes(metric)
            ? 100
            : undefined,

        ticks: {
          color: '#8d9fb4',
          maxTicksLimit: 6,
        },

        grid: { color: '#1b2738' },
        border: { display: false },

        title: {
          display: true,
          text: isOverview
            ? 'Thang tương đối 0–100'
            : selected.unit,
          color: '#8d9fb4',
        },
      },
    },
  };

  const predictionReady =
    online &&
    data?.aiReady === true &&
    Number.isFinite(data?.predictedSoil) &&
    Number.isFinite(data?.predictedLight);

  const wateringReason = !online
    ? 'Chờ dữ liệu mới từ thiết bị.'
    : !apiKey.trim()
      ? 'Nhập khóa điều khiển để gửi lệnh.'
      : sending
        ? 'Đang theo dõi xác nhận lệnh.'
        : data?.mode !== 'MANUAL'
          ? 'Chuyển sang MANUAL để tưới thủ công.'
          : data?.waterAvailable !== true
            ? 'Không có nước để tưới.'
            : data?.fault
              ? `Lỗi thiết bị: ${data.fault}`
              : !Number.isFinite(data?.soilMoisture)
                ? 'Chưa có giá trị độ ẩm đất hợp lệ.'
                : data.soilMoisture >= 60
                  ? 'Đất từ 60% trở lên: tưới đang bị chặn.'
                  : data?.fsm !== 'IDLE' ||
                      data?.pump !== 'OFF'
                    ? 'Đợi thiết bị trở về trạng thái IDLE.'
                    : 'Sẵn sàng tưới. Thiết bị tự kết thúc sau 2,5 giây.';

  const statusTitle = !online
    ? 'Đang chờ dữ liệu mới'
    : data?.fault
      ? 'Thiết bị cần kiểm tra'
      : data?.pump === 'ON'
        ? 'Đang tưới cây'
        : data?.waterAvailable === false
          ? 'Cần bổ sung nước'
          : 'Khu vườn đang kết nối';

  function exportCsv() {
    const fields = [
      'sampled_at',
      'device_id',
      'temperature',
      'humidity',
      'soilMoisture',
      'light',
      'vpd',
      'mode',
      'pump',
      'simulated',
    ];

    const quote = value =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;

    const content = [
      fields.join(','),
      ...source.map(row =>
        fields.map(field => quote(row[field])).join(',')
      ),
    ].join('\r\n');

    const url = URL.createObjectURL(
      new Blob(['\uFEFF', content], {
        type: 'text/csv;charset=utf-8;',
      })
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = `plant-${tab}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="plant-app">
      <div className="dashboard">
        <header className="topbar panel">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="leaf" />
            </div>

            <div>
              <div className="eyebrow">
                AIoT / SMART GARDEN
              </div>
              <h1>
                Plant Command<span>.</span>
              </h1>
            </div>
          </div>

          <div className="top-actions">
            <span className="device-code">{DEVICE}</span>

            <span
              className={`badge ${online ? 'good' : 'muted'}`}
            >
              <i />
              {online ? 'Trực tuyến' : 'Chờ kết nối'}
            </span>

            <button
              className="icon-button"
              aria-label="Cài đặt khóa điều khiển"
              aria-expanded={settings}
              onClick={() => setSettings(value => !value)}
            >
              <Icon name="settings" />
            </button>
          </div>
        </header>

        {settings && (
          <section className="panel settings">
            <div>
              <h2>Khóa điều khiển</h2>
              <p>
                Chỉ lưu trong bộ nhớ trang. Tải lại trang sẽ
                xóa khóa.
              </p>
            </div>

            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                placeholder="Nhập khóa điều khiển"
                value={apiKey}
                onChange={event =>
                  setApiKey(event.target.value)
                }
              />
            </label>

            <button
              className="secondary"
              onClick={() => setSettings(false)}
            >
              Đóng
            </button>
          </section>
        )}

        <section
          className={`hero panel ${!online ? 'waiting' : ''}`}
        >
          <div className="hero-copy">
            <div className="eyebrow">
              <span
                className={`signal-dot ${
                  online ? '' : 'amber'
                }`}
              />
              GIÁM SÁT & ĐIỀU KHIỂN
            </div>

            <h2>
              {statusTitle}
              <span>.</span>
            </h2>

            <p>
              {!online
                ? 'Chưa đủ dữ liệu để đánh giá. Các lệnh điều khiển đang khóa.'
                : 'Theo dõi môi trường, dự đoán độ ẩm và điều khiển tưới tại một nơi.'}
            </p>

            <div className="hero-tags">
              <span className="tag">
                {data?.simulated === true
                  ? 'MÔ PHỎNG'
                  : data?.simulated === false
                    ? 'THIẾT BỊ THẬT'
                    : 'CHỜ DỮ LIỆU'}
              </span>

              <span>
                {data?.simulated
                  ? 'Không điều khiển phần cứng thật'
                  : 'Trạng thái dựa trên dữ liệu thiết bị'}
              </span>
            </div>
          </div>

          <div className="hero-stats">
            <div>
              <span>TUỔI DỮ LIỆU</span>
              <strong>
                {number(age)}
                <small> s</small>
              </strong>
              <em>
                {online ? 'Đang cập nhật' : 'Chưa sẵn sàng'}
              </em>
            </div>

            <div>
              <span>TRẠNG THÁI FSM</span>
              <strong className="fsm">
                {online ? data?.fsm ?? '—' : '—'}
              </strong>
              <em>
                {online
                  ? `Chế độ ${data?.mode ?? '—'}`
                  : 'Chờ mẫu mới'}
              </em>
            </div>
          </div>
        </section>

        {apiError && (
          <div className="alert" role="alert">
            <Icon name="activity" />
            Không đọc được API: {apiError}.
            {data
              ? ' Số liệu bên dưới là mẫu gần nhất đã nhận.'
              : ' Chưa nhận được dữ liệu.'}
          </div>
        )}

        {data?.fault && (
          <div className="alert" role="alert">
            Lỗi thiết bị: {data.fault}
          </div>
        )}

        <section
          className="sensor-grid"
          aria-label="Thông số môi trường"
        >
          {DEFINITIONS.map(item => (
            <article
              className={`sensor panel ${
                !online ? 'stale' : ''
              }`}
              key={item.key}
              style={{ '--accent': item.color }}
            >
              <div className="sensor-top">
                <h3>{item.name}</h3>
                <span className="sensor-icon">
                  <Icon name={item.icon} />
                </span>
              </div>

              <div className="sensor-value">
                {number(data?.[item.key], item.digits)}
                <small>{item.unit}</small>
              </div>

              <div className="meter">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((Number.isFinite(data?.[item.key])
                          ? data[item.key]
                          : 0) /
                          item.max) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>

              <p>
                {!online && data
                  ? 'Mẫu gần nhất · chưa xác nhận mới'
                  : item.hint}
              </p>
            </article>
          ))}
        </section>

        <div className="workspace-grid">
          <div className="analysis-column">
            <nav className="tabs" aria-label="Chọn nội dung">
              {TABS.map(([id, icon, label]) => (
                <button
                  key={id}
                  className={tab === id ? 'active' : ''}
                  aria-pressed={tab === id}
                  onClick={() => {
                    setTab(id);

                    if (
                      id === 'history' &&
                      !history.length
                    ) {
                      loadHistory();
                    }
                  }}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </nav>

            {(tab === 'live' || tab === 'history') && (
              <section className="panel chart-panel">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">
                      ENVIRONMENT TELEMETRY
                    </div>

                    <h2>
                      {tab === 'history'
                        ? 'Nhìn lại khu vườn'
                        : 'Nhịp sống khu vườn'}
                    </h2>

                    <p>
                      {tab === 'history'
                        ? `${history.length} mẫu đã tải trong 24 giờ gần nhất${
                            cursor
                              ? ' · còn dữ liệu cũ hơn'
                              : ''
                          }`
                        : `${samples.length}/60 mẫu gần nhất kể từ khi mở trang`}
                    </p>
                  </div>

                  <button
                    className="icon-button"
                    disabled={!source.length}
                    onClick={exportCsv}
                    aria-label="Tải CSV các mẫu đang xem"
                  >
                    <Icon name="download" />
                  </button>
                </div>

                <div className="metric-switch">
                  <button
                    className={
                      isOverview ? 'selected' : ''
                    }
                    aria-pressed={isOverview}
                    onClick={() => setMetric('all')}
                  >
                    Tổng thể
                  </button>

                  {DEFINITIONS.map(item => (
                    <button
                      key={item.key}
                      className={
                        metric === item.key
                          ? 'selected'
                          : ''
                      }
                      aria-pressed={metric === item.key}
                      onClick={() => setMetric(item.key)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>

                {isOverview && (
                  <div
                    style={{
                      color: '#94a7ba',
                      fontSize: 11,
                      lineHeight: 1.7,
                      marginBottom: 16,
                    }}
                  >
                    <p>
                      Năm thông số dùng thang tương đối
                      0–100. Rê chuột hoặc chạm vào điểm
                      để xem giá trị gốc; bấm chú giải để
                      ẩn/hiện từng đường.
                    </p>

                    <details style={{ marginTop: 6 }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          color: '#b6c9d8',
                        }}
                      >
                        Xem khoảng quy đổi
                      </summary>

                      <p style={{ marginTop: 6 }}>
                        {DEFINITIONS.map(item => {
                          const range =
                            referenceRanges[item.key];

                          return `${item.name}: ${number(
                            range.minimum,
                            item.digits
                          )}–${number(
                            range.maximum,
                            item.digits
                          )} ${item.unit}`;
                        }).join(' · ')}
                      </p>

                      <p style={{ marginTop: 5 }}>
                        Khoảng quy đổi có thể mở rộng khi
                        có giá trị vượt giới hạn. Đây
                        không phải điểm đánh giá sức khỏe
                        cây.
                      </p>
                    </details>
                  </div>
                )}

                <div
                  className="chart-area"
                  style={
                    isOverview
                      ? { height: 360 }
                      : undefined
                  }
                >
                  {source.length ? (
                    <Line
                      key={`${tab}-${metric}`}
                      data={chartData}
                      options={chartOptions}
                    />
                  ) : (
                    <div className="empty-state">
                      <Icon name="activity" />

                      <h3>
                        {historyBusy
                          ? 'Đang tải dữ liệu…'
                          : 'Chưa có mẫu để hiển thị'}
                      </h3>

                      <p>
                        {tab === 'live'
                          ? 'Giữ publisher chạy để nhận dữ liệu mới.'
                          : 'Bấm tải lại để đọc lịch sử từ backend.'}
                      </p>
                    </div>
                  )}
                </div>

                {historyError && tab === 'history' && (
                  <p
                    className="error-text"
                    role="alert"
                  >
                    {historyError}
                  </p>
                )}

                <div className="chart-footer">
                  <span>
                    <i
                      className="legend-dot"
                      style={{
                        background: isOverview
                          ? '#49e3ac'
                          : selected.color,
                      }}
                    />

                    {isOverview
                      ? 'Tổng thể 5 thông số · thang tương đối'
                      : `${selected.name} · ${selected.unit}`}

                    {stride > 1
                      ? ` · rút gọn còn ${plotted.length} điểm`
                      : ''}
                  </span>

                  {tab === 'history' ? (
                    <div className="inline-actions">
                      <button
                        className="text-button"
                        disabled={historyBusy}
                        onClick={() => loadHistory()}
                      >
                        {historyBusy
                          ? 'Đang tải…'
                          : 'Tải lại'}
                      </button>

                      {cursor && (
                        <button
                          className="text-button"
                          disabled={historyBusy}
                          onClick={() =>
                            loadHistory(true)
                          }
                        >
                          Tải mẫu cũ hơn
                        </button>
                      )}
                    </div>
                  ) : (
                    <span>
                      Thời gian lấy mẫu thực tế
                    </span>
                  )}
                </div>
              </section>
            )}

            {tab === 'events' && (
              <section className="panel log-panel">
                <div className="section-heading">
                  <div className="eyebrow">
                    ACTIVITY LOG
                  </div>
                  <h2>Nhật ký phiên làm việc</h2>
                  <p>
                    Các thay đổi và xác nhận kể từ khi
                    mở trang; không phải toàn bộ lịch sử
                    thiết bị.
                  </p>
                </div>

                {!events.length ? (
                  <div className="empty-state">
                    Chưa có sự kiện.
                  </div>
                ) : (
                  <div className="event-list">
                    {events.map(event => (
                      <div
                        className="event"
                        key={event.id}
                      >
                        <span
                          className={`event-dot ${event.status}`}
                        />

                        <div>
                          <span className="event-label">
                            {event.status === 'error'
                              ? 'CẦN KIỂM TRA'
                              : event.status === 'success'
                                ? 'XÁC NHẬN'
                                : 'CẬP NHẬT'}
                          </span>
                          <p>{event.message}</p>
                        </div>

                        <time>
                          {formatTime(event.time, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {tab === 'ai' && (
              <section className="panel ai-panel">
                <div className="section-heading">
                  <div className="eyebrow">
                    PREDICTIVE INSIGHT
                  </div>

                  <h2>
                    Nhìn trước{' '}
                    {data?.predictionHorizonMinutes ?? 60}{' '}
                    phút
                  </h2>

                  <p>
                    {data?.simulated
                      ? 'Dự đoán mô phỏng từ publisher, chưa phải suy luận LSTM thật.'
                      : 'Dự đoán do thiết bị gửi về backend.'}
                  </p>
                </div>

                <div className="prediction-grid">
                  <div>
                    <Icon name="drop" />
                    <span>Độ ẩm đất dự đoán</span>
                    <strong>
                      {predictionReady
                        ? number(data.predictedSoil)
                        : '—'}
                      <small> %</small>
                    </strong>
                  </div>

                  <div>
                    <Icon name="sun" />
                    <span>Ánh sáng dự đoán</span>
                    <strong>
                      {predictionReady
                        ? number(data.predictedLight, 0)
                        : '—'}
                      <small> Lux</small>
                    </strong>
                  </div>
                </div>

                <div className="ai-note">
                  <Icon name="spark" />

                  <div>
                    <h3>
                      {predictionReady
                        ? data.simulated
                          ? 'Dự đoán mô phỏng sẵn sàng'
                          : 'Đã nhận dự đoán mới'
                        : 'Chưa đủ dữ liệu để đánh giá'}
                    </h3>

                    <p>
                      {predictionReady
                        ? 'Giá trị dự đoán không phải cam kết kết quả. Thiết bị vẫn kiểm tra điều kiện nước, độ ẩm và trạng thái trước khi tưới.'
                        : 'Cần thiết bị trực tuyến và hai giá trị dự đoán hợp lệ. Không suy luận trạng thái an toàn từ dữ liệu cũ.'}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="panel control-panel">
            <div className="section-heading">
              <div className="eyebrow">
                IRRIGATION CONTROL
              </div>
              <h2>Điều khiển tưới</h2>
            </div>

            <div className="pump-display">
              <div
                className={`pump-icon ${
                  online && data?.pump === 'ON'
                    ? 'running'
                    : ''
                }`}
              >
                <Icon name="drop" />
              </div>

              <div>
                <span>BƠM NƯỚC</span>
                <strong>
                  {!online
                    ? 'Chưa xác nhận'
                    : data?.pump === 'ON'
                      ? 'Đang hoạt động'
                      : 'Đang tắt'}
                </strong>
              </div>

              <span
                className={`badge ${
                  online && data?.pump === 'ON'
                    ? 'good'
                    : 'muted'
                }`}
              >
                {online ? data?.pump ?? '—' : '—'}
              </span>
            </div>

            <div className="control-detail">
              <span>Nguồn nước</span>
              <strong>
                {!online
                  ? 'Chưa xác nhận'
                  : data?.waterAvailable === true
                    ? 'Có nước'
                    : data?.waterAvailable === false
                      ? 'Hết nước'
                      : 'Chưa xác nhận'}
              </strong>
            </div>

            <div className="control-detail">
              <span>Chế độ từ thiết bị</span>
              <strong>
                {online ? data?.mode ?? '—' : '—'}
              </strong>
            </div>

            <div className="mode-switch">
              {['AUTO', 'MANUAL'].map(mode => (
                <button
                  key={mode}
                  className={
                    online && data?.mode === mode
                      ? 'active'
                      : ''
                  }
                  disabled={
                    !canControl || data?.mode === mode
                  }
                  onClick={() => send('mode', { mode })}
                >
                  {mode === 'AUTO'
                    ? 'Tự động'
                    : 'Thủ công'}
                </button>
              ))}
            </div>

            <label className="key-label">
              <span>
                <Icon name="lock" />
                Khóa điều khiển
              </span>

              <input
                type="password"
                autoComplete="off"
                placeholder="Nhập API key"
                value={apiKey}
                onChange={event =>
                  setApiKey(event.target.value)
                }
              />
            </label>

            <p className="key-note">
              Chỉ giữ trong phiên hiện tại. Khóa được
              kiểm tra khi gửi lệnh.
            </p>

            <button
              className="primary water-button"
              disabled={!canWater}
              onClick={() =>
                send('pump', {
                  state: 'ON',
                  duration_ms: 2500,
                })
              }
            >
              <Icon name="drop" />
              Tưới ngay
              <span>2,5 s</span>
            </button>

            <p className="control-reason">
              {wateringReason}
            </p>

            <div className="command-notice" role="status">
              {notice || 'Chưa gửi lệnh trong phiên này.'}
            </div>

            {command && (
              <a
                className="command-link"
                href={`${API}/api/commands/${command.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Xem xác nhận lệnh ↗
              </a>
            )}
          </aside>
        </div>

        <footer className="footer">
          <span>
            <span className="footer-dot" />
            PLANT COMMAND / AIoT
          </span>

          <span>
            API{' '}
            {apiError
              ? 'lỗi kết nối'
              : snapshot
                ? 'đã kết nối'
                : 'đang chờ'}{' '}
            · MQTT{' '}
            {apiError
              ? 'chưa xác nhận'
              : snapshot?.mqttConnected
                ? 'đã kết nối'
                : 'đang chờ'}
          </span>

          <span>
            {data?.sampled_at
              ? `Mẫu gần nhất: ${formatTime(
                  data.sampled_at
                )}`
              : 'Chưa nhận mẫu'}
          </span>
        </footer>
      </div>
    </main>
  );
}

function Icon({ name }) {
  const paths = {
    leaf: (
      <>
        <path d="M20 4C10 2 3 7 5 14c2 7 13 6 15-10Z" />
        <path d="M4 21 15 10M8 16l-1-5m5 1 5 1" />
      </>
    ),

    drop: (
      <path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Zm-3 12c0 2 1 3 3 3" />
    ),

    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" />
      </>
    ),

    temp: (
      <>
        <path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z" />
        <path d="M12 8v10" />
      </>
    ),

    waves: (
      <path d="M3 7c3-4 6 4 9 0s6 4 9 0M3 12c3-4 6 4 9 0s6 4 9 0M3 17c3-4 6 4 9 0s6 4 9 0" />
    ),

    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),

    list: (
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    ),

    spark: (
      <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />
    ),

    lock: (
      <>
        <rect
          x="5"
          y="10"
          width="14"
          height="11"
          rx="3"
        />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),

    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),

    download: (
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    ),
  };

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.activity}
    </svg>
  );
}