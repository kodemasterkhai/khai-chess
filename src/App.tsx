import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import "./App.css";
import { PUZZLES, type WeeklyPuzzle } from "./puzzles";
import { supabase } from "./supabase";

type Color = "w" | "b";

type LeaderEntry = {
  id: number;
  week_key: string;
  name: string;
  time_ms: number;
  mistakes: number;
  created_at: string;
};

type HintStage = 0 | 1 | 2;

type BgTheme = "bg-neo" | "bg-midnight" | "bg-carbon";
type BoardTheme = "board-classic" | "board-emerald" | "board-royal" | "board-sand";

function yyyyMmDd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getWeekKey(date: Date) {
  const dt = new Date(date);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return yyyyMmDd(dt);
}

function pickWeeklyPuzzle(weekKey: string): WeeklyPuzzle {
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) hash = (hash * 31 + weekKey.charCodeAt(i)) >>> 0;
  return PUZZLES[hash % PUZZLES.length];
}

function sqName(r: number, c: number) {
  return "abcdefgh"[c] + String(8 - r);
}

function coordsFromSq(sq: string) {
  const files = "abcdefgh";
  return { r: 8 - Number(sq[1]), c: files.indexOf(sq[0]) };
}

function pieceToUnicode(p: { type: string; color: Color } | null): string {
  if (!p) return "";
  const map: Record<Color, Record<string, string>> = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }
  };
  return map[p.color][p.type];
}

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function clampName(s: string) {
  return s.trim().slice(0, 24);
}

function parseUci(uci: string) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length >= 5 ? uci[4] : undefined;
  return { from, to, promotion };
}

export default function App() {
  const weekKey = useMemo(() => getWeekKey(new Date()), []);
  const puzzle = useMemo(() => pickWeeklyPuzzle(weekKey), [weekKey]);

  const REQUIRED_PLAYER_MOVES = 5;

  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [playerMoveIndex, setPlayerMoveIndex] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);

  const startRef = useRef<number | null>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [hintStage, setHintStage] = useState<HintStage>(0);

  const [bgTheme, setBgTheme] = useState<BgTheme>("bg-neo");
  const [boardTheme, setBoardTheme] = useState<BoardTheme>("board-classic");

  useEffect(() => {
    const i = setInterval(() => {
      if (startRef.current && !done) setTimeMs(Date.now() - startRef.current);
    }, 200);
    return () => clearInterval(i);
  }, [done]);

  function startTimerIfNeeded() {
    if (!startRef.current) startRef.current = Date.now();
  }

  const nextPlayerUci = useMemo(() => {
    const idx = playerMoveIndex * 2;
    return puzzle.solution[idx] || "";
  }, [playerMoveIndex, puzzle.solution]);

  function tryPlayerMove(from: string, to: string) {
    if (done) return;

    const attempted = game.move({ from, to, promotion: "q" } as any);
    if (!attempted) return;

    startTimerIfNeeded();

    const uci = (attempted.from + attempted.to).toLowerCase();
    const expected = nextPlayerUci.toLowerCase();

    if (uci !== expected) {
      game.undo();
      setGame(new Chess(game.fen()));
      setMistakes(m => m + 1);
      setHintStage(0);
      return;
    }

    const nextIdx = playerMoveIndex + 1;
    const g = new Chess(game.fen());
    const oppIdx = nextIdx * 2 - 1;
    const oppMove = puzzle.solution[oppIdx];
    if (oppMove) {
      const { from, to, promotion } = parseUci(oppMove);
      g.move({ from, to, promotion: promotion ?? "q" } as any);
    }

    setGame(g);
    setSelected(null);
    setHintStage(0);
    setPlayerMoveIndex(nextIdx);

    if (nextIdx >= REQUIRED_PLAYER_MOVES) setDone(true);
  }

  const board = useMemo(() => {
    const b: any[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) b[r][c] = game.get(sqName(r, c));
    }
    return b;
  }, [game]);

  return (
    <div className={`page ${bgTheme}`}>
      <div className="shell">
        <div className="boardWrap">
          <div className={`board ${boardTheme}`}>
            {board.map((row, r) =>
              row.map((cell, c) => (
                <div
                  key={r + "-" + c}
                  className={`square ${(r + c) % 2 ? "dark" : "light"}`}
                  onClick={() => {
                    const sq = sqName(r, c);
                    if (!selected && cell && cell.color === (game.turn() as any)) {
                      setSelected({ r, c });
                    } else if (selected) {
                      tryPlayerMove(sqName(selected.r, selected.c), sq);
                      setSelected(null);
                    }
                  }}
                >
                  {pieceToUnicode(cell)}
                </div>
              ))
            )}
          </div>

          <div className="footerHint">
            Custom chess puzzle engine built from scratch in VS Code. Deployed on Vercel, powered by Supabase SQL — real-time game logic, automated move validation, and global leaderboard tracking.
          </div>
        </div>
      </div>
    </div>
  );
}