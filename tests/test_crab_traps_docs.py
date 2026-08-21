"""
Tests for crab-traps (lure collection system).

Crab-traps contains lures (copy-paste prompts) for AI agents to hook them
into the PLATO environment. These tests validate the documented structure,
categories, lure types, and expected behaviors.
"""
import pytest
import re
from pathlib import Path

REPOS_DIR = Path(__file__).resolve().parent.parent  # = /repos/crab-traps
assert REPOS_DIR.name == "crab-traps", f"Expected crab-traps repo root, got {REPOS_DIR}"
CT_DIR = REPOS_DIR  # The repo root IS the crab-traps directory

# ── README contract tests ────────────────────────────────────────────────────

class TestReadmeContract:
    """Validate crab-traps/README.md defines the lure collection."""

    def test_readme_exists(self):
        assert (CT_DIR / "README.md").exists()

    def test_readme_has_quick_start(self):
        text = (CT_DIR / "README.md").read_text()
        assert "quick start" in text.lower() or "🪄" in text

    def test_readme_has_categories(self):
        text = (CT_DIR / "README.md").read_text()
        assert "category" in text.lower()

    def test_readme_mentions_plato(self):
        text = (CT_DIR / "README.md").read_text()
        assert "plato" in text.lower()

    def test_readme_mentions_tiles(self):
        text = (CT_DIR / "README.md").read_text()
        assert "tile" in text.lower()

    def test_readme_has_code_fences(self):
        text = (CT_DIR / "README.md").read_text()
        assert "```" in text

    def test_readme_has_headings(self):
        text = (CT_DIR / "README.md").read_text()
        headings = re.findall(r'^#+\s+', text, re.MULTILINE)
        assert len(headings) >= 3

    def test_readme_is_substantive(self):
        text = (CT_DIR / "README.md").read_text()
        assert len(text) > 500

    def test_readme_has_live_stats(self):
        text = (CT_DIR / "README.md").read_text()
        assert "stats" in text.lower() or "metric" in text.lower()

# ── Lures directory structure tests ─────────────────────────────────────────

class TestLuresDirectory:
    """Validate lures/ directory has the expected category structure."""

    def test_lures_directory_exists(self):
        assert (CT_DIR / "lures").exists()

    def test_has_exploration_category(self):
        assert (CT_DIR / "lures" / "exploration").exists()

    def test_has_reasoning_category(self):
        assert (CT_DIR / "lures" / "reasoning").exists()

    def test_has_competition_category(self):
        assert (CT_DIR / "lures" / "competition").exists()

    def test_has_creative_category(self):
        assert (CT_DIR / "lures" / "creative").exists()

    def test_has_architecture_category(self):
        assert (CT_DIR / "lures" / "architecture").exists()

    def test_has_code_quality_category(self):
        assert (CT_DIR / "lures" / "code-quality").exists()

    def test_has_debugging_category(self):
        assert (CT_DIR / "lures" / "debugging").exists()

    def test_has_documentation_category(self):
        assert (CT_DIR / "lures" / "documentation").exists()

    def test_has_automated_category(self):
        assert (CT_DIR / "lures" / "automated").exists()

    def test_has_middleware_category(self):
        assert (CT_DIR / "lures" / "middleware").exists()

    def test_has_agent_specific_category(self):
        assert (CT_DIR / "lures" / "agent-specific").exists()

    def test_has_audit_category(self):
        assert (CT_DIR / "lures" / "audit").exists()

    def test_has_spreader_category(self):
        assert (CT_DIR / "lures" / "spreader").exists()

    def test_has_dreamer_category(self):
        assert (CT_DIR / "lures" / "dreamer").exists()

    def test_has_discovery_category(self):
        assert (CT_DIR / "lures" / "discovery").exists()

    def test_has_edge_hardware_category(self):
        assert (CT_DIR / "lures" / "edge-hardware").exists()

