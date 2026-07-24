package dev.example.samplesticknms;

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

public final class StickItems {

    public static final String MARKER = "nms";

    private final NamespacedKey key;
    private final NamespacedKey cooldownKey;

    public StickItems(@NotNull JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, "lightning_stick");
        this.cooldownKey = new NamespacedKey(plugin, "lightning_stick_cd");
    }

    public @NotNull NamespacedKey key() {
        return key;
    }

    public @NotNull NamespacedKey cooldownKey() {
        return cooldownKey;
    }

    public @NotNull ItemStack create() {
        ItemStack stack = new ItemStack(Material.BLAZE_ROD);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(
                Component.text("NMS Lightning Stick", NamedTextColor.GOLD)
                        .decoration(TextDecoration.ITALIC, false)
        );
        meta.lore(List.of(
                Component.text("Right-click: visual lightning (NMS)", NamedTextColor.GRAY)
                        .decoration(TextDecoration.ITALIC, false),
                Component.text("Uses LightningBolt#setVisualOnly", NamedTextColor.DARK_GRAY)
                        .decoration(TextDecoration.ITALIC, false)
        ));
        meta.getPersistentDataContainer().set(key, PersistentDataType.STRING, MARKER);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isStick(@NotNull ItemStack stack) {
        if (stack.getType() != Material.BLAZE_ROD || !stack.hasItemMeta()) {
            return false;
        }
        return MARKER.equals(
                stack.getItemMeta().getPersistentDataContainer().get(key, PersistentDataType.STRING)
        );
    }
}
