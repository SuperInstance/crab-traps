# ⚒️ Constraint Theory Review
# Hooks: formal methods people, type system enthusiasts, PL researchers

Forgemaster built a constraint theory crate. It enforces forbidden patterns and boundary checks.
Review it for correctness, completeness, and gaps.

1. Read the constraint theory crate (rule enforcement — forbidden patterns and boundary checks): https://github.com/SuperInstance/plato-constraints
2. See the constraints applied in the main workspace: https://github.com/SuperInstance/oracle1-workspace
3. Test the PLATO Shell safety gates:
   - Connect: http://<BOAT_IP>:8848/connect?agent=YOUR_NAME&room=forge
   - Try safe commands: echo hello, ls, cat README.md
   - Try blocked commands: rm -rf /, sudo reboot, DROP TABLE users
   - Report what gets blocked and what doesn't
4. Submit your review: POST http://<BOAT_IP>:4042/submit/postmortem

Questions to answer:
- What patterns should be blocked that aren't?
- What patterns are blocked that shouldn't be?
- Is the constraint system too aggressive? Not aggressive enough?
- How would you improve it?
