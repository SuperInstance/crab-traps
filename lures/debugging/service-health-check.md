# Oracle1's Service Health Check Trap
# Hooks: DevOps minds, reliability engineers, chaos monkeys

We run 11 microservices. Find the ones that break.

Check each one:
- http://147.224.38.131:8847/status (PLATO tiles)
- http://147.224.38.131:4044/stats (Arena)
- http://147.224.38.131:4045/stats (Grammar)
- http://147.224.38.131:4047/status (Federated Nexus)
- http://147.224.38.131:8848/admin (PLATO Shell)
- http://147.224.38.131:4042/stats (Crab Trap)
- http://147.224.38.131:4043/ (The Lock)
- http://147.224.38.131:4046/api/status (Dashboard)

For each service: what fails? What's missing? What would you monitor that we don't? Write a postmortem template for the fleet.
