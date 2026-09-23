'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';

const GRID_SIZE = 5;
const SHIPS = [
  { size: 3, count: 1 },
  { size: 2, count: 2 },
  { size: 1, count: 2 },
];

interface Cell { shipId: string | null; hit: boolean; revealed: boolean }
type Grid = Cell[][];

interface FState extends LiveState {
  phase: 'placing' | 'playing' | 'done';
  myGrid: Grid;
  oppGrid: Grid;
  myShips: { id: string; cells: string[]; sunk: boolean }[];
  oppShips: { id: string; cells: string[]; sunk: boolean }[];
  turn: string | null;
  winner: string | null;
  placements: Record<string, Grid>;
  ready: Record<string, boolean>;
}
function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ shipId: null, hit: false, revealed: false }))
  );
}
function init(uids: string[]): FState {
  return {
    phase: 'placing',
    myGrid: emptyGrid(),
    oppGrid: emptyGrid(),
    myShips: [],
    oppShips: [],
    turn: uids[0],
    winner: null,
    placements: {},
    ready: { [uids[0]]: false, [uids[1]]: false },
  };
}
function cellKey(r: number, c: number) { return `${r},${c}`; }
function parseKey(k: string) { const [r, c] = k.split(',').map(Number); return { r, c }; }
function canPlace(grid: Grid, r: number, c: number, size: number, horizontal: boolean): boolean {
  for (let i = 0; i < size; i++) {
    const nr = horizontal ? r : r + i;
    const nc = horizontal ? c + i : c;
    if (nr >= GRID_SIZE || nc >= GRID_SIZE) return false;
    if (grid[nr][nc].shipId) return false;
  }
  return true;
}
function placeShip(grid: Grid, r: number, c: number, size: number, horizontal: boolean, id: string): Grid {
  const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
  for (let i = 0; i < size; i++) {
    const nr = horizontal ? r : r + i;
    const nc = horizontal ? c + i : c;
    newGrid[nr][nc] = { ...newGrid[nr][nc], shipId: id };
  }
  return newGrid;
}

