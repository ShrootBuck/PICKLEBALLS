#!/usr/bin/env bash
# Start a production image against disposable Postgres. No host ports or real secrets.
set -euo pipefail
target=${1:?web or worker is required}
commit=${2:?expected commit is required}
image=${3:-pickleballs-check:$target}
case "$target" in
  web) port=3000; path=/api/health ;;
  worker) port=3001; path=/ ;;
  *) exit 2 ;;
esac
name="pb-ci-${target}-${RANDOM}-$$"
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then docker logs "$name-app" 2>&1 || true; fi
  docker rm -fv "$name-app" "$name-db" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
docker network create "$name" >/dev/null
docker run -d --name "$name-db" --network "$name" \
  -e POSTGRES_PASSWORD=disposable -e POSTGRES_DB=pickleballs_test \
  postgres:18.6-alpine >/dev/null
ready=false
for _ in $(seq 1 60); do
  if docker exec "$name-db" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
docker run -d --name "$name-app" --network "$name" \
  -e "DATABASE_URL=postgresql://postgres:disposable@$name-db:5432/pickleballs_test" \
  -e "DIRECT_DATABASE_URL=postgresql://postgres:disposable@$name-db:5432/pickleballs_test" \
  -e PB_SELF_HOSTED=true -e BACKGROUND_BACKEND=postgres -e WORKER_SCHEDULES_ENABLED=false \
  -e BETTER_AUTH_SECRET=disposable-image-smoke-test-secret-000000 \
  -e DISCORD_CLIENT_ID=disposable -e DISCORD_CLIENT_SECRET=disposable \
  -e NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  -e SOURCE_COMMIT=runtime-must-not-override-baked-commit \
  "$image" >/dev/null
ready=false
for _ in $(seq 1 90); do
  if docker exec -e "EXPECTED_COMMIT=$commit" -e "CHECK_URL=http://127.0.0.1:$port$path" "$name-app" \
    node -e 'fetch(process.env.CHECK_URL,{signal:AbortSignal.timeout(3000)}).then(async r=>{const b=await r.json();process.exit(r.ok&&b.status==="ok"&&b.deployment===process.env.EXPECTED_COMMIT?0:1)}).catch(()=>process.exit(1))'; then ready=true; break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$name-app")" != true ]; then break; fi
  sleep 2
done
test "$ready" = true
if [ "$target" = web ]; then
  docker exec -e "EXPECTED_COMMIT=$commit" "$name-app" node -e '
    (async()=>{
      const r=await fetch("http://127.0.0.1:3000/sign-in");
      const html=await r.text();
      if(!r.ok||!html.includes(`data-dpl-id="${process.env.EXPECTED_COMMIT}"`))throw Error("Wrong page release");
      const assets=[...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^" ]+)"/g)].map(m=>m[1].replaceAll("&amp;","&")))];
      if(!assets.length)throw Error("No page assets");
      for(const asset of assets){const a=await fetch(new URL(asset,"http://127.0.0.1:3000"));if(!a.ok||!(await a.arrayBuffer()).byteLength)throw Error(`Asset failed: ${asset}`)}
      console.log(`Verified sign-in page and ${assets.length} assets.`);
    })().catch(e=>{console.error(e);process.exit(1)})'
fi
echo "Verified $target image startup, migrations, readiness, and baked release $commit."
