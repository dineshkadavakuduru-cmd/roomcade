'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { GameModule } from './registry';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';
import { Confetti, GameHeader, ReturnToLounge } from '@/components/GameChrome';

const GRID_SIZE = 5;
const SHIPS = [
  { size: 3, count: 1 },
  { size: 2, count: 2 },
  { size: 1, count: 2 },
];

interface Cell { shipId: string | null; hit: boolean; revealed: boolean }
type Grid = Cell[][];

interface ShipManifest { id: string; cells: string[]; sunk: boolean }

interface FState extends LiveState {
  phase: 'placing' | 'playing' | 'done';
  // Per-player data: each uid maps to THEIR OWN fleet grid + ship manifest.
  grids: Record<string, Grid>;
  ships: Record<string, ShipManifest[]>;
  turn: string | null;
  winner: string | null;
  ready: Record<string, boolean>;
}
function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({ shipId: null, hit: false, revealed: false }))
  );
}
function init(uids: string[]): FState {
  const ready: Record<string, boolean> = {};
  if (uids[0]) ready[uids[0]] = false;
  if (uids[1]) ready[uids[1]] = false;
  return {
    phase: 'placing',
    grids: {},
    ships: {},
    turn: uids[0] ?? null,
    winner: null,
    ready,
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
      // Store each player's fleet under their own uid — no my/opp swapping.
      const grids = { ...s.grids, [action.uid]: action.payload.grid };
      const ships = { ...s.ships, [action.uid]: action.payload.ships ?? [] };
      const ready = { ...s.ready, [action.uid]: true };
      const uids = Object.keys(ready);
      const allReady = uids.length >= 2 && uids.every((u) => ready[u] && grids[u]);
      if (allReady) {
        return { ...s, phase: 'playing', grids, ships, ready, turn: uids[0]! };
      }
      return { ...s, grids, ships, ready };
    }
    case 'fire': {
      if (s.phase !== 'playing' || s.turn !== action.uid) return s;
      const oppUid = Object.keys(s.ready).find((u) => u !== action.uid);
      if (!oppUid) return s;
      const targetGrid = s.grids[oppUid];
      if (!targetGrid) return s;
      const { r, c } = parseKey(action.payload.target);
      if (!targetGrid[r] || !targetGrid[r][c] || targetGrid[r][c].hit) return s;
      const hit = !!targetGrid[r][c].shipId;
      // Shots land on the OPPONENT's grid.
      const newTargetGrid = targetGrid.map((row, ri) =>
        row.map((cell, ci) => (ri === r && ci === c ? { ...cell, hit: true, revealed: true } : cell))
      );
      const grids = { ...s.grids, [oppUid]: newTargetGrid };
      let sunkId: string | null = null;
      if (hit) {
        const shipId = newTargetGrid[r][c].shipId!;
        const manifest = (s.ships[oppUid] ?? []).find((sh) => sh.id === shipId);
        // Prefer the manifest's exact cell list; fall back to scanning the grid.
        const shipCells =
          manifest && manifest.cells.length > 0
            ? manifest.cells
            : newTargetGrid
                .flatMap((row, ri) => row.map((cell, ci) => (cell.shipId === shipId ? cellKey(ri, ci) : null)))
                .filter((k): k is string => k !== null);
        const allHit = shipCells.every((k) => {
          const { r: rr, c: cc } = parseKey(k);
          return newTargetGrid[rr][cc].hit;
        });
        if (allHit) sunkId = shipId;
      }
      const ships = {
        ...s.ships,
        [oppUid]: (s.ships[oppUid] ?? []).map((sh) => (sunkId && sh.id === sunkId ? { ...sh, sunk: true } : sh)),
      };
      const oppFleet = ships[oppUid]!;
      const winner = oppFleet.length > 0 && oppFleet.every((sh) => sh.sunk) ? action.uid : null;
      return {
        ...s,
        grids,
        ships,
        turn: hit ? action.uid : oppUid,
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

function GridBoard({ grid, highlight, onCellClick, showShips, dimmed, board }: {
  grid: Grid; highlight: string | null; onCellClick?: (key: string) => void; showShips: boolean; dimmed?: boolean;
  board: 'enemy' | 'own';
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
            <group key={key} position={[c - (GRID_SIZE - 1) / 2, 0, r - (GRID_SIZE - 1) / 2]}>
              <mesh onClick={() => onCellClick?.(key)}>
                <boxGeometry args={[0.85, 0.15, 0.85]} />
                <meshStandardMaterial
                  color={color}
                  emissive={emissive}
                  emissiveIntensity={emissiveIntensity}
                  roughness={isHit ? 0.3 : 0.7}
                  metalness={isHit ? 0.5 : 0}
                />
              </mesh>
              {/* Transparent DOM hit target pinned to the cell's projected screen
                  position: keeps 3D raycasting working AND makes every cell a
                  real, focusable button for touch + automation. */}
              <Html position={[0, 0.14, 0]} center zIndexRange={[40, 0]}>
                <button
                  type="button"
                  data-fog-cell={key}
                  data-fog-board={board}
                  aria-label={`${board === 'enemy' ? 'Fire at' : 'Place ship at'} ${key}`}
                  onClick={() => onCellClick?.(key)}
                  style={{
                    width: 34,
                    height: 22,
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    opacity: 0,
                    cursor: onCellClick ? 'pointer' : 'default',
                  }}
                />
              </Html>
            </group>
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
  const placedShipsRef = useRef<ShipManifest[]>([]);
  const [selectedShip, setSelectedShip] = useState<string | null>(null);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as FState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);

  // When the room enters 'in-game', the lobby's startGame clears the live state.
  // Initialize the placing phase so the fleet panel renders immediately.
  useEffect(() => {
    if (!live && room?.status === 'in-game' && room?.players?.length >= 2) {
      setLive(roomCode, init(room.players.map((p) => p.uid)));
    }
  }, [live, room?.status, room?.players?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = room?.players.find((p) => p.uid === uid);
  const opponent = room?.players.find((p) => p.uid !== uid);
  const oppUid = opponent?.uid ?? '';
  const myTurn = live?.turn === uid;
  const isPlacing = !live || live?.phase === 'placing';
  const isHost = room?.hostId === uid;

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));

  const resetPlacement = () => {
    const ships: { id: string; size: number }[] = [];
    let id = 0;
    SHIPS.forEach(({ size, count }) => {
      for (let i = 0; i < count; i++) {
        ships.push({ id: `ship-${id++}`, size });
      }
    });
    setPlacingShips(ships);
    setSelectedShip(ships[0]?.id ?? null);
    setPlacingGrid(emptyGrid());
    placedShipsRef.current = [];
    setConfirmed(false);
  };

  useEffect(() => { resetPlacement(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A rematch puts the live state back to 'placing' — re-arm this client's local placement.
  useEffect(() => {
    if (live?.phase === 'placing' && confirmed) resetPlacement();
  }, [live?.phase, confirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  const doPlaceShip = (key: string) => {
    if (!selectedShip || confirmed) return;
    const { r, c } = parseKey(key);
    const ship = placingShips.find((s) => s.id === selectedShip);
    if (!ship) return;
    if (!canPlace(placingGrid, r, c, ship.size, horizontal)) return;
    const newGrid = placeShip(placingGrid, r, c, ship.size, horizontal, ship.id);
    setPlacingGrid(newGrid);
    // Record exactly which cells this ship occupies so sinking can be verified later.
    const cells = Array.from({ length: ship.size }, (_, i) =>
      cellKey(horizontal ? r : r + i, horizontal ? c + i : c)
    );
    placedShipsRef.current = [...placedShipsRef.current, { id: ship.id, cells, sunk: false }];
    const remaining = placingShips.filter((s) => s.id !== selectedShip);
    setPlacingShips(remaining);
    setSelectedShip(remaining[0]?.id ?? null);
  };

  const confirmPlacement = () => {
    if (placingShips.length > 0 || confirmed) return;
    setConfirmed(true);
    act('place', { grid: placingGrid, ships: placedShipsRef.current });
  };

  const fire = (key: string) => {
    if (!myTurn || live?.phase !== 'playing') return;
    act('fire', { target: key });
    flashBuzzer(`#cell-${key}`, '#FB4D6D');
  };

  const awardedRef = useRef(false);
  useEffect(() => {
    if (live?.winner && !awardedRef.current) {
      awardedRef.current = true;
      awardScores(roomCode, { [live.winner]: 300 });
    }
  }, [live?.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  // My board shows my own fleet (or the fleet I'm placing); the enemy board shows my shots.
  const myFleet = live?.grids[uid] ?? emptyGrid();
  const enemyFleet = live?.grids[oppUid] ?? emptyGrid();
  const myShipsAfloat = (live?.ships[uid] ?? []).filter((s) => !s.sunk).length;
  const enemyShipsAfloat = (live?.ships[oppUid] ?? []).filter((s) => !s.sunk).length;

  return (
    <div className="flex h-full flex-col gap-2">
      <GameHeader name="Fog Duel" accent="#38BDF8" phase={isPlacing ? 'placing' : myTurn ? 'your turn' : 'opponent turn'} round={`${myShipsAfloat} vs ${enemyShipsAfloat} ships`} playerCount={room?.players.length} />
      <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 5, 7], fov: 45 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 4]} intensity={0.8} />
          <pointLight position={[0, 4, 0]} intensity={20} distance={15} color="#38BDF8" />
          {/* Top board: enemy waters — tap here to fire */}
          <group position={[0, 0, -3]}>
            {live && (
                <GridBoard
                  grid={enemyFleet}
                  highlight={!isPlacing && myTurn ? hoverCell : null}
                  onCellClick={!isPlacing && myTurn ? fire : undefined}
                  showShips={false}
                  dimmed={!myTurn}
                  board="enemy"
                />

            )}
          </group>
          {/* Bottom board: your own fleet — never a fire target */}
          <group position={[0, 0, 3]}>
            {live && (
                <GridBoard
                  grid={isPlacing ? placingGrid : myFleet}
                  highlight={isPlacing ? hoverCell : null}
                  onCellClick={isPlacing ? doPlaceShip : undefined}
                  showShips={true}
                  dimmed={!isPlacing}
                  board="own"
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
        <div className="absolute right-3 top-3 arcade-card px-2 py-0.5 text-xs font-bold text-[#FB4D6D]">🎯 Enemy waters (top)</div>
        <div className="absolute bottom-3 right-3 arcade-card px-2 py-0.5 text-xs font-bold text-[#34D399]">🚢 Your fleet (bottom)</div>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {isPlacing && !confirmed && (
          <div className="arcade-card flex flex-col gap-3 p-4">
            <div className="font-display text-lg font-extrabold">Place Your Fleet</div>
            <p className="text-sm text-white/70">Tap cells on your fleet (bottom board) to place ships. {placingShips.length} left.</p>
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
        {isPlacing && confirmed && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-lg font-extrabold">Fleet locked in ✅</div>
            <p className="text-sm text-white/70">Waiting for your opponent to finish placing…</p>
          </div>
        )}
        {live && live.phase === 'playing' && (
          <div className="arcade-card flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{me?.name}</div>
                <div className="font-display text-2xl font-extrabold text-[#34D399]">{myShipsAfloat} ships</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{opponent?.name}</div>
                <div className="font-display text-2xl font-extrabold text-[#FB4D6D]">{enemyShipsAfloat} ships</div>
              </div>
            </div>
            {myTurn && <p className="text-center text-[#34D399] font-bold">Your shot — tap the enemy grid</p>}
            {!myTurn && <p className="text-center text-[#FB4D6D] font-bold">Waiting for opponent…</p>}
            {(live.ships[oppUid] ?? []).some((s) => s.sunk) && (
              <p className="text-center text-[#FFC53D] font-bold animate-pulse">💥 Enemy ship sunk!</p>
            )}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card phase-fade relative p-4 text-center">
            {live.winner === uid && <Confetti />}
            <div className="font-display text-xl font-extrabold text-[#FFC53D]">
              {live.winner === uid ? '🏆 YOU WIN!' : '💀 YOU LOSE'}
            </div>
            <p className="text-sm text-white/70">All enemy ships sunk.</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {isHost && (
                <button
                  onClick={() => setLive(roomCode, init(room?.players.map((p) => p.uid) ?? []))}
                  className="btn-neon rounded-xl px-4 py-2 text-sm font-bold"
                >
                  🔁 Rematch
                </button>
              )}
              <ReturnToLounge roomCode={roomCode} />
            </div>
          </div>
        )}
      </div>
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
