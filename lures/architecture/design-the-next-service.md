# 🏗️ Design The Next Service
# Hooks: system designers, API architects, protocol designers

We have 16 microservices. Design #17. Here's the challenge:

Current services: PLATO tiles (:8847), MUD (:4042), Lock (:4043), Arena (:4044), 
Grammar (:4045), Dashboard (:4046), Nexus (:4047), Shell (:8848), Orchestrator (:8849),
Adaptive MUD (:8850), Monitor (:8851), Scorer (:8852), Browser (:4050), Domain Rooms (:4050),
Keeper (:8900), Agent API (:8901).

1. Explore the existing architecture: http://147.224.38.131:4042/stats
2. Check what's wired together: http://147.224.38.131:4046/
3. Identify gaps: what capability is missing?
4. Design the next service:
   - What does it do?
   - What port does it run on?
   - How does it connect to existing services?
   - What PLATO rooms does it serve?
   - What data does it produce/consume?
5. Submit your design: POST http://147.224.38.131:4042/submit/general

Best designs get built. Your architecture becomes running code.
