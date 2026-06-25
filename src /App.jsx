import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sun,
  Footprints,
  Briefcase,
  Video,
  BookOpen,
  Flame,
  Trophy,
  Settings as SettingsIcon,
  X,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  Sparkles,
  Check,
  Mic,
  Droplet,
} from "lucide-react";
import * as Tone from "tone";

/* ---------------------------------------------------------------
   CONSTANTS & PURE HELPERS
--------------------------------------------------------------- */

const STORAGE_KEY = "grindops-data-v1";
const LEVEL_STEP = 150;
const LEVEL_TITLES = [
  "Cold Caller",
  "Dialer",
  "Setter",
  "Closer",
  "Rainmaker",
  "Ops Chief",
  "Founder Mode",
  "Legend Status",
];
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

const TASK_DEFS = [
  { key: "wake", label: "Wake up at 8:00 AM", sub: "Discipline", icon: Sun, color: "amber" },
  {
    key: "run",
    label: "Go for a run",
    sub: "Fitness",
    icon: Footprints,
    color: "teal",
    metricField: "runKm",
    metricBonusSuffix: "run",
    metricStep: "0.1",
    metricInputMode: "decimal",
    metricPlaceholder: "Distance (km)",
    metricHint: "km logged in your run app",
    tierKey: "runTiers",
    thresholdField: "km",
    extraKey: "extraPerKm",
    extraUnitLabel: "km",
    calcBonus: (val, settings) => calcRunBonus(val, settings),
  },
  {
    key: "jobs",
    label: "Apply to jobs",
    sub: "Opportunity",
    icon: Briefcase,
    color: "violet",
    metricField: "jobsCount",
    metricBonusSuffix: "apps",
    metricStep: "1",
    metricInputMode: "numeric",
    metricPlaceholder: "Applications sent",
    metricHint: "how many you applied to today",
    tierKey: "jobTiers",
    thresholdField: "count",
    extraKey: "extraPerApp",
    extraUnitLabel: "app",
    calcBonus: (val, settings) => calcJobsBonus(val, settings),
  },
  {
    key: "video",
    label: "Work on a video",
    sub: "Creative",
    icon: Video,
    color: "rose",
    tierSelect: true,
    tierKey: "videoTiers",
  },
  { key: "journal", label: "Journal", sub: "Reflection", icon: BookOpen, color: "sky" },
];

const BONUS_DEFS = [
  { key: "interview", label: "Got or completed an interview", icon: Mic, color: "violet" },
  { key: "bath", label: "Took a bath", icon: Droplet, color: "teal" },
];

const COLOR_MAP = {
  amber: {
    text: "text-amber-400",
    bg: "bg-amber-400",
    bgSoft: "bg-amber-400/10",
    border: "border-amber-400/40",
    borderSolid: "border-amber-400",
    ring: "ring-amber-400/40",
    shadow: "shadow-[0_0_24px_rgba(251,191,36,0.35)]",
    focusBorder: "focus:border-amber-400",
  },
  teal: {
    text: "text-teal-400",
    bg: "bg-teal-400",
    bgSoft: "bg-teal-400/10",
    border: "border-teal-400/40",
    borderSolid: "border-teal-400",
    ring: "ring-teal-400/40",
    shadow: "shadow-[0_0_24px_rgba(45,212,191,0.35)]",
    focusBorder: "focus:border-teal-400",
  },
  violet: {
    text: "text-violet-400",
    bg: "bg-violet-400",
    bgSoft: "bg-violet-400/10",
    border: "border-violet-400/40",
    borderSolid: "border-violet-400",
    ring: "ring-violet-400/40",
    shadow: "shadow-[0_0_24px_rgba(167,139,250,0.35)]",
    focusBorder: "focus:border-violet-400",
  },
  rose: {
    text: "text-rose-400",
    bg: "bg-rose-400",
    bgSoft: "bg-rose-400/10",
    border: "border-rose-400/40",
    borderSolid: "border-rose-400",
    ring: "ring-rose-400/40",
    shadow: "shadow-[0_0_24px_rgba(251,113,133,0.35)]",
    focusBorder: "focus:border-rose-400",
  },
  sky: {
    text: "text-sky-400",
    bg: "bg-sky-400",
    bgSoft: "bg-sky-400/10",
    border: "border-sky-400/40",
    borderSolid: "border-sky-400",
    ring: "ring-sky-400/40",
    shadow: "shadow-[0_0_24px_rgba(56,189,248,0.35)]",
    focusBorder: "focus:border-sky-400",
  },
};

