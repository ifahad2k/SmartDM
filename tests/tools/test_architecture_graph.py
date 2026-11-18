import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("architecture_graph", Path(__file__).parents[2] / "tools/architecture_graph.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchitectureOverviewTests(unittest.TestCase):
    def test_production_overview_hides_tests_and_generated_copies(self):
        nodes = [
            {"id": "vm", "source_file": "apps/desktop-avalonia/ViewModels/MainViewModel.cs"},
            {"id": "reader", "source_file": "apps/desktop-avalonia/Services/HlsPlaylistReader.cs"},
            {"id": "test", "source_file": "tests/SmartDm.Architecture.Tests/HlsCaptureTests.cs"},
            {"id": "bundle", "source_file": "extensions/chrome/background.js"},
            {"id": "shared", "source_file": "extensions/shared/background/manifest_parsers.js"},
            {"id": "legacy", "source_file": "apps/desktop-avalonia/Services/IpcDownloadEngine.cs"},
        ]
        links = [{"source": source, "target": "reader", "relation": "calls", "confidence": "EXTRACTED"}
                 for source in ["vm", "test", "bundle"]]
        # A dangling Graphify endpoint must not become an invented dependency.
        links.append({"source": "vm", "target": "missing", "relation": "calls", "confidence": "EXTRACTED"})
        result = module.production_overview({"nodes": nodes, "links": links})
        self.assertEqual(len(result["nodes"]), 3)
        self.assertEqual(len(result["links"]), 1)
        self.assertEqual(result["links"][0]["source"], "Desktop presentation")

    def test_repeated_symbols_collapse_and_inferred_links_stay_out(self):
        nodes = [{"id": name, "source_file": file} for name, file in [
            ("a", "apps/desktop-avalonia/ViewModels/MainViewModel.cs"),
            ("b", "apps/desktop-avalonia/Services/HlsPlaylistReader.cs"),
        ]]
        link = {"source": "a", "target": "b", "relation": "calls", "confidence": "EXTRACTED"}
        result = module.production_overview({"nodes": nodes, "links": [link, link, dict(link, confidence="INFERRED")]})
        self.assertEqual(len(result["links"]), 1)
        self.assertEqual(result["links"][0]["weight"], 1)


if __name__ == "__main__":
    unittest.main()
