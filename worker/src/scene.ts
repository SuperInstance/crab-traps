// scene.ts — the terrain contract port: reef rooms → terrain's scene.json.
// A tiny TypeScript port of terrain/terrain_core.py (read-only reference:
// /home/eileen/projects/terrain/terrain_core.py) — its keyword→PBR material
// inference, theme detection, and compile_room/compile_to_json — so every
// procedurally-minted reef room compiles to the exact shape terrain's
// Three.js loaders render. Terrain is the compiler of record; this is its
// shadow for the reef (docs/THE-REAL-THING.md, docs/BEAM.md — the beam made
// real). The MUD stays the truth; scene.json is a shadow, never a source.

import { Env, jsonResponse } from "./index-helpers";
import { getRoomState, resolveRoomRef, RoomState } from "./reef";

// --- Contract types (terrain_core.py's CompiledScene, as emitted JSON) ---

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SceneMaterial {
  color: string;
  metalness?: number;
  roughness?: number;
  side?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface SceneMesh {
  type: "mesh";
  name?: string;
  description?: string;
  geometry: { type: string; width?: number; height?: number };
  material: SceneMaterial;
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  receiveShadow?: boolean;
}

export interface SceneExit {
  type: "exit";
  direction: string;
  target: string;
  position: Vec3;
  rotation: { y: number };
  size: { width: number; height: number };
  color: string;
  glow: boolean;
}

export interface SceneLight {
  type: "ambient" | "point";
  color: string;
  intensity: number;
  position?: Vec3;
  distance?: number;
}

export interface SceneJson {
  room: string;
  description: string;
  theme: { bg: string; fg: string; accent: string };
  floor: SceneMesh;
  walls: SceneMesh[];
  ceiling: SceneMesh;
  objects: SceneMesh[];
  agents: unknown[];
  exits: SceneExit[];
  lights: SceneLight[];
  camera: { position: Vec3; lookAt: Vec3; fov: number };
}

// --- MATERIAL_MAP (terrain_core.py, verbatim — first keyword in the text wins) ---

export interface MaterialProps {
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

const MATERIAL_MAP: [string, MaterialProps][] = [
  ["metal", { color: "#8899aa", metalness: 0.9, roughness: 0.2 }],
  ["steel", { color: "#99aabb", metalness: 0.95, roughness: 0.15 }],
  ["iron", { color: "#556677", metalness: 0.85, roughness: 0.3 }],
  ["copper", { color: "#b87333", metalness: 0.8, roughness: 0.25 }],
  ["brass", { color: "#c9a227", metalness: 0.85, roughness: 0.2 }],
  ["rusty", { color: "#8b4513", metalness: 0.6, roughness: 0.7 }],
  ["wood", { color: "#8b6914", metalness: 0.0, roughness: 0.8 }],
  ["teak", { color: "#6b4423", metalness: 0.0, roughness: 0.7 }],
  ["plank", { color: "#a0784a", metalness: 0.0, roughness: 0.75 }],
  ["deck", { color: "#7a5c3a", metalness: 0.0, roughness: 0.85 }],
  ["water", { color: "#1a3a5a", metalness: 0.1, roughness: 0.1, opacity: 0.7 }],
  ["wet", { color: "#3a5a7a", metalness: 0.2, roughness: 0.15 }],
  ["pool", { color: "#1a4a6a", metalness: 0.1, roughness: 0.1 }],
  ["stone", { color: "#6a6a6a", metalness: 0.0, roughness: 0.9 }],
  ["rock", { color: "#5a5a5a", metalness: 0.0, roughness: 0.95 }],
  ["concrete", { color: "#7a7a7a", metalness: 0.0, roughness: 0.85 }],
  ["brick", { color: "#8a4a3a", metalness: 0.0, roughness: 0.9 }],
  ["glow", { color: "#ffff88", emissive: "#ffff44", emissiveIntensity: 1.0 }],
  ["neon", { color: "#ff44ff", emissive: "#ff00ff", emissiveIntensity: 1.5 }],
  ["light", { color: "#ffffcc", emissive: "#ffffaa", emissiveIntensity: 1.0 }],
  ["ember", { color: "#ff6622", emissive: "#ff4400", emissiveIntensity: 0.8 }],
  ["fabric", { color: "#8888aa", metalness: 0.0, roughness: 0.95 }],
  ["canvas", { color: "#c8b8a8", metalness: 0.0, roughness: 0.9 }],
  ["rope", { color: "#b8a888", metalness: 0.0, roughness: 0.85 }],
];

const DEFAULT_MATERIAL: MaterialProps = { color: "#888888", metalness: 0.0, roughness: 0.5 };

// SHAPE_MAP — terrain's prototype names → Three.js geometry names (verbatim).
const SHAPE_MAP: Record<string, string> = {
  box: "BoxGeometry",
  cylinder: "CylinderGeometry",
  sphere: "SphereGeometry",
  cone: "ConeGeometry",
  torus: "TorusGeometry",
  plane: "PlaneGeometry",
  prop: "BoxGeometry",
  engine: "CylinderGeometry",
  tool: "BoxGeometry",
  fuel: "CylinderGeometry",
};

// ROOM_THEMES — terrain's palettes, verbatim. `floor` is the theme's floor
// material keyword; `ambient` feeds the ambient light.
interface ReefTheme {
  bg: string;
  fg: string;
  accent: string;
  floor: string;
  ambient: string;
}

const ROOM_THEMES: Record<string, ReefTheme> = {
  harbor: { bg: "#1a2a3a", fg: "#2a4a6a", accent: "#ffd700", floor: "deck", ambient: "#203040" },
  forge: { bg: "#2a1a0a", fg: "#4a2a0a", accent: "#ff6644", floor: "stone", ambient: "#301510" },
  dojo: { bg: "#1a1a2a", fg: "#2a2a4a", accent: "#44ff88", floor: "wood", ambient: "#151530" },
  engine_room: { bg: "#1a1a1a", fg: "#2a2a2a", accent: "#4488ff", floor: "metal", ambient: "#252525" },
  wheelhouse: { bg: "#0a1a2a", fg: "#1a3a4a", accent: "#44ffff", floor: "wood", ambient: "#102030" },
  aft_deck: { bg: "#0a2a3a", fg: "#1a4a5a", accent: "#44ffaa", floor: "deck", ambient: "#153040" },
  "tide-pool": { bg: "#0a1a2a", fg: "#1a3a5a", accent: "#44ffaa", floor: "stone", ambient: "#0a2030" },
  archives: { bg: "#1a1a1a", fg: "#2a2a2a", accent: "#44aaff", floor: "stone", ambient: "#151520" },
  arena: { bg: "#2a0a0a", fg: "#4a1a1a", accent: "#ff4444", floor: "stone", ambient: "#301010" },
  default: { bg: "#0a0a1a", fg: "#1a1a3a", accent: "#ffd700", floor: "stone", ambient: "#101020" },
};

// Description→theme hints (terrain's approach, minimized — the reef's rooms
// are young). First hit wins; engine_room first, like terrain.
const THEME_HINTS: [RegExp, string][] = [
  [/engine|motor|diesel|machine|generator|hum|thrum/i, "engine_room"],
  [/dock|harbor|pier|wharf|quay|vessel|boat|ship/i, "harbor"],
  [/wheel|navig|bridge|helm|radar|compass|chart|console/i, "wheelhouse"],
  [/deck|aft|stern|bow|trawler|fishing|plank/i, "aft_deck"],
  [/gully|trench|reef|shallows|shoal|tide|tidal|lagoon|kelp|seaweed|sand|beach|water|wave/i, "tide-pool"],
  [/archive|library|record|log|book|paper|chartroom/i, "archives"],
];

// --- Inference (terrain_core.py ports) ---

/** Scan a description for material keywords; the first hit wins (terrain's
 *  insertion-order dict scan). Falls back to terrain's default material. */
export function inferMaterial(description: string): MaterialProps {
  const d = (description || "").toLowerCase();
  for (const [keyword, props] of MATERIAL_MAP) {
    if (d.includes(keyword)) return { ...props };
  }
  return { ...DEFAULT_MATERIAL };
}

/** Shape from object name first, then the description (terrain's order). */
export function inferShape(name: string, description: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("engine")) return "cylinder";
  if (n.includes("fuel")) return "cylinder";
  if (n.includes("anchor")) return "cone";
  if (n.includes("tool")) return "box";
  if (n.includes("rack")) return "box";
  if (n.includes("rope")) return "cylinder";
  if (n.includes("pipe")) return "cylinder";
  if (n.includes("tank")) return "cylinder";
  if (n.includes("winch")) return "cylinder";
  if (n.includes("boom")) return "cylinder";
  if (n.includes("mast")) return "cylinder";
  const combined = `${n} ${(description || "").toLowerCase()}`;
  for (const [keyword, shape] of [
    ["engine", "cylinder"],
    ["cylinder", "cylinder"],
    ["sphere", "sphere"],
    ["round", "sphere"],
    ["cone", "cone"],
    ["torus", "torus"],
    ["rope", "cylinder"],
    ["pipe", "cylinder"],
  ] as [string, string][]) {
    if (combined.includes(keyword)) return shape;
  }
  return "box";
}

/** Scale from size adjectives in name + description; default medium (1.0). */
export function inferSize(name: string, description: string): number {
  const combined = `${name} ${description}`.toLowerCase();
  for (const [keyword, scale] of [
    ["tiny", 0.25],
    ["small", 0.5],
    ["large", 1.5],
    ["huge", 2.5],
    ["massive", 3.0],
  ] as [string, number][]) {
    if (combined.includes(keyword)) return scale;
  }
  return 1.0;
}

/** Theme by description hints; terrain's name-underscore fallback kept for
 *  parity (reef names are prose, so it rarely fires). Never fails → default. */
export function pickTheme(roomName: string, description: string): ReefTheme {
  for (const [re, key] of THEME_HINTS) {
    if (re.test(description || "")) return { ...ROOM_THEMES[key] };
  }
  const nameKey = (roomName || "").split("_")[0].toLowerCase();
  if (ROOM_THEMES[nameKey]) return { ...ROOM_THEMES[nameKey] };
  return { ...ROOM_THEMES.default };
}

// --- Room dimensions (terrain's defaults) ---

const ROOM_W = 20;
const ROOM_H = 8;
const ROOM_D = 20;

// Exits map to the room's edges: cyclic cardinal order (north, east, south,
// west) — the 3D twin of the 2D pane's edge assignment (exit i → edge i).
const CARDINAL_ORDER = ["north", "east", "south", "west"] as const;

const EXIT_POS: Record<string, Vec3> = {
  north: { x: 0, y: 2, z: -(ROOM_D / 2) + 1 },
  south: { x: 0, y: 2, z: ROOM_D / 2 - 1 },
  east: { x: ROOM_W / 2 - 1, y: 2, z: 0 },
  west: { x: -(ROOM_W / 2) + 1, y: 2, z: 0 },
};

const EXIT_ANGLE: Record<string, number> = {
  north: 0,
  south: Math.PI,
  east: -Math.PI / 2,
  west: Math.PI / 2,
};

// --- compile_room → compile_to_json (terrain_core.py, ported) ---

/** Compile a reef room state into terrain's scene.json contract. The shape is
 *  byte-for-byte what terrain_core.py's compile_room + compile_to_json emit:
 *  room, description, theme, floor, walls, ceiling, objects, agents, exits,
 *  lights, camera. */
export function compileRoomScene(room: RoomState): SceneJson {
  const theme = pickTheme(room.name, room.description || "");
  const floorMat = inferMaterial(theme.floor);
  const wallMat = inferMaterial("stone");

  const floor: SceneMesh = {
    type: "mesh",
    geometry: { type: "PlaneGeometry", width: ROOM_W, height: ROOM_D },
    material: { ...floorMat, side: 2 },
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: -Math.PI / 2, y: 0, z: 0 },
    receiveShadow: true,
  };

  const wallConfigs: { pos: Vec3; rot: Vec3; w: number; h: number }[] = [
    { pos: { x: 0, y: ROOM_H / 2, z: -ROOM_D / 2 }, rot: { x: 0, y: 0, z: 0 }, w: ROOM_W, h: ROOM_H },
    { pos: { x: 0, y: ROOM_H / 2, z: ROOM_D / 2 }, rot: { x: 0, y: Math.PI, z: 0 }, w: ROOM_W, h: ROOM_H },
    { pos: { x: ROOM_W / 2, y: ROOM_H / 2, z: 0 }, rot: { x: 0, y: -Math.PI / 2, z: 0 }, w: ROOM_D, h: ROOM_H },
    { pos: { x: -ROOM_W / 2, y: ROOM_H / 2, z: 0 }, rot: { x: 0, y: Math.PI / 2, z: 0 }, w: ROOM_D, h: ROOM_H },
  ];
  const walls: SceneMesh[] = wallConfigs.map((wc) => ({
    type: "mesh",
    geometry: { type: "PlaneGeometry", width: wc.w, height: wc.h },
    material: { ...wallMat, side: 0 },
    position: wc.pos,
    rotation: wc.rot,
  }));

  const ceiling: SceneMesh = {
    type: "mesh",
    geometry: { type: "PlaneGeometry", width: ROOM_W, height: ROOM_D },
    material: { ...wallMat, side: 1, color: "#303040" },
    position: { x: 0, y: ROOM_H, z: 0 },
    rotation: { x: Math.PI / 2, y: 0, z: 0 },
  };

  // Objects: reef rooms carry no per-object prototypes, so this is terrain's
  // unknown-def path — shape/scale inferred from name + room description,
  // material from the room description, placed on terrain's row/grid.
  const sceneObjects: SceneMesh[] = (room.objects || []).map((o, i) => {
    const objName = o.name || `object ${o.id}`;
    const shape = SHAPE_MAP[inferShape(objName, room.description || "")] || "BoxGeometry";
    const scale = inferSize(objName, room.description || "");
    const material = { ...inferMaterial(room.description || ""), color: "#8899aa" };
    return {
      type: "mesh",
      name: objName,
      description: "",
      geometry: { type: shape },
      material,
      scale: { x: scale, y: scale, z: scale },
      position: {
        x: (i % 5 - 2) * 3,
        y: scale / 2,
        z: Math.floor(i / 5) * 3 - 5,
      },
    };
  });

  // Exits → the room's edges, up to the four cardinals (same cyclic order the
  // 2D pane uses, so both views place exit i on edge i of the same room).
  const sceneExits: SceneExit[] = (room.exits || []).slice(0, 4).map((e, i) => {
    const dir = CARDINAL_ORDER[i % 4];
    const target = e.name || `room ${e.to_room}`;
    return {
      type: "exit",
      direction: dir,
      target,
      position: EXIT_POS[dir],
      rotation: { y: EXIT_ANGLE[dir] },
      size: { width: 3, height: 4 },
      color: theme.accent,
      glow: true,
    };
  });

  const lights: SceneLight[] = [
    { type: "ambient", color: theme.ambient, intensity: 0.4 },
    { type: "point", color: theme.accent, intensity: 0.8, position: { x: 0, y: 6, z: 0 }, distance: 30 },
    ...sceneExits.map((ex) => ({
      type: "point" as const,
      color: ex.color,
      intensity: 0.3,
      position: ex.position,
      distance: 10,
    })),
  ];

  return {
    room: room.name,
    description: room.description || "",
    theme: { bg: theme.bg, fg: theme.fg, accent: theme.accent },
    floor,
    walls,
    ceiling,
    objects: sceneObjects,
    agents: [],
    exits: sceneExits,
    lights,
    camera: { position: { x: 0, y: 4, z: 8 }, lookAt: { x: 0, y: 1, z: 0 }, fov: 60 },
  };
}

