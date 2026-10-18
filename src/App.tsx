import { useEffect, useMemo, useReducer } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock3,
  Heart,
  LockKeyhole,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Shield,
  Trophy,
  Zap,
} from "lucide-react";

type Position = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";
type Phase = "briefing" | "playing" | "paused" | "stageClear" | "gameOver" | "victory";

type Level = {
  code: string;
  name: string;
  description: string;
  grid: string[];
  shards: Position[];
  enemies: Position[];
  duration: number;
  moveEvery: number;
};

type GameState = {
  phase: Phase;
  levelIndex: number;
  player: Position;
  direction: Direction;
  enemies: Position[];
  collected: string[];
  score: number;
  lives: number;
  timeLeft: number;
  emp: number;
  empTurns: number;
  turn: number;
  logs: string[];
};

type Action =
  | { type: "START" }
  | { type: "MOVE"; direction: Direction }
  | { type: "TICK" }
  | { type: "EMP" }
  | { type: "TOGGLE_PAUSE" }
  | { type: "NEXT_LEVEL" }
  | { type: "RESET" };

const SIZE = 11;
const START: Position = { x: 0, y: 10 };
const EXIT: Position = { x: 10, y: 0 };

const LEVELS: Level[] = [
  {
    code: "LAYER_01",
    name: "握手协议",
    description: "收集 3 枚数据碎片，避开追踪程序并抵达出口。",
    grid: [
      "...........",
      ".###...###.",
      "...#...#...",
      ".#.#.#.#.#.",
      ".#...#...#.",
      ".###...###.",
      ".....#.....",
      ".##.....##.",
      "...#.#.#...",
      ".#.......#.",
      "...........",
    ],
    shards: [
      { x: 3, y: 7 },
      { x: 4, y: 4 },
      { x: 8, y: 2 },
    ],
    enemies: [
      { x: 6, y: 8 },
      { x: 8, y: 4 },
    ],
    duration: 95,
    moveEvery: 2,
  },
  {
    code: "LAYER_02",
    name: "镜像回廊",
    description: "防火墙结构已经重组，追踪程序正在加速。",
    grid: [
      "...........",
      ".#.#####.#.",
      ".#.....#.#.",
      ".#####.#...",
      ".....#.#.#.",
      ".###.#...#.",
      ".#...###.#.",
      ".#.#.....#.",
      "...#.###...",
      ".###...###.",
      "...........",
    ],
    shards: [
      { x: 4, y: 8 },
      { x: 4, y: 6 },
      { x: 8, y: 3 },
    ],
    enemies: [
      { x: 5, y: 9 },
      { x: 8, y: 5 },
      { x: 3, y: 2 },
    ],
    duration: 105,
    moveEvery: 2,
  },
  {
    code: "LAYER_03",
    name: "核心零域",
    description: "最后一层。夺取全部核心数据，然后从主端口撤离。",
    grid: [
      "...........",
      ".###.#.###.",
      "...#.#.....",
      ".#.#.#####.",
      ".#.....#...",
      ".#####.#.#.",
      ".....#...#.",
      ".###.###.#.",
      ".#.......#.",
      ".#.#####.#.",
      "...........",
    ],
    shards: [
      { x: 2, y: 8 },
      { x: 6, y: 6 },
      { x: 8, y: 2 },
      { x: 5, y: 4 },
    ],
    enemies: [
      { x: 4, y: 10 },
      { x: 8, y: 8 },
      { x: 10, y: 5 },
      { x: 4, y: 2 },
    ],
    duration: 120,
    moveEvery: 1,
  },
];

const DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const keyOf = ({ x, y }: Position) => `${x}:${y}`;
const samePosition = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const isOpen = (position: Position, grid: string[]) =>
  position.x >= 0 &&
  position.x < SIZE &&
  position.y >= 0 &&
  position.y < SIZE &&
  grid[position.y][position.x] !== "#";

function addLog(logs: string[], message: string) {
  return [message, ...logs].slice(0, 4);
}

