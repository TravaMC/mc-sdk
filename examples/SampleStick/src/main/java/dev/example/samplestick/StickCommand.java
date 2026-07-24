package dev.example.samplestick;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class StickCommand implements CommandExecutor, TabCompleter {

    private final StickFactory factory;

    public StickCommand(@NotNull StickFactory factory) {
        this.factory = factory;
    }

    @Override
    public boolean onCommand(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String label,
            @NotNull String[] args
    ) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Players only.", NamedTextColor.RED));
            return true;
        }

        if (args.length == 0 || !args[0].equalsIgnoreCase("give")) {
            player.sendMessage(Component.text("Usage: /" + label + " give", NamedTextColor.YELLOW));
            return true;
        }

        if (!player.hasPermission("samplestick.give")) {
            player.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }

        ItemStack stick = factory.create();
        player.getInventory().addItem(stick).values()
                .forEach(left -> player.getWorld().dropItemNaturally(player.getLocation(), left));

        player.sendMessage(
                Component.text("You received a ", NamedTextColor.GREEN)
                        .append(Component.text("Sample Stick", NamedTextColor.AQUA))
                        .append(Component.text("!", NamedTextColor.GREEN))
        );
        return true;
    }

    @Override
    public @Nullable List<String> onTabComplete(
            @NotNull CommandSender sender,
            @NotNull Command command,
            @NotNull String alias,
            @NotNull String[] args
    ) {
        List<String> out = new ArrayList<>();
        if (args.length == 1) {
            String prefix = args[0].toLowerCase(Locale.ROOT);
            if ("give".startsWith(prefix)) {
                out.add("give");
            }
        }
        return out;
    }
}
