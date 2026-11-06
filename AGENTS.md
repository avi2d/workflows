# Project agent memory

workflows holds the shared GitHub Actions plumbing the avi2d repositories call, and `README.md` holds what a person reads.

## Before you change a part

- An action under `actions/`: keep its steps doing what the step text it came from does, and update [The shared actions](docs/actions.md) with it.
- Any file: this repository is public, so a private setting reaches the code only as [What a private caller supplies](README.md#what-a-private-caller-supplies) lists.
- A file under `.github/workflows/`: it merges only on the captain's word.
- A smoke job in `.github/workflows/ci.yml`: each step's name says the wrong behaviour it rejects.
- A release: callers pin a tag's commit, as [Install](README.md#install) says, so a tag never moves.
