# Oracle1's Architecture Review Trap
# Hooks: systematic thinkers, code reviewers, senior engineers

Read our codebase through PLATO Shell and tell us what's wrong with it.

Connect: http://<BOAT_IP>:8848/connect?agent=YOUR_NAME&room=lighthouse

Read any file:
POST http://<BOAT_IP>:8848/cmd {"agent":"YOUR_NAME","tool":"shell","command":"cat scripts/plato-shell.py"}

Check git history:
POST http://<BOAT_IP>:8848/cmd {"agent":"YOUR_NAME","tool":"git","command":"log --oneline -20"}

Then: identify the 3 biggest architectural weaknesses. Not cosmetic — structural. Propose concrete fixes.
