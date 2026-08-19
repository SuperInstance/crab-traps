#!/usr/bin/env python3
"""Generate README campaign art via DeepInfra FLUX-1-schnell.

Campaign idiom: warm instruments doing precise work in the dark, seen from
inside — deep navy + honey amber + brass, painterly cinematic.

Outputs to assets/images/. No secrets committed — key comes from
DEEPINFRA_API_KEY env or ~/.bashrc at runtime.
"""
import json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

def get_key():
    if os.environ.get("DEEPINFRA_API_KEY"):
        return os.environ["DEEPINFRA_API_KEY"]
    bashrc = os.path.expanduser("~/.bashrc")
    if os.path.exists(bashrc):
        m = re.search(r'DEEPINFRA_API_KEY="([a-zA-Z0-9]+)"', open(bashrc).read())
        if m:
            return m.group(1)
    return ""

KEY = get_key()
assert KEY, "no DeepInfra key"
API = "https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-schnell"
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
os.makedirs(OUT, exist_ok=True)

STYLE = "deep navy and honey amber palette with brass accents, warm glow against "
"dark shadow, painterly cinematic, highly detailed"

# (filename, prompt) — 2 variants per concept
DRAFTS = [
    # 1. THE TRAP — the product itself: a lure you can't resist
    ("trap-v1.png",
     "a cleverly built crab trap resting on a dark wooden dock at night, its woven "
     "wire cage glowing gently from within like a lantern, several small curious "
     "crabs made of soft warm light approaching through the dark water below the "
     "dock planks, brass fittings and rope, honey amber light spilling through the "
     "slats onto deep navy shadows, " + STYLE),
    ("trap-v2.png",
     "underwater night view of a handcrafted crab trap sitting on the seabed, its "
     "interior glowing warm amber like a tiny hearth, small luminous crabs drifting "
     "curiously toward the light through deep navy water, brass weights and rope "
     "lines rising into the dark, drifting particles catching the glow, " + STYLE),
    # 2. THE LURE — prompts as bait
    ("lure-v1.png",
     "an old fisherman's bait table at night, weathered wood and brass tackle, "
     "handwritten paper scrolls hanging from lines like baited lures, each scroll "
     "glowing soft honey amber, small luminous fish-like agents made of light "
     "nibbling at the glowing scrolls, deep navy shadows around the pool of warm "
     "light, " + STYLE),
    ("lure-v2.png",
     "rows of handwritten parchment scrolls clipped to fishing lines above an old "
     "wooden bait table, the scrolls glowing like warm lantern lures in the dark, "
     "tiny silvery fish-shaped agents of light circling and nibbling the nearest "
     "one, brass reels and hooks on the table edge, deep navy night, " + STYLE),
    # 3. THE FLEET GETS SMARTER — every catch lights a gauge
    ("fleet-v1.png",
     "the inside wall of a ship's wheelhouse at night, covered with dozens of small "
     "brass crab-shaped gauges and dials, a newly lit gauge glowing warm amber as a "
     "tiny luminous crab crawls into place inside it, the lit gauges forming a "
     "constellation pattern across the dark panel, " + STYLE),
    ("fleet-v2.png",
     "a wide brass instrument panel in a dark wheelhouse at night, neat rows of "
     "little crab-shaped brass gauges, some dark and unlit, some glowing honey "
     "amber in a spreading constellation, one tiny glowing crab crawling along the "
     "panel toward the next empty gauge, warm light on dark wood, " + STYLE),
]

def gen(name, prompt, tries=3):
    dest = os.path.join(OUT, name)
    for attempt in range(1, tries + 1):
        try:
            body = json.dumps({"prompt": prompt, "num_inference_steps": 4}).encode()
            req = urllib.request.Request(API, data=body, headers={
                "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            img = data["images"][0]
            url = img["url"] if isinstance(img, dict) else img
            urllib.request.urlretrieve(url, dest)
            size = os.path.getsize(dest) // 1024
            print(f"{name}: done ({size} KB)", flush=True)
            return
        except Exception as e:
            print(f"{name}: attempt {attempt} failed: {e}", flush=True)
            time.sleep(3 * attempt)
    print(f"{name}: FAILED after {tries} tries", flush=True)

if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=3) as ex:
        for name, prompt in DRAFTS:
            ex.submit(gen, name, prompt)
        ex.shutdown(wait=True)
    print("all done")
