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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

// Local dùng backend trên máy. Bản production dùng Render.
// Có thể ghi đè bằng biến VITE_API_URL.
const API = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://127.0.0.1:8000'
    : 'https://es-design.onrender.com')
).replace(/\/+$/, '');

const DEVICE = import.meta.env.VITE_DEVICE_ID || 'esp32_v1';

const METRICS = [
  {
    key: 'soilMoisture',
    name: 'Độ ẩm đất',
    unit: '%',
    digits: 1,
    color: '#059669',
    tint: '#e7f9ef',
    icon: 'drop',
    max: 100,
    hint: 'Ngưỡng chặn tưới: 60%',
  },
  {
    key: 'light',
    name: 'Ánh sáng',
    unit: 'Lux',
    digits: 0,
    color: '#d97706',
    tint: '#fff5d9',
    icon: 'sun',
    max: 100000,
    hint: 'Cường độ ánh sáng',
  },
  {
    key: 'temperature',
    name: 'Nhiệt độ',
    unit: '°C',
    digits: 1,
    color: '#e06446',
    tint: '#fff0e9',
    icon: 'temp',
    max: 50,
    hint: 'Nhiệt độ môi trường',
  },
  {
    key: 'humidity',
    name: 'Độ ẩm khí',
    unit: '%',
    digits: 1,
    color: '#0284c7',
    tint: '#e7f5ff',
    icon: 'waves',
    max: 100,
    hint: 'Độ ẩm tương đối',
  },
  {
    key: 'vpd',
    name: 'VPD',
    unit: 'kPa',
    digits: 2,
    color: '#8b5cf6',
    tint: '#f2edff',
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

const fmt = (value, digits = 1) =>
  Number.isFinite(value)
    ? value.toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : '—';

function dateText(value, options) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('vi-VN', options)
    : '—';
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`API không trả JSON hợp lệ (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(
      typeof body.detail === 'string'
        ? body.detail
        : `Yêu cầu thất bại (${response.status}).`
    );
  }

  return body;
}

function Icon({ name, size = 22 }) {
  const shapes = {
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
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    spark: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
    hand: (
      <>
        <path d="M8 13V7a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8c0 4-3 6-7 6-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    settings: (
      <>
        <path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    alert: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name] || shapes.activity}
    </svg>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [apiError, setApiError] = useState('');
  const [samples, setSamples] = useState([]);
  const [clock, setClock] = useState(Date.now());

  const [tab, setTab] = useState('live');
  const [metric, setMetric] = useState('all');
  const [settings, setSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const [sending, setSending] = useState(false);
  const [command, setCommand] = useState(null);
  const [notice, setNotice] = useState('');
  const [events, setEvents] = useState([]);

  const [history, setHistory] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [cursor, setCursor] = useState(null);

  const commandLock = useRef(false);
  const historyLock = useRef(false);
  const lastDevice = useRef(null);
  const lastAI = useRef(null);

  const logEvent = useCallback((message, status = 'info') => {
    setEvents(previous => [
      {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        message,
        status,
      },
      ...previous,
    ].slice(0, 100));
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;

    async function poll() {
      try {
        const result = await request(
          `/api/telemetry/latest?device_id=${encodeURIComponent(DEVICE)}`
        );

        if (result.status !== 'success') {
          throw new Error('API chưa trả dữ liệu hợp lệ.');
        }

        if (stopped) return;

        setSnapshot({ ...result, fetchedAt: Date.now() });
        setApiError('');

        const item = result.data;

        if (item) {
          const deviceState = [
            item.mode,
            item.pump,
            item.fsm,
            item.waterAvailable,
            item.fault,
            item.simulated,
          ].join('|');

          if (lastDevice.current !== deviceState) {
            logEvent(
              `${lastDevice.current === null ? 'Nhận trạng thái' : 'Thiết bị cập nhật'}: ${
                item.mode
              } · Bơm ${item.pump} · ${item.fsm}${
                item.fault ? ` · ${item.fault}` : ''
              }`,
              item.fault ? 'error' : 'info'
            );
            lastDevice.current = deviceState;
          }

          const aiState = [
            item.aiReady,
            item.aiMessage,
            item.soilPredictionSource,
            item.lightPredictionSource,
          ].join('|');

          if (lastAI.current !== aiState && item.aiMessage) {
            logEvent(
              `AI: ${item.aiMessage}`,
              item.aiReady ? 'success' : 'info'
            );
          }

          lastAI.current = aiState;
        }

        if (item?.sample_id) {
          setSamples(previous => {
            const index = previous.findIndex(
              value => value.sample_id === item.sample_id
            );

            if (index >= 0) {
              const updated = [...previous];
              updated[index] = item;
              return updated;
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
    const tick = setInterval(() => setClock(Date.now()), 1000);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [logEvent]);

  async function loadHistory(older = false) {
    if (historyLock.current) return;

    historyLock.current = true;
    setHistoryBusy(true);
    setHistoryError('');

    try {
      const before = older && cursor
        ? `&before_id=${encodeURIComponent(cursor)}`
        : '';

      const result = await request(
        `/api/telemetry/history?device_id=${encodeURIComponent(DEVICE)}&hours=24&limit=1000${before}`
      );

      if (!Array.isArray(result.data)) {
        throw new Error('Lịch sử trả về không hợp lệ.');
      }

      setHistory(previous => {
        const merged = older
          ? [...result.data, ...previous]
          : result.data;

        return [...new Map(
          merged.map(item => [item.sample_id, item])
        ).values()].sort(
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
    if (!command?.id) return;

    let stopped = false;
    let timer;
    let previousStatus = '';
    const deadline = Date.now() + 45000;

    async function poll() {
      let terminal = false;

      try {
        const result = await request(`/api/commands/${command.id}`);
        if (stopped) return;

        const record = result.data;
        if (!record?.status) {
          throw new Error('Chưa đọc được trạng thái lệnh.');
        }

        setNotice(
          `Lệnh ${record.status}: ${record.message || 'Đang chờ xác nhận.'}`
        );

        if (previousStatus !== record.status) {
          const failed = [
            'rejected', 'failed', 'publish_failed', 'timeout',
          ].includes(record.status);

          logEvent(
            `${record.status}: ${record.message || 'Cập nhật lệnh'}`,
            failed
              ? 'error'
              : ['applied', 'completed'].includes(record.status)
                ? 'success'
                : 'info'
          );

          previousStatus = record.status;
        }

        terminal = [
          'completed', 'rejected', 'failed', 'publish_failed', 'timeout',
        ].includes(record.status) ||
          (command.kind === 'mode' && record.status === 'applied');

        if (record.status === 'timeout') {
          setNotice(
            'Hết thời gian chờ xác nhận. Kiểm tra trạng thái thiết bị trước khi gửi lại.'
          );
        }
      } catch (error) {
        if (!stopped) {
          setNotice(`Chưa đọc được xác nhận: ${error.message}`);
        }
      }

      if (stopped) return;

      if (terminal || Date.now() >= deadline) {
        if (!terminal) {
          setNotice(
            'Chưa xác nhận được kết quả. Kiểm tra thiết bị trước khi gửi lại.'
          );
        }
        commandLock.current = false;
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
    if (commandLock.current || !canControl) return;
    if (kind === 'pump' && !canWater) return;

    commandLock.current = true;
    setSending(true);
    setNotice('Đang gửi lệnh…');

    try {
      const result = await request(`/api/control/${kind}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
        },
        body: JSON.stringify({ device_id: DEVICE, ...values }),
      });

      if (!result.command_id) {
        throw new Error('Phản hồi thiếu mã lệnh.');
      }

      setNotice('Đã gửi yêu cầu. Đang chờ thiết bị xác nhận…');
      logEvent(
        kind === 'mode'
          ? `Yêu cầu chuyển sang ${values.mode}.`
          : 'Yêu cầu tưới trong 2,5 giây.'
      );
      setCommand({ id: result.command_id, kind });
    } catch (error) {
      setNotice(
        `${error.message} Nếu mất kết nối, kiểm tra thiết bị trước khi gửi lại.`
      );
      logEvent(error.message, 'error');
      commandLock.current = false;
      setSending(false);
    }
  }

  const wateringReason = !online
    ? 'Chờ dữ liệu mới từ thiết bị.'
    : !apiKey.trim()
      ? 'Nhập khóa điều khiển để sử dụng các nút.'
      : sending
        ? 'Đang chờ xác nhận từ thiết bị.'
        : data?.mode !== 'MANUAL'
          ? 'Chọn Thủ công để sử dụng nút tưới.'
          : data?.waterAvailable !== true
            ? 'Bình chưa có nước.'
            : data?.fault
              ? `Thiết bị đang lỗi: ${data.fault}`
              : !Number.isFinite(data?.soilMoisture)
                ? 'Chưa có số đo độ ẩm đất hợp lệ.'
                : data.soilMoisture >= 60
                  ? 'Đất đã đạt 60%: tạm chặn tưới.'
                  : data?.fsm !== 'IDLE' || data?.pump !== 'OFF'
                    ? 'Chờ thiết bị trở về IDLE và bơm OFF.'
                    : 'Sẵn sàng. Bơm tự dừng sau 2,5 giây.';

  const predictionTime = data?.predictionInputAt
    ? new Date(data.predictionInputAt).getTime()
    : NaN;

  const predictionAge = Number.isFinite(predictionTime)
    ? (clock - predictionTime) / 1000
    : null;

  const predictionReady =
    online &&
    data?.aiReady === true &&
    data?.soilPredictionSource === 'lstm_csv_huber' &&
    predictionAge !== null &&
    predictionAge >= -10 &&
    predictionAge <= 90 &&
    Number.isFinite(data?.predictedSoil) &&
    data.predictedSoil >= 0 &&
    data.predictedSoil <= 100;

  const lightReady =
    predictionReady &&
    data?.lightPredictionSource === 'persistence' &&
    Number.isFinite(data?.predictedLight) &&
    data.predictedLight >= 0;

  const backendMessage = typeof data?.aiMessage === 'string'
    ? data.aiMessage.trim()
    : '';

  let aiTitle = 'Đang chờ dữ liệu AI';
  let aiMessage = 'Chưa nhận được trạng thái AI từ backend.';

  if (apiError) {
    aiTitle = 'Chưa kết nối được AI';
    aiMessage = 'Không đọc được backend. Tạm ẩn các dự đoán cũ.';
  } else if (!data) {
    aiTitle = 'Chưa có dữ liệu thiết bị';
    aiMessage = 'Chờ backend nhận bản tin đầu tiên.';
  } else if (!online) {
    aiTitle = 'Đang chờ dữ liệu mới';
    aiMessage = 'Thiết bị hoặc kết nối chưa sẵn sàng để hiển thị dự đoán.';
  } else if (data.aiReady !== true) {
    aiTitle = backendMessage.includes('ngoài phạm vi')
      ? 'Dữ liệu ngoài phạm vi huấn luyện'
      : backendMessage.includes('gián đoạn')
        ? 'Dữ liệu đang bị gián đoạn'
        : 'AI chưa sẵn sàng';
    aiMessage = backendMessage || 'Backend chưa có dự đoán phù hợp.';
  } else if (data.soilPredictionSource !== 'lstm_csv_huber') {
    aiTitle = 'Chưa xác nhận nguồn dự đoán';
    aiMessage = 'Backend chưa trả nguồn LSTM Huber. Kiểm tra phiên bản backend.';
  } else if (!predictionReady) {
    aiTitle = 'Đang chờ dự đoán hợp lệ';
    aiMessage = 'Dự đoán đã cũ, thiếu thời điểm hoặc có giá trị không hợp lệ.';
  } else {
    aiTitle = 'Dự đoán LSTM đã sẵn sàng';
    aiMessage = backendMessage || 'Độ ẩm được dự đoán trên backend.';
  }

  const heroTitle = !online
    ? 'Chờ khu vườn kết nối'
    : data?.fault
      ? 'Thiết bị cần kiểm tra'
      : data?.pump === 'ON'
        ? 'Đang chăm sóc khu vườn'
        : data?.waterAvailable === false
          ? 'Đã đến lúc bổ sung nước'
          : 'Khu vườn trong tầm tay';

  const source = tab === 'history' ? history : samples;
  const overview = metric === 'all';
  const selected = METRICS.find(item => item.key === metric) || METRICS[0];
  const visibleMetrics = overview ? METRICS : [selected];

  const stride = Math.max(1, Math.ceil(source.length / 500));
  const plotted = source.filter(
    (_, index) => index % stride === 0 || index === source.length - 1
  );

  const ranges = Object.fromEntries(
    METRICS.map(item => {
      let min = 0;
      let max = item.max;
      for (const sample of source) {
        if (Number.isFinite(sample[item.key])) {
          min = Math.min(min, sample[item.key]);
          max = Math.max(max, sample[item.key]);
        }
      }
      return [item.key, { min, max }];
    })
  );

  const chartData = {
    labels: plotted.map(item => dateText(
      item.sampled_at || item.time,
      tab === 'history'
        ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    )),
    datasets: visibleMetrics.map(item => ({
      label: `${item.name} (${item.unit})`,
      data: plotted.map(sample => {
        const value = sample[item.key];
        if (!Number.isFinite(value)) return null;
        const range = ranges[item.key];
        return overview
          ? (value - range.min) / (range.max - range.min) * 100
          : value;
      }),
      borderColor: item.color,
      backgroundColor: item.color,
      borderWidth: 2.5,
      pointRadius: plotted.length > 60 ? 0 : 2,
      pointHoverRadius: 5,
      tension: 0.2,
      spanGaps: false,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        display: overview,
        position: 'bottom',
        labels: {
          color: '#64766e',
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 18,
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: '#173f34',
        titleColor: '#ffffff',
        bodyColor: '#e7f8ef',
        padding: 12,
        callbacks: {
          label(context) {
            const item = visibleMetrics[context.datasetIndex];
            return `${item.name}: ${fmt(
              plotted[context.dataIndex]?.[item.key], item.digits
            )} ${item.unit}`;
          },
          afterBody() {
            return overview ? ['Biểu đồ dùng thang tương đối.'] : [];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#83928c', maxTicksLimit: 6, maxRotation: 0 },
      },
      y: {
        min: overview || ['soilMoisture', 'humidity', 'light', 'vpd'].includes(metric)
          ? 0 : undefined,
        max: overview || ['soilMoisture', 'humidity'].includes(metric)
          ? 100 : undefined,
        border: { display: false },
        grid: { color: '#edf2ee' },
        ticks: { color: '#83928c', maxTicksLimit: 6 },
        title: {
          display: true,
          text: overview ? 'Thang tương đối 0–100' : selected.unit,
          color: '#83928c',
        },
      },
    },
  };

  function exportCsv() {
    const fields = [
      'sampled_at', 'device_id', 'temperature', 'humidity',
      'soilMoisture', 'light', 'vpd', 'mode', 'pump', 'simulated',
    ];

    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      fields.join(','),
      ...source.map(row => fields.map(key => quote(row[key])).join(',')),
    ].join('\r\n');

    const url = URL.createObjectURL(
      new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `plant-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <style>{STYLES}</style>

      <main className="garden-app">
        <div className="garden-shell">
          <header className="garden-header">
            <div className="garden-brand">
              <div className="garden-logo"><Icon name="leaf" size={29} /></div>
              <div>
                <div className="garden-overline">SMART GARDEN / AIoT</div>
                <h1>Plant Command<span>.</span></h1>
              </div>
            </div>

            <div className="garden-header-actions">
              <span className="garden-device">{DEVICE}</span>
              <span className={`garden-pill ${online ? 'is-green' : 'is-amber'}`}>
                <i />{online ? 'Trực tuyến' : 'Chờ kết nối'}
              </span>
              <button
                className="garden-icon-button"
                aria-label="Mở cài đặt"
                aria-expanded={settings}
                onClick={() => setSettings(value => !value)}
              >
                <Icon name="settings" />
              </button>
            </div>
          </header>

          {settings && (
            <section className="garden-card garden-settings">
              <div>
                <h2>Cài đặt điều khiển</h2>
                <p>Khóa chỉ giữ trong bộ nhớ trang, không lưu sau khi tải lại.</p>
                <p className="garden-api-address">API: {API}</p>
              </div>
              <label className="garden-key">
                <span>Khóa điều khiển</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  placeholder="Nhập API key"
                  onChange={event => setApiKey(event.target.value)}
                />
              </label>
              <button className="garden-soft-button" onClick={() => setSettings(false)}>
                Đóng
              </button>
            </section>
          )}

          <section className="garden-hero">
            <div className="garden-hero-copy">
              <div className="garden-overline">
                <span className={`garden-dot ${online ? '' : 'is-amber'}`} />
                MỖI NGÀY MỘT CHÚT XANH
              </div>
              <h2>{heroTitle}<span>.</span></h2>
              <p>Theo dõi môi trường, dự đoán độ ẩm và chăm sóc cây tại một nơi.</p>
              <div className="garden-hero-tags">
                <span className={`garden-pill ${data?.simulated ? 'is-amber' : 'is-green'}`}>
                  {data?.simulated === true
                    ? 'Đầu vào mô phỏng'
                    : data?.simulated === false
                      ? 'Cảm biến thực tế'
                      : 'Chờ dữ liệu'}
                </span>
                <span>AI xử lý trên backend</span>
              </div>
            </div>

            <div className="garden-hero-stats">
              <div>
                <Icon name="clock" />
                <span>Tuổi dữ liệu</span>
                <strong>{fmt(age)}<small> giây</small></strong>
                <p>{online ? 'Đang cập nhật' : 'Chờ mẫu mới'}</p>
              </div>
              <div>
                <Icon name="activity" />
                <span>Trạng thái thiết bị</span>
                <strong>{online ? data?.fsm ?? '—' : '—'}</strong>
                <p>{online ? `Chế độ ${data?.mode ?? '—'}` : 'Chưa xác nhận'}</p>
              </div>
            </div>
          </section>

          {apiError && (
            <div className="garden-alert" role="alert">
              <Icon name="alert" />
              <span>
                Không đọc được API: {apiError}.
                {data ? ' Đang hiển thị số đo gần nhất đã nhận.' : ''}
              </span>
            </div>
          )}

          {data?.fault && (
            <div className="garden-alert" role="alert">
              <Icon name="alert" />Lỗi thiết bị: {data.fault}
            </div>
          )}

          <section className="garden-sensors" aria-label="Thông số cảm biến">
            {METRICS.map(item => (
              <article
                key={item.key}
                className={`garden-card garden-sensor ${!online ? 'is-stale' : ''}`}
                style={{ '--sensor-color': item.color, '--sensor-tint': item.tint }}
              >
                <div className="garden-sensor-head">
                  <span>{item.name}</span>
                  <div className="garden-sensor-icon"><Icon name={item.icon} /></div>
                </div>
                <div className="garden-sensor-value">
                  {fmt(data?.[item.key], item.digits)}
                  <small>{item.unit}</small>
                </div>
                <div className="garden-meter">
                  <span style={{
                    width: `${Number.isFinite(data?.[item.key])
                      ? Math.min(100, Math.max(0, data[item.key] / item.max * 100))
                      : 0}%`,
                  }} />
                </div>
                <p>{item.hint}</p>
              </article>
            ))}
          </section>

          <div className="garden-workspace">
            <div className="garden-main">
              <nav className="garden-tabs" aria-label="Nội dung theo dõi">
                {TABS.map(([key, icon, label]) => (
                  <button
                    key={key}
                    className={tab === key ? 'is-active' : ''}
                    aria-pressed={tab === key}
                    onClick={() => {
                      setTab(key);
                      if (key === 'history' && !history.length) loadHistory();
                    }}
                  >
                    <Icon name={icon} size={18} />{label}
                  </button>
                ))}
              </nav>

              <div
                className={`garden-ai-status ${predictionReady ? 'is-ready' : 'is-waiting'}`}
                role="status"
              >
                <div className="garden-ai-status-icon">
                  <Icon name={predictionReady ? 'spark' : 'alert'} />
                </div>
                <div>
                  <strong>{aiTitle}</strong>
                  <p>{aiMessage}</p>
                </div>
                {tab !== 'ai' && (
                  <button
                    className="garden-icon-button"
                    aria-label="Xem chi tiết AI"
                    onClick={() => setTab('ai')}
                  >
                    <Icon name="arrow" size={19} />
                  </button>
                )}
              </div>

              {(tab === 'live' || tab === 'history') && (
                <section className="garden-card garden-chart-panel">
                  <div className="garden-section-head">
                    <div>
                      <div className="garden-overline">ENVIRONMENT TELEMETRY</div>
                      <h2>{tab === 'history' ? 'Nhìn lại khu vườn' : 'Nhịp sống khu vườn'}</h2>
                      <p>
                        {tab === 'history'
                          ? `${history.length} mẫu đã tải trong 24 giờ${cursor ? ' · còn mẫu cũ hơn' : ''}`
                          : `${samples.length}/60 mẫu gần nhất kể từ khi mở trang`}
                      </p>
                    </div>
                    <button
                      className="garden-icon-button"
                      disabled={!source.length}
                      onClick={exportCsv}
                      aria-label="Tải CSV"
                    >
                      <Icon name="download" />
                    </button>
                  </div>

                  <div className="garden-metric-switch">
                    <button
                      className={overview ? 'is-active' : ''}
                      aria-pressed={overview}
                      onClick={() => setMetric('all')}
                    >
                      Tổng thể
                    </button>
                    {METRICS.map(item => (
                      <button
                        key={item.key}
                        className={metric === item.key ? 'is-active' : ''}
                        aria-pressed={metric === item.key}
                        onClick={() => setMetric(item.key)}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>

                  {overview && (
                    <div className="garden-chart-help">
                      <p>
                        Năm thông số dùng thang tương đối. Chạm vào điểm để xem
                        số đo gốc; bấm chú giải để ẩn hoặc hiện từng đường.
                      </p>
                      <details>
                        <summary>Xem khoảng quy đổi</summary>
                        <p>
                          {METRICS.map(item =>
                            `${item.name}: ${fmt(ranges[item.key].min, item.digits)}–${
                              fmt(ranges[item.key].max, item.digits)
                            } ${item.unit}`
                          ).join(' · ')}
                        </p>
                        <p>Thang tương đối không phải điểm sức khỏe cây.</p>
                      </details>
                    </div>
                  )}

                  <div className="garden-chart">
                    {source.length ? (
                      <Line
                        key={`${tab}-${metric}`}
                        data={chartData}
                        options={chartOptions}
                      />
                    ) : (
                      <div className="garden-empty">
                        <Icon name="activity" size={35} />
                        <h3>{historyBusy ? 'Đang tải dữ liệu…' : 'Chưa có mẫu để hiển thị'}</h3>
                        <p>
                          {tab === 'history'
                            ? 'Bấm tải lại để đọc dữ liệu từ backend.'
                            : 'Chờ thiết bị hoặc bộ giả lập gửi dữ liệu.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {historyError && tab === 'history' && (
                    <p className="garden-error" role="alert">{historyError}</p>
                  )}

                  <div className="garden-chart-footer">
                    <span>
                      {overview ? 'Tổng thể 5 thông số' : selected.name}
                      {stride > 1 ? ` · ${plotted.length} điểm hiển thị` : ''}
                    </span>
                    {tab === 'history' ? (
                      <div className="garden-inline-actions">
                        <button
                          className="garden-text-button"
                          disabled={historyBusy}
                          onClick={() => loadHistory()}
                        >
                          {historyBusy ? 'Đang tải…' : 'Tải lại'}
                        </button>
                        {cursor && (
                          <button
                            className="garden-text-button"
                            disabled={historyBusy}
                            onClick={() => loadHistory(true)}
                          >
                            Tải thêm
                          </button>
                        )}
                      </div>
                    ) : <span>Thời gian lấy mẫu thực tế</span>}
                  </div>
                </section>
              )}

              {tab === 'events' && (
                <section className="garden-card garden-content-panel">
                  <div className="garden-section-head">
                    <div>
                      <div className="garden-overline">ACTIVITY LOG</div>
                      <h2>Nhật ký phiên làm việc</h2>
                      <p>Các sự kiện kể từ khi mở trang, không phải toàn bộ lịch sử thiết bị.</p>
                    </div>
                  </div>

                  {!events.length ? (
                    <div className="garden-empty">Chưa có sự kiện.</div>
                  ) : (
                    <div className="garden-events">
                      {events.map(event => (
                        <article className="garden-event" key={event.id}>
                          <span className={`garden-event-dot ${event.status}`} />
                          <div>
                            <small>
                              {event.status === 'error'
                                ? 'CẦN KIỂM TRA'
                                : event.status === 'success'
                                  ? 'XÁC NHẬN'
                                  : 'CẬP NHẬT'}
                            </small>
                            <p>{event.message}</p>
                          </div>
                          <time>
                            {dateText(event.time, {
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </time>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tab === 'ai' && (
                <section className="garden-card garden-content-panel">
                  <div className="garden-section-head">
                    <div>
                      <div className="garden-overline">PREDICTIVE INSIGHT</div>
                      <h2>Nhìn trước {data?.predictionHorizonMinutes ?? 60} phút</h2>
                      <p>LSTM dự đoán độ ẩm đất. Ánh sáng dùng baseline giữ nguyên số đo.</p>
                    </div>
                  </div>

                  <span className={`garden-pill ${data?.simulated ? 'is-amber' : 'is-green'}`}>
                    {data?.simulated === true
                      ? 'Đầu vào mô phỏng'
                      : data?.simulated === false
                        ? 'Đầu vào cảm biến'
                        : 'Chưa có đầu vào'}
                  </span>

                  <div className="garden-predictions">
                    <div className="garden-prediction soil">
                      <Icon name="drop" size={28} />
                      <span>Độ ẩm đất · LSTM</span>
                      <strong>
                        {predictionReady ? fmt(data.predictedSoil, 2) : '—'}
                        <small> %</small>
                      </strong>
                      <p>
                        {data?.soilPredictionSource === 'lstm_csv_huber'
                          ? 'LSTM Huber chạy trên backend'
                          : 'Chưa xác nhận nguồn dự đoán'}
                      </p>
                    </div>
                    <div className="garden-prediction light">
                      <Icon name="sun" size={28} />
                      <span>Ánh sáng · Baseline</span>
                      <strong>
                        {lightReady ? fmt(data.predictedLight, 0) : '—'}
                        <small> Lux</small>
                      </strong>
                      <p>
                        {data?.lightPredictionSource === 'persistence'
                          ? 'Giữ nguyên số đo tại thời điểm dự báo'
                          : 'Chưa xác nhận nguồn dự báo'}
                      </p>
                    </div>
                  </div>

                  <div className="garden-detail">
                    <span>Thời điểm đầu vào</span>
                    <strong>{dateText(data?.predictionInputAt)}</strong>
                  </div>
                  <div className="garden-detail">
                    <span>Thời điểm được dự báo</span>
                    <strong>{dateText(data?.predictionTargetAt)}</strong>
                  </div>
                  <div className="garden-detail">
                    <span>Trạng thái dự đoán</span>
                    <strong>{predictionReady ? 'Sẵn sàng' : 'Chưa sử dụng'}</strong>
                  </div>

                  <div className="garden-ai-explanation">
                    <Icon name="leaf" size={20} />
                    <p>
                      Mô hình học từ CSV có dữ liệu tổng hợp dựa trên thực nghiệm.
                      Dự đoán hiện dùng để theo dõi, chưa tự quyết định bật bơm.
                      Độ chính xác với cảm biến thật cần được kiểm chứng riêng.
                    </p>
                  </div>
                </section>
              )}
            </div>

            <aside className="garden-card garden-controls">
              <div className="garden-overline">IRRIGATION CONTROL</div>
              <h2>Chăm sóc cây</h2>
              <p className="garden-control-subtitle">Một thao tác, thêm một chút xanh.</p>

              <div className={`garden-pump ${online && data?.pump === 'ON' ? 'is-running' : ''}`}>
                <div className="garden-pump-symbol"><Icon name="drop" size={29} /></div>
                <div>
                  <span>BƠM NƯỚC</span>
                  <strong>
                    {!online ? 'Chưa xác nhận' : data?.pump === 'ON' ? 'Đang tưới' : 'Đang nghỉ'}
                  </strong>
                </div>
                <span className={`garden-pill ${online && data?.pump === 'ON' ? 'is-green' : 'is-neutral'}`}>
                  {online ? data?.pump ?? '—' : '—'}
                </span>
              </div>

              <div className="garden-detail">
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

              <div className="garden-detail">
                <span>Chế độ đã xác nhận</span>
                <strong>{online ? data?.mode ?? '—' : '—'}</strong>
              </div>

              <div className="garden-mode-label">CHỌN CHẾ ĐỘ</div>

              <div className="garden-mode-switch">
                {['AUTO', 'MANUAL'].map(mode => {
                  const active = online && data?.mode === mode;
                  const blocked = !canControl || active;

                  return (
                    <button
                      key={mode}
                      className={`garden-mode-button ${
                        mode === 'AUTO' ? 'automatic' : 'manual'
                      } ${active ? 'is-selected' : ''}`}
                      disabled={blocked}
                      aria-pressed={active}
                      onClick={() => send('mode', { mode })}
                    >
                      <span className="garden-mode-top">
                        <Icon name={mode === 'AUTO' ? 'spark' : 'hand'} size={24} />
                        {active && <Icon name="check" size={17} />}
                      </span>
                      <strong>{mode === 'AUTO' ? 'Tự động' : 'Thủ công'}</strong>
                      <small>{active ? 'Đang chọn' : mode}</small>
                    </button>
                  );
                })}
              </div>

              <label className="garden-key">
                <span><Icon name="lock" size={16} />Khóa điều khiển</span>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Nhập API key"
                  value={apiKey}
                  onChange={event => setApiKey(event.target.value)}
                />
              </label>

              <p className="garden-key-note">
                Khóa chỉ giữ trong phiên hiện tại và được kiểm tra khi gửi lệnh.
              </p>

              <button
                className="garden-water-button"
                disabled={!canWater}
                onClick={() => send('pump', { state: 'ON', duration_ms: 2500 })}
              >
                <Icon name="drop" size={24} />
                <span>{sending ? 'Đang xử lý…' : 'Tưới ngay'}</span>
                <small>2,5 s</small>
              </button>

              <p className="garden-control-reason">{wateringReason}</p>

              <div className="garden-command-notice" role="status">
                {notice || 'Chưa gửi lệnh trong phiên này.'}
              </div>

              {command && (
                <a
                  className="garden-command-link"
                  href={`${API}/api/commands/${command.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Xem xác nhận lệnh ↗
                </a>
              )}
            </aside>
          </div>

          <footer className="garden-footer">
            <span><Icon name="leaf" size={16} />PLANT COMMAND / AIoT</span>
            <span>
              API {apiError ? 'lỗi kết nối' : snapshot ? 'đã kết nối' : 'đang chờ'}
              {' · '}
              MQTT {apiError
                ? 'chưa xác nhận'
                : snapshot?.mqttConnected ? 'đã kết nối' : 'đang chờ'}
            </span>
            <span>
              {data?.sampled_at
                ? `Mẫu gần nhất: ${dateText(data.sampled_at)}`
                : 'Chưa nhận mẫu'}
            </span>
          </footer>
        </div>
      </main>
    </>
  );
}

const STYLES = `
  :root {
    font-family: Inter, "Segoe UI", Arial, sans-serif;
    color: #233e34;
    background: #f3f7f2;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    color-scheme: light;
  }

  body {
    margin: 0;
    min-width: 320px;
    display: block;
    background: #f3f7f2;
  }

  #root {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
    text-align: left;
  }

  .garden-app, .garden-app * { box-sizing: border-box; }
  .garden-app {
    min-height: 100vh;
    padding: 30px;
    color: #233e34;
    background:
      radial-gradient(ellipse at 5% 0%, #e0f4dc 0, transparent 35%),
      radial-gradient(ellipse at 95% 12%, #fff5df 0, transparent 30%),
      #f3f7f2;
    font: 14px/1.55 Inter, "Segoe UI", Arial, sans-serif;
  }

  .garden-app h1, .garden-app h2, .garden-app h3,
  .garden-app p { margin: 0; }
  .garden-app button, .garden-app input { font: inherit; }
  .garden-app button {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .garden-app button:disabled { cursor: not-allowed; }
  .garden-app button:focus-visible,
  .garden-app input:focus-visible,
  .garden-app a:focus-visible,
  .garden-app summary:focus-visible {
    outline: 3px solid #38bdf8;
    outline-offset: 4px;
  }
  .garden-app svg { flex-shrink: 0; }
  .garden-shell { max-width: 1500px; margin: auto; }
  .garden-card {
    background: #fff;
    border: 1px solid #e1e9df;
    border-radius: 24px;
    box-shadow: 0 5px 18px #304f3510;
  }

  .garden-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    background: #ffffffeb;
    border: 1px solid #e1e9df;
    border-radius: 24px;
    padding: 21px 26px;
    box-shadow: 0 5px 22px #304f3509;
  }
  .garden-brand { display: flex; align-items: center; gap: 15px; min-width: 0; }
  .garden-logo {
    width: 53px;
    height: 53px;
    display: grid;
    place-items: center;
    color: white;
    border-radius: 17px;
    background: linear-gradient(145deg, #73d692, #16a673);
    border: 1px solid #32aa78;
    box-shadow: inset 0 2px 0 #ffffff60, 0 4px 0 #16875e, 0 9px 17px #27ad7530;
  }
  .garden-overline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    letter-spacing: 1.7px;
    font-weight: 800;
    color: #43856d;
  }
  .garden-brand h1 { font-size: 26px; letter-spacing: -.9px; line-height: 1.3; }
  .garden-brand h1 span { color: #20ad77; }
  .garden-header-actions { display: flex; align-items: center; gap: 13px; }
  .garden-device {
    font: 12px ui-monospace, Consolas, monospace;
    color: #657c70;
    padding-right: 15px;
    border-right: 1px solid #dbe6dc;
  }
  .garden-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 6px 11px;
    border-radius: 30px;
    font-size: 11px;
    font-weight: 750;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .garden-pill i, .garden-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    background: currentColor;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .garden-pill.is-green { color: #07835a; background: #e9f8ef; border-color: #ccebd9; }
  .garden-pill.is-amber { color: #9b6914; background: #fff5dc; border-color: #f0e2b7; }
  .garden-pill.is-neutral { color: #687b70; background: #edf2ed; border-color: #e0e7df; }
  .garden-dot { color: #10a875; }
  .garden-dot.is-amber { color: #d9a138; }
  .garden-icon-button {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid #dce7dc;
    border-radius: 13px;
    color: #62776a;
    background: linear-gradient(#fff, #f0f5ee);
    box-shadow: 0 3px 0 #dce5d9;
    transition: transform .15s, box-shadow .15s;
    flex-shrink: 0;
  }
  .garden-icon-button:hover:not(:disabled) { color: #07835a; transform: translateY(-1px); }
  .garden-icon-button:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #dce5d9; }
  .garden-icon-button:disabled { opacity: .5; }

  .garden-hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 28px;
    margin: 24px 0;
    padding: 35px;
    border: 1px solid #cee4ce;
    border-radius: 28px;
    background:
      radial-gradient(ellipse at 85% 10%, #fff9deaa, transparent 60%),
      linear-gradient(115deg, #e3f5e6, #f1f8e7);
    box-shadow: inset 0 1px 0 #fff, 0 8px 25px #305c3710;
  }
  .garden-hero-copy { max-width: 650px; }
  .garden-hero h2 {
    margin: 12px 0 10px;
    color: #204c37;
    font-size: clamp(25px, 2.6vw, 37px);
    line-height: 1.2;
    letter-spacing: -1.1px;
  }
  .garden-hero h2 > span { color: #2bb87d; }
  .garden-hero-copy > p { color: #62806a; font-size: 13px; }
  .garden-hero-tags { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 19px; }
  .garden-hero-tags > span:last-child { font-size: 11px; color: #6f836d; }
  .garden-hero-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 13px; min-width: 310px; }
  .garden-hero-stats > div {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 18px 21px;
    background: #ffffffb8;
    border: 1px solid #ffffff;
    border-radius: 20px;
    box-shadow: 0 5px 15px #41664008;
  }
  .garden-hero-stats svg { color: #61a778; margin-bottom: 9px; width: 20px; height: 20px; }
  .garden-hero-stats span { color: #738677; font-size: 11px; }
  .garden-hero-stats strong { color: #278158; font-size: 28px; line-height: 1.5; }
  .garden-hero-stats small { font-size: 11px; font-weight: 500; }
  .garden-hero-stats p { color: #7b8b7d; font-size: 10px; }

  .garden-sensors { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin-bottom: 26px; }
  .garden-sensor { padding: 20px; min-width: 0; transition: transform .2s, box-shadow .2s; }
  .garden-sensor:hover { transform: translateY(-3px); box-shadow: 0 10px 25px #305c3714; }
  .garden-sensor.is-stale { opacity: .66; }
  .garden-sensor-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .garden-sensor-head > span { font-size: 12px; color: #697e73; font-weight: 650; }
  .garden-sensor-icon {
    display: grid; place-items: center; width: 37px; height: 37px;
    border-radius: 12px; color: var(--sensor-color); background: var(--sensor-tint);
  }
  .garden-sensor-value { margin: 17px 0; font-size: clamp(24px, 2.3vw, 35px); font-weight: 800; letter-spacing: -1px; color: var(--sensor-color); }
  .garden-sensor-value small { margin-left: 5px; color: #819187; font-size: 12px; font-weight: 550; letter-spacing: 0; }
  .garden-meter { height: 5px; border-radius: 10px; overflow: hidden; background: var(--sensor-tint); }
  .garden-meter span { display: block; height: 100%; border-radius: inherit; background: var(--sensor-color); transition: width .3s; }
  .garden-sensor > p { margin-top: 10px; font-size: 10px; color: #829087; }

  .garden-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 23px; align-items: start; }
  .garden-main { min-width: 0; }
  .garden-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 19px; padding-bottom: 15px; border-bottom: 1px solid #dfe8dc; }
  .garden-tabs button {
    display: flex; align-items: center; gap: 8px; padding: 10px 15px;
    border: 1px solid transparent; border-radius: 12px; color: #738579;
    background: transparent; font-size: 12px; font-weight: 700;
  }
  .garden-tabs button:hover { background: #e7efe4; color: #26734e; }
  .garden-tabs button.is-active {
    background: #fff; border-color: #d7e6d5; color: #168a5b;
    box-shadow: 0 3px 0 #dce7d7, 0 5px 12px #2a533e08;
  }
  .garden-ai-status {
    display: flex; align-items: center; gap: 12px; padding: 15px 17px;
    margin-bottom: 18px; border-radius: 17px; border: 1px solid #eeddb6;
    background: #fff9eb; color: #8b6929;
  }
  .garden-ai-status.is-ready { border-color: #c6e9d8; background: #ecfaf1; color: #227853; }
  .garden-ai-status-icon { flex-shrink: 0; }
  .garden-ai-status > div:nth-child(2) { flex: 1; min-width: 0; }
  .garden-ai-status strong { display: block; font-size: 12px; }
  .garden-ai-status p { font-size: 11px; margin-top: 3px; opacity: .9; line-height: 1.7; }
  .garden-ai-status .garden-icon-button { width: 33px; height: 33px; background: #ffffffb3; }

  .garden-chart-panel, .garden-content-panel { padding: 25px; }
  .garden-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; margin-bottom: 22px; }
  .garden-section-head h2 { margin: 6px 0; font-size: 22px; letter-spacing: -.6px; }
  .garden-section-head p { color: #7a8d80; font-size: 12px; }
  .garden-metric-switch { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 15px; }
  .garden-metric-switch button {
    background: #f5f8f3; border: 1px solid #e2eade; color: #788878;
    padding: 7px 11px; border-radius: 9px; font-size: 11px;
  }
  .garden-metric-switch button.is-active { background: #e4f4e7; border-color: #badbc4; color: #278657; font-weight: 750; }
  .garden-chart-help { color: #889589; font-size: 10px; line-height: 1.8; margin-bottom: 20px; }
  .garden-chart-help summary { cursor: pointer; margin-top: 4px; color: #588268; }
  .garden-chart { height: 340px; }
  .garden-chart-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid #edf1e9; padding-top: 15px; margin-top: 16px; font-size: 10px; color: #8a998b; }
  .garden-inline-actions { display: flex; gap: 15px; }
  .garden-text-button { background: none; border: 0; color: #218657; font-size: 11px; padding: 0; font-weight: 650; }
  .garden-text-button:disabled { opacity: .5; }
  .garden-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; color: #8ca18d; min-height: 240px; height: 100%; }
  .garden-empty h3 { color: #617d68; font-size: 17px; }
  .garden-empty p { font-size: 12px; }

  .garden-controls { padding: 25px; position: sticky; top: 20px; }
  .garden-controls > h2 { font-size: 24px; letter-spacing: -.7px; margin-top: 6px; }
  .garden-control-subtitle { color: #829083; font-size: 11px; margin-top: 5px !important; }
  .garden-pump { display: flex; align-items: center; gap: 12px; padding: 15px 0 18px; margin-top: 13px; }
  .garden-pump-symbol { display: grid; place-items: center; width: 52px; height: 52px; background: #edf4eb; border-radius: 17px; color: #8ba18b; }
  .garden-pump.is-running .garden-pump-symbol { background: #ddf5e7; color: #0da66a; animation: garden-pulse 1.8s ease-in-out infinite; }
  .garden-pump > div:nth-child(2) { flex: 1; }
  .garden-pump div > span { display: block; color: #8d9b8c; font-size: 9px; letter-spacing: 1px; }
  .garden-pump strong { display: block; font-size: 15px; margin-top: 4px; }
  .garden-pump > .garden-pill { font-size: 9px; padding: 4px 8px; }
  .garden-detail { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; padding: 12px 0; border-bottom: 1px solid #edf2e9; font-size: 11px; }
  .garden-detail > span { color: #859383; }
  .garden-detail strong { color: #496651; text-align: right; font-weight: 650; overflow-wrap: anywhere; }
  .garden-mode-label { margin-top: 23px; margin-bottom: 12px; color: #8a9b8b; font-size: 9px; font-weight: 800; letter-spacing: 1.4px; }
  .garden-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 26px; }

  .garden-mode-button {
    position: relative;
    min-height: 113px;
    text-align: left;
    border: 1px solid #d4dfd1;
    border-radius: 17px;
    padding: 14px;
    color: #627963;
    background: linear-gradient(155deg, #ffffff, #eaf1e5);
    box-shadow: inset 0 2px 0 #ffffff, 0 5px 0 #c7d4c2, 0 9px 14px #3a61301a;
    transition: transform .16s, box-shadow .16s, background .16s;
  }
  .garden-mode-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .garden-mode-button strong { display: block; font-size: 15px; line-height: 1.5; }
  .garden-mode-button small { display: block; font-size: 9px; letter-spacing: .6px; opacity: .78; margin-top: 2px; }
  .garden-mode-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: inset 0 2px 0 #fff, 0 7px 0 #c7d4c2, 0 13px 18px #3a613024; }
  .garden-mode-button:active:not(:disabled) { transform: translateY(4px); box-shadow: inset 0 1px 0 #fff, 0 1px 0 #c7d4c2; }
  .garden-mode-button:disabled:not(.is-selected) { opacity: .5; box-shadow: 0 3px 0 #d9e2d5; }
  .garden-mode-button.is-selected { cursor: default; transform: translateY(2px); }
  .garden-mode-button.automatic.is-selected {
    color: white; border-color: #21966a;
    background: linear-gradient(145deg, #64d795, #18a873);
    box-shadow: inset 0 2px 0 #ffffff70, 0 4px 0 #11764f, 0 9px 18px #18a87333;
  }
  .garden-mode-button.manual.is-selected {
    color: #fff; border-color: #467cd9;
    background: linear-gradient(145deg, #8bb8ff, #4a83e6);
    box-shadow: inset 0 2px 0 #ffffff70, 0 4px 0 #315ea9, 0 9px 18px #4a83e633;
  }

  .garden-key { display: block; min-width: 0; }
  .garden-key > span { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; font-size: 11px; color: #728770; }
  .garden-key input {
    width: 100%; min-width: 0; border: 1px solid #dce6d6; border-radius: 12px;
    background: #f6f9f3; color: #32523a; padding: 12px 13px; font-size: 13px;
    box-shadow: inset 0 2px 4px #314b2b05;
  }
  .garden-key input::placeholder { color: #9eac9a; }
  .garden-key-note { color: #96a28f; font-size: 10px; margin-top: 8px !important; line-height: 1.7; }

  .garden-water-button {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 16px; margin-top: 23px;
    border: 1px solid #169b6a; border-radius: 16px;
    color: #fff; font-weight: 800; font-size: 16px;
    background: linear-gradient(165deg, #5bd391, #12a470);
    box-shadow: inset 0 2px 0 #ffffff70, 0 6px 0 #11744e, 0 12px 22px #199d6a25;
    transition: transform .16s, box-shadow .16s;
  }
  .garden-water-button small { margin-left: auto; padding-left: 12px; border-left: 1px solid #ffffff50; font-size: 11px; font-weight: 600; }
  .garden-water-button > span { flex: 1; text-align: left; }
  .garden-water-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: inset 0 2px 0 #ffffff70, 0 8px 0 #11744e, 0 15px 25px #199d6a30; }
  .garden-water-button:active:not(:disabled) { transform: translateY(5px); box-shadow: inset 0 1px 0 #ffffff50, 0 1px 0 #11744e; }
  .garden-water-button:disabled {
    color: #8da495; border-color: #d5e4d6; background: linear-gradient(#edf5eb, #dfeadd);
    box-shadow: inset 0 2px 0 #ffffff, 0 4px 0 #cbd8c8;
  }
  .garden-control-reason { color: #81917e; font-size: 10px; line-height: 1.8; margin-top: 15px !important; }
  .garden-command-notice { padding: 12px; margin-top: 17px; background: #f7f9f3; border: 1px dashed #dce6d5; border-radius: 12px; color: #7b8c73; font-size: 10px; overflow-wrap: anywhere; }
  .garden-command-link { display: inline-block; margin-top: 12px; color: #289064; font-size: 11px; text-decoration: none; }
  .garden-command-link:hover { text-decoration: underline; }

  .garden-predictions { display: grid; grid-template-columns: 1fr 1fr; gap: 17px; margin: 22px 0; }
  .garden-prediction { padding: 23px; border-radius: 19px; border: 1px solid #d5ebdd; background: linear-gradient(145deg, #f3fcf6, #e9f6ee); color: #249665; }
  .garden-prediction.light { border-color: #f0e3c4; background: linear-gradient(145deg, #fffbef, #fff5dc); color: #c38d22; }
  .garden-prediction > span { display: block; margin-top: 17px; font-size: 12px; }
  .garden-prediction strong { display: block; font-size: 35px; margin: 13px 0; }
  .garden-prediction small { font-size: 14px; font-weight: 500; }
  .garden-prediction p { font-size: 10px; opacity: .85; }
  .garden-ai-explanation { display: flex; gap: 10px; padding: 15px; border-radius: 12px; background: #f6f8f2; color: #83917b; font-size: 11px; margin-top: 20px; line-height: 1.8; }

  .garden-event { display: flex; align-items: flex-start; gap: 13px; padding: 17px 0; border-bottom: 1px solid #edf2e9; }
  .garden-event:last-child { border-bottom: 0; }
  .garden-event-dot { width: 8px; height: 8px; border-radius: 50%; background: #78a3b4; margin-top: 6px; flex-shrink: 0; }
  .garden-event-dot.success { background: #23ad77; }
  .garden-event-dot.error { background: #e27863; }
  .garden-event > div { flex: 1; min-width: 0; }
  .garden-event small { font-size: 9px; color: #8ea08b; font-weight: 750; letter-spacing: .7px; }
  .garden-event p { font-size: 12px; color: #5b755f; margin-top: 4px; overflow-wrap: anywhere; }
  .garden-event time { color: #9baa95; font-size: 10px; white-space: nowrap; padding-top: 3px; }

  .garden-settings { display: flex; align-items: center; gap: 22px; padding: 22px; margin-top: 18px; }
  .garden-settings > div { flex: 1; min-width: 0; }
  .garden-settings h2 { font-size: 18px; }
  .garden-settings p { font-size: 11px; color: #81917c; margin-top: 5px; }
  .garden-api-address { overflow-wrap: anywhere; }
  .garden-settings .garden-key { width: 250px; }
  .garden-soft-button { padding: 10px 18px; background: #edf5e8; border: 1px solid #d1e2c9; border-radius: 11px; color: #568052; font-weight: 650; }
  .garden-alert { display: flex; align-items: center; gap: 12px; padding: 16px 19px; margin-bottom: 18px; border-radius: 15px; background: #fff0ec; border: 1px solid #f3d5ca; color: #ad5a45; font-size: 12px; }
  .garden-error { color: #bc5a45; font-size: 12px; margin-top: 12px !important; }
  .garden-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 28px; padding: 18px 0 3px; color: #8b9c86; font-size: 10px; border-top: 1px solid #dfe7d9; }
  .garden-footer > span:first-child { display: flex; align-items: center; gap: 7px; letter-spacing: .8px; font-weight: 700; }

  @keyframes garden-pulse {
    0%, 100% { box-shadow: 0 0 0 0 #2ab57e20; }
    50% { box-shadow: 0 0 0 8px #2ab57e05; }
  }

  @media (max-width: 1180px) {
    .garden-app { padding: 22px; }
    .garden-workspace { grid-template-columns: minmax(0, 1fr) 310px; gap: 18px; }
    .garden-hero { padding: 27px; }
    .garden-hero-stats { min-width: 270px; gap: 10px; }
    .garden-hero-stats > div { padding: 15px; }
    .garden-sensors { gap: 12px; }
    .garden-sensor { padding: 16px; }
    .garden-sensor-icon { width: 31px; height: 31px; }
    .garden-controls { padding: 21px; }
    .garden-tabs button { padding: 9px 10px; font-size: 11px; }
  }

  @media (max-width: 940px) {
    .garden-hero { align-items: stretch; flex-direction: column; }
    .garden-hero-stats { min-width: 0; }
    .garden-hero-stats > div { padding: 17px 22px; }
    .garden-sensors { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .garden-workspace { grid-template-columns: 1fr; }
    .garden-controls { position: static; }
    .garden-mode-button { min-height: 108px; }
    .garden-sensor-value { font-size: 32px; }
    .garden-settings { flex-wrap: wrap; }
  }

  @media (max-width: 580px) {
    .garden-app { padding: 14px 12px; }
    .garden-header { padding: 15px; gap: 14px; flex-wrap: wrap; border-radius: 20px; }
    .garden-brand { gap: 11px; }
    .garden-logo { width: 42px; height: 42px; border-radius: 13px; }
    .garden-logo svg { width: 25px; height: 25px; }
    .garden-brand h1 { font-size: 22px; }
    .garden-overline { font-size: 8px; letter-spacing: 1.2px; }
    .garden-header-actions { width: 100%; justify-content: flex-end; gap: 10px; border-top: 1px solid #edf2e8; padding-top: 12px; }
    .garden-device { margin-right: auto; padding-right: 10px; font-size: 11px; }
    .garden-icon-button { width: 35px; height: 35px; }
    .garden-hero { padding: 24px 19px; margin: 17px 0; border-radius: 22px; gap: 20px; }
    .garden-hero h2 { font-size: 28px; }
    .garden-hero-copy > p { font-size: 12px; }
    .garden-hero-stats strong { font-size: 25px; }
    .garden-hero-stats > div { padding: 15px; border-radius: 15px; }
    .garden-sensors { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; margin-bottom: 20px; }
    .garden-sensor { padding: 16px; border-radius: 18px; }
    .garden-sensor:last-child { grid-column: 1 / -1; }
    .garden-sensor-value { font-size: 30px; margin: 12px 0; }
    .garden-sensor:last-child .garden-sensor-value { margin: 5px 0 12px; }
    .garden-sensor-head > span { font-size: 11px; }
    .garden-tabs { gap: 5px; }
    .garden-tabs button { padding: 9px 8px; gap: 5px; font-size: 10px; }
    .garden-tabs svg { width: 15px; height: 15px; }
    .garden-ai-status { padding: 13px; gap: 9px; }
    .garden-ai-status strong { font-size: 11px; }
    .garden-ai-status p { font-size: 10px; }
    .garden-chart-panel, .garden-content-panel { padding: 19px 15px; border-radius: 20px; }
    .garden-section-head h2 { font-size: 20px; }
    .garden-chart { height: 300px; }
    .garden-chart-footer { flex-wrap: wrap; }
    .garden-metric-switch { gap: 5px; }
    .garden-metric-switch button { padding: 6px 8px; font-size: 10px; }
    .garden-predictions { gap: 10px; }
    .garden-prediction { padding: 16px 12px; }
    .garden-prediction strong { font-size: 27px; }
    .garden-prediction > span { font-size: 11px; }
    .garden-detail { font-size: 10px; }
    .garden-event { gap: 9px; }
    .garden-event p { font-size: 11px; }
    .garden-event time { font-size: 9px; }
    .garden-settings { padding: 18px; }
    .garden-settings > div, .garden-settings .garden-key { width: 100%; flex-basis: 100%; }
    .garden-footer { align-items: flex-start; flex-direction: column; font-size: 9px; }
  }

  @media (max-width: 360px) {
    .garden-predictions { grid-template-columns: 1fr; }
    .garden-sensor-value { font-size: 25px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .garden-app *, .garden-app *::before, .garden-app *::after {
      animation: none !important;
      transition: none !important;
    }
  }
`;