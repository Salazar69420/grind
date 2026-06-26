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
  ShoppingBag,
  Lock,
  Unlock,
  Coins,
  History,
  Coffee,
  Compass,
  Utensils,
  PlusCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Gift,
  Zap,
  Package,
  Shield,
  Award,
  Clock,
  Star,
  Crown,
  Target,
  Rocket,
  Gem,
  Skull,
  Medal,
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

const STREAK_BONUSES = [
  { day: 1, points: 5, label: "1d Streak Starter" },
  { day: 2, points: 10, label: "2d Combo" },
  { day: 3, points: 15, label: "3d Heat" },
  { day: 7, points: 50, label: "7d Week Warrior" },
  { day: 10, points: 100, label: "10d Unstoppable" },
  { day: 30, points: 500, label: "30d Legend" },
  { day: 100, points: 2000, label: "100d Grind Master" }
];

function computeStreakBonuses(days) {
  const dates = Object.keys(days)
    .filter((k) => days[k].perfectDay)
    .sort();
  if (dates.length === 0) return 0;
  let totalBonus = 0;
  let currentStreak = 0;
  let prevDate = null;
  for (const k of dates) {
    const d = new Date(k + "T00:00:00");
    if (prevDate) {
      const diff = Math.round((d - prevDate) / 86400000);
      if (diff === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    const bonus = STREAK_BONUSES.find((b) => b.day === currentStreak);
    if (bonus) {
      totalBonus += bonus.points;
    }
    prevDate = d;
  }
  return totalBonus;
}

/* ---------------------------------------------------------------
   ADDICTION LAYER — daily check-in, loot, achievements
--------------------------------------------------------------- */

// Daily login chain. 7-day cycle; escalating base reward + jitter.
// Day 7 also drops a mystery box + a streak shield (peak-reward anchor).
const CHECKIN_REWARDS = [
  { day: 1, base: 10, jitter: 5, label: "Day 1" },
  { day: 2, base: 15, jitter: 5, label: "Day 2" },
  { day: 3, base: 20, jitter: 8, label: "Day 3" },
  { day: 4, base: 30, jitter: 10, label: "Day 4" },
  { day: 5, base: 40, jitter: 12, label: "Day 5" },
  { day: 6, base: 60, jitter: 15, label: "Day 6" },
  { day: 7, base: 100, jitter: 25, label: "Day 7 · JACKPOT", box: true, shield: true },
];

// index into the 7-day cycle for a given chain length (loops after 7)
function checkinSlot(chain) {
  const n = Math.max(1, chain);
  return ((n - 1) % 7);
}

// Variable-ratio crit on point gains. Weighted rarities — the slot machine.
const CRIT_TABLE = [
  { mult: 2, weight: 70, label: "2× CRIT", tone: "amber" },
  { mult: 3, weight: 24, label: "3× MEGA CRIT", tone: "violet" },
  { mult: 5, weight: 6, label: "5× LEGENDARY CRIT", tone: "rose" },
];
const CRIT_CHANCE = 0.2; // ~1 in 5 point gains rolls a crit

// Mystery box loot. Weighted; unpredictable contents = curiosity hook.
const LOOT_TABLE = [
  { id: "pts_s", weight: 34, kind: "points", min: 15, max: 35, label: "Stash of points", icon: "Coins", tone: "teal" },
  { id: "pts_m", weight: 24, kind: "points", min: 40, max: 80, label: "Big point haul", icon: "Coins", tone: "amber" },
  { id: "shield", weight: 18, kind: "shield", amount: 1, label: "Streak Shield", icon: "Shield", tone: "sky" },
  { id: "box", weight: 12, kind: "box", amount: 1, label: "Another Mystery Box!", icon: "Package", tone: "violet" },
  { id: "pts_l", weight: 9, kind: "points", min: 100, max: 180, label: "Epic point vault", icon: "Gem", tone: "violet" },
  { id: "jackpot", weight: 3, kind: "points", min: 250, max: 400, label: "💰 JACKPOT 💰", icon: "Crown", tone: "rose" },
];

function rollWeighted(table) {
  const total = table.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of table) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return table[table.length - 1];
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Achievements. `test(stats) => bool`. Hidden ones render as ??? until earned.
const ACHIEVEMENTS = [
  { id: "first_blood", label: "First Blood", desc: "Complete your first perfect day", icon: Flame, reward: 25, test: (s) => s.perfectDays >= 1 },
  { id: "streak_3", label: "Heating Up", desc: "Reach a 3-day streak", icon: Flame, reward: 30, test: (s) => s.longestStreak >= 3 },
  { id: "streak_7", label: "Week Warrior", desc: "Reach a 7-day streak", icon: Flame, reward: 75, test: (s) => s.longestStreak >= 7 },
  { id: "streak_30", label: "Iron Will", desc: "Reach a 30-day streak", icon: Crown, reward: 300, test: (s) => s.longestStreak >= 30 },
  { id: "level_5", label: "Rainmaker", desc: "Reach Level 5", icon: Star, reward: 100, test: (s) => s.level >= 5 },
  { id: "level_8", label: "Legend", desc: "Reach max level", icon: Crown, reward: 500, hidden: true, test: (s) => s.level >= 8 },
  { id: "pts_1k", label: "Four Figures", desc: "Earn 1,000 lifetime points", icon: Coins, reward: 100, test: (s) => s.total >= 1000 },
  { id: "pts_5k", label: "Whale", desc: "Earn 5,000 lifetime points", icon: Gem, reward: 400, hidden: true, test: (s) => s.total >= 5000 },
  { id: "runner", label: "Long Hauler", desc: "Log 10km in a single day", icon: Footprints, reward: 60, test: (s) => s.maxRunKm >= 10 },
  { id: "grinder", label: "Application Machine", desc: "Send 10 job apps in a day", icon: Briefcase, reward: 60, test: (s) => s.maxJobs >= 10 },
  { id: "checkin_7", label: "Creature of Habit", desc: "Hit a 7-day check-in chain", icon: Gift, reward: 80, test: (s) => s.maxCheckin >= 7 },
  { id: "first_reward", label: "Treat Yourself", desc: "Claim your first checkpoint", icon: Trophy, reward: 25, test: (s) => s.claimedRewards >= 1 },
  { id: "first_buy", label: "Big Spender", desc: "Redeem from the dispensary", icon: ShoppingBag, reward: 25, test: (s) => s.purchases >= 1 },
  { id: "box_open", label: "Curiosity", desc: "Open a mystery box", icon: Package, reward: 30, test: (s) => s.boxesOpened >= 1 },
  { id: "crit_5", label: "Against All Odds", desc: "Land a 5× legendary crit", icon: Zap, reward: 100, hidden: true, test: (s) => s.maxCrit >= 5 },
  { id: "shielded", label: "Saved By The Bell", desc: "Survive on a streak shield", icon: Shield, reward: 50, hidden: true, test: (s) => s.shieldsUsed >= 1 },
];

const TASK_DEFS = [
  {
    key: "wake",
    label: "Wake up time",
    sub: "Discipline",
    icon: Sun,
    color: "amber",
    tierSelect: true,
    tierKey: "wakeTiers",
    stageField: "wakeStage",
  },
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
    stageField: "videoStage",
  },
  { key: "journal", label: "Journal", sub: "Reflection", icon: BookOpen, color: "sky" }
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
  taskPoints: { wake: 0, run: 10, jobs: 15, journal: 10 },
  perfectDayBonus: 20,
  wakeTiers: [
    { id: "w8", points: 20, label: "8:00 AM" },
    { id: "w9", points: 10, label: "9:00 AM" },
    { id: "w10", points: 5, label: "10:00 AM" },
    { id: "w11", points: 0, label: "Late / None" }
  ],
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

const DEFAULT_SHOP_ITEMS = [
  { id: "s1", points: 75, text: "1 C", color: "teal" },
  { id: "s2", points: 100, text: "1 J", color: "violet" },
  { id: "s3", points: 150, text: "Chill rest of the day", color: "amber" },
  { id: "s4", points: 200, text: "Go out for food", color: "rose" }
];

function getShopItemIcon(text) {
  const t = text.toLowerCase();
  if (t.includes("1 c")) return Coffee;
  if (t.includes("1 j")) return Sparkles;
  if (t.includes("chill")) return Compass;
  if (t.includes("food") || t.includes("eat")) return Utensils;
  return ShoppingBag;
}

function fmtDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function blankDay() {
  return {
    wake: false,
    wakeStage: null,
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
  if (day.wake && day.wakeStage) {
    const tier = settings.wakeTiers.find((t) => t.id === day.wakeStage);
    if (tier) pts += tier.points;
  }
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

// a date counts toward a streak if it was a perfect day OR was covered by a shield
function dayCounts(days, key, shieldedSet) {
  return (days[key] && days[key].perfectDay) || shieldedSet.has(key);
}

function computeCurrentStreak(days, shieldedSet = new Set()) {
  let streak = 0;
  let d = new Date();
  // if today isn't counted yet, streak reflects the run ending yesterday
  if (!dayCounts(days, fmtDateKey(d), shieldedSet)) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const key = fmtDateKey(d);
    if (dayCounts(days, key, shieldedSet)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function computeLongestStreak(days, shieldedSet = new Set()) {
  const dates = Object.keys(days)
    .filter((k) => days[k].perfectDay || shieldedSet.has(k))
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

  const purchase = useCallback(() => {
    blip("C5", "32n", 0);
    blip("E5", "32n", 0.04);
    blip("G5", "32n", 0.08);
    blip("C6", "16n", 0.12);
  }, [blip]);

  const fail = useCallback(() => {
    blip("G3", "8n", 0);
    blip("F#3", "4n", 0.06);
  }, [blip]);

  const levelup = useCallback(() => {
    blip("C4", "16n", 0);
    blip("E4", "16n", 0.08);
    blip("G4", "16n", 0.16);
    blip("C5", "16n", 0.24);
    blip("E5", "16n", 0.32);
    blip("G5", "16n", 0.40);
    blip("C6", "4n", 0.48);
  }, [blip]);

  // crit: rising arpeggio whose length scales with multiplier (more salient = rarer)
  const crit = useCallback(
    (mult = 2) => {
      const notes = ["E5", "G5", "B5", "D6", "G6", "B6"];
      const steps = Math.min(notes.length, 2 + mult);
      for (let i = 0; i < steps; i++) {
        blip(notes[i], i === steps - 1 ? "8n" : "32n", i * 0.05);
      }
    },
    [blip]
  );

  return { tick, success, fanfare, undo, purchase, fail, levelup, crit };
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

function LevelUpFlash({ data, onClose }) {
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-md transition-all duration-500">
      <div className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-amber-500/40 bg-neutral-950 p-8 text-center shadow-[0_0_60px_rgba(245,158,11,0.35)] animate-[levelup-pop-in_0.5s_cubic-bezier(.34,1.56,.64,1)]">
        {/* Spinning halo effect */}
        <div className="absolute inset-0 -z-10 animate-spin bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.2),transparent_70%)] opacity-80" style={{ animationDuration: "10s" }} />

        <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/10 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.5)] animate-bounce">
          <Trophy className="h-10 w-10 text-amber-400" />
        </span>

        <div className="font-mono text-xs uppercase tracking-[0.3em] text-amber-500">grindops status update</div>
        
        <h2 className="mt-2 text-2xl font-extrabold text-neutral-100 tracking-tight">
          LEVEL UP!
        </h2>
        
        <div className="mt-3 flex items-center justify-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-4 py-1.5">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="font-mono text-sm font-semibold text-amber-400">Lv.{data.level} · {data.title}</span>
        </div>

        <p className="mt-4 max-w-xs font-mono text-[10px] text-neutral-400 leading-relaxed">
          Your tier has been updated in the Grind system. New permissions, multiplier boosts, and status perks unlocked.
        </p>

        <button
          onClick={onClose}
          className="mt-8 w-full rounded-2xl bg-amber-400 py-3 text-sm font-extrabold uppercase tracking-widest text-neutral-950 shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          CLAIM NEW RANK & CONTINUE
        </button>
      </div>
    </div>
  );
}

const LOOT_ICONS = { Coins, Shield, Package, Gem, Crown };

/* ---------------------------------------------------------------
   DAILY CHECK-IN MODAL — escalating login chain
--------------------------------------------------------------- */

function DailyCheckInModal({ data, onClaim }) {
  if (!data) return null;
  const slot = checkinSlot(data.chain);
  return (
    <div className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-teal-500/40 bg-neutral-950 p-7 text-center shadow-[0_0_60px_rgba(45,212,191,0.25)] animate-[levelup-pop-in_0.5s_cubic-bezier(.34,1.56,.64,1)]">
        <div className="absolute inset-0 -z-10 animate-spin bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.15),transparent_65%)] opacity-80" style={{ animationDuration: "14s" }} />

        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-teal-400 bg-teal-400/10 text-teal-300 shadow-[0_0_30px_rgba(45,212,191,0.4)] animate-bounce">
          <Gift className="h-8 w-8" />
        </span>

        {data.welcome ? (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-teal-400">welcome to the grind</div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-100">You're on the board</h2>
            <p className="mt-2 max-w-xs font-mono text-[10px] leading-relaxed text-neutral-400">
              Here's a head start so the streak's already yours to lose. Show up daily — the rewards compound.
            </p>
          </>
        ) : data.broken ? (
          <>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-rose-400">
              <Skull className="h-3.5 w-3.5" /> chain broken
            </div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-100">
              You broke your {data.prevChain}-day chain
            </h2>
            <p className="mt-2 max-w-xs font-mono text-[10px] leading-relaxed text-neutral-400">
              All that momentum, gone. Back to Day 1. Don't let it happen again.
            </p>
          </>
        ) : (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-teal-400">daily check-in</div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-100">
              Day {data.chain} streak
            </h2>
            <p className="mt-2 max-w-xs font-mono text-[10px] leading-relaxed text-neutral-400">
              You showed up again. Claim your reward — miss a day and you start over.
            </p>
          </>
        )}

        {/* 7-day reward track */}
        <div className="mt-5 grid w-full grid-cols-7 gap-1.5">
          {CHECKIN_REWARDS.map((r, i) => {
            const isCurrent = i === slot;
            const isPast = i < slot;
            return (
              <div
                key={r.day}
                className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition-all ${
                  isCurrent
                    ? "border-amber-400 bg-amber-400/10 shadow-[0_0_15px_rgba(251,191,36,0.3)] scale-110"
                    : isPast
                    ? "border-teal-500/30 bg-teal-500/5"
                    : "border-neutral-800 bg-neutral-900/40 opacity-50"
                }`}
              >
                <span className={`font-mono text-[8px] ${isCurrent ? "text-amber-400" : "text-neutral-500"}`}>D{r.day}</span>
                {r.box ? (
                  <Package className={`h-3.5 w-3.5 ${isCurrent ? "text-amber-400" : "text-neutral-500"}`} />
                ) : (
                  <span className={`font-mono text-[8px] font-bold ${isCurrent ? "text-amber-400" : "text-neutral-500"}`}>+{r.base}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-1.5">
          <Coins className="h-4 w-4 text-amber-400" />
          <span className="font-mono text-sm font-bold text-amber-400">+{data.reward} pts</span>
          {CHECKIN_REWARDS[slot].shield && (
            <span className="ml-1 flex items-center gap-1 text-sky-300"><Shield className="h-3.5 w-3.5" /><span className="font-mono text-[10px]">+shield</span></span>
          )}
          {CHECKIN_REWARDS[slot].box && (
            <span className="ml-1 flex items-center gap-1 text-violet-300"><Package className="h-3.5 w-3.5" /><span className="font-mono text-[10px]">+box</span></span>
          )}
        </div>

        <button
          onClick={onClaim}
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-teal-400 to-amber-400 py-3 text-sm font-extrabold uppercase tracking-widest text-neutral-950 shadow-[0_4px_20px_rgba(45,212,191,0.3)] transition-all hover:scale-105 active:scale-95"
        >
          {data.welcome ? "Claim head start" : "Claim reward"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MYSTERY BOX MODAL — tap-to-open variable loot
--------------------------------------------------------------- */

function MysteryBoxModal({ open, result, onOpen, onClose }) {
  if (!open) return null;
  const tone = result ? COLOR_MAP[result.tone] || COLOR_MAP.amber : COLOR_MAP.violet;
  const RIcon = result ? LOOT_ICONS[result.icon] || Gift : Package;
  return (
    <div className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <div className={`relative flex w-full max-w-sm flex-col items-center rounded-3xl border ${tone.border} bg-neutral-950 p-8 text-center ${tone.shadow} animate-[levelup-pop-in_0.5s_cubic-bezier(.34,1.56,.64,1)]`}>
        <div className={`absolute inset-0 -z-10 animate-spin ${tone.bgSoft} rounded-3xl opacity-60`} style={{ animationDuration: "10s" }} />

        {!result ? (
          <>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-violet-400">mystery box</div>
            <span className="my-5 flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-violet-400 bg-violet-400/10 text-violet-300 shadow-[0_0_40px_rgba(167,139,250,0.5)] animate-bounce">
              <Package className="h-12 w-12" />
            </span>
            <p className="mb-5 max-w-xs font-mono text-[10px] leading-relaxed text-neutral-400">
              Something's inside. Could be a little. Could be a jackpot. Only one way to find out.
            </p>
            <button
              onClick={onOpen}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-rose-500 py-3 text-sm font-extrabold uppercase tracking-widest text-neutral-50 shadow-[0_4px_20px_rgba(167,139,250,0.4)] transition-all hover:scale-105 active:scale-95"
            >
              Open it
            </button>
          </>
        ) : (
          <>
            <div className={`font-mono text-[10px] uppercase tracking-[0.3em] ${tone.text}`}>you got</div>
            <span className={`my-5 flex h-24 w-24 items-center justify-center rounded-2xl border-2 ${tone.borderSolid} ${tone.bgSoft} ${tone.text} ${tone.shadow} animate-bounce`}>
              <RIcon className="h-12 w-12" />
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight text-neutral-100">{result.label}</h2>
            {result.amountText && (
              <div className={`mt-3 flex items-center gap-1.5 rounded-full border ${tone.border} ${tone.bgSoft} px-4 py-1.5`}>
                <span className={`font-mono text-sm font-bold ${tone.text}`}>{result.amountText}</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-2xl bg-neutral-100 py-3 text-sm font-extrabold uppercase tracking-widest text-neutral-950 transition-all hover:scale-105 active:scale-95"
            >
              Collect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TASK ROW
--------------------------------------------------------------- */

function TaskRow({ def, day, points, onToggle, onTierSelect, onMetricConfirm }) {
  const c = COLOR_MAP[def.color];
  const Icon = def.icon;
  const hasMetric = !!def.metricField;
  const metricValueRaw = hasMetric ? day[def.metricField] || 0 : 0;
  
  // Local drafts for inputs
  const [metricInput, setMetricInput] = useState(metricValueRaw > 0 ? String(metricValueRaw) : "");
  const stageField = def.stageField || "videoStage";
  const savedStage = day[stageField] || "";
  const [localStage, setLocalStage] = useState(savedStage);

  const done = !!day[def.key];
  const [localChecked, setLocalChecked] = useState(done);

  // Sync local draft state with global state when selected day changes (e.g. via calendar)
  useEffect(() => {
    setMetricInput(metricValueRaw > 0 ? String(metricValueRaw) : "");
    setLocalChecked(done);
  }, [metricValueRaw, done]);

  useEffect(() => {
    setLocalStage(savedStage);
  }, [savedStage]);

  if (def.tierSelect) {
    const tiers = points.settings[def.tierKey] || DEFAULT_SETTINGS[def.tierKey] || [];
    const selectedTier = tiers.find((t) => t.id === savedStage);
    const done = !!day[def.key];
    const isDirty = localStage !== savedStage;

    return (
      <div className={`rounded-xl border ${done && !isDirty ? c.border : "border-neutral-800"} bg-neutral-900/60 p-4 transition-all duration-300`}>
        <div className="mb-3 flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
              done && !isDirty ? `${c.borderSolid} ${c.bgSoft} ${c.shadow}` : "border-neutral-700 bg-neutral-800/60"
            }`}
          >
            {done && !isDirty ? <Check className={`h-4 w-4 ${c.text}`} /> : <Icon className="h-4 w-4 text-neutral-500" />}
          </span>
          <span className="flex-1">
            <span className={`block text-sm font-medium ${done ? "text-neutral-100" : "text-neutral-300"}`}>
              {def.label}
            </span>
            <span className={`block text-[11px] uppercase tracking-wide ${c.text} opacity-80`}>{def.sub}</span>
          </span>
          {selectedTier && selectedTier.points > 0 && <span className={`font-mono text-xs ${c.text}`}>+{selectedTier.points}</span>}
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {tiers.map((t) => {
            const active = localStage === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setLocalStage(active ? "" : t.id);
                }}
                className={`flex-1 rounded-lg border px-2 py-2 text-center text-xs font-semibold tracking-wide transition-all min-w-[70px] ${
                  active ? `${c.borderSolid} ${c.bgSoft} ${c.text}` : "border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300"
                }`}
              >
                {t.label}
                {t.points > 0 && <span className="ml-1 font-mono opacity-80">+{t.points}</span>}
              </button>
            );
          })}
        </div>

        {/* CONFIRM BUTTON FOR WAKING/TIER SELECTS */}
        {isDirty && (
          <button
            onClick={() => {
              onTierSelect(def.key, stageField, localStage || null);
            }}
            className={`w-full mt-3 rounded-lg ${c.bg} text-neutral-950 py-2 text-center text-xs font-extrabold uppercase tracking-wider shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 animate-pulse`}
          >
            Confirm {def.label}
          </button>
        )}
      </div>
    );
  }

  const metricValue = metricValueRaw;
  const draftMetricValue = hasMetric && localChecked ? (parseFloat(metricInput) || 0) : 0;
  const bonusInfo = hasMetric && localChecked && draftMetricValue > 0 ? def.calcBonus(draftMetricValue, points.settings) : { points: 0, tierLabel: null };
  const isMetricDirty = hasMetric && (localChecked !== done || (localChecked && String(metricValue) !== metricInput));

  return (
    <div className={`rounded-xl border ${(hasMetric ? localChecked && !isMetricDirty : done) ? c.border : "border-neutral-800"} bg-neutral-900/60 transition-colors`}>
      <button
        onClick={() => {
          if (hasMetric) {
            setLocalChecked(!localChecked);
          } else {
            onToggle(def.key);
          }
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            (hasMetric ? localChecked && !isMetricDirty : done) ? `${c.borderSolid} ${c.bgSoft} ${c.shadow}` : "border-neutral-700 bg-neutral-800/60"
          }`}
        >
          {(hasMetric ? localChecked && !isMetricDirty : done) ? <Check className={`h-4 w-4 ${c.text}`} /> : <Icon className="h-4 w-4 text-neutral-500" />}
        </span>
        <span className="flex-1">
          <span className={`block text-sm font-medium ${(hasMetric ? localChecked : done) ? "text-neutral-100" : "text-neutral-300"}`}>
            {def.label}
          </span>
          <span className={`block text-[11px] uppercase tracking-wide ${c.text} opacity-80`}>{def.sub}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          {points.settings.taskPoints[def.key] > 0 && (
            <span className={`font-mono text-xs ${(hasMetric ? localChecked : done) ? c.text : "text-neutral-600"}`}>
              +{points.settings.taskPoints[def.key]}
            </span>
          )}
          {hasMetric && bonusInfo.points > 0 && (
            <span className={`font-mono text-[10px] ${c.text} font-bold animate-pulse`}>
              +{bonusInfo.points} {def.metricBonusSuffix}
            </span>
          )}
        </span>
      </button>

      {hasMetric && localChecked && (
        <div className="border-t border-neutral-800/80 px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step={def.metricStep}
              inputMode={def.metricInputMode}
              value={metricInput}
              onChange={(e) => setMetricInput(e.target.value)}
              placeholder={def.metricPlaceholder}
              className={`w-32 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none ${c.focusBorder}`}
            />
            <span className="text-xs text-neutral-500 font-medium">{def.metricHint}</span>
          </div>

          {def.tierKey && (
            <TierLadder
              value={draftMetricValue}
              tiers={points.settings[def.tierKey]}
              thresholdField={def.thresholdField}
              extraPerUnit={points.settings[def.extraKey]}
              extraUnitLabel={def.extraUnitLabel}
              colorKey={def.color}
            />
          )}
        </div>
      )}

      {/* CONFIRM BUTTON FOR METRIC VALUES / STATUS CHANGE */}
      {isMetricDirty && (
        <div className="px-4 pb-3">
          <button
            onClick={() => {
              onMetricConfirm(def.key, def.metricField, localChecked, localChecked ? (parseFloat(metricInput) || 0) : 0);
            }}
            className={`w-full rounded-lg ${c.bg} text-neutral-950 py-2 text-center text-xs font-extrabold uppercase tracking-wider shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 animate-pulse`}
          >
            Confirm {def.label}
          </button>
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
   CALENDAR PANEL (HISTORY)
--------------------------------------------------------------- */

function CalendarPanel({ days, selectedDate, onSelectDate }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [open, setOpen] = useState(false);

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= lastDay; i++) {
    calendarDays.push(new Date(year, month, i));
  }

  const monthName = currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 transition-all duration-300">
      <button 
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between font-display text-sm font-semibold text-neutral-300 px-1"
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-teal-400" /> 
          {open ? "Close History Log" : "Open History Log"}
        </span>
        <span className="font-mono text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
          Selected: {selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </button>

      {open && (
        <div className="mt-4 border-t border-neutral-800/80 pt-4 animate-[levelup-pop-in_0.25s_ease-out]">
          <div className="mb-3 flex items-center justify-between px-1">
            <button onClick={prevMonth} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-display text-sm font-bold text-neutral-200">{monthName}</span>
            <button onClick={nextMonth} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-wider mb-2">
            <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((d, index) => {
              if (d === null) return <div key={`empty-${index}`} />;
              const key = fmtDateKey(d);
              const record = days[key];
              const isSelected = fmtDateKey(selectedDate) === key;
              const isToday = fmtDateKey(new Date()) === key;
              
              let bgClass = "bg-neutral-900/30 text-neutral-400 border border-neutral-800/60";
              if (record?.perfectDay) {
                bgClass = "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.1)]";
              } else if (record?.pointsEarned > 0) {
                bgClass = "bg-teal-400/10 text-teal-300 border border-teal-400/20";
              }

              return (
                <button
                  key={key}
                  onClick={() => onSelectDate(d)}
                  className={`relative flex h-9 flex-col items-center justify-center rounded-xl text-xs font-semibold font-mono transition-all hover:bg-neutral-800 ${bgClass} ${
                    isSelected ? "ring-2 ring-neutral-100 ring-offset-2 ring-offset-neutral-950 scale-105" : ""
                  } ${isToday ? "font-bold border border-teal-500" : ""}`}
                >
                  <span>{d.getDate()}</span>
                  {isToday && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-teal-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   DISPENSARY VIEW (SHOP)
--------------------------------------------------------------- */

function DispensaryView({ balance, shopItems, purchaseHistory, onBuy, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPoints, setNewPoints] = useState(100);
  const [newColor, setNewColor] = useState("teal");

  const colors = ["teal", "violet", "amber", "rose"];

  return (
    <div className="space-y-6">
      {/* Spendable Balance Panel */}
      <div 
        className="relative overflow-hidden rounded-2xl border border-amber-500/30 p-6 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.1))",
          boxShadow: "0 0 35px rgba(245, 158, 11, 0.1)"
        }}
      >
        <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-amber-500/10 blur-xl"></div>
        <div className="absolute bottom-0 left-0 -ml-6 -mb-6 h-24 w-24 rounded-full bg-rose-500/10 blur-xl"></div>
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-1 flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-amber-400">
            <Coins className="h-3.5 w-3.5 animate-bounce" /> Spendable liquid balance
          </div>
          <div className="font-display text-4xl font-extrabold tracking-tight text-neutral-50 sm:text-5xl">
            {balance} <span className="font-mono text-lg font-medium text-neutral-400">PTS</span>
          </div>
          <p className="mt-2 max-w-xs font-mono text-[10px] leading-relaxed text-neutral-500">
            Avail products here. Spending points does NOT reduce your level progress or break your streaks.
          </p>
        </div>
      </div>

      {/* Grid of Items */}
      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-neutral-300">Available Products</h2>
        <div className="grid grid-cols-2 gap-3">
          {shopItems.map((item) => {
            const IconComponent = getShopItemIcon(item.text);
            const affordable = balance >= item.points;
            const theme = COLOR_MAP[item.color || "teal"];
            const pct = Math.min(100, (balance / item.points) * 100);
            
            return (
              <div
                key={item.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-300 ${
                  affordable 
                    ? `bg-neutral-900/80 hover:-translate-y-0.5 hover:shadow-lg ${theme.border} hover:${theme.shadow}`
                    : "border-neutral-800 bg-neutral-950/40 opacity-70"
                }`}
              >
                {/* Trash button to delete item */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="absolute top-2 right-2 text-neutral-600 transition-colors hover:text-rose-400"
                >
                  <X className="h-3 w-3" />
                </button>

                <div>
                  <span className={`inline-flex items-center justify-center rounded-lg p-2 ${theme.bgSoft} ${theme.text} mb-3`}>
                    <IconComponent className="h-5 w-5" />
                  </span>
                  <h3 className="line-clamp-2 text-sm font-semibold text-neutral-100">{item.text}</h3>
                  <div className="mt-1 font-mono text-xs font-semibold text-neutral-400">
                    {item.points} pts
                  </div>
                </div>

                <div className="mt-4 pt-2">
                  {affordable ? (
                    <button
                      onClick={() => onBuy(item)}
                      className={`w-full rounded-lg py-2 text-center text-xs font-bold transition-all duration-200 ${theme.bg} text-neutral-950 shadow-[0_0_15px_rgba(45,212,191,0.2)] hover:scale-[1.03] active:scale-95`}
                    >
                      AVAIL NOW
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-mono text-[9px] text-neutral-500">
                        <span>{balance}/{item.points} pts</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-neutral-800">
                        <div 
                          className={`h-1 rounded-full ${theme.bg} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1 font-mono text-[9px] text-neutral-600">
                        <Lock className="h-2.5 w-2.5" /> Needs {item.points - balance} more
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Product Creator Form */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
        {adding ? (
          <div className="space-y-3">
            <h3 className="font-display text-sm font-semibold text-neutral-200">Craft New Reward</h3>
            
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase text-neutral-500">Reward Title</label>
              <input
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="e.g. 1 hour of gaming"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-amber-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-neutral-500">Points Cost</label>
                <input
                  type="number"
                  min="10"
                  value={newPoints}
                  onChange={(e) => setNewPoints(parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-neutral-500">Card Color</label>
                <div className="flex gap-2 py-1">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className={`h-5 w-5 rounded-full ${COLOR_MAP[c].bg} transition-transform ${
                        newColor === c ? "ring-2 ring-neutral-100 scale-110" : "opacity-60"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setAdding(false);
                  setNewText("");
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-neutral-400"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newText.trim()) return;
                  onAdd({ text: newText.trim(), points: newPoints || 50, color: newColor });
                  setNewText("");
                  setAdding(false);
                }}
                className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-semibold text-neutral-950"
              >
                Add Product
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-neutral-400 transition-colors hover:text-amber-400"
          >
            <PlusCircle className="h-4 w-4" /> Add custom product to dispensary
          </button>
        )}
      </div>

      {/* Transaction History Logs */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-neutral-300">
          <History className="h-3.5 w-3.5 text-neutral-400" /> Recent Drops
        </h2>
        
        {purchaseHistory.length === 0 ? (
          <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/20 py-8 text-center font-mono text-[10px] text-neutral-600">
            No items availed yet. Earn points and redeem!
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950/40 divide-y divide-neutral-900/60">
            {purchaseHistory.map((log) => {
              const theme = COLOR_MAP[log.color || "teal"];
              return (
                <div key={log.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-neutral-200">{log.text}</span>
                    <span className="ml-2 font-mono text-[9px] text-neutral-500">
                      {getRelativeTime(log.date)}
                    </span>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${theme.text}`}>
                    -{log.points} pts
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(isoString).toLocaleDateString();
}

/* ---------------------------------------------------------------
   SETTINGS DRAWER
--------------------------------------------------------------- */

function SettingsDrawer({ settings, onChange, soundOn, onSoundToggle, open, onClose, onResetAllData, totalPoints }) {
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
        <div className="mb-4 flex items-center justify-between border-b border-neutral-800 pb-3">
          <div>
            <h3 className="font-display text-base font-semibold text-neutral-100">Tune the system</h3>
            <div className="mt-1 font-mono text-[11px] text-neutral-400">
              Current Balance: <span className="font-semibold text-teal-400">{totalPoints} pts</span>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
          <span className="text-sm text-neutral-300">Sound effects</span>
          <button onClick={onSoundToggle} className="text-neutral-300">
            {soundOn ? <Volume2 className="h-4 w-4 text-teal-400" /> : <VolumeX className="h-4 w-4 text-neutral-600" />}
          </button>
        </div>

        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 border-b border-neutral-800/40 pb-1">Task points</p>
        <div className="mb-5 space-y-2">
          {TASK_DEFS.filter((def) => !def.tierSelect).map((def) => (
            <div key={def.key} className="flex items-center justify-between gap-3 border-b border-neutral-900/40 pb-2 last:border-0 last:pb-0">
              <span className="text-xs text-neutral-300">{def.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  value={local.taskPoints[def.key]}
                  onChange={(e) => updateTaskPoint(def.key, parseInt(e.target.value) || 0)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
                />
                <span className="text-[10px] text-neutral-500 w-6">pts</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900/45">
            <span className="text-xs text-neutral-300">Perfect day bonus</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                value={local.perfectDayBonus}
                onChange={(e) => setLocal((l) => ({ ...l, perfectDayBonus: parseInt(e.target.value) || 0 }))}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-amber-400"
              />
              <span className="text-[10px] text-neutral-500 w-6">pts</span>
            </div>
          </div>
        </div>

        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 border-b border-neutral-800/40 pb-1">Run distance tiers</p>
        <div className="mb-5 space-y-2.5">
          {local.runTiers
            .slice()
            .sort((a, b) => a.km - b.km)
            .map((t) => (
              <div key={t.id} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 items-center border-b border-neutral-900/50 pb-2 last:border-0 last:pb-0">
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) => updateTierList("runTiers", t.id, "label", e.target.value)}
                  className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-teal-400"
                  placeholder="Label"
                />
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="number"
                    step="0.1"
                    value={t.km}
                    onChange={(e) => updateTierList("runTiers", t.id, "km", parseFloat(e.target.value) || 0)}
                    className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
                  />
                  <span className="text-[10px] text-neutral-500 shrink-0 w-4">km</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="number"
                    value={t.points}
                    onChange={(e) => updateTierList("runTiers", t.id, "points", parseInt(e.target.value) || 0)}
                    className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
                  />
                  <span className="text-[10px] text-neutral-500 shrink-0 w-5">pts</span>
                </div>
              </div>
            ))}
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-neutral-900/45">
            <span className="text-xs text-neutral-400">Bonus/extra km beyond top</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                value={local.extraPerKm}
                onChange={(e) => setLocal((l) => ({ ...l, extraPerKm: parseInt(e.target.value) || 0 }))}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-teal-400"
              />
              <span className="text-[10px] text-neutral-500 w-6">pts</span>
            </div>
          </div>
        </div>

        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 border-b border-neutral-800/40 pb-1">Job application tiers</p>
        <div className="mb-5 space-y-2.5">
          {local.jobTiers
            .slice()
            .sort((a, b) => a.count - b.count)
            .map((t) => (
              <div key={t.id} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 items-center border-b border-neutral-900/50 pb-2 last:border-0 last:pb-0">
                <input
                  type="text"
                  value={t.label}
                  onChange={(e) => updateTierList("jobTiers", t.id, "label", e.target.value)}
                  className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-violet-400"
                  placeholder="Label"
                />
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="number"
                    step="1"
                    value={t.count}
                    onChange={(e) => updateTierList("jobTiers", t.id, "count", parseInt(e.target.value) || 0)}
                    className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
                  />
                  <span className="text-[10px] text-neutral-500 shrink-0 w-6">apps</span>
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="number"
                    value={t.points}
                    onChange={(e) => updateTierList("jobTiers", t.id, "points", parseInt(e.target.value) || 0)}
                    className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
                  />
                  <span className="text-[10px] text-neutral-500 shrink-0 w-5">pts</span>
                </div>
              </div>
            ))}
          <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-neutral-900/45">
            <span className="text-xs text-neutral-400">Bonus/extra app beyond top</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                value={local.extraPerApp}
                onChange={(e) => setLocal((l) => ({ ...l, extraPerApp: parseInt(e.target.value) || 0 }))}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
              />
              <span className="text-[10px] text-neutral-500 w-6">pts</span>
            </div>
          </div>
        </div>

        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 border-b border-neutral-800/40 pb-1">Wake time tiers</p>
        <div className="mb-5 space-y-2">
          {local.wakeTiers && local.wakeTiers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 border-b border-neutral-900/50 pb-2 last:border-0 last:pb-0">
              <span className="text-xs text-neutral-400 w-20 shrink-0">{t.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  value={t.points}
                  onChange={(e) => updateTierList("wakeTiers", t.id, "points", parseInt(e.target.value) || 0)}
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-neutral-500 w-6">pts</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 border-b border-neutral-800/40 pb-1">Video tiers</p>
        <div className="mb-5 space-y-2">
          {local.videoTiers.map((t) => (
            <div key={t.id} className="grid grid-cols-[1.5fr_1fr] gap-2 items-center border-b border-neutral-900/50 pb-2 last:border-0 last:pb-0">
              <input
                type="text"
                value={t.label}
                onChange={(e) => updateTierList("videoTiers", t.id, "label", e.target.value)}
                className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none focus:border-rose-400"
              />
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  type="number"
                  value={t.points}
                  onChange={(e) => updateTierList("videoTiers", t.id, "points", parseInt(e.target.value) || 0)}
                  className="w-full min-w-0 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-rose-400"
                />
                <span className="text-[10px] text-neutral-500 shrink-0 w-6">pts</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 border-b border-neutral-800/40 pb-1">Bonus moves</p>
        <div className="mb-5 space-y-2 border-b border-neutral-900 pb-2">
          {BONUS_DEFS.map((b) => (
            <div key={b.key} className="flex items-center justify-between gap-3 border-b border-neutral-900/50 pb-2 last:border-0 last:pb-0">
              <span className="text-xs text-neutral-300">{b.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  value={local.bonusPoints[b.key]}
                  onChange={(e) =>
                    setLocal((l) => ({ ...l, bonusPoints: { ...l.bonusPoints, [b.key]: parseInt(e.target.value) || 0 } }))
                  }
                  className="w-16 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-xs text-neutral-100 outline-none focus:border-violet-400"
                />
                <span className="text-[10px] text-neutral-500 w-6">pts</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mb-5 text-[11px] text-neutral-500 border-t border-neutral-900 pt-3">
          Changes apply going forward only. Days you've already logged keep their original points.
        </p>

        <button
          onClick={() => {
            onChange(local);
            onClose();
          }}
          className="w-full rounded-xl bg-teal-400 py-2.5 text-sm font-semibold text-neutral-950 transition-transform active:scale-[0.98] mb-3"
        >
          Save changes
        </button>

        <button
          type="button"
          onClick={() => {
            if (window.confirm("Are you sure you want to reset all daily records, streak progress, shop items, checkpoints and spendable currency? This cannot be undone.")) {
              onResetAllData();
              onClose();
            }
          }}
          className="w-full rounded-xl border border-rose-500/40 bg-rose-950/20 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-950/45 active:scale-[0.98] transition-all"
        >
          Reset Console & Start Fresh
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------- */

/* ---------------------------------------------------------------
   ACHIEVEMENTS / BADGES PANEL
--------------------------------------------------------------- */

function AchievementsPanel({ unlocked }) {
  const unlockedSet = new Set(unlocked);
  const count = ACHIEVEMENTS.filter((a) => unlockedSet.has(a.id)).length;
  const pct = Math.round((count / ACHIEVEMENTS.length) * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-neutral-500">
        <span>{count} / {ACHIEVEMENTS.length} unlocked</span>
        <span>{pct}%</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {ACHIEVEMENTS.map((a) => {
          const got = unlockedSet.has(a.id);
          const Icon = got ? a.icon : a.hidden ? Lock : a.icon;
          const showHidden = a.hidden && !got;
          return (
            <div
              key={a.id}
              title={got ? `${a.label} — ${a.desc}` : showHidden ? "Hidden achievement" : a.desc}
              className={`group relative flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                got
                  ? "border-amber-400/50 bg-amber-400/5 shadow-[0_0_15px_rgba(251,191,36,0.08)]"
                  : "border-neutral-800/80 bg-neutral-950/30 opacity-60"
              }`}
            >
              <Icon className={`h-5 w-5 ${got ? "text-amber-400" : "text-neutral-600"}`} />
              <span className={`text-[9px] font-semibold leading-tight ${got ? "text-neutral-200" : "text-neutral-500"}`}>
                {showHidden ? "???" : a.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GrindOps() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [rewards, setRewards] = useState(DEFAULT_REWARDS);
  const [spentPoints, setSpentPoints] = useState(0);
  const [shopItems, setShopItems] = useState(DEFAULT_SHOP_ITEMS);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("console");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [acquiredItem, setAcquiredItem] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confettiTick, setConfettiTick] = useState(0);
  const [toast, setToast] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const [floats, setFloats] = useState([]);
  // addiction-layer state
  const [bonusBank, setBonusBank] = useState(0);
  const [checkIn, setCheckIn] = useState({ lastDate: null, chain: 0 });
  const [unlockedAch, setUnlockedAch] = useState([]);
  const [shields, setShields] = useState(0);
  const [shieldedDays, setShieldedDays] = useState([]);
  const [seenOnboarding, setSeenOnboarding] = useState(false);
  const [stats, setStats] = useState({ boxesOpened: 0, maxCrit: 0, shieldsUsed: 0, maxCheckin: 0 });
  const [checkInModal, setCheckInModal] = useState(null);
  const [boxState, setBoxState] = useState(null); // { result: null | lootResult }
  const [pendingBoxes, setPendingBoxes] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [screenFlash, setScreenFlash] = useState(0);
  const shownMilestoneRef = useRef(null);
  const toastTimerRef = useRef(null);
  const checkInDoneRef = useRef(false);
  const shieldCheckedRef = useRef(false);

  const triggerFloat = (text, sub) => {
    const id = Date.now() + Math.random();
    setFloats((f) => [...f, { id, text, sub }]);
    setTimeout(() => {
      setFloats((f) => f.filter((item) => item.id !== id));
    }, 1500);
  };

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
        setSpentPoints(parsed.spentPoints || 0);
        setShopItems(parsed.shopItems || DEFAULT_SHOP_ITEMS);
        setPurchaseHistory(parsed.purchaseHistory || []);
        // addiction-layer keys (default when absent — backward compatible)
        setBonusBank(parsed.bonusBank || 0);
        setCheckIn(parsed.checkIn || { lastDate: null, chain: 0 });
        setUnlockedAch(parsed.unlockedAch || []);
        setShields(parsed.shields || 0);
        setShieldedDays(parsed.shieldedDays || []);
        setSeenOnboarding(!!parsed.seenOnboarding);
        setStats({ boxesOpened: 0, maxCrit: 0, shieldsUsed: 0, maxCheckin: 0, ...(parsed.stats || {}) });
        setPendingBoxes(parsed.pendingBoxes || 0);
      }
    } catch (e) {
      // no saved data yet, or it was corrupted, so defaults already in state
    } finally {
      setLoading(false);
    }
  }, []);

  // single autosave: persist whenever any saved slice changes
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          days,
          settings,
          rewards,
          spentPoints,
          shopItems,
          purchaseHistory,
          bonusBank,
          checkIn,
          unlockedAch,
          shields,
          shieldedDays,
          seenOnboarding,
          stats,
          pendingBoxes,
        })
      );
    } catch (e) {
      /* storage unavailable or full, fail silently */
    }
  }, [loading, days, settings, rewards, spentPoints, shopItems, purchaseHistory, bonusBank, checkIn, unlockedAch, shields, shieldedDays, seenOnboarding, stats, pendingBoxes]);

  const fireToast = (msg) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };

  const fireConfetti = () => setConfettiTick((t) => t + 1);
  const fireFlash = () => setScreenFlash((t) => t + 1);

  // award non-task points (check-ins, crits, loot, achievements)
  const addBonus = (amount, text, sub) => {
    if (amount > 0) setBonusBank((b) => b + amount);
    if (text) triggerFloat(text, sub);
  };

  const shieldedSet = new Set(shieldedDays);
  const todayKey = fmtDateKey(selectedDate);
  const today = days[todayKey] || blankDay();
  const total = computeTotal(days) + computeStreakBonuses(days) + bonusBank;
  const lvl = levelInfo(total);
  const currentStreak = computeCurrentStreak(days, shieldedSet);
  const longestStreak = computeLongestStreak(days, shieldedSet);

  const applyDayUpdate = (updatedToday) => {
    const recalced = recalcDay(updatedToday, settings);
    const prevDay = days[todayKey] || blankDay();
    const newDays = { ...days, [todayKey]: recalced };

    const prevTotal = computeTotal(days) + computeStreakBonuses(days);
    const newTotal = computeTotal(newDays) + computeStreakBonuses(newDays);
    const prevLevel = levelInfo(prevTotal).level;
    const newLevel = levelInfo(newTotal).level;

    setDays(newDays);

    const gain = newTotal - prevTotal;
    if (gain > 0) {
      const phrases = ["DISCIPLINE UNLOCKED!", "UNSTOPPABLE!", "DOPAMINE BURST!", "KEEP GRINDING!", "FOCUS ACTIVE!", "PURE EFFORT!", "BEAST MODE!"];
      // variable-ratio crit roll on every point gain
      if (Math.random() < CRIT_CHANCE) {
        const c = rollWeighted(CRIT_TABLE);
        const extra = gain * (c.mult - 1);
        addBonus(extra, `${c.label}!`, `+${gain + extra} PTS`);
        sound.crit(c.mult);
        fireConfetti();
        fireFlash();
        setStats((s) => ({ ...s, maxCrit: Math.max(s.maxCrit, c.mult) }));
      } else {
        const sub = phrases[Math.floor(Math.random() * phrases.length)];
        triggerFloat(`+${gain} PTS`, sub);
        fireConfetti();
      }
    }

    const becamePerfect = !prevDay.perfectDay && recalced.perfectDay;

    if (becamePerfect) {
      sound.fanfare();
      fireConfetti();
      fireToast("🔥 Perfect day, every box checked");
    } else {
      sound.tick();
    }

    if (newLevel > prevLevel) {
      setLevelUp({ level: newLevel, title: levelInfo(newTotal).title });
      sound.levelup();
      fireConfetti();
    }

    // streak milestone check + chance of a mystery box drop (only on a fresh perfect day)
    if (becamePerfect) {
      const nextShielded = new Set(shieldedDays);
      const streakAfter = computeCurrentStreak(newDays, nextShielded);
      const hit = STREAK_MILESTONES.find((m) => m === streakAfter);
      if (hit && shownMilestoneRef.current !== `${todayKey}-${hit}`) {
        shownMilestoneRef.current = `${todayKey}-${hit}`;
        setTimeout(() => fireToast(`🔥 ${hit}-day streak, don't break it now`), 900);
      }
      // ~35% chance a perfect day drops a mystery box
      if (Math.random() < 0.35) {
        setPendingBoxes((n) => n + 1);
        setTimeout(() => fireToast("📦 A Mystery Box dropped! Tap it to open."), 1400);
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

  const confirmMetricTask = (taskKey, metricField, isChecked, metricValue) => {
    const cur = days[todayKey] || blankDay();
    const updated = {
      ...cur,
      [taskKey]: isChecked,
      [metricField]: isChecked ? Math.max(0, metricValue) : 0
    };
    applyDayUpdate(updated);
    if (isChecked) sound.success();
    else sound.undo();
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
    fireToast("Settings saved");
  };

  const toggleSound = () => {
    const next = { ...settings, soundOn: !settings.soundOn };
    setSettings(next);
  };

  const claimReward = (id) => {
    const next = rewards.map((r) => (r.id === id ? { ...r, claimed: true } : r));
    setRewards(next);
    sound.fanfare();
    fireConfetti();
    const r = rewards.find((r) => r.id === id);
    triggerFloat("REWARD CLAIMED!", r?.text);
    fireToast(`🏆 Claimed: ${r?.text || "reward"}`);
  };

  const addReward = ({ text, points }) => {
    const next = [...rewards, { id: `r${Date.now()}`, text, points, claimed: false }];
    setRewards(next);
  };

  const deleteReward = (id) => {
    const next = rewards.filter((r) => r.id !== id);
    setRewards(next);
  };

  const buyShopItem = (item) => {
    const balance = total - spentPoints;
    if (balance < item.points) {
      sound.fail();
      fireToast("⚠️ Insufficient liquid points!");
      return;
    }

    const nextSpent = spentPoints + item.points;
    const nextHistory = [
      {
        id: `p${Date.now()}`,
        itemId: item.id,
        text: item.text,
        points: item.points,
        color: item.color,
        date: new Date().toISOString()
      },
      ...purchaseHistory
    ];

    setSpentPoints(nextSpent);
    setPurchaseHistory(nextHistory);

    sound.purchase();
    fireConfetti();
    triggerFloat("LOOT REDEEMED!", item.text);
    setAcquiredItem(item);
  };

  const addShopItem = ({ text, points, color }) => {
    const nextItems = [
      ...shopItems,
      {
        id: `s${Date.now()}`,
        text,
        points,
        color
      }
    ];
    setShopItems(nextItems);
    sound.success();
    fireToast(`Added "${text}" to dispensary`);
  };

  const deleteShopItem = (id) => {
    const nextItems = shopItems.filter((i) => i.id !== id);
    setShopItems(nextItems);
    sound.undo();
    fireToast("Removed item from dispensary");
  };

  const resetAllData = () => {
    setDays({});
    setSettings(DEFAULT_SETTINGS);
    setRewards(DEFAULT_REWARDS);
    setSpentPoints(0);
    setShopItems(DEFAULT_SHOP_ITEMS);
    setPurchaseHistory([]);
    setBonusBank(0);
    setCheckIn({ lastDate: null, chain: 0 });
    setUnlockedAch([]);
    setShields(0);
    setShieldedDays([]);
    setSeenOnboarding(false);
    setStats({ boxesOpened: 0, maxCrit: 0, shieldsUsed: 0, maxCheckin: 0 });
    setPendingBoxes(0);
    setCheckInModal(null);
    setBoxState(null);
    checkInDoneRef.current = false;
    shownMilestoneRef.current = null;
    // autosave effect will write the cleared state
    sound.fail();
    fireToast("Console reset successfully! Starting fresh.");
  };

  /* ----- addiction-layer effects & handlers ----- */

  // live clock for the streak countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // streak shield auto-consume: bridge a single missed day if a shield is held
  useEffect(() => {
    if (loading || shieldCheckedRef.current) return;
    shieldCheckedRef.current = true;
    if (shields <= 0) return;
    const mk = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return fmtDateKey(d); };
    const sSet = new Set(shieldedDays);
    const counts = (k) => (days[k] && days[k].perfectDay) || sSet.has(k);
    const todayK = mk(0), yK = mk(1), dbyK = mk(2);
    if (!counts(todayK) && !counts(yK) && counts(dbyK)) {
      const saved = computeCurrentStreak(days, new Set([...shieldedDays, yK]));
      setShieldedDays((arr) => [...arr, yK]);
      setShields((x) => Math.max(0, x - 1));
      setStats((s) => ({ ...s, shieldsUsed: s.shieldsUsed + 1 }));
      setTimeout(() => fireToast(`🛡️ Streak Shield used — your ${saved}-day streak survived!`), 700);
      sound.fanfare();
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // daily check-in evaluation (once after load)
  useEffect(() => {
    if (loading || checkInDoneRef.current) return;
    checkInDoneRef.current = true;
    const todayK = fmtDateKey(new Date());
    if (checkIn.lastDate === todayK) return; // already claimed today
    let broken = false;
    let newChain;
    if (!checkIn.lastDate) {
      newChain = 1;
    } else {
      const diff = Math.round(
        (new Date(todayK + "T00:00:00") - new Date(checkIn.lastDate + "T00:00:00")) / 86400000
      );
      if (diff === 1) newChain = checkIn.chain + 1;
      else { broken = checkIn.chain > 1; newChain = 1; }
    }
    const r = CHECKIN_REWARDS[checkinSlot(newChain)];
    const reward = r.base + randInt(0, r.jitter);
    const welcome = !seenOnboarding && !checkIn.lastDate;
    setCheckInModal({
      chain: newChain,
      reward,
      broken: broken && !welcome,
      prevChain: checkIn.chain,
      welcome,
      grantBox: !!r.box,
      grantShield: !!r.shield,
    });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // achievement unlock detector
  useEffect(() => {
    if (loading) return;
    const dayVals = Object.values(days);
    const statObj = {
      total,
      level: lvl.level,
      currentStreak,
      longestStreak,
      perfectDays: dayVals.filter((d) => d.perfectDay).length,
      maxRunKm: dayVals.reduce((m, d) => Math.max(m, d.runKm || 0), 0),
      maxJobs: dayVals.reduce((m, d) => Math.max(m, d.jobsCount || 0), 0),
      claimedRewards: rewards.filter((r) => r.claimed).length,
      purchases: purchaseHistory.length,
      maxCheckin: stats.maxCheckin,
      boxesOpened: stats.boxesOpened,
      maxCrit: stats.maxCrit,
      shieldsUsed: stats.shieldsUsed,
    };
    const newly = ACHIEVEMENTS.filter((a) => !unlockedAch.includes(a.id) && a.test(statObj));
    if (newly.length) {
      setUnlockedAch((prev) => [...prev, ...newly.map((a) => a.id)]);
      const reward = newly.reduce((s, a) => s + (a.reward || 0), 0);
      if (reward > 0) setBonusBank((b) => b + reward);
      newly.forEach((a, i) => setTimeout(() => fireToast(`🏅 Achievement: ${a.label} (+${a.reward})`), 500 + i * 1300));
      sound.fanfare();
      fireConfetti();
    }
  }, [loading, total, lvl.level, currentStreak, longestStreak, days, rewards, purchaseHistory, stats, unlockedAch]); // eslint-disable-line react-hooks/exhaustive-deps

  const claimCheckIn = () => {
    const m = checkInModal;
    if (!m) return;
    addBonus(m.reward, `+${m.reward} PTS`, m.welcome ? "WELCOME BONUS" : `DAY ${m.chain} CHECK-IN`);
    setCheckIn({ lastDate: fmtDateKey(new Date()), chain: m.chain });
    setStats((s) => ({ ...s, maxCheckin: Math.max(s.maxCheckin, m.chain) }));
    if (m.grantShield) setShields((x) => x + 1);
    if (m.grantBox) setPendingBoxes((n) => n + 1);
    if (m.welcome) setSeenOnboarding(true);
    sound.fanfare();
    fireConfetti();
    setCheckInModal(null);
  };

  const tapMysteryBox = () => {
    if (pendingBoxes <= 0) return;
    setBoxState({ result: null });
    sound.tick();
  };

  const openMysteryBox = () => {
    const loot = rollWeighted(LOOT_TABLE);
    const result = { ...loot };
    if (loot.kind === "points") {
      const amt = randInt(loot.min, loot.max);
      result.amountText = `+${amt} pts`;
      setBonusBank((b) => b + amt);
    } else if (loot.kind === "shield") {
      setShields((x) => x + loot.amount);
      result.amountText = `+${loot.amount} streak shield`;
    } else if (loot.kind === "box") {
      setPendingBoxes((n) => n + loot.amount);
      result.amountText = `+${loot.amount} mystery box`;
    }
    setPendingBoxes((n) => Math.max(0, n - 1)); // consume the opened box
    setStats((s) => ({ ...s, boxesOpened: s.boxesOpened + 1 }));
    sound.purchase();
    fireConfetti();
    setBoxState({ result });
  };

  const collectMysteryBox = () => {
    setBoxState(null);
    sound.success();
  };

  // time remaining until local midnight (for the streak countdown)
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msLeft = midnight - now;
  const hoursLeft = Math.floor(msLeft / 3600000);
  const minsLeft = Math.floor((msLeft % 3600000) / 60000);
  const todayPerfect = (days[fmtDateKey(new Date())] || {}).perfectDay;
  const streakAtRisk = currentStreak > 0 && !todayPerfect;
  const urgentRisk = streakAtRisk && hoursLeft < 3;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center bg-neutral-950">
        <div className="font-mono text-sm text-neutral-500">booting grind ops...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full pb-24 text-neutral-100"
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
        @keyframes float-up-fade {
          0% { transform: translate(-50%, -40%) scale(0.85); opacity: 0; }
          15% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -135%) scale(1); opacity: 0; }
        }
        @keyframes screen-flash {
          0% { opacity: 0; }
          30% { opacity: 0.55; }
          100% { opacity: 0; }
        }
        .screen-flash { animation: screen-flash 0.5s ease-out forwards; }
        @keyframes crate-bob {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50% { transform: translateY(-8px) rotate(3deg); }
        }
        .crate-bob { animation: crate-bob 1.4s ease-in-out infinite; }
      `}</style>

      {/* CRIT SCREEN FLASH */}
      {screenFlash > 0 && (
        <div key={screenFlash} className="screen-flash pointer-events-none fixed inset-0 z-[55] bg-gradient-to-br from-amber-400/40 via-rose-500/30 to-violet-500/40" />
      )}

      {/* DAILY CHECK-IN */}
      <DailyCheckInModal data={checkInModal} onClaim={claimCheckIn} />

      {/* MYSTERY BOX */}
      <MysteryBoxModal
        open={!!boxState}
        result={boxState?.result}
        onOpen={openMysteryBox}
        onClose={collectMysteryBox}
      />

      {/* FLOATING MYSTERY BOX CRATE (tap to open) */}
      {pendingBoxes > 0 && !boxState && !checkInModal && (
        <button
          onClick={tapMysteryBox}
          className="fixed bottom-24 right-4 z-[75] flex flex-col items-center gap-1 rounded-2xl border-2 border-violet-400 bg-neutral-950/90 p-3 shadow-[0_0_30px_rgba(167,139,250,0.5)] backdrop-blur transition-transform active:scale-90"
        >
          <span className="crate-bob text-violet-300"><Package className="h-8 w-8" /></span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-violet-300">
            Open{pendingBoxes > 1 ? ` ×${pendingBoxes}` : ""}
          </span>
          <span className="absolute -right-1 -top-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
          </span>
        </button>
      )}

      <ConfettiBurst key={confettiTick} active={confettiTick > 0} />
      <Toast toast={toast} />
      <LevelUpFlash data={levelUp} onClose={() => setLevelUp(null)} />

      {/* FLOATING TEXT CONTAINER */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {floats.map((f) => (
          <div
            key={f.id}
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center animate-[float-up-fade_1.5s_ease-out_forwards] pointer-events-none"
          >
            <span className="font-display text-3xl font-extrabold tracking-wider text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.95)] sm:text-4xl">
              {f.text}
            </span>
            {f.sub && (
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-teal-300 drop-shadow-[0_0_12px_rgba(45,212,191,0.85)] sm:text-xs">
                {f.sub}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* LOOT ACQUIRED DOPAMINE POPUP */}
      {acquiredItem && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md transition-all duration-500">
          <div className="relative flex w-full max-w-sm flex-col items-center rounded-3xl border border-amber-500/40 bg-neutral-950 p-8 text-center shadow-[0_0_60px_rgba(245,158,11,0.25)] animate-[levelup-pop-in_0.5s_cubic-bezier(.34,1.56,.64,1)]">
            <div className="absolute inset-0 -z-10 animate-spin bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.15),transparent_60%)] opacity-80" style={{ animationDuration: "12s" }} />

            <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-400/10 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-bounce">
              {React.createElement(getShopItemIcon(acquiredItem.text), { className: "h-10 w-10" })}
            </span>

            <div className="font-mono text-xs uppercase tracking-[0.3em] text-amber-500">grind dispensary // drop claim</div>
            
            <h2 className="mt-2 text-2xl font-extrabold text-neutral-100 tracking-tight">
              {acquiredItem.text}
            </h2>
            
            <p className="mt-3 max-w-xs font-mono text-[10px] text-neutral-500 leading-relaxed">
              Points successfully converted into life rewards. Maintain your discipline to earn more items.
            </p>

            <div className="mt-6 flex items-center justify-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/50 px-4 py-1.5">
              <Coins className="h-3.5 w-3.5 text-amber-500 animate-spin" />
              <span className="font-mono text-xs text-neutral-300">-{acquiredItem.points} pts</span>
            </div>

            <button
              onClick={() => {
                setAcquiredItem(null);
                sound.success();
              }}
              className="mt-8 w-full rounded-2xl bg-amber-400 py-3 text-sm font-extrabold uppercase tracking-widest text-neutral-950 shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all hover:scale-105 active:scale-95"
            >
              CLAIM DROP
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md px-4 pt-6 sm:max-w-lg pb-12">
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

        {/* TAB SWITCHER */}
        {activeTab === "console" ? (
          <>
            {/* TICKER + STREAK */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex flex-col gap-1">
                <Ticker value={total} />
                <div className="flex items-center gap-1 font-mono text-[10px] text-neutral-500">
                  <Coins className="h-3 w-3 text-amber-500" />
                  <span>Liquid Spendable: <span className="font-semibold text-neutral-300">{total - spentPoints} pts</span></span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-black/40 px-3 py-1.5">
                  <Flame className={`h-4 w-4 ${currentStreak > 0 ? "flame-flicker text-amber-400" : "text-neutral-600"}`} />
                  <span className="font-mono text-sm text-neutral-200">{currentStreak}d</span>
                  {longestStreak > currentStreak && (
                    <span className="font-mono text-[10px] text-neutral-500">best {longestStreak}d</span>
                  )}
                </div>
                <div
                  title={`${shields} streak shield${shields === 1 ? "" : "s"} — auto-saves your streak if you miss a day`}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 ${
                    shields > 0 ? "border-sky-400/50 bg-sky-400/10 text-sky-300" : "border-neutral-800 bg-black/40 text-neutral-600"
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span className="font-mono text-sm">{shields}</span>
                </div>
              </div>
            </div>

            {/* STREAK AT-RISK COUNTDOWN */}
            {streakAtRisk && (
              <div
                className={`mb-5 flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${
                  urgentRisk
                    ? "animate-pulse border-rose-500/60 bg-rose-500/10 shadow-[0_0_24px_rgba(244,63,94,0.25)]"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <Clock className={`h-5 w-5 shrink-0 ${urgentRisk ? "text-rose-400" : "text-amber-400"}`} />
                <div className="min-w-0">
                  <div className={`font-display text-sm font-bold ${urgentRisk ? "text-rose-300" : "text-amber-300"}`}>
                    {urgentRisk
                      ? `🚨 STREAK AT RISK — don't throw away ${currentStreak} days`
                      : `${hoursLeft}h ${minsLeft}m left to keep your ${currentStreak}-day streak alive`}
                  </div>
                  <div className="font-mono text-[10px] text-neutral-400">
                    Finish every task today before midnight{shields > 0 ? " · or a 🛡️ shield will save you" : ""}.
                  </div>
                </div>
              </div>
            )}

            {/* LEVEL PROGRESS */}
            <div className="mb-6">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-neutral-500">
                <span>{lvl.into} / {LEVEL_STEP} to next level</span>
                <span>{Math.round(lvl.pct)}%</span>
              </div>
              <div className="relative h-1.5 w-full rounded-full bg-neutral-800">
                <div
                  className="relative h-1.5 rounded-full bg-gradient-to-r from-teal-400 via-violet-400 to-amber-400 transition-all duration-700"
                  style={{ width: `${lvl.pct}%` }}
                >
                  {lvl.pct > 0 && (
                    <span className="absolute -right-1 -top-[3px] flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_10px_#fbbf24]"></span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* CALENDAR HISTORY PANEL */}
            <CalendarPanel
              days={days}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            {/* TODAY HABITS */}
            <div className="mb-7">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-neutral-300">
                  {selectedDate.toDateString() === new Date().toDateString() ? "Today" : selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·
                </h2>
                <span className="font-mono text-xs text-neutral-500">
                  {TASK_DEFS.map((def) => today[def.key]).filter(Boolean).length}/{TASK_DEFS.length}
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
                    onTierSelect={selectVideoStage}
                    onMetricConfirm={confirmMetricTask}
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

            {/* STREAK BONUS MILESTONES */}
            <div className="mb-8 border-b border-neutral-900 pb-8">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-neutral-300">
                <Flame className="h-4 w-4 text-amber-400" /> Streak Milestones
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {STREAK_BONUSES.map((b) => {
                  const active = currentStreak >= b.day;
                  return (
                    <div
                      key={b.day}
                      className={`flex flex-col justify-between p-3 rounded-xl border transition-all ${
                        active 
                          ? "border-amber-400/50 bg-amber-400/5 shadow-[0_0_15px_rgba(251,191,36,0.06)]"
                          : "border-neutral-800/80 bg-neutral-950/20 opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Flame className={`h-3.5 w-3.5 ${active ? "text-amber-400 flame-flicker" : "text-neutral-600"}`} />
                        <span className={`text-xs font-semibold ${active ? "text-neutral-200" : "text-neutral-400"}`}>
                          {b.day}d Streak
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[9px] text-neutral-500 uppercase tracking-wider">{b.label}</span>
                        <span className={`font-mono text-xs font-bold ${active ? "text-amber-400" : "text-neutral-500"}`}>
                          +{b.points} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ACHIEVEMENTS / BADGES */}
            <div className="mb-8 border-b border-neutral-900 pb-8">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-neutral-300">
                <Medal className="h-4 w-4 text-amber-400" /> Badges
              </h2>
              <AchievementsPanel unlocked={unlockedAch} />
            </div>

            {/* CHECKPOINTS */}
            <div className="mb-10">
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-neutral-300">
                <Trophy className="h-3.5 w-3.5 text-amber-400" /> Checkpoints
              </h2>
              <Checkpoints rewards={rewards} total={total} onClaim={claimReward} onAdd={addReward} onDelete={deleteReward} />
            </div>
          </>
        ) : (
          <DispensaryView
            balance={total - spentPoints}
            shopItems={shopItems}
            purchaseHistory={purchaseHistory}
            onBuy={buyShopItem}
            onAdd={addShopItem}
            onDelete={deleteShopItem}
          />
        )}

        <p className="pb-8 text-center font-mono text-[10px] text-neutral-600">
          saved automatically to this browser
        </p>
      </div>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4">
        <div className="flex items-center gap-4 rounded-full border border-neutral-800 bg-neutral-950/90 px-4 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.7)] backdrop-blur-md sm:gap-6 sm:px-6 sm:py-3">
          <button
            onClick={() => {
              setActiveTab("console");
              sound.tick();
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all duration-300 active:scale-95 sm:gap-2 sm:px-4 sm:text-xs ${
              activeTab === "console"
                ? "bg-gradient-to-r from-teal-400 to-violet-500 text-neutral-950 shadow-[0_0_15px_rgba(45,212,191,0.4)]"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Compass className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Console
          </button>
          
          {/* Persistent points divider */}
          <div className="flex flex-col items-center justify-center border-l border-r border-neutral-800 px-2 sm:px-4">
            <span className="font-mono text-xs font-black text-amber-400 sm:text-sm animate-[pulse_2s_infinite]">{total}</span>
            <span className="font-mono text-[7px] uppercase tracking-wider text-neutral-500 sm:text-[9px]">PTS</span>
          </div>

          <button
            onClick={() => {
              setActiveTab("dispensary");
              sound.tick();
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all duration-300 active:scale-95 sm:gap-2 sm:px-4 sm:text-xs ${
              activeTab === "dispensary"
                ? "bg-gradient-to-r from-amber-400 to-rose-500 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Dispensary
          </button>
        </div>
      </div>

      <SettingsDrawer
        settings={settings}
        onChange={updateSettings}
        soundOn={settings.soundOn}
        onSoundToggle={toggleSound}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onResetAllData={resetAllData}
        totalPoints={total}
      />
    </div>
  );
}
