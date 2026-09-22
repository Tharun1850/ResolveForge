```sh
cd "/path/to/ResolveForge"
pnpm install --frozen-lockfile
[ -L packages/trueforge/.env ] || [ -e packages/trueforge/.env ] || ln -s ../../.env packages/trueforge/.env
```

```sh
cd "/path/to/ResolveForge"
set -a; source .env; set +a
export RESOLVEFORGE_TARGET_REPO="/path/to/target-repository"
pnpm resolveforge:dev
```

```sh
cd "/path/to/ResolveForge"
pnpm standalone:dev
```

```sh
cd "/path/to/ResolveForge"
set -a; source .env; set +a
export RESOLVEFORGE_COORDINATOR_MODEL="openai/gpt-5-4-mini"
pnpm resolveforge:bootstrap
```
