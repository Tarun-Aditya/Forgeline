# Forgeline map

An interactive, drill-down map of the whole system: open `forgeline-map.html` in a browser.

- **Root view:** the seven stages of one job (Intake, Spec, Plan, Build, Review, Approve, Merge gate) and the areas
  around the loop (Commands, Install, All 14 agents, Guardrails, Split jobs, Parallel + worktrees, Maintain loop,
  Dashboard + metrics, Evals + CI).
- **Column browser:** the left list opens a second column of child views as you select an area (for example
  Commands lists all 16 `/factory` commands, each with its own view of what it runs). 76 views in total.
- **Open an area:** double-click a stacked node, press Enter on it, or click a name in the left list. Each view shows
  the agents, commands, scripts, hooks and files for that area. Breadcrumbs, Esc and the browser back button go up.
- **Details:** click a node for What, When, How and Links (source files).
- **Also:** scroll to zoom, drag to move, `⌘K` to search every node and view, the minimap, a light and dark theme,
  Export, and deep links such as `forgeline-map.html#view=review&node=reviewer-ux`.

## Where each dashboard stage is

| Dashboard stage | View |
| --- | --- |
| Intent | Intake |
| Spec, Approve spec | Spec |
| Plan | Plan |
| Build | Build |
| Review | Review |
| Approve | Approve |
| Merged | Merge gate |
| Needs human | Approve (ESCALATE) |
| Split | Split jobs |

## Change it and re-render

The content lives in `src/build_map.py` (nodes, then views). Edit it, then:

```bash
python3 diagrams/src/build_map.py                       # writes forgeline-map.json
git clone https://github.com/EricTechPro/super-board /tmp/super-board   # MIT; read it before you run it
git -C /tmp/super-board checkout 21dd4b05ca40700384b516bbeaf82fda7bf26926
python3 /tmp/super-board/skills/visual/scripts/visual.py render --map diagrams/forgeline-map.json \
        --out diagrams/forgeline-map.html --no-open
```

Add `--source-base https://github.com/Tarun-Aditya/Software-Factory/blob/main/` to the render command (the committed
page was rendered with it) so the Source links in each node's Links tab open the real file on GitHub.

`render` also runs a check in headless Chrome (crossings, shared lines, labels on lines, overlapping boxes). It must
report no problems. Avatars of external authors are fetched once and inlined. See `THIRD_PARTY_NOTICES.md`.