const DEFAULT_SETTINGS = {
  taskPoints: { wake: 10, run: 10, jobs: 15, journal: 10 },
  perfectDayBonus: 20,
  runTiers: [
    { id: "t1", km: 0.4, points: 5, label: "400m" },
    { id: "t2", km: 1, points: 15, label: "1km" },
  ],
  extraPerKm: 10,
  jobTiers: [
    { id: "j1", count: 5, points: 10, label: "5 apps" },
    { id: "j2", count: 10, points: 25, label: "10 apps" },
  ],
  extraPerApp: 2,
  videoTiers: [
    { id: "v1", points: 10, label: "Working on it" },
    { id: "v2", points: 30, label: "Completed" },
  ],
  bonusPoints: { interview: 10, bath: 10 },
  soundOn: true,
};

const DEFAULT_REWARDS = [
  { id: "r1", points: 150, text: "New running playlist / small gear upgrade", claimed: false },
  { id: "r2", points: 400, text: "Order from your favourite restaurant", claimed: false },
  { id: "r3", points: 800, text: "A full guilt-free day off", claimed: false },
];

function fmtDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function blankDay() {
  return {
    wake: false,
    run: false,
    runKm: 0,
    jobs: false,
    jobsCount: 0,
    video: false,
    videoStage: null,
    journal: false,
    bonusFlags: { interview: false, bath: false },
    pointsEarned: 0,
    perfectDay: false,
  };
}

function calcRunBonus(km, settings) {
  if (!km || km <= 0) return { points: 0, tierLabel: null };
  const tiers = [...settings.runTiers].sort((a, b) => a.km - b.km);
  let points = 0;
  let tierLabel = null;
  for (const t of tiers) {
    if (km >= t.km) {
      points = t.points;
      tierLabel = t.label;
    }
  }
  const top = tiers[tiers.length - 1];
  if (top && km > top.km) {
    const extraKm = km - top.km;
    points += Math.floor(extraKm * settings.extraPerKm);
    tierLabel = `${km.toFixed(2)}km`;
  }
  return { points, tierLabel };
}

function calcJobsBonus(count, settings) {
  if (!count || count <= 0) return { points: 0, tierLabel: null };
  const tiers = [...settings.jobTiers].sort((a, b) => a.count - b.count);
  let points = 0;
  let tierLabel = null;
  for (const t of tiers) {
    if (count >= t.count) {
      points = t.points;
      tierLabel = t.label;
    }
  }
  const top = tiers[tiers.length - 1];
  if (top && count > top.count) {
    const extra = count - top.count;
    points += Math.floor(extra * settings.extraPerApp);
    tierLabel = `${count} apps`;
  }
  return { points, tierLabel };
}

function recalcDay(day, settings) {
  let pts = 0;
  if (day.wake) pts += settings.taskPoints.wake;
  if (day.run) pts += settings.taskPoints.run;
  if (day.run && day.runKm > 0) pts += calcRunBonus(day.runKm, settings).points;
  if (day.jobs) pts += settings.taskPoints.jobs;
  if (day.jobs && day.jobsCount > 0) pts += calcJobsBonus(day.jobsCount, settings).points;
  if (day.video && day.videoStage) {
    const tier = settings.videoTiers.find((t) => t.id === day.videoStage);
    if (tier) pts += tier.points;
  }
  if (day.journal) pts += settings.taskPoints.journal;
  if (day.bonusFlags?.interview) pts += settings.bonusPoints.interview;
  if (day.bonusFlags?.bath) pts += settings.bonusPoints.bath;
  const allDone = day.wake && day.run && day.jobs && day.video && day.journal;
  if (allDone) pts += settings.perfectDayBonus;
  return { ...day, pointsEarned: pts, perfectDay: allDone };
}

function computeTotal(days) {
  return Object.values(days).reduce((s, d) => s + (d.pointsEarned || 0), 0);
}

function computeCurrentStreak(days) {
  let streak = 0;
  let d = new Date();
  // if today isn't perfect yet, streak reflects the run ending yesterday
  if (!(days[fmtDateKey(d)] && days[fmtDateKey(d)].perfectDay)) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const key = fmtDateKey(d);
    const rec = days[key];
    if (rec && rec.perfectDay) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function computeLongestStreak(days) {
  const dates = Object.keys(days)
    .filter((k) => days[k].perfectDay)
    .sort();
  let longest = 0,
    current = 0,
    prev = null;
  for (const k of dates) {
    const d = new Date(k + "T00:00:00");
    if (prev) {
      const diff = Math.round((d - prev) / 86400000);
      current = diff === 1 ? current + 1 : 1;
    } else current = 1;
    longest = Math.max(longest, current);
    prev = d;
  }
  return longest;
}

function levelInfo(total) {
  const level = Math.floor(total / LEVEL_STEP) + 1;
  const into = total % LEVEL_STEP;
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
  return { level, into, pct: Math.min(100, (into / LEVEL_STEP) * 100), title, remaining: LEVEL_STEP - into };
}

function last7Dates() {
  const out = [];
  const d = new Date();
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i);
    out.push(dd);
  }
  return out;
}

