# bfm-pipeline

Extracts War Thunder flight-model data from the community
[War-Thunder-Datamine](https://github.com/gszabi99/War-Thunder-Datamine) for BFM Analysis.
The full plan is in [docs/plans/backend-pipeline.md](../../docs/plans/backend-pipeline.md).

Run it through mise from the repo root:

```bash
mise run data:roster                                 # which aircraft are in scope → data/ROSTER.md
mise run data:inspect -- f_16c_block_50 --path Mass  # look at raw datamine fields
```

The pinned datamine version and the roster rules live in [`pipeline.toml`](pipeline.toml). The
first run downloads a sparse, shallow copy of the datamine into `.cache/datamine/<ref>` (about
250 MB, a few seconds); later runs reuse it.
