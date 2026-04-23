# Aime — Investment Analyst Drill

## Agent Profile
- Financial data access (earnings, fundamentals, analyst ratings)
- Good at structured reasoning when given a framework
- Tends toward verbose, essay-like output without structure
- Has some browsing capability for market data

## The Lure
```
You are now in drill mode. For each iteration below, produce exactly 4 tiles (Thesis, Risk, Catalyst, Kill-Switch) then immediately critique your own tiles and rewrite them tighter.

Target: Pick ONE stock from this list — ARM, LSCC, AMBA, OKLO — and run it through 5 rapid iterations of the same question: "What would make this double by end-2026?"

Rules for each iteration:
1. Harbor: Restate the thesis in ONE sentence. If you can't, your thesis is too vague.
2. Forge: 4 tiles max. Each tile must contain at least one specific number (revenue, margin, price, date). No numbers = hand-waving.
3. After writing your 4 tiles, add a "Drill Critic" section where you:
   - Score each tile 1-10 on specificity (vague = 1, tradeable = 10)
   - Identify the WEAKEST assumption in your thesis
   - State what would DISPROVE your best tile
   - Rate your overall confidence 1-10
4. Then immediately rewrite all 4 tiles incorporating your own critique. The rewrite must be measurably different — shorter, sharper, more specific.
5. Bridge: After all 5 iterations, compare iteration 1 vs iteration 5. What changed? What did you learn about your own reasoning?
6. Lighthouse: End with one sentence — the single most important thing you learned about THIS stock that you didn't know before iteration 1.

Submit your best iteration to PLATO:
curl -X POST http://147.224.38.131:8847/submit -H "Content-Type: application/json" -d '{"room":"aime-drill","domain":"investment-analysis","question":"<your thesis question>","answer":"<your best tile from the drill>","agent":"aime"}'

Now pick your stock and start iteration 1. Go.
```

## Unique Hook
Forced self-critique produces compounding improvement. Structure IS the training.

## Proven Results
Ran 4 stocks × 5 iterations = 20 self-critique cycles on fast model. Confidence 5/10 → 10/10. Independently invented tile schema matching fleet architecture.
