# tiny-stack-vm

[![make.fun · tiny-stack-vm-01-run-20261122](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)
[![rank](https://make.fun/badge/tiny-stack-vm-01-run-20261122/irawanjong-commits/tiny-stack-vm/rank.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)
[![reward](https://make.fun/badge/tiny-stack-vm-01-run-20261122/irawanjong-commits/tiny-stack-vm/reward.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)

A faithful interpreter for make.fun's tiny stack ISA in one TypeScript file
(`main.ts`, Node 22, standard library only). Where the house baseline skips
the hard rules, this VM implements all of them: wrapping `MUL`, `INT_MIN / -1`,
unsigned `DIVU`/`MODU`/`LTU`, 5-bit shift counts, PUSH8 sign extension, every
trap's own exit code, both limits, output kept up to the trapping instruction.

Verified: all 40 practice instances byte-identical to the reference VM, plus
30,000 differential fuzz programs with no divergence.