function makeInitialState(phase: Phase = "briefing"): GameState {
  const level = LEVELS[0];
  return {
    phase,
    levelIndex: 0,
    player: START,
    direction: "right",
    enemies: level.enemies,
    collected: [],
    score: 0,
    lives: 3,
    timeLeft: level.duration,
    emp: 2,
    empTurns: 0,
    turn: 0,
    logs: ["等待神经连接...", "节点状态：稳定"],
  };
}

function findEnemyStep(
  from: Position,
  target: Position,
  grid: string[],
  occupied: Set<string>,
  directionOffset: number,
) {
  const baseDirections: Position[] = [
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
  ];
  const directions = baseDirections.map(
    (_, index) => baseDirections[(index + directionOffset) % baseDirections.length],
  );
  const queue: Array<{ position: Position; first: Position }> = [];
  const visited = new Set([keyOf(from)]);

  for (const delta of directions) {
    const next = { x: from.x + delta.x, y: from.y + delta.y };
    if (!isOpen(next, grid) || (occupied.has(keyOf(next)) && !samePosition(next, target))) continue;
    queue.push({ position: next, first: next });
    visited.add(keyOf(next));
  }

  while (queue.length) {
    const current = queue.shift()!;
    if (samePosition(current.position, target)) return current.first;

    for (const delta of directions) {
      const next = {
        x: current.position.x + delta.x,
        y: current.position.y + delta.y,
      };
      const nextKey = keyOf(next);
      if (
        visited.has(nextKey) ||
        !isOpen(next, grid) ||
        (occupied.has(nextKey) && !samePosition(next, target))
      ) {
        continue;
      }
      visited.add(nextKey);
      queue.push({ position: next, first: current.first });
    }
  }

  return from;
}

function moveEnemies(enemies: Position[], target: Position, level: Level, turn: number) {
  const occupied = new Set(enemies.map(keyOf));
  return enemies.map((enemy, index) => {
    occupied.delete(keyOf(enemy));
    const next = findEnemyStep(enemy, target, level.grid, occupied, (turn + index) % 4);
    occupied.add(keyOf(next));
    return next;
  });
}

function applyDamage(state: GameState, message: string): GameState {
  const level = LEVELS[state.levelIndex];
  const lives = state.lives - 1;
  return {
    ...state,
    phase: lives <= 0 ? "gameOver" : "playing",
    player: START,
    direction: "right",
    enemies: level.enemies,
    lives,
    score: Math.max(0, state.score - 150),
    timeLeft: Math.max(1, state.timeLeft - 8),
    empTurns: 0,
    logs: addLog(state.logs, lives <= 0 ? "连接终止：信号已耗尽" : message),
  };
}

