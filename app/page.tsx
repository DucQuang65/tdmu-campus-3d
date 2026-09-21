'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Expand,
  GraduationCap,
  Info,
  Ellipsis,
  CircleHelp,
  Layers3,
  LoaderCircle,
  MapPin,
  Minus,
  Moon,
  Navigation,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sun,
  Sunrise,
  Sunset,
  Trees,
  Waves,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type {
  Building,
  Landmark,
  Overview,
  SceneController,
  Quality,
  Preset,
  LayerKey,
  Metrics,
  LandmarkView,
  Category,
} from '@/lib/campus/types';
import { DEFAULT_LAYERS, CATEGORY_NAMES } from '@/lib/campus/types';
import { nextTourIndex } from '@/lib/campus/math';
import { searchLandmarks } from '@/lib/campus/navigation';
import {
  decodeShare,
  encodeShare,
  cameraBearing,
  type CameraSnapshot,
} from '@/lib/campus/share';
import sourceData from '@/public/data/sources.json';
import { fetchJson } from '@/lib/campus/streaming';
import { sourceIndex, sourceDates } from '@/lib/campus/sources';
import { CampusMinimap } from '@/components/campus-minimap';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const LAYER_ITEMS: [LayerKey, string, string, typeof Building2][] = [
  ['buildings', 'Khối công trình', 'Giảng đường, khu chức năng và địa danh', Building2],
  ['vegetation', 'Cây xanh cảnh quan', 'Cây bóng mát, thảm cỏ và hoa viên', Trees],
  ['roads', 'Mạng lưới giao thông', 'Trần Văn Ơn, đường nội bộ và lối đi bộ', Navigation],
  ['water', 'Mặt nước cảnh quan', 'Khu vực hồ nước và tiểu cảnh', Waves],
  ['sports', 'Khu thể thao', 'Sân bóng đá, sân bóng rổ và thể chất', GraduationCap],
  ['boundary', 'Ranh giới trường', 'Đường viền thể hiện phạm vi khuôn viên TDMU', MapPin],
  ['context', 'Công trình ngoại vi', 'Khu dân cư và tuyến phố giáp ranh', Layers3],
  ['labels', 'Tên địa điểm', 'Nhãn hiển thị các công trình tiêu biểu', MapPin],
];
const PRESETS: [Preset, string, typeof Sun][] = [
  ['morning', 'Bình minh', Sunrise],
  ['day', 'Ban ngày', Sun],
  ['evening', 'Hoàng hôn', Sunset],
  ['night', 'Ban đêm', Moon],
];
const refs = sourceIndex(sourceData.sources);
export default function Home() {
  const dock = useRef<HTMLElement>(null);
  const detailBack = useRef<HTMLButtonElement>(null);
  const menuScroll = useRef(0);
  const returnPlace = useRef<string | null>(null);
  const pendingFocus = useRef<'detail' | 'menu' | 'views' | null>(null);
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<SceneController | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]),
    [landmarks, setLandmarks] = useState<Landmark[]>([]),
    [overview, setOverview] = useState<Overview | null>(null);
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState('Đang nạp khuôn viên…'),
    [loadProgress, setLoadProgress] = useState<number | undefined>(undefined),
    [error, setError] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [tab, setTab] = useState('explore');
  const [layers, setLayers] = useState(DEFAULT_LAYERS),
    [preset, setPreset] = useState<Preset>('day'),
    [quality, setQuality] = useState<Quality>('auto'),
    [tour, setTour] = useState(false),
    [tourStarted, setTourStarted] = useState(false),
    [tourIndex, setTourIndex] = useState(0),
    [collapsed, setCollapsed] = useState(false),
    [about, setAbout] = useState(false),
    [more, setMore] = useState(false),
    [toast, setToast] = useState(''),
    [retrySeed, setRetrySeed] = useState(0),
    [metrics, setMetrics] = useState<Metrics | null>(null);
  const settings = useRef({
    layers: DEFAULT_LAYERS,
    preset: 'day' as Preset,
    quality: 'auto' as Quality,
  });
  const presetEdited = useRef(false);
  const [overviewRetry, setOverviewRetry] = useState(0);
  const [overviewError, setOverviewError] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [debug, setDebug] = useState(false);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [cameraState, setCameraState] = useState<CameraSnapshot | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [panelMode, setPanelMode] = useState<'menu' | 'detail'>('menu');
  const [landmarkView, setLandmarkView] = useState<LandmarkView | null>(
    'oblique',
  );
  const [orbit, setOrbit] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const lifetime = new AbortController();
    void fetchJson<Overview>(`${BASE}/data/overview.json`, lifetime.signal)
      .then((data) => {
        if (!lifetime.signal.aborted) {
          setOverview(data);
          setOverviewError(false);
        }
      })
      .catch(() => {
        if (!lifetime.signal.aborted) setOverviewError(true);
      });
    return () => lifetime.abort();
  }, [overviewRetry]);
  useEffect(() => {
    let active = true;
    const lifetime = new AbortController();
    queueMicrotask(() => {
      if (active) setDebug(new URLSearchParams(location.search).has('debug'));
    });
    let cleanup: (() => void) | undefined;
    void Promise.all([
      fetchJson<Building[]>(`${BASE}/data/buildings.json`, lifetime.signal),
      fetchJson<Landmark[]>(`${BASE}/data/landmarks.json`, lifetime.signal),
      import('@/lib/campus/scene'),
    ])
      .then(([bs, ls, { createScene }]) => {
        if (!active || !host.current) return;
        setBuildings(bs);
        setLandmarks(ls);
        try {
          if (
            process.env.NODE_ENV === 'development' &&
            new URLSearchParams(location.search).has('test-webgl-unavailable')
          )
            throw new Error('WebGL test');
          const c = createScene(host.current, bs, ls, {
            onStatus: (message, failed = false, progress) => {
              if (active) {
                setStatus(message);
                setLoadProgress(progress);
                setError(failed);
              }
            },
            onReady: () => {
              if (active) setReady(true);
            },
            onSelect: (id, origin = 'manual') => {
              if (active) {
                setSelected(id);
                setLandmarkView('oblique');
                if (id) setTourIndex(ls.findIndex((place) => place.id === id));
                if (origin !== 'tour') {
                  setMore(false);
                  setPanelMode(id ? 'detail' : 'menu');
                  setCollapsed(false);
                  setPanelExpanded(false);
                  dock.current
                    ?.querySelector<HTMLInputElement>('input[type="search"]')
                    ?.blur();
                  if (origin === 'manual') {
                    setTour(false);
                    pendingFocus.current = id ? 'detail' : 'menu';
                  }
                }
              }
            },
            onInteract: () => {
              if (active) {
                setTour(false);
                setLandmarkView(null);
              }
            },
            onCamera: (snapshot) => {
              if (active) setCameraState(snapshot);
            },
            onOrbit: (on) => {
              if (active) {
                setOrbit(on);
                if (on) setLandmarkView('oblique');
              }
            },
            onMetrics: (m) => {
              if (active) setMetrics(m);
            },
          });
          controller.current = c;
          cleanup = () => c.dispose();
          c.setQuality(settings.current.quality);
          c.setPreset(settings.current.preset);
          for (const key of Object.keys(settings.current.layers) as LayerKey[])
            c.setLayer(key, settings.current.layers[key]);
          const shared = decodeShare(
            location.hash,
            ls.map((l) => l.id),
          );
          if (shared) {
            if (presetEdited.current) shared.preset = settings.current.preset;
            c.restoreSnapshot(shared);
            if (shared.preset) {
              settings.current.preset = shared.preset;
              setPreset(shared.preset);
            }
            setLandmarkView(
              shared.view ?? (shared.position ? null : 'oblique'),
            );
          }
          cleanup = () => c.dispose();
        } catch {
          setStatus(
            'Trình duyệt chưa hỗ trợ WebGL 2. Vui lòng bật tăng tốc phần cứng hoặc dùng Chrome/Edge.',
          );
          setError(true);
        }
      })
      .catch(() => {
        if (active) {
          setStatus('Không thể nạp dữ liệu khuôn viên. Vui lòng thử lại.');
          setError(true);
        }
      });
    return () => {
      active = false;
      lifetime.abort();
      cleanup?.();
      controller.current = null;
    };
  }, [retrySeed]);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const root = host.current?.parentElement;
      const height = viewport?.height ?? window.innerHeight;
      root?.style.setProperty('--app-height', `${height}px`);
      root?.style.setProperty(
        '--viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      );
      setKeyboardOpen(
        window.innerWidth < 760 && height < window.innerHeight * 0.75,
      );
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    if (!ready || !host.current || !dock.current) return;
    const root = host.current.parentElement!;
    const header = root.querySelector<HTMLElement>('.masthead')!;
    const tools = root.querySelector<HTMLElement>('.map-tools')!;
    let pending = 0;
    let previous = '';
    const measure = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const panel = dock.current!.getBoundingClientRect();
        const menu = tools.getBoundingClientRect();
        const top = header.getBoundingClientRect().bottom + 18;
        const mobile = window.innerWidth < 760;
        const left = mobile || collapsed ? 18 : panel.right + 24;
        const right = menu.left - 18;
        const bottom = mobile ? panel.top - 34 : window.innerHeight - 42;
        const frame = {
          left,
          top,
          width: Math.max(120, right - left),
          height: Math.max(100, bottom - top),
        };
        root.style.setProperty('--dock-height', `${panel.height}px`);
        root.style.setProperty('--scene-left', `${left}px`);
        const key = JSON.stringify(frame);
        if (key !== previous) {
          previous = key;
          controller.current?.setViewport(frame);
        }
      });
    };
    const observer = new ResizeObserver(measure);
    [dock.current, header, tools, host.current].forEach((el) =>
      observer.observe(el),
    );
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [ready, collapsed]);
  useEffect(() => {
    if (!pendingFocus.current || collapsed) return;
    const destination = pendingFocus.current;
    pendingFocus.current = null;
    const body = dock.current?.querySelector<HTMLElement>('.dock-body');
    if (destination === 'detail') {
      if (body) body.scrollTop = 0;
      detailBack.current?.focus({ preventScroll: true });
    } else if (destination === 'views') {
      dock.current
        ?.querySelector<HTMLButtonElement>('.landmark-views button')
        ?.focus();
    } else {
      const row = Array.from(
        dock.current?.querySelectorAll<HTMLButtonElement>('[data-place-id]') ??
          [],
      ).find((item) => item.dataset.placeId === returnPlace.current);
      (
        row ??
        dock.current?.querySelector<HTMLInputElement>('input[type="search"]')
      )?.focus({ preventScroll: true });
      if (body) body.scrollTop = menuScroll.current;
    }
  }, [selected, panelMode, collapsed, panelExpanded]);
  function returnToMenu() {
    returnPlace.current = selected;
    pendingFocus.current = 'menu';
    setPanelMode('menu');
    setPanelExpanded(true);
    setCollapsed(false);
  }
  function changeLandmarkView(value: LandmarkView) {
    setTour(false);
    setLandmarkView(value);
    controller.current?.landmarkView(value);
  }
  const choose = useCallback((id: string) => {
    setTour(false);
    controller.current?.focus(id);
  }, []);
  useEffect(() => {
    if (!tour || !landmarks.length) return;
    controller.current?.focus(landmarks[tourIndex].id, 'tour');
    const timer = setTimeout(
      () => setTourIndex((i) => nextTourIndex(i, landmarks.length)),
      8500,
    );
    return () => clearTimeout(timer);
  }, [tour, tourIndex, landmarks]);
  const currentLandmark = landmarks.find((l) => l.id === selected);
  const currentBuilding = selected
    ? buildings.find((b) => b.id === selected || b.landmark === selected)
    : undefined;
  const current = currentLandmark ?? currentBuilding;
  const places = useMemo(
    () => searchLandmarks(landmarks, query, category),
    [landmarks, query, category],
  );
  function toggleLayer(k: LayerKey, on: boolean) {
    settings.current.layers = { ...settings.current.layers, [k]: on };
    setLayers(settings.current.layers);
    controller.current?.setLayer(k, on);
  }
  function changePreset(p: Preset) {
    presetEdited.current = true;
    settings.current.preset = p;
    setPreset(p);
    controller.current?.setPreset(p);
  }
  function changeQuality(q: Quality) {
    settings.current.quality = q;
    setQuality(q);
    controller.current?.setQuality(q);
  }
  function view(
    v: 'overview' | 'top' | 'tilt' | 'north' | 'zoomIn' | 'zoomOut',
  ) {
    setTour(false);
    setLandmarkView(null);
    controller.current?.view(v);
    if (v === 'overview') {
      setSelected(null);
      setCollapsed(false);
    }
  }
  async function shareView() {
    const snapshot = controller.current?.getSnapshot();
    if (!snapshot) return;
    const url = new URL(location.pathname, location.origin);
    url.hash = encodeShare(snapshot);
    try {
      await navigator.clipboard.writeText(url.href);
      notify('Đã sao chép liên kết góc nhìn vào bộ nhớ tạm');
    } catch {
      setShareLink(url.href);
    }
  }
  function retry() {
    if (controller.current) controller.current.retry();
    else {
      setError(false);
      setStatus('Đang tải lại…');
      setRetrySeed((s) => s + 1);
    }
  }
  function jump(delta: number) {
    setTourStarted(true);
    setTourIndex((i) => (i + delta + landmarks.length) % landmarks.length);
    if (!tour && landmarks.length)
      controller.current?.focus(
        landmarks[(tourIndex + delta + landmarks.length) % landmarks.length].id,
        'tour',
      );
  }
  function toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      notify('Trình duyệt không hỗ trợ toàn màn hình.');
      return;
    }
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void action.catch(() => notify('Trình duyệt không hỗ trợ toàn màn hình.'));
  }
  async function exportView() {
    try {
      await controller.current?.exportImage();
      notify('Đã xuất ảnh chụp khuôn viên 3D thành công');
    } catch {
      notify('Xuất ảnh chưa thành công, vui lòng thử lại.');
    }
  }
  return (
    <main className={`campus-app ${keyboardOpen ? 'keyboard-open' : ''}`}>
      <div className="scene-host" ref={host} />
      <header className="masthead">
        <button
          className="brand-mark"
          onClick={() => view('overview')}
          title="Về toàn cảnh"
        >
            TDMU
        </button>
        <div>
          <h1>
            TDMU <span>Campus 3D</span>
          </h1>
          <p>THU DAU MOT UNIVERSITY · CAMPUS EXPLORER</p>
        </div>
        <div className="header-location">
          <span className="live-dot" />
          Bình Dương · 06 Trần Văn Ơn, P. Phú Hòa
        </div>
        <button
          className="icon-button about-button"
          onClick={() => setAbout(true)}
          title="Thông tin dự án"
        >
          <Info size={19} />
        </button>
        <a
          className="repo-link"
          href="https://tdmu.edu.vn"
          target="_blank"
          rel="noreferrer"
        >
          Trang chủ TDMU <ArrowUpRight size={15} />
        </a>
      </header>
      <aside
        ref={dock}
        className={`panel-dock ${collapsed ? 'collapsed' : ''} ${panelExpanded ? 'expanded' : ''} ${panelMode === 'detail' ? 'detail-mode' : ''}`}
        aria-label="Menu khám phá khuôn viên"
      >
        <div className="dock-heading">
          {panelMode === 'detail' && current && (
            <button
              ref={detailBack}
              className="dock-back"
              title="Quay lại danh sách địa điểm"
              onClick={returnToMenu}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <button
            className="dock-toggle"
            aria-expanded={!collapsed}
            aria-controls="campus-panel-body"
            onClick={() => setCollapsed((v) => !v)}
          >
            <span>
              {panelMode === 'detail' && current ? current.name : 'Khám phá TDMU'}
            </span>
            <small>{collapsed ? 'Mở rộng' : 'Thu gọn'}</small>
            <ChevronDown size={16} />
          </button>
          {!collapsed && (
            <button
              className="dock-expand"
              aria-expanded={panelExpanded}
              onClick={() => setPanelExpanded((value) => !value)}
            >
              {panelExpanded
                ? 'Tóm tắt'
                : panelMode === 'detail'
                  ? 'Chi tiết'
                  : 'Mở rộng bảng'}
            </button>
          )}
        </div>
        <div
          id="campus-panel-body"
          className="dock-body"
          hidden={collapsed}
          onScroll={(event) => {
            if (panelMode === 'menu')
              menuScroll.current = event.currentTarget.scrollTop;
          }}
        >
          {panelMode === 'detail' && current && !collapsed && (
            <div className="mobile-place-summary">
              <p>{currentLandmark?.description ?? current.name}</p>
              <div className="summary-actions">
                <button
                  aria-pressed={landmarkView === 'oblique'}
                  onClick={() => changeLandmarkView('oblique')}
                >
                  Toàn cảnh
                </button>
                <button
                  aria-pressed={landmarkView === 'entrance'}
                  onClick={() => changeLandmarkView('entrance')}
                >
                  {currentLandmark?.placeKind === 'bridge'
                    ? 'Dưới cầu'
                    : currentLandmark?.placeKind === 'sculpture'
                      ? 'Tượng đài'
                      : 'Lối vào'}
                </button>
                <button
                  onClick={() => {
                    pendingFocus.current = 'views';
                    setPanelExpanded(true);
                  }}
                >
                  Góc nhìn khác
                </button>
              </div>
            </div>
          )}
          {panelMode === 'detail' && current ? (
            <section
              className={`place-detail ${more ? 'expanded' : ''}`}
              aria-label="Chi tiết công trình"
            >
              <div className="detail-heading">
                <div>
                  <div className="eyebrow">
                    {currentLandmark?.placeKind === 'sports'
                      ? 'CAMPUS ATHLETICS'
                      : currentLandmark
                        ? 'CAMPUS LANDMARK'
                        : 'CAMPUS BUILDING'}
                  </div>
                  <h2>{current.name}</h2>
                </div>
                <button
                  className="icon-button"
                  title="Đóng chi tiết công trình"
                  onClick={() => {
                    returnToMenu();
                    setSelected(null);
                    setMore(false);
                    controller.current?.clearSelection();
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <p>
                {currentLandmark?.description ??
                  `${CATEGORY_NAMES[currentBuilding!.category]}, vị trí chuẩn xác theo bản đồ GIS.`}
              </p>
              {currentLandmark && (
                <fieldset className="landmark-views" aria-label="Góc nhìn công trình">
                  {(
                    [
                      ['oblique', 'Toàn cảnh'],
                      [
                        'front',
                        ['tdmu-1170503929', 'tdmu-1292553894'].includes(currentLandmark.id)
                          ? 'Mặt trước'
                          : 'Hướng chính',
                      ],
                      [
                        'back',
                        ['tdmu-1170503929', 'tdmu-1292553894'].includes(currentLandmark.id)
                          ? 'Mặt sau'
                          : 'Hướng sau',
                      ],
                      ['top', 'Từ trên cao'],
                      [
                        'entrance',
                        currentLandmark?.placeKind === 'gate'
                          ? 'Cổng vào'
                          : 'Lối vào chính',
                      ],
                    ] as [LandmarkView, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={!orbit && landmarkView === value}
                      onClick={() => changeLandmarkView(value)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    aria-pressed={orbit}
                    disabled={reducedMotion}
                    title={
                      reducedMotion
                        ? 'Hệ thống đã bật chế độ giảm hiệu ứng chuyển động'
                        : 'Xoay quanh địa danh, kéo chuột để dừng'
                    }
                    onClick={() => {
                      setTour(false);
                      controller.current?.setOrbit(!orbit);
                    }}
                  >
                    {orbit ? <Pause size={14} /> : <RotateCcw size={14} />}{' '}
                    {orbit ? 'Dừng xoay' : 'Xoay quanh'}
                  </button>
                </fieldset>
              )}
              <div className="detail-actions">
                <button onClick={() => setMore((v) => !v)} aria-expanded={more}>
                  Cơ sở dữ liệu <ChevronDown size={14} />
                </button>
                <button onClick={() => void shareView()}>
                  <Share2 size={14} />
                  Chia sẻ góc nhìn
                </button>
              </div>
              {more && (
                <div className="detail-evidence">
                  <p>
                    {currentLandmark?.detail ??
                      currentBuilding?.facadeBasis ??
                      'Hình khối công trình xây dựng dựa trên bản đồ GIS và kích thước thực địa.'}
                  </p>
                  {currentBuilding?.constructionStatus && (
                    <p>{currentBuilding.constructionStatus}</p>
                  )}
                  <dl>
                    <div>
                      <dt>Chiều cao công trình</dt>
                      <dd>
                        {currentLandmark?.placeKind === 'bridge'
                          ? 'Ước tính theo thực tế hiện trạng'
                          : currentLandmark?.placeKind === 'sports'
                            ? 'Mô hình cao độ số địa hình TDMU'
                            : currentLandmark?.id === 'new-east-gate'
                              ? 'Ước tính theo kích thước chuẩn'
                              : (currentBuilding?.heightBasis ??
                                'Mô phỏng theo thực địa')}
                      </dd>
                    </div>
                    <div>
                      <dt>Cập nhật GIS</dt>
                      <dd>
                        {current.osmEditedAt?.slice(0, 10) ?? 'Xem nguồn GIS'}
                      </dd>
                    </div>
                  </dl>
                  <a href={current.sourceUrl} target="_blank" rel="noreferrer">
                    Xem nguồn dữ liệu GIS <ArrowUpRight size={13} />
                  </a>
                  {currentLandmark &&
                    [
                      ...new Set([
                        currentLandmark.reference,
                        ...(currentLandmark.additionalReferences ?? []),
                      ]),
                    ].map((id) => {
                      const source = refs[id];
                      return source ? (
                        <div key={id}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.name} <ArrowUpRight size={13} />
                          </a>
                          <small>{sourceDates(source)}</small>
                          {source.note && <small>{source.note}</small>}
                        </div>
                      ) : (
                        <p key={id}>Thông tin chi tiết đang được cập nhật.</p>
                      );
                    })}
                </div>
              )}
            </section>
          ) : (
            <div className="explorer">
              <div className="panel-heading">
                <div className="eyebrow">KHÁM PHÁ · THỦ DẦU MỘT UNIVERSITY</div>
                <h2>Trường Đại học Thủ Dầu Một</h2>
                <p className="intro">Không gian 3D tương tác trực quan, khám phá từng dãy giảng đường và khuôn viên.</p>
              </div>
              <Tabs
                value={tab}
                onValueChange={(v) => setTab(String(v))}
                className="main-tabs"
              >
                <TabsList className="panel-tabs">
                  <TabsTrigger value="explore">
                    <Compass size={17} />
                    Khám phá
                  </TabsTrigger>
                  <TabsTrigger value="layers">
                    <Layers3 size={17} />
                    Lớp bản đồ
                  </TabsTrigger>
                  <TabsTrigger value="environment">
                    <Sun size={17} />
                    Môi trường
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="explore" className="explore-content">
                  <div className="search-wrap">
                    <Search size={16} />
                    <Input
                      type="search"
                      onFocus={() => setPanelExpanded(true)}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Tìm kiếm giảng đường (vd: B1, A1, Hội trường...)"
                      aria-label="Tìm kiếm địa điểm"
                    />
                    {query && (
                      <button title="Xóa tìm kiếm" onClick={() => setQuery('')}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <fieldset
                    className="category-filters"
                    aria-label="Phân loại địa điểm"
                  >
                    {(
                      [
                        ['all', 'Tất cả'],
                        ['academic', 'Giảng đường'],
                        ['living', 'Sinh hoạt'],
                        ['culture', 'Văn thể'],
                        ['landmark', 'Cổng trường'],
                        ['infrastructure', 'Đường sá'],
                      ] as [Category | 'all', string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        className={category === value ? 'active' : ''}
                        aria-pressed={category === value}
                        onClick={() => setCategory(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </fieldset>
                  <div className="result-heading">
                    <span>{query ? 'Kết quả tìm kiếm' : 'Địa điểm nổi bật'}</span>
                    <span>{places.length} địa điểm</span>
                  </div>
                  <div className="places">
                    {!landmarks.length && !error ? (
                      <output className="empty-state">Đang tải danh sách địa điểm…</output>
                    ) : places.length ? (
                      places.map((p) => (
                        <button
                          key={p.id}
                          data-place-id={p.id}
                          className={`place-row ${selected === p.id ? 'selected' : ''}`}
                          onClick={() => choose(p.id)}
                          disabled={!ready}
                        >
                          <span className="place-index">
                            {String(
                              landmarks.findIndex((l) => l.id === p.id) + 1,
                            ).padStart(2, '0')}
                          </span>
                          <span className="place-copy">
                            <strong>{p.name}</strong>
                            <small>
                              {CATEGORY_NAMES[p.category]}
                              {p.id === 'new-east-gate'
                                ? ' · Mô hình 3D'
                                : ' · Công trình chính'}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))
                    ) : (
                      <div className="empty-state">
                        Không tìm thấy địa điểm phù hợp.
                        <br />
                        Thử tìm &quot;B1&quot;, &quot;A1&quot;, &quot;Hội trường&quot;, hoặc chọn mục &quot;Tất cả&quot;.
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="layers" className="settings-content">
                  <p className="section-hint">Bật/tắt các lớp dữ liệu không gian khuôn viên.</p>
                  {LAYER_ITEMS.map(([key, label, desc, Icon]) => (
                    <label
                      className="layer-row"
                      key={key}
                      htmlFor={`layer-${key}`}
                    >
                      <Icon size={19} />
                      <span>
                        <strong>{label}</strong>
                        <small>{desc}</small>
                      </span>
                      <Switch
                        id={`layer-${key}`}
                        checked={layers[key]}
                        onCheckedChange={(on) => toggleLayer(key, on)}
                        aria-label={label}
                      />
                    </label>
                  ))}
                </TabsContent>
                <TabsContent value="environment" className="settings-content">
                  <p className="section-hint">Tùy chỉnh thời gian và ánh sáng thời tiết 3D.</p>
                  <div className="preset-grid">
                    {PRESETS.map(([p, label, Icon]) => (
                      <button
                        key={p}
                        className={preset === p ? 'active' : ''}
                        onClick={() => changePreset(p)}
                        aria-pressed={preset === p}
                      >
                        <Icon size={24} />
                        {label}
                        {preset === p && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                  <div className="settings-title">Chất lượng hiển thị</div>
                  <RadioGroup
                    value={quality}
                    onValueChange={(v) => changeQuality(v as Quality)}
                    className="quality-options"
                  >
                    {[
                      ['auto', 'Tự động', 'Tự điều chỉnh theo hiệu năng thiết bị'],
                      ['fine', 'Sắc nét', 'Đầy đủ bóng đổ và chi tiết công trình'],
                      ['smooth', 'Mượt mà', 'Tối ưu tốc độ khung hình cho máy yếu'],
                    ].map(([q, name, desc]) => (
                      <label key={q} htmlFor={`quality-${q}`}>
                        <RadioGroupItem
                          id={`quality-${q}`}
                          value={q}
                          aria-label={name}
                        />
                        <span>
                          <strong>{name}</strong>
                          <small>{desc}</small>
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                  <p className="settings-note">
                    Ánh sáng mô phỏng không gian thực. Tỉ lệ và tọa độ chuẩn xác theo hệ GIS TDMU.
                  </p>
                </TabsContent>
              </Tabs>
              <div className="panel-foot">
                <span className="live-dot" />
                {overviewError ? (
                  <button onClick={() => setOverviewRetry((n) => n + 1)}>
                    Thống kê chưa sẵn sàng · Thử lại
                  </button>
                ) : overview ? (
                  `Bản đồ số ${overview.snapshotAt.slice(0, 10).replaceAll('-', '.')}`
                ) : (
                  'Đang tải số liệu…'
                )}
                <button onClick={() => setAbout(true)} title="Xem nguồn dữ liệu">
                  <Info size={14} />
                </button>
              </div>
              {current && (
                <button
                  className="return-landmark"
                  onClick={() => {
                    pendingFocus.current = 'detail';
                    setPanelMode('detail');
                    setPanelExpanded(false);
                  }}
                >
                  Trở lại {current.name} <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          )}
          <CampusMinimap
            buildings={buildings}
            current={currentLandmark}
            camera={cameraState}
            showBoundary={layers.boundary}
          />
        </div>
        {collapsed && tourStarted && (
          <button
            className="tour-compact"
            onClick={() => setTour((value) => !value)}
          >
            {tour ? <Pause size={15} /> : <Play size={15} />}
            {tour ? 'Tạm dừng' : 'Tiếp tục tham quan'} · {tourIndex + 1}/
            {landmarks.length}
          </button>
        )}
        <div className="tour-bar">
          <div className="tour-copy">
            <strong>
              {tour
                ? 'Đang tham quan TDMU'
                : tourStarted
                  ? 'Đã tạm dừng'
                  : 'Dạo quanh toàn cảnh khuôn viên'}
            </strong>
            <small>
              {tourStarted
                ? `${String(tourIndex + 1).padStart(2, '0')} / ${landmarks.length} · ${landmarks[tourIndex]?.name}`
                : `${landmarks.length || '—'} địa điểm · Tham quan tự động`}
            </small>
          </div>
          <button
            className="tour-start"
            disabled={!ready}
            onClick={() => {
              setTourStarted(true);
              setTour((v) => !v);
            }}
          >
            {tour ? <Pause size={15} /> : <Play size={15} />}
            <span>{tour ? 'Tạm dừng' : tourStarted ? 'Tiếp tục' : 'Bắt đầu tham quan'}</span>
            {tourStarted && (
              <small className="mobile-tour-progress">
                {tourIndex + 1}/{landmarks.length}
              </small>
            )}
          </button>
          <button
            className="tour-skip"
            title="Điểm trước"
            disabled={!ready}
            onClick={() => jump(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="tour-skip"
            title="Điểm kế tiếp"
            disabled={!ready}
            onClick={() => jump(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </aside>
      <div className="map-tools" aria-label="Điều khiển góc nhìn">
        <button
          className="north-button"
          onClick={() => view('north')}
          title="Hướng chính Bắc"
        >
          <Navigation
            size={20}
            style={{
              transform: `rotate(${cameraBearing(cameraState) - 45}deg)`,
            }}
          />
          <span>N</span>
        </button>
        <div className="tool-stack zoom-tools">
          <button onClick={() => view('zoomIn')} title="Phóng to">
            <Plus size={19} />
          </button>
          <button onClick={() => view('zoomOut')} title="Thu nhỏ">
            <Minus size={19} />
          </button>
        </div>
        <div className="tool-stack secondary-tools">
          <button onClick={() => view('top')} title="Góc nhìn từ trên cao">
            <Layers3 size={18} />
          </button>
          <button onClick={() => view('tilt')} title="Góc nghiêng 3D">
            <Compass size={18} />
          </button>
          <button onClick={() => view('overview')} title="Về toàn cảnh">
            <RotateCcw size={18} />
          </button>
          <button title="Toàn màn hình" onClick={toggleFullscreen}>
            <Expand size={18} />
          </button>
          <button
            title="Chia sẻ góc nhìn"
            disabled={!ready}
            onClick={() => void shareView()}
          >
            <Share2 size={18} />
          </button>
          <button
            title="Xuất ảnh chụp 3D"
            disabled={!ready}
            onClick={() => void exportView()}
          >
            <Download size={18} />
          </button>
        </div>
        <div className="tool-stack mobile-tools">
          <button
            className="mobile-reset"
            onClick={() => view('overview')}
            title="Về toàn cảnh"
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="more-tools-button"
            onClick={() => setToolsOpen(true)}
            aria-haspopup="dialog"
            title="Công cụ khác"
          >
            <Ellipsis size={20} />
            <span>Thêm</span>
          </button>
        </div>
      </div>
      <footer className="map-footer">
        <button className="gesture-help" onClick={() => setHelpOpen(true)}>
          Hướng dẫn · Chuột trái xoay · Cuộn chuột thu phóng
        </button>
        {layers.boundary && (
          <span className="boundary-legend">
            <i />
            Ranh giới khuôn viên trường
          </span>
        )}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors · ODbL
        </a>
      </footer>
      {status && (
        <div
          className={`scene-status ${error ? 'error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {!error && <LoaderCircle className="spin" size={16} />}
          <span>{status}</span>
          {loadProgress !== undefined && (
            <progress aria-label="Tiến trình tải mô hình" max={1} value={loadProgress} />
          )}
          {error && <button onClick={retry}>Thử lại</button>}
        </div>
      )}
      {toast && (
        <output className="toast">
          <Check size={15} />
          {toast}
        </output>
      )}
      {debug && metrics && (
        <pre className="debug-metrics">{JSON.stringify(metrics, null, 2)}</pre>
      )}
      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="tools-dialog">
          <DialogTitle>Công cụ bản đồ</DialogTitle>
          <DialogDescription>
            Tùy chỉnh góc máy, chia sẻ liên kết hoặc xem hướng dẫn điều khiển.
          </DialogDescription>
          <div className="tools-grid">
            <button
              onClick={() => {
                setToolsOpen(false);
                view('overview');
              }}
            >
              <RotateCcw size={20} />
              Về toàn cảnh
            </button>
            <button
              onClick={() => {
                setToolsOpen(false);
                view('north');
              }}
            >
              <Navigation size={20} />
              Hướng chính Bắc
            </button>
            <button
              onClick={() => {
                setToolsOpen(false);
                view('top');
              }}
            >
              <Layers3 size={20} />
              Góc nhìn từ trên cao
            </button>
            <button
              onClick={() => {
                setToolsOpen(false);
                view('tilt');
              }}
            >
              <Compass size={20} />
              Góc nghiêng 3D
            </button>
            <button
              onClick={() => {
                setToolsOpen(false);
                toggleFullscreen();
              }}
            >
              <Expand size={20} />
              Bật/tắt toàn màn hình
            </button>
            <button
              disabled={!ready}
              onClick={() => {
                setToolsOpen(false);
                void shareView();
              }}
            >
              <Share2 size={20} />
              Chia sẻ góc nhìn
            </button>
            <button
              disabled={!ready}
              onClick={() => {
                setToolsOpen(false);
                void exportView();
              }}
            >
              <Download size={20} />
              Xuất ảnh chụp 3D
            </button>
            <button
              onClick={() => {
                setToolsOpen(false);
                setHelpOpen(true);
              }}
            >
              <CircleHelp size={20} />
              Hướng dẫn thao tác
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="tools-dialog">
          <DialogTitle>Hướng dẫn khám phá 3D</DialogTitle>
          <DialogDescription>
            Tìm kiếm địa danh trên thanh tìm kiếm hoặc nhấn &quot;Bắt đầu tham quan&quot; để dạo quanh tự động.
          </DialogDescription>
          <dl className="gesture-instructions">
            <dt>Màn hình cảm ứng (Điện thoại/Tablet)</dt>
            <dd>1 ngón tay vuốt xoay 360°, 2 ngón tay kéo để di chuyển bản đồ, chụm/mở 2 ngón để thu phóng.</dd>
            <dt>Chuột & Touchpad</dt>
            <dd>Chuột trái kéo để xoay, chuột phải kéo để di chuyển, cuộn chuột để phóng to/thu nhỏ.</dd>
            <dt>Bàn phím máy tính</dt>
            <dd>
              Tab để chọn nút, Enter để xác nhận. Khung 3D: Dùng phím mũi tên để di chuyển, phím +/- phóng to/thu nhỏ, phím Home về toàn cảnh.
            </dd>
            <dt>Khám phá công trình</dt>
            <dd>
              Nhập tên công trình như &quot;B1&quot;, &quot;A1&quot;, chọn góc nhìn toàn cảnh, mặt trước, mặt sau hoặc lối vào.
            </dd>
            <dt>Tạm dừng tham quan</dt>
            <dd>Nhấn nút tạm dừng hoặc chạm kéo chuột vào màn hình để dừng lại quan sát chi tiết.</dd>
          </dl>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(shareLink)}
        onOpenChange={(open) => {
          if (!open) setShareLink('');
        }}
      >
        <DialogContent className="share-dialog">
          <DialogTitle>Chia sẻ góc nhìn khuôn viên</DialogTitle>
          <DialogDescription>
            Liên kết lưu lại góc máy, độ cao và ánh sáng hiện tại để mở trên thiết bị khác.
          </DialogDescription>
          <Input
            aria-label="Liên kết góc nhìn khuôn viên"
            value={shareLink}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <p>Sao chép liên kết trên để gửi cho bạn bè hoặc thầy cô.</p>
        </DialogContent>
      </Dialog>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="about-dialog">
          <DialogTitle>Giới thiệu Hệ thống 3D WebGIS Đại học Thủ Dầu Một</DialogTitle>
          <DialogDescription>
            Hệ thống bản đồ 3D trực quan khuôn viên Trường Đại học Thủ Dầu Một (TDMU), tỉnh Bình Dương.
          </DialogDescription>
          <div className="about-scroll">
            <p>
              Được xây dựng phục vụ công tác nghiên cứu khoa học, quảng bá khuôn viên và hỗ trợ sinh viên, giảng viên tra cứu vị trí giảng đường.
            </p>
            {overviewError && (
              <output className="metadata-status">
                Dữ liệu thống kê đang cập nhật, bạn vẫn có thể tự do tham quan.
                <button onClick={() => setOverviewRetry((n) => n + 1)}>
                  Tải lại số liệu
                </button>
              </output>
            )}
            <div className="about-stats">
              <span>
                <b>{overview?.campusBuildings ?? '—'}</b> công trình
              </span>
              <span>
                <b>{landmarks.length || '—'}</b> địa điểm nổi bật
              </span>
              <span>
                <b>{overview?.trees ?? '—'}</b> mảng xanh
              </span>
            </div>
            <h3>Thông tin chung về Trường Đại học Thủ Dầu Một</h3>
            <p>
              Trường Đại học Thủ Dầu Một được thành lập theo Quyết định số 900/QĐ-TTg ngày 24/06/2009 của Thủ tướng Chính phủ trên cơ sở nâng cấp Trường Cao đẳng Sư phạm Bình Dương. Trụ sở chính: <b>Số 06 Trần Văn Ơn, Phường Phú Hòa, TP. Thủ Dầu Một, Tỉnh Bình Dương</b>.
            </p>
            <p>
              Hotline: (0274) 3822 518 - (0274) 3834 348 | Email: bbt@tdmu.edu.vn | Website: https://tdmu.edu.vn.
            </p>
            <p>
              Là cơ sở giáo dục đại học công lập đa ngành, đa lĩnh vực, TDMU hiện đào tạo hơn 20.000 sinh viên và học viên, đạt chuẩn kiểm định chất lượng giáo dục quốc gia và đạt chứng nhận tiêu chuẩn mạng lưới các trường đại học Đông Nam Á (AUN-QA).
            </p>
            <h3>Dữ liệu GIS & Căn cứ kỹ thuật</h3>
            <p>
              Dữ liệu GIS: {overview?.snapshotAt.slice(0, 10) ?? '2026-09-21'}. Bản đồ số khuôn viên TDMU được chuẩn hóa theo hệ tọa độ WGS84 (Kinh độ 106.6745, Vĩ độ 10.9804) với quy mô khuôn viên 6,74 ha.
            </p>
            <p>
              Đường Trần Văn Ơn là tuyến giao thông đối ngoại chính tiếp giáp cổng chính Trường Đại học Thủ Dầu Một. Mạng lưới đường nội bộ kết nối liên hoàn các khối giảng đường B1, A1-A4, C, D, E, F, G, H, I, K, Hội trường, Thư viện và Trung tâm học liệu.
            </p>
            <p>
              Đường bao ranh giới khuôn viên và khối footprint công trình được chuẩn hóa từ dữ liệu OpenStreetMap (Way 495488235) kết hợp dữ liệu quy hoạch hạ tầng số của Tỉnh Bình Dương.
            </p>
            <div className="source-links">
              {Object.entries(refs).map(([k, r]) => (
                <a href={r.url} key={k} target="_blank" rel="noreferrer">
                  {r.name}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
            <h3>Thao tác điều khiển</h3>
            <p>
              Chuột trái kéo để xoay 360°, chuột phải kéo để di chuyển, cuộn chuột để phóng to/thu nhỏ; Màn hình cảm ứng: 1 ngón tay xoay, 2 ngón tay di chuyển và thu phóng. Khi can thiệp thủ công, chế độ tham quan tự động sẽ tạm dừng. Bảng điều khiển bên trái hỗ trợ tìm kiếm giảng đường, đổi môi trường ánh sáng thời tiết và quản lý các lớp bản đồ GIS.
            </p>
            <h3>Nền tảng công nghệ & Bản quyền</h3>
            <p>
              Three.js + React + Vite + TailwindCSS. Dữ liệu địa không gian mở OpenStreetMap (OSM) và quy chuẩn WebGIS Trường Đại học Thủ Dầu Một.
            </p>
            <a
              className="source-link"
              href="https://tdmu.edu.vn"
              target="_blank"
              rel="noreferrer"
            >
              Truy cập Cổng thông tin chính thức Trường ĐH Thủ Dầu Một <ArrowUpRight size={14} />
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