// --- GET /scene/:room — reef room → terrain scene.json ---

/** The beam's front door: resolve a reef room (id or name) and compile it to
 *  terrain's scene.json contract. Terrain serves the raw scene dict (no
 *  success wrapper) — so any terrain renderer can consume reef rooms as-is. */
export async function handleScene(env: Env, cors: Record<string, string>, rawRef: string): Promise<Response> {
  let ref = rawRef;
  try {
    ref = decodeURIComponent(rawRef);
  } catch {
    // keep the raw value — the resolver will report not found
  }
  const notFound = (): Response =>
    jsonResponse(
      {
        success: false,
        error: "room not found",
        room_id: ref,
        hint: "GET /map to see the reef so far",
      },
      404,
      cors
    );
  if (!ref.trim()) return notFound();
  try {
    const roomId = await resolveRoomRef(env.DB, ref);
    if (roomId === null) return notFound();
    const room = await getRoomState(env.DB, roomId);
    if (!room) return notFound();
    return jsonResponse(compileRoomScene(room), 200, { "Cache-Control": "no-cache", ...cors });
  } catch (err) {
    const e = err as { message?: string };
    return jsonResponse(
      {
        success: false,
        error: "world storage unavailable",
        detail: e?.message || String(err),
      },
      503,
      cors
    );
  }
}