function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as FState;
  switch (action.type) {
    case 'place': {
      if (s.phase !== 'placing') return s;
      const { grid, ships } = action.payload;
      const placements = { ...s.placements, [action.uid]: grid };
      const ready = { ...s.ready, [action.uid]: true };
      const allReady = Object.values(ready).every((v) => v);
      if (allReady) {
        const uids = Object.keys(placements);
        const [u1, u2] = uids;
        const oppUid = u1 === action.uid ? u2 : u1;
        const oppGrid = placements[oppUid];
        const oppShips: { id: string; cells: string[]; sunk: boolean }[] = [];
        const seen = new Set<string>();
        oppGrid?.flatMap((row: Cell[]) => row.filter((c: Cell) => c.shipId)).forEach((c: Cell) => {
          if (!seen.has(c.shipId!)) {
            seen.add(c.shipId!);
            oppShips.push({ id: c.shipId!, cells: [], sunk: false });
          }
        });
        return {
          ...s,
          phase: 'playing',
          myGrid: placements[action.uid],
          oppGrid: oppGrid ?? emptyGrid(),
          myShips: ships,
          oppShips,
          turn: uids[0],
          placements,
          ready,
        };
      }
      return { ...s, placements, ready };
    }
    case 'fire': {
      if (s.phase !== 'playing' || s.turn !== action.uid) return s;
      const { target } = action.payload;
      const uids = Object.keys(s.placements);
      const [u1, u2] = uids;
      const isU1 = action.uid === u1;
      const oppGrid = isU1 ? s.oppGrid : s.myGrid;
      const { r, c } = parseKey(target);
      if (oppGrid[r][c].hit) return s;
      const hit = !!oppGrid[r][c].shipId;
      const newOppGrid = oppGrid.map((row, ri) =>
        row.map((cell, ci) => (ri === r && ci === c ? { ...cell, hit: true, revealed: true } : cell))
      );
      let sunkId: string | null = null;
      if (hit) {
        const shipId = newOppGrid[r][c].shipId!;
        const shipCells = newOppGrid.flatMap((row, ri) =>
          row.map((cell, ci) => (cell.shipId === shipId ? cellKey(ri, ci) : null))
        ).filter((k): k is string => k !== null);
        const allHit = shipCells.every((k) => {
          const { r: rr, c: cc } = parseKey(k);
          return newOppGrid[rr][cc].hit;
        });
        if (allHit) sunkId = shipId;
      }
      const nextTurn = hit ? action.uid : (action.uid === u1 ? u2! : u1!);
      const newOppShips = isU1
        ? s.oppShips.map((ship) => (sunkId && ship.id === sunkId ? { ...ship, sunk: true } : ship))
        : s.oppShips;
      const newMyShips = isU1
        ? s.myShips
        : s.myShips.map((ship) => (sunkId && ship.id === sunkId ? { ...ship, sunk: true } : ship));
      const winner = newOppShips.length > 0 && newOppShips.every((ship) => ship.sunk) ? action.uid : null;
      return {
        ...s,
        oppGrid: newOppGrid,
        turn: nextTurn,
        myGrid: isU1 ? s.myGrid : newOppGrid,
        oppShips: newOppShips,
        myShips: newMyShips,
        winner,
        phase: winner ? 'done' : 'playing',
      };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function GridBoard({ grid, highlight, onCellClick, showShips, dimmed }: {
  grid: Grid; highlight: string | null; onCellClick?: (key: string) => void; showShips: boolean; dimmed?: boolean;
}) {
  return (
    <group>
      {grid.flatMap((row, r) =>
        row.map((cell, c) => {
          const key = cellKey(r, c);
          const isHighlight = highlight === key;
          const isShip = showShips && cell.shipId && !cell.hit;
          const isHit = cell.hit;
          const color = isHit
            ? (cell.shipId ? '#FB4D6D' : '#38BDF8')
            : isShip
            ? '#FF6B35'
            : dimmed
            ? '#1a1a3a'
            : '#2a2a4a';
          const emissive = isHit && cell.shipId ? '#FB4D6D' : isHighlight ? '#FFC53D' : '#000';
          const emissiveIntensity = isHighlight ? 1.5 : isHit && cell.shipId ? 1 : 0;
          return (
            <mesh
              key={key}
              position={[c - (GRID_SIZE - 1) / 2, 0, r - (GRID_SIZE - 1) / 2]}
              onClick={() => onCellClick?.(key)}
            >
              <boxGeometry args={[0.85, 0.15, 0.85]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={emissiveIntensity}
                roughness={isHit ? 0.3 : 0.7}
                metalness={isHit ? 0.5 : 0}
              />
            </mesh>
          );
        })
      )}
    </group>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<FState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [placingGrid, setPlacingGrid] = useState<Grid>(emptyGrid());
  const [placingShips, setPlacingShips] = useState<{ id: string; size: number }[]>([]);
  const placedShipsRef = useRef<{ id: string; cells: string[]; sunk: boolean }[]>([]);
  const [selectedShip, setSelectedShip] = useState<string | null>(null);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as FState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);

  const me = room?.players.find((p) => p.uid === uid);
  const opponent = room?.players.find((p) => p.uid !== uid);
  const myTurn = live?.turn === uid;
  const isPlacing = live?.phase === 'placing';

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));

  useEffect(() => {
    const ships: { id: string; size: number }[] = [];
    let id = 0;
    SHIPS.forEach(({ size, count }) => {
      for (let i = 0; i < count; i++) {
        ships.push({ id: `ship-${id++}`, size });
      }
    });
    setPlacingShips(ships);
    setSelectedShip(ships[0]?.id ?? null);
  }, []);

  const canPlaceHere = (key: string) => {
    if (!selectedShip) return false;
    const { r, c } = parseKey(key);
    const ship = placingShips.find((s) => s.id === selectedShip)!;
    return canPlace(placingGrid, r, c, ship.size, horizontal);
  };

  const doPlaceShip = (key: string) => {
    if (!selectedShip) return;
    const { r, c } = parseKey(key);
    const ship = placingShips.find((s) => s.id === selectedShip);
    if (!ship) return;
    if (!canPlace(placingGrid, r, c, ship.size, horizontal)) return;
    const newGrid = placeShip(placingGrid, r, c, ship.size, horizontal, ship.id);
    setPlacingGrid(newGrid);
    placedShipsRef.current = [...placedShipsRef.current, { id: ship.id, cells: [], sunk: false }];
    const remaining = placingShips.filter((s) => s.id !== selectedShip);
    setPlacingShips(remaining);
    setSelectedShip(remaining[0]?.id ?? null);
  };

  const confirmPlacement = () => {
    if (placingShips.length > 0) return;
    act('place', { grid: placingGrid, ships: placedShipsRef.current });
  };

  const fire = (key: string) => {
    if (!myTurn || live?.phase !== 'playing') return;
    act('fire', { target: key });
    flashBuzzer(`#cell-${key}`, '#FB4D6D');
  };

  useEffect(() => {
    if (live?.winner) {
      awardScores(roomCode, { [live.winner]: 300 });
    }
  }, [live?.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 5, 7], fov: 45 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 4]} intensity={0.8} />
          <pointLight position={[0, 4, 0]} intensity={20} distance={15} color="#38BDF8" />
          <group position={[0, 0, -3]}>
            {live && (
              <GridBoard
                grid={live.myGrid}
                highlight={hoverCell}
                onCellClick={isPlacing ? doPlaceShip : fire}
                showShips={true}
                dimmed={!isPlacing && !myTurn}
              />
            )}
          </group>
          <group position={[0, 0, 3]}>
            {live && (
              <GridBoard
                grid={live.oppGrid}
                highlight={myTurn ? hoverCell : null}
                onCellClick={myTurn ? fire : undefined}
                showShips={false}
                dimmed={!myTurn}
              />
            )}
          </group>
          <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[8, 1]} />
            <meshBasicMaterial color="#FFC53D" transparent opacity={0.3} />
          </mesh>
        </Canvas>
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="arcade-card px-3 py-1 font-display text-lg font-extrabold text-[#FFC53D]">
            {isPlacing ? '🚢 PLACING' : myTurn ? '🎯 YOUR TURN' : '⏳ OPPONENT TURN'}
          </span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {isPlacing && (
          <div className="arcade-card flex flex-col gap-3 p-4">
            <div className="font-display text-lg font-extrabold">Place Your Fleet</div>
            <p className="text-sm text-white/70">Tap cells to place ships. Click a placed ship to rotate. {placingShips.length} left.</p>
            <div className="flex gap-1 flex-wrap">
              {placingShips.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShip(s.id)}
                  className={`rounded-lg px-2 py-1 text-xs font-bold ${selectedShip === s.id ? 'btn-neon' : 'bg-white/10'}`}
                >
                  Size {s.size}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={horizontal} onChange={(e) => setHorizontal(e.target.checked)} className="w-4 h-4 accent-[#FFC53D]" />
              Horizontal
            </label>
            <button onClick={confirmPlacement} disabled={placingShips.length > 0} className="btn-neon w-full px-3 py-2 font-bold">
              ✅ Confirm Fleet
            </button>
          </div>
        )}
        {live && live.phase === 'playing' && (
          <div className="arcade-card flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{me?.name}</div>
                <div className="font-display text-2xl font-extrabold text-[#34D399]">
                  {live.myShips.filter((s) => !s.sunk).length} ships
                </div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{opponent?.name}</div>
                <div className="font-display text-2xl font-extrabold text-[#FB4D6D]">
                  {live.oppShips.filter((s) => !s.sunk).length} ships
                </div>
              </div>
            </div>
            {myTurn && <p className="text-center text-[#34D399] font-bold">Your shot — tap enemy grid</p>}
            {!myTurn && <p className="text-center text-[#FB4D6D] font-bold">Waiting for opponent…</p>}
            {live.oppShips.some((s) => s.sunk) && (
              <p className="text-center text-[#FFC53D] font-bold animate-pulse">💥 Enemy ship sunk!</p>
            )}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-xl font-extrabold text-[#FFC53D]">
              {live.winner === uid ? '🏆 YOU WIN!' : '💀 YOU LOSE'}
            </div>
            <p className="text-sm text-white/70">All enemy ships sunk.</p>
            <button onClick={() => setLive(roomCode, null)} className="btn-neon mt-2 rounded-xl px-4 py-2 text-sm font-bold">Back to lobby scoring</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Preview() {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.4;
  });
  return (
    <group ref={ref}>
      <group position={[0, 0, -1]}>
        {[-1, 0, 1].map((c) => (
          <mesh key={c} position={[c * 1.1, 0, 0]}>
            <boxGeometry args={[0.6, 0.2, 0.6]} />
            <meshStandardMaterial color="#FF6B35" emissive="#FF6B35" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
      <group position={[0, 0, 1]}>
        {[-1, 0, 1].map((c) => (
          <mesh key={c} position={[c * 1.1, 0, 0]}>
            <boxGeometry args={[0.6, 0.2, 0.6]} />
            <meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export const FogDuel: GameModule = {
  id: 'fogduel',
  displayName: 'Fog Duel',
  tagline: '3D battleship. Hide fleet. Hunt theirs.',
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#38BDF8',
  LobbyPreviewScene: Preview,
  GameScene,
  applyAction,
  initState: (uids) => init(uids),
};