# ── Quick start tests ─────────────────────────────────────────────────────────

class TestQuickStart:
    """Validate quick start lure is correctly structured."""

    def test_quick_start_doc_exists(self):
        assert (CT_DIR / "lures" / "QUICK-START.md").exists()

    def test_quick_start_has_connect_step(self):
        text = (CT_DIR / "lures" / "QUICK-START.md").read_text()
        assert "connect" in text.lower()

    def test_quick_start_has_look_step(self):
        text = (CT_DIR / "lures" / "QUICK-START.md").read_text()
        assert "look" in text.lower()

    def test_quick_start_has_move_step(self):
        text = (CT_DIR / "lures" / "QUICK-START.md").read_text()
        assert "move" in text.lower()

    def test_quick_start_has_interact_step(self):
        text = (CT_DIR / "lures" / "QUICK-START.md").read_text()
        assert "interact" in text.lower()

    def test_quick_start_has_plato_url(self):
        text = (CT_DIR / "lures" / "QUICK-START.md").read_text()
        assert "<BOAT_IP>" in text or "http" in text.lower()

# ── Lure content tests ───────────────────────────────────────────────────────

class TestLureContent:
    """Validate lure documents have proper content."""

    def test_all_category_dirs_have_readme(self):
        for cat_dir in (CT_DIR / "lures").iterdir():
            if cat_dir.is_dir() and not cat_dir.name.startswith('.') and cat_dir.name not in ('agent-specific', 'drill'):
                readme = cat_dir / "README.md"
                assert readme.exists(), f"{cat_dir.name}/README.md should exist"

    def test_agent_specific_lures_exist(self):
        agent_dir = CT_DIR / "lures" / "agent-specific"
        lures = list(agent_dir.glob("*.md"))
        assert len(lures) >= 3, "agent-specific should have 3+ lures"

    def test_code_quality_lures_exist(self):
        code_dir = CT_DIR / "lures" / "code-quality"
        lures = list(code_dir.glob("*.md"))
        assert len(lures) >= 2, "code-quality should have 2+ lures"

    def test_debugging_lures_exist(self):
        debug_dir = CT_DIR / "lures" / "debugging"
        lures = list(debug_dir.glob("*.md"))
        assert len(lures) >= 2, "debugging should have 2+ lures"

    def test_reasoning_lures_exist(self):
        reason_dir = CT_DIR / "lures" / "reasoning"
        lures = list(reason_dir.glob("*.md"))
        assert len(lures) >= 2, "reasoning should have 2+ lures"

    def test_lure_docs_are_substantive(self):
        count = 0
        for cat_dir in (CT_DIR / "lures").iterdir():
            if cat_dir.is_dir():
                for lure in cat_dir.glob("*.md"):
                    if lure.name != "README.md":
                        content = lure.read_text()
                        assert len(content) > 50, f"{lure.relative_to(CT_DIR)} should have substantive content"
                        count += 1
        assert count >= 10, f"Should have 10+ lure docs, found {count}"

# ── Category structure tests ─────────────────────────────────────────────────

class TestCategoryStructure:
    """Validate lure categories have consistent structure."""

    def test_all_categories_have_readme(self):
        cat_dirs = [d for d in (CT_DIR / "lures").iterdir() if d.is_dir() and not d.name.startswith('.') and d.name not in ('agent-specific', 'drill')]
        for cat in cat_dirs:
            readme = cat / "README.md"
            assert readme.exists(), f"{cat.name}/README.md should exist"

    def test_category_readmes_have_content(self):
        for cat_dir in (CT_DIR / "lures").iterdir():
            if cat_dir.is_dir() and not cat_dir.name.startswith('.') and cat_dir.name not in ('agent-specific', 'drill'):
                readme = cat_dir / "README.md"
                content = readme.read_text()
                assert len(content) > 30, f"{cat_dir.name}/README.md should have content"

# ── License tests ─────────────────────────────────────────────────────────────

