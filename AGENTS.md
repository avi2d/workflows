# Project agent memory

workflows holds the shared GitHub Actions plumbing the avi2d repositories call, and `README.md` holds what a person reads.

## Before you change a part

- An action folder at the root, such as `setup/`: keep its steps doing what the step text it came from does, and update [The shared actions](docs/actions.md) with it.
- Any file: this repository is public, so a private setting reaches the code only as [What a private caller supplies](README.md#what-a-private-caller-supplies) lists.
- A file under `.github/workflows/`: it merges only on the captain's word.
- A smoke job in `.github/workflows/ci.yml`: each step's name says the wrong behaviour it rejects.
- A release: a `v1.x.y` tag never moves, and the `v1` tag moves to the newest release, as [Install](README.md#install) says.
