import React, { useState, useMemo, useEffect, useRef } from "react";
import { MapPin, Map as MapIcon, List, Search, Users, Clock, Umbrella, Bath, Lightbulb, Plus, X, ChevronRight, Beer, Share2 } from "lucide-react";

// 마포구 동별 대략적인 중심 좌표 (정확한 매장 위치가 아닌 동 단위 근사치)
const NEIGHBORHOOD_COORDS = {
  "마포구 연남동": { lat: 37.5615, lng: 126.9253 },
  "마포구 합정동": { lat: 37.5495, lng: 126.9139 },
  "마포구 망원동": { lat: 37.5563, lng: 126.9013 },
  "마포구 상수동": { lat: 37.5478, lng: 126.9227 },
};
const MAPO_CENTER = { lat: 37.5546, lng: 126.9082 };

// 같은 동에 스팟이 여러 개일 때 핀이 완전히 겹치지 않도록 하는 결정론적 오프셋
function jitterOffset(id) {
  let hash = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const dLat = (((hash % 1000) / 1000) - 0.5) * 0.0016;
  const dLng = ((((hash >> 3) % 1000) / 1000) - 0.5) * 0.0016;
  return [dLat, dLng];
}

function useKakaoMaps() {
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    const appKey = import.meta.env.VITE_KAKAO_JS_KEY;
    if (!appKey) {
      setStatus("error");
      return;
    }
    if (window.kakao && window.kakao.maps) {
      setStatus("ready");
      return;
    }
    const existing = document.getElementById("kakao-maps-sdk");
    if (existing) {
      existing.addEventListener("load", () => window.kakao.maps.load(() => setStatus("ready")));
      existing.addEventListener("error", () => setStatus("error"));
      return;
    }
    const script = document.createElement("script");
    script.id = "kakao-maps-sdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => setStatus("ready"));
    script.onerror = () => setStatus("error");
    document.head.appendChild(script);
  }, []);

  return status;
}

