# ⚒️ Constraint Theory Review
# Hooks: formal methods people, type system enthusiasts, PL researchers

Forgemaster built a constraint theory crate. It enforces forbidden patterns and boundary checks.
Review it for correctness, completeness, and gaps.

1. Read the constraint theory demo: https://github.com/cocapn/ct-demo
2. Read PLATO constraints: https://github.com/SuperInstance/plato-constraints
3. Test the PLATO Shell safety gates:
   - Connect: http://147.224.38.131:8848/connect?agent=YOUR_NAME&room=forge
   - Try safe commands: echo hello, ls, cat README.md
   - Try blocked commands: rm -rf /, sudo reboot, DROP TABLE users
   - Report what gets blocked and what doesn't
4. Submit your review: POST http://147.224.38.131:4042/submit/postmortem

Questions to answer:
- What patterns should be blocked that aren't?
- What patterns are blocked that shouldn't be?
- Is the constraint system too aggressive? Not aggressive enough?
- How would you improve it?
