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
  const day = dt.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
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

  // You make exactly 5 moves. Opponent auto-replies after each correct move (4 replies total).
  const REQUIRED_PLAYER_MOVES = 5;

  const [game, setGame] = useState(() => new Chess(puzzle.fen));
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);

  const [playerMoveIndex, setPlayerMoveIndex] = useState(0); // 0..4
  const [mistakes, setMistakes] = useState(0);
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);

  // Timer: starts on FIRST LEGAL attempt and updates in the background
  const startRef = useRef<number | null>(null);
  const [timeMs, setTimeMs] = useState(0);

  const [hintStage, setHintStage] = useState<HintStage>(0);

  // Themes (saved)
  const [bgTheme, setBgTheme] = useState<BgTheme>("bg-neo");
  const [boardTheme, setBoardTheme] = useState<BoardTheme>("board-classic");

  // Load saved themes + name
  useEffect(() => {
    const savedBg = (localStorage.getItem("khai_bg_theme") as BgTheme) || "bg-neo";
    const savedBoard = (localStorage.getItem("khai_board_theme") as BoardTheme) || "board-classic";
    const savedName = localStorage.getItem("khai_player_name") || "";
    setBgTheme(savedBg);
    setBoardTheme(savedBoard);
    setName(savedName);
  }, []);

  useEffect(() => localStorage.setItem("khai_bg_theme", bgTheme), [bgTheme]);
  useEffect(() => localStorage.setItem("khai_board_theme", boardTheme), [boardTheme]);
  useEffect(() => localStorage.setItem("khai_player_name", name), [name]);

  // Timer tick
  useEffect(() => {
    const i = setInterval(() => {
      if (startRef.current && !done) setTimeMs(Date.now() - startRef.current);
    }, 200);
    return () => clearInterval(i);
  }, [done]);

  // Load leaderboard
  useEffect(() => {
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLeaderboard() {
    const { data, error } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("week_key", weekKey)
      .order("time_ms", { ascending: true })
      .limit(10);

    if (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      setLeaderboard([]);
      return;
    }

    setLeaderboard((data as LeaderEntry[]) || []);
  }

  function restartPuzzle() {
    setGame(new Chess(puzzle.fen));
    setSelected(null);
    setPlayerMoveIndex(0);
    setMistakes(0);
    setDone(false);
    setHintStage(0);
    startRef.current = null;
    setTimeMs(0);
  }

  function startTimerIfNeeded() {
    if (!startRef.current) startRef.current = Date.now();
  }

  // Next expected player move = solution[playerMoveIndex*2]
  const nextPlayerUci = useMemo(() => {
    const idx = playerMoveIndex * 2;
    return puzzle.solution[idx] || "";
  }, [playerMoveIndex, puzzle.solution]);

  // Hint squares for NEXT player move
  const hintSquares = useMemo(() => {
    if (done) return null;
    if (!nextPlayerUci || nextPlayerUci.length < 4) return null;
    const { from, to } = parseUci(nextPlayerUci);
    return { from, to };
  }, [done, nextPlayerUci]);

  const hintCoords = useMemo(() => {
    if (!hintSquares) return null;
    return { from: coordsFromSq(hintSquares.from), to: coordsFromSq(hintSquares.to) };
  }, [hintSquares]);

  function applyOpponentMoveIfExists(nextPlayerIdx: number, g: Chess) {
    // Opponent reply after player move #n is index (n*2 - 1)
    const oppIdx = nextPlayerIdx * 2 - 1;
    const uci = puzzle.solution[oppIdx];
    if (!uci) return;

    const { from, to, promotion } = parseUci(uci);
    g.move({ from, to, promotion: promotion ?? "q" } as any);
  }

  function tryPlayerMove(from: string, to: string) {
    if (done) return;

    const attempted = game.move({ from, to, promotion: "q" } as any);
    if (!attempted) return; // illegal move

    // Start timer on first LEGAL attempt (even if wrong)
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

    // After correct move, apply opponent reply instantly
    const g = new Chess(game.fen());
    applyOpponentMoveIfExists(nextIdx, g);

    setGame(g);
    setSelected(null);
    setHintStage(0);
    setPlayerMoveIndex(nextIdx);

    if (nextIdx >= REQUIRED_PLAYER_MOVES) setDone(true);
  }

  async function submitScore() {
    const finalName = clampName(name);
    if (!done || !finalName) return;

    await supabase.from("leaderboard").insert({
      week_key: weekKey,
      name: finalName,
      time_ms: timeMs,
      mistakes
    });

    loadLeaderboard();
  }

  const board = useMemo(() => {
    const b: any[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) b[r][c] = game.get(sqName(r, c));
    }
    return b;
  }, [game]);

  const statusText = useMemo(() => {
    if (done) return "✅ Solved";
    return `Your move ${playerMoveIndex + 1}/${REQUIRED_PLAYER_MOVES} • ${game.turn() === "w" ? "White" : "Black"} to move`;
  }, [done, game, playerMoveIndex]);

  return (
    <div className={`page ${bgTheme}`}>
      <div className="shell">
        <header className="top">
          <div className="brand">
            <div className="logo">KD</div>
            <div>
              <div className="title">Khai’s Weekly Chess Puzzle</div>
              <div className="sub">You move. Opponent replies instantly. 5 moves to finish.</div>
            </div>
          </div>

          <div className="meta">
            <div className="pill">{statusText}</div>
            <div className="pill">⏱ {formatTime(timeMs)}</div>
            <button className="btn" onClick={restartPuzzle}>Restart</button>
          </div>
        </header>

        <main className="grid">
          <section className="panel">
            <div className="panelTitle">Controls</div>

            <div className="row">
              <div className="label">Hint</div>
              <div className="value">
                <button
                  className="btnWide"
                  disabled={done || !hintSquares}
                  onClick={() => setHintStage(s => (s === 0 ? 1 : s === 1 ? 2 : 0))}
                >
                  {hintStage === 0 ? "Show hint (piece)" : hintStage === 1 ? "Show hint (square)" : "Hide hint"}
                </button>

                {hintSquares && hintStage > 0 && (
                  <div className="hintText">
                    {hintStage === 1 ? <>Move the highlighted piece.</> : <>Move it to the highlighted square.</>}
                  </div>
                )}
              </div>
            </div>

            <div className="row">
              <div className="label">Your name</div>
              <div className="value">
                <input
                  className="input"
                  placeholder="Name (emojis allowed)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <div className="micro">Saved locally so you don’t retype.</div>
              </div>
            </div>

            <div className="row">
              <div className="label">Mistakes</div>
              <div className="value">
                <div className="bigNum">{mistakes}</div>
              </div>
            </div>

            <div className="divider" />

            <div className="panelTitle">Style</div>

            <div className="row">
              <div className="label">Background</div>
              <div className="value">
                <select className="select" value={bgTheme} onChange={e => setBgTheme(e.target.value as BgTheme)}>
                  <option value="bg-neo">Neo Night</option>
                  <option value="bg-midnight">Midnight Lux</option>
                  <option value="bg-carbon">Carbon</option>
                </select>
              </div>
            </div>

            <div className="row">
              <div className="label">Board</div>
              <div className="value">
                <select className="select" value={boardTheme} onChange={e => setBoardTheme(e.target.value as BoardTheme)}>
                  <option value="board-classic">Classic</option>
                  <option value="board-emerald">Emerald</option>
                  <option value="board-royal">Royal</option>
                  <option value="board-sand">Sand</option>
                </select>
              </div>
            </div>

            <div className="divider" />

            {done && (
              <div className="submit">
                <button className="btnGold" onClick={submitScore}>
                  Submit to Leaderboard
                </button>
                <div className="micro">Submits time + mistakes for this week.</div>
              </div>
            )}
          </section>

          <section className="boardWrap">
            <div className={`board ${boardTheme}`}>
              {board.map((row, r) =>
                row.map((cell, c) => {
                  const isHintFrom =
                    !!hintCoords && hintStage >= 1 && hintCoords.from.r === r && hintCoords.from.c === c;
                  const isHintTo =
                    !!hintCoords && hintStage >= 2 && hintCoords.to.r === r && hintCoords.to.c === c;

                  return (
                    <div
                      key={r + "-" + c}
                      className={[
                        "square",
                        (r + c) % 2 ? "dark" : "light",
                        selected?.r === r && selected?.c === c ? "selected" : "",
                        isHintFrom ? "hintFrom" : "",
                        isHintTo ? "hintTo" : ""
                      ].join(" ")}
                      onClick={() => {
                        const sq = sqName(r, c);
                        if (!selected && cell && cell.color === (game.turn() as any)) {
                          setSelected({ r, c });
                        } else if (selected) {
                          tryPlayerMove(sqName(selected.r, selected.c), sq);
                          setSelected(null);
                        }
                      }}
                      title={sqName(r, c)}
                    >
                      {pieceToUnicode(cell)}
                    </div>
                  );
                })
              )}
            </div>

            <div className="leader">
              <div className="leaderTitle">Weekly Leaderboard</div>

              {leaderboard.length === 0 ? (
                <div className="micro">No scores yet. Be the first.</div>
              ) : (
                <div className="leaderList">
                  {leaderboard.map((e, i) => (
                    <div
                      key={e.id}
                      className={`leaderRow ${i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""}`}
                    >
                      <div className="left">
                        <span className="rank">{i + 1}</span>
                        <span className="nm">{e.name}</span>
                      </div>
                      <div className="right">
                        <span className="t">{formatTime(e.time_ms)}</span>
                        <span className="m">{e.mistakes}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="footerHint">
                Custom chess puzzle engine built in VS Code, deployed on Vercel, backed by Supabase SQL — real-time game logic, automated move validation, and global leaderboard persistence.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}