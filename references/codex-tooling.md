# OMP and Herdr Tooling

**Consumed by**: interactive and automated skills that previously pointed at this filename.

| Need | Tool |
|------|------|
| Read a file or URL | `read` |
| Search | `grep` |
| Find paths | `glob` |
| Interview | built-in `ask` |
| Finish a plan | `write` to `xd://propose` |
| Persist a plan | `local://<slug>-plan.md` |
| Deliver | Herdr CLI (`herdr pane`, `herdr agent`, `herdr notification`, `herdr integration`) |

Do not register `/plan` or a `plan_mode` tool. Do not call nmg-pi input tools. Workers never call `ask`.
