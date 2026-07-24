package dev.example.samplesticknms;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class SampleStickNmsPlugin extends JavaPlugin implements Listener {

    @Override
    public void onEnable() {
        StickItems items = new StickItems(this);
        getServer().getPluginManager().registerEvents(new StickListener(items), this);
        getServer().getPluginManager().registerEvents(this, this);

        PluginCommand cmd = getCommand("sticknms");
        if (cmd != null) {
            StickCommand exec = new StickCommand(items);
            cmd.setExecutor(exec);
            cmd.setTabCompleter(exec);
        }

        getLogger().info("SampleStickNms enabled — NMS via paperweight (1.21.1 Mojang mappings)");
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        event.getPlayer().sendMessage(
                Component.text("NMS demo: ", NamedTextColor.DARK_GRAY)
                        .append(Component.text("/sticknms give", NamedTextColor.GOLD))
                        .append(Component.text(" → right-click for visual lightning", NamedTextColor.GRAY))
        );
    }
}
