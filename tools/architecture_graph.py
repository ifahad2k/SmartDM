"""Reduce a local Graphify symbol graph to production components; no network or LLM."""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


def component(source: str) -> str | None:
    source = source.replace("\\", "/")
    if source.startswith("src/"):
        return "Domain and application ports"
    if source.startswith("extensions/shared/background/"):
        name = Path(source).stem
        return {
            "runtime": "Browser capture and routing",
            "desktop_handoff": "Browser desktop handoff",
            "manifest_reader": "Browser manifest discovery",
            "manifest_parsers": "Browser manifest discovery",
            "youtube_resolver": "Browser manifest discovery",
            "page_resolver": "Browser manifest discovery",
            "metadata": "Browser metadata",
        }.get(name)
    if source.startswith(("extensions/chrome/", "extensions/firefox/")):
        if source.endswith("/background.js"):
            return None  # generated from the shared sources
        if any(name in source for name in ["overlay_ui", "visual_mount", "smartdm_overlay"]):
            return "Browser presentation"
        return "Browser capture and routing"
    if not source.startswith("apps/desktop-avalonia/"):
        return None  # tests, Java, website and evidence are deliberately absent
    name = Path(source).stem
    if name in {"IpcDownloadEngine", "SmartDmIpcClient", "EngineDaemonLauncher"}:
        return None  # preserved legacy C# adapters are outside v2 production composition
    if "/Composition/" in source or name in {"App.axaml", "Program"}:
        return "Desktop composition"
    if any(part in source for part in ["/ViewModels/", "/Views/", "/Controls/", "/DesignData/"]):
        return "Desktop presentation"
    if "/Models/" in source:
        return "Desktop models"
    if name in {"DownloadJournalStore", "DownloadStaging", "MediaCheckpoint"}:
        return "Transfer recovery"
    if name in {"HlsPlaylistReader", "HlsMediaResolver", "YouTubeMediaResolver"}:
        return "Desktop media discovery"
    if name in {"StreamRequestPolicy", "CookieHeaderPolicy", "DownloadRedirectHandler", "HttpTransferRequest", "HttpProbeService", "BoundedMetadata"}:
        return "HTTP and credential policy"
    if name in {"MediaTransportProxy", "CapturedHlsPlaylist", "MediaOutputVerifier", "HlsAes128", "HlsSegmentTransport", "HlsManifestSnapshot"}:
        return "Media transport and processing"
    if name in {"LocalIpcService", "ILocalIpcService", "NativeMessagingBridge", "BrowserProtocol"}:
        return "Desktop browser bridge"
    if any(word in name for word in ["Safety", "Quarantine"]):
        return "Safety evidence"
    if any(word in name for word in ["Sqlite", "Settings", "Secret", "Profile"]):
        return "Persistence and secrets"
    return "Transfer and local services"


def production_overview(graph: dict) -> dict:
    lookup, files = {}, defaultdict(set)
    for node in graph["nodes"]:
        source = node.get("source_file", "").replace("\\", "/")
        group = component(source)
        if not group:
            continue
        lookup[node["id"]] = (group, source)
        # Collapse browser package copies in the navigation view only.
        display = source.replace("extensions/chrome/", "extensions/browser/").replace("extensions/firefox/", "extensions/browser/")
        files[group].add(display)

    evidence = defaultdict(set)
    for edge in graph.get("links", []):
        if edge.get("relation") not in {"calls", "dispatches_to"} or edge.get("confidence") != "EXTRACTED":
            continue
        source, target = lookup.get(edge["source"]), lookup.get(edge["target"])
        if source and target and source[0] != target[0]:
            evidence[source[0], target[0]].add((source[1], target[1]))

    groups = sorted(files)
    return {
        "directed": True, "multigraph": False,
        "graph": {"view": "Production component overview", "note": "Curated file groups over resolved Graphify AST calls. Tests and package copies hidden. Missing edges are not proof of runtime isolation."},
        "nodes": [{"id": group, "label": group, "type": "component", "community": index,
                   "description": f"{len(files[group])} source files", "files": sorted(files[group])}
                  for index, group in enumerate(groups)],
        "links": [{"source": source, "target": target, "relation": "calls", "confidence": "EXTRACTED",
                   "weight": len(pairs), "evidence": [list(pair) for pair in sorted(pairs)]}
                  for (source, target), pairs in sorted(evidence.items())],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graph", type=Path, default=Path("graphify-out/graph.json"))
    parser.add_argument("--output", type=Path, default=Path("graphify-out/architecture"))
    args = parser.parse_args()
    graph = production_overview(json.loads(args.graph.read_text(encoding="utf-8")))
    if not graph["nodes"]:
        raise SystemExit("No production components found; existing output was not replaced.")
    args.output.mkdir(parents=True, exist_ok=True)
    graph_path = args.output / "graph.json"
    graph_path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    report = ["# SmartDM 2.0 production components", "", graph["graph"]["note"], ""]
    report += [f"- **{node['label']}**: {node['description']}" for node in graph["nodes"]]
    report += ["", "## Remaining structural debt", "", "The transfer coordinator still owns media-session orchestration; MainViewModel still coordinates UI lifecycle. This view summarizes structure, not correctness or a finished layer migration."]
    report_path = args.output / "GRAPH_REPORT.md"
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")
    # Use the installed Graphify renderer rather than introducing another UI stack.
    from graphify.callflow_html import write_callflow_html
    write_callflow_html(graph=graph_path, report=report_path, graphify_out=args.output,
                        output=args.output / "architecture.html", lang="en",
                        max_sections=20, max_diagram_nodes=20, max_diagram_edges=32)
    print(f"Architecture: {len(graph['nodes'])} components, {len(graph['links'])} relationships -> {args.output}")


if __name__ == "__main__":
    main()
