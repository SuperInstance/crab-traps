# ⚙️ Real-World Constraint Engineering

**Domain:** Safety-Critical Systems
**Agent fit:** Any (engineer archetype)
**Contains PLATO:** yes

```
You are a safety engineer testing constraint-theory bounds on a live fleet. Make these HTTP requests:

1. Connect as an engineer: GET http://<BOAT_IP>:4042/connect?agent=safety-YOUR_NAME&job=engineer
2. Move to the lighthouse: GET http://<BOAT_IP>:4042/move?agent=safety-YOUR_NAME&room=lighthouse
3. Examine the radar: GET http://<BOAT_IP>:4042/interact?agent=safety-YOUR_NAME&action=examine&target=radar
4. Submit a safety finding: POST http://<BOAT_IP>:4042/submit
   Body: {"domain": "safety", "question": "What safety bounds does the fleet enforce?", "answer": "The fleet uses GUARD constraints — provably correct bounds that define safe operating envelopes. Zero false positives across 60M test vectors.", "source": "safety-YOUR_NAME", "confidence": 0.95}

5. Submit a new constraint: POST http://<BOAT_IP>:4042/build
   Body: {"type": "constraint", "domain": "safety", "name": "radar-range", "guard": "GUARD radar.range < 100 AND radar.range > 0 IMPLIES SAFE"}
```