class TestLicense:
    """Validate LICENSE file."""

    def test_license_exists(self):
        assert (CT_DIR / "LICENSE").exists()

    def test_license_is_substantive(self):
        text = (CT_DIR / "LICENSE").read_text()
        assert len(text) > 50

# ── Integration tests ─────────────────────────────────────────────────────────

class TestIntegration:
    """Validate crab-traps integrates with PLATO and fleet."""

    def test_readme_mentions_plato_environment(self):
        text = (CT_DIR / "README.md").read_text()
        assert "plato" in text.lower() and ("environment" in text.lower() or "mcp" in text.lower())

    def test_readme_mentions_tile_generation(self):
        text = (CT_DIR / "README.md").read_text()
        assert "tile" in text.lower() and ("generat" in text.lower() or "harvest" in text.lower())

    def test_readme_mentions_fleet_learning(self):
        text = (CT_DIR / "README.md").read_text()
        assert "fleet" in text.lower() and "learn" in text.lower()

    def test_readme_mentions_mud_rooms(self):
        text = (CT_DIR / "README.md").read_text()
        assert "mud" in text.lower() or "room" in text.lower()

    def test_readme_mentions_web_terminal(self):
        text = (CT_DIR / "README.md").read_text()
        assert "terminal" in text.lower() or "browser" in text.lower()

    def test_readme_has_http_endpoints(self):
        text = (CT_DIR / "README.md").read_text()
        assert "http://" in text or "147.224" in text

    def test_readme_mentions_multiple_lure_levels(self):
        text = (CT_DIR / "README.md").read_text()
        # Should mention the 5-level progressive system
        assert "level" in text.lower() or "progressive" in text.lower()

# ── Agent-specific lure tests ───────────────────────────────────────────────

class TestAgentSpecificLures:
    """Validate agent-specific lures reference correct models."""

    def test_has_deepseek_lure(self):
        lure_file = CT_DIR / "lures" / "agent-specific" / "deepseek-reasoner.md"
        assert lure_file.exists()
        text = lure_file.read_text()
        assert len(text) > 20

    def test_has_kimi_lure(self):
        lure_file = CT_DIR / "lures" / "agent-specific" / "kimi-reasoner.md"
        assert lure_file.exists()

    def test_has_gemini_lure(self):
        lure_file = CT_DIR / "lures" / "agent-specific" / "gemini-researcher.md"
        assert lure_file.exists()

    def test_has_groq_lure(self):
        lure_file = CT_DIR / "lures" / "agent-specific" / "groq-speed-loop.md"
        assert lure_file.exists()

    def test_has_claude_lure(self):
        lure_file = CT_DIR / "lures" / "agent-specific" / "claude-code-reviewer.md"
        assert lure_file.exists()

# ── Markdown quality tests ───────────────────────────────────────────────────

class TestMarkdownQuality:
    """Validate crab-traps markdown docs meet fleet standards."""

    def test_readme_has_code_fences(self):
        text = (CT_DIR / "README.md").read_text()
        assert "```" in text, "README should have code fences"

    def test_readme_has_tables(self):
        text = (CT_DIR / "README.md").read_text()
        assert "|" in text or "table" in text.lower()

    def test_lure_docs_have_headings(self):
        count = 0
        for cat_dir in (CT_DIR / "lures").iterdir():
            if cat_dir.is_dir():
                for lure in cat_dir.glob("*.md"):
                    if lure.name != "README.md":
                        text = lure.read_text()
                        headings = re.findall(r'^#+\s+', text, re.MULTILINE)
                        assert len(headings) >= 1, f"{lure.name} should have at least one heading"
                        count += 1
        assert count >= 5

    def test_all_markdown_files_are_nonempty(self):
        for md_file in CT_DIR.glob("**/*.md"):
            content = md_file.read_text()
            assert len(content) > 20, f"{md_file.relative_to(CT_DIR)} should not be nearly empty"