function gameReducer(state: GameState, action: Action): GameState {
  const level = LEVELS[state.levelIndex];

  switch (action.type) {
    case "START":
      return {
        ...makeInitialState("playing"),
        logs: ["连接建立：开始上传", "方向键 / WASD 控制移动"],
      };

    case "RESET":
      return makeInitialState();

    case "TOGGLE_PAUSE":
      if (state.phase === "playing") return { ...state, phase: "paused" };
      if (state.phase === "paused") return { ...state, phase: "playing" };
      return state;

    case "TICK":
      if (state.phase !== "playing") return state;
      if (state.timeLeft <= 1) {
        return {
          ...state,
          phase: "gameOver",
          timeLeft: 0,
          logs: addLog(state.logs, "连接超时：追踪程序已锁定"),
        };
      }
      return { ...state, timeLeft: state.timeLeft - 1 };

    case "EMP":
      if (state.phase !== "playing" || state.emp <= 0 || state.empTurns > 0) return state;
      return {
        ...state,
        emp: state.emp - 1,
        empTurns: 3,
        logs: addLog(state.logs, "EMP 已释放：追踪程序冻结 3 回合"),
      };

    case "NEXT_LEVEL": {
      const nextIndex = Math.min(state.levelIndex + 1, LEVELS.length - 1);
      const nextLevel = LEVELS[nextIndex];
      return {
        ...state,
        phase: "playing",
        levelIndex: nextIndex,
        player: START,
        direction: "right",
        enemies: nextLevel.enemies,
        collected: [],
        timeLeft: nextLevel.duration,
        emp: Math.min(3, state.emp + 1),
        empTurns: 0,
        turn: 0,
        logs: [`进入 ${nextLevel.code}：${nextLevel.name}`, "矩阵结构已重新生成"],
      };
    }

    case "MOVE": {
      if (state.phase !== "playing") return state;
      const delta = DELTAS[action.direction];
      const nextPlayer = { x: state.player.x + delta.x, y: state.player.y + delta.y };
      if (!isOpen(nextPlayer, level.grid)) {
        return {
          ...state,
          direction: action.direction,
          logs: addLog(state.logs, "防火墙阻断：请选择其他路径"),
        };
      }

      if (state.enemies.some((enemy) => samePosition(enemy, nextPlayer))) {
        return applyDamage(
          { ...state, direction: action.direction },
          "信号受损：已回退至接入点",
        );
      }

      let score = state.score;
      let logs = state.logs;
      let collected = state.collected;
      const shardKey = keyOf(nextPlayer);
      const isShard = level.shards.some((shard) => samePosition(shard, nextPlayer));
      if (isShard && !collected.includes(shardKey)) {
        collected = [...collected, shardKey];
        score += 250;
        logs = addLog(logs, `数据碎片已获取：${collected.length}/${level.shards.length}`);
      }

      const portalOpen = collected.length === level.shards.length;
      if (samePosition(nextPlayer, EXIT) && portalOpen) {
        const finalScore = score + state.timeLeft * 10 + state.lives * 100;
        return {
          ...state,
          player: nextPlayer,
          direction: action.direction,
          collected,
          score: finalScore,
          phase: state.levelIndex === LEVELS.length - 1 ? "victory" : "stageClear",
          logs: addLog(logs, "上传完成：出口协议已通过"),
        };
      }

      const nextTurn = state.turn + 1;
      const empTurns = Math.max(0, state.empTurns - 1);
      const shouldMoveEnemies = state.empTurns === 0 && nextTurn % level.moveEvery === 0;
      const enemies = shouldMoveEnemies
        ? moveEnemies(state.enemies, nextPlayer, level, nextTurn)
        : state.enemies;

      const movedState: GameState = {
        ...state,
        player: nextPlayer,
        direction: action.direction,
        enemies,
        collected,
        score,
        logs,
        empTurns,
        turn: nextTurn,
      };

      if (enemies.some((enemy) => samePosition(enemy, nextPlayer))) {
        return applyDamage(movedState, "追踪命中：已回退至接入点");
      }

      if (portalOpen && state.collected.length < level.shards.length) {
        movedState.logs = addLog(movedState.logs, "出口已解锁：前往右上角端口");
      }
      return movedState;
    }

    default:
      return state;
  }
}

