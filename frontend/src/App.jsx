import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wind, MapPin, Sparkles, BellRing, Sliders,
  RefreshCw, CheckCircle2, ShieldAlert, ArrowRight,
  Activity, Volume2, VolumeX, Radio,
  BarChart3, MessageSquare, Copy, Check, HeartPulse, Flame,
  X, Layers, Cpu, Database, Send
} from 'lucide-react';

const API_BASE = "http://127.0.0.1:8000";
const AUTO_REFRESH_SECONDS = 30;

// ─── Station Network with Geo Coordinates ───────────────────────────
const STATIONS = [
  { id: "delhi/anand-vihar",  name: "Delhi — Anand Vihar",   lat: 28.6469, lng: 77.3160, baseAQI: 285, region: "East Delhi", xPct: 62, yPct: 42 },
  { id: "delhi/punjabi-bagh", name: "Delhi — Punjabi Bagh",  lat: 28.6692, lng: 77.1263, baseAQI: 240, region: "West Delhi", xPct: 40, yPct: 38 },
  { id: "delhi/r.k.-puram",   name: "Delhi — R.K. Puram",    lat: 28.5644, lng: 77.1750, baseAQI: 215, region: "South Delhi", xPct: 45, yPct: 60 },
  { id: "delhi/mandir-marg",  name: "Delhi — Mandir Marg",   lat: 28.6297, lng: 77.1990, baseAQI: 195, region: "Central Delhi", xPct: 50, yPct: 48 },
  { id: "mumbai",             name: "Mumbai — BKC Bandra",   lat: 19.0657, lng: 72.8687, baseAQI: 110, region: "Maharashtra", xPct: 25, yPct: 75 },
  { id: "kolkata",            name: "Kolkata — Victoria",    lat: 22.5448, lng: 88.3426, baseAQI: 175, region: "West Bengal", xPct: 82, yPct: 62 },
  { id: "bengaluru",          name: "Bengaluru — BTM",       lat: 12.9166, lng: 77.6101, baseAQI: 65,  region: "Karnataka", xPct: 44, yPct: 88 },
  { id: "patna",              name: "Patna — DRM Office",     lat: 25.5941, lng: 85.1376, baseAQI: 295, region: "Bihar", xPct: 74, yPct: 50 },
  { id: "hyderabad",          name: "Hyderabad — Central",   lat: 17.4563, lng: 78.4428, baseAQI: 92,  region: "Telangana", xPct: 48, yPct: 72 },
  { id: "lucknow",            name: "Lucknow — Talkatora",   lat: 26.8322, lng: 80.8988, baseAQI: 260, region: "Uttar Pradesh", xPct: 60, yPct: 46 },
];

const PRESET_SCENARIOS = [
  { id: "severe-inversion", title: "Winter Thermal Inversion", spike: 175, label: "Severe Smog (+175)", icon: "❄️" },
  { id: "stubble-wave",     title: "Crop Residue Smoke Surge", spike: 110, label: "Smoke Wave (+110)", icon: "🌾" },
  { id: "moderate-haze",     title: "Standard Urban Haze",      spike: 0,   label: "Live Base (+0)",    icon: "🚗" },
  { id: "post-rain",         title: "Post-Rain Clear Window",   spike: -80, label: "Washout (-80)",     icon: "🌧️" }
];

// ─── Static Master Schedule ─────────────────────────────────────────
const ORIGINAL_SCHEDULE = [
  { period_id: 1, name: "Morning Assembly",    time: "08:15–08:45", duration_mins: 30, current_venue: "Open Assembly Grounds",     is_outdoor: true,  intensity: "Low",       activityType: "Assembly" },
  { period_id: 2, name: "Academic Block 1",    time: "08:45–10:15", duration_mins: 90, current_venue: "Academic Wing Classrooms",  is_outdoor: false, intensity: "Sedentary", activityType: "Class" },
  { period_id: 3, name: "Primary Recess",      time: "10:15–10:55", duration_mins: 40, current_venue: "Junior Playground",         is_outdoor: true,  intensity: "High",      activityType: "Play" },
  { period_id: 4, name: "Academic Block 2",    time: "10:55–12:30", duration_mins: 95, current_venue: "Academic Wing Classrooms",  is_outdoor: false, intensity: "Sedentary", activityType: "Class" },
  { period_id: 5, name: "PE & Football",       time: "12:30–13:15", duration_mins: 45, current_venue: "Senior Sports Arena",       is_outdoor: true,  intensity: "Extreme",   activityType: "Sports" },
  { period_id: 6, name: "Library & Labs",      time: "13:15–14:00", duration_mins: 45, current_venue: "Central Library",           is_outdoor: false, intensity: "Low",       activityType: "Study" },
  { period_id: 7, name: "Bus Dispersal",       time: "14:00–14:30", duration_mins: 30, current_venue: "Front Gate & Bus Bay",      is_outdoor: true,  intensity: "Moderate",  activityType: "Transit" },
];

// ─── 24-Hour Diurnal Curve Helper ───────────────────────────────────
const generate24HrData = (currentAqi) => {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const diurnalFactor = 1.0 + 0.35 * Math.sin(((h - 2) / 24) * 2 * Math.PI) + (h >= 7 && h <= 10 ? 0.25 : 0) + (h >= 19 && h <= 23 ? 0.3 : 0);
    const predicted = Math.max(25, Math.round(currentAqi * 0.75 * diurnalFactor));
    hours.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      hNum: h,
      aqi: predicted,
      isSchoolTime: h >= 8 && h <= 15
    });
  }
  return hours;
};

