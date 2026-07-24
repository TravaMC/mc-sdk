# SampleStick (Paper 1.21.1)

API-only demo plugin built with guidance from **mc-sdk** (Javadoc 1.21.1).

## Features

- `/samplestick give` — gives a `Material.STICK` tagged via Persistent Data Container
- Right-click — forward leap (2s cooldown, Adventure action bar)
- Join message with a short tip

## Build

JDK 21 + Gradle wrapper:

```bash
cd examples/SampleStick
./gradlew build
```

JAR: `build/libs/SampleStick-1.0.0.jar` → drop into `plugins/` on Paper **1.21.1**.

Pin the SDK version with `mc_set_version` / `.mc-sdk.json` in your real projects (examples ignore local pin files via `.gitignore`).
