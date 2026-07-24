# SampleVelocity (Velocity 3.4)

Optional demo **proxy** plugin for **mc-sdk**. No Bukkit worlds — Velocity API only.

## Features

- `/sampleping` — Adventure reply on the proxy
- Join tip on `PostLoginEvent`

## Build

JDK 21 + Gradle wrapper:

```bash
cd examples/SampleVelocity
./gradlew build
```

JAR: `build/libs/SampleVelocity-1.0.0.jar` → Velocity `plugins/`.

Pin with:

```text
mc_set_version platform=velocity version=3.4.0
```

Look up APIs via `mc_velocity_search_api` / `mc_velocity_get_class`. See `docs/velocity.md`.
