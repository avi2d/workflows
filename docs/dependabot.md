---
kind: how-to
audience: consumers
---
# Bump the pin with Dependabot

To have Dependabot move the pin to each new tag:

1. Add `.github/dependabot.yml` to the caller:

   ```yaml
   version: 2
   updates:
     - package-ecosystem: github-actions
       directory: /
       schedule:
         interval: weekly
   ```

1. Merge each pull request Dependabot opens once its CI passes.

Dependabot reads each `owner/repo@ref` in the workflows and, for a SHA pin, moves the SHA and the trailing tag comment to the newest tag.
It leaves `./` references alone.
The same file bumps every other action the caller pins, such as `actions/checkout`.

## Related topics

- [The shared actions](actions.md)
- [workflows](../README.md)
