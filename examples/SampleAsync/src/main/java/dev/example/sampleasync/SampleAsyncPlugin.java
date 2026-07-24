package dev.example.sampleasync;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class SampleAsyncPlugin extends JavaPlugin implements Listener {

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        PluginCommand cmd = getCommand("sampleasync");
        if (cmd != null) {
            SampleAsyncCommand executor = new SampleAsyncCommand(this);
            cmd.setExecutor(executor);
            cmd.setTabCompleter(executor);
        } else {
            getLogger().severe("Command sampleasync missing from plugin.yml");
        }
        getLogger().info("SampleAsync enabled — see mc_async_guide / docs/async.md");
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        event.getPlayer().sendMessage(
            Component.text("SampleAsync: ", NamedTextColor.GRAY)
                .append(Component.text("/sampleasync spiral", NamedTextColor.AQUA))
                .append(Component.text(" — math off-thread, particles on tick", NamedTextColor.GRAY))
        );
    }
}