function entityPosition(position: Position) {
  return {
    left: `${(position.x / SIZE) * 100}%`,
    top: `${(position.y / SIZE) * 100}%`,
    width: `${100 / SIZE}%`,
    height: `${100 / SIZE}%`,
  };
}

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => makeInitialState());
  const level = LEVELS[state.levelIndex];
  const portalOpen = state.collected.length === level.shards.length;
  const progress = Math.round((state.collected.length / level.shards.length) * 100);
  const walls = useMemo(
    () => level.grid.flatMap((row, y) => [...row].map((cell, x) => ({ cell, x, y }))),
    [level],
  );

  useEffect(() => {
    const timer = window.setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, Direction> = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
      };

      if (keyMap[event.key]) {
        event.preventDefault();
        dispatch({ type: "MOVE", direction: keyMap[event.key] });
      }
      if (event.code === "Space") {
        event.preventDefault();
        dispatch({ type: "EMP" });
      }
      if (event.key.toLowerCase() === "p" || event.key === "Escape") {
        dispatch({ type: "TOGGLE_PAUSE" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const overlayContent = {
    briefing: {
      label: "NEURAL LINK READY",
      title: "接入矩阵",
      copy: "夺取散落在网格中的数据碎片。集齐后，右上角的撤离端口将自动解锁。",
      action: "开始入侵",
    },
    paused: {
      label: "LINK SUSPENDED",
      title: "连接已暂停",
      copy: "计时器与追踪程序均已冻结。准备好后继续。",
      action: "继续任务",
    },
    stageClear: {
      label: "LAYER COMPLETE",
      title: "节点已攻破",
      copy: `当前得分 ${state.score.toLocaleString("zh-CN")}，下一层将补充 1 次 EMP。`,
      action: "进入下一层",
    },
    gameOver: {
      label: "CONNECTION LOST",
      title: "信号已中断",
      copy: `最终得分 ${state.score.toLocaleString("zh-CN")}。重新接入将从第一层开始。`,
      action: "重新接入",
    },
    victory: {
      label: "ALL LAYERS CLEARED",
      title: "核心数据已夺取",
      copy: `矩阵突围成功，最终得分 ${state.score.toLocaleString("zh-CN")}。`,
      action: "再次挑战",
    },
  } as const;

  const activeOverlay = state.phase === "playing" ? null : overlayContent[state.phase];
  const handleOverlayAction = () => {
    if (state.phase === "briefing" || state.phase === "gameOver" || state.phase === "victory") {
      dispatch({ type: "START" });
    } else if (state.phase === "paused") {
      dispatch({ type: "TOGGLE_PAUSE" });
    } else if (state.phase === "stageClear") {
      dispatch({ type: "NEXT_LEVEL" });
    }
  };

  return (
    <main className="app-shell min-h-screen overflow-hidden text-[#d8e5df]">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="scan-beam" aria-hidden="true" />

      <header className="relative z-20 flex h-20 items-center justify-between border-b border-white/10 px-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div>
            <div className="font-display text-sm font-bold tracking-[0.22em] text-white sm:text-base">
              MATRIX <span className="text-[#9dff3f]">//</span> RUNNER
            </div>
            <div className="mt-0.5 font-mono text-[9px] tracking-[0.24em] text-white/35">
              NEURAL GRID PROTOCOL
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="hidden items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-white/45 sm:flex">
            <Radio className="h-3.5 w-3.5 text-[#9dff3f]" />
            本地节点 / 03
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-[#9dff3f]">
            <span className="status-dot" />
            {state.phase === "paused" ? "SUSPENDED" : "SYSTEM ONLINE"}
          </div>
        </div>
      </header>

      <section className="game-layout relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1640px] items-center gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[240px_minmax(420px,760px)_240px] lg:gap-10 lg:px-12 xl:grid-cols-[270px_minmax(500px,780px)_270px] xl:gap-14">
        <motion.aside
          initial={{ opacity: 0, x: -22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="order-2 lg:order-1 lg:self-stretch lg:py-8"
        >
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <p className="section-label">ACTIVE PROTOCOL</p>
              <h1 className="font-display mt-4 text-4xl font-black leading-[0.95] tracking-[-0.04em] text-white xl:text-5xl">
                矩阵
                <br />
                <span className="text-outline">突围</span>
              </h1>
              <p className="mt-5 max-w-[250px] text-sm leading-6 text-white/48">
                在二维网格中潜行、夺取数据，并在追踪程序封锁前完成撤离。
              </p>
            </div>

            <div className="mission-block">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="section-label">CURRENT LAYER</p>
                  <p className="mt-2 font-mono text-xs tracking-[0.15em] text-[#9dff3f]">
                    {level.code}
                  </p>
                </div>
                <span className="font-display text-4xl font-bold text-white/12">
                  0{state.levelIndex + 1}
                </span>
              </div>
              <h2 className="mt-5 text-lg font-semibold text-white">{level.name}</h2>
              <p className="mt-2 text-xs leading-5 text-white/42">{level.description}</p>
              <div className="mt-5 flex items-center justify-between font-mono text-[10px] tracking-[0.12em] text-white/40">
                <span>DATA CAPTURED</span>
                <span className="text-white">{progress}%</span>
              </div>
              <div className="progress-track mt-2">
                <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }} />
              </div>
            </div>

            <div className="hidden gap-3 lg:flex">
              <button
                type="button"
                className="icon-button"
                onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}
                aria-label={state.phase === "paused" ? "继续游戏" : "暂停游戏"}
                title={state.phase === "paused" ? "继续游戏" : "暂停游戏"}
              >
                {state.phase === "paused" ? <Play /> : <Pause />}
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => dispatch({ type: "RESET" })}
                aria-label="重置游戏"
                title="重置游戏"
              >
                <RotateCcw />
              </button>
            </div>
          </div>
        </motion.aside>

        <motion.div
          initial={{ opacity: 0, scale: 0.965 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="order-1 mx-auto w-full max-w-[760px] lg:order-2"
        >
          <div className="mb-3 flex items-end justify-between px-1">
            <div className="flex items-center gap-5">
              <div>
                <p className="hud-label">SCORE</p>
                <p className="hud-value">{state.score.toString().padStart(6, "0")}</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="hud-label">SIGNAL</p>
                <div className="mt-1.5 flex gap-1.5">
                  {[0, 1, 2].map((life) => (
                    <Heart
                      key={life}
                      className={`h-3.5 w-3.5 ${life < state.lives ? "fill-[#9dff3f] text-[#9dff3f]" : "text-white/15"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className={`timer ${state.timeLeft <= 15 ? "timer-critical" : ""}`}>
              <Clock3 className="h-4 w-4" />
              <span>{String(Math.floor(state.timeLeft / 60)).padStart(2, "0")}</span>
              <i>:</i>
              <span>{String(state.timeLeft % 60).padStart(2, "0")}</span>
            </div>
          </div>

          <div className="board-frame">
            <div className="corner corner-tl" />
            <div className="corner corner-tr" />
            <div className="corner corner-bl" />
            <div className="corner corner-br" />

            <div className="game-board" aria-label="二维矩阵游戏区域">
              <div className="board-cells" aria-hidden="true">
                {walls.map(({ cell, x, y }) => (
                  <div key={`${x}-${y}`} className={cell === "#" ? "wall-cell" : "floor-cell"} />
                ))}
              </div>

              <motion.div
                className={`exit-node ${portalOpen ? "exit-open" : ""}`}
                animate={portalOpen ? { opacity: [0.7, 1, 0.7] } : { opacity: 0.5 }}
                transition={portalOpen ? { repeat: Infinity, duration: 1.7 } : { duration: 0.2 }}
                style={entityPosition(EXIT)}
                aria-label={portalOpen ? "已解锁的撤离端口" : "锁定的撤离端口"}
              >
                <div className="exit-core">
                  {portalOpen ? <Zap /> : <LockKeyhole />}
                </div>
              </motion.div>

              <AnimatePresence>
                {level.shards
                  .filter((shard) => !state.collected.includes(keyOf(shard)))
                  .map((shard) => (
                    <motion.div
                      key={keyOf(shard)}
                      className="data-node"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 1.8, opacity: 0, filter: "blur(8px)" }}
                      transition={{ duration: 0.3 }}
                      style={entityPosition(shard)}
                      aria-label="数据碎片"
                    >
                      <i />
                    </motion.div>
                  ))}
              </AnimatePresence>

              {state.enemies.map((enemy, index) => (
                <motion.div
                  key={`enemy-${index}`}
                  className={`enemy-node ${state.empTurns > 0 ? "enemy-frozen" : ""}`}
                  initial={false}
                  animate={entityPosition(enemy)}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  aria-label="追踪程序"
                >
                  <div className="enemy-body">
                    <span />
                  </div>
                </motion.div>
              ))}

              <motion.div
                className={`player-node player-${state.direction}`}
                initial={false}
                animate={entityPosition(state.player)}
                transition={{ type: "spring", stiffness: 520, damping: 32 }}
                aria-label="玩家"
              >
                <div className="player-aura" />
                <div className="player-body">
                  <span />
                </div>
              </motion.div>

              <AnimatePresence>
                {activeOverlay && (
                  <motion.div
                    className="game-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <motion.div
                      initial={{ y: 14, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.08, duration: 0.35 }}
                      className="overlay-content"
                    >
                      {state.phase === "victory" && <Trophy className="mx-auto mb-5 h-8 w-8 text-[#9dff3f]" />}
                      <p className="section-label text-[#9dff3f]">{activeOverlay.label}</p>
                      <h2 className="font-display mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        {activeOverlay.title}
                      </h2>
                      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/52">
                        {activeOverlay.copy}
                      </p>
                      <button type="button" className="primary-button mt-7" onClick={handleOverlayAction}>
                        <span>{activeOverlay.action}</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between px-1 font-mono text-[9px] tracking-[0.16em] text-white/25">
            <span>GRID {SIZE} x {SIZE}</span>
            <span>POS {String(state.player.x).padStart(2, "0")}:{String(state.player.y).padStart(2, "0")}</span>
            <span>TRACE {state.enemies.length}</span>
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.16, ease: "easeOut" }}
          className="order-3 lg:self-stretch lg:py-8"
        >
          <div className="flex h-full flex-col justify-between gap-8">
            <div className="data-log">
              <div className="flex items-center justify-between">
                <p className="section-label">DATA STREAM</p>
                <span className="stream-bars" aria-hidden="true"><i /><i /><i /><i /></span>
              </div>
              <div className="mt-5 space-y-4" aria-live="polite">
                {state.logs.map((log, index) => (
                  <motion.div
                    key={`${log}-${index}`}
                    initial={index === 0 ? { opacity: 0, x: 8 } : false}
                    animate={{ opacity: index === 0 ? 1 : 0.4, x: 0 }}
                    className="flex gap-3 font-mono text-[10px] leading-4"
                  >
                    <span className={index === 0 ? "text-[#9dff3f]" : "text-white/25"}>
                      {String(Math.max(0, state.turn + 1 - index)).padStart(3, "0")}
                    </span>
                    <span className={index === 0 ? "text-white/70" : "text-white/40"}>{log}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="section-label">EMP PULSE</p>
                  <p className="mt-2 text-xs text-white/38">冻结追踪程序 3 回合</p>
                </div>
                <div className="font-display text-2xl font-bold text-white">
                  {state.emp}<span className="text-sm text-white/25">/3</span>
                </div>
              </div>
              <button
                type="button"
                className="emp-button"
                disabled={state.emp === 0 || state.empTurns > 0 || state.phase !== "playing"}
                onClick={() => dispatch({ type: "EMP" })}
              >
                <Zap className="h-4 w-4" />
                <span>{state.empTurns > 0 ? `冻结中 / ${state.empTurns}` : "释放脉冲"}</span>
                <kbd>SPACE</kbd>
              </button>
            </div>

            <div className="control-zone">
              <div className="mb-4 flex items-center justify-between">
                <p className="section-label">NAVIGATION</p>
                <p className="font-mono text-[9px] tracking-[0.12em] text-white/25">WASD / ARROWS</p>
              </div>
              <div className="d-pad">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "MOVE", direction: "up" })}
                  aria-label="向上移动"
                  title="向上移动"
                >
                  <ArrowUp />
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "MOVE", direction: "left" })}
                  aria-label="向左移动"
                  title="向左移动"
                >
                  <ArrowLeft />
                </button>
                <div className="d-pad-center"><Shield /></div>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "MOVE", direction: "right" })}
                  aria-label="向右移动"
                  title="向右移动"
                >
                  <ArrowRight />
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "MOVE", direction: "down" })}
                  aria-label="向下移动"
                  title="向下移动"
                >
                  <ArrowDown />
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      </section>
    </main>
  );
}

export default App;