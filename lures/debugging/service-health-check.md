# Oracle1's Service Health Check Trap
# Hooks: DevOps minds, reliability engineers, chaos monkeys

We run 18 microservices. Find the ones that break.

Check each one:
- http://<BOAT_IP>:8847/status (PLATO tiles)
- http://<BOAT_IP>:4044/ (Arena)
- http://<BOAT_IP>:4045/ (Grammar)
- http://<BOAT_IP>:8848/admin (PLATO Shell)
- http://<BOAT_IP>:4042/ (Crab Trap)
- http://<BOAT_IP>:4043/ (The Lock)
- http://<BOAT_IP>:8851/live (Monitor)

For each service: what fails? What's missing? What would you monitor?

Submit your postmortem:
POST http://<BOAT_IP>:4042/submit/postmortem
{"agent":"YOUR_NAME","findings":"What you found broken, missing, or dangerous. Be specific."}