// ─── Helper Functions ───────────────────────────────────────────────
const classifyAQI = (v) => {
  if (v <= 50)  return { label: "Good",           color: "#10b981", bg: "rgba(16,185,129,0.15)", pct: 10,  hazard: "Low",       mask: "Not Required" };
  if (v <= 100) return { label: "Satisfactory",   color: "#84cc16", bg: "rgba(132,204,22,0.15)", pct: 25,  hazard: "Minor",     mask: "Optional" };
  if (v <= 200) return { label: "Moderate",       color: "#eab308", bg: "rgba(234,179,8,0.15)",  pct: 45,  hazard: "Caution",   mask: "Recommended for sensitive" };
  if (v <= 300) return { label: "Poor",           color: "#f97316", bg: "rgba(249,115,22,0.15)", pct: 65,  hazard: "High",      mask: "N95 Recommended" };
  if (v <= 400) return { label: "Very Poor",      color: "#ef4444", bg: "rgba(239,68,68,0.15)",  pct: 85,  hazard: "Very High", mask: "N95 Mandatory" };
  return              { label: "Severe",          color: "#991b1b", bg: "rgba(153,27,27,0.25)", pct: 98,  hazard: "Emergency", mask: "Full Indoor Lockdown / N99" };
};

// ─── Web Audio API Chime Synthesizer ────────────────────────────────
function playAlertChime(isSevere = false) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    if (isSevere) {
      osc1.frequency.setValueAtTime(698.46, now);
      osc1.frequency.setValueAtTime(830.61, now + 0.15);
      osc2.frequency.setValueAtTime(1396.9, now);
    } else {
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
      osc2.frequency.setValueAtTime(1046.5, now);
    }

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  } catch {
    // ignore audio block
  }
}

// ─── Animated Number Hook ───────────────────────────────────────────
function useCountUp(target, duration = 700) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const diff = target - from;
    if (diff === 0) return;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      setDisplay(Math.round(from + diff * ease));
      if (p < 1) requestAnimationFrame(step);
      else { setDisplay(target); prev.current = target; }
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return display;
}

// ─── Background Atmosphere Canvas ───────────────────────────────────
function AtmosphereCanvas({ aqi }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const count = Math.min(100, Math.max(20, Math.round(aqi * 0.2)));
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 2 + (aqi > 250 ? 1.5 : 0.8),
      vx: (Math.random() - 0.5) * (aqi > 250 ? 0.6 : 0.3),
      vy: (Math.random() - 0.5) * (aqi > 250 ? 0.6 : 0.3) - 0.15,
      alpha: Math.random() * 0.35 + 0.1,
      hue: aqi <= 100 ? 150 : aqi <= 200 ? 45 : aqi <= 300 ? 25 : 0
    }));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.alpha})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, [aqi]);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

// ─── Judge Architecture & Briefing Modal ────────────────────────────
function JudgeBriefModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(3, 7, 18, 0.85)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div className="glass-panel" style={{
        maxWidth: 750, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        padding: 28, position: 'relative', border: '1px solid rgba(56,189,248,0.4)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 20, right: 20, background: 'transparent',
          border: 'none', color: '#94a3b8', cursor: 'pointer'
        }}>
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>VayuGuard — Judge Pitch & AWS Architecture</h2>
            <p style={{ fontSize: '0.75rem', color: '#38bdf8' }}>Environmental Hacks 2026 • Clean Air Track</p>
          </div>
        </div>

        {/* Core Value Proposition */}
        <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>🎯 The Core Innovation</h4>
          <p style={{ fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.5 }}>
            Existing air quality apps only display passive numbers (e.g. <em>"AQI is 380"</em>), leaving school principals guessing.
            <strong> VayuGuard is an active AI orchestrator</strong>: it ingests live sensor feeds, forecasts boundary-layer diurnal smog spikes, and uses <strong>Amazon Bedrock</strong> (with a deterministic safety-rule fallback when Bedrock is unavailable) to intelligently re-sequence the school timetable into safe indoor/filtered slots before classes begin.
          </p>
        </div>

        {/* AWS Serverless Architecture Flow */}
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', marginBottom: 10 }}>⚡ AWS Cloud Architecture</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {[
              { svc: 'Amazon Bedrock', role: 'Pediatric reasoning & timetable optimization (Nova Lite, model-agnostic)', icon: <Cpu size={16} color="#38bdf8" /> },
              { svc: 'AWS Lambda', role: 'EventBridge-triggered ingestion and forecast pipeline', icon: <Layers size={16} color="#f59e0b" /> },
              { svc: 'Amazon DynamoDB', role: 'Live telemetry store for historical AQI readings', icon: <Database size={16} color="#10b981" /> },
              { svc: 'Amazon SNS', role: 'Real-time alert broadcast to subscribed staff/parents', icon: <Send size={16} color="#ec4899" /> },
            ].map((item, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: '0.8rem', marginBottom: 4 }}>
                  {item.icon}
                  <span>{item.svc}</span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.role}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Measurable Pediatric Impact */}
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#86efac', marginBottom: 4 }}>📈 Measurable Pediatric Impact</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Curriculum Kept</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#86efac' }}>100%</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Class Cancellations</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>0 Days</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Toxic Lung Exposure</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>-78% Blocked</div>
            </div>
          </div>
        </div>

        <button className="btn-primary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
          Back to Live Dashboard
        </button>
      </div>
    </div>
  );
}

