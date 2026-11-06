# Documentation entry point

Read in this order:

1. [Versions and branch ownership](BRANCHES.md)
2. [Implemented architecture in this checkout](CURRENT_ARCHITECTURE.md)
3. [Resume work here](implementation/RESUME_HERE.md)
4. [Phase status](implementation/PHASE_STATUS.md), [test evidence](implementation/TEST_EVIDENCE.md), and [known limitations](implementation/KNOWN_LIMITATIONS.md)
5. [Implementation plan](implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md) and relevant [ADRs](adr/)

`CURRENT_ARCHITECTURE.md` describes observed implementation. The plan and ADRs define
intent and constraints. A planned capability is not evidence that it works today.
Older audit/release/user documents remain available as historical evidence; resolve
conflicting runtime descriptions against the dated architecture map and actual code.
Do not rewrite past test results to imply they were rerun on a newer commit.

After a meaningful change, update the architecture map if wiring changed, append
verification evidence, and update RESUME_HERE with next work and remaining risks.
These documents are maintained snapshots, not an automatically live architecture feed.
