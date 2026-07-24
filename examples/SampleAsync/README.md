# SampleAsync (Paper 1.21.1)

Demo of **snapshot → async CPU → batched apply** for **mc-sdk**.

## What it does

`/sampleasync spiral`

1. **Main thread** — copies world UUID + player coordinates (snapshot)  
2. **Async** — builds a spiral of points with deliberate CPU work (no Bukkit API)  
3. **Main thread** — spawns `END_ROD` particles in batches of 48/tick  

Matches `docs/async.md` and `mc_template` kind `async_cpu`.

## Build

```bash
cd examples/SampleAsync
./gradlew build
```

JAR → `build/libs/SampleAsync-1.0.0.jar` on Paper **1.21.1**.

## See also

- `mc_async_guide` / `docs/async.md`  
- `mc_commands_guide` / `docs/commands.md`  