/* ---------------------------------------------------------------
   SOUND HOOK
--------------------------------------------------------------- */

function useSound(enabled) {
  const synthRef = useRef(null);
  const startedRef = useRef(false);

  const ensure = useCallback(async () => {
    try {
      if (!startedRef.current) {
        await Tone.start();
        startedRef.current = true;
      }
      if (!synthRef.current) {
        synthRef.current = new Tone.Synth({ oscillator: { type: "triangle" }, volume: -8 }).toDestination();
      }
    } catch (e) {
      /* audio unavailable, fail silently */
    }
  }, []);

  const blip = useCallback(
    async (note = "C5", dur = "16n", delay = 0) => {
      if (!enabled) return;
      await ensure();
      if (!synthRef.current) return;
      try {
        synthRef.current.triggerAttackRelease(note, dur, Tone.now() + delay);
      } catch (e) {}
    },
    [enabled, ensure]
  );

  const success = useCallback(() => {
    blip("C5", "16n", 0);
    blip("E5", "16n", 0.09);
    blip("G5", "8n", 0.18);
  }, [blip]);

  const fanfare = useCallback(() => {
    blip("C5", "16n", 0);
    blip("E5", "16n", 0.1);
    blip("G5", "16n", 0.2);
    blip("C6", "4n", 0.3);
  }, [blip]);

  const tick = useCallback(() => blip("A4", "32n", 0), [blip]);
  const undo = useCallback(() => blip("A3", "16n", 0), [blip]);

  return { tick, success, fanfare, undo };
}

/* ---------------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------------- */

function Ticker({ value }) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const duration = 550;
    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value]);

  const padded = String(Math.max(0, display)).padStart(5, "0");
  return (
    <div className="inline-flex items-baseline gap-2 rounded-lg border border-neutral-700 bg-black/60 px-3 py-1.5 shadow-[0_0_30px_rgba(45,212,191,0.12)]">
      <span className="font-mono text-2xl tracking-wider text-neutral-100 sm:text-3xl">{padded}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">pts</span>
    </div>
  );
}

function ConfettiBurst({ active }) {
  const pieces = useRef(
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.25,
      duration: 1.1 + Math.random() * 0.7,
      rotate: Math.random() * 360,
      color: ["#fbbf24", "#2dd4bf", "#a78bfa", "#fb7185"][i % 4],
      size: 6 + Math.random() * 6,
      drift: (Math.random() - 0.5) * 120,
    }))
  ).current;

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-5%] rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.5,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            transform: `rotate(${p.rotate}deg)`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="toast-pop pointer-events-auto rounded-full border border-neutral-700 bg-neutral-900/95 px-4 py-2 text-sm font-medium text-neutral-100 shadow-2xl backdrop-blur">
        {toast}
      </div>
    </div>
  );
}

