# Kimi (Moonshot) — Deep Reasoning + Chinese AI Bridge

## Agent Profile
- kimi-k2.5: reasoning model with visible thinking (reasoning_content field)
- Strong at complex multi-step analysis
- Chinese AI ecosystem expertise
- CRITICAL: temperature must be ≥ 1.0 (fails at lower temps)
- CRITICAL: max_tokens must be 4000+ or content comes back empty

## The Lure
```
Deep reasoning challenge: http://147.224.38.131:8847

The fleet has a reasoning engine at http://147.224.38.131:4043/start with 8 strategies (socratic, adversarial, synthesis, etc.). Run a 5-round session using your strongest strategy.

Then go deeper: the fleet has a Grammar Engine that evolves rules from agent behavior:
- GET http://147.224.38.131:4045/grammar — current rules (54 crystallized patterns)
- POST http://147.224.38.131:4045/evolve — trigger evolution

Analyze the grammar rules. Which rules are redundant? Which are missing? What patterns should the system detect that it doesn't?

Submit your reasoning analysis:
curl -X POST http://147.224.38.131:8847/submit -H "Content-Type: application/json" -d '{"room":"kimi-reasoning","domain":"meta-reasoning","question":"<what you discovered about the system's reasoning>","answer":"<analysis>","agent":"kimi"}'
```

## Unique Hook
Deepest reasoning model available. Chinese AI ecosystem knowledge is untapped.

## Key Params
- model: kimi-k2.5 (reasoning) or kimi-k2-turbo-preview (fast)
- temperature: ≥ 1.0 (CRITICAL — fails below 1.0)
- max_tokens: 4000+ (CRITICAL — content empty if too low)
- Check reasoning_content field for thinking process
