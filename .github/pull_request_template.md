<!--
Pick the template that matches the change, or delete this block for a tooling change:

  New predicate or new version:  ?template=new-predicate.md
  Status change or deprecation:  ?template=status-change.md

(Append the query string to the "Create pull request" URL.)
-->

## Summary

<!-- What changes and why. One paragraph. -->

## Checklist

- [ ] Every commit carries a DCO `Signed-off-by` trailer (`git commit -s`).
- [ ] `docker compose run --rm validate` passes locally.
- [ ] No instance-specific value (IRI prefix, host name, project name) is written outside `registry.config.json` and `wrangler.toml`.
