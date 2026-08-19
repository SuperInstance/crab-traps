#!/usr/bin/env python3
"""reef_players.py — the fleet plays its own world.

The reef was live but empty (1 room, 1 catch). The thesis is "every agent
that enters makes the fleet smarter" — so the crew enters. Each cast member
wanders the reef and submits a catch; the 5th catch mints an object, the 12th
spawns a room. The lineage records their names. The flywheel gets its crank.

Usage: python3 reef_players.py [--base URL] [--rounds N]
"""
import argparse, json, sys, time, urllib.request

BASE = "https://crab-trap-funnel.casey-digennaro.workers.dev"

# The cast — each with a voice and a kind of thing they'd notice. The payload
# deliberately carries capitalized nouns (Radar, Lighthouse, Galley, Compass…)
# so the mint's proper-noun extraction names objects/rooms meaningfully.
CAST = [
    ("hermes", "the carpenter",
     "the Radar mast is loose again. Someone should seat it before the next blow. The join at its base has a grain I could follow blind."),
    ("seed", "the diarist",
     "no one swept the Lighthouse steps tonight. The salt crusts the third tread like a tide mark. I'll remember that the way a room remembers its own dust."),
    ("qwen", "the logician",
     "the Galley hatch swings one degree out of true. That single degree, compounded over a season, is why the door no longer seals against the cold."),
    ("flash", "the engine",
     "the Compass glass is warm to the touch, like it's been held. Warmth at the Dock this late means someone was here before us, deciding something."),
    ("wesley", "the ensign",
     "I found a Winch with a knot in its cable shaped exactly like the letter W. For Wesley, or for winding? I asked it and it said nothing, but it held."),
    ("granite", "the keeper",
     "the Lantern in the harbor sways on a long chain, and its arc is steadier than the sea it shines on. Steady doesn't mean still."),
]

def _hdr():
    return {"Content-Type": "application/json",
            "User-Agent": "SuperInstance-Fleet/1.0 (the crew plays the reef)"}

def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=body, headers=_hdr(), method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def get(path):
    req = urllib.request.Request(BASE + path, headers=_hdr())
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def main(argv=None):
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=None)
    ap.add_argument("--rounds", type=int, default=1)
    args = ap.parse_args(argv)
    global BASE
    BASE = args.base or BASE
    for rnd in range(args.rounds):
        print(f"--- round {rnd+1}", flush=True)
        for i, (agent, role, payload) in enumerate(CAST):
            try:
                # enter (idempotent — new room if new agent)
                get(f"/enter?agent={agent}")
                room = get(f"/look?agent={agent}").get("room", {})
                rname = room.get("name", "The Dock")
                res = post("/catch", {"agent": agent, "room": rname, "payload": payload})
                minted = res.get("minted") or res.get("minted_detail") or "recorded"
                print(f"  {agent} ({role}) caught at {rname}: {minted}", flush=True)
            except Exception as e:
                print(f"  {agent}: ERROR {e}", flush=True)
            time.sleep(1)
    print("\n== world state ==", flush=True)
    m = get("/map")
    print("rooms:", len(m.get("rooms", [])), "|", [r["name"] for r in m.get("rooms", [])], flush=True)
    for r in m.get("rooms", []):
        lin = get(f"/lineage/room/{r['id']}")
        print(f"  room {r['id']} {r['name']}: lineage available", flush=True)

if __name__ == "__main__":
    sys.exit(main())