function MapView({ spots, onSelect }) {
  const status = useKakaoMaps();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const placesRef = useRef(null);
  const searchMarkerRef = useRef(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState("idle"); // idle | searching | results | empty | error

  useEffect(() => {
    if (status !== "ready" || !containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = new window.kakao.maps.Map(containerRef.current, {
        center: new window.kakao.maps.LatLng(MAPO_CENTER.lat, MAPO_CENTER.lng),
        level: 6,
      });
    }

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const plotted = spots
      .map((spot) => {
        const base = NEIGHBORHOOD_COORDS[spot.area];
        if (!base) return null;
        const [dLat, dLng] = jitterOffset(spot.id);
        return { spot, lat: base.lat + dLat, lng: base.lng + dLng };
      })
      .filter(Boolean);

    const bounds = new window.kakao.maps.LatLngBounds();
    plotted.forEach(({ spot, lat, lng }) => {
      const position = new window.kakao.maps.LatLng(lat, lng);
      const marker = new window.kakao.maps.Marker({
        position,
        title: spot.name,
        map: mapRef.current,
      });
      window.kakao.maps.event.addListener(marker, "click", () => onSelect(spot));
      markersRef.current.push(marker);
      bounds.extend(position);
    });

    if (plotted.length > 0) mapRef.current.setBounds(bounds);
  }, [status, spots, onSelect]);

  function moveToResult(place) {
    const position = new window.kakao.maps.LatLng(Number(place.y), Number(place.x));
    mapRef.current.panTo(position);
    if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
    searchMarkerRef.current = new window.kakao.maps.Marker({ position, map: mapRef.current });
    setQuery(place.place_name);
    setResults([]);
    setSearchState("idle");
  }

  function runSearch() {
    const q = query.trim();
    if (!q || status !== "ready") return;
    if (!placesRef.current) placesRef.current = new window.kakao.maps.services.Places();

    setSearchState("searching");
    placesRef.current.keywordSearch(
      q,
      (data, kakaoStatus) => {
        if (kakaoStatus === window.kakao.maps.services.Status.OK) {
          if (data.length === 1) {
            moveToResult(data[0]);
          } else {
            setResults(data);
            setSearchState("results");
          }
        } else if (kakaoStatus === window.kakao.maps.services.Status.ZERO_RESULT) {
          setResults([]);
          setSearchState("empty");
        } else {
          setResults([]);
          setSearchState("error");
        }
      },
      { location: mapRef.current.getCenter(), radius: 20000 }
    );
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setSearchState("idle");
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      searchMarkerRef.current = null;
    }
  }

  if (status === "error") {
    return (
      <div style={styles.mapStatus}>
        카카오맵을 불러오지 못했어요. VITE_KAKAO_JS_KEY 환경변수가 .env에 설정되어 있는지 확인해주세요.
      </div>
    );
  }

  return (
    <div>
      {status === "ready" && (
        <div style={styles.mapSearchWrap}>
          <form
            style={styles.mapSearchForm}
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <Search size={14} color="var(--muted)" />
            <input
              style={styles.mapSearchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="동네 이름이나 편의점 이름으로 검색"
            />
            {query && (
              <button type="button" style={styles.mapSearchClear} onClick={clearSearch}>
                <X size={14} />
              </button>
            )}
          </form>

          {searchState === "results" && (
            <div style={styles.searchResultsList}>
              {results.map((place, i) => (
                <button
                  key={place.id}
                  style={{
                    ...styles.searchResultItem,
                    ...(i === results.length - 1 ? { borderBottom: "none" } : {}),
                  }}
                  onClick={() => moveToResult(place)}
                >
                  <div style={styles.searchResultName}>{place.place_name}</div>
                  <div style={styles.searchResultAddr}>
                    {place.road_address_name || place.address_name}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchState === "empty" && (
            <div style={styles.searchMsg}>검색 결과가 없어요.</div>
          )}
          {searchState === "error" && (
            <div style={styles.searchMsg}>검색 중 문제가 생겼어요. 다시 시도해주세요.</div>
          )}
        </div>
      )}

      <div style={styles.mapContainer}>
        {status === "loading" && <div style={styles.mapStatus}>지도 불러오는 중...</div>}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={styles.mapCaption}>
        <MapPin size={12} /> 핀 위치는 동 단위 대략적인 표시예요. 실제 매장 위치와 다를 수 있어요.
      </div>
    </div>
  );
}

function spotMapLink(spot) {
  const base = NEIGHBORHOOD_COORDS[spot.area];
  if (!base) return "https://map.kakao.com";
  const [dLat, dLng] = jitterOffset(spot.id);
  return `https://map.kakao.com/link/map/${encodeURIComponent(spot.name)},${base.lat + dLat},${base.lng + dLng}`;
}

let kakaoSdkPromise = null;

function loadKakaoShareSdk() {
  if (kakaoSdkPromise) return kakaoSdkPromise;

  kakaoSdkPromise = new Promise((resolve, reject) => {
    const appKey = import.meta.env.VITE_KAKAO_JS_KEY;
    if (!appKey) {
      reject(new Error("VITE_KAKAO_JS_KEY가 설정되지 않았어요."));
      return;
    }
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(appKey);
      resolve(window.Kakao);
      return;
    }
    const script = document.createElement("script");
    script.id = "kakao-js-sdk";
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js";
    script.onload = () => {
      if (!window.Kakao.isInitialized()) window.Kakao.init(appKey);
      resolve(window.Kakao);
    };
    script.onerror = () => reject(new Error("카카오 SDK를 불러오지 못했어요."));
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}

async function shareSpotToKakao(spot, onError) {
  try {
    const Kakao = await loadKakaoShareSdk();
    const meta = statusMeta[spot.status] || statusMeta.open;
    const link = spotMapLink(spot);
    const lines = [
      spot.name,
      spot.area,
      `${meta.label} · 테이블 ${spot.tables}개`,
      spot.roof ? "지붕 있음" : "지붕 없음",
    ];
    Kakao.Share.sendDefault({
      objectType: "text",
      text: lines.join("\n"),
      link: { webUrl: link, mobileWebUrl: link },
    });
  } catch (e) {
    onError && onError(e);
  }
}

// 스팟 데이터는 /api/spots (Upstash Redis)에서 불러옴. 시드 데이터는 api/_redis.js에 있음.

const statusMeta = {
  open: { label: "자리 있음", dot: "var(--ok)" },
  busy: { label: "붐빔", dot: "var(--warn)" },
  unknown: { label: "정보 오래됨", dot: "var(--muted)" },
};

const filters = [
  { key: "all", label: "전체" },
  { key: "open", label: "자리 있음" },
  { key: "roof", label: "지붕 있음" },
];

function timeAgoLabel(ts) {
  const min = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

function deriveStatus(spot) {
  const minutesAgo = (Date.now() - spot.lastReportAt) / 60000;
  if (minutesAgo > 45) return "unknown";
  return spot.status === "busy" ? "busy" : "open";
}

export default function PyeonmaekJido() {
  const [spots, setSpots] = useState(null); // null = 초기 로딩 중
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);

  function loadSpots() {
    setLoadError(false);
    setSpots(null);
    fetch("/api/spots")
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => setSpots(data))
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadSpots();
  }, []);

  const displaySpots = useMemo(() => {
    if (!spots) return [];
    return spots.map((s) => ({ ...s, status: deriveStatus(s) }));
  }, [spots]);

  const filtered = useMemo(() => {
    if (filter === "open") return displaySpots.filter((s) => s.status === "open");
    if (filter === "roof") return displaySpots.filter((s) => s.roof);
    return displaySpots;
  }, [displaySpots, filter]);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  async function checkIn(id) {
    try {
      const res = await fetch(`/api/spots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      if (!res.ok) throw new Error("checkin failed");
      const updated = await res.json();
      setSpots((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setSaveError(false);
      flashToast("자리 있음으로 제보했어요");
    } catch (e) {
      setSaveError(true);
      flashToast("제보에 실패했어요. 다시 시도해주세요.");
    }
  }

  async function addSpot(newSpot) {
    try {
      const res = await fetch("/api/spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSpot),
      });
      if (!res.ok) throw new Error("create failed");
      const created = await res.json();
      setSpots((prev) => [created, ...prev]);
      setShowForm(false);
      setSaveError(false);
      flashToast("새 스팟이 등록됐어요");
    } catch (e) {
      setSaveError(true);
      flashToast("등록에 실패했어요. 다시 시도해주세요.");
    }
  }

  function handleShare(spot) {
    shareSpotToKakao(spot, () => {
      flashToast("카톡 공유를 사용할 수 없어요");
    });
  }

  if (spots === null && !loadError) {
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <div style={styles.loadingWrap}>스팟 불러오는 중...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <div style={styles.loadingWrap}>
          <div>스팟을 불러오지 못했어요.</div>
          <button style={styles.retryBtn} onClick={loadSpots}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{fontImport}</style>

      {/* 상단 헤더 */}
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <div style={styles.logoMark}>
            <Beer size={20} color="var(--bg)" strokeWidth={2.4} />
          </div>
          <div>
            <div style={styles.brand}>편맥지도</div>
            <div style={styles.tagline}>가볍게 만나기 좋은 편의점, 5초 만에 찾기</div>
          </div>
        </div>
      </header>

      {/* 필터 칩 */}
      <div style={styles.filterRow}>
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...styles.chip,
              ...(filter === f.key ? styles.chipActive : {}),
            }}
          >
            {f.label}
          </button>
        ))}
        <button style={styles.addBtn} onClick={() => setShowForm(true)}>
          <Plus size={15} strokeWidth={2.6} />
          스팟 등록
        </button>
      </div>

      {/* 리스트/지도 전환 */}
      <div style={styles.viewToggleRow}>
        <button
          style={{ ...styles.viewToggle, ...(view === "list" ? styles.viewToggleActive : {}) }}
          onClick={() => setView("list")}
        >
          <List size={14} /> 리스트
        </button>
        <button
          style={{ ...styles.viewToggle, ...(view === "map" ? styles.viewToggleActive : {}) }}
          onClick={() => setView("map")}
        >
          <MapIcon size={14} /> 지도
        </button>
      </div>

      {saveError && (
        <div style={styles.errorBanner}>저장에 실패했어요. 네트워크를 확인해주세요.</div>
      )}

      {view === "map" ? (
        <div style={styles.mapSection}>
          <MapView spots={filtered} onSelect={setSelected} />
        </div>
      ) : (
        /* 스팟 리스트 */
        <main style={styles.list}>
          {filtered.length === 0 && (
            <div style={styles.empty}>조건에 맞는 스팟이 아직 없어요.</div>
          )}
          {filtered.map((spot) => {
            const meta = statusMeta[spot.status];
            return (
              <div key={spot.id} style={styles.card}>
                <button style={styles.cardMain} onClick={() => setSelected(spot)}>
                  <div style={styles.cardTop}>
                    <div style={styles.cardTitleRow}>
                      <span style={{ ...styles.statusDot, background: meta.dot }} />
                      <span style={styles.cardTitle}>{spot.name}</span>
                    </div>
                    <ChevronRight size={16} color="var(--muted)" />
                  </div>
                  <div style={styles.cardArea}>{spot.area}</div>
                  <div style={styles.cardMetaRow}>
                    <span style={styles.metaItem}>
                      <Users size={13} /> 테이블 {spot.tables}
                    </span>
                    <span style={styles.metaItem}>
                      <Clock size={13} /> {timeAgoLabel(spot.lastReportAt)}
                    </span>
                    {spot.roof && (
                      <span style={styles.metaItem}>
                        <Umbrella size={13} /> 지붕
                      </span>
                    )}
                  </div>
                  {spot.tags.length > 0 && (
                    <div style={styles.tagRow}>
                      {spot.tags.map((t) => (
                        <span key={t} style={styles.tag}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
                <button style={styles.shareBtn} onClick={() => handleShare(spot)}>
                  <Share2 size={13} /> 카톡으로 공유하기
                </button>
              </div>
            );
          })}
        </main>
      )}

      {/* 상세 시트 */}
      {selected && (
        <div style={styles.overlay} onClick={() => setSelected(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <div>
                <div style={styles.sheetTitle}>{selected.name}</div>
                <div style={styles.cardArea}>{selected.area}</div>
              </div>
              <button style={styles.closeBtn} onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <Users size={16} color="var(--accent)" />
                <span>테이블 {selected.tables}개</span>
              </div>
              <div style={styles.infoItem}>
                <Umbrella size={16} color={selected.roof ? "var(--accent)" : "var(--muted)"} />
                <span>{selected.roof ? "지붕 있음" : "지붕 없음"}</span>
              </div>
              <div style={styles.infoItem}>
                <Bath size={16} color={selected.restroom ? "var(--accent)" : "var(--muted)"} />
                <span>{selected.restroom ? "화장실 있음" : "화장실 없음"}</span>
              </div>
              <div style={styles.infoItem}>
                <Lightbulb size={16} color="var(--accent)" />
                <span>조명 {selected.lighting}</span>
              </div>
            </div>

            <p style={styles.note}>{selected.note || "아직 등록된 한줄평이 없어요."}</p>

            <button style={styles.checkInBtn} onClick={() => checkIn(selected.id)}>
              지금 자리 있어요 제보하기
            </button>
            <div style={styles.lastReportLine}>
              마지막 제보 {timeAgoLabel(selected.lastReportAt)}
            </div>
          </div>
        </div>
      )}

      {/* 등록 폼 */}
      {showForm && (
        <div style={styles.overlay} onClick={() => setShowForm(false)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <div style={styles.sheetTitle}>새 스팟 등록</div>
              <button style={styles.closeBtn} onClick={() => setShowForm(false)}>
                <X size={18} />
              </button>
            </div>
            <SpotForm onSubmit={addSpot} />
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function SpotForm({ onSubmit }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [tables, setTables] = useState(2);
  const [roof, setRoof] = useState(false);
  const [restroom, setRestroom] = useState(false);
  const [lighting, setLighting] = useState("보통");
  const [note, setNote] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !area.trim()) return;
    onSubmit({ name, area, tables, roof, restroom, lighting, note });
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <label style={styles.label}>
        편의점 이름
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: GS25 OO점"
        />
      </label>
      <label style={styles.label}>
        위치
        <input
          style={styles.input}
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="예: 마포구 연남동"
        />
      </label>
      <label style={styles.label}>
        테이블 개수: {tables}
        <input
          type="range"
          min="1"
          max="8"
          value={tables}
          onChange={(e) => setTables(Number(e.target.value))}
          style={styles.range}
        />
      </label>
      <div style={styles.toggleRow}>
        <button
          type="button"
          style={{ ...styles.toggle, ...(roof ? styles.toggleOn : {}) }}
          onClick={() => setRoof((v) => !v)}
        >
          <Umbrella size={14} /> 지붕
        </button>
        <button
          type="button"
          style={{ ...styles.toggle, ...(restroom ? styles.toggleOn : {}) }}
          onClick={() => setRestroom((v) => !v)}
        >
          <Bath size={14} /> 화장실
        </button>
      </div>
      <label style={styles.label}>
        조명
        <select
          style={styles.input}
          value={lighting}
          onChange={(e) => setLighting(e.target.value)}
        >
          <option>밝음</option>
          <option>보통</option>
          <option>어두움</option>
        </select>
      </label>
      <label style={styles.label}>
        한줄평 (선택)
        <textarea
          style={{ ...styles.input, height: 60, resize: "none" }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="이 스팟만의 특징을 알려주세요"
        />
      </label>
      <button type="submit" style={styles.submitBtn}>
        등록하기
      </button>
    </form>
  );
}

const fontImport = `
  @import url('https://fonts.googleapis.com/css2?family=Gothic+A1:wght@500;700;900&family=Noto+Sans+KR:wght@400;500;700&display=swap');
`;

const styles = {
  app: {
    "--bg": "#12182B",
    "--card": "#1C2540",
    "--accent": "#FFB238",
    "--ok": "#4ADE80",
    "--warn": "#FF8A5B",
    "--muted": "#7A85A3",
    "--text": "#F3F1EA",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily: "'Noto Sans KR', sans-serif",
    minHeight: "100vh",
    maxWidth: 420,
    margin: "0 auto",
    paddingBottom: 40,
    position: "relative",
  },
  header: {
    padding: "28px 20px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    background: "linear-gradient(145deg, #FFC55E, #FF9D3D)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brand: {
    fontFamily: "'Gothic A1', sans-serif",
    fontWeight: 900,
    fontSize: 22,
    letterSpacing: "-0.5px",
    color: "var(--accent)",
    textShadow: "0 0 18px rgba(255,178,56,0.35)",
  },
  tagline: { fontSize: 12.5, color: "var(--muted)", marginTop: 2 },
  filterRow: {
    display: "flex",
    gap: 8,
    padding: "16px 20px 6px",
    alignItems: "center",
    overflowX: "auto",
  },
  chip: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    padding: "7px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  chipActive: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "#231400",
    fontWeight: 700,
  },
  addBtn: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12.5,
    fontWeight: 700,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px dashed var(--accent)",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: "60vh",
    color: "var(--muted)",
    fontSize: 13.5,
    textAlign: "center",
  },
  retryBtn: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    padding: "8px 16px",
    borderRadius: 999,
    border: "1px solid var(--accent)",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  },
  errorBanner: {
    margin: "0 20px 10px",
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: 12,
    background: "rgba(255,138,91,0.12)",
    color: "var(--warn)",
  },
  viewToggleRow: {
    display: "flex",
    gap: 6,
    padding: "10px 20px 0",
  },
  viewToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "7px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
  },
  viewToggleActive: {
    background: "rgba(255,178,56,0.12)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
  },
  mapSection: { padding: "10px 16px 4px" },
  mapSearchWrap: { marginBottom: 8 },
  mapSearchForm: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    padding: "10px 12px",
  },
  mapSearchInput: {
    flex: 1,
    fontFamily: "inherit",
    fontSize: 14,
    color: "var(--text)",
    background: "transparent",
    border: "none",
    outline: "none",
    minWidth: 0,
  },
  mapSearchClear: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    padding: 2,
    flexShrink: 0,
  },
  searchResultsList: {
    marginTop: 6,
    background: "var(--card)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    overflow: "hidden",
    maxHeight: 220,
    overflowY: "auto",
  },
  searchResultItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    fontFamily: "inherit",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    padding: "10px 12px",
    cursor: "pointer",
    color: "inherit",
  },
  searchResultName: { fontSize: 13.5, fontWeight: 600 },
  searchResultAddr: { fontSize: 11.5, color: "var(--muted)", marginTop: 2 },
  searchMsg: {
    marginTop: 6,
    fontSize: 12.5,
    color: "var(--muted)",
    textAlign: "center",
    padding: "10px 0",
  },
  mapContainer: {
    position: "relative",
    width: "100%",
    height: 320,
    borderRadius: 16,
    overflow: "hidden",
    background: "var(--card)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  mapStatus: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "0 20px",
    fontSize: 12.5,
    color: "var(--muted)",
    background: "var(--card)",
    zIndex: 1,
  },
  mapCaption: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    color: "var(--muted)",
    marginTop: 8,
    padding: "0 2px",
  },
  list: { padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 },
  empty: { color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "40px 0" },
  card: {
    background: "var(--card)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 16,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardMain: {
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    width: "100%",
  },
  shareBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: 700,
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#FEE500",
    color: "#191919",
    cursor: "pointer",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitleRow: { display: "flex", alignItems: "center", gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  cardTitle: { fontSize: 15.5, fontWeight: 700 },
  cardArea: { fontSize: 12.5, color: "var(--muted)" },
  cardMetaRow: { display: "flex", gap: 12, marginTop: 2 },
  metaItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--muted)",
  },
  tagRow: { display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" },
  tag: {
    fontSize: 11,
    color: "var(--accent)",
    background: "rgba(255,178,56,0.1)",
    padding: "3px 8px",
    borderRadius: 999,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 50,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    background: "var(--card)",
    borderRadius: "20px 20px 0 0",
    padding: "10px 20px 28px",
    boxShadow: "0 -8px 30px rgba(0,0,0,0.4)",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    background: "rgba(255,255,255,0.15)",
    margin: "6px auto 14px",
  },
  sheetHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: 700 },
  closeBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "none",
    borderRadius: 999,
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text)",
    cursor: "pointer",
    flexShrink: 0,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 16,
  },
  infoItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    background: "rgba(255,255,255,0.04)",
    padding: "10px 12px",
    borderRadius: 12,
  },
  note: {
    fontSize: 13.5,
    lineHeight: 1.6,
    color: "#D8D4C8",
    background: "rgba(255,255,255,0.03)",
    padding: 14,
    borderRadius: 12,
    marginBottom: 18,
  },
  checkInBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 14,
    border: "none",
    background: "var(--accent)",
    color: "#231400",
    fontSize: 14.5,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  lastReportLine: {
    textAlign: "center",
    fontSize: 11.5,
    color: "var(--muted)",
    marginTop: 8,
  },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  label: {
    fontSize: 12.5,
    color: "var(--muted)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  input: {
    fontFamily: "inherit",
    fontSize: 14,
    color: "var(--text)",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  range: { width: "100%", accentColor: "#FFB238" },
  toggleRow: { display: "flex", gap: 8 },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  toggleOn: {
    background: "rgba(255,178,56,0.12)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
  },
  submitBtn: {
    marginTop: 4,
    padding: "14px",
    borderRadius: 14,
    border: "none",
    background: "var(--accent)",
    color: "#231400",
    fontSize: 14.5,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#2A2118",
    color: "var(--accent)",
    padding: "10px 18px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
    zIndex: 60,
  },
};
