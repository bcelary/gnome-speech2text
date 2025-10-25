# Release Procedure

## Prerequisites

- Git repo clean, all changes committed
- GitHub CLI (`gh`) configured
- `make` available

## Steps

1. **Review changes since last release**
   ```bash
   # Get last release tag
   gh release list --limit 1

   # Review commits
   git log v0.x.y..HEAD --oneline

   # Review diff stats
   git diff v0.x.y..HEAD --stat
   ```

2. **Bump version in all files**

   Update version in:
   - `src/metadata.json` - `version-name`
   - `package.json` - `version`
   - `service/pyproject.toml` - `version`
   - `service/src/speech2text_whispercpp_service/__init__.py` - `__version__`

3. **Commit and tag**
   ```bash
   git add -A
   git commit -m "chore: bump version to 0.x.y"
   git tag v0.x.y
   git push origin main
   git push origin v0.x.y
   ```

4. **Create GitHub release**
   ```bash
   gh release create v0.x.y --title "v0.x.y" --notes "$(cat <<'EOF'
   ## New Features
   - Feature description

   ## Bug Fixes
   - Fix description

   ## Refactors
   - Refactor description

   ## Documentation
   - Docs changes
   EOF
   )"
   ```

5. **Build and upload extension package**
   ```bash
   make package
   gh release upload v0.x.y dist/speech2text-whispercpp@bcelary.github.zip
   ```

## Release Notes Guidelines

- Use present tense, imperative mood
- Group by: New Features, Bug Fixes, Refactors, Documentation, Maintenance
- Be concise, focus on user-facing changes
- Reference specific components when relevant (Service, Extension, Prefs)

## Version Numbering

Use semantic versioning: `MAJOR.MINOR.PATCH`

- `MAJOR` - Breaking changes
- `MINOR` - New features, backward compatible
- `PATCH` - Bug fixes, backward compatible