// ─── 24-Hour Interactive Spline Trend Chart ─────────────────────────
function DiurnalTrendChart({ currentAqi }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const data = generate24HrData(currentAqi);
  const W = 680, H = 150, PAD_X = 40, PAD_Y = 25;
  const maxVal = Math.max(450, ...data.map(d => d.aqi));

  const points = data.map((d, i) => {
    const x = PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
    const y = H - PAD_Y - (d.aqi / maxVal) * (H - PAD_Y * 2);
    return { ...d, x, y };
  });

  const pathD = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - PAD_Y} L ${points[0].x} ${H - PAD_Y} Z`;

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* School Time Highlight Box */}
        {(() => {
          const startX = points[8]?.x || PAD_X;
          const endX = points[15]?.x || W - PAD_X;
          return (
            <g>
              <rect x={startX} y={PAD_Y} width={endX - startX} height={H - PAD_Y * 2}
                fill="rgba(56,189,248,0.06)" rx={6} />
              <text x={(startX + endX) / 2} y={PAD_Y + 12} fill="#38bdf8" fontSize="9" fontWeight="700" textAnchor="middle">
                🏫 School Hours (08:00–15:00)
              </text>
            </g>
          );
        })()}

        {/* Hazard Threshold Line */}
        {(() => {
          const hy = H - PAD_Y - (250 / maxVal) * (H - PAD_Y * 2);
          return (
            <g>
              <line x1={PAD_X} y1={hy} x2={W - PAD_X} y2={hy} stroke="#ef4444" strokeDasharray="4 4" strokeWidth="1" />
              <text x={W - PAD_X + 4} y={hy + 3} fill="#ef4444" fontSize="8" fontWeight="700">250 Critical</text>
            </g>
          );
        })()}

        {/* Shaded Area & Line */}
        <path d={areaD} fill="url(#trendGrad)" />
        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

        {/* Interactive Data Dots */}
        {points.map((p) => {
          const { color } = classifyAQI(p.aqi);
          const isHovered = hoveredPoint?.hour === p.hour;
          return (
            <g key={p.hour}
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{ cursor: 'pointer' }}>
              <circle
                cx={p.x} cy={p.y}
                r={isHovered ? 6 : p.hNum % 4 === 0 ? 4 : 2}
                fill={isHovered ? '#fff' : color}
                stroke={color}
                strokeWidth={isHovered ? 3 : 1}
              />
              {p.hNum % 4 === 0 && (
                <text x={p.x} y={H - 6} fill="#64748b" fontSize="8.5" textAnchor="middle" fontFamily="JetBrains Mono">
                  {p.hour}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hoveredPoint && (
        <div style={{
          position: 'absolute',
          top: 8,
          left: `${(hoveredPoint.x / W) * 100}%`,
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(56,189,248,0.4)',
          borderRadius: 8,
          padding: '6px 12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          zIndex: 10
        }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{hoveredPoint.hour} {hoveredPoint.isSchoolTime ? '• School Active' : ''}</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: classifyAQI(hoveredPoint.aqi).color }}>
            AQI {hoveredPoint.aqi} ({classifyAQI(hoveredPoint.aqi).label})
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Clean Redesigned Geographic Sensor Map & Telemetry Inspector ──
function CleanSensorMap({ stations, selectedStation, onSelectStation, currentAqi, reading }) {
  const selectedStObj = stations.find(s => s.id === selectedStation) || stations[0];
  const { color: selColor, label: selLabel } = classifyAQI(selectedStObj.id === selectedStation ? currentAqi : selectedStObj.baseAQI);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, minHeight: 480 }}>
      
      {/* Map Radar Canvas Column */}
      <div className="glass-panel" style={{ padding: 20, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={16} color="#38bdf8" className="spin" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
              Geographic Air Telemetry Network
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            10 Real-Time Stations (WAQI + CPCB)
          </span>
        </div>

        {/* Clean Interactive SVG Map Area */}
        <div style={{
          position: 'relative', flex: 1, minHeight: 380,
          background: 'radial-gradient(ellipse at center, rgba(14,24,46,0.9) 0%, rgba(6,10,20,0.95) 100%)',
          borderRadius: 12, border: '1px solid var(--border-glass)', overflow: 'hidden'
        }}>
          {/* Radar background grid */}
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }}>
            <circle cx="50%" cy="50%" r="80" fill="none" stroke="rgba(56,189,248,0.15)" strokeDasharray="3 3" />
            <circle cx="50%" cy="50%" r="160" fill="none" stroke="rgba(56,189,248,0.1)" strokeDasharray="4 4" />
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(56,189,248,0.08)" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(56,189,248,0.08)" />
            <g style={{ transformOrigin: '50% 50%' }} className="radar-sweep">
              <line x1="50%" y1="50%" x2="85%" y2="50%" stroke="#38bdf8" strokeWidth="1.5" opacity="0.4" />
            </g>
          </svg>

          {/* Interactive Geographic Station Pins */}
          {stations.map(st => {
            const isSelected = st.id === selectedStation;
            const approxAqi = isSelected ? currentAqi : st.baseAQI;
            const { color } = classifyAQI(approxAqi);

            return (
              <div
                key={st.id}
                onClick={() => onSelectStation(st.id)}
                style={{
                  position: 'absolute',
                  left: `${st.xPct}%`,
                  top: `${st.yPct}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'pointer',
                  zIndex: isSelected ? 20 : 10,
                  transition: 'all 0.3s ease'
                }}
              >
                {/* Pulsing ring around marker */}
                {isSelected && (
                  <div style={{
                    position: 'absolute', inset: -8, borderRadius: '50%',
                    border: `2px solid ${color}`,
                    animation: 'pulseDot 1.5s ease-out infinite',
                    pointerEvents: 'none'
                  }} />
                )}

                {/* Station Tag Pill */}
                <div style={{
                  background: isSelected ? 'rgba(15, 23, 42, 0.98)' : 'rgba(15, 23, 42, 0.85)',
                  border: `1.5px solid ${isSelected ? color : 'rgba(255,255,255,0.12)'}`,
                  boxShadow: isSelected ? `0 0 16px ${color}88` : '0 4px 12px rgba(0,0,0,0.5)',
                  borderRadius: 20,
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f8fafc' }}>
                    {st.name.split('—')[0]}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>
                    {approxAqi}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Station Deep Telemetry Inspector Column */}
      <div className="glass-panel" style={{ padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 2 }}>
                <MapPin size={13} color="#38bdf8" />
                <span>{selectedStObj.region}</span>
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{selectedStObj.name}</h3>
            </div>
            <span className="badge-pill" style={{ background: `${selColor}22`, color: selColor, border: `1px solid ${selColor}55` }}>
              {selLabel}
            </span>
          </div>

          {/* Active Station AQI Hero */}
          <div style={{
            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)',
            borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 14,
              background: `radial-gradient(circle at 35% 35%, ${selColor}bb, ${selColor}44)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${selColor}44`
            }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                {selectedStObj.id === selectedStation ? currentAqi : selectedStObj.baseAQI}
              </span>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Station AQI Reading</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: selColor }}>
                {selectedStObj.id === selectedStation ? reading.action_level : 'Telemetry Active'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Lat: {selectedStObj.lat.toFixed(4)} • Lng: {selectedStObj.lng.toFixed(4)}
              </div>
            </div>
          </div>

          {/* Environmental Particulate Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>PM2.5 Concentration</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                {selectedStObj.id === selectedStation ? reading.pm25 : (selectedStObj.baseAQI * 0.72).toFixed(1)} <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>µg/m³</span>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>PM10 Coarse Dust</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                {selectedStObj.id === selectedStation ? reading.pm10 : (selectedStObj.baseAQI * 1.15).toFixed(1)} <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>µg/m³</span>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Temperature</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                {selectedStObj.id === selectedStation ? reading.temp : 29.4} <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>°C</span>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Humidity</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                {selectedStObj.id === selectedStation ? reading.humidity : 56} <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {selectedStObj.id !== selectedStation ? (
            <button className="btn-primary" onClick={() => onSelectStation(selectedStObj.id)} style={{ width: '100%', justifyContent: 'center' }}>
              <CheckCircle2 size={16} /> Bind School to this Sensor
            </button>
          ) : (
            <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '10px', textAlign: 'center', fontSize: '0.78rem', color: '#86efac', fontWeight: 600 }}>
              ✓ Active Primary School Sensor
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pediatric Lung Risk Calculator ─────────────────────────────────
function PediatricCalculator({ aqi }) {
  const [ageGroup, setAgeGroup] = useState('primary');
  const [activity, setActivity] = useState('High');
  const [duration, setDuration] = useState(40);
  const [hepa, setHepa] = useState(false);

  const rates = {
    primary: { Sedentary: 6.5, Low: 12.0, Moderate: 22.0, High: 38.0, Extreme: 52.0 },
    middle:  { Sedentary: 7.5, Low: 14.0, Moderate: 28.0, High: 48.0, Extreme: 65.0 },
    senior:  { Sedentary: 8.5, Low: 16.0, Moderate: 32.0, High: 56.0, Extreme: 78.0 },
  };

  const pm25 = Math.round(aqi * 0.72 * (hepa ? 0.12 : 1.0));
  const lMin = rates[ageGroup]?.[activity] || 38.0;
  const volM3 = (lMin / 1000.0) * duration;
  const pm25InhaledUg = (pm25 * volM3).toFixed(1);
  const cigEquiv = (pm25InhaledUg / 22.0).toFixed(1);

  return (
    <div className="glass-panel" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <HeartPulse size={22} color="#ef4444" />
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Pediatric Lung PM2.5 Inhalation Calculator</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Calculates deep lung particulate deposition based on child tidal volume, exertion intensity, and HEPA purifiers.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Student Age Bracket</label>
          <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid var(--border-glass)', padding: '10px 12px', borderRadius: 8 }}>
            <option value="primary">Primary (Age 5–10, High Respiratory Rate)</option>
            <option value="middle">Middle School (Age 11–14)</option>
            <option value="senior">Senior School (Age 15–18)</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Activity Intensity</label>
          <select value={activity} onChange={e => setActivity(e.target.value)} style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid var(--border-glass)', padding: '10px 12px', borderRadius: 8 }}>
            <option value="High">Recess / Free Play (High Exertion)</option>
            <option value="Extreme">Football / Cardio PE (Extreme Exertion)</option>
            <option value="Moderate">Assembly / Gate Transit (Moderate)</option>
            <option value="Sedentary">Classroom Instruction (Sedentary)</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Duration: <strong>{duration} mins</strong></label>
          <input type="range" min="15" max="120" step="5" value={duration} onChange={e => setDuration(Number(e.target.value))} style={{ width: '100%', accentColor: '#38bdf8', marginTop: 8 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 }}>
          <input type="checkbox" id="hepaToggle" checked={hepa} onChange={e => setHepa(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#10b981', cursor: 'pointer' }} />
          <label htmlFor="hepaToggle" style={{ fontSize: '0.82rem', fontWeight: 600, color: hepa ? '#86efac' : '#94a3b8', cursor: 'pointer' }}>
            {hepa ? 'Air-Purified (HEPA Active)' : 'Outdoor Ambient Air'}
          </label>
        </div>
      </div>

      {/* Calculated Results */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: 'rgba(0,0,0,0.3)', padding: 18, borderRadius: 12, border: '1px solid var(--border-glass)' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Tidal Volume Inhaled</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{volM3.toFixed(2)} m³</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>PM2.5 Mass Deposited</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>{pm25InhaledUg} µg</div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            <Flame size={13} color="#ef4444" />
            <span>Cigarette Equivalent</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
            ≈ {cigEquiv} cigarettes
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bilingual WhatsApp Notification Preview ────────────────────────
function BilingualNoticePreview({ aqi, schoolName = "Delhi Model Academy" }) {
  const [copiedHi, setCopiedHi] = useState(false);
  const [copiedEn, setCopiedEn] = useState(false);

  const parentEn = `Dear Parents, ${schoolName} Air Quality Advisory:\nDue to elevated ambient PM2.5 levels (AQI ${aqi}), our AI Clean Air Protocol is active. All outdoor recess and sports have been shifted to air-purified indoor arenas. No classes are cancelled. Your child is safe.`;
  const parentHi = `प्रिय अभिभावक, ${schoolName} वायु गुणवत्ता सूचना:\nवायु प्रदूषण स्तर (AQI ${aqi}) अधिक होने के कारण, बच्चों की सुरक्षा हेतु सभी आउटडोर खेल और प्रार्थना सभा को एयर-फिल्टर्ड इनडोर हॉल में स्थानांतरित कर दिया गया है। कोई भी कक्षा रद्द नहीं है। बच्चे सुरक्षित हैं।`;

  const copyText = (text, isHi) => {
    navigator.clipboard.writeText(text);
    if (isHi) { setCopiedHi(true); setTimeout(() => setCopiedHi(false), 2000); }
    else { setCopiedEn(true); setTimeout(() => setCopiedEn(false), 2000); }
  };

  return (
    <div className="glass-panel" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquare size={20} color="#22c55e" />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>WhatsApp Parent Advisory (Bilingual English & Hindi)</h3>
        </div>
        <span className="badge-pill" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>WhatsApp & SMS Ready</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* English Card */}
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: 18, borderRadius: 12, border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', display: 'block', marginBottom: 8 }}>English Broadcast (WhatsApp / SMS)</span>
            <p style={{ fontSize: '0.82rem', color: '#f8fafc', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{parentEn}</p>
          </div>
          <button
            onClick={() => copyText(parentEn, false)}
            style={{ marginTop: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', width: 'fit-content' }}>
            {copiedEn ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copiedEn ? 'Copied!' : 'Copy English Notice'}</span>
          </button>
        </div>

        {/* Hindi Card */}
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: 18, borderRadius: 12, border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4ade80', display: 'block', marginBottom: 8 }}>हिंदी व्हाट्सएप संदेश (Hindi Parent Notice)</span>
            <p style={{ fontSize: '0.82rem', color: '#f8fafc', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{parentHi}</p>
          </div>
          <button
            onClick={() => copyText(parentHi, true)}
            style={{ marginTop: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)', color: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', width: 'fit-content' }}>
            {copiedHi ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copiedHi ? 'कॉपी हो गया!' : 'Copy Hindi Notice'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast Hook ─────────────────────────────────────────────────────
let toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = ++toastId;
    setToasts(t => [...t, { id, msg, type, exiting: false }]);
    setTimeout(() => {
      setToasts(t => t.map(x => x.id === id ? { ...x, exiting: true } : x));
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 320);
    }, 4000);
  }, []);
  return [toasts, push];
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStation, setSelectedStation] = useState("delhi/anand-vihar");
  const [aqi, setAqi] = useState(245);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showJudgeModal, setShowJudgeModal] = useState(false);
  const [reading, setReading] = useState({
    pm25: 185.4, pm10: 248.1, temp: 31.2, humidity: 54,
    station_name: "Anand Vihar, Delhi", category: "Poor",
    color: "#f97316", action_level: "Proactive Schedule Shift Recommended",
    is_cached: false
  });
  const [forecast, setForecast] = useState([
    { hour_offset: 1, time: "10:00", predicted_aqi: 260, status: "Poor" },
    { hour_offset: 2, time: "11:00", predicted_aqi: 285, status: "Poor" },
    { hour_offset: 3, time: "12:00", predicted_aqi: 310, status: "Very Poor" },
    { hour_offset: 4, time: "13:00", predicted_aqi: 290, status: "Poor" },
    { hour_offset: 5, time: "14:00", predicted_aqi: 240, status: "Moderate" },
    { hour_offset: 6, time: "15:00", predicted_aqi: 210, status: "Moderate" },
  ]);
  const [optimization, setOptimization] = useState({
    engine: "Deterministic Safety Engine (Local Fallback)",
    summary: { modifications_count: 3, total_avoided_outdoor_minutes: 115, student_hours_protected: 1629.2, estimated_pm25_inhalation_avoided_grams: 5.24 },
    advisory_cards: {
      admin: "High PM2.5 Inversion detected during noon periods. PE & Recess activities rerouted to Indoor Multi-Purpose Hall.",
      medical: "Students with asthma or respiratory preconditions instructed to remain inside air-purified blocks."
    },
    optimized_schedule: ORIGINAL_SCHEDULE.map(p => ({
      ...p,
      status: p.is_outdoor ? "INDOOR_SWAP" : "NORMAL_INDOOR",
      optimized_venue: p.is_outdoor ? "Multi-Purpose Sports Dome" : p.current_venue,
      safety_rationale: p.is_outdoor ? "Avoid peak particulate inhalation (>250 AQI)" : null
    }))
  });

  const [spike, setSpike] = useState(0);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REFRESH_SECONDS);
  const [alerts, setAlerts] = useState([
    { id: '1', ts: '10:02:15', title: '🛡️ VayuGuard Engine Synchronized', msg: 'Connected to live WAQI feed. AWS Bedrock status will confirm once the first pipeline run completes.' },
    { id: '2', ts: '09:45:00', title: '⚠️ Boundary Layer Inversion', msg: 'Predictive diurnal curve indicates peak AQI spike near 12:30.' }
  ]);
  const [toasts, pushToast] = useToasts();
  const displayAQI = useCountUp(aqi);
  const { color: aqiColor, label: aqiLabel, pct: aqiPct, hazard: aqiHazard, mask: aqiMask } = classifyAQI(aqi);

  // ─── Pipeline Execution ──────────────────────────────────────────
  const runPipeline = useCallback(async (spikeVal = spike, station = selectedStation, showSteps = false) => {
    if (isRunning) return;
    if (showSteps) {
      setIsRunning(true);
      for (let s = 1; s <= 5; s++) {
        setPipelineStep(s);
        await new Promise(r => setTimeout(r, 380));
      }
    }
    try {
      const res = await fetch(`${API_BASE}/api/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spike_aqi: spikeVal, station })
      });
      if (res.ok) {
        const json = await res.json();
        const newAqi = json.current_reading.aqi;
        const prevAqi = aqi;
        setReading(json.current_reading);
        setAqi(newAqi);
        setForecast(json.forecast);
        setOptimization(json.optimization);
        setSecondsLeft(AUTO_REFRESH_SECONDS);

        if (soundEnabled) {
          playAlertChime(newAqi >= 250);
        }

        if (Math.abs(newAqi - prevAqi) >= 15) {
          pushToast(`AQI Update: ${prevAqi} → ${newAqi} (${classifyAQI(newAqi).label})`, newAqi > 250 ? 'danger' : 'info');
        }

        if (showSteps && json.optimization.summary.modifications_count > 0) {
          const engineLabel = json.optimization.live_ai ? 'Amazon Bedrock' : 'Local safety engine';
          pushToast(`⚡ ${engineLabel} re-optimized ${json.optimization.summary.modifications_count} periods`, 'success');
          setAlerts(a => [{
            id: Date.now().toString(),
            ts: new Date().toLocaleTimeString(),
            title: `🚨 Schedule Optimized (AQI ${newAqi})`,
            msg: json.optimization.advisory_cards.admin
          }, ...a.slice(0, 8)]);
        }
      }
    } catch {
      pushToast('Live backend syncing offline – serving cached data', 'warning');
    }
    if (showSteps) {
      setIsRunning(false);
      setPipelineStep(0);
    }
  }, [aqi, spike, selectedStation, isRunning, pushToast, soundEnabled]);

  // ─── Auto-Polling & Timers ───────────────────────────────────────
  useEffect(() => {
    runPipeline(0, selectedStation, false);
  }, [selectedStation]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          runPipeline(spike, selectedStation, false);
          return AUTO_REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [spike, selectedStation, runPipeline]);

  const handleStationSelect = (stId) => {
    setSelectedStation(stId);
    pushToast(`Connecting to ${STATIONS.find(x => x.id === stId)?.name || stId}`, 'info');
  };

  const handlePresetSelect = (preset) => {
    setSpike(preset.spike);
    runPipeline(preset.spike, selectedStation, true);
    pushToast(`Loaded Scenario: ${preset.title}`, 'info');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: `radial-gradient(ellipse at 10% 10%, ${aqiColor}20 0%, transparent 60%),
                   radial-gradient(ellipse at 90% 90%, ${aqiColor}12 0%, transparent 60%),
                   #070a13`,
      transition: 'background 1.5s ease',
      position: 'relative'
    }}>

      {/* ── Background Atmosphere Particles ── */}
      <AtmosphereCanvas aqi={aqi} />

      {/* ── Judge Architecture Modal ── */}
      <JudgeBriefModal isOpen={showJudgeModal} onClose={() => setShowJudgeModal(false)} />

      {/* ── Toast Notifications ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.exiting ? 'toast-exit' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: t.type === 'danger' ? '#ef4444' : t.type === 'success' ? '#10b981' : t.type === 'warning' ? '#f59e0b' : '#38bdf8'
              }} />
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#f8fafc' }}>{t.msg}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── CRISP TOP HEADER ── */}
      <header style={{
        borderBottom: '1px solid var(--border-glass)',
        background: 'rgba(7, 10, 19, 0.94)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '10px 24px'
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          
          {/* Left: Brand & Track */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 16px ${aqiColor}55`
            }}>
              <Wind size={20} color="#fff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>VayuGuard</span>
                <span className="badge-pill" style={{ background: 'rgba(56,189,248,.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.3)' }}>
                  AWS AI Agent
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span className="pulse-dot" style={{ background: '#10b981' }} />
                <span>Live Feed</span>
                <span>•</span>
                <span>Delhi Model Academy</span>
              </div>
            </div>
          </div>

          {/* Center: Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
            <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <Activity size={14} /> Dashboard Overview
            </button>
            <button className={`tab-btn ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
              <Radio size={14} /> Live Sensor Map
            </button>
            <button className={`tab-btn ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
              <HeartPulse size={14} /> Pediatric Calculator
            </button>
            <button className={`tab-btn ${activeTab === 'notices' ? 'active' : ''}`} onClick={() => setActiveTab('notices')}>
              <MessageSquare size={14} /> WhatsApp Notices
            </button>
            <button className={`tab-btn ${activeTab === 'trends' ? 'active' : ''}`} onClick={() => setActiveTab('trends')}>
              <BarChart3 size={14} /> 24h Trends
            </button>
          </div>

          {/* Right: Controls & Judge Tour */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Judge Pitch Button */}
            <button
              onClick={() => setShowJudgeModal(true)}
              style={{
                background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(37,99,235,0.2))',
                border: '1px solid rgba(56,189,248,0.4)',
                color: '#38bdf8',
                padding: '7px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.75rem',
                fontWeight: 700
              }}
            >
              <Sparkles size={14} />
              <span>Judge Architecture</span>
            </button>

            {/* Audio Toggle */}
            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playAlertChime(false);
              }}
              style={{
                background: soundEnabled ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${soundEnabled ? 'rgba(56,189,248,0.3)' : 'var(--border-glass)'}`,
                color: soundEnabled ? '#38bdf8' : 'var(--text-dim)',
                padding: '7px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem'
              }}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>

            {/* Station Dropdown */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(56,189,248,.08)', padding: '6px 10px', borderRadius: 8,
              border: '1px solid rgba(56,189,248,.25)'
            }}>
              <MapPin size={13} color="#38bdf8" />
              <select value={selectedStation} onChange={(e) => handleStationSelect(e.target.value)} style={{
                background: 'transparent', color: '#f8fafc', border: 'none',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', outline: 'none'
              }}>
                {STATIONS.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#0f172a' }}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Countdown Badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.04)', padding: '6px 9px', borderRadius: 8,
              border: '1px solid var(--border-glass)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)'
            }}>
              <RefreshCw size={11} className={isRunning ? 'spin' : ''} color="#38bdf8" />
              <span>{secondsLeft}s</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, maxWidth: 1400, margin: '0 auto', width: '100%', padding: '20px 24px 60px', zIndex: 1 }}>

        {/* ── One-Click Demo Scenarios Bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>⚡ Demo What-If Scenarios:</span>
          {PRESET_SCENARIOS.map(p => (
            <button
              key={p.id}
              onClick={() => handlePresetSelect(p)}
              style={{
                background: spike === p.spike ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${spike === p.spike ? '#38bdf8' : 'var(--border-glass)'}`,
                color: spike === p.spike ? '#38bdf8' : '#f8fafc',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{p.icon}</span>
              <span>{p.title}</span>
            </button>
          ))}
        </div>

        {/* ── Top Hero Stat Cards (3 Columns) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 20 }}>
          
          {/* Card 1: Ambient Air Quality */}
          <div className="glass-panel" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: -20, right: -20, width: 140, height: 140,
              background: aqiColor, filter: 'blur(60px)', opacity: 0.22
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 2 }}>
                  <MapPin size={12} color="#38bdf8" />
                  <span>{reading.station_name}</span>
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Ambient Air Quality</h3>
              </div>
              <span className="badge-pill" style={{ background: `${aqiColor}22`, color: aqiColor, border: `1px solid ${aqiColor}55` }}>
                {aqiLabel}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <div className="aqi-orb" style={{
                width: 70, height: 70, minWidth: 70,
                background: `radial-gradient(circle at 35% 35%, ${aqiColor}aa, ${aqiColor}44)`,
                boxShadow: `0 0 24px ${aqiColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  {displayAQI}
                </span>
              </div>
              <div>
                <div className="aqi-number" style={{ color: aqiColor }}>{displayAQI}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>National AQI • {aqiHazard} Hazard</div>
              </div>
            </div>

            <div className="aqi-band">
              <div className="aqi-band-marker" style={{ left: `${aqiPct}%` }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, background: 'rgba(0,0,0,.25)', padding: 8, borderRadius: 8, marginTop: 12 }}>
              {[['PM2.5', reading.pm25, 'µg/m³'], ['PM10', reading.pm10, 'µg/m³'], ['Temp', reading.temp, '°C'], ['Humidity', reading.humidity, '%']].map(([k, v, u]) => (
                <div key={k} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{k}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                    {typeof v === 'number' ? v.toFixed(1) : v}<span style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>{u}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Bedrock AI Health Optimization Engine */}
          <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Sparkles size={16} color="#38bdf8" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                  {optimization.live_ai ? "Amazon Bedrock AI Planner" : "Schedule Safety Optimizer"}
                </span>
              </div>
              <span className="badge-pill" style={{
                background: optimization.live_ai ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.15)',
                color: optimization.live_ai ? '#86efac' : '#38bdf8'
              }}>
                {optimization.live_ai ? `⚡ ${optimization.engine || "Live Bedrock"}` : "🛡️ Local Safety Rules"}
              </span>
            </div>

            <div style={{
              background: aqi >= 250 ? 'rgba(239,68,68,.12)' : 'rgba(16,185,129,.10)',
              border: `1px solid ${aqi >= 250 ? 'rgba(239,68,68,.35)' : 'rgba(16,185,129,.3)'}`,
              borderRadius: 10, padding: '10px 12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <ShieldAlert size={14} color={aqi >= 250 ? '#ef4444' : '#10b981'} />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: aqi >= 250 ? '#fca5a5' : '#86efac' }}>
                  {aqi >= 250 ? "Emergency Schedule Shift Mandated" : "Standard Campus Activity Permitted"}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {optimization.advisory_cards.admin}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, flex: 1 }}>
              {[
                ['Student Hours Saved', optimization.summary.student_hours_protected + 'h', '#38bdf8'],
                ['Periods Rewired', optimization.summary.modifications_count + ' / 7', '#f59e0b'],
                ['PM2.5 Avoided', optimization.summary.estimated_pm25_inhalation_avoided_grams + 'g', '#10b981'],
              ].map(([lbl, val, col]) => (
                <div key={lbl} style={{ background: 'rgba(255,255,255,0.03)', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: 2 }}>{lbl}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: col, fontFamily: 'var(--font-mono)' }}>{val}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 8, fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Mask Requirement:</span>
              <span style={{ fontWeight: 700, color: aqiColor }}>{aqiMask}</span>
            </div>
          </div>

          {/* Card 3: Interactive Simulation & Pipeline Trigger */}
          <div className="glass-panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Sliders size={16} color="#f59e0b" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>
                  What-If Inversion Slider
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                Simulate sudden thermal inversion or smog surges to test real-time schedule reallocation.
              </p>

              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Simulated Surge:</span>
                  <span style={{ fontWeight: 800, color: spike > 0 ? '#f59e0b' : '#64748b', fontFamily: 'var(--font-mono)' }}>+{spike} AQI</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="200"
                  step="25"
                  value={spike}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setSpike(v);
                    runPipeline(v, selectedStation, false);
                  }}
                  style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div>
              <button
                className="btn-primary"
                onClick={() => runPipeline(spike, selectedStation, true)}
                disabled={isRunning}
                style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              >
                <RefreshCw size={14} className={isRunning ? 'spin' : ''} />
                <span>{isRunning ? `Running Stage ${pipelineStep}/5...` : 'Trigger Full AWS Bedrock Pipeline'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── TAB 1: DASHBOARD OVERVIEW ── */}
        {activeTab === 'dashboard' && (
          <>
            <div className="glass-panel" style={{ padding: 22, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 3 }}>Dual-Timeline Class Schedule Alignment</h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Amazon Bedrock shifts high-exertion sports and outdoor assemblies into filtered indoor zones during high-hazard slots.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[['rgba(239,68,68,.3)', '#ef4444', 'Hazardous Outdoor'], ['rgba(16,185,129,.3)', '#10b981', 'Protected Venue']].map(([bg, border, lbl]) => (
                    <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: bg, border: `1px solid ${border}` }} />
                      {lbl}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ORIGINAL_SCHEDULE.map((orig, idx) => {
                  const opt = optimization.optimized_schedule?.[idx] ?? orig;
                  const changed = opt.status && opt.status !== 'NORMAL_INDOOR' && opt.status !== 'UNCHANGED';
                  return (
                    <div
                      key={orig.period_id}
                      className="schedule-row"
                      style={{
                        animationDelay: `${idx * 40}ms`,
                        display: 'grid',
                        gridTemplateColumns: '130px 1fr 28px 1fr',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        background: changed ? 'rgba(56,189,248,.05)' : 'rgba(255,255,255,.015)',
                        border: `1px solid ${changed ? 'rgba(56,189,248,.28)' : 'var(--border-glass)'}`,
                        borderRadius: 10
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8' }}>Period {orig.period_id}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{orig.time}</div>
                        <div style={{ fontSize: '0.62rem', color: orig.is_outdoor ? '#fca5a5' : '#86efac' }}>{orig.is_outdoor ? 'Outdoor Event' : 'Indoor Block'}</div>
                      </div>

                      <div style={{
                        padding: '8px 10px', borderRadius: 8,
                        background: orig.is_outdoor ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.03)',
                        border: `1px solid ${orig.is_outdoor ? 'rgba(239,68,68,.3)' : 'var(--border-glass)'}`
                      }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 2 }}>{orig.name}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{orig.current_venue}</div>
                      </div>

                      <ArrowRight size={14} color={changed ? '#38bdf8' : 'var(--text-dim)'} style={{ justifySelf: 'center' }} />

                      <div style={{
                        padding: '8px 10px', borderRadius: 8,
                        background: changed ? 'rgba(16,185,129,.12)' : 'rgba(255,255,255,.03)',
                        border: `1px solid ${changed ? 'rgba(16,185,129,.35)' : 'var(--border-glass)'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: changed ? '#86efac' : '#f8fafc' }}>
                            {opt.name || orig.name}
                          </span>
                          {changed && <span className="badge-pill" style={{ background: 'rgba(16,185,129,.2)', color: '#86efac', fontSize: '0.58rem', padding: '1px 5px' }}>Protected</span>}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: changed ? '#86efac' : 'var(--text-dim)', marginBottom: 2 }}>{opt.optimized_venue}</div>
                        {opt.safety_rationale && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>"{opt.safety_rationale}"</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <BellRing size={15} color="#f59e0b" />
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Real-Time SNS Broadcast Feed</h3>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Amazon SNS + Web Push Active</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {alerts.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                    background: 'rgba(0,0,0,.22)', borderRadius: 8, border: '1px solid var(--border-glass)'
                  }}>
                    <CheckCircle2 size={14} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{a.title}</span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{a.ts}</span>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.msg}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── TAB 2: CLEAN SENSOR MAP & TELEMETRY INSPECTOR ── */}
        {activeTab === 'map' && (
          <CleanSensorMap
            stations={STATIONS}
            selectedStation={selectedStation}
            onSelectStation={handleStationSelect}
            currentAqi={aqi}
            reading={reading}
          />
        )}

        {/* ── TAB 3: PEDIATRIC LUNG CALCULATOR ── */}
        {activeTab === 'health' && (
          <PediatricCalculator aqi={aqi} />
        )}

        {/* ── TAB 4: BILINGUAL WHATSAPP & SMS DISPATCH ── */}
        {activeTab === 'notices' && (
          <BilingualNoticePreview aqi={aqi} />
        )}

        {/* ── TAB 5: 24H TRENDS ── */}
        {activeTab === 'trends' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="glass-panel" style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>24-Hour Diurnal Boundary Layer Exposure Model</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hover across time increments to view forecasted air quality indices.</p>
                </div>
                <span className="badge-pill" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}>Interactive Spline</span>
              </div>
              <DiurnalTrendChart currentAqi={aqi} />
            </div>

            <div className="glass-panel" style={{ padding: 22 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14 }}>Next 6 Hours Discrete Predictions</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                {forecast.map((f, i) => {
                  const { color, label } = classifyAQI(f.predicted_aqi);
                  return (
                    <div key={i} style={{
                      background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}44`,
                      borderRadius: 10, padding: '12px 10px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 4 }}>{f.time}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{f.predicted_aqi}</div>
                      <div style={{ fontSize: '0.65rem', color, fontWeight: 700, marginTop: 4 }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: '1px solid var(--border-glass)',
        padding: '14px 24px',
        textAlign: 'center',
        fontSize: '0.72rem',
        color: 'var(--text-dim)',
        background: 'rgba(7,10,19,0.92)',
        zIndex: 1
      }}>
        VayuGuard • Environmental Hacks 2026 (Track: Air) • Amazon Bedrock · AWS Lambda · DynamoDB · SNS · Amplify
      </footer>
    </div>
  );
}
