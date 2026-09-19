```sh
cd "/Users/tharunkumarbandaru/Desktop/TrueFoundry hackathon/TrueCode"
pnpm install --frozen-lockfile
[ -L packages/trueforge/.env ] || [ -e packages/trueforge/.env ] || ln -s ../../.env packages/trueforge/.env
```

```sh
cd "/Users/tharunkumarbandaru/Desktop/TrueFoundry hackathon/TrueCode"
pnpm resolveforge:demo
```

```sh
cd "/Users/tharunkumarbandaru/Desktop/TrueFoundry hackathon/TrueCode"
set -a; source .env; set +a
export RESOLVEFORGE_TARGET_REPO="$(pwd -P)"
pnpm resolveforge:dev
```

```sh
cd "/Users/tharunkumarbandaru/Desktop/TrueFoundry hackathon/TrueCode"
pnpm standalone:dev
```

```sh
cd "/Users/tharunkumarbandaru/Desktop/TrueFoundry hackathon/TrueCode"
set -a; source .env; set +a
export RESOLVEFORGE_COORDINATOR_MODEL="openai/gpt-5-4-mini"
pnpm resolveforge:bootstrap
```
