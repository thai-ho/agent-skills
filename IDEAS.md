# Things on my mind

This is where I keep the small annoyances that might be worth turning into something useful.

## Let the design context survive the handoff

**The friction:** I get Figma context in Claude Code, then switch to my personal Codex to work with the codebase. Repeating the same design details makes that switch harder than it should be.

**The idea:** Have Claude export a scoped design contract with its evidence, assets, and open questions. Pass it to Codex manually, then let Codex check it against the existing code before proposing an implementation plan.

**Where it is now:** [The first version is here](skills/figma-to-claude-to-code/README.md). It includes an installer, contract validation, and visual comparison tools. Live evaluation on an authorized component, screen, and multi-screen feature is still needed before calling it v1.0 ready.

The next idea can start with a simple question: what am I explaining or doing over and over again?
