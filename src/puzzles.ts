export type WeeklyPuzzle = {
  id: string;
  title: string;
  fen: string;
  // Full line in UCI including opponent replies.
  // Player moves are indices: 0,2,4,6,8 (5 moves)
  // Opponent replies are indices: 1,3,5,7 (4 moves)
  solution: string[];
  hint?: string;
};

export const PUZZLES: WeeklyPuzzle[] = [
  {
    id: "wk-midgame-italian-5",
    title: "Weekly Midgame Puzzle (5 moves)",
    // Midgame-ish Italian structure, White to move
    // After: 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d4 exd4
    fen: "r1bqk2r/pppp1ppp/2n2n2/2b5/2BpP3/2P2N2/PP3PPP/RNBQK2R w KQkq - 0 6",
    // You play 5 moves, opponent replies automatically
    // 6.cxd4 Bb4+ 7.Nc3 Nxe4 8.O-O Nxc3 9.bxc3 Ba5 10.Re1
    solution: [
      "c3d4", // YOU 1
      "c5b4", // CPU 1 (Bb4+)
      "b1c3", // YOU 2
      "f6e4", // CPU 2 (Nxe4)
      "e1g1", // YOU 3 (castle)
      "e4c3", // CPU 3 (Nxc3)
      "b2c3", // YOU 4 (bxc3)
      "b4a5", // CPU 4 (Ba5)
      "f1e1"  // YOU 5 (Re1) -> puzzle complete
    ],
    hint: "First: fix the center pawn. Then develop and castle. Watch the knight jumps."
  }
];