package dev.example.samplestick;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.PluginCommand;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class SampleStickPlugin extends JavaPlugin implements Listener {

    private StickFactory stickFactory;

    @Override
    public void onEnable() {
        stickFactory = new StickFactory(this);

        getServer().getPluginManager().registerEvents(new StickListener(stickFactory), this);
        getServer().getPluginManager().registerEvents(this, this);

        PluginCommand command = getCommand("samplestick");
        if (command != null) {
            StickCommand executor = new StickCommand(stickFactory);
            command.setExecutor(executor);
            command.setTabCompleter(executor);
        } else {
            getLogger().severe("Command 'samplestick' missing from plugin.yml");
        }

        getLogger().info("SampleStick enabled (Paper 1.21.1)");
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        event.getPlayer().sendMessage(
                Component.text("SampleStick loaded. Try ", NamedTextColor.GRAY)
                        .append(Component.text("/samplestick give", NamedTextColor.AQUA))
                        .append(Component.text(" then right-click!", NamedTextColor.GRAY))
        );
    }
}