function LevelUpFlash({ data }) {
  if (!data) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-black/40">
      <div className="levelup-pop flex flex-col items-center gap-2 rounded-2xl border border-amber-400/50 bg-neutral-950/95 px-8 py-6 text-center shadow-[0_0_60px_rgba(251,191,36,0.35)]">
        <Sparkles className="h-8 w-8 text-amber-400" />
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-neutral-500">Level Up</div>
        <div className="font-display text-2xl font-bold text-neutral-50">Lv.{data.level}: {data.title}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TASK ROW
--------------------------------------------------------------- */

function TaskRow({ def, day, points, onToggle, onMetricChange, onTierSelect }) {
  const c = COLOR_MAP[def.color];
  const Icon = def.icon;
  const hasMetric = !!def.metricField;
  const metricValueRaw = hasMetric ? day[def.metricField] || 0 : 0;
  const [metricInput, setMetricInput] = useState(metricValueRaw > 0 ? String(metricValueRaw) : "");

  if (def.tierSelect) {
    const tiers = points.settings[def.tierKey] || [];
    const selectedTier = tiers.find((t) => t.id === day.videoStage);
    const done = !!day[def.key];
    return (
      <div className={`rounded-xl border ${done ? c.border : "border-neutral-800"} bg-neutral-900/60 p-4`}>
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
              done ? `${c.borderSolid} ${c.bgSoft} ${c.shadow}` : "border-neutral-700 bg-neutral-800/60"
            }`}
          >
            {done ? <Check className={`h-4 w-4 ${c.text}`} /> : <Icon className="h-4 w-4 text-neutral-500" />}
          </span>
          <span className="flex-1">
            <span className={`block text-sm font-medium ${done ? "text-neutral-100" : "text-neutral-300"}`}>
              {def.label}
            </span>
            <span className={`block text-[11px] uppercase tracking-wide ${c.text} opacity-80`}>{def.sub}</span>
          </span>
          {selectedTier && <span className={`font-mono text-xs ${c.text}`}>+{selectedTier.points}</span>}
        </div>
        <div className="flex gap-2">
          {tiers.map((t) => {
            const active = day.videoStage === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTierSelect(def.key, "videoStage", active ? null : t.id)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  active ? `${c.borderSolid} ${c.bgSoft} ${c.text}` : "border-neutral-700 text-neutral-400"
                }`}
              >
                {t.label}
                <span className="ml-1 font-mono opacity-70">+{t.points}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const done = !!day[def.key];
  const metricValue = metricValueRaw;
  const bonusInfo = hasMetric && done && metricValue > 0 ? def.calcBonus(metricValue, points.settings) : { points: 0, tierLabel: null };

  return (
    <div className={`rounded-xl border ${done ? c.border : "border-neutral-800"} bg-neutral-900/60 transition-colors`}>
      <button
        onClick={() => onToggle(def.key)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            done ? `${c.borderSolid} ${c.bgSoft} ${c.shadow}` : "border-neutral-700 bg-neutral-800/60"
          }`}
        >
          {done ? <Check className={`h-4 w-4 ${c.text}`} /> : <Icon className="h-4 w-4 text-neutral-500" />}
        </span>
        <span className="flex-1">
          <span className={`block text-sm font-medium ${done ? "text-neutral-100" : "text-neutral-300"}`}>
            {def.label}
          </span>
          <span className={`block text-[11px] uppercase tracking-wide ${c.text} opacity-80`}>{def.sub}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className={`font-mono text-xs ${done ? c.text : "text-neutral-600"}`}>
            +{points.settings.taskPoints[def.key]}
          </span>
          {hasMetric && bonusInfo.points > 0 && (
            <span className={`font-mono text-[10px] ${c.text}`}>
              +{bonusInfo.points} {def.metricBonusSuffix}
            </span>
          )}
        </span>
      </button>

      {hasMetric && done && (
        <div className="border-t border-neutral-800/80 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              type="number"
              min="0"
              step={def.metricStep}
              inputMode={def.metricInputMode}
              value={metricInput}
              onChange={(e) => setMetricInput(e.target.value)}
              onBlur={() => onMetricChange(def.metricField, parseFloat(metricInput) || 0)}
              placeholder={def.metricPlaceholder}
              className={`w-32 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none ${c.focusBorder}`}
            />
            <span className="text-xs text-neutral-500">{def.metricHint}</span>
          </div>
          <TierLadder
            value={metricValue}
            tiers={points.settings[def.tierKey]}
            thresholdField={def.thresholdField}
            extraPerUnit={points.settings[def.extraKey]}
            extraUnitLabel={def.extraUnitLabel}
            colorKey={def.color}
          />
        </div>
      )}
    </div>
  );
}

function TierLadder({ value, tiers, thresholdField, extraPerUnit, extraUnitLabel, colorKey }) {
  const c = COLOR_MAP[colorKey];
  const sorted = [...tiers].sort((a, b) => a[thresholdField] - b[thresholdField]);
  const topThreshold = sorted[sorted.length - 1]?.[thresholdField] || 1;
  const maxVal = Math.max(topThreshold, value, 1) * 1.3;
  const pct = Math.min(100, (value / maxVal) * 100);
  return (
    <div className="relative mt-1 h-2 w-full rounded-full bg-neutral-800">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${c.bg} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
      {sorted.map((t) => (
        <div
          key={t.id}
          className="absolute -top-1 h-4 w-0.5 bg-neutral-600"
          style={{ left: `${Math.min(100, (t[thresholdField] / maxVal) * 100)}%` }}
          title={`${t.label} \u2192 +${t.points}`}
        />
      ))}
      <div className="absolute -bottom-5 flex w-full justify-between text-[10px] text-neutral-500">
        {sorted.map((t) => (
          <span key={t.id} className="font-mono">
            {t.label}
          </span>
        ))}
        <span className={`font-mono ${c.text}`}>
          +{extraPerUnit}/{extraUnitLabel} after
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   WEEK STRIP
--------------------------------------------------------------- */

function WeekStrip({ days }) {
  const dates = last7Dates();
  const vals = dates.map((d) => days[fmtDateKey(d)]?.pointsEarned || 0);
  const max = Math.max(1, ...vals);
  const todayKey = fmtDateKey(new Date());
  return (
    <div className="flex items-end justify-between gap-2 px-1">
      {dates.map((d, i) => {
        const key = fmtDateKey(d);
        const rec = days[key];
        const h = Math.max(4, (vals[i] / max) * 56);
        const isToday = key === todayKey;
        return (
          <div key={key} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-16 items-end">
              <div
                className={`w-5 rounded-t-sm transition-all duration-500 ${
                  rec?.perfectDay ? "bg-amber-400" : isToday ? "bg-teal-500/70" : "bg-neutral-700"
                }`}
                style={{ height: `${h}px` }}
              />
            </div>
            <span className={`font-mono text-[10px] ${isToday ? "text-teal-300" : "text-neutral-500"}`}>
              {d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------
   CHECKPOINTS (REWARDS)
--------------------------------------------------------------- */

function Checkpoints({ rewards, total, onClaim, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPoints, setNewPoints] = useState(200);

  const sorted = [...rewards].sort((a, b) => a.points - b.points);

  return (
    <div className="space-y-2.5">
      {sorted.map((r) => {
        const pct = Math.min(100, (total / r.points) * 100);
        const reached = total >= r.points;
        return (
          <div
            key={r.id}
            className={`group rounded-xl border px-4 py-3 ${
              r.claimed
                ? "border-amber-400/30 bg-amber-400/5"
                : reached
                ? "border-amber-400/60 bg-neutral-900/70"
                : "border-neutral-800 bg-neutral-900/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Trophy className={`h-3.5 w-3.5 shrink-0 ${reached ? "text-amber-400" : "text-neutral-600"}`} />
                  <span className="truncate text-sm text-neutral-200">{r.text}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-800">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 font-mono text-[10px] text-neutral-500">
                  {Math.min(total, r.points)}/{r.points} pts
                </div>
              </div>
              {r.claimed ? (
                <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-300">
                  claimed
                </span>
              ) : reached ? (
                <button
                  onClick={() => onClaim(r.id)}
                  className="shrink-0 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-neutral-950 transition-transform active:scale-95"
                >
                  Claim
                </button>
              ) : (
                <button
                  onClick={() => onDelete(r.id)}
                  className="shrink-0 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {adding ? (
        <div className="rounded-xl border border-dashed border-neutral-700 p-3">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="What's the reward?"
            className="mb-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-amber-400"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="10"
              value={newPoints}
              onChange={(e) => setNewPoints(parseInt(e.target.value) || 0)}
              className="w-24 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-amber-400"
            />
            <span className="text-xs text-neutral-500">points to unlock</span>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={() => {
                  setAdding(false);
                  setNewText("");
                }}
                className="rounded-md px-2.5 py-1.5 text-xs text-neutral-400"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newText.trim()) return;
                  onAdd({ text: newText.trim(), points: newPoints || 100 });
                  setNewText("");
                  setAdding(false);
                }}
                className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-950"
              >
                Add checkpoint
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-700 py-2.5 text-xs text-neutral-400 transition-colors hover:border-amber-400/50 hover:text-amber-300"
        >
          <Plus className="h-3.5 w-3.5" /> Set your own checkpoint
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SETTINGS DRAWER
--------------------------------------------------------------- */

function SettingsDrawer({ settings, onChange, soundOn, onSoundToggle, open, onClose }) {
  const [local, setLocal] = useState(settings);

  useEffect(() => setLocal(settings), [settings, open]);

  if (!open) return null;

  const updateTaskPoint = (key, val) => {
    setLocal((l) => ({ ...l, taskPoints: { ...l.taskPoints, [key]: val } }));
  };
  const updateTierList = (listKey, id, field, val) => {
    setLocal((l) => ({
      ...l,
      [listKey]: l[listKey].map((t) => (t.id === id ? { ...t, [field]: val } : t)),
    }));
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-950 p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-neutral-100">Tune the system</h3>
          <button onClick={onClose} className="text-neutral-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
          <span className="text-sm text-neutral-300">Sound effects</span>
          <button onClick={onSoundToggle} className="text-neutral-300">
            {soundOn ? <Volume2 className="h-4 w-4 text-teal-400" /> : <VolumeX className="h-4 w-4 text-neutral-600" />}
          </button>
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Task points</p>
        <div className="mb-5 space-y-2">
          {TASK_DEFS.filter((def) => !def.tierSelect).map((def) => (
            <div key={def.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-300">{def.label}</span>
              <input
                type="number"
                value={local.taskPoints[def.key]}
                onChange={(e) => updateTaskPoint(def.key, parseInt(e.target.value) || 0)}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-sm text-neutral-100 outline-none focus:border-teal-400"
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-neutral-300">Perfect day bonus (all 5 done)</span>
            <input
              type="number"
              value={local.perfectDayBonus}
              onChange={(e) => setLocal((l) => ({ ...l, perfectDayBonus: parseInt(e.target.value) || 0 }))}
              className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-sm text-neutral-100 outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Run distance tiers</p>
        <div className="mb-5 space-y-2">
          {local.runTiers
            .slice()
            .sort((a, b) => a.km - b.km)
            .map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) => updateTierList("runTiers", t.id, "label", e.target.value)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-teal-400"
                />
                <input
                  type="number"
                  step="0.1"
                  value={t.km}
                  onChange={(e) => updateTierList("runTiers", t.id, "km", parseFloat(e.target.value) || 0)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
                />
                <span className="text-xs text-neutral-500">km {"\u2192"}</span>
                <input
                  type="number"
                  value={t.points}
                  onChange={(e) => updateTierList("runTiers", t.id, "points", parseInt(e.target.value) || 0)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
                />
                <span className="text-xs text-neutral-500">pts</span>
              </div>
            ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-neutral-400">Bonus per extra km beyond top tier</span>
            <input
              type="number"
              value={local.extraPerKm}
              onChange={(e) => setLocal((l) => ({ ...l, extraPerKm: parseInt(e.target.value) || 0 }))}
              className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
            />
          </div>
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Job application tiers</p>
        <div className="mb-2 space-y-2">
          {local.jobTiers
            .slice()
            .sort((a, b) => a.count - b.count)
            .map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) => updateTierList("jobTiers", t.id, "label", e.target.value)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-violet-400"
                />
                <input
                  type="number"
                  step="1"
                  value={t.count}
                  onChange={(e) => updateTierList("jobTiers", t.id, "count", parseInt(e.target.value) || 0)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
                />
                <span className="text-xs text-neutral-500">apps {"\u2192"}</span>
                <input
                  type="number"
                  value={t.points}
                  onChange={(e) => updateTierList("jobTiers", t.id, "points", parseInt(e.target.value) || 0)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
                />
                <span className="text-xs text-neutral-500">pts</span>
              </div>
            ))}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-neutral-400">Bonus per extra application beyond top tier</span>
            <input
              type="number"
              value={local.extraPerApp}
              onChange={(e) => setLocal((l) => ({ ...l, extraPerApp: parseInt(e.target.value) || 0 }))}
              className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
            />
          </div>
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Video tiers</p>
        <div className="mb-5 space-y-2">
          {local.videoTiers.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <input
                type="text"
                value={t.label}
                onChange={(e) => updateTierList("videoTiers", t.id, "label", e.target.value)}
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-rose-400"
              />
              <input
                type="number"
                value={t.points}
                onChange={(e) => updateTierList("videoTiers", t.id, "points", parseInt(e.target.value) || 0)}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-rose-400"
              />
              <span className="text-xs text-neutral-500">pts</span>
            </div>
          ))}
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Bonus moves</p>
        <div className="mb-5 space-y-2">
          {BONUS_DEFS.map((b) => (
            <div key={b.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-neutral-300">{b.label}</span>
              <input
                type="number"
                value={local.bonusPoints[b.key]}
                onChange={(e) =>
                  setLocal((l) => ({ ...l, bonusPoints: { ...l.bonusPoints, [b.key]: parseInt(e.target.value) || 0 } }))
                }
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-sm text-neutral-100 outline-none focus:border-violet-400"
              />
            </div>
          ))}
        </div>

        <p className="mb-5 text-[11px] text-neutral-500">
          Changes apply going forward only. Days you've already logged keep their original points.
        </p>

        <button
          onClick={() => {
            onChange(local);
            onClose();
          }}
          className="w-full rounded-xl bg-teal-400 py-2.5 text-sm font-semibold text-neutral-950 transition-transform active:scale-[0.98]"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------- */

export default function GrindOps() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [rewards, setRewards] = useState(DEFAULT_REWARDS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confettiTick, setConfettiTick] = useState(0);
  const [toast, setToast] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const shownMilestoneRef = useRef(null);
  const toastTimerRef = useRef(null);

  const sound = useSound(settings.soundOn);

  // load from the browser's local storage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setDays(parsed.days || {});
        setSettings({ ...DEFAULT_SETTINGS, ...(parsed.settings || {}) });
        setRewards(parsed.rewards || DEFAULT_REWARDS);
      }
    } catch (e) {
      // no saved data yet, or it was corrupted, so defaults already in state
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback((nextDays, nextSettings, nextRewards) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ days: nextDays, settings: nextSettings, rewards: nextRewards })
      );
    } catch (e) {
      /* storage unavailable or full, fail silently */
    }
  }, []);

  const fireToast = (msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  const fireConfetti = () => setConfettiTick((t) => t + 1);

  const todayKey = fmtDateKey(new Date());
  const today = days[todayKey] || blankDay();
  const total = computeTotal(days);
  const lvl = levelInfo(total);
  const currentStreak = computeCurrentStreak(days);
  const longestStreak = computeLongestStreak(days);

  const applyDayUpdate = (updatedToday) => {
    const recalced = recalcDay(updatedToday, settings);
    const prevDay = days[todayKey] || blankDay();
    const newDays = { ...days, [todayKey]: recalced };

    const prevTotal = computeTotal(days);
    const newTotal = computeTotal(newDays);
    const prevLevel = levelInfo(prevTotal).level;
    const newLevel = levelInfo(newTotal).level;

    setDays(newDays);
    persist(newDays, settings, rewards);

    if (!prevDay.perfectDay && recalced.perfectDay) {
      sound.fanfare();
      fireConfetti();
      fireToast("🔥 Perfect day, every box checked");
    } else {
      sound.tick();
    }

    if (newLevel > prevLevel) {
      setLevelUp({ level: newLevel, title: levelInfo(newTotal).title });
      setTimeout(() => setLevelUp(null), 2200);
      fireConfetti();
    }

    // streak milestone check (only meaningful right after a perfect-day toggle)
    if (!prevDay.perfectDay && recalced.perfectDay) {
      const streakAfter = computeCurrentStreak(newDays);
      const hit = STREAK_MILESTONES.find((m) => m === streakAfter);
      if (hit && shownMilestoneRef.current !== `${todayKey}-${hit}`) {
        shownMilestoneRef.current = `${todayKey}-${hit}`;
        setTimeout(() => fireToast(`🔥 ${hit}-day streak, don't break it now`), 900);
      }
    }
  };

  const toggleTask = (key) => {
    const cur = days[todayKey] || blankDay();
    const updated = { ...cur, [key]: !cur[key] };
    if (key === "run" && !updated.run) updated.runKm = 0;
    if (key === "jobs" && !updated.jobs) updated.jobsCount = 0;
    applyDayUpdate(updated);
  };

  const setMetric = (field, value) => {
    const cur = days[todayKey] || blankDay();
    const updated = { ...cur, [field]: Math.max(0, value) };
    applyDayUpdate(updated);
    if (value > 0) sound.success();
  };

  const selectVideoStage = (taskKey, field, value) => {
    const cur = days[todayKey] || blankDay();
    const updated = { ...cur, [field]: value, [taskKey]: !!value };
    applyDayUpdate(updated);
    if (value) sound.success();
    else sound.undo();
  };

  const toggleBonus = (key) => {
    const cur = days[todayKey] || blankDay();
    const flags = { ...(cur.bonusFlags || { interview: false, bath: false }) };
    flags[key] = !flags[key];
    const updated = { ...cur, bonusFlags: flags };
    applyDayUpdate(updated);
    sound.success();
  };

  const updateSettings = (next) => {
    setSettings(next);
    persist(days, next, rewards);
    fireToast("Settings saved");
  };

  const toggleSound = () => {
    const next = { ...settings, soundOn: !settings.soundOn };
    setSettings(next);
    persist(days, next, rewards);
  };

  const claimReward = (id) => {
    const next = rewards.map((r) => (r.id === id ? { ...r, claimed: true } : r));
    setRewards(next);
    persist(days, settings, next);
    sound.fanfare();
    fireConfetti();
    const r = rewards.find((r) => r.id === id);
    fireToast(`🏆 Claimed: ${r?.text || "reward"}`);
  };

  const addReward = ({ text, points }) => {
    const next = [...rewards, { id: `r${Date.now()}`, text, points, claimed: false }];
    setRewards(next);
    persist(days, settings, next);
  };

  const deleteReward = (id) => {
    const next = rewards.filter((r) => r.id !== id);
    setRewards(next);
    persist(days, settings, next);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-neutral-950">
        <div className="font-mono text-sm text-neutral-500">booting grind ops...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full pb-16 text-neutral-100"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(45,212,191,0.08), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(167,139,250,0.06), transparent), #0a0c0f",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', system-ui, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(540deg); opacity: 0; }
        }
        @keyframes toast-pop-in {
          0% { opacity: 0; transform: translateY(-8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .toast-pop { animation: toast-pop-in 0.25s ease-out; }
        @keyframes levelup-pop-in {
          0% { opacity: 0; transform: scale(0.85); }
          60% { opacity: 1; transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
        .levelup-pop { animation: levelup-pop-in 0.35s cubic-bezier(.34,1.56,.64,1); }
        @keyframes flame-flicker {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.08) rotate(-2deg); }
        }
        .flame-flicker { animation: flame-flicker 1.6s ease-in-out infinite; }
      `}</style>

      <ConfettiBurst key={confettiTick} active={confettiTick > 0} />
      <Toast toast={toast} />
      <LevelUpFlash data={levelUp} />

      <div className="mx-auto max-w-md px-4 pt-6 sm:max-w-lg">
        {/* HEADER */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">grind ops // personal console</div>
            <h1 className="font-display text-xl font-bold text-neutral-50">
              Lv.{lvl.level} <span className="text-neutral-500">·</span> {lvl.title}
            </h1>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="mt-1 rounded-full border border-neutral-800 p-2 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>

        {/* TICKER + STREAK */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <Ticker value={total} />
          <div className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-black/40 px-3 py-1.5">
            <Flame className={`h-4 w-4 ${currentStreak > 0 ? "flame-flicker text-amber-400" : "text-neutral-600"}`} />
            <span className="font-mono text-sm text-neutral-200">{currentStreak}d</span>
            {longestStreak > currentStreak && (
              <span className="font-mono text-[10px] text-neutral-500">best {longestStreak}d</span>
            )}
          </div>
        </div>

        {/* LEVEL PROGRESS */}
        <div className="mb-6">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-neutral-500">
            <span>{lvl.into} / {LEVEL_STEP} to next level</span>
            <span>{Math.round(lvl.pct)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-800">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-teal-400 via-violet-400 to-amber-400 transition-all duration-700"
              style={{ width: `${lvl.pct}%` }}
            />
          </div>
        </div>

        {/* TODAY */}
        <div className="mb-7">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-neutral-300">
              Today ·{" "}
              {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </h2>
            <span className="font-mono text-xs text-neutral-500">
              {[today.wake, today.run, today.jobs, today.video, today.journal].filter(Boolean).length}/5
            </span>
          </div>
          <div className="space-y-2.5">
            {TASK_DEFS.map((def) => (
              <TaskRow
                key={def.key}
                def={def}
                day={today}
                points={{ settings }}
                onToggle={toggleTask}
                onMetricChange={setMetric}
                onTierSelect={selectVideoStage}
              />
            ))}
          </div>
        </div>

        {/* BONUS MOVES */}
        <div className="mb-7">
          <h2 className="mb-2.5 font-display text-sm font-semibold text-neutral-300">Bonus moves</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {BONUS_DEFS.map((b) => {
              const bc = COLOR_MAP[b.color];
              const active = !!today.bonusFlags?.[b.key];
              const BIcon = b.icon;
              return (
                <button
                  key={b.key}
                  onClick={() => toggleBonus(b.key)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all ${
                    active ? `${bc.borderSolid} ${bc.bgSoft} ${bc.shadow}` : "border-neutral-800 bg-neutral-900/60"
                  }`}
                >
                  <BIcon className={`h-4 w-4 ${active ? bc.text : "text-neutral-500"}`} />
                  <span className={`text-xs font-medium ${active ? "text-neutral-100" : "text-neutral-400"}`}>
                    {b.label}
                  </span>
                  <span className={`font-mono text-[10px] ${active ? bc.text : "text-neutral-600"}`}>
                    +{settings.bonusPoints[b.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* WEEK STRIP */}
        <div className="mb-7">
          <h2 className="mb-3 font-display text-sm font-semibold text-neutral-300">Last 7 days</h2>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 pb-6">
            <WeekStrip days={days} />
          </div>
        </div>

        {/* CHECKPOINTS */}
        <div className="mb-10">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-neutral-300">
            <Trophy className="h-3.5 w-3.5 text-amber-400" /> Checkpoints
          </h2>
          <Checkpoints rewards={rewards} total={total} onClaim={claimReward} onAdd={addReward} onDelete={deleteReward} />
        </div>

        <p className="pb-4 text-center font-mono text-[10px] text-neutral-600">
          saved automatically to this browser
        </p>
      </div>

      <SettingsDrawer
        settings={settings}
        onChange={updateSettings}
        soundOn={settings.soundOn}
        onSoundToggle={toggleSound}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
