package dev.example.samplestick;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;
import org.jetbrains.annotations.NotNull;

import java.util.List;

public final class StickFactory {

    public static final String PDC_MARKER = "1";

    private final NamespacedKey stickKey;
    private final NamespacedKey cooldownKey;

    public StickFactory(@NotNull JavaPlugin plugin) {
        this.stickKey = new NamespacedKey(plugin, "sample_stick");
        this.cooldownKey = new NamespacedKey(plugin, "sample_stick_cooldown");
    }

    public @NotNull NamespacedKey stickKey() {
        return stickKey;
    }

    public @NotNull NamespacedKey cooldownKey() {
        return cooldownKey;
    }

    public @NotNull ItemStack create() {
        ItemStack stack = new ItemStack(Material.STICK);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(
                Component.text("Sample Stick", NamedTextColor.AQUA)
                        .decoration(TextDecoration.ITALIC, false)
        );
        meta.lore(List.of(
                Component.text("Right-click to leap forward", NamedTextColor.GRAY)
                        .decoration(TextDecoration.ITALIC, false),
                Component.text("Cooldown: 2 seconds", NamedTextColor.DARK_GRAY)
                        .decoration(TextDecoration.ITALIC, false)
        ));
        meta.getPersistentDataContainer().set(stickKey, PersistentDataType.STRING, PDC_MARKER);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isSampleStick(@NotNull ItemStack stack) {
        if (stack.getType() != Material.STICK || !stack.hasItemMeta()) {
            return false;
        }
        String value = stack.getItemMeta()
                .getPersistentDataContainer()
                .get(stickKey, PersistentDataType.STRING);
        return PDC_MARKER.equals(value);
    }
}
