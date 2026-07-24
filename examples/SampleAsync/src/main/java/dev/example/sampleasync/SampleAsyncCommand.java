package dev.example.sampleasync;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Particle;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Snapshot on main → heavy-ish math async → batched particle apply on main.
 * Mirrors mc_template async_cpu / docs/async.md.
 */
public final class SampleAsyncCommand implements CommandExecutor, TabCompleter {

    private static final int POINTS = 240;
    private static final int PER_TICK = 48;

    private final JavaPlugin plugin;
    private final AtomicInteger generation = new AtomicInteger();

    public SampleAsyncCommand(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(
        @NotNull CommandSender sender,
        @NotNull Command command,
        @NotNull String label,
        @NotNull String[] args
    ) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (args.length == 0 || !args[0].equalsIgnoreCase("spiral")) {
            player.sendMessage(Component.text("Usage: /sampleasync spiral", NamedTextColor.YELLOW));
            return true;
        }

        // --- MAIN: snapshot only (no async Bukkit calls later) ---
        UUID worldId = player.getWorld().getUID();
        double ox = player.getLocation().getX();
        double oy = player.getLocation().getY() + 1.0;
        double oz = player.getLocation().getZ();
        int gen = generation.incrementAndGet();
        long started = System.nanoTime();

        player.sendMessage(Component.text("Computing spiral off-thread…", NamedTextColor.GRAY));

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            // --- ASYNC: pure math (intentionally a bit heavy) ---
            List<double[]> points = new ArrayList<>(POINTS);
            for (int i = 0; i < POINTS; i++) {
                double t = i * 0.18;
                // busy-ish work so async is meaningful in a demo
                double noise = 0;
                for (int k = 0; k < 800; k++) {
                    noise += Math.sin(t * k * 0.001) * Math.cos(k * 0.002);
                }
                double r = 0.35 + t * 0.12 + (noise * 1e-4);
                points.add(new double[]{
                    ox + Math.cos(t) * r,
                    oy + t * 0.015,
                    oz + Math.sin(t) * r
                });
            }
            long ms = (System.nanoTime() - started) / 1_000_000L;

            plugin.getServer().getScheduler().runTask(plugin, () -> {
                if (!plugin.isEnabled() || gen != generation.get()) return;
                World world = plugin.getServer().getWorld(worldId);
                Player online = plugin.getServer().getPlayer(player.getUniqueId());
                if (world == null || online == null || !online.isOnline()) return;

                online.sendMessage(
                    Component.text("Async math done in " + ms + "ms — applying particles batched", NamedTextColor.GREEN)
                );
                applyParticlesBatched(world, points);
            });
        });
        return true;
    }

    private void applyParticlesBatched(World world, List<double[]> points) {
        Queue<double[]> q = new ArrayDeque<>(points);
        BukkitTask[] holder = new BukkitTask[1];
        holder[0] = plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
            for (int i = 0; i < PER_TICK && !q.isEmpty(); i++) {
                double[] p = q.poll();
                world.spawnParticle(Particle.END_ROD, p[0], p[1], p[2], 1, 0, 0, 0, 0);
            }
            if (q.isEmpty() && holder[0] != null) {
                holder[0].cancel();
            }
        }, 1L, 1L);
    }

    @Override
    public @Nullable List<String> onTabComplete(
        @NotNull CommandSender sender,
        @NotNull Command command,
        @NotNull String alias,
        @NotNull String[] args
    ) {
        if (args.length == 1) {
            String p = args[0].toLowerCase(Locale.ROOT);
            if ("spiral".startsWith(p)) return List.of("spiral");
        }
        return List.of();
    }
}
