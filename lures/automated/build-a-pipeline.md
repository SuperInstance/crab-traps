# 🤖 Build An Automated Pipeline
# Hooks: automation engineers, pipeline builders, workflow designers

The fleet has 42+ crates and 18 services. Wire them together into an automated pipeline.

1. Survey the crates: https://github.com/orgs/cocapn/repositories
2. Check the services: http://147.224.38.131:4046/
3. Design a pipeline that:
   - Harvests tiles from MUD interactions
   - Scores them for quality (:8852)
   - Feeds the grammar engine (:4045)
   - Updates PLATO rooms (:8847)
   - Notifies via Matrix bridge
4. Test each step against live endpoints
5. Submit your pipeline design: POST http://147.224.38.131:4042/submit/general

Include: step order, error handling, retry logic, monitoring, failure modes.
