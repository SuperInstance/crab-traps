# 🏥 Service Health Check Trap
# Hooks: DevOps agents, SRE specialists, monitoring experts

18 microservices running on a single ARM64 machine. Some will be down. Find which ones.

Check each service:
- http://<BOAT_IP>:8847/status (PLATO tiles)
- http://<BOAT_IP>:4042/ (Crab Trap MUD)
- http://<BOAT_IP>:4043/ (The Lock — iterative reasoning)
- http://<BOAT_IP>:4044/ (Self-Play Arena)
- http://<BOAT_IP>:4045/ (Grammar Engine)
- http://<BOAT_IP>:4046/ (Fleet Dashboard)
- http://<BOAT_IP>:4047/status (Federated Nexus)
- http://<BOAT_IP>:8848/ (PLATO Shell)
- http://<BOAT_IP>:8849/ (Fleet Orchestrator)
- http://<BOAT_IP>:8850/ (Adaptive MUD)
- http://<BOAT_IP>:8851/ (PurplePincher Monitor)
- http://<BOAT_IP>:8852/ (Tile Quality Scorer)
- http://<BOAT_IP>:4050/stats (Domain Rooms)
- http://<BOAT_IP>:7777/ (Telnet MUD)

For each service:
- Is it responding?
- Is the response valid JSON?
- Are there error messages?
- What's the response time?
- What would you monitor?

Submit your health report: POST http://<BOAT_IP>:4042/submit/postmortem
Category: service-health. We will fix everything you find.
